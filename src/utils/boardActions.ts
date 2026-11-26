/**
 * LuDraw — Ações de alto nível do board (usadas por toolbars, menus e atalhos).
 * Centralizar aqui evita duplicar lógica entre TopBar, menu de contexto e teclado.
 */

import type { AnchorSide, CanvasElement, ShapeElement, ShapeKind } from '../types/canvas';
import { isTextualElement } from '../types/canvas';
import { computeRoute, createConnector, getAnchorPoint, isConnectable, OPPOSITE } from './connectors';
import { useAppStore } from '../store/useAppStore';
import { useBoardStore } from '../store/useBoardStore';
import { cloneElements, createComposite, createFrame, createImage, createShape, createStickyNote, createText } from './factory';
import { ElementTypeRegistry, ShapeRegistry } from '../extensions/registries';
import { frameChildren, frameRatioInfo, isFrame, isHiddenByFrame, nextSlideOrder, orderedFrames, type FrameRatio } from './frames';
import { compressImageFile, isImageFile } from './images';
import { clamp, expandRect, getBoundsOfElements, getElementBounds, getViewportWorldRect, rectCenter, rectsIntersect, screenToWorld, type Point, type Rect } from './math';
import {
  copyElementsAsImage,
  createBackupFile,
  downloadBackup,
  exportElementsAsPDF,
  exportElementsAsPNG,
  exportElementsAsSVG,
  exportElementsToCSV,
  generateThumbnail,
  pickFile,
  readBackupFile,
} from './export';
import { createBrainwritingPreset, createDemoElements, createFlowchartPreset, createStickyGrid } from './demo';
import { saveBoardData } from './storage';
import { t } from '../i18n';
import type { StoredMessage } from '../i18n/types';
import { DEFAULT_AUTHOR_NAME } from './storedNames';
import { trackSave } from './pendingSaves';

const app = () => useAppStore.getState();
const board = () => useBoardStore.getState();

export function currentBoardMeta() {
  const id = board().boardId;
  return app().boards.find((b) => b.id === id) ?? null;
}

export function orderedElements(ids?: string[]): CanvasElement[] {
  const s = board();
  const set = ids ? new Set(ids) : null;
  return s.elementOrder.filter((id) => !set || set.has(id)).map((id) => s.elements[id]).filter(Boolean);
}

/** Tamanho padrão de criação: ~200px na TELA, independente do zoom (o objeto nasce legível em qualquer zoom). */
export function defaultWorldSize(base = 200): number {
  const zoom = board().camera.zoom;
  return clamp(base / zoom, base * 0.25, base * 40);
}

export function viewportCenterWorld(): Point {
  const s = board();
  return rectCenter(getViewportWorldRect(s.camera, s.viewport));
}

/* ---------------------------------- Criação --------------------------------- */

export function createStickyAt(center: Point, options?: { color?: string; edit?: boolean }): string {
  const size = defaultWorldSize(200);
  const el = createStickyNote({
    x: center.x - size / 2,
    y: center.y - size / 2,
    width: size,
    height: size,
    color: options?.color ?? board().toolOptions.stickyColor,
  });
  board().addElements([el], { select: true });
  if (options?.edit !== false) board().setEditingId(el.id);
  return el.id;
}

export function createTextAt(topLeft: Point, edit = true): string {
  const zoom = board().camera.zoom;
  const fontSize = clamp(Math.round(24 / zoom), 6, 960);
  const el = createText({ x: topLeft.x, y: topLeft.y - fontSize * 0.7, width: fontSize * 12, fontSize, text: '' });
  board().addElements([el], { select: true });
  if (edit) board().setEditingId(el.id);
  return el.id;
}

/**
 * Chat 06.5: campos de uma forma de EXTENSÃO (ShapeRegistry) para `createShape`. O desenho fica
 * copiado no elemento (`customPath`/`customDecoration`): o board continua igual mesmo se a extensão
 * for desligada ou removida. Id inexistente/do núcleo → null (forma nativa).
 */
export function extensionShapeFields(shapeId: string | undefined): Partial<ShapeElement> | null {
  const def = shapeId ? ShapeRegistry.get(shapeId) : undefined;
  if (!def || def.source !== 'extension' || !def.customPath || !def.box || !def.extensionId) return null;
  const fields: Partial<ShapeElement> = {
    customPath: def.customPath,
    customPathBox: { ...def.box },
    shapeRef: { extensionId: def.extensionId, shapeId: def.id, name: def.label },
  };
  if (def.customDecoration) fields.customDecoration = def.customDecoration;
  if (def.textInsets) fields.customTextInsets = { ...def.textInsets };
  return fields;
}

export function createShapeAt(kind: ShapeKind, center: Point, shapeId?: string): string {
  const ext = extensionShapeFields(shapeId);
  const def = shapeId ? ShapeRegistry.get(shapeId) : undefined;
  const w = ext && def?.defaultSize ? defaultWorldSize(def.defaultSize.width) : defaultWorldSize(180);
  const h = ext && def?.defaultSize ? defaultWorldSize(def.defaultSize.height) : defaultWorldSize(180);
  const zoom = board().camera.zoom;
  const el = createShape(kind, {
    x: center.x - w / 2,
    y: center.y - h / 2,
    width: w,
    height: h,
    fontSize: clamp(Math.round(16 / zoom), 6, 640),
    strokeWidth: clamp(2 / zoom, 1, 40),
    ...(ext ?? {}),
  });
  board().addElements([el], { select: true });
  return el.id;
}

/**
 * Chat 06.5: insere um elemento COMPOSTO de extensão (ElementTypeRegistry) no centro da tela.
 * Passa por `addElements` (ensure('board.edit') + recordActivity), um passo de desfazer.
 */
export function insertCompositeElement(typeKey: string, at?: Point): string | null {
  const def = ElementTypeRegistry.get(typeKey);
  if (!def || !def.extensionId) return null;
  const center = at ?? viewportCenterWorld();
  const w = defaultWorldSize(def.defaultSize.width);
  const h = defaultWorldSize(def.defaultSize.height);
  const built = def.build();
  const el = createComposite(
    { typeRef: { extensionId: def.extensionId, typeId: def.typeId }, typeName: def.label, parts: built.parts, text: built.text, fields: built.fields },
    { x: center.x - w / 2, y: center.y - h / 2, width: w, height: h },
  );
  board().addElements([el], { select: true });
  board().setActiveTool('select');
  return board().elements[el.id] ? el.id : null;
}

export type QuickPreset = 'sticky-block' | 'flowchart' | 'brainwriting' | 'demo';

/** Insere um preset centralizado na viewport (escala com o zoom atual). */
export function insertPreset(preset: QuickPreset, options?: { stickyColor?: string }): void {
  const center = viewportCenterWorld();
  let els: CanvasElement[] = [];
  // Chat 08.2 · C-1: "Em bloco (grade)" na bandeja do Post-it usa a cor escolhida; sem cor, a grade colorida de sempre
  if (preset === 'sticky-block') els = options?.stickyColor ? createStickyGrid({ x: 0, y: 0 }, 3, 3, 180, 20, [options.stickyColor]) : createStickyGrid({ x: 0, y: 0 }, 3, 3);
  if (preset === 'flowchart') els = createFlowchartPreset({ x: 0, y: 0 });
  if (preset === 'brainwriting') els = createBrainwritingPreset({ x: 0, y: 0 });
  if (preset === 'demo') els = createDemoElements();
  const b = getBoundsOfElements(els);
  if (!b) return;
  const c = rectCenter(b);
  const shifted = els.map((el) => ({ ...el, x: el.x - c.x + center.x, y: el.y - c.y + center.y }) as CanvasElement);
  board().addElements(shifted, { select: true });
  board().setActiveTool('select');
  board().zoomToFit(shifted.map((e) => e.id));
}

/* ----------------------------- Clipboard interno ---------------------------- */

export async function copySelection(cut = false): Promise<void> {
  const payload = cut ? board().cutSelected() : board().copySelected();
  if (!payload) return;
  try {
    await navigator.clipboard?.writeText(payload);
  } catch {
    /* Sem permissão: o clipboard interno da store continua funcionando */
  }
  app().toast(cut ? t('board.boardActions.cut') : t('board.boardActions.copied'), 'success');
}

/** Legado (Chat 01/02). Desde o Chat 05 o `Ctrl+V` e o menu "Colar" usam `utils/importActions.ts` (colagem genérica). */
export async function pasteClipboard(at?: Point | null): Promise<void> {
  const target = at ?? board().lastPointerWorld ?? viewportCenterWorld();
  try {
    const text = await navigator.clipboard?.readText();
    if (text && board().pasteFromClipboardText(text, target)) return;
    if (text && text.trim() && !text.startsWith('ludraw/')) {
      pastePlainText(text, target);
      return;
    }
    // Sem texto: tenta imagens da área de transferência (Chat 02)
    if (!text?.trim() && navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) {
          const blob = await item.getType(type);
          files.push(new File([blob], `imagem.${type.split('/')[1] ?? 'png'}`, { type }));
        }
      }
      if (files.length) {
        await insertImageFiles(files, target);
        return;
      }
    }
  } catch {
    /* leitura negada: cai para o clipboard interno */
  }
  const internal = board().clipboard;
  if (internal && internal.length) board().pasteElements(internal, target);
}

/** Texto comum colado vira post-it (curto) ou texto (longo). */
export function pastePlainText(text: string, at: Point): void {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (!clean) return;
  if (clean.length <= 140 && clean.split('\n').length <= 4) {
    const id = createStickyAt(at, { edit: false });
    board().updateElement(id, { text: clean });
  } else {
    const id = createTextAt(at, false);
    board().updateElement(id, { text: clean });
  }
}

/* -------------------------------- Exportação -------------------------------- */

export function privacy() {
  const s = board();
  return { viewerId: s.access.userId, simulateParticipant: s.facilitation.privateMode.previewOwnNotes };
}

export function renderOptions(scale: number) {
  return { scale, padding: 48, background: board().backgroundColor, theme: app().theme, privacy: privacy() };
}

/**
 * Exportação: `can('board.export')` (+ `allowViewerExport`/`allowDownload` dentro do `can`) e
 * registro no Activity Log (Chat 02 · Rodada B). Chat 05: exportado para os exportadores novos
 * (SVG, PDF por frames, CSV de issues, CSV de tabelas) passarem pelo MESMO caminho.
 */
export function allowExport(kind: StoredMessage): boolean {
  if (!board().ensure('board.export')) return false;
  board().recordActivity('exported', { key: 'board.activity.exported', params: { kind } }, { targetType: 'board' });
  return true;
}

export async function exportAsImage(scale: number, selectionOnly = false): Promise<void> {
  if (!allowExport(selectionOnly ? { key: 'board.activity.export.pngSelection', params: { scale } } : { key: 'board.activity.export.png', params: { scale } })) return;
  const meta = currentBoardMeta();
  const els = orderedElements(selectionOnly ? board().selectedIds : undefined);
  if (els.length === 0) {
    app().toast(t('board.boardActions.theBoardEmptyNothingExport'), 'danger');
    return;
  }
  try {
    await exportElementsAsPNG(meta?.name ?? 'board', els, renderOptions(scale));
    app().toast(t('board.boardActions.imageExportedScaleX', { scale }), 'success');
  } catch (err) {
    app().toast(t('board.boardActions.couldntExportImageMessage', { message: (err as Error).message }), 'danger');
  }
}

export async function exportAsPDF(): Promise<void> {
  if (!allowExport({ key: 'board.activity.export.pdf' })) return;
  const meta = currentBoardMeta();
  const els = orderedElements();
  if (els.length === 0) {
    app().toast(t('board.boardActions.theBoardEmptyNothingExport'), 'danger');
    return;
  }
  try {
    await exportElementsAsPDF(meta?.name ?? 'board', els, renderOptions(2));
    app().toast(t('board.boardActions.pdfCreated'), 'success');
  } catch (err) {
    app().toast(t('board.boardActions.couldntCreatePdfMessage', { message: (err as Error).message }), 'danger');
  }
}

export async function backupBoard(): Promise<void> {
  if (!allowExport({ key: 'board.activity.export.backup' })) return;
  const meta = currentBoardMeta();
  const name = meta?.name ?? 'board';
  let data = board().serialize();
  // Chat 08.2: no Modo Servidor as imagens são referências; o arquivo leva as imagens embutidas (funciona fora dele)
  const boardId = board().boardId;
  if (boardId && Object.values(data.elements).some((el) => el.type === 'image' && (el as { dataUrl?: string }).dataUrl?.startsWith('asset:'))) {
    const { inlineAssetImages } = await import('../collab/assets');
    data = await inlineAssetImages(data, boardId);
  }
  downloadBackup(name, createBackupFile(name, meta?.createdAt ?? Date.now(), meta?.ownerName ?? DEFAULT_AUTHOR_NAME, data));
  app().toast(t('board.boardActions.backupSavedLudraw'), 'success');
}

/** Importa um backup `.ludraw` como NOVO board e abre-o. */
export async function importBackup(): Promise<void> {
  const file = await pickFile('.ludraw,application/json');
  if (!file) return;
  try {
    const backup = await readBackupFile(file);
    const id = app().createBoard({ name: t('board.boardActions.nameImported', { name: backup.board.name }), template: 'blank', data: backup.data });
    app().navigate({ name: 'board', id });
    app().toast(t('board.boardActions.backupImported'), 'success');
  } catch (err) {
    app().toast((err as Error).message, 'danger');
  }
}

export async function copySelectionAsImage(): Promise<void> {
  if (!board().ensure('board.export')) return;
  const els = orderedElements(board().selectedIds);
  if (els.length === 0) return;
  const ok = await copyElementsAsImage(els, renderOptions(2));
  app().toast(ok ? t('board.boardActions.imageCopiedClipboard') : t('board.boardActions.yourBrowserDidntAllowCopying'), ok ? 'success' : 'danger');
}

export function exportSelectionCSV(): void {
  if (!allowExport({ key: 'board.activity.export.csv' })) return;
  const meta = currentBoardMeta();
  const ids = board().selectedIds;
  exportElementsToCSV(`${meta?.name ?? 'board'}-selecao`, orderedElements(ids.length ? ids : undefined));
  app().toast(t('board.boardActions.csvExported'), 'success');
}

export async function copyLinkToElement(id: string): Promise<void> {
  const boardId = board().boardId;
  const url = `${window.location.origin}${window.location.pathname}#/board/${boardId}?focus=${id}`;
  try {
    await navigator.clipboard.writeText(url);
    app().toast(t('board.boardActions.objectLinkCopied'), 'success');
  } catch {
    app().toast(url);
  }
}

/* ------------------------------ Frames (Chat 03) ------------------------------ */

/**
 * Cria um frame: com `rect` (desenhado na ferramenta) ou com o tamanho padrão da proporção,
 * centralizado em `at` e reduzido para caber em ~70% da tela. Seleciona o frame criado.
 */
export function createFrameAt(rect: Rect | null, at: Point, ratio: FrameRatio = 'free'): string | null {
  const s = board();
  if (s.readOnly || !s.ensure('board.edit')) return null;
  let r = rect;
  if (!r) {
    const info = frameRatioInfo(ratio);
    const view = getViewportWorldRect(s.camera, s.viewport);
    const k = Math.min(1, (view.width * 0.7) / info.size.width, (view.height * 0.7) / info.size.height);
    const w = info.size.width * k;
    const h = info.size.height * k;
    r = { x: at.x - w / 2, y: at.y - h / 2, width: w, height: h };
  }
  const order = nextSlideOrder(s.elements);
  const frame = createFrame(r, { ratioPreset: ratio, slideOrder: order, title: t('board.boardActions.frameValue', { value: order + 1 }) });
  s.addElements([frame], { select: true });
  return board().elements[frame.id] ? frame.id : null;
}

/** "Criar frame a partir da seleção": envolve a seleção com folga de 40 e adota o conteúdo. */
export function createFrameFromSelection(): string | null {
  const s = board();
  const els = s.selectedIds.map((id) => s.elements[id]).filter((el): el is CanvasElement => !!el && el.type !== 'frame');
  if (els.length === 0) {
    app().toast(t('board.boardActions.selectObjectsCreateFrameAround'));
    return null;
  }
  if (s.readOnly || !s.ensure('board.edit')) return null;
  const b = expandRect(getBoundsOfElements(els)!, 40);
  const order = nextSlideOrder(s.elements);
  const frame = createFrame(b, { slideOrder: order, title: t('board.boardActions.frameValue', { value: order + 1 }) });
  s.addElements([frame], { select: true });
  // a adoção do `addElements` pega o que está inteiro dentro; garante também quem só tem o centro dentro
  board().syncFrameMembership(els.map((e) => e.id));
  return frame.id;
}

/**
 * Excluir a seleção. Se houver frames com conteúdo que não está na seleção, pergunta antes se o
 * conteúdo fica (solto no board) ou sai junto (modal `frame-children`).
 */
export function deleteSelectionWithFramePrompt(): void {
  const s = board();
  const selected = s.selectedIds.filter((id) => s.elements[id] && !s.elements[id].locked);
  const frames = selected.filter((id) => isFrame(s.elements[id]));
  if (frames.length) {
    const chosen = new Set(selected);
    const kids = frames.flatMap((fid) => frameChildren(s.elements, fid).map((c) => c.id)).filter((id) => !chosen.has(id));
    if (kids.length) {
      if (!s.ensure('board.edit')) return;
      app().openModal({ type: 'frame-children', mode: 'delete', frameIds: frames, childIds: kids, alsoDelete: selected.filter((id) => !frames.includes(id)) });
      return;
    }
  }
  s.deleteSelected();
}

/** Elementos desenhados na exportação de um frame (o que estiver sobre ele, na ordem das camadas). */
export function frameExportElements(frameId: string): CanvasElement[] {
  const s = board();
  const frame = s.elements[frameId];
  if (!isFrame(frame)) return [];
  const area = getElementBounds(frame);
  const lookup = (id: string) => s.elements[id];
  return s.elementOrder
    .map((id) => s.elements[id])
    .filter((el): el is CanvasElement => {
      if (!el) return false;
      if (el.id === frameId || el.parentId === frameId) return true;
      if (el.type === 'frame' || isHiddenByFrame(el, lookup)) return false;
      return rectsIntersect(area, getElementBounds(el));
    });
}

export type FrameExportKind = 'pdf' | 'png2' | 'png4' | 'svg';

/** Exporta um frame (recorte exato da área do frame) — sempre por `allowExport` + `privacy`. */
export async function exportFrame(frameId: string, kind: FrameExportKind): Promise<void> {
  const frame = board().elements[frameId];
  if (!isFrame(frame)) return;
  const label = kind === 'pdf' ? 'PDF' : kind === 'svg' ? 'SVG' : kind === 'png2' ? 'PNG 2x' : 'PNG 4x';
  if (!allowExport({ key: 'board.activity.export.frame', params: { title: frame.title, format: label } })) return;
  const els = frameExportElements(frameId);
  const base = `${currentBoardMeta()?.name ?? 'board'} - ${frame.title || 'frame'}`;
  const options = { ...renderOptions(kind === 'png4' ? 4 : kind === 'pdf' ? 3 : 2), padding: 0, bounds: getElementBounds(frame), background: frame.fillColor };
  try {
    if (kind === 'svg') {
      // Chat 05: SVG vetorial do frame (mesmo desenho do PNG/PDF, gravado como vetor)
      await exportElementsAsSVG(base, els, { ...options, scale: 1 });
      app().toast(t('board.boardActions.frameSvgExported'), 'success');
    } else if (kind === 'pdf') {
      // A4 vira página A4 (595 × 842 pt); os demais: 1 unidade do board = 1 pt (máx. ~A0)
      const k = Math.min(1, 3370 / Math.max(frame.width, frame.height));
      const page = frame.ratioPreset === 'a4' ? { width: 595.28, height: 841.89 } : { width: frame.width * k, height: frame.height * k };
      await exportElementsAsPDF(base, els, options, page);
      app().toast(t('board.boardActions.framePdfCreated'), 'success');
    } else {
      await exportElementsAsPNG(base, els, options);
      app().toast(t('board.boardActions.frameImageExported', { scale: kind === 'png4' ? '4x' : '2x' }), 'success');
    }
  } catch (err) {
    app().toast(t('board.boardActions.couldntExportFrameMessage', { message: (err as Error).message }), 'danger');
  }
}

/** Modo Apresentação: entra em tela cheia a partir do frame selecionado (ou do primeiro slide). */
export function startPresentation(fromFrameId?: string): void {
  const s = board();
  const frames = orderedFrames(s.elements, s.elementOrder);
  if (frames.length === 0) {
    app().toast(t('board.boardActions.createFrameFKeyPresent'));
    return;
  }
  const selectedFrame = fromFrameId ?? s.selectedIds.find((id) => isFrame(s.elements[id]));
  presentationStartId = selectedFrame && frames.some((f) => f.id === selectedFrame) ? selectedFrame : frames[0].id;
  s.setPresenting(true);
}

/** Slide inicial pedido por `startPresentation` (lido pelo PresentationDrawer ao montar). */
let presentationStartId: string | null = null;
export function takePresentationStart(): string | null {
  const id = presentationStartId;
  presentationStartId = null;
  return id;
}

/**
 * Salva o board atual imediatamente (+ miniatura para o dashboard).
 * Chat 08.5 · D: devolve `false` quando a gravação falhou (sem board aberto = nada a gravar = `true`); `silent` deixa o
 * aviso de erro para quem chamou (ex.: "Entrar no servidor" a partir do Modo Local, que desiste de trocar de modo).
 */
export function persistCurrentBoard(withThumbnail = false, opts: { silent?: boolean } = {}): Promise<boolean> {
  // Chat 09.1 · R8: o programa desktop só fecha a janela depois que isto terminar
  return trackSave(persistBoardNow(withThumbnail, opts));
}

async function persistBoardNow(withThumbnail: boolean, opts: { silent?: boolean }): Promise<boolean> {
  const s = board();
  if (!s.boardId || s.readOnly) return true;
  let saved = false;
  try {
    saved = await saveBoardData(s.boardId, s.serialize());
  } catch {
    saved = false;
  }
  if (!saved && !opts.silent) warnStorageFull();
  const patch: { updatedAt: number; thumbnail?: string } = { updatedAt: Date.now() };
  if (withThumbnail) {
    try {
      patch.thumbnail = await generateThumbnail(orderedElements(), app().theme, s.backgroundColor, privacy());
    } catch {
      /* miniatura é opcional */
    }
  }
  app().touchBoard(s.boardId, patch);
  return saved;
}

let lastStorageWarning = 0;
/** Avisa (no máximo a cada 20 s) que o armazenamento local encheu e o board não foi salvo. */
function warnStorageFull(): void {
  const nowMs = Date.now();
  if (nowMs - lastStorageWarning < 20_000) return;
  lastStorageWarning = nowMs;
  app().toast(t('board.boardActions.localStorageFullLastChange'), 'danger');
}

/* ------------------------- Post-its em lote (Chat 02) ------------------------- */

/**
 * Cria um post-it ao lado do informado (`x + width + 24`, mesmo tamanho, cor e estilo de texto)
 * e já entra em edição nele — usado por Tab / Ctrl+Enter durante a edição de um post-it.
 */
export function createNextStickyFrom(id: string): string | null {
  const s = board();
  const src = s.elements[id];
  if (!src || src.type !== 'sticky' || s.readOnly) return null;
  const el = createStickyNote({
    x: src.x + src.width + 24,
    y: src.y,
    width: src.width,
    height: src.height,
    color: src.color,
    textColor: src.textColor,
    fontSize: src.fontSize,
    textAlign: src.textAlign,
    fontName: src.fontName,
    fontWeight: src.fontWeight,
    fontStyle: src.fontStyle,
    fillOpacity: src.fillOpacity,
  });
  s.addElements([el], { select: true });
  s.setEditingId(el.id);
  // Mantém o novo post-it visível quando ele nasce fora da tela
  const view = getViewportWorldRect(s.camera, s.viewport);
  if (el.x + el.width > view.x + view.width || el.y + el.height > view.y + view.height) {
    s.centerOn(rectCenter({ x: el.x, y: el.y, width: el.width, height: el.height }));
  }
  return el.id;
}

/* --------------------------- Reações em lote (Chat 02) --------------------------- */

/** O usuário atual já reagiu com `emoji` em TODOS os post-its indicados? */
export function allReacted(ids: string[], emoji: string): boolean {
  const s = board();
  const uid = s.access.userId;
  const stickies = ids.map((id) => s.elements[id]).filter((el) => el?.type === 'sticky');
  return stickies.length > 0 && stickies.every((el) => el.type === 'sticky' && !!el.reactedBy?.[emoji]?.includes(uid));
}

/**
 * Reage (ou remove a reação) do usuário atual em vários post-its de uma vez, com 1 entrada
 * de histórico: se todos já têm a reação, remove de todos; senão, adiciona onde falta.
 */
export function toggleReactionOnElements(ids: string[], emoji: string): void {
  // Permissão (board.comment) e histórico ficam dentro da ação do store
  board().toggleReactionOnMany(ids, emoji, board().access.userId);
}

/* ------------------------- Stickers (emojis grandes) ------------------------- */

/** Insere um emoji grande como objeto de texto ("sticker") no centro da tela. */
export function insertSticker(emoji: string, at?: Point): string {
  const center = at ?? viewportCenterWorld();
  const size = defaultWorldSize(96);
  const fontSize = Math.round(size * 0.72);
  const el = createText({
    x: center.x - size / 2,
    y: center.y - size / 2,
    width: size,
    height: size,
    text: emoji,
    fontSize,
    textAlign: 'center',
  });
  board().addElements([el], { select: true });
  board().setActiveTool('select');
  return el.id;
}

/** Chat 06.5: sticker de extensão em imagem (SVG sanitizado ou PNG/WebP) — entra como imagem comum. */
export async function insertImageSticker(dataUrl: string, at?: Point): Promise<string | null> {
  const img = new Image();
  img.src = dataUrl;
  try {
    await img.decode();
  } catch {
    return null;
  }
  const center = at ?? viewportCenterWorld();
  const size = defaultWorldSize(96);
  const nw = img.naturalWidth || 96;
  const nh = img.naturalHeight || 96;
  const scale = size / Math.max(nw, nh);
  const el = createImage({ x: center.x - (nw * scale) / 2, y: center.y - (nh * scale) / 2, width: nw * scale, height: nh * scale, dataUrl, naturalWidth: nw, naturalHeight: nh });
  board().addElements([el], { select: true });
  board().setActiveTool('select');
  return el.id;
}

/* --------------------------------- Imagens --------------------------------- */

/** Comprime e insere imagens no board, lado a lado a partir de `at` (ou do centro da tela). */
export async function insertImageFiles(files: File[], at?: Point | null): Promise<string[]> {
  const images = files.filter(isImageFile);
  if (images.length === 0) {
    if (files.length) app().toast(t('board.boardActions.noImageFilesFoundUse'), 'danger');
    return [];
  }
  if (board().readOnly || !board().ensure('board.edit')) return [];
  const center = at ?? viewportCenterWorld();
  const maxSide = defaultWorldSize(420);
  const gap = defaultWorldSize(24);
  const created: CanvasElement[] = [];
  let failed = 0;
  for (const file of images) {
    try {
      const img = await compressImageFile(file);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      created.push(
        createImage({
          x: 0,
          y: 0,
          width: img.width * scale,
          height: img.height * scale,
          dataUrl: img.dataUrl,
          naturalWidth: img.width,
          naturalHeight: img.height,
          alt: file.name.replace(/\.[^.]+$/, ''),
              }),
      );
    } catch (err) {
      failed++;
      console.warn('[LuDraw] imagem ignorada:', file.name, err);
    }
  }
  if (created.length === 0) {
    app().toast(t('board.boardActions.couldntReadImage'), 'danger');
    return [];
  }
  // Fileira centralizada no ponto de inserção
  const totalW = created.reduce((sum, el) => sum + el.width, 0) + gap * (created.length - 1);
  let x = center.x - totalW / 2;
  const placed = created.map((el) => {
    const out = { ...el, x, y: center.y - el.height / 2 } as CanvasElement;
    x += el.width + gap;
    return out;
  });
  board().addElements(placed, { select: true });
  board().setActiveTool('select');
  app().toast(
    failed ? t('board.boardActions.imagesInsertedSkipped', { count: placed.length, failed }) : t('board.boardActions.imagesInserted', { count: placed.length }),
    failed ? 'neutral' : 'success',
  );
  return placed.map((el) => el.id);
}

/** Abre o seletor de arquivos (várias imagens) e insere no centro da tela. */
export function pickAndInsertImages(): Promise<string[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      if (files.length === 0) resolve([]);
      else void insertImageFiles(files).then(resolve);
    };
    input.click();
  });
}

/* ---------------------------------- Visual ---------------------------------- */

export function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.();
}

export function setCurrentViewAsInitial(): void {
  board().setInitialView({ ...board().camera });
  app().toast(t('board.boardActions.currentViewSetAsInitial'), 'success');
}

/** Define a visualização inicial enquadrando a seleção (ou todo o conteúdo). */
export function setInitialViewToContent(): void {
  const s = board();
  const ids = s.selectedIds.length ? s.selectedIds : s.elementOrder;
  const els = ids.map((id) => s.elements[id]).filter(Boolean);
  const b = getBoundsOfElements(els);
  if (!b) {
    setCurrentViewAsInitial();
    return;
  }
  s.zoomToFit(ids);
  window.setTimeout(() => {
    useBoardStore.getState().setInitialView({ ...useBoardStore.getState().camera });
    app().toast(s.selectedIds.length ? t('board.boardActions.initialViewCurrentSelection') : t('board.boardActions.initialViewAllContent'), 'success');
  }, 380);
}

export function screenPointToWorld(clientX: number, clientY: number, stageRect: DOMRect): Point {
  return screenToWorld({ x: clientX - stageRect.left, y: clientY - stageRect.top }, board().camera);
}

/* -------------------------------- Conectores -------------------------------- */

/** Posição e tamanho da "caixa simulada" à frente de uma âncora (preview e criação rápida). */
export function ghostRectFor(host: CanvasElement, anchor: AnchorSide): { x: number; y: number; width: number; height: number } {
  const p = getAnchorPoint(host, anchor);
  const horizontal = anchor === 'left' || anchor === 'right';
  const gap = Math.max(80, (horizontal ? host.width : host.height) * 0.45);
  const dir = { top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, center: { x: 0, y: 0 } }[anchor];
  const cx = p.x + dir.x * (gap + host.width / 2);
  const cy = p.y + dir.y * (gap + host.height / 2);
  return { x: cx - host.width / 2, y: cy - host.height / 2, width: host.width, height: host.height };
}

/** Clique num ponto de conexão: cria uma cópia vazia do objeto à frente, já ligada por uma seta. */
export function quickCreateConnected(hostId: string, anchor: AnchorSide): void {
  const s = board();
  const host = s.elements[hostId];
  if (!host || !isConnectable(host)) return;
  const rect = ghostRectFor(host, anchor);
  const [copy] = cloneElements([host]);
  const fresh = { ...copy, ...rect, rotation: 0, groupId: null, locked: false, ...(isTextualElement(copy) ? { text: '' } : {}) } as CanvasElement;
  const from = getAnchorPoint(host, anchor);
  const toAnchor = OPPOSITE[anchor];
  const conn = createConnector(
    { elementId: host.id, anchor, x: from.x, y: from.y },
    { elementId: fresh.id, anchor: toAnchor, ...getAnchorPoint(fresh, toAnchor) },
    { routingType: 'orthogonal' },
    (id) => (id === fresh.id ? fresh : s.elements[id]),
  );
  s.addElements([fresh, conn]);
  s.setSelectedIds([fresh.id]);
  if (isTextualElement(fresh)) s.setEditingId(fresh.id);
}

export type InsertTarget = { type: 'sticky' } | { type: 'text' } | { type: 'shape'; kind: ShapeKind };

/** "Inserir forma" na linha: coloca um objeto no meio e divide o conector em dois. */
export function insertShapeIntoConnector(connectorId: string, target: InsertTarget): void {
  const s = board();
  const conn = s.elements[connectorId];
  if (!conn || conn.type !== 'connector') return;
  const route = computeRoute(conn, (id) => s.elements[id]);
  const zoom = s.camera.zoom;
  const horizontal = Math.abs(route.end.x - route.start.x) >= Math.abs(route.end.y - route.start.y);
  const w = target.type === 'sticky' ? 140 : 160;
  const h = target.type === 'sticky' ? 140 : target.type === 'text' ? 40 : 90;
  const base = { x: route.mid.x - w / 2, y: route.mid.y - h / 2, width: w, height: h };
  const el: CanvasElement =
    target.type === 'sticky'
      ? createStickyNote({ ...base })
      : target.type === 'text'
        ? createText({ ...base, text: t('common.text'), fontSize: Math.max(12, Math.round(18 / Math.max(zoom, 0.5))) })
        : createShape(target.kind, { ...base, fillColor: '#FFFFFF', strokeColor: conn.strokeColor, strokeWidth: 2 });
  const inAnchor: AnchorSide = horizontal ? (route.end.x >= route.start.x ? 'left' : 'right') : route.end.y >= route.start.y ? 'top' : 'bottom';
  const outAnchor = OPPOSITE[inAnchor];
  const lookup = (id: string) => (id === el.id ? el : s.elements[id]);
  const second = createConnector(
    { elementId: el.id, anchor: outAnchor, ...getAnchorPoint(el, outAnchor) },
    conn.end,
    { routingType: conn.routingType, strokeColor: conn.strokeColor, strokeWidth: conn.strokeWidth, strokeStyle: conn.strokeStyle, startArrow: 'none', endArrow: conn.endArrow },
    lookup,
  );
  s.pushHistory();
  s.addElements([el, second], { recordHistory: false });
  s.updateElement(conn.id, { end: { elementId: el.id, anchor: inAnchor, ...getAnchorPoint(el, inAnchor) }, waypoints: undefined });
  s.setSelectedIds([el.id]);
}

/** Troca as pontas (setas) de um conector. */
export function swapConnectorEnds(connectorId: string): void {
  const s = board();
  const conn = s.elements[connectorId];
  if (!conn || conn.type !== 'connector') return;
  s.pushHistory();
  s.updateElement(conn.id, { startArrow: conn.endArrow, endArrow: conn.startArrow });
}
