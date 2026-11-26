/**
 * LuDraw — Comentários (Chat 04): estado de interface + utilitários de menções.
 *
 * Os dados (pins, mensagens, resolver) passam pelas ações do store (`addComment`, `replyToComment`,
 * `setCommentResolved`, `deleteComment`) com `board.comment` / `comment.delete`. Aqui ficam só:
 *  - `useCommentUi`: rascunho de um comentário novo (ainda sem pin) — fora do board e do desfazer;
 *  - pessoas conhecidas e menções `@Nome` (UI: o store do board não importa o store do app).
 */

import { create } from 'zustand';
import type { CanvasElement, CommentElement } from '../types/canvas';
import { useAppStore } from '../store/useAppStore';
import { useBoardStore } from '../store/useBoardStore';
import { getBoundsOfElements, type Point } from './math';
import { isHiddenByFrame } from './frames';
import { compareText } from '../i18n/format';

interface CommentUiState {
  /** Comentário novo sendo escrito (o pin só nasce ao enviar) */
  draft: { world: Point; targetId: string | null } | null;
}

export const useCommentUi = create<CommentUiState>(() => ({ draft: null }));

const board = () => useBoardStore.getState();

/** Abre o compositor de um comentário novo em `world` (ponta do pin). */
export function startCommentDraft(world: Point, targetId: string | null = null): void {
  const s = board();
  if (s.readOnly || !s.ensure('board.comment')) return;
  if (!useAppStore.getState().preferences.showComments) useAppStore.getState().setPreference('showComments', true);
  s.clearSelection();
  if (s.activeTool === 'comment') s.setActiveTool('select');
  useCommentUi.setState({ draft: { world, targetId } });
}

/** "Comentar" na Barra de ações: o pin nasce no canto superior direito da seleção. */
export function startCommentOnSelection(): void {
  const s = board();
  const els = s.selectedIds.map((id) => s.elements[id]).filter((el): el is CanvasElement => !!el && el.type !== 'comment');
  const b = getBoundsOfElements(els);
  if (!b) return;
  startCommentDraft({ x: b.x + b.width - 6, y: b.y + 6 }, els.length === 1 ? els[0].id : null);
}

export function cancelCommentDraft(): void {
  if (useCommentUi.getState().draft) useCommentUi.setState({ draft: null });
}

/** Envia o rascunho: cria o pin e deixa a conversa aberta (selecionada). */
export function submitCommentDraft(text: string): string | null {
  const draft = useCommentUi.getState().draft;
  if (!draft) return null;
  const id = board().addComment(draft.world, text, { targetId: draft.targetId, mentions: extractMentions(text, knownPeople()) });
  if (id) {
    useCommentUi.setState({ draft: null });
    board().setSelectedIds([id]);
  }
  return id;
}

/** Responde à conversa já calculando as menções. */
export function replyComment(id: string, text: string): void {
  board().replyToComment(id, text, extractMentions(text, knownPeople()));
}

/** Seleciona a conversa e leva a câmera até o pin (Painel → Comentários). */
export function openComment(id: string, center = true): void {
  const s = board();
  const el = s.elements[id];
  if (!el || el.type !== 'comment') return;
  if (!useAppStore.getState().preferences.showComments) useAppStore.getState().setPreference('showComments', true);
  cancelCommentDraft();
  s.setSelectedIds([id]);
  if (center) s.centerOn({ x: el.x + 140 / s.camera.zoom, y: el.y + 60 / s.camera.zoom });
}

/** Conversas visíveis (fora de frames ocultos), na ordem das camadas. */
export function listComments(): CommentElement[] {
  const s = board();
  const lookup = (id: string) => s.elements[id];
  return s.elementOrder
    .map((id) => s.elements[id])
    .filter((el): el is CommentElement => !!el && el.type === 'comment' && !isHiddenByFrame(el, lookup));
}

/* --------------------------------- Menções ---------------------------------- */

/** Pessoas para @menção: você, membros do workspace, autores de comentários e responsáveis de cards. */
export function knownPeople(): string[] {
  const app = useAppStore.getState();
  const s = board();
  const names = new Set<string>();
  if (app.user?.name) names.add(app.user.name);
  for (const m of app.members) names.add(m.name);
  for (const id of s.elementOrder) {
    const el = s.elements[id];
    if (el?.type === 'comment') for (const m of el.messages) if (m.author) names.add(m.author);
    if (el?.type === 'kanban') for (const c of el.columns) for (const k of c.cards) if (k.assignee?.trim()) names.add(k.assignee.trim());
  }
  return Array.from(names)
    .filter((n) => n.trim().length > 0)
    .sort(compareText);
}

/** Nomes mencionados no texto (`@Nome Sobrenome` de pessoas conhecidas — o nome mais longo vence). */
export function extractMentions(text: string, people: string[]): string[] {
  const found = new Set<string>();
  const lower = text.toLocaleLowerCase('pt-BR');
  const sorted = [...people].sort((a, b) => b.length - a.length);
  let i = lower.indexOf('@');
  while (i >= 0) {
    const rest = lower.slice(i + 1);
    const hit = sorted.find((p) => rest.startsWith(p.toLocaleLowerCase('pt-BR')));
    if (hit) found.add(hit);
    i = lower.indexOf('@', i + 1);
  }
  return Array.from(found);
}

/** Divide o texto em trechos normais e menções (para destacar na conversa). */
export function mentionSegments(text: string, mentions: string[] | undefined): { text: string; mention: boolean }[] {
  if (!mentions?.length) return [{ text, mention: false }];
  const tokens = mentions.map((m) => `@${m}`).sort((a, b) => b.length - a.length);
  const out: { text: string; mention: boolean }[] = [];
  let i = 0;
  let buf = '';
  const lower = text.toLocaleLowerCase('pt-BR');
  while (i < text.length) {
    const hit = text[i] === '@' ? tokens.find((t) => lower.startsWith(t.toLocaleLowerCase('pt-BR'), i)) : undefined;
    if (hit) {
      if (buf) out.push({ text: buf, mention: false });
      out.push({ text: text.slice(i, i + hit.length), mention: true });
      buf = '';
      i += hit.length;
    } else {
      buf += text[i];
      i += 1;
    }
  }
  if (buf) out.push({ text: buf, mention: false });
  return out;
}

/** A conversa menciona o usuário? (filtro "Menções a mim" do Painel) */
export function mentionsUser(c: CommentElement, name: string | undefined): boolean {
  if (!name) return false;
  return c.messages.some((m) => m.mentions?.includes(name));
}

/** Consulta de @menção em andamento antes do cursor (ex.: "olá @lu|" → "lu"). */
export function mentionQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && !/\s|[(\[{]/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (query.length > 30 || /\n/.test(query) || /\s{2,}/.test(query)) return null;
  return { start: at, query };
}
