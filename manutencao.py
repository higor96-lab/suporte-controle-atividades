# -*- coding: utf-8 -*-
"""Rotinas automaticas de manutencao (3.6).

Rodam sozinhas dentro do proprio sistema (laco de fundo do app.py, a cada 15 minutos ve o que esta vencido).
Cada rotina guarda quando rodou e o resultado na tabela `manutencao`; problemas viram aviso para o administrador
(o mesmo lugar dos avisos de seguranca) uma vez so, e nao a cada execucao.
A tela Administracao > Manutencao mostra tudo e permite rodar na hora.
"""
import json
import os
import re
import shutil
import sqlite3
import threading
import time
import urllib.request
from datetime import datetime

HORA, DIA = 3600, 86400
LOCK = threading.Lock()
C = {}  # configurado pelo app.py: connect, base, backup_dir, anexos_dir, cert_dir, https, versao, re_bkp, re_anexo, aviso, demo

SCHEMA = """
CREATE TABLE IF NOT EXISTS manutencao (
    rotina  TEXT PRIMARY KEY,
    ultima  INTEGER NOT NULL DEFAULT 0,
    ok      INTEGER,
    resumo  TEXT NOT NULL DEFAULT '',
    duracao REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS recados (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    texto   TEXT NOT NULL,
    criado  INTEGER NOT NULL,
    lido    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_recados_user ON recados(user_id, lido);
"""

# limites (podem ser trocados no config.bat)
DISCO_MIN_GB = float(os.environ.get("MANUT_DISCO_MIN_GB", "2"))
BACKUP_MAX_GB = float(os.environ.get("MANUT_BACKUP_MAX_GB", "10"))
CRONOMETRO_MAX_H = float(os.environ.get("MANUT_CRONOMETRO_H", "12"))
CONTA_PARADA_DIAS = int(os.environ.get("MANUT_CONTA_DIAS", "90"))
URL_VERSAO = os.environ.get("MANUT_URL_VERSAO",
                            "https://raw.githubusercontent.com/higor96-lab/suporte-controle-atividades/main/versao.py")


def init_db(con):
    con.executescript(SCHEMA)


def configurar(**kw):
    C.update(kw)


def tam_fmt(b):
    for u in ("B", "KB", "MB", "GB"):
        if b < 1024 or u == "GB":
            return ("%.1f %s" % (b, u)).replace(".0 ", " ").replace(".", ",")
        b /= 1024.0


def recado(db, uid, texto):
    db.execute("INSERT INTO recados(user_id, texto, criado) VALUES(?,?,?)", (uid, texto[:400], int(time.time())))


def log_sistema(db, acao, titulo, detalhe):
    db.execute("INSERT INTO historico(ator_id, ator_nome, entidade, acao, ref, titulo, detalhe) VALUES(NULL,'Sistema','sistema',?,?,?,?)",
               (acao, "", titulo[:200], detalhe[:500]))


# ------------------------------------------------------------------ rotinas
# cada uma devolve (ok, resumo): ok=True tudo certo, False problema (vira aviso), None nao se aplica
def r_integridade(db):
    r = [x[0] for x in db.execute("PRAGMA integrity_check").fetchall()]
    fk = db.execute("PRAGMA foreign_key_check").fetchall()
    if r == ["ok"] and not fk:
        n = db.execute("SELECT COUNT(*) FROM atividades").fetchone()[0]
        return True, "Banco íntegro (%d atividades)." % n
    return False, "Problema no banco de dados: %s%s. Restaure o último backup bom (Administração > Backups)." % (
        "; ".join(r[:3]), (" e %d referência(s) quebrada(s)" % len(fk)) if fk else "")


def r_teste_backup(db):
    pasta = C["backup_dir"]
    bks = sorted(f for f in os.listdir(pasta) if C["re_bkp"].match(f)) if os.path.isdir(pasta) else []
    if not bks:
        return False, "Nenhum backup encontrado em %s." % pasta
    ultimo = bks[-1]
    idade = (time.time() - os.path.getmtime(os.path.join(pasta, ultimo))) / DIA
    try:
        b = sqlite3.connect("file:%s?mode=ro" % os.path.join(pasta, ultimo).replace("\\", "/"), uri=True)
        try:
            chk = b.execute("PRAGMA quick_check").fetchone()[0]
            na = b.execute("SELECT COUNT(*) FROM atividades").fetchone()[0]
            nu = b.execute("SELECT COUNT(*) FROM usuarios").fetchone()[0]
        finally:
            b.close()
    except sqlite3.Error as e:
        return False, "O último backup (%s) não abre: %s. Faça um backup novo agora." % (ultimo, e)
    if chk != "ok":
        return False, "O último backup (%s) está corrompido. Faça um backup novo agora." % ultimo
    vivo = db.execute("SELECT COUNT(*) FROM usuarios").fetchone()[0]
    if nu == 0 and vivo:
        return False, "O último backup (%s) está vazio." % ultimo
    if idade > 2:
        return False, "O último backup tem %d dias (%s). O backup automático pode estar parado." % (idade, ultimo)
    return True, "Último backup testado e restaurável: %s (%d atividades, %d usuários)." % (ultimo, na, nu)


def r_otimizar(db):
    antes = os.path.getsize(C["db_path"]) if os.path.exists(C["db_path"]) else 0
    db.execute("PRAGMA optimize")
    db.execute("ANALYZE")
    try:
        db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    except sqlite3.Error:
        pass
    try:
        db.execute("VACUUM")
        vac = ""
    except sqlite3.Error:
        vac = " (compactação adiada: banco em uso)"
    depois = os.path.getsize(C["db_path"]) if os.path.exists(C["db_path"]) else 0
    return True, "Banco otimizado: %s → %s%s." % (tam_fmt(antes), tam_fmt(depois), vac)


def r_faxina(db):
    agora = int(time.time())
    n = {}
    with db:
        n["sessões"] = db.execute("DELETE FROM sessoes WHERE ativa=0 OR ultimo<?", (agora - 30 * DIA,)).rowcount
        n["acessos"] = db.execute("DELETE FROM acessos WHERE quando < datetime('now','localtime','-180 days')").rowcount
        n["avisos lidos"] = db.execute("DELETE FROM avisos WHERE lido=1 AND quando < datetime('now','localtime','-90 days')").rowcount
        n["pedidos de delegação"] = db.execute("DELETE FROM delegacoes WHERE status!='pendente' AND criado<?", (agora - 90 * DIA,)).rowcount
        n["itens do checklist"] = db.execute("DELETE FROM checklist WHERE feito=1 AND feito_em!='' AND feito_em < date('now','localtime','-30 days')").rowcount
        n["recados lidos"] = db.execute("DELETE FROM recados WHERE lido=1 AND criado<?", (agora - 30 * DIA,)).rowcount
    tot = sum(n.values())
    return True, ("Removidos: " + ", ".join("%d %s" % (v, k) for k, v in n.items() if v) + ".") if tot else "Nada para limpar."


def r_anexos_orfaos(db):
    pasta = C["anexos_dir"]
    if not os.path.isdir(pasta):
        return True, "Sem pasta de anexos."
    usados = {r[0] for r in db.execute("SELECT arquivo FROM anexos")}
    n, b = 0, 0
    for f in os.listdir(pasta):
        p = os.path.join(pasta, f)
        # so arquivos do sistema, sem registro e com mais de 1 dia (nunca um envio que esta acontecendo agora)
        if C["re_anexo"].match(f) and f not in usados and os.path.isfile(p) and time.time() - os.path.getmtime(p) > DIA:
            try:
                b += os.path.getsize(p)
                os.remove(p)
                n += 1
            except OSError:
                pass
    return True, ("%d arquivo(s) sem atividade removido(s), %s liberados." % (n, tam_fmt(b))) if n else "Nenhum anexo órfão."


def r_versoes_logs(db):
    base, n, b = C["base"], 0, 0
    alvos = [(os.path.join(base, "logs"), 90, lambda f: f.endswith(".log") and f != "servico.log"),
             (os.path.join(base, "atualizacoes"), 7, lambda f: True)]
    for pasta, dias, filtro in alvos:
        if not os.path.isdir(pasta):
            continue
        for f in os.listdir(pasta):
            p = os.path.join(pasta, f)
            if os.path.isfile(p) and filtro(f) and time.time() - os.path.getmtime(p) > dias * DIA:
                try:
                    b += os.path.getsize(p)
                    os.remove(p)
                    n += 1
                except OSError:
                    pass
    ant = os.path.join(base, "versoes_anteriores")
    nv = len([d for d in os.listdir(ant) if os.path.isdir(os.path.join(ant, d))]) if os.path.isdir(ant) else 0
    return True, ("%d arquivo(s) antigo(s) removido(s) (%s). " % (n, tam_fmt(b)) if n else "Nada antigo em logs/atualizações. ") + \
        "%d versão(ões) anterior(es) guardada(s)." % nv


def tam_pasta(p):
    t = 0
    for raiz, _, fs in os.walk(p):
        for f in fs:
            try:
                t += os.path.getsize(os.path.join(raiz, f))
            except OSError:
                pass
    return t


def r_disco(db):
    u = shutil.disk_usage(C["base"])
    livre_gb, pct = u.free / 1024 ** 3, u.free / u.total * 100
    bk = tam_pasta(C["backup_dir"]) if os.path.isdir(C["backup_dir"]) else 0
    txt = "Livre no disco: %s (%d%%). Backups ocupam %s." % (tam_fmt(u.free), pct, tam_fmt(bk))
    prob = []
    if livre_gb < DISCO_MIN_GB or pct < 5:
        prob.append("pouco espaço livre no disco do servidor")
    if bk > BACKUP_MAX_GB * 1024 ** 3:
        prob.append("a pasta de backups passou de %s (diminua BACKUP_KEEP no config.bat)" % tam_fmt(BACKUP_MAX_GB * 1024 ** 3))
    return (False, "Atenção: " + " e ".join(prob) + ". " + txt) if prob else (True, txt)


def r_certificado(db):
    if not C["https"]:
        return None, "HTTPS desligado (HTTPS=0)."
    p = os.path.join(C["cert_dir"], "cert.pem")
    if not os.path.exists(p):
        return None, "Sem certificado próprio."
    from cryptography import x509
    with open(p, "rb") as f:
        c = x509.load_pem_x509_certificate(f.read())
    try:
        fim = c.not_valid_after_utc.timestamp()
    except AttributeError:
        fim = c.not_valid_after.timestamp()
    dias = int((fim - time.time()) / DIA)
    ca = ""
    pca = os.path.join(C["cert_dir"], "ca.pem")
    if os.path.exists(pca):
        with open(pca, "rb") as f:
            cc = x509.load_pem_x509_certificate(f.read())
        try:
            fca = cc.not_valid_after_utc.timestamp()
        except AttributeError:
            fca = cc.not_valid_after.timestamp()
        ca = " Autoridade local válida até %s." % datetime.fromtimestamp(fca).strftime("%d/%m/%Y")
    else:
        ca = " Sem autoridade local: reinicie o serviço para criar (assim os computadores confiam de vez)."
    if dias < 30:
        return False, "O certificado HTTPS vence em %d dia(s). Rode reiniciar-servico.bat (ou reabra o iniciar.bat): o sistema gera um novo." % dias
    return True, "Certificado HTTPS válido por mais %d dias (até %s).%s" % (dias, datetime.fromtimestamp(fim).strftime("%d/%m/%Y"), ca)


def r_cronometro(db):
    agora, lim = int(time.time()), CRONOMETRO_MAX_H * HORA
    rows = db.execute("SELECT user_id, id, titulo, dur, gasto, inicio FROM atividades WHERE inicio>0 AND ?-inicio>?", (agora, lim)).fetchall()
    with db:
        for r in rows:
            # nao sabemos quanto tempo foi de verdade: registra no maximo o tempo previsto (ou 1 hora)
            cred = min(agora - r["inicio"], (r["dur"] or 60) * 60)
            db.execute("UPDATE atividades SET gasto=gasto+?, inicio=0, rev=rev+1 WHERE user_id=? AND id=?", (cred, r["user_id"], r["id"]))
            recado(db, r["user_id"], "O cronômetro de “%s” ficou ligado por mais de %d horas e foi parado sozinho. "
                                     "Foram registrados %d min; ajuste o tempo real se precisar." % (r["titulo"], CRONOMETRO_MAX_H, cred // 60))
            log_sistema(db, "alterou", r["titulo"], "Cronômetro esquecido parado automaticamente (%d min registrados)" % (cred // 60))
    return True, ("%d cronômetro(s) esquecido(s) parado(s)." % len(rows)) if rows else "Nenhum cronômetro esquecido."


def r_contas_paradas(db):
    rows = db.execute(
        "SELECT u.nome, u.criado_em, (SELECT MAX(quando) FROM acessos a WHERE a.user_id=u.id AND a.ok=1) AS ult FROM usuarios u WHERE u.ativo=1 ORDER BY u.nome").fetchall()
    lim = datetime.now().timestamp() - CONTA_PARADA_DIAS * DIA
    paradas = []
    for r in rows:
        ref = r["ult"] or r["criado_em"]
        try:
            t = datetime.strptime(ref[:19], "%Y-%m-%d %H:%M:%S").timestamp()
        except (TypeError, ValueError):
            continue
        if t < lim:
            paradas.append("%s (%s)" % (r["nome"], "último acesso " + ref[8:10] + "/" + ref[5:7] + "/" + ref[:4] if r["ult"] else "nunca entrou"))
    if paradas:
        return False, "Sem acesso há mais de %d dias: %s. Se a pessoa saiu da equipe, exclua o usuário." % (CONTA_PARADA_DIAS, "; ".join(paradas[:10]))
    return True, "Todas as contas tiveram acesso nos últimos %d dias." % CONTA_PARADA_DIAS


def ver_tupla(v):
    return tuple(int(x) for x in re.findall(r"\d+", v)[:3])


def r_versao_nova(db):
    if C.get("demo"):
        return None, "Desligado na demonstração."
    try:
        with urllib.request.urlopen(urllib.request.Request(URL_VERSAO, headers={"User-Agent": "suporte-atividades"}), timeout=8) as r:
            txt = r.read(4096).decode("utf-8", "replace")
    except Exception as e:
        return None, "Não foi possível consultar o GitHub (%s). Sem internet no servidor?" % type(e).__name__
    m = re.search(r'VERSAO\s*=\s*"([^"]+)"', txt)
    if not m:
        return None, "Resposta inesperada do GitHub."
    nova, atual = m.group(1), C["versao"]
    if ver_tupla(nova) > ver_tupla(atual):
        return False, "Versão nova disponível: %s (instalada: %s). Baixe em github.com/higor96-lab/suporte-controle-atividades." % (nova, atual)
    return True, "Sistema atualizado (versão %s)." % atual


# nome: (titulo, descricao, intervalo em segundos, so de madrugada?, funcao)
ROTINAS = [
    ("integridade", "Verificação do banco", "Confere se o banco de dados está íntegro.", DIA, False, r_integridade),
    ("teste_backup", "Teste do backup", "Abre o último backup e confere se ele é restaurável.", DIA, False, r_teste_backup),
    ("otimizar", "Otimização do banco", "Reorganiza e compacta o banco para continuar rápido.", 7 * DIA, True, r_otimizar),
    ("faxina", "Faxina de registros antigos", "Sessões expiradas, acessos de mais de 6 meses, avisos lidos, pedidos e checklist antigos.", 30 * DIA, True, r_faxina),
    ("anexos_orfaos", "Anexos órfãos", "Remove arquivos de anexo que não pertencem a nenhuma atividade.", 7 * DIA, True, r_anexos_orfaos),
    ("versoes_logs", "Logs e arquivos temporários", "Apaga logs com mais de 90 dias e pacotes de atualização antigos.", 7 * DIA, True, r_versoes_logs),
    ("disco", "Espaço em disco", "Avisa se faltar espaço no servidor ou se os backups crescerem demais.", 6 * HORA, False, r_disco),
    ("certificado", "Certificado HTTPS", "Avisa 30 dias antes do certificado vencer.", DIA, False, r_certificado),
    ("cronometro", "Cronômetros esquecidos", "Para cronômetros ligados há mais de 12 horas e avisa a pessoa.", HORA, False, r_cronometro),
    ("contas_paradas", "Contas paradas", "Lista usuários sem acesso há mais de 90 dias.", 7 * DIA, False, r_contas_paradas),
    ("versao_nova", "Versão nova", "Consulta no GitHub se há uma versão mais nova do sistema.", DIA, False, r_versao_nova),
]
POR_NOME = {r[0]: r for r in ROTINAS}


def rodar(nome, db=None):
    """Roda uma rotina agora e grava o resultado. Devolve dict com ok/resumo."""
    rot = POR_NOME[nome]
    fechar = db is None
    db = db or C["connect"]()
    try:
        with LOCK:
            ant = db.execute("SELECT ok, resumo FROM manutencao WHERE rotina=?", (nome,)).fetchone()
            t0 = time.time()
            try:
                ok, resumo = rot[5](db)
            except Exception as e:  # uma rotina com erro nunca derruba o sistema
                ok, resumo = False, "Erro ao rodar: %s" % e
            dur = time.time() - t0
            with db:
                db.execute("INSERT OR REPLACE INTO manutencao(rotina, ultima, ok, resumo, duracao) VALUES(?,?,?,?,?)",
                           (nome, int(time.time()), None if ok is None else (1 if ok else 0), resumo, dur))
                # aviso so quando aparece um problema novo (nao repete o mesmo texto a cada execucao)
                if ok is False and (not ant or ant["ok"] != 0 or ant["resumo"] != resumo):
                    C["aviso"](db, "manutencao", "%s: %s" % (rot[1], resumo))
        return {"ok": ok, "resumo": resumo}
    finally:
        if fechar:
            db.close()


def vencidas(db, agora=None):
    agora = agora or time.time()
    ult = {r["rotina"]: r["ultima"] for r in db.execute("SELECT rotina, ultima FROM manutencao")}
    hora = datetime.fromtimestamp(agora).hour
    out = []
    for nome, _t, _d, intervalo, madrugada, _f in ROTINAS:
        u = ult.get(nome, 0)
        if agora - u < intervalo:
            continue
        # rotinas pesadas: de madrugada; se o servidor nao fica ligado a noite, roda com 1 dia de atraso
        if madrugada and u and not (1 <= hora < 6) and agora - u < intervalo + DIA:
            continue
        out.append(nome)
    return out


def tick():
    """Chamado pelo laco de fundo: roda o que estiver vencido."""
    db = C["connect"]()
    try:
        for nome in vencidas(db):
            rodar(nome, db)
    finally:
        db.close()


def situacao(db):
    reg = {r["rotina"]: r for r in db.execute("SELECT * FROM manutencao")}
    out = []
    for nome, titulo, desc, intervalo, madrugada, _f in ROTINAS:
        r = reg.get(nome)
        out.append({"rotina": nome, "titulo": titulo, "descricao": desc, "intervalo_h": intervalo / HORA, "madrugada": madrugada,
                    "ultima": datetime.fromtimestamp(r["ultima"]).strftime("%Y-%m-%d %H:%M") if r and r["ultima"] else "",
                    "proxima": datetime.fromtimestamp((r["ultima"] if r else 0) + intervalo).strftime("%Y-%m-%d %H:%M") if r and r["ultima"] else "em breve",
                    "ok": None if not r or r["ok"] is None else bool(r["ok"]), "resumo": r["resumo"] if r else "Ainda não rodou.",
                    "duracao": round(r["duracao"], 2) if r else 0})
    return out


def register(app, get_db, login_required, admin_required):
    from flask import jsonify, session

    @app.get("/api/manutencao")
    @admin_required
    def manut_lista():
        return jsonify(rotinas=situacao(get_db()))

    @app.post("/api/manutencao/<nome>/rodar")
    @admin_required
    def manut_rodar(nome):
        if nome != "todas" and nome not in POR_NOME:
            return jsonify(erro="Rotina desconhecida."), 404
        for n in (list(POR_NOME) if nome == "todas" else [nome]):
            rodar(n)
        return jsonify(ok=True, rotinas=situacao(get_db()))

    @app.get("/api/recados")
    @login_required
    def recados_lista():
        db = get_db()
        rows = db.execute("SELECT id, texto FROM recados WHERE user_id=? AND lido=0 ORDER BY id", (session["uid"],)).fetchall()
        if rows:
            with db:
                db.executemany("UPDATE recados SET lido=1 WHERE id=?", [(r["id"],) for r in rows])
        return jsonify([{"id": r["id"], "texto": r["texto"]} for r in rows])
