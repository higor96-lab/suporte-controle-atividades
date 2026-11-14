@echo off
chcp 65001 >nul
rem Remove o servico criado pelo instalar-servico.bat e para o sistema. Execute como ADMINISTRADOR.
cd /d "%~dp0"
net session >nul 2>nul
if errorlevel 1 (
  echo Execute este arquivo como Administrador.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$n='Suporte - Controle de Atividades'; Stop-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName $n -Confirm:$false -ErrorAction SilentlyContinue;" ^
  "$d=(Resolve-Path '%~dp0').Path; Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'python.exe' -and $_.CommandLine -like '*app.py*' -and $_.ExecutablePath -like ($d + '*')) -or ($_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*servico.bat*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo Servico removido. Para usar do jeito antigo, abra o iniciar.bat.
pause
