#!/usr/bin/env node
/**
 * LuDraw — gera os arquivos de segredo do docker-compose.yml (Chat 09 · R3).
 *
 *   node scripts/docker-secrets.mjs [--dir deploy/secrets]
 *
 * Cria, com valores aleatórios (crypto.randomBytes, em hexadecimal), só os arquivos que ainda NÃO existem:
 *   postgres_password       superusuário do contêiner do Postgres (só o próprio contêiner usa)
 *   db_migrator_password    papel ludraw_migrator (DDL; só o serviço "migrate")
 *   db_app_password         papel ludraw_app (só DML; o servidor)
 *   migrate_database_url    postgres://ludraw_migrator:…@db:5432/ludraw
 *   database_url            postgres://ludraw_app:…@db:5432/ludraw
 *   jwt_secret              chave de assinatura das sessões (LUDRAW_JWT_SECRET_FILE)
 *   valkey_acl              usuário e senha do Valkey opcional (perfil "redis"; Chat 09 · R4)
 *   redis_url               redis://default:…@valkey:6379 (LUDRAW_REDIS_URL_FILE, só com o perfil "redis")
 *
 * NUNCA imprime um valor: só o nome de cada arquivo e se foi criado ou mantido. Arquivo que já existe não é
 * tocado (trocar a senha de um papel depois que o banco foi criado exige também ALTER ROLE — docs/DOCKER.md).
 * Pasta com permissão 0700 (só o seu usuário entra) e arquivos 0644, para o usuário do contêiner (outro uid)
 * conseguir ler o arquivo montado. A pasta padrão está no .gitignore e fora do contexto do build da imagem.
 */
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const dirFlag = args.indexOf('--dir');
const dir = resolve(dirFlag >= 0 && args[dirFlag + 1] ? args[dirFlag + 1] : 'deploy/secrets');
if (args.includes('--help')) {
  process.stdout.write('Uso: node scripts/docker-secrets.mjs [--dir deploy/secrets]\n');
  process.exit(0);
}

/** Hexadecimal: só [0-9a-f], seguro dentro de uma URL e impossível de lembrar um valor de exemplo ("troque", "example"…). */
const random = (bytes) => randomBytes(bytes).toString('hex');

mkdirSync(dir, { recursive: true });
try {
  chmodSync(dir, 0o700);
} catch {
  /* Windows: permissões do NTFS seguem a pasta do usuário */
}

const report = [];
function ensure(name, make) {
  const file = join(dir, name);
  if (existsSync(file)) {
    report.push(`  mantido  ${name}`);
    return readFileSync(file, 'utf8').replace(/\r?\n$/, '');
  }
  const value = make();
  writeFileSync(file, value, { mode: 0o644 });
  try {
    chmodSync(file, 0o644);
  } catch {
    /* Windows */
  }
  report.push(`  criado   ${name}`);
  return value;
}

ensure('postgres_password', () => random(32));
const migratorPassword = ensure('db_migrator_password', () => random(32));
const appPassword = ensure('db_app_password', () => random(32));
ensure('migrate_database_url', () => `postgres://ludraw_migrator:${migratorPassword}@db:5432/ludraw`);
ensure('database_url', () => `postgres://ludraw_app:${appPassword}@db:5432/ludraw`);
ensure('jwt_secret', () => random(48));
// Chat 09 · R4: Valkey opcional — a senha só existe dentro do arquivo de ACL e da URL (nunca em argumento)
const valkeyPassword = (() => {
  const file = join(dir, 'valkey_acl');
  if (!existsSync(file)) return null;
  return /^user default on >([0-9a-f]+) /m.exec(readFileSync(file, 'utf8'))?.[1] ?? null;
})() ?? random(32);
ensure('valkey_acl', () => `user default on >${valkeyPassword} ~* &* +@all\n`);
ensure('redis_url', () => `redis://default:${valkeyPassword}@valkey:6379`);

process.stdout.write(`Segredos do LuDraw em ${dir} (os valores não são mostrados):\n${report.join('\n')}\n`);
