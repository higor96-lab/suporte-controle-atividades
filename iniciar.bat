@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Suporte

rem ===== CONFIGURACAO PADRAO =====
rem Para mudar IP, porta e outras opcoes NESTA maquina, copie config.exemplo.bat para config.bat e edite.
set HOST=0.0.0.0
set PORT=8000
set HTTPS=1
set SESSAO_MIN=60
if exist "config.bat" call "config.bat"
rem ===============================

where python >nul 2>nul
if errorlevel 1 (
  echo Python nao encontrado. Instale em https://www.python.org/downloads/ marcando "Add Python to PATH".
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo Criando ambiente virtual...
  python -m venv .venv
)

echo Instalando dependencias...
".venv\Scripts\python.exe" -m pip install -q -r requirements.txt
if errorlevel 1 (
  echo Falha ao instalar dependencias.
  pause
  exit /b 1
)

".venv\Scripts\python.exe" app.py
pause
