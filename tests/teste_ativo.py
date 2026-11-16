# -*- coding: utf-8 -*-
"""Desativar / reativar usuario. Uso: python teste_ativo.py <pasta_da_copia>"""
import io, os, re, sys, contextlib
pasta = sys.argv[1]
os.environ["BACKUP_DIR"] = os.path.join(pasta, "backups"); os.environ["HTTPS"] = "0"
sys.path.insert(0, pasta); os.chdir(pasta)
buf = io.StringIO()
with contextlib.redirect_stdout(buf):
    import app as A
    A.init_db()
si = re.search(r"senha provisoria: (\S+)", buf.getvalue()).group(1)
H = {"X-Requested-With": "fetch"}; F = []


def ok(c, n):
    print(("  OK   " if c else "  FALHA ") + n)
    if not c:
        F.append(n)


def login(c, u, s):
    return c.post("/api/login", json={"usuario": u, "senha": s}, headers=H)


adm = A.app.test_client(); login(adm, "admin", si)
adm.post("/api/senha", json={"atual": si, "nova": "Cafe#Forte2026"}, headers=H)
adm.post("/api/usuarios", json={"usuario": "maria", "nome": "Maria Silva", "senha": "Prov#Senha2026", "perfil": "usuario"}, headers=H)
ma = A.app.test_client(); login(ma, "maria", "Prov#Senha2026")
ma.post("/api/senha", json={"atual": "Prov#Senha2026", "nova": "Trevo#Azul2026"}, headers=H)
us = {u["usuario"]: u for u in adm.get("/api/usuarios", headers=H).get_json()}
mid, aid = us["maria"]["id"], us["admin"]["id"]

print("[estado inicial]")
ok(us["maria"]["ativo"] is True, "conta nova vem ativa")
ok(ma.get("/api/me", headers=H).status_code == 200, "maria conectada")

print("[pedido pendente para maria]")
adm.patch("/api/atividades", json={"upserts": [{"id": "x1", "date": "2026-11-16", "title": "Trocar toner", "status": "todo"}], "deletes": []}, headers=H)
r = adm.post("/api/delegar", json={"id": "x1", "para": mid}, headers=H)
ok(r.status_code in (200, 201), "pedido de delegação criado")
ma.patch("/api/atividades", json={"upserts": [{"id": "m1", "date": "2026-11-16", "title": "Atividade da Maria", "status": "todo"}], "deletes": []}, headers=H)

print("[desativar]")
ok(ma.post("/api/usuarios/%d/ativo" % aid, json={"ativo": False}, headers=H).status_code == 403, "usuário comum não desativa ninguém")
r = adm.post("/api/usuarios/%d/ativo" % aid, json={"ativo": False}, headers=H)
ok(r.status_code == 400 and "próprio" in r.get_json()["erro"], "não desativa a si mesmo")
r = adm.post("/api/usuarios/%d/ativo" % mid, json={"ativo": False}, headers=H)
ok(r.status_code == 200 and r.get_json()["sessoes_encerradas"] >= 1, "desativada e sessão encerrada")
ok(ma.get("/api/me", headers=H).status_code == 401, "maria é desconectada na hora")
r = login(A.app.test_client(), "maria", "Trevo#Azul2026")
ok(r.status_code == 403 and "desativada" in r.get_json()["erro"], "não consegue entrar com a senha certa")
r = login(A.app.test_client(), "maria", "errada")
ok(r.status_code == 401, "senha errada continua 'usuário ou senha inválidos'")
u = [x for x in adm.get("/api/usuarios", headers=H).get_json() if x["id"] == mid][0]
ok(u["ativo"] is False, "lista de usuários mostra desativado")
db = A.connect()
ok(db.execute("SELECT COUNT(*) FROM atividades WHERE user_id=?", (mid,)).fetchone()[0] == 1, "atividades dela continuam guardadas")
ok(db.execute("SELECT status FROM delegacoes WHERE para_uid=?", (mid,)).fetchone()[0] == "cancelada", "pedido pendente para ela foi cancelado")
ok(mid not in [p["id"] for p in adm.get("/api/delegar/pessoas", headers=H).get_json()], "some da lista de delegar")
adm.patch("/api/atividades", json={"upserts": [{"id": "x2", "date": "2026-11-16", "title": "Outra", "status": "todo"}], "deletes": []}, headers=H)
ok(adm.post("/api/delegar", json={"id": "x2", "para": mid}, headers=H).status_code == 404, "não dá para delegar para conta desativada")
ok(mid not in [p["id"] for p in adm.get("/api/painel", headers=H).get_json()["usuarios"]], "some do painel da equipe")
h = adm.get("/api/historico?tipo=usuario", headers=H).get_json()
ok("Conta desativada" in str(h), "fica no histórico")

print("[reativar]")
r = adm.post("/api/usuarios/%d/ativo" % mid, json={"ativo": True}, headers=H)
ok(r.status_code == 200, "reativada")
ma2 = A.app.test_client()
ok(login(ma2, "maria", "Trevo#Azul2026").status_code == 200, "volta a entrar com a mesma senha")
ok(mid in [p["id"] for p in adm.get("/api/delegar/pessoas", headers=H).get_json()], "volta para a lista de delegar")

print("[ultimo administrador]")
adm.post("/api/usuarios", json={"usuario": "jose", "nome": "Jose Admin", "senha": "Prov#Senha2026", "perfil": "admin"}, headers=H)
jid = [x["id"] for x in adm.get("/api/usuarios", headers=H).get_json() if x["usuario"] == "jose"][0]
ok(adm.post("/api/usuarios/%d/ativo" % jid, json={"ativo": False}, headers=H).status_code == 200, "desativa outro administrador")
r = adm.put("/api/usuarios/%d" % aid, json={"nome": "Administrador", "perfil": "usuario"}, headers=H)
ok(r.status_code == 400, "o único administrador ativo não perde o perfil")
ok(adm.post("/api/usuarios/%d/ativo" % jid, json={"ativo": True}, headers=H).status_code == 200, "reativa o outro administrador")
print("\nFALHAS: %d" % len(F))
sys.exit(1 if F else 0)
