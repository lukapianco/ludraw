/**
 * LuDraw — trazer boards do Modo Local deste navegador para o servidor (Chat 08.2 · A-1). PURO (sem DOM, sem
 * i18n em execução): a tela `ImportLocalBoardsModal` e os testes do servidor usam as mesmas regras.
 *
 * Decisões do usuário (08.2): autoria, bloqueios, comentários e reações de usuários LOCAIS passam para quem importa
 * (os nomes exibidos ficam); Activity Log local, facilitadores e o estado de facilitação (votação, cronômetro, modo
 * privado, condução) são zerados; "não duplicar" vale por pessoa (o servidor guarda `importedFrom.by`).
 * As cópias locais nunca são alteradas.
 */
import type { MessageDescriptor } from '../i18n/types';
import type { BoardData, CanvasElement, CommentElement, StickyNoteElement } from '../types/canvas';
import type { BoardMeta } from '../types/workspace';
import { checkBoardData } from './boardLimits';
import { stripUnsafeContent } from './contentSafety';

/** Board local listado na tela (o que está guardado no `localStorage` do Modo Local). */
export interface LocalBoardEntry {
  id: string;
  name: string;
  updatedAt: number;
}

/** Lê a lista de boards do estado salvo do Modo Local (`ludraw:app`, formato do persist do zustand). */
export function localBoardsFromPersisted(raw: string | null): LocalBoardEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { state?: { boards?: unknown } };
    const boards = Array.isArray(parsed?.state?.boards) ? (parsed.state!.boards as Partial<BoardMeta>[]) : [];
    return boards
      .filter((b) => typeof b?.id === 'string' && typeof b.name === 'string' && !b.deletedAt && !b.transient)
      .map((b) => ({ id: b.id!, name: b.name!, updatedAt: typeof b.updatedAt === 'number' ? b.updatedAt : 0 }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/** O board local já foi trazido por esta pessoa? (lista de boards do servidor que ela enxerga) */
export function importedCopyOf(serverBoards: readonly BoardMeta[], userId: string, sourceId: string): BoardMeta | undefined {
  return serverBoards.find((b) => b.importedFrom?.kind === 'local' && b.importedFrom.sourceId === sourceId && b.importedFrom.by === userId);
}

const mine = (v: unknown, me: string): unknown => (typeof v === 'string' && v ? me : v);

/** Conteúdo pronto para o servidor: ids de usuários locais viram o de quem importa; nada do que só fazia sentido aqui. */
export function prepareLocalImport(data: BoardData, me: { id: string }): BoardData {
  const elements: Record<string, CanvasElement> = {};
  for (const [id, raw] of Object.entries(data.elements ?? {})) {
    const el = { ...raw } as CanvasElement & Record<string, unknown>;
    if ('createdBy' in el) el.createdBy = mine(el.createdBy, me.id) as string;
    if ('lockedBy' in el && el.lockedBy) el.lockedBy = me.id;
    if (el.type === 'comment') {
      const c = el as unknown as CommentElement;
      c.messages = (c.messages ?? []).map((m) => (m.authorId ? { ...m, authorId: me.id } : m));
      if (c.resolvedBy) c.resolvedBy = me.id;
    }
    if (el.type === 'sticky') {
      const s = el as unknown as StickyNoteElement;
      if (s.reactedBy) s.reactedBy = Object.fromEntries(Object.entries(s.reactedBy).map(([emoji, ids]) => [emoji, ids.length ? [me.id] : []]));
      // as cédulas locais não existem no servidor (a votação é zerada)
      delete (s as { votedBy?: string[] }).votedBy;
      // a nota privada era desta pessoa: sem Modo Privado no servidor ela ficaria escondida para sempre
      if (s.isPrivateDraft) s.isPrivateDraft = false;
    }
    elements[id] = el;
  }
  // Chat 08.7 · R4 (S-30/S-31): o servidor recusa imagem de fora do board, link inseguro e cor com url(…)
  const safe = stripUnsafeContent({ elements }).data.elements;
  const order = (data.elementOrder ?? []).filter((id) => safe[id]);
  for (const id of Object.keys(safe)) if (!order.includes(id)) order.push(id);
  return {
    ...data,
    elements: safe,
    elementOrder: order,
    activityLog: [],
    facilitatorIds: [],
    facilitation: { privateMode: { enabled: false, previewOwnNotes: false } },
  };
}

/** Motivo (limites do board) para um board local não poder ir ao servidor; null = pode. */
export function localImportProblem(data: BoardData | null, me: { id: string }): MessageDescriptor | null {
  if (!data || typeof data !== 'object' || !data.elements) return { key: 'server.import.unreadable' };
  return checkBoardData(prepareLocalImport(data, me));
}

/** Quantos itens inseguros a cópia para o servidor deixa de fora ou neutraliza (aviso no fim da importação). */
export function unsafeCountOf(data: BoardData | null): number {
  if (!data?.elements) return 0;
  const r = stripUnsafeContent(data);
  return r.images + r.links + r.styles;
}

export const objectCount = (data: BoardData | null): number => (data?.elements ? Object.keys(data.elements).length : 0);
