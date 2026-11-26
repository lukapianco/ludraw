/**
 * LuDraw — Campo pontilhado da splash (Chat 03 · pré-tarefa 2).
 *
 * A grade de pontos do canvas do board aparece em volta do logo e reage à animação:
 *  - `reveal`  : os pontos surgem do centro para fora (como tinta se espalhando);
 *  - `ripple`  : uma onda circular empurra os pontos para fora e os acende na cor de seleção;
 *  - `spray`   : respingos de "tinta" lançados quando a bolinha se desprende da linha;
 *  - `ring`    : um anel fino que se abre quando o logo se completa.
 *
 * Canvas 2D puro, sem dependências. As cores chegam prontas (lidas dos tokens `--od-*`
 * pelo componente); nada de cor fixa aqui. O loop só roda enquanto há energia na cena e
 * para sozinho quando tudo assenta. Em "Reduzir movimento" desenha só a grade estática.
 */

export interface SplashFieldColors {
  /** Ponto da grade em repouso (`--od-canvas-dot`). */
  dot: string;
  /** Ponto aceso pela onda (`--od-selection`). */
  wave: string;
  /** Respingos (ex.: `--od-accent`, `--od-selection`, `--od-brand-400`). */
  spray: readonly string[];
  /** Anel de "encaixe" (`--od-accent`). */
  ring: string;
}

export interface SplashFieldOptions {
  colors: SplashFieldColors;
  reduceMotion?: boolean;
  /** Distância entre pontos, em px CSS. */
  spacing?: number;
  /** Duração do surgimento da grade, em ms (0 = já visível). */
  revealMs?: number;
}

export interface SplashField {
  /** Centro de referência (px relativos ao canvas): de onde a grade surge e onde fica o logo. */
  setCenter(x: number, y: number): void;
  ripple(x: number, y: number, strength?: number): void;
  spray(x: number, y: number, dirX: number, dirY: number, count?: number): void;
  ring(x: number, y: number, radius?: number): void;
  /** Recalcula tamanho/DPR (chame ao redimensionar). */
  resize(): void;
  stop(): void;
}

interface Ripple {
  x: number;
  y: number;
  born: number;
  strength: number;
}
interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  born: number;
  life: number;
}
interface Ring {
  x: number;
  y: number;
  r0: number;
  born: number;
}

const RIPPLE_SPEED = 820; // px/s
const RIPPLE_WIDTH = 46; // px
const RIPPLE_LIFE = 1.15; // s
const RING_LIFE = 0.62; // s

export function createSplashField(canvas: HTMLCanvasElement, options: SplashFieldOptions): SplashField {
  const ctx = canvas.getContext('2d');
  const spacing = options.spacing ?? 22;
  const reduce = options.reduceMotion ?? false;
  const revealMs = reduce ? 0 : (options.revealMs ?? 720);
  const { colors } = options;

  let width = 0;
  let height = 0;
  let cx = 0;
  let cy = 0;
  let raf = 0;
  let stopped = false;
  const startedAt = performance.now();
  const ripples: Ripple[] = [];
  const drops: Drop[] = [];
  const rings: Ring[] = [];
  let lastT = startedAt;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!cx && !cy) {
      cx = width / 2;
      cy = height / 2;
    }
    schedule();
  };

  const smooth = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };

  const render = (now: number) => {
    raf = 0;
    if (!ctx || stopped) return;
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    ctx.clearRect(0, 0, width, height);

    const minDim = Math.min(width, height);
    const inner = minDim * 0.22;
    const outer = Math.max(minDim * 0.78, 340);
    const revealT = revealMs ? Math.min(1, (now - startedAt) / revealMs) : 1;
    const revealEase = 1 - Math.pow(1 - revealT, 3);
    const revealR = outer * 1.15 * revealEase;

    // limpa ondas mortas
    for (let i = ripples.length - 1; i >= 0; i--) if ((now - ripples[i].born) / 1000 > RIPPLE_LIFE) ripples.splice(i, 1);

    const lit: { x: number; y: number; r: number; a: number }[] = [];
    // grade em repouso: 5 faixas de opacidade (holofote) → 5 paths, poucas trocas de estado
    const BANDS = 5;
    const bands: Path2D[] = Array.from({ length: BANDS }, () => new Path2D());
    const x0 = cx - Math.ceil(cx / spacing) * spacing;
    const y0 = cy - Math.ceil(cy / spacing) * spacing;
    for (let gy = y0; gy <= height + spacing; gy += spacing) {
      for (let gx = x0; gx <= width + spacing; gx += spacing) {
        const dx = gx - cx;
        const dy = gy - cy;
        const d = Math.hypot(dx, dy);
        // holofote: forte perto do logo, some nas bordas; surge do centro para fora
        const base = (1 - smooth(inner, outer, d)) * (revealT >= 1 ? 1 : smooth(revealR + 40, revealR - 40, d));
        if (base <= 0.02) continue;
        let px = gx;
        let py = gy;
        let energy = 0;
        for (const rp of ripples) {
          const t = (now - rp.born) / 1000;
          const front = t * RIPPLE_SPEED;
          const rdx = gx - rp.x;
          const rdy = gy - rp.y;
          const rd = Math.hypot(rdx, rdy) || 1;
          const k = (rd - front) / RIPPLE_WIDTH;
          const w = Math.exp(-k * k) * (1 - t / RIPPLE_LIFE) * rp.strength;
          if (w > 0.003) {
            px += (rdx / rd) * 7 * w;
            py += (rdy / rd) * 7 * w;
            energy += w;
          }
        }
        const r = (1.25 + Math.min(energy, 1.4) * 1.5) * (0.55 + 0.45 * base);
        if (energy > 0.04) lit.push({ x: px, y: py, r, a: base * Math.min(1, energy) });
        const band = bands[Math.min(BANDS - 1, Math.floor(base * BANDS))];
        band.moveTo(px + r, py);
        band.arc(px, py, r, 0, Math.PI * 2);
      }
    }
    ctx.fillStyle = colors.dot;
    bands.forEach((band, i) => {
      ctx.globalAlpha = (i + 1) / BANDS;
      ctx.fill(band);
    });

    if (lit.length) {
      ctx.fillStyle = colors.wave;
      for (const p of lit) {
        ctx.globalAlpha = Math.min(1, p.a * 0.9);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // anéis de encaixe
    for (let i = rings.length - 1; i >= 0; i--) {
      const rg = rings[i];
      const t = (now - rg.born) / 1000 / RING_LIFE;
      if (t >= 1) {
        rings.splice(i, 1);
        continue;
      }
      const e = 1 - Math.pow(1 - t, 3);
      ctx.globalAlpha = (1 - t) * 0.55;
      ctx.strokeStyle = colors.ring;
      ctx.lineWidth = 2.2 * (1 - t) + 0.4;
      ctx.beginPath();
      ctx.arc(rg.x, rg.y, rg.r0 + e * rg.r0 * 1.9, 0, Math.PI * 2);
      ctx.stroke();
    }

    // respingos de tinta (gravidade leve + arrasto; esticam na direção do movimento)
    for (let i = drops.length - 1; i >= 0; i--) {
      const dp = drops[i];
      const age = (now - dp.born) / 1000;
      if (age >= dp.life) {
        drops.splice(i, 1);
        continue;
      }
      dp.vx *= Math.pow(0.08, dt);
      dp.vy = dp.vy * Math.pow(0.08, dt) + 520 * dt;
      dp.x += dp.vx * dt;
      dp.y += dp.vy * dt;
      const sp = Math.hypot(dp.vx, dp.vy);
      const stretch = 1 + Math.min(sp / 260, 2.2);
      const fade = 1 - smooth(dp.life * 0.55, dp.life, age);
      ctx.globalAlpha = fade;
      ctx.fillStyle = dp.color;
      ctx.save();
      ctx.translate(dp.x, dp.y);
      ctx.rotate(Math.atan2(dp.vy, dp.vx));
      ctx.beginPath();
      ctx.ellipse(0, 0, dp.r * stretch, dp.r / Math.sqrt(stretch), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    if (revealT < 1 || ripples.length || drops.length || rings.length) schedule();
  };

  function schedule() {
    if (!raf && !stopped) raf = requestAnimationFrame(render);
  }

  resize();

  return {
    setCenter(x, y) {
      cx = x;
      cy = y;
      schedule();
    },
    ripple(x, y, strength = 1) {
      if (reduce) return;
      ripples.push({ x, y, born: performance.now(), strength });
      schedule();
    },
    spray(x, y, dirX, dirY, count = 14) {
      if (reduce) return;
      const m = Math.hypot(dirX, dirY) || 1;
      const base = Math.atan2(dirY / m, dirX / m);
      const t = performance.now();
      for (let i = 0; i < count; i++) {
        const a = base + (Math.random() - 0.5) * 1.25;
        const sp = 260 + Math.random() * 520;
        drops.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          r: 1.6 + Math.random() * 3.2,
          color: colors.spray[i % colors.spray.length],
          born: t,
          life: 0.55 + Math.random() * 0.5,
        });
      }
      schedule();
    },
    ring(x, y, radius = 16) {
      if (reduce) return;
      rings.push({ x, y, r0: radius, born: performance.now() });
      schedule();
    },
    resize,
    stop() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
