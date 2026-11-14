# -*- coding: utf-8 -*-
"""Testa as correcoes 1-7 numa copia isolada do sistema. Uso: python teste_correcoes.py <pasta_da_copia>"""
import io
import json
import os
import re
import sys
import zipfile

pasta = sys.argv[1]
os.environ["BACKUP_DIR"] = os.path.join(pasta, "backups")
os.environ["HTTPS"] = "0"
sys.path.insert(0, pasta)
os.chdir(pasta)

import contextlib
VER_ATUAL = __import__('re').search(r'VERSAO = "([^"]+)"', open(os.path.join(pasta, 'versao.py'), encoding='utf-8').read()).group(1)
buf = io.StringIO()
with contextlib.redirect_stdout(buf):
    import app as A
    A.init_db()
senha_ini = re.search(r"senha provisoria: (\S+)", buf.getvalue()).group(1)

H = {"X-Requested-With": "fetch"}
falhas = []


def ok(cond, nome):
    print(("  OK   " if cond else "  FALHA ") + nome)
    if not cond:
        falhas.append(nome)


def cli():
    return A.app.test_client()


def login(c, u, s):
    return c.post("/api/login", json={"usuario": u, "senha": s}, headers=H)


print("\n[6] senha inicial e regras de senha")
ok(senha_ini != "Suporte@2026" and len(senha_ini) == 12, "senha inicial sorteada (%s)" % senha_ini)
adm = cli()
ok(login(adm, "admin", senha_ini).status_code == 200, "login com a senha sorteada")
for ruim in ("Suporte@2026", "12345678", "senha123", "abc", "admin1234", "aaaaaaaa"):
    r = adm.post("/api/senha", json={"atual": senha_ini, "nova": ruim}, headers=H)
    ok(r.status_code == 400, "recusa senha fraca %r -> %s" % (ruim, r.get_json().get("erro")))
SENHA_ADM = "Cafe#Forte2026"
ok(adm.post("/api/senha", json={"atual": senha_ini, "nova": SENHA_ADM}, headers=H).status_code == 200, "aceita senha forte")
r = adm.post("/api/usuarios", json={"usuario": "maria", "nome": "Maria Silva", "senha": "123456"}, headers=H)
ok(r.status_code == 400, "criar usuario com senha de 6 caracteres e recusado")
ok(adm.post("/api/usuarios", json={"usuario": "maria", "nome": "Maria Silva", "senha": "Prov1sor!a"}, headers=H).status_code == 201,
   "criar usuario com senha boa")
mid = A.connect().execute("SELECT id FROM usuarios WHERE usuario='maria'").fetchone()[0]

print("\n[1] sessoes encerradas ao trocar/redefinir senha")
m1, m2 = cli(), cli()
login(m1, "maria", "Prov1sor!a"); login(m2, "maria", "Prov1sor!a")
r = m1.post("/api/senha", json={"atual": "Prov1sor!a", "nova": "Girassol#Nova26"}, headers=H)
ok(r.status_code == 200 and r.get_json().get("sessoes_encerradas") == 1, "trocar a propria senha encerra 1 outra sessao")
ok(m1.get("/api/atividades").status_code == 200, "sessao atual continua valida")
ok(m2.get("/api/atividades").status_code == 401, "outra sessao (senha antiga) foi derrubada")
m3 = cli(); login(m3, "maria", "Girassol#Nova26")
r = adm.post("/api/usuarios/%d/senha" % mid, json={"nova": "Outra#Prov2026"}, headers=H)
ok(r.status_code == 200 and r.get_json().get("sessoes_encerradas") == 2, "admin redefine senha -> 2 sessoes da Maria encerradas")
ok(m1.get("/api/atividades").status_code == 401 and m3.get("/api/atividades").status_code == 401, "Maria desconectada em todo lugar")
ok(adm.get("/api/atividades").status_code == 200, "admin continua conectado")
m4 = cli(); login(m4, "maria", "Outra#Prov2026")
m4.post("/api/senha", json={"atual": "Outra#Prov2026", "nova": "Girassol#Final26"}, headers=H)
ok(adm.post("/api/usuarios/%d/2fa/reset" % mid, headers=H).status_code == 200, "reset 2FA")
ok(m4.get("/api/atividades").status_code == 401, "reset 2FA derrubou a sessao da Maria")

print("\n[2] acoes de admin no historico")
ok(adm.post("/api/usuarios/%d/desbloquear" % mid, headers=H).status_code == 200, "desbloquear")
m5 = cli(); login(m5, "maria", "Girassol#Final26")
sid = A.connect().execute("SELECT id FROM sessoes WHERE user_id=? AND ativa=1", (mid,)).fetchone()[0]
ok(adm.delete("/api/sessoes/%d" % sid, headers=H).status_code == 200, "admin encerra sessao da Maria")
hist = [r[0] for r in A.connect().execute("SELECT detalhe FROM historico WHERE entidade='usuario' AND ref=?", (str(mid),))]
for trecho in ("desbloqueada", "duas etapas resetada", "Sessão encerrada pelo administrador", "Senha redefinida", "Trocou a própria senha"):
    ok(any(trecho in h for h in hist), "historico registra: " + trecho)
ok(adm.post("/api/usuarios/9999/desbloquear", headers=H).status_code == 404, "desbloquear usuario inexistente -> 404")

print("\n[3] PUT antigo removido")
ok(adm.put("/api/atividades", json=[], headers=H).status_code == 410, "PUT /api/atividades -> 410")
ativ = {"id": "a1", "date": "2026-11-13", "title": "Teste anexo"}
r = adm.patch("/api/atividades", json={"upserts": [ativ]}, headers=H)
ok(r.status_code == 200 and r.get_json()["gravadas"] == 1, "PATCH continua gravando")

print("\n[4] backup com anexos")
png = b"\x89PNG\r\n\x1a\n" + b"x" * 500
r = adm.post("/api/atividades/a1/anexos", data=png, headers=dict(H, **{"X-Nome": "print.png", "Content-Type": "application/octet-stream"}))
ok(r.status_code == 200, "anexo enviado")
arq = A.connect().execute("SELECT arquivo FROM anexos").fetchone()[0]
bk = adm.post("/api/backup", headers=H).get_json()["arquivo"]
ok(os.path.isfile(os.path.join(A.ANEXOS_BKP, arq)), "anexo copiado para backups/anexos/")
# segundo backup no mesmo estado nao duplica arquivos
import time; time.sleep(1.1)
adm.post("/api/backup", headers=H)
ok(len(os.listdir(A.ANEXOS_BKP)) == 1, "espelho nao duplica o arquivo")
# apaga a atividade (e o anexo), depois restaura o backup
adm.patch("/api/atividades", json={"deletes": ["a1"]}, headers=H)
adm.post("/api/lixeira/apagar", json={"tudo": True}, headers=H)  # 3.5: a exclusao vai para a lixeira; esvaziar apaga o anexo
ok(not os.path.isfile(os.path.join(A.ANEXOS_DIR, arq)), "excluir atividade apagou o anexo da pasta")
r = adm.post("/api/backups/restaurar", json={"arquivo": bk}, headers=H)
ok(r.status_code == 200 and r.get_json().get("aviso") == "", "restaurar backup ok, sem aviso")
ok(os.path.isfile(os.path.join(A.ANEXOS_DIR, arq)), "anexo voltou para a pasta anexos/")
ok(A.connect().execute("SELECT COUNT(*) FROM sessoes WHERE ativa=1").fetchone()[0] == 0, "restaurar desconecta todos")
adm = cli(); login(adm, "admin", SENHA_ADM)
# poda: com BACKUP_KEEP=1 os backups antigos somem e o espelho mantem so o que o atual usa
A.BACKUP_KEEP = 1
adm.patch("/api/atividades", json={"deletes": ["a1"]}, headers=H)
adm.post("/api/lixeira/apagar", json={"tudo": True}, headers=H)
time.sleep(1.1); adm.post("/api/backup", headers=H)
ok(len([f for f in os.listdir(A.BACKUP_DIR) if A.RE_BKP.match(f)]) == 1, "rotacao mantem 1 backup")
ok(not os.path.isfile(os.path.join(A.ANEXOS_BKP, arq)), "anexo sem uso foi podado do espelho")
A.BACKUP_KEEP = 30

print("\n[5] atualizacao com desfazer")
def pacote(versao, extra):
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        for f in ("app.py", "changelog.json"):
            z.write(os.path.join(pasta, f), "sistema/" + f)
        z.writestr("sistema/versao.py", 'VERSAO = "%s"\n' % versao)
        z.writestr("sistema/novo_modulo.py", extra)
        z.writestr("sistema/data.db", "NAO PODE SOBRESCREVER")
        z.writestr("sistema/versoes_anteriores/x.py", "NAO PODE")
    return b.getvalue()
db_antes = open(A.DB_PATH, "rb").read(100)
r = adm.post("/api/atualizar/analisar", data=pacote("9.9.9", "X = 1\n"), headers=dict(H, **{"Content-Type": "application/octet-stream"}))
tok = r.get_json()["token"]
r = adm.post("/api/atualizar/aplicar", json={"token": tok}, headers=H)
ok(r.status_code == 200, "aplicar pacote 9.9.9")
ok('"9.9.9"' in open(os.path.join(pasta, "versao.py")).read(), "versao.py atualizado")
ok(os.path.isfile(os.path.join(pasta, "novo_modulo.py")), "arquivo novo criado")
ok(open(A.DB_PATH, "rb").read(100) == db_antes, "data.db intocado")
v = adm.get("/api/versao").get_json()
ok(v["anterior"] and v["anterior"]["versao"] == VER_ATUAL and v["anterior"]["substituida_por"] == "9.9.9", "tela Sobre oferece voltar para 3.2.0")
r = adm.post("/api/atualizar/desfazer", headers=H)
ok(r.status_code == 200 and r.get_json()["versao"] == VER_ATUAL, "desfazer")
ok('"%s"' % VER_ATUAL in open(os.path.join(pasta, "versao.py")).read(), "versao.py voltou a 3.2.0")
ok(not os.path.isfile(os.path.join(pasta, "novo_modulo.py")), "arquivo criado pela atualizacao foi removido")
ok(adm.get("/api/versao").get_json()["anterior"] is None, "sem mais copias para desfazer")
ok(adm.post("/api/atualizar/desfazer", headers=H).status_code == 404, "desfazer sem copia -> 404")

print("\n[7] CSP com nonce")
r = adm.get("/")
csp = r.headers.get("Content-Security-Policy", "")
html = r.get_data(as_text=True)
nonce = re.search(r"'nonce-([^']+)'", csp).group(1)
tags = re.findall(r"<script[^>]*>", html)
ok("script-src 'self' 'nonce-" in csp and "object-src 'none'" in csp, "cabecalho CSP presente")
ok(len(tags) >= 5 and all('nonce="%s"' % nonce for t in tags), "todos os %d <script> tem o nonce" % len(tags))
ok(nonce not in cli().get("/").headers["Content-Security-Policy"], "nonce muda a cada carregamento")
ok(not re.search(r'\son[a-z]+="', html), "nenhum handler inline (onclick=...) que a CSP bloquearia")

print("\nRESULTADO:", "TUDO OK" if not falhas else "%d FALHA(S): %s" % (len(falhas), falhas))
sys.exit(1 if falhas else 0)
