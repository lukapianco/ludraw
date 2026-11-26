/**
 * Chat 08.2 · C-2 — cursores contextuais decididos num lugar só (`src/utils/cursors.ts`).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyCursor, cursorFor, resizeCursor, ROTATE_CURSOR_1X, ROTATE_CURSOR_2X, type CursorState, type CursorTarget } from '../../src/utils/cursors';

const base: Extract<CursorState, { target: 'canvas' }> = { target: 'canvas', interaction: 'idle', tool: 'select', spaceHeld: false, readOnly: false, hover: null };

test('objeto selecionado = move; não selecionado = seta; travado = seta', () => {
  assert.equal(cursorFor({ ...base, hover: { selected: true, locked: false } }), 'move');
  assert.equal(cursorFor({ ...base, hover: { selected: false, locked: false } }), 'default');
  assert.equal(cursorFor({ ...base, hover: { selected: true, locked: true } }), 'default');
  assert.equal(cursorFor({ ...base, hover: null }), 'default');
});

test('arrastar = grabbing; Alt + arrastar (duplica) = copy; tentar mover travado = not-allowed', () => {
  assert.equal(cursorFor({ ...base, interaction: 'dragging' }), 'grabbing');
  assert.equal(cursorFor({ ...base, interaction: 'dragging', copy: true }), 'copy');
  assert.equal(cursorFor({ ...base, blocked: true, hover: { selected: true, locked: true } }), 'not-allowed');
});

test('Mão e Espaço = grab, arrastando = grabbing; leitura sem edição = grab', () => {
  assert.equal(cursorFor({ ...base, tool: 'hand' }), 'grab');
  assert.equal(cursorFor({ ...base, spaceHeld: true, hover: { selected: true, locked: false } }), 'grab');
  assert.equal(cursorFor({ ...base, readOnly: true }), 'grab');
  assert.equal(cursorFor({ ...base, tool: 'hand', interaction: 'panning' }), 'grabbing');
});

test('ferramentas de criar = crosshair; Texto = text; borracha com cursor próprio', () => {
  for (const tool of ['sticky', 'shape', 'pen', 'highlighter', 'connector', 'lasso', 'frame', 'comment'] as const) assert.equal(cursorFor({ ...base, tool }), 'crosshair', tool);
  assert.equal(cursorFor({ ...base, tool: 'text' }), 'text');
  assert.match(cursorFor({ ...base, tool: 'eraser' }), /cell$/);
  assert.equal(cursorFor({ target: 'connection-point' }), 'crosshair');
});

test('alças: a direção certa acompanha a rotação (8 alças, 4 eixos)', () => {
  assert.equal(resizeCursor('n', 0), 'ns-resize');
  assert.equal(resizeCursor('e', 0), 'ew-resize');
  assert.equal(resizeCursor('ne', 0), 'nesw-resize');
  assert.equal(resizeCursor('se', 0), 'nwse-resize');
  // girado 90°: a alça de cima passa a apontar para o lado
  assert.equal(resizeCursor('n', 90), 'ew-resize');
  assert.equal(resizeCursor('ne', 90), 'nwse-resize');
  // 45°: a alça de cima vira diagonal
  assert.equal(resizeCursor('n', 45), 'nesw-resize');
  assert.equal(cursorFor({ target: 'resize-handle', handle: 'w', rotation: 180 }), 'ew-resize');
  // durante o redimensionamento vale o cursor da alça em uso
  assert.equal(cursorFor({ ...base, interaction: 'resizing', resize: 'nesw-resize' }), 'nesw-resize');
});

test('rotação: cursor próprio em SVG, 1x/2x, ponto ativo no centro e fallback nativo', () => {
  assert.match(ROTATE_CURSOR_2X, /^image-set\(url\("data:image\/svg\+xml,.*"\) 1x, url\("data:image\/svg\+xml,.*"\) 2x\) 12 12, grab$/);
  assert.match(ROTATE_CURSOR_2X, /width='24'/);
  assert.match(ROTATE_CURSOR_2X, /width='48'/);
  assert.ok(!/width='(\d{3,}|3[3-9]|[4-9]\d)'.*1x/.test(ROTATE_CURSOR_2X.split(' 1x')[0]), 'imagem 1x com no máximo 32 px');
  assert.match(ROTATE_CURSOR_1X, /12 12, grab$/);
  // sem CSS.supports (Node) usa a versão 1x, sempre com o fallback nativo
  assert.equal(cursorFor({ target: 'rotate-handle' }), ROTATE_CURSOR_1X);
  assert.equal(cursorFor({ ...base, interaction: 'rotating' }), ROTATE_CURSOR_1X);
});

test('applyCursor só escreve no DOM quando o cursor muda', () => {
  let writes = 0;
  const style: { cursor?: string } = {};
  const el = { style: new Proxy(style, { set: (o, k, v) => ((o as Record<string, unknown>)[k as string] = v, writes++, true) }) } as CursorTarget;
  applyCursor(el, 'move');
  applyCursor(el, 'move');
  applyCursor(el, 'move');
  applyCursor(el, 'grabbing');
  applyCursor(el, 'grabbing');
  assert.equal(writes, 2);
  assert.equal(style.cursor, 'grabbing');
});
