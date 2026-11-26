/**
 * LuDraw — cursores contextuais do board, decididos num ÚNICO lugar (Chat 08.2 · C-2, pedido do usuário).
 *
 * `cursorFor(estado)` é uma função pura (testada em `server/test/cursors.test.ts`); `applyCursor(el, valor)` só toca o
 * DOM quando o cursor muda de fato (sem re-render do React a cada movimento do mouse).
 *
 * | Situação                                                    | Cursor                                   |
 * |-------------------------------------------------------------|------------------------------------------|
 * | Mão (H) ou Espaço · leitura sem edição                      | grab → grabbing ao arrastar              |
 * | Objeto selecionado (inclui título do frame e caixa múltipla)| move → grabbing durante o arrasto        |
 * | Objeto não selecionado                                      | seta normal (default)                    |
 * | Alt + arrastar (duplica — função que já existia)            | copy                                     |
 * | Objeto travado                                              | seta normal; not-allowed ao tentar mover |
 * | Alças de redimensionar                                      | direção certa, acompanhando a rotação    |
 * | Alça de rotação (e durante a rotação)                       | cursor próprio em SVG (fallback: grab)   |
 * | Ferramentas de criar (post-it, forma, pena, conector…)      | crosshair                                |
 * | Ferramenta Texto                                            | text                                     |
 * | Pontos de conexão                                           | crosshair                                |
 * | Borracha                                                    | círculo próprio (fallback: cell)         |
 */
import type { InteractionKind, ToolType } from '../types/canvas';
import { normalizeAngle, type HandleId } from './math';

const RESIZE = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'] as const;
const HANDLE_ANGLE: Record<HandleId, number> = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 };

/** Cursor de redimensionar da alça, girado com o objeto (as 8 alças caem em 4 eixos). */
export function resizeCursor(handle: HandleId, rotation: number): (typeof RESIZE)[number] {
  return RESIZE[Math.round(normalizeAngle(HANDLE_ANGLE[handle] + rotation) / 45) % 4];
}

/* ---------- cursor de rotação: desenho próprio (obra do projeto, MIT), 24 px com versão 2x, ponto ativo no centro ---------- */
const ROTATE_SVG = (px: number) =>
  `<svg xmlns='http://www.w3.org/2000/svg' width='${px}' height='${px}' viewBox='0 0 24 24'>` +
  `<g fill='none' stroke-linecap='round' stroke-linejoin='round'>` +
  `<path d='M18.6 12.6a6.6 6.6 0 1 1-2.3-5.6' stroke='white' stroke-width='4.6'/>` +
  `<path d='M17.4 3.4l-.9 3.9 3.9.7' stroke='white' stroke-width='4.6'/>` +
  `<path d='M18.6 12.6a6.6 6.6 0 1 1-2.3-5.6' stroke='%2314241A' stroke-width='1.8'/>` +
  `<path d='M17.4 3.4l-.9 3.9 3.9.7' stroke='%2314241A' stroke-width='1.8'/></g>` +
  `<circle cx='12' cy='12' r='1.7' fill='%2314241A' stroke='white' stroke-width='1.1'/></svg>`;
const url = (px: number) => `url("data:image/svg+xml,${ROTATE_SVG(px).replace(/</g, '%3C').replace(/>/g, '%3E')}")`;
/** Com image-set (1x/2x) onde houver suporte; senão a versão 1x; sempre com o fallback nativo `grab`. */
export const ROTATE_CURSOR_2X = `image-set(${url(24)} 1x, ${url(48)} 2x) 12 12, grab`;
export const ROTATE_CURSOR_1X = `${url(24)} 12 12, grab`;
let rotateCursor: string | null = null;
export function rotateCursorValue(): string {
  if (rotateCursor) return rotateCursor;
  // tipo estrutural: este módulo também roda nos testes de Node (sem a lib `dom`)
  const css = (globalThis as { CSS?: { supports?: (prop: string, value: string) => boolean } }).CSS;
  const supported = typeof css?.supports === 'function' && css.supports('cursor', ROTATE_CURSOR_2X);
  rotateCursor = supported ? ROTATE_CURSOR_2X : ROTATE_CURSOR_1X;
  return rotateCursor;
}

export const ERASER_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22'%3E%3Ccircle cx='11' cy='11' r='8' fill='white' fill-opacity='0.6' stroke='%23194B32' stroke-width='1.5'/%3E%3C/svg%3E\") 11 11, cell";

const CREATE_TOOLS: ReadonlySet<ToolType> = new Set<ToolType>(['sticky', 'shape', 'pen', 'highlighter', 'connector', 'lasso', 'frame', 'comment']);

export type CursorState =
  | {
      target: 'canvas';
      interaction: InteractionKind;
      tool: ToolType;
      spaceHeld: boolean;
      readOnly: boolean;
      /** objeto sob o ponteiro (null = área vazia) */
      hover?: { selected: boolean; locked: boolean } | null;
      /** tentou arrastar um objeto travado */
      blocked?: boolean;
      /** Alt + arrastar duplicando */
      copy?: boolean;
      /** cursor da alça em uso durante o redimensionamento */
      resize?: string | null;
    }
  | { target: 'resize-handle'; handle: HandleId; rotation: number }
  | { target: 'rotate-handle' }
  | { target: 'connection-point' }
  /** corpo da seleção (caixa da seleção múltipla, título do frame selecionado) */
  | { target: 'selection-body'; locked?: boolean };

export function cursorFor(s: CursorState): string {
  switch (s.target) {
    case 'resize-handle':
      return resizeCursor(s.handle, s.rotation);
    case 'rotate-handle':
      return rotateCursorValue();
    case 'connection-point':
      return 'crosshair';
    case 'selection-body':
      return s.locked ? 'default' : 'move';
    case 'canvas':
      break;
  }
  switch (s.interaction) {
    case 'panning':
      return 'grabbing';
    case 'rotating':
      return rotateCursorValue();
    case 'resizing':
      return s.resize ?? 'default';
    case 'dragging':
      return s.copy ? 'copy' : 'grabbing';
    default:
      break;
  }
  if (s.blocked) return 'not-allowed';
  if (s.spaceHeld || s.tool === 'hand' || s.readOnly) return 'grab';
  if (s.tool === 'eraser') return ERASER_CURSOR;
  if (s.tool === 'text') return 'text';
  if (CREATE_TOOLS.has(s.tool)) return 'crosshair';
  if (s.tool === 'select' && s.hover && !s.hover.locked && s.hover.selected) return 'move';
  return 'default';
}

/** O que `applyCursor` precisa de um elemento (estrutural, para rodar também sem a lib `dom`). */
export interface CursorTarget { style: { cursor: string } }
const lastApplied = new WeakMap<CursorTarget, string>();
/** Aplica o cursor só quando ele muda (nada de escrever no DOM a cada movimento do ponteiro). */
export function applyCursor(el: CursorTarget | null, value: string): void {
  if (!el || lastApplied.get(el) === value) return;
  lastApplied.set(el, value);
  el.style.cursor = value;
}
