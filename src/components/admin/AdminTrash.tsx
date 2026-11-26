import { ArchiveRestore, Settings2, Trash2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { policiesOf } from '../../store/workspaceSlice';
import { trashExpiresAt } from '../../utils/workspace';
import { boardPlaceLabel, displayName } from '../../utils/workspaceDisplay';
import { formatDateTime } from '../../i18n/format';
import { useT } from '../../i18n/useT';
import { AdminSection, ConfirmButton, EmptyRow } from './adminUi';

/** Lixeira do workspace (`#/admin/trash`): todos os boards excluídos; restaurar ou excluir de vez. */
export function AdminTrash() {
  const t = useT();
  const s = useAppStore();
  const policies = policiesOf(s);
  const trashed = s.boards.filter((b) => b.deletedAt).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
  const report = (r: { ok: boolean; error?: string }, okText: string) => s.toast(r.ok ? okText : (r.error ?? ''), r.ok ? 'success' : 'danger');

  return (
    <AdminSection
      title={t('admin.trash.title', { count: trashed.length })}
      description={t('workspace.trash.intro', { count: policies.trashRetentionDays })}
      aside={
        <div className="flex gap-1">
          <button type="button" className="od-btn od-btn-ghost od-btn-sm" onClick={() => s.navigate({ name: 'admin', section: 'policies' })}>
            <Settings2 size={15} /> {t('admin.trash.retention')}
          </button>
          {trashed.length > 0 && <ConfirmButton icon={<Trash2 size={14} />} label={t('admin.trash.emptyAll')} onConfirm={() => report(s.emptyTrash(), t('admin.trash.emptied'))} />}
        </div>
      }
    >
      {trashed.length === 0 ? (
        <EmptyRow>{t('workspace.trash.empty')}</EmptyRow>
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-line">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-panel-sunken text-xs text-ink-subtle">
              <tr>
                <th className="px-3.5 py-2 text-start font-semibold">{t('admin.trash.colBoard')}</th>
                <th className="px-3.5 py-2 text-start font-semibold">{t('admin.trash.colOwner')}</th>
                <th className="px-3.5 py-2 text-start font-semibold">{t('admin.trash.colDeleted')}</th>
                <th className="px-3.5 py-2 text-start font-semibold">{t('admin.trash.colLeft')}</th>
                <th className="px-3.5 py-2" />
              </tr>
            </thead>
            <tbody>
              {trashed.map((b) => {
                const left = Math.max(0, Math.ceil(((trashExpiresAt(b, policies) ?? Date.now()) - Date.now()) / 86_400_000));
                return (
                  <tr key={b.id} className="border-t border-line">
                    <td className="px-3.5 py-2.5">
                      <div className="truncate font-semibold text-ink">{b.name}</div>
                      <div className="truncate text-xs text-ink-subtle">{boardPlaceLabel(b, s)}</div>
                    </td>
                    <td className="px-3.5 py-2.5 text-ink-muted">{displayName(b.ownerId, s.directory, b.ownerName)}</td>
                    <td className="px-3.5 py-2.5 text-xs text-ink-muted">
                      {formatDateTime(b.deletedAt ?? 0)}
                      <div>{t('admin.trash.by', { name: displayName(b.deletedBy, s.directory) })}</div>
                    </td>
                    <td className="px-3.5 py-2.5 text-xs text-ink-muted">{t('workspace.trash.daysLeft', { count: left })}</td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button type="button" className="od-btn od-btn-ghost od-btn-sm h-8" onClick={() => report(s.restoreBoard(b.id), t('workspace.trash.restored', { name: b.name }))}>
                          <ArchiveRestore size={14} /> {t('workspace.trash.restore')}
                        </button>
                        <ConfirmButton icon={<Trash2 size={14} />} label={t('workspace.trash.purge')} onConfirm={() => report(s.purgeBoard(b.id), t('workspace.trash.purged'))} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AdminSection>
  );
}
