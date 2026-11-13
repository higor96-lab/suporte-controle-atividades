"""Importacao de atividades a partir de planilha Excel (.xlsx)."""
import io
import re
import unicodedata
from datetime import date, datetime, time as dtime

from flask import jsonify, request, send_file
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

MAX_LINHAS = 2000
CATS = {"TRE": "Treinamento", "IMP": "Importação", "SUP": "Suporte", "REU": "Reunião",
        "DEV": "Desenvolvimento", "DOC": "Documentação"}
PRIO = {"alta": "Alta", "media": "Média", "baixa": "Baixa"}
SIT = {"todo": "Pendente", "doing": "Em andamento", "done": "Concluída"}
COLUNAS = ["Data", "Hora", "Duração (min)", "Título", "Tipo", "Com quem", "Prioridade", "Situação", "Descrição"]


def sem_acento(s):
    return "".join(c for c in unicodedata.normalize("NFD", str(s)) if unicodedata.category(c) != "Mn").strip().lower()


def modelo():
    wb = Workbook()
    ws = wb.active
    ws.title = "Atividades"
    ws.append(COLUNAS)
    ws.append([date.today(), dtime(14, 0), 45, "Treinamento com DR tal", "Treinamento", "DR tal", "Alta", "Pendente",
               "Exemplo: apague esta linha e preencha as suas."])
    ws.append([date.today(), dtime(16, 30), 30, "Atualizar planilha de ramais", "Suporte", "", "Média", "Concluída", ""])
    for c in range(1, len(COLUNAS) + 1):
        h = ws.cell(row=1, column=c)
        h.font = Font(bold=True, color="FFFFFF")
        h.fill = PatternFill("solid", fgColor="3D6189")
        h.alignment = Alignment(horizontal="center", vertical="center")
        ws.column_dimensions[get_column_letter(c)].width = [13, 8, 14, 40, 17, 18, 12, 15, 40][c - 1]
    ws.row_dimensions[1].height = 24
    ws.freeze_panes = "A2"
    for r in range(2, MAX_LINHAS + 2):
        ws.cell(row=r, column=1).number_format = "DD/MM/YYYY"
        ws.cell(row=r, column=2).number_format = "HH:MM"
    for col, valores in (("E", list(CATS.values())), ("G", list(PRIO.values())), ("H", list(SIT.values()))):
        dv = DataValidation(type="list", formula1='"' + ",".join(valores) + '"', allow_blank=True)
        dv.error, dv.errorTitle = "Escolha um valor da lista.", "Valor inválido"
        ws.add_data_validation(dv)
        dv.add(f"{col}2:{col}{MAX_LINHAS + 1}")
    ins = wb.create_sheet("Instruções")
    for linha in [
        ["Como preencher"],
        ["Data", "Obrigatória. Formato dia/mês/ano (ex.: 09/11/2026)."],
        ["Hora", "Opcional. Ex.: 14:00."],
        ["Duração (min)", "Opcional. Número de minutos (ex.: 45)."],
        ["Título", "Obrigatório. Até 200 caracteres."],
        ["Tipo", "Treinamento, Importação, Suporte, Reunião, Desenvolvimento ou Documentação."],
        ["Com quem", "Opcional. Nome da pessoa ou cliente."],
        ["Prioridade", "Alta, Média ou Baixa. Em branco = Média."],
        ["Situação", "Pendente, Em andamento ou Concluída. Em branco = Pendente."],
        ["Descrição", "Opcional. Detalhes da atividade."],
        [],
        [f"Limite: {MAX_LINHAS} linhas por arquivo. A primeira linha (cabeçalho) é ignorada."],
    ]:
        ins.append(linha)
    ins["A1"].font = Font(bold=True, size=13)
    ins.column_dimensions["A"].width = 18
    ins.column_dimensions["B"].width = 80
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def _data(v):
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    s = str(v or "").strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        y, mo, d = map(int, m.groups())
    else:
        m = re.match(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$", s)
        if not m:
            return None
        d, mo, y = map(int, m.groups())
        y += 2000 if y < 100 else 0
    try:
        return date(y, mo, d).isoformat()
    except ValueError:
        return None


def _hora(v):
    if v in (None, ""):
        return ""
    if isinstance(v, datetime):
        return v.strftime("%H:%M")
    if isinstance(v, dtime):
        return v.strftime("%H:%M")
    if isinstance(v, (int, float)) and 0 <= v < 1:          # fracao de dia do Excel
        mins = round(v * 1440)
        return "%02d:%02d" % (mins // 60 % 24, mins % 60)
    m = re.match(r"^(\d{1,2})[:h.](\d{2})", str(v).strip().lower())
    if m and int(m.group(1)) < 24 and int(m.group(2)) < 60:
        return "%02d:%02d" % (int(m.group(1)), int(m.group(2)))
    return None


def _dur(v):
    if v in (None, ""):
        return 0
    if isinstance(v, dtime):
        return v.hour * 60 + v.minute
    s = str(v).strip().lower().replace(",", ".")
    m = re.match(r"^(\d+)\s*h\s*(\d+)?", s)
    if m:
        return min(1440, int(m.group(1)) * 60 + int(m.group(2) or 0))
    try:
        return max(0, min(1440, int(float(re.sub(r"[^\d.]", "", s) or "x"))))
    except ValueError:
        return None


def _escolhe(v, tabela, padrao):
    if v in (None, ""):
        return padrao
    s = sem_acento(v)
    for k, nome in tabela.items():
        if s == k.lower() or s == sem_acento(nome) or (len(s) >= 3 and sem_acento(nome).startswith(s)):
            return k
    return None


def le_planilha(dados):
    """Devolve (atividades_validas, erros). Cada erro: {linha, motivo}."""
    wb = load_workbook(io.BytesIO(dados), read_only=True, data_only=True)
    ws = wb["Atividades"] if "Atividades" in wb.sheetnames else wb.worksheets[0]
    ok, erros, n = [], [], 0
    for num, row in enumerate(ws.iter_rows(values_only=True), start=1):
        row = list(row) + [None] * (9 - len(row))
        if all(c in (None, "") for c in row[:9]):
            continue
        if num == 1 and _data(row[0]) is None and sem_acento(row[0] or "").startswith("data"):
            continue                                            # cabecalho
        n += 1
        if n > MAX_LINHAS:
            erros.append({"linha": num, "motivo": f"Limite de {MAX_LINHAS} linhas excedido; o restante foi ignorado."})
            break
        d, h, du = _data(row[0]), _hora(row[1]), _dur(row[2])
        titulo = str(row[3] or "").strip()
        cat = _escolhe(row[4], CATS, "DEV")
        prio = _escolhe(row[6], PRIO, "media")
        sit = _escolhe(row[7], SIT, "todo")
        motivo = None
        if d is None:
            motivo = "Data inválida ou vazia."
        elif not titulo:
            motivo = "Título vazio."
        elif h is None:
            motivo = "Hora inválida (use 14:00)."
        elif du is None:
            motivo = "Duração inválida (use minutos)."
        elif cat is None:
            motivo = f"Tipo desconhecido: {row[4]}."
        elif prio is None:
            motivo = f"Prioridade desconhecida: {row[6]}."
        elif sit is None:
            motivo = f"Situação desconhecida: {row[7]}."
        if motivo:
            erros.append({"linha": num, "motivo": motivo})
            continue
        ok.append({"date": d, "time": h, "dur": du, "title": titulo[:200], "desc": str(row[8] or "").strip()[:2000],
                   "cat": cat, "who": str(row[5] or "").strip()[:120], "prio": prio, "status": sit, "linha": num})
    wb.close()
    return ok, erros


def register(app, login_required):
    @app.get("/api/importar/modelo.xlsx")
    @login_required
    def modelo_xlsx():
        return send_file(modelo(), as_attachment=True, download_name="modelo-importacao.xlsx",
                         mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

    @app.post("/api/importar/xlsx")
    @login_required
    def ler_xlsx():
        dados = request.get_data(cache=False)
        if not dados or dados[:2] != b"PK":
            return jsonify(erro="O arquivo não é uma planilha .xlsx válida."), 400
        try:
            ok, erros = le_planilha(dados)
        except Exception:
            return jsonify(erro="Não consegui ler a planilha. Salve como .xlsx (Pasta de Trabalho do Excel) e tente de novo."), 400
        return jsonify(atividades=ok, erros=erros)
