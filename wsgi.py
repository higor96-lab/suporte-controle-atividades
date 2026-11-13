# -*- coding: utf-8 -*-
"""Ponto de entrada WSGI para hospedagem (PythonAnywhere, Gunicorn, etc.).

Defina as variaveis ANTES de importar este arquivo (ver HOSPEDAGEM.md), por exemplo:
    DEMO=1   -> demonstracao publica com dados ficticios (login demo / demo)
    PROXY=1  -> o servidor esta atras de um proxy HTTPS
No uso local continue usando o iniciar.bat.
"""
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
if BASE not in sys.path:
    sys.path.insert(0, BASE)

import app as sistema  # noqa: E402

sistema.init_db()
if sistema.DEMO:
    import demo  # noqa: E402
    demo.garantir(sistema.DB_PATH, sistema.BASE)

application = sistema.app
