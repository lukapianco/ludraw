import { useEffect, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type ReactNode } from 'react';
import { TABLE_COLORS } from '../../utils/table';
import { Check, CircleAlert, CodeXml, FileImage, FileSpreadsheet, FileText, FolderInput, Info, LoaderCircle, Search, TriangleAlert } from 'lucide-react';
import { ExportIcon, ImportIcon, PasteIcon } from '../icons/od';
import { ensureCoreContributions } from '../../extensions/core';
import { ExporterRegistry, ImporterRegistry, useRegistry, type ExporterDefinition, type ExportScope } from '../../extensions/registries';
import { useBoardStore } from '../../store/useBoardStore';
import { useAppStore } from '../../store/useAppStore';
import { useCan } from '../../hooks/useCan';
import { describeEncodedSignal, describeMimeType, encodedHelp, encodedWarning, planPaste, plainTextOf, snapshotFromDataTransfer, type PastePlan } from '../../utils/clipboard';
import { exportPdfFrames, previewIssues, scopeElements, scopeTables } from '../../utils/exportActions';
import { generateThumbnail } from '../../utils/export';
import { orderedFrames } from '../../utils/frames';
import { importFiles, pasteSnapshotAsImage, pasteSnapshotAsText, pickAndImportFiles, runPastePlan, useImportUi } from '../../utils/importActions';
import { cn } from '../../utils/cn';
import { Modal } from '../ui/Modal';
import { t } from '../../i18n';
import { useT } from '../../i18n/useT';
import { formatCount, formatList } from '../../i18n/format';

type Tab = 'export' | 'import' | 'inspect';

const GROUP_LABELS: Record<ExporterDefinition['group'], string> = {
  get image() { return t('importexport.groups.image'); },
  get vector() { return t('importexport.groups.vector'); },
  get document() { return t('importexport.groups.document'); },
  get data() { return t('importexport.exportImportModal.dataSpreadsheetsTrackers'); },
  get backup() { return t('importexport.groups.backup'); },
};

const GROUP_ICONS: Record<ExporterDefinition['group'], ReactNode> = {
  image: <FileImage size={16} />,
  vector: <CodeXml size={16} />,
  document: <FileText size={16} />,
  data: <FileSpreadsheet size={16} />,
  backup: <FolderInput size={16} />,
};

const SCOPE_LABELS: Record<ExportScope, string> = { get board() { return t('importexport.exportImportModal.wholeBoard'); }, get selection() { return t('importexport.exportImportModal.selection'); }, get frames() { return t('importexport.scopes.frames'); } };

/**
 * Exportar · Importar · Inspetor de colagem (Chat 05). Lista os formatos a partir dos registries
 * (`ExporterRegistry`/`ImporterRegistry`) — extensões do Chat 06.5 aparecem aqui sozinhas.
 * Diferença do padrão de mercado: formato, escopo (board/seleção/frames) e opções ficam lado a lado
 * com um resumo vivo do que vai sair (ex.: "20 linhas · 12 post-its + 8 cards"), num só diálogo.
 */
export function ExportImportModal({ tab: initialTab = 'export', exporter, onClose }: { tab?: Tab; exporter?: string; onClose: () => void }) {
  const t = useT();
  useMemo(() => ensureCoreContributions(), []);
  const [tab, setTab] = useState<Tab>(initialTab);
  return (
    <Modal
      open
      onClose={onClose}
      width={tab === 'export' ? 920 : 780}
      icon={tab === 'export' ? <ExportIcon size={20} /> : <ImportIcon size={20} />}
      title={tab === 'export' ? t('common.export') : tab === 'import' ? t('importexport.exportImportModal.import') : t('importexport.exportImportModal.pasteInspector')}
      description={
        tab === 'export'
          ? t('importexport.exportImportModal.chooseFormatWhatGoesOut')
          : tab === 'import'
            ? t('importexport.exportImportModal.spreadsheetsSvgExcalidrawFilesImages')
            : t('importexport.exportImportModal.pasteHereSeeTypesReceived')
      }
    >
      <div className="-mt-1 mb-3 flex gap-5 border-b border-line" role="tablist">
        {(['export', 'import', 'inspect'] as Tab[]).map((tabId) => (
          <button
            key={tabId}
            type="button"
            role="tab"
            aria-selected={tab === tabId}
            className={cn('-mb-px border-b-2 pb-2 text-[13px] font-semibold transition-colors', tab === tabId ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink')}
            onClick={() => setTab(tabId)}
          >
            {tabId === 'export' ? t('common.export') : tabId === 'import' ? t('importexport.exportImportModal.importFile') : t('importexport.exportImportModal.pasteInspector')}
          </button>
        ))}
      </div>
      {tab === 'export' && <ExportTab initial={exporter} onDone={onClose} />}
      {tab === 'import' && <ImportTab onDone={onClose} />}
      {tab === 'inspect' && <InspectTab onDone={onClose} />}
    </Modal>
  );
}

/* --------------------------------- Exportar --------------------------------- */

function defaultOptions(def: ExporterDefinition | undefined): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const o of def?.options ?? []) out[o.id] = o.default;
  return out;
}

function ExportTab({ initial, onDone }: { initial?: string; onDone: () => void }) {
  const t = useT();
  const exporters = useRegistry(ExporterRegistry);
  const elements = useBoardStore((s) => s.elements);
  const elementOrder = useBoardStore((s) => s.elementOrder);
  const hasSelection = useBoardStore((s) => s.selectedIds.some((id) => s.elements[id] && s.elements[id].type !== 'comment'));
  const exportPermission = useCan('board.export');
  const frames = useMemo(() => orderedFrames(elements, elementOrder), [elements, elementOrder]);
  const [id, setId] = useState(() => initial ?? (frames.length ? 'pdf-frames' : 'png'));
  const def = exporters.find((e) => e.id === id) ?? exporters[0];
  const [options, setOptions] = useState<Record<string, string | boolean>>(() => defaultOptions(def));
  const [scope, setScope] = useState<ExportScope>(() => (def?.scopes.includes('frames') && !def.scopes.includes('board') ? 'frames' : hasSelection && def?.scopes.includes('selection') ? 'selection' : 'board'));
  const [frameIds, setFrameIds] = useState<string[]>(() => {
    const sel = useBoardStore.getState().selectedIds.filter((x) => useBoardStore.getState().elements[x]?.type === 'frame');
    return sel.length ? sel : frames.map((f) => f.id);
  });
  const [busy, setBusy] = useState<string | null>(null);

  const choose = (next: ExporterDefinition) => {
    setId(next.id);
    setOptions(defaultOptions(next));
    if (!next.scopes.includes(scope)) setScope(next.scopes.includes('board') ? 'board' : next.scopes[0]);
    else if (next.scopes.length === 1) setScope(next.scopes[0]);
  };

  const effectiveScope: ExportScope = def && def.scopes.includes(scope) ? scope : def?.scopes[0] ?? 'board';
  const chosenFrames = frames.filter((f) => frameIds.includes(f.id)).map((f) => f.id);
  const req = { scope: effectiveScope, frameIds: chosenFrames, options };

  const summary = useMemo(() => {
    if (!def) return '';
    if (effectiveScope === 'frames' && !chosenFrames.length) return t('importexport.exportImportModal.chooseLeastOneFrame');
    if (def.id === 'issues-csv') {
      const issues = previewIssues(req);
      const counts = { count: issues.rows.length, stickies: issues.stickies, cards: issues.cards, skipped: issues.skippedPrivate };
      return issues.skippedPrivate ? t('importexport.summary.issuesRowsSkipped', counts) : t('importexport.summary.issuesRows', counts);
    }
    if (def.id === 'tables-csv') {
      const n = scopeTables(effectiveScope, chosenFrames).length;
      return n ? t('importexport.summary.tablesFiles', { count: n }) : t('importexport.exportImportModal.noTablesWhatYouChose');
    }
    if (def.id === 'pdf-frames') return t('importexport.summary.pagesInSlideOrder', { count: chosenFrames.length });
    if (def.id === 'backup') return t('importexport.exportImportModal.theWholeBoardNativeFormat');
    const n = scopeElements(effectiveScope, chosenFrames).length;
    const files = (def.id === 'svg' || def.id === 'png') && effectiveScope === 'frames' && chosenFrames.length > 1 ? t('importexport.exportImportModal.countFilesOnePerFrame', { count: chosenFrames.length }) : '';
    return t('importexport.summary.objectsFiles', { count: n, files });
  }, [def, effectiveScope, chosenFrames.join(','), JSON.stringify(options), elements, t]);

  const issuesPreview = def?.id === 'issues-csv' ? previewIssues(req) : null;

  const run = async () => {
    if (!def) return;
    setBusy(t('importexport.exportImportModal.exporting'));
    try {
      if (def.id === 'pdf-frames') await exportPdfFrames(req, (d, total) => setBusy(t('importexport.exportImportModal.generatingPageDTotal', { d, total })));
      else await def.run(req);
      onDone();
    } finally {
      setBusy(null);
    }
  };

  const groups = (Object.keys(GROUP_LABELS) as ExporterDefinition['group'][]).map((g) => ({ g, items: exporters.filter((e) => e.group === g) })).filter((x) => x.items.length);
  const label = 'mb-1.5 block text-xs font-semibold text-ink-muted';

  return (
    <div className="grid gap-4 md:grid-cols-[300px_minmax(0,1fr)]">
      <div className="max-h-[460px] space-y-3 overflow-y-auto pe-1" role="radiogroup" aria-label={t('importexport.exportImportModal.format')}>
        {groups.map(({ g, items }) => (
          <div key={g}>
            <div className="mb-1 flex items-center gap-1.5 px-1 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
              {GROUP_ICONS[g]} {GROUP_LABELS[g]}
            </div>
            <div className="space-y-1">
              {items.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  role="radio"
                  aria-checked={e.id === def?.id}
                  data-exporter={e.id}
                  className={cn('w-full rounded-xl px-3 py-2 text-start ring-1 transition-colors duration-base', e.id === def?.id ? 'bg-accent-soft ring-2 ring-selection' : 'bg-panel ring-line hover:bg-panel-hover')}
                  onClick={() => choose(e)}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-ink">{e.label}</span>
                    <span className="font-mono text-2xs text-ink-subtle">.{e.extension}</span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-ink-muted">{e.description}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {def && (
        <div className="flex min-w-0 flex-col">
          <span className={label}>{t('importexport.exportImportModal.whatExport')}</span>
          <div className="flex gap-1 rounded-lg bg-panel-sunken p-1 ring-1 ring-line" role="radiogroup" aria-label={t('importexport.exportImportModal.whatExport')}>
            {(['board', 'selection', 'frames'] as ExportScope[]).map((s) => {
              const supported = def.scopes.includes(s);
              const disabled = !supported || (s === 'selection' && !hasSelection) || (s === 'frames' && !frames.length);
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={effectiveScope === s}
                  disabled={disabled}
                  title={!supported ? t('importexport.exportImportModal.thisFormatDoesntUseThis') : s === 'selection' && !hasSelection ? t('importexport.exportImportModal.selectObjectsBoard') : s === 'frames' && !frames.length ? t('importexport.exportImportModal.theBoardHasNoFrames') : undefined}
                  className={cn('flex-1 rounded-md py-1.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40', effectiveScope === s ? 'bg-panel text-ink shadow-panel' : 'text-ink-muted hover:text-ink')}
                  onClick={() => setScope(s)}
                >
                  {SCOPE_LABELS[s]}
                </button>
              );
            })}
          </div>

          {effectiveScope === 'frames' && (
            <div className="mt-3 rounded-xl bg-panel-sunken p-2 ring-1 ring-line">
              <div className="mb-1 flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-ink-muted">{t('importexport.exportImportModal.framesSlideOrder')}</span>
                <span className="flex gap-1">
                  <button type="button" className="od-btn od-btn-ghost od-btn-sm" onClick={() => setFrameIds(frames.map((f) => f.id))}>{t('importexport.exportImportModal.all')}</button>
                  <button type="button" className="od-btn od-btn-ghost od-btn-sm" onClick={() => setFrameIds([])}>{t('common.none')}</button>
                </span>
              </div>
              <ul className="max-h-[150px] space-y-0.5 overflow-y-auto">
                {frames.map((f, i) => (
                  <li key={f.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-[13px] text-ink hover:bg-panel-hover">
                      <input type="checkbox" checked={frameIds.includes(f.id)} onChange={(e) => setFrameIds((cur) => (e.target.checked ? [...cur, f.id] : cur.filter((x) => x !== f.id)))} />
                      <span className="w-5 text-end font-mono text-2xs text-ink-subtle">{i + 1}</span>
                      <span className="truncate">{f.title || t('common.untitledFrame')}</span>
                      {f.ratioPreset !== 'free' && <span className="ms-auto text-2xs text-ink-subtle">{f.ratioPreset === 'a4' ? 'A4' : f.ratioPreset}</span>}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(def.options ?? []).map((o) => (
            <div key={o.id} className="mt-3">
              {o.kind === 'choice' ? (
                <>
                  <label className={label} htmlFor={`ex-${o.id}`}>
                    {o.label}
                  </label>
                  <select id={`ex-${o.id}`} className="od-input h-9" value={String(options[o.id] ?? o.default)} onChange={(e) => setOptions((cur) => ({ ...cur, [o.id]: e.target.value }))}>
                    {o.choices.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink">
                  <input type="checkbox" checked={!!options[o.id]} onChange={(e) => setOptions((cur) => ({ ...cur, [o.id]: e.target.checked }))} />
                  {o.label}
                </label>
              )}
              {o.hint && <p className="mt-1 text-2xs text-ink-subtle">{o.hint}</p>}
            </div>
          ))}

          {issuesPreview && issuesPreview.rows.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-xl ring-1 ring-line" data-issues-preview>
              <table className="w-full text-[11.5px]">
                <thead className="bg-panel-sunken text-ink-muted">
                  <tr>
                    {issuesPreview.header.slice(0, 7).map((h) => (
                      <th key={h} className="whitespace-nowrap px-2 py-1 text-start font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {issuesPreview.rows.slice(0, 3).map((r, i) => (
                    <tr key={i} className="border-t border-line text-ink">
                      {r.slice(0, 7).map((v, j) => (
                        <td key={j} className="max-w-[150px] truncate px-2 py-1">
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-auto pt-4">
            <p className="mb-2 flex items-start gap-1.5 text-xs text-ink-muted" data-export-summary>
              <Info size={13} className="mt-0.5 shrink-0" /> {summary}
            </p>
            {def.group === 'data' && <p className="mb-2 text-2xs text-ink-subtle">{t('importexport.exportImportModal.formulaProtectionTextStartingGets')}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="od-btn od-btn-secondary" onClick={onDone}>{t('common.cancel')}</button>
              <button type="button" className="od-btn od-btn-primary" disabled={!!busy || !exportPermission.allowed || (effectiveScope === 'frames' && !chosenFrames.length)} title={exportPermission.reason} onClick={() => void run()} data-export-run>
                {busy ? (
                  <>
                    <LoaderCircle size={16} className="animate-spin" /> {busy}
                  </>
                ) : (
                  <>
                    <ExportIcon size={16} />{' '}{t('importexport.exportImportModal.exportExtension', { extension: def.extension })}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Importar --------------------------------- */

function ImportTab({ onDone }: { onDone: () => void }) {
  const t = useT();
  const importers = useRegistry(ImporterRegistry);
  const edit = useCan('board.edit');
  const [over, setOver] = useState(false);
  const fileTypes = importers.filter((i) => i.readFile && i.extensions.length);
  return (
    <div>
      <div
        className={cn('flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors duration-base', over ? 'border-selection bg-[var(--od-selection-fill)]' : 'border-line bg-panel-sunken')}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const files = Array.from(e.dataTransfer.files ?? []);
          if (!files.length) return;
          onDone();
          void importFiles(files);
        }}
        data-import-drop
      >
        <ImportIcon size={26} className="text-brand-700 dark:text-brand-300" />
        <p className="mt-2 text-sm font-semibold text-ink">{t('importexport.exportImportModal.dropFilesHere')}</p>
        <p className="mt-0.5 text-xs text-ink-muted">{t('importexport.exportImportModal.orDragStraightOntoBoard')}</p>
        <button
          type="button"
          className="od-btn od-btn-primary mt-3"
          disabled={!edit.allowed}
          title={edit.reason}
          onClick={() => {
            onDone();
            pickAndImportFiles();
          }}
        >
          <FolderInput size={16} />{' '}{t('importexport.exportImportModal.chooseFiles')}</button>
      </div>
      <div className="mt-4 grid gap-1.5 sm:grid-cols-2">
        {fileTypes.map((i) => (
          <div key={i.id} className="rounded-xl bg-panel px-3 py-2 ring-1 ring-line">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-ink">{i.label}</span>
              <span className="font-mono text-2xs text-ink-subtle">{i.extensions.map((x) => `.${x}`).join(' ')}</span>
            </div>
            <p className="mt-0.5 text-xs leading-snug text-ink-muted">{i.description}</p>
            <p className="mt-0.5 text-2xs text-ink-subtle">{t('importexport.exportImportModal.basedStandard', { standard: i.standard })}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-2xs text-ink-subtle">
        <Info size={12} className="mt-px shrink-0" />{' '}{t('importexport.exportImportModal.ludrawOnlyReadsOpenDocumented')}</p>
    </div>
  );
}

/* --------------------------------- Inspetor --------------------------------- */

function planTitle(plan: PastePlan): { title: string; detail: string; ok: boolean; warn?: boolean; help?: string } {
  switch (plan.kind) {
    case 'encoded':
      return { title: encodedWarning(), detail: t('importexport.exportImportModal.describeencodedsignalSafetyInsertBoardTurned', { describeEncodedSignal: describeEncodedSignal(plan.signal) }), ok: false, warn: true, help: encodedHelp() };
    case 'internal':
      return { title: t('importexport.exportImportModal.ludrawObjects'), detail: t('importexport.exportImportModal.copiedThisAnotherLudrawBoard'), ok: true };
    case 'files':
      return { title: formatCount('file', plan.files.length), detail: formatList(plan.files.map((f) => f.name), 'unit'), ok: true };
    case 'unsupported':
      return { title: t('importexport.exportImportModal.unsupportedContent'), detail: plan.reason, ok: false, help: encodedHelp() };
    case 'payload': {
      const p = plan.payload;
      if (p.kind === 'workbook') return { title: t('importexport.exportImportModal.importerlabelImportSpreadsheet', { importerLabel: plan.importerLabel }), detail: t('importexport.summary.sheetsOpenPreview', { count: p.workbook.sheetNames.length }), ok: true };
      if (p.kind === 'images') return { title: t('importexport.summary.images', { count: p.files.length }), detail: t('importexport.exportImportModal.compressedMost1600Px'), ok: true };
      return { title: `${plan.importerLabel}: ${p.label}`, detail: p.summary + (p.warnings.length ? ` · ${p.warnings.join(' ')}` : ''), ok: true };
    }
  }
}

function InspectTab({ onDone }: { onDone: () => void }) {
  const t = useT();
  const snapshot = useImportUi((s) => s.snapshot);
  const plan = useImportUi((s) => s.plan);
  const at = useImportUi((s) => s.at);
  const theme = useAppStore((s) => s.theme);
  const edit = useCan('board.edit');
  const [thumb, setThumb] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    areaRef.current?.focus();
  }, []);

  useEffect(() => {
    let alive = true;
    setThumb(null);
    if (plan?.kind === 'payload' && plan.payload.kind === 'elements') {
      void generateThumbnail(plan.payload.elements, theme, null).then((t) => alive && setThumb(t ?? null));
    } else if (plan?.kind === 'payload' && plan.payload.kind === 'images' && plan.payload.files[0]) {
      const url = URL.createObjectURL(plan.payload.files[0]);
      setThumb(url);
      return () => {
        alive = false;
        URL.revokeObjectURL(url);
      };
    }
    return () => {
      alive = false;
    };
  }, [plan, theme]);

  const onPaste = async (e: ReactClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const snap = snapshotFromDataTransfer(e.clipboardData, 'inspector');
    setAnalyzing(true);
    try {
      const p = await planPaste(snap);
      useImportUi.setState({ snapshot: snap, plan: p });
    } finally {
      setAnalyzing(false);
    }
  };

  const info = plan ? planTitle(plan) : null;
  const text = snapshot ? plainTextOf(snapshot) : '';
  const images = snapshot ? snapshot.files.filter((f) => f.type.startsWith('image/')) : [];

  const insert = async () => {
    if (!plan || !snapshot) return;
    onDone();
    await runPastePlan(plan, snapshot, at);
  };

  return (
    <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
      <div>
        <textarea
          ref={areaRef}
          className="od-input h-[120px] w-full resize-none text-center text-[13px] leading-snug"
          placeholder={t('importexport.exportImportModal.clickHerePasteCtrlV')}
          value=""
          onChange={() => undefined}
          onPaste={(e) => void onPaste(e)}
          aria-label={t('importexport.exportImportModal.pasteArea')}
          data-inspector-paste
        />
        <div className="mt-3">
          <span className="mb-1.5 block text-xs font-semibold text-ink-muted">{t('importexport.exportImportModal.typesReceived')}</span>
          {!snapshot && <p className="text-xs text-ink-subtle">{t('importexport.exportImportModal.nothingPastedYet')}</p>}
          <ul className="space-y-1" data-inspector-types>
            {snapshot?.types.map((type) => {
              const d = describeMimeType(type);
              return (
                <li key={type} className="rounded-lg bg-panel-sunken px-2 py-1.5 ring-1 ring-line">
                  <div className="flex items-center justify-between gap-2">
                    <code className="truncate font-mono text-2xs text-ink">{type}</code>
                    <span className={cn('shrink-0 rounded-full px-1.5 text-2xs font-semibold', d.status === 'read' ? 'bg-accent-soft text-ink' : d.status === 'file' ? 'bg-panel text-ink-muted ring-1 ring-line' : 'text-ink-subtle')}>
                      {d.status === 'read' ? 'lido' : d.status === 'file' ? 'arquivo' : t('importexport.exportImportModal.notRead')}
                    </span>
                  </div>
                  <span className="text-2xs text-ink-subtle">{d.label}</span>
                </li>
              );
            })}
            {snapshot?.files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="truncate px-1 text-2xs text-ink-muted">
                📎 {f.name || 'arquivo'} · {f.type || t('importexport.exportImportModal.unknownType')}{' '}{t('importexport.exportImportModal.fixedKb', { fixed: (f.size / 1024).toFixed(0) })}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex min-h-[300px] flex-col">
        <span className="mb-1.5 block text-xs font-semibold text-ink-muted">{t('importexport.exportImportModal.whatWillLandBoard')}</span>
        <div className="flex-1 rounded-xl bg-canvas p-3 ring-1 ring-line" data-inspector-plan>
          {analyzing && (
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              <LoaderCircle size={16} className="animate-spin" />{' '}{t('importexport.exportImportModal.analyzing')}</p>
          )}
          {!analyzing && !info && (
            <p className="flex items-center gap-2 text-sm text-ink-subtle">
              <Search size={16} />{' '}{t('importexport.exportImportModal.pasteSomethingLeftSeePreview')}</p>
          )}
          {!analyzing && info && (
            <div>
              <p className={cn('flex items-start gap-1.5 text-sm font-semibold', info.ok ? 'text-ink' : info.warn ? 'text-warning' : 'text-danger')} data-inspector-title>
                {info.ok ? <Check size={16} className="mt-0.5 shrink-0 text-success" /> : info.warn ? <TriangleAlert size={16} className="mt-0.5 shrink-0" /> : <CircleAlert size={16} className="mt-0.5 shrink-0" />} {info.title}
              </p>
              <p className="mt-1 text-xs text-ink-muted">{info.detail}</p>
              {info.help && (
                <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-panel px-2.5 py-2 text-xs text-ink ring-1 ring-line" data-inspector-help>
                  <Info size={13} className="mt-0.5 shrink-0 text-brand-700 dark:text-brand-300" /> {info.help}
                </p>
              )}
              {thumb && <img src={thumb} alt={t('common.preview')} className="mt-3 max-h-[200px] rounded-lg bg-panel object-contain ring-1 ring-line" />}
              {plan?.kind === 'payload' && plan.payload.kind === 'workbook' && <WorkbookPeek plan={plan} />}
              {(plan?.kind === 'unsupported' || plan?.kind === 'encoded') && text && <pre className="mt-3 max-h-[120px] overflow-auto whitespace-pre-wrap rounded-lg bg-panel p-2 text-2xs text-ink-muted ring-1 ring-line">{text.slice(0, 600)}</pre>}
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button type="button" className="od-btn od-btn-secondary" disabled={!text || !edit.allowed} title={!text ? t('importexport.exportImportModal.theresNoTextThisPaste') : edit.reason} onClick={() => {
            onDone();
            pasteSnapshotAsText(text, at);
          }}>{t('importexport.exportImportModal.pasteAsText')}</button>
          <button type="button" className="od-btn od-btn-secondary" disabled={!images.length || !edit.allowed} title={!images.length ? t('importexport.exportImportModal.theresNoImageThisPaste') : edit.reason} onClick={() => {
            onDone();
            void pasteSnapshotAsImage(images, at);
          }}>{t('importexport.exportImportModal.pasteAsImage')}</button>
          <button type="button" className="od-btn od-btn-primary" disabled={!plan || plan.kind === 'unsupported' || plan.kind === 'encoded' || !edit.allowed} title={plan?.kind === 'encoded' ? t('importexport.exportImportModal.encodedWarningUsePasteAs', { warning: encodedWarning() }) : edit.reason} onClick={() => void insert()} data-inspector-insert>
            <PasteIcon size={16} />{' '}{t('common.insertBoard')}</button>
        </div>
      </div>
    </div>
  );
}

function WorkbookPeek({ plan }: { plan: Extract<PastePlan, { kind: 'payload' }> }) {
  const [rows, setRows] = useState<string[][]>([]);
  useEffect(() => {
    if (plan.payload.kind !== 'workbook') return;
    let alive = true;
    void plan.payload.workbook.loadSheet(0).then((s) => alive && setRows(s.rows.slice(0, 5).map((r) => r.slice(0, 6).map((c) => (c ? c.text : '')))));
    return () => {
      alive = false;
    };
  }, [plan]);
  if (!rows.length) return null;
  return (
    <table className="mt-3 text-2xs">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((v, j) => (
              <td key={j} className="max-w-[110px] truncate border px-1.5 py-0.5" style={{ borderColor: TABLE_COLORS.grid, background: TABLE_COLORS.body, color: TABLE_COLORS.text }}>
                {v}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

