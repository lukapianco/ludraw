import { useRef, useState } from 'react';
import { Download, FileUp, ShieldCheck, Upload } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { exportWorkspaceBackup, parseWorkspaceBackup, restoreWorkspaceBackup, summarizeBackup, WORKSPACE_BACKUP_EXTENSION, type WorkspaceBackupFile } from '../../utils/workspaceBackup';
import { boardRepository } from '../../utils/boardRepository';
import { useWorkspaceCan } from '../../hooks/useWorkspace';
import { translateMessage } from '../../i18n';
import { formatDateTime } from '../../i18n/format';
import { useT } from '../../i18n/useT';
import { AdminSection, ConfirmButton } from './adminUi';

/**
 * Backup e restauração completa do Workspace (`#/admin/backup`) — Chat 06 · B.
 * Exportar baixa um `.ludraw-workspace`; restaurar valida formato e versão, mostra o resumo e só aplica
 * no 2º clique. Boards locais que não estão no backup vão para a lixeira (nada é apagado na hora).
 */
export function AdminBackup() {
  const t = useT();
  const toast = useAppStore((s) => s.toast);
  const boards = useAppStore((s) => s.boards.length);
  const can = useWorkspaceCan('workspace.backup.manage');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<WorkspaceBackupFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    setBusy(true);
    const r = await exportWorkspaceBackup();
    setBusy(false);
    toast(r.ok ? t('history.backup.exported', { count: r.boards }) : translateMessage(r.reason), r.ok ? 'success' : 'danger');
  };

  const pick = async (file: File | undefined) => {
    setError(null);
    setPending(null);
    if (!file) return;
    const parsed = parseWorkspaceBackup(await file.text());
    if (!parsed.ok) setError(translateMessage(parsed.reason));
    else setPending(parsed.file);
  };

  const doRestore = async () => {
    if (!pending) return;
    setBusy(true);
    const r = await restoreWorkspaceBackup(pending);
    setBusy(false);
    if (!r.ok) return setError(translateMessage(r.reason));
    setPending(null);
    toast(t('history.backup.restored', { count: r.boards }), 'success');
    if (r.cleaned) toast(t('importexport.safety.removed', { count: r.cleaned }), 'neutral');
  };

  const summary = pending ? summarizeBackup(pending) : null;
  const backend = boardRepository.backend;

  // Chat 07: no Modo Servidor o backup é o do banco do servidor (o deste navegador é do Modo Local)
  if (backend === 'server') {
    return (
      <AdminSection title={t('history.backup.exportTitle')} description={t('server.client.backupServer')}>
        <span />
      </AdminSection>
    );
  }

  return (
    <>
      {!can.allowed && <p className="rounded-2xl bg-warning-soft px-4 py-3 text-sm text-ink ring-1 ring-line">{can.reason}</p>}
      <AdminSection title={t('history.backup.exportTitle')} description={t('history.backup.exportText')}>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="od-btn od-btn-primary od-btn-sm" disabled={!can.allowed || busy} onClick={() => void doExport()}>
            <Download size={15} /> {t('history.backup.exportButton')}
          </button>
          <span className="text-xs text-ink-subtle">{t('history.backup.exportCount', { count: boards })}</span>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-subtle">
          <ShieldCheck size={13} className="mt-0.5 shrink-0" /> {t('history.backup.excluded')}
        </p>
      </AdminSection>

      <AdminSection title={t('history.backup.restoreTitle')} description={t('history.backup.restoreText')}>
        <input ref={inputRef} type="file" accept={`${WORKSPACE_BACKUP_EXTENSION},application/json`} className="hidden" onChange={(e) => void pick(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
        <button type="button" className="od-btn od-btn-secondary od-btn-sm" disabled={!can.allowed || busy} onClick={() => inputRef.current?.click()}>
          <FileUp size={15} /> {t('history.backup.chooseFile')}
        </button>
        {error && <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">{error}</p>}
        {summary && (
          <div className="mt-4 rounded-xl bg-panel-sunken p-4 ring-1 ring-line">
            <div className="text-sm font-semibold text-ink">{t('history.backup.summaryTitle', { org: summary.organization })}</div>
            <div className="mt-0.5 text-xs text-ink-subtle">{t('history.backup.exportedAt', { date: formatDateTime(summary.exportedAt) })}</div>
            <ul className="mt-3 grid grid-cols-2 gap-1 text-[13px] text-ink-muted sm:grid-cols-3">
              <li>{t('history.backup.countBoards', { count: summary.boards })}</li>
              <li>{t('history.backup.countTeams', { count: summary.teams })}</li>
              <li>{t('history.backup.countProjects', { count: summary.projects })}</li>
              <li>{t('history.backup.countTemplates', { count: summary.templates })}</li>
              <li>{t('history.backup.countPeople', { count: summary.people })}</li>
              <li>{t('history.backup.countVersions', { count: summary.snapshots })}</li>
            </ul>
            <p className="mt-3 text-xs text-ink-muted">{t('history.backup.restoreWarning')}</p>
            <div className="mt-3 flex gap-2">
              <ConfirmButton danger={false} icon={<Upload size={14} />} label={t('history.backup.restoreButton')} confirmLabel={t('history.backup.confirmRestore')} disabled={busy} onConfirm={() => void doRestore()} />
              <button type="button" className="od-btn od-btn-ghost od-btn-sm h-8" onClick={() => setPending(null)}>{t('common.cancel')}</button>
            </div>
          </div>
        )}
      </AdminSection>

      <p className="text-xs text-ink-subtle">{backend === 'indexeddb' ? t('history.storage.backendIndexedDb') : t('history.storage.backendLocal')}</p>
    </>
  );
}
