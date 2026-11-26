import { useState } from 'react';
import { BellRing, Headphones, Play, Timer, Volume2, VolumeX } from 'lucide-react';
import { DEFAULT_TIMER, timerRemaining, useBoardStore } from '../../store/useBoardStore';
import { useAppStore } from '../../store/useAppStore';
import { useCan } from '../../hooks/useCan';
import { formatClock, useNow } from '../../hooks/useFacilitationClock';
import { ambient, MUSIC_TRACKS } from '../../utils/ambientAudio';
import { cn } from '../../utils/cn';
import { Tooltip } from '../ui/Tooltip';
import { AnchoredPopover } from '../ui/AnchoredPopover';
import { useT } from '../../i18n/useT';

const PRESETS = [1, 3, 5, 10, 15];

/**
 * Cronômetro na Régua (Chat 04): durações prontas (1, 3, 5, 10, 15 min) ou personalizada, música
 * ambiente procedural (Lo-Fi, Ambient Pad, Focus Pulse) e preferências locais de som. Iniciar,
 * pausar e trocar a trilha exigem `timer.manage` (facilitador); volume/silenciar/alarme são
 * escolhas de cada pessoa neste navegador.
 */
export function TimerMenu() {
  const t = useT();
  const timer = useBoardStore((s) => s.facilitation.timer ?? DEFAULT_TIMER);
  const manage = useCan('timer.manage');
  const now = useNow(!!timer.running);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const showing = !!timer.visible;
  const remaining = timerRemaining(timer, now);

  return (
    <>
      <Tooltip label={t('widgets.timerMenu.timerMusic')} side="bottom" disabled={!!anchor}>
        <button
          type="button"
          data-od-menu-trigger
          className={cn('od-btn od-btn-sm h-8 px-2 tabular-nums', showing ? 'od-btn-soft text-brand-900 dark:text-brand-200' : 'od-btn-ghost text-ink-muted')}
          aria-haspopup="dialog"
          aria-expanded={!!anchor}
          aria-label={t('widgets.timerMenu.timer')}
          onClick={(e) => setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect())}
        >
          <Timer size={16} />
          {showing ? <span className="text-[12.5px] font-bold">{formatClock(remaining)}</span> : <span className="hidden min-[1600px]:inline">{t('widgets.timerMenu.timer')}</span>}
        </button>
      </Tooltip>
      {anchor && (
        <AnchoredPopover anchor={anchor} onClose={() => setAnchor(null)} width={320} label={t('widgets.timerMenu.timer')}>
          <TimerPanel canManage={manage.allowed} reason={manage.reason} onDone={() => setAnchor(null)} />
        </AnchoredPopover>
      )}
    </>
  );
}

/** Painel de configurações do cronômetro — usado na Régua e no botão ⚙ do cronômetro flutuante. */
export function TimerPanel({ canManage, reason, onDone }: { canManage: boolean; reason?: string; onDone: () => void }) {
  const t = useT();
  const timer = useBoardStore((s) => s.facilitation.timer ?? DEFAULT_TIMER);
  const prefs = useAppStore((s) => s.audioPrefs);
  const setPrefs = useAppStore((s) => s.setAudioPrefs);
  const [min, setMin] = useState(String(Math.floor(timer.durationMs / 60000) || 5));
  const [sec, setSec] = useState(String(Math.round((timer.durationMs % 60000) / 1000)));
  const b = useBoardStore.getState;

  const start = (ms: number) => {
    ambient.ensure(); // o clique libera o áudio do navegador
    b().startTimer(ms);
    onDone();
  };

  return (
    <div className="p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-brand-900 dark:text-brand-200">
          <Timer size={17} />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-bold text-ink">{t('widgets.timerMenu.boardTimer')}</div>
          <div className="text-xs text-ink-subtle">{t('widgets.timerMenu.everyoneSeesSameCountdown')}</div>
        </div>
      </div>

      {canManage ? (
        <>
          <div className="mt-3 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{t('widgets.timerMenu.startNow')}</div>
          <div className="mt-1.5 grid grid-cols-5 gap-1.5">
            {PRESETS.map((m) => (
              <button key={m} type="button" className="od-btn od-btn-secondary od-btn-sm h-9 px-0 font-bold tabular-nums" onClick={() => start(m * 60_000)}>
                {t('widgets.timerMenu.mMin', { m })}</button>
            ))}
          </div>
          <div className="mt-2.5 flex items-center gap-1.5">
            <span className="text-xs font-semibold text-ink-muted">{t('widgets.timerMenu.custom')}</span>
            <input className="od-input h-8 w-14 px-2 text-center tabular-nums" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, '').slice(0, 3))} aria-label={t('widgets.timerMenu.minutes')} />
            <span className="text-ink-subtle">:</span>
            <input className="od-input h-8 w-14 px-2 text-center tabular-nums" inputMode="numeric" value={sec} onChange={(e) => setSec(e.target.value.replace(/\D/g, '').slice(0, 2))} aria-label={t('widgets.timerMenu.seconds')} />
            <button
              type="button"
              className="od-btn od-btn-primary od-btn-sm ml-auto h-8"
              onClick={() => {
                const ms = (Number(min || 0) * 60 + Math.min(59, Number(sec || 0))) * 1000;
                if (ms >= 1000) start(ms);
              }}
            >
              <Play size={13} className="fill-current" />{' '}{t('widgets.timerMenu.start')}</button>
          </div>
          {timer.visible && (
            <button type="button" className="od-btn od-btn-ghost od-btn-sm mt-2 w-full text-ink-muted" onClick={() => b().setTimerVisible(false)}>{t('widgets.timerMenu.closeTimer')}</button>
          )}
        </>
      ) : (
        <p className="mt-3 rounded-lg bg-panel-sunken px-3 py-2 text-xs leading-relaxed text-ink-muted ring-1 ring-line">{reason ?? t('widgets.timerMenu.onlyFacilitatorsControlTimer')}</p>
      )}

      <div className="mx-0.5 my-3 h-px bg-line" />
      <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
        <Headphones size={13} />{' '}{t('widgets.timerMenu.focusMusic')}</div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={t('widgets.timerMenu.backgroundMusic')}>
        {MUSIC_TRACKS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={timer.musicTrack === t.id}
            disabled={!canManage}
            title={canManage ? t.description : reason}
            className={cn(
              'rounded-lg px-2.5 py-2 text-left ring-1 transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-60',
              timer.musicTrack === t.id ? 'bg-accent-soft ring-brand-300' : 'bg-panel ring-line hover:bg-panel-hover',
            )}
            onClick={() => {
              ambient.ensure();
              b().setTimerMusic(t.id);
            }}
          >
            <span className="block text-[12.5px] font-semibold text-ink">{t.label}</span>
            <span className="block truncate text-[11px] text-ink-subtle">{t.description}</span>
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-ink-subtle">{t('widgets.timerMenu.musicPlaysWhileTimerRuns')}</p>

      <div className="mt-3 space-y-2 rounded-lg bg-panel-sunken p-2.5 ring-1 ring-line">
        <div className="text-[11px] font-semibold text-ink-muted">{t('widgets.timerMenu.inThisBrowser')}</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="od-tool h-8 w-8"
            onClick={() => {
              ambient.ensure();
              setPrefs({ musicMuted: !prefs.musicMuted });
            }}
            aria-pressed={prefs.musicMuted}
            aria-label={prefs.musicMuted ? t('widgets.timerMenu.turnMusic') : t('widgets.timerMenu.muteMusic')}
            title={prefs.musicMuted ? t('widgets.timerMenu.turnMusic') : t('widgets.timerMenu.muteMusic')}
          >
            {prefs.musicMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(prefs.musicVolume * 100)}
            className="w-full accent-[var(--od-selection)]"
            onChange={(e) => setPrefs({ musicVolume: Number(e.target.value) / 100, musicMuted: false })}
            aria-label={t('widgets.timerMenu.musicVolume')}
          />
          <span className="w-8 text-right text-[11px] tabular-nums text-ink-subtle">{Math.round(prefs.musicVolume * 100)}</span>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-ink">
          <input type="checkbox" className="accent-[var(--od-selection)]" checked={prefs.alarm} onChange={(e) => setPrefs({ alarm: e.target.checked })} />
          <BellRing size={14} className="text-ink-muted" />{' '}{t('widgets.timerMenu.playAlarmEnd')}<button type="button" className="ml-auto text-[11.5px] font-semibold text-brand-700 hover:underline dark:text-brand-300" onClick={() => ambient.alarm()}>{t('widgets.timerMenu.test')}</button>
        </label>
      </div>
    </div>
  );
}
