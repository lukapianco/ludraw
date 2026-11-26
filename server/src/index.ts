/**
 * LuDraw server — ponto de entrada (Chat 07).
 * Ordem: configuração → banco (migração só se permitida + conferência de pendências — Chat 09 · R1) → chaves → app →
 * primeiro acesso/bootstrap → manutenção → escuta.
 */
import pkg from '../package.json';
import { buildApp, loggerOptions } from './app';
import { assertDatabaseForEnv, loadConfig } from './config';
import { loadDotEnv } from './env';
import { createLimiters, type AppContext } from './context';
import { prepareDatabase } from './db/boot';
import { loadServerKeys } from './lib/secrets';
import { runMaintenance } from './maintenance';
import { runBootSetup } from './setup/boot';
import { describeBootError } from './lib/errors';
import { ClusterEvents, connectRedis, describeRedisUrl, watchRedis } from './lib/redis';

async function main(): Promise<void> {
  loadDotEnv();
  const config = loadConfig();
  assertDatabaseForEnv(config);
  // mensagens do preparo do banco saem pelo log do app, que ainda não existe aqui
  const early: { level: 'info' | 'warn'; msg: string }[] = [];
  let appLog: { info(m: string): void; warn(m: string): void } | null = null;
  const bootLog = {
    info: (msg: string) => (appLog ? appLog.info(msg) : early.push({ level: 'info', msg })),
    warn: (msg: string) => (appLog ? appLog.warn(msg) : early.push({ level: 'warn', msg })),
  };
  const { database } = await prepareDatabase(config, bootLog);
  const keys = await loadServerKeys(database.db, config.jwtSecret);
  // Chat 09 · R4: Redis/Valkey opcional — configurado e sem resposta, o servidor não sobe (D10)
  const redis = config.redisUrl ? await connectRedis(config.redisUrl) : null;
  const cluster = redis ? new ClusterEvents(redis) : undefined;
  const ctx: AppContext = { config, db: database.db, keys, limiters: createLimiters(config.mailEnv, redis), version: pkg.version, redis: redis ?? undefined, cluster };
  const { app } = await buildApp(ctx, loggerOptions(config.logLevel));

  appLog = { info: (m) => app.log.info(m), warn: (m) => app.log.warn(m) };
  for (const w of config.warnings) app.log.warn(w);
  for (const e of early) app.log[e.level](e.msg);
  if (keys.source === 'database') app.log.info('Using the session signing key stored in the database. For stronger isolation set LUDRAW_JWT_SECRET in the environment.');
  if (database.kind === 'pglite') app.log.warn('Running on the embedded test database (pglite): data is NOT persisted.');
  if (config.mail?.transport === 'outbox') app.log.warn(`E-mail is written to files in ${config.mail.outboxDir} (development outbox): nothing is actually sent.`);
  else if (!ctx.mailer?.enabled) app.log.info('E-mail is not configured (LUDRAW_SMTP_* or Admin → Policies → E-mail): password recovery and e-mail verification are unavailable; invitations work by link.');
  else if (!config.mail) app.log.info('E-mail is configured from the admin panel.');

  if (redis && config.redisUrl) {
    watchRedis(redis, app.log);
    // o painel de e-mail salvo noutra instância: recarrega aqui também
    await cluster!.listen({ 'mail-settings': async () => ctx.mailControl?.reload() }, app.log);
    app.log.info(`Attempt limits and instance events use Redis/Valkey at ${describeRedisUrl(config.redisUrl)} (shared by every instance).`);
  }

  await runBootSetup(database.db, config, app.log);

  // Chat 09 · R4: com várias instâncias, uma só roda a manutenção de cada vez (trava consultiva do Postgres)
  const tick = () => database.runExclusive('maintenance', () => runMaintenance(ctx)).catch((err) => app.log.error({ err }, 'maintenance failed'));
  await tick();
  const timer = setInterval(tick, 60 * 60 * 1000);
  timer.unref();

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down`);
    clearInterval(timer);
    await app.close();
    await cluster?.close();
    redis?.disconnect();
    await database.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ host: config.host, port: config.port });
}

main().catch((err) => {
  // erro de configuração/boot: mensagem técnica em inglês (I18N_SPEC §4.10), sem segredos
  process.stderr.write(`LuDraw server failed to start: ${describeBootError(err)}\n`);
  process.exit(1);
});
