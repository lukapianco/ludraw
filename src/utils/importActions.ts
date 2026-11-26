/**
 * LuDraw — Inserção de conteúdo importado (Chat 05): colar, arrastar-e-soltar e "Importar
 * arquivo". É a ÚNICA ponte entre os importadores (`ImporterRegistry`) e o store:
 *
 * - permissão: `ensure('board.edit')` antes de qualquer coisa (visitante leitor recebe o motivo);
 * - posição: centro da viewport (ou do ponteiro) num espaço livre, sem cobrir o que já existe;
 * - desfazer: tudo entra num único `addElements` → um passo de desfazer;
 * - auditoria: `recordActivity('imported', …)` com o nome do arquivo/formato e a contagem;
 * - Modo Privado: post-its novos entram como rascunhos privados (o próprio `addElements` marca).
 */

import { runAsExtension } from '../store/useBoardStore';
import { create } from 'zustand';
import type { CanvasElement } from '../types/canvas';
import { importAcceptAttribute, importerForFile, type ImportPayload } from '../extensions/registries';
import { ensureCoreContributions } from '../extensions/core';
import { useAppStore } from '../store/useAppStore';
import { useBoardStore } from '../store/useBoardStore';
import { defaultWorldSize, insertImageFiles, viewportCenterWorld } from './boardActions';
import { encodedHelp, encodedWarning, elementsFromPlainText, planPaste, snapshotFromClipboardApi, type ClipboardSnapshot, type PastePlan } from './clipboard';
import { cloneElements } from './factory';
import { getBoundsOfElements, getElementBounds, getViewportWorldRect, rectCenter, rectsIntersect, type Point, type Rect } from './math';
import type { SheetWorkbook } from './sheets';
import { t, translateMessage, translateStored } from '../i18n';
import { api, ApiError } from './api';
import { downloadExternalImage, imageUrlFromText } from './externalImage';
import { isExternalImageSrc, stripUnsafeContent } from './contentSafety';
import { compressImageFile } from './images';
import type { StoredMessage } from '../i18n/types';

const app = () => useAppStore.getState();
const board = () => useBoardStore.getState();

/** Estado efêmero do fluxo de importação (fora do histórico; zerado ao trocar de board). */
interface ImportUiState {
  workbook: SheetWorkbook | null;
  /** Onde inserir (ponteiro na hora de colar/soltar); `null` = centro da tela */
  at: Point | null;
  /** Última colagem levada ao Inspetor */
  snapshot: ClipboardSnapshot | null;
  plan: PastePlan | null;
}

export const useImportUi = create<ImportUiState>(() => ({ workbook: null, at: null, snapshot: null, plan: null }));

export function resetImportUi(): void {
  useImportUi.setState({ workbook: null, at: null, snapshot: null, plan: null });
}

/** Escala de criação proporcional ao zoom (o conteúdo nasce legível). */
export function importUnit(): number {
  return defaultWorldSize(200) / 200;
}

/** Pode importar agora? (mostra o motivo quando não pode) */
export function canImport(): boolean {
  const s = board();
  if (s.readOnly) return false;
  return s.ensure('board.edit');
}

/**
 * Deslocamento que leva `bounds` para perto de `center` sem cobrir objetos existentes:
 * tenta o centro e depois anéis ao redor (8 direções por anel). Sem espaço livre → centro.
 */
export function freeSpotOffset(bounds: Rect, center: Point): Point {
  const s = board();
  const obstacles = s.elementOrder
    .map((id) => s.elements[id])
    .filter((el): el is CanvasElement => !!el && el.type !== 'comment' && el.type !== 'connector')
    .map((el) => getElementBounds(el));
  const margin = 24 * importUnit();
  const fits = (dx: number, dy: number) => {
    const r = { x: bounds.x + dx - margin, y: bounds.y + dy - margin, width: bounds.width + margin * 2, height: bounds.height + margin * 2 };
    return !obstacles.some((o) => rectsIntersect(o, r));
  };
  const c = rectCenter(bounds);
  const base = { x: center.x - c.x, y: center.y - c.y };
  if (fits(base.x, base.y)) return base;
  const step = Math.max(bounds.width, bounds.height) * 0.35 + 60 * importUnit();
  const dirs = [
    [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1],
  ];
  for (let ring = 1; ring <= 24; ring++) {
    for (const [ux, uy] of dirs) {
      const dx = base.x + ux * step * ring;
      const dy = base.y + uy * step * ring;
      if (fits(dx, dy)) return { x: dx, y: dy };
    }
  }
  return base;
}

export interface InsertImportedOptions {
  /** O que foi importado, para o Activity Log ("Fulano importou …") — mensagem, traduzida na tela */
  activity: StoredMessage;
  /** Toast de sucesso */
  summary: string;
  warnings?: string[];
  at?: Point | null;
}

/** Insere elementos importados (novos ids, posição livre, 1 passo de desfazer, Activity Log). */
export function insertImported(input: CanvasElement[], options: InsertImportedOptions): string[] {
  // Chat 08.7 · R4 (S-30/S-31): imagem de fora do board, link inseguro e cor com url(…) não entram (o servidor recusaria)
  const safe = stripUnsafeContent({ elements: Object.fromEntries(input.map((e) => [e.id, e])) });
  const elements = input.filter((e) => safe.data.elements[e.id]).map((e) => safe.data.elements[e.id]);
  const cleaned = safe.images + safe.links + safe.styles;
  if (cleaned) options = { ...options, warnings: [t('importexport.safety.removed', { count: cleaned }), ...(options.warnings ?? [])] };
  if (!elements.length) {
    if (cleaned) app().toast(t('importexport.safety.removed', { count: cleaned }), 'danger');
    return [];
  }
  if (!canImport()) return [];
  const bounds = getBoundsOfElements(elements);
  if (!bounds) return [];
  const target = options.at ?? viewportCenterWorld();
  const offset = freeSpotOffset(bounds, target);
  const clones = cloneElements(elements, offset);
  board().addElements(clones, { select: true });
  const ids = clones.map((c) => c.id).filter((id) => !!board().elements[id]);
  if (!ids.length) return [];
  board().recordActivity('imported', { key: 'board.activity.imported', params: { what: options.activity } }, { targetType: 'board', targetCount: ids.length, elementIds: ids.slice(0, 20) });
  board().setActiveTool('select');
  // traz o conteúdo para a tela se ele ficou fora da área visível
  const view = getViewportWorldRect(board().camera, board().viewport);
  const placed = getBoundsOfElements(ids.map((id) => board().elements[id]).filter(Boolean));
  if (placed && (placed.x < view.x || placed.y < view.y || placed.x + placed.width > view.x + view.width || placed.y + placed.height > view.y + view.height)) board().zoomToFit(ids);
  const warn = options.warnings?.length ? ` · ${options.warnings[0]}` : '';
  app().toast(`${options.summary}${warn}`, 'success');
  return ids;
}

/** Abre o modal "Importar planilha" com o livro lido. */
export function openWorkbook(workbook: SheetWorkbook, at: Point | null = null): void {
  if (!canImport()) return;
  useImportUi.setState({ workbook, at });
  app().openModal({ type: 'import-sheet' });
}

/** Aplica o resultado de um importador. */
export async function applyImportPayload(payload: ImportPayload, at: Point | null, source: string | StoredMessage): Promise<void> {
  if (payload.kind === 'workbook') return openWorkbook(payload.workbook, at);
  if (payload.kind === 'images') {
    await insertImageFiles(payload.files, at);
    return;
  }
  const insert = () => insertImported(payload.elements, { activity: { key: 'board.activity.importedFrom', params: { label: payload.labelMessage ?? payload.label, source } }, summary: `${payload.label}: ${payload.summary}`, warnings: payload.warnings, at });
  // Chat 06.5 · B: importação feita por extensão — mesmo caminho (1 passo de desfazer), com `viaExtension`
  if (payload.viaExtension) runAsExtension(payload.viaExtension, insert);
  else insert();
}

/** Importa arquivos (menu, arrastar-e-soltar ou arquivos colados). */
export async function importFiles(files: File[], at: Point | null = null): Promise<void> {
  ensureCoreContributions();
  if (!files.length || !canImport()) return;
  const images: File[] = [];
  const queue: File[] = [];
  for (const f of files) {
    const imp = importerForFile(f);
    if (imp?.id === 'image') images.push(f);
    else queue.push(f);
  }
  if (images.length) await insertImageFiles(images, at);
  let openedWorkbook = false;
  for (const file of queue) {
    const imp = importerForFile(file);
    if (!imp?.readFile) {
      app().toast(t('importexport.importActions.unsupportedFormatNameAcceptedFormats', { name: file.name, replace: importAcceptAttribute().replace(/,/g, ' ') }), 'danger');
      continue;
    }
    try {
      const payload = await imp.readFile(file);
      if (payload.kind === 'workbook') {
        if (openedWorkbook) {
          app().toast(t('importexport.importActions.oneSpreadsheetTimeNameWas', { name: file.name }));
          continue;
        }
        openedWorkbook = true;
      }
      await applyImportPayload(payload, at, file.name);
    } catch (err) {
      app().toast(t('importexport.importActions.couldntImportNameMessage', { name: file.name, message: (err as Error).message }), 'danger');
    }
  }
}

/** Seletor de arquivos com todos os formatos registrados. */
export function pickAndImportFiles(): void {
  ensureCoreContributions();
  if (!canImport()) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = importAcceptAttribute();
  input.onchange = () => {
    const files = Array.from(input.files ?? []);
    if (files.length) void importFiles(files);
  };
  input.click();
}

/** Leva a colagem ao Inspetor (modal Importar → Inspetor). */
export function openInspector(snapshot: ClipboardSnapshot | null, plan: PastePlan | null = null, at: Point | null = null): void {
  useImportUi.setState({ snapshot, plan, at });
  app().openModal({ type: 'export-import', tab: 'inspect' });
}

/** Executa um plano de colagem já calculado. */
export async function runPastePlan(plan: PastePlan, snapshot: ClipboardSnapshot, at: Point | null): Promise<void> {
  switch (plan.kind) {
    case 'internal':
      board().pasteFromClipboardText(plan.text, at);
      return;
    case 'files':
      await importFiles(plan.files, at);
      return;
    case 'payload':
      if (!canImport()) return;
      await applyImportPayload(plan.payload, at, { key: plan.importerId === 'text' ? 'board.activity.source.pastedText' : 'board.activity.source.paste' });
      return;
    case 'unsupported':
      openInspector(snapshot, plan, at);
      return;
    case 'encoded': {
      // Chat 05: texto longo com cara de dado codificado — não insere sem confirmação
      if (!canImport()) return;
      const text = plan.text;
      app().toast(t('importexport.encoded.warningSentence', { warning: encodedWarning() }), 'neutral', {
        detail: encodedHelp(),
        action: { label: t('importexport.importActions.insertAnyway'), run: () => pasteSnapshotAsText(text, at) },
      });
      return;
    }
  }
}

/** `Ctrl+V` no board: decide e insere (objetos do LuDraw, arquivos, formatos abertos, texto, imagem). */
export async function handlePasteSnapshot(snapshot: ClipboardSnapshot, at: Point | null): Promise<void> {
  ensureCoreContributions();
  const s = board();
  if (s.readOnly) return;
  // nada na área de transferência do sistema: usa a cópia interna (Chat 01)
  if (!snapshot.types.length && !snapshot.files.length) {
    if (s.clipboard?.length) s.pasteElements(s.clipboard, at);
    return;
  }
  // Chat 08.7 · R4 (S-30): endereço de imagem colado → oferece "Baixar para o board" (o board não guarda URL externa)
  const imageUrl = !snapshot.files.length && !snapshot.html ? imageUrlFromText(snapshot.text) : null;
  if (imageUrl && canImport()) {
    offerExternalImageDownload(imageUrl, at);
    return;
  }
  const plan = await planPaste(snapshot);
  await runPastePlan(plan, snapshot, at);
}

/**
 * Chat 09 · R2 (pendência 6, D6): com a CSP do app (`connect-src 'self'`) o navegador não busca imagens de outros
 * sites. No Modo Servidor quem baixa é o SERVIDOR (guarda de SSRF, DNS fixado, redirecionamento revalidado). No Modo
 * Local não há quem busque: o aviso orienta salvar a imagem e arrastar o arquivo.
 */
const remoteImageBoard = (): string | null => (api ? board().boardId : null);

/** Aviso com a ação "Baixar para o board" (só baixa se a pessoa pedir). */
export function offerExternalImageDownload(url: string, at: Point | null): void {
  if (!remoteImageBoard()) {
    app().toast(t('importexport.safety.urlImageTitle'), 'neutral', { detail: t('importexport.safety.urlImageLocal') });
    return;
  }
  app().toast(t('importexport.safety.urlImageTitle'), 'neutral', {
    detail: t('importexport.safety.urlImageBody'),
    action: { label: t('importexport.safety.urlImageDownload'), run: () => void downloadImageToBoard(url, at) },
  });
}

/** O servidor baixa a imagem; aqui a mesma conferência do arquivo (tamanho e bytes). Erro já vira aviso na tela. */
async function fileViaServer(url: string): Promise<File | null> {
  const boardId = remoteImageBoard();
  if (!api || !boardId) {
    app().toast(t('importexport.safety.urlImageLocal'), 'neutral');
    return null;
  }
  let r: Awaited<ReturnType<typeof downloadExternalImage>>;
  try {
    const blob = await api.fetchRemoteImage(boardId, url);
    r = await downloadExternalImage(url, async () => new Response(blob, { status: 200 }));
  } catch (err) {
    app().toast(err instanceof ApiError ? translateStored(err.storedMessage) : t('importexport.safety.urlImageFailed'), 'danger');
    return null;
  }
  if (!r.ok) {
    app().toast(translateMessage(r.reason), 'danger');
    return null;
  }
  return r.file;
}

/** Baixa a imagem PELO SERVIDOR (até 12 MB, tipo conferido pelos bytes aqui e lá) e insere como arquivo. */
export async function downloadImageToBoard(url: string, at: Point | null): Promise<string[]> {
  if (!canImport()) return [];
  const file = await fileViaServer(url);
  return file ? insertImageFiles([file], at) : [];
}

/**
 * Chat 09 · R2 (decisão do usuário: o botão "Carregar imagem externa" do S-30 vira "Baixar para o board"): a imagem de
 * um elemento ANTIGO que aponta para outro site é baixada pelo servidor e passa a morar no board (mesmo elemento, mesmo
 * tamanho na tela; no Modo Servidor vira `asset:` pelo caminho normal). Só para quem pode editar.
 */
export async function downloadExternalImageInto(elementId: string): Promise<boolean> {
  const el = board().elements[elementId];
  if (!el || el.type !== 'image' || !isExternalImageSrc(el.dataUrl)) return false;
  if (board().readOnly || !board().ensure('board.edit')) return false;
  const file = await fileViaServer(el.dataUrl);
  if (!file) return false;
  let img: Awaited<ReturnType<typeof compressImageFile>>;
  try {
    img = await compressImageFile(file);
  } catch {
    app().toast(t('importexport.safety.urlImageFailed'), 'danger');
    return false;
  }
  if (board().elements[elementId]?.type !== 'image') return false; // apagado enquanto baixava
  board().updateElement(elementId, { dataUrl: img.dataUrl, naturalWidth: img.width, naturalHeight: img.height });
  return true;
}

/** "Colar" do menu (API assíncrona do navegador, só tipos padrão). */
export async function pasteFromSystemClipboard(at?: Point | null): Promise<void> {
  const target = at ?? board().lastPointerWorld ?? viewportCenterWorld();
  const snap = await snapshotFromClipboardApi();
  if (!snap) {
    const internal = board().clipboard;
    if (internal?.length) board().pasteElements(internal, target);
    else app().toast(t('importexport.importActions.theBrowserDidntReleaseClipboard'), 'danger');
    return;
  }
  await handlePasteSnapshot(snap, target);
}

/** "Colar como texto" (Inspetor / conteúdo não suportado). */
export function pasteSnapshotAsText(text: string, at: Point | null = null): void {
  const built = elementsFromPlainText(text, importUnit());
  if (!built) {
    app().toast(t('importexport.importActions.theresNoTextThisPaste'), 'danger');
    return;
  }
  insertImported(built.elements, { activity: { key: 'board.activity.source.pastedTextWhat' }, summary: t('importexport.importActions.pastedAsTextSummary', { summary: built.summary }), at });
}

/** "Colar como imagem" (Inspetor / conteúdo não suportado). */
export async function pasteSnapshotAsImage(images: File[], at: Point | null = null): Promise<void> {
  if (!images.length) {
    app().toast(t('importexport.importActions.theresNoImageThisPaste'), 'danger');
    return;
  }
  if (!canImport()) return;
  await insertImageFiles(images, at);
}
