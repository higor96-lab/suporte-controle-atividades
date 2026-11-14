@echo off
chcp 65001 >nul
rem Instala o sistema como servico: sobe sozinho quando o computador liga (mesmo sem ninguem logado)
rem e reinicia sozinho se cair. Execute como ADMINISTRADOR (botao direito > Executar como administrador).
cd /d "%~dp0"
net session >nul 2>nul
if errorlevel 1 (
  echo Execute este arquivo como Administrador.
  pause
  exit /b 1
)
where python >nul 2>nul
if errorlevel 1 if not exist ".venv\Scripts\python.exe" (
  echo Python nao encontrado. Instale em https://www.python.org/downloads/ marcando "Add Python to PATH".
  pause
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" python -m venv .venv
echo Instalando dependencias...
".venv\Scripts\python.exe" -m pip install -q -r requirements.txt
if errorlevel 1 (
  echo Falha ao instalar dependencias.
  pause
  exit /b 1
)
echo.
echo IMPORTANTE: feche a janela do iniciar.bat, se estiver aberta (a porta precisa estar livre).
pause
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$d='%~dp0'; $a=New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ('/c \"' + $d + 'servico.bat\"') -WorkingDirectory $d;" ^
  "$t=New-ScheduledTaskTrigger -AtStartup;" ^
  "$s=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew;" ^
  "$p=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest;" ^
  "Register-ScheduledTask -TaskName 'Suporte - Controle de Atividades' -Action $a -Trigger $t -Settings $s -Principal $p -Force | Out-Null;" ^
  "Start-ScheduledTask -TaskName 'Suporte - Controle de Atividades'"
if errorlevel 1 (
  echo Nao foi possivel criar o servico.
  pause
  exit /b 1
)
echo.
echo Servico instalado e iniciado. O sistema agora sobe sozinho quando o computador ligar.
echo O registro fica em logs\servico.log. Para remover: remover-servico.bat (como administrador).
pause
