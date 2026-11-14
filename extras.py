# -*- coding: utf-8 -*-
"""Recursos da versao 3.5: lixeira (30 dias), checklist rapido do dia, "nao perturbe" (foco),
comparacao mes a mes / ano a ano e auditoria de tempo."""
import json
import secrets
import time
from datetime import date, datetime

from flask import jsonify, request, session

import anexos

LIXEIRA_DIAS = 30

SCHEMA = """
CREATE TABLE IF NOT EXISTS lixeira (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    ativ_id   TEXT NOT NULL,
    titulo    TEXT NOT NULL DEFAULT '',
    data      TEXT NOT NULL DEFAULT '',
    dados     TEXT NOT NULL,
    excluida  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_lixeira_user ON lixeira(user_id, excluida);
CREATE TABLE IF NOT EXISTS checklist (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    texto    TEXT NOT NULL,
    feito    INTEGER NOT NULL DEFAULT 0,
    criado   TEXT NOT NULL DEFAULT (date('now','localtime')),
    feito_em TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_check_user ON checklist(user_id);
"""


def init_db(con):
    con.executescript(SCHEMA)
    ucols = [r[1] for r in con.execute("PRAGMA table_info(usuarios)")]
    for nome, defn in (("foco_ate", "INTEGER NOT NULL DEFAULT 0"), ("foco_txt", "TEXT NOT NULL DEFAULT ''")):
        if nome not in ucols:
            con.execute("ALTER TABLE usuarios ADD COLUMN %s %s" % (nome, defn))


# ------------------------------------------------------------------ lixeira
def para_lixeira(db, uid, linhas):
    """linhas: dicts completos das atividades que estao sendo excluidas (os anexos ficam guardados)."""
    agora = int(time.time())
    db.executemany("INSERT INTO lixeira(user_id, ativ_id, titulo, data, dados, excluida) VALUES(?,?,?,?,?,?)",
                   [(uid, r["id"], r["titulo"], r["data"], json.dumps(dict(r), ensure_ascii=False), agora) for r in linhas])


def tira_da_lixeira(db, uid, ids):
    for i in range(0, len(ids), 500):
        lote = ids[i:i + 500]
        db.execute("DELETE FROM lixeira WHERE user_id=? AND ativ_id IN (%s)" % ",".join("?" * len(lote)), [uid] + lote)


def limpa_lixeira(db, pasta, uid=None, ids=None):
    """Apaga de vez: vencidas (padrao) ou as escolhidas. Os anexos so saem se a atividade nao existe mais."""
    if ids is not None:
        rows = db.execute("SELECT id, user_id, ativ_id FROM lixeira WHERE user_id=? AND id IN (%s)" % ",".join("?" * len(ids)),
                          [uid] + list(ids)).fetchall() if ids else []
    else:
        limite = int(time.time()) - LIXEIRA_DIAS * 86400
        rows = db.execute("SELECT id, user_id, ativ_id FROM lixeira WHERE excluida<?", (limite,)).fetchall()
    for r in rows:
        db.execute("DELETE FROM lixeira WHERE id=?", (r["id"],))
        vivo = db.execute("SELECT 1 FROM atividades WHERE user_id=? AND id=?", (r["user_id"], r["ativ_id"])).fetchone()
        outra = db.execute("SELECT 1 FROM lixeira WHERE user_id=? AND ativ_id=?", (r["user_id"], r["ativ_id"])).fetchone()
        if not vivo and not outra:
            anexos.apaga_arquivos(db, pasta, r["user_id"], [r["ativ_id"]])
    return len(rows)


_ultima_limpeza = [0]


def register(app, get_db, login_required, tem_perm, perm_required, pasta_anexos, ator):
    import gestao

    @app.before_request
    def _limpeza_diaria():
        if time.time() - _ultima_limpeza[0] > 3600:
            _ultima_limpeza[0] = time.time()
            try:
                db = get_db()
                with db:
                    limpa_lixeira(db, pasta_anexos)
            except Exception:
                pass

    @app.get("/api/lixeira")
    @login_required
    def lixeira_lista():
        db = get_db()
        rows = db.execute("SELECT id, ativ_id, titulo, data, excluida FROM lixeira WHERE user_id=? ORDER BY excluida DESC LIMIT 500",
                          (session["uid"],)).fetchall()
        agora = int(time.time())
        return jsonify(dias=LIXEIRA_DIAS, itens=[{
            "id": r["id"], "titulo": r["titulo"], "data": r["data"],
            "excluida": datetime.fromtimestamp(r["excluida"]).strftime("%Y-%m-%d %H:%M"),
            "restam": max(0, LIXEIRA_DIAS - (agora - r["excluida"]) // 86400)} for r in rows])

    @app.post("/api/lixeira/restaurar")
    @login_required
    def lixeira_restaurar():
        d = request.get_json(silent=True) or {}
        ids = [int(i) for i in (d.get("ids") or []) if str(i).isdigit()][:500]
        db, uid, voltaram = get_db(), session["uid"], []
        cols = [r[1] for r in db.execute("PRAGMA table_info(atividades)")]
        with db:
            for lid in ids:
                r = db.execute("SELECT * FROM lixeira WHERE id=? AND user_id=?", (lid, uid)).fetchone()
                if not r:
                    continue
                a = json.loads(r["dados"])
                velho = a["id"]
                while db.execute("SELECT 1 FROM atividades WHERE user_id=? AND id=?", (uid, a["id"])).fetchone():
                    a["id"] = secrets.token_hex(6)
                a["user_id"], a["rev"] = uid, int(a.get("rev") or 1) + 1
                campos = [c for c in cols if c in a]
                db.execute("INSERT INTO atividades(%s) VALUES(%s)" % (",".join(campos), ",".join("?" * len(campos))),
                           [a[c] for c in campos])
                if a["id"] != velho:
                    db.execute("UPDATE anexos SET atividade_id=? WHERE user_id=? AND atividade_id=?", (a["id"], uid, velho))
                db.execute("DELETE FROM lixeira WHERE id=?", (lid,))
                gestao.log(db, ator(), "atividade", "restaurou", a["id"], a.get("titulo", ""), "Da lixeira")
                voltaram.append(a["id"])
        return jsonify(ok=True, restauradas=voltaram)

    @app.post("/api/lixeira/apagar")
    @login_required
    def lixeira_apagar():
        d = request.get_json(silent=True) or {}
        db, uid = get_db(), session["uid"]
        if d.get("tudo"):
            ids = [r[0] for r in db.execute("SELECT id FROM lixeira WHERE user_id=?", (uid,))]
        else:
            ids = [int(i) for i in (d.get("ids") or []) if str(i).isdigit()][:500]
        with db:
            n = limpa_lixeira(db, pasta_anexos, uid, ids)
        return jsonify(ok=True, apagadas=n)

    # -------------------------------------------------------------- checklist rapido
    def check_lista(db, uid):
        hoje = date.today().isoformat()
        # pendentes ficam ate serem feitas; as feitas aparecem so no dia em que foram marcadas
        rows = db.execute("SELECT * FROM checklist WHERE user_id=? AND (feito=0 OR feito_em=?) ORDER BY feito, id",
                          (uid, hoje)).fetchall()
        return [{"id": r["id"], "texto": r["texto"], "feito": bool(r["feito"]), "criado": r["criado"]} for r in rows]

    @app.get("/api/checklist")
    @login_required
    def check_get():
        return jsonify(check_lista(get_db(), session["uid"]))

    @app.post("/api/checklist")
    @login_required
    def check_add():
        t = str((request.get_json(silent=True) or {}).get("texto", "")).strip()[:200]
        if not t:
            return jsonify(erro="Escreva o item."), 400
        db = get_db()
        if db.execute("SELECT COUNT(*) FROM checklist WHERE user_id=? AND feito=0", (session["uid"],)).fetchone()[0] >= 100:
            return jsonify(erro="Limite de 100 itens em aberto."), 400
        with db:
            db.execute("INSERT INTO checklist(user_id, texto) VALUES(?,?)", (session["uid"], t))
        return jsonify(check_lista(db, session["uid"]))

    @app.patch("/api/checklist/<int:cid>")
    @login_required
    def check_mark(cid):
        d = request.get_json(silent=True) or {}
        db = get_db()
        with db:
            if "feito" in d:
                f = 1 if d.get("feito") else 0
                db.execute("UPDATE checklist SET feito=?, feito_em=? WHERE id=? AND user_id=?",
                           (f, date.today().isoformat() if f else "", cid, session["uid"]))
            if "texto" in d and str(d["texto"]).strip():
                db.execute("UPDATE checklist SET texto=? WHERE id=? AND user_id=?", (str(d["texto"]).strip()[:200], cid, session["uid"]))
        return jsonify(check_lista(db, session["uid"]))

    @app.delete("/api/checklist/<int:cid>")
    @login_required
    def check_del(cid):
        db = get_db()
        with db:
            db.execute("DELETE FROM checklist WHERE id=? AND user_id=?", (cid, session["uid"]))
        return jsonify(check_lista(db, session["uid"]))

    # -------------------------------------------------------------- nao perturbe
    @app.post("/api/foco")
    @login_required
    def foco_liga():
        d = request.get_json(silent=True) or {}
        try:
            m = max(5, min(480, int(d.get("min", 60))))
        except (TypeError, ValueError):
            return jsonify(erro="Duração inválida."), 400
        ate = int(time.time()) + m * 60
        db = get_db()
        with db:
            db.execute("UPDATE usuarios SET foco_ate=?, foco_txt=? WHERE id=?", (ate, str(d.get("txt", "")).strip()[:80], session["uid"]))
        return jsonify(ok=True, ate=ate)

    @app.delete("/api/foco")
    @login_required
    def foco_desliga():
        db = get_db()
        with db:
            db.execute("UPDATE usuarios SET foco_ate=0, foco_txt='' WHERE id=?", (session["uid"],))
        return jsonify(ok=True)

    # -------------------------------------------------------------- mes a mes / ano a ano
    @app.get("/api/graficos/meses")
    @login_required
    def graf_meses():
        escopo = request.args.get("escopo", "me")
        if escopo == "equipe" and not tem_perm("ver_equipe"):
            return jsonify(erro="Acesso restrito."), 403
        hoje = date.today()
        ini = date(hoje.year - 1, 1, 1)  # ano passado inteiro + ano atual
        where, args = ("", []) if escopo == "equipe" else (" AND user_id=?", [session["uid"]])
        rows = get_db().execute(
            "SELECT substr(data,1,7) AS m, COUNT(*) AS total, SUM(status='done') AS feitas, "
            "SUM(CASE WHEN status='done' THEN dur ELSE 0 END) AS min_prev, "
            "SUM(CASE WHEN status='done' THEN gasto ELSE 0 END) AS seg_real "
            "FROM atividades WHERE data>=? AND data<=?" + where + " GROUP BY m",
            [ini.isoformat(), hoje.isoformat()] + args).fetchall()
        por = {r["m"]: r for r in rows}
        meses = []
        y, mo = ini.year, ini.month
        while (y, mo) <= (hoje.year, hoje.month):
            k = "%04d-%02d" % (y, mo)
            r = por.get(k)
            meses.append({"mes": k, "total": r["total"] if r else 0, "feitas": (r["feitas"] or 0) if r else 0,
                          "min_prev": (r["min_prev"] or 0) if r else 0, "min_real": round(((r["seg_real"] or 0) if r else 0) / 60)})
            mo += 1
            if mo > 12:
                y, mo = y + 1, 1
        return jsonify(meses=meses, hoje=hoje.isoformat())
