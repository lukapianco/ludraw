import { useEffect, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { cn } from '../../utils/cn';
import { initials } from '../../utils/format';
import { useT } from '../../i18n/useT';
import type { MembershipStatus } from '../../types/workspace';

/** Estado efêmero da área admin (fora do persist): pré-seleção do assistente de transferência. */
export const useAdminUi = create<{ transferFrom: string | null; setTransferFrom: (id: string | null) => void }>((set) => ({
  transferFrom: null,
  setTransferFrom: (id) => set({ transferFrom: id }),
}));

/** Bloco de conteúdo da Administração (mesma linguagem das Configurações). */
export function AdminSection({ title, description, aside, children }: { title: string; description?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-panel p-5 shadow-panel md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint, onClick }: { label: string; value: ReactNode; hint?: string; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn('rounded-2xl bg-panel p-4 text-start shadow-panel', onClick && 'transition-all duration-base ease-out hover:-translate-y-0.5 hover:shadow-pop')}
    >
      <div className="text-xs font-semibold text-ink-subtle">{label}</div>
      <div className="mt-1 font-display text-[28px] font-semibold leading-none tabular-nums text-ink">{value}</div>
      {hint && <div className="mt-1.5 truncate text-xs text-ink-muted">{hint}</div>}
    </Tag>
  );
}

export function StatusPill({ status }: { status: MembershipStatus }) {
  const t = useT();
  const tone = status === 'active' ? 'bg-success-soft text-success' : status === 'suspended' || status === 'invited' ? 'bg-warning-soft text-ink' : 'bg-panel-sunken text-ink-subtle';
  return <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-line', tone)}>{t(`admin.status.${status}` as const)}</span>;
}

export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'warning' }) {
  const tones = { neutral: 'bg-panel-sunken text-ink-muted', brand: 'bg-accent-soft text-brand-900 dark:text-brand-200', warning: 'bg-warning-soft text-ink' };
  return <span className={cn('inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-line', tones[tone])}>{children}</span>;
}

export function PersonCell({ name, email, color, extra }: { name: string; email?: string; color?: string; extra?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: color ?? '#5B6573' }}>
        {initials(name)}
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-ink" title={name}>{name}</span>
          {extra}
        </div>
        {email && <div className="truncate text-xs text-ink-subtle" title={email}>{email}</div>}
      </div>
    </div>
  );
}

/**
 * Botão destrutivo em 2 cliques: o 1º troca o rótulo por "Confirmar?" por 4 s (sem diálogo modal).
 * Desabilitado → `title` mostra o motivo de `explain()`.
 */
export function ConfirmButton({ label, confirmLabel, onConfirm, disabled, reason, icon, danger = true, iconOnly }: { label: string; confirmLabel?: string; onConfirm: () => void; disabled?: boolean; reason?: string; icon?: ReactNode; danger?: boolean; iconOnly?: boolean }) {
  const t = useT();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(id);
  }, [armed]);
  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? reason : iconOnly && !armed ? label : undefined}
      aria-label={iconOnly && !armed ? label : undefined}
      className={cn('od-btn od-btn-sm h-8 shrink-0', iconOnly && !armed && 'w-8 px-0', armed ? 'od-btn-danger' : danger ? 'od-btn-ghost text-danger' : 'od-btn-ghost')}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    >
      {!(iconOnly && armed) && icon}
      {armed ? (confirmLabel ?? t('admin.common.confirm')) : iconOnly ? null : label}
    </button>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={cn('flex items-start justify-between gap-4 py-2.5', disabled && 'opacity-60')}>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-ink-muted">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line-strong')}
      >
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'start-[22px]' : 'start-0.5')} />
      </button>
    </label>
  );
}

export function NumberField({ label, hint, value, onChange, min = 1, allowEmpty, emptyLabel, disabled }: { label: string; hint?: string; value: number | null; onChange: (v: number | null) => void; min?: number; allowEmpty?: boolean; emptyLabel?: string; disabled?: boolean }) {
  return (
    <label className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-ink-muted">{hint}</span>}
      </span>
      <input
        type="number"
        min={min}
        className="od-input h-9 w-28 text-[13px] tabular-nums"
        value={value ?? ''}
        placeholder={allowEmpty ? emptyLabel : undefined}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (raw === '' && allowEmpty) return onChange(null);
          const n = Number(raw);
          if (Number.isFinite(n)) onChange(Math.max(min, Math.round(n)));
        }}
      />
    </label>
  );
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-panel-sunken px-4 py-5 text-center text-sm text-ink-muted ring-1 ring-line">{children}</p>;
}
