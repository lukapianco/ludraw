import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  BringToFront,
  ClipboardPaste,
  Download,
  Eraser,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Frame,
  Group,
  Image as ImageIcon,
  LayoutTemplate,
  Link2,
  LockOpen,
  Paintbrush,
  PenLine,
  Play,
  SendToBack,
  Ungroup,
} from 'lucide-react';
import type { MenuItem } from '../components/ui/Menu';
import { useBoardStore } from '../store/useBoardStore';
import { useAppStore } from '../store/useAppStore';
import { isTextualElement } from '../types/canvas';
import {
  copyLinkToElement,
  copySelection,
  copySelectionAsImage,
  createFrameFromSelection,
  deleteSelectionWithFramePrompt,
  exportFrame,
  exportSelectionCSV,
  startPresentation,
} from '../utils/boardActions';
import { useCan } from '../hooks/useCan';
import { ELEMENT_TYPE_LABELS, getElementText, stickyColorName } from '../utils/factory';
import type { CanvasElement } from '../types/canvas';
import { BringFrontIcon, CopyIcon, DuplicateIcon, LockIcon, PencilIcon, TrashIcon, UnlockIcon } from '../components/icons/od';
import { formatDateTime } from '../utils/format';
import { effectiveLockMode } from '../utils/permissions';
import { applyLockLevel, LOCK_LEVELS } from '../components/toolbar/LockMenu';
import { useT } from '../i18n/useT';

const I = 16;

/**
 * Menu do objeto (Chat 08.2 · C-2, `STUDIO_V2_SPEC.md` §5.2): o MESMO componente para o botão direito sobre o objeto e
 * o `⋯` da Cinta. Cabeçalho (tipo e nome) · linha rápida (Copiar · Duplicar · Bloquear · Frente · Excluir) · 6 linhas:
 * Editar ▸ · Copiar como ▸ · Organizar ▸ · Bloqueio ▸ · Frame e modelo ▸ · Exportar e info ▸. As ações e as
 * permissões são as de antes (nada some). `extraEdit` recebe o que a Cinta tira da barra em telas estreitas.
 */
export function useElementMenuItems(extraEdit: MenuItem[] = []): MenuItem[] {
  const t = useT();
  const selectedIds = useBoardStore((s) => s.selectedIds);
  const elements = useBoardStore((s) => s.elements);
  const copiedStyle = useBoardStore((s) => s.copiedStyle);
  const userName = useAppStore((s) => s.user?.name ?? t('common.you'));
  const b = useBoardStore.getState;

  const selected = selectedIds.map((id) => elements[id]).filter(Boolean);
  const first = selected[0];
  const allLocked = selected.length > 0 && selected.every((e) => e.locked);
  const anyProtected = selected.some((e) => effectiveLockMode(e) === 'protected');
  const anyGrouped = selected.some((e) => e.groupId);
  const hasText = selected.some((e) => isTextualElement(e));
  const multi = selected.length > 1;
  const frame = selected.length === 1 && first?.type === 'frame' ? first : null;
  const hideCan = useCan('frame.toggleHidden');
  const exportCan = useCan('board.export');

  const header: MenuItem = {
    kind: 'header',
    id: 'h',
    title: multi ? t('menus.objectMenu.selection', { count: selected.length }) : first ? objectTitle(first) : '',
    detail: !multi && first ? objectDetail(first) : undefined,
  };
  const quick: MenuItem = {
    kind: 'quick',
    id: 'q',
    items: [
      { id: 'copy', label: t('menus.objectMenu.quickCopy'), icon: <CopyIcon size={18} />, hint: t('menus.elementMenu.copy'), onSelect: () => void copySelection(false) },
      { id: 'duplicate', label: t('common.duplicate'), icon: <DuplicateIcon size={18} />, onSelect: () => b().duplicateSelected() },
      allLocked
        ? { id: 'unlock', label: t('menus.objectMenu.quickUnlock'), icon: <UnlockIcon size={18} />, hint: anyProtected ? t('menus.elementMenu.unlockProtectedLock') : t('menus.elementMenu.unlock'), onSelect: () => b().setLockMode(b().selectedIds, 'none') }
        : { id: 'lock', label: t('menus.objectMenu.quickLock'), icon: <LockIcon size={18} />, hint: t('board.lockMenu.standardLock'), onSelect: () => b().setLockMode(b().selectedIds, 'standard') },
      { id: 'front', label: t('menus.objectMenu.quickFront'), icon: <BringFrontIcon size={18} />, hint: t('menus.elementMenu.bringFront'), onSelect: () => b().bringToFront(b().selectedIds) },
      { id: 'delete', label: t('common.delete'), icon: <TrashIcon size={18} />, danger: true, disabled: allLocked, onSelect: () => deleteSelectionWithFramePrompt() },
    ],
  };

  const edit: MenuItem = {
    kind: 'submenu',
    id: 'edit',
    label: t('menus.objectMenu.edit'),
    icon: <PencilIcon size={I} />,
    items: [
      { kind: 'item', id: 'rename', label: t('common.rename'), icon: <PenLine size={I} />, disabled: !first || !isTextualElement(first) || !!first.locked || multi, onSelect: () => first && b().setEditingId(first.id) },
      { kind: 'item', id: 'clear', label: t('menus.elementMenu.clearContent'), icon: <Eraser size={I} />, shortcut: 'Ctrl + Backspace', disabled: !hasText || allLocked, onSelect: () => b().clearContent(b().selectedIds) },
      { kind: 'separator', id: 'e1' },
      { kind: 'item', id: 'copy-style', label: t('menus.elementMenu.copyStyle'), icon: <Paintbrush size={I} />, shortcut: 'Ctrl + Alt + C', disabled: !first, onSelect: () => b().copyStyle() },
      { kind: 'item', id: 'paste-style', label: t('menus.elementMenu.pasteStyle'), icon: <ClipboardPaste size={I} />, shortcut: 'Ctrl + Alt + V', disabled: !copiedStyle || allLocked, onSelect: () => b().pasteStyle() },
      ...(extraEdit.length ? ([{ kind: 'separator', id: 'e2' }, ...extraEdit] as MenuItem[]) : []),
    ],
  };
  const copyAs: MenuItem = {
    kind: 'submenu',
    id: 'copy-as',
    label: t('menus.objectMenu.copyAs'),
    icon: <CopyIcon size={I} />,
    items: [
      { kind: 'item', id: 'copy-image', label: t('menus.objectMenu.asImage'), icon: <ImageIcon size={I} />, shortcut: 'Ctrl + Shift + C', onSelect: () => void copySelectionAsImage() },
      { kind: 'item', id: 'copy-link', label: t('menus.objectMenu.objectLink'), icon: <Link2 size={I} />, shortcut: 'Ctrl + Alt + Shift + C', disabled: !first, onSelect: () => first && void copyLinkToElement(first.id) },
    ],
  };
  const arrange: MenuItem = {
    kind: 'submenu',
    id: 'arrange',
    label: t('menus.elementMenu.arrange'),
    icon: <BringFrontIcon size={I} />,
    items: [
      { kind: 'item', id: 'front', label: t('menus.elementMenu.bringFront'), icon: <BringToFront size={I} />, shortcut: 'PgUp', onSelect: () => b().bringToFront(b().selectedIds) },
      { kind: 'item', id: 'forward', label: t('menus.elementMenu.bringForward'), shortcut: 'Ctrl + PgUp', onSelect: () => b().bringForward(b().selectedIds) },
      { kind: 'item', id: 'backward', label: t('menus.elementMenu.sendBackward'), shortcut: 'Ctrl + PgDn', onSelect: () => b().sendBackward(b().selectedIds) },
      { kind: 'item', id: 'back', label: t('menus.elementMenu.sendBack'), icon: <SendToBack size={I} />, shortcut: 'PgDn', onSelect: () => b().sendToBack(b().selectedIds) },
      { kind: 'separator', id: 'a1' },
      { kind: 'item', id: 'group', label: t('menus.elementMenu.group'), icon: <Group size={I} />, shortcut: 'Ctrl + G', disabled: !multi, onSelect: () => b().groupSelected() },
      { kind: 'item', id: 'ungroup', label: t('menus.elementMenu.ungroup'), icon: <Ungroup size={I} />, shortcut: 'Ctrl + Shift + G', disabled: !anyGrouped, onSelect: () => b().ungroupSelected() },
      { kind: 'separator', id: 'a2' },
      { kind: 'label', id: 'align-label', label: t('menus.elementMenu.align') },
      { kind: 'item', id: 'al', label: t('menus.elementMenu.left'), icon: <AlignStartVertical size={I} />, disabled: !multi, onSelect: () => b().alignSelected('left') },
      { kind: 'item', id: 'ac', label: t('menus.elementMenu.center'), icon: <AlignCenterVertical size={I} />, disabled: !multi, onSelect: () => b().alignSelected('center') },
      { kind: 'item', id: 'ar', label: t('menus.elementMenu.right'), icon: <AlignEndVertical size={I} />, disabled: !multi, onSelect: () => b().alignSelected('right') },
      { kind: 'item', id: 'at', label: t('menus.elementMenu.top'), icon: <AlignStartHorizontal size={I} />, disabled: !multi, onSelect: () => b().alignSelected('top') },
      { kind: 'item', id: 'am', label: t('menus.elementMenu.middle'), icon: <AlignCenterHorizontal size={I} />, disabled: !multi, onSelect: () => b().alignSelected('middle') },
      { kind: 'item', id: 'ab', label: t('menus.elementMenu.bottom'), icon: <AlignEndHorizontal size={I} />, disabled: !multi, onSelect: () => b().alignSelected('bottom') },
      { kind: 'separator', id: 'a3' },
      { kind: 'item', id: 'dh', label: t('menus.elementMenu.distributeHorizontally'), disabled: selected.length < 3, onSelect: () => b().distributeSelected('horizontal') },
      { kind: 'item', id: 'dv', label: t('menus.elementMenu.distributeVertically'), disabled: selected.length < 3, onSelect: () => b().distributeSelected('vertical') },
    ],
  };
  // Bloqueio ▸: os mesmos níveis do "Bloqueio avançado" da Cinta (ou destravar, com a mesma regra do protegido)
  const lock: MenuItem = {
    kind: 'submenu',
    id: 'lock',
    label: t('menus.objectMenu.lock'),
    icon: <LockIcon size={I} />,
    items: allLocked
      ? [{ kind: 'item', id: 'unlock', label: anyProtected ? t('menus.elementMenu.unlockProtectedLock') : t('menus.elementMenu.unlock'), icon: <LockOpen size={I} />, shortcut: 'Ctrl + Shift + L', onSelect: () => b().setLockMode(b().selectedIds, 'none') }]
      : LOCK_LEVELS.map((level) => ({
          kind: 'item' as const,
          id: `lock-${level.id}`,
          label: level.label,
          hint: level.description,
          shortcut: level.id === 'standard' ? 'Ctrl + Shift + L' : undefined,
          onSelect: () => applyLockLevel(level),
        })),
  };
  const frameAndTemplate: MenuItem = {
    kind: 'submenu',
    id: 'frame-template',
    label: t('menus.objectMenu.frameTemplate'),
    icon: <Frame size={I} />,
    items: [
      ...(frame
        ? ([
            { kind: 'item', id: 'frame-present', label: t('menus.elementMenu.presentThisFrame'), icon: <Play size={I} />, onSelect: () => startPresentation(frame.id) },
            {
              kind: 'item',
              id: 'frame-hide',
              label: frame.hiddenContent ? t('menus.elementMenu.showContent') : t('menus.elementMenu.hideContent'),
              icon: frame.hiddenContent ? <Eye size={I} /> : <EyeOff size={I} />,
              disabled: !hideCan.allowed,
              hint: hideCan.allowed ? undefined : hideCan.reason,
              onSelect: () => b().setFrameHidden(frame.id, !frame.hiddenContent),
            },
            {
              kind: 'submenu',
              id: 'frame-export',
              label: t('menus.elementMenu.exportFrame'),
              icon: <Download size={I} />,
              disabled: !exportCan.allowed,
              items: [
                { kind: 'item', id: 'fx-pdf', label: t('menus.elementMenu.pdfHighResolution'), onSelect: () => void exportFrame(frame.id, 'pdf') },
                { kind: 'item', id: 'fx-png2', label: t('common.pngHighQuality2x'), onSelect: () => void exportFrame(frame.id, 'png2') },
                { kind: 'item', id: 'fx-png4', label: t('common.pngUltraHd4x'), onSelect: () => void exportFrame(frame.id, 'png4') },
                { kind: 'item', id: 'fx-svg', label: t('common.vectorSvg'), onSelect: () => void exportFrame(frame.id, 'svg') },
                { kind: 'separator', id: 'fx-s' },
                { kind: 'item', id: 'fx-more', label: t('menus.elementMenu.moreFormatsPdfFramesIssues'), onSelect: () => useAppStore.getState().openModal({ type: 'export-import', tab: 'export', exporter: 'pdf-frames' }) },
              ],
            },
          ] as MenuItem[])
        : ([{ kind: 'item', id: 'frame', label: t('menus.elementMenu.createFrameSelection'), icon: <Frame size={I} />, disabled: allLocked, onSelect: () => createFrameFromSelection() }] as MenuItem[])),
      { kind: 'item', id: 'template', label: t('menus.elementMenu.saveAsTemplate'), icon: <LayoutTemplate size={I} />, onSelect: () => useAppStore.getState().openModal({ type: 'save-template', source: 'selection' }) },
    ],
  };
  const exportInfo: MenuItem = {
    kind: 'submenu',
    id: 'export-info',
    label: t('menus.objectMenu.exportInfo'),
    icon: <FileSpreadsheet size={I} />,
    items: [
      { kind: 'item', id: 'csv', label: t('menus.elementMenu.exportCsvSpreadsheet'), icon: <FileSpreadsheet size={I} />, onSelect: () => exportSelectionCSV() },
      { kind: 'separator', id: 'x1' },
      { kind: 'label', id: 'info-label', label: t('menus.elementMenu.info') },
      {
        kind: 'custom',
        id: 'info-content',
        render: () =>
          first ? (
            <div className="w-64 space-y-2 px-2.5 py-2 text-sm" data-object-info>
              <InfoRow label={t('common.type')} value={multi ? t('menus.elementMenu.objectsCount', { count: selected.length }) : ELEMENT_TYPE_LABELS[first.type]} />
              {!multi && <InfoRow label={t('menus.elementMenu.created')} value={first.createdBy ?? userName} />}
              {!multi && <InfoRow label={t('menus.elementMenu.created2')} value={formatDateTime(first.createdAt)} />}
              {!multi && <InfoRow label={t('menus.elementMenu.modified')} value={formatDateTime(first.updatedAt)} />}
              {!multi && <InfoRow label={t('menus.elementMenu.size')} value={`${Math.round(first.width)} × ${Math.round(first.height)}`} />}
              {!multi && <InfoRow label={t('menus.elementMenu.rotation')} value={`${Math.round(first.rotation)}°`} />}
              {!multi && getElementText(first) && <InfoRow label={t('menus.elementMenu.characters')} value={String(getElementText(first).length)} />}
              <InfoRow label="ID" value={multi ? '—' : first.id} mono />
            </div>
          ) : null,
      },
    ],
  };
  return [header, quick, { kind: 'separator', id: 's0' }, edit, copyAs, arrange, lock, frameAndTemplate, exportInfo];
}

/** Título do cabeçalho: o tipo do objeto (no frame, o nome do frame). */
function objectTitle(el: CanvasElement): string {
  if (el.type === 'frame') return (el as { title?: string }).title?.trim() || ELEMENT_TYPE_LABELS.frame;
  return ELEMENT_TYPE_LABELS[el.type] ?? el.type;
}

/** Detalhe do cabeçalho: nome da cor do post-it ou começo do texto. */
function objectDetail(el: CanvasElement): string | undefined {
  if (el.type === 'frame') return ELEMENT_TYPE_LABELS.frame;
  if (el.type === 'sticky') return stickyColorName((el as { color: string }).color);
  const text = getElementText(el).replace(/\s+/g, ' ').trim();
  return text ? (text.length > 22 ? `${text.slice(0, 21)}…` : text) : undefined;
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-subtle">{label}</span>
      <span className={mono ? 'truncate font-mono text-xs text-ink-muted' : 'truncate font-medium text-ink'}>{value}</span>
    </div>
  );
}
