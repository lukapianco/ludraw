/**
 * LuDraw — Diagrama por texto (Chat 04): parser + layout + conversão em elementos nativos.
 *
 * Sala limpa: parser PRÓPRIO, escrito a partir da sintaxe pública de fluxogramas (subconjunto):
 *   flowchart TD | graph LR            — direção: TD/TB (cima→baixo), BT, LR (esq.→dir.), RL
 *   A[Texto]  A(Texto)  A([Texto])     — retângulo, arredondado, cápsula
 *   A((Texto))  A{Texto}  A{{Texto}}   — círculo, losango (decisão), hexágono
 *   A[(Texto)]  A[/Texto/]  A[[Texto]] — cilindro (banco), paralelogramo (entrada/saída), sub-rotina
 *   A --> B   A --- B   A -.-> B   A ==> B   A <--> B   A --o B
 *   A -->|rótulo| B    A -- rótulo --> B    A --> B --> C    A & B --> C
 *   subgraph id [Título] … end         — vira um Frame com os nós dentro
 *   %% comentário · `;` separa comandos · classDef/class/style/click/linkStyle são ignorados (aviso)
 * Nenhuma biblioteca de terceiros é usada. O resultado são Formas + Conectores em cotovelo
 * (saltos de linha e desvio de objetos do Chat 03 funcionam) + Frames — tudo editável.
 */

import type { CanvasElement, ConnectorElement, ShapeElement, ShapeKind } from '../types/canvas';
import { createFrame, createShape } from './factory';
import { createConnector } from './connectors';
import { measureTextWidth, wrapText } from './text';
import type { Point } from './math';
import { t } from '../i18n';
import { formatCount } from '../i18n/format';

export type DiagramDirection = 'TB' | 'BT' | 'LR' | 'RL';
export type DiagramShape = 'rect' | 'round' | 'stadium' | 'circle' | 'diamond' | 'hexagon' | 'cylinder' | 'parallelogram' | 'subroutine' | 'flag';

export interface DiagramNode {
  id: string;
  text: string;
  shape: DiagramShape;
  subgraph: string | null;
  order: number;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
  style: 'solid' | 'dotted' | 'thick';
  startArrow: ConnectorElement['startArrow'];
  endArrow: ConnectorElement['endArrow'];
}

export interface DiagramSubgraph {
  id: string;
  title: string;
}

export interface DiagramIssue {
  line: number;
  message: string;
}

export interface ParsedDiagram {
  direction: DiagramDirection;
  nodes: Map<string, DiagramNode>;
  edges: DiagramEdge[];
  subgraphs: DiagramSubgraph[];
  errors: DiagramIssue[];
  warnings: DiagramIssue[];
}

/** Exemplo inicial do editor (no idioma ativo; vira texto do usuário depois de inserido). */
export function diagramExample(): string {
  return t('modals.diagram.exampleProcess');
}

export const DIAGRAM_SNIPPETS: { label: string; code: string }[] = [
  { get label() { return t('modals.diagram.process'); }, get code() { return diagramExample(); } },
  {
    get label() { return t('modals.diagram.leftRight'); },
    get code() { return t('modals.diagram.exampleLeftRight'); },
  },
  {
    get label() { return t('modals.diagram.withGroups'); },
    get code() { return t('modals.diagram.exampleGroups'); },
  },
];

/* ---------------------------------- Parser ----------------------------------- */

const ID_RE = /^[A-Za-z0-9_À-ɏ][A-Za-z0-9_\-À-ɏ.]*/;

/** Delimitadores de forma, na ordem de teste (os de 2 caracteres antes dos de 1). */
const SHAPES: { open: string; close: string[]; shape: DiagramShape }[] = [
  { open: '([', close: ['])'], shape: 'stadium' },
  { open: '[[', close: [']]'], shape: 'subroutine' },
  { open: '[(', close: [')]'], shape: 'cylinder' },
  { open: '((', close: ['))'], shape: 'circle' },
  { open: '{{', close: ['}}'], shape: 'hexagon' },
  { open: '[/', close: ['/]', '\\]'], shape: 'parallelogram' },
  { open: '[\\', close: ['\\]', '/]'], shape: 'parallelogram' },
  { open: '>', close: [']'], shape: 'flag' },
  { open: '[', close: [']'], shape: 'rect' },
  { open: '(', close: [')'], shape: 'round' },
  { open: '{', close: ['}'], shape: 'diamond' },
];

function cleanText(raw: string): string {
  let t = raw.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1);
  return t
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/#quot;/g, '"')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/** Divide uma linha em comandos por `;` fora de aspas e colchetes. */
function splitStatements(line: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = false;
  let cur = '';
  for (const ch of line) {
    if (ch === '"') quote = !quote;
    if (!quote) {
      if ('[({'.includes(ch)) depth++;
      if ('])}'.includes(ch)) depth = Math.max(0, depth - 1);
      if (ch === ';' && depth === 0) {
        out.push(cur);
        cur = '';
        continue;
      }
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

class Scanner {
  i = 0;
  constructor(readonly s: string) {}
  get rest(): string {
    return this.s.slice(this.i);
  }
  skipWs(): void {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++;
  }
  done(): boolean {
    this.skipWs();
    return this.i >= this.s.length;
  }
}

interface NodeRef {
  id: string;
  text?: string;
  shape?: DiagramShape;
}

function readNode(sc: Scanner): NodeRef | null {
  sc.skipWs();
  const m = ID_RE.exec(sc.rest);
  if (!m) return null;
  let id = m[0];
  // "A-->B" sem espaços: o id não pode engolir o início da seta
  const arrowIn = id.search(/-[-.]|==/);
  if (arrowIn > 0) id = id.slice(0, arrowIn);
  sc.i += id.length;
  const rest = sc.rest;
  for (const sh of SHAPES) {
    if (!rest.startsWith(sh.open)) continue;
    const body = rest.slice(sh.open.length);
    let end = -1;
    let closeLen = 0;
    if (body.trimStart().startsWith('"')) {
      const q0 = body.indexOf('"');
      const q1 = body.indexOf('"', q0 + 1);
      if (q1 > q0) {
        for (const c of sh.close) {
          const k = body.indexOf(c, q1 + 1);
          if (k >= 0 && (end < 0 || k < end)) {
            end = k;
            closeLen = c.length;
          }
        }
      }
    } else {
      for (const c of sh.close) {
        const k = body.indexOf(c);
        if (k >= 0 && (end < 0 || k < end)) {
          end = k;
          closeLen = c.length;
        }
      }
    }
    if (end < 0) throw new Error(t('modals.diagram.missingClosingOpenNodeId', { open: sh.open, id }));
    sc.i += sh.open.length + end + closeLen;
    // classe opcional :::nome
    const cls = /^:::[\w-]+/.exec(sc.rest);
    if (cls) sc.i += cls[0].length;
    return { id, text: cleanText(body.slice(0, end)), shape: sh.shape };
  }
  const cls = /^:::[\w-]+/.exec(sc.rest);
  if (cls) sc.i += cls[0].length;
  return { id };
}

function readNodeGroup(sc: Scanner): NodeRef[] | null {
  const first = readNode(sc);
  if (!first) return null;
  const group = [first];
  for (;;) {
    sc.skipWs();
    if (sc.rest.startsWith('&')) {
      sc.i++;
      const n = readNode(sc);
      if (!n) throw new Error(t('modals.diagram.expectedNodeAfter'));
      group.push(n);
    } else break;
  }
  return group;
}

interface EdgeToken {
  label?: string;
  style: DiagramEdge['style'];
  startArrow: DiagramEdge['startArrow'];
  endArrow: DiagramEdge['endArrow'];
}

const HEAD: Record<string, DiagramEdge['endArrow']> = { '>': 'arrow', o: 'circle', x: 'filled_arrow' };

function styleOf(body: string): DiagramEdge['style'] {
  if (body.includes('=')) return 'thick';
  if (body.includes('.')) return 'dotted';
  return 'solid';
}

function readEdge(sc: Scanner): EdgeToken | null {
  sc.skipWs();
  const rest = sc.rest;
  // Forma com rótulo no meio: "-- texto -->", "== texto ==>", "-. texto .->"
  const inline = /^(<)?(--|==|-\.)\s+(.+?)\s+(-{2,}>|={2,}>|\.-+>|-{3,}|={3,}|\.-+)(?=\s|$|[A-Za-z0-9_À-ɏ])/.exec(rest);
  if (inline && !/^[>-]/.test(inline[3])) {
    sc.i += inline[0].length;
    const tail = inline[4];
    return {
      label: cleanText(inline[3]),
      style: styleOf(inline[2] + tail),
      startArrow: inline[1] ? 'arrow' : 'none',
      endArrow: tail.endsWith('>') ? 'arrow' : 'none',
    };
  }
  const plain = /^(<)?(-{2,}|={2,}|-\.+-?)(>|x(?=[\s|])|o(?=[\s|]))?/.exec(rest);
  if (!plain) return null;
  sc.i += plain[0].length;
  const token: EdgeToken = {
    style: styleOf(plain[2]),
    startArrow: plain[1] ? 'arrow' : 'none',
    endArrow: plain[3] ? HEAD[plain[3]] : 'none',
  };
  sc.skipWs();
  const pipe = /^\|([^|]*)\|/.exec(sc.rest);
  if (pipe) {
    sc.i += pipe[0].length;
    token.label = cleanText(pipe[1]) || undefined;
  }
  return token;
}

/** Interpreta o texto. Comandos com erro são ignorados (com a linha no relatório); o resto continua. */
export function parseDiagram(source: string): ParsedDiagram {
  const result: ParsedDiagram = { direction: 'TB', nodes: new Map(), edges: [], subgraphs: [], errors: [], warnings: [] };
  const stack: string[] = [];
  let headerSeen = false;
  let order = 0;

  const touch = (ref: NodeRef) => {
    const cur = result.nodes.get(ref.id);
    const sub = stack[stack.length - 1] ?? null;
    if (!cur) {
      result.nodes.set(ref.id, { id: ref.id, text: ref.text ?? ref.id, shape: ref.shape ?? 'rect', subgraph: sub, order: order++ });
    } else {
      if (ref.text !== undefined) cur.text = ref.text;
      if (ref.shape) cur.shape = ref.shape;
      if (!cur.subgraph && sub) cur.subgraph = sub;
    }
  };

  source.split(/\r?\n/).forEach((rawLine, li) => {
    const lineNo = li + 1;
    let line = rawLine;
    const cmt = line.indexOf('%%');
    if (cmt >= 0) line = line.slice(0, cmt);
    for (const stmt of splitStatements(line)) {
      const header = /^(flowchart|graph)\b\s*(TD|TB|BT|LR|RL)?\s*$/i.exec(stmt);
      if (header) {
        if (headerSeen) result.warnings.push({ line: lineNo, message: t('modals.diagram.repeatedHeaderIgnored') });
        headerSeen = true;
        const d = (header[2] ?? 'TB').toUpperCase();
        result.direction = d === 'TD' ? 'TB' : (d as DiagramDirection);
        continue;
      }
      if (/^(classDef|class|style|linkStyle|click)\b/.test(stmt)) {
        result.warnings.push({ line: lineNo, message: t('modals.diagram.valueIsntAppliedUseAction', { value: stmt.split(/\s+/)[0] }) });
        continue;
      }
      if (/^direction\s+(TD|TB|BT|LR|RL)\s*$/i.test(stmt)) {
        result.warnings.push({ line: lineNo, message: t('modals.diagram.groupSpecificDirectionIgnoredDiagram') });
        continue;
      }
      const sub = /^subgraph\s+(.+)$/i.exec(stmt);
      if (sub) {
        const body = sub[1].trim();
        const m = /^([A-Za-z0-9_À-ɏ][\w\-À-ɏ]*)\s*\[(.+)\]\s*$/.exec(body);
        const id = m ? m[1] : `grupo-${result.subgraphs.length + 1}`;
        const title = cleanText(m ? m[2] : body);
        result.subgraphs.push({ id, title: title || id });
        stack.push(id);
        continue;
      }
      if (/^end$/i.test(stmt)) {
        if (!stack.length) result.errors.push({ line: lineNo, message: t('modals.diagram.endWithoutOpenSubgraph') });
        else stack.pop();
        continue;
      }
      try {
        const sc = new Scanner(stmt);
        let left = readNodeGroup(sc);
        if (!left) throw new Error(t('modals.diagram.didntRecognizeSlice', { slice: stmt.slice(0, 24) }));
        left.forEach(touch);
        while (!sc.done()) {
          const edge = readEdge(sc);
          if (!edge) throw new Error(t('modals.diagram.expectedArrowSlice', { slice: sc.rest.slice(0, 18) }));
          const right = readNodeGroup(sc);
          if (!right) throw new Error(t('modals.diagram.missingNodeAfterArrow'));
          right.forEach(touch);
          for (const a of left) for (const b of right) result.edges.push({ from: a.id, to: b.id, ...edge });
          left = right;
        }
      } catch (err) {
        result.errors.push({ line: lineNo, message: (err as Error).message });
      }
    }
  });
  if (stack.length) result.warnings.push({ line: source.split(/\r?\n/).length, message: t('modals.diagram.missingEndForGroups', { count: stack.length }) });
  if (!headerSeen && result.nodes.size) result.warnings.push({ line: 1, message: t('modals.diagram.noHeaderUsedFlowchartTd') });
  return result;
}

/* ---------------------------------- Layout ----------------------------------- */

export interface DiagramBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rank: number;
}

export interface DiagramLayout {
  boxes: Map<string, DiagramBox>;
  groups: { id: string; title: string; x: number; y: number; width: number; height: number }[];
  width: number;
  height: number;
}

const FONT = '16px "Open Sans", system-ui, sans-serif';
const RANK_GAP = 84;
const NODE_GAP = 56;
const GROUP_PAD = 36;

function nodeSize(n: DiagramNode): { width: number; height: number } {
  const lines = wrapText(n.text || ' ', 210, FONT);
  const textW = Math.max(...lines.map((l) => measureTextWidth(l, FONT)), 40);
  let w = Math.min(300, Math.max(150, textW + 52));
  let h = Math.max(76, lines.length * 21 + 40);
  switch (n.shape) {
    case 'diamond':
      w = Math.max(170, w * 1.35);
      h = Math.max(110, h * 1.45);
      break;
    case 'circle': {
      const d = Math.min(200, Math.max(110, Math.max(w, h) * 0.9));
      w = d;
      h = d;
      break;
    }
    case 'hexagon':
      w *= 1.15;
      break;
    case 'cylinder':
      h += 22;
      break;
    case 'parallelogram':
      w *= 1.22;
      break;
    default:
      break;
  }
  return { width: Math.round(w), height: Math.round(h) };
}

/** Layout em camadas (próprio): ranque por caminho mais longo, ordem por baricentro, grupos contíguos. */
export function layoutDiagram(p: ParsedDiagram): DiagramLayout {
  const ids = Array.from(p.nodes.values()).sort((a, b) => a.order - b.order).map((n) => n.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  const inn = new Map<string, string[]>(ids.map((id) => [id, []]));
  // quebra de ciclos (DFS na ordem de aparição): arestas de volta são invertidas só para o ranque
  const adj = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of p.edges) if (e.from !== e.to) adj.get(e.from)?.push(e.to);
  const state = new Map<string, 0 | 1 | 2>();
  const dag: [string, string][] = [];
  const visit = (u: string) => {
    state.set(u, 1);
    for (const v of adj.get(u) ?? []) {
      const st = state.get(v) ?? 0;
      if (st === 1) dag.push([v, u]);
      else {
        dag.push([u, v]);
        if (st === 0) visit(v);
      }
    }
    state.set(u, 2);
  };
  for (const id of ids) if (!state.get(id)) visit(id);
  for (const [u, v] of dag) {
    out.get(u)!.push(v);
    inn.get(v)!.push(u);
  }
  // ranque = caminho mais longo a partir das fontes
  const rank = new Map<string, number>();
  const indeg = new Map(ids.map((id) => [id, inn.get(id)!.length]));
  const queue = ids.filter((id) => indeg.get(id) === 0);
  for (const id of queue) rank.set(id, 0);
  while (queue.length) {
    const u = queue.shift()!;
    for (const v of out.get(u)!) {
      rank.set(v, Math.max(rank.get(v) ?? 0, (rank.get(u) ?? 0) + 1));
      indeg.set(v, indeg.get(v)! - 1);
      if (indeg.get(v) === 0) queue.push(v);
    }
  }
  for (const id of ids) if (!rank.has(id)) rank.set(id, 0);
  const maxRank = Math.max(0, ...rank.values());
  const layers: string[][] = Array.from({ length: maxRank + 1 }, () => []);
  for (const id of ids) layers[rank.get(id)!].push(id);

  // ordem: baricentro (descendo e subindo), mantendo os grupos contíguos
  const groupKey = (id: string) => p.nodes.get(id)!.subgraph ?? '';
  const pos = new Map<string, number>();
  const refresh = () => layers.forEach((l) => l.forEach((id, i) => pos.set(id, i)));
  const contiguous = (layer: string[]): string[] => {
    const groups: string[] = [];
    for (const id of layer) if (!groups.includes(groupKey(id))) groups.push(groupKey(id));
    return groups.flatMap((g) => layer.filter((id) => groupKey(id) === g));
  };
  refresh();
  for (let iter = 0; iter < 6; iter++) {
    const down = iter % 2 === 0;
    const range = down ? layers.map((_, i) => i).slice(1) : layers.map((_, i) => i).reverse().slice(1);
    for (const r of range) {
      const bary = (id: string) => {
        const ns = (down ? inn.get(id)! : out.get(id)!).filter((n) => rank.get(n) === (down ? r - 1 : r + 1));
        return ns.length ? ns.reduce((a, n) => a + pos.get(n)!, 0) / ns.length : pos.get(id)!;
      };
      const keyed = layers[r].map((id) => ({ id, b: bary(id), i: index.get(id)! }));
      keyed.sort((a, b) => a.b - b.b || a.i - b.i);
      layers[r] = contiguous(keyed.map((k) => k.id));
      refresh();
    }
  }

  const horizontal = p.direction === 'LR' || p.direction === 'RL';
  const sizes = new Map(ids.map((id) => [id, nodeSize(p.nodes.get(id)!)]));
  const along = (id: string) => (horizontal ? sizes.get(id)!.width : sizes.get(id)!.height);
  const across = (id: string) => (horizontal ? sizes.get(id)!.height : sizes.get(id)!.width);

  // posição ao longo do fluxo (por camada)
  // com grupos, as camadas se afastam mais: cada frame tem folga interna e o título fica acima dele
  const rankGap = RANK_GAP + (horizontal ? 40 : 0) + (p.subgraphs.length ? GROUP_PAD * 2 + 34 : 0);
  const rankPos: number[] = [];
  let cursor = 0;
  for (const layer of layers) {
    const thickness = Math.max(...layer.map(along), 0);
    rankPos.push(cursor + thickness / 2);
    cursor += thickness + rankGap;
  }
  // posição transversal: empilha centrado e depois puxa para a média dos vizinhos (3 passadas)
  const cross = new Map<string, number>();
  for (const layer of layers) {
    const total = layer.reduce((a, id) => a + across(id), 0) + NODE_GAP * Math.max(0, layer.length - 1);
    let c = -total / 2;
    for (const id of layer) {
      cross.set(id, c + across(id) / 2);
      c += across(id) + NODE_GAP;
    }
  }
  for (let iter = 0; iter < 4; iter++) {
    for (const layer of layers) {
      const desired = layer.map((id) => {
        const ns = [...inn.get(id)!, ...out.get(id)!];
        return ns.length ? ns.reduce((a, n) => a + cross.get(n)!, 0) / ns.length : cross.get(id)!;
      });
      // aplica respeitando a ordem e a folga mínima (varre ida e volta)
      const placed = desired.slice();
      for (let i = 1; i < layer.length; i++) {
        const min = placed[i - 1] + (across(layer[i - 1]) + across(layer[i])) / 2 + NODE_GAP;
        if (placed[i] < min) placed[i] = min;
      }
      for (let i = layer.length - 2; i >= 0; i--) {
        const max = placed[i + 1] - (across(layer[i + 1]) + across(layer[i])) / 2 - NODE_GAP;
        if (placed[i] > max) placed[i] = max;
      }
      layer.forEach((id, i) => cross.set(id, (cross.get(id)! + placed[i]) / 2));
      // garante a folga depois da média
      for (let i = 1; i < layer.length; i++) {
        const min = cross.get(layer[i - 1])! + (across(layer[i - 1]) + across(layer[i])) / 2 + NODE_GAP;
        if (cross.get(layer[i])! < min) cross.set(layer[i], min);
      }
    }
  }

  const flipAlong = p.direction === 'BT' || p.direction === 'RL';
  const span = cursor - rankGap;
  const boxes = new Map<string, DiagramBox>();
  for (const id of ids) {
    const s = sizes.get(id)!;
    let a = rankPos[rank.get(id)!];
    if (flipAlong) a = span - a;
    const c = cross.get(id)!;
    const cx = horizontal ? a : c;
    const cy = horizontal ? c : a;
    boxes.set(id, { id, x: Math.round(cx - s.width / 2), y: Math.round(cy - s.height / 2), width: s.width, height: s.height, rank: rank.get(id)! });
  }
  // normaliza para começar em (0, 0)
  const minX = Math.min(...Array.from(boxes.values()).map((b) => b.x), 0);
  const minY = Math.min(...Array.from(boxes.values()).map((b) => b.y), 0);
  let maxX = 0;
  let maxY = 0;
  for (const b of boxes.values()) {
    b.x -= minX;
    b.y -= minY;
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  const groups = p.subgraphs
    .map((g) => {
      const members = Array.from(boxes.values()).filter((b) => p.nodes.get(b.id)?.subgraph === g.id);
      if (!members.length) return null;
      const x0 = Math.min(...members.map((m) => m.x)) - GROUP_PAD;
      const y0 = Math.min(...members.map((m) => m.y)) - GROUP_PAD;
      const x1 = Math.max(...members.map((m) => m.x + m.width)) + GROUP_PAD;
      const y1 = Math.max(...members.map((m) => m.y + m.height)) + GROUP_PAD;
      return { id: g.id, title: g.title, x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    })
    .filter((g): g is NonNullable<typeof g> => !!g);
  return { boxes, groups, width: maxX, height: maxY };
}

/* -------------------------- Conversão em elementos --------------------------- */

const SHAPE_KIND: Record<DiagramShape, ShapeKind> = {
  rect: 'rectangle',
  round: 'rounded_rectangle',
  stadium: 'rounded_rectangle',
  circle: 'circle',
  diamond: 'diamond',
  hexagon: 'hexagon',
  cylinder: 'cylinder',
  parallelogram: 'parallelogram',
  subroutine: 'rectangle',
  flag: 'rectangle',
};

const SHAPE_FILL: Record<DiagramShape, string> = {
  rect: '#FFFFFF',
  round: '#FFFFFF',
  stadium: '#D0E4AE',
  circle: '#D0E4AE',
  diamond: '#FFF6A5',
  hexagon: '#E3EDF9',
  cylinder: '#E7F1D6',
  parallelogram: '#FBF0DC',
  subroutine: '#FFFFFF',
  flag: '#FBE6E2',
};

type Side = 'top' | 'right' | 'bottom' | 'left';

function anchorsFor(dir: DiagramDirection, a: DiagramBox, b: DiagramBox): [Side, Side] {
  const horizontal = dir === 'LR' || dir === 'RL';
  const forward = b.rank > a.rank;
  if (a.rank === b.rank) {
    // mesma camada: liga pelos lados que se olham
    if (horizontal) return b.y > a.y ? ['bottom', 'top'] : ['top', 'bottom'];
    return b.x > a.x ? ['right', 'left'] : ['left', 'right'];
  }
  if (forward) {
    if (dir === 'TB') return ['bottom', 'top'];
    if (dir === 'BT') return ['top', 'bottom'];
    if (dir === 'LR') return ['right', 'left'];
    return ['left', 'right'];
  }
  // aresta de volta: contorna pelo lado (direita no vertical, baixo no horizontal)
  return horizontal ? ['bottom', 'bottom'] : ['right', 'right'];
}

/** Gera Formas, Conectores e Frames (grupos) a partir do diagrama, com o canto superior esquerdo em `origin`. */
export function buildDiagramElements(p: ParsedDiagram, origin: Point = { x: 0, y: 0 }): CanvasElement[] {
  const layout = layoutDiagram(p);
  const shapes = new Map<string, ShapeElement>();
  for (const [id, box] of layout.boxes) {
    const n = p.nodes.get(id)!;
    shapes.set(
      id,
      createShape(SHAPE_KIND[n.shape], {
        x: origin.x + box.x,
        y: origin.y + box.y,
        width: box.width,
        height: box.height,
        text: n.text,
        fillColor: SHAPE_FILL[n.shape],
        strokeColor: '#194B32',
        strokeWidth: n.shape === 'subroutine' ? 3.5 : 2,
        fontSize: 16,
        fontWeight: n.shape === 'stadium' || n.shape === 'circle' ? 'bold' : 'normal',
      }),
    );
  }
  const all: CanvasElement[] = Array.from(shapes.values());
  const lookup = (id: string) => all.find((e) => e.id === id);
  const connectors: CanvasElement[] = [];
  for (const e of p.edges) {
    const a = shapes.get(e.from);
    const b = shapes.get(e.to);
    const ba = layout.boxes.get(e.from);
    const bb = layout.boxes.get(e.to);
    if (!a || !b || !ba || !bb || a === b) continue;
    const [sa, sb] = anchorsFor(p.direction, ba, bb);
    const conn = createConnector(
      { elementId: a.id, anchor: sa, x: 0, y: 0 },
      { elementId: b.id, anchor: sb, x: 0, y: 0 },
      {
        routingType: 'orthogonal',
        strokeColor: '#1C1C1E',
        strokeWidth: e.style === 'thick' ? 3.5 : 2,
        strokeStyle: e.style === 'dotted' ? 'dashed' : 'solid',
        startArrow: e.startArrow,
        endArrow: e.endArrow,
      },
      lookup,
    );
    connectors.push(e.label ? ({ ...conn, label: e.label } as CanvasElement) : conn);
  }
  const frames = layout.groups.map((g) => createFrame({ x: origin.x + g.x, y: origin.y + g.y, width: g.width, height: g.height }, { title: g.title, fillColor: '#F4F9EC' }));
  return [...frames, ...all, ...connectors];
}

/** Resumo legível (prévia do modal). */
export function describeDiagram(p: ParsedDiagram): string {
  const n = p.nodes.size;
  const e = p.edges.length;
  const g = p.subgraphs.length;
  return [formatCount('shape', n), formatCount('connector', e), ...(g ? [formatCount('group', g)] : [])].join(' · ');
}
