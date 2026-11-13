# -*- coding: utf-8 -*-
"""Modo demonstracao (DEMO=1): equipe e atividades ficticias, recriadas a cada DEMO_HORAS (padrao 24 h).

Login do visitante: usuario "demo", senha "demo" (perfil Supervisor: ve equipe, graficos e relatorios,
mas nao as telas de administracao). As acoes perigosas sao bloqueadas no app.py (ver DEMO_BLOQUEIOS).
"""
import json
import os
import random
import secrets
import sqlite3
import time
from datetime import date, datetime, timedelta

from werkzeug.security import generate_password_hash

USUARIO, SENHA = "demo", "demo"
HORAS = float(os.environ.get("DEMO_HORAS", "24"))

EQUIPE = [  # (id, login, nome, cargo, perfil)
    (1, USUARIO, "Visitante (demonstração)", "Coordenação de Suporte", "supervisor"),
    (2, "ana.souza", "Ana Souza", "Analista de Suporte", "usuario"),
    (3, "bruno.lima", "Bruno Lima", "Técnico de Informática", "usuario"),
    (4, "carla.mendes", "Carla Mendes", "Analista de Sistemas", "usuario"),
]
MODELOS = [  # (titulo, tipo, duracao prevista, solicitantes possiveis)
    ("Instalar impressora no setor", "SUP", 45, ["Recepção", "Faturamento", "Almoxarifado"]),
    ("Redefinir senha de acesso", "SUP", 15, ["Recepção", "Enfermagem", "RH"]),
    ("Configurar estação de trabalho nova", "SUP", 90, ["Financeiro", "RH", "Compras"]),
    ("Atender chamado de lentidão na rede", "SUP", 60, ["Faturamento", "Diretoria", "Laboratório"]),
    ("Treinamento do sistema para novos colaboradores", "TRE", 120, ["RH", "Enfermagem"]),
    ("Treinamento rápido de relatórios", "TRE", 60, ["Financeiro", "Diretoria"]),
    ("Reunião de alinhamento da equipe", "REU", 45, [""]),
    ("Reunião com fornecedor de software", "REU", 60, ["Diretoria", "Compras"]),
    ("Ajustar relatório mensal de produtividade", "DEV", 120, ["Diretoria", "Financeiro"]),
    ("Automatizar planilha de controle", "DEV", 150, ["Almoxarifado", "Compras"]),
    ("Documentar procedimento de backup", "DOC", 60, [""]),
    ("Atualizar manual do usuário", "DOC", 90, ["RH"]),
    ("Importar tabela de preços", "IMP", 60, ["Compras", "Faturamento"]),
    ("Importar cadastro de fornecedores", "IMP", 90, ["Compras"]),
]
TAGS = ["urgente", "rede", "impressora", "acesso", "melhoria"]


def _carimbo(base):
    return os.path.join(base, "demo.stamp")


def precisa_recriar(base):
    try:
        return time.time() - os.path.getmtime(_carimbo(base)) > HORAS * 3600
    except OSError:
        return True


def semear(db_path, base):
    """Apaga tudo e recria a equipe e as atividades ficticias."""
    rnd = random.Random()
    con = sqlite3.connect(db_path, timeout=20)
    try:
        con.execute("PRAGMA foreign_keys=ON")
        with con:
            for t in ("anexos", "sessoes", "acessos", "avisos", "historico", "metas", "atividades", "usuarios"):
                con.execute("DELETE FROM %s" % t)
            for uid, login, nome, cargo, perfil in EQUIPE:
                senha = SENHA if login == USUARIO else secrets.token_urlsafe(18)  # so o visitante consegue entrar
                con.execute("INSERT INTO usuarios(id,usuario,nome,cargo,senha_hash,admin,perfil,trocar_senha) VALUES(?,?,?,?,?,0,?,0)",
                            (uid, login, nome, cargo, generate_password_hash(senha, method="pbkdf2:sha256"), perfil))
            con.execute("INSERT INTO metas(user_id,diaria,semanal) VALUES(0,4,18)")
            hoje, agora = date.today(), time.time()
            for uid, *_ in EQUIPE:
                ritmo = {1: 0.8, 2: 1.0, 3: 0.9, 4: 0.7}[uid]
                for k in range(int(150 * ritmo)):
                    d = hoje - timedelta(days=rnd.randint(-6, 45))
                    if d.weekday() >= 5 and rnd.random() < 0.85:
                        d -= timedelta(days=d.weekday() - 4)  # quase tudo em dia util
                    titulo, cat, dur, quem = rnd.choice(MODELOS)
                    h = "%02d:%s" % (rnd.choice([8, 8, 9, 9, 10, 10, 11, 13, 14, 14, 15, 16, 17]), rnd.choice(["00", "30"]))
                    passado = d < hoje
                    st = ("done" if rnd.random() < 0.9 else "todo") if passado else ("todo" if d > hoje else rnd.choice(["todo", "doing", "done"]))
                    gasto = int(dur * 60 * rnd.uniform(0.6, 1.6)) if st == "done" and rnd.random() < 0.7 else 0
                    ini_dia = datetime(d.year, d.month, d.day, int(h[:2]), int(h[3:])).timestamp()
                    fim = int(min(agora, ini_dia + dur * 60 * rnd.uniform(0.8, 2.5))) if st == "done" else 0
                    prazo = ""
                    if rnd.random() < 0.5:
                        prazo = (d + timedelta(days=rnd.choice([0, 1, 1, 2, 3]))).isoformat()
                        if rnd.random() < 0.4:
                            prazo += "T%02d:00" % rnd.randint(9, 18)
                    subs = [{"t": s, "d": st == "done" or rnd.random() < 0.4} for s in rnd.sample(
                        ["Levantar o problema", "Executar", "Testar com o usuário", "Registrar no histórico"], rnd.randint(0, 3))]
                    con.execute(
                        "INSERT INTO atividades(id,user_id,data,hora,dur,titulo,descricao,cat,quem,prio,status,tags,subs,fixa,gasto,inicio,prazo,fim,rev) "
                        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,0,?,?,1)",
                        ("d%d_%d" % (uid, k), uid, d.isoformat(), h, dur, titulo, "", cat, rnd.choice(quem),
                         rnd.choice(["alta", "media", "media", "baixa"]), st,
                         json.dumps(rnd.sample(TAGS, rnd.choice([0, 0, 1, 1, 2])), ensure_ascii=False),
                         json.dumps(subs, ensure_ascii=False), gasto, prazo, fim))
    finally:
        con.close()
    with open(_carimbo(base), "w", encoding="utf-8") as f:
        f.write(datetime.now().isoformat())


def garantir(db_path, base):
    """Recria os dados se passou o prazo. Devolve True se recriou."""
    if precisa_recriar(base):
        semear(db_path, base)
        return True
    return False
