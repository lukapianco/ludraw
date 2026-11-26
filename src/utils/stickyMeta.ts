/**
 * LuDraw — Metadados de post-its (Chat 02 · Rodada A): tags e reações.
 * Funções puras compartilhadas pela tela (StickyNoteView), pela exportação (export.ts)
 * e pelo store — a geometria do rodapé é a MESMA no DOM e no PNG/PDF.
 */

import type { StickyNoteElement, StickyTag } from '../types/canvas';
import { contrastRatio } from './color';

/** Paleta de tags (contraste ≥ 3:1 com o texto escolhido por `tagTextColor`). */
export const TAG_COLORS: string[] = ['#194B32', '#3A8156', '#2C64A8', '#6B4FD8', '#8C4A7A', '#C2412D', '#D9467A', '#E0A21B', '#0F766E', '#5B605C'];

/** Emojis de reação oferecidos na Barra de ações e na Dock. */
export const REACTION_EMOJIS: string[] = ['👍', '❤️', '🔥', '💡', '✅', '🎉', '😂', '👀', '🙌', '⭐', '❓', '🚀'];

/** Stickers (emojis grandes inseridos como objeto no board). */
export const STICKER_EMOJIS: string[] = [
  '👍', '👎', '❤️', '🔥', '💡', '✅', '❌', '🎉', '⭐', '🚀', '⚠️', '❓',
  '😀', '😂', '😍', '🤔', '😮', '😢', '🙌', '👏', '💪', '🙏', '👀', '🎯',
  '📌', '📎', '📅', '⏰', '💬', '🧠', '🛠️', '📈', '💰', '🏁', '🧩', '🌱',
];

/** Máximo de tags exibidas no rodapé do post-it; o restante vira "+N". */
export const MAX_VISIBLE_TAGS = 3;

/** Cor de texto legível sobre a pílula da tag. */
export function tagTextColor(color: string): string {
  return contrastRatio('#FFFFFF', color) >= 3 ? '#FFFFFF' : '#1C1C1E';
}

/** Próxima cor da paleta para uma tag nova (gira pelo tamanho do catálogo). */
export function nextTagColor(existing: StickyTag[]): string {
  return TAG_COLORS[existing.length % TAG_COLORS.length];
}

/** Reações com contagem > 0, na ordem da paleta (emojis fora da paleta no fim). */
export function activeReactions(el: Pick<StickyNoteElement, 'reactions'>): [string, number][] {
  const entries = Object.entries(el.reactions ?? {}).filter(([, n]) => n > 0);
  const rank = (e: string) => {
    const i = REACTION_EMOJIS.indexOf(e);
    return i === -1 ? 999 : i;
  };
  return entries.sort((a, b) => rank(a[0]) - rank(b[0]));
}

/** Patch que alterna a reação `emoji` do usuário `userId` no post-it. */
export function toggleReactionPatch(el: StickyNoteElement, emoji: string, userId: string): Pick<StickyNoteElement, 'reactions' | 'reactedBy'> {
  const reactions = { ...(el.reactions ?? {}) };
  const reactedBy = { ...(el.reactedBy ?? {}) };
  const who = reactedBy[emoji] ?? [];
  if (who.includes(userId)) {
    reactedBy[emoji] = who.filter((u) => u !== userId);
    reactions[emoji] = Math.max(0, (reactions[emoji] ?? 1) - 1);
  } else {
    reactedBy[emoji] = [...who, userId];
    reactions[emoji] = (reactions[emoji] ?? 0) + 1;
  }
  if (!reactions[emoji]) delete reactions[emoji];
  if (reactedBy[emoji]?.length === 0) delete reactedBy[emoji];
  return { reactions, reactedBy };
}

export interface StickyFooterLayout {
  /** Tamanho da fonte das pílulas (unidades de mundo) */
  fontSize: number;
  pillHeight: number;
  gap: number;
  tags: StickyTag[];
  extraTags: number;
  reactions: [string, number][];
  /** Altura reservada na base do post-it (0 = sem rodapé) */
  height: number;
}

/** Geometria do rodapé (tags + reações) proporcional ao tamanho do post-it. */
export function stickyFooterLayout(el: Pick<StickyNoteElement, 'width' | 'height' | 'tags' | 'reactions'>): StickyFooterLayout {
  const fontSize = Math.min(22, Math.max(8, Math.min(el.width, el.height) * 0.058));
  const pillHeight = fontSize * 1.75;
  const gap = fontSize * 0.4;
  const allTags = el.tags ?? [];
  const tags = allTags.slice(0, MAX_VISIBLE_TAGS);
  const reactions = activeReactions(el);
  const rows = (tags.length ? 1 : 0) + (reactions.length ? 1 : 0);
  return {
    fontSize,
    pillHeight,
    gap,
    tags,
    extraTags: Math.max(0, allTags.length - tags.length),
    reactions,
    height: rows ? rows * pillHeight + (rows - 1) * gap + gap : 0,
  };
}
