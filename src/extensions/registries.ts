/**
 * LuDraw — Registries internos (Chat 05 · `EXTENSIONS_SPEC.md` §7).
 *
 * Um registry é uma lista observável de contribuições identificadas por `id`. O NÚCLEO registra
 * aqui os próprios importadores, exportadores, formas e templates (`src/extensions/core.ts`), e as
 * extensões do Chat 06.5 vão usar exatamente o mesmo caminho (`source: 'extension'`).
 *
 * Regras:
 * - `id` é único por registry. Uma extensão nunca substitui uma contribuição do núcleo.
 * - `register()` devolve a função que desfaz o registro (para desativar a extensão).
 * - Nada aqui toca o store: quem executa a contribuição (UI/ações) continua passando por
 *   `ensure()`/`can()` + `recordActivity`.
 * - Contratos novos são opcionais e retrocompatíveis.
 */

import { useSyncExternalStore } from 'react';
import type { CanvasElement, ShapeKind } from '../types/canvas';
import type { ClipboardSnapshot } from '../utils/clipboard';
import type { SheetWorkbook } from '../utils/sheets';

export type ContributionSource = 'core' | 'extension';

export interface RegistryItem {
  id: string;
  /** Ausente = 'core' */
  source?: ContributionSource;
  /** Id da extensão dona da contribuição (só quando `source: 'extension'`) */
  extensionId?: string;
  /** Ordem de exibição (menor primeiro; empate = ordem de registro) */
  order?: number;
}

export class Registry<T extends RegistryItem> {
  private readonly items = new Map<string, { item: T; seq: number }>();
  private readonly listeners = new Set<() => void>();
  private seq = 0;
  private snapshot: T[] = [];

  constructor(readonly kind: string) {}

  /** Registra (ou atualiza, se a mesma origem registrar o mesmo id de novo). */
  register(item: T): () => void {
    if (!item.id || typeof item.id !== 'string') throw new Error(`[${this.kind}] contribuição sem id`);
    const current = this.items.get(item.id);
    const source = item.source ?? 'core';
    if (current) {
      const currentSource = current.item.source ?? 'core';
      if (currentSource === 'core' && source !== 'core') throw new Error(`[${this.kind}] “${item.id}” pertence ao núcleo e não pode ser substituído por uma extensão`);
      if (currentSource === 'extension' && source === 'extension' && current.item.extensionId !== item.extensionId) {
        throw new Error(`[${this.kind}] “${item.id}” já foi registrado por outra extensão`);
      }
    }
    // Chat 05.6: copia os descritores (não os valores) para que rótulos definidos como getters
    // continuem traduzidos no idioma ativo depois do registro.
    const stored = Object.defineProperties({}, Object.getOwnPropertyDescriptors(item)) as T;
    Object.defineProperty(stored, 'source', { value: source, enumerable: true, writable: true, configurable: true });
    this.items.set(item.id, { item: stored, seq: current?.seq ?? this.seq++ });
    this.emit();
    return () => this.unregister(item.id, item.extensionId);
  }

  /** Remove um id. Com `extensionId`, só remove se a contribuição for daquela extensão. */
  unregister(id: string, extensionId?: string): void {
    const cur = this.items.get(id);
    if (!cur) return;
    if (extensionId !== undefined && cur.item.extensionId !== extensionId) return;
    this.items.delete(id);
    this.emit();
  }

  /** Remove tudo que uma extensão registrou (kill-switch / desinstalar). */
  unregisterExtension(extensionId: string): void {
    let changed = false;
    for (const [id, { item }] of this.items) {
      if (item.extensionId === extensionId) {
        this.items.delete(id);
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  get(id: string): T | undefined {
    return this.items.get(id)?.item;
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  /** Lista ordenada (array estável entre mudanças — serve de snapshot para o React). */
  list(): T[] {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    this.snapshot = Array.from(this.items.values())
      .sort((a, b) => (a.item.order ?? 100) - (b.item.order ?? 100) || a.seq - b.seq)
      .map((x) => x.item);
    for (const l of Array.from(this.listeners)) l();
  }
}

/** Hook React: re-renderiza quando o registry muda. */
export function useRegistry<T extends RegistryItem>(registry: Registry<T>): T[] {
  return useSyncExternalStore(
    (cb) => registry.subscribe(cb),
    () => registry.list(),
    () => registry.list(),
  );
}

/* ------------------------------- Importadores ------------------------------- */

/** O que um importador entrega. A UI decide como inserir (sempre pelas ações do store). */
import type { StoredMessage } from '../i18n/types';

export type ImportPayload =
  /** Elementos nativos prontos, em coordenadas próprias (a inserção centraliza e evita sobreposição) */
  | {
      kind: 'elements';
      elements: CanvasElement[];
      label: string;
      /** Chat 05.6: o mesmo rótulo como chave + parâmetros (vai para o Activity Log sem ficar preso a um idioma) */
      labelMessage?: StoredMessage;
      summary: string;
      warnings: string[];
      /** Chat 06.5 · B: veio de uma extensão — a inserção registra "via extensão X" no Activity Log */
      viaExtension?: { id: string; name: string };
    }
  /** Dados tabulares: abrem o modal "Importar planilha" (prévia + destino) */
  | { kind: 'workbook'; workbook: SheetWorkbook }
  /** Imagens: seguem o caminho de imagens do Chat 02 (compressão + inserção) */
  | { kind: 'images'; files: File[] };

export interface ImporterDefinition extends RegistryItem {
  label: string;
  /** Uma linha sobre o formato (aparece no modal de importação) */
  description: string;
  /** Extensões aceitas, minúsculas e sem ponto (ex.: `['csv']`) */
  extensions: string[];
  /** Tipos MIME padrão aceitos (só tipos abertos/genéricos no núcleo) */
  mimeTypes: string[];
  /** Base do formato, para a documentação (ex.: "RFC 4180") */
  standard: string;
  /** Arquivo escolhido/solto/colado */
  readFile?: (file: File) => Promise<ImportPayload>;
  /** Colagem: devolve `null` quando o conteúdo não é deste formato */
  readClipboard?: (snapshot: ClipboardSnapshot) => Promise<ImportPayload | null>;
  /** Prioridade na colagem (maior primeiro). Ausente = 0 */
  clipboardPriority?: number;
}

export const ImporterRegistry = new Registry<ImporterDefinition>('ImporterRegistry');

/** Extensão do arquivo em minúsculas, sem ponto (`"planilha.XLSX"` → `"xlsx"`). */
export function fileExtension(name: string): string {
  const m = /\.([a-z0-9-]+)$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : '';
}

/** Importador que aceita o arquivo (extensão primeiro, depois o tipo MIME). */
export function importerForFile(file: File): ImporterDefinition | undefined {
  const ext = fileExtension(file.name);
  const list = ImporterRegistry.list().filter((i) => i.readFile);
  return list.find((i) => ext && i.extensions.includes(ext)) ?? list.find((i) => !!file.type && i.mimeTypes.includes(file.type.toLowerCase()));
}

/** Valor do atributo `accept` de um `<input type="file">` com todos os formatos registrados. */
export function importAcceptAttribute(): string {
  const exts = new Set<string>();
  for (const i of ImporterRegistry.list()) if (i.readFile) for (const e of i.extensions) exts.add(`.${e}`);
  return Array.from(exts).join(',');
}

/* ------------------------------- Exportadores ------------------------------- */

/** O que exportar: o board inteiro, a seleção ou alguns frames (na ordem dos slides). */
export type ExportScope = 'board' | 'selection' | 'frames';

/** Opções declarativas: a UI desenha o formulário sozinha (também para extensões no 06.5). */
export type ExporterOption =
  | { kind: 'choice'; id: string; label: string; choices: { value: string; label: string }[]; default: string; hint?: string }
  | { kind: 'toggle'; id: string; label: string; default: boolean; hint?: string };

export interface ExportRequest {
  scope: ExportScope;
  /** Frames escolhidos (escopo `frames`), já na ordem de `slideOrder` */
  frameIds: string[];
  options: Record<string, string | boolean>;
}

export interface ExporterDefinition extends RegistryItem {
  label: string;
  description: string;
  group: 'image' | 'document' | 'vector' | 'data' | 'backup';
  /** Extensão do arquivo gerado (sem ponto) */
  extension: string;
  scopes: ExportScope[];
  options?: ExporterOption[];
  /** Executa a exportação. Deve passar por `allowExport()` (permissão + Activity Log). */
  run: (request: ExportRequest) => Promise<void>;
}

export const ExporterRegistry = new Registry<ExporterDefinition>('ExporterRegistry');

/* --------------------------------- Formas ---------------------------------- */

export interface ShapeDefinition extends RegistryItem {
  label: string;
  /** Formas do núcleo apontam para o `ShapeKind` nativo */
  kind?: ShapeKind;
  /** Path SVG no espaço local (0,0) → (w,h) */
  path: (w: number, h: number) => string;
  shortcut?: string;
  /* ---- Chat 06.5 (opcionais): formas de extensão — contorno livre normalizado ---- */
  /** Contorno (só M/L/C/Q/Z absolutos) dentro de `box`; vira `ShapeElement.customPath` */
  customPath?: string;
  /** Traço extra sem preenchimento, no mesmo espaço (vira `ShapeElement.customDecoration`) */
  customDecoration?: string;
  box?: { width: number; height: number };
  /** Margens do texto em fração da caixa */
  textInsets?: { top: number; right: number; bottom: number; left: number };
  defaultSize?: { width: number; height: number };
}

export const ShapeRegistry = new Registry<ShapeDefinition>('ShapeRegistry');

/* ------------------------- Chat 06.5: contribuições declarativas ------------------------- */

/** Tema de extensão (tokens já validados: allowlist + contraste AA). */
export interface ThemeDefinition extends RegistryItem {
  label: string;
  light: Record<string, string>;
  dark: Record<string, string>;
}
export const ThemeRegistry = new Registry<ThemeDefinition>('ThemeRegistry');

/** Pacote de stickers: emoji (vira texto) ou imagem já sanitizada (data URL). */
export interface StickerPackDefinition extends RegistryItem {
  label: string;
  items: Array<{ id: string; label: string; emoji?: string; dataUrl?: string }>;
}
export const StickerRegistry = new Registry<StickerPackDefinition>('StickerRegistry');

/** Paleta extra para post-its, preenchimento ou tinta. */
export interface PaletteDefinition extends RegistryItem {
  label: string;
  target: 'sticky' | 'fill' | 'ink';
  colors: Array<{ hex: string; label: string }>;
}
export const PaletteRegistry = new Registry<PaletteDefinition>('PaletteRegistry');

/** Tipo de elemento composto (peças declarativas, sem JS de render). */
export interface ElementTypeDefinition extends RegistryItem {
  label: string;
  /** id local dentro da extensão */
  typeId: string;
  defaultSize: { width: number; height: number };
  /** Peças com textos já resolvidos no idioma ativo na hora de criar */
  build: () => { parts: import('./types').DeclPart[]; text: string; fields: Record<string, string> };
}
export const ElementTypeRegistry = new Registry<ElementTypeDefinition>('ElementTypeRegistry');

/* -------------------------------- Templates -------------------------------- */

export interface TemplateDefinition extends RegistryItem {
  label: string;
  description: string;
  category: 'brainstorm' | 'planning' | 'diagram' | 'strategy';
  /** Elementos do template (coordenadas livres; quem insere centraliza) */
  build: () => CanvasElement[];
}

export const TemplateRegistry = new Registry<TemplateDefinition>('TemplateRegistry');

/* ------------------------- Chat 06.5 · B: contribuições com código ------------------------- */

/** Comando de extensão no Ctrl+K (o Worker executa; o host só encaminha). */
export interface CommandDefinition extends RegistryItem {
  label: string;
  keywords: string[];
  run: () => void;
}
export const CommandRegistry = new Registry<CommandDefinition>('CommandRegistry');

/** Painel de extensão (iframe isolado) na aba "Extensões" do Painel lateral. */
export interface PanelDefinition extends RegistryItem {
  label: string;
  /** HTML do painel (arquivo `ui/*.html` instalado, conferido pelo pinning) */
  html: string;
}
export const PanelRegistry = new Registry<PanelDefinition>('PanelRegistry');
