/**
 * Chat 08.2 · B (d): presença remota — UMA caixa e UMA etiqueta por pessoa (STUDIO_V2_SPEC §6).
 * Regras puras de `src/utils/presenceLayout.ts`: objetos de topo, união, etiqueta no canto superior direito, desvio
 * para baixo na borda da tela / colisão, empilhamento e contraste AA do texto da etiqueta.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLLABORATOR_PALETTE } from '../../src/collab/protocol';
import { pickDistinctColor } from '../../src/collab/colors';
import { contrastRatio } from '../../src/utils/color';
import { layoutPresence, presenceLabelColors, topLevelIds, unionRect, type PresencePersonInput } from '../../src/utils/presenceLayout';

const size = (text: string) => ({ width: text.length * 6 + 12, height: 18 });
const vp = { width: 1400, height: 900 };

test('filhos de um frame selecionado não contam; 60 objetos = 1 caixa e 1 etiqueta', () => {
  const parent: Record<string, string | null> = { frame: null, a: 'frame', b: 'frame', c: 'a', solto: null };
  assert.deepEqual(topLevelIds(['frame', 'a', 'b', 'c', 'solto'], (id) => parent[id]), ['frame', 'solto']);
  const rects = Array.from({ length: 60 }, (_, i) => ({ x: 100 + (i % 10) * 30, y: 200 + Math.floor(i / 10) * 30, width: 20, height: 20 }));
  const u = unionRect(rects)!;
  assert.deepEqual(u, { x: 100, y: 200, width: 290, height: 170 });
  const layout = layoutPresence([{ uid: 'bia', name: 'Bia Membro', color: '#2C64A8', selection: u, editing: null, selectionIsEditing: false }], vp, size);
  assert.equal(layout.boxes.length, 1);
  assert.equal(layout.labels.length, 1);
  const l = layout.labels[0];
  assert.equal(l.place, 'top');
  assert.equal(l.text, 'Bia', 'só o primeiro nome');
  assert.equal(l.x + l.width, layout.boxes[0].rect.x + layout.boxes[0].rect.width, 'canto superior DIREITO (o esquerdo é do título do frame)');
  assert.ok(l.y + l.height <= layout.boxes[0].rect.y, 'fora da caixa');
});

test('etiqueta desce na borda de cima da tela; várias pessoas no mesmo objeto empilham sem sobrepor', () => {
  const sel = { x: 500, y: 4, width: 200, height: 100 };
  const people: PresencePersonInput[] = ['Ana', 'Bia', 'Caio'].map((name, i) => ({ uid: name, name, color: COLLABORATOR_PALETTE[i], selection: sel, editing: null, selectionIsEditing: false }));
  const { labels } = layoutPresence(people, vp, size);
  assert.equal(labels.length, 3);
  assert.equal(labels[0].place, 'bottom', 'sem espaço em cima → canto inferior direito');
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i];
      const b = labels[j];
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      assert.equal(overlap, false, `${a.text} × ${b.text}`);
    }
});

test('edição: só o objeto editado, sem caixa por cima quando a seleção é ele mesmo', () => {
  const r = { x: 10, y: 300, width: 50, height: 50 };
  const layout = layoutPresence([{ uid: 'x', name: 'Xu', color: '#0E8A7D', selection: r, editing: r, selectionIsEditing: true }], vp, size);
  assert.equal(layout.edits.length, 1);
  assert.equal(layout.boxes.length, 0);
  assert.equal(layout.labels.length, 0, 'na edição o nome está no cursor; sem etiqueta');
});

test('contraste AA (≥ 4,5:1) do texto da etiqueta na paleta e nas cores geradas', () => {
  const colors = [...COLLABORATOR_PALETTE];
  for (let i = 0; i < 24; i++) colors.push(pickDistinctColor(COLLABORATOR_PALETTE[i % COLLABORATOR_PALETTE.length], colors, COLLABORATOR_PALETTE));
  for (const c of colors) {
    const l = presenceLabelColors(c);
    assert.ok(contrastRatio(l.text, l.background) >= 4.5, `${c}: ${contrastRatio(l.text, l.background).toFixed(2)}`);
  }
});
