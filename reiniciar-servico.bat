@echo off
chcp 65001 >nul
rem Reinicia o servico do sistema (instalado pelo instalar-servico.bat). Use depois de atualizar o sistema.
rem Execute como ADMINISTRADOR (botao direito > Executar como administrador).
cd /d "%~dp0"
net session >nul 2>nul
if errorlevel 1 (
  echo Execute este arquivo como Administrador.
  pause
  exit /b 1
)
echo Parando o sistema...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$n='Suporte - Controle de Atividades'; if(-not (Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue)){ Write-Host 'O servico nao esta instalado. Use o iniciar.bat ou o instalar-servico.bat.'; exit 2 }" ^
  "Stop-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue;" ^
  "$d=(Resolve-Path '%~dp0').Path; Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'python.exe' -and $_.CommandLine -like '*app.py*' -and $_.ExecutablePath -like ($d + '*')) -or ($_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*servico.bat*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue };" ^
  "Start-Sleep -Seconds 3; Start-ScheduledTask -TaskName $n; Write-Host 'Sistema reiniciado.'"
if errorlevel 1 (
  pause
  exit /b 1
)
echo.
echo Pronto. Aguarde uns 10 segundos e aperte Ctrl+F5 no navegador.
pause
