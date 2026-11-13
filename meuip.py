# -*- coding: utf-8 -*-
"""Mostra os IPs desta maquina e se o IP configurado esta disponivel."""
import os
import socket

ALVO = os.environ.get("HOST", "0.0.0.0")
PORT = os.environ.get("PORT", "5000")
ESQ = "http" if os.environ.get("HTTPS", "1").lower() in ("0", "false", "no", "nao") else "https"

ips = set()
try:
    ips.update(socket.gethostbyname_ex(socket.gethostname())[2])
except OSError:
    pass
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(("10.255.255.255", 1))
    ips.add(s.getsockname()[0])
    s.close()
except OSError:
    pass

print("IPs desta máquina:")
for ip in sorted(ips):
    print("  -", ip)
if ALVO == "0.0.0.0":
    print("\nHOST=0.0.0.0: o sistema atende em todos os IPs acima. Acesse por qualquer um, por exemplo:")
    for ip in sorted(ips):
        print("  %s://%s:%s" % (ESQ, ip, PORT))
    print("Para fixar um IP, copie config.exemplo.bat para config.bat e edite HOST.")
elif ALVO in ips:
    print("\nOK: o IP %s está neste computador." % ALVO)
    print("Acesse: %s://%s:%s" % (ESQ, ALVO, PORT))
else:
    print("\nATENÇÃO: o IP %s NÃO está neste computador." % ALVO)
    print("Use um dos IPs acima (edite HOST no config.bat) ou configure o IP fixo na placa de rede.")
