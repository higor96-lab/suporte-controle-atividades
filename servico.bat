@echo off
rem Usado pelo servico do Windows (instalar-servico.bat). Nao precisa abrir este arquivo.
rem Sobe o sistema e, se ele parar por qualquer motivo, reinicia em 10 segundos.
chcp 65001 >nul
cd /d "%~dp0"
set HOST=0.0.0.0
set PORT=5000
set HTTPS=1
set SESSAO_MIN=60
if exist "config.bat" call "config.bat"
set PYTHONUNBUFFERED=1
set PYTHONIOENCODING=utf-8
if not exist "logs" mkdir "logs"
:laco
for %%F in ("logs\servico.log") do if %%~zF GTR 5000000 move /y "logs\servico.log" "logs\servico-anterior.log" >nul
echo [%date% %time%] Iniciando o sistema >> "logs\servico.log"
".venv\Scripts\python.exe" app.py >> "logs\servico.log" 2>&1
echo [%date% %time%] O sistema parou (codigo %errorlevel%). Reiniciando em 10 segundos >> "logs\servico.log"
timeout /t 10 /nobreak >nul
goto laco
