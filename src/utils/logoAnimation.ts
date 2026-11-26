/**
 * LuDraw — Animação do logo da splash (Chat 03 · pré-tarefa 2).
 *
 * Porte em TypeScript estrito da animação criada pelo usuário em
 * `ai-memory/refs/splash-reference.html` (autoria do usuário, ver `docs/PROVENANCE.md`):
 * a bolinha é puxada por uma mola amortecida ao longo da curva, desenha a linha, é lançada
 * no fim, assenta numa mola sub-amortecida e volta — com squash & stretch pela velocidade.
 *
 * Organização (sem DOM global solto):
 *  1. `createLogoPath`   — geometria da curva por amostragem analítica das Béziers (sem
 *                          `getTotalLength`), reutilizável em Canvas, SVG ou Node.
 *  2. `createLogoMotion` — máquina de fases + física pura. `advance(dt)` devolve a pose
 *                          (posição, % da linha, ângulo, escala) e eventos (lançou/assentou).
 *  3. `startLogoAnimation` — driver de DOM: recebe os nós do SVG por parâmetro, roda em
 *                          `requestAnimationFrame`, pausa com `visibilitychange` e devolve
 *                          `settleAtEnd()` / `stop()` (mesma API da referência).
 *
 * Extras da splash (só apresentação): o ladrilho reage aos impactos com uma mola própria,
 * a bolinha deixa um rastro curto quando está rápida e, no modo `intro`, o ladrilho nasce
 * como uma gota que se abre em quadrado. Tudo é desligado em "Reduzir movimento".
 */

/* -------------------------------------------------------------------------- */
/*  Geometria do logo da splash (viewBox 0 0 100 100)                          */
/* -------------------------------------------------------------------------- */

export interface Vec2 {
  x: number;
  y: number;
}

type Cubic = readonly [Vec2, Vec2, Vec2, Vec2];

/** Geometria da referência do usuário (`splash-reference.html`). */
export const SPLASH_LOGO = {
  viewBox: 100,
  tileRadius: 26,
  /** Mesmo traço da referência, em segmentos cúbicos. */
  pathD: 'M 24 64 C 35 35, 48 30, 56 44 C 63 56, 72 52, 76 39',
  segments: [
    [{ x: 24, y: 64 }, { x: 35, y: 35 }, { x: 48, y: 30 }, { x: 56, y: 44 }],
    [{ x: 56, y: 44 }, { x: 63, y: 56 }, { x: 72, y: 52 }, { x: 76, y: 39 }],
  ] as const satisfies readonly Cubic[],
  strokeWidth: 8,
  startDotRadius: 4,
  dotRadius: 7.8,
  /** Posição final da bolinha (logo completo). */
  finalDot: { x: 73.5, y: 27.5 } as Vec2,
} as const;

/** Cores fixas da marca no ícone (ladrilho verde-floresta + traço pistache). */
export const LOGO_TILE_COLOR = 'var(--od-brand-900)';
export const LOGO_INK_COLOR = 'var(--od-brand-200)';

export interface LogoPath {
  length: number;
  pointAt(distance: number): Vec2;
  start: Vec2;
  end: Vec2;
}

function cubicPoint([p0, p1, p2, p3]: Cubic, t: number): Vec2 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/** Tabela comprimento-de-arco → ponto (precisão bem abaixo de 0,01 unidade no viewBox 100). */
export function createLogoPath(segments: readonly Cubic[] = SPLASH_LOGO.segments, samplesPerSegment = 160): LogoPath {
  const pts: Vec2[] = [];
  const acc: number[] = [];
  let total = 0;
  segments.forEach((seg, si) => {
    for (let i = si === 0 ? 0 : 1; i <= samplesPerSegment; i++) {
      const p = cubicPoint(seg, i / samplesPerSegment);
      if (pts.length) {
        const prev = pts[pts.length - 1];
        total += Math.hypot(p.x - prev.x, p.y - prev.y);
      }
      pts.push(p);
      acc.push(total);
    }
  });
  const pointAt = (distance: number): Vec2 => {
    const d = Math.min(Math.max(distance, 0), total);
    let lo = 0;
    let hi = acc.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (acc[mid] < d) lo = mid;
      else hi = mid;
    }
    const span = acc[hi] - acc[lo] || 1;
    const t = (d - acc[lo]) / span;
    return { x: pts[lo].x + (pts[hi].x - pts[lo].x) * t, y: pts[lo].y + (pts[hi].y - pts[lo].y) * t };
  };
  return { length: total, pointAt, start: pts[0], end: pts[pts.length - 1] };
}

/* -------------------------------------------------------------------------- */
/*  Física em fases (pura, sem DOM)                                            */
/* -------------------------------------------------------------------------- */

export type LogoPhase = 'line' | 'airEnd' | 'holdEnd' | 'hopBack' | 'lineBack' | 'airStart' | 'holdStart';

interface SpringLine {
  k: number;
  c: number;
  target: number;
}

/** Ajustes finos — mesmos valores da referência (mexa aqui para dar mais/menos "peso"). */
export const LOGO_TUNING = {
  line: { k: 62, c: 9.2, target: 1.15 } as SpringLine,
  airEnd: { k: 210, c: 9.0, carry: 1.0, boost: 46 },
  hopBack: { k: 100, c: 7.0, kick: 120 },
  lineBack: { k: 40, c: 7.8, target: -0.16 } as SpringLine,
  airStart: { k: 190, c: 9.0, carry: 0.9, hop: 34 },
  holdEnd: 0.45,
  holdStart: 0.22,
} as const;

/** [ganho por unidade de velocidade, teto] do esticamento em cada fase. */
const STRETCH: Record<LogoPhase, readonly [number, number]> = {
  line: [0.0012, 0.22],
  airEnd: [0.0034, 0.28],
  hopBack: [0.0022, 0.16],
  lineBack: [0.0007, 0.12],
  airStart: [0.0016, 0.12],
  holdEnd: [0, 0],
  holdStart: [0, 0],
};

export interface LogoPose {
  phase: LogoPhase;
  /** Centro da bolinha (viewBox 100). */
  x: number;
  y: number;
  /** Fração da linha desenhada (0–1). */
  line: number;
  /** Ângulo do esticamento (graus) e escalas (volume preservado: sy = 1/√sx). */
  angle: number;
  sx: number;
  sy: number;
  /** Velocidade instantânea (unidades/s), útil para efeitos. */
  speed: number;
}

export type LogoEventType =
  /** desprendeu-se do fim da linha e foi lançada */
  | 'launch'
  /** chegou ao topo e está visualmente parado (amplitude < 1 unidade): logo completo */
  | 'nearSettle'
  /** assentou no topo de vez (critério estrito da referência) */
  | 'settle'
  /** caiu de volta no fim da linha e começou a recolher */
  | 'catch'
  /** passou do início por inércia e pulou */
  | 'bounce';

export interface LogoEvent {
  type: LogoEventType;
  x: number;
  y: number;
  /** Velocidade no momento do evento (unidades do viewBox por segundo) e seu vetor. */
  speed: number;
  vx: number;
  vy: number;
}

export interface LogoMotionOptions {
  /** Fase inicial. `holdEnd` = começa com o logo completo (continua o boot splash estático). */
  startPhase?: 'holdStart' | 'holdEnd';
  /** Pausa da primeira fase de espera, em segundos (padrão: a da tabela). */
  firstHold?: number;
  /** Multiplica a rigidez do recolhimento só na primeira volta (rebobinar mais rápido). */
  firstRewindBoost?: number;
  /**
   * Primeira volta "apressada": assenta no início com critério visual (não estrito) e encurta
   * a pausa no início. Usado quando a splash continua o boot estático, para não atrasar o app.
   */
  quickFirstLoop?: boolean;
  tuning?: typeof LOGO_TUNING;
}

export interface LogoMotion {
  /** Avança `dt` segundos (com subpassos internos de 1/240 s) e devolve a pose + eventos do quadro. */
  advance(dt: number): { pose: LogoPose; events: LogoEvent[] };
  readonly phase: LogoPhase;
  /** Pose estática do logo completo (bolinha no topo, linha cheia). */
  restPose(): LogoPose;
  /** `false` = ao assentar no topo, fica parada (não volta). Padrão: `true` (loop). */
  setLooping(loop: boolean): void;
}

export function createLogoMotion(geometry: LogoPath = createLogoPath(), options: LogoMotionOptions = {}): LogoMotion {
  const T = options.tuning ?? LOGO_TUNING;
  const L = geometry.length;
  const startPt = geometry.start;
  const endPt = geometry.end;
  const finalDot = SPLASH_LOGO.finalDot;

  const unit = (x: number, y: number): Vec2 => {
    const m = Math.hypot(x, y) || 1;
    return { x: x / m, y: y / m };
  };
  const a2 = geometry.pointAt(L - 2);
  const b2 = geometry.pointAt(2);
  const tEnd = unit(endPt.x - a2.x, endPt.y - a2.y); // direção da linha ao chegar no fim
  const tOut = unit(startPt.x - b2.x, startPt.y - b2.y); // direção de saída ao passar do início (voltando)
  const upFromEnd = unit(finalDot.x - endPt.x, finalDot.y - endPt.y);

  const startsComplete = options.startPhase === 'holdEnd';
  let phase: LogoPhase = startsComplete ? 'holdEnd' : 'holdStart';
  let s = startsComplete ? 1 : 0;
  let sv = 0;
  let hold = 0;
  let holdTarget = options.firstHold ?? (startsComplete ? T.holdEnd : T.holdStart);
  let rewindBoost = options.firstRewindBoost ?? 1;
  let quick = options.quickFirstLoop ?? false;
  let looping = true;
  let nearSent = false;
  let p: Vec2 = startsComplete ? { ...finalDot } : { ...startPt };
  let v: Vec2 = { x: 0, y: 0 };
  let prev: Vec2 = { ...p };
  let angle = 0;
  let stretch = 1;
  let events: LogoEvent[] = [];

  const emit = (type: LogoEventType, speed: number) => events.push({ type, x: p.x, y: p.y, speed, vx: v.x, vy: v.y });
  const enter = (name: LogoPhase) => {
    phase = name;
  };
  const freeSpring = (h: number, tx: number, ty: number, k: number, c: number) => {
    v = { x: v.x + ((tx - p.x) * k - v.x * c) * h, y: v.y + ((ty - p.y) * k - v.y * c) * h };
    p = { x: p.x + v.x * h, y: p.y + v.y * h };
  };

  const step = (h: number) => {
    if (phase === 'line') {
      const cfg = T.line;
      const g = s > 0.41 && s < 0.74 ? 1.8 : 0;
      sv += ((cfg.target - s) * cfg.k - sv * cfg.c + g) * h;
      s += sv * h;
      if (s >= 1) {
        // desprende: herda a velocidade da linha + impulso
        s = 1;
        const sp = Math.max(sv * L, 0) * T.airEnd.carry;
        p = { ...endPt };
        v = { x: tEnd.x * sp + upFromEnd.x * T.airEnd.boost, y: tEnd.y * sp + upFromEnd.y * T.airEnd.boost };
        emit('launch', Math.hypot(v.x, v.y));
        enter('airEnd');
      } else {
        p = geometry.pointAt(Math.max(s, 0) * L);
      }
    } else if (phase === 'airEnd') {
      freeSpring(h, finalDot.x, finalDot.y, T.airEnd.k, T.airEnd.c);
    } else if (phase === 'hopBack') {
      freeSpring(h, endPt.x, endPt.y, T.hopBack.k, T.hopBack.c);
      const dx = endPt.x - p.x;
      const dy = endPt.y - p.y;
      if (Math.hypot(dx, dy) < 1.6 && v.x * dx + v.y * dy > 0) {
        // caiu de volta no fim da linha: segue pela curva
        const back = Math.max(-(v.x * tEnd.x + v.y * tEnd.y), 25);
        emit('catch', Math.hypot(v.x, v.y));
        s = 1;
        sv = -back / L;
        enter('lineBack');
      }
    } else if (phase === 'lineBack') {
      const cfg = T.lineBack;
      const k = cfg.k * rewindBoost;
      const c = cfg.c * Math.sqrt(rewindBoost);
      const g = s > 0.41 && s < 0.74 ? -0.9 : 0;
      sv += ((cfg.target - s) * k - sv * c + g) * h;
      s += sv * h;
      if (s <= 0) {
        // passa do início por inércia e "pula"
        s = 0;
        const sp = Math.max(-sv * L, 0) * T.airStart.carry;
        p = { ...startPt };
        v = { x: tOut.x * sp, y: tOut.y * sp - T.airStart.hop };
        rewindBoost = 1;
        emit('bounce', Math.hypot(v.x, v.y));
        enter('airStart');
      } else {
        p = geometry.pointAt(s * L);
      }
    } else if (phase === 'airStart') {
      // na primeira volta apressada a mola do início é mais firme (assenta mais cedo)
      const firm = quick ? 1.8 : 1;
      freeSpring(h, startPt.x, startPt.y, T.airStart.k * firm, T.airStart.c * Math.sqrt(firm));
    }
  };

  const rested = (tx: number, ty: number) => Math.hypot(p.x - tx, p.y - ty) < 0.12 && Math.hypot(v.x, v.y) < 3;
  const nearlyRested = (tx: number, ty: number) => Math.hypot(p.x - tx, p.y - ty) < 0.9 && Math.hypot(v.x, v.y) < 18;

  const advance = (rawDt: number) => {
    events = [];
    const dt = Math.min(Math.max(rawDt, 0), 0.05);
    const n = Math.max(1, Math.ceil(dt / (1 / 240))); // subpassos: estável mesmo com quedas de FPS
    for (let i = 0; i < n; i++) step(dt / n);

    if (phase === 'airEnd' && !nearSent && nearlyRested(finalDot.x, finalDot.y)) {
      nearSent = true;
      emit('nearSettle', Math.hypot(v.x, v.y));
    }
    if (phase === 'airEnd' && rested(finalDot.x, finalDot.y)) {
      p = { ...finalDot };
      v = { x: 0, y: 0 };
      hold = 0;
      holdTarget = T.holdEnd;
      nearSent = false;
      emit('settle', 0);
      enter('holdEnd');
    } else if (phase === 'holdEnd') {
      hold += dt;
      if (looping && hold >= holdTarget) {
        // pulinho para trás: sobe um pouco antes de voltar
        v = { x: upFromEnd.x * T.hopBack.kick, y: upFromEnd.y * T.hopBack.kick };
        enter('hopBack');
      }
    } else if (phase === 'airStart' && (quick ? nearlyRested(startPt.x, startPt.y) : rested(startPt.x, startPt.y))) {
      p = { ...startPt };
      v = { x: 0, y: 0 };
      hold = 0;
      holdTarget = quick ? 0.06 : T.holdStart;
      quick = false;
      s = 0;
      sv = 0;
      enter('holdStart');
    } else if (phase === 'holdStart') {
      hold += dt;
      if (hold >= holdTarget) enter('line');
    }

    const lineRatio =
      phase === 'line' || phase === 'lineBack'
        ? Math.min(Math.max(s, 0), 1)
        : phase === 'airEnd' || phase === 'holdEnd' || phase === 'hopBack'
          ? 1
          : 0;
    const d = dt || 0.016;
    const vx = (p.x - prev.x) / d;
    const vy = (p.y - prev.y) / d;
    const speed = Math.hypot(vx, vy);
    const [gain, cap] = STRETCH[phase];
    const want = 1 + Math.min(speed * gain, cap);
    stretch += (want - stretch) * 0.5; // suaviza trocas de fase
    if (speed > 4) {
      // ângulo suavizado (menor caminho)
      const target = (Math.atan2(vy, vx) * 180) / Math.PI;
      const diff = ((target - angle + 540) % 360) - 180;
      angle += diff * 0.45;
    }
    prev = { ...p };
    const pose: LogoPose = { phase, x: p.x, y: p.y, line: lineRatio, angle, sx: stretch, sy: 1 / Math.sqrt(stretch), speed };
    return { pose, events };
  };

  return {
    advance,
    get phase() {
      return phase;
    },
    restPose: () => ({ phase: 'holdEnd', x: finalDot.x, y: finalDot.y, line: 1, angle: 0, sx: 1, sy: 1, speed: 0 }),
    setLooping(loop) {
      looping = loop;
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Mola 1D do ladrilho (reação a impactos + nascimento no modo intro)         */
/* -------------------------------------------------------------------------- */

export interface TileSpring {
  /** Impulso de velocidade na escala (positivo = incha, negativo = encolhe). */
  kick(impulse: number): void;
  advance(dt: number): { scale: number; squash: number };
}

export function createTileSpring(initialScale = 1, k = 260, c = 14): TileSpring {
  let x = initialScale;
  let vx = 0;
  return {
    kick(impulse) {
      vx += impulse;
    },
    advance(rawDt) {
      const dt = Math.min(Math.max(rawDt, 0), 0.05);
      const n = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        vx += ((1 - x) * k - vx * c) * h;
        x += vx * h;
      }
      // squash: quando a escala oscila, o ladrilho achata levemente na vertical (volume preservado)
      const squash = Math.max(-0.12, Math.min(0.12, -vx * 0.004));
      return { scale: x, squash };
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Driver de DOM                                                              */
/* -------------------------------------------------------------------------- */

export interface LogoAnimationNodes {
  /** `<path>` do traço, com `pathLength="1"` (o dash é normalizado). */
  path: SVGPathElement;
  /** `<g>` da bolinha (recebe translate/rotate/scale). */
  dot: SVGGElement;
  /**
   * Ladrilho inteiro (reação a impactos). Um elemento HTML que envolve o SVG recebe
   * `transform` + `border-radius` por CSS (a sombra acompanha); um `<g>` recebe o atributo. Opcional.
   */
  tile?: HTMLElement | SVGGElement | null;
  /** `<rect>` do ladrilho (o modo intro anima o raio de gota → quadrado). Opcional. */
  tileRect?: SVGRectElement | null;
  /** Círculos do rastro, do mais próximo ao mais distante. Opcional. */
  trail?: readonly SVGCircleElement[];
}

export interface LogoAnimationOptions {
  reduceMotion?: boolean;
  /**
   * `rewind` (padrão do app): começa no logo completo (igual ao boot splash estático),
   * rebobina e redesenha. `intro`: o ladrilho nasce como uma gota e a linha é desenhada do zero.
   */
  mode?: 'rewind' | 'intro';
  onEvent?: (event: LogoEvent) => void;
  /** Para testes/ambientes sem `requestAnimationFrame`/`document`. */
  env?: Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'> & { document?: Document; now?: () => number };
}

export interface LogoAnimation {
  /** Resolve quando o logo está COMPLETO e assentado (bolinha no topo) ou após `maxMs`. */
  settleAtEnd(maxMs?: number): Promise<void>;
  /** Cancela o loop e remove listeners. Idempotente. */
  stop(): void;
  /** Para tudo e desenha o logo completo e em repouso (usado pelo failsafe). */
  finish(): void;
}

const TRAIL_LENGTH = 6;

export function startLogoAnimation(nodes: LogoAnimationNodes, options: LogoAnimationOptions = {}): LogoAnimation {
  const env = options.env ?? window;
  const doc = options.env ? options.env.document : document;
  const now = options.env?.now ?? (() => performance.now());
  const { path, dot, tile, tileRect, trail = [] } = nodes;
  const R = SPLASH_LOGO.tileRadius;
  const C = SPLASH_LOGO.viewBox / 2;

  path.setAttribute('pathLength', '1');
  path.style.strokeDasharray = '1 2'; // vão maior que o traço: nenhuma ponta redonda "órfã" no fim com a linha vazia

  const draw = (pose: LogoPose) => {
    path.style.strokeDashoffset = String(1 - pose.line);
    dot.setAttribute('transform', `translate(${pose.x} ${pose.y}) rotate(${pose.angle}) scale(${pose.sx} ${pose.sy})`);
  };
  const drawTile = (scale: number, squash: number, radius: number) => {
    const sx = scale * (1 + squash);
    const sy = scale * (1 - squash);
    if (tile instanceof HTMLElement) {
      tile.style.transform = `scale(${sx}, ${sy})`;
      tile.style.borderRadius = `${radius}%`;
    } else if (tile) {
      tile.setAttribute('transform', `translate(${C} ${C}) scale(${sx} ${sy}) translate(${-C} ${-C})`);
    }
    if (tileRect) tileRect.setAttribute('rx', String(radius));
  };
  const hideTrail = () => trail.forEach((c) => c.setAttribute('opacity', '0'));

  const geometry = createLogoPath();
  const motion = createLogoMotion(
    geometry,
    options.mode === 'intro'
      ? { startPhase: 'holdStart', firstHold: 0.42 }
      : { startPhase: 'holdEnd', firstHold: 0.12, firstRewindBoost: 2.6, quickFirstLoop: true },
  );

  // Movimento reduzido: logo completo e estático, sem loop
  if (options.reduceMotion) {
    draw(motion.restPose());
    drawTile(1, 0, R);
    hideTrail();
    return { settleAtEnd: () => Promise.resolve(), stop() {}, finish() {} };
  }

  const intro = options.mode === 'intro';
  const tileSpring = createTileSpring(intro ? 0.18 : 1, intro ? 150 : 260, intro ? 10 : 14);
  let introT = intro ? 0 : 1; // 0→1: gota → ladrilho
  const history: Vec2[] = [];
  let settled = false;
  let waiters: (() => void)[] = [];
  let last = now();
  let raf = 0;
  let stopped = false;

  const frame = (t: number) => {
    if (stopped) return;
    // o carimbo do rAF pode ser um pouco anterior ao `now()` inicial: nunca negativo
    const dt = Math.min(Math.max((t - last) / 1000, 0), 0.05);
    last = t;
    const { pose, events } = motion.advance(dt);

    for (const ev of events) {
      // o ladrilho sente os impactos: incha ao lançar, achata ao receber
      if (ev.type === 'launch') tileSpring.kick(0.9);
      else if (ev.type === 'settle') tileSpring.kick(-0.55);
      else if (ev.type === 'catch') tileSpring.kick(-0.35);
      else if (ev.type === 'bounce') tileSpring.kick(0.4);
      if (ev.type === 'nearSettle' || ev.type === 'settle') {
        if (!settled && waiters.length) {
          // quem pediu settleAtEnd quer terminar aqui: a bolinha fica parada no topo
          motion.setLooping(false);
          waiters.forEach((resolve) => resolve());
          waiters = [];
        }
        settled = true;
      }
      options.onEvent?.(ev);
    }
    if (pose.phase !== 'holdEnd' && pose.phase !== 'airEnd') settled = false;

    if (introT < 1) introT = Math.min(1, introT + dt / 0.5);
    const easeIntro = 1 - Math.pow(1 - introT, 3);
    const tilePose = tileSpring.advance(dt);
    drawTile(tilePose.scale, tilePose.squash, 50 + (R - 50) * easeIntro);
    draw(pose);

    // rastro: só aparece com velocidade (fica invisível em repouso)
    history.unshift({ x: pose.x, y: pose.y });
    if (history.length > TRAIL_LENGTH * 2) history.length = TRAIL_LENGTH * 2;
    const energy = Math.min(1, Math.max(0, (pose.speed - 40) / 160));
    trail.forEach((circle, i) => {
      const h = history[Math.min(history.length - 1, (i + 1) * 2)];
      circle.setAttribute('cx', String(h.x));
      circle.setAttribute('cy', String(h.y));
      circle.setAttribute('opacity', String((energy * 0.42 * (trail.length - i)) / trail.length));
    });

    raf = env.requestAnimationFrame(frame);
  };

  const onVisibility = () => {
    if (!doc) return;
    if (doc.hidden) env.cancelAnimationFrame(raf);
    else if (!stopped) {
      last = now();
      raf = env.requestAnimationFrame(frame);
    }
  };

  function stop() {
    if (stopped) return;
    stopped = true;
    env.cancelAnimationFrame(raf);
    doc?.removeEventListener('visibilitychange', onVisibility);
    waiters.forEach((resolve) => resolve());
    waiters = [];
  }

  doc?.addEventListener('visibilitychange', onVisibility);
  draw(intro ? { ...motion.restPose(), x: geometry.start.x, y: geometry.start.y, line: 0 } : motion.restPose());
  drawTile(intro ? 0.18 : 1, 0, intro ? 50 : R);
  hideTrail();
  raf = env.requestAnimationFrame(frame);

  return {
    settleAtEnd(maxMs = 2800) {
      return new Promise<void>((resolve) => {
        if (stopped || settled) {
          motion.setLooping(false);
          resolve();
          return;
        }
        const timer = setTimeout(resolve, maxMs);
        waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
    stop,
    finish() {
      stop();
      draw(motion.restPose());
      drawTile(1, 0, R);
      hideTrail();
    },
  };
}

/** Quantidade de círculos de rastro que o componente deve renderizar. */
export const LOGO_TRAIL_COUNT = TRAIL_LENGTH;
