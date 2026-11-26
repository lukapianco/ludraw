import { useMemo, useState } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { AuditChange, WorkspaceAuditAction, WorkspaceAuditEntry } from '../../types/workspace';
import { AUDIT_ACTION_LABELS, SYSTEM_ACTOR, auditText, displayName } from '../../utils/workspaceDisplay';
import { toCsv } from '../../utils/csv';
import { downloadBlob } from '../../utils/export';
import { useWorkspaceCan } from '../../hooks/useWorkspace';
import { compareText, formatDateTime } from '../../i18n/format';
import { useT } from '../../i18n/useT';
import { AdminSection, EmptyRow, Tag } from './adminUi';

type Period = 'day' | 'week' | 'month' | 'all';
const PERIOD_MS: Record<Period, number | null> = { day: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000, all: null };

function changeText(c: AuditChange): string {
  const v = (x: AuditChange['before']) => (x === null ? '—' : String(x));
  return `${c.field}: ${v(c.before)} → ${v(c.after)}`;
}

/**
 * Audit Log do Workspace (`#/admin/audit`): filtros por autor, ação e período; exportar CSV.
 * Autor e alvo são resolvidos pelo id na hora (conta anonimizada → "Usuário removido").
 * Os cabeçalhos do CSV seguem o idioma ativo (não é um formato padronizado); células passam por
 * `toCsv` (proteção contra fórmulas).
 */
export function AdminAudit() {
  const t = useT();
  const log = useAppStore((s) => s.auditLog);
  const directory = useAppStore((s) => s.directory);
  const toast = useAppStore((s) => s.toast);
  const canView = useWorkspaceCan('workspace.audit.view');
  const [actor, setActor] = useState('all');
  const [action, setAction] = useState<'all' | WorkspaceAuditAction>('all');
  const [period, setPeriod] = useState<Period>('month');
  const [open, setOpen] = useState<string | null>(null);

  const actors = useMemo(() => {
    const ids = [...new Set(log.map((e) => e.actorId))];
    return ids.map((id) => ({ id, name: displayName(id, directory) })).sort((a, b) => compareText(a.name, b.name));
  }, [log, directory]);
  const actions = useMemo(() => [...new Set(log.map((e) => e.action))].sort((a, b) => compareText(AUDIT_ACTION_LABELS[a], AUDIT_ACTION_LABELS[b])), [log]);

  const filtered = useMemo(() => {
    const since = PERIOD_MS[period] === null ? 0 : Date.now() - (PERIOD_MS[period] as number);
    return log.filter((e) => e.timestamp >= since && (actor === 'all' || e.actorId === actor) && (action === 'all' || e.action === action));
  }, [log, actor, action, period]);

  const exportCsv = () => {
    if (!canView.allowed) return toast(canView.reason ?? '', 'danger');
    const rows: (string | number)[][] = [
      [t('admin.audit.csvDate'), t('admin.audit.csvActor'), t('admin.audit.csvAction'), t('admin.audit.csvDescription'), t('admin.audit.csvTarget'), t('admin.audit.csvChanges'), t('admin.audit.csvActorId')],
      ...filtered.map((e: WorkspaceAuditEntry) => [
        formatDateTime(e.timestamp),
        displayName(e.actorId, directory, e.actorName),
        AUDIT_ACTION_LABELS[e.action] ?? e.action,
        auditText(e, directory),
        e.targetType === 'user' ? displayName(e.targetId, directory) : (e.targetName ?? ''),
        (e.changes ?? []).map(changeText).join(' | '),
        e.actorId,
      ]),
    ];
    const csv = toCsv(rows, { bom: true });
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `ludraw-audit-${date}.csv`);
    toast(t('admin.audit.exported', { count: filtered.length }), 'success');
  };

  return (
    <AdminSection
      title={t('admin.audit.title', { count: filtered.length })}
      description={t('admin.audit.description')}
      aside={
        <button type="button" className="od-btn od-btn-secondary od-btn-sm" disabled={!filtered.length} onClick={exportCsv}>
          <Download size={15} /> {t('admin.audit.exportCsv')}
        </button>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <select className="od-input h-9 w-auto text-[13px]" value={actor} onChange={(e) => setActor(e.target.value)} aria-label={t('admin.audit.filterActor')}>
          <option value="all">{t('admin.audit.allActors')}</option>
          {actors.map((a) => (
            <option key={a.id} value={a.id}>{a.id === SYSTEM_ACTOR ? t('workspace.people.system') : a.name}</option>
          ))}
        </select>
        <select className="od-input h-9 w-auto text-[13px]" value={action} onChange={(e) => setAction(e.target.value as 'all' | WorkspaceAuditAction)} aria-label={t('admin.audit.filterAction')}>
          <option value="all">{t('admin.audit.allActions')}</option>
          {actions.map((a) => (
            <option key={a} value={a}>{AUDIT_ACTION_LABELS[a]}</option>
          ))}
        </select>
        <select className="od-input h-9 w-auto text-[13px]" value={period} onChange={(e) => setPeriod(e.target.value as Period)} aria-label={t('admin.audit.filterPeriod')}>
          <option value="day">{t('admin.audit.periodDay')}</option>
          <option value="week">{t('admin.audit.periodWeek')}</option>
          <option value="month">{t('admin.audit.periodMonth')}</option>
          <option value="all">{t('admin.audit.periodAll')}</option>
        </select>
      </div>
      {filtered.length === 0 ? (
        <EmptyRow>{t('admin.audit.empty')}</EmptyRow>
      ) : (
        <ul className="divide-y divide-[var(--od-border)] rounded-xl ring-1 ring-line">
          {filtered.slice(0, 300).map((e) => (
            <li key={e.id} className="px-3.5 py-2.5">
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                <span className="w-36 shrink-0 text-xs tabular-nums text-ink-subtle">{formatDateTime(e.timestamp)}</span>
                <span className="min-w-0 flex-1 text-sm text-ink">{auditText(e, directory)}</span>
                <Tag>{AUDIT_ACTION_LABELS[e.action] ?? e.action}</Tag>
                {!!e.changes?.length && (
                  <button type="button" className="od-tool h-7 w-7" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)} aria-label={t('admin.audit.details')}>
                    <ChevronDown size={15} className={open === e.id ? 'rotate-180 transition-transform' : 'transition-transform'} />
                  </button>
                )}
              </div>
              {open === e.id && (
                <ul className="mt-2 space-y-0.5 rounded-lg bg-panel-sunken px-3 py-2 font-mono text-[11.5px] text-ink-muted">
                  {e.changes!.map((c, i) => (
                    <li key={i}>{changeText(c)}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {filtered.length > 300 && <p className="mt-2 text-xs text-ink-subtle">{t('admin.audit.truncated', { count: filtered.length })}</p>}
    </AdminSection>
  );
}
