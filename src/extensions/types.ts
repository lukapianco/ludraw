/**
 * LuDraw — Contratos da plataforma de extensões (Chat 06.5 · `EXTENSIONS_SPEC.md` §3 e §6).
 *
 * Só tipos (nenhum código de execução), para poderem ser importados pelo validador puro
 * (`schema.ts`), pelo loader, pelo store e — no Chat 07 — pelo servidor.
 *
 * Rodada A entrega o **Nível 1** (`kind: 'pack'`, pacote declarativo, sem código): formas, modelos,
 * temas, stickers, paletas e tipos de elemento compostos. Os pontos de contribuição do Nível 2
 * (`commands`, `panels`, `importers`, `exporters`) e os pacotes de idioma (`locales`) já fazem parte
 * do contrato, mas o validador os recusa nesta versão com mensagem clara.
 */

export type ExtensionKind = 'pack' | 'script';

export type ExtensionPermission =
  | 'board.read'
  | 'board.write'
  | 'ui.command'
  | 'ui.panel'
  | 'clipboard.paste'
  | 'files.import'
  | 'files.export'
  | 'storage'
  | 'network';

/** Textos traduzidos opcionais por código de idioma (ex.: `"en"`). */
export interface LocalizedName {
  name?: string;
  description?: string;
}

export interface ExtensionProvenance {
  /** true = obra própria do autor da extensão */
  originalWork: boolean;
  thirdParty: Array<{ name: string; license: string; url?: string }>;
  /** Formatos proprietários lidos — não permitido no Nível 1 (EXTENSIONS_SPEC §10) */
  proprietaryFormatsRead?: string[];
}

/* -------------------------------- Contribuições -------------------------------- */

export interface ShapeContribution {
  id: string;
  name: string;
  i18n?: Record<string, LocalizedName>;
  /** Caixa de coordenadas do desenho (o path e a decoração vivem dentro dela) */
  viewBox: { width: number; height: number };
  /** Contorno (sintaxe de path SVG). Depois da validação: só M/L/C/Q/Z absolutos. */
  path: string;
  /** Traço extra sem preenchimento (ex.: tampa do cilindro). Mesma regra do `path`. */
  decoration?: string;
  /** Margens do texto em fração da caixa (0–0,45) */
  textInsets?: { top: number; right: number; bottom: number; left: number };
  defaultSize?: { width: number; height: number };
}

export type TemplateCategory = 'brainstorm' | 'planning' | 'diagram' | 'strategy';
export type TemplateLock = 'none' | 'standard' | 'protected';
export type TemplateAnchor = 'top' | 'right' | 'bottom' | 'left' | 'center';

interface TemplateElementBase {
  /** Identificador local (para conectores apontarem para o elemento) */
  ref?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  lock?: TemplateLock;
  /** Estrutura de fundo (`isBackgroundFramework`) */
  background?: boolean;
  /** Chave local de grupo: elementos com a mesma chave viram um grupo (Ctrl+G) */
  group?: string;
}

export type TemplateConnectorEnd = { ref: string; anchor?: TemplateAnchor } | { x: number; y: number } | { elementId: string; anchor?: TemplateAnchor };

/** Elemento de modelo declarativo. Textos podem ser `"{{chave}}"` (tabela `strings`). */
export type TemplateElementInput =
  | (TemplateElementBase & { type: 'sticky'; text?: string; color?: string; fontSize?: number })
  | (TemplateElementBase & {
      type: 'shape';
      /** Forma do núcleo (ex.: "rectangle") */
      shape?: string;
      /** Forma da própria extensão (`contributes.shapes[].id`) */
      shapeRef?: string;
      text?: string;
      fillColor?: string;
      strokeColor?: string;
      strokeWidth?: number;
      textColor?: string;
      fontSize?: number;
    })
  /** `fill` (opcional): fundo do texto — com fundo, a cor do texto não é adaptada ao tema escuro (contraste fixo) */
  | (TemplateElementBase & { type: 'text'; text: string; fontSize?: number; color?: string; fill?: string; align?: 'left' | 'center' | 'right'; bold?: boolean })
  | (TemplateElementBase & { type: 'frame'; title?: string; fillColor?: string })
  | (TemplateElementBase & { type: 'connector'; from: TemplateConnectorEnd; to: TemplateConnectorEnd; route?: 'straight' | 'orthogonal' | 'curved'; label?: string; arrow?: boolean; points?: { x: number; y: number }[] })
  | (TemplateElementBase & { type: 'composite'; typeId: string; text?: string; fields?: Record<string, string> });

export interface TemplateContribution {
  id: string;
  name: string;
  description?: string;
  category: TemplateCategory;
  i18n?: Record<string, LocalizedName>;
  /** Tabela de textos por idioma: um texto igual a `"{{chave}}"` é trocado inteiro pelo valor */
  strings?: Record<string, Record<string, string>>;
  elements: TemplateElementInput[];
}

/** Nome curto de token (sem `--od-`), ex.: `"panel"`, `"text-muted"`. */
export type ThemeTokenMap = Record<string, string>;

export interface ThemeContribution {
  id: string;
  name: string;
  i18n?: Record<string, LocalizedName>;
  light: ThemeTokenMap;
  dark: ThemeTokenMap;
}

export type StickerItem = { id: string; name?: string; i18n?: Record<string, LocalizedName> } & ({ emoji: string; file?: undefined } | { file: string; emoji?: undefined });

export interface StickerPackContribution {
  id: string;
  name: string;
  i18n?: Record<string, LocalizedName>;
  items: StickerItem[];
}

export type PaletteTarget = 'sticky' | 'fill' | 'ink';

export interface PaletteContribution {
  id: string;
  name: string;
  i18n?: Record<string, LocalizedName>;
  target: PaletteTarget;
  colors: Array<{ hex: string; name?: string; i18n?: Record<string, LocalizedName> }>;
}

/* ------------------------- Tipos de elemento compostos ------------------------- */

/** Peça de um elemento composto. Posição/tamanho em fração (0–1) da caixa do elemento. */
interface DeclPartBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type DeclPart =
  | (DeclPartBox & { kind: 'rect'; radius?: number; fill?: string; stroke?: string; strokeWidth?: number; dashed?: boolean })
  | (DeclPartBox & { kind: 'ellipse'; fill?: string; stroke?: string; strokeWidth?: number; dashed?: boolean })
  /** `d` em coordenadas 0–100 dentro da peça (depois da validação: só M/L/C/Q/Z absolutos) */
  | (DeclPartBox & { kind: 'path'; d: string; fill?: string; stroke?: string; strokeWidth?: number })
  | (DeclPartBox & {
      kind: 'text';
      /** `"main"` = texto principal do elemento (editável); outro nome = campo extra */
      slot?: string;
      text?: string;
      fontSize: number;
      bold?: boolean;
      italic?: boolean;
      align?: 'left' | 'center' | 'right';
      valign?: 'top' | 'middle' | 'bottom';
      color?: string;
    })
  | (DeclPartBox & { kind: 'badge'; slot?: string; text?: string; fontSize: number; fill: string; color: string });

export interface DeclarativeElementType {
  id: string;
  name: string;
  i18n?: Record<string, LocalizedName>;
  strings?: Record<string, Record<string, string>>;
  defaultSize: { width: number; height: number };
  parts: DeclPart[];
}

/** Dados do elemento `composite` gravados no board (as peças ficam COPIADAS no elemento). */
export interface CompositeElementData {
  typeRef: { extensionId: string; typeId: string };
  /** Nome do tipo no momento da criação (conteúdo; exibido se a extensão sumir) */
  typeName: string;
  parts: DeclPart[];
  /** Texto principal (peça com `slot: "main"`) */
  text: string;
  /** Outros campos de texto (peças com `slot` ≠ "main") */
  fields?: Record<string, string>;
}

/* ----------------------- Contribuições do Nível 2 (contrato) ----------------------- */

/** Item no Ctrl+K (exige `ui.command`); o script liga a ação com `ludraw.ui.registerCommand`. */
export interface CommandContribution {
  id: string;
  title: string;
  i18n?: Record<string, LocalizedName>;
  keywords?: string[];
}
/** Painel na aba "Extensões" do Painel lateral (exige `ui.panel` + `ui`). */
export interface PanelContribution {
  id: string;
  title: string;
  i18n?: Record<string, LocalizedName>;
}
/** Formato de arquivo novo (exige `files.import`); extensões sem ponto, minúsculas. */
export interface ImporterContribution {
  id: string;
  label: string;
  description?: string;
  i18n?: Record<string, LocalizedName>;
  extensions: string[];
}
/** Exportação nova (exige `files.export`); passa por `allowExport()`. */
export interface ExporterContribution {
  id: string;
  label: string;
  description?: string;
  i18n?: Record<string, LocalizedName>;
  extension: string;
}
export interface LocalePackContribution {
  code: string;
  name: string;
  nativeName: string;
  dir: 'ltr' | 'rtl';
  files: Record<string, string>;
}

export interface ExtensionContributions {
  shapes?: ShapeContribution[];
  templates?: TemplateContribution[];
  themes?: ThemeContribution[];
  stickers?: StickerPackContribution[];
  palettes?: PaletteContribution[];
  elementTypes?: DeclarativeElementType[];
  /* Nível 2 / versões futuras — recusados na Rodada A */
  commands?: CommandContribution[];
  panels?: PanelContribution[];
  importers?: ImporterContribution[];
  exporters?: ExporterContribution[];
  locales?: LocalePackContribution[];
}

export interface ExtensionManifest {
  apiVersion: 1;
  /** reverse-dns minúsculo: "dev.luka.tema-grafite" */
  id: string;
  name: string;
  /** semver */
  version: string;
  publisher: string;
  description?: string;
  i18n?: Record<string, LocalizedName>;
  /** SPDX permitido por CLEAN_ROOM.md §5 */
  license: string;
  kind: ExtensionKind;
  permissions: ExtensionPermission[];
  networkAllowlist?: string[];
  provenance: ExtensionProvenance;
  main?: string;
  ui?: string;
  contributes?: ExtensionContributions;
  /** sha256 (hex) por arquivo, opcional; se presente, precisa bater */
  integrity?: { files: Record<string, string> };
}

/* ------------------------- API `ludraw.*` v1 (EXTENSIONS_SPEC §6) ------------------------- */

/**
 * Cópia SOMENTE-LEITURA de um elemento entregue à extensão (nunca referência ao store). Notas privadas
 * ocultas pelo Modo Privado chegam sem texto (`hidden: true`); conteúdo oculto por frame e comentários
 * não são entregues.
 */
export interface ElementSnapshot {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  parentId: string | null;
  locked: boolean;
  text?: string;
  title?: string;
  label?: string;
  color?: string;
  fillColor?: string;
  strokeColor?: string;
  textColor?: string;
  shapeKind?: string;
  tags?: string[];
  /** conectores: ids das pontas (null = ponta solta) */
  from?: string | null;
  to?: string | null;
  /** nota privada de outra pessoa, oculta pelo Modo Privado */
  hidden?: boolean;
}

/** Alteração permitida por `ludraw.board.updateElements` (allowlist de campos). */
export interface ElementPatchInput {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  text?: string;
  title?: string;
  label?: string;
  color?: string;
  fillColor?: string;
  strokeColor?: string;
  textColor?: string;
}

export interface ChangeSummary {
  added: string[];
  updated: string[];
  removed: string[];
}

/* -------------------------------- Instalação -------------------------------- */

export type ExtensionSource = 'builtin' | 'file' | 'folder';

/**
 * Registro gravado no IndexedDB na instalação (EXTENSIONS_SPEC §5.7). Os hashes são conferidos a
 * cada carregamento contra ESTE registro (não contra o manifest).
 *
 * Limite honesto: o registro e os arquivos ficam no mesmo IndexedDB — o pinning protege contra
 * corrupção e alteração acidental, não contra quem consegue alterar os dois. O `publisher` é
 * declarado pelo autor (sem assinatura). A defesa real é comparar o hash exibido com o do autor.
 */
export interface ExtensionRecord {
  id: string;
  name: string;
  version: string;
  publisher: string;
  kind: ExtensionKind;
  source: ExtensionSource;
  /** Instalada de pasta local (modo desenvolvimento) */
  dev: boolean;
  /** sha256 do pacote (ZIP inteiro; pasta = hash da lista ordenada `caminho:hash`) */
  packageHash: string;
  fileHashes: Record<string, string>;
  approvedPermissions: ExtensionPermission[];
  installedAt: number;
  updatedAt: number;
  /** userId de quem instalou/atualizou */
  installedBy: string;
  enabled: boolean;
}

/** Estado de uma extensão conhecida pelo app. */
export type ExtensionStatus =
  /** íntegra e válida */
  | 'ok'
  /** arquivo alterado/faltando depois da instalação → desativada */
  | 'tampered'
  /** o manifest instalado não passa mais no validador → desativada */
  | 'invalid';

/** Chat 06.5 · B: estado do Worker de uma extensão programável nesta sessão. */
export type RuntimeState = 'stopped' | 'starting' | 'running' | 'killed';
