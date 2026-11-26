# Testar o LuDraw na sua máquina (mini manual)

Guia rápido para quem desenvolve: zerar o banco, subir o servidor e o app, e conferir as funções à mão.
Todos os comandos rodam na **raiz do repositório** (a pasta `ludraw`), num terminal (PowerShell ou Git Bash).

> ⚠️ `npm run test:server:pg` **apaga o banco** a cada teste. Desde o Chat 09 ele **exige** `TEST_DATABASE_URL`
> apontando para um Postgres **descartável** (seção 6) e nunca usa o banco de desenvolvimento (`localhost:5433`).

---

## 1. Uma vez só (ou depois de `git pull`)

```bash
npm ci
npm ci --prefix server
```

Confira que existe `server/.env` (se não existir: `cp server/.env.example server/.env`) com
`DATABASE_URL=postgres://ludraw:ludraw@localhost:5433/ludraw`.

## 2. Banco de dados (PostgreSQL no Docker)

Abra o Docker Desktop antes.

| Quero… | Comando |
|---|---|
| Ligar o banco | `docker compose -f server/docker-compose.dev.yml up -d` |
| Ver se está pronto | `docker compose -f server/docker-compose.dev.yml ps` (deve dizer `healthy`) |
| Desligar (mantém os dados) | `docker compose -f server/docker-compose.dev.yml down` |
| **Apagar tudo e começar do zero** | `docker compose -f server/docker-compose.dev.yml down -v` e depois `... up -d` |

`down -v` remove o volume `ludraw-dev-db`: some tudo o que estava no servidor. Os boards do **Modo Local**
ficam no navegador e não são afetados.

**Imagens do servidor** ficam em `server/data/assets` (fora do git). Ao zerar o banco, apague também essa pasta
para não sobrar arquivo de um banco antigo (sem banco elas não são usadas, e a manutenção não as vê):

```bash
rm -rf server/data/assets        # PowerShell: Remove-Item -Recurse -Force server/data/assets
```

## 3. Servidor (backend)

```bash
npm run server:dev
```

* Na primeira vez com o banco vazio, o log mostra **um `SETUP_TOKEN`** (uma vez só). Copie.
* As migrações (`server/drizzle/`) são aplicadas sozinhas ao subir.
* Perdeu o token? Com o servidor parado: `npm --prefix server run setup:token -- --generate`.
* Esqueceu a senha do admin: `npm --prefix server run admin:reset-password -- --email voce@exemplo.com --generate`.
* Deixe este terminal aberto (Ctrl+C desliga).

## 4. App (frontend)

Em **outro** terminal:

```bash
npm run dev
```

Abra `http://localhost:5173`. Com o servidor ligado, o app entra sozinho no Modo Servidor:
banco vazio → `#/setup` (cole o token, crie a organização e o admin) → Mesa.

* Modo Local com o servidor ligado (só em desenvolvimento): `http://localhost:5173/?local=1`.
* **CSP ligada também em desenvolvimento** (Chat 09): o Vite manda a mesma política de produção. Se uma tela nova
  quebrar com "Refused to…" no console, é a CSP — corrija o código (não afrouxe a política). Para comparar sem ela:
  `LUDRAW_DEV_CSP=0 npm run dev`. O build (do app e do servidor) não gera mais sourcemaps (`LUDRAW_SOURCEMAP=1 npm run build` gera).
* Ver o app como na imagem Docker (servidor servindo o build, mesma origem, com os cabeçalhos):
  `npm run build` e `LUDRAW_WEB_DIR=../dist npm run server:dev` → `http://localhost:3001`.
* A instalação de produção com Docker (imagem, compose, backup) está em [`DOCKER.md`](DOCKER.md) e [`BACKUP.md`](BACKUP.md).
* Para ter **duas pessoas**: crie um convite em Admin → Membros e abra o link numa **janela anônima** (ou outro navegador).

## 5. Roteiro rápido do Chat 08.5 (E-mail e Acesso)

**Preparação (sem SMTP de verdade):** gere um segredo **só seu** (nunca copie um valor de documentação — o servidor
recusa valores de exemplo ao iniciar):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

e, no `server/.env`, acrescente (troque `<o valor gerado acima>` pelo que o comando imprimiu):

```bash
LUDRAW_MAIL_OUTBOX_DIR=./data/outbox
LUDRAW_APP_URL=http://localhost:5173
LUDRAW_JWT_SECRET=<o valor gerado acima>   # só para o painel guardar senha
```

e reinicie o `npm run server:dev`. Cada e-mail vira um `.eml` + um `.txt` em `server/data/outbox`. **Copie os links do `.txt`**
(no `.eml` as linhas longas quebram com "="). Para um SMTP de verdade, use o painel (item 6) ou as variáveis `LUDRAW_SMTP_*`
descritas no `server/.env.example` — sem a `LUDRAW_MAIL_OUTBOX_DIR`, que não combina com `LUDRAW_SMTP_HOST`.

1. **Esqueci minha senha:** saia, clique em **Esqueci minha senha**, digite o e-mail → mesma resposta para qualquer endereço. Abra o link do `.txt`, crie outra senha e entre com ela.
2. **Confirmar o e-mail:** na Mesa, faixa **Confirme seu e-mail** → **Enviar link de confirmação** → abra o link.
3. **Convite por e-mail:** **Convidar** → marque **Enviar o convite por e-mail** → o convite aparece na pasta de saída.
4. **Link de convite geral:** Administração → Membros → **Links de convite** → **Novo link** → copie o link e abra numa janela anônima.
5. **Pedidos de acesso e cadastro pelo domínio:** Administração → Políticas e domínios → ligue **Aceitar pedidos de acesso**; cadastre um domínio e ligue **Permitir cadastro com o e-mail da organização**. Saia: a entrada mostra **Não tem convite? Pedir acesso** e **Criar conta com o e-mail da organização**.
6. **Painel de e-mail:** Administração → Políticas e domínios → **Envio de e-mail** → preencha, ligue, **Salvar** e **Enviar e-mail de teste**.
7. **Modo Local com servidor:** ligue **Permitir modo local neste servidor**, saia → **Usar só neste navegador (sem sincronizar)** → **Continuar sem conta** → faixa na Mesa e selo **Só neste navegador** no board → clique no selo → **Entrar no servidor**.

> O roteiro do Chat 08.2 (trazer boards deste navegador, seleção ao mesmo tempo, edição sem rede) continua valendo: veja o histórico
> deste arquivo no git ou o `HANDOFF_STATE.md`.
## 6. Testes automáticos

| Comando | O que faz | Precisa de |
|---|---|---|
| `npm run typecheck` / `npm run typecheck:server` | tipos do app / do servidor | — |
| `npm run build` | build de produção do app | — |
| `npm run test:permissions` · `test:extensions` | regras e extensões | — |
| `npm run test:server` | testes do servidor em banco embutido (PGlite) | — |
| `npm run test:server:pg` | os mesmos no Postgres real, com a aplicação no papel `ludraw_app` (sem permissão de mudar o esquema) — **exige `TEST_DATABASE_URL`** de um banco descartável | Docker |
| `npm run test:extensions:browser` | extensões num Chrome/Edge real | Chrome/Edge |
| `npm run test:server:browser` · `test:collab:browser` | Modo Servidor e edição ao vivo em navegador real (sobem servidor próprio, não usam o seu) | Chrome/Edge |
| `npm run test:docker` | constrói a imagem e testa a instalação com Docker de ponta a ponta (compose, papéis do banco, primeiro acesso, tempo real, e-mail, backup → apagar tudo → restaurar); nome, porta e pasta aleatórios, apaga tudo no fim | Docker |
| `npm run test:server:multi` | duas instâncias do servidor com Postgres e Valkey descartáveis (sobe e apaga os contêineres sozinho): limite de login compartilhado, painel de e-mail entre instâncias, Valkey fora do ar = 503 e volta sozinho, boot recusado, manutenção numa instância por vez | Docker |
| `npm run test:desktop` · `npm run desktop:web && npm run test:desktop:rust` | programa desktop: configuração, permissões e CSP · `cargo fmt`, `clippy` e `cargo test` | Rust (rustup); no Linux `libwebkit2gtk-4.1-dev` |
| `npm run test:desktop:app` | o programa desktop de verdade num perfil descartável, só com `localhost` (nunca mexe nos seus boards do programa) | Rust |
| `npm run desktop:package && npm run test:desktop:package` | gera o instalador do sistema e instala/desinstala numa pasta temporária, sem marcar "apagar os dados"; recusa começar se o LuDraw já estiver instalado | Rust |
| `npm run audit:legal` · `audit:i18n` · `audit:features` · `audit:version` | sala limpa, traduções, catálogo, versão única (raiz = servidor = lockfiles = imagem = CHANGELOG) | — |

Para o `test:server:pg`, suba um Postgres **descartável** numa porta própria (nunca o de desenvolvimento), com uma senha
aleatória sua; rode e pare (`--rm` apaga o contêiner ao parar):

```bash
docker run -d --rm --name ludraw-test-pg -e POSTGRES_PASSWORD=<senha-aleatória> -p 127.0.0.1:5434:5432 postgres:16-alpine
TEST_DATABASE_URL=postgres://postgres:<senha-aleatória>@127.0.0.1:5434/postgres npm run test:server:pg
docker stop ludraw-test-pg
```

Para os testes do limitador no Valkey (`server/test/redis-limiter.test.ts`), suba também um Valkey descartável
(Valkey 9.0.7 no Alpine 3.24, a mesma imagem fixada por digest no `docker-compose.yml`) e passe `TEST_REDIS_URL`
(sem ela, esses testes ficam pulados):

```bash
docker run -d --rm --name ludraw-test-valkey -p 127.0.0.1:6380:6379 valkey/valkey@sha256:2d04268dfa26ab31cfa3fdc538866e76438b2d00e41db41b8cb86d780ac5a416
TEST_REDIS_URL=redis://127.0.0.1:6380 npm run test:server
docker stop ludraw-test-valkey
```

O `TEST_DATABASE_URL` é o **administrador** desse banco: os testes criam ali os papéis `ludraw_owner`,
`ludraw_migrator` e `ludraw_app` e rodam a aplicação sem permissão de criar ou apagar tabelas
(`TEST_DB_ROLES=off` volta ao usuário único).

Os testes de navegador sobem servidor e Vite próprios em portas aleatórias: podem rodar com o seu `server:dev` ligado.
Desde o Chat 09 eles rodam **com a CSP ligada** e falham se houver qualquer violação da política do app.
Se o Chrome não for achado: `CHROME_PATH="C:/caminho/chrome.exe" npm run test:collab:browser`.
O `test:server:browser` e o `test:a11y:browser` mostram quanto a primeira abertura levou: com a máquina ocupada (por exemplo, logo depois do `test:docker`) ela
fica bem mais lenta, por isso só essa espera vai até 60 s.

## 7. Problemas comuns

* **App abre direto na tela de entrada e não dá para usar o Modo Local:** é o esperado com o servidor ligado (use `?local=1`).
* **`ECONNREFUSED 5433`:** o banco não está ligado (passo 2).
* **`#/setup` pede token e você não tem:** `npm --prefix server run setup:token -- --generate` (servidor parado) ou `down -v` e comece de novo.
* **Dados estranhos depois de trocar de branch:** `down -v`, `up -d`, `npm run server:dev`.
