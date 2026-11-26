/**
 * LuDraw — detecções de texto em tempo LINEAR (Chat 08.7 · R4, achados S-35 e S-36). PURO.
 *
 * As versões anteriores eram expressões regulares com repetição de um grupo "preguiçoso" (`(<!--[\s\S]*?-->\s*)*`,
 * `(?:\/\*[\s\S]*?\*\/\s*)*`): um texto preparado (muitos comentários seguidos sem o final esperado) fazia o motor de
 * regex tentar um número exponencial de divisões — ~200 caracteres travavam a aba. Aqui cada caractere é visto
 * no máximo uma vez (avanço com `indexOf`).
 */

const isSpace = (c: number) => c === 32 || c === 9 || c === 10 || c === 13 || c === 12;

/** Pula espaços a partir de `i`. */
function skipSpaces(t: string, i: number): number {
  while (i < t.length && isSpace(t.charCodeAt(i))) i++;
  return i;
}

/**
 * O texto é um SVG? (opcional: espaços, declaração `<?xml …?>`, comentários `<!-- … -->`; depois `<svg` seguido de
 * espaço ou `>`). Usado no colar (`extensions/core.ts`).
 */
export function looksLikeSvg(text: string): boolean {
  let i = skipSpaces(text, 0);
  if (text.startsWith('<?xml', i)) {
    const end = text.indexOf('>', i);
    if (end < 0) return false;
    i = skipSpaces(text, end + 1);
  }
  while (text.startsWith('<!--', i)) {
    const end = text.indexOf('-->', i + 4);
    if (end < 0) return false;
    i = skipSpaces(text, end + 3);
  }
  if (text.slice(i, i + 4).toLowerCase() !== '<svg') return false;
  const next = text.charCodeAt(i + 4);
  return isSpace(next) || next === 62; // '>'
}

const isIdent = (c: number) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36;

/**
 * O código chama `import(` (import dinâmico), com espaços e comentários `/* … *\/` entre `import` e `(`? A palavra
 * precisa estar inteira (`reimport(` não conta). Usado na instalação de extensões (`extensions/schema.ts`).
 */
export function hasDynamicImport(code: string): boolean {
  let from = 0;
  for (;;) {
    const at = code.indexOf('import', from);
    if (at < 0) return false;
    from = at + 6;
    if (at > 0 && isIdent(code.charCodeAt(at - 1))) continue;
    let i = at + 6;
    for (;;) {
      i = skipSpaces(code, i);
      if (code.startsWith('/*', i)) {
        const end = code.indexOf('*/', i + 2);
        if (end < 0) return false;
        i = end + 2;
        continue;
      }
      break;
    }
    if (code.charCodeAt(i) === 40) return true; // '('
    // os comentários pulados não são revistos: continua a busca depois deles
    from = Math.max(from, i);
  }
}
