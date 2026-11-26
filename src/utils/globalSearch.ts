/**
 * LuDraw — Chat 06 · Rodada B: Busca Global Profunda (Mesa / paleta Ctrl+K).
 *
 * Procura no nome do board, no lugar (Time/Projeto) e no TEXTO de dentro dos boards: post-its, formas,
 * textos, frames, rótulos de linhas, mapas mentais, Kanbans (títulos, colunas, cards, descrições,
 * responsáveis, tags) e tabelas. Respeita permissões: quem chama passa só os boards que a pessoa pode ver
 * (`canSeeBoard` ≈ `can('board.view')`); notas privadas de outras pessoas e conteúdo oculto por frame
 * NUNCA entram no índice. Texto do usuário não é traduzido; a comparação ignora acentos e maiúsculas.
 */
import { isValidComposite } from './composite';
import type { BoardData, CanvasElement } from '../types/canvas';
import type { BoardMeta } from '../types/workspace';
import { isHiddenByFrame } from './frames';
import { isPrivateDraftHidden } from './permissions';
import { boardRepository } from './boardRepository';

export interface IndexedText {
  elementId: string;
  type: CanvasElement['type'];
  text: string;
}

export interface ContentHit {
  boardId: string;
  elementId: string;
  type: CanvasElement['type'];
  /** Trecho com a ocorrência (texto do usuário, como está no board) */
  snippet: string;
}

/** minúsculas e sem acentos — comparação tolerante (o resultado mostra o texto original) */
export function normalizeSearch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase();
}

/** Textos pesquisáveis de um board, já filtrados pelo que `viewerId` pode ver. */
export function boardTexts(data: BoardData, viewerId: string): IndexedText[] {
  const out: IndexedText[] = [];
  const lookup = (id: string) => data.elements[id];
  const push = (el: CanvasElement, text: string | undefined | null) => {
    const clean = (text ?? '').replace(/\s+/g, ' ').trim();
    if (clean) out.push({ elementId: el.id, type: el.type, text: clean });
  };
  for (const id of data.elementOrder) {
    const el = data.elements[id];
    if (!el || isHiddenByFrame(el, lookup)) continue;
    switch (el.type) {
      case 'sticky':
        if (!isPrivateDraftHidden(el, viewerId, false)) push(el, el.text);
        break;
      case 'shape':
      case 'text':
        push(el, el.text);
        break;
      case 'frame':
        push(el, el.title);
        break;
      case 'connector':
        push(el, el.label);
        break;
      case 'mindmap':
        el.nodes.forEach((n) => push(el, n.text));
        break;
      case 'kanban':
        push(el, el.title);
        el.columns.forEach((c) => {
          push(el, c.title);
          c.cards.forEach((card) => {
            push(el, card.title);
            push(el, card.description);
            push(el, card.assignee);
            (card.tags ?? []).forEach((tag) => push(el, tag));
          });
        });
        break;
      case 'table':
        Object.values(el.cells).forEach((cell) => push(el, cell.text));
        break;
      case 'composite':
        // Chat 06.5: texto principal e campos do elemento de extensão (só se o elemento for válido)
        if (isValidComposite(el)) [el.text, ...Object.values(el.fields ?? {})].forEach((v) => push(el, v));
        break;
      default:
        // comentários e imagens ficam de fora (conversas não são conteúdo do board)
        break;
    }
  }
  return out;
}

/** Índice em memória por board (refeito quando o board muda — `updatedAt`). */
const index = new Map<string, { updatedAt: number; viewerId: string; texts: IndexedText[] }>();

export async function indexBoards(boards: readonly BoardMeta[], viewerId: string): Promise<void> {
  for (const b of boards) {
    const cur = index.get(b.id);
    if (cur && cur.updatedAt === b.updatedAt && cur.viewerId === viewerId) continue;
    const data = await boardRepository.loadBoard(b.id);
    index.set(b.id, { updatedAt: b.updatedAt, viewerId, texts: data ? boardTexts(data, viewerId) : [] });
  }
}

function snippetOf(text: string, at: number, length: number): string {
  const start = Math.max(0, at - 32);
  const end = Math.min(text.length, at + length + 48);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

/** Ocorrências no conteúdo dos boards visíveis (índice já montado por `indexBoards`). */
export function searchContent(boards: readonly BoardMeta[], query: string, limit = 30): ContentHit[] {
  const q = normalizeSearch(query.trim());
  if (q.length < 2) return [];
  const hits: ContentHit[] = [];
  for (const b of boards) {
    const entry = index.get(b.id);
    if (!entry) continue;
    for (const item of entry.texts) {
      const at = normalizeSearch(item.text).indexOf(q);
      if (at < 0) continue;
      hits.push({ boardId: b.id, elementId: item.elementId, type: item.type, snippet: snippetOf(item.text, at, q.length) });
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}

/** Usado ao restaurar backup / trocar de conta: o índice é refeito do zero. */
export function clearSearchIndex(): void {
  index.clear();
}
