import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, EyeOff, X } from 'lucide-react';
import { ScriptIcon } from '../icons/od';
import { useBoardStore } from '../../store/useBoardStore';
import { takePresentationStart } from '../../utils/boardActions';
import { orderedFrames } from '../../utils/frames';
import { fitRectInViewport, getElementBounds, worldRectToScreen } from '../../utils/math';
import { cn } from '../../utils/cn';
import { Tooltip } from '../ui/Tooltip';
import { useT } from '../../i18n/useT';

const IDLE_MS = 2600;

/**
 * Modo Apresentação (Chat 03 · Rodada B). Cada frame é um slide, na ordem de `slideOrder`
 * (reordenável na aba Frames do Painel).
 *
 * - Tela cheia (Fullscreen API) e câmera animada (`animateCameraTo`) até cada frame; o que fica
 *   fora do slide é coberto pela cor do canvas, então só o frame aparece.
 * - `→` `↓` `PageDown` espaço Enter avançam · `←` `↑` `PageUp` voltam · `Home`/`End` · `Esc` sai.
 *   Clicar no slide avança. Controles discretos somem após ~2,6 s sem mexer o mouse.
 * - Sem edição: o store bloqueia tudo no `ensure` enquanto `presenting` estiver ligado e esta
 *   camada captura ponteiro e teclado (nenhum atalho do board roda).
 * Diferença do padrão de mercado: o "índice de slides" é uma gaveta lateral compacta com os
 * títulos dos frames, e a navegação mantém o board vivo (é a mesma câmera, não uma cópia).
 */
export function PresentationDrawer() {
  const t = useT();
  const elements = useBoardStore((s) => s.elements);
  const order = useBoardStore((s) => s.elementOrder);
  const viewport = useBoardStore((s) => s.viewport);
  const camera = useBoardStore((s) => s.camera);
  const frames = useMemo(() => orderedFrames(elements, order), [elements, order]);

  const [index, setIndex] = useState(() => {
    const start = takePresentationStart();
    const s = useBoardStore.getState();
    const list = orderedFrames(s.elements, s.elementOrder);
    return Math.max(0, list.findIndex((f) => f.id === start));
  });
  const [idle, setIdle] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const idleTimer = useRef(0);
  const enteredFullscreen = useRef(false);

  const current = frames[Math.min(index, frames.length - 1)];
  const total = frames.length;

  const exit = useCallback(() => {
    useBoardStore.getState().setPresenting(false);
  }, []);

  const go = useCallback((next: number) => setIndex(Math.max(0, Math.min(total - 1, next))), [total]);

  // Câmera até o slide (também quando a tela muda de tamanho — ex.: ao entrar em tela cheia)
  useEffect(() => {
    if (!current) return;
    const target = fitRectInViewport(getElementBounds(current), viewport, Math.min(48, viewport.width * 0.04), 8);
    useBoardStore.getState().animateCameraTo(target, 420);
  }, [current, viewport]);

  // Sem frames (ex.: todos apagados por outra aba): sai
  useEffect(() => {
    if (total === 0) exit();
  }, [total, exit]);

  // Tela cheia ao entrar; sair da tela cheia (Esc do navegador) encerra a apresentação
  useEffect(() => {
    const root = document.documentElement;
    if (!document.fullscreenElement && typeof root.requestFullscreen === 'function') {
      root
        .requestFullscreen()
        .then(() => {
          enteredFullscreen.current = true;
        })
        .catch(() => undefined);
    }
    const onChange = () => {
      if (!document.fullscreenElement && enteredFullscreen.current) exit();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement && typeof document.exitFullscreen === 'function') void document.exitFullscreen().catch(() => undefined);
    };
  }, [exit]);

  // Teclado: captura antes dos atalhos do board
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      let handled = true;
      if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ' || k === 'Enter') go(index + 1);
      else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') go(index - 1);
      else if (k === 'Home') go(0);
      else if (k === 'End') go(total - 1);
      else if (k === 'Escape') {
        if (listOpen) setListOpen(false);
        else exit();
      } else handled = false;
      // nenhum atalho do board roda durante a apresentação; combinações com Ctrl/⌘ ficam com o navegador
      e.stopImmediatePropagation();
      if (handled || !(e.ctrlKey || e.metaKey)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [index, total, listOpen, go, exit]);

  // Controles somem quando o mouse para
  const wake = () => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), IDLE_MS);
  };
  useEffect(() => {
    idleTimer.current = window.setTimeout(() => setIdle(true), IDLE_MS);
    return () => window.clearTimeout(idleTimer.current);
  }, []);

  if (!current) return null;
  const slide = worldRectToScreen(getElementBounds(current), camera);
  const showControls = !idle || listOpen;

  return (
    <div
      className="absolute inset-0 z-[80] overflow-hidden"
      style={{ cursor: showControls ? 'default' : 'none' }}
      onPointerMove={wake}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      data-od-floating
      role="region"
      aria-roledescription={t('board.presentationDrawer.presentation')}
      aria-label={t('board.presentationDrawer.presentationMode')}
    >
      {/* Moldura: cobre o que está fora do slide com a cor do canvas; clicar no slide avança */}
      <button
        type="button"
        className="absolute block cursor-[inherit] rounded-[3px] outline-none"
        style={{ left: slide.x, top: slide.y, width: slide.width, height: slide.height, boxShadow: '0 0 0 100vmax var(--od-canvas)' }}
        onClick={() => go(index + 1)}
        aria-label={index < total - 1 ? t('board.presentationDrawer.nextSlide') : t('board.presentationDrawer.lastSlide')}
      />

      <span className="sr-only" aria-live="polite">{t('board.presentationDrawer.slideOfTotal', { index: index + 1, total, title: current.title || t('common.untitledFrame') })}</span>

      {/* Gaveta de slides */}
      <aside
        className={cn(
          'od-pop absolute bottom-20 start-4 top-4 flex w-[260px] flex-col overflow-hidden transition-[opacity,transform] duration-slow ease-out',
          listOpen ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-3 opacity-0',
        )}
        aria-hidden={!listOpen}
        aria-label={t('board.presentationDrawer.slides')}
      >
        <div className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">{t('board.presentationDrawer.slides')}</div>
        <ol className="flex-1 overflow-y-auto p-1.5">
          {frames.map((f, i) => (
            <li key={f.id}>
              <button
                type="button"
                className="od-menu-item"
                data-active={i === index}
                tabIndex={listOpen ? 0 : -1}
                onClick={() => {
                  go(i);
                  setListOpen(false);
                }}
                aria-current={i === index ? 'step' : undefined}
              >
                <span className={cn('w-5 text-end text-xs tabular-nums', i === index ? 'font-bold text-selection' : 'text-ink-subtle')}>{i + 1}</span>
                <span className={cn('flex-1 truncate', i === index && 'font-semibold')}>{f.title || t('common.untitledFrame')}</span>
                {f.hiddenContent && <EyeOff size={14} className="text-ink-subtle" aria-label={t('board.presentationDrawer.hiddenContent')} />}
              </button>
            </li>
          ))}
        </ol>
      </aside>

      {/* Controles discretos */}
      <div
        className={cn(
          'od-pop absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full px-1.5 py-1 transition-[opacity,transform] duration-slow ease-out',
          showControls ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
        )}
        role="toolbar"
        aria-label={t('board.presentationDrawer.presentationControls')}
      >
        <Tooltip label={t('board.presentationDrawer.slides')} side="top">
          <button type="button" className="od-tool h-8 w-8 rounded-full" data-active={listOpen} onClick={() => setListOpen((o) => !o)} aria-label={t('board.presentationDrawer.slideList')} aria-expanded={listOpen}>
            <ScriptIcon size={16} />
          </button>
        </Tooltip>
        <span className="od-divider-v" />
        <Tooltip label={t('board.presentationDrawer.previous')} side="top">
          <button type="button" className="od-tool h-8 w-8 rounded-full" disabled={index === 0} onClick={() => go(index - 1)} aria-label={t('board.presentationDrawer.previousSlide')}>
            <ChevronLeft size={18} />
          </button>
        </Tooltip>
        <span className="min-w-[150px] max-w-[300px] truncate px-2 text-center text-[13px] text-ink">
          <span className="font-semibold tabular-nums">
            {index + 1}/{total}
          </span>
          <span className="text-ink-muted"> · {current.title || t('common.untitledFrame')}</span>
        </span>
        <Tooltip label={t('board.presentationDrawer.nextSpace')} side="top">
          <button type="button" className="od-tool h-8 w-8 rounded-full" disabled={index >= total - 1} onClick={() => go(index + 1)} aria-label={t('board.presentationDrawer.nextSlide')}>
            <ChevronRight size={18} />
          </button>
        </Tooltip>
        <span className="od-divider-v" />
        <Tooltip label={t('board.presentationDrawer.exitEsc')} side="top">
          <button type="button" className="od-tool h-8 w-8 rounded-full" onClick={exit} aria-label={t('board.presentationDrawer.exitPresentation')}>
            <X size={16} />
          </button>
        </Tooltip>
      </div>

      {/* Barra de progresso fina no rodapé */}
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-[var(--od-border)]" aria-hidden="true">
        <div className="h-full bg-accent transition-[width] duration-slow ease-out" style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>
    </div>
  );
}
