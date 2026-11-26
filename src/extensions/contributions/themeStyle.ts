/**
 * LuDraw — Aplica o tema de extensão escolhido (Chat 06.5 · `EXTENSIONS_SPEC.md` §4 "Regras de temas").
 *
 * Gera um `<style id="od-ext-theme">` SÓ com tokens da allowlist e valores que passaram no validador
 * (cor estrita, sombra, raio; contraste AA conferido na instalação). Defesa em profundidade: confere
 * de novo cada valor antes de escrever e usa `textContent` (nunca `innerHTML`).
 * Seletores `:root:not(.dark)` / `:root.dark` vencem os de `tokens.css` sem `!important`.
 * As faixas "Visualizando como…" usam `brand-*` (fora da allowlist) — nenhum tema as alcança.
 */
import { effectiveThemeKey, useExtensionsStore } from '../../store/useExtensionsStore';
import { ThemeRegistry, type ThemeDefinition } from '../registries';
import { hasCssInjection, isValidRadius, isValidShadow, parseColor, THEME_COLOR_TOKENS, THEME_RADIUS_TOKENS, THEME_SHADOW_TOKENS } from '../schema';

const STYLE_ID = 'od-ext-theme';

function safeDecls(tokens: Record<string, string>): string {
  const out: string[] = [];
  for (const [token, value] of Object.entries(tokens)) {
    if (hasCssInjection(value)) continue;
    const ok = (THEME_COLOR_TOKENS as readonly string[]).includes(token)
      ? !!parseColor(value)
      : (THEME_SHADOW_TOKENS as readonly string[]).includes(token)
        ? isValidShadow(value)
        : (THEME_RADIUS_TOKENS as readonly string[]).includes(token)
          ? isValidRadius(value)
          : false;
    if (ok) out.push(`--od-${token}: ${value};`);
  }
  return out.join(' ');
}

/** CSS do tema (exportado para o Design System mostrar o que é gerado). */
export function themeCss(def: Pick<ThemeDefinition, 'light' | 'dark'>): string {
  return `:root:not(.dark) { ${safeDecls(def.light)} }\n:root.dark { ${safeDecls(def.dark)} }`;
}

function apply(): void {
  if (typeof document === 'undefined') return;
  const key = effectiveThemeKey(useExtensionsStore.getState());
  const def = key ? ThemeRegistry.get(key) : undefined;
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!def) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  const css = themeCss(def);
  if (el.textContent !== css) el.textContent = css;
}

let installed = false;

/** Liga o tema às mudanças do store e do registry (uma vez, em `main.tsx`). */
export function installExtensionTheme(): void {
  if (installed) return;
  installed = true;
  useExtensionsStore.subscribe(apply);
  ThemeRegistry.subscribe(apply);
  apply();
}
