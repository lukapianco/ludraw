/**
 * LuDraw — Ações do mapa mental ligadas ao store (Chat 03 · Rodada A).
 *
 * Toda mudança passa pelo caminho oficial: `ensure('board.edit')` → `pushHistory()` (um passo
 * de desfazer por ação estrutural) → `updateElement` / `addElements` com o resultado do
 * auto-layout (`layoutMindMap`). A digitação dentro de um nó não grava histórico a cada tecla:
 * o passo é gravado por `setEditingId` ao entrar na edição (mesma regra dos outros textos).
 *
 * `useMindMapUi` guarda só estado de interface (nó ativo e nó em edição) — não vai para o board.
 */

import { create } from 'zustand';
import type { MindMapElement } from '../types/canvas';
import { notify } from '../store/useAppStore';
import { useBoardStore } from '../store/useBoardStore';
import { viewportCenterWorld } from './boardActions';
import { createMindMap } from './factory';
import type { Point } from './math';
import {
  addChildNode,
  addSiblingNode,
  childrenOf,
  layoutMindMap,
  removeBranch,
  rootNode,
  setAllCollapsed,
  setNodeCollapsed,
  setNodeText,
  visibleNodes,
} from './mindmap';
import { t } from '../i18n';

interface MindMapUiState {
  /** Mapa ao qual `nodeId`/`editingNodeId` pertencem */
  elementId: string | null;
  /** Nó ativo (alvo de Tab/Enter/Delete/setas) */
  nodeId: string | null;
  /** Nó com o campo de texto aberto (só vale enquanto `editingId` do board = `elementId`) */
  editingNodeId: string | null;
  /** Texto inicial quando a edição começa digitando um caractere */
  draftInitial: string | null;
}

export const useMindMapUi = create<MindMapUiState>(() => ({ elementId: null, nodeId: null, editingNodeId: null, draftInitial: null }));

const board = () => useBoardStore.getState();

function getMap(id: string): MindMapElement | null {
  const el = board().elements[id];
  return el && el.type === 'mindmap' ? el : null;
}

function canEdit(el: MindMapElement): boolean {
  if (board().readOnly) return false;
  if (el.locked) {
    notify(t('widgets.mindmapActions.thisMindMapLockedUnlock'));
    return false;
  }
  return board().ensure('board.edit');
}

/** Aplica novos nós + auto-layout. `history` = um passo de desfazer próprio. */
function commit(el: MindMapElement, nodes: MindMapElement['nodes'], history: boolean, extra: Partial<MindMapElement> = {}): void {
  const s = board();
  if (history) s.pushHistory();
  s.updateElement(el.id, { ...extra, ...layoutMindMap({ ...el, ...extra, nodes }) });
}

export function setActiveNode(elementId: string, nodeId: string | null): void {
  const ui = useMindMapUi.getState();
  if (ui.elementId === elementId && ui.nodeId === nodeId) return;
  useMindMapUi.setState({ elementId, nodeId, editingNodeId: ui.elementId === elementId ? ui.editingNodeId : null });
}

/** Insere um mapa no centro da tela (ou em `at`), seleciona e já abre o texto da raiz. */
export function insertMindMap(at?: Point): string | null {
  const s = board();
  if (s.readOnly || !s.ensure('board.edit')) return null;
  const el = createMindMap(at ?? viewportCenterWorld(), { branches: [t('widgets.mindmapActions.branch1'), t('widgets.mindmapActions.branch2'), t('widgets.mindmapActions.branch3')] });
  s.addElements([el], { select: true });
  if (!board().elements[el.id]) return null;
  s.setActiveTool('select');
  const root = rootNode(el.nodes);
  if (root) startEditNode(el.id, root.id);
  return el.id;
}

/** Abre o campo de texto do nó. `setEditingId` checa `board.edit`, bloqueio e grava o histórico. */
export function startEditNode(elementId: string, nodeId: string, initialText?: string): void {
  const el = getMap(elementId);
  if (!el || !el.nodes.some((n) => n.id === nodeId)) return;
  if (el.locked) {
    notify(t('widgets.mindmapActions.thisMindMapLockedUnlock'));
    return;
  }
  useMindMapUi.setState({ elementId, nodeId, editingNodeId: nodeId, draftInitial: initialText ?? null });
  const s = board();
  if (s.editingId !== elementId) s.setEditingId(elementId);
  if (board().editingId !== elementId) useMindMapUi.setState({ editingNodeId: null, draftInitial: null });
}

/** Fecha a edição do mapa (o campo confirma o texto ao desmontar). */
export function stopEditing(elementId: string): void {
  if (board().editingId === elementId) board().setEditingId(null);
}

/**
 * Chamado quando o campo de um nó fecha: libera o estado de edição e remove o nó se ele
 * ficou vazio, é folha e não é a raiz (ex.: Enter num nó recém-criado sem texto).
 */
export function finishEditNode(elementId: string, nodeId: string): void {
  const ui = useMindMapUi.getState();
  if (ui.elementId === elementId && ui.editingNodeId === nodeId) useMindMapUi.setState({ editingNodeId: null, draftInitial: null });
  const el = getMap(elementId);
  const node = el?.nodes.find((n) => n.id === nodeId);
  if (!el || !node || node.parentId === null || node.text.trim() || childrenOf(el.nodes, nodeId).length) return;
  if (board().readOnly || !board().ensure('board.edit')) return;
  const { nodes, nextActive } = removeBranch(el, nodeId);
  commit(el, nodes, false);
  if (useMindMapUi.getState().nodeId === nodeId) setActiveNode(elementId, nextActive);
}

/** Digitação ao vivo (o nó cresce enquanto o texto muda). */
export function mindMapSetText(elementId: string, nodeId: string, text: string): void {
  const el = getMap(elementId);
  if (!el || el.locked) return;
  const node = el.nodes.find((n) => n.id === nodeId);
  if (!node || node.text === text) return;
  commit(el, setNodeText(el.nodes, nodeId, text), false);
}

export function mindMapAddChild(elementId: string, parentId: string, edit = true): string | null {
  const el = getMap(elementId);
  if (!el || !canEdit(el)) return null;
  const { nodes, id } = addChildNode(el, parentId);
  if (!id) return null;
  commit(el, nodes, true);
  setActiveNode(elementId, id);
  if (edit) startEditNode(elementId, id);
  return id;
}

export function mindMapAddSibling(elementId: string, nodeId: string, edit = true): string | null {
  const el = getMap(elementId);
  if (!el || !canEdit(el)) return null;
  const { nodes, id } = addSiblingNode(el, nodeId);
  if (!id) return null;
  commit(el, nodes, true);
  setActiveNode(elementId, id);
  if (edit) startEditNode(elementId, id);
  return id;
}

/** Remove o ramo (nó + descendentes). A raiz não é removida por aqui — Delete apaga o mapa todo. */
export function mindMapRemoveBranch(elementId: string, nodeId: string): void {
  const el = getMap(elementId);
  if (!el || !canEdit(el)) return;
  const { nodes, nextActive } = removeBranch(el, nodeId);
  if (nodes === el.nodes) return;
  commit(el, nodes, true);
  setActiveNode(elementId, nextActive);
}

export function mindMapToggleCollapse(elementId: string, nodeId: string, collapsed?: boolean): void {
  const el = getMap(elementId);
  const node = el?.nodes.find((n) => n.id === nodeId);
  if (!el || !node || node.parentId === null || !childrenOf(el.nodes, nodeId).length) return;
  const next = collapsed ?? !node.collapsed;
  if (next === !!node.collapsed || !canEdit(el)) return;
  commit(el, setNodeCollapsed(el.nodes, nodeId, next), true);
}

export function mindMapCollapseAll(elementId: string, collapsed: boolean): void {
  const el = getMap(elementId);
  if (!el || !canEdit(el)) return;
  commit(el, setAllCollapsed(el.nodes, collapsed), true);
  const ui = useMindMapUi.getState();
  if (collapsed && ui.elementId === elementId && ui.nodeId) {
    // o nó ativo pode ter ficado escondido: volta para a raiz
    if (!visibleNodes(getMap(elementId)?.nodes ?? []).some((n) => n.id === ui.nodeId)) setActiveNode(elementId, rootNode(el.nodes)?.id ?? null);
  }
}

export function mindMapSetDirection(elementId: string, direction: MindMapElement['layoutDirection']): void {
  const el = getMap(elementId);
  if (!el || el.layoutDirection === direction || !canEdit(el)) return;
  commit(el, el.nodes, true, { layoutDirection: direction });
}

/** Próximo nó visível na direção da seta (geometria: distância no eixo + 2× desvio lateral). */
export function neighborNode(el: MindMapElement, fromId: string, key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'): string | null {
  const nodes = visibleNodes(el.nodes);
  const from = nodes.find((n) => n.id === fromId);
  if (!from) return null;
  const c = (n: (typeof nodes)[number]) => ({ x: n.offsetX + (n.width ?? 0) / 2, y: n.offsetY + (n.height ?? 0) / 2 });
  const a = c(from);
  const dir = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 } }[key];
  let best: string | null = null;
  let bestScore = Infinity;
  for (const n of nodes) {
    if (n.id === fromId) continue;
    const b = c(n);
    const along = (b.x - a.x) * dir.x + (b.y - a.y) * dir.y;
    if (along <= 4) continue;
    const across = Math.abs((b.x - a.x) * dir.y - (b.y - a.y) * dir.x);
    const score = along + across * 2;
    if (score < bestScore) {
      bestScore = score;
      best = n.id;
    }
  }
  return best;
}

/**
 * Teclas do mapa mental quando ele é a única seleção e não há campo de texto aberto.
 * Devolve true se a tecla foi consumida (o resto de `useKeyboardShortcuts` não roda).
 *  Tab = filho · Enter = irmão (sem nó ativo: edita a raiz) · Delete/Backspace = remove o ramo
 *  · + / − = expande/recolhe · setas = navega · F2 ou digitar = edita · Esc = solta o nó ativo.
 */
export function handleMindMapKey(e: KeyboardEvent): boolean {
  const s = board();
  if (s.readOnly || s.editingId || s.selectedIds.length !== 1) return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const el = s.elements[s.selectedIds[0]];
  if (!el || el.type !== 'mindmap') return false;
  const ui = useMindMapUi.getState();
  const root = rootNode(el.nodes);
  if (!root) return false;
  let active = ui.elementId === el.id ? ui.nodeId : null;
  if (active && !visibleNodes(el.nodes).some((n) => n.id === active)) active = null;
  const consume = () => {
    e.preventDefault();
    e.stopPropagation();
    return true;
  };

  switch (e.key) {
    case 'Tab':
      mindMapAddChild(el.id, active ?? root.id);
      return consume();
    case 'Enter':
      if (!active) startEditNode(el.id, root.id);
      else mindMapAddSibling(el.id, active);
      return consume();
    case 'Delete':
    case 'Backspace':
      if (!active || active === root.id) return false;
      mindMapRemoveBranch(el.id, active);
      return consume();
    case 'F2':
      startEditNode(el.id, active ?? root.id);
      return consume();
    case '+':
    case '=':
      if (!active) return false;
      mindMapToggleCollapse(el.id, active, false);
      return consume();
    case '-':
    case '_':
      if (!active) return false;
      mindMapToggleCollapse(el.id, active, true);
      return consume();
    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight': {
      if (!active) return false;
      const next = neighborNode(el, active, e.key);
      if (next) setActiveNode(el.id, next);
      return consume();
    }
    case 'Escape':
      if (!active) return false;
      setActiveNode(el.id, null);
      return consume();
    default:
      // Digitar com um nó ativo começa a editar (substitui o texto). Não intercepta atalhos
      // globais que geram caractere: Shift+número (ajustar zoom) e "?" (lista de atalhos).
      if (active && e.key.length === 1 && e.key !== ' ' && e.key !== '?' && !(e.shiftKey && /^Digit\d$/.test(e.code)) && !e.repeat) {
        startEditNode(el.id, active, e.key);
        return consume();
      }
      return false;
  }
}
