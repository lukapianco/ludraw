# Changelog

<!-- audit:name:nota-início -->
Todas as mudanças relevantes do LuDraw são registradas aqui. **O projeto se chamava OpenDraw antes de ser publicado** (veja "Alterado — o projeto passa a se chamar LuDraw" na versão 0.9.0); as entradas antigas mantêm o nome da época.
<!-- audit:name:nota-fim -->

O formato segue o [Keep a Changelog 1.1.0](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa [Versionamento Semântico](https://semver.org/lang/pt-BR/). Enquanto a versão for `0.x`, mudanças incompatíveis podem acontecer em versões menores — boards salvos, porém, continuam abrindo.

As versões **0.1.0 a 0.5.0 foram numeradas retroativamente**, uma por etapa de desenvolvimento (Chats 01 a 05); de 0.5.0 o projeto vai direto para 0.9.0, que reúne os Chats 06 a 09.1 (servidor, tempo real, administração, instalação com Docker e programa desktop). Os IDs `FT-…` apontam para o catálogo em [`docs/FEATURES.md`](docs/FEATURES.md).

## [Não lançado]

## [0.9.0] — ainda sem data (a tag `v0.9.0` é criada pelo mantenedor) · Chats 06 a 09.1

A partir desta versão, o número vem de um lugar só: o `package.json` da raiz. Servidor, lockfiles, imagem Docker e o `/api/v1/info` seguem esse número, e `npm run audit:version` confere que estão iguais.

### Adicionado (Chat 09.1 — programa desktop para Windows e Linux)
- **Programa desktop** (Tauri 2, sem plugins). Na primeira abertura, ele pergunta onde trabalhar:
  - **neste computador** (Modo Local, sem conta e sem internet);
  - no **servidor da organização**: o endereço é testado antes, mostrando a organização e o login da empresa.
  A escolha fica guardada. Para trocar: menu **LuDraw → Trocar onde trabalhar…**
- **Problemas de conexão explicados:** endereço inválido, nome que não existe, servidor fora do ar, endereço que não é um LuDraw, versão incompatível e certificado próprio não confiável. Este último não ensina a ignorar o aviso.
- **Uso no dia a dia:** links para outros sites abrem no navegador do sistema; os arquivos exportados vão para a pasta Downloads; o menu nativo fica em pt-BR ou inglês; só uma cópia do programa abre por vez.
- **Ao fechar, o programa espera o board terminar de gravar** (até 10 s).
- **Instaladores:**
  - Windows: NSIS, só para o seu usuário, sem administrador, em inglês e pt-BR. O WebView2 é baixado da Microsoft só se faltar.
  - Linux: pacote `.deb` `ludraw`, para Debian 12+ e Ubuntu 22.04+.
  - Desinstalar não apaga os boards.
  - Os instaladores não têm assinatura de código: o README explica o aviso do Windows e como conferir o `SHA256SUMS`.
- **Onde ficam os dados:** `%LOCALAPPDATA%\app.ludraw` (Windows) e `~/.local/share/app.ludraw` (Linux). Os boards do programa são separados dos do navegador; leve-os por backup.
- **Segurança:**
  - só a janela "onde trabalhar" fala com o programa;
  - no Modo Servidor, a janela só navega no servidor escolhido e no emissor do login da empresa;
  - a CSP continua sem `unsafe-inline` nem `eval` em script.
- **Servidor:** o `/api/v1/info` ganhou o campo opcional `ssoOrigin` e responde ao programa desktop (CORS só no `GET /info`, sem credenciais).
- **Avisos e licenças:**
  - crates Rust com licença conferida, versão e SHA-256 pelo `npm run audit:legal`;
  - avisos de terceiros do programa (`npm run notices:desktop`) dentro dos dois instaladores.
- **CI:** `test:desktop` e os testes do Rust no Windows e no Linux. O workflow **Desktop** (manual ou por tag) gera, instala e testa os instaladores, publica o `SHA256SUMS` e, na tag, cria um Release em rascunho.
- **Novos comandos:** `desktop:dev`, `desktop:package`, `notices:desktop`, `crates`, `test:desktop`, `test:desktop:rust`, `test:desktop:app` e `test:desktop:package`.

### Alterado — o projeto passa a se chamar LuDraw (renomeação, antes da primeira publicação)
O projeto, até aqui chamado **OpenDraw**, passa a se chamar **LuDraw**, de Luka Piancó (LUKA.DEV), com repositório em `github.com/lukapianco/ludraw`. Como nada tinha sido publicado nem distribuído, a troca **não mantém compatibilidade** com o nome antigo:
- **Nome e marca:** "LuDraw" em todos os textos (pt-BR e en), wordmark "Lu"+"Draw" em dois tons no app, nos e-mails (faixas regeradas) e nos banners do README; o `LICENSE` (e suas cópias nas extensões embutidas) passa a ter Luka Piancó como titular.
- **Identificadores técnicos:** pacotes `ludraw` e `ludraw-server`; imagem Docker `ludraw`, comando de operação `ludraw`, projeto do compose `ludraw`; banco `ludraw` e papéis `ludraw_owner`, `ludraw_migrator` e `ludraw_app`; arquivos `deploy/ludraw.env.example` e `deploy/postgres/10-ludraw-roles.sql`.
- **Variáveis de ambiente:** todas as `OPENDRAW_*` citadas nas entradas abaixo agora se chamam **`LUDRAW_*`** (mesmo sufixo). O nome antigo não é lido.
- **Arquivos e formatos:** backups `.ludraw`, `.ludraw-workspace` e pacotes de extensão `.ludraw-ext`; backup do Docker com `format: "ludraw-backup"`. Arquivos `.opendraw*` **não abrem**.
- **Extensões:** prefixo reservado `dev.ludraw.` e API `ludraw.*` no lugar de `dev.opendraw.` e `opendraw.*`.
- **Armazenamento e sessão:** chaves `ludraw:*` no navegador, bancos IndexedDB `ludraw` e `ludraw-srv-<servidor>`, cookies `ld_rt` e `ld_sso`, cabeçalho `x-ludraw-client`, chaves `ludraw:*` no Redis/Valkey e constantes de derivação de chave com o nome novo. O que estava salvo com o nome antigo não é migrado; sessões abertas caem.
- **Prefixo `od`:** tokens `--od-*`, classes `od-*`, `OdIcon`, `data-od-*` e marcadores internos continuam como prefixo técnico histórico (veja o CONTRIBUTING).
- **Guarda:** `npm run audit:name` (também no CI) falha se o nome antigo voltar a qualquer arquivo ou nome de arquivo fora das exceções listadas no script.

<!-- audit:name — daqui para baixo é histórico: as entradas mantêm o nome da época (OpenDraw) -->

### Adicionado (Chat 09 — integração contínua, Rodada 6)
- **CI com cinco jobs:**
  - segredos: o gitleaks varre o histórico inteiro, com o binário do release oficial e o SHA-256 conferido;
  - verificações rápidas, agora também com `npm audit signatures`, `npm audit --omit=dev --audit-level=high`, `test:design` e `audit:version`;
  - testes do servidor num PostgreSQL e num Valkey descartáveis;
  - teste da imagem Docker (backup e restauração incluídos);
  - teste com duas instâncias.
- As actions do CI ficam fixadas pelo SHA do commit.
- `.gitleaksignore`, com os falsos positivos já triados e o motivo de cada um.
- Gancho opcional de pré-commit: `scripts/pre-commit-gitleaks.sh` (CONTRIBUTING §2.1).

### Adicionado (Chat 09 — pedidos do usuário, Rodada 5)
- **Tela "Sistema visual" opcional** (`OPENDRAW_ENABLE_DESIGN_SYSTEM`, padrão ligada; a imagem Docker desliga). Desligada:
  - somem o item do menu do usuário, a entrada da paleta de comandos (também na busca), o link do rodapé da Mesa e o da tela de entrada;
  - `#/design-system` leva à tela inicial;
  - o Modo Local servido por essa instalação segue a mesma escolha. Sem servidor (desenvolvimento, desktop no Modo Local), continua ligada.
- O `/api/v1/info` ganhou o campo `designSystem`.

### Alterado (Chat 09 — Rodada 5)
- **E-mail no `multi_org`:** o painel "Envio de e-mail" não aparece mais na Administração. Ler, salvar e o botão de teste respondem 409 (`mailSettingsServerOnly`). O e-mail do servidor continua configurado pelas variáveis `OPENDRAW_SMTP_*`.

### Adicionado (Chat 09 — várias instâncias com Redis/Valkey, Rodada 4)
- **Redis/Valkey opcional** (`OPENDRAW_REDIS_URL` ou `_FILE`; no compose, o perfil `redis` com Valkey). Com várias instâncias atrás de um balanceador, elas passam a dividir:
  - os limites de tentativa: login, e-mail, links com token, senha de link público, convites, "Baixar para o board";
  - o teto geral por IP;
  - o aviso "o painel de e-mail mudou", que faz cada instância recarregar o envio sem reiniciar.
- **Redis fora do ar:**
  - quando o servidor sobe: ele não sobe e explica o motivo, sem mostrar a senha;
  - com o servidor rodando: as rotas com limite respondem 503 ("tente de novo em alguns instantes") em vez de liberar sem contar, e o resto do app continua. A reconexão é automática.
- No Redis, IPs e e-mails ficam só como hash.
- A manutenção de hora em hora roda numa instância por vez, com uma trava no PostgreSQL.
- Sem Redis, nada muda: os limites continuam em memória.
- `npm run test:server:multi`: duas instâncias com Postgres e Valkey descartáveis.

### Adicionado (Chat 09 — instalação com Docker, Rodada 3)
- **Imagem Docker única** (`Dockerfile`): o servidor serve o app web na mesma origem da API, com a CSP e os cabeçalhos de segurança.
  - Base `node:22-alpine` fixada por digest; usuário sem privilégios (uid 10001); código só leitura.
  - Sem npm nem dependências de desenvolvimento, sourcemaps, `.env` ou anotações internas.
- **`docker-compose.yml` de produção** com banco, migração e app:
  - o PostgreSQL cria sozinho os papéis de privilégio mínimo na primeira subida;
  - a migração roda antes do app;
  - as senhas chegam só por arquivo (Docker secrets);
  - o banco fica numa rede interna, sem saída para a internet.
- `npm run docker:secrets` gera os segredos aleatórios sem mostrar os valores.
- `npm run docker:backup` e `npm run docker:restore` fazem o backup e a restauração do banco e das imagens, com SHA-256 conferido. A restauração funciona numa máquina nova, com segredos novos.
- Comando `opendraw` dentro do contêiner para operação: `docker compose exec app opendraw setup:token`.
- Guias `docs/DOCKER.md` e `docs/BACKUP.md`.
- `npm run test:docker` constrói a imagem e testa a instalação de ponta a ponta: primeiro acesso, login, board com imagem, tempo real, e-mail, backup, apagar tudo e restaurar.

### Adicionado (Chat 09 — o servidor serve o app, Rodada 2)
- **Cabeçalhos de segurança do navegador:** CSP sem `unsafe-eval` e com hash nos scripts embutidos, COOP/CORP, `Permissions-Policy`, `Referrer-Policy` e HSTS (só por HTTPS).
  - A política é a mesma no servidor e no Vite (desenvolvimento e `preview`).
  - `OPENDRAW_FRAME_ANCESTORS` libera sites para incorporar boards.
  - `OPENDRAW_CSP_CONNECT_SRC` libera hosts para extensões com permissão de rede.
- **"Baixar para o board":** a imagem de outro site passa a ser buscada pelo servidor, com proteção contra acesso à rede interna (FT-OBJETOS-007).

### Corrigido (Chat 09 — banco, Rodadas 1 e 3)
- **Papéis separados no banco:** o app roda só com permissão de ler e gravar dados; a migração usa outro papel e saiu do boot em produção.
  - Consultas com tempo limite: 15 s por consulta e 30 s de transação parada.
- O servidor compilado (`server/dist`) voltava a falhar ao subir ("Dynamic require of lib0/observable"). O teste da imagem passa a pegar esse erro.
- Instalação nova não deixa mais um `ERROR` no log do PostgreSQL.
- Sem sourcemaps no build do servidor por padrão (`OPENDRAW_SOURCEMAP=1` liga).

### Adicionado (Chat 08.6 — avisos de terceiros e auditores, Rodada D)
- **Avisos de terceiros:** `THIRD_PARTY_NOTICES.txt` (app) e `server/THIRD_PARTY_NOTICES.txt` (servidor), gerados por `npm run notices` a partir dos lockfiles com o texto de licença de cada pacote e de cada fonte, e copiados para o `dist/` em cada build.
- **`npm run audit:legal` só confere** (o relatório é gravado por `npm run docs:legal`) e varre também README em inglês, CHANGELOG, CONTRIBUTING, SECURITY, `.github/`, `scripts/` e os testes do servidor; bloqueia se os avisos de terceiros faltarem ou estiverem desatualizados.
- Faixas dos e-mails: o SHA-256 de cada imagem fica registrado e é conferido pelos testes; o gerador falha se a fonte não carregar.

### Corrigido (Chat 08.6 — origem e documentos, Rodada C)
- **Board de boas-vindas e permissão de extensão** falam do Estúdio atual (Cinta do objeto, busca `Ctrl K`, janela da extensão) em vez do Painel lateral removido.
- **README:** sem as capturas de tela quebradas (voltam quando houver capturas do layout atual).
- **Sistema visual:** aponta para `docs/DESIGN_SYSTEM.md` e não fala mais de processo interno.
- **Origem:** as regras de sala limpa e as referências de desenho dos ícones e da splash passam a ser versionadas, com SHA-256 conferido pelo `audit:legal`; política de versões novas só com 7 dias ou mais.

### Corrigido (Chat 08.6 — contraste e tamanhos, Rodada B)
- **Contraste nos dois temas:** texto de apoio (terciário) passa de 3,4–4,2:1 para ≥ 4,6:1 em todo fundo, mantendo a hierarquia; anel de foco sólido (≥ 3:1, antes 1,5:1); borda dos campos ≥ 3:1 (antes 1,4:1); cores de sucesso e de aviso e a estrela de favorito ajustadas. Antes 26 pares abaixo do mínimo, agora nenhum.
- **Foco não some mais** quando o ponteiro está sobre o campo focado.
- **Nenhum texto da interface abaixo de 11 px** (selos, contadores, iniciais).
- **Sistema visual:** a tabela de contraste mede os tokens reais (claro e escuro) e mostra todos os pares; cores fixas da interface viraram tokens.
- Novo teste `npm run test:design` (Node, sem navegador).

### Corrigido (Chat 08.6 — auditoria de acessibilidade, Rodada A)
- **Entrada:** clicar no rótulo "Senha" foca o campo (antes abria "Esqueci minha senha"); todo campo das telas de entrada tem rótulo próprio e o erro ligado ao campo.
- **Alto contraste do sistema** (Windows "Contraste alto"): foco visível e bordas de campos, botões, ferramentas e painéis.
- **Reduzir movimento:** animações rodam uma vez só (antes, as infinitas piscavam) e a rolagem é instantânea.
- **Leitores de tela:** um título (`h1`) e uma região principal por tela, inclusive no board; nomes dos botões batem com o texto visível (Ficha do board, botão de tema, cartões da Mesa, avatares).
- Novo teste `npm run test:a11y:browser` (Chrome/Edge local, fora do CI).

### Adicionado (Chat 08.5 — E-mail e Acesso)
- **E-mail opcional no servidor:** por variáveis (`OPENDRAW_SMTP_*` + `OPENDRAW_APP_URL`) ou pelo painel **Administração → Políticas e domínios → Envio de e-mail**, sem reiniciar; a variável vence o painel campo a campo, com botão "Enviar e-mail de teste". Sem e-mail tudo continua funcionando por links (FT-GOVERNANCA-016).
- **Esqueci minha senha por e-mail** (`#/forgot` → `#/reset`): link de uso único válido por 30 minutos; redefinir encerra todas as sessões (FT-SISTEMA-021).
- **Confirmação de e-mail:** faixa na Mesa e tela `#/verify` (link de 60 minutos) (FT-SISTEMA-022).
- **Convites por e-mail**, além do link copiável (FT-GOVERNANCA-017).
- **Link de convite geral:** um link para várias pessoas, com papel fixo, validade, limite de usos, domínio opcional e botão de desativar (FT-GOVERNANCA-018).
- **Pedidos de acesso:** "Não tem convite? Pedir acesso" na entrada (política desligada por padrão) e fila em Membros; aprovar gera um convite (FT-GOVERNANCA-019).
- **Cadastro com o e-mail da organização** (política desligada por padrão; só com e-mail e domínio cadastrado): domínio exato, sem mostrar os domínios, pessoas removidas não voltam sozinhas e teto diário de contas criadas (FT-GOVERNANCA-020).
- **E-mails com a marca:** layout próprio com uma ilustração por tipo de e-mail, embutida na mensagem (nada externo).
- **Aviso do Modo Local com servidor:** faixa fixa na Mesa, selo "Só neste navegador" ao lado de "Salvo" no board e bloco na gaveta Você com "Entrar no servidor" (FT-SISTEMA-023).
- Dependência nova do servidor: `nodemailer@10.2.1` (MIT-0, aprovação só para este pacote).

### Alterado (Chat 08.5)
- **Tela de entrada:** no servidor, "Usar só neste navegador (sem sincronizar)" com uma linha explicando que nada vai para o servidor; no Modo Local, "Continuar sem conta" virou um cartão com a linha "Só neste navegador, sem sincronizar".
- Quando o administrador bloqueia o Modo Local, a escolha "usar o Modo Local neste navegador" é apagada: religar a política não devolve ninguém ao Local sem escolher de novo. Os boards locais continuam no navegador e podem ser trazidos ao servidor.
- "Esqueci minha senha" abre a tela de recuperação quando o servidor tem e-mail (sem e-mail, o aviso de sempre).

### Corrigido (Chat 08.5)
- Trocar de modo ("Usar o Modo Local neste navegador", "Voltar para o servidor") gravava a escolha mas **não recarregava** a página quando só o "#" do endereço mudava.
- Trocar a senha ou sair de todos os dispositivos agora derruba a edição ao vivo **na hora** (antes, até 60 s).
- Rolagem horizontal na Administração em telas estreitas.

### Segurança (Chat 08.5)
- Tokens dos links de e-mail guardados só como hash, de uso único e com validade curta; o token sai do endereço antes de qualquer requisição e a tela usa `Referrer-Policy: no-referrer`.
- Respostas públicas iguais existindo ou não a conta (o servidor responde antes de procurar o e-mail).
- Limites por destinatário, IP, pessoa e servidor inteiro em todo endpoint que envia e-mail ou aceita token.
- Links dos e-mails montados só a partir de `OPENDRAW_APP_URL`, nunca do cabeçalho `Host`.
- Host SMTP digitado no painel recusado se resolver para endereço interno (proteção contra SSRF); a senha do painel fica cifrada com uma chave derivada de `OPENDRAW_JWT_SECRET`.
### Alterado (pós-Chat 08.2)
- **Ícones próprios em todo o board:** selo de bloqueio da seleção e seletor de níveis (cadeado e escudo), Ficha (Duplicar, Salvar como modelo, lixeira), Roteiro e atividade, Linha do tempo e prévia (ampulheta), lista da apresentação, conversa, ações do Kanban e modais do board (Exportar/Importar, Templates, Importar planilha, Diagrama por texto, card do Kanban). Mesa e Administração seguem com os genéricos. **Um só selo “Em breve”** (o dos menus ficou igual ao da Dock).
- **Sistema visual completo para o Chat 08/08.2:** entraram as gavetas Ficha, Conversas, Você e Roteiro, as bandejas Formas, Pena, Frame e Emojis e adesivos, a gaveta Estilo do texto (a real), os menus do canvas e da tabela, a prévia de uma versão e a janela flutuante de extensão; o exemplo de ícones genéricos não usa mais os que viraram próprios.
- **Sistema visual (`#/design-system`) reorganizado por tipo de design:** 9 grupos (Fundamentos, Componentes base, Estúdio, Canvas e objetos, Facilitação e governança, Colaboração ao vivo, Mesa, Telas e fluxos, Como contribuir) com índice e atalhos no topo; cada assunto aparece uma vez, na versão atual (saíram as versões substituídas: Dock antigo, histórico de versões antigo, presença antes da correção). Paleta de post-its e bandeja Post-it no mesmo frame; selos “Salvo”, “Envio ao servidor” e “Ao vivo” juntos; cursores, seleção e edição dos outros num só exemplo. `DESIGN_SYSTEM.md` na mesma ordem, com a tabela “numeração antiga → nova”.

### Corrigido (pós-Chat 08.2)
- **Primeiro acesso (`#/setup`):** trocar de aba ou dar Alt+Tab não derruba mais para `#/login` com "Sua sessão no servidor terminou". A atualização ao voltar para a aba (e a de cada minuto) tentava renovar a sessão de um usuário antigo guardado no navegador, e a recusa era tratada como sessão perdida; no primeiro acesso as duas coisas agora ficam paradas.
- **Primeiro acesso:** todos os campos ganharam placeholder (token, organização, nome, e-mail, senha e confirmação); o e-mail passou a usar o ícone de envelope.

### Alterado (Chat 08.2 · C-2 — Cinta do objeto, menus, fontes e cursores)
- **Pós-teste C-2:** gaveta Estilo do texto refeita como na referência do Estúdio v2 — lista de fontes curta com a categoria à direita, tamanho/estilo/posição à vista sem rolar (só a lista encolhe), controles segmentados e altura limitada ao espaço livre real (não passa mais por trás da barra do topo).
- **Cinta do objeto** no lugar da barra de ações: peça única presa à seleção por uma lingueta, seguindo o tema em todos os tipos (frame incluído); identidade à esquerda (converter, filtrar a seleção ou renomear), chips com o valor atual (Estilo do texto, Traço, Pontas, Proporção…) e, sempre à direita, Comentar · Bloqueio avançado · Bloquear · ⋯ (FT-OBJETOS-021). Nenhum controle de antes sumiu.
- **Destravar = segurar 2 s** também pelo teclado (Enter/Espaço), com um anel de progresso no próprio cadeado (FT-GOVERNANCA-001).
- **Menus de botão direito** com cabeçalho e linha rápida: no vazio, "Neste ponto" + coordenadas e 4 linhas; no objeto (o mesmo menu do ⋯) e na tabela, 6 linhas. Nenhum menu passa da altura da tela.
- **40 fontes no board** (+20, todas de licença aberta), com busca, grupos e Recentes; cada família só é baixada quando usada (FT-OBJETOS-022). Proporção de frame **1:1**.
- **Cursores contextuais**: mover no que está selecionado, mão para navegar, cruz para criar, direção certa nas alças (mesmo girado) e um cursor próprio para girar (FT-CANVAS-014).

### Alterado (Chat 08.2 · C-1 — Dock e ícones)
- **Dock com ícones próprios** e nova ordem (Mão antes de Selecionar); botões com bandeja ganham um ponto no canto; a ferramenta ativa fica com o fundo de acento.
- **Bandejas presas ao botão** (Post-it com mini-notas e "Em bloco (grade)" na cor escolhida, Formas com linhas e básicas, Pena, Frame com as proporções desenhadas, Emojis e adesivos com busca, abas e arrastar para o board — `Shift + E`) (FT-OBJETOS-008).
- **Caixa de ferramentas** no lugar do "Mais ferramentas": busca (`/`), filtro Tudo · Do OpenDraw · Extensões, Recentes, seções por intenção e "Das extensões ativas" (FT-SISTEMA-020). Itens ainda não prontos aparecem com o selo "Em breve".
- **Pin de comentário** com a silhueta do ícone próprio e iniciais com contraste AA em qualquer cor de autor.
- Cronômetro e votação saem da Dock: ficam só em Facilitar (uma função, um lugar).

### Alterado (Chat 08.2 · B — Estúdio v2)
- **Board redesenhado em módulos**: barra do topo única e centralizada (Ficha │ Roda, com Apresentar), Vista (Bússola, zoom, Encontrar, Exibir, Roteiro) e Tempo (desfazer, refazer, Linha do tempo); cada função tem um só lugar (FT-SISTEMA-019, FT-FACILITACAO-009, FT-COLABORACAO-009).
- **Linha do tempo** com versões e atividade e prévia somente leitura no próprio canvas, sem mexer no board atual (FT-GOVERNANCA-015). **Destacar por tag** em Exibir (FT-CANVAS-013).
- **Presença corrigida**: uma caixa e uma etiqueta por pessoa (o frame conta como um objeto só), borda de 2 px em qualquer zoom e etiqueta com contraste AA (FT-COLABORACAO-007).
- Painéis de extensão abrem numa **janela flutuante** (a API `opendraw.ui.showPanel` não mudou) (FT-EXTENSOES-009).

### Removido (Chat 08.2 · B)
- **Menu ⋯ da Régua e Painel lateral**: cada item foi para um módulo (tabela em `ai-memory/STUDIO_V2_SPEC.md` §8); `\` (ou `Ctrl + /`) agora reabre a última gaveta. Nenhum dado de board muda (FT-SISTEMA-005).

### Adicionado (Chat 08 — edição ao vivo)
- **Edição ao vivo no Modo Servidor**: várias pessoas no mesmo board ao mesmo tempo, com cópia no aparelho para continuar sem rede e desfazer por pessoa (FT-COLABORACAO-006).
- **Presença**: cursor com nome (movimento suave opcional em Visualizar), caixa de seleção, contorno do que cada pessoa seleciona ou edita, objeto em uso bloqueado para os outros e pilha de avatares na Régua (FT-COLABORACAO-007).
- **Seguir um colega** pelo avatar e **Trazer todos até mim** para o facilitador conduzir a tela de todos (FT-COLABORACAO-008, FT-FACILITACAO-008).
- **Política "Cores diferentes para cada pessoa"** em Administração → Políticas (FT-GOVERNANCA-014).
- **Segurança no servidor**: toda alteração ao vivo é conferida ANTES de chegar aos outros (mesmas regras do salvamento), o texto das notas privadas e os votos anônimos não saem do servidor antes de revelar, e o Activity Log e o Audit Log passam a ser gravados pelo servidor.

### Alterado (Chat 08)
- Enquete com **Mostrar resultado parcial** desligado: a contagem só aparece ao encerrar **para todos**, inclusive para quem gerencia (FT-FACILITACAO-004).
- No Modo Servidor com edição ao vivo, cronômetro, votação, enquete e Modo Privado são aplicados pelo servidor (FT-FACILITACAO-002 a 005).

### Adicionado (Chat 07 — servidor e Modo Servidor)
- **Servidor auto-hospedável** em `server/` (Node.js + Fastify + PostgreSQL): boards, organização, times, projetos, convites, versões, Activity Log e Audit Log guardados no servidor, com as **mesmas permissões** do app reaplicadas em toda chamada (FT-SISTEMA-015).
- **Modo Servidor** no app: conectar a um servidor (testando antes o que ele oferece), entrar com e-mail e senha ou com o **login da empresa (SSO por OIDC)**, trabalhar com uma cópia local que se reenvia sozinha quando a conexão volta, e **voltar ao Modo Local** com os boards do navegador intactos (FT-SISTEMA-015, FT-GOVERNANCA-012).
- **Primeiro acesso do servidor** (`#/setup`) em 3 passos, protegido por um token impresso uma vez nos logs; configuração por variáveis `OPENDRAW_*` para homelab e **recuperação pela linha de comando** (`admin:create`, `admin:reset-password`, `setup:token`) (FT-SISTEMA-016, FT-SISTEMA-017).
- **Sessões:** troca de senha (obrigatória para contas criadas pela linha de comando ou por variáveis), sair de todos os dispositivos e acesso cortado na hora ao suspender alguém (FT-GOVERNANCA-013).
- **Detecção automática do servidor:** aberto pelo endereço do servidor, o app entra sozinho no Modo Servidor (primeiro acesso ou entrada com o nome da organização); frontend separado aponta para o servidor com `config.json` ou `VITE_DEFAULT_SERVER_URL`; o Modo Local fica bloqueado por padrão nesse caso e o admin libera em Políticas (ou `OPENDRAW_ALLOW_LOCAL_MODE`) (FT-SISTEMA-015).
- Aviso na hora quando outra janela ou outra pessoa salva o board aberto; o visitante perde o acesso assim que o link é revogado; quem já tem o board abre o próprio link sem senha.
- Comemoração animada ao concluir o primeiro acesso, botão para mostrar a senha nos campos de senha e explicação própria para "Esqueci minha senha" (sem e-mail: quem redefine é o admin ou quem opera o servidor).

### Segurança (Chat 07)
- Senhas em argon2id; sessões curtas com renovação rotativa (token reaproveitado derruba a sessão); proteção contra CSRF; nada de senha ou token em log.
- **Links públicos de verdade** no servidor: senha em argon2id, tentativas limitadas por IP e por link, validade, revogação e link novo derrubam quem já estava dentro.
- Conteúdo do board conferido mudança a mudança no servidor (bloqueio protegido, Modo Privado, votação anônima, autoria); notas privadas de outras pessoas e votos anônimos não saem do servidor.

### Adicionado (Chat 05.6 · Rodada A — internacionalização)
- Interface em **inglês**, além do português (Brasil): seletor em Configurações → Perfil → **Idioma e região**, com “Seguir o navegador”; a troca vale na hora, sem recarregar, e fica salva neste dispositivo.
- Motor de tradução próprio (`src/i18n/`, sem dependência nova, sobre a API `Intl`): chaves tipadas, plurais, textos com marcação segura, `<html lang dir>` e pseudo-idioma de teste (`?lang=qps`). Catálogos em `src/locales/<idioma>/*.json`.
- Mensagens de permissão negada passam a sair como chave + parâmetros (traduzidas na tela).

### Adicionado (Chat 05.6 · Rodada B — internacionalização completa)
- **Toda a interface em inglês** (2292 mensagens, 100 %): widgets do canvas (Kanban, tabela, mapa mental, timer, votação, enquete, comentários), guia de sintaxe do diagrama por texto, importar/exportar (avisos dos leitores de planilha, SVG e `.excalidraw`), configurações e mensagens.
- **Conteúdo embutido no idioma ativo**: board de boas-vindas, board de demonstração, galeria de templates, colunas padrão do Kanban e nomes padrão de cores e tags são criados no idioma da interface na hora da criação e depois pertencem ao usuário (trocar de idioma não os altera).
- **Registro de atividades estruturado**: entradas novas guardam a ação, o tipo, a contagem e a chave + parâmetros, e são traduzidas na tela com o plural certo; entradas antigas continuam mostrando o texto salvo.
- Valores padrão que já estavam gravados nos dados — o autor “Você” e o espaço “Meu espaço” — continuam iguais no armazenamento (boards antigos não mudam), mas aparecem no idioma ativo na tela.
- Tempos relativos ("há 5 minutos"), datas, números, listas ("A, B e C") e ordenação alfabética por `Intl` no idioma ativo.
- `npm run audit:i18n` (no CI): chaves faltando/sobrando/sem uso, placeholders e marcação divergentes, formas de plural exigidas por idioma, texto fixo em português no código (com exceções documentadas em `scripts/audit-i18n-allow.json`) e `docs/LANGUAGES.md` em dia (`npm run docs:languages`).
- `README.en.md` (com link cruzado ao `README.md`), `docs/TRANSLATING.md` (idioma novo só com JSON + PR, glossário e tom), `docs/LANGUAGES.md`, modelo de PR de tradução (`.github/PULL_REQUEST_TEMPLATE/translation.md`) e traduções `i18n.en` das funções de vitrine em `docs/features.json` (validadas pelo `audit:features`).

### Inalterado de propósito
- Cabeçalhos do CSV de issues (`Summary, Description, Issue Type…`) e dos CSVs de tabela seguem o formato, em qualquer idioma. A tela `#/design-system` continua em pt-BR. Atalhos de teclado são os mesmos em todos os idiomas.

Manutenção do Chat 05.5 — nenhuma função nova de produto.

### Alterado
- Paleta de post-its redefinida do zero: 16 cores próprias pelo círculo cromático, com nome em português (Rosa-quartzo, Coral, Pêssego, Damasco, **Canário** — a nova cor padrão —, Lima, Hortelã, Jade, Água-marinha, Celeste, Bruma, Hortênsia, Pervinca, Lavanda, Orquídea e Algodão-doce) e contraste do texto de 10,1:1 a 14,2:1. Boards salvos mantêm as cores gravadas.
- Fontes **autohospedadas** (pacotes Fontsource, só os subconjuntos latin e latin-ext): o app não faz mais nenhuma requisição a servidores de fontes, funciona offline, e o export (PNG/PDF/SVG) espera as fontes carregarem antes de desenhar. Negrito + itálico agora usa o itálico negrito verdadeiro da fonte.
- Rótulo de menu "Exportar para CSV (Excel)" passou a "Exportar para CSV (planilha)".
- Requisito de Node passou a 22.6 ou mais novo (`.nvmrc` e `engines`).

### Adicionado
- Catálogo de funções (`docs/features.json` + `docs/FEATURES.md`) e as verificações `npm run audit:features` / `npm run docs:features`.
- Integração contínua (`.github/workflows/ci.yml`), `CONTRIBUTING.md` com as regras de origem do código, `SECURITY.md`, este `CHANGELOG.md`, modelos de issue e de pull request e `.editorconfig`.
- `npm run audit:legal` passa a aceitar a licença Zlib, registra a atribuição do `caniuse-lite` (só no build) e bloqueia qualquer referência a servidores de fontes externos.

## [0.5.0] — 2026-11-05 · Chat 05 — Importação universal e exportação em larga escala

### Adicionado
- Importar arquivo e colar de qualquer lugar: objetos do OpenDraw, imagens, SVG, tabelas HTML/TSV, HTML genérico e texto viram objetos nativos (FT-IMPORTAR-001, FT-IMPORTAR-002).
- SVG vetorial editável e arquivos `.excalidraw` convertidos em objetos nativos (FT-IMPORTAR-003, FT-IMPORTAR-004).
- Importar planilha `.xlsx`, `.ods`, `.csv` e `.tsv` como Tabela, Kanban ou Post-its, com prévia (FT-IMPORTAR-005).
- Inspetor de colagem e proteção contra dado codificado (FT-IMPORTAR-006, FT-IMPORTAR-007).
- Exportação SVG vetorial, PDF multipáginas por frames, CSV de issues para rastreadores e tabelas em CSV/TSV + HTML, num modal único (FT-EXPORTAR-003 a 006, FT-EXPORTAR-011).
- Registries internos de importadores, exportadores, formas e modelos (FT-EXTENSOES-001).

### Segurança
- Todo CSV exportado é protegido contra injeção de fórmulas; planilhas são lidas sem fórmulas, macros ou vínculos externos, com limites de tamanho.
- Exportação negada por padrão a visitantes leitores e comentadores (FT-GOVERNANCA-004).

## [0.4.0] — 2026-11-04 · Chat 04 — Widgets e kit de facilitação

### Adicionado
- Kanban com WIP, cards completos e arrastar entre colunas (FT-OBJETOS-018).
- Tabelas com teclado de planilha, mesclagem, bordas, estilos e ordenação (FT-OBJETOS-019).
- Diagrama por texto com prévia ao vivo e guia da sintaxe (FT-DIAGRAMAS-001).
- Cronômetro com música procedural, votação por pontos e enquete (FT-FACILITACAO-002 a 004).
- Comentários com conversas, @menções e resolução (FT-COLABORACAO-001).
- Galeria de templates e "Salvar como template" (FT-FACILITACAO-006, FT-FACILITACAO-007).

## [0.3.0] — 2026-11-03 · Chat 03 — Conectores inteligentes, mapas mentais e frames

### Adicionado
- Texto na linha, saltos de linha, roteamento automático e pontos de ancoragem (FT-CONECTORES-002 a 004).
- Mapa mental nativo (FT-OBJETOS-017).
- Frames com proporções, conteúdo ocultável e exportação por frame (FT-OBJETOS-015, FT-OBJETOS-016, FT-EXPORTAR-008).
- Modo Apresentação (FT-FACILITACAO-001), board incorporável (FT-COLABORACAO-003), visualização inicial (FT-CANVAS-010) e splash de abertura (FT-SISTEMA-008).
- Auditoria de Sala Limpa (`npm run audit:legal`).

## [0.2.0] — data não registrada · Chat 02 — Reestilização, ferramentas essenciais e governança

### Adicionado
- Layout próprio: Mesa (dashboard com busca `Ctrl + K`) e Estúdio (Régua, Dock, Painel e minimapa) (FT-DASHBOARD-001 a 003, FT-SISTEMA-005).
- Tags e reações nos post-its, imagens, stickers e seleção por laço (FT-OBJETOS-002, 003, 007, 008, FT-CANVAS-004).
- Motor de permissões, "Visualizar como…", bloqueio em quatro níveis, Modo Privado e registro de atividades (FT-GOVERNANCA-001 a 003, FT-FACILITACAO-005, FT-COLABORACAO-002).
- Board de boas-vindas "Comece por aqui" (FT-DASHBOARD-006).

## [0.1.0] — data não registrada · Chat 01 — Fundação e motor de canvas infinito

### Adicionado
- Board infinito com zoom, grade, minimapa, seleção múltipla, guias inteligentes, desfazer/refazer e atalhos (FT-CANVAS-001 a 009).
- Post-its, texto rico, formas, caneta, conectores básicos, agrupar, alinhar e camadas (FT-OBJETOS-001, 004–006, 009–012, FT-CONECTORES-001).
- Exportação PNG/PDF/CSV e backup `.opendraw` (FT-EXPORTAR-001, 002, 007, 009).
- Login local, Configurações, Design System vivo (`#/design-system`) e salvamento automático local (FT-SISTEMA-001 a 003, FT-SISTEMA-007).

[Não lançado]: https://github.com/lukapianco/ludraw/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/lukapianco/ludraw/releases/tag/v0.5.0
[0.4.0]: https://github.com/lukapianco/ludraw/releases/tag/v0.4.0
[0.3.0]: https://github.com/lukapianco/ludraw/releases/tag/v0.3.0
[0.2.0]: https://github.com/lukapianco/ludraw/releases/tag/v0.2.0
[0.1.0]: https://github.com/lukapianco/ludraw/releases/tag/v0.1.0
