import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, CircleHelp, CloudOff, CodeXml, Download, Info, Keyboard, Link2, Lock, PanelsTopLeft, Pencil, Trash2 } from 'lucide-react';
import { FrameIcon } from '../icons/od';
import { useBoardStore } from '../../store/useBoardStore';
import { notifyInDevelopment } from '../../store/useAppStore';
import { generateThumbnail } from '../../utils/export';
import { cn } from '../../utils/cn';
import { Tooltip } from '../ui/Tooltip';
import { useAppStore } from '../../store/useAppStore';
import { Modal } from '../ui/Modal';
import { formatDateTime, shortcutLabel } from '../../utils/format';
import { loadBoardData } from '../../utils/storage';
import { KanbanCardModal } from './KanbanCardModal';
import { DiagramModal } from './DiagramModal';
import { TemplatesModal } from './TemplatesModal';
import { SaveTemplateModal } from './SaveTemplateModal';
import { VotingSetupModal } from './VotingSetupModal';
import { ExportImportModal } from './ExportImportModal';
import { ImportSheetModal } from './ImportSheetModal';
import { ShareBoardModal } from '../share/ShareBoardModal';
import { InviteModal, MoveBoardModal, ProjectEditModal, TeamEditModal } from '../workspace/WorkspaceModals';
import { policiesOf } from '../../store/workspaceSlice';
import { useBoardPlaceLabel } from '../../hooks/useWorkspace';
import { displayName } from '../../utils/workspaceDisplay';
import { t, type TKey } from '../../i18n';
import { useT } from '../../i18n/useT';
import { Trans } from '../../i18n/Trans';
import { formatCount } from '../../i18n/format';

import { ServerSettingsModal } from './ServerSettingsModal';
import { ChangePasswordModal } from '../auth/ChangePasswordForm';
import { ForgotPasswordModal } from '../auth/ForgotPasswordModal';
import { ImportLocalBoardsModal } from './ImportLocalBoardsModal';

/** Roteador dos modais globais (store `modal`). */
export function AppModals() {
  const modal = useAppStore((s) => s.modal);
  const close = useAppStore((s) => s.closeModal);
  if (!modal) return null;
  switch (modal.type) {
    // Chat 07
    case 'server-settings':
      return <ServerSettingsModal onClose={close} />;
    case 'change-password':
      return <ChangePasswordModal onClose={close} />;
    case 'forgot-password':
      return <ForgotPasswordModal onClose={close} />;
    // Chat 08.2
    case 'import-local-boards':
      return <ImportLocalBoardsModal onClose={close} />;
    // Chat 08.7 · R4
    case 'logout-unsynced':
      return <LogoutUnsyncedModal everywhere={modal.everywhere} keepRoute={modal.keepRoute} onClose={close} />;
    case 'embed':
      return <EmbedModal boardId={modal.boardId} onClose={close} />;
    case 'details':
      return <BoardDetailsModal boardId={modal.boardId} onClose={close} />;
    case 'shortcuts':
      return <ShortcutsModal onClose={close} />;
    case 'confirm-delete-board':
      return <ConfirmDeleteModal boardId={modal.boardId} redirect={modal.redirect} onClose={close} />;
    case 'rename-board':
      return <RenameBoardModal boardId={modal.boardId} onClose={close} />;
    case 'frame-children':
      return <FrameChildrenModal mode={modal.mode} frameIds={modal.frameIds} childIds={modal.childIds} alsoDelete={modal.alsoDelete ?? []} onClose={close} />;
    // Chat 04
    case 'kanban-card':
      return <KanbanCardModal elementId={modal.elementId} cardId={modal.cardId} onClose={close} />;
    case 'diagram':
      return <DiagramModal initialText={modal.initialText} onClose={close} />;
    case 'templates':
      return <TemplatesModal target={modal.target} tab={modal.tab} onClose={close} />;
    case 'save-template':
      return <SaveTemplateModal source={modal.source} scope={modal.scope} onClose={close} />;
    case 'voting-setup':
      return <VotingSetupModal onClose={close} />;
    // Chat 05
    case 'export-import':
      return <ExportImportModal tab={modal.tab} exporter={modal.exporter} onClose={close} />;
    case 'import-sheet':
      return <ImportSheetModal onClose={close} />;
    // Chat 06
    case 'share-board':
      return <ShareBoardModal boardId={modal.boardId} tab={modal.tab} onClose={close} />;
    case 'move-board':
      return <MoveBoardModal boardId={modal.boardId} onClose={close} />;
    case 'invite':
      return <InviteModal role={modal.role} teamIds={modal.teamIds} projectId={modal.projectId} boardId={modal.boardId} onClose={close} />;
    case 'team-edit':
      return <TeamEditModal teamId={modal.teamId} onClose={close} />;
    case 'project-edit':
      return <ProjectEditModal projectId={modal.projectId} teamId={modal.teamId} onClose={close} />;
    default:
      return null;
  }
}

type EmbedView = 'fit' | 'initial' | 'current';

const EMBED_VIEWS: Record<EmbedView, string> = {
  get fit() { return t('modals.appModals.wholeBoard'); },
  get initial() { return t('modals.appModals.initialView'); },
  get current() { return t('modals.appModals.currentView'); },
};

/** Exportar → Inserir (imagem 5): aviso de privacidade, visualização inicial, somente leitura, prévia e código. */
function EmbedModal({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const t = useT();
  const meta = useAppStore((s) => s.boards.find((b) => b.id === boardId));
  const [view, setView] = useState<EmbedView>('fit');
  const [viewOpen, setViewOpen] = useState(false);
  const [readOnly, setReadOnly] = useState(true);
  const [showCode, setShowCode] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 768, h: 432 });
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [preview, setPreview] = useState<string | undefined>(meta?.thumbnail);

  useEffect(() => {
    const s = useBoardStore.getState();
    if (s.boardId !== boardId) return;
    const els = s.elementOrder.map((id) => s.elements[id]).filter(Boolean);
    void generateThumbnail(els, useAppStore.getState().theme, s.backgroundColor).then((t) => t && setPreview(t));
  }, [boardId]);

  const cam = useBoardStore.getState().camera;
  const params = new URLSearchParams({ embed: '1', view });
  if (view === 'current') params.set('cam', `${Math.round(cam.x)},${Math.round(cam.y)},${cam.zoom.toFixed(3)}`);
  const url = `${window.location.origin}${window.location.pathname}#/board/${boardId}?${params.toString()}`;
  const code = `<iframe src="${url}" width="${size.w}" height="${size.h}" frameborder="0" scrolling="no" allow="fullscreen; clipboard-read; clipboard-write" allowfullscreen style="border:1px solid #D0E4AE;border-radius:12px"></iframe>`;

  const copy = async (what: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(what === 'code' ? code : url);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      useAppStore.getState().toast(t('modals.appModals.couldntCopySelectManually'), 'danger');
      setShowCode(true);
    }
  };

  return (
    <Modal open onClose={onClose} width={600} title={t('modals.appModals.embedBoard')}>
      <div className="space-y-4">
        <div className="flex gap-2.5 rounded-xl bg-accent-soft px-4 py-3 text-sm text-ink ring-1 ring-brand-300/60">
          <Lock size={16} className="mt-0.5 shrink-0 text-brand-800 dark:text-brand-200" />
          <p>
            <Trans
              k="modals.appModals.localBoardNotice"
              components={{
                b: (c) => <strong className="font-semibold">{c}</strong>,
                link: (c) => (
                  <button
                    type="button"
                    className="font-semibold text-brand-800 underline decoration-brand-400 underline-offset-2 hover:decoration-2 dark:text-brand-200"
                    onClick={() => useAppStore.getState().openModal({ type: 'share-board', boardId, tab: 'link' })}
                  >
                    {c}
                  </button>
                ),
              }}
            />
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex items-center gap-2 text-sm text-ink-muted">{t('modals.appModals.initialView2')}<button
              type="button"
              className="od-btn od-btn-secondary od-btn-sm gap-1.5"
              onClick={() => setViewOpen((v) => !v)}
              aria-expanded={viewOpen}
            >
              <PanelsTopLeft size={15} /> {EMBED_VIEWS[view]} <ChevronDown size={14} />
            </button>
            {viewOpen && (
              <div className="od-pop absolute start-[118px] top-[calc(100%+6px)] z-10 w-56 animate-pop-in p-1.5">
                {(Object.keys(EMBED_VIEWS) as EmbedView[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={cn('od-menu-item', view === v && 'bg-accent-soft')}
                    onClick={() => {
                      setView(v);
                      setViewOpen(false);
                    }}
                  >
                    {EMBED_VIEWS[v]}
                    {view === v && <Check size={15} className="ms-auto text-selection" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <label className="flex cursor-pointer items-center gap-2 border-s border-line ps-4 text-sm text-ink">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--od-selection)]"
              checked={readOnly}
              onChange={(e) => {
                if (!e.target.checked) {
                  notifyInDevelopment(t('modals.appModals.editableEmbeddedBoard'), t('modals.appModals.chat07CollaborationPermissions'), t('modals.appModals.forNowEmbeddedVersionAlways'));
                  return;
                }
                setReadOnly(true);
              }}
            />{t('modals.appModals.readOnly')}</label>
        </div>

        <div className="od-dot-bg relative flex aspect-[16/7] items-center justify-center overflow-hidden rounded-xl ring-1 ring-line">
          {preview ? (
            <img src={preview} alt={t('modals.appModals.boardPreview')} className="max-h-full max-w-[70%] rounded-md object-contain shadow-panel" draggable={false} />
          ) : (
            <span className="text-sm text-ink-subtle">{t('modals.appModals.emptyBoard')}</span>
          )}
          <span className="absolute bottom-2 end-2 rounded-md bg-panel px-2 py-0.5 text-[11px] font-semibold text-ink-muted shadow-panel">{EMBED_VIEWS[view]}</span>
        </div>

        <div className="flex items-center justify-between">
          <button type="button" className="od-btn od-btn-ghost od-btn-sm gap-1.5" onClick={() => setShowCode((v) => !v)} aria-expanded={showCode}>
            <CodeXml size={16} />{' '}{t('modals.appModals.embedCode')}{' '}<ChevronDown size={14} className={cn('transition-transform duration-base', showCode && 'rotate-180')} />
          </button>
          <Tooltip label={t('modals.appModals.pasteCodeIntoAnyHtml')} side="left">
            <span className="flex h-7 w-7 items-center justify-center rounded-full text-selection">
              <CircleHelp size={18} />
            </span>
          </Tooltip>
        </div>

        {showCode && (
          <div className="animate-fade-in space-y-2">
            <div className="flex gap-2">
              {[
                { label: t('modals.appModals.small'), w: 480, h: 270 },
                { label: t('modals.appModals.medium'), w: 768, h: 432 },
                { label: t('modals.appModals.large'), w: 1024, h: 576 },
              ].map((p) => (
                <button key={p.label} type="button" className={cn('od-btn od-btn-sm', size.w === p.w ? 'od-btn-soft' : 'od-btn-secondary')} onClick={() => setSize({ w: p.w, h: p.h })}>
                  {p.label} <span className="font-normal text-ink-subtle">{p.w}×{p.h}</span>
                </button>
              ))}
            </div>
            <textarea readOnly value={code} onFocus={(e) => e.currentTarget.select()} className="od-input h-28 resize-none py-2.5 font-mono text-xs leading-relaxed" />
          </div>
        )}

        <div className="flex gap-2 pb-2">
          <button type="button" className="od-btn od-btn-primary" onClick={() => void copy('code')}>
            {copied === 'code' ? <Check size={16} /> : <CodeXml size={16} />} {copied === 'code' ? t('modals.appModals.copied') : t('modals.appModals.copyCode')}
          </button>
          <button type="button" className="od-btn od-btn-secondary" onClick={() => void copy('link')}>
            {copied === 'link' ? <Check size={16} /> : <Link2 size={16} />} {copied === 'link' ? t('modals.appModals.copied') : t('modals.appModals.copyLink')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function BoardDetailsModal({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const t = useT();
  const meta = useAppStore((s) => s.boards.find((b) => b.id === boardId));
  const teams = useAppStore((s) => s.teams);
  const directory = useAppStore((s) => s.directory);
  const place = useBoardPlaceLabel(meta);
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    void loadBoardData(boardId).then((d) => alive && setCount(d?.elementOrder.length ?? 0));
    return () => {
      alive = false;
    };
  }, [boardId]);
  if (!meta) return null;
  const rows: [string, string][] = [
    [t('modals.appModals.projectName'), meta.name],
    // Chat 06: time e lugar reais da hierarquia (os textos legados team/space ficam só nos dados)
    [t('modals.appModals.team'), (meta.teamId && teams.find((x) => x.id === meta.teamId)?.name) || '—'],
    [t('modals.appModals.space'), place],
    [t('modals.appModals.owner'), displayName(meta.ownerId, directory, meta.ownerName)],
    [t('modals.appModals.created'), formatDateTime(meta.createdAt)],
    [t('modals.appModals.lastModified'), formatDateTime(meta.updatedAt)],
    [t('modals.appModals.objectsBoard'), String(count)],
    [t('modals.appModals.storage'), t('modals.appModals.localThisBrowser')],
  ];
  return (
    <Modal open onClose={onClose} width={460} icon={<Info size={20} />} title={t('modals.appModals.boardDetails')}>
      <dl className="divide-y divide-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
            <dt className="text-ink-subtle">{k}</dt>
            <dd className="truncate text-end font-medium text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

/** Atalhos: rótulo (chave) + teclas; teclas com palavras ("Espaço + arrastar") também têm chave. */
const SHORTCUTS: { group: string; items: [TKey, string, TKey?][] }[] = [
  {
    get group() { return t('modals.appModals.tools'); },
    items: [
      ['modals.shortcuts.hand', 'H'],
      ['modals.shortcuts.select', 'V'],
      ['modals.shortcuts.stickyNote', 'N'],
      ['modals.shortcuts.text', 'T'],
      ['modals.shortcuts.rectangle', 'R'],
      ['modals.shortcuts.oval', 'O'],
      ['modals.shortcuts.shapes', 'S'],
      ['modals.shortcuts.pen', 'P'],
      ['modals.shortcuts.eraser', 'E'],
      ['modals.shortcuts.moveBoard', '', 'modals.shortcuts.keys.spaceDrag'],
      ['modals.shortcuts.connectorArrow', 'L'],
      ['modals.shortcuts.emojiStickers', 'Shift + E'],
      ['modals.shortcuts.toolbox', '/'],
      ['modals.shortcuts.boardPanel', '', 'modals.shortcuts.keys.panelKeys'],
      ['modals.shortcuts.cycleRegions', 'F6 / Shift + F6'],
    ],
  },
  {
    get group() { return t('modals.appModals.editing'); },
    items: [
      ['modals.shortcuts.undo', 'Ctrl + Z'],
      ['modals.shortcuts.redo', 'Ctrl + Y'],
      ['modals.shortcuts.copyCutPaste', 'Ctrl + C / X / V'],
      ['modals.shortcuts.duplicate', 'Ctrl + D'],
      ['modals.shortcuts.delete', 'Delete'],
      ['modals.shortcuts.selectAll', 'Ctrl + A'],
      ['modals.shortcuts.groupUngroup', 'Ctrl + G / Ctrl + Shift + G'],
      ['modals.shortcuts.lockUnlock', 'Ctrl + Shift + L'],
      ['modals.shortcuts.copyPasteStyle', 'Ctrl + Alt + C / V'],
      ['modals.shortcuts.bringFrontSendBack', 'PgUp / PgDn'],
      ['modals.shortcuts.move1Px10Px', '', 'modals.shortcuts.keys.arrowKeys'],
      ['modals.shortcuts.editText', 'Enter'],
      ['modals.shortcuts.newStickyNoteAlongsideWhile', 'Tab / Ctrl + Enter'],
      ['modals.shortcuts.pasteImage', 'Ctrl + V'],
      ['modals.shortcuts.find', 'Ctrl + F'],
    ],
  },
  {
    get group() { return t('modals.appModals.view'); },
    items: [
      ['modals.shortcuts.fitScreen', 'Shift + 1'],
      ['modals.shortcuts.zoomSelection', 'Shift + 2'],
      ['modals.shortcuts.zoom100', 'Shift + 0'],
      ['modals.shortcuts.zoomOut', 'Ctrl + + / Ctrl + −'],
      ['modals.shortcuts.showGrid', 'G'],
      ['modals.shortcuts.rotate15Steps', '', 'modals.shortcuts.keys.shiftWhileRotating'],
      ['modals.shortcuts.duplicateDragging', '', 'modals.shortcuts.keys.altDrag'],
      ['modals.shortcuts.turnOffSnapping', '', 'modals.shortcuts.keys.ctrlWhileDragging'],
    ],
  },
];

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Modal open onClose={onClose} width={760} icon={<Keyboard size={20} />} title={t('modals.appModals.keyboardShortcuts')} description={t('modals.appModals.singleKeyShortcutsCanBe')}>
      <div className="grid max-h-[60vh] gap-6 overflow-y-auto pb-2 md:grid-cols-3">
        {SHORTCUTS.map((g) => (
          <div key={g.group}>
            <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{g.group}</div>
            <ul className="space-y-1.5">
              {g.items.map(([label, keys, keysKey]) => (
                <li key={label} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-ink">{t(label)}</span>
                  <span className="od-kbd shrink-0 rounded-md bg-panel-sunken px-1.5 py-0.5 font-semibold">{shortcutLabel(keysKey ? t(keysKey) : keys)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/**
 * Chat 08.7 · R4 (S-29): sair apaga a cópia deste servidor no navegador. Com mudanças que o servidor ainda não recebeu
 * (sem rede, fila de envio), a pessoa escolhe: baixar e sair, sair sem baixar ou ficar.
 */
function LogoutUnsyncedModal({ everywhere, keepRoute, onClose }: { everywhere: boolean; keepRoute: boolean; onClose: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const leave = async (download: boolean) => {
    setBusy(true);
    const sync = await import('../../utils/serverSync');
    if (download) await sync.downloadUnsyncedWork();
    onClose();
    await sync.serverLogout({ everywhere, keepRoute, force: true });
  };
  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      width={460}
      icon={<CloudOff size={20} />}
      title={t('server.logout.unsyncedTitle')}
      description={t('server.logout.unsyncedText')}
      footer={
        <>
          <button type="button" className="od-btn od-btn-ghost" disabled={busy} onClick={onClose} data-testid="logout-cancel">{t('common.cancel')}</button>
          <button type="button" className="od-btn od-btn-danger" disabled={busy} onClick={() => void leave(false)} data-testid="logout-discard">{t('server.logout.leaveWithout')}</button>
          <button type="button" className="od-btn od-btn-primary" disabled={busy} onClick={() => void leave(true)} data-testid="logout-download">
            <Download size={16} /> {t('server.logout.downloadAndLeave')}
          </button>
        </>
      }
    />
  );
}

function ConfirmDeleteModal({ boardId, redirect, onClose }: { boardId: string; redirect: boolean; onClose: () => void }) {
  const t = useT();
  const meta = useAppStore((s) => s.boards.find((b) => b.id === boardId));
  const deleteBoard = useAppStore((s) => s.deleteBoard);
  const navigate = useAppStore((s) => s.navigate);
  const toast = useAppStore((s) => s.toast);
  const days = useAppStore((s) => policiesOf(s).trashRetentionDays);
  return (
    <Modal
      open
      onClose={onClose}
      width={440}
      icon={<Trash2 size={20} />}
      title={t('modals.appModals.moveToTrashTitle')}
      description={<Trans k="modals.appModals.moveToTrashText" params={{ name: meta?.name ?? t('modals.appModals.thisBoard'), count: days }} components={{ b: (c) => <strong className="text-ink">{c}</strong> }} />}
      footer={
        <>
          <button type="button" className="od-btn od-btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button
            type="button"
            className="od-btn od-btn-danger"
            onClick={() => {
              deleteBoard(boardId);
              onClose();
              // Chat 06: soft delete — dá para desfazer na hora (ou restaurar pela Lixeira)
              if (useAppStore.getState().boards.find((b) => b.id === boardId)?.deletedAt) {
                toast(t('modals.appModals.movedToTrash'), 'neutral', {
                  action: { label: t('common.undo'), run: () => useAppStore.getState().restoreBoard(boardId) },
                });
                if (redirect) navigate({ name: 'dashboard' });
              }
            }}
          >
            <Trash2 size={16} />{' '}{t('modals.appModals.moveToTrash')}</button>
        </>
      }
    />
  );
}

/**
 * Chat 03 · Rodada B — conteúdo de frames:
 *  - delete: excluir o(s) frame(s) mantendo o conteúdo solto no board ou junto com ele;
 *  - resize: objetos que ficaram fora do frame redimensionado — manter (soltos) ou excluir.
 * Fechar (Esc/Cancelar) = não excluir nada (no resize, os objetos ficam soltos fora do frame).
 */
function FrameChildrenModal({
  mode,
  frameIds,
  childIds,
  alsoDelete,
  onClose,
}: {
  mode: 'delete' | 'resize';
  frameIds: string[];
  childIds: string[];
  alsoDelete: string[];
  onClose: () => void;
}) {
  const t = useT();
  const n = childIds.length;
  const objs = formatCount('object', n);
  const b = useBoardStore.getState;
  const keep = () => {
    if (mode === 'delete') {
      b().deleteFrames(frameIds, true, alsoDelete);
    } else {
      b().syncFrameMembership(childIds);
    }
    onClose();
  };
  const remove = () => {
    if (mode === 'delete') {
      b().deleteFrames(frameIds, false, alsoDelete);
    } else {
      b().deleteElements(childIds.filter((id) => !b().elements[id]?.locked));
      b().syncFrameMembership(childIds.filter((id) => !!b().elements[id]));
    }
    onClose();
  };
  const cancel = () => {
    if (mode === 'resize') b().syncFrameMembership(childIds);
    onClose();
  };
  return (
    <Modal
      open
      onClose={cancel}
      width={460}
      icon={mode === 'delete' ? <Trash2 size={20} /> : <FrameIcon size={20} />}
      title={mode === 'delete' ? (frameIds.length > 1 ? t('modals.appModals.deleteFrames') : t('modals.appModals.deleteFrame')) : t('modals.appModals.objsEndedUpOutsideFrame', { objs })}
      description={
        mode === 'delete'
          ? t('modals.appModals.theFrameHasObjsInside', { objs })
          : t('modals.appModals.afterResizingPartContentEnded')
      }
      footer={
        <>
          {mode === 'delete' && (
            <button type="button" className="od-btn od-btn-ghost" onClick={cancel}>{t('common.cancel')}</button>
          )}
          <button type="button" className="od-btn od-btn-secondary" onClick={keep}>
            {mode === 'delete' ? t('modals.appModals.keepContent') : t('modals.appModals.keepOutsideFrame')}
          </button>
          <button type="button" className="od-btn od-btn-danger" onClick={remove}>
            <Trash2 size={16} /> {mode === 'delete' ? t('modals.appModals.deleteEverything') : t('modals.appModals.deleteObjs', { objs })}
          </button>
        </>
      }
    />
  );
}

function RenameBoardModal({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const t = useT();
  const meta = useAppStore((s) => s.boards.find((b) => b.id === boardId));
  const rename = useAppStore((s) => s.renameBoard);
  const [name, setName] = useState(meta?.name ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.select(), []);
  const save = () => {
    if (name.trim()) rename(boardId, name);
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      width={420}
      icon={<Pencil size={20} />}
      title={t('modals.appModals.renameBoard')}
      footer={
        <>
          <button type="button" className="od-btn od-btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="od-btn od-btn-primary" disabled={!name.trim()} onClick={save}>{t('modals.appModals.save')}</button>
        </>
      }
    >
      <input
        ref={inputRef}
        className="od-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') save();
        }}
        aria-label={t('modals.appModals.boardName')}
      />
    </Modal>
  );
}
