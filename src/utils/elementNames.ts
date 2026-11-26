/**
 * LuDraw — nome curto de um objeto para listas (Chat 08.2 · B): "Tipo · começo do texto" (ex.: "Post-it · Ideia nova").
 * Usado em Conversas ("onde está") e na linha do tempo.
 */
import type { CanvasElement } from '../types/canvas';
import { ELEMENT_TYPE_LABELS, getElementText } from './factory';

export function elementDisplayName(el: CanvasElement, max = 32): string {
  const type = ELEMENT_TYPE_LABELS[el.type] ?? el.type;
  const raw = (el.type === 'frame' ? (el as { title?: string }).title : getElementText(el)) ?? '';
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return type;
  return `${type} · ${text.length > max ? `${text.slice(0, max - 1)}…` : text}`;
}
