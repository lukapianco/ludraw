/**
 * LuDraw — cores distintas para a presença (Chat 08). PURO: o servidor decide a cor de cada pessoa no board
 * para que cursores, contornos e avatares nunca fiquem iguais ou parecidos (todas as telas veem a mesma cor).
 */

/** Diferença de cor (CIE76 ΔE) abaixo da qual duas pessoas seriam confundidas. ~30 separa bem com o nome ao lado. */
export const MIN_COLOR_DISTANCE = 30;

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toLab([r, g, b]: [number, number, number]): [number, number, number] {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const X = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
  const Y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  const Z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

/** Distância perceptual entre duas cores `#rrggbb` (cor inválida = infinita: nunca conflita). */
export function colorDistance(a: string, b: string): number {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return Infinity;
  const [l1, a1, b1] = toLab(ra);
  const [l2, a2, b2] = toLab(rb);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const x = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${x(f(0))}${x(f(8))}${x(f(4))}`;
}

/** Cores de reserva (matizes espaçados, saturação e luminosidade que leem bem nos temas claro e escuro). */
const EXTRA = Array.from({ length: 24 }, (_, i) => hslToHex((i * 15 + 7) % 360, 0.62, 0.44));

const minDistance = (c: string, taken: readonly string[]): number => taken.reduce((m, t) => Math.min(m, colorDistance(c, t)), Infinity);

/**
 * Mantém `wanted` se ela é diferente o bastante das cores já usadas; senão escolhe, entre a paleta e as reservas,
 * a que fica mais longe de todas as usadas (empate: a primeira da lista, para o resultado ser estável).
 */
export function pickDistinctColor(wanted: string, taken: readonly string[], palette: readonly string[]): string {
  if (minDistance(wanted, taken) >= MIN_COLOR_DISTANCE) return wanted;
  let best = wanted;
  let bestScore = -1;
  for (const c of [...palette, ...EXTRA]) {
    const score = minDistance(c, taken);
    if (score > bestScore + 0.5) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}
