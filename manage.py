# -*- coding: utf-8 -*-
"""Administracao pelo terminal.

  python manage.py listar
  python manage.py criar maria --nome "Maria Silva" --cargo "Analista" [--perfil supervisor|admin]
  python manage.py senha maria [--senha NovaSenha]
  python manage.py remover maria
  python manage.py backup
"""
import argparse
import getpass
import sys

import app as sistema


def pede_senha(dada=None, usuario="", nome=""):
    if dada:
        erro = sistema.seguranca.valida_senha(dada, usuario, nome)
        if erro:
            sys.exit(erro)
        return dada
    s1 = getpass.getpass("Senha: ")
    erro = sistema.seguranca.valida_senha(s1, usuario, nome)
    if erro:
        sys.exit(erro)
    if s1 != getpass.getpass("Repita a senha: "):
        sys.exit("As senhas não conferem.")
    return s1


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = p.add_subparsers(dest="cmd", required=True)
    sp.add_parser("listar")
    c = sp.add_parser("criar")
    c.add_argument("usuario")
    c.add_argument("--nome", required=True)
    c.add_argument("--cargo", default="")
    c.add_argument("--admin", action="store_true", help="atalho para --perfil admin")
    c.add_argument("--perfil", choices=["usuario", "supervisor", "admin"], default="usuario")
    c.add_argument("--senha", help="senha (se omitida, será pedida)")
    sn = sp.add_parser("senha")
    sn.add_argument("usuario")
    sn.add_argument("--senha", help="nova senha (se omitida, será pedida)")
    sp.add_parser("backup")
    sp.add_parser("remover").add_argument("usuario")
    a = p.parse_args()

    sistema.init_db()
    con = sistema.connect()
    u = getattr(a, "usuario", "").strip().lower()
    if a.cmd == "listar":
        for r in con.execute("SELECT * FROM usuarios ORDER BY usuario"):
            print("%-20s %-30s %s" % (r["usuario"], r["nome"], r["perfil"]))
    elif a.cmd == "criar":
        try:
            with con:
                con.execute("INSERT INTO usuarios(usuario,nome,cargo,senha_hash,admin,perfil,trocar_senha) VALUES(?,?,?,?,?,?,1)",
                            (u, a.nome, a.cargo, sistema.hash_senha(pede_senha(a.senha, u, a.nome)),
                             1 if (a.admin or a.perfil == "admin") else 0, "admin" if a.admin else a.perfil))
            print("Usuário criado.")
        except sistema.sqlite3.IntegrityError:
            sys.exit("Esse usuário já existe.")
    elif a.cmd == "senha":
        r = con.execute("SELECT id, nome FROM usuarios WHERE usuario=?", (u,)).fetchone()
        if not r:
            sys.exit("Usuário não encontrado.")
        nova = pede_senha(a.senha, u, r["nome"])
        with con:
            # tambem desbloqueia a conta: e o caminho de recuperacao de quem ficou trancado do lado de fora
            con.execute("UPDATE usuarios SET senha_hash=?, trocar_senha=0, falhas=0, bloq_ate=0 WHERE id=?",
                        (sistema.hash_senha(nova), r["id"]))
            n = sistema.seguranca.encerra_sessoes_usuario(con, r["id"])
        print("Senha alterada. %d sessão(ões) aberta(s) encerrada(s)." % n)
    elif a.cmd == "backup":
        print("Backup criado em %s: %s" % (sistema.BACKUP_DIR, sistema.fazer_backup()))
    elif a.cmd == "remover":
        with con:
            n = con.execute("DELETE FROM usuarios WHERE usuario=?", (u,)).rowcount
        print("Usuário removido (com as atividades dele)." if n else "Usuário não encontrado.")


if __name__ == "__main__":
    main()
