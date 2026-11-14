# -*- coding: utf-8 -*-
"""Roda todos os testes do servidor, cada um numa copia limpa do sistema (o banco real nunca e tocado).
Uso: python tests/rodar.py"""
import os
import shutil
import subprocess
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AQUI = os.path.join(RAIZ, "tests")
PULAR = {".git", ".github", ".venv", "tests", "backups", "anexos", "certs", "logs", "atualizacoes",
         "versoes_anteriores", "__pycache__", "data.db", "data.db-wal", "data.db-shm", "secret.key", "config.bat", "demo.stamp"}


def copia_limpa():
    d = tempfile.mkdtemp(prefix="suporte-teste-")
    for nome in os.listdir(RAIZ):
        if nome in PULAR:
            continue
        o = os.path.join(RAIZ, nome)
        (shutil.copytree if os.path.isdir(o) else shutil.copy2)(o, os.path.join(d, nome))
    return d


def main():
    testes = sorted(f for f in os.listdir(AQUI) if f.startswith("teste_") and f.endswith(".py"))
    falhou = []
    for t in testes:
        d = copia_limpa()
        print("\n==== %s ====" % t, flush=True)
        env = dict(os.environ, PYTHONIOENCODING="utf-8")
        for k in ("DEMO", "PROXY", "BACKUP_DIR", "BACKUP_COPIA", "ANEXOS_DIR"):
            env.pop(k, None)
        r = subprocess.run([sys.executable, os.path.join(AQUI, t), d], cwd=d, env=env)
        if r.returncode:
            falhou.append(t)
        shutil.rmtree(d, ignore_errors=True)
    print("\n" + ("TUDO OK (%d arquivos de teste)" % len(testes) if not falhou else "FALHARAM: " + ", ".join(falhou)))
    sys.exit(1 if falhou else 0)


if __name__ == "__main__":
    main()
