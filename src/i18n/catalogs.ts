/**
 * LuDraw i18n — catálogos embutidos (Chat 05.6 · I18N_SPEC §2).
 *
 * - **pt-BR é a fonte**: o tipo `Catalog` nasce destes JSON, então uma chave nova só existe
 *   depois de entrar em `src/locales/pt-BR/<namespace>.json`.
 * - **en é declarado como `Catalog`**: se faltar qualquer chave do pt-BR, o `tsc` falha.
 * - **Outros idiomas** entram só com JSON (`src/locales/<código>/*.json` + `_meta.json`) e são
 *   descobertos pelo Vite em tempo de build (`import.meta.glob`), sem tocar neste arquivo.
 */
import ptMeta from '../locales/pt-BR/_meta.json';
import ptCommon from '../locales/pt-BR/common.json';
import ptAuth from '../locales/pt-BR/auth.json';
import ptDashboard from '../locales/pt-BR/dashboard.json';
import ptSettings from '../locales/pt-BR/settings.json';
import ptBoard from '../locales/pt-BR/board.json';
import ptMenus from '../locales/pt-BR/menus.json';
import ptModals from '../locales/pt-BR/modals.json';
import ptImportExport from '../locales/pt-BR/importexport.json';
import ptPermissions from '../locales/pt-BR/permissions.json';
import ptWidgets from '../locales/pt-BR/widgets.json';
import ptTemplates from '../locales/pt-BR/templates.json';
import ptWorkspace from '../locales/pt-BR/workspace.json';
import ptAdmin from '../locales/pt-BR/admin.json';
import ptShare from '../locales/pt-BR/share.json';
import ptHistory from '../locales/pt-BR/history.json';
import ptExtensions from '../locales/pt-BR/extensions.json';
import ptCollab from '../locales/pt-BR/collab.json';
import ptStudio from '../locales/pt-BR/studio.json';
import ptServer from '../locales/pt-BR/server.json';
import ptDesktop from '../locales/pt-BR/desktop.json';

import enMeta from '../locales/en/_meta.json';
import enCommon from '../locales/en/common.json';
import enAuth from '../locales/en/auth.json';
import enDashboard from '../locales/en/dashboard.json';
import enSettings from '../locales/en/settings.json';
import enBoard from '../locales/en/board.json';
import enMenus from '../locales/en/menus.json';
import enModals from '../locales/en/modals.json';
import enImportExport from '../locales/en/importexport.json';
import enPermissions from '../locales/en/permissions.json';
import enWidgets from '../locales/en/widgets.json';
import enTemplates from '../locales/en/templates.json';
import enWorkspace from '../locales/en/workspace.json';
import enAdmin from '../locales/en/admin.json';
import enShare from '../locales/en/share.json';
import enHistory from '../locales/en/history.json';
import enExtensions from '../locales/en/extensions.json';
import enCollab from '../locales/en/collab.json';
import enStudio from '../locales/en/studio.json';
import enServer from '../locales/en/server.json';
import enDesktop from '../locales/en/desktop.json';

import type { LocaleMeta } from './types';

/** Catálogo-fonte (pt-BR): namespace → { chave: mensagem }. */
export const PT_BR = {
  common: ptCommon,
  auth: ptAuth,
  dashboard: ptDashboard,
  settings: ptSettings,
  board: ptBoard,
  menus: ptMenus,
  modals: ptModals,
  importexport: ptImportExport,
  permissions: ptPermissions,
  widgets: ptWidgets,
  templates: ptTemplates,
  workspace: ptWorkspace,
  admin: ptAdmin,
  share: ptShare,
  history: ptHistory,
  extensions: ptExtensions,
  collab: ptCollab,
  studio: ptStudio,
  server: ptServer,
  desktop: ptDesktop,
};

/** Formato de todo catálogo completo — derivado do pt-BR. */
export type Catalog = typeof PT_BR;
export type Namespace = keyof Catalog;

/** Inglês oficial: mesmo tipo do pt-BR (chave faltando = erro de compilação). */
export const EN: Catalog = {
  common: enCommon,
  auth: enAuth,
  dashboard: enDashboard,
  settings: enSettings,
  board: enBoard,
  menus: enMenus,
  modals: enModals,
  importexport: enImportExport,
  permissions: enPermissions,
  widgets: enWidgets,
  templates: enTemplates,
  workspace: enWorkspace,
  admin: enAdmin,
  share: enShare,
  history: enHistory,
  extensions: enExtensions,
  collab: enCollab,
  studio: enStudio,
  server: enServer,
  desktop: enDesktop,
};

/** Catálogo parcial de um idioma da comunidade (chaves ausentes caem no fallback). */
export type PartialCatalog = { [NS in Namespace]?: Partial<Record<string, string>> };

export interface LocaleBundle {
  meta: LocaleMeta;
  messages: PartialCatalog;
}

export const BUILT_IN_LOCALES: LocaleBundle[] = [
  { meta: ptMeta as LocaleMeta, messages: PT_BR },
  { meta: enMeta as LocaleMeta, messages: EN },
];

/**
 * Idiomas da comunidade: qualquer pasta `src/locales/<código>/` com `_meta.json` e arquivos de
 * namespace. Lidos no build; pt-BR e en já vêm acima.
 */
function communityLocales(): LocaleBundle[] {
  const glob = (import.meta as unknown as { glob?: (p: string, o: { eager: true; import: 'default' }) => Record<string, unknown> }).glob;
  if (typeof glob !== 'function') return [];
  const files = glob('../locales/*/*.json', { eager: true, import: 'default' });
  const byCode = new Map<string, { meta?: LocaleMeta; messages: PartialCatalog }>();
  for (const [path, data] of Object.entries(files)) {
    const match = /locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
    if (!match) continue;
    const [, folder, file] = match;
    if (folder === 'pt-BR' || folder === 'en') continue;
    const entry = byCode.get(folder) ?? { messages: {} };
    if (file === '_meta') entry.meta = data as LocaleMeta;
    else if (data && typeof data === 'object') (entry.messages as Record<string, unknown>)[file] = data;
    byCode.set(folder, entry);
  }
  const out: LocaleBundle[] = [];
  for (const [folder, entry] of byCode) {
    if (!entry.meta) continue; // sem _meta.json o idioma não é oferecido
    out.push({ meta: { ...entry.meta, code: entry.meta.code || folder }, messages: entry.messages });
  }
  return out;
}

export const ALL_LOCALES: LocaleBundle[] = [...BUILT_IN_LOCALES, ...communityLocales()];
