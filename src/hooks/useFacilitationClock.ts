import { useEffect, useState } from 'react';
import { timerRemaining, useBoardStore } from '../store/useBoardStore';
import { useAppStore } from '../store/useAppStore';
import { ambient } from '../utils/ambientAudio';

/**
 * Relógio do Kit de Facilitação (Chat 04), montado uma vez no BoardView:
 *  - fecha o cronômetro quando o tempo acaba (`completeTimer`) e toca o alarme neste navegador;
 *  - encerra a votação com prazo (`autoRevealVoting`);
 *  - liga/desliga a música ambiente procedural conforme o estado do board (trilha compartilhada)
 *    e as preferências locais (volume, silenciar).
 * Nada é gravado a cada segundo: o tempo restante é sempre `endsAt - agora`.
 */
export function useFacilitationClock(enabled: boolean): void {
  const running = useBoardStore((s) => !!s.facilitation.timer?.running);
  const visible = useBoardStore((s) => !!s.facilitation.timer?.visible);
  const track = useBoardStore((s) => s.facilitation.timer?.musicTrack ?? 'none');
  const votingEndsAt = useBoardStore((s) => (s.facilitation.voting?.active && !s.facilitation.voting.revealed ? s.facilitation.voting.endsAt ?? null : null));
  const collab = useBoardStore((s) => s.collab);
  const finishedAt = useBoardStore((s) => s.facilitation.timer?.finishedAt ?? null);
  const muted = useAppStore((s) => s.audioPrefs.musicMuted);
  const volume = useAppStore((s) => s.audioPrefs.musicVolume);

  // Tique: fim do cronômetro e prazo da votação
  useEffect(() => {
    // Chat 08: ao vivo, quem grava o fim é o servidor (fechar o tempo exige timer.manage; votação, voting.manage)
    if (!enabled || collab || (!running && !votingEndsAt)) return;
    const tick = () => {
      const s = useBoardStore.getState();
      const t = s.facilitation.timer;
      if (t?.running && timerRemaining(t) <= 0 && s.completeTimer() && useAppStore.getState().audioPrefs.alarm) ambient.alarm();
      const v = s.facilitation.voting;
      if (v?.active && !v.revealed && v.endsAt && v.endsAt <= Date.now()) s.autoRevealVoting();
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [enabled, collab, running, votingEndsAt]);

  // Chat 08: ao vivo, o alarme toca quando o fim chega do servidor (uma vez, e só se acabou agora)
  useEffect(() => {
    if (!enabled || !collab || !finishedAt) return;
    if (Date.now() - finishedAt < 5000 && useAppStore.getState().audioPrefs.alarm) ambient.alarm();
  }, [enabled, collab, finishedAt]);

  // Música ambiente
  useEffect(() => {
    if (!enabled) return;
    ambient.setVolume(volume);
  }, [enabled, volume]);
  useEffect(() => {
    if (!enabled) return;
    if (visible && running && track !== 'none' && !muted) ambient.play(track);
    else ambient.stop();
  }, [enabled, visible, running, track, muted]);
  useEffect(() => () => ambient.stop(), []);
}

/** `Date.now()` que se atualiza a cada `ms` enquanto `active` (para mostrar contagens). */
export function useNow(active: boolean, ms = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [active, ms]);
  return now;
}

/** "05:00", "1:02:03" */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
