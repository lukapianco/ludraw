/**
 * LuDraw — chaves vindas de fora usadas para indexar objetos (Chat 08.7 · R4 · achado S-32). PURO.
 *
 * `__proto__`, `constructor` e `prototype` como chave/id podem trocar o protótipo de um objeto (`obj['__proto__'] = …`)
 * ou devolver uma função herdada (`obj['constructor']`). Quem indexa um mapa por texto que veio de fora (URL, par do
 * Yjs, extensão) confere com `isProtoKey` e lê com `ownValue`.
 */
export const PROTO_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

export const isProtoKey = (key: string): boolean => PROTO_KEYS.has(key);

/** Valor PRÓPRIO do objeto para a chave (nunca herdado do protótipo); `undefined` se não houver. */
export function ownValue<T>(obj: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}
