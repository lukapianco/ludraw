import { cn } from '../../utils/cn';

interface LogoMarkProps {
  size?: number;
  className?: string;
  inverted?: boolean;
}

/** Marca do LuDraw: traço livre + ponto sobre quadrado arredondado verde-floresta. */
export function LogoMark({ size = 28, className, inverted = false }: LogoMarkProps) {
  const bg = inverted ? '#D0E4AE' : '#194B32';
  const fg = inverted ? '#194B32' : '#D0E4AE';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill={bg} />
      <path
        d="M15 42c6-14 12-20 18-18s4 10 10 10c4 0 6-4 7-8"
        fill="none"
        stroke={fg}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="48" cy="18" r="5" fill={fg} />
    </svg>
  );
}

interface LogoProps {
  className?: string;
  markSize?: number;
  showMark?: boolean;
  tone?: 'auto' | 'light';
}

/** Wordmark "LuDraw" (L e D maiúsculos, em dois tons — pedido do usuário). */
export function Logo({ className, markSize = 22, showMark = true, tone = 'auto' }: LogoProps) {
  return (
    <span className={cn('inline-flex select-none items-center gap-2', className)}>
      {showMark && <LogoMark size={markSize} inverted={tone === 'light'} />}
      <span
        className={cn(
          'text-[19px] font-extrabold leading-none tracking-[-0.03em]',
          tone === 'light' ? 'text-brand-100' : 'text-brand-900 dark:text-brand-200',
        )}
      >
        Lu<span className={tone === 'light' ? 'text-brand-300' : 'text-brand-600 dark:text-brand-400'}>Draw</span>
      </span>
    </span>
  );
}
