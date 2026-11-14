# -*- coding: utf-8 -*-
"""Tela Sobre / Atualizacao: confere a versao, mostra o que mudou e aplica um pacote .zip novo."""
import io
import json
import os
import re
import secrets
import shutil
import sys
import time
import zipfile

from flask import jsonify, request

EXT_OK = {".py", ".txt", ".md", ".json", ".js", ".html", ".css", ".webmanifest", ".png", ".woff2", ".ico", ".svg"}
IGNORA_DIRS = {"__pycache__", "backups", "certs", "anexos", "atualizacoes", "versoes_anteriores", ".venv", "venv", ".git", "logs"}
MANTER_VERSOES = 3  # quantas copias do codigo anterior guardar para "desfazer"
IGNORA_ARQ = {"data.db", "secret.key", "iniciar.bat", "config.bat"}  # config.bat (e iniciar.bat antigo) guardam IP/porta
MAX_ARQ, MAX_BYTES = 600, 80 * 1024 * 1024
RE_VER = re.compile(r'VERSAO\s*=\s*["\']([\w.\-]+)["\']')


def vtuple(v):
    try:
        return tuple(int(x) for x in str(v).split("."))
    except ValueError:
        return (0,)


def le_versao_disco(base):
    try:
        with open(os.path.join(base, "versao.py"), encoding="utf-8") as f:
            m = RE_VER.search(f.read())
        return m.group(1) if m else "?"
    except OSError:
        return "?"


def le_changelog(base):
    try:
        with open(os.path.join(base, "changelog.json"), encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, list) else []
    except (OSError, ValueError):
        return []


def analisa_zip(dados):
    """Devolve (prefixo, versao, changelog, arquivos[(nome_zip, destino_relativo)]) ou levanta ValueError."""
    try:
        z = zipfile.ZipFile(io.BytesIO(dados))
    except zipfile.BadZipFile:
        raise ValueError("O arquivo não é um .zip válido.")
    infos = [i for i in z.infolist() if not i.is_dir()]
    if len(infos) > MAX_ARQ or sum(i.file_size for i in infos) > MAX_BYTES:
        raise ValueError("Pacote grande demais.")
    apps = sorted((i.filename for i in infos if i.filename.replace("\\", "/").endswith("app.py")), key=len)
    if not apps:
        raise ValueError("Este zip não parece ser o sistema Suporte (app.py não encontrado).")
    prefixo = apps[0].replace("\\", "/")[:-len("app.py")]
    arquivos = []
    for i in infos:
        nome = i.filename.replace("\\", "/")
        if not nome.startswith(prefixo):
            continue
        rel = nome[len(prefixo):]
        partes = rel.split("/")
        if (not rel or rel.startswith("/") or ".." in partes or ":" in rel or any(p in IGNORA_DIRS for p in partes[:-1])
                or partes[-1] in IGNORA_ARQ or partes[-1].startswith(".")
                or os.path.splitext(partes[-1])[1].lower() not in EXT_OK):
            continue
        arquivos.append((i.filename, rel))
    try:
        ver = RE_VER.search(z.read(prefixo + "versao.py").decode("utf-8")).group(1)
    except (KeyError, AttributeError):
        raise ValueError("Pacote sem versao.py: não é uma versão compatível.")
    try:
        cl = json.loads(z.read(prefixo + "changelog.json").decode("utf-8"))
    except (KeyError, ValueError):
        cl = []
    return prefixo, ver, cl if isinstance(cl, list) else [], arquivos


RE_COPIA = re.compile(r"^\d{8}-\d{6}_[\w.\-]+$")


def grava_atomico(destino, dados):
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    tmp = destino + ".novo"
    with open(tmp, "wb") as f:
        f.write(dados)
    os.replace(tmp, destino)


def lista_copias(anteriores):
    """Copias do codigo anterior, da mais recente para a mais antiga: [(pasta, manifesto)]."""
    if not os.path.isdir(anteriores):
        return []
    out = []
    for d in sorted(os.listdir(anteriores), reverse=True):
        p = os.path.join(anteriores, d)
        if not RE_COPIA.match(d) or not os.path.isdir(p):
            continue
        try:
            with open(os.path.join(p, "manifesto.json"), encoding="utf-8") as f:
                m = json.load(f)
            if isinstance(m, dict) and isinstance(m.get("existentes"), list) and isinstance(m.get("novos"), list):
                out.append((p, m))
        except (OSError, ValueError):
            continue
    return out


def destino_seguro(base, rel):
    base_real = os.path.realpath(base)
    destino = os.path.realpath(os.path.join(base, *str(rel).split("/")))
    if not destino.startswith(base_real + os.sep):
        return None
    partes = str(rel).split("/")
    if ".." in partes or any(p in IGNORA_DIRS for p in partes[:-1]) or partes[-1] in IGNORA_ARQ:
        return None
    return destino


def register(app, admin_required, base, versao_em_uso, fazer_backup, log_fn):
    pasta = os.path.join(base, "atualizacoes")
    anteriores = os.path.join(base, "versoes_anteriores")

    @app.get("/api/versao")
    @admin_required
    def versao():
        disco = le_versao_disco(base)
        copias = lista_copias(anteriores)
        anterior = None
        if copias:
            m = copias[0][1]
            anterior = {"versao": m.get("versao"), "substituida_por": m.get("nova"), "quando": m.get("quando")}
        return jsonify(versao=versao_em_uso, em_disco=disco, reiniciar=vtuple(disco) != vtuple(versao_em_uso),
                       changelog=le_changelog(base), python=sys.version.split()[0], pasta=base, anterior=anterior)

    @app.post("/api/atualizar/desfazer")
    @admin_required
    def desfazer():
        """Volta o codigo para a copia guardada antes da ultima atualizacao (dados nao sao tocados)."""
        copias = lista_copias(anteriores)
        if not copias:
            return jsonify(erro="Não há versão anterior guardada."), 404
        p, m = copias[0]
        voltou = apagados = 0
        for rel in m["existentes"]:
            destino, origem = destino_seguro(base, rel), os.path.join(p, "arquivos", *str(rel).split("/"))
            if destino and os.path.isfile(origem):
                with open(origem, "rb") as f:
                    grava_atomico(destino, f.read())
                voltou += 1
        for rel in m["novos"]:  # arquivos que a atualizacao criou e nao existiam antes
            destino = destino_seguro(base, rel)
            if destino and os.path.isfile(destino):
                try:
                    os.remove(destino)
                    apagados += 1
                except OSError:
                    pass
        shutil.rmtree(p, ignore_errors=True)
        log_fn("Atualização desfeita: código voltou da versão %s para a %s (%d arquivos restaurados, %d removidos)"
               % (m.get("nova"), m.get("versao"), voltou, apagados))
        return jsonify(ok=True, versao=m.get("versao"), arquivos=voltou, removidos=apagados)

    @app.post("/api/atualizar/analisar")
    @admin_required
    def analisar():
        dados = request.get_data(cache=False)
        try:
            prefixo, nova, cl, arquivos = analisa_zip(dados)
        except ValueError as e:
            return jsonify(erro=str(e)), 400
        atual = le_versao_disco(base)
        cmp = (vtuple(nova) > vtuple(atual)) - (vtuple(nova) < vtuple(atual))
        os.makedirs(pasta, exist_ok=True)
        token = secrets.token_hex(8)
        for f in os.listdir(pasta):  # limpa pacotes antigos
            try:
                os.remove(os.path.join(pasta, f))
            except OSError:
                pass
        with open(os.path.join(pasta, token + ".zip"), "wb") as f:
            f.write(dados)
        novas = [c for c in cl if vtuple(c.get("versao")) > vtuple(atual)]
        return jsonify(token=token, atual=atual, nova=nova, comparacao=cmp, mudancas=novas, arquivos=len(arquivos))

    @app.post("/api/atualizar/aplicar")
    @admin_required
    def aplicar():
        token = str((request.get_json(silent=True) or {}).get("token", ""))
        if not re.fullmatch(r"[0-9a-f]{16}", token):
            return jsonify(erro="Pacote inválido."), 400
        p = os.path.join(pasta, token + ".zip")
        if not os.path.isfile(p):
            return jsonify(erro="Pacote não encontrado. Envie o arquivo de novo."), 404
        with open(p, "rb") as f:
            dados = f.read()
        try:
            prefixo, nova, cl, arquivos = analisa_zip(dados)
        except ValueError as e:
            return jsonify(erro=str(e)), 400
        seguranca = None
        try:
            seguranca = fazer_backup()
        except Exception:  # noqa: BLE001 - o backup nao deve impedir a atualizacao, mas avisamos
            seguranca = None
        z = zipfile.ZipFile(io.BytesIO(dados))
        alvos = [(nome_zip, rel, destino_seguro(base, rel)) for nome_zip, rel in arquivos]
        alvos = [a for a in alvos if a[2]]
        # 1) guarda o codigo atual que sera substituido, para poder desfazer
        atual = le_versao_disco(base)
        copia = os.path.join(anteriores, "%s_%s" % (time.strftime("%Y%m%d-%H%M%S"), re.sub(r"[^\w.\-]", "", atual) or "x"))
        existentes, novos = [], []
        try:
            for _, rel, destino in alvos:
                if os.path.isfile(destino):
                    with open(destino, "rb") as f:
                        grava_atomico(os.path.join(copia, "arquivos", *rel.split("/")), f.read())
                    existentes.append(rel)
                else:
                    novos.append(rel)
            with open(os.path.join(copia, "manifesto.json"), "w", encoding="utf-8") as f:
                json.dump({"versao": atual, "nova": nova, "quando": time.strftime("%Y-%m-%d %H:%M"),
                           "existentes": existentes, "novos": novos}, f, ensure_ascii=False, indent=1)
        except OSError as e:
            shutil.rmtree(copia, ignore_errors=True)
            return jsonify(erro="Não foi possível guardar a versão atual antes de atualizar (%s). Nada foi alterado." % e), 500
        for p_antiga, _ in lista_copias(anteriores)[MANTER_VERSOES:]:
            shutil.rmtree(p_antiga, ignore_errors=True)
        # 2) aplica
        gravados = 0
        for nome_zip, rel, destino in alvos:
            grava_atomico(destino, z.read(nome_zip))
            gravados += 1
        try:
            os.remove(p)
        except OSError:
            pass
        log_fn("Atualização do sistema para a versão %s (%d arquivos)" % (nova, gravados))
        return jsonify(ok=True, versao=nova, arquivos=gravados, backup=bool(seguranca))
