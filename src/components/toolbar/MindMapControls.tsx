import { ChevronsDownUp, ChevronsUpDown, CornerDownRight, Plus } from 'lucide-react';
import type { MindMapElement } from '../../types/canvas';
import { useCan } from '../../hooks/useCan';
import { rootNode } from '../../utils/mindmap';
import { mindMapAddChild, mindMapAddSibling, mindMapCollapseAll, mindMapSetDirection, useMindMapUi } from '../../utils/mindmapActions';
import { Tooltip } from '../ui/Tooltip';
import { useT } from '../../i18n/useT';

/**
 * Controles da Barra de ações para um mapa mental (Chat 03 · Rodada A):
 * direção do auto-layout, nova ideia filha/irmã do nó ativo e recolher/expandir tudo.
 * Permissão pela via oficial (`useCan('board.edit')`); o store reaplica `ensure`.
 */
export function MindMapControls({ element }: { element: MindMapElement }) {
  const t = useT();
  const edit = useCan('board.edit');
  const activeId = useMindMapUi((s) => (s.elementId === element.id ? s.nodeId : null));
  const root = rootNode(element.nodes);
  const target = activeId && element.nodes.some((n) => n.id === activeId) ? activeId : root?.id ?? null;
  const targetIsRoot = target === root?.id;
  const disabledReason = edit.allowed ? undefined : edit.reason;

  return (
    <>
      <div className="flex items-center rounded-lg bg-panel-sunken p-0.5" role="group" aria-label={t('board.mindMapControls.mapDirection')}>
        {(['horizontal', 'vertical'] as const).map((dir) => (
          <Tooltip key={dir} label={disabledReason ?? (dir === 'horizontal' ? t('board.mindMapControls.branchesSides') : t('board.mindMapControls.branchesDownward'))} side="top">
            <button
              type="button"
              className="od-tool h-8 w-8"
              data-active={element.layoutDirection === dir}
              disabled={!edit.allowed}
              onClick={() => mindMapSetDirection(element.id, dir)}
              aria-label={dir === 'horizontal' ? t('board.mindMapControls.horizontalLayout') : t('board.mindMapControls.verticalLayout')}
            >
              <DirectionIcon dir={dir} />
            </button>
          </Tooltip>
        ))}
      </div>
      <span className="od-divider-v" />
      <Tooltip label={disabledReason ?? t('board.mindMapControls.newChildIdeaTab')} side="top">
        <button type="button" className="od-tool" disabled={!edit.allowed || !target} onClick={() => target && mindMapAddChild(element.id, target)} aria-label={t('board.mindMapControls.newChildIdea')}>
          <Plus size={18} />
        </button>
      </Tooltip>
      <Tooltip label={disabledReason ?? (targetIsRoot ? t('board.mindMapControls.clickIdeaCreateSibling') : t('board.mindMapControls.newSiblingIdeaEnter'))} side="top">
        <button
          type="button"
          className="od-tool"
          disabled={!edit.allowed || !target || targetIsRoot}
          onClick={() => target && mindMapAddSibling(element.id, target)}
          aria-label={t('board.mindMapControls.newSiblingIdea')}
        >
          <CornerDownRight size={18} />
        </button>
      </Tooltip>
      <Tooltip label={disabledReason ?? t('board.mindMapControls.collapseAllBranches')} side="top">
        <button type="button" className="od-tool" disabled={!edit.allowed} onClick={() => mindMapCollapseAll(element.id, true)} aria-label={t('board.mindMapControls.collapseAllBranches')}>
          <ChevronsDownUp size={18} />
        </button>
      </Tooltip>
      <Tooltip label={disabledReason ?? t('board.mindMapControls.expandAllBranches')} side="top">
        <button type="button" className="od-tool" disabled={!edit.allowed} onClick={() => mindMapCollapseAll(element.id, false)} aria-label={t('board.mindMapControls.expandAllBranches')}>
          <ChevronsUpDown size={18} />
        </button>
      </Tooltip>
      <span className="od-divider-v" />
    </>
  );
}

function DirectionIcon({ dir }: { dir: 'horizontal' | 'vertical' }) {
  return dir === 'horizontal' ? (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <rect x="1.5" y="7.5" width="6" height="5" rx="1.5" />
      <path d="M7.5 10 C 10 10, 10 4.5, 12.5 4.5 M7.5 10 C 10 10, 10 15.5, 12.5 15.5" />
      <rect x="12.5" y="2.5" width="6" height="4" rx="1.2" />
      <rect x="12.5" y="13.5" width="6" height="4" rx="1.2" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <rect x="7" y="1.5" width="6" height="5" rx="1.5" />
      <path d="M10 6.5 C 10 9, 4.5 9, 4.5 11.5 M10 6.5 C 10 9, 15.5 9, 15.5 11.5" />
      <rect x="1.5" y="11.5" width="6" height="5" rx="1.2" />
      <rect x="12.5" y="11.5" width="6" height="5" rx="1.2" />
    </svg>
  );
}
