/**
 * LuDraw server — carrega `server/.env` (se existir) antes de ler a configuração.
 * Usa `process.loadEnvFile` nativo do Node (sem dependência). Variáveis já definidas no ambiente
 * (Docker, shell) têm precedência: o arquivo só preenche o que falta.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function loadDotEnv(): string | null {
  // funciona rodando do código-fonte (src/) e do build (dist/): os dois ficam um nível abaixo de server/
  const file = fileURLToPath(new URL('../.env', import.meta.url));
  if (!existsSync(file)) return null;
  const before = { ...process.env };
  process.loadEnvFile(file);
  for (const [k, v] of Object.entries(before)) process.env[k] = v;
  return file;
}
