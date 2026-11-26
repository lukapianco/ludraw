# LuDraw com Docker

Guia de instalação do LuDraw num servidor próprio (homelab, empresa) com Docker Compose. Uma imagem só traz o app web, a API e o tempo real na mesma origem; o banco é um PostgreSQL ao lado. Backup e restauração estão em [`BACKUP.md`](BACKUP.md).

> O Modo Local continua existindo: quem abre o app sem servidor trabalha só no navegador. Este guia é para quem quer boards compartilhados, contas, convites e colaboração ao vivo.

## Requisitos

- Docker Engine 24+ com o plugin Compose v2.24+ (ou Docker Desktop no Windows/macOS).
- Node.js 22+ **na máquina onde você roda os scripts** (`docker-secrets.mjs` e `docker-backup.mjs`). O contêiner já traz o dele.
- Para uso na rede: um proxy reverso com HTTPS (Caddy, Traefik, nginx…) na frente do LuDraw.

## Instalação

Na pasta do repositório (ou numa pasta com `docker-compose.yml`, `Dockerfile`, `deploy/` e o código):

```sh
node scripts/docker-secrets.mjs                       # 1) segredos aleatórios em deploy/secrets/ (uma vez)
cp deploy/ludraw.env.example deploy/ludraw.env    # 2) opcional: endereço público, e-mail, SSO…
docker compose up -d --build                          # 3) constrói a imagem e sobe banco → migração → app
docker compose logs app                               # 4) copie o token do primeiro acesso
```

Abra `http://localhost:8080`. O app vem do próprio servidor, então já abre no assistente **Primeiro acesso do servidor**. Cole o token e defina a organização, o modo da instalação e a primeira conta de administrador. O token aparece **uma vez** no log; se o contêiner for recriado antes de você usá-lo, o log some junto. Para gerar outro:

```sh
docker compose exec app ludraw setup:token
```

Para pular o assistente, defina `LUDRAW_ORG_NAME`, `LUDRAW_ADMIN_EMAIL` e a senha por arquivo (`LUDRAW_ADMIN_PASSWORD_FILE`; veja **Segredos extras**).

### O que sobe

| Serviço | O que faz |
|---|---|
| `db` | PostgreSQL 16. Na primeira subida (volume vazio) roda `deploy/postgres/`: cria os papéis de privilégio mínimo e define as senhas a partir dos segredos. Fica só na rede interna, sem porta publicada e sem saída para a internet. |
| `migrate` | Aplica as migrações com o papel `ludraw_migrator` e termina. O app só sobe depois que ele termina sem erro. |
| `app` | O servidor (API, tempo real e o app web) com o papel `ludraw_app`, que só lê e grava dados. A porta `8080` fica em `127.0.0.1` por padrão. |

Volumes: `db-data` (banco) e `assets` (imagens dos boards). Os dois entram no backup.

### Papéis do banco

| Papel | Pode | Usado por |
|---|---|---|
| `ludraw_owner` | é dono das tabelas; não faz login | ninguém (o migrador age como ele) |
| `ludraw_migrator` | mudar o esquema (migrações) | serviço `migrate` |
| `ludraw_app` | `SELECT/INSERT/UPDATE/DELETE`; sem `CREATE`, sem `TRUNCATE`; consulta limitada a 15 s, transação parada a 30 s | serviço `app` |

O SQL vem do mesmo código que `npm --prefix server run db:roles` imprime, e um teste confere que os dois são iguais. Para usar **um PostgreSQL que você já tem**, rode esse comando, aplique o SQL como superusuário, defina as senhas com `\password` e aponte os segredos `database_url` e `migrate_database_url` para o seu servidor.

## Configuração

Configurações **sem segredo** vão em `deploy/ludraw.env` (o exemplo comentado é `deploy/ludraw.env.example`; a lista completa está em `server/.env.example`). Depois de mudar, rode `docker compose up -d`.

As mais usadas:

| Variável | Para quê |
|---|---|
| `LUDRAW_PUBLIC_URL` | Endereço que as pessoas abrem (o `https://` do proxy). Entra nos links dos e-mails, no SSO e na política de segurança do navegador. |
| `LUDRAW_TRUST_PROXY` | Atrás de proxy reverso: `1` (um salto) ou os IPs do proxy. Sem isso, o IP de todo mundo é o do proxy e a página não sabe que está em HTTPS. |
| `LUDRAW_MODE` | `single_org` (padrão: uma organização, entrada só por convite) ou `multi_org`. |
| `LUDRAW_SMTP_*` | E-mail. Com `single_org`, também dá para configurar no app, em **Administração → Políticas e domínios → Envio de e-mail**. Com `multi_org`, só pelas variáveis: o painel não aparece para nenhuma organização. |
| `OIDC_*` | Login pela empresa (OIDC: Keycloak, Authentik, Entra ID, Google…). |
| `LUDRAW_FRAME_ANCESTORS` | Sites que podem incorporar boards. |
| `LUDRAW_CSP_CONNECT_SRC` | Hosts extras para extensões com permissão de rede. |
| `LUDRAW_ENABLE_DESIGN_SYSTEM` | A tela "Sistema visual" (`#/design-system`), o guia de quem contribui com o LuDraw. A imagem já vem com `false`: nada no app leva a ela, e o endereço abre a tela inicial. Use `true` para mostrar. |

No `.env` ao lado do `docker-compose.yml` (lido pelo próprio Compose) ficam a porta e o endereço de escuta: `LUDRAW_PORT=8080` e `LUDRAW_BIND=127.0.0.1`. Também fica ali `LUDRAW_IMAGE`, se você usar uma imagem já construída.

### Segredos

`node scripts/docker-secrets.mjs` cria em `deploy/secrets/` (fora do git e fora da imagem):

| Arquivo | Conteúdo |
|---|---|
| `postgres_password` | superusuário do contêiner do banco (só o contêiner usa) |
| `db_migrator_password`, `migrate_database_url` | papel de migração |
| `db_app_password`, `database_url` | papel do app |
| `jwt_secret` | chave que assina as sessões |

O script nunca mostra um valor e não sobrescreve um arquivo que já existe. A pasta tem permissão `0700`, e os arquivos `0644` porque o usuário do contêiner é outro.

> **Trocar a senha de um papel depois da instalação:** os scripts de `deploy/postgres/` só rodam com o volume vazio. Mude a senha no banco (`docker compose exec db psql -U postgres -d ludraw -c '\password ludraw_app'`), atualize `db_app_password` **e** `database_url` e rode `docker compose up -d`.

**Segredos extras** (senha do SMTP, segredo do SSO, senha do primeiro admin): crie o arquivo em `deploy/secrets/`. Declare-o no `docker-compose.yml` e dê ao `app` um arquivo `docker-compose.override.yml` (o Compose o lê sozinho):

```yaml
# docker-compose.override.yml
services:
  app:
    secrets: [database_url, jwt_secret, smtp_password]
    environment:
      LUDRAW_SMTP_PASSWORD_FILE: /run/secrets/smtp_password
secrets:
  smtp_password:
    file: ./deploy/secrets/smtp_password
```

Toda variável sensível aceita o sufixo `_FILE`: `LUDRAW_SMTP_PASSWORD_FILE`, `OIDC_CLIENT_SECRET_FILE`, `LUDRAW_ADMIN_PASSWORD_FILE`, `LUDRAW_SETUP_TOKEN_FILE`, `DATABASE_URL_FILE` e `LUDRAW_JWT_SECRET_FILE`.

## Proxy reverso e HTTPS

O app espera HTTPS em produção: o cookie da sessão sai com `Secure` e o navegador só o devolve por HTTPS. A exceção é `localhost`. Ponha um proxy na frente e encaminhe **também o WebSocket** do tempo real (`/api/v1/collab`).

Caddy (o certificado é automático):

```
draw.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

nginx:

```nginx
server {
    listen 443 ssl;
    server_name draw.example.com;
    # ssl_certificate … ; ssl_certificate_key … ;
    client_max_body_size 48m;              # PUT de board grande e envio de imagens
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;     # tempo real (WebSocket)
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 1h;
    }
}
```

Depois defina, em `deploy/ludraw.env`, `LUDRAW_PUBLIC_URL=https://draw.example.com` e `LUDRAW_TRUST_PROXY=1`. A página passa a sair com HSTS e `upgrade-insecure-requests`. Se o proxy roda em outra máquina, publique a porta na rede com `LUDRAW_BIND=0.0.0.0` no `.env` do Compose e proteja-a com firewall.

## Redis/Valkey (opcional, para mais de uma instância)

Com **uma** instância do app, não precisa: os limites de tentativa ficam na memória do processo. O Valkey (BSD-3-Clause, compatível com Redis) serve para rodar várias instâncias atrás de um balanceador. Elas passam a dividir:
- os limites de tentativa: login, e-mail, links com token, senha de link público, convites, "Baixar para o board";
- o teto geral de pedidos por IP;
- o aviso "o painel de e-mail mudou" (cada instância recarrega o envio sem reiniciar).

Ligar:

```sh
node scripts/docker-secrets.mjs                       # cria valkey_acl e redis_url (se ainda não existem)
echo 'LUDRAW_REDIS_URL_FILE=/run/secrets/redis_url' >> deploy/ludraw.env
docker compose --profile redis up -d
```

O serviço `valkey`:
- fica só na rede interna;
- tem a senha no arquivo de ACL (nunca em argumento);
- não grava nada em disco: só há contagens com prazo;
- tem 64 MB de memória em `noeviction`: cheio, ele recusa gravar em vez de apagar contagens.

Para usar um Redis/Valkey seu, aponte `LUDRAW_REDIS_URL` (ou `_FILE`) para ele (`redis://` ou `rediss://` com TLS). **Não use Redis 7.4 ou mais novo**, cujas licenças o projeto não aceita; use Valkey ou Redis até 7.2.

Comportamento:

| Situação | O que acontece |
|---|---|
| Configurado e fora do ar quando o app sobe | O app **não sobe** e diz o endereço (sem a senha) no log. |
| Cai com o app rodando | Login, e-mail, links com token e as outras rotas com limite respondem **503** ("tente de novo em alguns instantes"); nada passa sem contar. Boards, tempo real e o resto continuam. O app reconecta sozinho e avisa no log. |
| Volta | Tudo volta sem reiniciar; cada instância recarrega o painel de e-mail uma vez, caso tenha perdido um aviso. |

No Valkey, IPs e e-mails nunca aparecem em claro: as chaves levam só o hash. A manutenção de hora em hora (lixeira, versões, sessões vencidas) roda **numa instância por vez**, com uma trava no próprio PostgreSQL.

## Operação

```sh
docker compose ps                                     # estado (o app tem healthcheck em /health)
docker compose logs -f app                            # log (JSON, com rotação de 10 MB × 3)
docker compose exec app ludraw help                 # comandos de operação
docker compose exec app ludraw admin:reset-password --email ana@example.com --generate
docker compose exec -T app ludraw admin:create --email bia@example.com --password-stdin < senha.txt
```

A senha nunca vai como argumento. Ela é pedida sem eco, lida da entrada padrão (`--password-stdin`) ou gerada (`--generate`, mostrada uma vez).

### Atualizar

```sh
node scripts/docker-backup.mjs backup                 # sempre antes
git pull                                              # ou baixe a versão nova
docker compose up -d --build                          # a migração roda antes do app novo
```

Com migração pendente, o app **não sobe** e explica o motivo no log. Em produção, ele nunca migra o próprio banco.

### Instalação antiga (um usuário só, dono de tudo)

Se o seu banco veio de antes dos papéis separados, faça um backup e depois:
1. rode, como superusuário, `REASSIGN OWNED BY <usuário antigo> TO ludraw_owner;`;
2. aplique o SQL de `npm --prefix server run db:roles -- --database ludraw`;
3. defina as senhas e troque os segredos `database_url` e `migrate_database_url`.

## Segurança da imagem

- Base `node:22-alpine` e `postgres:16-alpine` fixadas por digest, publicadas há pelo menos 7 dias.
- O app roda como usuário 10001, sem shell de login. O código pertence ao root e é só leitura; a única pasta gravável é `/data/assets`.
- No compose: raiz do contêiner só leitura (`read_only`), `/tmp` em memória, nenhuma *capability* (`cap_drop: ALL`), `no-new-privileges` e `init`. O banco recebe só as cinco *capabilities* de que o entrypoint oficial precisa.
- A imagem não traz npm, ferramentas de build, dependências de desenvolvimento, sourcemaps, `.env` nem anotações internas. `npm run test:docker` confere isso a cada build.
- O servidor **não sobe** se a pasta de imagens não aceitar gravação. Também não sobe, em produção, com o banco embutido de testes (`pglite://`) ou com a pasta de e-mails de desenvolvimento (`LUDRAW_MAIL_OUTBOX_DIR`).

## Limites conhecidos

- **Tempo real numa instância só.** As salas de colaboração vivem na memória do processo; duas réplicas do `app` dividiriam as pessoas de um mesmo board. Com o Valkey, os limites e o painel de e-mail já valem para várias instâncias. Mesmo assim, só rode mais de uma com o tempo real desligado (`LUDRAW_COLLAB=false`): os boards passam a ser salvos e recarregados, sem edição ao vivo.
- Sem Kubernetes/Helm e sem imagem publicada num registro: a imagem é construída a partir do código (`docker compose build`).
- A imagem é testada em `linux/amd64`. A base e as dependências nativas também existem para `arm64`, mas esse build ainda não é testado.

## Testar a imagem

```sh
npm run test:docker
```

O teste constrói a imagem, sobe tudo numa pasta temporária com nome e porta aleatórios e confere:
- o sistema de arquivos da imagem e os papéis do banco;
- primeiro acesso, login, board com imagem, tempo real com dois clientes e e-mail;
- as recusas de produção;
- backup → apagar volumes **e** segredos → restaurar.

No fim ele apaga tudo, inclusive a imagem de teste. O banco de desenvolvimento (porta 5433) não é tocado.
