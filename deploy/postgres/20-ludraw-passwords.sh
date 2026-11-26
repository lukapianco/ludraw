#!/bin/sh
# LuDraw — senhas dos papéis do banco (Chat 09 · R3). Roda UMA vez, na primeira subida do contêiner do Postgres
# (volume vazio), depois do 10-ludraw-roles.sql. As senhas vêm dos Docker secrets e são lidas pelo próprio psql
# (\set com crase): nunca aparecem em argumento de comando, variável de ambiente ou log.
# Este arquivo precisa de fim de linha LF (o .gitattributes garante).
set -e

for name in db_app_password db_migrator_password; do
  if [ ! -s "/run/secrets/$name" ]; then
    echo "LuDraw: the Docker secret '$name' is missing or empty (run: node scripts/docker-secrets.mjs)" >&2
    exit 1
  fi
done

psql -v ON_ERROR_STOP=1 --no-psqlrc --quiet --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\set app_password `cat /run/secrets/db_app_password`
\set migrator_password `cat /run/secrets/db_migrator_password`
ALTER ROLE ludraw_app PASSWORD :'app_password';
ALTER ROLE ludraw_migrator PASSWORD :'migrator_password';
\unset app_password
\unset migrator_password
SQL

echo "LuDraw: database roles ready (ludraw_owner, ludraw_migrator, ludraw_app)."
