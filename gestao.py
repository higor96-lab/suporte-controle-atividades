# -*- coding: utf-8 -*-
"""Gestao: historico de alteracoes, metas e graficos."""
import os
from datetime import date, timedelta

from flask import jsonify, request, session

import prazos

CATS = {"TRE": "Treinamento", "IMP": "Importação", "SUP": "Suporte", "REU": "Reunião",
        "DEV": "Desenvolvimento", "DOC": "Documentação"}
ST = {"todo": "Pendente", "doing": "Em andamento", "done": "Concluída"}
PRIO = {"alta": "Alta", "media": "Média", "baixa": "Baixa"}
HISTORICO_DIAS = int(os.environ.get("HISTORICO_DIAS", "365"))  # quanto tempo guardar o historico
CAMPOS = [("data", "data"), ("hora", "hora"), ("dur", "duração"), ("titulo", "título"), ("descricao", "descrição"),
          ("cat", "tipo"), ("quem", "com quem"), ("prio", "prioridade"), ("status", "situação")]


def br(iso):
    try:
        y, m, d = str(iso).split("-")
        return "%s/%s/%s" % (d, m, y)
    except ValueError:
        return str(iso)


# ------------------------------------------------------------ historico
def log(db, ator, entidade, acao, ref="", titulo="", detalhe=""):
    db.execute(
        "INSERT INTO historico(ator_id, ator_nome, entidade, acao, ref, titulo, detalhe) VALUES(?,?,?,?,?,?,?)",
        (ator["id"], ator["nome"], entidade, acao, str(ref)[:60], str(titulo)[:200], str(detalhe)[:500]))


def _v(campo, v):
    if campo == "status":
        return ST.get(v, v)
    if campo == "prio":
        return PRIO.get(v, v)
    if campo == "cat":
        return CATS.get(v, v)
    if campo == "data":
        return br(v)
    if campo == "dur":
        return "%s min" % v
    return v or "—"


def diff_atividades(db, ator, antigas, novas):
    """antigas/novas: dict id -> dict com os campos da atividade."""
    criadas = [n for i, n in novas.items() if i not in antigas]
    excluidas = [o for i, o in antigas.items() if i not in novas]
    if len(criadas) > 30:
        log(db, ator, "atividade", "criou", "", "%d atividades" % len(criadas), "Criação em lote (ex.: importação)")
    else:
        for n in criadas:
            log(db, ator, "atividade", "criou", n["id"], n["titulo"],
                br(n["data"]) + ((" " + n["hora"]) if n["hora"] else ""))
    if len(excluidas) > 30:
        log(db, ator, "atividade", "excluiu", "", "%d atividades" % len(excluidas), "Exclusão em lote")
    else:
        for o in excluidas:
            log(db, ator, "atividade", "excluiu", o["id"], o["titulo"], "Data: " + br(o["data"]))
    for i, n in novas.items():
        o = antigas.get(i)
        if not o:
            continue
        mud = []
        for c, rot in CAMPOS:
            if o[c] != n[c]:
                mud.append("descrição alterada" if c == "descricao" else "%s: %s → %s" % (rot, _v(c, o[c]), _v(c, n[c])))
        if mud:
            log(db, ator, "atividade", "alterou", i, n["titulo"], "; ".join(mud))


def limpar_historico(db):
    db.execute("DELETE FROM historico WHERE quando < datetime('now','localtime', ?)", ("-%d days" % HISTORICO_DIAS,))
    db.commit()


# ---------------------------------------------------------------- metas
def metas_efetivas(db):
    """Retorna (padrao_diaria, padrao_semanal, {user_id: (diaria|None, semanal|None)})."""
    ov, pd, ps = {}, 0, 0
    for r in db.execute("SELECT user_id, diaria, semanal FROM metas"):
        if r["user_id"] == 0:
            pd, ps = r["diaria"] or 0, r["semanal"] or 0
        else:
            ov[r["user_id"]] = (r["diaria"], r["semanal"])
    return pd, ps, ov


def efetiva(pd, ps, ov):
    d, s = (ov or (None, None))
    return (pd if d is None else d), (ps if s is None else s)


def semana_de(dia):
    seg = dia - timedelta(days=dia.weekday())
    return seg, seg + timedelta(days=6)


def indicadores(rows):
    """Numeros-resumo de um conjunto de atividades (usado no periodo atual e no anterior)."""
    feitas = [r for r in rows if r["status"] == "done"]
    sits = [prazos.situacao(r["prazo"], r["status"], r["fim"]) for r in rows]
    cum, fora, atr = sits.count("cumprido"), sits.count("fora"), sits.count("atrasada")
    reais = [(r["gasto"] or 0) / 60 for r in feitas if r["gasto"]]
    return {"total": len(rows), "concluidas": len(feitas),
            "pct_conclusao": round(100 * len(feitas) / len(rows)) if rows else None,
            "min": sum(r["dur"] for r in feitas), "real": round(sum(reais)),
            "pct_prazo": round(100 * cum / (cum + fora + atr)) if (cum + fora + atr) else None,
            "media_real": round(sum(reais) / len(reais)) if reais else None}


def _meta_num(v):
    if v in (None, ""):
        return None
    try:
        n = int(v)
    except (TypeError, ValueError):
        raise ValueError("Meta inválida.")
    if n < 0 or n > 999:
        raise ValueError("A meta deve estar entre 0 e 999.")
    return n


def register(app, get_db, login_required, equipe_required, pode_equipe, tem_perm=None):
    def eu():
        return get_db().execute("SELECT id, nome, perfil FROM usuarios WHERE id=?", (session["uid"],)).fetchone()

    def periodo(padrao_dias=7):
        hoje = date.today()
        try:
            d1 = date.fromisoformat(request.args.get("de") or (hoje - timedelta(days=padrao_dias - 1)).isoformat())
            d2 = date.fromisoformat(request.args.get("ate") or hoje.isoformat())
        except ValueError:
            return None
        return (d1, d2) if d1 <= d2 else (d2, d1)

    # ---- historico
    @app.get("/api/historico")
    @login_required
    def historico():
        db, u = get_db(), eu()
        p = periodo()
        if not p:
            return jsonify(erro="Período inválido."), 400
        where = ["date(quando) BETWEEN ? AND ?"]
        args = [p[0].isoformat(), p[1].isoformat()]
        if not (tem_perm("ver_alteracoes") if tem_perm else u["perfil"] in ("supervisor", "admin")):
            where.append("ator_id=?")
            args.append(u["id"])
        elif request.args.get("usuario", "").isdigit():
            where.append("ator_id=?")
            args.append(int(request.args["usuario"]))
        if u["perfil"] != "admin":
            where.append("entidade!='usuario'")
        if request.args.get("acao") in ("criou", "alterou", "excluiu", "delegou"):
            where.append("acao=?")
            args.append(request.args["acao"])
        q = request.args.get("q", "").strip()
        if q:
            where.append("(titulo LIKE ? OR detalhe LIKE ?)")
            args += ["%" + q + "%"] * 2
        if request.args.get("antes", "").isdigit():
            where.append("id<?")
            args.append(int(request.args["antes"]))
        rows = db.execute("SELECT * FROM historico WHERE " + " AND ".join(where) + " ORDER BY id DESC LIMIT 101", args).fetchall()
        return jsonify(
            mais=len(rows) > 100,
            itens=[{"id": r["id"], "quando": r["quando"], "quem": r["ator_nome"], "entidade": r["entidade"],
                    "acao": r["acao"], "titulo": r["titulo"], "detalhe": r["detalhe"]} for r in rows[:100]])

    # ---- metas
    @app.get("/api/metas")
    @login_required
    def metas_get():
        db, u = get_db(), eu()
        pd, ps, ov = metas_efetivas(db)
        out = {"padrao": {"diaria": pd, "semanal": ps}}
        d, s = efetiva(pd, ps, ov.get(u["id"]))
        out["minha"] = {"diaria": d, "semanal": s}
        if (tem_perm("editar_metas") if tem_perm else u["perfil"] in ("supervisor", "admin")):
            out["usuarios"] = [{"id": r["id"], "nome": r["nome"],
                                "diaria": (ov.get(r["id"]) or (None, None))[0],
                                "semanal": (ov.get(r["id"]) or (None, None))[1]}
                               for r in db.execute("SELECT id, nome FROM usuarios ORDER BY nome")]
        return jsonify(out)

    @app.put("/api/metas")
    @equipe_required
    def metas_put():
        d = request.get_json(silent=True) or {}
        db, u = get_db(), eu()
        try:
            pad = d.get("padrao") or {}
            pd, ps = _meta_num(pad.get("diaria")) or 0, _meta_num(pad.get("semanal")) or 0
            ovs = {}
            for k, v in (d.get("usuarios") or {}).items():
                if str(k).isdigit():
                    ovs[int(k)] = (_meta_num((v or {}).get("diaria")), _meta_num((v or {}).get("semanal")))
        except ValueError as e:
            return jsonify(erro=str(e)), 400
        with db:
            db.execute("INSERT OR REPLACE INTO metas(user_id, diaria, semanal) VALUES(0,?,?)", (pd, ps))
            for uid, (a, b) in ovs.items():
                if a is None and b is None:
                    db.execute("DELETE FROM metas WHERE user_id=?", (uid,))
                else:
                    db.execute("INSERT OR REPLACE INTO metas(user_id, diaria, semanal) VALUES(?,?,?)", (uid, a, b))
            log(db, u, "meta", "alterou", "", "Metas",
                "Padrão: %d/dia e %d/semana; %d meta(s) individual(is)" % (pd, ps, sum(1 for x in ovs.values() if x != (None, None))))
        return jsonify(ok=True)

    # ---- graficos
    @app.get("/api/graficos")
    @login_required
    def graficos():
        p = periodo(30)
        if not p:
            return jsonify(erro="Período inválido."), 400
        d1, d2 = p
        if (d2 - d1).days > 92:
            return jsonify(erro="Período máximo: 92 dias."), 400
        escopo = request.args.get("escopo", "me")
        if escopo == "equipe" and not pode_equipe():
            return jsonify(erro="Acesso restrito a supervisores e administradores."), 403
        db = get_db()
        where, args = ("1=1", []) if escopo == "equipe" else ("a.user_id=?", [session["uid"]])
        sel = ("SELECT a.id, a.titulo, a.quem, a.data, a.hora, a.prazo, a.fim, a.cat, a.dur, a.gasto, a.status, a.user_id, u.nome "
               "FROM atividades a JOIN usuarios u ON u.id=a.user_id WHERE " + where + " AND a.data BETWEEN ? AND ?")
        rows = db.execute(sel, args + [d1.isoformat(), d2.isoformat()]).fetchall()
        # periodo anterior, do mesmo tamanho, para comparar
        n_dias = (d2 - d1).days + 1
        a2, a1 = d1 - timedelta(days=1), d1 - timedelta(days=n_dias)
        ant = db.execute(sel, args + [a1.isoformat(), a2.isoformat()]).fetchall()
        tipo = {c: {"cat": c, "nome": n, "min": 0, "real": 0, "qtd": 0, "total": 0} for c, n in CATS.items()}
        dias = {}
        d = d1
        while d <= d2:
            dias[d.isoformat()] = {"data": d.isoformat(), "concluidas": 0, "total": 0}
            d += timedelta(days=1)
        pess = {}
        for r in rows:
            t = tipo.get(r["cat"])
            if t:
                t["total"] += 1
                if r["status"] == "done":
                    t["min"] += r["dur"]
                    t["real"] += (r["gasto"] or 0) // 60
                    t["qtd"] += 1
            dd = dias[r["data"]]
            dd["total"] += 1
            pp = pess.setdefault(r["user_id"], {"nome": r["nome"], "concluidas": 0, "total": 0, "min": 0})
            pp["total"] += 1
            if r["status"] == "done":
                dd["concluidas"] += 1
                pp["concluidas"] += 1
                pp["min"] += r["dur"]
        feitas = sum(1 for r in rows if r["status"] == "done")
        out = {"de": d1.isoformat(), "ate": d2.isoformat(), "escopo": escopo,
               "resumo": {"total": len(rows), "concluidas": feitas,
                          "min": sum(r["dur"] for r in rows if r["status"] == "done"),
                          "real": sum((r["gasto"] or 0) // 60 for r in rows)},
               "por_tipo": [t for t in tipo.values() if t["total"]],
               "por_dia": list(dias.values())}
        # prazos (SLA)
        sits = [prazos.situacao(r["prazo"], r["status"], r["fim"]) for r in rows]
        cum, fora_, atr, abe = sits.count("cumprido"), sits.count("fora"), sits.count("atrasada"), sits.count("aberta")
        out["prazo"] = {"com_prazo": len([x for x in sits if x]), "no_prazo": cum, "fora": fora_, "atrasadas": atr, "abertas": abe,
                        "pct": round(100 * cum / (cum + fora_ + atr)) if (cum + fora_ + atr) else None}
        # mapa de calor: concluidas por dia da semana x hora planejada
        calor = [[0] * 24 for _ in range(7)]
        for r in rows:
            if r["status"] == "done" and r["hora"]:
                try:
                    calor[date.fromisoformat(r["data"]).weekday()][int(r["hora"][:2])] += 1
                except (ValueError, IndexError):
                    pass
        out["calor"] = calor
        # semana a semana (ultimas 8 semanas, independe do periodo escolhido)
        seg = date.today() - timedelta(days=date.today().weekday())
        ini = seg - timedelta(days=49)
        sem = [{"ini": (ini + timedelta(days=7 * k)).isoformat(), "total": 0, "concluidas": 0, "min": 0, "real": 0} for k in range(8)]
        for r in db.execute("SELECT a.data, a.dur, a.gasto, a.status FROM atividades a WHERE " + where + " AND a.data BETWEEN ? AND ?",
                            args + [ini.isoformat(), (seg + timedelta(days=6)).isoformat()]):
            k = (date.fromisoformat(r["data"]) - ini).days // 7
            if 0 <= k < 8:
                sem[k]["total"] += 1
                if r["status"] == "done":
                    sem[k]["concluidas"] += 1
                    sem[k]["min"] += r["dur"]
                    sem[k]["real"] += (r["gasto"] or 0) // 60
        out["semanas"] = sem
        if escopo == "equipe":
            out["por_pessoa"] = sorted(pess.values(), key=lambda x: (-x["concluidas"], x["nome"]))
        # ---- v3.3: indicadores com comparacao, meta, solicitantes, estimativas e lista para o detalhe
        out["indicadores"] = indicadores(rows)
        out["anterior"] = dict(indicadores(ant), de=a1.isoformat(), ate=a2.isoformat())
        por_dia_ant = {}
        for r in ant:
            if r["status"] == "done":
                k = (date.fromisoformat(r["data"]) - a1).days
                por_dia_ant[k] = por_dia_ant.get(k, 0) + 1
        for k, dd in enumerate(out["por_dia"]):
            dd["anterior"] = por_dia_ant.get(k, 0)
        pd, ps, ov = metas_efetivas(db)
        ids = [session["uid"]] if escopo == "me" else [r["id"] for r in db.execute("SELECT id FROM usuarios")]
        out["meta_dia"] = sum(efetiva(pd, ps, ov.get(i))[0] or 0 for i in ids)
        quem = {}
        for r in rows:
            q = " ".join((r["quem"] or "").split()) or "(sem solicitante)"
            k = q.lower()
            x = quem.setdefault(k, {"nome": q, "total": 0, "concluidas": 0, "min": 0})
            x["total"] += 1
            if r["status"] == "done":
                x["concluidas"] += 1
                x["min"] += r["dur"]
        out["por_quem"] = sorted(quem.values(), key=lambda x: (-x["total"], x["nome"]))[:12]
        est = {"no_alvo": 0, "acima": 0, "abaixo": 0}
        estouros = []
        for r in rows:
            real = (r["gasto"] or 0) / 60
            if r["status"] != "done" or not r["dur"] or not real:
                continue
            if real > r["dur"] * 1.15:
                est["acima"] += 1
                estouros.append({"id": r["id"], "titulo": r["titulo"], "nome": r["nome"], "data": r["data"],
                                 "previsto": r["dur"], "real": round(real)})
            elif real < r["dur"] * 0.85:
                est["abaixo"] += 1
            else:
                est["no_alvo"] += 1
        out["estimativa"] = est
        out["estouros"] = sorted(estouros, key=lambda x: -(x["real"] - x["previsto"]))[:8]
        LIM = 3000  # lista para o "clique para ver as atividades"
        out["lista"] = [{"id": r["id"], "uid": r["user_id"], "nome": r["nome"], "data": r["data"], "hora": r["hora"],
                         "titulo": r["titulo"], "cat": r["cat"], "quem": r["quem"], "status": r["status"], "dur": r["dur"],
                         "real": (r["gasto"] or 0) // 60, "sit": prazos.situacao(r["prazo"], r["status"], r["fim"])}
                        for r in rows[:LIM]]
        out["lista_cortada"] = len(rows) > LIM
        return jsonify(out)
