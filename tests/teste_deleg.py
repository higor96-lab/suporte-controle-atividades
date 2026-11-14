# -*- coding: utf-8 -*-
"""Delegacao com pedido: quem recebe aceita ou recusa. Uso: python teste_deleg.py <pasta_da_copia>"""
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
for u, n in (("maria", "Maria Silva"), ("joao", "Joao Souza")):
    r = adm.post("/api/usuarios", json={"usuario": u, "nome": n, "senha": "Prov#Senha2026", "perfil": "usuario"}, headers=H)
    ok(r.status_code in (200, 201), "cria " + u)


def entra(u):
    c = A.app.test_client(); login(c, u, "Prov#Senha2026")
    c.post("/api/senha", json={"atual": "Prov#Senha2026", "nova": "Trevo#Azul2026"}, headers=H)
    return c


ma, jo = entra("maria"), entra("joao")
ids = {u["nome"]: u["id"] for u in adm.get("/api/usuarios", headers=H).get_json()}
p = ma.get("/api/delegar/pessoas", headers=H).get_json()
ok(len(p) == 2 and all(x["nome"] != "Maria Silva" for x in p), "lista de pessoas sem eu mesma")
at = {"id": "x1", "date": "2026-11-14", "title": "Instalar impressora", "status": "doing", "spent": 120, "tstart": 0,
      "subs": [{"t": "ver driver", "d": True}], "pin": True}
ma.patch("/api/atividades", json={"upserts": [at, dict(at, id="x2", title="Trocar teclado")], "deletes": []}, headers=H)
jo.patch("/api/atividades", json={"upserts": [dict(at, title="Do Joao")], "deletes": []}, headers=H)  # mesmo id no destino
ma.post("/api/atividades/x1/anexos", data=b"%PDF-1.4 teste", headers=dict(H, **{"X-Nome": "nota.pdf", "Content-Type": "application/octet-stream"}))
ok(ma.post("/api/delegar", json={"id": "x1", "para": ids["Maria Silva"]}, headers=H).status_code == 400, "recusa delegar para si")
ok(ma.post("/api/delegar", json={"id": "nao", "para": ids["Joao Souza"]}, headers=H).status_code == 404, "recusa atividade inexistente")

print("[pedido e aceite]")
r = ma.post("/api/delegar", json={"id": "x1", "para": ids["Joao Souza"], "nota": "cliente liga às 15h"}, headers=H)
ok(r.status_code == 200 and r.get_json()["pendente"], "delegar cria um pedido")
ok(ma.post("/api/delegar", json={"id": "x1", "para": ids["Joao Souza"]}, headers=H).status_code == 409, "não deixa dois pedidos para a mesma atividade")
l = ma.get("/api/atividades", headers=H).get_json()
x1 = [a for a in l if a["id"] == "x1"][0]
ok(x1.get("pedido", {}).get("para") == "Joao Souza", "atividade continua com Maria, marcada 'aguardando Joao'")
d = jo.get("/api/delegacoes", headers=H).get_json()
ok(len(d["recebidas"]) == 1 and d["recebidas"][0]["de"] == "Maria Silva" and d["recebidas"][0]["nota"] == "cliente liga às 15h", "Joao vê o pedido com o recado")
pid = d["recebidas"][0]["id"]
ok(ma.get("/api/delegacoes", headers=H).get_json()["enviadas"][0]["para"] == "Joao Souza", "Maria vê o pedido enviado")
ok(ma.post("/api/delegacoes/%d/aceitar" % pid, headers=H).status_code == 404, "quem enviou não pode aceitar o próprio pedido")
r = jo.post("/api/delegacoes/%d/aceitar" % pid, headers=H)
ok(r.status_code == 200, "Joao aceita")
ok(all(a["id"] != "x1" for a in ma.get("/api/atividades", headers=H).get_json()), "saiu da lista da Maria")
l = jo.get("/api/atividades", headers=H).get_json()
d1 = [a for a in l if a["title"] == "Instalar impressora"][0]
ok(len(l) == 2, "Joao tem as duas (id em conflito ganhou outro)")
ok(d1["deleg"]["de"] == "Maria Silva" and d1["deleg"]["nota"] == "cliente liga às 15h", "registro de quem delegou")
ok(d1["subs"] == [{"t": "ver driver", "d": True}] and d1["spent"] == 120 and not d1["pin"], "mantém subtarefas e tempo; desafixa")
ok(d1["anx"] == 1, "anexo foi junto")
rs = ma.get("/api/delegacoes", headers=H).get_json()["respostas"]
ok(len(rs) == 1 and rs[0]["status"] == "aceita", "Maria recebe a resposta: aceita")
ma.post("/api/delegacoes/vistas", json={"ids": [rs[0]["id"]]}, headers=H)
ok(ma.get("/api/delegacoes", headers=H).get_json()["respostas"] == [], "depois de vista, a resposta não volta")
ok(jo.post("/api/delegacoes/%d/aceitar" % pid, headers=H).status_code == 409, "pedido já respondido não aceita de novo")

print("[recusa e cancelamento]")
ma.post("/api/delegar", json={"id": "x2", "para": ids["Joao Souza"]}, headers=H)
pid2 = jo.get("/api/delegacoes", headers=H).get_json()["recebidas"][0]["id"]
ok(jo.post("/api/delegacoes/%d/recusar" % pid2, json={"motivo": "Estou de férias"}, headers=H).status_code == 200, "Joao recusa com motivo")
ok(any(a["id"] == "x2" and "pedido" not in a for a in ma.get("/api/atividades", headers=H).get_json()), "atividade continua com Maria, sem pendência")
rs = ma.get("/api/delegacoes", headers=H).get_json()["respostas"]
ok(rs and rs[0]["status"] == "recusada" and rs[0]["resposta"] == "Estou de férias", "Maria vê a recusa e o motivo")
ma.post("/api/delegar", json={"id": "x2", "para": ids["Administrador"]}, headers=H)
pid3 = ma.get("/api/delegacoes", headers=H).get_json()["enviadas"][0]["id"]
ok(ma.post("/api/delegacoes/%d/cancelar" % pid3, headers=H).status_code == 200, "Maria cancela o pedido")
ok(adm.get("/api/delegacoes", headers=H).get_json()["recebidas"] == [], "pedido cancelado some para quem ia receber")
ma.post("/api/delegar", json={"id": "x2", "para": ids["Administrador"]}, headers=H)
ma.patch("/api/atividades", json={"upserts": [], "deletes": ["x2"]}, headers=H)
ok(adm.get("/api/delegacoes", headers=H).get_json()["recebidas"] == [], "atividade excluída: pedido some sozinho")
h = adm.get("/api/historico?acao=delegou", headers=H).get_json()["itens"]
ok(any("Pedido enviado" in x["detalhe"] for x in h) and any("Aceitou" in x["detalhe"] for x in h) and any("Recusou" in x["detalhe"] for x in h),
   "pedido, aceite e recusa aparecem no Histórico")
print("\nFALHAS: %d" % len(F))
sys.exit(1 if F else 0)
