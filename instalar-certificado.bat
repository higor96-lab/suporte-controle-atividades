@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Instala a autoridade do Suporte (certs\ca.pem) como confiavel NESTE computador, para o
rem navegador parar de mostrar "Nao seguro". Execute como ADMINISTRADOR.
rem Nos outros PCs: abra https://IP:PORTA/confiar-certificado.bat e execute o arquivo baixado.

net session >nul 2>nul
if errorlevel 1 (
  echo Execute este arquivo como Administrador ^(botao direito ^> Executar como administrador^).
  pause
  exit /b 1
)
set "ARQ=certs\ca.pem"
if not exist "%ARQ%" set "ARQ=certs\cert.pem"
if not exist "%ARQ%" (
  echo Certificado ainda nao existe. Abra o iniciar.bat ^(ou reinicie o servico^) uma vez e tente de novo.
  pause
  exit /b 1
)
certutil -addstore -f ROOT "%ARQ%"
echo.
echo Pronto. Feche e abra o navegador para valer.
pause
