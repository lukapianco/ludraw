/**
 * LuDraw — Geometria de paths SVG (Chat 05), escrita do zero a partir da especificação SVG 1.1
 * (W3C, "Paths" e "Implementation Notes" — conversão de arcos por parametrização de centro).
 *
 * Normaliza qualquer `d` para comandos ABSOLUTOS `M L C Q Z` (H/V viram L, S/T viram C/Q, arcos
 * viram cúbicas), o que permite transformar (matriz 2×3), medir (caixa exata com extremos das
 * curvas) e redimensionar formas importadas de SVG mantendo-as editáveis no board.
 */

export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** `m1 × m2` (aplica m2 primeiro). */
export function multiply(m1: Matrix, m2: Matrix): Matrix {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

export function applyToPoint(m: Matrix, x: number, y: number): [number, number] {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

export function translateMatrix(tx: number, ty: number): Matrix {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

export function scaleMatrix(sx: number, sy = sx): Matrix {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

export function rotateMatrix(deg: number, cx = 0, cy = 0): Matrix {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const rot = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
  return cx || cy ? multiply(multiply(translateMatrix(cx, cy), rot), translateMatrix(-cx, -cy)) : rot;
}

const NUMBER_RE = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;

export function parseNumbers(text: string): number[] {
  return (text.match(NUMBER_RE) ?? []).map(Number);
}

/** Atributo `transform` → matriz (matrix, translate, scale, rotate, skewX, skewY). */
export function parseTransform(text: string | null | undefined): Matrix {
  if (!text) return IDENTITY;
  let m = IDENTITY;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let x: RegExpExecArray | null;
  while ((x = re.exec(text))) {
    const n = parseNumbers(x[2]);
    let t: Matrix = IDENTITY;
    switch (x[1]) {
      case 'matrix':
        if (n.length >= 6) t = { a: n[0], b: n[1], c: n[2], d: n[3], e: n[4], f: n[5] };
        break;
      case 'translate':
        t = translateMatrix(n[0] ?? 0, n[1] ?? 0);
        break;
      case 'scale':
        t = scaleMatrix(n[0] ?? 1, n[1] ?? n[0] ?? 1);
        break;
      case 'rotate':
        t = rotateMatrix(n[0] ?? 0, n[1] ?? 0, n[2] ?? 0);
        break;
      case 'skewX':
        t = { a: 1, b: 0, c: Math.tan(((n[0] ?? 0) * Math.PI) / 180), d: 1, e: 0, f: 0 };
        break;
      case 'skewY':
        t = { a: 1, b: Math.tan(((n[0] ?? 0) * Math.PI) / 180), c: 0, d: 1, e: 0, f: 0 };
        break;
    }
    m = multiply(m, t);
  }
  return m;
}

/** Decomposição sem cisalhamento: escala por eixo + rotação (graus). `skewed` avisa quando não serve. */
export function decompose(m: Matrix): { sx: number; sy: number; rotation: number; skewed: boolean } {
  const sx = Math.hypot(m.a, m.b);
  const det = m.a * m.d - m.b * m.c;
  const sy = sx ? det / sx : Math.hypot(m.c, m.d);
  const rotation = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  const dot = m.a * m.c + m.b * m.d;
  return { sx, sy, rotation, skewed: Math.abs(dot) > 1e-6 * Math.max(1, sx * Math.abs(sy)) };
}

/** Fator de escala médio (para espessura de traço e tamanho de fonte). */
export function meanScale(m: Matrix): number {
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
}

export type PathSeg = { c: 'M'; p: [number, number] } | { c: 'L'; p: [number, number] } | { c: 'C'; p: [number, number, number, number, number, number] } | { c: 'Q'; p: [number, number, number, number] } | { c: 'Z' };

/** Arco elíptico (ponto final) → cúbicas, conforme as notas de implementação do SVG 1.1 (F.6). */
function arcToCubics(x1: number, y1: number, rx0: number, ry0: number, phiDeg: number, largeArc: boolean, sweep: boolean, x2: number, y2: number): PathSeg[] {
  if ((x1 === x2 && y1 === y2) || !rx0 || !ry0) return [{ c: 'L', p: [x2, y2] }];
  let rx = Math.abs(rx0);
  let ry = Math.abs(ry0);
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const k = Math.sqrt(lambda);
    rx *= k;
    ry *= k;
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let coef = den ? Math.sqrt(Math.max(0, num / den)) : 0;
  if (largeArc === sweep) coef = -coef;
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const parts = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / parts;
  const t = (4 / 3) * Math.tan(step / 4);
  const out: PathSeg[] = [];
  let a1 = theta1;
  const point = (ang: number): [number, number] => {
    const ex = rx * Math.cos(ang);
    const ey = ry * Math.sin(ang);
    return [cos * ex - sin * ey + cx, sin * ex + cos * ey + cy];
  };
  const deriv = (ang: number): [number, number] => {
    const ex = -rx * Math.sin(ang);
    const ey = ry * Math.cos(ang);
    return [cos * ex - sin * ey, sin * ex + cos * ey];
  };
  for (let i = 0; i < parts; i++) {
    const a2 = a1 + step;
    const p1 = point(a1);
    const p2 = point(a2);
    const d1 = deriv(a1);
    const d2 = deriv(a2);
    const end: [number, number] = i === parts - 1 ? [x2, y2] : p2;
    out.push({ c: 'C', p: [p1[0] + t * d1[0], p1[1] + t * d1[1], p2[0] - t * d2[0], p2[1] - t * d2[1], end[0], end[1]] });
    a1 = a2;
  }
  return out;
}

/** `d` → segmentos absolutos M/L/C/Q/Z. Comandos inválidos encerram a leitura (como o navegador faz). */
export function parsePathData(d: string): PathSeg[] {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? [];
  const out: PathSeg[] = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let lastC: [number, number] | null = null;
  let lastQ: [number, number] | null = null;
  const isCmd = (t: string) => /^[A-Za-z]$/.test(t);
  const num = (): number => {
    const t = tokens[i++];
    if (t === undefined || isCmd(t)) throw new Error('fim');
    return Number(t);
  };
  // flags de arco podem vir grudadas ("a1 1 0 01 10 10"): lê dígito a dígito quando preciso
  const flag = (): boolean => {
    const t = tokens[i];
    if (t === undefined || isCmd(t)) throw new Error('fim');
    if (t === '0' || t === '1') {
      i++;
      return t === '1';
    }
    if (/^[01]/.test(t)) {
      tokens[i] = t.slice(1);
      return t[0] === '1';
    }
    i++;
    return Number(t) !== 0;
  };
  try {
    while (i < tokens.length) {
      if (isCmd(tokens[i])) cmd = tokens[i++];
      else if (!cmd) break;
      const rel = cmd === cmd.toLowerCase();
      const C = cmd.toUpperCase();
      const ox = rel ? x : 0;
      const oy = rel ? y : 0;
      switch (C) {
        case 'M': {
          x = num() + ox;
          y = num() + oy;
          sx = x;
          sy = y;
          out.push({ c: 'M', p: [x, y] });
          cmd = rel ? 'l' : 'L';
          lastC = lastQ = null;
          break;
        }
        case 'L':
          x = num() + ox;
          y = num() + oy;
          out.push({ c: 'L', p: [x, y] });
          lastC = lastQ = null;
          break;
        case 'H':
          x = num() + ox;
          out.push({ c: 'L', p: [x, y] });
          lastC = lastQ = null;
          break;
        case 'V':
          y = num() + oy;
          out.push({ c: 'L', p: [x, y] });
          lastC = lastQ = null;
          break;
        case 'C': {
          const p = [num() + ox, num() + oy, num() + ox, num() + oy, num() + ox, num() + oy] as [number, number, number, number, number, number];
          out.push({ c: 'C', p });
          lastC = [p[2], p[3]];
          lastQ = null;
          x = p[4];
          y = p[5];
          break;
        }
        case 'S': {
          const c1: [number, number] = lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y];
          const p = [c1[0], c1[1], num() + ox, num() + oy, num() + ox, num() + oy] as [number, number, number, number, number, number];
          out.push({ c: 'C', p });
          lastC = [p[2], p[3]];
          lastQ = null;
          x = p[4];
          y = p[5];
          break;
        }
        case 'Q': {
          const p = [num() + ox, num() + oy, num() + ox, num() + oy] as [number, number, number, number];
          out.push({ c: 'Q', p });
          lastQ = [p[0], p[1]];
          lastC = null;
          x = p[2];
          y = p[3];
          break;
        }
        case 'T': {
          const c1: [number, number] = lastQ ? [2 * x - lastQ[0], 2 * y - lastQ[1]] : [x, y];
          const p = [c1[0], c1[1], num() + ox, num() + oy] as [number, number, number, number];
          out.push({ c: 'Q', p });
          lastQ = c1;
          lastC = null;
          x = p[2];
          y = p[3];
          break;
        }
        case 'A': {
          const rx = num();
          const ry = num();
          const rot = num();
          const large = flag();
          const sweep = flag();
          const ex = num() + ox;
          const ey = num() + oy;
          out.push(...arcToCubics(x, y, rx, ry, rot, large, sweep, ex, ey));
          x = ex;
          y = ey;
          lastC = lastQ = null;
          break;
        }
        case 'Z':
          out.push({ c: 'Z' });
          x = sx;
          y = sy;
          lastC = lastQ = null;
          break;
        default:
          return out;
      }
    }
  } catch {
    /* dados incompletos: mantém o que foi lido */
  }
  return out;
}

export function transformPath(segs: PathSeg[], m: Matrix): PathSeg[] {
  return segs.map((s) => {
    if (s.c === 'Z') return s;
    const p = s.p.slice() as number[];
    for (let k = 0; k < p.length; k += 2) {
      const [nx, ny] = applyToPoint(m, p[k], p[k + 1]);
      p[k] = nx;
      p[k + 1] = ny;
    }
    return { c: s.c, p } as PathSeg;
  });
}

function cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const ts: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) ts.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      ts.push((-b + sq) / (2 * a), (-b - sq) / (2 * a));
    }
  }
  return ts.filter((t) => t > 0 && t < 1);
}

const cubicAt = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
};

/** Caixa exata (inclui os extremos das curvas). */
export function pathBounds(segs: PathSeg[]): { x: number; y: number; width: number; height: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  for (const s of segs) {
    if (s.c === 'Z') {
      cx = sx;
      cy = sy;
      continue;
    }
    if (s.c === 'M') {
      sx = s.p[0];
      sy = s.p[1];
    }
    if (s.c === 'C') {
      const [x1, y1, x2, y2, x3, y3] = s.p;
      for (const t of cubicExtrema(cx, x1, x2, x3)) add(cubicAt(cx, x1, x2, x3, t), cubicAt(cy, y1, y2, y3, t));
      for (const t of cubicExtrema(cy, y1, y2, y3)) add(cubicAt(cx, x1, x2, x3, t), cubicAt(cy, y1, y2, y3, t));
    } else if (s.c === 'Q') {
      const [x1, y1, x2, y2] = s.p;
      // eleva a quadrática a cúbica para reaproveitar os extremos
      const c1x = cx + (2 / 3) * (x1 - cx);
      const c1y = cy + (2 / 3) * (y1 - cy);
      const c2x = x2 + (2 / 3) * (x1 - x2);
      const c2y = y2 + (2 / 3) * (y1 - y2);
      for (const t of [...cubicExtrema(cx, c1x, c2x, x2), ...cubicExtrema(cy, c1y, c2y, y2)]) add(cubicAt(cx, c1x, c2x, x2, t), cubicAt(cy, c1y, c2y, y2, t));
    }
    const p = s.p;
    add(p[p.length - 2], p[p.length - 1]);
    cx = p[p.length - 2];
    cy = p[p.length - 1];
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

const fmt = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

export function serializePath(segs: PathSeg[]): string {
  return segs.map((s) => (s.c === 'Z' ? 'Z' : `${s.c} ${s.p.map(fmt).join(' ')}`)).join(' ');
}

/** Escala um path normalizado (só M/L/C/Q/Z absolutos) da caixa (bw × bh) para (w × h). */
export function scaleNormalizedPath(d: string, bw: number, bh: number, w: number, h: number): string {
  const sx = bw ? w / bw : 1;
  const sy = bh ? h / bh : 1;
  if (Math.abs(sx - 1) < 1e-9 && Math.abs(sy - 1) < 1e-9) return d;
  return d.replace(/([MLCQ])([^MLCQZ]*)/g, (_, c: string, body: string) => {
    const n = parseNumbers(body);
    return `${c} ${n.map((v, i) => fmt(i % 2 === 0 ? v * sx : v * sy)).join(' ')} `;
  }).trim();
}

/** O path é um único segmento reto (vira conector em vez de forma)? */
export function asStraightLine(segs: PathSeg[]): [[number, number], [number, number]] | null {
  if (segs.length !== 2 || segs[0].c !== 'M' || segs[1].c !== 'L') return null;
  return [segs[0].p, segs[1].p];
}

/** Path só com retas (M/L/Z): lista de pontos (para polilinhas). */
export function polylinePoints(segs: PathSeg[]): [number, number][] | null {
  if (!segs.length || segs[0].c !== 'M') return null;
  const pts: [number, number][] = [];
  for (const s of segs) {
    if (s.c === 'M') {
      if (pts.length) return null; // vários subcaminhos
      pts.push(s.p);
    } else if (s.c === 'L') pts.push(s.p);
    else if (s.c === 'Z') continue;
    else return null;
  }
  return pts;
}
