# -*- coding: utf-8 -*-
"""Seguranca: verificacao em duas etapas (TOTP), bloqueio de conta, avisos ao admin e sessoes abertas."""
import base64
import hashlib
import hmac
import json
import re
import secrets
import struct
import time
from urllib.parse import quote

from flask import jsonify, request, session
from werkzeug.security import check_password_hash

import gestao

MAX_FALHAS = 5
BLOQ_MIN = 15
EMISSOR = "Suporte"
SENHA_MIN = 8

# Senhas e palavras-base faceis de adivinhar (comparadas sem numeros e simbolos).
SENHAS_COMUNS = {"12345678", "123456789", "1234567890", "87654321", "11111111", "00000000", "12341234",
                 "abcd1234", "qwertyui", "asdfghjk", "abc12345"}
PALAVRAS_FRACAS = {"senha", "suporte", "password", "admin", "administrador", "mudar", "trocar", "teste",
                   "qwerty", "abc", "abcd", "usuario", "mudarsenha", "trocarsenha", "senhanova", "novasenha"}


# ---------------------------------------------------------------- senhas
def valida_senha(senha, usuario="", nome=""):
    """Devolve a mensagem de erro, ou None se a senha for aceitavel."""
    s = str(senha or "")
    if len(s) < SENHA_MIN:
        return "A senha precisa ter ao menos %d caracteres." % SENHA_MIN
    b = s.lower()
    letras = re.sub(r"[^a-zà-ÿ]", "", b)
    if b in SENHAS_COMUNS or letras in PALAVRAS_FRACAS or not letras and len(set(b)) <= 3:
        return "Senha muito fácil de adivinhar. Evite palavras como “senha”, “suporte” ou sequências numéricas."
    if len(set(s)) < 4:
        return "A senha tem caracteres repetidos demais."
    u = str(usuario or "").strip().lower()
    if len(u) >= 3 and u in b:
        return "A senha não pode conter o nome de usuário."
    for parte in re.split(r"\s+", str(nome or "").strip().lower()):
        if len(parte) >= 4 and parte in b and len(letras) <= len(parte) + 1:
            return "A senha não pode ser só o seu nome."
    return None


def encerra_sessoes_usuario(db, uid, exceto_sid=None):
    """Derruba as sessoes abertas do usuario (menos a indicada). Devolve quantas foram encerradas."""
    return db.execute("UPDATE sessoes SET ativa=0 WHERE user_id=? AND ativa=1 AND sid<>?",
                      (uid, exceto_sid or "")).rowcount


# ---------------------------------------------------------------- TOTP
def novo_segredo():
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _hotp(segredo, contador):
    chave = base64.b32decode(segredo + "=" * (-len(segredo) % 8))
    h = hmac.new(chave, struct.pack(">Q", contador), hashlib.sha1).digest()
    o = h[-1] & 15
    return "%06d" % ((struct.unpack(">I", h[o:o + 4])[0] & 0x7FFFFFFF) % 1000000)


def totp_confere(segredo, codigo, ultimo=0):
    """Devolve o contador aceito (>0) ou 0. Cada codigo so vale uma vez (ultimo evita repeticao)."""
    codigo = re.sub(r"\D", "", str(codigo or ""))
    if len(codigo) != 6 or not segredo:
        return 0
    t = int(time.time() // 30)
    for c in (t, t - 1, t + 1):
        if c > (ultimo or 0) and hmac.compare_digest(_hotp(segredo, c), codigo):
            return c
    return 0


def uri_otp(segredo, usuario):
    return "otpauth://totp/%s:%s?secret=%s&issuer=%s&period=30&digits=6" % (
        quote(EMISSOR), quote(usuario), segredo, quote(EMISSOR))


def _h(cod):
    return hashlib.sha256(cod.strip().lower().replace(" ", "").encode()).hexdigest()


def novos_codigos(qtd=8):
    cods = ["%s-%s" % (secrets.token_hex(3), secrets.token_hex(3)) for _ in range(qtd)]
    return cods, [_h(c) for c in cods]


def usa_codigo_recuperacao(db, r, codigo):
    try:
        lista = json.loads(r["totp_recup"] or "[]")
    except ValueError:
        lista = []
    h = _h(str(codigo or ""))
    if h in lista:
        lista.remove(h)
        db.execute("UPDATE usuarios SET totp_recup=? WHERE id=?", (json.dumps(lista), r["id"]))
        db.commit()
        return True
    return False


def confere_segundo_fator(db, r, codigo):
    """Aceita o codigo do aplicativo ou um codigo de recuperacao."""
    c = totp_confere(r["totp_segredo"], codigo, r["totp_ultimo"])
    if c:
        db.execute("UPDATE usuarios SET totp_ultimo=? WHERE id=?", (c, r["id"]))
        db.commit()
        return True
    return usa_codigo_recuperacao(db, r, codigo)


# ------------------------------------------------------ bloqueio e avisos
def aviso(db, tipo, texto):
    db.execute("INSERT INTO avisos(tipo,texto) VALUES(?,?)", (tipo, texto[:300]))
    db.execute("DELETE FROM avisos WHERE id NOT IN (SELECT id FROM avisos ORDER BY id DESC LIMIT 200)")


def bloqueio_restante(r):
    return max(0, int((r["bloq_ate"] or 0) - time.time()))


def registra_falha(db, r, ip):
    """Conta a falha; no limite bloqueia a conta e avisa o administrador. Devolve segundos de bloqueio (0 = nao bloqueou)."""
    n = (r["falhas"] or 0) + 1
    if n >= MAX_FALHAS:
        db.execute("UPDATE usuarios SET falhas=0, bloq_ate=? WHERE id=?", (int(time.time()) + BLOQ_MIN * 60, r["id"]))
        aviso(db, "bloqueio", "Conta “%s” bloqueada por %d minutos após %d tentativas erradas (IP %s)." % (
            r["usuario"], BLOQ_MIN, MAX_FALHAS, ip))
        db.commit()
        return BLOQ_MIN * 60
    db.execute("UPDATE usuarios SET falhas=? WHERE id=?", (n, r["id"]))
    db.commit()
    return 0


def zera_falhas(db, r):
    if r["falhas"] or r["bloq_ate"]:
        db.execute("UPDATE usuarios SET falhas=0, bloq_ate=0 WHERE id=?", (r["id"],))
        db.commit()


# --------------------------------------------------------------- sessoes
def nova_sessao(db, uid, ip, agente):
    sid = secrets.token_urlsafe(24)
    agora = int(time.time())
    db.execute("INSERT INTO sessoes(sid,user_id,criado,ultimo,ip,agente) VALUES(?,?,?,?,?,?)", (sid, uid, agora, agora, ip, agente))
    db.execute("DELETE FROM sessoes WHERE ultimo < ?", (agora - 30 * 86400,))
    db.commit()
    session["sid"] = sid


def confere_sessao(db, uid, ip, agente, toca=True):
    """True se a sessao atual ainda esta valida (nao foi encerrada por outro lugar)."""
    sid = session.get("sid")
    agora = int(time.time())
    if not sid:  # cookie anterior a esta versao: registra agora
        nova_sessao(db, uid, ip, agente)
        return True
    r = db.execute("SELECT user_id, ativa, ultimo FROM sessoes WHERE sid=?", (sid,)).fetchone()
    if not r or r["user_id"] != uid or not r["ativa"]:
        return False
    if toca and agora - r["ultimo"] >= 30:
        db.execute("UPDATE sessoes SET ultimo=? WHERE sid=?", (agora, sid))
        db.commit()
    return True


def encerra_atual(db):
    sid = session.get("sid")
    if sid:
        db.execute("UPDATE sessoes SET ativa=0 WHERE sid=?", (sid,))
        db.commit()


def register(app, get_db, login_required, admin_required, agente_curto, sessao_min):
    def ator(db):
        return db.execute("SELECT id, nome FROM usuarios WHERE id=?", (session["uid"],)).fetchone()

    def alvo(db, uid):
        return db.execute("SELECT id, nome, usuario FROM usuarios WHERE id=?", (uid,)).fetchone()

    def limite():
        return int(time.time()) - (sessao_min * 60 if sessao_min > 0 else 12 * 3600)

    def sess_json(r, atual_sid):
        return {"id": r["id"], "criado": time.strftime("%Y-%m-%d %H:%M", time.localtime(r["criado"])),
                "ultimo": time.strftime("%Y-%m-%d %H:%M", time.localtime(r["ultimo"])), "ha_s": int(time.time() - r["ultimo"]),
                "ip": r["ip"], "agente": r["agente"], "atual": r["sid"] == atual_sid}

    @app.get("/api/sessoes")
    @login_required
    def listar_sessoes():
        db = get_db()
        rows = db.execute("SELECT * FROM sessoes WHERE user_id=? AND ativa=1 AND ultimo>=? ORDER BY ultimo DESC",
                          (session["uid"], limite())).fetchall()
        out = {"minhas": [sess_json(r, session.get("sid")) for r in rows]}
        eu = db.execute("SELECT admin FROM usuarios WHERE id=?", (session["uid"],)).fetchone()
        if request.args.get("todas") == "1" and eu and eu["admin"]:
            todas = db.execute("SELECT s.*, u.nome, u.usuario FROM sessoes s JOIN usuarios u ON u.id=s.user_id "
                               "WHERE s.ativa=1 AND s.ultimo>=? ORDER BY s.ultimo DESC", (limite(),)).fetchall()
            out["todas"] = [dict(sess_json(r, session.get("sid")), nome=r["nome"], usuario=r["usuario"]) for r in todas]
        return jsonify(out)

    @app.delete("/api/sessoes/<int:sid>")
    @login_required
    def encerrar_sessao(sid):
        db = get_db()
        r = db.execute("SELECT * FROM sessoes WHERE id=?", (sid,)).fetchone()
        eu = db.execute("SELECT admin FROM usuarios WHERE id=?", (session["uid"],)).fetchone()
        if not r or (r["user_id"] != session["uid"] and not (eu and eu["admin"])):
            return jsonify(erro="Sessão não encontrada."), 404
        db.execute("UPDATE sessoes SET ativa=0 WHERE id=?", (sid,))
        if r["user_id"] != session["uid"]:
            u = alvo(db, r["user_id"])
            gestao.log(db, ator(db), "usuario", "alterou", r["user_id"], u["nome"] if u else "?",
                       "Sessão encerrada pelo administrador (%s, IP %s)" % (r["agente"], r["ip"]))
        db.commit()
        propria = r["sid"] == session.get("sid")
        if propria:
            session.clear()
        return jsonify(ok=True, propria=propria)

    @app.post("/api/sessoes/encerrar-outras")
    @login_required
    def encerrar_outras():
        db = get_db()
        cur = db.execute("UPDATE sessoes SET ativa=0 WHERE user_id=? AND ativa=1 AND sid<>?", (session["uid"], session.get("sid", "")))
        db.commit()
        return jsonify(ok=True, encerradas=cur.rowcount)

    # ---- painel de seguranca (admin)
    @app.get("/api/seguranca")
    @admin_required
    def painel_seguranca():
        db = get_db()
        agora = int(time.time())
        bloq = [{"id": r["id"], "nome": r["nome"], "usuario": r["usuario"], "ate_s": int(r["bloq_ate"] - agora)}
                for r in db.execute("SELECT id,nome,usuario,bloq_ate FROM usuarios WHERE bloq_ate>?", (agora,))]
        avisos = [{"id": r["id"], "quando": r["quando"], "tipo": r["tipo"], "texto": r["texto"], "lido": bool(r["lido"])}
                  for r in db.execute("SELECT * FROM avisos ORDER BY id DESC LIMIT 30")]
        sem2fa = [{"id": r["id"], "nome": r["nome"]} for r in
                  db.execute("SELECT id,nome FROM usuarios WHERE admin=1 AND totp_ativo=0 ORDER BY nome")]
        return jsonify(bloqueadas=bloq, avisos=avisos, admins_sem_2fa=sem2fa,
                       nao_lidos=sum(1 for a in avisos if not a["lido"]))

    @app.post("/api/seguranca/avisos/lidos")
    @admin_required
    def avisos_lidos():
        db = get_db()
        db.execute("UPDATE avisos SET lido=1")
        db.commit()
        return jsonify(ok=True)

    @app.post("/api/usuarios/<int:uid>/desbloquear")
    @admin_required
    def desbloquear(uid):
        db = get_db()
        u = alvo(db, uid)
        if not u:
            return jsonify(erro="Usuário não encontrado."), 404
        db.execute("UPDATE usuarios SET falhas=0, bloq_ate=0 WHERE id=?", (uid,))
        gestao.log(db, ator(db), "usuario", "alterou", uid, u["nome"], "Conta desbloqueada pelo administrador")
        db.commit()
        return jsonify(ok=True)

    @app.post("/api/usuarios/<int:uid>/2fa/reset")
    @admin_required
    def reset_2fa(uid):
        db = get_db()
        u = alvo(db, uid)
        if not u:
            return jsonify(erro="Usuário não encontrado."), 404
        db.execute("UPDATE usuarios SET totp_segredo='', totp_ativo=0, totp_recup='[]', totp_ultimo=0 WHERE id=?", (uid,))
        # quem perdeu o celular pode te-lo perdido com o sistema aberto: derruba as sessoes (menos a do proprio admin)
        n = encerra_sessoes_usuario(db, uid, session.get("sid") if uid == session["uid"] else None)
        gestao.log(db, ator(db), "usuario", "alterou", uid, u["nome"],
                   "Verificação em duas etapas resetada pelo administrador; %d sessão(ões) encerrada(s)" % n)
        db.commit()
        return jsonify(ok=True)

    # ---- 2FA do proprio usuario
    def senha_ok(db, d):
        r = db.execute("SELECT * FROM usuarios WHERE id=?", (session["uid"],)).fetchone()
        return r if r and check_password_hash(r["senha_hash"], str(d.get("senha", ""))) else None

    @app.post("/api/2fa/iniciar")
    @login_required
    def iniciar_2fa():
        db = get_db()
        r = senha_ok(db, request.get_json(silent=True) or {})
        if not r:
            return jsonify(erro="Senha incorreta."), 400
        if r["totp_ativo"]:
            return jsonify(erro="A verificação em duas etapas já está ativa."), 400
        seg = novo_segredo()
        db.execute("UPDATE usuarios SET totp_segredo=?, totp_ultimo=0 WHERE id=?", (seg, r["id"]))
        db.commit()
        return jsonify(segredo=seg, uri=uri_otp(seg, r["usuario"]))

    @app.post("/api/2fa/ativar")
    @login_required
    def ativar_2fa():
        db = get_db()
        r = db.execute("SELECT * FROM usuarios WHERE id=?", (session["uid"],)).fetchone()
        d = request.get_json(silent=True) or {}
        if r["totp_ativo"] or not r["totp_segredo"]:
            return jsonify(erro="Comece a configuração novamente."), 400
        c = totp_confere(r["totp_segredo"], d.get("codigo"), 0)
        if not c:
            return jsonify(erro="Código incorreto. Confira o horário do celular e tente de novo."), 400
        cods, hs = novos_codigos()
        db.execute("UPDATE usuarios SET totp_ativo=1, totp_ultimo=?, totp_recup=? WHERE id=?", (c, json.dumps(hs), r["id"]))
        db.commit()
        return jsonify(ok=True, codigos=cods)

    @app.post("/api/2fa/desativar")
    @login_required
    def desativar_2fa():
        db = get_db()
        d = request.get_json(silent=True) or {}
        r = senha_ok(db, d)
        if not r:
            return jsonify(erro="Senha incorreta."), 400
        if r["totp_ativo"] and not confere_segundo_fator(db, r, d.get("codigo")):
            return jsonify(erro="Código incorreto."), 400
        db.execute("UPDATE usuarios SET totp_segredo='', totp_ativo=0, totp_recup='[]', totp_ultimo=0 WHERE id=?", (r["id"],))
        db.commit()
        return jsonify(ok=True)
