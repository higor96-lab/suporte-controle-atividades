# Suporte - Controle de Atividades

Sistema local (Flask + SQLite) com login, atividades por usuário, relatórios em Excel/PDF e administração de usuários.

## Como rodar (Windows)

1. Instale o Python 3.10+ (marque **Add Python to PATH**).
2. (Opcional) Copie `config.exemplo.bat` para `config.bat` e ajuste IP, porta e opções. Sem ele, o sistema atende em todos os IPs da máquina, na porta 5000.
3. Dê dois cliques em `iniciar.bat` (cria o ambiente, instala as dependências e sobe o servidor). A janela mostra os endereços de acesso.
4. Acesse **`https://IP-DO-SERVIDOR:5000`** de qualquer PC da rede (`python meuip.py` mostra os IPs da máquina).
5. Se outros PCs não abrirem, execute `liberar-firewall.bat` **como administrador**.

**Primeiro acesso (banco novo):** usuário `admin`. A senha provisória é sorteada e aparece **na janela do `iniciar.bat`** na primeira execução. Anote-a: o sistema pede a troca logo no primeiro login. Se perder, rode `python manage.py senha admin`. Depois, crie os usuários da equipe em *Administração > Usuários* e, se quiser, troque o nome do administrador por ali. A senha é alterada no menu da conta (círculo com as iniciais, no canto superior direito).

**Hospedar na internet** (demonstração pública ou acesso da equipe de fora da rede): veja [HOSPEDAGEM.md](HOSPEDAGEM.md).

## HTTPS (conexão segura)

O sistema gera sozinho um certificado próprio na pasta `certs/` (renovado automaticamente quando o IP muda ou perto de vencer). Como ele não é de uma autoridade pública, o navegador mostra "Não seguro" até você **instalar o certificado** como confiável:

- **No computador do servidor:** clique com o botão direito em `instalar-certificado.bat` > Executar como administrador. Depois feche e abra o navegador.
- **Nos outros computadores:** abra `https://IP-DO-SERVIDOR:5000/certificado.crt` (aceite o aviso uma vez), salve o arquivo e, como administrador, rode `certutil -addstore -f ROOT suporte.crt`.

A conexão já é criptografada mesmo sem instalar; a instalação só remove o aviso. Para voltar ao HTTP simples, coloque `set HTTPS=0` no `config.bat`.

## Sessão

Quem fica parado é desconectado depois de `SESSAO_MIN` minutos (padrão 60; 0 desativa). Dois minutos antes aparece um aviso com o botão "Continuar conectado". Atualizações automáticas da tela não renovam o prazo; só o uso real.

## Salvamento

Cada alteração grava só a atividade que mudou, e a tela busca as mudanças feitas em outro computador a cada 20 segundos. O mesmo usuário pode usar dois computadores sem um apagar o trabalho do outro.

## Modo escuro e atalhos

Botão de lua/sol no topo (ou tecla `T`). A escolha fica salva no navegador. Tecla `?` mostra os atalhos: `N` nova atividade, `/` buscar, `G` + `V/P/R/G/H/U/B` navegar.

## Uso pelo celular
O sistema se adapta à tela pequena: menu inferior (Hoje, Atividades, **+**, Busca, Menu) e menu lateral que abre por cima.
1. Conecte o celular ao mesmo Wi-Fi do servidor e abra `https://IP-DO-SERVIDOR:5000` (ou `http://...` se o HTTPS estiver desligado).
2. **Android (Chrome):** menu ⋮ → *Instalar app* (ou *Adicionar à tela inicial*). **iPhone (Safari):** Compartilhar → *Adicionar à Tela de Início*.
3. O botão **Usar no celular**, no menu, mostra o endereço e essas instruções.

Observação: a instalação completa como aplicativo (sem barra do navegador, no Android) só é oferecida com **HTTPS e certificado instalado no celular**
(baixe `https://IP-DO-SERVIDOR:5000/certificado.crt` no celular e instale). Em HTTP simples, o atalho na tela inicial funciona normalmente.

## Busca geral
Menu *Atividades → Busca geral* (ou o ícone da lupa). Procura em título, descrição, pessoa e tipo, sem diferenciar acentos nem maiúsculas.
Várias palavras = todas precisam aparecer. Filtros por período (com atalhos 7 dias, 30 dias, mês, ano), tipo, situação e prioridade.
Dá para editar, concluir ou excluir direto no resultado e exportar o resultado em CSV.

## Importar de planilha (Excel)
Menu *Dados → Importar dados*:
1. **Baixar modelo Excel** (colunas: Data, Hora, Duração, Título, Tipo, Com quem, Prioridade, Situação, Descrição; listas de opções já prontas).
2. Preencha e envie o `.xlsx` (botão ou arrastando o arquivo).
3. O sistema mostra uma **prévia** com as linhas válidas e os erros (por exemplo, data inválida). Atividades que já existem (mesma data, hora e título) são ignoradas por padrão.
4. Confirme em **Importar**. Limite: 2000 linhas e 6 MB por arquivo. O importador por CSV continua disponível em "avançado".

## Novidades da versão 3.3 (gráficos e telas)

**Gráficos** (*Relatórios > Gráficos*)
- Cartões no topo: concluídas, taxa de conclusão, horas, % no prazo e tempo real médio, cada um com **▲▼ em relação ao período anterior** (desligue em "Comparar com o período anterior").
- Passe o mouse (ou use Tab) em qualquer barra, segmento ou célula para ver os valores. **Clique** para abrir a lista das atividades por trás do número; as suas abrem direto para edição, e a lista pode ser exportada em CSV.
- Concluídas por dia com **linha da meta** e a linha do **período anterior**. Clique numa semana do "Semana a semana" para filtrar aquela semana.
- Novos: **Quem mais demanda** (por solicitante/setor, campo "Com quem") e **Precisão das estimativas** (real × previsto, com as que mais estouraram).
- Botão **⤓ PNG** em cada gráfico e **Modo apresentação** (tela cheia, sem menus; Esc sai).

**Telas**
- Menu com 5 seções (Hoje, Atividades, Relatórios, Equipe, Administração) e **abas** no topo de cada seção.
- **Ctrl+K** (ou "Buscar ou ir para…" no topo): acha qualquer atividade, tela ou ação.
- Menu da conta no círculo com as iniciais: aparência, segurança, senha, celular, atalhos, sair.
- Formulário da atividade abre como **painel lateral**.
- **Selecionar** (na lista do dia, em Atividades e na Busca): marque várias e conclua, reabra, mova de data, troque tipo/prioridade ou exclua de uma vez (Ctrl+Z desfaz).
- **Linha do tempo** do dia (botão ao lado de "Lista"): horários, hora atual e **horários livres** — clique num livre para criar a atividade nele.
- Painel da equipe com **semáforo** (atrasadas / abaixo do ritmo / em dia) e botão para ver as atividades da pessoa.
- Interface separada em arquivos (`static/css`, `static/js`); o navegador baixa a versão nova sozinho quando um arquivo muda.

## Novidades da versão 3.2 (segurança)

- **Senhas:** mínimo de 8 caracteres. Senhas óbvias (como "senha123", "Suporte@2026" ou "12345678"), o próprio nome de usuário e só o nome da pessoa são recusados. Senhas antigas continuam valendo; a regra vale na próxima troca.
- **Sessões:** trocar a própria senha desconecta os outros computadores e celulares (o atual continua). Quando o administrador redefine a senha ou reseta o 2FA de alguém, todas as sessões dessa pessoa são encerradas. Restaurar um backup desconecta todo mundo.
- **Histórico:** desbloquear conta, resetar 2FA e encerrar a sessão de outra pessoa ficam registrados em Histórico de alterações.
- **Backup com anexos:** veja a seção Backup.
- **Desfazer atualização:** antes de aplicar um `.zip`, o sistema guarda os arquivos da versão atual em `versoes_anteriores/` (as 3 últimas). Em *Administração > Sobre e atualização* aparece o botão **Voltar para a versão anterior**. Só o programa volta; dados não são tocados. Depois, reinicie o `iniciar.bat`.
- **Proteção da página (CSP):** o navegador só executa os scripts do próprio sistema. Se alguma tela parar de funcionar depois de atualizar, coloque `set CSP=0` no `iniciar.bat` para desligar e avise o responsável.
- `python manage.py senha <usuario>` também desbloqueia a conta e encerra as sessões abertas.

## Novidades da versão 3.1

**Anexos** — dentro da atividade (editar), botão "Anexar arquivo", arrastar e soltar ou colar um print com **Ctrl+V**.
Aceita imagens, PDF, Word, Excel, PowerPoint, CSV e TXT (até 10 MB cada, 20 por atividade). O clipe 📎 aparece na lista.
Os arquivos ficam na pasta `anexos/` (mude com `ANEXOS_DIR`). Desde a versão 3.2 eles entram no backup automaticamente
(veja Backup). Ao excluir a atividade, os anexos dela são apagados.

**Prazo (SLA)** — campo "Prazo" (data e, se quiser, hora). A lista mostra "vence em…" ou "vencido", o item **Atrasadas**
no menu mostra a contagem e filtra. Os relatórios (tela, Excel e PDF) ganharam as colunas Prazo e Situação do prazo,
e os Gráficos mostram o percentual cumprido no prazo.

**Modo foco** — menu Atividades > Modo foco (ou "Modo foco" no ⋯ da atividade): tela limpa com a atividade em andamento,
cronômetro grande, subtarefas, Concluir e Pular. `Esc` sai.

**Gráficos novos** — previsto × realizado por tipo, cumprimento de prazos, semana a semana (8 semanas) e mapa de calor
por dia da semana e hora.

**Verificação em duas etapas (2FA)** — menu "Segurança da conta": escaneie o QR no Google Authenticator, Microsoft
Authenticator ou similar e confirme o código. São gerados 8 códigos de recuperação (guarde-os). Se alguém perder o celular,
o administrador pode resetar em Usuários > Resetar 2FA. Para **exigir** 2FA de todos os administradores, coloque
`set EXIGIR_2FA_ADMIN=1` no `iniciar.bat`. O código usa o relógio do celular e do servidor: mantenha os dois no horário certo.

**Bloqueio por tentativas** — 5 senhas (ou códigos) errados seguidos bloqueiam a conta por 15 minutos. O administrador recebe o
aviso em Administração > Saúde e acessos (e um selo no menu) e pode desbloquear na hora, por ali ou em Usuários.

**Sessões abertas** — "Segurança da conta" mostra onde a sua conta está conectada e permite encerrar as outras sessões.
O administrador vê e encerra as sessões de todos em Saúde e acessos.

**Sobre e atualização** — Administração > Sobre e atualização: mostra a versão e o histórico do que mudou. Para atualizar,
envie o `.zip` da nova versão: o sistema confere a versão, lista as novidades, faz backup do banco e só então aplica.
Não mexe em dados, usuários, anexos, certificado nem no `iniciar.bat` (a sua configuração de IP/porta fica como está).
Depois de aplicar, feche a janela do `iniciar.bat`, abra de novo e use Ctrl+F5.

## Novidades da versão 3

**Atividades**
- **Subtarefas**: checklist dentro da atividade, com barra de progresso (ex.: 2/5).
- **Etiquetas**: palavras livres (#cliente, #urgente) com filtro na lista e na busca geral.
- **Fixar** (★): atividades fixadas aparecem sempre no topo.
- **Cronômetro**: botão Iniciar/Parar em cada atividade. Só um roda por vez, o tempo real fica salvo
  (campo "Tempo real" editável) e entra nos relatórios (Excel e PDF).
- **Desfazer**: após concluir, excluir ou mover, aparece "Desfazer" (ou Ctrl+Z).
- **Lembretes**: aviso 10 minutos antes do horário (dentro do sistema; avisos do navegador só em HTTPS).

**Visões**
- **Calendário** (semana/mês): arraste uma atividade para outro dia para reagendar.
- **Quadro** (kanban): colunas Pendentes / Em andamento / Concluídas; arraste ou use as setas.

**Aparência e uso**
- Botão Aparência: tema, cor de destaque (6 opções), tamanho da letra e densidade (confortável/compacta).
- Resumo de boas-vindas ao entrar e tutorial rápido no primeiro acesso (reabrir em Aparência).
- Celular: deslize o cartão para a direita para concluir e para a esquerda para excluir.
- Telas vazias com orientação, cores por tipo de atividade e animações suaves.

**Segurança e qualidade**
- **Proteção contra edição simultânea**: se outra sessão alterou a mesma atividade, o sistema avisa
  e mostra a versão mais recente em vez de sobrescrever.
- **Registro de acessos** (últimos 200 logins, 90 dias) e **Saúde do sistema** (banco, backups,
  usuários online, disco, HTTPS) em Administração > Saúde e acessos.

Atualização: extraia por cima da pasta atual (mantenha data.db), reinicie o iniciar.bat e use Ctrl+F5.
O banco é atualizado sozinho, sem perder dados.

## Mudar IP ou porta

Copie `config.exemplo.bat` para `config.bat` e edite `HOST` e `PORT` (o `iniciar.bat` e o `liberar-firewall.bat` leem esse arquivo).
O `config.bat` fica só nesta máquina: não vai para o Git e as atualizações não mexem nele.
Rode `python meuip.py` para ver os IPs da máquina. Se o IP configurado não existir aqui, o sistema sobe em `0.0.0.0` e avisa.

## Arquivos

| Arquivo | Função |
|---|---|
| `app.py` | Servidor, login, API de atividades e usuários |
| `seguranca.py` | Verificação em duas etapas, bloqueio de conta, avisos e sessões |
| `anexos.py` | Anexos das atividades |
| `prazos.py` | Regras de prazo (SLA) |
| `atualizar.py` | Tela Sobre e atualização |
| `versao.py`, `changelog.json` | Versão e histórico de mudanças |
| `relatorios.py` | Relatórios (tela, Excel, PDF) |
| `importar.py` | Modelo e leitura de planilhas Excel |
| `certificado.py` | Certificado HTTPS automático |
| `gestao.py` | Histórico de alterações, metas e gráficos |
| `manage.py` | Terminal (`listar`, `criar`, `senha`, `remover`, `backup`) |
| `meuip.py` | Mostra os IPs da máquina |
| `static/index.html` | Estrutura da interface |
| `static/css/` | Estilos (`app.css` base, `graficos.css`, `telas.css`) |
| `static/js/` | Comportamento (`app.js` principal, `graficos.js`, `telas.js`, `shell.js`, `login.js`, `icons.js`) |
| `config.exemplo.bat` | Modelo de configuração local (copie para `config.bat`) |
| `wsgi.py`, `demo.py` | Hospedagem (WSGI) e modo demonstração — ver `HOSPEDAGEM.md` |
| `static/qrcode.js` | Gerador de QR code do 2FA (funciona sem internet) |
| `static/manifest.webmanifest`, `static/sw.js`, `static/icons/` | Instalação como app no celular |
| `data.db` | Banco SQLite (criado sozinho) |
| `anexos/` | Arquivos anexados às atividades (criada sozinha) |
| `secret.key` | Chave das sessões (criada sozinha) |
| `versoes_anteriores/` | Cópia do programa antes de cada atualização (para desfazer; guarda as 3 últimas) |

## Senhas

Usuários criados pelo administrador (ou com senha redefinida na tela de Usuários) precisam trocar a senha no primeiro acesso.

## Perfis de acesso

| Perfil | O que vê e faz |
|---|---|
| **Usuário** | Só as próprias atividades, relatórios, gráficos e histórico. |
| **Supervisor** | Tudo do usuário, mais o Painel da equipe, relatórios e gráficos de todos, histórico de todos e definição de metas. |
| **Administrador** | Tudo do supervisor, mais cadastro de usuários, perfis, senhas e backups. |

O administrador define o perfil na tela **Administração > Usuários**. Pelo terminal: `python manage.py criar maria --nome "Maria" --perfil supervisor`.

## Gráficos

**Relatórios > Gráficos**: concluídas por dia, tempo concluído por tipo de atividade e, para supervisores/administradores, comparação entre pessoas (visão "Toda a equipe"). Período de até 92 dias.

## Metas

No **Painel da equipe**, o botão **Definir metas** (supervisor/administrador) cria uma meta padrão por dia e por semana (em atividades concluídas) e metas individuais opcionais. As barras de meta aparecem no painel e cada pessoa vê a sua no cartão "Ritmo do dia".

## Histórico de alterações

**Relatórios > Histórico de alterações** registra quem criou, alterou (com o antes e depois) ou excluiu cada atividade, e quando. O administrador também vê as mudanças de usuários, perfis e senhas. Usuário comum vê só o próprio histórico. Fica guardado por 365 dias (variável `HISTORICO_DIAS` no `iniciar.bat`).

## Painel da equipe

Menu **Equipe > Painel da equipe**: mostra, por pessoa, as atividades do dia (pendentes, em andamento e concluídas), o ritmo e o total da equipe. Atualiza sozinho a cada 30 segundos.

## Backup

- **Automático:** o sistema faz 1 backup por dia na pasta `backups/` (confere a cada hora) e mantém os 30 mais recentes. Para mudar, use as variáveis `BACKUP_DIR` (pasta, pode ser outro disco ou pasta de rede) e `BACKUP_KEEP` (quantidade) no `iniciar.bat`.
- **Manual:** botão "Fazer backup agora" na tela de Usuários, ou `python manage.py backup`.
- **Anexos:** cada backup também copia os anexos para `backups/anexos/`. Como um anexo nunca muda, cada arquivo é copiado uma vez só, e não a cada dia. Anexos que nenhum backup guardado usa mais são removidos dessa pasta sozinhos. Para levar o backup para outro lugar, copie a pasta `backups/` inteira (os `.db` **e** a subpasta `anexos/`).
- **Restaurar:** administrador > **Backups** > Restaurar (o sistema valida o arquivo, guarda uma cópia do estado atual, traz de volta os anexos daquele backup e desconecta todos). Backups feitos antes da versão 3.2 não têm os anexos guardados. Também dá para baixar cada backup (só o banco) por ali.
