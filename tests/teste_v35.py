# -*- coding: utf-8 -*-
import io, os, re, sys, contextlib, time, json, sqlite3
pasta = sys.argv[1]
os.environ["BACKUP_DIR"] = os.path.join(pasta, "backups"); os.environ["HTTPS"] = "0"
os.environ["BACKUP_COPIA"] = os.path.join(pasta, "copia")
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
for u, n, p in (("maria", "Maria Silva", "usuario"), ("sup", "Sergio Supervisor", "supervisor")):
    adm.post("/api/usuarios", json={"usuario": u, "nome": n, "senha": "Prov#Senha2026", "perfil": p}, headers=H)


def entra(u):
    c = A.app.test_client(); login(c, u, "Prov#Senha2026")
    c.post("/api/senha", json={"atual": "Prov#Senha2026", "nova": "Trevo#Azul2026"}, headers=H)
    return c


ma, su = entra("maria"), entra("sup")
ids = {u["usuario"]: u for u in adm.get("/api/usuarios", headers=H).get_json()}
print("[permissoes]")
me = ma.get("/api/me", headers=H).get_json()
ok(me["perms"] == ["exportar"] and not me["equipe"] and me["perms_padrao"], "usuario: padrao so exportar")
ok(ma.get("/api/painel", headers=H).status_code == 403, "usuario nao ve o painel")
ok(su.get("/api/painel", headers=H).status_code == 200, "supervisor ve o painel")
ok(su.put("/api/metas", json={"padrao": {"diaria": 3, "semanal": 10}}, headers=H).status_code == 200, "supervisor edita metas")
u = ids["sup"]
r = adm.put("/api/usuarios/%d" % u["id"], json={"nome": u["nome"], "cargo": "", "perfil": "supervisor", "perms": ["ver_equipe"]}, headers=H)
ok(r.status_code == 200, "admin personaliza permissoes do supervisor")
ok(su.put("/api/metas", json={"padrao": {"diaria": 3, "semanal": 10}}, headers=H).status_code == 403, "sem editar_metas: bloqueia metas")
ok(su.get("/api/relatorios/excel", headers=H).status_code == 403, "sem exportar: bloqueia Excel")
ok(su.get("/api/painel", headers=H).status_code == 200, "continua vendo a equipe")
u = ids["maria"]
adm.put("/api/usuarios/%d" % u["id"], json={"nome": u["nome"], "cargo": "", "perfil": "usuario", "perms": ["ver_equipe", "exportar"]}, headers=H)
ok(ma.get("/api/painel", headers=H).status_code == 200, "usuario com ver_equipe ve o painel")
h = adm.get("/api/historico?acao=alterou", headers=H).get_json()["itens"]
ok(any("permiss" in x["detalhe"] for x in h), "mudanca de permissao vai para o historico")
adm.put("/api/usuarios/%d" % u["id"], json={"nome": u["nome"], "cargo": "", "perfil": "usuario", "perms": "padrao"}, headers=H)
ok(ma.get("/api/me", headers=H).get_json()["perms_padrao"], "volta para o padrao do perfil")

print("[lixeira]")
at = {"id": "a1", "date": "2026-11-14", "title": "Trocar toner", "status": "todo"}
ma.patch("/api/atividades", json={"upserts": [at, dict(at, id="a2", title="Outra")], "deletes": []}, headers=H)
ma.post("/api/atividades/a1/anexos", data=b"%PDF-1.4 x", headers=dict(H, **{"X-Nome": "n.pdf", "Content-Type": "application/octet-stream"}))
ma.patch("/api/atividades", json={"upserts": [], "deletes": ["a1", "a2"]}, headers=H)
lx = ma.get("/api/lixeira", headers=H).get_json()
ok(len(lx["itens"]) == 2 and lx["itens"][0]["restam"] == 30, "excluidas vao para a lixeira (30 dias)")
ok(su.get("/api/lixeira", headers=H).get_json()["itens"] == [], "lixeira e so do dono")
lid = [x["id"] for x in lx["itens"] if x["titulo"] == "Trocar toner"][0]
r = ma.post("/api/lixeira/restaurar", json={"ids": [lid]}, headers=H).get_json()
l = ma.get("/api/atividades", headers=H).get_json()
ok(r["restauradas"] == ["a1"] and len(l) == 1 and l[0]["anx"] == 1, "restaurar devolve a atividade com o anexo")
ma.patch("/api/atividades", json={"upserts": [dict(at, id="a2", title="Outra")], "deletes": []}, headers=H)
ok(len(ma.get("/api/lixeira", headers=H).get_json()["itens"]) == 0, "desfazer a exclusao limpa a lixeira")
ma.patch("/api/atividades", json={"upserts": [], "deletes": ["a1"]}, headers=H)
con = sqlite3.connect(A.DB_PATH); con.execute("UPDATE lixeira SET excluida=excluida-31*86400"); con.commit(); con.close()
nanx = len(os.listdir(A.ANEXOS_DIR))
import extras
extras._ultima_limpeza[0] = 0
ma.get("/api/me", headers=H)
ok(ma.get("/api/lixeira", headers=H).get_json()["itens"] == [] and len(os.listdir(A.ANEXOS_DIR)) == nanx - 1, "vencidas (>30 dias) somem com o anexo")
ma.patch("/api/atividades", json={"upserts": [], "deletes": ["a2"]}, headers=H)
ok(ma.post("/api/lixeira/apagar", json={"tudo": True}, headers=H).get_json()["apagadas"] == 1, "esvaziar a lixeira")

print("[checklist]")
c = ma.post("/api/checklist", json={"texto": "Ligar para o Paulo"}, headers=H).get_json()
c = ma.post("/api/checklist", json={"texto": "Pedir cabo HDMI"}, headers=H).get_json()
ok(len(c) == 2 and not c[0]["feito"], "adiciona itens")
c = ma.patch("/api/checklist/%d" % c[0]["id"], json={"feito": True}, headers=H).get_json()
ok(c[-1]["feito"] and c[0]["texto"] == "Pedir cabo HDMI", "marca feito (vai para o fim)")
con = sqlite3.connect(A.DB_PATH); con.execute("UPDATE checklist SET feito_em='2026-01-01' WHERE feito=1"); con.commit(); con.close()
ok(len(ma.get("/api/checklist", headers=H).get_json()) == 1, "feitas de outros dias somem; pendentes ficam")
ok(ma.post("/api/checklist", json={"texto": " "}, headers=H).status_code == 400, "recusa item vazio")

print("[foco]")
r = ma.post("/api/foco", json={"min": 30, "txt": "Relatorio"}, headers=H).get_json()
ok(abs(r["ate"] - time.time() - 1800) < 5 and ma.get("/api/me", headers=H).get_json()["foco"] == r["ate"], "liga nao perturbe")
p = [x for x in su.get("/api/painel", headers=H).get_json()["usuarios"] if x["nome"] == "Maria Silva"][0]
ok(p["foco"] == r["ate"] and p["foco_txt"] == "Relatorio", "equipe ve que esta em foco")
ma.delete("/api/foco", headers=H)
ok(ma.get("/api/me", headers=H).get_json()["foco"] == 0, "desliga")

print("[meses]")
ma.patch("/api/atividades", json={"upserts": [dict(at, id="m1", date="2025-11-03", status="done", dur=30),
                                              dict(at, id="m2", status="done", dur=20)], "deletes": []}, headers=H)
m = ma.get("/api/graficos/meses", headers=H).get_json()["meses"]
mm = {x["mes"]: x for x in m}
ok(m[0]["mes"] == "2025-01" and mm["2025-11"]["feitas"] == 1 and mm["2026-11"]["feitas"] == 1, "mes a mes desde jan do ano passado")
ok(A.app.test_client().get("/api/graficos/meses?escopo=equipe", headers=H).status_code == 401, "exige login")

print("[backup copia]")
adm.post("/api/backup", headers=H)
cp = os.listdir(os.path.join(pasta, "copia"))
ok(any(f.startswith("data-") for f in cp) and "anexos" in cp, "backup copiado para a segunda pasta")
ok(adm.get("/api/saude", headers=H).get_json()["backups"]["copia"]["ok"] is True, "saude mostra a copia ok")
A.BACKUP_COPIA = os.path.join(A.DB_PATH, "sub")  # um arquivo no lugar da pasta: falha certa, sem tocar em drives
adm.post("/api/backup", headers=H)
s = adm.get("/api/saude", headers=H).get_json()["backups"]["copia"]
ok(s["ok"] is False and s["erro"], "falha na copia aparece na saude: " + s["erro"][:60])
ok(adm.get("/api/me", headers=H).get_json().get("avisos", 0) >= 1, "e gera aviso para o administrador")
print("\nFALHAS: %d" % len(F))
sys.exit(1 if F else 0)
