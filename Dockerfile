# LuDraw — imagem única (Chat 09 · R3): o servidor serve o app compilado na MESMA origem da API, com a CSP e os
# cabeçalhos de segurança (R2). Quatro etapas; só a última vira a imagem.
#
#   docker build -t ludraw:0.9.0 .
#   (produção: use o docker-compose.yml da raiz — banco, migração e app; guia em docs/DOCKER.md)
#
# O que NUNCA entra na imagem: .env, ai-memory/, server/data/, sourcemaps (.map), .playwright-mcp/, .git e as
# dependências de desenvolvimento. O .dockerignore só deixa passar a lista do que o build precisa, e o
# `npm run test:docker` confere o sistema de arquivos da imagem final.
#
# Base fixada por digest (lista multi-arquitetura), publicada há 7 dias ou mais — mesma regra das dependências
# (docs/PROVENANCE.md). Para atualizar: troque a tag e o digest juntos e rode `npm run test:docker`.
ARG NODE_IMAGE=node:22.23.5-alpine3.24@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a

# ---------- 1) app web (Vite) ----------
FROM ${NODE_IMAGE} AS web-build
WORKDIR /build
COPY package.json package-lock.json ./
# --ignore-scripts: nenhum script de instalação de terceiros roda no build
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY index.html vite.config.ts tsconfig.json tsconfig.node.json postcss.config.js tailwind.config.js THIRD_PARTY_NOTICES.txt ./
COPY public ./public
COPY src ./src
# sem LUDRAW_SOURCEMAP o build não gera .map (O-16); a linha seguinte só garante
RUN npm run build && find dist -name '*.map' -delete && test -f dist/index.html && test -f dist/csp.json

# ---------- 2) servidor (esbuild) ----------
FROM ${NODE_IMAGE} AS server-build
WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY server/tsconfig.json ./
COPY server/scripts/build.mjs ./scripts/build.mjs
COPY server/src ./src
COPY server/drizzle ./drizzle
COPY server/THIRD_PARTY_NOTICES.txt ./
# o servidor importa módulos puros do app (permissões, contrato da API, CSP…): o esbuild os embute no dist
COPY src /build/src
RUN npm run build && find dist -name '*.map' -delete && test -f dist/index.js && test -f dist/cli.js

# ---------- 3) dependências de produção do servidor ----------
FROM ${NODE_IMAGE} AS server-deps
WORKDIR /deps
COPY server/package.json server/package-lock.json ./
# argon2 já traz o binário para musl (Alpine) em x64 e arm64: nenhum script de instalação precisa rodar.
# --omit=optional: sem as dependências opcionais do drizzle-orm (o PostgreSQL embutido de testes, tipos do
# TypeScript) e sem o pg-cloudflare (só para Cloudflare Workers).
# Limpeza de pacotes de terceiros: sourcemaps e sobras de publicação (o lib0 vem do npm com uma pasta
# .playwright-mcp de registros de teste do autor).
RUN npm ci --omit=dev --omit=optional --ignore-scripts --no-audit --no-fund \
 && find node_modules \( -name '*.map' -o -name '.env' -o -name '.env.*' \) -type f -delete \
 && find node_modules -name '.playwright-mcp' -type d -prune -exec rm -rf {} + \
 && find node_modules -depth -type d -empty -delete \
 && node -e "require('argon2')" \
 && rm -rf /root/.npm

# ---------- 4) imagem final ----------
FROM ${NODE_IMAGE}
ARG LUDRAW_VERSION=0.9.0
LABEL org.opencontainers.image.title="LuDraw" \
      org.opencontainers.image.description="Quadro branco colaborativo auto-hospedável (app + API + tempo real)" \
      org.opencontainers.image.version="${LUDRAW_VERSION}" \
      org.opencontainers.image.licenses="MIT"
# Sem npm/npx/yarn/corepack no runtime (menos superfície; a operação usa o comando `ludraw`, abaixo).
# Usuário próprio sem login, uid/gid fixos (10001): o código pertence ao root e é só leitura para ele;
# a única pasta gravável é a das imagens (volume).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx \
      /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-* \
 && addgroup -S -g 10001 ludraw \
 && adduser -S -D -H -u 10001 -G ludraw -s /sbin/nologin ludraw \
 && mkdir -p /data/assets \
 && chown ludraw:ludraw /data/assets \
 && chmod 0750 /data/assets \
 && printf '#!/bin/sh\n# LuDraw — comandos de operação (db:migrate, admin:create, admin:reset-password, setup:token)\nexec node /app/dist/cli.js "$@"\n' > /usr/local/bin/ludraw \
 && chmod 0755 /usr/local/bin/ludraw
WORKDIR /app
COPY --from=server-deps /deps/node_modules ./node_modules
COPY --from=server-deps /deps/package.json ./package.json
COPY --from=server-build /build/server/dist ./dist
COPY --from=web-build /build/dist ./web
COPY LICENSE ./LICENSE
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    LUDRAW_WEB_DIR=/app/web \
    LUDRAW_ASSETS_DIR=/data/assets \
    LUDRAW_MIGRATE_ON_BOOT=false     LUDRAW_ENABLE_DESIGN_SYSTEM=false
USER 10001:10001
VOLUME ["/data/assets"]
EXPOSE 3001
# sem curl/wget: o próprio Node pergunta ao /health (que também confere o banco)
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/index.js"]
