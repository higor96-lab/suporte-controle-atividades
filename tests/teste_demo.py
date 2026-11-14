# -*- coding: utf-8 -*-
"""Testa o modo demonstracao numa copia isolada. Uso: python teste_demo.py <pasta_da_copia>"""
import os, sys, time
pasta = sys.argv[1]
os.environ.update(DEMO="1", PROXY="1", BACKUP_DIR=os.path.join(pasta, "backups"))
sys.path.insert(0, pasta)
os.chdir(pasta)
import io, contextlib
with contextlib.redirect_stdout(io.StringIO()):
    import wsgi
A = wsgi.sistema
app = wsgi.application
H = {"X-Requested-With": "fetch"}
falhas = []


def ok(c, n):
    print(("  OK   " if c else "  FALHA ") + n)
    if not c:
        falhas.append(n)


c = A.app.test_client()
d = c.get("/api/demo").get_json()
ok(d["demo"] and d["usuario"] == "demo" and d["senha"] == "demo", "/api/demo informa o acesso de visitante")
db = A.connect()
ok(db.execute("SELECT COUNT(*) FROM usuarios").fetchone()[0] == 4, "equipe fictícia criada (4 pessoas)")
n_ativ = db.execute("SELECT COUNT(*) FROM atividades").fetchone()[0]
ok(n_ativ > 300, "atividades fictícias criadas: %d" % n_ativ)
ok(db.execute("SELECT COUNT(*) FROM usuarios WHERE usuario='admin'").fetchone()[0] == 0, "não existe administrador na demonstração")
# senha errada nao tranca a conta compartilhada
for _ in range(4):
    c.post("/api/login", json={"usuario": "demo", "senha": "x"}, headers=dict(H, **{"X-Forwarded-For": "203.0.113.9"}))
ok(A.connect().execute("SELECT bloq_ate, falhas FROM usuarios WHERE usuario='demo'").fetchone()[0] == 0, "errar a senha não bloqueia a conta demo")
r = c.post("/api/login", json={"usuario": "demo", "senha": "demo"}, headers=dict(H, **{"X-Forwarded-For": "198.51.100.7"}))
ok(r.status_code == 200, "login demo/demo")
ok("Secure" in r.headers.get("Set-Cookie", ""), "cookie de sessão marcado como Secure (atrás de HTTPS)")
ip = A.connect().execute("SELECT ip FROM acessos WHERE ok=1 ORDER BY id DESC").fetchone()[0]
ok(ip == "198.51.100.7", "IP real do visitante via proxy: " + ip)
me = c.get("/api/me").get_json()
ok(me["demo"] and me["perfil"] == "supervisor" and not me["admin"], "visitante é supervisor (sem telas de administração)")
ok("ultimo_acesso" not in me, "não mostra o acesso anterior (seria de outro visitante)")
bloq = [("post", "/api/usuarios", {}), ("put", "/api/usuarios/2", {}), ("post", "/api/usuarios/2/senha", {}),
        ("post", "/api/senha", {}), ("post", "/api/2fa/iniciar", {}), ("get", "/api/backups", None), ("post", "/api/backup", {}),
        ("post", "/api/backups/restaurar", {}), ("post", "/api/atualizar/analisar", None), ("get", "/api/versao", None),
        ("post", "/api/atividades/d1_1/anexos", None), ("get", "/api/sessoes", None), ("post", "/api/sessoes/encerrar-outras", {}),
        ("get", "/api/acessos", None), ("get", "/api/saude", None)]
for m, p, js in bloq:
    rr = getattr(c, m)(p, json=js, headers=H) if js is not None else getattr(c, m)(p, headers=H)
    ok(rr.status_code == 403, "bloqueado na demo: %s %s -> %d" % (m.upper(), p, rr.status_code))
r = c.patch("/api/atividades", json={"upserts": [{"id": "visit1", "date": "2026-11-13", "title": "Criada pelo visitante"}]}, headers=H)
ok(r.status_code == 200 and r.get_json()["gravadas"] == 1, "visitante pode criar atividade")
g = c.get("/api/graficos?escopo=equipe", headers=H).get_json()
ok(len(g.get("por_pessoa") or []) == 4 and g["indicadores"]["concluidas"] > 50, "gráficos da equipe com dados (%s concluídas)" % g["indicadores"]["concluidas"])
ok(len(c.get("/api/painel", headers=H).get_json()["usuarios"]) == 4, "painel da equipe com as 4 pessoas")
ok(c.get("/", headers=H).status_code == 200, "página principal abre")
# recriacao periodica
os.utime(os.path.join(pasta, "demo.stamp"), (time.time() - 90000, time.time() - 90000))
A._demo_ultima[0] = 0
c.get("/api/demo")
ok(A.connect().execute("SELECT COUNT(*) FROM atividades WHERE id='visit1'").fetchone()[0] == 0, "depois de 24 h os dados são recriados (atividade do visitante some)")
ok(c.get("/api/atividades", headers=H).status_code == 401, "visitantes conectados precisam entrar de novo após a recriação")
print("\nRESULTADO:", "TUDO OK" if not falhas else "%d FALHA(S)" % len(falhas))
sys.exit(1 if falhas else 0)
