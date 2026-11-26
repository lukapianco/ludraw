/**
 * Peças de montagem da tela #/design-system: grupo (com âncora), frame, bloco com título e nota, e os auxiliares
 * de tabela/estados. Um só jeito de titular e anotar em toda a tela (antes cada arquivo tinha o seu `Block`).
 */
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

/** Id estável a partir do título (usado pelo índice para rolar até o frame). */
export function dsSlug(text: string): string {
  return (
    'ds-' +
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  );
}

/** Rola até um grupo ou frame do índice (a rota usa o hash, então não dá para usar #âncora). */
export function scrollToDs(id: string): void {
  // Chat 08.6 · A (D-03): "Reduzir movimento" (app ou sistema) = salto direto
  const reduce = document.documentElement.classList.contains('od-reduce-motion') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

/** Grupo de frames (Fundamentos, Componentes, Estúdio…), com número e descrição curta. */
export function Group({ n, title, lead, children }: { n: number; title: string; lead: string; children: ReactNode }) {
  return (
    <section id={dsSlug(title)} data-ds-group={title} className="scroll-mt-20 pt-6">
      <div className="mb-4 flex items-baseline gap-3 border-b border-line pb-2">
        <span className="font-mono text-[13px] font-semibold text-ink-subtle">{String(n).padStart(2, '0')}</span>
        <h2 className="font-display text-[26px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        <p className="ms-auto hidden max-w-[460px] text-right text-xs text-ink-subtle md:block">{lead}</p>
      </div>
      {children}
    </section>
  );
}

export function Frame({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section id={dsSlug(title)} data-ds-frame={title} className={cn('mb-6 scroll-mt-20', className)}>
      <div className="mb-1.5 px-1 text-xs font-semibold text-ink-muted">{title}</div>
      <div className="h-[calc(100%-22px)] rounded-2xl bg-panel p-5 shadow-panel md:p-6">{children}</div>
    </section>
  );
}

/** Bloco dentro de um frame: título, exemplo e uma nota curta de uso. `wide` ocupa 2 colunas da grade. */
export function Block({ title, note, children, wide, className }: { title: string; note?: ReactNode; children: ReactNode; wide?: boolean; className?: string }) {
  return (
    <div className={cn(wide && 'lg:col-span-2', className)}>
      <div className="mb-3 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{title}</div>
      {children}
      {note && <p className="mt-2 text-xs leading-relaxed text-ink-subtle">{note}</p>}
    </div>
  );
}

export function SubTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mb-3 text-2xs font-semibold uppercase tracking-wide text-ink-subtle', className)}>{children}</div>;
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-md bg-panel-sunken px-1.5 py-0.5 font-mono text-[12px] text-ink">{children}</code>;
}

export function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-brand-900 dark:text-brand-200">{children}</span>;
}

export function TypeRow({ meta, children }: { meta: string; children: ReactNode }) {
  return (
    <div className="border-b border-line pb-3 text-ink last:border-0">
      <div className="mb-1 font-mono text-[11px] text-ink-subtle">{meta}</div>
      {children}
    </div>
  );
}

export function TokenTable({ rows }: { rows: { token: string; label: string; light: string; dark: string }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-subtle">
            <th className="pb-2 font-semibold">Token</th>
            <th className="pb-2 font-semibold">Uso</th>
            <th className="pb-2 font-semibold">Claro</th>
            <th className="pb-2 font-semibold">Escuro</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.token} className="border-t border-line">
              <td className="py-2 pr-3 font-mono text-[12px] text-ink">{r.token}</td>
              <td className="py-2 pr-3 text-ink-muted">{r.label}</td>
              <td className="py-2 pr-3">
                <Swatch color={r.light} base="#FFFFFF" />
              </td>
              <td className="py-2">
                <Swatch color={r.dark} base="#16161A" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Swatch({ color, base }: { color: string; base: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative h-6 w-10 overflow-hidden rounded-md ring-1 ring-black/10 dark:ring-white/10" style={{ background: base }}>
        <span className="absolute inset-0" style={{ background: color }} />
      </span>
      <span className="font-mono text-[11px] text-ink-subtle">{color}</span>
    </span>
  );
}

export function StatesGrid({ columns, rows, compact }: { columns: string[]; rows: { label: string; render: (stateClass: string) => ReactNode }[]; compact?: boolean }) {
  const stateClasses = compact ? ['', 'is-hover', 'active', 'is-disabled'] : ['', 'is-hover', 'is-active', 'is-focus', 'is-disabled'];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px]">
        <thead>
          <tr className="text-left text-xs text-ink-subtle">
            <th className="pb-3 pr-4 font-semibold" />
            {columns.map((c) => (
              <th key={c} className="pb-3 pr-4 font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="py-2 pr-4 text-sm font-semibold text-ink">{row.label}</td>
              {stateClasses.map((st) => (
                <td key={st || 'default'} className="py-2 pr-4">
                  {row.render(st)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ToolDemo({ state, children }: { state: string; children: ReactNode }) {
  return (
    <span className={cn('od-tool', state === 'is-hover' && 'is-hover', state === 'is-disabled' && 'is-disabled')} data-active={state === 'active'}>
      {children}
    </span>
  );
}

export function FieldDemo({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-ink-muted">{label}</div>
      {children}
      {error && <div className="mt-1 text-xs font-medium text-danger">{error}</div>}
    </div>
  );
}

export function Legend({ color, outline, children }: { color: string; outline?: boolean; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-3 w-3 rounded-sm" style={{ background: color, border: outline ? '1px solid var(--od-selection)' : undefined }} />
      {children}
    </span>
  );
}

export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="rounded-xl bg-panel-sunken p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-900 text-xs font-bold text-brand-200 dark:bg-brand-200 dark:text-brand-900">{n}</span>
        <span className="font-semibold text-ink">{title}</span>
      </div>
      <p className="mt-2">{children}</p>
    </li>
  );
}
