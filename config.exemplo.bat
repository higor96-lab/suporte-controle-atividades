@echo off
rem Copie este arquivo para config.bat e ajuste. O config.bat fica so nesta maquina (nao vai para o Git)
rem e as atualizacoes do sistema nao mexem nele.

rem IP desta maquina na rede (rode "python meuip.py" para ver). 0.0.0.0 = todos os IPs.
set HOST=0.0.0.0
set PORT=5000
rem HTTPS=1 usa conexao segura (certificado proprio). HTTPS=0 volta para HTTP simples.
set HTTPS=1
rem Minutos parado ate desconectar o usuario (0 = nunca).
set SESSAO_MIN=60
rem Opcional: pasta dos backups e quantos manter.
rem set BACKUP_DIR=D:\backups-suporte
rem set BACKUP_KEEP=30
rem Opcional: segunda pasta que recebe uma copia de cada backup (ex.: drive da rede). Se falhar, o administrador e avisado.
rem set BACKUP_COPIA=\\servidor\backups\suporte
rem Opcional: pasta dos anexos e exigir verificacao em duas etapas dos administradores.
rem set ANEXOS_DIR=D:\anexos-suporte
rem set EXIGIR_2FA_ADMIN=1
rem Opcional: desligar a protecao CSP da pagina (so se alguma tela parar de funcionar).
rem set CSP=0
