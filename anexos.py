# -*- coding: utf-8 -*-
"""Anexos das atividades (prints, PDFs, planilhas)."""
import os
import re
import secrets
from urllib.parse import unquote

from flask import abort, jsonify, request, send_file, session

MAX_BYTES = 10 * 1024 * 1024
MAX_POR_ATIV = 20
# extensao -> (tipo MIME, assinatura inicial ou None, mostra no navegador)
TIPOS = {
    "png": ("image/png", b"\x89PNG", True), "jpg": ("image/jpeg", b"\xff\xd8\xff", True), "jpeg": ("image/jpeg", b"\xff\xd8\xff", True),
    "gif": ("image/gif", b"GIF8", True), "webp": ("image/webp", b"RIFF", True), "bmp": ("image/bmp", b"BM", True),
    "pdf": ("application/pdf", b"%PDF", True),
    "xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", b"PK", False),
    "docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", b"PK", False),
    "pptx": ("application/vnd.openxmlformats-officedocument.presentationml.presentation", b"PK", False),
    "xls": ("application/vnd.ms-excel", b"\xd0\xcf\x11\xe0", False), "doc": ("application/msword", b"\xd0\xcf\x11\xe0", False),
    "csv": ("text/csv", None, False), "txt": ("text/plain", None, False), "log": ("text/plain", None, False),
}


def nome_seguro(n):
    n = os.path.basename(unquote(n or "").replace("\\", "/")).strip()
    n = re.sub(r"[\x00-\x1f<>:\"|?*]", "_", n)[:120]
    return n or "arquivo"


def apaga_arquivos(db, pasta, user_id, ids=None):
    """Remove anexos (linhas e arquivos) de atividades apagadas. ids=None apaga todos do usuario."""
    if ids is None:
        rows = db.execute("SELECT id, arquivo FROM anexos WHERE user_id=?", (user_id,)).fetchall()
    else:
        ids = list(ids)
        rows = []
        for i in range(0, len(ids), 500):
            lote = ids[i:i + 500]
            rows += db.execute("SELECT id, arquivo FROM anexos WHERE user_id=? AND atividade_id IN (%s)" % ",".join("?" * len(lote)),
                               [user_id] + lote).fetchall()
    for r in rows:
        try:
            os.remove(os.path.join(pasta, r["arquivo"]))
        except OSError:
            pass
        db.execute("DELETE FROM anexos WHERE id=?", (r["id"],))


def register(app, get_db, login_required, pode_equipe, pasta):
    def lista(db, uid, aid):
        return [{"id": r["id"], "nome": r["nome"], "tipo": r["tipo"], "tam": r["tamanho"], "quando": r["criado"],
                 "img": r["tipo"].startswith("image/")}
                for r in db.execute("SELECT * FROM anexos WHERE user_id=? AND atividade_id=? ORDER BY id", (uid, aid))]

    @app.get("/api/atividades/<aid>/anexos")
    @login_required
    def listar_anexos(aid):
        return jsonify(lista(get_db(), session["uid"], aid))

    @app.post("/api/atividades/<aid>/anexos")
    @login_required
    def enviar_anexo(aid):
        db = get_db()
        if not db.execute("SELECT 1 FROM atividades WHERE user_id=? AND id=?", (session["uid"], aid)).fetchone():
            return jsonify(erro="Salve a atividade antes de anexar."), 404
        if (request.content_length or 0) > MAX_BYTES:
            return jsonify(erro="Arquivo grande demais (máximo 10 MB)."), 413
        nome = nome_seguro(request.headers.get("X-Nome"))
        ext = nome.rsplit(".", 1)[-1].lower() if "." in nome else ""
        if ext not in TIPOS:
            return jsonify(erro="Tipo de arquivo não permitido. Use imagem, PDF, Word, Excel, PowerPoint, CSV ou TXT."), 400
        dados = request.get_data(cache=False)
        if not dados:
            return jsonify(erro="Arquivo vazio."), 400
        if len(dados) > MAX_BYTES:
            return jsonify(erro="Arquivo grande demais (máximo 10 MB)."), 413
        mime, sig, _ = TIPOS[ext]
        if sig and not dados.startswith(sig):
            return jsonify(erro="O conteúdo não corresponde ao tipo .%s." % ext), 400
        if db.execute("SELECT COUNT(*) FROM anexos WHERE user_id=? AND atividade_id=?", (session["uid"], aid)).fetchone()[0] >= MAX_POR_ATIV:
            return jsonify(erro="Limite de %d anexos por atividade." % MAX_POR_ATIV), 400
        os.makedirs(pasta, exist_ok=True)
        arq = "%s.%s" % (secrets.token_hex(12), ext)
        with open(os.path.join(pasta, arq), "wb") as f:
            f.write(dados)
        db.execute("INSERT INTO anexos(user_id,atividade_id,nome,tipo,tamanho,arquivo) VALUES(?,?,?,?,?,?)",
                   (session["uid"], aid, nome, mime, len(dados), arq))
        db.commit()
        return jsonify(ok=True, anexos=lista(db, session["uid"], aid))

    @app.get("/api/anexos/<int:xid>")
    @login_required
    def baixar_anexo(xid):
        r = get_db().execute("SELECT * FROM anexos WHERE id=?", (xid,)).fetchone()
        if not r or (r["user_id"] != session["uid"] and not pode_equipe()):
            abort(404)
        p = os.path.join(pasta, r["arquivo"])
        if not os.path.isfile(p):
            abort(404)
        ext = r["arquivo"].rsplit(".", 1)[-1]
        inline = TIPOS.get(ext, (0, 0, False))[2] and request.args.get("baixar") != "1"
        resp = send_file(p, mimetype=r["tipo"], as_attachment=not inline, download_name=r["nome"])
        resp.headers["Content-Security-Policy"] = "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'"
        resp.headers["Cache-Control"] = "private, no-store"
        return resp

    @app.delete("/api/anexos/<int:xid>")
    @login_required
    def apagar_anexo(xid):
        db = get_db()
        r = db.execute("SELECT * FROM anexos WHERE id=? AND user_id=?", (xid, session["uid"])).fetchone()
        if not r:
            return jsonify(erro="Anexo não encontrado."), 404
        try:
            os.remove(os.path.join(pasta, r["arquivo"]))
        except OSError:
            pass
        db.execute("DELETE FROM anexos WHERE id=?", (xid,))
        db.commit()
        return jsonify(ok=True, anexos=lista(db, session["uid"], r["atividade_id"]))
