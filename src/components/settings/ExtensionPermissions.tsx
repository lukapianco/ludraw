import { Globe, ShieldAlert, ShieldOff } from 'lucide-react';
import type { ExtensionManifest, ExtensionPermission } from '../../extensions/types';
import { isElevatedRisk } from '../../extensions/schema';
import type { TKey } from '../../i18n/types';
import { useT } from '../../i18n/useT';
import { cn } from '../../utils/cn';

/** Descrição em linguagem simples de cada permissão (tela de aprovação e ficha). */
export const PERMISSION_TEXT: Record<ExtensionPermission, TKey> = {
  'board.read': 'extensions.permissions.boardRead',
  'board.write': 'extensions.permissions.boardWrite',
  'ui.command': 'extensions.permissions.uiCommand',
  'ui.panel': 'extensions.permissions.uiPanel',
  'clipboard.paste': 'extensions.permissions.clipboardPaste',
  'files.import': 'extensions.permissions.filesImport',
  'files.export': 'extensions.permissions.filesExport',
  storage: 'extensions.permissions.storage',
  network: 'extensions.permissions.network',
};

/**
 * Chat 06.5 · B: lista de permissões pedidas. Com `approved` + `onToggle`, cada uma pode ser revogada
 * (ou devolvida) a qualquer momento. `network` mostra os domínios exatos da allowlist.
 */
export function PermissionList({ manifest, approved, onToggle, disabled }: { manifest: ExtensionManifest; approved?: readonly string[]; onToggle?: (p: ExtensionPermission, granted: boolean) => void; disabled?: boolean }) {
  const t = useT();
  if (!manifest.permissions.length) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <ShieldOff size={14} className="text-ink-muted" /> {t('extensions.permissions.none')}
      </span>
    );
  }
  return (
    <ul className="space-y-1.5">
      {manifest.permissions.map((p) => {
        const granted = approved ? approved.includes(p) : true;
        return (
          <li key={p} className="flex items-start gap-2">
            {p === 'network' ? <Globe size={14} className="mt-0.5 shrink-0 text-warning" /> : <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--od-text-muted)]" />}
            <span className={cn('min-w-0 flex-1 text-sm', !granted && 'text-ink-subtle line-through')}>
              <code className="me-1.5 rounded bg-panel px-1 py-0.5 text-2xs text-ink-muted ring-1 ring-line">{p}</code>
              {t(PERMISSION_TEXT[p], p === 'network' ? { hosts: (manifest.networkAllowlist ?? []).join(', ') } : undefined)}
            </span>
            {onToggle && (
              <button type="button" className="od-btn od-btn-ghost od-btn-sm shrink-0" disabled={disabled && !granted} onClick={() => onToggle(p, !granted)}>
                {granted ? t('extensions.permissions.revoke') : t('extensions.permissions.grant')}
              </button>
            )}
            {!granted && !onToggle && <span className="text-2xs text-ink-subtle">{t('extensions.permissions.revoked')}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** Aviso de risco elevado (`ui.panel` + `board.read`, EXTENSIONS_SPEC §5.11). */
export function ElevatedRiskNotice({ manifest, confirmed, onConfirm }: { manifest: ExtensionManifest; confirmed: boolean; onConfirm: (v: boolean) => void }) {
  const t = useT();
  if (!isElevatedRisk(manifest.permissions)) return null;
  return (
    <div role="alert" className="rounded-xl bg-danger-soft p-3 text-sm ring-1 ring-line">
      <div className="flex items-start gap-2 text-danger">
        <ShieldAlert size={16} className="mt-0.5 shrink-0" />
        <span>{t('extensions.permissions.elevatedRisk')}</span>
      </div>
      <label className="mt-2 flex items-center gap-2 text-ink">
        <input type="checkbox" checked={confirmed} onChange={(e) => onConfirm(e.target.checked)} />
        {t('extensions.permissions.elevatedConfirm')}
      </label>
    </div>
  );
}
