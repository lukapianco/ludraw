/**
 * LuDraw — Ficha do board (Chat 08.2 · B, `STUDIO_V2_SPEC.md` §3.1; substitui ⋯ → Board e a trilha da Régua).
 *  1. Cabeçalho: miniatura, nome editável (Enter confirma), estrela de favorito, lugar + "Mover para…".
 *  2. Grade 4 × 2: Novo board · Duplicar · Exportar… · Importar… · Salvar como modelo · Histórico · Cor de fundo ·
 *     Tags do board.
 *  3. Detalhes: dono, criado em, editado (quando e por quem), tamanho (objetos e MB).
 *  4. Mover para a lixeira (perigo).
 * Cada ação usa a MESMA checagem de antes (`ensure()`/`useCan` → `can()`/`explain()`).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FileDown, FileUp, FolderInput, PaintBucket, Plus, Star, Tag } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { useAppStore } from '../../store/useAppStore';
import { useCan } from '../../hooks/useCan';
import { useBoardPlaceLabel } from '../../hooks/useWorkspace';
import { persistCurrentBoard } from '../../utils/boardActions';
import { formatBytes, formatDateTime } from '../../i18n/format';
import { personLabel } from '../../utils/storedNames';
import { BOARD_BACKGROUNDS } from '../../menus/boardMenu';
import { cn } from '../../utils/cn';
import { useT } from '../../i18n/useT';
import { Menu, type MenuItem } from '../ui/Menu';
import { DuplicateIcon, HourglassIcon, TemplatesIcon, TrashIcon } from '../icons/od';
import { StudioDrawer } from './StudioDrawer';
import { drawerTrigger, useStudioUi } from './studioUi';
import { TagsTab } from './boardPanels';
import { isSafeImageSrc, safeCssColor } from '../../utils/contentSafety';

const I = 18;

export function BoardCardDrawer() {
  const t = useT();
  const boardId = useBoardStore((s) => s.boardId);
  const meta = useAppStore((s) => s.boards.find((b) => b.id === boardId));
  const placeName = useBoardPlaceLabel(meta);
  const canEdit = useCan('board.edit');
  const background = useBoardStore((s) => s.backgroundColor);
  const [name, setName] = useState(meta?.name ?? '');
  const [bgMenu, setBgMenu] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => setName(meta?.name ?? ''), [meta?.name]);
  const app = useAppStore.getState;
  const b = useBoardStore.getState;
  const close = () => useStudioUi.getState().close();

  const commitName = () => {
    if (!boardId || !name.trim() || name === meta?.name) return;
    if (!b().ensure('board.edit')) return setName(meta?.name ?? '');
    app().renameBoard(boardId, name);
  };

  const tiles: { id: string; icon: ReactNode; label: string; run: (el: HTMLElement) => void }[] = [
    {
      id: 'new',
      icon: <Plus size={I} />,
      label: t('common.newBoard'),
      run: async () => {
        close();
        await persistCurrentBoard(true);
        const id = app().createBoard({ template: 'blank' });
        app().navigate({ name: 'board', id });
      },
    },
    {
      id: 'duplicate',
      icon: <DuplicateIcon size={I} />,
      label: t('common.duplicate'),
      run: async () => {
        if (!boardId) return;
        close();
        await persistCurrentBoard(true);
        const id = await app().duplicateBoard(boardId);
        if (id) {
          app().toast(t('menus.boardMenu.boardDuplicated'), 'success');
          app().navigate({ name: 'board', id });
        }
      },
    },
    { id: 'export', icon: <FileDown size={I} />, label: t('studio.card.export'), run: () => (close(), app().openModal({ type: 'export-import', tab: 'export' })) },
    { id: 'import', icon: <FileUp size={I} />, label: t('studio.card.import'), run: () => (close(), app().openModal({ type: 'export-import', tab: 'import' })) },
    { id: 'template', icon: <TemplatesIcon size={I} />, label: t('studio.card.saveTemplate'), run: () => (close(), app().openModal({ type: 'save-template', source: 'board' })) },
    {
      id: 'history',
      icon: <HourglassIcon size={I} />,
      label: t('menus.boardMenu.history'),
      // mesma regra de antes: ver o histórico exige poder editar; restaurar exige board.restoreSnapshot
      run: () => b().ensure('board.edit') && useStudioUi.getState().openDrawer('timeline', drawerTrigger('timeline')),
    },
    {
      id: 'background',
      icon: <PaintBucket size={I} />,
      label: t('common.backgroundColor'),
      run: (el) => {
        const r = el.getBoundingClientRect();
        setBgMenu(bgMenu ? null : { x: r.left, y: r.bottom + 6 });
      },
    },
    { id: 'tags', icon: <Tag size={I} />, label: t('studio.card.tags'), run: () => useStudioUi.getState().openDrawer('tags', drawerTrigger('card')) },
  ];

  const bgItems: MenuItem[] = [
    {
      kind: 'custom',
      id: 'bg',
      render: () => (
        <div className="w-[236px] p-2">
          <div className="grid grid-cols-6 gap-2">
            {BOARD_BACKGROUNDS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                title={opt.label}
                aria-label={opt.label}
                aria-pressed={background === opt.value}
                onClick={() => b().setBackgroundColor(opt.value)}
                className={cn('h-8 w-8 rounded-lg transition-transform duration-base ease-out hover:scale-110', background === opt.value ? 'ring-2 ring-selection ring-offset-2 ring-offset-[var(--od-panel)]' : 'ring-1 ring-line-strong')}
                style={{ background: opt.value ?? 'linear-gradient(135deg, #F5F6F8 50%, #16161A 50%)' }}
              />
            ))}
          </div>
          <p className="mt-2 px-0.5 text-xs text-ink-subtle">{t('menus.boardMenu.theGridAdaptsAutomaticallyChosen')}</p>
        </div>
      ),
    },
  ];

  return (
    <StudioDrawer id="card" title={t('studio.card.title')} width={392} from="top">
      <div data-testid="board-card">
        {/* 1. cabeçalho */}
        <div className="flex gap-3 p-4">
          <div className="flex h-[58px] w-[86px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-panel-sunken ring-1 ring-line">
            {isSafeImageSrc(meta?.thumbnail) ? <img src={meta?.thumbnail} alt="" className="h-full w-full object-cover" /> : <span className="h-3 w-3 rounded-[3px]" style={{ background: safeCssColor(meta?.color) ?? '#194B32' }} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                  if (e.key === 'Escape') setName(meta?.name ?? '');
                }}
                readOnly={!canEdit.allowed}
                title={canEdit.allowed ? undefined : canEdit.reason}
                aria-label={t('board.topBar.boardName')}
                className="od-input h-8 min-w-0 flex-1 px-2 text-[14px] font-semibold"
              />
              <button
                type="button"
                className="od-tool h-8 w-8 shrink-0"
                aria-pressed={!!meta?.favorite}
                onClick={() => boardId && app().toggleFavorite(boardId)}
                aria-label={meta?.favorite ? t('menus.boardMenu.removeFavorites') : t('menus.boardMenu.markAsFavorite')}
              >
                <Star size={17} className={meta?.favorite ? 'fill-favorite text-favorite' : undefined} />
              </button>
            </div>
            <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[12px] text-ink-muted">
              <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: safeCssColor(meta?.color) ?? '#194B32' }} />
              <span className="min-w-0 truncate">{placeName}</span>
              <button
                type="button"
                className="ms-auto shrink-0 font-semibold text-ink hover:underline"
                onClick={() => {
                  if (!boardId || !b().ensure('board.move')) return;
                  close();
                  app().openModal({ type: 'move-board', boardId });
                }}
              >
                <FolderInput size={13} className="me-1 inline" />
                {t('studio.card.moveTo')}
              </button>
            </div>
          </div>
        </div>

        {/* 2. grade 4 × 2 */}
        <div className="grid grid-cols-4 gap-1.5 px-4">
          {tiles.map((tile) => (
            <button
              key={tile.id}
              type="button"
              data-od-menu-trigger={tile.id === 'background' ? true : undefined}
              data-card-tile={tile.id}
              onClick={(e) => tile.run(e.currentTarget)}
              className="flex flex-col items-center gap-1.5 rounded-xl bg-panel-sunken px-1 py-2.5 text-center ring-1 ring-line transition-colors duration-base hover:bg-panel-hover"
            >
              <span className="text-[var(--od-accent)]">{tile.icon}</span>
              <span className="text-[11.5px] font-semibold leading-tight text-ink">{tile.label}</span>
            </button>
          ))}
        </div>

        {/* 3. detalhes */}
        <Details />

        {/* 4. lixeira */}
        <div className="border-t border-line p-2">
          <button
            type="button"
            data-testid="card-trash"
            className="od-menu-item is-danger w-full"
            onClick={() => {
              if (!boardId || !b().ensure('board.delete')) return;
              close();
              app().openModal({ type: 'confirm-delete-board', boardId, redirect: true });
            }}
          >
            <TrashIcon size={16} /> {t('modals.appModals.moveToTrash')}
          </button>
        </div>
      </div>
      {bgMenu && <Menu items={bgItems} x={bgMenu.x} y={bgMenu.y} onClose={() => setBgMenu(null)} />}
    </StudioDrawer>
  );
}

function Details() {
  const t = useT();
  const boardId = useBoardStore((s) => s.boardId);
  const meta = useAppStore((s) => s.boards.find((b) => b.id === boardId));
  const objects = useBoardStore((s) => s.elementOrder.filter((id) => s.elements[id] && s.elements[id].type !== 'comment').length);
  const log = useBoardStore((s) => s.activityLog);
  // tamanho calculado uma vez ao abrir (a gaveta só existe enquanto aberta)
  const bytes = useMemo(() => new Blob([JSON.stringify(useBoardStore.getState().serialize())]).size, []);
  const last = log.reduce<(typeof log)[number] | null>((acc, e) => (!acc || (e.lastTimestamp ?? e.timestamp) > (acc.lastTimestamp ?? acc.timestamp) ? e : acc), null);
  const rows: [string, string][] = [
    [t('studio.card.owner'), personLabel(meta?.ownerName ?? '')],
    [t('studio.card.created'), meta?.createdAt ? formatDateTime(meta.createdAt) : '—'],
    [t('studio.card.edited'), last ? t('studio.card.editedBy', { when: formatDateTime(last.lastTimestamp ?? last.timestamp), name: personLabel(last.actorName) }) : meta?.updatedAt ? formatDateTime(meta.updatedAt) : '—'],
    [t('studio.card.size'), t('studio.card.sizeValue', { count: objects, size: formatBytes(bytes) })],
  ];
  return (
    <dl className="mx-4 my-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-xl bg-panel-sunken px-3 py-2.5 text-[12px] ring-1 ring-line" data-testid="board-details">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-subtle">{k}</dt>
          <dd className="min-w-0 truncate text-ink" title={v}>
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Tags do board (gerenciar): o conteúdo da antiga aba Tags. */
export function TagsDrawer() {
  const t = useT();
  return (
    <StudioDrawer id="tags" title={t('studio.card.tags')} width={360} from="top" footer={t('studio.card.tagsFooter')}>
      <TagsTab />
    </StudioDrawer>
  );
}
