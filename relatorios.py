# -*- coding: utf-8 -*-
"""Relatorios de atividades (tela, Excel e PDF)."""
import io
import json
from datetime import date, timedelta

from flask import jsonify, request, send_file, session

import prazos

CATS = {"TRE": "Treinamento", "IMP": "Importação", "SUP": "Suporte", "REU": "Reunião",
        "DEV": "Desenvolvimento", "DOC": "Documentação"}
ST = {"todo": "Pendente", "doing": "Em andamento", "done": "Concluída"}
PRIO = {"alta": "Alta", "media": "Média", "baixa": "Baixa"}


def br(d):
    return "%02d/%02d/%04d" % (d.day, d.month, d.year)


def fmt_min(m):
    h, r = divmod(int(m or 0), 60)
    return ("%dh%02d" % (h, r)) if h else "%dmin" % r


def periodo():
    hoje = date.today()
    ini = hoje - timedelta(days=hoje.weekday())
    try:
        d1 = date.fromisoformat(request.args.get("de") or ini.isoformat())
        d2 = date.fromisoformat(request.args.get("ate") or (ini + timedelta(days=6)).isoformat())
    except ValueError:
        return None
    return (d1, d2) if d1 <= d2 else (d2, d1)


def _br_prazo(p):
    if not p:
        return ""
    d = p[:10].split("-")
    return "%s/%s/%s%s" % (d[2], d[1], d[0], (" " + p[11:]) if len(p) > 10 else "")


def buscar(db, d1, d2, alvo="me", situacao=""):
    """alvo: 'me' (usuario logado), id de um usuario ou 'all' (toda a equipe)."""
    if alvo == "all":
        where, args, nome, cargo = "1=1", [], "Toda a equipe", ""
    else:
        try:
            uid = session["uid"] if alvo in ("", "me", None) else int(alvo)
        except ValueError:
            uid = session["uid"]
        u = db.execute("SELECT nome, cargo FROM usuarios WHERE id=?", (uid,)).fetchone()
        if not u:
            return None
        where, args, nome, cargo = "a.user_id=?", [uid], u["nome"], u["cargo"]
    rows = db.execute(
        "SELECT a.*, u.nome AS resp FROM atividades a JOIN usuarios u ON u.id=a.user_id "
        "WHERE " + where + " AND a.data BETWEEN ? AND ? "
        "ORDER BY a.data, CASE WHEN a.hora='' THEN 1 ELSE 0 END, a.hora, u.nome",
        args + [d1.isoformat(), d2.isoformat()]).fetchall()
    fora = db.execute(
        "SELECT COUNT(*) FROM atividades a WHERE " + where + " AND a.status='done' AND (a.data<? OR a.data>?)",
        args + [d1.isoformat(), d2.isoformat()]).fetchone()[0]
    itens = [{"resp": r["resp"], "data": r["data"], "hora": r["hora"], "dur": r["dur"], "titulo": r["titulo"],
              "descricao": r["descricao"], "tipo": CATS.get(r["cat"], r["cat"]), "quem": r["quem"],
              "prio": PRIO.get(r["prio"], r["prio"]), "status": r["status"],
              "situacao": ST.get(r["status"], r["status"]), "real": (r["gasto"] or 0) // 60,
              "etiquetas": ", ".join(json.loads(r["tags"] or "[]")),
              "prazo": _br_prazo(r["prazo"]), "sit_prazo": prazos.situacao(r["prazo"], r["status"], r["fim"]),
              "prazo_txt": prazos.ROTULO[prazos.situacao(r["prazo"], r["status"], r["fim"])]} for r in rows]
    resumo = {
        "total": len(itens),
        "pendentes": sum(i["status"] == "todo" for i in itens),
        "andamento": sum(i["status"] == "doing" for i in itens),
        "concluidas": sum(i["status"] == "done" for i in itens),
        "min_planejado": sum(i["dur"] for i in itens),
        "min_concluido": sum(i["dur"] for i in itens if i["status"] == "done"),
        "min_real": sum(i["real"] for i in itens),
        "concluidas_fora": fora,
        "com_prazo": sum(1 for i in itens if i["sit_prazo"]),
        "no_prazo": sum(1 for i in itens if i["sit_prazo"] == "cumprido"),
        "fora_prazo": sum(1 for i in itens if i["sit_prazo"] == "fora"),
        "atrasadas": sum(1 for i in itens if i["sit_prazo"] == "atrasada"),
    }
    if situacao in ST:
        itens = [i for i in itens if i["status"] == situacao]
    return {"nome": nome, "cargo": cargo, "de": d1.isoformat(), "ate": d2.isoformat(),
            "itens": itens, "resumo": resumo}


def excel(rel):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = "Atividades"
    cab = ["Data", "Hora", "Duração (min)", "Responsável", "Atividade", "Descrição", "Tipo", "Com quem", "Prioridade", "Situação", "Tempo real (min)", "Etiquetas", "Prazo", "Situação do prazo"]
    ws.append(cab)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="4A7096")
        c.alignment = Alignment(vertical="center")
    for i in rel["itens"]:
        ws.append([br(date.fromisoformat(i["data"])), i["hora"], i["dur"], i["resp"], i["titulo"], i["descricao"],
                   i["tipo"], i["quem"], i["prio"], i["situacao"], i["real"], i["etiquetas"], i["prazo"], i["prazo_txt"]])
    for n, w in enumerate([12, 8, 14, 24, 42, 50, 18, 22, 12, 16, 16, 24, 17, 24], 1):
        ws.column_dimensions[get_column_letter(n)].width = w
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.alignment = Alignment(vertical="top", wrap_text=True)
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions

    rs = wb.create_sheet("Resumo")
    r = rel["resumo"]
    rs.append(["Relatório de atividades"])
    rs.append([rel["nome"], "%s a %s" % (br(date.fromisoformat(rel["de"])), br(date.fromisoformat(rel["ate"])))])
    rs.append([])
    for k, v in [("Total de atividades", r["total"]), ("Pendentes", r["pendentes"]), ("Em andamento", r["andamento"]),
                 ("Concluídas", r["concluidas"]), ("Tempo planejado", fmt_min(r["min_planejado"])),
                 ("Tempo concluído", fmt_min(r["min_concluido"])), ("Tempo real registrado", fmt_min(r["min_real"])),
                 ("Com prazo definido", r["com_prazo"]), ("Concluídas no prazo", r["no_prazo"]),
                 ("Concluídas fora do prazo", r["fora_prazo"]), ("Atrasadas (em aberto)", r["atrasadas"])]:
        rs.append([k, v])
    rs["A1"].font = Font(bold=True, size=14)
    rs.column_dimensions["A"].width = 26
    rs.column_dimensions["B"].width = 26
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def pdf(rel):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=14 * mm, rightMargin=14 * mm,
                            topMargin=14 * mm, bottomMargin=14 * mm, title="Relatório de atividades")
    ss = getSampleStyleSheet()
    cel = ParagraphStyle("cel", parent=ss["BodyText"], fontSize=8.5, leading=10.5)
    r = rel["resumo"]
    el = [Paragraph("Relatório de atividades", ss["Title"]),
          Paragraph("%s &middot; %s a %s" % (rel["nome"], br(date.fromisoformat(rel["de"])), br(date.fromisoformat(rel["ate"]))), ss["Normal"]),
          Paragraph("Total: %d &nbsp; Pendentes: %d &nbsp; Em andamento: %d &nbsp; Concluídas: %d &nbsp; Tempo concluído: %s &nbsp; Tempo real registrado: %s"
                    % (r["total"], r["pendentes"], r["andamento"], r["concluidas"], fmt_min(r["min_concluido"]), fmt_min(r["min_real"])), ss["Normal"]),
          Paragraph("Prazos: %d com prazo &nbsp; %d no prazo &nbsp; %d fora do prazo &nbsp; %d atrasadas" % (
              r["com_prazo"], r["no_prazo"], r["fora_prazo"], r["atrasadas"]), ss["Normal"]) if r["com_prazo"] else Spacer(1, 0),
          Spacer(1, 8)]
    if not rel["itens"]:
        el.append(Paragraph("Nenhuma atividade neste período.", ss["Normal"]))
    else:
        dados = [["Data", "Hora", "Dur.", "Responsável", "Atividade", "Tipo", "Com quem", "Prior.", "Situação"]]
        for i in rel["itens"]:
            dados.append([br(date.fromisoformat(i["data"])), i["hora"] or "--:--", fmt_min(i["dur"]),
                          Paragraph(i["resp"].replace("&", "&amp;").replace("<", "&lt;"), cel),
                          Paragraph(i["titulo"].replace("&", "&amp;").replace("<", "&lt;"), cel),
                          i["tipo"], Paragraph(i["quem"].replace("&", "&amp;").replace("<", "&lt;"), cel),
                          i["prio"], i["situacao"]])
        t = Table(dados, repeatRows=1, colWidths=[20 * mm, 14 * mm, 14 * mm, 30 * mm, 80 * mm, 26 * mm, 30 * mm, 16 * mm, 24 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4A7096")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5), ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F2F6FA")]),
            ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#D5DEE8"))]))
        el.append(t)
    doc.build(el)
    buf.seek(0)
    return buf


def register(app, get_db, login_required, pode_equipe):
    def pega():
        p = periodo()
        if not p:
            return None, (jsonify(erro="Período inválido."), 400)
        alvo = request.args.get("usuario", "me")
        if alvo not in ("", "me", str(session["uid"])) and not pode_equipe():
            return None, (jsonify(erro="Acesso restrito a supervisores e administradores."), 403)
        rel = buscar(get_db(), *p, alvo=alvo, situacao=request.args.get("situacao", ""))
        if rel is None:
            return None, (jsonify(erro="Usuário não encontrado."), 404)
        return rel, None

    @app.get("/api/relatorios/dados")
    @login_required
    def rel_dados():
        rel, err = pega()
        return err or jsonify(rel)

    @app.get("/api/relatorios/excel")
    @login_required
    def rel_excel():
        rel, err = pega()
        if err:
            return err
        return send_file(excel(rel), as_attachment=True, download_name="relatorio-%s-a-%s.xlsx" % (rel["de"], rel["ate"]),
                         mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

    @app.get("/api/relatorios/pdf")
    @login_required
    def rel_pdf():
        rel, err = pega()
        if err:
            return err
        return send_file(pdf(rel), as_attachment=True, download_name="relatorio-%s-a-%s.pdf" % (rel["de"], rel["ate"]),
                         mimetype="application/pdf")
