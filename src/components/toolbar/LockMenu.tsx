import type { ReactNode } from 'react';
import { Layers, ShieldHalf } from 'lucide-react';
import { AdvancedLockIcon, LockIcon } from '../icons/od';
import { useBoardStore } from '../../store/useBoardStore';
import type { LockMode } from '../../types/canvas';
import { useCan } from '../../hooks/useCan';
import { cn } from '../../utils/cn';
import { t } from '../../i18n';
import { useT } from '../../i18n/useT';

const board = () => useBoardStore.getState();

export interface LockLevel {
  id: string;
  label: string;
  description: string;
  mode: LockMode;
  framework: boolean;
  icon: ReactNode;
}

/** Os níveis de bloqueio oferecidos (Barra de ações e menu do objeto). */
export const LOCK_LEVELS: LockLevel[] = [
  { id: 'standard', get label() { return t('board.lockMenu.standardLock'); }, get description() { return t('board.lockMenu.anyEditorCanUnlockHolding'); }, mode: 'standard', framework: false, icon: <LockIcon size={17} /> },
  {
    id: 'protected',
    get label() { return t('common.facilitatorProtectedLock'); },
    get description() { return t('board.lockMenu.onlyFacilitatorsAdminsWhoeverLocked'); },
    mode: 'protected',
    framework: false,
    icon: <AdvancedLockIcon size={17} />,
  },
  {
    id: 'framework',
    get label() { return t('board.lockMenu.lockAsBackgroundStructure'); },
    get description() { return t('board.lockMenu.movesBehindNotesIgnoredArea'); },
    mode: 'standard',
    framework: true,
    icon: <Layers size={17} />,
  },
  {
    id: 'framework-protected',
    get label() { return t('board.lockMenu.protectedBackgroundStructure'); },
    get description() { return t('board.lockMenu.backgroundStructureThatOnlyFacilitators'); },
    mode: 'protected',
    framework: true,
    icon: <ShieldHalf size={17} />,
  },
];

export function applyLockLevel(level: LockLevel, ids = board().selectedIds): void {
  board().setLockMode(ids, level.mode, undefined, level.framework);
}

/** Popover "Bloqueio avançado" da Barra de ações. */
export function LockLevelPicker({ onDone }: { onDone: () => void }) {
  const t = useT();
  const standard = useCan('element.lockStandard');
  const protectedLock = useCan('element.lockProtected');
  return (
    <div className="w-[300px] p-1.5">
      <div className="px-2.5 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{t('board.lockMenu.lockSelection')}</div>
      {LOCK_LEVELS.map((level) => {
        const perm = level.mode === 'protected' ? protectedLock : standard;
        return (
          <button
            key={level.id}
            type="button"
            className={cn('od-menu-item min-h-[54px] items-start gap-3 py-2', !perm.allowed && 'opacity-60')}
            title={perm.allowed ? undefined : perm.reason}
            onClick={() => {
              applyLockLevel(level);
              onDone();
            }}
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-brand-900 dark:text-brand-200">{level.icon}</span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold">{level.label}</span>
              <span className="block text-xs leading-snug text-ink-subtle">{perm.allowed ? level.description : perm.reason}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Confirmação para destravar um bloqueio protegido (escudo da Barra de ações). */
export function ProtectedUnlockConfirm({ lockedBy, onDone }: { lockedBy: string | null; onDone: () => void }) {
  const t = useT();
  const perm = useCan('element.unlockProtected', { lockedBy });
  return (
    <div className="w-[280px] p-3">
      <div className="flex items-center gap-2 text-sm font-bold text-ink">
        <AdvancedLockIcon size={17} className="text-brand-700 dark:text-brand-300" />{' '}{t('board.lockMenu.protectedLock')}</div>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
        {perm.allowed
          ? t('board.lockMenu.unlockingFreesTheseObjectsEvery')
          : perm.reason}
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="od-btn od-btn-ghost od-btn-sm" onClick={onDone}>{t('common.cancel')}</button>
        <button
          type="button"
          className={cn('od-btn od-btn-primary od-btn-sm', !perm.allowed && 'opacity-60')}
          onClick={() => {
            board().setLockMode(board().selectedIds, 'none');
            onDone();
          }}
        >{t('board.lockMenu.unlock')}</button>
      </div>
    </div>
  );
}
