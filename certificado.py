# -*- coding: utf-8 -*-
"""Certificado HTTPS autoassinado para uso na rede interna.

Gerado automaticamente na primeira execucao (pasta certs/) e renovado quando
estiver perto de vencer ou quando o IP configurado mudar.
"""
import datetime
import ipaddress
import os
import socket


def ips_locais():
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
    return {ip for ip in ips if not ip.startswith("127.")}


def _ip_valido(valor):
    try:
        ipaddress.ip_address(valor)
        return True
    except ValueError:
        return False


def _ainda_serve(cert_path, ips):
    from cryptography import x509
    try:
        with open(cert_path, "rb") as f:
            c = x509.load_pem_x509_certificate(f.read())
        try:
            fim = c.not_valid_after_utc
        except AttributeError:  # cryptography antigo
            fim = c.not_valid_after.replace(tzinfo=datetime.timezone.utc)
        if fim - datetime.datetime.now(datetime.timezone.utc) < datetime.timedelta(days=30):
            return False
        san = c.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
        tem = {str(i) for i in san.get_values_for_type(x509.IPAddress)}
        return set(ips) <= tem
    except Exception:
        return False


def _gerar(cert_path, key_path, ips):
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

    chave = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    nome = x509.Name([
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Suporte"),
        x509.NameAttribute(NameOID.COMMON_NAME, "Suporte - Controle de Atividades"),
    ])
    agora = datetime.datetime.now(datetime.timezone.utc)
    san = [x509.DNSName("localhost")]
    try:
        san.append(x509.DNSName(socket.gethostname()))
    except Exception:
        pass
    san += [x509.IPAddress(ipaddress.ip_address(i)) for i in sorted(set(ips) | {"127.0.0.1"})]
    cert = (
        x509.CertificateBuilder()
        .subject_name(nome).issuer_name(nome).public_key(chave.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(agora - datetime.timedelta(days=1))
        .not_valid_after(agora + datetime.timedelta(days=825))
        .add_extension(x509.SubjectAlternativeName(san), critical=False)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
        .sign(chave, hashes.SHA256())
    )
    with open(key_path, "wb") as f:
        f.write(chave.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                    serialization.NoEncryption()))
    with open(cert_path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))


def garantir(host, pasta):
    """Devolve (cert, chave, foi_gerado). Levanta excecao se nao der para gerar."""
    os.makedirs(pasta, exist_ok=True)
    cert, chave = os.path.join(pasta, "cert.pem"), os.path.join(pasta, "key.pem")
    ips = ips_locais()
    if host and _ip_valido(host) and host != "0.0.0.0":
        ips.add(host)
    if os.path.exists(cert) and os.path.exists(chave) and _ainda_serve(cert, ips):
        return cert, chave, False
    _gerar(cert, chave, ips)
    return cert, chave, True
