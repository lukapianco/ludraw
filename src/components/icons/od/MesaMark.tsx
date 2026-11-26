/** Botão Mesa: o desenho do `favicon.svg` do projeto (fundo verde-floresta, traço pistache). */
export function MesaMark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <rect width="64" height="64" rx="16" fill="#194B32" />
      <path d="M15 42c6-14 12-20 18-18s4 10 10 10c4 0 6-4 7-8" fill="none" stroke="#D0E4AE" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="48" cy="18" r="5" fill="#D0E4AE" />
    </svg>
  );
}
