# Hospedagem

Dois cenários diferentes, com cuidados diferentes:

| | A) Demonstração pública | B) Equipe usando de fora da rede |
|---|---|---|
| Para quê | Mostrar o sistema (portfólio, apresentação) | Usar o sistema **real** de casa ou do celular |
| Dados | Fictícios, recriados a cada 24 h | Os reais, que continuam no servidor da empresa |
| Onde roda | Serviço na nuvem (PythonAnywhere) | No servidor de sempre, com acesso por rede privada |

---

## A) Demonstração pública no PythonAnywhere (grátis)

Com `DEMO=1` o sistema cria uma equipe fictícia e entra como visitante com **`demo` / `demo`** (já preenchido na tela de login).
O visitante pode criar, editar e concluir atividades e ver gráficos, painel e relatórios. Ficam **desligados**:
administração de usuários, troca de senha e 2FA, anexos, backups, atualização por `.zip`, sessões e a tela de saúde.
Tentar senhas erradas não tranca a conta compartilhada, e os dados voltam ao original a cada 24 h (`DEMO_HORAS` muda isso).

1. Crie uma conta grátis em <https://www.pythonanywhere.com> (plano *Beginner*). O site fica em `https://SEU-USUARIO.pythonanywhere.com`.
2. Abra **Consoles → Bash** e rode:
   ```bash
   git clone https://github.com/higor96-lab/suporte-controle-atividades.git
   cd suporte-controle-atividades
   pip3.12 install --user -r requirements.txt
   ```
3. Aba **Web → Add a new web app → Manual configuration → Python 3.12** (a mesma versão do `pip3.12` acima).
4. Ainda na aba Web:
   - **Source code** e **Working directory**: `/home/SEU-USUARIO/suporte-controle-atividades`
   - **Force HTTPS**: ligado
5. Clique no link do **WSGI configuration file**, apague o conteúdo e cole (troque `SEU-USUARIO`):
   ```python
   import os, sys
   os.environ["DEMO"] = "1"    # demonstracao com dados ficticios
   os.environ["PROXY"] = "1"   # o PythonAnywhere fica na frente com HTTPS
   os.environ["SQLITE_WAL"] = "0"  # disco de rede: modo de diario simples do SQLite
   sys.path.insert(0, "/home/SEU-USUARIO/suporte-controle-atividades")
   from wsgi import application
   ```
6. Botão verde **Reload** e abra o endereço do site.

**Atualizar a demonstração** depois de enviar mudanças ao GitHub:
```bash
cd ~/suporte-controle-atividades && git pull
```
e **Reload** na aba Web.

**Plano grátis:** o site para se ninguém renovar. Na aba Web há um botão *Run until …* — clique nele antes de vencer
(hoje o prazo é de 1 mês; o PythonAnywhere manda e-mail avisando).

> Nunca use `DEMO=1` com o banco de dados real: a demonstração **apaga e recria** todos os dados.

---

## B) Equipe usando o sistema real de fora da rede

**Antes de tudo: peça autorização ao TI.** Expor um sistema interno costuma ter regras da empresa.
**Não** abra a porta do roteador direto para a internet.

Opções, da mais simples para a mais trabalhosa:

1. **VPN que a empresa já tem.** Se o TI já oferece VPN, a equipe conecta nela e abre o endereço de sempre. Nada muda no sistema.
2. **Tailscale** (rede privada; só quem você autorizar entra; HTTPS com certificado válido, sem aviso no navegador).
   O plano grátis *Personal* é **só para uso não comercial** — para a equipe de uma empresa, use um plano pago (*Starter*) ou peça ao TI.
   1. No servidor (o computador do `iniciar.bat`): instale o Tailscale (<https://tailscale.com/download> ou `winget install Tailscale.Tailscale`) e entre com a conta da equipe.
   2. No painel do Tailscale (<https://login.tailscale.com/admin/dns>): ligue **MagicDNS** e **HTTPS Certificates**.
   3. No servidor, num terminal **como administrador** (troque pelo IP e porta do `config.bat`):
      ```
      tailscale serve --bg https+insecure://IP-DO-SERVIDOR:5000
      ```
      O comando mostra o endereço, algo como `https://NOME-DO-PC.nome-da-rede.ts.net`. O `--bg` mantém isso ligado mesmo após reiniciar.
   4. Cada pessoa instala o Tailscale no celular/PC, entra na rede (convite pelo painel, *Users → Invite*) e abre o endereço acima.
      O login no sistema continua o mesmo, com usuário, senha e 2FA.
   5. Opcional: coloque `set PROXY=1` no `config.bat` para o sistema registrar o IP real de quem acessa (e não o do próprio servidor).
3. **Cloudflare Tunnel + Cloudflare Access.** Endereço na internet com HTTPS, mas protegido: a pessoa confirma o e-mail
   antes de ver a tela de login. Exige um domínio próprio e configuração no painel da Cloudflare; peça ao TI.

Com qualquer uma delas, mantenha a **verificação em duas etapas** ligada para os administradores (`set EXIGIR_2FA_ADMIN=1` no `config.bat`).
