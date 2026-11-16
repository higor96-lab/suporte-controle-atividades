# -*- coding: utf-8 -*-
"""Certificado HTTPS para uso na rede interna.

Usa uma autoridade certificadora (CA) propria, criada uma unica vez na pasta certs/ (ca.pem, valida por 10 anos).
O certificado do servidor (cert.pem) e assinado por ela e renovado sozinho quando o IP muda ou perto de vencer.
Basta instalar a CA uma vez em cada computador (confiar-certificado.bat ou /certificado.crt): as renovacoes
seguintes continuam confiaveis, sem aviso de "Nao seguro".
"""
import datetime
import ipaddress
import os
import socket

CA_ANOS = 10
SERVIDOR_DIAS = 825


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
    # 169.254.x = placa sem rede (Wi-Fi desligado, VPN, Tailscale): nao serve para acessar e mudaria o certificado
    return {ip for ip in ips if not ip.startswith(("127.", "169.254."))}


def _ip_valido(valor):
    try:
        ipaddress.ip_address(valor)
        return True
    except ValueError:
        return False


def _fim(c):
    try:
        return c.not_valid_after_utc
    except AttributeError:  # cryptography antigo
        return c.not_valid_after.replace(tzinfo=datetime.timezone.utc)


def _carrega(path):
    from cryptography import x509
    with open(path, "rb") as f:
        return x509.load_pem_x509_certificate(f.read())


def _salva_chave(chave, path):
    from cryptography.hazmat.primitives import serialization
    with open(path, "wb") as f:
        f.write(chave.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                    serialization.NoEncryption()))


def _salva_cert(cert, path):
    from cryptography.hazmat.primitives import serialization
    with open(path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))


def _uso(**sim):
    from cryptography import x509
    campos = ("digital_signature", "content_commitment", "key_encipherment", "data_encipherment", "key_agreement",
              "key_cert_sign", "crl_sign", "encipher_only", "decipher_only")
    return x509.KeyUsage(**{c: bool(sim.get(c)) for c in campos})


def _garantir_ca(pasta):
    """Cria a CA local se ainda nao existir (ou se estiver perto de vencer). Devolve (cert_ca, chave_ca)."""
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID
    ca_p, ca_k = os.path.join(pasta, "ca.pem"), os.path.join(pasta, "ca-key.pem")
    if os.path.exists(ca_p) and os.path.exists(ca_k):
        try:
            ca = _carrega(ca_p)
            if _fim(ca) - datetime.datetime.now(datetime.timezone.utc) > datetime.timedelta(days=SERVIDOR_DIAS):
                with open(ca_k, "rb") as f:
                    return ca, serialization.load_pem_private_key(f.read(), password=None)
        except Exception:
            pass
    chave = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    try:
        maquina = socket.gethostname()
    except Exception:
        maquina = "servidor"
    nome = x509.Name([
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Suporte"),
        x509.NameAttribute(NameOID.COMMON_NAME, ("Suporte - Autoridade local (%s)" % maquina)[:64]),
    ])
    agora = datetime.datetime.now(datetime.timezone.utc)
    ca = (
        x509.CertificateBuilder()
        .subject_name(nome).issuer_name(nome).public_key(chave.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(agora - datetime.timedelta(days=1))
        .not_valid_after(agora + datetime.timedelta(days=365 * CA_ANOS))
        .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
        .add_extension(_uso(key_cert_sign=True, crl_sign=True), critical=True)
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(chave.public_key()), critical=False)
        .sign(chave, hashes.SHA256())
    )
    _salva_chave(chave, ca_k)
    _salva_cert(ca, ca_p)
    return ca, chave


def _ainda_serve(cert_path, ips, ca):
    from cryptography import x509
    try:
        c = _carrega(cert_path)
        if c.issuer != ca.subject:  # certificado antigo (autoassinado) ou de outra CA
            return False
        if _fim(c) - datetime.datetime.now(datetime.timezone.utc) < datetime.timedelta(days=30):
            return False
        san = c.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
        tem = {str(i) for i in san.get_values_for_type(x509.IPAddress)}
        return set(ips) <= tem
    except Exception:
        return False


def _gerar(cert_path, key_path, ips, ca, ca_chave):
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes
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
        h = socket.gethostname()
        san.append(x509.DNSName(h))
        fq = socket.getfqdn()
        if fq and fq.lower() != h.lower() and "." in fq:
            san.append(x509.DNSName(fq))
    except Exception:
        pass
    san += [x509.IPAddress(ipaddress.ip_address(i)) for i in sorted(set(ips) | {"127.0.0.1"})]
    cert = (
        x509.CertificateBuilder()
        .subject_name(nome).issuer_name(ca.subject).public_key(chave.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(agora - datetime.timedelta(days=1))
        .not_valid_after(min(agora + datetime.timedelta(days=SERVIDOR_DIAS), _fim(ca)))
        .add_extension(x509.SubjectAlternativeName(san), critical=False)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(_uso(digital_signature=True, key_encipherment=True), critical=True)
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(chave.public_key()), critical=False)
        .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_chave.public_key()), critical=False)
        .sign(ca_chave, hashes.SHA256())
    )
    _salva_chave(chave, key_path)
    _salva_cert(cert, cert_path)


def caminho_ca(pasta):
    """Arquivo que os computadores devem instalar como confiavel (a CA local)."""
    p = os.path.join(pasta, "ca.pem")
    return p if os.path.exists(p) else None


def garantir(host, pasta):
    """Devolve (cert, chave, foi_gerado). Levanta excecao se nao der para gerar."""
    os.makedirs(pasta, exist_ok=True)
    cert, chave = os.path.join(pasta, "cert.pem"), os.path.join(pasta, "key.pem")
    # HOST com IP fixo (config.bat): o certificado so precisa desse IP. Assim, instalar VPN, Tailscale ou
    # Hyper-V (placas de rede novas) nao gera certificado novo.
    if host and _ip_valido(host) and host != "0.0.0.0":
        ips = {host}
    else:
        ips = ips_locais()
    ca, ca_chave = _garantir_ca(pasta)
    if os.path.exists(cert) and os.path.exists(chave) and _ainda_serve(cert, ips, ca):
        return cert, chave, False
    _gerar(cert, chave, ips, ca, ca_chave)
    return cert, chave, True
