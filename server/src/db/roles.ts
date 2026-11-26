/**
 * LuDraw server — papéis do banco com privilégio mínimo (Chat 09 · R1, S-37).
 *
 *   ludraw_owner     NOLOGIN. Dono do banco, dos esquemas `public` e `drizzle` e de todas as tabelas.
 *   ludraw_migrator  LOGIN, membro de ludraw_owner e entra já como ele (`SET role`): roda as migrações.
 *                      Sem tempo limite de consulta (migração pode demorar).
 *   ludraw_app       LOGIN, só SELECT/INSERT/UPDATE/DELETE nas tabelas, sem CREATE em lugar nenhum, sem TRUNCATE;
 *                      só lê a tabela de controle das migrações (o boot confere se falta alguma).
 *                      statement_timeout 15 s e idle_in_transaction_session_timeout 30 s no próprio papel.
 *
 * Este módulo só MONTA o SQL (texto). Quem aplica: o administrador do Postgres (`npm run db:roles` imprime), o
 * script de inicialização do contêiner do banco (Chat 09 · R3) e os testes no Postgres descartável.
 * Senhas nunca entram aqui: o administrador define com `\password <papel>` ou `ALTER ROLE … PASSWORD` próprio.
 */
import { DB_DEFAULTS } from '../config';

export interface RoleNames {
  owner: string;
  migrator: string;
  app: string;
}

export const DEFAULT_ROLES: RoleNames = { owner: 'ludraw_owner', migrator: 'ludraw_migrator', app: 'ludraw_app' };

const SAFE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

/** Identificador entre aspas; só nomes simples (minúsculas, dígitos e "_") são aceitos. */
export function ident(name: string): string {
  if (!SAFE_NAME.test(name)) throw new Error(`Invalid role/database name: ${name} (use lowercase letters, digits and _)`);
  return `"${name}"`;
}

function literal(name: string): string {
  ident(name);
  return `'${name}'`;
}

/**
 * Parte 1 — papéis e banco (uma vez por instalação; precisa de superusuário ou do dono atual do banco).
 * Idempotente: pode rodar de novo sem erro.
 */
export function clusterRolesSql(database: string, roles: RoleNames = DEFAULT_ROLES): string {
  const { owner, migrator, app } = roles;
  const db = ident(database);
  return [
    '-- LuDraw · papéis do banco (Chat 09 · R1). Idempotente.',
    'DO $$',
    'BEGIN',
    `  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${literal(owner)}) THEN CREATE ROLE ${ident(owner)} NOLOGIN; END IF;`,
    `  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${literal(migrator)}) THEN CREATE ROLE ${ident(migrator)} LOGIN; END IF;`,
    `  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${literal(app)}) THEN CREATE ROLE ${ident(app)} LOGIN; END IF;`,
    'END',
    '$$;',
    `ALTER ROLE ${ident(owner)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;`,
    `ALTER ROLE ${ident(migrator)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;`,
    `ALTER ROLE ${ident(app)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;`,
    `GRANT ${ident(owner)} TO ${ident(migrator)};`,
    // o migrador entra já como dono: as tabelas criadas pelas migrações pertencem a ludraw_owner
    `ALTER ROLE ${ident(migrator)} SET role = ${literal(owner)};`,
    `ALTER ROLE ${ident(migrator)} SET statement_timeout = 0;`,
    `ALTER ROLE ${ident(app)} SET statement_timeout = ${DB_DEFAULTS.statementTimeoutMs};`,
    `ALTER ROLE ${ident(app)} SET idle_in_transaction_session_timeout = ${DB_DEFAULTS.idleInTransactionTimeoutMs};`,
    `ALTER DATABASE ${db} OWNER TO ${ident(owner)};`,
    `REVOKE ALL ON DATABASE ${db} FROM PUBLIC;`,
    `GRANT CONNECT ON DATABASE ${db} TO ${ident(migrator)}, ${ident(app)};`,
    '',
  ].join('\n');
}

/**
 * Parte 2 — esquemas e permissões dentro do banco (conectado NO banco da aplicação, como superusuário ou dono).
 * Idempotente. Também serve para a transição de uma instalação antiga (um só usuário dono de tudo): rode antes
 * `REASSIGN OWNED BY <usuário antigo> TO ludraw_owner;` e depois esta parte.
 */
export function schemaGrantsSql(roles: RoleNames = DEFAULT_ROLES): string {
  const { owner, app } = roles;
  return [
    '-- LuDraw · esquemas e permissões (Chat 09 · R1). Idempotente.',
    `ALTER SCHEMA public OWNER TO ${ident(owner)};`,
    'REVOKE ALL ON SCHEMA public FROM PUBLIC;',
    `GRANT USAGE ON SCHEMA public TO ${ident(app)};`,
    `CREATE SCHEMA IF NOT EXISTS drizzle AUTHORIZATION ${ident(owner)};`,
    `ALTER SCHEMA drizzle OWNER TO ${ident(owner)};`,
    'REVOKE ALL ON SCHEMA drizzle FROM PUBLIC;',
    `GRANT USAGE ON SCHEMA drizzle TO ${ident(app)};`,
    // tabelas futuras (criadas pelo migrador, que age como owner)
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${ident(owner)} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${ident(app)};`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${ident(owner)} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${ident(app)};`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${ident(owner)} IN SCHEMA drizzle GRANT SELECT ON TABLES TO ${ident(app)};`,
    // tabelas que já existem (instalação antiga ou rodar de novo)
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ident(app)};`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${ident(app)};`,
    `GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO ${ident(app)};`,
    `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA drizzle FROM ${ident(app)};`,
    '',
  ].join('\n');
}

/** Caminho (a partir da raiz do repositório) do script que o contêiner do Postgres roda na primeira subida. */
export const INIT_SCRIPT_PATH = 'deploy/postgres/10-ludraw-roles.sql';

/**
 * Chat 09 · R3 — conteúdo de `deploy/postgres/10-ludraw-roles.sql`: as duas partes acima num arquivo só, para o
 * `/docker-entrypoint-initdb.d` do Postgres (roda conectado no banco da aplicação, como superusuário, só na
 * primeira subida de um volume vazio). As senhas vêm depois, dos Docker secrets (`20-ludraw-passwords.sh`).
 * Gerado por `npm --prefix server run db:roles -- --database ludraw --init-script`; um teste confere que o
 * arquivo do repositório é exatamente este texto.
 */
export function initScriptSql(database: string, roles: RoleNames = DEFAULT_ROLES): string {
  return [
    `-- Gerado por: npm --prefix server run db:roles -- --database ${database} --init-script > ${INIT_SCRIPT_PATH}`,
    '-- Não edite à mão: o teste db-roles confere que este arquivo é igual ao que server/src/db/roles.ts monta.',
    clusterRolesSql(database, roles),
    schemaGrantsSql(roles),
  ].join('\n');
}
