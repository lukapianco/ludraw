import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { roleLabel, boardPlaceLabel, displayName } from '../../utils/workspaceDisplay';
import { explainAccountChange, workspaceContext } from '../../utils/permissions';
import { policiesOf, currentViewer } from '../../store/workspaceSlice';
import { translateMessage } from '../../i18n';
import { compareText, formatRelativeTime } from '../../i18n/format';
import { cn } from '../../utils/cn';
import { useT } from '../../i18n/useT';
import { useOrgMembers, useWorkspaceCan } from '../../hooks/useWorkspace';
import { membershipAccounts } from '../../utils/workspace';
import { AdminSection, EmptyRow, StatusPill, Tag, useAdminUi } from './adminUi';

type Step = 1 | 2 | 3 | 4;

/**
 * Assistente de transferência de propriedade em massa (`#/admin/transfer`) — offboarding:
 * 1 quem sai → 2 quem recebe → 3 prévia dos boards → 4 confirmar (opcional: suspender a conta depois).
 * Nada é apagado: os boards mudam de titular e a operação entra no Audit Log (`ownership_transferred`).
 */
export function AdminTransfer() {
  const t = useT();
  const s = useAppStore();
  const can = useWorkspaceCan('workspace.ownership.transfer');
  const preset = useAdminUi((u) => u.transferFrom);
  const clearPreset = useAdminUi((u) => u.setTransferFrom);
  const [step, setStep] = useState<Step>(preset ? 2 : 1);
  const [from, setFrom] = useState<string | null>(preset);
  const [to, setTo] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [suspendAfter, setSuspendAfter] = useState(false);
  const [done, setDone] = useState<{ count: number } | null>(null);

  useEffect(() => {
    if (preset) clearPreset(null);
  }, [preset, clearPreset]);

  const owned = (id: string) => s.boards.filter((b) => b.ownerId === id);
  const members = useOrgMembers();
  const people = useMemo(() => members.filter((a) => a.status !== 'removed' || owned(a.id).length > 0).sort((a, b) => compareText(a.name, b.name)), [members, s.boards]);
  const recipients = members.filter((a) => a.id !== from && a.status === 'active' && (a.role === 'admin' || a.role === 'member'));
  const fromBoards = from ? owned(from).sort((a, b) => b.updatedAt - a.updatedAt) : [];
  const suspendDecision = from ? explainAccountChange(workspaceContext(currentViewer(s), policiesOf(s)), membershipAccounts(s.directory, s.workspace.id), from, 'suspend') : null;

  const pickFrom = (id: string) => {
    setFrom(id);
    setTo(null);
    setSelected(new Set(owned(id).map((b) => b.id)));
  };
  useEffect(() => {
    if (from && selected.size === 0) setSelected(new Set(owned(from).map((b) => b.id)));
  }, [from]);

  const confirm = () => {
    if (!from || !to) return;
    const r = s.transferBoardOwnership(from, to, [...selected]);
    if (!r.ok) return s.toast(r.error, 'danger');
    if (suspendAfter && suspendDecision?.allowed) {
      const r2 = s.suspendAccount(from);
      if (!r2.ok) s.toast(r2.error, 'danger');
    }
    setDone({ count: selected.size });
  };

  const restart = () => {
    setStep(1);
    setFrom(null);
    setTo(null);
    setSelected(new Set());
    setSuspendAfter(false);
    setDone(null);
  };

  if (!can.allowed) return <p className="rounded-2xl bg-warning-soft px-4 py-3 text-sm text-ink ring-1 ring-line">{can.reason}</p>;

  if (done) {
    return (
      <AdminSection title={t('admin.transfer.doneTitle')}>
        <div className="flex items-start gap-3">
          <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-success" />
          <p className="text-sm text-ink">{t('admin.transfer.doneText', { count: done.count, from: displayName(from, s.directory), to: displayName(to, s.directory) })}</p>
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" className="od-btn od-btn-secondary od-btn-sm" onClick={() => s.navigate({ name: 'admin', section: 'audit' })}>{t('admin.overview.seeAudit')}</button>
          <button type="button" className="od-btn od-btn-ghost od-btn-sm" onClick={restart}>{t('admin.transfer.another')}</button>
        </div>
      </AdminSection>
    );
  }

  const steps: { n: Step; label: string }[] = [
    { n: 1, label: t('admin.transfer.step1') },
    { n: 2, label: t('admin.transfer.step2') },
    { n: 3, label: t('admin.transfer.step3') },
    { n: 4, label: t('admin.transfer.step4') },
  ];

  return (
    <>
      <ol className="flex flex-wrap gap-2" aria-label={t('admin.transfer.stepsLabel')}>
        {steps.map((x) => (
          <li key={x.n} aria-current={step === x.n ? 'step' : undefined} className={cn('flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold ring-1', step === x.n ? 'bg-accent-soft text-ink ring-selection' : step > x.n ? 'text-ink ring-line' : 'text-ink-subtle ring-line')}>
            <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[11px]', step > x.n ? 'bg-accent text-[var(--od-accent-contrast)]' : 'bg-panel-sunken')}>{step > x.n ? <Check size={12} /> : x.n}</span>
            {x.label}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <AdminSection title={t('admin.transfer.step1Title')} description={t('admin.transfer.step1Text')}>
          <div className="space-y-1.5">
            {people.map((a) => (
              <PickRow key={a.id} selected={from === a.id} onClick={() => pickFrom(a.id)} title={displayName(a.id, s.directory)} detail={`${roleLabel(a.role)} · ${t('admin.teams.boardsCount', { count: owned(a.id).length })}`} right={<StatusPill status={a.status} />} />
            ))}
          </div>
          <Footer next={() => setStep(2)} nextDisabled={!from} />
        </AdminSection>
      )}

      {step === 2 && (
        <AdminSection title={t('admin.transfer.step2Title')} description={t('admin.transfer.step2Text', { name: displayName(from, s.directory) })}>
          {recipients.length === 0 ? (
            <EmptyRow>{t('admin.transfer.noRecipients')}</EmptyRow>
          ) : (
            <div className="space-y-1.5">
              {recipients.map((a) => (
                <PickRow key={a.id} selected={to === a.id} onClick={() => setTo(a.id)} title={a.name} detail={roleLabel(a.role)} />
              ))}
            </div>
          )}
          <Footer back={() => setStep(1)} next={() => setStep(3)} nextDisabled={!to} />
        </AdminSection>
      )}

      {step === 3 && (
        <AdminSection title={t('admin.transfer.step3Title', { count: selected.size })} description={t('admin.transfer.step3Text')}>
          {fromBoards.length === 0 ? (
            <EmptyRow>{t('admin.transfer.noBoards')}</EmptyRow>
          ) : (
            <div className="rounded-xl ring-1 ring-line">
              <label className="flex items-center gap-3 border-b border-line px-3.5 py-2 text-xs font-semibold text-ink-muted">
                <input type="checkbox" className="h-4 w-4 accent-[var(--od-accent)]" checked={selected.size === fromBoards.length} onChange={(e) => setSelected(new Set(e.target.checked ? fromBoards.map((b) => b.id) : []))} />
                {t('admin.transfer.selectAll')}
              </label>
              {fromBoards.map((b) => (
                <label key={b.id} className="flex cursor-pointer items-center gap-3 border-t border-line px-3.5 py-2.5 first:border-t-0 hover:bg-panel-hover">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--od-accent)]"
                    checked={selected.has(b.id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(b.id);
                      else next.delete(b.id);
                      setSelected(next);
                    }}
                  />
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: b.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{b.name}</span>
                    <span className="block truncate text-xs text-ink-subtle">{boardPlaceLabel(b, s)} · {formatRelativeTime(b.updatedAt)}</span>
                  </span>
                  {b.deletedAt && <Tag tone="warning">{t('admin.transfer.inTrash')}</Tag>}
                  {b.isPersonalSpace && <Tag>{t('workspace.places.personal')}</Tag>}
                </label>
              ))}
            </div>
          )}
          <Footer back={() => setStep(2)} next={() => setStep(4)} nextDisabled={selected.size === 0} />
        </AdminSection>
      )}

      {step === 4 && (
        <AdminSection title={t('admin.transfer.step4Title')}>
          <p className="text-sm text-ink">{t('admin.transfer.summary', { count: selected.size, from: displayName(from, s.directory), to: displayName(to, s.directory) })}</p>
          <label className={cn('mt-4 flex items-start gap-3 rounded-xl bg-panel-sunken px-3.5 py-3 ring-1 ring-line', !suspendDecision?.allowed && 'opacity-60')}>
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--od-accent)]" checked={suspendAfter} disabled={!suspendDecision?.allowed} onChange={(e) => setSuspendAfter(e.target.checked)} />
            <span>
              <span className="block text-sm font-semibold text-ink">{t('admin.transfer.suspendAfter', { name: displayName(from, s.directory) })}</span>
              <span className="block text-xs text-ink-muted">{suspendDecision && !suspendDecision.allowed && suspendDecision.reason ? translateMessage(suspendDecision.reason) : t('admin.transfer.suspendHint')}</span>
            </span>
          </label>
          <Footer back={() => setStep(3)} next={confirm} nextLabel={t('admin.transfer.confirm')} />
        </AdminSection>
      )}
    </>
  );
}

function PickRow({ selected, onClick, title, detail, right }: { selected: boolean; onClick: () => void; title: string; detail?: string; right?: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onClick} className={cn('flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-start ring-1 transition-colors', selected ? 'bg-accent-soft ring-selection' : 'ring-line hover:bg-panel-hover')}>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{title}</span>
        {detail && <span className="block truncate text-xs text-ink-subtle">{detail}</span>}
      </span>
      {right}
      {selected && <Check size={16} className="text-brand-800 dark:text-brand-200" />}
    </button>
  );
}

function Footer({ back, next, nextDisabled, nextLabel }: { back?: () => void; next: () => void; nextDisabled?: boolean; nextLabel?: string }) {
  const t = useT();
  return (
    <div className="mt-5 flex justify-between gap-2">
      {back ? (
        <button type="button" className="od-btn od-btn-ghost od-btn-sm" onClick={back}>
          <ArrowLeft size={15} /> {t('admin.transfer.back')}
        </button>
      ) : (
        <span />
      )}
      <button type="button" className="od-btn od-btn-primary od-btn-sm" disabled={nextDisabled} onClick={next}>
        {nextLabel ?? t('admin.transfer.next')} <ArrowRight size={15} />
      </button>
    </div>
  );
}
