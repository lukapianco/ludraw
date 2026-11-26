import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { GripVertical, Music, Pause, Play, RotateCcw, Settings2, Volume2, VolumeX, X } from 'lucide-react';
import { DEFAULT_TIMER, timerRemaining, useBoardStore } from '../../store/useBoardStore';
import { useAppStore } from '../../store/useAppStore';
import { useCan } from '../../hooks/useCan';
import { formatClock, useNow } from '../../hooks/useFacilitationClock';
import { ambient, MUSIC_TRACKS } from '../../utils/ambientAudio';
import { cn } from '../../utils/cn';
import { Tooltip } from '../ui/Tooltip';
import { AnchoredPopover } from '../ui/AnchoredPopover';
import { TimerPanel } from './TimerMenu';
import { useT } from '../../i18n/useT';
import { useStudioBarClearance } from '../studio/useStudioBarClearance';

const RING = 46;

/**
 * Cronômetro flutuante (Chat 04) no canto superior direito do canvas — arrastável pelo card inteiro
 * (alça ⋮ ou qualquer área fora dos botões). O botão ⚙ abre as mesmas configurações da Régua.
 * Anel de progresso, contagem grande, controles do facilitador (iniciar/pausar, +1 min, zerar,
 * fechar) e o som local (silenciar a música / "Ativar som" quando o navegador bloqueia o áudio).
 * Continua visível no Modo Apresentação.
 */
export function TimerWidget() {
  const t = useT();
  const timer = useBoardStore((s) => s.facilitation.timer ?? DEFAULT_TIMER);
  const manage = useCan('timer.manage');
  const prefs = useAppStore((s) => s.audioPrefs);
  const setPrefs = useAppStore((s) => s.setAudioPrefs);
  const now = useNow(!!timer.running && !!timer.visible);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  // Canvas estreito: as faixas do topo (simulação, Modo Privado, votação) ocupam a largura toda — o cronômetro desce
  const bannerCount = useBoardStore((s) => (s.viewport.width < 1100 ? Number(!!s.facilitation.privateMode.enabled) + Number(!!s.facilitation.voting?.active && !s.facilitation.voting.revealed) : 0));
  const viewAs = useAppStore((s) => !!s.session.viewAs);
  const narrow = useBoardStore((s) => s.viewport.width < 1100);
  // Chat 08.2: começa abaixo da barra do topo quando cruzaria com ela (telas menores)
  const clear = useStudioBarClearance(12);
  const top = clear.top + (bannerCount + (narrow && viewAs ? 1 : 0)) * 46;
  const [, force] = useState(0);
  const [settings, setSettings] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      ref.current = node;
      clear.ref(node);
    },
    [clear.ref],
  );
  const b = useBoardStore.getState;

  // re-renderiza enquanto o áudio estiver bloqueado, para trocar o aviso "Ativar som"
  useEffect(() => {
    if (!timer.visible || timer.musicTrack === 'none' || prefs.musicMuted) return;
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [timer.visible, timer.musicTrack, prefs.musicMuted]);

  if (!timer.visible) return null;
  const remaining = timerRemaining(timer, now);
  const fraction = timer.durationMs > 0 ? Math.max(0, Math.min(1, remaining / timer.durationMs)) : 0;
  const finished = !timer.running && remaining <= 0;
  const lastMinute = timer.running && remaining <= 60_000;
  const track = MUSIC_TRACKS.find((t) => t.id === timer.musicTrack);
  const blocked = timer.running && timer.musicTrack !== 'none' && !prefs.musicMuted && ambient.needsGesture();
  const circ = 2 * Math.PI * (RING / 2 - 4);

  // Arrastar: alça ou fundo do card (botões, campos e o popover continuam clicáveis)
  const onDragStart = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (!t.closest('[data-timer-grip]') && t.closest('button, input, a, [role="slider"]')) return;
    e.preventDefault();
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    const parent = ref.current?.parentElement?.getBoundingClientRect();
    const box = ref.current?.getBoundingClientRect();
    document.body.style.cursor = 'grabbing';
    const onMove = (ev: PointerEvent) => {
      let x = start.ox + ev.clientX - start.x;
      let y = start.oy + ev.clientY - start.y;
      if (parent && box) {
        const baseLeft = box.left - start.ox;
        const baseTop = box.top - start.oy;
        x = Math.max(parent.left + 8 - baseLeft, Math.min(parent.right - 8 - box.width - baseLeft, x));
        y = Math.max(parent.top + 8 - baseTop, Math.min(parent.bottom - 8 - box.height - baseTop, y));
      }
      setOffset({ x, y });
    };
    const onUp = () => {
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  return (
    // O deslocamento fica no wrapper; a animação de entrada fica no card (a animação usa
    // fill-mode "both" e sobrescreveria um transform no mesmo elemento — era isso que travava o arrasto)
    <div
      ref={setRefs}
      data-od-floating
      className="absolute right-3 z-[44] transition-[top] duration-slow ease-out"
      style={{ top, transform: `translate(${offset.x}px, ${offset.y}px)` }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
    <div
      role="timer"
      aria-live={finished ? 'assertive' : 'off'}
      aria-label={finished ? t('widgets.timerWidget.timesUp') : t('widgets.timerWidget.timeLeftClock', { clock: formatClock(remaining) })}
      className={cn('od-panel flex animate-slide-up cursor-grab touch-none select-none items-center gap-2 py-1.5 pl-1 pr-1.5 active:cursor-grabbing', finished && 'ring-2 ring-danger')}
      onPointerDown={onDragStart}
    >
      <button type="button" data-timer-grip className="flex h-9 w-4 cursor-grab items-center justify-center text-ink-subtle active:cursor-grabbing" aria-label={t('widgets.timerWidget.moveTimerDrag')} title={t('widgets.timerWidget.dragMove')}>
        <GripVertical size={14} />
      </button>
      <div className="relative shrink-0" style={{ width: RING, height: RING }}>
        <svg width={RING} height={RING} className="-rotate-90" aria-hidden="true">
          <circle cx={RING / 2} cy={RING / 2} r={RING / 2 - 4} fill="none" stroke="var(--od-border)" strokeWidth={4} />
          <circle
            cx={RING / 2}
            cy={RING / 2}
            r={RING / 2 - 4}
            fill="none"
            stroke={finished || lastMinute ? 'var(--od-danger)' : 'var(--od-selection)'}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - fraction)}
            style={{ transition: 'stroke-dashoffset 260ms linear' }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center">
          {timer.running ? <span className="h-2 w-2 animate-pulse rounded-full bg-selection" /> : <Pause size={13} className="text-ink-subtle" />}
        </span>
      </div>
      <div className="min-w-[86px]">
        <div className={cn('text-[24px] font-extrabold leading-none tabular-nums tracking-tight', finished ? 'text-danger' : lastMinute ? 'text-danger' : 'text-ink')}>{formatClock(remaining)}</div>
        <div className="mt-1 text-[11px] font-semibold text-ink-subtle">{finished ? t('widgets.timerWidget.timesUp2') : timer.running ? t('widgets.timerWidget.running') : t('widgets.timerWidget.paused')}</div>
      </div>

      {manage.allowed && (
        <div className="flex items-center gap-0.5">
          <span className="od-divider-v mx-0.5" />
          <Tooltip label={timer.running ? t('widgets.timerWidget.pause') : finished ? t('widgets.timerWidget.restart') : t('widgets.timerWidget.resume')} side="bottom">
            <button
              type="button"
              className="od-tool h-8 w-8"
              onClick={() => {
                ambient.ensure();
                if (timer.running) b().pauseTimer();
                else b().startTimer(finished ? timer.durationMs : undefined);
              }}
              aria-label={timer.running ? t('widgets.timerWidget.pause') : t('widgets.timerWidget.resume')}
            >
              {timer.running ? <Pause size={16} /> : <Play size={15} className="fill-current" />}
            </button>
          </Tooltip>
          <Tooltip label={t('widgets.timerWidget.n1MoreMinute')} side="bottom">
            <button type="button" className="od-tool h-8 w-auto px-1.5 text-[12px] font-bold" onClick={() => b().addTimerTime(60_000)} aria-label={t('widgets.timerWidget.n1MoreMinute')}>
              +1
            </button>
          </Tooltip>
          <Tooltip label={t('widgets.timerWidget.reset')} side="bottom">
            <button type="button" className="od-tool h-8 w-8" onClick={() => b().resetTimer()} aria-label={t('widgets.timerWidget.resetTimer')}>
              <RotateCcw size={15} />
            </button>
          </Tooltip>
        </div>
      )}

      {timer.musicTrack !== 'none' && (
        <>
          <span className="od-divider-v mx-0.5" />
          {blocked ? (
            <button type="button" className="od-btn od-btn-soft od-btn-sm h-8 px-2" onClick={() => ambient.ensure()}>
              <Music size={14} />{' '}{t('widgets.timerWidget.turnSound')}</button>
          ) : (
            <Tooltip label={prefs.musicMuted ? (track ? t('widgets.timerWidget.listenTrack', { track: track.label }) : t('widgets.timerWidget.listenMusic')) : track ? t('widgets.timerWidget.muteTrackForYou', { track: track.label }) : t('widgets.timerWidget.muteMusicForYou')} side="bottom">
              <button
                type="button"
                className="od-tool h-8 w-auto gap-1 px-1.5 text-[11.5px] font-semibold"
                onClick={() => {
                  ambient.ensure();
                  setPrefs({ musicMuted: !prefs.musicMuted });
                }}
                aria-pressed={!prefs.musicMuted}
                aria-label={prefs.musicMuted ? t('widgets.timerWidget.listenMusic') : t('widgets.timerWidget.muteMusic')}
              >
                {prefs.musicMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                <span className="hidden sm:inline">{track?.label}</span>
              </button>
            </Tooltip>
          )}
        </>
      )}

      <Tooltip label={t('widgets.timerWidget.timerSettings')} side="bottom" disabled={!!settings}>
        <button
          type="button"
          data-od-menu-trigger
          className={cn('od-tool h-8 w-8', settings && 'bg-panel-hover text-ink')}
          onClick={() => setSettings(settings ? null : (ref.current?.querySelector('[role="timer"]') ?? ref.current)!.getBoundingClientRect())}
          aria-haspopup="dialog"
          aria-expanded={!!settings}
          aria-label={t('widgets.timerWidget.timerSettings')}
        >
          <Settings2 size={15} />
        </button>
      </Tooltip>
      {manage.allowed && (
        <Tooltip label={t('widgets.timerWidget.closeTimer')} side="bottom">
          <button type="button" className="od-tool h-8 w-7" onClick={() => b().setTimerVisible(false)} aria-label={t('widgets.timerWidget.closeTimer')}>
            <X size={15} />
          </button>
        </Tooltip>
      )}
    </div>
      {settings && (
        <AnchoredPopover anchor={settings} onClose={() => setSettings(null)} width={320} label={t('widgets.timerWidget.timerSettings')}>
          <TimerPanel canManage={manage.allowed} reason={manage.reason} onDone={() => setSettings(null)} />
        </AnchoredPopover>
      )}
    </div>
  );
}
