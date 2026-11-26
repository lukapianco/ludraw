import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { cn } from '../../utils/cn';
import {
  LOGO_INK_COLOR,
  LOGO_TILE_COLOR,
  LOGO_TRAIL_COUNT,
  SPLASH_LOGO,
  startLogoAnimation,
  type LogoAnimation,
  type LogoEvent,
} from '../../utils/logoAnimation';
import { createSplashField, type SplashField } from '../../utils/splashField';
import { SPLASH_EXIT_MS } from './useSplashGate';
import { useT } from '../../i18n/useT';

/**
 * Splash do LuDraw (Chat 03 · pré-tarefa 2) — `ai-memory/refs/SPLASH_SPEC.md`.
 *
 * Conceito (sobre a animação de referência criada pelo usuário):
 *  - o logo do boot estático "ganha vida": a bolinha dá um pulinho, rebobina o traço como
 *    uma trena, quica no início, redesenha a linha e é lançada de volta ao topo;
 *  - o fundo é o próprio canvas pontilhado do board: os pontos surgem do logo para fora,
 *    respingos de tinta saem quando a bolinha se solta e uma onda atravessa a grade quando
 *    o logo se completa (o ladrilho também sente cada impacto);
 *  - na saída, o canvas se abre a partir do logo como uma íris e revela o app, enquanto o
 *    logo — completo — encolhe levemente e some.
 * Sem texto visível (só o logo); o nome vai para o leitor de tela.
 * "Reduzir movimento" (preferência do app ou do sistema): logo completo e estático, só fade.
 */

export interface SplashScreenProps {
  /** Tempo mínimo + app pronto: termina a volta atual (logo completo) e sai. */
  ready: boolean;
  /** Failsafe: sai já, com o logo completo. */
  force?: boolean;
  /** Fim da saída: o pai remove a splash do DOM. */
  onExited?: () => void;
  /** `rewind` continua o boot estático (abertura do app); `intro` nasce de uma gota. */
  mode?: 'rewind' | 'intro';
  /** Dentro de um contêiner (exemplo do Design System) em vez de tela cheia. */
  contained?: boolean;
  /** Quando pronto, para no logo completo e não sai (exemplo do Design System). */
  stayOnSettle?: boolean;
  /** Força o modo estático (ignora a física). Padrão: preferência do app ou do sistema. */
  reduceMotion?: boolean;
  className?: string;
}

const LOGO_PX = 132;

function systemPrefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readToken(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

export function SplashScreen({ ready, force = false, onExited, mode = 'rewind', contained = false, stayOnSettle = false, reduceMotion, className }: SplashScreenProps) {
  const t = useT();
  const prefReduce = useAppStore((s) => s.preferences.reduceMotion);
  // decidido na montagem: trocar a preferência no meio da splash não reinicia nada
  const [reduce] = useState(() => reduceMotion ?? (prefReduce || systemPrefersReducedMotion()));

  const rootRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const tileRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const rectRef = useRef<SVGRectElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<SVGGElement>(null);
  const trailRefs = useRef<(SVGCircleElement | null)[]>([]);

  const animRef = useRef<LogoAnimation | null>(null);
  const fieldRef = useRef<SplashField | null>(null);
  const exitingRef = useRef(false);
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;

  /* ---------------------------- montagem / física --------------------------- */
  useLayoutEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const svg = svgRef.current;
    const path = pathRef.current;
    const dot = dotRef.current;
    if (!root || !canvas || !svg || !path || !dot) return;

    const field = createSplashField(canvas, {
      reduceMotion: reduce,
      revealMs: mode === 'intro' ? 900 : 720,
      colors: {
        dot: readToken(root, '--od-canvas-dot', 'currentColor'),
        wave: readToken(root, '--od-selection', 'currentColor'),
        ring: readToken(root, '--od-accent', 'currentColor'),
        spray: [readToken(root, '--od-accent', 'currentColor'), readToken(root, '--od-selection', 'currentColor'), readToken(root, '--od-brand-400', 'currentColor')],
      },
    });
    fieldRef.current = field;

    // coordenadas do viewBox 100 → px relativos à splash
    const toLocal = (x: number, y: number) => {
      const s = svg.getBoundingClientRect();
      const r = root.getBoundingClientRect();
      return { x: s.left - r.left + (x / SPLASH_LOGO.viewBox) * s.width, y: s.top - r.top + (y / SPLASH_LOGO.viewBox) * s.height };
    };
    const center = () => {
      const r = root.getBoundingClientRect();
      const s = svg.getBoundingClientRect();
      return { x: s.left - r.left + s.width / 2, y: s.top - r.top + s.height / 2 };
    };
    const recenter = () => {
      field.resize();
      const c = center();
      field.setCenter(c.x, c.y);
    };
    recenter();

    const bumpGlow = (amount: number) => {
      const glow = glowRef.current;
      if (!glow || typeof glow.animate !== 'function') return;
      glow.animate([{ transform: 'scale(1)' }, { transform: `scale(${1 + amount * 0.35})`, offset: 0.25 }, { transform: 'scale(1)' }], {
        duration: 700,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      });
    };

    const onEvent = (ev: LogoEvent) => {
      const at = toLocal(ev.x, ev.y);
      const c = center();
      if (ev.type === 'launch') {
        field.spray(at.x, at.y, ev.vx, ev.vy, 18);
        field.ripple(c.x, c.y, 0.5);
        bumpGlow(0.5);
      } else if (ev.type === 'nearSettle') {
        field.ripple(c.x, c.y, 1.1);
        field.ring(at.x, at.y, (SPLASH_LOGO.dotRadius / SPLASH_LOGO.viewBox) * LOGO_PX * 1.6);
        bumpGlow(1);
      } else if (ev.type === 'bounce') {
        field.ripple(at.x, at.y, 0.45);
        field.spray(at.x, at.y, ev.vx, ev.vy, 7);
      }
    };

    const trail = trailRefs.current.filter((c): c is SVGCircleElement => c !== null);
    const anim = startLogoAnimation({ path, dot, tile: tileRef.current, tileRect: rectRef.current, trail }, { reduceMotion: reduce, mode, onEvent });
    animRef.current = anim;

    // modo intro: a gota cai no canvas e espalha uma onda
    if (mode === 'intro' && !reduce) {
      const c = center();
      window.setTimeout(() => field.ripple(c.x, c.y, 0.9), 60);
    }
    // a vinheta das bordas entra junto com a grade (o boot estático é liso)
    if (!reduce && vignetteRef.current && typeof vignetteRef.current.animate === 'function') {
      vignetteRef.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' });
    }

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(recenter);
      ro.observe(root);
    } else {
      window.addEventListener('resize', recenter);
    }

    return () => {
      anim.stop();
      field.stop();
      animRef.current = null;
      fieldRef.current = null;
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', recenter);
    };
    // montagem única por instância (o Design System remonta com `key` para reproduzir)
  }, []);

  /* --------------------------------- saída --------------------------------- */
  useEffect(() => {
    if (exitingRef.current || (!ready && !force)) return;
    const anim = animRef.current;
    let cancelled = false;
    let maskRaf = 0;
    const timers: number[] = [];

    const finish = () => {
      if (!cancelled) onExitedRef.current?.();
    };

    const exit = () => {
      if (cancelled || exitingRef.current) return;
      exitingRef.current = true;
      const root = rootRef.current;
      const backdrop = backdropRef.current;
      const stage = stageRef.current;
      const svg = svgRef.current;
      const canAnimate = !!root && typeof root.animate === 'function';

      if (!root || !canAnimate) {
        finish();
        return;
      }
      if (reduce) {
        root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' });
        timers.push(window.setTimeout(finish, 270));
        return;
      }

      // íris: o canvas da splash se abre a partir do logo e revela o app por baixo
      const supportsMask = typeof CSS !== 'undefined' && (CSS.supports('mask-image', 'radial-gradient(black, transparent)') || CSS.supports('-webkit-mask-image', 'radial-gradient(black, transparent)'));
      if (backdrop && svg && supportsMask) {
        const r = root.getBoundingClientRect();
        const s = svg.getBoundingClientRect();
        const cx = s.left - r.left + s.width / 2;
        const cy = s.top - r.top + s.height / 2;
        const far = Math.hypot(Math.max(cx, r.width - cx), Math.max(cy, r.height - cy)) + 80;
        const startR = s.width * 0.42;
        const t0 = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - t0) / SPLASH_EXIT_MS);
          const e = 1 - Math.pow(1 - t, 3); // ease-out cúbico (≈ --od-ease-out)
          const rad = startR + (far - startR) * e;
          const mask = `radial-gradient(circle at ${cx}px ${cy}px, transparent ${rad}px, black ${rad + 56}px)`;
          backdrop.style.maskImage = mask;
          backdrop.style.setProperty('-webkit-mask-image', mask);
          if (t < 1) maskRaf = requestAnimationFrame(tick);
        };
        maskRaf = requestAnimationFrame(tick);
      } else if (backdrop) {
        backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: SPLASH_EXIT_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' });
      }
      stage?.animate(
        [
          { transform: 'scale(1)', opacity: 1 },
          { transform: 'scale(0.97)', opacity: 1, offset: 0.35 },
          { transform: 'scale(0.94)', opacity: 0 },
        ],
        { duration: SPLASH_EXIT_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
      );
      timers.push(window.setTimeout(finish, SPLASH_EXIT_MS + 20));
    };

    if (force) {
      anim?.finish();
      exit();
    } else if (anim) {
      anim.settleAtEnd(2800).then(() => {
        if (!stayOnSettle) exit();
      });
    } else if (!stayOnSettle) {
      exit();
    }

    return () => {
      cancelled = true;
      if (maskRaf) cancelAnimationFrame(maskRaf);
      timers.forEach((t) => window.clearTimeout(t));
      // em StrictMode o efeito roda 2×: permite recomeçar a saída na segunda montagem
      exitingRef.current = false;
    };
  }, [ready, force, reduce, stayOnSettle]);

  const ink = LOGO_INK_COLOR;
  return (
    <div
      ref={rootRef}
      role="status"
      aria-live="polite"
      className={cn(contained ? 'absolute inset-0 overflow-hidden' : 'fixed inset-0 z-[9999]', 'select-none', className)}
    >
      <span className="sr-only">{t('common.splashScreen.loadingLudraw')}</span>

      {/* Fundo: canvas do board + grade viva */}
      <div ref={backdropRef} className="absolute inset-0 bg-canvas" aria-hidden="true">
        <div
          ref={vignetteRef}
          className="absolute inset-0"
          style={{ background: 'radial-gradient(circle at 50% 50%, transparent 38%, color-mix(in srgb, var(--od-canvas) 93%, var(--od-text)) 100%)' }}
        />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      </div>

      {/* Logo (mesma posição/tamanho do boot estático de index.html) */}
      <div ref={stageRef} className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
        <div className="relative grid place-items-center">
          <div ref={glowRef} className="absolute h-[180px] w-[180px] rounded-full bg-accent opacity-[0.10] blur-[55px] dark:opacity-[0.12]" />
          <div
            ref={tileRef}
            className="relative"
            style={{ width: LOGO_PX, height: LOGO_PX, borderRadius: `${SPLASH_LOGO.tileRadius}%`, boxShadow: 'var(--od-shadow-modal)', willChange: reduce ? undefined : 'transform' }}
          >
            <svg ref={svgRef} viewBox="0 0 100 100" width={LOGO_PX} height={LOGO_PX} className="block overflow-visible" aria-hidden="true" focusable="false">
              <rect ref={rectRef} width="100" height="100" rx={SPLASH_LOGO.tileRadius} fill={LOGO_TILE_COLOR} />
              <circle cx={SPLASH_LOGO.segments[0][0].x} cy={SPLASH_LOGO.segments[0][0].y} r={SPLASH_LOGO.startDotRadius} fill={ink} />
              <path
                ref={pathRef}
                d={SPLASH_LOGO.pathD}
                pathLength={1}
                fill="none"
                stroke={ink}
                strokeWidth={SPLASH_LOGO.strokeWidth}
                strokeLinecap="round"
                style={{ strokeDasharray: '1 2', strokeDashoffset: 0 }}
              />
              {Array.from({ length: LOGO_TRAIL_COUNT }, (_, i) => (
                <circle
                  key={i}
                  ref={(el) => {
                    trailRefs.current[i] = el;
                  }}
                  r={SPLASH_LOGO.dotRadius * (0.86 - i * 0.1)}
                  cx={SPLASH_LOGO.finalDot.x}
                  cy={SPLASH_LOGO.finalDot.y}
                  fill={ink}
                  opacity={0}
                />
              ))}
              <g ref={dotRef} transform={`translate(${SPLASH_LOGO.finalDot.x} ${SPLASH_LOGO.finalDot.y})`}>
                <circle r={SPLASH_LOGO.dotRadius} fill={ink} />
              </g>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
