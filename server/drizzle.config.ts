/**
 * drizzle-kit: gera as migrações SQL versionadas em `server/drizzle/` a partir de `src/db/schema.ts`.
 *   npm run db:generate   (desenvolvimento; as migrações geradas entram no repositório)
 * O servidor aplica as migrações sozinho no boot (`openDatabase`).
 */
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
