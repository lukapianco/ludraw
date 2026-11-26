import { Hammer } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { Modal } from './Modal';
import { useT } from '../../i18n/useT';
import { Trans } from '../../i18n/Trans';

/**
 * Popup padrão para funções fora do escopo atual:
 * "Esta função está em desenvolvimento" + em qual módulo/chat ela chega.
 */
export function DevFeatureDialog() {
  const t = useT();
  const dev = useAppStore((s) => s.dev);
  const hideDev = useAppStore((s) => s.hideDev);

  return (
    <Modal
      open={!!dev}
      onClose={hideDev}
      width={420}
      icon={<Hammer size={20} />}
      title={t('common.devFeatureDialog.inDevelopment')}
      description={
        <>
          <Trans k="common.devFeatureDialog.featureStillBeingBuiltLudraw" params={{ feature: dev?.feature }} components={{ b: (c) => <strong className="font-semibold text-ink">{c}</strong> }} /></>
      }
      footer={
        <button type="button" className="od-btn od-btn-primary" onClick={hideDev} autoFocus>{t('common.devFeatureDialog.got')}</button>
      }
    >
      <div className="space-y-3">
        {dev?.description && <p className="text-base text-ink-muted">{dev.description}</p>}
        {dev?.plannedFor && (
          <div className="flex items-center gap-2 rounded-lg bg-panel-sunken px-3 py-2.5 text-sm text-ink-muted">
            <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" /><Trans k="common.devFeatureDialog.plannedPlannedfor" params={{ plannedFor: dev.plannedFor }} components={{ b: (c) => <span className="font-semibold text-ink">{c}</span> }} />
          </div>
        )}
        <p className="text-xs text-ink-subtle">{t('common.devFeatureDialog.ludrawOpenSourceContributionsAre')}</p>
      </div>
    </Modal>
  );
}
