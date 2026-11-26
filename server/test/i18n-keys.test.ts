/**
 * Toda chave de mensagem que o servidor devolve ou grava (erros, auditoria, permissões) existe nos
 * catálogos pt-BR E en — o cliente traduz pela chave (I18N_SPEC §4.4).
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { API_ERROR_KEYS, AUDIT_PARAM_KEYS, MAIL_TEMPLATE_KEYS, SERVER_AUDIT_MESSAGES } from '../../src/utils/apiContract';

const root = fileURLToPath(new URL('../..', import.meta.url));

function catalog(locale: string): Set<string> {
  const keys = new Set<string>();
  const dir = join(root, 'src', 'locales', locale);
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json') || file === '_meta.json') continue;
    const ns = file.replace(/\.json$/, '');
    for (const k of Object.keys(JSON.parse(readFileSync(join(dir, file), 'utf8')))) keys.add(`${ns}.${k.replace(/_(zero|one|two|few|many|other)$/, '')}`);
  }
  return keys;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

test('chaves do servidor existem em pt-BR e en', () => {
  const pt = catalog('pt-BR');
  const en = catalog('en');
  // Chat 08.5: os textos dos e-mails também vêm dos catálogos (só o servidor os usa)
  const mailKeys = Object.values(MAIL_TEMPLATE_KEYS).flatMap((group) => Object.values(group) as string[]);
  assert.ok(mailKeys.length >= 20);
  const used = new Set<string>([...Object.values(API_ERROR_KEYS), ...Object.values(AUDIT_PARAM_KEYS), ...Object.values(SERVER_AUDIT_MESSAGES), ...mailKeys]);
  for (const file of walk(join(root, 'server', 'src'))) {
    const text = readFileSync(file, 'utf8');
    // só valores de `key:` (nomes de ação de permissão como 'workspace.boards.create' não são mensagens)
    for (const m of text.matchAll(/key:\s*['"`]((?:server|workspace|permissions|admin|history|board)\.[A-Za-z0-9_.]+)['"`]/g)) used.add(m[1]);
  }
  assert.ok(used.size > 20);
  const missing = [...used].filter((k) => !pt.has(k) || !en.has(k));
  assert.deepEqual(missing, []);
});
