import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { CircleAlert, FileSpreadsheet, LayoutGrid, TriangleAlert } from 'lucide-react';
import { FrameIcon, KanbanIcon, StickyIcon, TableIcon } from '../icons/od';
import { useBoardStore } from '../../store/useBoardStore';
import { useCan } from '../../hooks/useCan';
import { DELIMITER_LABELS, ENCODING_LABELS, type Delimiter, type TextEncodingId } from '../../utils/csv';
import { DEFAULT_STICKY_COLOR, STICKY_COLORS, stickyColorName } from '../../utils/factory';
import { importUnit, insertImported, resetImportUi, useImportUi } from '../../utils/importActions';
import {
  buildSheetElements,
  DESTINATION_LABELS,
  guessKanbanMapping,
  headerNames,
  KANBAN_FIELD_LABELS,
  outputCount,
  type KanbanField,
  type KanbanMapping,
  type SheetDestination,
  type SheetImportOptions,
} from '../../utils/sheetImport';
import { guessHeaderRow, SHEET_FORMAT_LABELS, SHEET_LIMITS, sheetCellText, sheetUsesDecimalComma, workbookFromPastedText, workbookFromTextBytes, type SheetData, type SheetWorkbook } from '../../utils/sheets';
import { columnName, TABLE_COLORS } from '../../utils/table';
import { cn } from '../../utils/cn';
import { Modal } from '../ui/Modal';
import { t } from '../../i18n';
import { useT } from '../../i18n/useT';
import { Trans } from '../../i18n/Trans';
import { formatNumber } from '../../i18n/format';

const PREVIEW_ROWS = 20;
const PREVIEW_COLS = 14;

const DESTINATIONS: { id: SheetDestination; icon: ReactNode; hint: string }[] = [
  { id: 'table', icon: <TableIcon size={18} />, get hint() { return t('importexport.importSheetModal.editableRowsColumnsHeaderColors'); } },
  { id: 'kanban', icon: <KanbanIcon size={18} />, get hint() { return t('importexport.importSheetModal.eachRowBecomesCardOne'); } },
  { id: 'stickies', icon: <StickyIcon size={18} />, get hint() { return t('importexport.importSheetModal.oneStickyNotePerCell'); } },
];

const KANBAN_FIELDS: KanbanField[] = ['title', 'status', 'priority', 'assignee', 'labels', 'points', 'description', 'due'];

/**
 * "Importar planilha" (Chat 05): prévia das 20 primeiras linhas e destino à escolha — Tabela nativa
 * (padrão), Cards de Kanban (com mapeamento de colunas) ou Grade de post-its. Opção de Frame com o
 * nome da planilha. Insere tudo num único passo de desfazer, no centro da tela sem cobrir o que já
 * existe, e registra no Activity Log. Diferença do padrão de mercado: origem, prévia e destino ficam
 * na MESMA tela, e a prévia já mostra como o cabeçalho e as mesclagens vão ficar no board.
 */
export function ImportSheetModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const initial = useImportUi((s) => s.workbook);
  const at = useImportUi((s) => s.at);
  const privateMode = useBoardStore((s) => s.facilitation.privateMode.enabled);
  const edit = useCan('board.edit');
  const [workbook, setWorkbook] = useState<SheetWorkbook | null>(initial);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [headerRow, setHeaderRow] = useState(true);
  const [decimalComma, setDecimalComma] = useState(true);
  const [destination, setDestination] = useState<SheetDestination>('table');
  const [frame, setFrame] = useState(false);
  const [mapping, setMapping] = useState<KanbanMapping | null>(null);
  const [stickyMode, setStickyMode] = useState<'cell' | 'row'>('row');
  const [stickyColor, setStickyColor] = useState(DEFAULT_STICKY_COLOR);
  const [acceptTruncate, setAcceptTruncate] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const close = () => {
    resetImportUi();
    onClose();
  };

  // carrega a aba escolhida
  useEffect(() => {
    if (!workbook) return;
    let alive = true;
    setLoading(true);
    setError(null);
    workbook
      .loadSheet(sheetIndex)
      .then((data) => {
        if (!alive) return;
        setSheet(data);
        const dc = workbook.format === 'xlsx' ? true : sheetUsesDecimalComma(data);
        setDecimalComma(dc);
        const header = guessHeaderRow(data.rows, dc);
        setHeaderRow(header);
        setMapping(guessKanbanMapping(headerNames(data, { headerRow: header, decimalComma: dc })));
        setAcceptTruncate(false);
        setConfirming(false);
      })
      .catch((err: Error) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [workbook, sheetIndex]);

  const name = useMemo(() => {
    if (!workbook) return t('importexport.importSheetModal.spreadsheetFallback');
    const sheetName = workbook.sheetNames[sheetIndex] ?? '';
    if (workbook.sheetNames.length > 1) return `${workbook.title} — ${sheetName}`;
    return workbook.format === 'html-table' || workbook.format === 'text-tsv' ? sheetName || workbook.title : workbook.title;
  }, [workbook, sheetIndex, t]);

  const options: SheetImportOptions | null = sheet && mapping ? { destination, headerRow, decimalComma, name, frame, kanban: mapping, stickies: { mode: stickyMode, color: stickyColor }, unit: importUnit() } : null;
  const count = sheet && options ? outputCount(sheet, options) : null;
  const headers = sheet ? headerNames(sheet, { headerRow, decimalComma }) : [];
  const width = sheet?.rows[0]?.length ?? 0;
  const blockedByTruncate = !!sheet?.truncated && !acceptTruncate;
  const kanbanMissingTitle = destination === 'kanban' && (mapping?.title === null || mapping?.title === undefined);
  const dataRowCount = sheet ? Math.max(0, sheet.rows.length - (headerRow ? 1 : 0)) : 0;

  const reparseText = (patch: { delimiter?: Delimiter; encoding?: TextEncodingId }) => {
    if (!workbook?.text) return;
    const delimiter = patch.delimiter ?? workbook.text.delimiter;
    const encoding = patch.encoding ?? workbook.text.encoding;
    if (workbook.format === 'text-tsv') {
      setWorkbook({ ...workbookFromPastedText(new TextDecoder().decode(workbook.text.bytes), delimiter, workbook.mimeTypes ?? []), format: 'text-tsv' });
    } else {
      setWorkbook(workbookFromTextBytes(workbook.fileName, workbook.text.bytes, { delimiter, encoding }));
    }
    setSheetIndex(0);
  };

  const insert = () => {
    if (!sheet || !options || !count || blockedByTruncate || kanbanMissingTitle) return;
    if (count.needsConfirm && !confirming) {
      setConfirming(true);
      return;
    }
    const elements = buildSheetElements(sheet, options);
    const ids = insertImported(elements, {
      activity: { key: `board.activity.importedSheet.${destination}`, params: { name, count: dataRowCount } },
      summary: t(frame ? 'importexport.importSheetModal.importedSummaryFrame' : 'importexport.importSheetModal.importedSummary', { name, amount: formatNumber(count.count), noun: count.noun }),
      at,
    });
    if (ids.length) close();
  };

  const label = 'mb-1 block text-xs font-semibold text-ink-muted';
  const formatLabel = workbook ? SHEET_FORMAT_LABELS[workbook.format] : '';

  return (
    <Modal
      open
      onClose={close}
      width={1040}
      icon={<FileSpreadsheet size={20} />}
      title={t('importexport.importSheetModal.importSpreadsheet')}
      description={workbook ? `${formatLabel} · ${workbook.fileName}` : t('importexport.importSheetModal.noSpreadsheetLoaded')}
      footer={
        <>
          <div className="me-auto min-w-0 text-xs text-ink-muted">
            {count && (
              <span>
                <Trans k={frame ? 'importexport.importSheetModal.willCreateFrame' : 'importexport.importSheetModal.willCreate'} params={{ amount: formatNumber(count.count), noun: count.noun }} components={{ b: (c) => <strong className="text-ink">{c}</strong> }} />
              </span>
            )}
            {confirming && count && (
              <span className="mt-1 flex items-center gap-1.5 font-semibold text-warning">
                <TriangleAlert size={14} /> {t('importexport.importSheetModal.manyItemsConfirm', { amount: formatNumber(count.count), noun: count.noun })}
              </span>
            )}
          </div>
          <button type="button" className="od-btn od-btn-secondary" onClick={close}>{t('common.cancel')}</button>
          <button
            type="button"
            className={cn('od-btn', confirming ? 'od-btn-danger' : 'od-btn-primary')}
            disabled={!sheet || !edit.allowed || blockedByTruncate || kanbanMissingTitle || loading}
            title={!edit.allowed ? edit.reason : blockedByTruncate ? t('importexport.importSheetModal.checkImportOnlyBeginningContinue') : undefined}
            onClick={insert}
          >
            {confirming && count ? t('importexport.importSheetModal.yesInsert', { amount: formatNumber(count.count), noun: count.noun }) : t('common.insertBoard')}
          </button>
        </>
      }
    >
      {/* origem */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-panel-sunken p-3 ring-1 ring-line">
        {workbook && workbook.sheetNames.length > 1 && (
          <div className="min-w-[180px]">
            <label className={label} htmlFor="is-sheet">{t('importexport.importSheetModal.sheet')}</label>
            <select id="is-sheet" className="od-input h-9" value={sheetIndex} onChange={(e) => setSheetIndex(Number(e.target.value))}>
              {workbook.sheetNames.map((n, i) => (
                <option key={`${n}-${i}`} value={i}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
        {workbook?.text && (
          <>
            <div className="min-w-[180px]">
              <label className={label} htmlFor="is-delim">{t('importexport.importSheetModal.delimiter')}</label>
              <select id="is-delim" className="od-input h-9" value={workbook.text.delimiter} onChange={(e) => reparseText({ delimiter: e.target.value as Delimiter })}>
                {(Object.keys(DELIMITER_LABELS) as Delimiter[]).map((d) => (
                  <option key={d} value={d}>
                    {DELIMITER_LABELS[d]}
                  </option>
                ))}
              </select>
            </div>
            {workbook.format !== 'text-tsv' && (
              <div className="min-w-[180px]">
                <label className={label} htmlFor="is-enc">{t('importexport.importSheetModal.encoding')}</label>
                <select id="is-enc" className="od-input h-9" value={workbook.text.encoding} onChange={(e) => reparseText({ encoding: e.target.value as TextEncodingId })}>
                  {(Object.keys(ENCODING_LABELS) as TextEncodingId[]).map((d) => (
                    <option key={d} value={d}>
                      {ENCODING_LABELS[d]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}
        <Check label={t('importexport.importSheetModal.firstRowHeader')} checked={headerRow} onChange={(v) => {
          setHeaderRow(v);
          if (sheet) setMapping(guessKanbanMapping(headerNames(sheet, { headerRow: v, decimalComma })));
        }} />
        <Check label={t('importexport.importSheetModal.decimalComma123456')} checked={decimalComma} onChange={setDecimalComma} />
        <span className="ms-auto text-xs text-ink-subtle">{t('importexport.importSheetModal.datesStayAsTextFormulas')}</span>
      </div>

      {(workbook?.warnings.length || sheet?.warnings.length) ? (
        <ul className="mt-2 space-y-1">
          {[...(workbook?.warnings ?? []), ...(sheet?.warnings ?? [])].map((w) => (
            <li key={w} className="flex items-start gap-1.5 text-xs text-warning">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" /> {w}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
        {/* prévia */}
        <div className="min-w-0">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold text-ink-muted">{t('common.preview')}</span>
            {sheet && (
              <span className="text-2xs text-ink-subtle">
                {t('importexport.importSheetModal.rowsByCols', { rows: t('importexport.importSheetModal.rowCount', { count: sheet.totalRows, amount: formatNumber(sheet.totalRows) }), cols: t('importexport.importSheetModal.colCount', { count: sheet.totalCols }) })}
                {sheet.rows.length > PREVIEW_ROWS ? t('importexport.importSheetModal.showingFirstPreviewRows', { PREVIEW_ROWS }) : ''}
              </span>
            )}
          </div>
          <div className="h-[min(340px,calc(100dvh-420px))] min-h-[160px] overflow-auto rounded-xl bg-canvas ring-1 ring-line" data-import-preview>
            {loading && <div className="p-6 text-center text-sm text-ink-subtle">{t('importexport.importSheetModal.readingSpreadsheet')}</div>}
            {error && (
              <div className="flex items-start gap-2 p-4 text-sm text-danger">
                <CircleAlert size={16} className="mt-0.5 shrink-0" /> {error}
              </div>
            )}
            {sheet && !loading && !error && <PreviewTable sheet={sheet} headerRow={headerRow} decimalComma={decimalComma} />}
          </div>
          {sheet?.truncated && (
            <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg bg-warning-soft p-2.5 text-xs text-ink ring-1 ring-line">
              <input type="checkbox" className="mt-0.5" checked={acceptTruncate} onChange={(e) => setAcceptTruncate(e.target.checked)} />
              <span>
                <strong>{t('importexport.importSheetModal.theSheetGoesOverSafety')}</strong>{' '}{t('importexport.importSheetModal.sizeOverLimit', { rows: formatNumber(sheet.totalRows), cols: sheet.totalCols, maxRows: formatNumber(SHEET_LIMITS.maxRows), maxCols: SHEET_LIMITS.maxCols })}
                <br />
                {t('importexport.importSheetModal.importOnlyStart', { rows: formatNumber(Math.min(sheet.totalRows, SHEET_LIMITS.maxRows)), cols: Math.min(sheet.totalCols, SHEET_LIMITS.maxCols) })}
              </span>
            </label>
          )}
        </div>

        {/* destino (rola sozinho em telas baixas — o rodapé com "Inserir" fica sempre visível) */}
        <div className="max-h-[calc(100dvh-340px)] min-h-[220px] space-y-3 overflow-y-auto pe-1">
          <div>
            <span className={label}>{t('importexport.importSheetModal.destination')}</span>
            <div className="space-y-1.5" role="radiogroup" aria-label={t('importexport.importSheetModal.importDestination')}>
              {DESTINATIONS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={destination === d.id}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-start ring-1 transition-colors duration-base',
                    destination === d.id ? 'bg-accent-soft ring-2 ring-selection' : 'bg-panel ring-line hover:bg-panel-hover',
                  )}
                  onClick={() => {
                    setDestination(d.id);
                    setConfirming(false);
                  }}
                >
                  <span className="mt-0.5 text-brand-700 dark:text-brand-300">{d.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-ink">
                      {DESTINATION_LABELS[d.id]}
                      {d.id === 'table' && <span className="ms-1.5 text-2xs font-semibold text-ink-subtle">{t('importexport.importSheetModal.default')}</span>}
                    </span>
                    <span className="block text-xs text-ink-muted">{d.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {destination === 'kanban' && mapping && (
            <div className="rounded-xl bg-panel-sunken p-3 ring-1 ring-line">
              <span className={label}>{t('importexport.importSheetModal.fileColumnsCardFields')}</span>
              <div className="space-y-1.5">
                {KANBAN_FIELDS.map((f) => (
                  <div key={f} className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-2">
                    <label htmlFor={`is-map-${f}`} className="text-xs text-ink">
                      {KANBAN_FIELD_LABELS[f]}
                      {f === 'title' ? ' *' : ''}
                    </label>
                    <select
                      id={`is-map-${f}`}
                      className="od-input h-8 px-2 text-[12.5px]"
                      value={mapping[f] ?? ''}
                      onChange={(e) => setMapping({ ...mapping, [f]: e.target.value === '' ? null : Number(e.target.value) })}
                    >
                      {f !== 'title' && <option value="">{t('importexport.importSheetModal.dontUse')}</option>}
                      {headers.slice(0, width).map((h, i) => (
                        <option key={i} value={i}>
                          {columnName(i)} · {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-2xs text-ink-subtle">{t('importexport.importSheetModal.priorityAcceptsHighMediumLow')}</p>
            </div>
          )}

          {destination === 'stickies' && (
            <div className="rounded-xl bg-panel-sunken p-3 ring-1 ring-line">
              <div className="flex gap-1 rounded-lg bg-panel p-1 ring-1 ring-line" role="radiogroup" aria-label={t('importexport.importSheetModal.oneStickyNotePer')}>
                {(['row', 'cell'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={stickyMode === m}
                    className={cn('flex-1 rounded-md py-1.5 text-[12.5px] font-semibold transition-colors', stickyMode === m ? 'bg-accent-soft text-ink' : 'text-ink-muted hover:text-ink')}
                    onClick={() => setStickyMode(m)}
                  >
                    {m === 'row' ? t('importexport.importSheetModal.onePerRow') : t('importexport.importSheetModal.onePerCell')}
                  </button>
                ))}
              </div>
              <span className={cn(label, 'mt-3')}>{t('importexport.importSheetModal.color')}</span>
              <div className="flex flex-wrap gap-1.5">
                {STICKY_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={stickyColorName(c)}
                    aria-label={t('importexport.importSheetModal.colorStickycolorname', { stickyColorName: stickyColorName(c) })}
                    aria-pressed={stickyColor === c}
                    className={cn('h-6 w-6 rounded-md ring-1 ring-line transition-transform duration-fast hover:scale-110', stickyColor === c && 'ring-2 ring-selection')}
                    style={{ background: c }}
                    onClick={() => setStickyColor(c)}
                  />
                ))}
              </div>
              {privateMode && <p className="mt-2 text-2xs text-ink-muted">{t('importexport.importSheetModal.privateModeStickyNotesCome')}</p>}
            </div>
          )}

          <Check label={t('importexport.importSheetModal.createFrameNamedAfterSpreadsheet')} icon={<FrameIcon size={14} />} checked={frame} onChange={setFrame} block />
          <p className="flex items-start gap-1.5 text-2xs text-ink-subtle">
            <LayoutGrid size={12} className="mt-px shrink-0" />{' '}{t('importexport.importSheetModal.landsCenterScreenFreeSpot', { name })}</p>
        </div>
      </div>
    </Modal>
  );
}

function Check({ label, checked, onChange, icon, block }: { label: string; checked: boolean; onChange: (v: boolean) => void; icon?: ReactNode; block?: boolean }) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-2 text-[13px] text-ink', block && 'rounded-xl bg-panel px-3 py-2.5 ring-1 ring-line hover:bg-panel-hover')}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {icon && <span className="text-brand-700 dark:text-brand-300">{icon}</span>}
      {label}
    </label>
  );
}

/** Prévia com mesclagens, cabeçalho e estilos básicos (o que vai para a tabela nativa). */
function PreviewTable({ sheet, headerRow, decimalComma }: { sheet: SheetData; headerRow: boolean; decimalComma: boolean }) {
  const t = useT();
  const rows = sheet.rows.slice(0, PREVIEW_ROWS);
  const cols = Math.min(PREVIEW_COLS, sheet.rows[0]?.length ?? 0);
  if (!rows.length || !cols) return <div className="p-6 text-center text-sm text-ink-subtle">{t('importexport.importSheetModal.theSheetEmpty')}</div>;
  return (
    <table className="border-separate border-spacing-0 text-[12.5px]" style={{ '--od-table-grid': TABLE_COLORS.grid, '--od-table-body': TABLE_COLORS.body } as CSSProperties}>
      <thead>
        <tr>
          <th className="sticky start-0 top-0 z-[2] w-9 bg-panel-sunken px-2 py-1 text-2xs font-semibold text-ink-subtle ring-1 ring-line" />
          {Array.from({ length: cols }, (_, c) => (
            <th key={c} className="sticky top-0 z-[1] min-w-[84px] bg-panel-sunken px-2 py-1 text-center text-2xs font-semibold text-ink-subtle ring-1 ring-line">
              {columnName(c)}
            </th>
          ))}
          {(sheet.rows[0]?.length ?? 0) > cols && <th className="sticky top-0 bg-panel-sunken px-2 py-1 text-2xs text-ink-subtle ring-1 ring-line">+{(sheet.rows[0]?.length ?? 0) - cols}</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r}>
            <td className="sticky start-0 z-[1] bg-panel-sunken px-2 py-1 text-end text-2xs font-semibold text-ink-subtle ring-1 ring-line">{r + 1}</td>
            {row.slice(0, cols).map((cell, c) => {
              if (cell === null) return null;
              const header = headerRow && r === 0;
              const text = sheetCellText(cell, decimalComma);
              return (
                <td
                  key={c}
                  rowSpan={Math.min(cell.rowSpan ?? 1, rows.length - r)}
                  colSpan={Math.min(cell.colSpan ?? 1, cols - c)}
                  className="max-w-[220px] whitespace-pre-wrap break-words px-2 py-1 align-top ring-1 ring-[var(--od-table-grid)]"
                  style={{
                    background: cell.bg ?? (header ? '#E7F1D6' : '#FFFFFF'),
                    color: cell.color ?? '#18211C',
                    fontWeight: cell.bold || header ? 700 : 400,
                    fontStyle: cell.italic ? 'italic' : undefined,
                    textAlign: cell.align ?? (cell.num !== undefined ? 'right' : 'left'),
                  }}
                >
                  {text}
                </td>
              );
            })}
            {(sheet.rows[0]?.length ?? 0) > cols && <td className="bg-[var(--od-table-body)] px-2 text-ink-subtle ring-1 ring-[var(--od-table-grid)]">…</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
