/**
 * LuDraw — desenho da presença remota (Chat 08.2 · B, `STUDIO_V2_SPEC.md` §6). PURO (sem DOM).
 *
 *  - UMA caixa por pessoa: a união dos objetos de TOPO que ela selecionou (filhos de um frame também selecionado não
 *    contam). Borda constante em px de tela (independe do zoom).
 *  - UMA etiqueta por pessoa, fora da caixa, no canto SUPERIOR DIREITO (o esquerdo é do título do frame). Encostou na
 *    borda da tela ou noutra etiqueta → canto inferior direito; ainda assim colidindo → empilha.
 *  - Edição: só o objeto editado (contorno + fundo suave + iniciais), sem etiqueta de nome.
 */
import { contrastRatio, mix } from './color';

const LIGHT_TEXT = '#FFFFFF';
const DARK_TEXT = '#111613';

/**
 * Cores da etiqueta com contraste WCAG AA (≥ 4,5:1): texto claro ou escuro, o que contrastar mais; se nenhum chegar
 * lá (cores de luminância média), o FUNDO da etiqueta escurece no mesmo matiz até o texto claro passar.
 */
export function presenceLabelColors(color: string): { background: string; text: string } {
  const best = contrastRatio(LIGHT_TEXT, color) >= contrastRatio(DARK_TEXT, color) ? LIGHT_TEXT : DARK_TEXT;
  if (contrastRatio(best, color) >= 4.5) return { background: color, text: best };
  for (let t = 0.08; t <= 0.8; t += 0.08) {
    const bg = mix(color, '#000000', t);
    if (contrastRatio(LIGHT_TEXT, bg) >= 4.5) return { background: bg, text: LIGHT_TEXT };
  }
  return { background: '#1C1C1E', text: LIGHT_TEXT };
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PresencePersonInput {
  uid: string;
  name: string;
  color: string;
  /** retângulo (em px de TELA) da seleção já unida; null = nada selecionado/visível */
  selection: Rect | null;
  /** retângulo do objeto que a pessoa edita; null = não edita */
  editing: Rect | null;
  /** a seleção é exatamente o objeto editado (não desenha caixa por cima da edição) */
  selectionIsEditing: boolean;
}

export interface PresenceLabel extends Rect {
  uid: string;
  text: string;
  color: string;
  place: 'top' | 'bottom';
}

export interface PresenceLayout {
  boxes: { uid: string; color: string; rect: Rect }[];
  labels: PresenceLabel[];
  edits: { uid: string; name: string; color: string; rect: Rect }[];
}

/** Ids sem nenhum ancestral (cadeia de `parentId`) também selecionado. */
export function topLevelIds(ids: string[], parentOf: (id: string) => string | null | undefined): string[] {
  const set = new Set(ids);
  return ids.filter((id) => {
    let p = parentOf(id);
    for (let guard = 0; p && guard < 32; guard++) {
      if (set.has(p)) return false;
      p = parentOf(p);
    }
    return true;
  });
}

export function unionRect(rects: (Rect | null)[]): Rect | null {
  let out: { x1: number; y1: number; x2: number; y2: number } | null = null;
  for (const r of rects) {
    if (!r) continue;
    if (!out) out = { x1: r.x, y1: r.y, x2: r.x + r.width, y2: r.y + r.height };
    else {
      out.x1 = Math.min(out.x1, r.x);
      out.y1 = Math.min(out.y1, r.y);
      out.x2 = Math.max(out.x2, r.x + r.width);
      out.y2 = Math.max(out.y2, r.y + r.height);
    }
  }
  return out ? { x: out.x1, y: out.y1, width: out.x2 - out.x1, height: out.y2 - out.y1 } : null;
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Distância (px) entre a caixa e o objeto, e entre a etiqueta e a caixa. */
export const BOX_PAD = 3;
const GAP = 2;

/**
 * Monta caixas, etiquetas e edições. `labelSize(text)` dá o tamanho da etiqueta (px); `viewport` = tamanho da tela.
 */
export function layoutPresence(people: PresencePersonInput[], viewport: { width: number; height: number }, labelSize: (text: string) => { width: number; height: number }): PresenceLayout {
  const boxes: PresenceLayout['boxes'] = [];
  const labels: PresenceLabel[] = [];
  const edits: PresenceLayout['edits'] = [];
  for (const p of people) {
    if (p.editing) edits.push({ uid: p.uid, name: p.name, color: p.color, rect: p.editing });
    if (!p.selection || p.selectionIsEditing) continue;
    const rect = { x: p.selection.x - BOX_PAD, y: p.selection.y - BOX_PAD, width: p.selection.width + BOX_PAD * 2, height: p.selection.height + BOX_PAD * 2 };
    boxes.push({ uid: p.uid, color: p.color, rect });
    const text = p.name.split(' ')[0] || p.name;
    const size = labelSize(text);
    const x = Math.min(Math.max(0, rect.x + rect.width - size.width), Math.max(0, viewport.width - size.width));
    const at = (place: 'top' | 'bottom', step: number): PresenceLabel => {
      const y = place === 'top' ? rect.y - size.height - GAP - step * (size.height + GAP) : rect.y + rect.height + GAP + step * (size.height + GAP);
      return { uid: p.uid, text, color: p.color, place, x, y, width: size.width, height: size.height };
    };
    const fits = (l: PresenceLabel) => l.y >= 0 && l.y + l.height <= viewport.height && !labels.some((o) => overlaps(o, l));
    let chosen: PresenceLabel | null = null;
    // superior direito → inferior direito → empilha (no lado que couber)
    for (let step = 0; step < 8 && !chosen; step++) {
      for (const place of ['top', 'bottom'] as const) {
        const l = at(place, step);
        if (fits(l)) {
          chosen = l;
          break;
        }
      }
    }
    labels.push(chosen ?? at(rect.y - size.height - GAP >= 0 ? 'top' : 'bottom', 0));
  }
  return { boxes, labels, edits };
}
