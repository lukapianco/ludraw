import { memo } from 'react';
import { Blocks } from 'lucide-react';
import type { CanvasElement } from '../../types/canvas';
import { ELEMENT_TYPE_LABELS } from '../../utils/factory';
import { useT } from '../../i18n/useT';

interface Props {
  element: CanvasElement;
  isEditing: boolean;
}

/** Tipos ainda sem View registrada (Chat 04 registrou kanban, tabela e comentário). */
const PLANNED: Partial<Record<CanvasElement['type'], string>> = {};

/**
 * Representação neutra para tipos cujo componente visual ainda não foi registrado no
 * ElementRenderer (ex.: um board importado de uma versão mais nova). Mantém o elemento
 * selecionável/movível sem perder dados.
 */
export const UnsupportedElementView = memo(function UnsupportedElementView({ element }: Props) {
  const t = useT();
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line-strong bg-panel text-center text-ink-muted">
      <Blocks size={Math.min(28, element.height * 0.3)} />
      <span className="text-sm font-semibold">{ELEMENT_TYPE_LABELS[element.type] ?? element.type}</span>
      {PLANNED[element.type] && <span className="text-xs text-ink-subtle">{t('widgets.unsupportedElementView.visualModuleValue', { value: PLANNED[element.type] })}</span>}
    </div>
  );
});
