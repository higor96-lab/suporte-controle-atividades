# -*- coding: utf-8 -*-
"""Rotinas automaticas de manutencao. Uso: python teste_manut.py <pasta_da_copia>"""
import io, os, re, sys, time, contextlib, sqlite3
pasta = sys.argv[1]
os.environ["BACKUP_DIR"] = os.path.join(pasta, "backups"); os.environ["HTTPS"] = "0"
sys.path.insert(0, pasta); os.chdir(pasta)
buf = io.StringIO()
with contextlib.redirect_stdout(buf):
    import app as A
    A.init_db()
import manutencao as M
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
mid = [u["id"] for u in adm.get("/api/usuarios", headers=H).get_json() if u["usuario"] == "maria"][0]


def db():
    return A.connect()


def avisos():
    return db().execute("SELECT COUNT(*) FROM avisos WHERE tipo='manutencao'").fetchone()[0]


print("[tela e permissao]")
ok(adm.get("/api/manutencao", headers=H).status_code == 200, "admin vê a tela de manutenção")
ok(ma.get("/api/manutencao", headers=H).status_code == 403, "usuário comum não vê")
ok(len(adm.get("/api/manutencao", headers=H).get_json()["rotinas"]) == 11, "11 rotinas listadas")
ok(set(M.vencidas(db())) == set(M.POR_NOME), "na primeira vez todas estão vencidas")

print("[integridade, backup, otimizacao]")
ok(M.rodar("integridade")["ok"] is True, "banco íntegro")
a0 = avisos()
r = M.rodar("teste_backup")
ok(r["ok"] is False and avisos() == a0 + 1, "sem backup: problema + aviso ao admin")
M.rodar("teste_backup")
ok(avisos() == a0 + 1, "mesmo problema não gera aviso repetido")
adm.post("/api/backup", headers=H)
r = M.rodar("teste_backup")
ok(r["ok"] is True and "restaurável" in r["resumo"], "backup testado: " + r["resumo"])
r = M.rodar("otimizar")
ok(r["ok"] is True and "otimizado" in r["resumo"], r["resumo"])

print("[faxina]")
c = db()
agora = int(time.time())
with c:
    c.execute("INSERT INTO sessoes(sid,user_id,criado,ultimo,ativa) VALUES('velha',1,?,?,1)", (agora - 40 * 86400, agora - 40 * 86400))
    c.execute("INSERT INTO acessos(quando,user_id,usuario,ok) VALUES(datetime('now','localtime','-200 days'),1,'admin',1)")
    c.execute("INSERT INTO avisos(quando,tipo,texto,lido) VALUES(datetime('now','localtime','-100 days'),'x','velho',1)")
    c.execute("INSERT INTO checklist(user_id,texto,feito,feito_em) VALUES(1,'velho',1,date('now','localtime','-40 days'))")
    c.execute("INSERT INTO checklist(user_id,texto,feito) VALUES(1,'pendente',0)")
r = M.rodar("faxina")
ok("1 sessões" in r["resumo"] and "1 acessos" in r["resumo"] and "1 avisos lidos" in r["resumo"] and "1 itens do checklist" in r["resumo"], r["resumo"])
ok(db().execute("SELECT COUNT(*) FROM checklist WHERE texto='pendente'").fetchone()[0] == 1, "item pendente do checklist fica")

print("[anexos orfaos, logs]")
os.makedirs(A.ANEXOS_DIR, exist_ok=True)
at = {"id": "a1", "date": "2026-11-14", "title": "Com anexo", "status": "todo"}
adm.patch("/api/atividades", json={"upserts": [at], "deletes": []}, headers=H)
adm.post("/api/atividades/a1/anexos", data=b"%PDF-1.4 x", headers=dict(H, **{"X-Nome": "n.pdf", "Content-Type": "application/octet-stream"}))
orfao = os.path.join(A.ANEXOS_DIR, "0" * 24 + ".pdf"); novo = os.path.join(A.ANEXOS_DIR, "1" * 24 + ".pdf")
for p in (orfao, novo):
    open(p, "wb").write(b"x" * 100)
os.utime(orfao, (time.time() - 3 * 86400,) * 2)
for f in os.listdir(A.ANEXOS_DIR):
    if f not in ("1" * 24 + ".pdf",):
        os.utime(os.path.join(A.ANEXOS_DIR, f), (time.time() - 3 * 86400,) * 2)
r = M.rodar("anexos_orfaos")
ok(not os.path.exists(orfao) and os.path.exists(novo) and len([f for f in os.listdir(A.ANEXOS_DIR)]) == 2, "remove só o órfão antigo: " + r["resumo"])
os.makedirs(os.path.join(pasta, "logs"), exist_ok=True)
velho = os.path.join(pasta, "logs", "antigo.log"); serv = os.path.join(pasta, "logs", "servico.log")
for p in (velho, serv):
    open(p, "w").write("x")
    os.utime(p, (time.time() - 100 * 86400,) * 2)
r = M.rodar("versoes_logs")
ok(not os.path.exists(velho) and os.path.exists(serv), "apaga log antigo e mantém o servico.log: " + r["resumo"])

print("[disco, certificado]")
r = M.rodar("disco"); ok(r["ok"] in (True, False) and "Livre no disco" in r["resumo"], r["resumo"])
r = M.rodar("certificado"); ok(r["ok"] is None and "HTTPS desligado" in r["resumo"], "com HTTPS=0 não se aplica")

print("[cronometro esquecido]")
with db() as c:
    c.execute("INSERT INTO atividades(id,user_id,data,titulo,dur,status,gasto,inicio) VALUES('cr',?,date('now'),'Cronômetro esquecido',30,'doing',60,?)",
              (mid, int(time.time()) - 13 * 3600))
r = M.rodar("cronometro")
row = db().execute("SELECT gasto, inicio, rev FROM atividades WHERE id='cr'").fetchone()
ok(row["inicio"] == 0 and row["gasto"] == 60 + 1800, "parado e registrado no máximo o previsto (30 min)")
rc = ma.get("/api/recados", headers=H).get_json()
ok(len(rc) == 1 and "ficou ligado por mais de 12 horas" in rc[0]["texto"], "a pessoa recebe um recado")
ok(ma.get("/api/recados", headers=H).get_json() == [], "recado aparece só uma vez")
ok(M.rodar("cronometro")["resumo"] == "Nenhum cronômetro esquecido.", "não mexe de novo")

print("[contas paradas]")
r = M.rodar("contas_paradas"); ok(r["ok"] is True, "todos acessaram: " + r["resumo"])
with db() as c:
    c.execute("UPDATE usuarios SET criado_em=datetime('now','localtime','-200 days') WHERE id=?", (mid,))
    c.execute("DELETE FROM acessos WHERE user_id=?", (mid,))
a0 = avisos()
r = M.rodar("contas_paradas")
ok(r["ok"] is False and "Maria Silva" in r["resumo"] and avisos() == a0 + 1, "conta parada vira aviso: " + r["resumo"][:80])

print("[versao nova]")
arq = os.path.join(pasta, "versao_remota.py")
open(arq, "w").write('VERSAO = "99.0.0"\n')
M.URL_VERSAO = "file:///" + arq.replace("\\", "/")
r = M.rodar("versao_nova"); ok(r["ok"] is False and "99.0.0" in r["resumo"], "avisa versão nova: " + r["resumo"][:60])
open(arq, "w").write('VERSAO = "0.0.1"\n')
r = M.rodar("versao_nova"); ok(r["ok"] is True, "sem versão nova: " + r["resumo"])
M.URL_VERSAO = "http://127.0.0.1:9/nada"
r = M.rodar("versao_nova"); ok(r["ok"] is None, "sem internet não é erro: " + r["resumo"][:60])

print("[agendamento]")
M.tick()
ok(M.vencidas(db()) == [], "depois de rodar, nada fica vencido")
with db() as c:
    c.execute("UPDATE manutencao SET ultima=ultima-8*86400 WHERE rotina='otimizar'")
ok("otimizar" in M.vencidas(db(), time.mktime(time.strptime("2026-11-20 03:00", "%Y-%m-%d %H:%M"))), "otimização vencida roda de madrugada")
r = adm.post("/api/manutencao/integridade/rodar", headers=H)
ok(r.status_code == 200 and [x for x in r.get_json()["rotinas"] if x["rotina"] == "integridade"][0]["ok"] is True, "botão Rodar agora")
ok(adm.post("/api/manutencao/nao_existe/rodar", headers=H).status_code == 404, "rotina desconhecida: 404")
print("\nFALHAS: %d" % len(F))
sys.exit(1 if F else 0)
