/**
 * Roda os testes do servidor (node:test + tsx), portátil entre Windows, macOS e Linux.
 *   npm test               → PostgreSQL embutido em memória (PGlite), sem Docker
 *   npm run test:pg        → Postgres DESCARTÁVEL em TEST_DATABASE_URL (obrigatória — Chat 09 · R1, S-15)
 * No modo --pg o banco de testes é APAGADO e recriado a cada teste — nunca aponte para um banco com dados.
 * Chat 09 · R1 (S-37): TEST_DATABASE_URL é o administrador do banco descartável; os testes criam os papéis
 * ludraw_owner/ludraw_migrator/ludraw_app e rodam a aplicação SEM permissão de mudar o esquema.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const usePg = process.argv.includes('--pg');
const files = readdirSync(`${root}/test`)
  .filter((f) => f.endsWith('.test.ts'))
  .sort()
  .map((f) => `test/${f}`);
const env = { ...process.env };
if (usePg) {
  // S-15: antes, sem a variável, usava (e APAGAVA) o banco de desenvolvimento da porta 5433
  if (!process.env.TEST_DATABASE_URL) {
    process.stderr.write(
      [
        'test:pg needs TEST_DATABASE_URL pointing to a DISPOSABLE PostgreSQL database (it is wiped before every test).',
        'Example: docker run -d --rm --name ludraw-test-pg -e POSTGRES_PASSWORD=<random> -p 127.0.0.1:5434:5432 postgres:16-alpine',
        '         TEST_DATABASE_URL=postgres://postgres:<random>@127.0.0.1:5434/postgres npm run test:pg',
        'Never point it to the development database.',
        '',
      ].join('\n'),
    );
    process.exit(2);
  }
  env.TEST_DB_ROLE_PASSWORD ??= randomBytes(18).toString('hex');
} else {
  delete env.TEST_DATABASE_URL;
  delete env.TEST_DB_ROLE_PASSWORD;
}
const res = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', ...files], { cwd: root, env, stdio: 'inherit' });
process.exit(res.status ?? 1);
