/**
 * LuDraw — Inserir templates no board aberto (Chat 04). Caminho oficial: `ensure('board.edit')`
 * → `prepareTemplateInsert` (bloqueio protegido só para quem pode aplicá-lo) → `addElements`
 * (frames no bloco de baixo, estruturas de fundo logo acima, parenting e Activity Log automáticos).
 */

import type { CanvasElement } from '../types/canvas';
import { buildPermissionContext, useBoardStore } from '../store/useBoardStore';
import { useAppStore } from '../store/useAppStore';
import { can } from './permissions';
import { viewportCenterWorld } from './boardActions';
import { GALLERY_TEMPLATES, galleryTemplateData, prepareTemplateInsert, type GalleryTemplateId } from './templates';
import { t } from '../i18n';

/** Insere elementos de um template no centro da tela. Devolve os ids inseridos. */
export function insertTemplateElements(elements: CanvasElement[], name: string): string[] {
  const s = useBoardStore.getState();
  if (s.readOnly || !s.ensure('board.edit')) return [];
  const canProtect = can(buildPermissionContext(s), 'element.lockProtected');
  const els = prepareTemplateInsert(elements, viewportCenterWorld(), { userId: s.access.userId, canProtect });
  if (!els.length) return [];
  s.addElements(els, { select: false });
  s.setActiveTool('select');
  const ids = els.map((e) => e.id).filter((id) => !!useBoardStore.getState().elements[id]);
  s.zoomToFit(ids);
  useAppStore.getState().toast(canProtect ? t('board.templateActions.inserted', { name }) : t('board.templateActions.insertedStandardLock', { name }), 'success');
  return ids;
}

export function insertGalleryTemplate(id: GalleryTemplateId): string[] {
  const tpl = GALLERY_TEMPLATES.find((g) => g.id === id);
  if (!tpl) return [];
  const data = galleryTemplateData(id);
  return insertTemplateElements(
    data.elementOrder.map((k) => data.elements[k]),
    tpl.label,
  );
}
