# -*- coding: utf-8 -*-
"""Suporte - Controle de Atividades (servidor local).

Execute com iniciar.bat (Windows) ou:  python app.py
Endereco e porta: variaveis HOST e PORT (padrao 0.0.0.0 = todos os IPs, e 5000). Ajuste em config.bat.
"""
import errno
import json
import os
import shutil
import re
import secrets
import socket
import sqlite3
import sys
import threading
import time
from datetime import date, datetime, timedelta
from functools import wraps

from flask import Flask, abort, g, jsonify, request, send_file, send_from_directory, session
from werkzeug.security import check_password_hash, generate_password_hash

import anexos
import atualizar
import extras
import gestao
import importar
import prazos
import relatorios
import seguranca
from versao import VERSAO

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE, "data.db")
KEY_PATH = os.path.join(BASE, "secret.key")
BACKUP_DIR = os.environ.get("BACKUP_DIR", os.path.join(BASE, "backups"))
BACKUP_KEEP = int(os.environ.get("BACKUP_KEEP", "30"))  # quantos backups manter
BACKUP_COPIA = os.environ.get("BACKUP_COPIA", "").strip()  # segunda pasta (ex.: drive da rede) que recebe uma copia
COPIA_STATUS = {"ok": None, "quando": "", "erro": ""}
CERT_DIR = os.path.join(BASE, "certs")
ANEXOS_DIR = os.environ.get("ANEXOS_DIR", os.path.join(BASE, "anexos"))
EXIGIR_2FA_ADMIN = os.environ.get("EXIGIR_2FA_ADMIN", "0").lower() in ("1", "true", "sim", "yes")
SESSAO_MIN = int(os.environ.get("SESSAO_MIN", "60"))  # minutos de inatividade ate desconectar (0 = nunca)
USAR_HTTPS = os.environ.get("HTTPS", "1").lower() not in ("0", "false", "nao", "no")
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "5000"))

CSP_ATIVO = os.environ.get("CSP", "1").lower() not in ("0", "false", "nao", "no")
# Hospedagem publica (ver HOSPEDAGEM.md): DEMO=1 liga a demonstracao com dados ficticios;
# PROXY=1 quando o sistema roda atras de um proxy HTTPS (PythonAnywhere, Cloudflare Tunnel...).
DEMO = os.environ.get("DEMO", "0").lower() in ("1", "true", "sim", "yes")
PROXY = os.environ.get("PROXY", "0").lower() in ("1", "true", "sim", "yes")
SQLITE_WAL = os.environ.get("SQLITE_WAL", "1").lower() not in ("0", "false", "nao", "no")

# Usuario administrador criado na primeira execucao. A senha inicial e sorteada e mostrada no console
# (o sistema obriga a troca no primeiro acesso). Esqueceu? python manage.py senha admin
# Nome e login podem ser trocados depois em Administracao > Usuarios.
ADMIN_PADRAO = ("admin", "Administrador", "")

INICIO_PROC = time.time()
ATIVOS = {}  # user_id -> ultimo uso (para "online agora")
CATS = {"TRE", "IMP", "SUP", "REU", "DEV", "DOC"}
HASH_METODO = "pbkdf2:sha256"
PERFIL_NOME = {"usuario": "Usuário", "supervisor": "Supervisor", "admin": "Administrador"}


# Permissoes finas. Vazio no banco = padrao do perfil. Administrador tem todas.
PERMS = {"ver_equipe": "Ver o painel e os relatórios da equipe", "editar_metas": "Definir as metas",
         "exportar": "Exportar relatórios (Excel, PDF e CSV)", "ver_alteracoes": "Ver as alterações feitas pela equipe",
         "tv": "Abrir o painel para TV"}
PERMS_PADRAO = {"usuario": ["exportar"], "supervisor": list(PERMS), "admin": list(PERMS)}


def perms_de(r):
    if r["perfil"] == "admin":
        return list(PERMS)
    try:
        cust = json.loads(r["permissoes"]) if r["permissoes"] else None
    except ValueError:
        cust = None
    if isinstance(cust, list):
        return [p for p in PERMS if p in cust]
    return list(PERMS_PADRAO.get(r["perfil"], ["exportar"]))


def limpa_perms(v):
    """None = usar o padrao do perfil; lista = personalizada."""
    if v is None or v == "padrao":
        return ""
    if not isinstance(v, list):
        raise ValueError("Permissões inválidas.")
    return json.dumps([p for p in PERMS if p in v])


def perfil_param(d):
    p = d.get("perfil")
    if p in PERFIL_NOME:
        return p
    return "admin" if d.get("admin") else "usuario"

SCHEMA = """
CREATE TABLE IF NOT EXISTS usuarios (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario    TEXT NOT NULL UNIQUE,
    nome       TEXT NOT NULL,
    cargo      TEXT NOT NULL DEFAULT '',
    senha_hash TEXT NOT NULL,
    admin      INTEGER NOT NULL DEFAULT 0,
    perfil     TEXT NOT NULL DEFAULT 'usuario',
    trocar_senha INTEGER NOT NULL DEFAULT 0,
    criado_em  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS atividades (
    id        TEXT NOT NULL,
    user_id   INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    data      TEXT NOT NULL,
    hora      TEXT NOT NULL DEFAULT '',
    dur       INTEGER NOT NULL DEFAULT 0,
    titulo    TEXT NOT NULL,
    descricao TEXT NOT NULL DEFAULT '',
    cat       TEXT NOT NULL DEFAULT 'DEV',
    quem      TEXT NOT NULL DEFAULT '',
    prio      TEXT NOT NULL DEFAULT 'media',
    status    TEXT NOT NULL DEFAULT 'todo',
    PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS ix_ativ_data ON atividades(user_id, data);
CREATE TABLE IF NOT EXISTS acessos (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    quando  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    user_id INTEGER,
    usuario TEXT NOT NULL DEFAULT '',
    ok      INTEGER NOT NULL DEFAULT 1,
    ip      TEXT NOT NULL DEFAULT '',
    agente  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_acessos_user ON acessos(user_id, id);
CREATE TABLE IF NOT EXISTS anexos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    atividade_id TEXT NOT NULL,
    nome         TEXT NOT NULL,
    tipo         TEXT NOT NULL,
    tamanho      INTEGER NOT NULL DEFAULT 0,
    arquivo      TEXT NOT NULL,
    criado       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_anexos_ativ ON anexos(user_id, atividade_id);
CREATE TABLE IF NOT EXISTS sessoes (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    sid     TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    criado  INTEGER NOT NULL,
    ultimo  INTEGER NOT NULL,
    ip      TEXT NOT NULL DEFAULT '',
    agente  TEXT NOT NULL DEFAULT '',
    ativa   INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS avisos (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    quando TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    tipo   TEXT NOT NULL DEFAULT '',
    texto  TEXT NOT NULL DEFAULT '',
    lido   INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS historico (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    quando    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ator_id   INTEGER,
    ator_nome TEXT NOT NULL DEFAULT '',
    entidade  TEXT NOT NULL,
    acao      TEXT NOT NULL,
    ref       TEXT NOT NULL DEFAULT '',
    titulo    TEXT NOT NULL DEFAULT '',
    detalhe   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_hist_quando ON historico(quando);
CREATE TABLE IF NOT EXISTS metas (
    user_id INTEGER PRIMARY KEY,
    diaria  INTEGER,
    semanal INTEGER
);
"""


def chave_secreta():
    if not os.path.exists(KEY_PATH):
        with open(KEY_PATH, "w", encoding="utf-8") as f:
            f.write(secrets.token_hex(32))
    with open(KEY_PATH, encoding="utf-8") as f:
        return f.read().strip()


def connect():
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    # WAL e mais rapido no disco local; em disco de rede (hospedagem) use SQLITE_WAL=0
    con.execute("PRAGMA journal_mode=%s" % ("WAL" if SQLITE_WAL else "DELETE"))
    return con


def hash_senha(senha):
    return generate_password_hash(senha, method=HASH_METODO)


def init_db():
    con = connect()
    con.executescript(SCHEMA)
    if "trocar_senha" not in [r["name"] for r in con.execute("PRAGMA table_info(usuarios)")]:
        con.execute("ALTER TABLE usuarios ADD COLUMN trocar_senha INTEGER NOT NULL DEFAULT 0")
    if "perfil" not in [r["name"] for r in con.execute("PRAGMA table_info(usuarios)")]:
        con.execute("ALTER TABLE usuarios ADD COLUMN perfil TEXT NOT NULL DEFAULT 'usuario'")
        con.execute("UPDATE usuarios SET perfil = CASE WHEN admin=1 THEN 'admin' ELSE 'usuario' END")
    ucols = [r["name"] for r in con.execute("PRAGMA table_info(usuarios)")]
    for nome, defn in (("falhas", "INTEGER NOT NULL DEFAULT 0"), ("bloq_ate", "INTEGER NOT NULL DEFAULT 0"),
                       ("totp_segredo", "TEXT NOT NULL DEFAULT ''"), ("totp_ativo", "INTEGER NOT NULL DEFAULT 0"),
                       ("totp_recup", "TEXT NOT NULL DEFAULT '[]'"), ("totp_ultimo", "INTEGER NOT NULL DEFAULT 0")):
        if nome not in ucols:
            con.execute("ALTER TABLE usuarios ADD COLUMN %s %s" % (nome, defn))
    if "permissoes" not in ucols:
        con.execute("ALTER TABLE usuarios ADD COLUMN permissoes TEXT NOT NULL DEFAULT ''")
    extras.init_db(con)
    cols = [r["name"] for r in con.execute("PRAGMA table_info(atividades)")]
    for nome, defn in (("prazo", "TEXT NOT NULL DEFAULT ''"), ("fim", "INTEGER NOT NULL DEFAULT 0"),
                       ("deleg_de", "TEXT NOT NULL DEFAULT ''"), ("deleg_em", "TEXT NOT NULL DEFAULT ''"),
                       ("deleg_nota", "TEXT NOT NULL DEFAULT ''")):
        if nome not in cols:
            con.execute("ALTER TABLE atividades ADD COLUMN %s %s" % (nome, defn))
    for nome, defn in (("tags", "TEXT NOT NULL DEFAULT '[]'"), ("subs", "TEXT NOT NULL DEFAULT '[]'"),
                       ("fixa", "INTEGER NOT NULL DEFAULT 0"), ("gasto", "INTEGER NOT NULL DEFAULT 0"),
                       ("inicio", "INTEGER NOT NULL DEFAULT 0"), ("rev", "INTEGER NOT NULL DEFAULT 1")):
        if nome not in cols:
            con.execute("ALTER TABLE atividades ADD COLUMN %s %s" % (nome, defn))
    if con.execute("SELECT COUNT(*) FROM usuarios").fetchone()[0] == 0:
        u, n, c = ADMIN_PADRAO
        s = "".join(secrets.choice("abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789") for _ in range(12))
        con.execute(
            "INSERT INTO usuarios(usuario,nome,cargo,senha_hash,admin,perfil,trocar_senha) VALUES(?,?,?,?,1,'admin',1)",
            (u, n, c, hash_senha(s)),
        )
        print("\n  Usuario inicial criado:  %s  /  senha provisoria: %s" % (u, s))
        print("  ANOTE AGORA. O sistema vai pedir a troca da senha no primeiro acesso.")
        print("  Se perder: python manage.py senha %s\n" % u)
    con.commit()
    con.close()


app = Flask(__name__, static_folder="static", static_url_path="/static")
app.secret_key = chave_secreta()
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=timedelta(hours=12),
    MAX_CONTENT_LENGTH=30 * 1024 * 1024,
    SEND_FILE_MAX_AGE_DEFAULT=0,
)
if PROXY:
    # o proxy informa o IP real do visitante e que a conexao e HTTPS
    from werkzeug.middleware.proxy_fix import ProxyFix
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
    app.config["SESSION_COOKIE_SECURE"] = True

# ---- modo demonstracao: o que um visitante NAO pode fazer
DEMO_BLOQUEIOS = [  # (metodos, prefixo do caminho)
    (("POST", "PUT", "DELETE"), "/api/usuarios"),       # criar/editar/excluir usuarios, senhas, 2FA de outros
    (("POST",), "/api/senha"), (("POST",), "/api/2fa/"),   # trocar a senha ou ligar 2FA trancaria os outros visitantes
    (("POST", "GET"), "/api/backup"),                     # backups: criar, listar, baixar, restaurar
    (("POST", "GET"), "/api/atualizar/"), (("GET",), "/api/versao"),  # enviar codigo novo ao servidor
    (("POST",), "/api/atividades/"),                      # anexos (arquivos de terceiros no servidor)
    (("GET",), "/api/acessos"), (("GET",), "/api/saude"), (("GET",), "/api/seguranca"),
    (("GET", "POST", "DELETE"), "/api/sessoes"),          # a conta e compartilhada: mostraria o IP de outros visitantes
]
_demo_ultima = [0.0]


@app.before_request
def modo_demo():
    if not DEMO:
        return
    agora = time.time()
    if agora - _demo_ultima[0] > 300:  # confere a cada 5 min se ja e hora de recriar os dados
        _demo_ultima[0] = agora
        try:
            import demo
            demo.garantir(DB_PATH, BASE)
        except Exception as e:  # nunca derruba a pagina por causa da recriacao
            print("  Falha ao recriar a demonstracao:", e)
    for metodos, prefixo in DEMO_BLOQUEIOS:
        if request.method in metodos and request.path.startswith(prefixo):
            return jsonify(erro="Desativado na demonstração (os dados são fictícios e compartilhados por todos os visitantes)."), 403


@app.get("/api/demo")
def info_demo():
    """A tela de login usa isto para mostrar o aviso e preencher o acesso de visitante."""
    if not DEMO:
        return jsonify(demo=False)
    import demo
    return jsonify(demo=True, usuario=demo.USUARIO, senha=demo.SENHA, horas=demo.HORAS)


def get_db():
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def fechar_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def login_required(fn):
    @wraps(fn)
    def wrap(*a, **kw):
        if not session.get("uid"):
            return jsonify(erro="auth"), 401
        return fn(*a, **kw)
    return wrap


def equipe_required(fn):
    @wraps(fn)
    @login_required
    def wrap(*a, **kw):
        if not pode_equipe():
            return jsonify(erro="Acesso restrito a supervisores e administradores."), 403
        return fn(*a, **kw)
    return wrap


def tem_perm(p):
    if not session.get("uid"):
        return False
    if "_perms" not in g:
        r = get_db().execute("SELECT perfil, permissoes FROM usuarios WHERE id=?", (session["uid"],)).fetchone()
        g._perms = perms_de(r) if r else []
    return p in g._perms


def pode_equipe():
    return tem_perm("ver_equipe")


def perm_required(p):
    def deco(fn):
        @wraps(fn)
        @login_required
        def wrap(*a, **kw):
            if not tem_perm(p):
                return jsonify(erro="Seu perfil não tem permissão para isso. Fale com o administrador."), 403
            return fn(*a, **kw)
        return wrap
    return deco


PERM_ROTAS = [  # (metodo, prefixo, permissao) conferidos antes das rotas dos outros modulos
    ("PUT", "/api/metas", "editar_metas"),
    ("GET", "/api/relatorios/excel", "exportar"), ("GET", "/api/relatorios/pdf", "exportar"),
    ("GET", "/api/graficos/excel", "exportar"),
]


@app.before_request
def confere_perm_rotas():
    if not session.get("uid"):
        return None
    for m, pref, p in PERM_ROTAS:
        if request.method == m and request.path.startswith(pref) and not tem_perm(p):
            return jsonify(erro="Seu perfil não tem permissão para isso. Fale com o administrador."), 403
    return None


def ator():
    return get_db().execute("SELECT id, nome FROM usuarios WHERE id=?", (session["uid"],)).fetchone()


def admin_required(fn):
    @wraps(fn)
    @login_required
    def wrap(*a, **kw):
        row = get_db().execute("SELECT admin FROM usuarios WHERE id=?", (session["uid"],)).fetchone()
        if not row or not row["admin"]:
            return jsonify(erro="Acesso restrito a administradores."), 403
        return fn(*a, **kw)
    return wrap


@app.before_request
def protege_csrf():
    # Requisicoes que alteram dados precisam do cabecalho enviado pelo proprio sistema.
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and request.headers.get("X-Requested-With") != "fetch":
        return jsonify(erro="Requisicao invalida."), 400


LIVRES = {"/api/me", "/api/senha", "/api/logout", "/api/login", "/api/login/2fa", "/api/ping", "/api/2fa/iniciar", "/api/2fa/ativar"}


@app.before_request
def controla_sessao():
    """Desconecta quem ficou parado. Consultas automaticas (X-Poll) nao renovam o prazo."""
    uid = session.get("uid")
    if (not uid or not request.path.startswith("/api/")
            or request.path in ("/api/login", "/api/login/2fa", "/api/logout")):
        return
    agora = time.time()
    if SESSAO_MIN > 0 and agora - session.get("ultimo", agora) > SESSAO_MIN * 60:
        encerra_sessao_atual()
        session.clear()
        return jsonify(erro="auth"), 401
    if not seguranca.confere_sessao(get_db(), uid, request.remote_addr or "?", agente_curto(request.headers.get("User-Agent")),
                                    toca=request.headers.get("X-Poll") != "1"):
        session.clear()
        return jsonify(erro="auth"), 401
    if request.headers.get("X-Poll") != "1":
        session["ultimo"] = agora
        ATIVOS[uid] = agora



@app.before_request
def exige_troca_de_senha():
    uid = session.get("uid")
    if uid and request.path.startswith("/api/") and request.path not in LIVRES:
        r = get_db().execute("SELECT trocar_senha, admin, totp_ativo FROM usuarios WHERE id=?", (uid,)).fetchone()
        if r and r["trocar_senha"]:
            return jsonify(erro="trocar_senha"), 403
        if EXIGIR_2FA_ADMIN and r and r["admin"] and not r["totp_ativo"]:
            return jsonify(erro="configurar_2fa"), 403


@app.after_request
def cabecalhos(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "SAMEORIGIN"
    if request.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


RE_SCRIPT = re.compile(r"<script(?=[\s>])")


def csp(nonce):
    return ("default-src 'self'; script-src 'self' 'nonce-%s'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:; "
            "worker-src 'self'; manifest-src 'self'; frame-src 'self' blob:; object-src 'none'; "
            "base-uri 'none'; form-action 'self'; frame-ancestors 'self'" % nonce)


RE_ESTATICO = re.compile(r'((?:src|href)=")/static/((?:css|js)/[\w./-]+\.(?:css|js))"')


def versiona(m):
    """/static/js/app.js -> /static/js/app.js?v=<data do arquivo>: o navegador baixa de novo quando o arquivo muda."""
    try:
        v = int(os.path.getmtime(os.path.join(BASE, "static", *m.group(2).split("/"))))
    except OSError:
        v = 0
    return '%s/static/%s?v=%d"' % (m.group(1), m.group(2), v)


@app.get("/")
def index():
    """Entrega a interface com um nonce novo em cada <script>: so os scripts do proprio sistema rodam,
    e um texto malicioso que chegue a tela como HTML nao consegue executar codigo (CSP)."""
    with open(os.path.join(BASE, "static", "index.html"), encoding="utf-8") as f:
        html = RE_ESTATICO.sub(versiona, f.read())
    if CSP_ATIVO:
        nonce = secrets.token_urlsafe(16)
        html = RE_SCRIPT.sub('<script nonce="%s"' % nonce, html)
    resp = app.response_class(html, mimetype="text/html")
    if CSP_ATIVO:
        resp.headers["Content-Security-Policy"] = csp(nonce)
    resp.headers["Cache-Control"] = "no-store"
    return resp


@app.get("/manifest.webmanifest")
def manifest():
    resp = send_from_directory(os.path.join(BASE, "static"), "manifest.webmanifest", mimetype="application/manifest+json")
    resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.get("/sw.js")
def service_worker():
    resp = send_from_directory(os.path.join(BASE, "static"), "sw.js", mimetype="application/javascript")
    resp.headers["Cache-Control"] = "no-cache"
    resp.headers["Service-Worker-Allowed"] = "/"
    return resp


# ---------------------------------------------------------------- sessao
FALHAS = {}  # ip -> [tentativas, bloqueado_ate]


def usuario_json(r):
    return {"id": r["id"], "usuario": r["usuario"], "nome": r["nome"], "cargo": r["cargo"], "admin": bool(r["admin"]),
            "perfil": r["perfil"], "equipe": "ver_equipe" in perms_de(r), "perms": perms_de(r),
            "perms_padrao": not r["permissoes"], "sessao_min": SESSAO_MIN,
            "trocar": bool(r["trocar_senha"]), "totp": bool(r["totp_ativo"]),
            "bloqueada": int(r["bloq_ate"] or 0) > time.time()}


@app.get("/api/me")
def me():
    uid = session.get("uid")
    if not uid:
        return jsonify(erro="auth"), 401
    r = get_db().execute("SELECT * FROM usuarios WHERE id=?", (uid,)).fetchone()
    if not r:
        session.clear()
        return jsonify(erro="auth"), 401
    j = usuario_json(r)
    ac = get_db().execute("SELECT quando, ip, agente FROM acessos WHERE user_id=? AND ok=1 ORDER BY id DESC LIMIT 2", (uid,)).fetchall()
    if len(ac) == 2 and not DEMO:  # na demonstracao o "acesso anterior" seria de outro visitante
        j["ultimo_acesso"] = {"quando": ac[1]["quando"], "ip": ac[1]["ip"], "agente": ac[1]["agente"]}
    j["exigir_2fa"] = EXIGIR_2FA_ADMIN
    j["demo"] = DEMO
    j["foco"] = r["foco_ate"] if r["foco_ate"] > time.time() else 0
    j["perms_nomes"] = PERMS
    j["perms_perfil"] = PERMS_PADRAO
    if r["admin"]:
        j["avisos"] = get_db().execute("SELECT COUNT(*) FROM avisos WHERE lido=0").fetchone()[0]
    return jsonify(j)


def agente_curto(ua):
    ua = ua or ""
    nav = ("Edge" if "Edg/" in ua else "Opera" if "OPR/" in ua else "Firefox" if "Firefox/" in ua
           else "Chrome" if ("Chrome/" in ua or "CriOS" in ua) else "Safari" if "Safari/" in ua else "Navegador")
    so = ("Android" if "Android" in ua else "iPhone" if "iPhone" in ua else "iPad" if "iPad" in ua
          else "Windows" if "Windows" in ua else "macOS" if "Mac OS X" in ua else "Linux" if "Linux" in ua else "?")
    return "%s · %s" % (nav, so)


def registra_acesso(db, uid, usuario, ok):
    try:
        db.execute("INSERT INTO acessos(user_id,usuario,ok,ip,agente) VALUES(?,?,?,?,?)",
                   (uid, str(usuario)[:60], 1 if ok else 0, request.remote_addr or "?", agente_curto(request.headers.get("User-Agent"))))
        db.execute("DELETE FROM acessos WHERE quando < datetime('now','localtime','-90 days')")
        db.commit()
    except sqlite3.Error:
        pass


def encerra_sessao_atual():
    try:
        seguranca.encerra_atual(get_db())
    except sqlite3.Error:
        pass


def entrar(r):
    """Conclui o login: abre a sessao, registra o acesso e zera as falhas."""
    session.clear()
    session.permanent = True
    session["uid"] = r["id"]
    session["ultimo"] = time.time()
    seguranca.nova_sessao(get_db(), r["id"], request.remote_addr or "?", agente_curto(request.headers.get("User-Agent")))
    seguranca.zera_falhas(get_db(), r)
    registra_acesso(get_db(), r["id"], r["usuario"], True)


def msg_bloqueio(seg):
    return "Conta bloqueada por excesso de tentativas. Tente novamente em %d min ou peça ao administrador para desbloquear." % max(1, -(-seg // 60))


@app.post("/api/login")
def login():
    ip = request.remote_addr or "?"
    qtd, ate = FALHAS.get(ip, [0, 0])
    if qtd >= 5 and time.time() < ate:
        return jsonify(erro="Muitas tentativas. Aguarde 1 minuto."), 429
    d = request.get_json(silent=True) or {}
    db = get_db()
    nome = str(d.get("usuario", "")).strip().lower()
    r = db.execute("SELECT * FROM usuarios WHERE usuario=?", (nome,)).fetchone()
    if r and seguranca.bloqueio_restante(r):
        return jsonify(erro=msg_bloqueio(seguranca.bloqueio_restante(r))), 423
    if not r or not check_password_hash(r["senha_hash"], str(d.get("senha", ""))):
        qtd += 1
        FALHAS[ip] = [qtd, time.time() + 60 if qtd >= 5 else 0]
        registra_acesso(db, r["id"] if r else None, nome, False)
        # na demonstracao a conta e de todos: errar a senha de proposito nao pode trancar os outros visitantes
        if r and not DEMO and seguranca.registra_falha(db, r, ip):
            return jsonify(erro=msg_bloqueio(seguranca.BLOQ_MIN * 60)), 423
        return jsonify(erro="Usuário ou senha inválidos."), 401
    FALHAS.pop(ip, None)
    if r["totp_ativo"]:
        session.clear()
        session["pre2fa"] = r["id"]
        session["pre2fa_ate"] = time.time() + 300
        return jsonify(precisa_2fa=True)
    entrar(r)
    return jsonify(usuario_json(db.execute("SELECT * FROM usuarios WHERE id=?", (r["id"],)).fetchone()))


@app.post("/api/login/2fa")
def login_2fa():
    ip = request.remote_addr or "?"
    uid, ate = session.get("pre2fa"), session.get("pre2fa_ate", 0)
    if not uid or time.time() > ate:
        session.clear()
        return jsonify(erro="Tempo esgotado. Entre com usuário e senha novamente.", reinicia=True), 401
    db = get_db()
    r = db.execute("SELECT * FROM usuarios WHERE id=?", (uid,)).fetchone()
    if not r or not r["totp_ativo"]:
        session.clear()
        return jsonify(erro="Entre novamente.", reinicia=True), 401
    if seguranca.bloqueio_restante(r):
        return jsonify(erro=msg_bloqueio(seguranca.bloqueio_restante(r)), reinicia=True), 423
    d = request.get_json(silent=True) or {}
    if not seguranca.confere_segundo_fator(db, r, d.get("codigo")):
        registra_acesso(db, r["id"], r["usuario"] + " (2ª etapa)", False)
        if seguranca.registra_falha(db, r, ip):
            session.clear()
            return jsonify(erro=msg_bloqueio(seguranca.BLOQ_MIN * 60), reinicia=True), 423
        return jsonify(erro="Código incorreto."), 401
    entrar(r)
    return jsonify(usuario_json(db.execute("SELECT * FROM usuarios WHERE id=?", (r["id"],)).fetchone()))


@app.post("/api/ping")
@login_required
def ping():
    return jsonify(ok=True)


@app.get("/certificado.crt")
def certificado_publico():
    p = os.path.join(CERT_DIR, "cert.pem")
    if not os.path.exists(p):
        abort(404)
    return send_file(p, as_attachment=True, download_name="suporte.crt", mimetype="application/x-x509-ca-cert")


@app.post("/api/logout")
def logout():
    encerra_sessao_atual()
    session.clear()
    return jsonify(ok=True)


@app.post("/api/senha")
@login_required
def trocar_senha():
    d = request.get_json(silent=True) or {}
    db = get_db()
    r = db.execute("SELECT * FROM usuarios WHERE id=?", (session["uid"],)).fetchone()
    if not check_password_hash(r["senha_hash"], str(d.get("atual", ""))):
        return jsonify(erro="Senha atual incorreta."), 400
    nova = str(d.get("nova", ""))
    erro = seguranca.valida_senha(nova, r["usuario"], r["nome"])
    if erro:
        return jsonify(erro=erro), 400
    if nova == str(d.get("atual", "")):
        return jsonify(erro="A nova senha deve ser diferente da atual."), 400
    with db:
        db.execute("UPDATE usuarios SET senha_hash=?, trocar_senha=0 WHERE id=?", (hash_senha(nova), r["id"]))
        # quem estava conectado com a senha antiga em outro lugar e desconectado; esta sessao continua
        n = seguranca.encerra_sessoes_usuario(db, r["id"], session.get("sid"))
        gestao.log(db, ator(), "usuario", "alterou", r["id"], r["nome"],
                   "Trocou a própria senha" + ("; %d outra(s) sessão(ões) encerrada(s)" % n if n else ""))
    return jsonify(ok=True, sessoes_encerradas=n)


# ------------------------------------------------------------ atividades
RE_DATA = re.compile(r"^\d{4}-\d{2}-\d{2}$")
RE_HORA = re.compile(r"^\d{2}:\d{2}$")


def limpa_tags(v):
    out, vistos = [], set()
    for t in (v if isinstance(v, list) else [])[:30]:
        t = re.sub(r"\s+", " ", str(t).replace("#", "")).strip()[:24]
        if t and t.lower() not in vistos:
            vistos.add(t.lower())
            out.append(t)
        if len(out) >= 8:
            break
    return json.dumps(out, ensure_ascii=False)


def limpa_subs(v):
    out = []
    for x in (v if isinstance(v, list) else [])[:40]:
        if isinstance(x, dict):
            t = str(x.get("t", "")).strip()[:120]
            if t:
                out.append({"t": t, "d": bool(x.get("d"))})
    return json.dumps(out, ensure_ascii=False)


def _int(v, lo, hi, pad=0):
    try:
        return max(lo, min(hi, int(v or 0)))
    except (TypeError, ValueError):
        return pad


COLS = ("id", "data", "hora", "dur", "titulo", "descricao", "cat", "quem", "prio", "status",
        "tags", "subs", "fixa", "gasto", "inicio", "prazo")
RE_PRAZO = re.compile(r"^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$")


def limpa(a):
    """Valida uma atividade vinda do navegador. Devolve dict (ou None) com a chave extra 'rev' (versao que o cliente viu)."""
    if not isinstance(a, dict):
        return None
    data = str(a.get("date", ""))
    titulo = str(a.get("title", "")).strip()[:200]
    if not RE_DATA.match(data) or not titulo:
        return None
    hora = str(a.get("time", ""))
    rev = a.get("rev")
    return {
        "id": str(a.get("id") or secrets.token_hex(6))[:40], "data": data, "hora": hora if RE_HORA.match(hora) else "",
        "dur": _int(a.get("dur"), 0, 1440), "titulo": titulo, "descricao": str(a.get("desc", ""))[:2000],
        "cat": a.get("cat") if a.get("cat") in CATS else "DEV", "quem": str(a.get("who", ""))[:120],
        "prio": a.get("prio") if a.get("prio") in ("alta", "media", "baixa") else "media",
        "status": a.get("status") if a.get("status") in ("todo", "doing", "done") else "todo",
        "tags": limpa_tags(a.get("tags")), "subs": limpa_subs(a.get("subs")), "fixa": 1 if a.get("pin") else 0,
        "gasto": _int(a.get("spent"), 0, 864000), "inicio": _int(a.get("tstart"), 0, 4102444800),
        "prazo": str(a.get("due", "")) if RE_PRAZO.match(str(a.get("due", ""))) else "",
        "rev": rev if isinstance(rev, int) else None,
    }


def ativ_json(r, anx=0):
    try:
        tags, subs = json.loads(r["tags"] or "[]"), json.loads(r["subs"] or "[]")
    except ValueError:
        tags, subs = [], []
    return {"id": r["id"], "date": r["data"], "time": r["hora"], "dur": r["dur"], "title": r["titulo"],
            "desc": r["descricao"], "cat": r["cat"], "who": r["quem"], "prio": r["prio"], "status": r["status"],
            "tags": tags, "subs": subs, "pin": bool(r["fixa"]), "spent": r["gasto"], "tstart": r["inicio"], "rev": r["rev"],
            "due": r["prazo"], "fim": r["fim"], "anx": anx,
            "deleg": {"de": r["deleg_de"], "em": r["deleg_em"], "nota": r["deleg_nota"]} if r["deleg_de"] else None}


@app.get("/api/atividades")
@login_required
def listar_atividades():
    rows = get_db().execute(
        "SELECT * FROM atividades WHERE user_id=? ORDER BY data, hora", (session["uid"],)
    ).fetchall()
    cont = {r[0]: r[1] for r in get_db().execute(
        "SELECT atividade_id, COUNT(*) FROM anexos WHERE user_id=? GROUP BY atividade_id", (session["uid"],))}
    return jsonify([ativ_json(r, cont.get(r["id"], 0)) for r in rows])


SQL_INS = ("INSERT OR REPLACE INTO atividades(user_id,%s,rev,fim,deleg_de,deleg_em,deleg_nota) VALUES(?,%s,?,?,?,?,?)"
           % (",".join(COLS), ",".join("?" * len(COLS))))


def deleg_de(antiga):
    """O INSERT OR REPLACE regrava a linha inteira: mantem quem delegou."""
    a = antiga or {}
    return (a.get("deleg_de", ""), a.get("deleg_em", ""), a.get("deleg_nota", ""))


def calc_fim(novo, antigo):
    """Momento da conclusao (epoch) guardado pelo servidor: mantem o anterior se ja estava concluida."""
    if novo["status"] != "done":
        return 0
    if antigo and antigo.get("status") == "done" and antigo.get("fim"):
        return antigo["fim"]
    return int(time.time())


# O antigo PUT /api/atividades (apagava tudo e regravava, sem conferir 'rev') foi removido:
# uma aba esquecida aberta podia sobrescrever o trabalho feito em outro computador. Use o PATCH abaixo.
@app.put("/api/atividades")
@login_required
def salvar_atividades_removido():
    return jsonify(erro="Versão da tela desatualizada. Recarregue a página (Ctrl+F5)."), 410


@app.patch("/api/atividades")
@login_required
def alterar_atividades():
    """Grava so o que mudou: {"upserts": [atividades], "deletes": [ids]}.
    Se a atividade foi alterada em outro lugar (rev diferente), ela NAO e sobrescrita e volta em 'conflitos'."""
    d = request.get_json(silent=True)
    if not isinstance(d, dict):
        return jsonify(erro="Dados inválidos."), 400
    ups, dels = d.get("upserts") or [], d.get("deletes") or []
    if not isinstance(ups, list) or not isinstance(dels, list) or len(ups) > 5000 or len(dels) > 5000:
        return jsonify(erro="Dados inválidos."), 400
    novas = {}
    for a in ups:
        r = limpa(a)
        if r:
            novas[r["id"]] = r
    apagar = {str(i)[:40] for i in dels if isinstance(i, (str, int))} - set(novas)
    ids, db, antigas = list(set(novas) | apagar), get_db(), {}
    for i in range(0, len(ids), 500):
        lote = ids[i:i + 500]
        for r in db.execute("SELECT * FROM atividades WHERE user_id=? AND id IN (%s)" % ",".join("?" * len(lote)),
                            [session["uid"]] + lote):
            antigas[r["id"]] = dict(r)
    conflitos, gravar, revs = [], {}, {}
    for i, n in novas.items():
        o = antigas.get(i)
        if o is not None and n["rev"] is not None and n["rev"] != o["rev"]:
            conflitos.append(ativ_json(o))
            continue
        gravar[i] = n
        revs[i] = (o["rev"] if o else 0) + 1
    with db:
        gestao.diff_atividades(db, ator(), {i: antigas[i] for i in gravar if i in antigas} | {i: antigas[i] for i in apagar if i in antigas},
                               {**gravar, **{}})
        db.executemany(SQL_INS, [(session["uid"],) + tuple(n[c] for c in COLS) + (revs[i], calc_fim(n, antigas.get(i))) + deleg_de(antigas.get(i))
                       for i, n in gravar.items()])
        extras.para_lixeira(db, session["uid"], [antigas[i] for i in apagar if i in antigas])
        db.executemany("DELETE FROM atividades WHERE user_id=? AND id=?", [(session["uid"], i) for i in apagar])
        extras.tira_da_lixeira(db, session["uid"], list(gravar))  # desfazer a exclusao: a atividade voltou
    return jsonify(ok=True, gravadas=len(gravar), apagadas=len(apagar), revs=revs, conflitos=conflitos)


# -------------------------------------------------------------- delegar
@app.get("/api/delegar/pessoas")
@login_required
def pessoas_delegar():
    rows = get_db().execute("SELECT id, nome, cargo FROM usuarios WHERE id!=? ORDER BY nome", (session["uid"],)).fetchall()
    return jsonify([{"id": r["id"], "nome": r["nome"], "cargo": r["cargo"]} for r in rows])


@app.post("/api/delegar")
@login_required
def delegar():
    """Passa uma atividade (com subtarefas e anexos) para outra pessoa: {"id", "para", "nota"}."""
    d = request.get_json(silent=True) or {}
    aid, nota = str(d.get("id", ""))[:40], str(d.get("nota", "")).strip()[:300]
    try:
        para = int(d.get("para"))
    except (TypeError, ValueError):
        return jsonify(erro="Escolha para quem delegar."), 400
    db, eu = get_db(), session["uid"]
    if para == eu:
        return jsonify(erro="Escolha outra pessoa."), 400
    dest = db.execute("SELECT id, nome FROM usuarios WHERE id=?", (para,)).fetchone()
    if not dest:
        return jsonify(erro="Pessoa não encontrada."), 404
    a = db.execute("SELECT * FROM atividades WHERE user_id=? AND id=?", (eu, aid)).fetchone()
    if not a:
        return jsonify(erro="Atividade não encontrada (atualize a página)."), 404
    novo = aid
    while db.execute("SELECT 1 FROM atividades WHERE user_id=? AND id=?", (para, novo)).fetchone():
        novo = secrets.token_hex(6)
    agora = int(time.time())
    gasto = a["gasto"] + (agora - a["inicio"] if a["inicio"] else 0)  # cronometro ligado: para e guarda o tempo
    me = ator()
    with db:
        db.execute("UPDATE atividades SET user_id=?, id=?, gasto=?, inicio=0, fixa=0, rev=rev+1, "
                   "deleg_de=?, deleg_em=?, deleg_nota=? WHERE user_id=? AND id=?",
                   (para, novo, gasto, me["nome"], datetime.now().strftime("%Y-%m-%d %H:%M"), nota, eu, aid))
        db.execute("UPDATE anexos SET user_id=?, atividade_id=? WHERE user_id=? AND atividade_id=?", (para, novo, eu, aid))
        gestao.log(db, me, "atividade", "delegou", novo, a["titulo"],
                   "Para: " + dest["nome"] + ((" — " + nota) if nota else ""))
    return jsonify(ok=True, para=dest["nome"])


# -------------------------------------------------------------- usuarios
@app.get("/api/usuarios")
@admin_required
def listar_usuarios():
    rows = get_db().execute("SELECT * FROM usuarios ORDER BY nome").fetchall()
    return jsonify([usuario_json(r) for r in rows])


@app.get("/api/equipe")
@equipe_required
def equipe():
    rows = get_db().execute("SELECT id, nome, cargo FROM usuarios ORDER BY nome").fetchall()
    return jsonify([{"id": r["id"], "nome": r["nome"], "cargo": r["cargo"]} for r in rows])


@app.get("/api/painel")
@equipe_required
def painel():
    dia = request.args.get("data") or date.today().isoformat()
    if not RE_DATA.match(dia):
        return jsonify(erro="Data inválida."), 400
    db = get_db()
    por = {}
    for a in db.execute(
            "SELECT user_id, hora, dur, titulo, status FROM atividades WHERE data=? "
            "ORDER BY CASE WHEN hora='' THEN 1 ELSE 0 END, hora", (dia,)):
        por.setdefault(a["user_id"], []).append(
            {"hora": a["hora"], "dur": a["dur"], "titulo": a["titulo"], "status": a["status"]})
    seg, dom = gestao.semana_de(date.fromisoformat(dia))
    sem = {r["user_id"]: r["n"] for r in db.execute(
        "SELECT user_id, COUNT(*) AS n FROM atividades WHERE status='done' AND data BETWEEN ? AND ? GROUP BY user_id",
        (seg.isoformat(), dom.isoformat()))}
    pd, ps, ov = gestao.metas_efetivas(db)
    hoje = date.today().isoformat()
    atrasadas = {}  # em aberto com prazo vencido, ou sem prazo e com data passada (mesma regra da tela)
    for a in db.execute("SELECT user_id, data, prazo, status, fim FROM atividades WHERE status!='done'"):
        late = (prazos.situacao(a["prazo"], a["status"], a["fim"]) == "atrasada") if a["prazo"] else a["data"] < hoje
        if late:
            atrasadas[a["user_id"]] = atrasadas.get(a["user_id"], 0) + 1
    out = []
    for u in db.execute("SELECT id, nome, cargo, foco_ate, foco_txt FROM usuarios ORDER BY nome"):
        it = por.get(u["id"], [])
        md, ms = gestao.efetiva(pd, ps, ov.get(u["id"]))
        out.append({"id": u["id"], "nome": u["nome"], "cargo": u["cargo"], "total": len(it),
                    "todo": sum(i["status"] == "todo" for i in it),
                    "doing": sum(i["status"] == "doing" for i in it),
                    "done": sum(i["status"] == "done" for i in it),
                    "min_done": sum(i["dur"] for i in it if i["status"] == "done"), "itens": it,
                    "meta_dia": md, "meta_sem": ms, "feitas_sem": sem.get(u["id"], 0),
                    "atrasadas": atrasadas.get(u["id"], 0),
                    "foco": u["foco_ate"] if u["foco_ate"] > time.time() else 0, "foco_txt": u["foco_txt"]})
    return jsonify(data=dia, usuarios=out, semana=[seg.isoformat(), dom.isoformat()])


@app.post("/api/usuarios")
@admin_required
def criar_usuario():
    d = request.get_json(silent=True) or {}
    usuario = str(d.get("usuario", "")).strip().lower()
    nome = str(d.get("nome", "")).strip()[:80]
    senha = str(d.get("senha", ""))
    if not re.match(r"^[a-z0-9._-]{3,32}$", usuario):
        return jsonify(erro="Usuário: 3 a 32 caracteres (letras, números, . _ -)."), 400
    if not nome:
        return jsonify(erro="Informe o nome."), 400
    erro = seguranca.valida_senha(senha, usuario, nome)
    if erro:
        return jsonify(erro=erro), 400
    perfil = perfil_param(d)
    db = get_db()
    try:
        with db:
            db.execute("INSERT INTO usuarios(usuario,nome,cargo,senha_hash,admin,perfil,trocar_senha) VALUES(?,?,?,?,?,?,1)",
                       (usuario, nome, str(d.get("cargo", "")).strip()[:80], hash_senha(senha),
                        1 if perfil == "admin" else 0, perfil))
            gestao.log(db, ator(), "usuario", "criou", usuario, nome, "Perfil: " + PERFIL_NOME[perfil])
    except sqlite3.IntegrityError:
        return jsonify(erro="Esse usuário já existe."), 409
    return jsonify(ok=True), 201


@app.put("/api/usuarios/<int:uid>")
@admin_required
def editar_usuario(uid):
    d = request.get_json(silent=True) or {}
    nome = str(d.get("nome", "")).strip()[:80]
    if not nome:
        return jsonify(erro="Informe o nome."), 400
    perfil = perfil_param(d)
    admin = 1 if perfil == "admin" else 0
    cargo = str(d.get("cargo", "")).strip()[:80]
    db = get_db()
    alvo = db.execute("SELECT nome, cargo, admin, perfil, permissoes FROM usuarios WHERE id=?", (uid,)).fetchone()
    try:
        perms = limpa_perms(d.get("perms")) if "perms" in d else (alvo["permissoes"] if alvo else "")
    except ValueError as e:
        return jsonify(erro=str(e)), 400
    if not alvo:
        return jsonify(erro="Usuário não encontrado."), 404
    if alvo["admin"] and not admin and db.execute("SELECT COUNT(*) FROM usuarios WHERE admin=1").fetchone()[0] <= 1:
        return jsonify(erro="Precisa existir ao menos um administrador."), 400
    with db:
        db.execute("UPDATE usuarios SET nome=?, cargo=?, admin=?, perfil=?, permissoes=? WHERE id=?",
                   (nome, cargo, admin, perfil, perms if perfil != "admin" else "", uid))
        mud = []
        if (alvo["permissoes"] or "") != (perms if perfil != "admin" else ""):
            mud.append("permissões: " + (", ".join(PERMS[p] for p in json.loads(perms)) if perms and perfil != "admin" else "padrão do perfil"))
        if alvo["perfil"] != perfil:
            mud.append("perfil: %s → %s" % (PERFIL_NOME.get(alvo["perfil"], alvo["perfil"]), PERFIL_NOME[perfil]))
        if alvo["nome"] != nome:
            mud.append("nome: %s → %s" % (alvo["nome"], nome))
        if alvo["cargo"] != cargo:
            mud.append("cargo: %s → %s" % (alvo["cargo"] or "—", cargo or "—"))
        if mud:
            gestao.log(db, ator(), "usuario", "alterou", uid, nome, "; ".join(mud))
    return jsonify(ok=True)


@app.post("/api/usuarios/<int:uid>/senha")
@admin_required
def redefinir_senha(uid):
    nova = str((request.get_json(silent=True) or {}).get("nova", ""))
    db = get_db()
    alvo = db.execute("SELECT nome, usuario FROM usuarios WHERE id=?", (uid,)).fetchone()
    if not alvo:
        return jsonify(erro="Usuário não encontrado."), 404
    erro = seguranca.valida_senha(nova, alvo["usuario"], alvo["nome"])
    if erro:
        return jsonify(erro=erro), 400
    with db:
        db.execute("UPDATE usuarios SET senha_hash=?, trocar_senha=1 WHERE id=?", (hash_senha(nova), uid))
        # derruba quem estiver conectado com a senha antiga (se for o proprio admin, mantem esta sessao)
        n = seguranca.encerra_sessoes_usuario(db, uid, session.get("sid") if uid == session["uid"] else None)
        gestao.log(db, ator(), "usuario", "alterou", uid, alvo["nome"],
                   "Senha redefinida (provisória); %d sessão(ões) encerrada(s)" % n)
    return jsonify(ok=True, sessoes_encerradas=n)


@app.delete("/api/usuarios/<int:uid>")
@admin_required
def excluir_usuario(uid):
    if uid == session["uid"]:
        return jsonify(erro="Você não pode excluir o próprio usuário."), 400
    db = get_db()
    alvo = db.execute("SELECT nome, usuario FROM usuarios WHERE id=?", (uid,)).fetchone()
    with db:
        anexos.apaga_arquivos(db, ANEXOS_DIR, uid)
        c = db.execute("DELETE FROM usuarios WHERE id=?", (uid,))
        if c.rowcount:
            gestao.log(db, ator(), "usuario", "excluiu", alvo["usuario"], alvo["nome"], "Usuário e atividades removidos")
    return (jsonify(ok=True), 200) if c.rowcount else (jsonify(erro="Usuário não encontrado."), 404)


@app.post("/api/backup")
@admin_required
def backup_agora():
    return jsonify(ok=True, arquivo=fazer_backup(), pasta=BACKUP_DIR)


RE_BKP = re.compile(r"^data-[0-9A-Za-z_\-]+\.db$")


def lista_backups():
    if not os.path.isdir(BACKUP_DIR):
        return []
    out = []
    for f in os.listdir(BACKUP_DIR):
        if RE_BKP.match(f):
            st = os.stat(os.path.join(BACKUP_DIR, f))
            out.append({"arquivo": f, "tamanho": st.st_size,
                        "quando": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M:%S")})
    return sorted(out, key=lambda x: x["quando"], reverse=True)


@app.get("/api/backups")
@admin_required
def listar_backups():
    return jsonify(pasta=BACKUP_DIR, itens=lista_backups())


@app.get("/api/backups/<nome>")
@admin_required
def baixar_backup(nome):
    p = os.path.join(BACKUP_DIR, nome)
    if not RE_BKP.match(nome) or not os.path.isfile(p):
        abort(404)
    return send_file(p, as_attachment=True, download_name=nome)


def restaurar_backup(nome, quem):
    """Valida o backup, guarda copia do estado atual e restaura. Devolve o nome da copia de seguranca."""
    origem = os.path.join(BACKUP_DIR, nome)
    if not RE_BKP.match(nome) or not os.path.isfile(origem):
        raise ValueError("Backup não encontrado.")
    try:
        chk = sqlite3.connect(origem)
        ok = chk.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        admins = chk.execute("SELECT COUNT(*) FROM usuarios WHERE admin=1").fetchone()[0]
        chk.execute("SELECT COUNT(*) FROM atividades").fetchone()
        chk.close()
    except sqlite3.Error:
        raise ValueError("Arquivo de backup inválido ou corrompido.")
    if not ok:
        raise ValueError("O backup está corrompido (falhou na verificação de integridade).")
    if admins < 1:
        raise ValueError("Este backup não tem nenhum administrador; restaurar deixaria o sistema sem acesso.")
    copia = fazer_backup()
    src, dst = sqlite3.connect(origem), connect()
    try:
        for tentativa in range(6):
            try:
                src.backup(dst)
                break
            except sqlite3.OperationalError:
                if tentativa == 5:
                    raise ValueError("O banco está em uso. Tente novamente em instantes.")
                time.sleep(0.5)
    finally:
        src.close()
        dst.close()
    init_db()  # atualiza a estrutura se o backup for de uma versao anterior
    try:
        faltaram = restaura_anexos(DB_PATH)
    except OSError:
        faltaram = -1
    det = "Banco restaurado. Cópia de segurança do estado anterior: " + copia
    if faltaram:
        det += ("; não foi possível restaurar os anexos" if faltaram < 0
                else "; %d anexo(s) não encontrado(s) no backup" % faltaram)
    con = connect()
    gestao.log(con, quem, "backup", "restaurou", "", nome, det)
    # o banco voltou no tempo e trouxe sessoes antigas como "ativas": todos precisam entrar de novo
    con.execute("UPDATE sessoes SET ativa=0")
    con.commit()
    con.close()
    return copia, faltaram


@app.post("/api/backups/restaurar")
@admin_required
def restaurar():
    nome = str((request.get_json(silent=True) or {}).get("arquivo", ""))
    quem = dict(ator())
    dbc = g.pop("db", None)
    if dbc is not None:
        dbc.close()
    try:
        copia, faltaram = restaurar_backup(nome, quem)
    except ValueError as e:
        return jsonify(erro=str(e)), 400
    session.clear()
    aviso = ""
    if faltaram < 0:
        aviso = "Os anexos não puderam ser restaurados (confira a pasta de backups)."
    elif faltaram:
        aviso = "%d anexo(s) não estavam no backup (backup feito antes da versão 3.2)." % faltaram
    return jsonify(ok=True, seguranca=copia, aviso=aviso)


@app.get("/api/acessos")
@admin_required
def listar_acessos():
    rows = get_db().execute("SELECT * FROM acessos ORDER BY id DESC LIMIT 200").fetchall()
    return jsonify([{"quando": r["quando"], "usuario": r["usuario"], "ok": bool(r["ok"]), "ip": r["ip"], "agente": r["agente"]} for r in rows])


@app.get("/api/saude")
@admin_required
def saude():
    db = get_db()
    tam = sum(os.path.getsize(DB_PATH + x) for x in ("", "-wal", "-shm") if os.path.exists(DB_PATH + x))
    try:
        integ = db.execute("PRAGMA quick_check").fetchone()[0]
    except sqlite3.Error as e:
        integ = str(e)
    cont = {t: db.execute("SELECT COUNT(*) FROM %s" % t).fetchone()[0] for t in ("usuarios", "atividades", "historico", "acessos")}
    bk = lista_backups()
    agora = time.time()
    nomes = {r["id"]: r for r in db.execute("SELECT id, nome, perfil FROM usuarios")}
    online = [{"nome": nomes[u]["nome"], "perfil": nomes[u]["perfil"], "ha_s": int(agora - t)}
              for u, t in sorted(ATIVOS.items(), key=lambda x: -x[1]) if u in nomes and agora - t < 300]
    ativos24 = db.execute("SELECT COUNT(DISTINCT user_id) FROM acessos WHERE ok=1 AND quando >= datetime('now','localtime','-1 day')").fetchone()[0]
    try:
        du = shutil.disk_usage(BASE)
        disco = {"livre": du.free, "total": du.total}
    except OSError:
        disco = {"livre": 0, "total": 0}
    return jsonify(
        banco={"tamanho": tam, "integridade": integ}, contagens=cont,
        backups={"pasta": BACKUP_DIR, "total": len(bk), "manter": BACKUP_KEEP, "ultimo": bk[0] if bk else None,
                 "copia": {"pasta": BACKUP_COPIA, **COPIA_STATUS} if BACKUP_COPIA else None},
        online=online, ativos24h=ativos24, disco=disco,
        servidor={"python": sys.version.split()[0], "https": USAR_HTTPS, "sessao_min": SESSAO_MIN, "host": HOST, "porta": PORT,
                  "inicio": datetime.fromtimestamp(INICIO_PROC).strftime("%Y-%m-%d %H:%M"), "uptime_s": int(agora - INICIO_PROC)})


relatorios.register(app, get_db, login_required, pode_equipe)
gestao.register(app, get_db, login_required, equipe_required, pode_equipe, tem_perm)
extras.register(app, get_db, login_required, tem_perm, perm_required, ANEXOS_DIR, ator)
importar.register(app, login_required)
anexos.register(app, get_db, login_required, pode_equipe, ANEXOS_DIR)
seguranca.register(app, get_db, login_required, admin_required, agente_curto, SESSAO_MIN)


def _log_sistema(txt):
    db = get_db()
    with db:
        gestao.log(db, ator(), "sistema", "atualizou", VERSAO, "Sistema", txt)


atualizar.register(app, admin_required, BASE, VERSAO, lambda: fazer_backup(), _log_sistema)


# --------------------------------------------------------------- backup
ANEXOS_BKP = os.path.join(BACKUP_DIR, "anexos")  # espelho dos anexos (cada arquivo copiado uma vez so)
RE_ANEXO = re.compile(r"^[0-9a-f]{24}\.[a-z0-9]{1,5}$")
BACKUP_LOCK = threading.Lock()


def anexos_do_banco(caminho):
    """Nomes dos arquivos de anexo citados num banco (atual ou backup)."""
    try:
        con = sqlite3.connect(caminho)
        try:
            return {r[0] for r in con.execute("SELECT arquivo FROM anexos") if RE_ANEXO.match(r[0] or "")}
        finally:
            con.close()
    except sqlite3.Error:  # backup antigo, sem a tabela de anexos
        return set()


def copia_arquivo(origem, destino):
    tmp = destino + ".tmp"
    shutil.copyfile(origem, tmp)
    os.replace(tmp, destino)


def espelha_anexos(usados):
    """Copia para o espelho os anexos que ainda nao estao la. Devolve (copiados, faltando_na_origem)."""
    os.makedirs(ANEXOS_BKP, exist_ok=True)
    copiados = faltando = 0
    for arq in usados:
        o, d = os.path.join(ANEXOS_DIR, arq), os.path.join(ANEXOS_BKP, arq)
        if not os.path.isfile(o):
            faltando += 1
        elif not os.path.isfile(d) or os.path.getsize(d) != os.path.getsize(o):
            copia_arquivo(o, d)
            copiados += 1
    return copiados, faltando


def poda_espelho():
    """Apaga do espelho os anexos que nenhum backup guardado (nem o banco atual) cita mais."""
    if not os.path.isdir(ANEXOS_BKP):
        return
    usados = anexos_do_banco(DB_PATH)
    for f in os.listdir(BACKUP_DIR):
        if RE_BKP.match(f):
            usados |= anexos_do_banco(os.path.join(BACKUP_DIR, f))
    for f in os.listdir(ANEXOS_BKP):
        if RE_ANEXO.match(f) and f not in usados:
            try:
                os.remove(os.path.join(ANEXOS_BKP, f))
            except OSError:
                pass


def fazer_backup():
    """Copia consistente do banco + anexos para a pasta de backups; mantem so os mais recentes."""
    with BACKUP_LOCK:
        os.makedirs(BACKUP_DIR, exist_ok=True)
        nome = "data-%s.db" % datetime.now().strftime("%Y-%m-%d_%H%M%S")
        destino = os.path.join(BACKUP_DIR, nome)
        src, dst = connect(), sqlite3.connect(destino)
        try:
            src.backup(dst)
        finally:
            dst.close()
            src.close()
        try:
            espelha_anexos(anexos_do_banco(destino))
        except OSError as e:  # o banco ja esta salvo; avisa e segue
            print("  AVISO: falha ao copiar anexos para o backup:", e)
        antigos = sorted(f for f in os.listdir(BACKUP_DIR) if RE_BKP.match(f))
        for f in antigos[:-BACKUP_KEEP] if BACKUP_KEEP > 0 else []:
            try:
                os.remove(os.path.join(BACKUP_DIR, f))
            except OSError:
                pass
        try:
            poda_espelho()
        except OSError:
            pass
        if BACKUP_COPIA:
            copia_externa(destino)
        return nome


def copia_externa(destino):
    """Copia o backup (e os anexos novos) para BACKUP_COPIA. Se falhar, avisa o administrador."""
    quando = datetime.now().strftime("%Y-%m-%d %H:%M")
    try:
        os.makedirs(os.path.join(BACKUP_COPIA, "anexos"), exist_ok=True)
        copia_arquivo(destino, os.path.join(BACKUP_COPIA, os.path.basename(destino)))
        for arq in anexos_do_banco(destino):
            o, d = os.path.join(ANEXOS_DIR, arq), os.path.join(BACKUP_COPIA, "anexos", arq)
            if os.path.isfile(o) and not os.path.isfile(d):
                copia_arquivo(o, d)
        antigos = sorted(f for f in os.listdir(BACKUP_COPIA) if RE_BKP.match(f))
        for f in antigos[:-BACKUP_KEEP] if BACKUP_KEEP > 0 else []:
            try:
                os.remove(os.path.join(BACKUP_COPIA, f))
            except OSError:
                pass
        COPIA_STATUS.update(ok=True, quando=quando, erro="")
    except Exception as e:  # o backup local ja esta salvo
        COPIA_STATUS.update(ok=False, quando=quando, erro=str(e)[:200])
        print("  AVISO: falha ao copiar o backup para", BACKUP_COPIA, "-", e)
        try:
            con = connect()
            with con:
                seguranca.aviso(con, "backup", "Falha ao copiar o backup para %s: %s" % (BACKUP_COPIA, e))
            con.close()
        except Exception:
            pass


def restaura_anexos(caminho_banco):
    """Traz de volta do espelho os anexos que o banco restaurado cita e nao estao na pasta. Devolve quantos faltaram."""
    os.makedirs(ANEXOS_DIR, exist_ok=True)
    faltaram = 0
    for arq in anexos_do_banco(caminho_banco):
        d = os.path.join(ANEXOS_DIR, arq)
        if os.path.isfile(d):
            continue
        o = os.path.join(ANEXOS_BKP, arq)
        if os.path.isfile(o):
            copia_arquivo(o, d)
        else:
            faltaram += 1
    return faltaram


def laco_backup():
    """Faz um backup por dia (confere a cada hora)."""
    while True:
        try:
            hoje = "data-%s" % date.today().isoformat()
            if not (os.path.isdir(BACKUP_DIR) and any(f.startswith(hoje) for f in os.listdir(BACKUP_DIR))):
                print("  Backup automatico criado:", fazer_backup())
        except Exception as e:  # nunca derruba o servidor
            print("  Falha no backup automatico:", e)
        try:
            con = connect()
            gestao.limpar_historico(con)
            con.close()
        except Exception as e:
            print("  Falha ao limpar o historico:", e)
        time.sleep(3600)


# ------------------------------------------------------------- execucao
def testa_bind(host, port):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind((host, port))
        return None
    except OSError as e:
        return e
    finally:
        s.close()


def main():
    init_db()
    host = HOST
    erro = testa_bind(host, PORT)
    if erro is not None:
        if erro.errno in (errno.EADDRNOTAVAIL, 10049):
            print("\n  AVISO: este computador nao tem o IP %s. Usando 0.0.0.0 (todos os enderecos)." % host)
            print("  Rode meuip.py para ver os IPs desta maquina.\n")
            host = "0.0.0.0"
        elif erro.errno in (errno.EADDRINUSE, 10048):
            print("\n  ERRO: a porta %s ja esta em uso. Troque PORT no iniciar.bat.\n" % PORT)
            sys.exit(1)
        else:
            print("\n  ERRO ao abrir %s:%s -> %s\n" % (host, PORT, erro))
            sys.exit(1)

    tls = None
    if USAR_HTTPS:
        try:
            import certificado
            from cheroot.wsgi import Server  # noqa: F401
            cert, chave, novo = certificado.garantir(HOST, CERT_DIR)
            tls = (cert, chave)
            app.config["SESSION_COOKIE_SECURE"] = True
            if novo:
                print("\n  Certificado HTTPS criado em: %s" % CERT_DIR)
                print("  Para tirar o aviso 'Nao seguro', instale o certificado (veja o README).\n")
        except Exception as e:  # sem cryptography/cheroot: segue em HTTP
            print("\n  AVISO: HTTPS indisponivel (%s). Usando HTTP.\n  Rode iniciar.bat para instalar as dependencias.\n" % e)

    esquema = "https" if tls else "http"
    threading.Thread(target=laco_backup, daemon=True).start()
    print("  Suporte - Controle de Atividades")
    if host != "0.0.0.0":
        print("  Acesse:  %s://%s:%s" % (esquema, HOST, PORT))
    else:
        try:
            import certificado
            ips = sorted(certificado.ips_locais())
        except Exception:
            ips = []
        for ip in ips or ["<IP-desta-maquina>"]:
            print("  Acesse:  %s://%s:%s" % (esquema, ip, PORT))
    print("  Backups diarios em: %s (mantem %d)" % (BACKUP_DIR, BACKUP_KEEP))
    print("  Desconecta apos %s min parado." % SESSAO_MIN if SESSAO_MIN > 0 else "  Sessao sem limite de inatividade.")
    print("  (Ctrl+C para parar)\n")
    if tls:
        from cheroot.ssl.builtin import BuiltinSSLAdapter
        from cheroot.wsgi import Server
        srv = Server((host, PORT), app, numthreads=8)
        srv.ssl_adapter = BuiltinSSLAdapter(tls[0], tls[1])
        try:
            srv.start()
        except KeyboardInterrupt:
            srv.stop()
        return
    try:
        from waitress import serve
        serve(app, host=host, port=PORT, threads=8)
    except ImportError:
        app.run(host=host, port=PORT)


if __name__ == "__main__":
    main()
