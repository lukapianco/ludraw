# PROVENANCE.md — Registro de Origem do LuDraw

> Arquivo **público** (fica em `docs/`, fora do `.gitignore`). Registra a origem e a licença de tudo que entra no projeto. Regras completas: `ai-memory/CLEAN_ROOM.md`. Isto não é parecer jurídico.
> **Atualize a cada chat** (obrigatório no Protocolo de Handoff). Versões e licenças devem ser conferidas com `npm run audit:legal`.

## 1. Política em uma frase

Todo código, interface, texto, ícone e template do LuDraw é de autoria própria ou vem de dependência com licença permissiva registrada abaixo. Nada é copiado de produtos proprietários de terceiros.

## 2. Aviso de transparência (histórico)

Os Chats 01 e 02 foram desenvolvidos **antes** da adoção do protocolo de sala limpa. O Chat 01 usou prints de um produto de terceiros como referência visual (ver §6); o layout foi **redesenhado na Rodada 0 do Chat 02** (`DESIGN_REDESIGN.md`). A **auditoria retroativa** foi feita no Chat 03 (pré-tarefa 3): `npm run audit:legal` + revisão manual. Status: ✅ sem bloqueantes; avisos e semelhanças pendentes de decisão listados em `docs/AUDIT_REPORT.md` e no §9 abaixo. O Chat 03 inteiro (pré-tarefas, Rodadas A e B e ajustes do texto da linha) já foi feito sob o protocolo de sala limpa — ver §10.

## 3. Dependências (frontend)

Versões do `package-lock.json` (conferidas por `npm run audit:legal` nos fechamentos dos Chats 03, 04 e 05 — 03, 04 e 05/11/2026). **Nenhuma dependência nova entrou nos Chats 01–05** (`package.json` só ganhou o script `audit:legal`, no Chat 03). **Chat 05.5:** entraram os 18 pacotes de fontes Fontsource (§3.1), aprovados pelo usuário e instalados por ele em 06/11/2026 (`npm ls --depth=0` conferido). **Chat 05.6: nenhuma dependência nova** — o motor de internacionalização (`src/i18n/`) é próprio, sobre a API nativa `Intl` (ECMA-402: `PluralRules`, `NumberFormat`, `DateTimeFormat`, `RelativeTimeFormat`, `ListFormat`, `Collator`); `scripts/audit-i18n.mjs` é Node puro. Nenhuma biblioteca de i18n foi instalada ou consultada.

> **Chat 05 — descompactação de `.xlsx`/`.ods` sem dependência nova:** o prompt permitia `fflate` (MIT), mas o leitor de ZIP foi escrito do zero (`src/utils/zip.ts`, a partir da especificação pública do formato ZIP) e usa a API **nativa** do navegador `DecompressionStream('deflate-raw')` (Chrome 103+, Edge 103+, Firefox 113+, Safari 16.4+). Resultado: zero pacotes novos, zero licenças novas.

**Diretas — vão para o bundle**

| Pacote | Versão | Licença | Uso |
|---|---|---|---|
| react / react-dom | 18.3.1 | MIT | UI |
| zustand | 4.5.7 | MIT | estado |
| lucide-react | 0.460.0 | ISC | ícones |
| clsx | 2.1.1 | MIT | utilitário de classes |
| tailwind-merge | 2.6.1 | MIT | utilitário de classes |
| pdf-lib | 1.17.1 | MIT | exportação PDF |

**Fontes autohospedadas — Chat 05.5 (vão para o bundle como arquivos `.woff2`)** <a id="31-fontes"></a>

§3.1. Pacotes Fontsource instalados pelo usuário em 06/11/2026 (versões do `npm ls --depth=0` dele). Sem dependências transitivas. A licença declarada no `package.json` de cada pacote é a **da fonte**; o empacotamento do Fontsource não acrescenta outra condição. Só os arquivos `latin` e `latin-ext` dos pesos/estilos usados entram no build, declarados à mão em `src/styles/fonts.css` (método "Custom CSS" da documentação do Fontsource para Vite).

| Pacote | Versão | Licença | Uso | Arquivos importados |
|---|---|---|---|---|
| @fontsource-variable/figtree | 5.3.0 | OFL-1.1 | UI (corpo) | wght normal + itálico (300–900) |
| @fontsource-variable/fraunces | 5.3.0 | OFL-1.1 | UI (títulos display) | opsz normal + itálico (opsz 9–144, wght 100–900) |
| @fontsource-variable/caveat | 5.3.0 | OFL-1.1 | board | wght normal (400–700) |
| @fontsource-variable/eb-garamond | 5.3.0 | OFL-1.1 | board | wght normal + itálico (400–800) |
| @fontsource-variable/fredoka | 5.3.0 | OFL-1.1 | board | wght normal (300–700) |
| @fontsource-variable/ibm-plex-sans | 5.3.0 | OFL-1.1 | board | wght normal + itálico (100–700) |
| @fontsource-variable/noto-sans | 5.3.0 | OFL-1.1 | board | wght normal + itálico (100–900) |
| @fontsource-variable/open-sans | 5.3.0 | OFL-1.1 | board (fonte padrão) | wght normal + itálico (300–800) |
| @fontsource-variable/roboto-slab | 5.3.0 | Apache-2.0 | board | wght normal (100–900) |
| @fontsource/ibm-plex-mono | 5.3.0 | OFL-1.1 | UI (código/teclas) e board | 400, 700, 400 itálico, 700 itálico |
| @fontsource/ibm-plex-serif | 5.3.0 | OFL-1.1 | board | 400, 700, 400 itálico, 700 itálico |
| @fontsource/pt-sans | 5.3.0 | OFL-1.1 | board | 400, 700, 400 itálico, 700 itálico |
| @fontsource/abril-fatface | 5.3.0 | OFL-1.1 | board | 400 |
| @fontsource/bangers | 5.3.0 | OFL-1.1 | board | 400 |
| @fontsource/graduate | 5.3.0 | OFL-1.1 | board | 400 (só latin: a família não tem latin-ext) |
| @fontsource/gravitas-one | 5.3.0 | OFL-1.1 | board | 400 (só latin) |
| @fontsource/nixie-one | 5.3.0 | OFL-1.1 | board | 400 (só latin) |
| @fontsource/permanent-marker | 5.3.0 | Apache-2.0 | board | 400 (só latin) |
| @fontsource-variable/inter | 5.3.0 | OFL-1.1 | board — Inter (Chat 08.2 · C-2) | wght normal + itálico |
| @fontsource-variable/manrope | 5.3.0 | OFL-1.1 | board — Manrope (Chat 08.2 · C-2) | wght normal |
| @fontsource-variable/dm-sans | 5.3.0 | OFL-1.1 | board — DM Sans (Chat 08.2 · C-2) | wght normal + itálico |
| @fontsource-variable/work-sans | 5.3.0 | OFL-1.1 | board — Work Sans (Chat 08.2 · C-2) | wght normal + itálico |
| @fontsource-variable/lexend | 5.3.0 | OFL-1.1 | board — Lexend (Chat 08.2 · C-2) | wght normal |
| @fontsource/atkinson-hyperlegible | 5.3.0 | OFL-1.1 | board — Atkinson Hyperlegible (Chat 08.2 · C-2) | 400, 700, 400 itálico, 700 itálico |
| @fontsource-variable/source-serif-4 | 5.3.1 | OFL-1.1 | board — Source Serif 4 (Chat 08.2 · C-2) | wght normal + itálico |
| @fontsource-variable/lora | 5.3.0 | OFL-1.1 | board — Lora (Chat 08.2 · C-2) | wght normal + itálico |
| @fontsource-variable/merriweather | 5.3.0 | OFL-1.1 | board — Merriweather (Chat 08.2 · C-2) | wght normal + itálico |
| @fontsource-variable/bitter | 5.3.0 | OFL-1.1 | board — Bitter (Chat 08.2 · C-2) | wght normal + itálico |
| @fontsource/patrick-hand | 5.3.0 | OFL-1.1 | board — Patrick Hand (Chat 08.2 · C-2) | 400 |
| @fontsource/kalam | 5.3.0 | OFL-1.1 | board — Kalam (Chat 08.2 · C-2) | 400, 700 |
| @fontsource/architects-daughter | 5.3.0 | OFL-1.1 | board — Architects Daughter (Chat 08.2 · C-2) | 400 |
| @fontsource/shadows-into-light | 5.3.0 | OFL-1.1 | board — Shadows Into Light (Chat 08.2 · C-2) | 400 |
| @fontsource/bebas-neue | 5.3.0 | OFL-1.1 | board — Bebas Neue (Chat 08.2 · C-2) | 400 |
| @fontsource/righteous | 5.3.0 | OFL-1.1 | board — Righteous (Chat 08.2 · C-2) | 400 |
| @fontsource-variable/comfortaa | 5.3.0 | OFL-1.1 | board — Comfortaa (Chat 08.2 · C-2) | wght normal |
| @fontsource-variable/jetbrains-mono | 5.3.0 | OFL-1.1 | board — JetBrains Mono (Chat 08.2 · C-2) | wght normal + itálico |
| @fontsource/space-mono | 5.3.0 | OFL-1.1 | board — Space Mono (Chat 08.2 · C-2) | 400, 700, 400 itálico, 700 itálico |
| @fontsource-variable/fira-code | 5.3.0 | OFL-1.1 | board — Fira Code (Chat 08.2 · C-2) | wght normal |

**Chat 08.2 · C-2 — +20 famílias do board (40 no total):** instaladas com aprovação do usuário (lista e licenças apresentadas no plano da rodada), versões fixadas no `package.json`. Licença conferida em dois momentos: no `package.json` publicado de cada pacote (`npm view <pacote> license`) antes de instalar e no `package.json` instalado em `node_modules` (tabela acima, gerada a partir dele) — todas **OFL-1.1**. Só `latin` + `latin-ext`, sem o `.woff` antigo de reserva. Carregamento sob demanda: o navegador só baixa a família quando um texto a usa (ou quando o seletor mostra o nome dela na tela); teste em `test:extensions:browser` ("abrir o board não baixa as famílias novas").

Origem das informações (eixos, faixas de peso, subconjuntos, licença): páginas npm/README oficiais de cada pacote e documentação do Fontsource (`fontsource.org/docs`), consultadas no Chat 05.5 — fontes permitidas pelo `CLEAN_ROOM.md` R2. Nenhum arquivo de fonte foi copiado para o repositório: os `.woff2` vêm de `node_modules` e o Vite os emite em `dist/assets/`. A licença de cada fonte acompanha o pacote (`LICENSE`) e os metadados do próprio `.woff2`; no empacotamento desktop (Chat 08/09), incluir um arquivo de avisos de terceiros com os textos OFL-1.1/Apache-2.0.

**Transitivas de produção:** `scheduler` 0.23.2 (MIT), `loose-envify` 1.4.0 (MIT), `js-tokens` 4.0.0 (MIT), `use-sync-external-store` 1.7.0 (MIT), `@pdf-lib/standard-fonts` 1.0.0 (MIT), `@pdf-lib/upng` 1.0.1 (MIT), `tslib` 1.14.1 (0BSD), `pako` 1.0.11 (**MIT AND Zlib** — Zlib aprovada pelo usuário em 05/11/2026 e incluída no `CLEAN_ROOM.md` §5; o `audit:legal` aceita Zlib desde o Chat 05.5).

**Diretas de desenvolvimento — não vão para o bundle**

| Pacote | Versão | Licença | Uso |
|---|---|---|---|
| vite | **6.4.6** (publicada em 09/11/2026; versão exata, `--save-exact --before=2026-11-10`; Chat 08.7 · R6 — antes 5.4.21) | MIT | build/dev server |
| @vitejs/plugin-react | 4.7.0 | MIT | build |
| typescript | 5.9.3 | Apache-2.0 | linguagem/typecheck |
| tailwindcss | 3.4.19 | MIT | estilos |
| postcss | 8.5.32 | MIT | estilos |
| autoprefixer | 10.6.2 | MIT | estilos |
| @types/react · @types/react-dom · @types/node | 18.3.31 · 18.3.7 · 22.20.5 | MIT | tipos |

Transitivas de desenvolvimento: todas MIT/ISC/Apache-2.0/BSD-3-Clause, exceto `caniuse-lite` (**CC-BY-4.0**, aprovada pelo usuário em 05/11/2026 — atribuição no §3.2). Lista completa em `docs/AUDIT_REPORT.md`.

**§3.2 Atribuição — `caniuse-lite` (CC BY 4.0)** <a id="32-caniuse-lite"></a>

| Campo | Valor |
|---|---|
| Pacote | `caniuse-lite` (transitiva de desenvolvimento: `autoprefixer` → `browserslist`; versão exata no `package-lock.json` / `docs/AUDIT_REPORT.md`) |
| Obra | dados de compatibilidade de navegadores do projeto **Can I use** (caniuse.com), criado por Alexis Deveria, em versão compacta empacotada no `caniuse-lite` |
| Licença | Creative Commons Atribuição 4.0 Internacional — https://creativecommons.org/licenses/by/4.0/ |
| Uso no LuDraw | só durante o build, para o `autoprefixer` decidir quais prefixos de CSS gerar. **Nenhum dado vai para o bundle** nem é modificado ou redistribuído pelo projeto |
| Aprovação | usuário, 05/11/2026 (`scripts/audit-terms.json` → `packageApprovals`, `approvedBy` preenchido no Chat 05.5) |

Texto de atribuição recomendado (para avisos de terceiros do pacote desktop, Chat 08/09): *"Dados de compatibilidade de navegadores: Can I use (caniuse.com), por Alexis Deveria, via caniuse-lite — licença CC BY 4.0."*

Dependências planejadas (registrar versão e licença **no chat em que entrarem**): Tauri. (Fastify, Drizzle e argon2 entraram no Chat 07 — §3.3; Yjs, y-indexeddb e Hocuspocus entraram no Chat 08 — §3.4.)

### 3.3 Dependências do servidor (`server/`, Chat 07 · Rodada A)

Pacote próprio (`server/package.json` + `server/package-lock.json`); o frontend continua na raiz. O `npm run audit:legal` audita as duas árvores desde o Chat 07. **ORM: Drizzle** (decisão do usuário em 08/11/2026, no lugar do Prisma citado no pedido: não baixa binários na instalação e permite testes com PostgreSQL embutido).

**Diretas — rodam no servidor**

| Pacote | Versão | Licença | Uso |
|---|---|---|---|
| fastify | 5.12.8 | MIT | servidor HTTP |
| @fastify/cookie | 11.1.5 | MIT | cookie httpOnly de renovação da sessão |
| @fastify/cors | 11.4.1 | MIT | origens permitidas (cliente em outro endereço) |
| @fastify/rate-limit | 11.2.2 | MIT | teto geral de requisições por IP |
| drizzle-orm | 0.45.4 | Apache-2.0 | acesso ao PostgreSQL e aplicação das migrações |
| pg | 8.23.1 | MIT | driver do PostgreSQL |
| argon2 | 0.45.2 | MIT | hash de senhas (argon2id); traz binários pré-compilados no próprio pacote (sem download na instalação) — testar na imagem Alpine no Chat 09 |
| jose | 6.2.16 | MIT | JWT de acesso e de visitante (HS256) |
| openid-client | 6.8.9 | MIT | login da empresa por OIDC genérico (PKCE) |
| nodemailer | 10.2.1 | **MIT-0** (aprovação só para este pacote — `CLEAN_ROOM.md` §8, 12/11/2026) | envio **opcional** de e-mail por SMTP (Chat 08.5: recuperação de senha, verificação de e-mail, convites); sem dependências, tipos próprios; versão exata, sem `^` |
| @fastify/proxy-addr | 5.1.2 (publicada em 10/10/2026; versão exata, `--save-exact`) | MIT | Chat 08.7 · R5 (S-14): a mesma regra de "em quem confiar no `X-Forwarded-For`" para o REST e o WebSocket (`server/src/lib/trust.ts`). Já estava na árvore como dependência do próprio Fastify (mesma versão); passou a ser direta. Tipos próprios. `npm audit signatures` em `server/` depois de instalar: 119 pacotes com assinatura do registro conferida, 46 com atestado de proveniência. `npm run notices`: os avisos já listavam o pacote (sem mudança) |

**Desenvolvimento**

| Pacote | Versão | Licença | Uso |
|---|---|---|---|
| typescript | 5.9.3 | Apache-2.0 | typecheck do servidor |
| tsx | 4.23.15 | MIT | rodar TypeScript em desenvolvimento, testes e CLI |
| esbuild | 0.28.2 | MIT | build de produção (`server/dist`) |
| drizzle-kit | 0.31.11 | MIT | gerar as migrações SQL (`server/drizzle/`) |
| @electric-sql/pglite | 0.5.15 | Apache-2.0 | PostgreSQL embutido **só nos testes** (sem Docker) |
| @types/node · @types/pg | 22.20.5 · 8.23.1 | MIT | tipos |

**Chat 08.7 · R5:** a árvore não mudou de tamanho (o `@fastify/proxy-addr` já era transitivo); diretos de execução passam a 15.

**Árvore do servidor (recontada no Chat 08.6, 15/11/2026): 191 pacotes no `server/package-lock.json` — 23 diretos (14 de execução + 9 de desenvolvimento) e 168 transitivos.** Transitivos: MIT 155 · ISC 6 · BSD-3-Clause 5 · Apache-2.0 1 · 0BSD 1. Árvore inteira: MIT 174 · ISC 6 · BSD-3-Clause 5 · Apache-2.0 4 · MIT-0 1 (`nodemailer`, aprovação pontual) · 0BSD 1. (O número anterior, 176, era do Chat 07, antes do tempo real e do e-mail.) Nenhuma CC0, LGPL, MPL ou licença fora da lista do `CLEAN_ROOM.md` §5.

**Imagem de desenvolvimento:** `postgres:16-alpine` (PostgreSQL License) em `server/docker-compose.dev.yml`, só para testes locais — não é distribuída com o LuDraw.

### 3.4 Dependências do tempo real (Chat 08 · A-1)

Versões **exatas** (sem `^`) nos dois `package.json`; licenças conferidas no `package.json` instalado e nos lockfiles. Todas permitidas (`CLEAN_ROOM.md` §5); nenhuma exige aprovação.

**Frontend (raiz)**

| Pacote | Versão | Licença | Uso |
|---|---|---|---|
| yjs | 13.6.33 | MIT | documento CRDT compartilhado do board (Modo Servidor) |
| y-indexeddb | 9.0.12 | MIT | cópia do documento no navegador (editar sem rede) |
| @hocuspocus/provider | 4.7.1 | MIT | cliente do WebSocket de sincronização |
| y-protocols | 1.0.7 | MIT | protocolo de sincronização do Yjs (par do provider) |

**Servidor (`server/`)** — rodam no servidor

| Pacote | Versão | Licença | Uso |
|---|---|---|---|
| yjs | 13.6.33 | MIT | documento CRDT por board |
| @hocuspocus/server | 4.7.1 | MIT | servidor de sincronização (autenticação, ganchos de veto, persistência) |
| y-protocols | 1.0.7 | MIT | protocolo de sincronização |
| ws | 8.22.0 | MIT | WebSocket do servidor (`noServer`, na mesma porta da API) |

**Servidor — desenvolvimento**: `@types/ws` 8.18.2 (MIT) e `@hocuspocus/provider` 4.7.1 (MIT; cliente dos testes de colaboração).

**Transitivas novas** (licenças no lockfile): lib0 0.2.119, isomorphic.js 0.2.5, @hocuspocus/common 4.8.0, @lifeomic/attempt 3.1.0, async-mutex 0.5.0, crossws 0.4.17, kleur 4.1.5 — todas **MIT**; tslib — **0BSD**.

**Chat 08.7 · R6 — atualização do Vite (16/11/2026).** `vite` 5.4.21 → **6.4.6**. Transitivas que mudaram no `package-lock.json` (todas MIT, todas publicadas há ≥ 7 dias): `esbuild` 0.21.5 → **0.25.12** (01/11/2025) + os binários por plataforma `@esbuild/*` 0.25.12 (23 atualizados, 3 plataformas novas; opcionais, só o da máquina é instalado); **novas** `fdir` 6.5.0 (14/08/2025) e `picomatch` 4.0.7 (24/08/2026). `@vitejs/plugin-react` 4.7.0 (peer `vite ^4.2 || ^5 || ^6 || ^7`), `tailwindcss` 3.4.19, `postcss` 8.5.32, `autoprefixer` 10.6.2 e `rollup` 4.67.5 **não mudaram**. Total: 30 entradas do lockfile (4 pacotes + 26 binários).
- **Por que 6.4.6 e não 6.4.5 (o alvo inicial):** condição do usuário — ler as notas do 6.4.6 e usá-lo se corrigisse aviso de segurança. Fontes oficiais lidas: o changelog do Vite (`https://github.com/vitejs/vite/blob/v6.4.6/packages/vite/CHANGELOG.md`: 6.4.6 = "fix: escape ids in resolve virtual modules (#24044)"; 6.4.5 = "fix: check `server.fs` after stripping query as well") e o aviso do próprio repositório, conferido pela API pública do GitHub (`api.github.com/repos/vitejs/vite/security-advisories/GHSA-p4f5-76q4-ffq7`): **GHSA-p4f5-76q4-ffq7, crítico** — "Remote code execution using `__vite-browser-external` virtual module", afeta `vite >=4.0.0 <=6.4.5` (inclusive o 5.4.21 que tínhamos), corrigido em **6.4.6**, publicado em 10/11/2026. Ainda não estava no banco revisado do GitHub nem no `npm audit` em 16/11/2026 (o `npm audit` não acusava nada contra o 6.4.5) — por isso a fonte é o aviso do repositório.
- **Depois:** `npm audit` (com dev) na raiz = **0** (antes 9: 8 do `vite`, 1 do `esbuild`) · `--omit=dev` = 0 · `npm audit signatures`: raiz 194 com assinatura do registro conferida (82 com atestado), servidor 119 (46) · `npm run notices`: sem mudança (o Vite e o esbuild não vão no app distribuído).

**Verificação do contrato (decisão do usuário: ler os tipos/código instalados antes de depender do veto):** em `@hocuspocus/server@4.7.1` o gancho `beforeSync` roda **antes** de aplicar a atualização ao documento (`MessageReceiver.readSyncMessage` → `await connection.callbacks.beforeSync`); uma exceção ali fecha a conexão e a atualização **não** é aplicada nem transmitida (comprovado em experimento isolado: o outro cliente e o documento do servidor não receberam a escrita vetada). `beforeHandleMessage` também roda antes. Sem plano B por transação compensatória.

### 3.5 Política de versões novas e riscos aceitos (Chat 08.6 · C)

**Política (decisão do usuário, 15/11/2026 — achado O-03 da auditoria do Chat 08.6):** dependência nova ou atualização só com **versão publicada há pelo menos 7 dias** (instalar com `npm install <pacote>@<versão> --save-exact` e conferir a data em `npm view <pacote> time`; para atualizações em lote, `npm install --before=<data de 7 dias atrás>`). Registrar a data de publicação junto da versão neste arquivo. Depois de instalar, `npm audit signatures` na raiz e em `server/` (assinaturas do registro e atestados de proveniência). Motivo: em 08/11/2026 o `jose@6.2.16` entrou no lockfile cerca de 3,5 h depois de publicado (e outras versões com 3 a 6 dias); não houve problema — integridade, assinaturas e atestados conferem —, mas a quarentena reduz o risco de pacote comprometido recém-publicado.

**Situação no Chat 08.6 (15/11/2026):** `npm audit signatures` — **192/192 (app) e 119/119 (servidor) com assinatura do registro válida**; 82 e 46 com atestado de proveniência. `integrity` de todas as dependências diretas igual à publicada; os 430 pacotes vêm de `registry.npmjs.org`.

| Data | Risco aceito | Motivo | Revisar |
|---|---|---|---|
| 15/11/2026 · **FECHADO em 16/11/2026 (Chat 08.7 · R6)** | ~~**O-15**~~ — `npm audit` (com dependências de desenvolvimento) aponta GHSA-67mh-4wv8-2f99: `esbuild` ≤ 0.24.2, trazido pelo `vite@5.4.21`, deixa qualquer site ler respostas do **servidor de desenvolvimento** | Afeta só o `npm run dev` na máquina de quem desenvolve; o build e o servidor de produção não usam o servidor do Vite (`npm audit --omit=dev` = 0 vulnerabilidades no app e no servidor). Corrigir exige Vite 6+ (mudança grande) | Ao planejar a atualização do Vite; até lá, não expor o `npm run dev` na rede (o Vite só escuta em `localhost` por padrão) |

**O-15 fechado (16/11/2026, Chat 08.7 · R6):** com `vite@6.4.6` o `esbuild` do app passou a 0.25.12 (corrigido a partir de 0.25.0); `npm audit` com dev na raiz = 0 vulnerabilidades. O mesmo aviso continua só no **servidor**, pelo `drizzle-kit` (ferramenta de desenvolvimento das migrações): é o S-25 do `QUALITY_BACKLOG.md` (Chat 08.7), `npm audit --omit=dev` = 0 no servidor.

### 3.6 Avisos de terceiros distribuídos (Chat 08.6 · D, O-02)

`npm run notices` (`scripts/third-party-notices.mjs` + `scripts/lib/notices.mjs`, Node puro) gera, a partir dos lockfiles, **`THIRD_PARTY_NOTICES.txt`** (app: os 64 pacotes da árvore de produção da raiz, inclusive as 38 famílias de fonte com o texto OFL-1.1/Apache-2.0 de cada uma) e **`server/THIRD_PARTY_NOTICES.txt`** (servidor: os 99 pacotes de produção). Cada entrada traz nome, versão, licença declarada, repositório, o texto do arquivo de licença do próprio pacote e o `NOTICE`, se houver. Cinco pacotes do servidor não trazem arquivo de licença no pacote npm (`@epic-web/invariant`, `abstract-logging`, `pg-types`, `pgpass` — MIT — e `drizzle-orm` — Apache-2.0): para eles vai o texto padrão da licença declarada, com o autor do `package.json` como titular (o texto oficial do Apache-2.0 é lido de um pacote instalado que o distribui). O arquivo é determinístico (sem data, em ordem alfabética).

Distribuição: o plugin `ludraw-third-party-notices` do `vite.config.ts` copia o arquivo para `dist/` (sem ele o build falha) e `server/scripts/build.mjs` copia o do servidor para `server/dist/`. O `npm run audit:legal` **bloqueia** se um arquivo faltar, estiver desatualizado em relação ao lockfile ou se um `dist/` existente vier sem os avisos atuais. Dados de compatibilidade do `caniuse-lite` (CC BY 4.0, §3.2) são só de build e não entram no `dist/`; a atribuição continua no §3.2.

**Auditor (Chat 08.6 · D):** `npm run audit:legal` passou a ser **só leitura** (O-12) — grava `docs/AUDIT_REPORT.md` apenas com `npm run docs:legal` (`--write`); o campo `license` ausente num `package.json` vira bloqueante em vez de ser corrigido em silêncio. O escopo de termos e domínios cresceu (O-11): `README.en.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `.github/`, `scripts/`, `server/test/` e `server/scripts/` (541 arquivos varridos, antes 485). Fixtures de teste passaram a usar domínios reservados `.test` (RFC 2606); `ai-memory/` continua fora da varredura e os arquivos versionados de lá são conferidos por SHA-256 (§4.1).

### 3.7 Redis/Valkey opcional (Chat 09 · R4, decisão D10)

Só é usado com `LUDRAW_REDIS_URL`. Guarda os limites de tentativa e o teto geral por IP compartilhados entre instâncias, e leva o aviso "o painel de e-mail mudou". Sem a variável, nada disso é carregado e tudo fica em memória, como antes. Versão exata (sem `^`), publicada há 7 dias ou mais, licenças conferidas no registro do npm e no lockfile, `npm audit signatures` 127/127 verificadas no servidor.

**Servidor (`server/`)** — roda no servidor

| Pacote | Versão | Licença | Publicado | Uso |
|---|---|---|---|---|
| ioredis | 6.0.0 | MIT | 31/07/2026 | cliente Redis/Valkey: scripts Lua dos limites, pub/sub entre instâncias e o armazenamento do `@fastify/rate-limit` (que declara `ioredis ^6.0.0`) |

**Transitivas novas** (todas de produção): `@ioredis/commands` 2.0.0 (MIT, 28/07/2026), `cluster-key-slot` 1.1.1 (**Apache-2.0**, 2022), `debug` 4.4.3 (MIT, 2025), `denque` 2.1.0 (**Apache-2.0**, 2022), `ms` 2.1.3 (MIT), `redis-errors` 1.2.0 (MIT, 2017), `standard-as-callback` 2.1.0 (MIT, 2021). Nenhuma estava no lockfile; as duas Apache-2.0 estão na lista permitida (`CLEAN_ROOM.md` §5) e entram com o texto da licença no `server/THIRD_PARTY_NOTICES.txt` (107 pacotes).

**Servidor do compose e dos testes:** `valkey/valkey:9.0.7-alpine3.24@sha256:2d04268dfa26ab31cfa3fdc538866e76438b2d00e41db41b8cb86d780ac5a416`.
- **Licença:** BSD-3-Clause, conferida no arquivo `COPYING` da tag `9.0.7` do repositório oficial (`github.com/valkey-io/valkey`), pela API pública do GitHub.
- **Publicação:** 27/10/2026. As tags 9.0.8, 9.1.4, 9.2.0 e 8.1.12 foram reconstruídas entre 18 e 19/11/2026 e ainda não completaram 7 dias.
- **Uso:** imagem de terceiros, baixada pelo operador; não vai dentro da imagem do LuDraw.
- **Por que Valkey:** o Redis 7.4+ está sob RSALv2/SSPL e o 8.x sob AGPL, licenças fora da lista do `CLEAN_ROOM.md` §5.

### 3.8 Aplicativo desktop: Tauri e crates (Chat 09.1 · R7, decisões D14/D15)

Programa em `src-tauri/` (Rust 1.99.1, `rust-toolchain.toml`), **sem plugins do Tauri** (decisão do usuário) e **sem dependência nova no npm**. Só crates do crates.io, com o `Cargo.lock` versionado e o inventário `src-tauri/crates.json` (`npm run crates`: versão, licença, SHA-256 e onde cada uma entra). O `npm run audit:legal` confere o lock contra o inventário, sem precisar do cargo: crate fora do inventário, SHA-256 diferente, origem que não seja o crates.io ou licença fora da lista livre sem aprovação **por nome, versão e licença** bloqueia.

**Identificador:** `app.ludraw` (permanente; decisão do usuário em 25/11/2026, no lugar do primeiro, que trazia o nome do autor). O identificador de um segmento só, `ludraw`, foi testado e é aceito pelo Tauri, pelo NSIS e pelo `.deb`, mas foi descartado: no Windows a pasta dos dados (`%LOCALAPPDATA%ludraw`) seria a mesma em que o instalador põe o programa (`%LOCALAPPDATA%LuDraw`, sem diferenciar maiúsculas). **Dados:** `%LOCALAPPDATA%app.ludraw` (Windows) e `~/.local/share/app.ludraw`, ou `$XDG_DATA_HOME/app.ludraw` (Linux). A origem local não depende do identificador (`http://tauri.localhost` e `tauri://localhost`), e o prefixo `dev.ludraw.` continua só das extensões embutidas (conferido no `test:desktop`).

**Diretas**

| Crate | Versão | Licença | Publicada | Uso |
|---|---|---|---|---|
| tauri | 2.12.7 (exata) | Apache-2.0 OR MIT | 18/11/2026 | janela, protocolo local, comandos, menu (`default-features = false`: `wry`, `compression`, `common-controls-v6`, `x11`) |
| tauri-build | 2.7.6 (exata, só compilação) | Apache-2.0 OR MIT | 18/11/2026 | permissões dos comandos, ícone e manifesto do Windows |
| serde / serde_json | 1.0.229 / 1.0.154 | MIT OR Apache-2.0 | 18/07 e 11/10/2026 | arquivo da escolha e cabeçalhos |
| windows (só Windows) | 0.62.2 | MIT OR Apache-2.0 | 06/10/2025 | abrir link no navegador do sistema e idioma do sistema (já vinha com o Tauri) |

**No total:** 409 crates no lock — 129 no executável do Windows, 150 no do Linux, 124 só no lock (macOS/Android e opcionais). Todas publicadas há 7 dias ou mais em 25/11/2026. Nenhuma GPL, AGPL ou LGPL obrigatória.

**`wry` fixado em 0.57.1 (23/10/2026):** a 0.57.2 puxa, só para Android, `cssparser` 0.38.0 e `selectors` 0.41.0 (MPL-2.0 não aprovadas). O que se perde são correções de Android/macOS e ajustes menores no Windows/Linux.

**Licenças aprovadas pelo usuário em 25/11/2026, crate por crate** (`crateApprovals`; `CLEAN_ROOM.md` §8). Código de crate MPL-2.0 **não é modificado** nem copiado para o repositório.

| Crate | Versão | Licença | Onde |
|---|---|---|---|
| `cssparser` | 0.37.0 | MPL-2.0 | só compilação |
| `cssparser-macros` | 0.7.1 | MPL-2.0 | só compilação |
| `dtoa-short` | 0.3.5 | MPL-2.0 | só compilação |
| `icu_collections` | 2.4.0 | Unicode-3.0 | vai no executável |
| `icu_locale_core` | 2.4.0 | Unicode-3.0 | vai no executável |
| `icu_normalizer` | 2.4.0 | Unicode-3.0 | vai no executável |
| `icu_normalizer_data` | 2.4.0 | Unicode-3.0 | vai no executável |
| `icu_properties` | 2.4.0 | Unicode-3.0 | vai no executável |
| `icu_properties_data` | 2.4.0 | Unicode-3.0 | vai no executável |
| `icu_provider` | 2.4.0 | Unicode-3.0 | vai no executável |
| `litemap` | 0.8.3 | Unicode-3.0 | vai no executável |
| `option-ext` | 0.2.0 | MPL-2.0 | vai no executável |
| `potential_utf` | 0.1.6 | Unicode-3.0 | vai no executável |
| `selectors` | 0.38.0 | MPL-2.0 | só compilação |
| `target-lexicon` | 0.12.16 | Apache-2.0 WITH LLVM-exception | só compilação (só Linux) |
| `tinystr` | 0.8.5 | Unicode-3.0 | vai no executável |
| `unicode-ident` | 1.0.27 | (MIT OR Apache-2.0) AND Unicode-3.0 | só compilação |
| `writeable` | 0.6.4 | Unicode-3.0 | vai no executável |
| `yoke` | 0.8.4 | Unicode-3.0 | vai no executável |
| `yoke-derive` | 0.8.4 | Unicode-3.0 | só compilação |
| `zerofrom` | 0.1.8 | Unicode-3.0 | vai no executável |
| `zerofrom-derive` | 0.1.8 | Unicode-3.0 | só compilação |
| `zerotrie` | 0.2.5 | Unicode-3.0 | vai no executável |
| `zerovec` | 0.11.9 | Unicode-3.0 | vai no executável |
| `zerovec-derive` | 0.11.7 | Unicode-3.0 | só compilação |

**`target-lexicon`:** conferido com `cargo tree -e normal,no-proc-macro` que não entra no executável (só na compilação do GTK, no Linux).

**Carregador do WebView2:** a `webview2-com-sys` (MIT) liga estaticamente a `WebView2LoaderStatic.lib` da Microsoft. A licença do pacote oficial (NuGet `Microsoft.Web.WebView2`) é um texto BSD-3-Clause com copyright da Microsoft (permitida). O aviso e os textos das crates entram no pacote na R8. WebKitGTK, GTK e libsoup são do sistema, sem redistribuição.

**Avisos de segurança (OSV/RustSec, 25/11/2026)**

| Data | Crate | Situação | Revisar |
|---|---|---|---|
| 25/11/2026 | `url` 2.5.8 — RUSTSEC-2026-0592 (`Url::origin()` estoura a pilha com `blob:` aninhado) | **Contornado no código:** a origem só é calculada para `http`/`https` (`nav.rs::web_origin`, teste `nested_blob_does_not_crash`). **Pendência datada:** trocar pela 2.5.9 | a partir de **27/11/2026, 20h03** (horário de Brasília), quando completa 7 dias |
| 25/11/2026 | `cookie` 0.18.2 — RUSTSEC-2026-0594 (cookies cifrados em processos que fazem `fork`) | **Não afeta:** o programa não usa cookies cifrados nem `fork` | 0.18.3 a partir de 30/11/2026 |
| 25/11/2026 | **Risco aceito:** `glib` 0.18.5 (só Linux) — RUSTSEC-2024-0429 (iterador `VariantStrIter` incorreto) | O código do LuDraw não usa esse iterador; a versão é a do GTK 3 que o Tauri 2 exige e a correção só existe no `glib` 0.20 | quando o Tauri trocar de GTK ou a cada atualização do Tauri |
| 25/11/2026 | **Risco aceito:** `proc-macro-error` 1.0.4 (só compilação, só Linux) — RUSTSEC-2024-0370 (sem manutenção) | Roda só na máquina que compila; nada vai no executável; não há falha conhecida | a cada atualização do Tauri |

**Limites registrados**
* **WebView2 e origem bloqueada:** no Windows, ao recusar uma navegação para fora, o motor **já pode ter enviado o GET** à origem bloqueada antes de o programa recusar (a página não abre e nada da resposta chega ao app). No WebKitGTK o pedido não sai. Medido no passo 0 e no `test:desktop:app`.
* No Windows, o objeto da ponte do Tauri aparece até dentro dos quadros isolados das extensões; por isso a proteção é a permissão por janela (a do board não tem nenhuma).
* Emissor de SSO que redireciona para outro domínio (federação) ou recusa navegador embutido não entra pelo programa (consequência da D14).
* Os boards locais do programa e os do navegador são separados, e "Trazer boards deste navegador" não os enxerga (outra origem).

#### 3.8.1 Instaladores (Chat 09.1 · R8, 25/11/2026)

**Ferramenta de empacotamento:** `@tauri-apps/cli` **2.12.6** (desenvolvimento, versão exata; publicada em 18/11/2026; Apache-2.0 OR MIT; assinaturas do registro conferidas). Entram no `package-lock.json` o pacote e os 11 binários opcionais por sistema, todos 2.12.6 e com a mesma licença; o npm só baixa o do sistema em uso. Não vai para o app nem para o servidor, por isso os `THIRD_PARTY_NOTICES.txt` não mudaram.

**Windows (NSIS):** instalação por usuário (`%LOCALAPPDATA%\LuDraw`, sem administrador), textos do instalador em inglês e pt-BR (os do próprio Tauri), WebView2 baixado da Microsoft só se faltar (nada dela é redistribuído além do carregador do §3.8). **Compressão zlib:** a padrão do Tauri (LZMA) é CPL-1.0, fora da lista permitida; a zlib é zlib/libpng. O desinstalador só apaga os dados se a pessoa marcar a opção (desmarcada por padrão). Sem assinatura de código (decisão do usuário, 25/11/2026).

| Componente do instalador | Versão | Licença | Origem | SHA-256 |
|---|---|---|---|---|
| NSIS | 3.13 (`nsis-3.13.zip`) | zlib/libpng (o módulo de compressão usado também) | release oficial `tauri-apps/binary-releases`, o mesmo que o CLI baixa | `ba63dffc4410ee89193e1cb5a41989991bd77c61068da17e3156d136b7b0b3d8` |
| `nsis_tauri_utils.dll` | 0.5.3 | MIT OR Apache-2.0 | release oficial `tauri-apps/nsis-tauri-utils` (commit da tag `13d9edd27b69310e108d6fbd49f90992f8a05390`) | `5ba143b5db4a87d32d6e7802e033330aae56cbceabe0d1e3ba41948385ad4709` |

O `desktop.yml` baixa os dois, confere o SHA-256 e os põe onde o Tauri procura (ele não baixa nada; o workflow falha se baixar).

**Linux (.deb):** pacote `ludraw` (o padrão do Tauri seria `lu-draw`; por isso `productName` = `ludraw` só no `tauri.linux.conf.json`), mantenedor "LuDraw", seção `graphics`, depende só de `libwebkit2gtk-4.1-0` e `libgtk-3-0`. Atalho próprio (`src-tauri/linux/ludraw.desktop`, escrito do zero, inglês e pt-BR). Licença em `/usr/share/doc/ludraw/copyright` e os dois avisos de terceiros na mesma pasta. **Compilado no Debian 12** (`rust:1.99.1-slim-bookworm@sha256:f2c004e3d2d8b547e8cf7ffbc29205385f4e71d23e53e4e383065db5e9f822cd`, 05/11/2026): o programa exige no máximo a glibc 2.34. Compilado no Debian 13, exigia a 2.39 e não abriria no Ubuntu 22.04. Instalado, aberto e removido de verdade no Debian 12 e 13 e no Ubuntu 22.04 e 24.04.

**Avisos de terceiros do desktop:** `src-tauri/THIRD_PARTY_NOTICES.txt` (`npm run notices:desktop`), com as 169 crates do executável e os 3 componentes do instalador (textos iguais uma vez só). Vai nos dois pacotes como `THIRD_PARTY_NOTICES-desktop.txt`, junto do `THIRD_PARTY_NOTICES-app.txt` (o do app web) e da LICENSE. O `audit:legal` confere o arquivo pelo inventário, sem o cargo.

**Textos de licença guardados em `src-tauri/licenses/`** (sem alteração; as crates abaixo foram publicadas sem o arquivo de licença, e o commit vem do `.cargo_vcs_info.json` de cada uma):

| Arquivo | Para | Origem | SHA-256 |
|---|---|---|---|
| `alloc-stdlib-0.3.0.txt` | `alloc-stdlib` 0.3.0 (BSD-3-Clause) | `LICENSE` da raiz de `github.com/dropbox/rust-alloc-no-stdlib`, commit `0a81fd6928ea3b33c8cd484aa4575d50ffb98012` (idêntico ao da `alloc-no-stdlib`, do mesmo autor) | `c0c56f26d9c051cac4d200c34c84e7ae9aaa853e01a982a1df08b09931e518ae` |
| `dlopen2-0.8.2.txt` | `dlopen2` 0.8.2 (MIT) | `LICENSE` de `github.com/OpenByteDev/dlopen2`, commit `cc80e4a0a90d499b677fdf7743699b4b3a43a989` | `39fa265207450e77c62e90c5594a06c085b655d8374c7ced4bf7894b6bd95dd2` |
| `webview2-com-0.39.1.txt` | `webview2-com` e `webview2-com-sys` 0.39.1 (MIT) | `LICENSE` de `github.com/wravery/webview2-rs`, commit `edc2caf886175ccaebe86078c9cfe1ae2a187328` | `0dcf41516e608bbcb6cdc5229feb7b86fe4a643b85e7df251133c93408fdac73` |
| `Microsoft.Web.WebView2-1.0.3650.58.txt` | carregador do WebView2 (BSD-3-Clause, Microsoft) | `LICENSE.txt` do pacote oficial `Microsoft.Web.WebView2` 1.0.3650.58 no nuget.org (a versão do SDK que a `webview2-com-sys` 0.39.1 declara). A biblioteca da crate não é idêntica byte a byte à de nenhum pacote conferido (1.0.3351.48, 1.0.3650.58 e 1.0.4370.26), mas o texto da licença é o mesmo nos três. **Nota aceita pelo usuário em 25/11/2026** | `0af8f1b807512aae39c2ac1aa4d0cae65cabecb6fd554b8439a5162a0d6eca55` |
| `NSIS-3.13-COPYING-zlib.txt` | NSIS 3.13 | linhas 1–31 do `COPYING` do `nsis-3.13.zip` acima (copyright, licenças aplicáveis e o texto zlib/libpng; as partes de bzip2 e LZMA não se aplicam à compressão zlib) | `8d3d058b7f3230a8609d0115e25f16546bef0c94e7a48d205b4db513967a3d7a` |
| `nsis_tauri_utils-0.5.3-MIT.txt` / `-APACHE-2.0.txt` | `nsis_tauri_utils` 0.5.3 | `LICENSE_MIT` e `LICENSE_APACHE-2.0` de `github.com/tauri-apps/nsis-tauri-utils`, commit `13d9edd27b69310e108d6fbd49f90992f8a05390` | `1c1020fa10a6bf318717e82c911bcc54ebdfb9bb280460ae332bcb2f82f57fbe` / `0d542e0c8804e39aa7f37eb00da5a762149dc682d7829451287e11b938e94594` |

**CI e distribuição** (`.github/workflows/ci.yml` e `desktop.yml`):

| Action / imagem | Versão → fixação | Publicada | Licença | Uso |
|---|---|---|---|---|
| actions/upload-artifact | **v7.0.2** → `cf430e030ddbb5b0abf93d22962f4752f3646cd9` | 07/10/2026 | MIT | guardar os instaladores (SHA da tag conferido pela API e pelo `git ls-remote` do repositório oficial) |
| actions/download-artifact | **v8.0.2** → `9000827ccba6bdab643e8b6fd33ac0654aef8333` | 07/10/2026 | MIT | idem |
| `rust:1.99.1-slim-bookworm` | `@sha256:f2c004e3d2d8b547e8cf7ffbc29205385f4e71d23e53e4e383065db5e9f822cd` | 05/11/2026 | imagem oficial | compilar o `.deb` e os testes do Rust no Linux |
| `debian:12-slim` · `debian:trixie-slim` | `@sha256:e67eeead736ff7bbe258ef088bff683635c561b1fcfefad0806c1df4ab49ce0e` · `@sha256:8aa5a7bf5a1955bddbe7d74fcdd0b91ab30e74362a8b73af672b0481b35b44a0` | 23/11/2026 | imagens oficiais | só para instalar e testar o `.deb` (nada delas vai no pacote). **Menos de 7 dias** em 25/11/2026. **Pendência datada aceita pelo usuário (25/11/2026):** a partir de 30/11/2026, conferir de novo e fixar o digest com 7 dias ou mais |
| `ubuntu:22.04` · `ubuntu:24.04` | `@sha256:b000e69a50ff940390233025e7a337fb8469b509e2334fa4d018ac30f3e18cdb` · `@sha256:562111b88caa79c71391c0c4d3c2114a7d5c35915c20561fd893cb1e07929e6b` | 17/11 e 10/11/2026 | imagens oficiais | idem |

Sem segredos; permissão de escrita só no job que cria o Release em **rascunho** (só na tag). O NSIS e o plugin são conferidos por SHA-256 antes de usar.

**Limites registrados (R8):**
* **Sem assinatura de código:** o Windows pode mostrar o aviso do SmartScreen e, com o Controle Inteligente de Aplicativos ligado, bloquear o instalador (visto no Windows Sandbox, que já vem com ele ligado). O README explica e manda conferir o `SHA256SUMS`, sem ensinar a desligar proteção.
* **Aviso 6040 do NSIS** (`choowHowToInstall`): erro de digitação no modelo do próprio Tauri, que aparece com qualquer configuração; não afeta o instalador.
* **Arquivos de `/usr/share/doc/ludraw` com permissão de execução** (o Tauri copia assim). Inofensivo; o `lintian` reclamaria.
* O **Tauri grava no executável empacotado o tipo de pacote** (3 bytes: `NSS` ou `DEB`); o `test:desktop:package` compara o resto byte a byte.
* **Fechar a janela:** o programa espera o app terminar de gravar (até 10 s). Uma página de servidor modificada poderia segurar o fechamento até esse teto, não mais.

* O Modo Servidor do programa precisa do servidor no ar para abrir.

## 4. Assets (fontes, ícones, imagens, sons, templates)

| Asset | Origem | Licença | Observação |
|---|---|---|---|
| Logo LuDraw (`LogoMark` em `src/components/ui/Logo.tsx`) e `public/favicon.svg` | autoria do usuário/projeto (SVG escrito à mão, Chat 01) | do projeto (MIT) | mesmo desenho nos dois |
| Ícones do programa desktop (`src-tauri/icons/*`): `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.png`, `icon.ico` | gerados do `public/favicon.svg` (linha de cima) por `npm run desktop:icons` (Chat 09.1 · R7; Chrome sem janela, contêiner `.ico` escrito do zero) | do projeto (MIT) | SHA-256: `32x32.png` `3fa7519855dd5fac40f72e816761bdfeebd7f2587cffc6e50f6d9d89493623ff` · `128x128.png` `f5f11b310b5b51c010da45364a4b50edd57c73a73f6baa9a1ef12e066ca923b9` · `128x128@2x.png` `5a6f3536e011e07990c9712623c78404e4ec256f0aadfdc6660bd57d6434ceda` · `icon.png` `2f15bd85ba2762f296fb1a1a1fde44d70bb6fb9c34c176664132d1e49f59a828` · `icon.ico` `7bc30a5532b9605caa595af57260cdca82b86a539058b90673810d6844def611` |
| Logo da splash (`SPLASH_LOGO` em `src/utils/logoAnimation.ts`, boot em `index.html`) | autoria do usuário (`splash-reference.html`, Chat 03) | do projeto (MIT) | geometria levemente diferente da `LogoMark` (ver `HANDOFF`/resposta do Chat 03) |
| Animação da splash (`logoAnimation.ts`, `splashField.ts`) | porte da referência criada pelo usuário (`ai-memory/refs/splash-reference.html`, `SPLASH_SPEC.md`) + efeitos escritos do zero no Chat 03 | do projeto (MIT) | sem bibliotecas |
| `docs/banner.svg` | criado do zero para o README (Chat 01) | do projeto (MIT) | |
| `docs/banner.en.svg` | cópia do `docs/banner.svg` com os textos reescritos em inglês para o `README.en.md` (Chat 05.6 · B) | do projeto (MIT) | mesmo desenho; só os 4 textos mudam |
| ~~`dsa.html` (raiz do repositório)~~ | ~~cópia da referência da splash~~ | do usuário | **removido em 05/11/2026** (era um teste da splash; a referência oficial continua em `ai-memory/refs/splash-reference.html`) |
| Board de boas-vindas "Comece por aqui" (`src/utils/welcome.ts`) | texto e layout escritos do zero (Chat 02 · Rodada 0, movido no Chat 03) | do projeto (MIT) | |
| Mapa mental: cores dos ramos (`MINDMAP_BRANCH_COLORS`), raiz `#194B32`/`#D0E4AE` | subconjunto das cores de tag do projeto + cores da marca (Chat 03) | do projeto (MIT) | |
| Paleta de post-its `STICKY_PALETTE` / `STICKY_COLORS` (`src/utils/factory.ts`): 16 cores e nomes pt-BR (Rosa-quartzo … Algodão-doce) | **definida do zero no Chat 05.5** (decisão do usuário de 05/11/2026): matizes a cada 22,5° no OKLCH, claridade pastel alternada, croma limitado à gama sRGB; contraste do texto conferido por cálculo (≥ 10,1:1) | do projeto (MIT) | substitui a paleta do Chat 01 (§9 item 3); boards salvos mantêm as cores gravadas |
| Frames: paleta `FRAME_FILLS`, proporções `FRAME_RATIOS` (A4 = 595×842 pt, ISO 216) | definidas do zero (Chat 03); A4 é norma pública | do projeto (MIT) | |
| Texto da linha: estilos padrão e presets (`LABEL_*`, `ConnectorLabelPanel`) | definidos do zero (Chat 03); fontes = as já listadas abaixo | do projeto (MIT) | |
| Ícones dos controles novos (frame, olhinho, exportar, apresentação, mapa mental, texto da linha) | `lucide-react` 0.460.0 + SVGs inline desenhados à mão (pontas de seta, saltos de linha, rotas) | ISC / do projeto | nenhum ícone de terceiros copiado |
| `docs/screenshots/board-claro.png` · `docs/screenshots/board-escuro.png` | **capturas novas do próprio app** (board de boas-vindas "Comece por aqui" no tema claro e no escuro, 1440×860 PNG). Primeira versão feita pelo usuário em 22/11/2026; **refeitas em 23/11/2026 na renomeação para LuDraw** pelo agente, no servidor de desenvolvimento local (`localhost`, Modo Local, perfil de navegador limpo), sem conteúdo nem produto de terceiros; conferido que o nome antigo não aparece. SHA-256 `20e5b384…eb40064` (claro) e `0fc4d1d0…bfb62b` (escuro) | do projeto (MIT) | liberadas uma a uma no `scripts/audit-terms.json` (`doNotPublish.allow`); outro arquivo na pasta volta a gerar aviso |
| ~~`docs/screenshots/*`~~ (Chat 01) | capturas de tela do próprio LuDraw (Chat 01) | do projeto (MIT) | **apagadas** (decisão do usuário, 05/11/2026, §9 item 4). Chat 08.6: as referências a elas saíram dos READMEs; capturas novas, do layout atual, quando houver |
| Ilustrações da tela de login e miniaturas de template (`TemplateThumb.tsx`) | desenhadas em JSX/SVG do zero | do projeto (MIT) | |
| Ícones de interface | `lucide-react` 0.460.0 | ISC | |
| Música ambiente e alarme do cronômetro (`src/utils/ambientAudio.ts`: Lo-Fi, Ambient Pad, Focus Pulse, alarme, sino) | **síntese procedural** via Web Audio API escrita do zero (Chat 04) — osciladores, ruído e envelopes gerados em tempo real | do projeto (MIT) | nenhum arquivo de áudio (MP3/WAV) no repositório nem baixado |
| Templates da galeria: Matriz SWOT (FOFA), Retrospectiva (Começar · Parar · Continuar), Kanban de Sprint, Jornada do Usuário, Arquitetura & Fluxograma (`src/utils/templates.ts`) | textos, layout e cores criados do zero (Chat 04); SWOT e Começar/Parar/Continuar são técnicas genéricas de domínio público | do projeto (MIT) | |
| Template "Modelo de Negócio em 9 blocos" (`createBusinessModelElements`) | **versão genérica própria** (decisão do usuário no Chat 04): nome, rótulos ("1 · Para quem" … "9 · Receitas"), perguntas-guia e grade 3×3 escritos do zero; **não** reproduz o nome, a arte, o layout nem os textos do canvas original (CC BY-SA) | do projeto (MIT) | sem atribuição necessária por não usar o material licenciado |
| Cores de conteúdo do Kanban, Tabela, diagrama e pódio (`KANBAN_COLORS`, `KANBAN_COLUMN_COLORS`, `PRIORITY_META`, `TABLE_CELL_FILLS`, cores das formas do diagrama, medalhas) | definidas do zero (Chat 04), derivadas das cores da marca/tags do projeto | do projeto (MIT) | |
| Exemplos e guia do diagrama por texto (`DIAGRAM_EXAMPLE`, `DIAGRAM_SNIPPETS`) | escritos do zero (Chat 04) | do projeto (MIT) | |
| Miniaturas novas (`TemplateThumb.tsx`: swot, business9, journey, architecture) e frame 26 do Design System | JSX/SVG desenhado à mão (Chat 04) | do projeto (MIT) | |
| Frame 27 do Design System (`Chat05Demo.tsx`) e o SVG de demonstração (retângulo, estrela, círculo) | JSX/SVG escritos à mão (Chat 05) | do projeto (MIT) | a estrela é um polígono genérico de 10 pontos |
| Ícones dos controles do Chat 05 (exportar, importar, inspetor, destinos) | `lucide-react` 0.460.0 — só nomes já usados no projeto | ISC | nenhum ícone novo de terceiros |
| Extensões oficiais embutidas `src/extensions/builtin/*` (Chat 06.5 · A): `tema-grafite`, `formas-fluxograma`, `modelos-scrum` (`manifest.json` + `LICENSE`) | **escritas do zero** neste chat. **Tema "Grafite" (E01):** valores de cor escolhidos para o projeto e conferidos pelo validador de contraste (WCAG 2.x). **Formas "Fluxograma" (E02):** terminador, decisão, processo, documento e banco de dados são **geometria genérica padrão** de fluxogramas (retângulo, losango, retângulo de pontas arredondadas, base ondulada, cilindro), com paths numéricos escritos à mão. **Modelos "Scrum" (E03):** planejamento, revisão e retrospectiva usam o **vocabulário público do Guia do Scrum** (sprint, meta da sprint, revisão, retrospectiva, critério de aceite, partes interessadas) com **estrutura, colunas, textos de apoio e exemplos próprios** (pt-BR e en); o elemento composto "Cartão de história" tem layout próprio | do projeto (MIT) — cada pacote traz uma cópia do `LICENSE` do projeto | **nenhum conteúdo de terceiros copiado**: sem desenho, ícone, texto, nome de canvas ou layout de outro produto; `provenance.originalWork: true` e `thirdParty: []` nos três manifests; ids com o prefixo reservado `dev.ludraw.` |
| Extensões oficiais programáveis `src/extensions/builtin/{contador-palavras,formatos-drawio}/` (Chat 06.5 · B): `manifest.json` + `main.js` + `LICENSE` | **escritas do zero** neste chat. **E04 "Contador de palavras":** contagem própria por expressão regular Unicode (letras e números, com apóstrofo e hífen internos), textos pt-BR/en próprios. **E05 "Formatos de diagrama abertos (.drawio)":** leitor de XML próprio e conversão escritos a partir da descrição pública do formato aberto; ajustes pós-teste (grupos, contêineres, lados de ligação, pontos intermediários, laço, rótulo fora da forma) conferidos com o arquivo `teste.drawio` **exportado pelo próprio usuário** e com fixtures escritas à mão | do projeto (MIT) — cada pacote traz uma cópia do `LICENSE` do projeto | nenhum código, ícone ou texto de terceiros; o arquivo do usuário não foi copiado para os testes (as fixtures reproduzem só a estrutura, com textos próprios); `provenance.originalWork: true`, `thirdParty: []` |
| Frame 29 do Design System (`Chat065Demo.tsx`) e miniatura gerada de modelos de extensão (`extensions/TemplatePreview.tsx`) | JSX/SVG escritos à mão (Chat 06.5) a partir dos próprios manifests embutidos | do projeto (MIT) | ícones `lucide-react` (`Puzzle`, `Fingerprint`, `ShieldCheck`, `ShieldOff`) |
| Faixas dos e-mails (`src/utils/mailBanners.ts` → PNG em `server/src/mail/bannerImages.ts`, gerado por `npm run mail:assets`) e layout dos e-mails (`src/utils/mailLayout.ts`) — Chat 08.5 · B2 | **SVG escrito à mão** neste chat: símbolo e "ludraw" do próprio logo do projeto, grade de pontos e trilha do canvas, ilustrações próprias com formas simples (post-its, cursor, chave, prédio, envelope, aviãozinho, porta, bússola). PNG fotografado pelo Chrome/Edge já instalado (sem dependência nova), com a fonte **Figtree** (OFL-1.1, §3.1) embutida só na geração | do projeto (MIT) | nenhum ícone, ilustração, modelo de e-mail ou texto de terceiros; nenhum ícone `lucide` dentro das faixas; o PNG vai embutido na mensagem (CID), sem recurso externo. **SHA-256 dos PNGs (Chat 08.6; regerados na renomeação para LuDraw, R3, com o wordmark "Lu"+"Draw"; conferidos pelo `test:server`):** invite `73d87094c285a72f81a5b0c7a767a628c8454c7c94fccea01ecb79f9b7cff9c2` · key `32423ab60eb2573719d5bf2edf9f6e1db0e9fd9aa1a6bf39aaaf823eb0f7e606` · building `19e5ceb9fd0937fb76c6d5117aca40e402a0b467f539a397dfe1cdc958c0db61` · envelope `89eeb2530a92e37d33d029991000b3f45f6df0f014bbe5b5922d303ee9ca7701` · plane `64c5db1c4d830972ae826edb8372e39f2f2a0d19c93814969dc120a077f72d99` · door `7229d9adc8f5af21dbea600406a077aa2035232751817ef2a326e828a4340900` · compass `f97e0bf6e55c6b3764d88647d74ae1b566f07cc4cc3b1bd9add3b6cbaf8eccf1` |

**Fontes:** autohospedadas desde o Chat 05.5 — pacotes, versões e licenças no §3.1. Até o Chat 05 eram carregadas do Google Fonts por `index.html` (mesmas 18 famílias, mesmas licenças); os `<link>` e `preconnect` foram removidos e o `audit:legal` agora **bloqueia** qualquer referência a `fonts.googleapis.com`/`fonts.gstatic.com` (regra `fonte-externa`). Fontes do sistema (Arial, Georgia) não são distribuídas.

| Família (nome CSS) | Pacote | Licença | Uso |
|---|---|---|---|
| Figtree | @fontsource-variable/figtree | OFL-1.1 | UI |
| Fraunces | @fontsource-variable/fraunces | OFL-1.1 | títulos display |
| IBM Plex Mono | @fontsource/ibm-plex-mono | OFL-1.1 | código/teclas e board |
| IBM Plex Sans · IBM Plex Serif | @fontsource-variable/ibm-plex-sans · @fontsource/ibm-plex-serif | OFL-1.1 | fontes do board |
| Open Sans | @fontsource-variable/open-sans | OFL-1.1 | fonte padrão do board |
| Abril Fatface · Bangers · Caveat · EB Garamond · Fredoka · Graduate · Gravitas One · Nixie One · Noto Sans · PT Sans | @fontsource/abril-fatface · @fontsource/bangers · @fontsource-variable/caveat · @fontsource-variable/eb-garamond · @fontsource-variable/fredoka · @fontsource/graduate · @fontsource/gravitas-one · @fontsource/nixie-one · @fontsource-variable/noto-sans · @fontsource/pt-sans | OFL-1.1 | fontes do board |
| Permanent Marker | @fontsource/permanent-marker | Apache-2.0 | fonte do board |
| Roboto Slab | @fontsource-variable/roboto-slab | Apache-2.0 | fonte do board |

### 4.1 Provas de origem versionadas (SHA-256) — Chat 08.6 · C

Desde o Chat 08.6, as regras de sala limpa e as referências de desenho que provam a origem dos ícones próprios e da splash ficam **no git** (o resto de `ai-memory/` continua fora: `.gitignore` → `ai-memory/*` com exceção de `ai-memory/CLEAN_ROOM.md` e `ai-memory/refs/`). O `npm run audit:legal` confere estes hashes: referência alterada ou sem registro **bloqueia**; `CLEAN_ROOM.md` diferente do registrado é **aviso**. **Regra:** a cada fechamento de chat, recalcule o SHA-256 do `CLEAN_ROOM.md` (`sha256sum ai-memory/CLEAN_ROOM.md`) e atualize a linha abaixo com a data; uma referência só muda com decisão registrada e hash novo.

As referências são páginas HTML de estudo, abertas só no navegador de quem desenvolve: carregam fontes do Google Fonts para visualização e **não vão para o app** (o `audit:legal` não varre `ai-memory/`; a regra `fonte-externa` vale para o código distribuído).

**Renomeação para LuDraw (23/11/2026):** as referências de `ai-memory/refs/` **não foram alteradas** e continuam citando o nome que o projeto tinha na época em que foram feitas. Elas são provas de origem datadas; mudá-las trocaria o conteúdo que o SHA-256 abaixo registra. Por isso ficam na exceção do `npm run audit:name` (decisão do usuário). Os hashes abaixo continuam valendo.

| Arquivo | SHA-256 | Bytes | O que é |
|---|---|---|---|
| `ai-memory/CLEAN_ROOM.md` | `73d3256dc4033e7bb49f60a174482d716ca394c5a7cc11314192b4c363732ead` | 9090 | Protocolo de sala limpa (regras R1–R12, licenças §5, decisões §8). Hash registrado em 23/11/2026 (renomeação para LuDraw: só o nome do projeto mudou no texto; regras, licenças e decisões intactas) |
| `ai-memory/refs/splash-reference.html` | `566b3ee3ebf2a3a7f028bf4d43b38fac487ad24598d32c6d99038b5408ed375e` | 13513 | Referência da animação da splash — autoria do usuário (Chat 03, §4) |
| `ai-memory/refs/SPLASH_SPEC.md` | `efea93a9c3d75e9aac798626728013b703a4f83edd2edfb9f2c672a0dbef0f33` | 2957 | Especificação da splash escrita a partir da referência acima (Chat 03) |
| `ai-memory/refs/estudio-v2-centro.html` | `fe272bef558081e5b3d6260b604801a0879e61095a7ad253794b10b2690c4954` | 78412 | Referência do Estúdio v2 feita para o LuDraw a pedido do mantenedor: barra do topo, Dock e ícones "traço da pena" (Chat 08.2, §28–§29) |
| `ai-memory/refs/estudio-v2-barra-contexto.html` | `3595d62d97d6eedebbda54e5e56edf31f6d9ecea91743e77ecf8762995eb67b5` | 47236 | Referência da Cinta do objeto e dos ícones da linha rápida (Chat 08.2 · C-2, §30) |

## 5. Formatos importados e exportados

| Formato | Direção | Base | Onde |
|---|---|---|---|
| SVG | **import (Chat 05)** · export (Chat 05) | padrão aberto W3C (SVG 1.1; paths/arcos pelas notas de implementação da especificação) | import: `utils/svgImport.ts` + `utils/svgPath.ts` → formas (inclusive contorno livre `customPath`), conectores, textos e imagens embutidas; export: `utils/svgContext.ts` grava o MESMO desenho do PNG/PDF como vetor |
| `.excalidraw` | import (Chat 05: arquivo e `Ctrl+V`) | formato JSON aberto de projeto MIT (`CLEAN_ROOM.md` §2.3) | `utils/excalidrawImport.ts` — escrito do zero a partir da estrutura pública do JSON; sem código do projeto de origem |
| CSV / TSV | import (Chat 05) / export | RFC 4180; codificação pelo WHATWG Encoding (`TextDecoder`: UTF-8 com/sem BOM, UTF-16 com BOM, alternativa Windows-1252) | `utils/csv.ts`, `utils/sheets.ts`; **todo CSV/TSV exportado é protegido contra injeção de fórmulas** (`guardSpreadsheetValue`) |
| `.xlsx` | import (Chat 05) | Office Open XML — ECMA-376 / ISO/IEC 29500 (padrão aberto) | `utils/sheets.ts` (`readXlsx`) + `utils/zip.ts`; só valores armazenados — fórmulas não são calculadas, macros (`vbaProject.bin`) e vínculos externos nunca são lidos; limite 50 MB descompactados e 5.000 × 60 por aba |
| `.ods` | import (Chat 05) | OpenDocument — OASIS ODF / ISO/IEC 26300 | `utils/sheets.ts` (`readOds`); mesmas regras do `.xlsx` |
| Tabela HTML colada (`<table>`) | import (Chat 05) | HTML (WHATWG) — só `<table>/<tr>/<td>/<th>`, `colspan`/`rowspan`, `bgcolor` e CSS básico (cor de fundo, cor, negrito, itálico, alinhamento) | `utils/sheets.ts` (`parseHtmlTables`); **atributos `data-*` e marcadores proprietários nunca são lidos** |
| HTML genérico colado (títulos, parágrafos, listas, imagens `data:`) | import (Chat 05) | HTML (WHATWG) | `utils/clipboard.ts` (`elementsFromGenericHtml`) |
| Clipboard genérico (`text/plain`, `text/html`, `image/svg+xml`, arquivos) | import | API padrão do navegador (evento `paste` do usuário / `navigator.clipboard.read()` do menu "Colar") | `utils/clipboard.ts`; tipos não padrão aparecem no Inspetor só pelo NOME (conteúdo não lido) |
| Texto (`.txt`, `.md`) | import (Chat 05) | texto simples UTF-8 | post-it / post-its por item de lista / bloco de texto |
| PNG / PDF | export | padrões abertos | Chat 05: **PDF multipáginas** (`exportPagesAsPDF`): cada frame vira uma página em alta resolução (raster ≥ 2×; A4 sai em A4), na ordem dos slides — `pdf-lib` (MIT, já declarado) |
| PNG 2x/4x e PDF de um frame (Chat 03 · Rodada B) | export | padrões abertos (PDF via `pdf-lib`, já declarado no §3); mesmo caminho `allowExport()` | Chat 05 acrescentou **SVG do frame** |
| CSV de issues (rastreadores de tarefas) | export (Chat 05) | colunas `Summary, Description, Issue Type, Priority, Assignee, Labels, Epic/Frame, Author, Votes, Created At` (+ `Status, Story Points, Due Date`), nomes de campo da documentação pública de importação por CSV de rastreadores como Jira e GitHub — **sem uso de API**; vírgula, UTF-8 sem BOM, CRLF | `utils/issuesCsv.ts`, `utils/exportActions.ts` |
| Tabela → planilha: "copiar como planilha" (TSV + HTML) e "Exportar tabela (CSV)" | export (Chat 05) | TSV/HTML/CSV genéricos (RFC 4180) | `utils/tableExport.ts` (usa `rangeToTsv` e `layoutTable`) |
| `.ludraw`, `.ludraw-workspace`, `.ludraw-ext` | import/export | formatos próprios (Chat 03 acrescentou só campos opcionais: `ConnectorElement.lineJumps/labelPosition/labelStyle`, `MindMapNodeItem.width/height/side`; `FrameElement` passou a ser usado; Chat 05: `ShapeElement.customPath/customPathBox`, ação `imported` no Activity Log). Chat 05: um `.ludraw` solto no board entra como objetos no board aberto | |
| Texto de fluxograma no modal "Diagrama por texto" (Chat 04) | entrada de texto (não é arquivo) | **parser próprio** (`src/utils/diagram.ts`) escrito do zero para um subconjunto de sintaxe de fluxograma de documentação pública (`flowchart TD`, `A[...] --> B{...}`, `subgraph`); nenhuma biblioteca nem código de terceiros; gera formas e conectores nativos | |
| Catálogos de tradução `src/locales/<código>/*.json` + `_meta.json` (Chat 05.6) | interno / contribuição | **formato próprio** (JSON plano `"chave": "texto"`, plural por sufixo `_one/_other/…` segundo as categorias de `Intl.PluralRules`, placeholders `{nome}`, marcação mínima `<b>/<kbd>/<code>/<em>/<link>/<br/>`); descrito em `docs/TRANSLATING.md`; textos pt-BR e en de autoria do projeto (MIT) | `src/i18n/catalogs.ts`; idiomas da comunidade descobertos por `import.meta.glob` |
| `.ludraw` — campos do Chat 05.6 | import/export | formato próprio: só campos opcionais — `BoardActivityEntry.message` (`{ key, params }`) e `summary` passou a ser opcional (entradas antigas continuam com ele); `Preferences.locale` no estado do app. Nenhum campo removido; boards antigos abrem iguais | `src/types/canvas.ts`, `src/types/workspace.ts` |
| CSV de issues no Chat 05.6 | export | cabeçalhos e valores `Task/Story/Bug` **continuam em inglês em qualquer idioma** (padrão de importação do formato); só textos de reserva (sem título, sem frame) seguem o idioma | `utils/issuesCsv.ts` |
| Templates pessoais (Chat 04) | interno | entidades `TemplateEntity` no formato próprio (`localStorage`, escopo `personal`); sem formato de arquivo novo | |
| CSV do Audit Log do Workspace (Chat 06 · A) | export | CSV genérico (RFC 4180) com cabeçalhos **no idioma ativo** (não é formato padronizado) — Data, Autor, Ação, Descrição, Alvo, Alterações, Id do autor; BOM UTF-8; células por `toCsv` (proteção contra fórmulas) | `components/admin/AdminAudit.tsx` |
| Estado do app — campos do Chat 06 · A | interno | formato próprio, só campos novos/opcionais no `ludraw:app`: `workspace`, `directory` (`UserAccount`), `teams`, `projects`, `invitations`, `auditLog` (autor/alvo por **id**, mensagem `{key, params}`, `changes`), `currentPlace`, `localGuestId`; `BoardMeta` ganha `workspaceId/isPersonalSpace/teamId/projectId/members/publicLink/deletedAt/deletedBy` (todos já previstos no contrato do Chat 02). Migração idempotente (`normalizeBoards`); `BoardData` dos boards não muda | `src/store/workspaceSlice.ts`, `src/utils/workspace.ts` |
| `.ludraw-workspace` — backup completo do Workspace (Chat 06 · B) | import/export | **formato próprio** (JSON, `format: "ludraw-workspace"`, `version: 1`): organização + políticas, diretório, times, projetos, templates, Audit Log, metadados e conteúdo de todos os boards e histórico de versões. Ficam de fora por segurança senhas locais e convites pendentes. Leitura valida formato, versão (versão mais nova é recusada com o motivo) e estrutura antes de gravar | `src/utils/workspaceBackup.ts`, `components/admin/AdminBackup.tsx` |
| Armazenamento local — IndexedDB (Chat 06 · B) | interno | API padrão do navegador (W3C Indexed Database API), sem biblioteca: banco `ludraw` com stores `boards`, `snapshots` (índice `boardId`) e `meta`; migração automática e conferida do `localStorage["ludraw:board:*"]`; alternativa `localStorage` quando o IndexedDB não está disponível. `BoardData` não muda | `src/utils/boardRepository.ts` |
| `.ludraw-ext` — pacote de extensão (Chat 06.5 · A) | import | **formato próprio**: ZIP (lido pelo leitor próprio `utils/zip.ts`) ou pasta local (modo dev) com `manifest.json` (contrato `EXTENSIONS_SPEC.md` §3.1, validado por allowlist em `src/extensions/schema.ts`), `LICENSE`, `README.md` opcional e `assets/**` (`.svg` sanitizado e reconstruído, `.png`/`.webp` com assinatura conferida, `.json`, `.txt`, `.md`). Nenhum código é aceito no Nível 1. Limites medidos nos bytes REAIS (5 MB de pacote, 2 MB por arquivo, 8 MB descompactado, 200 arquivos, taxa de compressão ≤ 100×); caminhos com `..`, absolutos, `\\` ou repetidos por maiúscula são recusados | `src/extensions/package.ts`, `loader.ts` |
| Armazenamento das extensões — IndexedDB v2 (Chat 06.5 · A) | interno | stores novos `extensions` (`ExtensionRecord`: versão, publisher, hash do pacote e de cada arquivo, permissões aprovadas, ativa) e `extensionFiles` (bytes de cada arquivo instalado) + chaves `ext:*` em `meta` (Modo Seguro, tema). Upgrade v1 → v2 idempotente; boards e versões intactos (conferido no Chrome) | `src/utils/boardRepository.ts`, `store/useExtensionsStore.ts` |
| Elemento `composite` no `BoardData` (Chat 06.5 · A) | interno | campo novo e opcional da união de elementos: peças declarativas COPIADAS no elemento (`rect`, `ellipse`, `path` normalizado M/L/C/Q/Z, `text`, `badge`). Validado em toda leitura (`validateCompositeElement`); inválido não desenha nem exporta, sem quebrar o board. Boards antigos não mudam | `types/canvas.ts`, `utils/composite.ts` |
| `.drawio` — extensão oficial E05 (Chat 06.5 · B) | import | **formato aberto e documentado** (XML: `mxfile` › `diagram` › `mxGraphModel` › `root` › `mxCell` com `mxGeometry`; estilos `chave=valor;`; página compactada = deflate cru + base64 + codificação de URL). Implementado do zero a partir da descrição pública do formato e de arquivos de exemplo escritos à mão para os testes; **nenhum código-fonte do programa foi lido**, sem área de transferência de outros editores, sem rede nem API de terceiros. Leitor de XML próprio (DOCTYPE/ENTITY recusados), limites de tamanho/descompressão/quantidade. Fica **fora do núcleo**: extensão embutida e **desligada por padrão** (decisão do usuário em `CLEAN_ROOM.md` §8) | `src/extensions/builtin/formatos-drawio/` |
| Protocolo RPC das extensões programáveis (Chat 06.5 · B) | interno | mensagens próprias versionadas (`v: 1`) por `postMessage` (HTML Living Standard), validadas por allowlist de métodos, tamanho (2 MB) e taxa (60/s) | `src/extensions/host/protocol.ts` |
| Convite (`#/invite/<token>`) e link público (`#/board/:id?share=<token>`) | interno | tokens aleatórios próprios (`crypto.getRandomValues`). **Modo local:** senha do link guardada só como SHA-256 (`utils/hash.ts`) — não é segurança real. **Modo servidor (Chat 07):** senha em argon2id no servidor, limite de tentativas por IP e por link (espera crescente); validade, revogação e novo token derrubam as sessões de visitante na hora; convites guardados em hash (busca) + cifrados (para o admin copiar o link de novo) | `src/utils/workspace.ts`, `components/board/PublicLinkGate.tsx`, `server/src/public/routes.ts`, `server/src/invitations/routes.ts` |
| API do servidor `/api/v1` (Chat 07) | interno | JSON próprio; erros como código + chave do catálogo (`StoredMessage`), nunca frase pronta; contrato em `src/utils/apiContract.ts` | `server/src/**` |
| Banco do servidor (Chat 07) | interno | migrações SQL próprias geradas pelo drizzle-kit a partir de `server/src/db/schema.ts` | `server/drizzle/` |

Formatos proprietários de terceiros **não fazem parte do núcleo** (ver `CLEAN_ROOM.md` §6). Todos os importadores/exportadores do núcleo estão registrados em `ImporterRegistry`/`ExporterRegistry` (`src/extensions/core.ts`) — nenhum lê formato proprietário.

**Proteção contra dado codificado na colagem (Chat 05, ajuste):** quando o texto colado tem mais de 2.000 caracteres **e** (mais de 30 % dos caracteres em sequências `%XX`, **ou** cara de marcação XML, **ou** um bloco contínuo de base64), o LuDraw **não insere** automaticamente: no `Ctrl+V` mostra o aviso "Parece dado codificado de outro programa" com a ação "Inserir mesmo assim" (cola como texto), e no Inspetor deixa "Inserir no board" desabilitado (só "Colar como texto" fica disponível). Ajuda exibida: "Para trazer um diagrama de outro editor, exporte como SVG ou imagem e use Importar arquivo." **Não há leitura, decodificação nem reconhecimento de formato de nenhum programa de terceiros** — é só uma detecção genérica por tamanho e padrão de texto (`detectEncodedData` em `src/utils/clipboard.ts`). SVG colado como texto (`<svg …>`) continua sendo convertido antes da proteção, porque é padrão aberto.

**Especificações consultadas (conhecimento geral, sem navegação na web nesta sessão):** RFC 4180 (CSV), WHATWG Encoding Standard, PKWARE APPNOTE (ZIP), ECMA-376 (OOXML/SpreadsheetML), OASIS ODF 1.2/1.3, W3C SVG 1.1 (inclusive "Implementation Notes" de arcos), WHATWG HTML e Canvas 2D, Clipboard API. Nenhuma implementação de concorrente, bundle, source map ou API de terceiros foi consultada.

### 5.1 Integridade das extensões — limites honestos (Chat 06.5)

- Na instalação, o LuDraw calcula o SHA-256 de cada arquivo e do pacote, copia os arquivos para o IndexedDB e grava os hashes no `ExtensionRecord`. A cada carregamento, recalcula e compara **com o registro gravado** (não com o manifest); divergência → extensão desativada, aviso e entrada no Audit Log.
- **Limite:** o registro e os arquivos ficam **no mesmo IndexedDB** do navegador. O pinning protege contra corrupção e alteração acidental, **não** contra quem consegue alterar os dois.
- O `publisher` é **declarado pelo autor**, sem assinatura (assinatura Ed25519 fica como opcional pós-v1, `EXTENSIONS_SPEC.md` §5.7). Publisher diferente do registrado é bloqueado na atualização, mas isso só detecta troca, não prova autoria.
- **A defesa real** é comparar o hash curto (12 caracteres) exibido na tela de aprovação e na ficha com o publicado pelo autor. Isso está escrito na própria ficha da extensão.
- Sem `crypto.subtle` (página fora de https/localhost) **nada é instalado** — não há fallback fraco.

## 6. Referências visuais recebidas

| Chat | Origem | Uso permitido | Situação |
|---|---|---|---|
| 01 | Prints de produto de terceiros (conta gratuita) | referência de **função** | layout reproduzido no Chat 01; **substituído** na Rodada 0 do Chat 02; auditoria final no Chat 09 |
| 02 | Pedidos do usuário (sem prints de terceiros) | — | visual próprio |
| 03 | Pedidos do usuário + `ai-memory/refs/splash-reference.html` (animação criada pelo próprio usuário) | porte autorizado (autoria do usuário) | visual próprio; nenhum print, código, bundle ou documentação interna de concorrente consultado |
| 04 | Pedidos do usuário (texto) | — | visual próprio; nenhum print, código, bundle ou documentação interna de concorrente consultado |
| 05 | Pedidos do usuário (texto) | — | visual próprio (DS §16, frame 27); nenhum print, código, bundle ou documentação interna de concorrente consultado |
| 05.5 | Pedidos do usuário (texto) + documentação oficial do Fontsource e páginas npm dos pacotes de fontes (R2) | — | paleta de post-its definida do zero por método próprio; nenhum print, código, bundle ou paleta de concorrente consultado |
| 05.6 · A | Pedidos do usuário (texto) + `ai-memory/I18N_SPEC.md` + API nativa `Intl` (padrão ECMA-402) | — | motor de i18n próprio (sem dependência); textos em inglês escritos do zero a partir do pt-BR do próprio projeto; nenhuma microcopy, glossário ou catálogo de tradução de terceiros consultado |
| 06 · A e B | Pedidos do usuário (texto) + `ai-memory/WORKSPACE_ADMIN_SPEC.md` e a emenda v1.1 escrita pelo usuário + prints do **próprio LuDraw** enviados nos testes (layout cortado, "+ +" no botão de time, botão de validade sem estado selecionado) + APIs nativas do navegador (IndexedDB, `BroadcastChannel`, Web Crypto, `navigator.storage`) | — | hierarquia, Compartilhar, `#/admin`, convites, auditoria, lixeira, transferência, histórico de versões, busca, backup, tela de acesso suspenso e cadastro por convite desenhados e escritos do zero (DS §18–§19, frame 28); nenhum print, layout, texto, bundle ou API de concorrente consultado |
| 05.6 · B | Pedidos do usuário (texto) + `ai-memory/I18N_SPEC.md` §4–§6, §9, §11 + `Intl` (`RelativeTimeFormat`, `NumberFormat`, `ListFormat`, `Collator`, `PluralRules` — ECMA-402; categorias de plural do CLDR embutido no Node/navegador) | — | conteúdo embutido em inglês (boas-vindas, demonstração, galeria de templates, colunas e tags padrão, widgets, guia de sintaxe, avisos de importação/exportação), `README.en.md`, `docs/TRANSLATING.md` (glossário próprio, montado a partir dos termos do próprio app), modelo de PR de tradução e `i18n.en` do catálogo de funções escritos do zero; `scripts/audit-i18n.mjs` em Node puro, sem dependência. Cabeçalhos do CSV de issues seguem o padrão público de importação (inalterados). Nenhuma microcopy, memória de tradução, glossário ou catálogo de terceiros consultado |
| 06.5 · A e B | Pedidos do usuário (texto) + `EXTENSIONS_SPEC.md`/`EXTENSIONS_CATALOG.md` + prints do **próprio LuDraw** nos testes (contraste, títulos do Scrum, resultado da importação) + prints, enviados pelo usuário, do diagrama de teste dele aberto no programa de diagramas que ele usa, junto com o arquivo `.drawio` exportado por ele | referência de **função** (resultado esperado da conversão do arquivo do usuário) | plataforma, fichas, aprovação de permissões e extensões oficiais desenhadas e escritas do zero (DS §20–§21, frame 29); dos prints do outro programa só se conferiu posição, agrupamento e rota esperados — nenhum layout, ícone, texto, código, bundle ou tráfego desse programa consultado |

## 7. Exceções e decisões registradas

Toda exceção às regras precisa de decisão escrita do usuário em `ai-memory/CLEAN_ROOM.md` §8 (versionado desde o Chat 08.6, §4.1) e registro aqui. Há **três decisões registradas**; nenhuma abre exceção às regras R1–R12 em geral — cada uma vale só para o caso descrito.

| Data | O quê | Escopo e risco aceito | Decisão |
|---|---|---|---|
| 05/11/2026 | Extensão oficial **E05 "Formatos de diagrama abertos (`.drawio`)"**, embutida no app e desligada por padrão | `.drawio` é formato aberto e documentado (XML). Escrita do zero a partir da descrição pública do formato e de arquivos exportados pelo próprio usuário, sem ler código do programa, sem área de transferência de outros editores, sem marca nem API de terceiros. Fica fora do núcleo (§5). Risco aceito: semelhança funcional apenas | Aprovado pelo usuário em 05/11/2026; revisão jurídica no Chat 09 |
| 12/11/2026 | Dependência **`nodemailer@10.2.1`** (licença **MIT-0**) no servidor, para o envio opcional de e-mail por SMTP | MIT-0 é a MIT sem a cláusula de manter o aviso (mais permissiva), mas **não** está na lista geral de licenças (`CLEAN_ROOM.md` §5): a aprovação vale **só para este pacote** (`packageApprovals` em `scripts/audit-terms.json`). Zero dependências, tipos próprios, versão exata. Outro pacote MIT-0 precisa de nova aprovação | Aprovado pelo usuário em 12/11/2026 ("aprovo só para o nodemailer"); conferido no fechamento do Chat 08.5 (15/11/2026) |
| 25/11/2026 | **Crates do desktop** com licença fora da lista livre: 5 MPL-2.0, 18 Unicode-3.0, `unicode-ident` e `target-lexicon` | Só as versões do §3.8 e só para o programa desktop; as licenças não entram na lista geral. MPL-2.0 sem modificação do código. Crates que só aparecem no lock (macOS/Android) ficaram de fora (`wry` 0.57.1) | Aprovado pelo usuário em 25/11/2026, crate por crate |

## 8. Histórico de auditorias

| Data | Tipo | Resultado | Relatório |
|---|---|---|---|
| 03/11/2026 | Auditoria retroativa (Chat 03 · pré-tarefa 3) | ✅ 0 bloqueantes após correções (6 comentários de código citavam um concorrente — reescritos); avisos pendentes de decisão (§9) | `docs/AUDIT_REPORT.md` |
| 03/11/2026 | Fechamento do Chat 03 (`npm run audit:legal`) | ✅ 0 bloqueantes · 3 avisos (os mesmos itens 1, 2 e 4 do §9) | `docs/AUDIT_REPORT.md` |
| 04/11/2026 | Fechamento do Chat 04 com ajustes (`npm run audit:legal`) | ✅ 0 bloqueantes · 3 avisos (os mesmos itens 1, 2 e 4 do §9); item 7 do §9 aberto por revisão manual | `docs/AUDIT_REPORT.md` |
| 05/11/2026 | Chat 05 (`npm run audit:legal`) | ✅ 0 bloqueantes · 9 avisos: os 3 de sempre (§9 itens 1, 2 e 4) + 6 menções ao nome de formato `.excalidraw` em textos de interface/comentários (§9 item 9). Os arquivos que IMPLEMENTAM o importador do formato aberto ganharam exceção justificada em `scripts/audit-terms.json` | `docs/AUDIT_REPORT.md` |
| 05/11/2026 | Fechamento do Chat 05 — Protocolo de Handoff (`npm run audit:legal`) | ✅ **0 bloqueantes · 9 avisos**, iguais aos da entrega: `caniuse-lite` e `pako` (§9 itens 1 e 2), `docs/screenshots/` (item 4) e 6 menções descritivas à extensão `.excalidraw` em textos de interface (CanvasStage ×2, ExportImportModal, TopBar, boardMenu, canvasMenu — item 9, decidido pelo usuário). Nada reescrito por causa de aviso | `docs/AUDIT_REPORT.md` |
| 06/11/2026 | Fechamento do Chat 05.5 — Protocolo de Handoff (`npm run audit:legal`) | ✅ **0 bloqueantes · 7 avisos**: 6 menções descritivas à extensão `.excalidraw` em textos de interface (§9 item 9, decidido) + `docs/screenshots/` (§9 item 4, ação do usuário). `pako` (Zlib) e `caniuse-lite` (CC BY 4.0, aprovado) deixaram de gerar aviso; nova regra bloqueante `fonte-externa` sem ocorrências. Executada na sessão do chat a partir do `package-lock.json` recebido (sem `node_modules`); o usuário instalou as fontes e rodou o app com `node_modules` sem problemas — a lista de licenças instaladas das 18 fontes aparece no `AUDIT_REPORT.md` quando o usuário rodar `npm ci && npm run audit:legal` | `docs/AUDIT_REPORT.md` |
| 06/11/2026 | Chat 05.6 · Rodada A (`npm run audit:legal`) | ✅ **0 bloqueantes · 20 avisos**: as mesmas menções descritivas a `.excalidraw` (§9 item 9, decidido), agora nos catálogos `src/locales/pt-BR` e `src/locales/en` (cada texto conta duas vezes) + 1 em `CanvasStage.tsx` + `docs/screenshots/` (§9 item 4). Nenhum termo novo | `docs/AUDIT_REPORT.md` |
| 06/11/2026 | Chat 05.6 · Rodada B (`npm run audit:legal` + `npm run audit:i18n`) | ✅ **0 bloqueantes · 20 avisos**, os mesmos da Rodada A (menções descritivas a `.excalidraw` nos dois catálogos + `CanvasStage.tsx`, §9 item 9, decidido; `docs/screenshots/`, §9 item 4). `docs/banner.en.svg` registrado no §4. `audit:i18n`: 2299 mensagens, pt-BR e en 100 %, 0 texto fixo, 0 erro, 1 aviso informativo (100 mensagens do `en` idênticas ao pt-BR: siglas, formatos e termos do glossário) | `docs/AUDIT_REPORT.md`, `docs/LANGUAGES.md` |
| 07/11/2026 | Fechamento do Chat 05.6 — Protocolo de Handoff (`npm run audit:legal` + `audit:i18n` + `audit:features`) | ✅ **0 bloqueantes · 20 avisos**, iguais aos das Rodadas A e B: menções descritivas à extensão `.excalidraw` (agora contadas em `src/locales/pt-BR` e `src/locales/en`, + `CanvasStage.tsx`; §9 item 9, decidido) e `docs/screenshots/` (§9 item 4, ação do usuário). Nenhum termo, domínio ou asset sem registro. `audit:i18n`: 2.299 mensagens, pt-BR e en 100 %, 0 texto fixo, 0 erro, 1 aviso informativo. `audit:features`: 98 funções, 0 erros, 0 avisos | `docs/AUDIT_REPORT.md`, `docs/LANGUAGES.md`, `docs/FEATURES.md` |
| 07/11/2026 | Chat 06 · Rodada A — Etapas 1 e 2 (`npm run audit:legal` + `audit:i18n` + `audit:features`) | ✅ **0 bloqueantes · 20 avisos**, os mesmos do fechamento do Chat 05.6 (menções descritivas a `.excalidraw` nos dois catálogos + `CanvasStage.tsx`, §9 item 9; `docs/screenshots/`, §9 item 4). Nenhuma dependência, asset ou domínio novo. `audit:i18n`: 0 texto fixo, 0 erro (namespaces novos `workspace`, `admin`, `share`; 46 chaves da antiga aba "Usuários" removidas). `audit:features`: 103 funções, 0 erros | `docs/AUDIT_REPORT.md`, `docs/LANGUAGES.md`, `docs/FEATURES.md` |
| 07/11/2026 | Chat 06 · Rodada B (`npm run audit:legal` + `audit:i18n` + `audit:features`) | ✅ **0 bloqueantes · 20 avisos**, os mesmos de antes (menções descritivas a `.excalidraw` e `docs/screenshots/`). Nenhuma dependência, asset ou domínio novo. `audit:i18n`: 0 texto fixo, 0 erro (namespace novo `history`). `audit:features`: 107 funções, 0 erros | `docs/AUDIT_REPORT.md`, `docs/LANGUAGES.md`, `docs/FEATURES.md` |
| 07/11/2026 | Fechamento do Chat 06 — Protocolo de Handoff (`npm run audit:legal` + `audit:i18n` + `audit:features` + `test:permissions`) | ✅ **0 bloqueantes · 20 avisos**, iguais aos das Rodadas A e B: 19 menções descritivas à extensão `.excalidraw` (`CanvasStage.tsx` e catálogos `board`, `importexport` e `menus` em pt-BR e en; §9 item 9, decidido) e `docs/screenshots/` (§9 item 4, ação do usuário). Nenhuma dependência, asset, domínio ou termo novo. `audit:i18n`: 2.875 mensagens, pt-BR e en 100 %, 0 texto fixo, 0 erro, 1 aviso informativo (113 iguais ao pt-BR). `audit:features`: 107 funções, 0 erros, 0 avisos. `test:permissions`: 554 regras ok | `docs/AUDIT_REPORT.md`, `docs/LANGUAGES.md`, `docs/FEATURES.md` |
| 07/11/2026 | Chat 06.5 · Rodada A — Etapas 1 e 2 (`audit:legal` + `audit:i18n` + `audit:features` + `test:extensions`) | ✅ **0 bloqueantes · 20 avisos**, os mesmos do Chat 06. Nenhuma dependência, asset sem registro ou domínio novo; namespace novo `extensions` | `docs/AUDIT_REPORT.md`, `docs/LANGUAGES.md`, `docs/FEATURES.md` |
| 08/11/2026 | Chat 06.5 · Rodada B (`audit:legal` + `audit:i18n` + `audit:features` + `test:extensions` + `test:extensions:browser`) | ✅ **0 bloqueantes · 20 avisos**, os mesmos de antes; exceção justificada nova em `scripts/audit-terms.json` para `src/extensions/schema.ts` (lista das extensões de arquivo importadas pelo núcleo, inclusive `.excalidraw`) | `docs/AUDIT_REPORT.md` |
| 08/11/2026 | Fechamento do Chat 06.5 — Protocolo de Handoff (`audit:legal` + `audit:i18n` + `audit:features` + `test:permissions` + `test:extensions`) | ✅ **0 bloqueantes · 20 avisos**, iguais aos das rodadas (menções descritivas à extensão `.excalidraw` — §9 item 9, decidido — e `docs/screenshots/` — §9 item 4, ação do usuário). Nenhuma dependência, asset, domínio ou termo novo. `audit:i18n`: 3.156 mensagens, pt-BR e en 100 %, 0 texto fixo, 0 erro, 1 aviso informativo (116 iguais ao pt-BR). `audit:features`: 116 funções, 0 erros, 0 avisos. `test:permissions`: 598 ok · `test:extensions`: 357 ok · `test:extensions:browser`: 54 ok | `docs/AUDIT_REPORT.md`, `docs/LANGUAGES.md`, `docs/FEATURES.md` |
| 08/11/2026 | Chat 07 · Rodada A — servidor (`audit:legal` + `audit:i18n` + `audit:features` + `test:permissions` + `test:extensions` + `test:server` em PGlite e Postgres) | ✅ **0 bloqueantes · 20 avisos**, os mesmos de antes. O `audit:legal` passou a auditar também `server/package-lock.json` e a varrer `server/src`, `server/.env.example`, `server/package.json`, `server/drizzle.config.ts` e `server/docker-compose.dev.yml`: **387 de 387 dependências com licença permitida** (176 do servidor); domínio novo esperado `*.example.com` (reservado para exemplos, RFC 2606). `audit:i18n`: 3.223 mensagens, 0 texto fixo, 0 erro (namespace novo `server`; exceção documentada para `src/utils/storedDefaults.ts`). `audit:features`: 116 funções, 0 erros. `test:server`: 58 testes (57 + 1 só no Postgres) | `docs/AUDIT_REPORT.md`, `docs/LANGUAGES.md` |
| 08/11/2026 | Fechamento do Chat 07 — Protocolo de Handoff (`audit:legal` + `audit:i18n` + `audit:features` + `test:permissions` + `test:extensions` + `test:extensions:browser` + `test:server` em PGlite e Postgres + `test:server:browser`) | ✅ **0 bloqueantes · 20 avisos**, os mesmos de sempre; **387 de 387 dependências permitidas**; nenhum asset, domínio ou termo novo fora dos já esperados (`*.example.com` só em exemplos). `audit:i18n`: 3.316 mensagens, pt-BR e en 100 %, 0 texto fixo, 0 erro (2 chaves antigas do aviso "em desenvolvimento" do servidor removidas). `audit:features`: 121 funções, 0 erros, 0 avisos. Testes: permissões 598 · extensões 357 + 54 no navegador · servidor 59 · Modo Servidor no navegador 23 | `docs/AUDIT_REPORT.md`, `docs/LANGUAGES.md`, `docs/FEATURES.md` |
| 09/11/2026 | Chat 08 — edição ao vivo (A-1 sincronização · manutenções · A-2 veto · B presença/condução/documentação) (`audit:legal` + `audit:i18n` + `audit:features` + `test:permissions` + `test:extensions` + `test:server` + `test:server:browser` + `test:collab:browser`) | ✅ **0 bloqueantes · 20 avisos**, os mesmos de sempre; **409 de 409 dependências permitidas** (novas: yjs, y-indexeddb, y-protocols, @hocuspocus/provider e server, ws, @types/ws e transitivas — todas MIT, tslib 0BSD; §3.4). Nenhum asset, domínio ou termo novo. Testes: permissões 598 · extensões 357 · servidor 98 (97 + 1 só no Postgres) · Modo Servidor no navegador 31 · edição ao vivo no navegador 84 | `docs/AUDIT_REPORT.md`, `docs/LANGUAGES.md`, `docs/FEATURES.md` |
| 15/11/2026 | Fechamento do Chat 08.5 — E-mail e Acesso (A · B · B2 · C · D · E) — Protocolo de Handoff (`audit:legal` + `audit:i18n` + `audit:features` + `test:permissions` + `test:extensions` + `test:server` + `test:server:pg` + `test:server:browser` + `test:collab:browser` + `test:extensions:browser`) | ✅ **0 bloqueantes · 17 avisos (todos o nome de formato `.excalidraw`, permitido como importação) · 430/430 dependências com licença permitida**. Dependência nova: `nodemailer@10.2.1` (MIT-0, aprovação só para ele — `CLEAN_ROOM.md` §8, `packageApprovals`). Assets novos: 7 ilustrações próprias das faixas dos e-mails (§4). Nada de terceiros | `docs/AUDIT_REPORT.md` |
| — | Revisão jurídica (Chat 09) | ⏳ pendente | — |

## 9. Pendências de decisão do usuário (auditorias dos Chats 03 a 08.6 — revisado na auditoria do Chat 08.6, 15/11/2026)

Nada abaixo foi alterado sem aprovação (regra do usuário: avisos não justificam reescrever funcionalidade).

| # | Item | Situação | Opções |
|---|---|---|---|
| 1 | `caniuse-lite` (CC-BY-4.0, só build) | ✅ **aprovado pelo usuário (05/11/2026) · feito no Chat 05.5** | atribuição registrada no §3.2 e aprovação gravada em `scripts/audit-terms.json` (o `audit:legal` não avisa mais) |
| 2 | `pako` (MIT AND Zlib, vem do `pdf-lib`) | ✅ **aprovado pelo usuário (05/11/2026) · feito no Chat 05.5** | Zlib na lista permitida do `CLEAN_ROOM.md` §5 e de `scripts/audit-terms.json` (o `audit:legal` aceita) |
| 3 | Paleta de post-its `STICKY_COLORS` (Chat 01) | ✅ **aprovado pelo usuário (05/11/2026) · feito no Chat 05.5** | 16 cores definidas do zero por método próprio (matizes a cada 22,5° em OKLCH, claridade pastel), nomes em pt-BR; detalhes no `DESIGN_SYSTEM.md` §2.1; boards salvos mantêm as cores gravadas |
| 4 | `docs/screenshots/*` (layout do Chat 01) | ✅ **decidido pelo usuário (05/11/2026): apagar** | `git rm -r docs/screenshots`; as novas capturas vêm na atualização do README, guiadas por `docs/features.json` |
| 5 | Semelhanças de nomes/textos (lista em `scripts/audit-terms.json` → `manualReview`, também no `docs/AUDIT_REPORT.md` → "Revisão manual"; revisada no Chat 08.6) | ⚠️ **aberto** — decisão do usuário adiada (15/11/2026: não renomear por ora). Em aberto: (a) **"Modo Privado" / "Private Mode"** (~20 textos); (b) frase do Activity Log "{actor} trouxe todos até a própria tela" / "brought everyone to their view" (o nome do recurso já é próprio: "Conduzir a tela"); (c) ordem dos itens do menu de contexto — revisão de look and feel no Chat 09; (d) atalhos de 1 tecla e termos genéricos ("Frames", "Kanban"…) — sugestão: manter, sem decisão registrada. Resolvidos: paleta de post-its (Chat 05.5), Business Model Canvas (Chat 04), ícones (revistos no 08.6) | renomear os itens marcados · ou manter (termos genéricos) |
| 6 | `dsa.html` na raiz | ✅ **resolvido (05/11/2026)**: arquivo removido pelo usuário (era um teste da splash) | — |
| 7 | Texto de menu "Exportar para CSV (Excel)" (`menus/elementMenu.tsx`, Chat 02) | ✅ **decidido pelo usuário (05/11/2026) · feito no Chat 05.5** | o item agora se chama **"Exportar para CSV (planilha)"** (única ocorrência no código); vira chave de tradução no Chat 05.6 |
| 8 | Rótulo do CSV de issues (Chat 05): o prompt pedia "Exportar para Jira / GitHub Issues (CSV Estruturado)", mas `CLEAN_ROOM.md` R8 só permite menção a marcas de terceiros na **documentação** | ✅ **decidido pelo usuário (05/11/2026): uso descritivo.** Na interface o modo se chama "CSV de issues (rastreadores)"; os nomes dos serviços aparecem só na documentação. Sem exceção no `CLEAN_ROOM.md` §8 | — |
| 9 | Nome de formato `.excalidraw` em 6 textos de interface (menus, Importar, overlay de soltar) — aviso do `audit:legal` | ✅ **decidido pelo usuário (05/11/2026): manter como menção descritiva (R8)** — nome de formato aberto, sempre escrito como extensão (`.excalidraw`), nunca o nome por extenso nem logo/marca visual. Os arquivos que implementam o importador têm exceção justificada em `scripts/audit-terms.json`; nenhuma exceção aberta no `CLEAN_ROOM.md` §8 | — |

## 10. Declaração de Sala Limpa — Chat 03 (inteiro)

**DECLARAÇÃO DE SALA LIMPA — Chat 03** (pré-tarefas 1–3, Rodada A, Rodada B e ajustes do texto da linha)
- **Dependências novas:** nenhuma. `package.json` ganhou apenas o script `audit:legal` (`scripts/audit-clean-room.mjs`, Node puro, sem pacotes).
- **Assets novos:** nenhum arquivo de imagem, fonte ou som. Logo/animação da splash portados da referência criada pelo usuário (`ai-memory/refs/splash-reference.html`); demais visuais em SVG/CSS escritos à mão; ícones de `lucide-react` (ISC, já declarado); fontes já listadas no §4.
- **Formatos novos:** export de um frame em PNG 2x/4x e PDF (padrões abertos; PDF via `pdf-lib`, MIT). Formato próprio `.ludraw` só com campos opcionais novos (retrocompatível).
- **Referências:** nenhuma referência visual de terceiros. Nenhum código, bundle, source map, API, SDK, texto de interface, ícone ou marca de terceiros consultado ou usado.
- **Auditoria:** `npm run audit:legal` no fechamento → 0 bloqueantes, 3 avisos pendentes de decisão do usuário (§9). Nada foi reescrito por causa de aviso sem aprovação.
- **Confirmação:** todo o código do Chat 03 foi escrito do zero a partir dos requisitos funcionais do usuário. Isto não é parecer jurídico.


## 11. Declaração de Sala Limpa — Chat 04 (inteiro: entrega principal + ajustes pedidos pelo usuário)

**DECLARAÇÃO DE SALA LIMPA — Chat 04** (Kanban, Tabelas, Diagrama por texto, Cronômetro com música, Votação por pontos, Enquete, Comentários, Galeria de Templates, Salvar como template; ajustes: tabela com menu de botão direito/mesclar/bordas/fontes/estilos, cronômetro arrastável com ⚙, cronômetro e votação no menu ⋯, guia da sintaxe)
- **Dependências novas:** nenhuma. `package.json` e `package-lock.json` não mudaram (lista completa no §3).
- **Assets novos:** nenhum arquivo de imagem, fonte ou som.
  - Música e alarme do cronômetro: **síntese procedural** (Web Audio API, código próprio em `utils/ambientAudio.ts`).
  - Miniaturas de template, frame 26 do Design System, ícones de borda (`BorderIcon`) e desenhos do guia do diagrama: SVG/JSX escritos à mão.
  - Cores de conteúdo (Kanban, Tabela e seus 6 estilos prontos, bordas, diagrama, pódio): definidas do zero a partir das cores do projeto.
  - Ícones de interface: `lucide-react` 0.460.0 (ISC, já declarado).
- **Formatos importados/exportados novos:** nenhum formato de arquivo.
  - Diagrama por texto: entrada digitada no modal, lida por **parser próprio** de um subconjunto de sintaxe de fluxograma publicamente documentada.
  - "Copiar células" da tabela: texto separado por tabulação (TSV, genérico) na área de transferência.
  - Templates pessoais: formato próprio (`TemplateEntity` no `localStorage`).
  - `.ludraw`: só campos opcionais novos (Kanban `wipLimit`/`columnWidth`; `TableCell` com estilo/mesclagem/bordas; `TableElement.headerRow/headerCol/banded/tableStyle`; `CommentMessage`; `TimerState`; `VotingState` com `ballots`, `kind` e `poll`) — boards antigos abrem iguais.
- **Conteúdo de terceiros:** nenhum.
  - Modelo de Negócio em 9 blocos: **versão genérica própria** (decisão escrita do usuário), sem nome, layout, arte ou textos do canvas original (CC BY-SA).
  - SWOT e Começar/Parar/Continuar: técnicas genéricas.
  - Menu da tabela: convenção genérica de planilhas (inserir/excluir/mesclar/bordas), sem textos, ícones ou layout de nenhum produto.
- **Referências:** só pedidos do usuário em texto e prints do próprio LuDraw. Nenhum código, bundle, source map, API, SDK, texto de interface, ícone ou marca de terceiros consultado ou usado.
- **Interface:** nenhuma marca de terceiros nos textos novos (a Dock diz "Diagrama por texto"). Um item **anterior ao Chat 04** ainda cita uma marca — "Exportar para CSV (Excel)" em `menus/elementMenu.tsx` — e ficou como pendência de decisão (§9 item 7).
- **Auditoria:** `npm run audit:legal` no fechamento (04/11/2026) → **0 bloqueantes · 3 avisos** (§9 itens 1, 2 e 4, os mesmos do Chat 03). Nada foi reescrito por causa de aviso.
- **Validação:** typecheck strict (harness local — registro npm bloqueado na sessão), 85 testes de navegador sem erros de console, testes unitários do parser de diagrama e da tabela; o usuário testou no VS Code e confirmou que está tudo funcionando.
- **Confirmação:** todo o código do Chat 04 foi escrito do zero a partir dos requisitos funcionais do usuário. Isto não é parecer jurídico.

## 12. Declaração de Sala Limpa — Chat 05 (inteiro: entrega principal + ajustes pedidos pelo usuário)

**DECLARAÇÃO DE SALA LIMPA — Chat 05** (registries internos; importação universal em formatos abertos: colagem genérica, SVG editável, `.excalidraw`, planilhas `.csv/.tsv/.xlsx/.ods` e tabela HTML, modal Importar planilha, Inspetor de colagem; exportação em larga escala: SVG vetorial, PDF multipáginas por frames, CSV de issues, tabelas → planilhas, proteção contra fórmulas; ajustes: exportação negada por padrão a leitores, `.excalidraw` como menção descritiva, proteção genérica contra dado codificado na colagem)
- **Dependências novas:** nenhuma. `package.json` só ganhou o script `test:permissions` (Node puro); `package-lock.json` sem mudanças (lista completa no §3, versões inalteradas). A descompactação de `.xlsx`/`.ods` usa o leitor de ZIP próprio (`utils/zip.ts`, escrito a partir da especificação pública do formato ZIP) + `DecompressionStream('deflate-raw')` nativo do navegador, em vez de `fflate` (que o prompt permitia).
- **Assets novos:** nenhum arquivo de imagem, fonte ou som.
  - Frame 27 do Design System (`Chat05Demo.tsx`) e o SVG de demonstração (retângulo, estrela, círculo): escritos à mão.
  - Ícones: `lucide-react` 0.460.0 (ISC, já declarado), só com nomes já usados no projeto.
  - Cores de prévia/cabeçalho de planilha: as mesmas da tabela nativa do Chat 04.
- **Formatos importados/exportados novos:**
  - Import: SVG (vetorial editável), `.excalidraw` (arquivo e colagem), CSV, TSV, `.xlsx` (OOXML, ECMA-376), `.ods` (ODF, ISO/IEC 26300), tabela HTML colada (só `<table>` padrão), HTML genérico colado, texto `.txt`/`.md`, `.ludraw` no board aberto.
  - Export: SVG vetorial (board, seleção, frame), PDF multipáginas por frames, CSV de issues (nomes de campo da documentação pública de importação por CSV, sem API), CSV de tabelas, cópia TSV + HTML de tabelas, CSV de objetos (agora protegido).
  - Formato próprio `.ludraw`: só campos opcionais novos (`ShapeElement.customPath`/`customPathBox`, ação `imported` no Activity Log) — boards antigos abrem iguais.
  - Todo CSV/TSV/HTML para planilhas sai com proteção contra injeção de fórmulas.
- **Conteúdo de terceiros usado:** nenhum.
  - Nenhum payload interno de clipboard de outros produtos é lido ou decodificado; tipos não padrão aparecem só pelo nome no Inspetor.
  - `data-*` e marcadores proprietários do HTML copiado de planilhas online nunca são lidos.
  - Colagem vinda de outros editores de diagrama/quadro (formato próprio deles) **não é suportada no núcleo, por desenho** (`CLEAN_ROOM.md` §6): o LuDraw mostra "Conteúdo não suportado" ou o aviso genérico "Parece dado codificado de outro programa", detectado **só por tamanho e padrão de texto**, sem decodificar e sem citar produto. Caminho oferecido: exportar como SVG ou imagem e usar Importar arquivo. Uma extensão pessoal opt-in só existiria com exceção escrita do usuário no `CLEAN_ROOM.md` §8 (nenhuma aberta).
  - Nenhuma API, SDK ou chave de terceiros.
  - Nenhuma marca/logo de terceiros na interface: o CSV de issues usa rótulo genérico (§9 item 8) e `.excalidraw` aparece só como extensão de arquivo (§9 item 9).
- **Referências:** só pedidos do usuário em texto, os testes dele e especificações públicas de padrões abertos (§5). Nenhum código, bundle, source map, DevTools, tráfego de rede, texto de interface, ícone ou layout de concorrente consultado; nenhuma implementação de concorrente pesquisada.
- **Exceções:** nenhuma aberta (`CLEAN_ROOM.md` §8 e §7 deste arquivo continuam vazios). Exceções de **ferramenta** em `scripts/audit-terms.json` (não são exceções de sala limpa): arquivos que implementam o importador do formato aberto `.excalidraw`.
- **Validação:** registro npm bloqueado na sessão → typecheck strict com shims locais (TypeScript 6.0.3) limpo, bundle com esbuild, **136 verificações de navegador sem erros de console** (67 de leitores/conversores com `.xlsx`/`.ods` reais gerados por openpyxl e LibreOffice, 24 de importação ponta a ponta, 11 de regressão, 15 de exportação, 19 da proteção contra dado codificado + SVG/imagem + exportação negada ao leitor) e **279 regras de permissão**. O usuário rodou o módulo no VS Code e confirmou: "está tudo funcionando perfeitamente".
- **Auditoria de fechamento:** `npm run audit:legal` (05/11/2026, Protocolo de Handoff) → **0 bloqueantes · 9 avisos** (§8; pendências e decisões no §9).
- **docs/PROVENANCE.md atualizado:** sim.
- **Confirmação:** todo o código do Chat 05 foi escrito do zero a partir dos requisitos funcionais do usuário e de especificações abertas. Isto não é parecer jurídico.

## 13. Declaração de Sala Limpa — Chat 05.5 (inteiro: manutenção, sem função nova de produto)

**DECLARAÇÃO DE SALA LIMPA — Chat 05.5** (paleta de post-its redefinida do zero; fontes autohospedadas; catálogo de funções; repositório profissional; proveniência e rótulo "Exportar para CSV (planilha)")
- **Dependências novas:** 18 pacotes de fontes, aprovados e instalados pelo usuário (06/11/2026), sem dependências transitivas (§3.1):
  - `@fontsource-variable/caveat@5.3.0`, `@fontsource-variable/eb-garamond@5.3.0`, `@fontsource-variable/figtree@5.3.0`, `@fontsource-variable/fraunces@5.3.0`, `@fontsource-variable/fredoka@5.3.0`, `@fontsource-variable/ibm-plex-sans@5.3.0`, `@fontsource-variable/noto-sans@5.3.0`, `@fontsource-variable/open-sans@5.3.0` — **OFL-1.1**
  - `@fontsource-variable/roboto-slab@5.3.0` — **Apache-2.0**
  - `@fontsource/abril-fatface@5.3.0`, `@fontsource/bangers@5.3.0`, `@fontsource/graduate@5.3.0`, `@fontsource/gravitas-one@5.3.0`, `@fontsource/ibm-plex-mono@5.3.0`, `@fontsource/ibm-plex-serif@5.3.0`, `@fontsource/nixie-one@5.3.0`, `@fontsource/pt-sans@5.3.0` — **OFL-1.1**
  - `@fontsource/permanent-marker@5.3.0` — **Apache-2.0**
  - Nenhuma dependência de código. Scripts novos (`audit:features`, `docs:features`) são Node puro.
- **Assets novos:**
  - Arquivos `.woff2` dos pacotes acima (só subconjuntos `latin`/`latin-ext`), lidos de `node_modules` pelo Vite — nenhum arquivo de fonte copiado para o repositório; `src/styles/fonts.css` escrito à mão.
  - Paleta de post-its `STICKY_PALETTE` (16 cores e nomes pt-BR): definida do zero por método próprio (matizes a cada 22,5° em OKLCH, claridade pastel alternada, contraste calculado) — do projeto, MIT (§4).
  - Arquivos de repositório (`CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, modelos de issue/PR, CI, `.editorconfig`): texto próprio; o `CHANGELOG.md` segue o formato público Keep a Changelog e o SemVer (convenções abertas, sem texto copiado).
- **Formatos importados/exportados novos:** nenhum. Export PNG/PDF/SVG agora aguarda as fontes carregarem (mesmos formatos). Formato `.ludraw` sem campos novos.
- **Conteúdo de terceiros usado:** nenhum.
  - Consultas na web restritas à documentação oficial do Fontsource e às páginas npm/README dos pacotes de fontes (eixos, pesos, subconjuntos, licença, nomes dos arquivos) — fontes permitidas pelo `CLEAN_ROOM.md` R2.
  - Nenhuma paleta, print, código, bundle, source map, texto de interface, ícone ou layout de concorrente consultado.
  - Fontes deixaram de ser carregadas de serviço de terceiros em tempo de execução (nenhuma requisição externa).
- **Licenças e aprovações:** Zlib aceita pelo `audit:legal` (decisão de 05/11/2026; `pako`); `caniuse-lite` (CC BY 4.0, só build) aprovado, com atribuição no §3.2.
- **Interface:** único texto alterado — "Exportar para CSV (Excel)" → "Exportar para CSV (planilha)" (remove a última marca de terceiros da UI; §9 item 7). Nomes das cores dos post-its são palavras comuns do português.
- **Exceções:** nenhuma aberta (`CLEAN_ROOM.md` §8 e §7 deste arquivo inalterados).
- **Validação:** registro npm bloqueado na sessão → typecheck strict com shims locais limpo, bundle de verificação com esbuild (62 `@font-face`, zero referências a servidores de fontes), teste unitário da paleta (16 cores únicas, contraste mínimo 10,11:1, legado escuro preservado), `npm run test:permissions` 279/279, `npm run audit:features` 96 funções / 0 erros / 0 avisos. O usuário rodou o projeto no VS Code (inclusive offline) e confirmou: "está tudo funcionando perfeitamente".
- **Auditoria de fechamento:** `npm run audit:legal` (06/11/2026, Protocolo de Handoff) → **0 bloqueantes · 7 avisos** (§8; pendências no §9: item 5 aguarda decisão; item 4 é ação do usuário).
- **docs/PROVENANCE.md atualizado:** sim (§3, §3.1, §3.2, §4, §6, §8, §9 e §13).
- **Confirmação:** todo o código e texto do Chat 05.5 foi escrito do zero a partir dos pedidos do usuário, de conhecimento geral e da documentação oficial de bibliotecas permitidas. Isto não é parecer jurídico.

## 14. Declaração de Sala Limpa — Chat 05.6 (inteiro: Rodada A — motor e núcleo · Rodada B — conteúdo, dados, verificação e documentação)

**DECLARAÇÃO DE SALA LIMPA — Chat 05.6** (internacionalização pt-BR + inglês + base para qualquer idioma)
- **Dependências novas:** nenhuma. Motor de i18n próprio (`src/i18n/`) sobre a API nativa `Intl`; `scripts/audit-i18n.mjs` em Node puro; nenhuma biblioteca de internacionalização instalada, copiada ou consultada (§3).
- **Assets novos:**
  - `docs/banner.en.svg` — cópia do `docs/banner.svg` do projeto com os 4 textos reescritos em inglês (do projeto, MIT; §4).
  - Catálogos `src/locales/pt-BR/*.json` (textos que já existiam no código, movidos sem mudança) e `src/locales/en/*.json` (2.299 mensagens em inglês **escritas do zero** a partir do pt-BR do próprio projeto) — do projeto, MIT.
  - Documentação própria: `README.en.md`, `docs/TRANSLATING.md` (glossário montado a partir dos termos do próprio app), `docs/LANGUAGES.md` (gerado), `.github/PULL_REQUEST_TEMPLATE/translation.md`, traduções `i18n.en` em `docs/features.json`, seções novas no `CONTRIBUTING.md`, `CHANGELOG.md` e `DESIGN_SYSTEM.md` §17.
- **Formatos importados/exportados novos:** nenhum formato de terceiros. Formato próprio de catálogo de tradução (JSON, `docs/TRANSLATING.md`) e só campos opcionais no `.ludraw` (`BoardActivityEntry.message`; `summary` opcional) — §5. Cabeçalhos do CSV de issues inalterados.
- **Conteúdo de terceiros usado:** nenhum.
  - Nenhuma microcopy, memória de tradução, glossário, catálogo de mensagens, print, código, bundle ou source map de outro produto consultado; o inglês não reproduz textos de interface de concorrentes.
  - Referências técnicas apenas de padrões abertos e conhecimento geral: ECMA-402 (`Intl`), categorias de plural do CLDR (embutidas no Node/navegador, consultadas só por `Intl.PluralRules`), BCP 47 para códigos de idioma.
  - Menções a rastreadores (Jira, GitHub) seguem só na documentação, como uso descritivo (§9 item 8); `.excalidraw` como extensão (§9 item 9).
- **Valores mantidos de propósito:** dados gravados ("Você", "Meu espaço") e a tela `#/design-system` permanecem em pt-BR (exceções documentadas em `scripts/audit-i18n-allow.json`, cada uma com motivo).
- **Exceções:** nenhuma aberta (`CLEAN_ROOM.md` §8 e §7 deste arquivo inalterados).
- **Validação:** registro npm indisponível na sessão → typecheck strict com shims locais limpo; app montado com React real e verificado em navegador (troca pt-BR ⇄ en sem recarregar, plurais 0/1/2/5/21, `qps` em 13 telas sem texto fixo nem estouro, `aria-label` nos dois idiomas, board antigo e entrada de atividade legada); 52 testes do motor e da Rodada B; `npm run test:permissions` 284/284; `npm run audit:i18n` 0 erros; `npm run audit:features` 98 funções / 0 erros. O usuário rodou o projeto no VS Code e confirmou: "está tudo funcionando perfeitamente" (07/11/2026).
- **Auditoria de fechamento:** `npm run audit:legal` (07/11/2026, Protocolo de Handoff) → **0 bloqueantes · 20 avisos** (§8; mesmos itens já decididos do §9).
- **docs/PROVENANCE.md atualizado:** sim (§3, §4, §5, §6, §8, §9 e §14).
- **Confirmação:** todo o código e texto do Chat 05.6 foi escrito do zero a partir dos pedidos do usuário, de `ai-memory/I18N_SPEC.md`, de conhecimento geral e de especificações abertas. Isto não é parecer jurídico.

## 15. Declaração de Sala Limpa — Chat 06 · Rodada A (hierarquia, acesso e governança — Etapas 1 e 2)

**DECLARAÇÃO DE SALA LIMPA — Chat 06 · Rodada A**
- **Dependências novas:** nenhuma. Tudo sobre o que já existia (React, zustand, lucide-react, `Intl`, Web Crypto do navegador).
- **Assets novos:** nenhum (ícones do `lucide-react` já declarado; nenhum arquivo de imagem, som ou fonte). Textos pt-BR e en dos namespaces `workspace`, `admin` e `share` escritos do zero (do projeto, MIT).
- **Formatos importados/exportados novos:** CSV do Audit Log (CSV genérico, §5) e campos novos/opcionais do estado do app (§5). Nenhum formato de terceiros.
- **Conteúdo de terceiros usado:** nenhum. Telas, fluxos e textos (Mesa com trilha de espaços, `#/admin` em "caderno de seções", modal Compartilhar em abas-cartão, assistente de transferência, portão do link público) foram desenhados a partir da `ai-memory/WORKSPACE_ADMIN_SPEC.md`, do `CLAUDE.md` §1.1 e dos pedidos do usuário; nenhum produto concorrente, print, bundle, source map, DevTools ou API de terceiros foi consultado. Os nomes dos usuários simulados ("Bruna Lima", "Caio Souza", "Dora Ramos" / "Brooke Lane", "Carl Stone", "Dana Reed") são inventados e servem só para teste local.
- **Decisões do usuário registradas (07/11/2026):** uma organização por instalação; a política `allowViewerExport` é **teto** do download (um link com `allowDownload: true` não fura a política desligada); a senha do link público no modo local não é segurança real (aviso visível no modal Compartilhar).
- **Exceções:** nenhuma aberta (`CLEAN_ROOM.md` §8 inalterado).
- **Ajustes após o teste do usuário (07/11/2026):** conta nova sem convite (cadastro local ou "Continuar sem conta") só vira administradora se o workspace ainda não tiver administrador ativo; várias abas passam a reler o estado salvo (evento `storage`) para uma aba não desfazer o que outra gravou; escrita do estado protegida contra armazenamento cheio; projetos como pastas na Mesa; correções de layout. Nada de terceiros.
- **docs/PROVENANCE.md atualizado:** sim (§5, §8 e §15).
- **Confirmação:** todo o código e texto do Chat 06 · Rodada A foi escrito do zero. Isto não é parecer jurídico.

## 16. Declaração de Sala Limpa — Chat 06 · Rodada B (persistência, versões, busca, backup + emenda v1.1)

**DECLARAÇÃO DE SALA LIMPA — Chat 06 · Rodada B**
- **Dependências novas:** nenhuma. IndexedDB, `BroadcastChannel`, `navigator.storage.estimate()` e evento `storage` são APIs nativas do navegador (especificações W3C/WHATWG); nenhuma biblioteca de banco, busca ou backup foi instalada, copiada ou consultada.
- **Assets novos:** nenhum. Textos pt-BR/en do namespace `history` e das chaves novas de `workspace`, `admin`, `board` e `permissions` escritos do zero (do projeto, MIT).
- **Formatos importados/exportados novos:** `.ludraw-workspace` (formato próprio, §5) e o armazenamento IndexedDB (interno, §5). Nenhum formato de terceiros.
- **Conteúdo de terceiros usado:** nenhum. Histórico de versões, busca, backup, tela de acesso suspenso e cadastro por convite foram desenhados a partir do `CLAUDE.md` §1.4/§1.6, da `WORKSPACE_ADMIN_SPEC.md` (com a emenda v1.1 do usuário) e dos pedidos do usuário; nenhum produto concorrente, print, bundle, source map, DevTools ou API de terceiros foi consultado.
- **Decisões do usuário registradas (07/11/2026):** aplicar já, no modo local, o cadastro só por convite quando existe administrador e o "Continuar sem conta" em espaço isolado (emenda v1.1 §11, "a critério do usuário").
- **Exceções:** nenhuma aberta (`CLEAN_ROOM.md` §8 inalterado).
- **docs/PROVENANCE.md atualizado:** sim (§5, §8 e §16).
- **Confirmação:** todo o código e texto da Rodada B foi escrito do zero. Isto não é parecer jurídico.

## 17. Declaração de Sala Limpa — Chat 06 (inteiro: Rodada A — Etapas 1 e 2 e correções do teste · Rodada B · emenda v1.1 · ajuste do botão de validade)

**DECLARAÇÃO DE SALA LIMPA — Chat 06**
- **Dependências novas:** nenhuma. `package.json` e `package-lock.json` não mudaram neste chat. Recursos usados são APIs nativas do navegador (especificações abertas W3C/WHATWG): IndexedDB, `BroadcastChannel`, Web Crypto (`crypto.subtle` SHA-256 e `getRandomValues` para tokens), `navigator.storage.estimate()`, evento `storage` e Clipboard API.
- **Assets novos:** nenhum. Ícones de interface vêm do `lucide-react` já aprovado (ISC, §3). Textos pt-BR/en dos namespaces novos `workspace`, `admin`, `share` e `history` (e das chaves novas em `board`, `common`, `modals`, `permissions`) escritos do zero (do projeto, MIT).
- **Formatos importados/exportados novos:** `.ludraw-workspace` (backup completo do workspace, formato **próprio**) e o banco IndexedDB `ludraw` (interno) — §5. O CSV do Audit Log usa o `toCsv` existente (proteção contra fórmulas). Nenhum formato de terceiros.
- **Referências:** `CLAUDE.md` §1.1, `WORKSPACE_ADMIN_SPEC.md` + emenda v1.1 do usuário, pedidos/decisões do usuário e prints do próprio LuDraw (§6). Nenhum produto concorrente, print de terceiros, bundle, source map, DevTools, tráfego de rede ou API de terceiros consultado. Testes em navegador feitos com script próprio descartável (fora do repositório) sobre o Chrome local.
- **Decisões do usuário registradas (07/11/2026):** uma organização por instalação; política do workspace como teto do download do link público; Audit Log por id sem copiar nome de pessoa; aviso de que a senha do link no modo local só protege com servidor; "Fechar cadastro já" (cadastro por convite e "Continuar sem conta" isolado).
- **Exceções:** nenhuma aberta (`CLEAN_ROOM.md` §8 continua só com a decisão anterior do E05 `.drawio`, extensão desligada por padrão do Chat 06.5).
- **`npm run audit:legal` no fechamento:** 0 bloqueantes · 20 avisos, todos já decididos (§8, §9).
- **docs/PROVENANCE.md atualizado:** sim (§5, §6, §8, §15, §16 e §17).
- **Confirmação:** todo o código, interface e texto do Chat 06 foi escrito do zero; nenhum conteúdo de terceiros. Isto não é parecer jurídico.

## 18. Declaração de Sala Limpa — Chat 06.5 · Rodada A (Plataforma de Extensões, Nível 1 — Etapas 1 e 2)

**DECLARAÇÃO DE SALA LIMPA — Chat 06.5 · Rodada A**
- **Dependências novas:** nenhuma. `package.json` só ganhou o script `test:extensions`; `package-lock.json` não mudou. O ZIP é lido pelo leitor próprio (`utils/zip.ts`, PKWARE APPNOTE) com `DecompressionStream` nativo; hashes por Web Crypto (`crypto.subtle` SHA-256); testes em Node puro com hooks de módulo próprios (`scripts/lib/ts-hooks.mjs`).
- **Assets novos:** `src/extensions/builtin/{tema-grafite,formas-fluxograma,modelos-scrum}/` (`manifest.json` + cópia do `LICENSE` MIT do projeto) — obra própria (§4). Formas do Fluxograma = geometria genérica padrão; modelos Scrum = vocabulário do Guia do Scrum com textos e estrutura próprios; **nenhum conteúdo de terceiros copiado**. Ícones: `lucide-react` já aprovado (ISC).
- **Formatos importados/exportados novos:** `.ludraw-ext` (pacote de extensão, formato próprio, só importação) e os stores `extensions`/`extensionFiles` do IndexedDB v2 (internos); elemento `composite` no `BoardData` (§5). Nenhum formato de terceiros; `contributes.locales` continua recusado com mensagem clara.
- **Referências:** `EXTENSIONS_SPEC.md`, `EXTENSIONS_CATALOG.md`, decisões e ajustes do usuário (07/11/2026: instalação em Configurações; visitante sem extensões; idiomas depois; Cartão de história no Scrum; validação em todos os caminhos; prefixo `dev.ludraw.` reservado; anti-ZIP-bomb por bytes reais e taxa; sanitizador de SVG estrito; regex estrita de cor nos temas; nota honesta de integridade; upgrade bloqueado do IndexedDB tratado). WCAG 2.x (fórmula pública de luminância relativa e razão de contraste) para o validador de temas; W3C SVG 1.1 para a gramática de paths. Nenhum produto concorrente, loja de extensões, bundle, source map, DevTools, tráfego de rede ou API de terceiros consultado. Testes em navegador com scripts descartáveis (fora do repositório) sobre o Chrome local.
- **Ajuste de token (decisão do usuário, 08/11/2026):** `--od-danger` claro `#C2412D` → `#BC3F2C` (escurecido 3 %, mesmo matiz) para `danger/danger-soft` chegar a 4,51:1 (AA); valor escolhido por cálculo da razão de contraste WCAG 2.x, sem paleta de terceiros. Nenhum token novo.
- **Exceções:** nenhuma aberta (`CLEAN_ROOM.md` §8 inalterado; E05 `.drawio` segue para a Rodada B, desligada por padrão).
- **docs/PROVENANCE.md atualizado:** sim (§4, §5, §5.1 e §18).
- **Confirmação:** todo o código, interface, texto e conteúdo das extensões oficiais desta rodada foi escrito do zero. Isto não é parecer jurídico.

## 19. Declaração de Sala Limpa — Chat 06.5 · Rodada B (Extensões programáveis, Nível 2)

**DECLARAÇÃO DE SALA LIMPA — Chat 06.5 · Rodada B**
- **Dependências novas:** nenhuma. Isolamento com APIs nativas: Web Worker a partir de Blob, `<iframe sandbox="allow-scripts">` com `srcdoc` e CSP, `postMessage`, `AbortController`, `DecompressionStream`. `package.json` ganhou só o script `test:extensions:browser` (Chrome/Edge local controlado pelo protocolo DevTools, sem pacote); `package-lock.json` não mudou.
- **Assets novos:** `src/extensions/builtin/contador-palavras/` e `src/extensions/builtin/formatos-drawio/` (`manifest.json`, `main.js` e cópia do `LICENSE` MIT) — obra própria, escritas do zero.
- **Formatos importados/exportados novos:** `.drawio` (importação, formato aberto e documentado, só como extensão embutida desligada por padrão — `CLEAN_ROOM.md` §8) e o protocolo RPC interno (§5). **Nenhum** importador de formato proprietário não documentado; **nenhuma** leitura da área de transferência de outros editores (a colagem de extensões só recebe `text/plain` e HTML genérico, depois da proteção contra dado codificado).
- **Conteúdo de terceiros usado:** nenhum.
- **Referências:** `EXTENSIONS_SPEC.md` §5–§6 e §11, `EXTENSIONS_CATALOG.md` (E04, E05), `CLEAN_ROOM.md` §8; padrões abertos: HTML Living Standard (Workers, `postMessage`, `iframe` `sandbox`/`srcdoc`), CSP Level 3, Fetch (`credentials: 'omit'`, `redirect: 'error'`), Compression Streams, e a descrição pública do formato `.drawio` (sem navegação na web nesta sessão; conhecimento geral do formato documentado). Nenhum produto concorrente, loja de extensões, bundle, source map, DevTools ou tráfego de rede de terceiros consultado. Testes com scripts próprios.
- **Limites honestos:** o isolamento usa os mecanismos do navegador (Worker sem rede pelo preâmbulo selado, iframe de origem opaca com CSP); a CSP do app inteiro chega no Chat 09. A conferência de `import(` no código é estática e conservadora (defesa extra; a garantia é o Worker selado). Instale só extensões de quem você confia.
- **Exceções:** nenhuma nova (`CLEAN_ROOM.md` §8 inalterado).
- **docs/PROVENANCE.md atualizado:** sim (§5 e §19).
- **Confirmação:** todo o código e texto desta rodada foi escrito do zero. Isto não é parecer jurídico.

## 20. Declaração de Sala Limpa — Chat 06.5 (inteiro: Rodada A — Etapas 1 e 2 e ajustes · Rodada B · correções pós-teste da E05)

**DECLARAÇÃO DE SALA LIMPA — Chat 06.5**
- **Dependências novas:** nenhuma. `package.json` ganhou só os scripts `test:extensions` e `test:extensions:browser`; `package-lock.json` não mudou neste chat. Tudo sobre APIs nativas (especificações abertas W3C/WHATWG): IndexedDB, Web Crypto (`crypto.subtle` SHA-256), `DecompressionStream`, Web Workers a partir de Blob, `<iframe sandbox>` com `srcdoc`, CSP, `postMessage`, Fetch, `BroadcastChannel`.
- **Assets novos:** extensões oficiais embutidas E01–E05 em `src/extensions/builtin/` (`manifest.json`, `main.js` nas programáveis e cópia do `LICENSE` MIT) — obra própria (§4). Frame 29 do Design System e miniaturas geradas — JSX/SVG próprios. Ícones só do `lucide-react` (ISC, já aprovado).
- **Formatos importados/exportados novos:** `.ludraw-ext` (próprio), stores `extensions`/`extensionFiles` do IndexedDB v2 (internos), elemento `composite` (opcional no `BoardData`), protocolo RPC v1 (interno) e **`.drawio`** (formato aberto e documentado, só como extensão embutida desligada por padrão — decisão do usuário em `CLEAN_ROOM.md` §8). Na API, `group` e `points` (campos próprios, validados) desde o pós-teste.
- **Conteúdo de terceiros usado:** nenhum. Formas do Fluxograma = geometria genérica; modelos Scrum = vocabulário público do Guia do Scrum com textos e estrutura próprios; E05 escrita a partir da descrição pública do formato aberto. Prints do programa de diagramas do usuário e o `teste.drawio` dele serviram só para conferir o resultado esperado (função); nada foi copiado para o repositório.
- **Limites do que NÃO foi feito, por decisão do usuário:** nenhuma leitura da área de transferência de outros editores (colar do programa de diagramas continua bloqueado pela proteção genérica contra dado codificado); nenhum importador de formato proprietário não documentado; `contributes.locales` recusado.
- **Referências:** `EXTENSIONS_SPEC.md`, `EXTENSIONS_CATALOG.md`, `CLEAN_ROOM.md` §8, decisões do usuário de 07 e 08/11/2026, WCAG 2.x (luminância relativa e razão de contraste), W3C SVG 1.1 (gramática de paths), HTML Living Standard, CSP Level 3, Fetch, Compression Streams, PKWARE APPNOTE. Nenhum produto concorrente, loja de extensões, bundle, source map, DevTools, tráfego de rede ou API de terceiros consultado. Testes em navegador com scripts próprios (os do repositório e descartáveis fora dele) sobre o Chrome local.
- **Ajuste de token:** só o valor de `--od-danger` claro (`#C2412D` → `#BC3F2C`, por cálculo de contraste). Nenhum token novo.
- **Limites honestos:** integridade por hash local (protege contra corrupção, não contra quem altera o IndexedDB inteiro); publisher sem assinatura; isolamento pelos mecanismos do navegador (CSP do app inteiro no Chat 09) — §5.1.
- **Exceções:** nenhuma nova (`CLEAN_ROOM.md` §8 continua só com a decisão do E05 `.drawio`).
- **`npm run audit:legal` no fechamento:** 0 bloqueantes · 20 avisos, todos já decididos (§8, §9).
- **docs/PROVENANCE.md atualizado:** sim (§4, §5, §5.1, §6, §8, §9, §18, §19 e §20).
- **Confirmação:** todo o código, interface, texto e conteúdo das extensões oficiais do Chat 06.5 foi escrito do zero; nenhum conteúdo de terceiros. Isto não é parecer jurídico.

## 21. Declaração de Sala Limpa — Chat 07 · Rodada A (servidor: etapas A-1 e A-2)

**DECLARAÇÃO DE SALA LIMPA — Chat 07 · Rodada A**
- **Dependências novas (só em `server/`):** fastify@5.12.8, @fastify/cookie@11.1.5, @fastify/cors@11.4.1, @fastify/rate-limit@11.2.2, pg@8.23.1, argon2@0.45.2, jose@6.2.16, openid-client@6.8.9 — MIT; drizzle-orm@0.45.4 — Apache-2.0. Desenvolvimento: typescript@5.9.3 e @electric-sql/pglite@0.5.15 — Apache-2.0; tsx@4.23.15, esbuild@0.28.2, drizzle-kit@0.31.11, @types/node, @types/pg — MIT. Árvore inteira: MIT, ISC, BSD-3-Clause, Apache-2.0 (§3.3). O `package.json` da raiz ganhou só scripts (`typecheck:server`, `server:dev`, `test:server`, `test:server:pg`); o `package-lock.json` da raiz não mudou.
- **Assets novos:** nenhum.
- **Formatos novos:** API JSON própria `/api/v1` e migrações SQL próprias (§5). Padrões abertos usados: JWT (RFC 7519) e JWS HS256/RS256, cookies (RFC 6265), argon2id (RFC 9106), HKDF (RFC 5869), AES-256-GCM, OAuth 2.0 Authorization Code + PKCE (RFC 6749/7636), OpenID Connect Core e Discovery 1.0.
- **Conteúdo de terceiros usado:** nenhum. Servidor escrito a partir de `WORKSPACE_ADMIN_SPEC.md` §5–§11, `ARCHITECTURE_MAP.md` §5–§6 e dos padrões acima. O provedor OIDC dos testes (`server/test/oidc.test.ts`) foi escrito do zero; nenhum serviço de terceiros é chamado.
- **Regras compartilhadas:** `src/utils/workspaceRules.ts` (as ações do Workspace saíram do `workspaceSlice` para funções puras usadas pelo cliente e pelo servidor), `src/utils/passwordPolicy.ts`, `src/utils/boardLimits.ts`, `src/utils/apiContract.ts` e `boardPermissionContext` em `src/utils/workspace.ts` — código próprio.
- **Decisões do usuário registradas (08/11/2026):** Drizzle no lugar do Prisma; duas rodadas (A servidor, B cliente) com pontos de conferência A-1/A-2; Docker para testes com Postgres real; `multi_org` só na base (gravado no setup, cadastro aberto depois); **sem SMTP** neste chat (convite só por link). Ajustes da aprovação: tolerância de 20 s no refresh entre abas, `LUDRAW_TRUST_PROXY`, limites do PUT do board, regras puras compartilhadas, aviso de cookie sem Secure, documentação do segredo JWT e da retenção de IPs.
- **Exceções:** nenhuma nova (`CLEAN_ROOM.md` §8 continua só com a decisão do E05 `.drawio`). Nenhuma CC0 apareceu na árvore.
- **Limites honestos:** limites de tentativas em memória (valem por instância); exportação continua no cliente (o servidor não impede captura de tela de quem pode ver); sem tempo real (Chat 08); Dockerfile/HTTPS no Chat 09.
- **`npm run audit:legal`:** 0 bloqueantes · 20 avisos, os mesmos de antes (§8).
- **docs/PROVENANCE.md atualizado:** sim (§3, §3.3, §5, §8 e §21).
- **Confirmação:** todo o código do servidor e das regras compartilhadas foi escrito do zero; nenhum conteúdo de terceiros. Isto não é parecer jurídico.

## 22. Declaração de Sala Limpa — Chat 07 · Rodada B (cliente: Modo Local × Modo Servidor)

**DECLARAÇÃO DE SALA LIMPA — Chat 07 · Rodada B**
- **Dependências novas:** nenhuma. O cliente usa só APIs nativas: Fetch, `navigator.locks` (Web Locks), IndexedDB, `localStorage`, `AbortController`. O `package.json` da raiz ganhou só o script `test:server:browser`; o `package-lock.json` da raiz não mudou.
- **Assets novos:** nenhum (ícones só do `lucide-react`, já aprovado). Frame 30 do Design System com componentes reais.
- **Formatos novos:** nenhum além do contrato da API da Rodada A; a cópia de trabalho do Modo Servidor usa o mesmo formato `BoardData` num banco IndexedDB separado.
- **Conteúdo de terceiros usado:** nenhum. Telas (conexão, `#/setup`, entrada no Modo Servidor, troca de senha, volta do SSO) desenhadas a partir do `DESIGN_SYSTEM.md` (cartão central, pílulas de passo, `Modal`), com a "Diferença do padrão de mercado" registrada no §22 do DS. Textos em pt-BR e inglês escritos do zero. O teste de navegador (`scripts/test-server-browser.mjs`) é próprio e roda só contra o servidor local.
- **Decisões do usuário respeitadas:** `multi_org` só na base (o setup grava o modo e avisa que o cadastro aberto ainda não existe); sem SMTP; Login e Configurações alterados só no que o pedido exige (botão de conexão que antes era "em desenvolvimento", SSO, selo do servidor e linha "Servidor" na Sessão).
- **docs/PROVENANCE.md atualizado:** sim (§8 e §22).
- **Confirmação:** todo o código da Rodada B foi escrito do zero; nenhum conteúdo de terceiros. Isto não é parecer jurídico.

## 23. Declaração de Sala Limpa — Chat 07 (inteiro: Rodada A — A-1 e A-2 · Rodada B)

**DECLARAÇÃO DE SALA LIMPA — Chat 07**
- **Dependências novas:** só no servidor (`server/package.json`, §3.3): fastify@5.12.8, @fastify/cookie@11.1.5, @fastify/cors@11.4.1, @fastify/rate-limit@11.2.2, pg@8.23.1, argon2@0.45.2, jose@6.2.16, openid-client@6.8.9 — MIT; drizzle-orm@0.45.4 — Apache-2.0; desenvolvimento: typescript@5.9.3 e @electric-sql/pglite@0.5.15 — Apache-2.0; tsx@4.23.15, esbuild@0.28.2, drizzle-kit@0.31.11, @types/node, @types/pg — MIT. Árvore inteira (176 pacotes): MIT, ISC, BSD-3-Clause, Apache-2.0. Cliente: nenhuma dependência nova.
- **Assets novos:** nenhum.
- **Formatos novos:** API JSON própria `/api/v1` (contrato em `src/utils/apiContract.ts`) e migrações SQL próprias (`server/drizzle/`). Padrões abertos: JWT/JWS, cookies, argon2id, HKDF, AES-GCM, OAuth 2.0 + PKCE, OpenID Connect Core e Discovery.
- **Conteúdo de terceiros usado:** nenhum. Nenhum produto concorrente, bundle, DevTools, tráfego de rede ou API de terceiros consultado; o provedor OIDC dos testes foi escrito do zero.
- **Exceções:** nenhuma nova (`CLEAN_ROOM.md` §8 continua só com a decisão do E05 `.drawio`). Nenhuma licença fora da lista do §5 (sem CC0 na árvore).
- **Limites honestos:** limites de tentativa em memória (por instância); exportação no cliente; sem tempo real (Chat 08); Docker, HTTPS e CSP no Chat 09; `argon2` ainda não testado em imagem Alpine.
- **`npm run audit:legal` no fechamento:** 0 bloqueantes · 20 avisos, os mesmos de antes (§8).
- **docs/PROVENANCE.md atualizado:** sim (§3, §3.3, §5, §8, §21, §22 e §23).
- **Confirmação:** todo o código, as telas e os textos do Chat 07 foram escritos do zero a partir dos requisitos do projeto e de padrões abertos. Isto não é parecer jurídico.

## 24. Declaração de Sala Limpa — Chat 07 · ajustes pós-teste (detecção automática do servidor e retoques de interface)

**DECLARAÇÃO DE SALA LIMPA — Chat 07 (ajustes pós-teste)**
- **Dependências novas:** nenhuma (cliente e servidor).
- **Assets novos:** nenhum. A comemoração do primeiro acesso (`SetupCelebration`) é procedural (CSS + SVG inline escritos do zero, cores da marca e da paleta própria de post-its); ícones do `lucide-react` já aprovado (`Eye`, `EyeOff`, `PartyPopper`, `Check`, `KeyRound`).
- **Formatos novos:** `config.json` de execução do próprio app (`{ "serverUrl": "…" }`, formato próprio) e o campo `localMode` em `GET /api/v1/info`; rotas próprias `GET /boards/:id/revision` e `GET /public/boards/:id/revision`. APIs de navegador padrão: `BroadcastChannel`, `fetch` com `AbortController`.
- **Referências:** só prints do **próprio LuDraw** enviados pelo usuário nos testes (referência de função e de defeito). Nenhum produto concorrente, bundle, DevTools, tráfego de rede ou API de terceiros consultado.
- **Exceções:** nenhuma nova.
- **`npm run audit:legal`:** 0 bloqueantes · 20 avisos (os mesmos), 387/387 dependências permitidas.
- **Confirmação:** código, telas e textos (pt-BR e en) escritos do zero. Isto não é parecer jurídico.

## 25. Declaração de Sala Limpa — Chat 08 (edição ao vivo: A-1 · A-2 · B, com as manutenções pedidas nos testes)

**DECLARAÇÃO DE SALA LIMPA — Chat 08**
- **Dependências novas:** frontend `yjs@13.6.33` (MIT), `y-indexeddb@9.0.12` (MIT), `y-protocols@1.0.7` (MIT), `@hocuspocus/provider@4.7.1` (MIT); servidor `yjs@13.6.33`, `y-protocols@1.0.7`, `@hocuspocus/server@4.7.1`, `ws@8.22.0` (todas MIT); desenvolvimento do servidor `@types/ws@8.18.2` e `@hocuspocus/provider@4.7.1` (MIT). Transitivas: `lib0`, `isomorphic.js`, `@hocuspocus/common`, `@lifeomic/attempt`, `async-mutex`, `crossws`, `kleur` (MIT) e `tslib` (0BSD). Detalhes e versões em §3.4.
- **Leitura de código de terceiros:** só o das bibliotecas aprovadas acima, instaladas localmente, para confirmar o contrato do veto (`beforeSync` antes de aplicar e transmitir) — decisão do usuário registrada no plano. Nenhum produto concorrente, bundle, DevTools, tráfego de rede ou API de terceiros consultado.
- **Assets novos:** nenhum. Ícones do `lucide-react` já aprovado (`Eye`, `EyeOff`, `Users`, `UserX`, `Wind`). Cores das pessoas = paleta própria `COLLABORATOR_PALETTE` + matizes gerados (HSL) em `src/collab/colors.ts`; separação de cores por ΔE (CIE76, fórmula pública).
- **Formatos novos:** protocolo próprio do tempo real em `/api/v1/collab` (mensagens `stateless` JSON em `src/collab/protocol.ts`; documento Yjs com esquema próprio em `src/collab/codec.ts`); tabela própria `board_ydocs`; campo `realtime` em `GET /api/v1/info`; política `distinctPresenceColors`.
- **Referências:** prints do **próprio LuDraw** enviados pelo usuário (frame 16 "Avatares e selos" e frame 18 de presença do Design System), usados como referência de função e de aparência do próprio projeto.
- **Exceções:** nenhuma nova.
- **`npm run audit:legal`:** 0 bloqueantes · 20 avisos (os mesmos), 409/409 dependências permitidas.
- **Confirmação:** código, telas e textos (pt-BR e en) escritos do zero a partir dos requisitos e da documentação das bibliotecas aprovadas. Isto não é parecer jurídico.

## 26. Declaração de Sala Limpa — Chat 08.2 · Rodada A-1 (correções da lista do Chat 08 + trazer boards locais)

**DECLARAÇÃO DE SALA LIMPA — Chat 08.2 · A-1**
- **Dependências novas:** nenhuma (cliente e servidor). A migração `server/drizzle/0002_local_import.sql` foi gerada pelo `drizzle-kit` já aprovado.
- **Leitura de código de terceiros:** só o das bibliotecas aprovadas e instaladas localmente (`@hocuspocus/server` e `@hocuspocus/provider` 4.7.1), para confirmar: a fila de mensagens por conexão (ordem do lote de reenvio), o caminho "somente leitura" que não aplica uma atualização, o gancho `afterHandleMessage` e as duas linhas que a biblioteca imprime com `console.error` a cada recusa. Nenhum produto concorrente, bundle, DevTools, tráfego de rede ou API de terceiros consultado.
- **Assets novos:** nenhum. Ícones do `lucide-react` já aprovado (`HardDriveUpload`, `CircleAlert`, `Check`, `LoaderCircle`).
- **Formatos novos:** mensagens próprias do protocolo ao vivo (`batch`, `batch.result`, `select.denied`, `denied` com `scope: 'object'`), coluna própria `boards.imported_from` (`{ kind: 'local', sourceId, by, at }`), campo `importFrom` em `POST /boards`, base confirmada guardada no y-indexeddb do board (`od:offline-base`, JSON próprio), variável `LUDRAW_COLLAB_SELECTION_IDLE_SECONDS`.
- **Referências:** nenhuma imagem nem print; só os requisitos escritos pelo usuário e o arquivo de referência visual próprio `ai-memory/refs/estudio-v2-centro.html` (renomeado; só lido para as rodadas B e C).
- **Exceções:** nenhuma nova.
- **Confirmação:** código, telas e textos (pt-BR e en) escritos do zero a partir dos requisitos. Isto não é parecer jurídico.

## 27. Declaração de Sala Limpa — Chat 08.2 · Rodada A-2, ponto 1 (imagens fora do documento ao vivo)

**DECLARAÇÃO DE SALA LIMPA — Chat 08.2 · A-2 (imagens)**
- **Dependências novas:** nenhuma. Arquivos com `node:fs`/`node:crypto` (sha256); migração `server/drizzle/0003_board_assets.sql` gerada pelo `drizzle-kit` já aprovado.
- **Formatos:** assinaturas de arquivo públicas e documentadas para reconhecer PNG, JPEG, GIF e WebP pelos bytes iniciais (especificações abertas dos formatos); referência própria `asset:<sha256>` no campo `dataUrl`; tabelas próprias `board_assets` e `board_asset_links`; rotas próprias `POST /boards/:id/assets`, `POST /boards/:id/assets/link`, `GET /assets/:hash`; cabeçalhos HTTP padrão (`Cache-Control: private`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`).
- **Leitura de código de terceiros:** só o das bibliotecas aprovadas e instaladas (`@hocuspocus/provider` 4.7.1: quando o socket emite `open` × `connect`). Nenhum produto concorrente consultado.
- **Assets novos:** nenhum (ícone `LoaderCircle` do `lucide-react` já aprovado). As imagens dos testes são bytes gerados pelo próprio teste.
- **Exceções:** nenhuma nova.
- **Confirmação:** código e textos (pt-BR e en) escritos do zero. Isto não é parecer jurídico.

## 28. Declaração de Sala Limpa — Chat 08.2 · Rodada B (Estúdio v2: estrutura)

**DECLARAÇÃO DE SALA LIMPA — Chat 08.2 · B**
- **Dependências novas:** nenhuma.
- **Assets novos:** 4 ícones próprios em `src/components/icons/od/index.tsx` (batuta = Facilitar, ampulheta = Linha do tempo, Roteiro, pin de comentário) e a marca da Mesa (o `favicon.svg` do próprio projeto). Os traçados vêm da referência do próprio projeto `ai-memory/refs/estudio-v2-centro.html`, desenhada para o LuDraw a pedido do mantenedor; não são de pacote de ícones de terceiros. Os demais ícones são do `lucide-react` já aprovado.
- **Formatos:** nenhum novo. A prévia da linha do tempo reaproveita o renderizador de exportação do próprio app (`renderElementsInView` em `src/utils/export.ts`); o contador de mensagens do teste lê o cabeçalho de sincronização documentado do Yjs/Hocuspocus (bibliotecas aprovadas).
- **Layout e textos:** barra do topo única (Ficha │ Roda), módulos Vista e Tempo, gavetas presas ao botão, linha do tempo com versões como pontos e atividade como barras, janela flutuante de extensão — desenho próprio do `STUDIO_V2_SPEC.md`; textos pt-BR e en escritos do zero. Contraste das etiquetas de presença calculado pela fórmula pública de contraste das WCAG 2.x.
- **Leitura de código de terceiros:** nenhuma além das bibliotecas aprovadas já instaladas. Nenhum produto concorrente consultado.
- **Exceções:** nenhuma nova.
- **Confirmação:** nenhum conteúdo de terceiros copiado. Isto não é parecer jurídico.

## 29. Ícones próprios "traço da pena" e Declaração de Sala Limpa — Chat 08.2 · Rodada C-1 (Dock)

**Ícones (obra do projeto, MIT)** em `src/components/icons/od/` — um arquivo por ícone, base `OdIcon.tsx` (grade 24, traço 1,75, pontas e junções redondas, um detalhe de acento `acc`):
- **A partir dos desenhos da referência do projeto** (`ai-memory/refs/estudio-v2-centro.html`, feita para o LuDraw pelo mantenedor), com o detalhe de acento acrescentado onde faltava: Selecionar, Mão, Laço, Post-it, Texto, Formas, Conector, Pena, Frame, Imagem, Emojis e adesivos, Comentário (pin), Caixa de ferramentas, Batuta, Ampulheta, Roteiro, Kanban, Cronograma, Mapa mental, Diagrama por texto, Slides, Protótipo, Documento, Modelos, Importar, Exportar, Extensão, Linha, Seta, Cotovelo, Curva.
- **Desenhados do zero nesta rodada:** Marca-texto, Borracha, Tabela, Fluxograma, Mapa de jornada, Gravação em vídeo, Fluxos, Seta de bloco, Divisor.
- Nenhum ícone foi copiado ou decalcado de biblioteca ou produto de terceiros; o `lucide-react` (já aprovado) continua só para ícones genéricos de interface (fechar, busca, setas, check, lixeira etc.).
- O pin de comentário usa o mesmo traçado do ícone de comentário; o contraste das iniciais segue a fórmula pública das WCAG 2.x (já usada na presença).

**DECLARAÇÃO DE SALA LIMPA — Chat 08.2 · C-1**
- **Dependências novas:** nenhuma.
- **Assets novos:** os ícones acima (obra do projeto, MIT). Emojis são caracteres Unicode desenhados pela fonte do sistema.
- **Formatos:** nenhum novo. Adesivos em imagem seguem a regra da A-2 (PNG/JPEG/WebP/GIF sobem como arquivo no Modo Servidor; SVG já sanitizado fica embutido).
- **Layout e textos:** bandejas presas ao botão com língua, Caixa de ferramentas agrupada por intenção e selo "Em breve" — desenho próprio do `STUDIO_V2_SPEC.md` §4; textos pt-BR e en escritos do zero (inclusive os nomes dos emojis para a busca).
- **Leitura de código de terceiros:** nenhuma. Nenhum produto concorrente consultado.
- **Exceções:** nenhuma nova.
- **Confirmação:** nenhum conteúdo de terceiros copiado. Isto não é parecer jurídico.

## 30. Declaração de Sala Limpa — Chat 08.2 · Rodada C-2 (Cinta do objeto, menus, fontes, cursores, Design System)

**DECLARAÇÃO DE SALA LIMPA — Chat 08.2 · C-2**
- **Dependências novas:** 20 pacotes de fonte Fontsource, todos OFL-1.1 (tabela do §3.1). Nenhuma outra.
- **Assets novos:**
  - ícones da Cinta e da linha rápida dos menus em `src/components/icons/od/` (obra do projeto, MIT): Bloqueio avançado (escudo), Bloquear, Destravar, Inverter o sentido, Proporção, Texto sobre a linha, Link, Menu do objeto, Copiar, Trazer para a frente, Excluir, Colar e Renomear partem da referência do projeto `ai-memory/refs/estudio-v2-barra-contexto.html`; Duplicar foi desenhado do zero;
  - cursor de rotação próprio (`src/utils/cursors.ts`), SVG desenhado do zero (obra do projeto, MIT), 24 px com versão 2x, ponto ativo no centro e fallback nativo `grab`.
- **Formatos:** nenhum novo. Proporção de frame 1:1 é só um valor a mais de `ratioPreset` (boards antigos continuam abrindo).
- **Layout e textos:** Cinta (identidade · chips · grupo fixo à direita), menus com cabeçalho e linha rápida e seletor de fontes por grupos — desenho do `STUDIO_V2_SPEC.md` §5, §10 e §16; textos pt-BR e en escritos do zero. O "Privado" da referência não foi implementado (função nova, foi para o backlog); o escudo continua sendo o "Bloqueio avançado".
- **Leitura de código de terceiros:** só metadados dos pacotes de fonte (licença e versão no `package.json`) e o CSS do próprio pacote Fontsource para gerar as declarações `@font-face`. Nenhum produto concorrente consultado.
- **Exceções:** nenhuma nova.
- **Confirmação:** nenhum conteúdo de terceiros copiado. Isto não é parecer jurídico.

## 31. Declaração de Sala Limpa — pós-Chat 08.2 (Design System reorganizado por tipo de design)

**DECLARAÇÃO DE SALA LIMPA — reorganização do Design System**
- **Dependências novas:** nenhuma.
- **Assets novos:** nenhum. Os exemplos da tela viva foram só remanejados: `Chat05Demo.tsx` virou `ImportExportDemo.tsx`, `Chat065Demo.tsx` virou `ExtensionsDemo.tsx`, `Chat082Demo.tsx` virou `studioMocks.tsx` e os demais (`Chat04Demo`, `Chat06Demo`, `Chat07Demo`, `Chat08Demo`) foram absorvidos pelos arquivos de grupo em `src/components/design-system/groups/`. As entradas antigas desta página que citam “frame 27” e “frame 29” referem-se hoje a `ImportExportDemo.tsx` e `ExtensionsDemo.tsx` (mesmo conteúdo, escrito à mão).
- **Formatos:** nenhum.
- **Layout:** índice por grupos e frames montado a partir da própria página; textos pt-BR escritos do zero. Nenhum produto de terceiros consultado.
- **Confirmação:** nenhum conteúdo de terceiros copiado. Isto não é parecer jurídico.

## 32. Declaração de Sala Limpa — Chat 08.2 (inteiro: A-1 · A-2 · B · C-1 · C-2 · pós-testes)

Consolida as declarações das rodadas (§26–§31) e os ajustes finais (ícones próprios em todo o board, selo único "Em breve", gaveta Estilo do texto, guarda do `#/setup`).

```
DECLARAÇÃO DE SALA LIMPA — CHAT 08.2
- Dependências novas: @fontsource-variable/inter@5.3.0 — OFL-1.1; @fontsource-variable/manrope@5.3.0 — OFL-1.1; @fontsource-variable/dm-sans@5.3.0 — OFL-1.1; @fontsource-variable/work-sans@5.3.0 — OFL-1.1; @fontsource-variable/lexend@5.3.0 — OFL-1.1; @fontsource/atkinson-hyperlegible@5.3.0 — OFL-1.1; @fontsource-variable/source-serif-4@5.3.1 — OFL-1.1; @fontsource-variable/lora@5.3.0 — OFL-1.1; @fontsource-variable/merriweather@5.3.0 — OFL-1.1; @fontsource-variable/bitter@5.3.0 — OFL-1.1; @fontsource/patrick-hand@5.3.0 — OFL-1.1; @fontsource/kalam@5.3.0 — OFL-1.1; @fontsource/architects-daughter@5.3.0 — OFL-1.1; @fontsource/shadows-into-light@5.3.0 — OFL-1.1; @fontsource/bebas-neue@5.3.0 — OFL-1.1; @fontsource/righteous@5.3.0 — OFL-1.1; @fontsource-variable/comfortaa@5.3.0 — OFL-1.1; @fontsource-variable/jetbrains-mono@5.3.0 — OFL-1.1; @fontsource/space-mono@5.3.0 — OFL-1.1; @fontsource-variable/fira-code@5.3.0 — OFL-1.1. Nenhuma outra no cliente nem no servidor (migrações 0002 e 0003 geradas pelo drizzle-kit já aprovado).
- Assets novos: ícones próprios "traço da pena" em src/components/icons/od/ (um arquivo por ícone; desenhos da referência do próprio projeto — ai-memory/refs/estudio-v2-centro.html e estudio-v2-barra-contexto.html — e desenhos novos feitos do zero; obra do projeto, MIT); cursor de rotação em SVG desenhado do zero (src/utils/cursors.ts, MIT); marca da Mesa = favicon.svg do próprio projeto. Emojis = caracteres Unicode desenhados pela fonte do sistema. Ajustes finais só reaproveitaram esses ícones (nenhum desenho novo).
- Formatos importados/exportados novos: nenhum formato de arquivo novo. Formatos internos próprios: mensagens do protocolo ao vivo (batch, batch.result, select.denied, denied por objeto), boards.imported_from + importFrom, referência asset:<sha256> + tabelas board_assets/board_asset_links, ratioPreset "1:1". Reconhecimento de PNG/JPEG/GIF/WebP pelas assinaturas públicas dos formatos.
- Conteúdo de terceiros usado: nenhum. Layout do Estúdio v2 = STUDIO_V2_SPEC.md e referências do próprio projeto; prints recebidos eram do próprio LuDraw (referência de função). Leitura de terceiros limitada a metadados de licença/versão dos pacotes de fonte e ao CSS do próprio Fontsource para gerar o @font-face. Nenhum produto concorrente, bundle, DevTools ou tráfego consultado.
- Exceções: nenhuma nova (CLEAN_ROOM.md §8 inalterado).
- docs/PROVENANCE.md atualizado: sim (§3.1 fontes; §26–§32).
```

`npm run audit:legal` no fechamento (12/11/2026): **0 bloqueantes · 17 avisos** (todos o nome de formato `.excalidraw`, permitido como importação), **429/429 dependências com licença permitida**. Isto não é parecer jurídico.

## 33. Declaração de Sala Limpa — Chat 08.5 (inteiro: A · B · B2 · C · D · E)

E-mail e Acesso: carteiro com SMTP opcional, confirmação de e-mail, recuperação de senha, convites por e-mail, link de convite geral, pedidos de acesso, painel de envio de e-mail, e-mails com a marca, cadastro com o e-mail da organização, tela de entrada e aviso do Modo Local, e o fechamento.

```
DECLARAÇÃO DE SALA LIMPA — CHAT 08.5
- Dependências novas: nodemailer@10.2.1 — MIT-0 (servidor; zero dependências; aprovação do usuário SÓ para este pacote em 12/11/2026 — CLEAN_ROOM.md §8 e scripts/audit-terms.json → packageApprovals; registrado no §3.3 ANTES de instalar). Nenhuma dependência nova no app.
- Assets novos: 7 ilustrações das faixas dos e-mails (convite, chave, prédio, envelope, avião, porta, bússola) desenhadas do zero em SVG próprio (src/utils/mailBanners.ts) e convertidas em PNG pelo script do projeto (scripts/render-mail-assets.mjs → server/src/mail/bannerImages.ts), com a fonte Figtree (OFL-1.1, já registrada no §3.1) embutida só na geração; obra do projeto, MIT. Nenhuma imagem de terceiros.
- Formatos importados/exportados novos: nenhum para o usuário. Internos: mensagens de e-mail MIME geradas pelo nodemailer; .eml + .txt só na pasta de saída do desenvolvimento (LUDRAW_MAIL_OUTBOX_DIR, recusada em produção).
- Conteúdo de terceiros usado: nenhum. Textos de interface e dos e-mails (pt-BR e en) escritos do zero; layout das telas sem conta = casco da própria entrada (AuthShell); prints recebidos eram do próprio LuDraw (referência de função). Documentação externa: apenas a oficial do nodemailer (biblioteca aprovada). Playwright apenas em http://localhost:*, com contas de teste.
- Exceções: nenhuma nova além da aprovação pontual do nodemailer (CLEAN_ROOM.md §8).
- docs/PROVENANCE.md atualizado: sim (§3.3 nodemailer; §4 faixas dos e-mails; §8 auditoria; §33).
```

`npm run audit:legal` no fechamento (15/11/2026): **0 bloqueantes · 17 avisos (todos o nome de formato `.excalidraw`, permitido como importação) · 430/430 dependências com licença permitida**. Isto não é parecer jurídico.

---

## Declaração de Sala Limpa — Chat 08.7 · R5 (logs, tokens e segredos — 16/11/2026)

- **Dependência nova (direta):** `@fastify/proxy-addr@5.1.2` — MIT, publicada em 10/10/2026 (≥ 7 dias), versão exata. Já vinha na árvore pelo Fastify; agora é direta para o WebSocket usar a mesma regra de proxy do REST. Assinaturas do registro conferidas (`npm audit signatures`, `server/`). Avisos de terceiros regenerados (`npm run notices`, sem mudança). Cliente: nenhuma dependência nova.
- **Assets novos:** nenhum.
- **Formatos novos:** nenhum. Mudança de armazenamento: `public_links.token` vira `token_hash` (sha256) + `token_enc` (AES-256-GCM, chave derivada por HKDF, só com a chave no ambiente) — migração `0009`.
- **Conteúdo de terceiros:** nenhum. Textos novos (pt-BR/en) escritos do zero; nenhum produto de concorrente aberto; só `localhost` e contas de teste; Postgres em contêiner descartável (`postgres:16-alpine`, removido).

---

## Declaração de Sala Limpa — Chat 08.7 · R6 (Vite 6 — 16/11/2026)

- **Dependências atualizadas (desenvolvimento, raiz):** `vite` 5.4.21 → 6.4.6 (MIT, 09/11/2026, versão exata); transitivas `esbuild` 0.25.12 + `@esbuild/*` 0.25.12 (MIT, 01/11/2025), novas `fdir` 6.5.0 (MIT, 14/08/2025) e `picomatch` 4.0.7 (MIT, 24/08/2026). Política de ≥ 7 dias respeitada (`--before=2026-11-10`); assinaturas conferidas; avisos de terceiros sem mudança. Nada muda no app distribuído nem no servidor.
- **Assets novos:** nenhum. **Formatos novos:** nenhum. **Código do app:** nenhuma mudança (o Vite 6 não exigiu ajuste).
- **Conteúdo de terceiros:** nenhum. Documentação externa lida só a oficial do Vite (changelog e aviso de segurança do repositório `vitejs/vite`, biblioteca já aprovada). Nenhum produto de concorrente aberto; verificação visual só em `localhost`.


---

## Declaração de Sala Limpa — Chat 09 · R1 (papéis do banco, migração fora do boot, `statement_timeout` — 22/11/2026)

- **Dependências novas:** nenhuma (app e servidor). Lockfiles sem mudança.
- **Assets novos:** nenhum. **Formatos novos:** nenhum. **Esquema do banco:** sem migração nova; só papéis e permissões (`server/src/db/roles.ts`, SQL escrito do zero a partir da documentação do PostgreSQL sobre `CREATE ROLE`, `GRANT`, `ALTER DEFAULT PRIVILEGES` e parâmetros de sessão).
- **Ferramentas:** contêiner descartável `postgres:16-alpine` (imagem oficial do Postgres, PostgreSQL License) na porta 5434, senha aleatória num arquivo fora do repositório, removido no fim. O banco de desenvolvimento (5433) não foi tocado.
- **Conteúdo de terceiros:** nenhum. Nenhum produto de concorrente aberto; nenhuma documentação externa consultada além do comportamento já conhecido das bibliotecas aprovadas (`pg`, `drizzle-orm`, lidas no próprio `node_modules`).

---

## Declaração de Sala Limpa — Chat 09 · R2 (app servido pelo servidor, CSP e cabeçalhos, "Baixar para o board" pelo servidor — 22/11/2026)

- **Dependências novas:** nenhuma (app e servidor; lockfiles sem mudança). O servidor serve o `dist/` com código próprio (`server/src/web/static.ts`, só `node:fs`/`node:crypto`), e o proxy de imagem usa só `node:http`/`node:https`/`node:net` e a guarda de SSRF que já existia (`mail/hostGuard.ts`).
- **Ferramenta temporária (fora do repositório, não entra no `package.json`):** `playwright@1.65.1` — Apache-2.0, publicado em 13/11/2026 (≥ 7 dias), `npm audit signatures` 2/2 válidas, instalado numa pasta temporária; navegadores **Firefox 159.0** (build `firefox-1572`) e **WebKit 27.2** (build `webkit-2388`) baixados da CDN oficial do Playwright (`cdn.playwright.dev`). Uso: pendência 4 (isolamento das extensões fora do Chromium), aprovado pelo usuário (decisão D9). Apagados no fim.
- **Assets novos:** nenhum. Os documentos `ext/station.html` e `ext/panel-host.html` são gerados no build a partir de `src/extensions/host/isolationPolicy.ts` (código próprio já existente desde o Chat 08.7 · R4, só mudou de `srcdoc` para arquivo).
- **Formatos novos:** nenhum. `dist/csp.json` (hashes SHA-256 dos scripts embutidos do `index.html`) é arquivo interno do build, não servido.
- **Referências:** só o comportamento padrão de CSP/cabeçalhos HTTP (W3C/WHATWG) e do Node; nenhum produto de concorrente aberto; navegação só em `localhost` com contas de teste.
- **Conteúdo de terceiros:** nenhum. Textos novos (pt-BR/en) escritos do zero.

---

## Declaração de Sala Limpa — Chat 09 · R3 (imagem Docker, compose de produção, backup e restauração, versão única 0.9.0 — 22/11/2026)

- **Dependências novas:** nenhuma (app e servidor). Nos lockfiles mudou só a versão do próprio projeto (`0.1.0` → `0.9.0`).
- **Imagens base:** fixadas por digest da lista multiarquitetura e publicadas há 7 dias ou mais, a mesma regra das dependências.
  - `node:22.23.5-alpine3.24@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a` — imagem oficial do Node.js. Licença MIT (Node.js) mais os pacotes do Alpine. Tag publicada em 12/11/2026. **Na imagem final são removidos** o npm, o npx, o yarn e o corepack.
  - `postgres:16.15-alpine3.24@sha256:aa6cb33cf4c19c765cefcf48d96176258800870a9a1e930ad126200f9d825139` — imagem oficial do PostgreSQL (PostgreSQL License). Publicada em 06/11/2026.
    - O `16.16` saiu em 18/11/2026 e ainda não completou 7 dias. Atualizar o digest depois de 25/11/2026 e rodar `npm run test:docker`.
- **Pacotes de terceiros na imagem:** só as dependências de produção do servidor (`npm ci --omit=dev --omit=optional --ignore-scripts`), as mesmas do `server/THIRD_PARTY_NOTICES.txt`.
  - Tirados no build: sourcemaps e uma pasta `.playwright-mcp` de registros de teste que o autor do `lib0@0.2.119` (dependência do `yjs`) publicou por engano no npm.
  - Nenhum código de terceiros foi alterado.
- **Assets novos:** nenhum.
- **Formatos novos:** só o `manifest.json` do backup, formato próprio e documentado em `docs/BACKUP.md`. O `db.dump` é o formato *custom* do `pg_dump`; o `assets.tar`, um tar POSIX.
- **Ferramentas:**
  - Docker 29.6 local.
  - Contêineres e volumes de teste com nomes aleatórios, apagados no fim de cada `test:docker`. O banco de desenvolvimento (5433) não foi tocado.
  - `playwright@1.65.1` (Apache-2.0, só o WebKit 27.2), reinstalado temporariamente fora do repositório para a investigação pedida das recusas de folha de estilo, com `npm audit signatures` 2/2 válidas. Apagado no fim.
- **Referências:** documentação oficial do Docker (Dockerfile, Compose, secrets), do PostgreSQL (`pg_dump`, `pg_restore`, `psql \set`) e o README da imagem oficial do Postgres (`/docker-entrypoint-initdb.d`). As datas das tags vieram da API pública do Docker Hub. Nenhum produto de concorrente aberto; navegação só em `localhost`, com conta de teste.
- **Conteúdo de terceiros:** nenhum. Textos novos (pt-BR e en), guias e exemplos de configuração (Caddy, nginx) escritos do zero.

---

## Declaração de Sala Limpa — Chat 09 · R4 (Redis/Valkey opcional: limites e avisos compartilhados entre instâncias — 22/11/2026)

- **Dependência nova (servidor, produção):** `ioredis@6.0.0` — MIT, versão exata, publicada em 31/07/2026.
  - Transitivas: `@ioredis/commands@2.0.0`, `debug@4.4.3`, `ms@2.1.3`, `redis-errors@1.2.0` e `standard-as-callback@2.1.0` (MIT); `cluster-key-slot@1.1.1` e `denque@2.1.0` (Apache-2.0).
  - Detalhes em §3.7. `npm audit signatures`: 127 verificadas. `npm audit --omit=dev`: 0. Avisos de terceiros do servidor regenerados (107 pacotes).
- **Imagem nova (opcional, perfil `redis` do compose e testes):** `valkey/valkey:9.0.7-alpine3.24@sha256:2d04268d…` — BSD-3-Clause, publicada em 27/10/2026.
- **Assets novos:** nenhum. **Formatos novos:** nenhum. Chaves no Valkey: `ludraw:limit:<nome>:<sha256>` e `ludraw:ratelimit:<sha256>`. Canal `ludraw:events`, que leva só o evento e o id da instância.
- **Ferramentas:** contêineres descartáveis de Postgres e Valkey (as mesmas imagens fixadas do compose), em portas aleatórias, com senhas aleatórias em arquivos fora do repositório. Todos foram removidos no fim. O banco de desenvolvimento (5433) não foi tocado.
- **Referências:**
  - documentação do Redis/Valkey sobre `EVAL`/scripts Lua, `PEXPIRE`/`PTTL`, ACL (`aclfile`) e pub/sub;
  - os tipos do `ioredis` e do `@fastify/rate-limit` instalados (opções `enableOfflineQueue`, `commandTimeout`, `redis`, `nameSpace`, `skipOnError`, `keyGenerator`);
  - datas e licenças pelo registro do npm, pela API do Docker Hub e pela API do GitHub do repositório oficial do Valkey.

  Nenhum produto de concorrente aberto.
- **Conteúdo de terceiros:** nenhum. Os scripts Lua, os textos novos (pt-BR e en) e os guias foram escritos do zero.

---

## Declaração de Sala Limpa — Chat 09 · R5 (Sistema visual opcional e e-mail no `multi_org` — 22/11/2026)

- **Dependências novas:** nenhuma (app e servidor; lockfiles sem mudança).
- **Assets novos:** nenhum. **Formatos novos:** nenhum.
- **Código novo:** `src/utils/featureGates.ts` (`designSystemGate`, `mailPanelVisible`), `src/hooks/useDesignSystemGate.ts`, `server/test/feature-gates.test.ts` e a seção 16 do `test:server:browser`. Variável nova `LUDRAW_ENABLE_DESIGN_SYSTEM` e campo `designSystem` no `/info`. Campo opcional `devTool` no `docs/features.json` (conferido pelo `audit:features`).
- **Textos:** nenhum texto novo na interface. Saiu a frase `admin.mail.serverOnly` (pt-BR e en), porque o cartão deixou de existir no `multi_org`. Os guias (`DOCKER.md`, `.env.example`, `CHANGELOG`) foram escritos do zero.
- **Ferramentas:** servidores de teste com o PostgreSQL embutido (`pglite://memory`) e o Chrome/Edge local, só em `localhost`. Nenhum contêiner novo e nenhum acesso à rede externa.
- **Referências:** só o próprio código do projeto. Nenhum produto de concorrente aberto.
- **Conteúdo de terceiros:** nenhum.

---

## Declaração de Sala Limpa — Chat 09 · R6 (integração contínua, gitleaks e fechamento parcial — 23/11/2026)

- **Dependências novas do app ou do servidor:** nenhuma (lockfiles sem mudança).
- **Ferramentas do CI (fora do repositório, baixadas a cada execução e nunca gravadas no projeto):**

  | Ferramenta | Versão | Publicada | Licença | Origem / integridade |
  |---|---|---|---|---|
  | gitleaks | **8.30.1** | 21/03/2026 | MIT (API do GitHub) | release oficial `github.com/gitleaks/gitleaks`. Pacote Linux SHA-256 `551f6fc8…f2470eb`, fixado no `ci.yml` e conferido com o `gitleaks_8.30.1_checksums.txt` do release. No Windows, para os testes locais: `d29144de…c8332afc4e`, numa pasta temporária, apagada no fim |
  | actions/checkout | **v7.0.1** → `3d3c42e5aac5ba805825da76410c181273ba90b1` | 20/07/2026 | MIT | SHA da tag conferido pela API do GitHub e pelo `git ls-remote` do repositório oficial |
  | actions/setup-node | **v7.1.0** → `949feb2413d6458794dcd2491c4babbbce0c15c1` | 08/10/2026 | MIT | idem |

- **Notas de versão lidas para subir as actions da v4 para a v7:** `checkout` v6/v7 e `setup-node` v6/v7. Nada nos afeta: não usamos `pull_request_target`, e o cache continua sendo o do npm.
- **Imagens usadas no CI:** as mesmas do compose (`postgres:16.15-alpine3.24` e `valkey/valkey:9.0.7-alpine3.24`, por digest), já registradas na R3 e na R4. Um passo do CI confere que são iguais.
- **Varredura do histórico** (45 versões, `--redact`): 15 marcações, todas triadas.
  - 13 são os falsos positivos da AUDITORIA_08_7 §10.1.
  - 1 é o marcador do S-34, já corrigido.
  - 1 é **novo**: o nome da imagem `valkey/valkey:9.0.7` no `docs/TESTAR_LOCALMENTE.md` (commit da R4/R5; a regra genérica viu "key" em "valkey").
  - Nenhum segredo real. As impressões estão no `.gitleaksignore`, cada uma com o motivo. Os arquivos ainda fora do git também foram varridos: nenhuma marcação.
- **Assets novos:** nenhum. **Formatos novos:** nenhum.
- **Referências:** a documentação do gitleaks (opções `git`, `--pre-commit`, `--staged`, `--redact`, `.gitleaksignore`) e a do GitHub Actions (`$GITHUB_ENV`, `::add-mask::`, `RUNNER_TEMP`), ambas oficiais. Nenhum produto de concorrente aberto.
- **Conteúdo de terceiros:** nenhum. O `ci.yml`, o gancho e os textos foram escritos do zero.

---

## Declaração de Sala Limpa — Renomeação para LuDraw (R1 a R4 — 23/11/2026)

O projeto passa a se chamar **LuDraw**, de Luka Piancó (LUKA.DEV), repositório `github.com/lukapianco/ludraw`. Nada tinha sido publicado: a troca não mantém compatibilidade com o nome antigo (decisão do usuário). Detalhes no CHANGELOG 0.9.0 ("Alterado — o projeto passa a se chamar LuDraw").

- **Dependências novas:** nenhuma. Os lockfiles mudaram só na linha `name` (`ludraw`, `ludraw-server`); nenhum pacote instalado, atualizado ou removido. `THIRD_PARTY_NOTICES.txt` e `server/THIRD_PARTY_NOTICES.txt` regenerados (`npm run notices`): só o cabeçalho mudou, mesmos pacotes e licenças.
- **Licença:** `LICENSE` (MIT) e as 5 cópias das extensões embutidas, iguais entre si, com Luka Piancó como titular do copyright.
- **Assets refeitos (sem asset novo):**
  - wordmark "Lu"+"Draw" (L e D maiúsculos, dois tons) em `src/components/ui/Logo.tsx`, `src/utils/mailLayout.ts`, `src/utils/mailBanners.ts` e `docs/banner.svg`/`docs/banner.en.svg` — texto na fonte Figtree (OFL-1.1, §3.1), cores da marca;
  - as 7 faixas de e-mail regeradas pelo `npm run mail:assets` a partir do mesmo desenho próprio (SHA-256 novos no §4);
  - `docs/screenshots/board-claro.png` e `board-escuro.png` refeitas no app (§4).
- **Formatos:** nenhum formato novo; os formatos próprios só mudaram de nome (`.ludraw`, `.ludraw-workspace`, `.ludraw-ext`, `ludraw-backup`). Arquivos com o nome antigo não são lidos.
- **Provas de origem:** `ai-memory/refs/` **não mudou** (hashes do §4.1 continuam valendo; exceção do `audit:name`). `ai-memory/CLEAN_ROOM.md` mudou só no nome do projeto; SHA-256 novo no §4.1.
- **Guarda nova:** `scripts/audit-name.mjs` (`npm run audit:name`, também no CI), escrito do zero.
- **Ferramentas:** gitleaks 8.30.1 (já registrado no Chat 09 · R6; binário do release oficial com SHA-256 conferido, numa pasta temporária fora do repositório, apagada no fim), usado num clone descartável para prever os achados de cada commit. Contêineres descartáveis com as imagens já fixadas no compose para o `test:server:pg`, o `test:server:multi` e o `test:docker`, apagados no fim. Navegador só em `localhost` (servidor de desenvolvimento) para a verificação visual e as capturas.
- **Referências:** só o próprio código do projeto. Nenhum produto de concorrente aberto.
- **Conteúdo de terceiros:** nenhum.

---

## Declaração de Sala Limpa — Chat 09.1 · R7 (casca desktop Tauri e primeiro uso — 25/11/2026)

- **Dependências novas:** crates do §3.8 (Rust). Nenhum pacote npm novo, atualizado ou removido; os `THIRD_PARTY_NOTICES.txt` não mudaram.
- **Assets novos:** ícones do programa (`src-tauri/icons/*`), gerados do favicon próprio (§4).
- **Formatos novos:** nenhum importado ou exportado. Arquivo interno `desktop.json` (modo, endereço e idioma; nenhum token).
- **Referências:** documentação oficial do Tauri 2 (permissões e acesso remoto) e o código publicado das crates `tauri`, `wry` e `tauri-runtime-wry` (licenças permitidas), índice e API do crates.io, OSV/RustSec e o pacote oficial do WebView2 (só o texto da licença). Nenhum produto de concorrente aberto.
- **Ferramentas:** contêiner descartável (imagens oficiais `rust` e `node`) para o Linux; openssl do sistema para o certificado de teste, gerado na hora e apagado.
- **Conteúdo de terceiros:** nenhum. Código, telas e textos (pt-BR e en) escritos do zero.
- **Em que a tela difere do padrão de mercado:** sem conta nem nuvem obrigatória; as duas opções lado a lado, e o servidor mostra o que oferece antes de a pessoa mudar.

## Declaração de Sala Limpa — Chat 09.1 · R8 (instaladores, avisos e CI do desktop — 25/11/2026)

- **Dependências novas:** `@tauri-apps/cli` 2.12.6 (Apache-2.0 OR MIT, desenvolvimento, versão exata, mais os binários opcionais por sistema). Nenhuma crate nova; `Cargo.lock` sem mudança.
- **Componentes novos nos instaladores:** NSIS 3.13 (zlib/libpng, compressão zlib) e `nsis_tauri_utils` 0.5.3 (MIT OR Apache-2.0), com SHA-256 fixado (§3.8.1).
- **Textos de terceiros guardados:** `src-tauri/licenses/` (7 arquivos, licenças e origem no §3.8.1, sem alteração).
- **Assets novos:** nenhum. O ícone `128x128@2x.png` saiu da lista do pacote (gerava uma pasta `256x256@2` inválida no Linux); o arquivo continua no repositório.
- **Formatos novos:** nenhum importado ou exportado.
- **Referências:** documentação oficial do Tauri 2 (configuração de pacotes), o código publicado das crates em uso, as políticas do Debian (pasta `doc` e arquivo `copyright`), os releases oficiais citados acima e o nuget.org (só o texto da licença do WebView2). Nenhum produto de concorrente aberto.
- **Conteúdo de terceiros:** só os textos de licença acima, como as licenças exigem. Atalho do Linux, README, testes e workflows escritos do zero.

## Declaração de Sala Limpa — Chat 09.1 · R9 (fechamento — 25/11/2026)

- **Dependências novas:** nenhuma. `url` 2.5.8 e `cookie` 0.18.2 continuam (as versões novas só completam 7 dias em 27/11/2026 20h03 e 30/11/2026: pendências datadas no §3.8).
- **Assets novos:** nenhum.
- **Formatos novos:** nenhum.
- **Mudanças:** documentação (CHANGELOG 0.9.0, README, TESTAR_LOCALMENTE, AUDIT_REPORT regerado) e o `test:server:browser` (só a primeira abertura espera até 30 s e mostra o diagnóstico). Nenhum código do app, do servidor ou do programa desktop mudou.
- **Referências:** nenhuma nova. Nenhum produto de concorrente aberto.
- **Conteúdo de terceiros:** nenhum.
