# -*- coding: utf-8 -*-
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
    if not c: F.append(n)
def login(c, u, s): return c.post("/api/login", json={"usuario": u, "senha": s}, headers=H)
adm = A.app.test_client(); login(adm, "admin", si)
adm.post("/api/senha", json={"atual": si, "nova": "Cafe#Forte2026"}, headers=H)
for u, n in (("maria", "Maria Silva"), ("joao", "Joao Souza")):
    r = adm.post("/api/usuarios", json={"usuario": u, "nome": n, "senha": "Prov#Senha2026", "perfil": "usuario"}, headers=H)
    ok(r.status_code in (200, 201), "cria " + u)
def entra(u):
    c = A.app.test_client(); login(c, u, "Prov#Senha2026")
    c.post("/api/senha", json={"atual": "Prov#Senha2026", "nova": "Trevo#Azul2026"}, headers=H); return c
ma, jo = entra("maria"), entra("joao")
ids = {u["nome"]: u["id"] for u in adm.get("/api/usuarios", headers=H).get_json()}
p = ma.get("/api/delegar/pessoas", headers=H).get_json()
ok(len(p) == 2 and all(x["nome"] != "Maria Silva" for x in p), "lista de pessoas sem eu mesma: %s" % [x["nome"] for x in p])
at = {"id": "x1", "date": "2026-11-14", "title": "Instalar impressora", "status": "doing", "spent": 120, "tstart": 0,
      "subs": [{"t": "ver driver", "d": True}], "pin": True}
ma.patch("/api/atividades", json={"upserts": [at], "deletes": []}, headers=H)
jo.patch("/api/atividades", json={"upserts": [dict(at, title="Do Joao")], "deletes": []}, headers=H)  # mesmo id no destino
ma.post("/api/atividades/x1/anexos", data=b"%PDF-1.4 teste", headers=dict(H, **{"X-Nome": "nota.pdf", "Content-Type": "application/octet-stream"}))
ok(ma.post("/api/delegar", json={"id": "x1", "para": ids["Maria Silva"]}, headers=H).status_code == 400, "recusa delegar para si")
ok(ma.post("/api/delegar", json={"id": "nao", "para": ids["Joao Souza"]}, headers=H).status_code == 404, "recusa atividade inexistente")
ok(jo.post("/api/delegar", json={"id": "zz", "para": ids["Maria Silva"]}, headers=H).status_code == 404, "nao delega atividade dos outros")
r = ma.post("/api/delegar", json={"id": "x1", "para": ids["Joao Souza"], "nota": "cliente liga às 15h"}, headers=H)
ok(r.status_code == 200 and r.get_json()["para"] == "Joao Souza", "delega para Joao")
ok(ma.get("/api/atividades", headers=H).get_json() == [], "saiu da lista da Maria")
l = jo.get("/api/atividades", headers=H).get_json()
d = [a for a in l if a["title"] == "Instalar impressora"]
ok(len(l) == 2 and len(d) == 1, "Joao tem as duas (id em conflito ganhou outro)")
d = d[0]
ok(d["deleg"] == {"de": "Maria Silva", "em": d["deleg"]["em"], "nota": "cliente liga às 15h"}, "registro de quem delegou: %s" % d["deleg"])
ok(d["subs"] == [{"t": "ver driver", "d": True}] and d["spent"] == 120 and d["status"] == "doing" and not d["pin"], "mantem subtarefas, tempo, situacao; desafixa")
ok(d["anx"] == 1, "anexo foi junto")
anx = jo.get("/api/atividades/%s/anexos" % d["id"], headers=H).get_json()
ok(len(anx) == 1 and jo.get("/api/anexos/%s" % anx[0]["id"], headers=H).data == b"%PDF-1.4 teste", "Joao abre o anexo")
# Joao edita: o registro de delegacao continua
jo.patch("/api/atividades", json={"upserts": [dict(d, status="done")], "deletes": []}, headers=H)
d2 = [a for a in jo.get("/api/atividades", headers=H).get_json() if a["id"] == d["id"]][0]
ok(d2["status"] == "done" and d2["deleg"] and d2["deleg"]["de"] == "Maria Silva", "editar nao apaga o 'delegada por'")
h = adm.get("/api/historico?acao=delegou", headers=H).get_json()
lst = h if isinstance(h, list) else h.get("itens", h.get("lista", []))
ok(any("Joao Souza" in (x.get("detalhe", "") or "") for x in lst), "aparece no Historico (filtro Delegou)")
print("\nFALHAS: %d" % len(F)); sys.exit(1 if F else 0)
