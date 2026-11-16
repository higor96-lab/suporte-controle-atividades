# -*- coding: utf-8 -*-
"""Autoridade local + certificado do servidor. Uso: python teste_cert.py <pasta_da_copia>"""
import io, os, re, sys, contextlib, datetime, ipaddress
pasta = sys.argv[1]
os.environ["BACKUP_DIR"] = os.path.join(pasta, "backups"); os.environ["HTTPS"] = "0"
sys.path.insert(0, pasta); os.chdir(pasta)
buf = io.StringIO()
with contextlib.redirect_stdout(buf):
    import app as A
    A.init_db()
import certificado as C
from cryptography import x509
si = re.search(r"senha provisoria: (\S+)", buf.getvalue()).group(1)
H = {"X-Requested-With": "fetch"}; F = []


def ok(c, n):
    print(("  OK   " if c else "  FALHA ") + n)
    if not c:
        F.append(n)


def carrega(nome, d=None):
    return x509.load_pem_x509_certificate(open(os.path.join(d or A.CERT_DIR, nome), "rb").read())


def confia(leaf, ca, ip):
    """Verifica a cadeia como um navegador (cryptography >= 42); devolve None se a versao nao tiver o verificador."""
    try:
        from cryptography.x509 import verification as V
    except ImportError:
        return None
    try:
        V.PolicyBuilder().store(V.Store([ca])).build_server_verifier(V.IPAddress(ipaddress.ip_address(ip))).verify(leaf, [])
        return True
    except Exception as e:
        print("     ", e)
        return False


print("[autoridade e certificado]")
d = os.path.join(pasta, "certs-teste")
cert, chave, novo = C.garantir("10.1.2.3", d)
ca, leaf = carrega("ca.pem", d), carrega("cert.pem", d)
ok(novo and os.path.exists(os.path.join(d, "ca-key.pem")), "cria autoridade e certificado")
ok(ca.extensions.get_extension_for_class(x509.BasicConstraints).value.ca, "ca.pem é autoridade (CA)")
ok(leaf.issuer == ca.subject, "certificado do servidor assinado pela autoridade")
r = confia(leaf, ca, "10.1.2.3")
ok(r is not False, "navegador que confia na autoridade aceita o servidor" + (" (verificador indisponível)" if r is None else ""))
ok(confia(leaf, ca, "10.9.9.9") in (False, None), "não vale para outro IP")
ok(C.garantir("10.1.2.3", d)[2] is False, "segunda vez não gera de novo")

print("[renovacao mantem a autoridade]")
serial_ca = ca.serial_number
_, _, novo = C.garantir("10.1.2.4", d)
ca2, leaf2 = carrega("ca.pem", d), carrega("cert.pem", d)
ok(novo and ca2.serial_number == serial_ca, "IP novo: só o certificado do servidor muda")
ok(confia(leaf2, ca2, "10.1.2.4") is not False, "novo certificado continua confiável sem reinstalar nada")

print("[migracao do certificado antigo autoassinado]")
d2 = os.path.join(pasta, "certs-velho")
os.makedirs(d2)
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
k = rsa.generate_private_key(public_exponent=65537, key_size=2048)
n = x509.Name([x509.NameAttribute(x509.oid.NameOID.COMMON_NAME, "velho")])
agora = datetime.datetime.now(datetime.timezone.utc)
velho = (x509.CertificateBuilder().subject_name(n).issuer_name(n).public_key(k.public_key()).serial_number(1)
         .not_valid_before(agora).not_valid_after(agora + datetime.timedelta(days=500))
         .add_extension(x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address("10.1.2.3"))]), critical=False)
         .sign(k, hashes.SHA256()))
open(os.path.join(d2, "cert.pem"), "wb").write(velho.public_bytes(serialization.Encoding.PEM))
open(os.path.join(d2, "key.pem"), "wb").write(k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
_, _, novo = C.garantir("10.1.2.3", d2)
ok(novo and carrega("cert.pem", d2).issuer == carrega("ca.pem", d2).subject, "antigo autoassinado é trocado por um da autoridade")

print("[downloads]")
A.CERT_DIR = d
cli = A.app.test_client()
r = cli.get("/certificado.crt")
ok(r.status_code == 200 and x509.load_pem_x509_certificate(r.data).serial_number == serial_ca, "/certificado.crt entrega a autoridade (sem login)")
r = cli.get("/confiar-certificado.bat")
t = r.data.decode()
ok(r.status_code == 200 and "attachment" in r.headers.get("Content-Disposition", ""), "/confiar-certificado.bat baixa como arquivo")
ok("BEGIN CERTIFICATE" in t and "certutil -user -addstore -f Root" in t and "\r\n" in t, "instalador traz a autoridade embutida e usa certutil")
pem = "\n".join(l[5:] for l in t.split("\r\n") if l.startswith("echo ") and (l[5:].startswith("-----") or re.match(r"^[A-Za-z0-9+/=]+$", l[5:])))
ok(x509.load_pem_x509_certificate(pem.encode()).serial_number == serial_ca, "o certificado embutido no .bat é a autoridade")
adm = A.app.test_client(); adm.post("/api/login", json={"usuario": "admin", "senha": si}, headers=H)
adm.post("/api/senha", json={"atual": si, "nova": "Cafe#Forte2026"}, headers=H)
ok(adm.get("/api/certificado", headers=H).get_json() == {"https": False}, "com HTTPS=0 a tela não mostra o quadro")
ok(cli.get("/api/certificado", headers=H).status_code == 401, "info do certificado exige login")
print("\nFALHAS: %d" % len(F))
sys.exit(1 if F else 0)
