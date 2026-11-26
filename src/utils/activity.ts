/**
 * LuDraw — Activity Log do board (Chat 02 · Rodada B). Funções puras usadas DENTRO das
 * ações do store (`recordActivity`): agrupamento (coalescing) de eventos do mesmo ator + ação +
 * tipo numa janela de 8 s e limite de 200 entradas.
 *
 * Chat 05.6 · Rodada B: as entradas novas guardam **ação, tipo, contagem e mensagem como chave +
 * parâmetros** (`message`) — nunca a frase pronta. A tela traduz na hora (`activityText`), com o
 * plural do idioma ativo. Entradas antigas (só `summary`, em pt-BR) continuam aparecendo como foram
 * gravadas.
 */

import type { BoardActivityAction, BoardActivityEntry, CanvasElement } from '../types/canvas';
import type { StoredMessage, TKey } from '../i18n/types';
import { translateStored, translatedRecord } from '../i18n';
import { formatDate, formatTimeAgo } from '../i18n/format';
import { createId } from './id';
import { personLabel } from './storedNames';

export const ACTIVITY_LIMIT = 200;
export const COALESCE_WINDOW_MS = 8000;
export const MAX_ELEMENT_IDS = 20;

export type ActivityTarget = BoardActivityEntry['targetType'];

const NOUN_TYPES = new Set(['sticky', 'shape', 'text', 'freehand', 'image', 'connector', 'frame', 'mindmap', 'kanban', 'table', 'comment']);
const ELEMENT_ACTIONS = new Set<BoardActivityAction>(['created', 'updated', 'moved', 'deleted', 'locked', 'unlocked']);

/** Complementos dos resumos (gravados como chave; também entram na chave de agrupamento). */
export const ACTIVITY_DETAIL = {
  background: 'board.activity.detail.asBackground',
  backgroundProtected: 'board.activity.detail.asBackgroundProtected',
  protectedLock: 'board.activity.detail.withProtectedLock',
  contentHidden: 'board.activity.detail.contentHidden',
  contentShown: 'board.activity.detail.contentShown',
  slideOrder: 'board.activity.detail.slideOrder',
} as const satisfies Record<string, TKey>;

export const ACTION_LABELS: Record<BoardActivityAction, string> = translatedRecord({
  created: 'board.activity.actions.created',
  updated: 'board.activity.actions.updated',
  moved: 'board.activity.actions.moved',
  deleted: 'board.activity.actions.deleted',
  locked: 'board.activity.actions.locked',
  unlocked: 'board.activity.actions.unlocked',
  private_mode_toggled: 'board.activity.actions.privateMode',
  private_notes_revealed: 'board.activity.actions.reveals',
  snapshot_restored: 'board.activity.actions.versions',
  exported: 'board.activity.actions.exports',
  commented: 'board.activity.actions.comments',
  voting: 'board.activity.actions.votes',
  timer: 'board.activity.actions.timer',
  imported: 'board.activity.actions.imports',
  access_changed: 'board.activity.actions.access',
  follow_me: 'board.activity.actions.followMe',
});

/** Mensagem da contagem ("3 post-its", "1 forma", "2 objetos"), com plural do idioma ativo. */
export function countMessage(targetType: ActivityTarget, count: number): StoredMessage {
  const noun = targetType && NOUN_TYPES.has(targetType) ? targetType : 'object';
  return { key: `board.activity.nouns.${noun}`, params: { count } };
}

/** "3 post-its", "1 forma", "2 objetos" (no idioma ativo). */
export function countLabel(targetType: ActivityTarget, count: number): string {
  return translateStored(countMessage(targetType, count));
}

/** Mensagem padrão das ações sobre elementos: `{actor} adicionou {things}` (+ complemento). */
export function elementMessage(action: BoardActivityAction, targetType: ActivityTarget, count: number, detail?: string): StoredMessage {
  const base: StoredMessage = { key: `board.activity.element.${action}`, params: { things: countMessage(targetType, count) } };
  if (!detail) return base;
  const detailMsg: StoredMessage | string = detail.startsWith('board.activity.') ? { key: detail } : detail;
  return { key: 'board.activity.withDetail', params: { text: base, detail: detailMsg } };
}

/** Texto da entrada no idioma ativo: mensagem estruturada (nova) ou `summary` gravado (antiga). */
export function activityText(entry: BoardActivityEntry): string {
  const text = activityBaseText(entry);
  // Chat 06.5 · B: ações feitas por extensão levam o rótulo "via extensão X" (nome = conteúdo, não traduzido)
  return entry.viaExtension ? translateStored({ key: 'board.activity.viaExtension', params: { text, name: entry.viaExtension.name } }) : text;
}

function activityBaseText(entry: BoardActivityEntry): string {
  if (entry.message) {
    // ações de elemento: a contagem viva (`targetCount`) manda, mesmo depois do agrupamento
    if (ELEMENT_ACTIONS.has(entry.action) && entry.message.key.startsWith('board.activity.element.') && entry.targetCount !== undefined) {
      return translateStored(elementMessage(entry.action, entry.targetType, entry.targetCount), { actor: personLabel(entry.actorName) });
    }
    return translateStored(entry.message, { actor: personLabel(entry.actorName) });
  }
  return entry.summary ?? '';
}

/** @deprecated desde o Chat 05.6 — use `elementMessage` (a frase é montada na tela). */
export function buildSummary(actorName: string, action: BoardActivityAction, targetType: ActivityTarget, count: number, detail?: string): string {
  return translateStored(elementMessage(action, targetType, count, detail), { actor: actorName });
}

/** Agrupa ids por tipo de elemento (para registrar "2 post-its" e "1 forma" separadamente). */
export function groupByType(elements: CanvasElement[]): Map<CanvasElement['type'], string[]> {
  const map = new Map<CanvasElement['type'], string[]>();
  for (const el of elements) map.set(el.type, [...(map.get(el.type) ?? []), el.id]);
  return map;
}

export interface ActivityInput {
  action: BoardActivityAction;
  actorId: string;
  actorName: string;
  actorRole: BoardActivityEntry['actorRole'];
  /** Mensagem como chave + parâmetros (`{actor}` é preenchido na tela com `actorName`) */
  message: StoredMessage;
  targetType?: ActivityTarget;
  targetCount?: number;
  elementIds?: string[];
  /** Complemento do resumo padrão (ex.: "como estrutura de fundo") — também entra na chave de agrupamento */
  detail?: string;
  /** Chat 06.5 · B: ação feita por uma extensão (só agrupa com entradas da MESMA extensão) */
  viaExtension?: { id: string; name: string };
}

/**
 * Acrescenta uma entrada ao log aplicando o coalescing: se houver uma entrada do mesmo ator +
 * ação + tipo (+ detalhe) cuja janela terminou há menos de 8 s, ela é atualizada (contagem pela
 * união de ids, `lastTimestamp`, mensagem regenerada) em vez de criar outra. Mantém as 200 mais recentes.
 */
export function appendActivity(log: BoardActivityEntry[], input: ActivityInput, now = Date.now()): BoardActivityEntry[] {
  const ids = (input.elementIds ?? []).slice(0, MAX_ELEMENT_IDS);
  const elementAction = ['created', 'updated', 'moved', 'deleted', 'locked', 'unlocked'].includes(input.action);
  if (elementAction) {
    for (let i = log.length - 1; i >= 0 && i >= log.length - 12; i--) {
      const e = log[i];
      const last = e.lastTimestamp ?? e.timestamp;
      if (now - last > COALESCE_WINDOW_MS) break;
      const sameDetail = e.detail === input.detail;
      const sameVia = (e.viaExtension?.id ?? null) === (input.viaExtension?.id ?? null);
      if (e.actorId === input.actorId && e.action === input.action && e.targetType === input.targetType && sameDetail && sameVia) {
        const prev = new Set(e.elementIds ?? []);
        const fresh = ids.filter((id) => !prev.has(id));
        const count = (e.targetCount ?? prev.size) + fresh.length;
        const merged: BoardActivityEntry = {
          ...e,
          lastTimestamp: now,
          targetCount: count,
          elementIds: [...(e.elementIds ?? []), ...fresh].slice(0, MAX_ELEMENT_IDS),
          message: elementMessage(input.action, input.targetType, count, input.detail),
        };
        const next = log.slice();
        next[i] = merged;
        return next;
      }
    }
  }
  const entry: BoardActivityEntry = {
    id: createId(10),
    timestamp: now,
    lastTimestamp: now,
    actorId: input.actorId,
    actorName: input.actorName,
    actorRole: input.actorRole,
    action: input.action,
    targetType: input.targetType,
    targetCount: input.targetCount ?? (ids.length || undefined),
    message: input.message,
    elementIds: ids.length ? ids : undefined,
    ...(input.detail ? { detail: input.detail } : {}),
    ...(input.viaExtension ? { viaExtension: { ...input.viaExtension } } : {}),
  };
  const next = [...log, entry];
  return next.length > ACTIVITY_LIMIT ? next.slice(next.length - ACTIVITY_LIMIT) : next;
}

/** "agora mesmo", "há 3 minutos", "ontem", "há 4 dias" (Intl, no idioma ativo); mais de 7 dias → "12/10". */
export function relativeTime(ts: number, now = Date.now()): string {
  if (now - ts >= 7 * 86400000) return formatDate(ts, { day: '2-digit', month: '2-digit' });
  return formatTimeAgo(ts, now);
}

/** Chaves de patch que representam só reposicionamento (registradas como "moveu" ao soltar). */
export const GEOMETRY_ONLY_KEYS = new Set(['x', 'y', 'waypoints', 'start', 'end', 'updatedAt', 'zIndex', 'parentId', 'labelPosition']);
