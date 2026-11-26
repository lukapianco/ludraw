/**
 * LuDraw — Extensões oficiais embutidas (Chat 06.5 · `EXTENSIONS_CATALOG.md` E01–E03).
 *
 * Cada extensão é um pacote de verdade (`manifest.json` + `LICENSE`) dentro de
 * `src/extensions/builtin/<pasta>/`, lido como texto cru pelo Vite (`import.meta.glob`, sem executar
 * nada). Passa pelo MESMO validador das extensões instaladas, aparece DESLIGADA por padrão em
 * Configurações → Extensões e não pode ser removida (só desativada). Ids com o prefixo reservado
 * `dev.ludraw.`. Todas escritas do zero, licença MIT.
 *
 * - E01 `tema-grafite` — Tema "Grafite" (claro/escuro, contraste AA conferido pelo validador)
 * - E02 `formas-fluxograma` — terminador, decisão, processo, documento, banco de dados
 * - E03 `modelos-scrum` — planejamento, revisão e retrospectiva + elemento "Cartão de história"
 * - E04 `contador-palavras` — comando no Ctrl+K que soma as palavras dos post-its selecionados (Nível 2)
 * - E05 `formatos-drawio` — importa `.drawio` (XML aberto e documentado) — decisão em CLEAN_ROOM.md §8 (Nível 2)
 */

export interface BuiltinPackage {
  /** Pasta de origem (para mensagens e para o Design System) */
  folder: string;
  /** Caminho no pacote → bytes (inclui `manifest.json` e `LICENSE`) */
  files: Record<string, Uint8Array>;
}

function collect(): BuiltinPackage[] {
  // chamada literal (o Vite resolve em tempo de build); `?raw` = texto, nada é executado
  // Chat 06.5 · B: também `main.js` e `ui/*.html` das extensões programáveis (E04, E05) — como TEXTO
  const raw = {
    ...import.meta.glob<string>('./*/{manifest.json,LICENSE,main.js}', { eager: true, query: '?raw', import: 'default' }),
    ...import.meta.glob<string>('./*/ui/*.html', { eager: true, query: '?raw', import: 'default' }),
  };
  const byFolder = new Map<string, Record<string, Uint8Array>>();
  const enc = new TextEncoder();
  for (const [path, text] of Object.entries(raw)) {
    const m = /^\.\/([a-z0-9-]+)\/(.+)$/.exec(path);
    if (!m || typeof text !== 'string') continue;
    const files = byFolder.get(m[1]) ?? {};
    files[m[2]] = enc.encode(text);
    byFolder.set(m[1], files);
  }
  return [...byFolder].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([folder, files]) => ({ folder, files }));
}

export const BUILTIN_PACKAGES: BuiltinPackage[] = collect();
