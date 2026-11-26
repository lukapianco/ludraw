/**
 * LuDraw — Estúdio v2 (Chat 08.2 · B): monta a barra do topo, os módulos Vista e Tempo e SÓ a gaveta aberta
 * (uma por vez). Atalhos: `\` e `Ctrl /` reabrem a última gaveta usada (ou a Ficha); `F6`/`Shift F6` percorrem
 * Ficha → Roda → Vista → Tempo → Dock (`STUDIO_V2_SPEC.md` §11).
 */
import { useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { isTypingTarget } from '../../utils/dom';
import { BoardCardDrawer, TagsDrawer } from './BoardCardDrawer';
import { ConversationsDrawer } from './ConversationsDrawer';
import { ExtensionPanelWindow } from './ExtensionPanelWindow';
import { FacilitateDrawer } from './FacilitateDrawer';
import { StudioBar } from './StudioBar';
import { drawerTrigger, useStudioUi } from './studioUi';
import { TimeModule, TimelineDrawer } from './TimeModule';
import { CompassPanel, DisplayDrawer, ScriptDrawer, ViewModule } from './ViewModule';
import { YouDrawer } from './YouDrawer';

/** `\` / `Ctrl /`: reabre a última gaveta usada (fecha se já estiver aberta). */
export function toggleLastDrawer(): void {
  const ui = useStudioUi.getState();
  if (ui.open) return ui.close(true);
  const id = ui.last ?? 'card';
  ui.openDrawer(id, drawerTrigger(id));
}

// Chat 08.2 · C-2: com algo selecionado, a Cinta do objeto entra no ciclo entre a Roda e a Vista (§16.4)
const REGIONS = ['[data-studio-part="ficha"]', '[data-studio-part="roda"]', '[data-context-toolbar]', '[data-studio-region="view"]', '[data-studio-region="time"]', '[data-od-toolbar]'];

/** `F6` / `Shift F6`: foco no primeiro botão da próxima região (as setas andam dentro dela). */
function cycleRegions(back: boolean): void {
  const regions = REGIONS.map((sel) => document.querySelector<HTMLElement>(sel)).filter((el): el is HTMLElement => !!el);
  if (!regions.length) return;
  const current = regions.findIndex((r) => r.contains(document.activeElement));
  const next = regions[(current + (back ? -1 : 1) + regions.length) % regions.length] ?? regions[0];
  next.querySelector<HTMLElement>('button:not([disabled]), [tabindex="0"]')?.focus();
}

export function StudioLayer() {
  const open = useStudioUi((s) => s.open);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = useAppStore.getState();
      if (a.modal || a.dev) return;
      if (e.key === 'F6') {
        e.preventDefault();
        cycleRegions(e.shiftKey);
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (e.key === '\\' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        toggleLastDrawer();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // trocar de board fecha gavetas, prévia e destaque
  useEffect(() => () => useStudioUi.getState().reset(), []);

  return (
    <>
      <StudioBar />
      <ViewModule />
      <TimeModule />
      <CompassPanel />
      {open === 'card' && <BoardCardDrawer />}
      {open === 'tags' && <TagsDrawer />}
      {open === 'facilitate' && <FacilitateDrawer />}
      {open === 'conversations' && <ConversationsDrawer />}
      {open === 'you' && <YouDrawer />}
      {open === 'display' && <DisplayDrawer />}
      {open === 'script' && <ScriptDrawer />}
      {open === 'timeline' && <TimelineDrawer />}
      <ExtensionPanelWindow />
    </>
  );
}
