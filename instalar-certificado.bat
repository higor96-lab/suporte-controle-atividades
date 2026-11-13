@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Instala o certificado do Suporte como confiavel NESTE computador, para o
rem navegador parar de mostrar "Nao seguro". Execute como ADMINISTRADOR.
rem Nos outros PCs: abra https://IP:PORTA/certificado.crt, baixe o arquivo e rode:
rem    certutil -addstore -f ROOT suporte.crt   (como administrador)

net session >nul 2>nul
if errorlevel 1 (
  echo Execute este arquivo como Administrador ^(botao direito ^> Executar como administrador^).
  pause
  exit /b 1
)
if not exist "certs\cert.pem" (
  echo Certificado ainda nao existe. Abra o iniciar.bat uma vez e tente de novo.
  pause
  exit /b 1
)
certutil -addstore -f ROOT "certs\cert.pem"
echo.
echo Pronto. Feche e abra o navegador para valer.
pause
