import { memo, useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { MindMapElement, MindMapNodeItem } from '../../types/canvas';
import { useBoardStore } from '../../store/useBoardStore';
import {
  depthOf,
  isHiddenNode,
  levelStyle,
  measureNode,
  MINDMAP_ROOT_FILL,
  mindMapEdges,
  nodeFill,
  nodeLines,
  nodeTextColor,
  subtreeIds,
  toggleAnchor,
} from '../../utils/mindmap';
import {
  finishEditNode,
  mindMapAddChild,
  mindMapAddSibling,
  mindMapSetText,
  mindMapToggleCollapse,
  setActiveNode,
  stopEditing,
  useMindMapUi,
} from '../../utils/mindmapActions';
import { useT } from '../../i18n/useT';

interface Props {
  element: MindMapElement;
  isEditing: boolean;
}

/**
 * Mapa mental nativo (Chat 03 · Rodada A). Um único elemento do board: as curvas ficam num
 * SVG e cada nó é um bloco HTML posicionado pelo auto-layout (`utils/mindmap.ts`).
 *
 * Interação: clicar num nó o torna ativo (anel `--od-selection`); duplo clique (tratado no
 * `CanvasStage`), F2 ou digitar edita; Tab cria filho, Enter cria irmão, Delete remove o ramo, + / − e o botão na ponta do
 * nó recolhem/expandem, setas navegam. Arrastar em qualquer ponto move o mapa inteiro.
 */
export const MindMapView = memo(function MindMapView({ element, isEditing }: Props) {
  const t = useT();
  const selected = useBoardStore((s) => s.selectedIds.length === 1 && s.selectedIds[0] === element.id);
  const readOnly = useBoardStore((s) => s.readOnly);
  const activeId = useMindMapUi((s) => (s.elementId === element.id ? s.nodeId : null));
  const editingNodeId = useMindMapUi((s) => (s.elementId === element.id && isEditing ? s.editingNodeId : null));
  const edges = mindMapEdges(element);
  const interactive = selected && !readOnly && !element.locked;

  const childCount = new Map<string, number>();
  for (const n of element.nodes) if (n.parentId) childCount.set(n.parentId, (childCount.get(n.parentId) ?? 0) + 1);
  const visible = element.nodes.filter((n) => !isHiddenNode(element.nodes, n.id));

  return (
    <div className="absolute inset-0" style={{ userSelect: 'none' }}>
      <svg width={Math.max(1, element.width)} height={Math.max(1, element.height)} className="absolute inset-0 overflow-visible" style={{ pointerEvents: 'none' }} aria-hidden="true">
        {edges.map((e) => (
          <path key={e.id} d={e.d} fill="none" stroke={e.color} strokeWidth={e.width} strokeLinecap="round" />
        ))}
      </svg>

      {visible.map((n) => {
        const depth = depthOf(element.nodes, n.id);
        return (
          <MindMapNode
            key={n.id}
            element={element}
            node={n}
            depth={depth}
            active={selected && activeId === n.id}
            editing={editingNodeId === n.id}
          />
        );
      })}

      {visible.map((n) => {
        const kids = childCount.get(n.id) ?? 0;
        const isActive = interactive && activeId === n.id && !editingNodeId;
        const showToggle = kids > 0 && n.parentId !== null && (n.collapsed || interactive);
        if (!showToggle && !isActive) return null;
        const anchor = toggleAnchor(element, n);
        const vertical = element.layoutDirection === 'vertical';
        const step = 24;
        const away = vertical ? { x: 0, y: 1 } : anchor.x < n.offsetX ? { x: -1, y: 0 } : { x: 1, y: 0 };
        const addAt = showToggle ? { x: anchor.x + away.x * step, y: anchor.y + away.y * step } : anchor;
        return (
          <span key={`ctl-${n.id}`}>
            {showToggle && (
              <button
                type="button"
                data-od-floating
                className="absolute flex items-center justify-center rounded-full text-[11px] font-bold leading-none text-white shadow-panel transition-transform duration-fast ease-out hover:scale-110"
                style={{
                  left: anchor.x,
                  top: anchor.y,
                  minWidth: 20,
                  height: 20,
                  padding: n.collapsed ? '0 6px' : 0,
                  transform: 'translate(-50%, -50%)',
                  background: n.parentId === null ? MINDMAP_ROOT_FILL : n.color,
                  pointerEvents: interactive || n.collapsed ? 'auto' : 'none',
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={() => {
                  if (!interactive) useBoardStore.getState().setSelectedIds([element.id]);
                  mindMapToggleCollapse(element.id, n.id);
                }}
                aria-label={n.collapsed ? t('widgets.mindMapView.expandBranchValueIdeas', { value: subtreeIds(element.nodes, n.id).size - 1 }) : t('widgets.mindMapView.collapseBranch')}
                title={n.collapsed ? t('widgets.mindMapView.expandBranch') : t('widgets.mindMapView.collapseBranch2')}
              >
                {n.collapsed ? `+${subtreeIds(element.nodes, n.id).size - 1}` : '−'}
              </button>
            )}
            {isActive && (
              <button
                type="button"
                data-od-floating
                className="absolute flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] border-dashed text-[14px] font-bold leading-none shadow-panel transition-transform duration-fast ease-out hover:scale-110"
                style={{
                  left: addAt.x,
                  top: addAt.y,
                  transform: 'translate(-50%, -50%)',
                  borderColor: n.parentId === null ? 'var(--od-selection)' : n.color,
                  color: n.parentId === null ? 'var(--od-selection)' : n.color,
                  background: 'var(--od-panel)',
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={() => mindMapAddChild(element.id, n.id)}
                aria-label={t('widgets.mindMapView.addChildIdeaTab')}
                title={t('widgets.mindMapView.addChildIdeaTab')}
              >
                +
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
});

function nodeStyle(n: MindMapNodeItem, depth: number): CSSProperties {
  const st = levelStyle(depth);
  const size = n.width && n.height ? { width: n.width, height: n.height } : measureNode(n, depth);
  return {
    left: n.offsetX,
    top: n.offsetY,
    width: size.width,
    height: size.height,
    borderRadius: st.radius,
    background: nodeFill(n, depth),
    border: st.border ? `${st.border}px solid ${n.color}` : undefined,
    color: nodeTextColor(depth),
    font: st.font,
    lineHeight: `${st.lineHeight}px`,
    padding: `${st.padY}px ${st.padX}px`,
    boxShadow: depth === 0 ? 'var(--od-shadow-pop)' : 'var(--od-shadow-panel)',
  };
}

function MindMapNode({ element, node, depth, active, editing }: { element: MindMapElement; node: MindMapNodeItem; depth: number; active: boolean; editing: boolean }) {
  const style = nodeStyle(node, depth);
  const empty = !node.text.trim();
  return (
    <div
      data-mm-node={node.id}
      className="absolute box-border flex flex-col items-center justify-center text-center"
      style={{
        ...style,
        outline: active ? '2.5px solid var(--od-selection)' : undefined,
        outlineOffset: 3,
        transition: 'left 180ms cubic-bezier(0.22, 1, 0.36, 1), top 180ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
      onPointerDown={() => {
        // clicar em outro nó durante a edição fecha o campo atual
        const ui = useMindMapUi.getState();
        if (ui.elementId === element.id && ui.editingNodeId && ui.editingNodeId !== node.id) stopEditing(element.id);
        setActiveNode(element.id, node.id);
      }}
    >
      {editing ? (
        <NodeEditor element={element} node={node} depth={depth} />
      ) : (
        nodeLines(node, depth).map((line, i) => (
          <span key={i} className="block whitespace-pre" style={{ opacity: empty ? 0.5 : 1 }}>
            {line || ' '}
          </span>
        ))
      )}
    </div>
  );
}

/**
 * Campo de texto do nó: atualiza o mapa a cada tecla (o nó cresce e o layout se ajusta).
 * Tab = filho · Enter = irmão (num nó vazio ou na raiz, só fecha) · Shift+Enter = nova linha · Esc = fecha.
 */
function NodeEditor({ element, node, depth }: { element: MindMapElement; node: MindMapNodeItem; depth: number }) {
  const t = useT();
  const ref = useRef<HTMLTextAreaElement>(null);
  const st = levelStyle(depth);

  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    const draft = useMindMapUi.getState().draftInitial;
    ta.focus({ preventScroll: true });
    if (draft !== null) {
      useMindMapUi.setState({ draftInitial: null });
      mindMapSetText(element.id, node.id, draft);
      ta.value = draft;
      ta.setSelectionRange(draft.length, draft.length);
    } else {
      ta.select();
    }
  }, []); // montagem única por nó em edição

  // Ao fechar (clique fora, troca de nó…), limpa o estado e remove o nó se ficou vazio.
  // Adiado um tique: no StrictMode a desmontagem simulada é seguida de nova montagem.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.setTimeout(() => {
        if (!mounted.current) finishEditNode(element.id, node.id);
      }, 0);
    };
  }, [element.id, node.id]);

  return (
    <textarea
      ref={ref}
      data-editing="true"
      defaultValue={node.text}
      rows={1}
      spellCheck={false}
      aria-label={t('widgets.mindMapView.ideaText')}
      placeholder={depth === 0 ? t('widgets.mindMapView.centralIdea') : t('widgets.mindMapView.newIdea')}
      onChange={(e) => mindMapSetText(element.id, node.id, e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        const value = e.currentTarget.value;
        if (e.key === 'Tab') {
          e.preventDefault();
          mindMapAddChild(element.id, node.id);
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (!value.trim() || node.parentId === null) stopEditing(element.id);
          else mindMapAddSibling(element.id, node.id);
        } else if (e.key === 'Escape') {
          // mesma regra dos outros textos do board: Esc confirma e fecha
          e.preventDefault();
          stopEditing(element.id);
        }
      }}
      className="absolute inset-0 m-0 box-border resize-none overflow-hidden border-0 bg-transparent text-center outline-none"
      style={{ font: st.font, lineHeight: `${st.lineHeight}px`, padding: `${st.padY}px ${st.padX}px`, color: 'inherit', userSelect: 'text' }}
    />
  );
}
