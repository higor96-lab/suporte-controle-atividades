@echo off
chcp 65001 >nul
rem Execute como ADMINISTRADOR (botao direito > Executar como administrador).
rem Usa a mesma porta do iniciar.bat (config.bat, se existir).
cd /d "%~dp0"
set PORT=5000
if exist "config.bat" call "config.bat"

net session >nul 2>nul
if errorlevel 1 (
  echo Execute este arquivo como Administrador.
  pause
  exit /b 1
)

netsh advfirewall firewall delete rule name="Suporte Controle de Atividades" >nul 2>nul
netsh advfirewall firewall add rule name="Suporte Controle de Atividades" dir=in action=allow protocol=TCP localport=%PORT% profile=any remoteip=LocalSubnet
echo.
echo Porta %PORT% liberada para a rede local.
pause
