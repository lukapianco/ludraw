/**
 * LuDraw — tokens de cor e contraste (Chat 08.6 · B, D-08).
 *
 * Fonte única dos pares de contraste do Design System: lê o TEXTO de `src/styles/tokens.css` (blocos `:root` e
 * `.dark`), resolve `var(--…)`, compõe cores translúcidas sobre o painel e mede cada par pela fórmula das WCAG 2.x.
 * Usado pela tabela "Contraste (WCAG 2.1)" do `#/design-system` (valores reais, nunca hex copiados) e pelo
 * `npm run test:design` (falha se um par cair abaixo do mínimo). Arquivo puro: sem DOM, roda no Node.
 */
import { contrastRatio, parseColor, toHex } from './color';

export type TokenTheme = 'light' | 'dark';
export type TokenMap = Record<string, string>;

/** Lê os tokens `--od-*` dos blocos `:root` (claro) e `.dark` (escuro). O escuro herda o que não redefine. */
export function parseTokenCss(css: string): Record<TokenTheme, TokenMap> {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const block = (selector: string): TokenMap => {
    const map: TokenMap = {};
    const re = new RegExp(`(?:^|\\})\\s*${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(clean))) {
      for (const decl of m[1].split(';')) {
        const i = decl.indexOf(':');
        if (i < 0) continue;
        const name = decl.slice(0, i).trim();
        if (name.startsWith('--od-')) map[name.slice(5)] = decl.slice(i + 1).trim();
      }
    }
    return map;
  };
  const light = block(':root');
  return { light, dark: { ...light, ...block('.dark') } };
}

/** Valor de um token com `var(--od-…)` resolvido. */
export function tokenValue(tokens: TokenMap, name: string, depth = 0): string {
  const raw = tokens[name];
  if (raw === undefined) throw new Error(`token --od-${name} não existe`);
  if (depth > 8) return raw;
  return raw.replace(/var\(--od-([a-z0-9-]+)\)/g, (_, ref: string) => tokenValue(tokens, ref, depth + 1));
}

/** Cor opaca do token: translúcida é composta sobre `base` (o painel, onde os fundos suaves aparecem). */
export function solidColor(color: string, base: string): string {
  const c = parseColor(color);
  if (!c) throw new Error(`cor inválida: ${color}`);
  if (c.a >= 1) return toHex(c);
  const b = parseColor(base);
  if (!b) throw new Error(`cor inválida: ${base}`);
  return toHex({ r: c.r * c.a + b.r * (1 - c.a), g: c.g * c.a + b.g * (1 - c.a), b: c.b * c.a + b.b * (1 - c.a), a: 1 });
}

export interface ContrastPair {
  /** Texto (≥ 4,5:1) ou não-texto: bordas, foco, ícones de estado (≥ 3:1) — WCAG 1.4.3 / 1.4.11. */
  kind: 'text' | 'ui';
  fg: string;
  bg: string;
}

/** Identificador estável de um par ("text-subtle/panel"). Os rótulos legíveis ficam na tela do Sistema visual. */
export const pairId = (p: Pick<ContrastPair, 'fg' | 'bg'>): string => `${p.fg}/${p.bg}`;

/**
 * Pares obrigatórios nos DOIS temas. Toda dupla texto/fundo ou borda/fundo que a interface usa de verdade entra
 * aqui; token novo de texto ou de borda = par novo (DESIGN_SYSTEM.md §2.1).
 */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  { kind: 'text', fg: 'text', bg: 'panel' },
  { kind: 'text', fg: 'text', bg: 'app-bg' },
  { kind: 'text', fg: 'text-muted', bg: 'panel' },
  { kind: 'text', fg: 'text-muted', bg: 'panel-sunken' },
  { kind: 'text', fg: 'text-muted', bg: 'panel-hover' },
  { kind: 'text', fg: 'text-subtle', bg: 'panel' },
  { kind: 'text', fg: 'text-subtle', bg: 'app-bg' },
  { kind: 'text', fg: 'text-subtle', bg: 'panel-sunken' },
  { kind: 'text', fg: 'text-subtle', bg: 'panel-hover' },
  { kind: 'text', fg: 'text-subtle', bg: 'panel-active' },
  { kind: 'text', fg: 'text-subtle', bg: 'accent-soft' },
  { kind: 'text', fg: 'text-subtle', bg: 'canvas' },
  { kind: 'text', fg: 'accent-contrast', bg: 'accent' },
  { kind: 'text', fg: 'accent', bg: 'accent-soft' },
  { kind: 'text', fg: 'text-inverse', bg: 'text' },
  { kind: 'text', fg: 'on-selection', bg: 'selection' },
  { kind: 'text', fg: 'success', bg: 'success-soft' },
  { kind: 'text', fg: 'warning', bg: 'panel' },
  { kind: 'text', fg: 'warning', bg: 'warning-soft' },
  { kind: 'text', fg: 'danger', bg: 'panel' },
  { kind: 'text', fg: 'danger', bg: 'danger-soft' },
  { kind: 'text', fg: 'info', bg: 'info-soft' },
  { kind: 'ui', fg: 'focus-color', bg: 'panel' },
  { kind: 'ui', fg: 'focus-color', bg: 'app-bg' },
  { kind: 'ui', fg: 'focus-color', bg: 'canvas' },
  { kind: 'ui', fg: 'input-border', bg: 'panel' },
  { kind: 'ui', fg: 'input-border', bg: 'panel-sunken' },
  { kind: 'ui', fg: 'selection', bg: 'canvas' },
  { kind: 'ui', fg: 'guide', bg: 'canvas' },
  { kind: 'ui', fg: 'danger-on-inverse', bg: 'text' },
  { kind: 'ui', fg: 'favorite', bg: 'panel' },
  { kind: 'ui', fg: 'favorite', bg: 'panel-hover' },
];

export const MIN_RATIO: Record<ContrastPair['kind'], number> = { text: 4.5, ui: 3 };

export interface PairResult {
  ratio: number;
  ok: boolean;
  fg: string;
  bg: string;
}

/** Mede um par num tema: fundo translúcido composto sobre o painel; frente translúcida, sobre o fundo. */
export function measurePair(tokens: TokenMap, pair: ContrastPair): PairResult {
  const panel = solidColor(tokenValue(tokens, 'panel'), '#ffffff');
  const bg = solidColor(tokenValue(tokens, pair.bg), panel);
  const fg = solidColor(tokenValue(tokens, pair.fg), bg);
  const ratio = contrastRatio(fg, bg);
  return { ratio, ok: ratio >= MIN_RATIO[pair.kind], fg, bg };
}

/** Nota de um par de texto (a tabela do Design System mostra esta). */
export function contrastGrade(ratio: number, kind: ContrastPair['kind']): 'AAA' | 'AA' | 'Falha' {
  if (kind === 'ui') return ratio >= 3 ? 'AA' : 'Falha';
  return ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : 'Falha';
}

/** Hierarquia do texto: em cada fundo neutro, principal > secundário > terciário (com folga mínima). */
export function textHierarchy(tokens: TokenMap): { bg: string; text: number; muted: number; subtle: number; ok: boolean }[] {
  return ['panel', 'app-bg', 'panel-sunken', 'panel-hover'].map((bg) => {
    const r = (fg: string) => measurePair(tokens, { kind: 'text', fg, bg }).ratio;
    const [text, muted, subtle] = [r('text'), r('text-muted'), r('text-subtle')];
    return { bg, text, muted, subtle, ok: text / muted >= 1.25 && muted / subtle >= 1.2 };
  });
}
