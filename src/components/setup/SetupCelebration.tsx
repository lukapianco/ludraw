import { useMemo } from 'react';
import { Check, PartyPopper } from 'lucide-react';
import { STICKY_PALETTE, stickyTextColor } from '../../utils/factory';
import { useT } from '../../i18n/useT';

interface Props {
  orgName: string;
  adminEmail: string;
  modeLabel: string;
}

/** Gerador pseudo-aleatório determinístico (o confete é o mesmo a cada render — nada pula na tela). */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/**
 * Chat 07 · B — comemoração do primeiro acesso (passo 3 do `#/setup`). Tudo procedural, sem imagem nem
 * biblioteca: confete nas cores da paleta de post-its (`STICKY_PALETTE`), um selo que "salta" e um mini-board
 * em que três post-its (organização, administrador, modo) entram um a um ligados por um conector que se
 * desenha — o mesmo vocabulário do canvas. Com "Reduzir movimento" (preferência do app ou do sistema),
 * tudo aparece já parado (regras `.od-celebrate` em index.css).
 */
export function SetupCelebration({ orgName, adminEmail, modeLabel }: Props) {
  const t = useT();
  const confetti = useMemo(() => {
    const rnd = seeded(7);
    const colors = ['#194B32', '#D0E4AE', ...STICKY_PALETTE.map((c) => c.hex)];
    return Array.from({ length: 46 }, (_, i) => ({
      left: rnd() * 100,
      delay: (i % 2 ? 0.9 : 0) + rnd() * 0.7,
      duration: 2.2 + rnd() * 1.6,
      drift: (rnd() - 0.5) * 140,
      spin: 360 + rnd() * 720,
      size: 6 + rnd() * 6,
      round: rnd() > 0.6,
      color: colors[Math.floor(rnd() * colors.length)],
    }));
  }, []);

  const notes = [
    { label: t('server.setup.statOrg'), value: orgName, hex: STICKY_PALETTE.find((c) => c.id === 'canario')!.hex, rotate: -4 },
    { label: t('server.setup.statAdmin'), value: adminEmail, hex: STICKY_PALETTE.find((c) => c.id === 'lima')!.hex, rotate: 2 },
    { label: t('server.setup.statMode'), value: modeLabel, hex: STICKY_PALETTE.find((c) => c.id === 'celeste')!.hex, rotate: -2 },
  ];

  return (
    <div className="od-celebrate relative overflow-hidden rounded-2xl bg-accent-soft px-5 pb-5 pt-6 ring-1 ring-line">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {confetti.map((c, i) => (
          <span
            key={i}
            className="od-confetti"
            style={{
              left: `${c.left}%`,
              width: c.size,
              height: c.round ? c.size : c.size * 0.45,
              borderRadius: c.round ? '50%' : 2,
              background: c.color,
              animationDelay: `${c.delay}s`,
              animationDuration: `${c.duration}s`,
              ['--od-drift' as string]: `${c.drift}px`,
              ['--od-spin' as string]: `${c.spin}deg`,
            }}
          />
        ))}
      </div>

      <div className="relative flex items-center gap-3">
        <span className="od-celebrate-badge relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-white shadow-panel">
          <Check size={24} strokeWidth={3} />
          <span className="od-celebrate-ring absolute inset-0 rounded-2xl ring-2 ring-[var(--od-selection)]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="od-celebrate-title flex items-center gap-2 text-xl font-bold text-ink">
            {t('server.setup.celebrate1')} <PartyPopper size={20} className="od-celebrate-popper text-brand-700 dark:text-brand-300" aria-hidden="true" />
          </h2>
          <p className="text-sm text-ink-muted">{t('server.setup.celebrate2')}</p>
        </div>
      </div>

      {/* mini-board: três post-its ligados por um conector que se desenha */}
      <div className="relative mt-6">
        <svg className="pointer-events-none absolute inset-x-6 top-1/2 h-10 -translate-y-1/2" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true">
          <path className="od-celebrate-connector" d="M10 22 C 60 2, 100 38, 150 20 S 240 2, 290 22" fill="none" stroke="var(--od-selection)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="4 7" />
        </svg>
        <ul className="relative grid grid-cols-3 gap-3">
          {notes.map((n, i) => (
            <li
              key={n.label}
              className="od-celebrate-note min-h-[86px] rounded-[4px] p-2.5 shadow-panel"
              style={{ background: n.hex, color: stickyTextColor(n.hex), ['--od-rot' as string]: `${n.rotate}deg`, animationDelay: `${0.35 + i * 0.28}s` }}
            >
              <span className="block text-2xs font-bold uppercase tracking-wide opacity-70">{n.label}</span>
              <span className="mt-1 block break-words text-[13px] font-semibold leading-snug">{n.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
