import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BookOpen, ChevronRight, CircleAlert, Plus, TriangleAlert } from 'lucide-react';
import { TextDiagramIcon } from '../icons/od';
import { useBoardStore } from '../../store/useBoardStore';
import { useAppStore } from '../../store/useAppStore';
import { useCan } from '../../hooks/useCan';
import { buildDiagramElements, describeDiagram, diagramExample, DIAGRAM_SNIPPETS, layoutDiagram, parseDiagram, type DiagramShape } from '../../utils/diagram';
import { getShapePath } from '../../utils/shapes';
import { viewportCenterWorld } from '../../utils/boardActions';
import type { ShapeKind } from '../../types/canvas';
import { cn } from '../../utils/cn';
import { Modal } from '../ui/Modal';
import { useT } from '../../i18n/useT';
import { Trans, type TransComponents } from '../../i18n/Trans';
import { t } from '../../i18n';

const KIND: Record<DiagramShape, ShapeKind> = {
  rect: 'rectangle',
  round: 'rounded_rectangle',
  stadium: 'rounded_rectangle',
  circle: 'circle',
  diamond: 'diamond',
  hexagon: 'hexagon',
  cylinder: 'cylinder',
  parallelogram: 'parallelogram',
  subroutine: 'rectangle',
  flag: 'rectangle',
};

/** Último texto usado neste navegador (conveniência; falha silenciosa sem armazenamento). */
const DRAFT_KEY = 'ludraw:diagram-draft';
function loadDraft(): string | null {
  try {
    return window.localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
}
function saveDraft(text: string): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, text);
  } catch {
    /* sem armazenamento: tudo bem */
  }
}

/**
 * Gerador de diagrama por texto (Chat 04): o usuário digita/cola um fluxograma em texto e vê a
 * prévia ao vivo; "Inserir no board" cria Formas + Conectores em cotovelo + Frames (grupos) nativos
 * e editáveis. Parser próprio (`utils/diagram.ts`) — nenhuma biblioteca de terceiros.
 */
export function DiagramModal({ initialText, onClose }: { initialText?: string; onClose: () => void }) {
  const t = useT();
  const [text, setText] = useState(() => initialText ?? loadDraft() ?? diagramExample());
  const edit = useCan('board.edit');
  const ref = useRef<HTMLTextAreaElement>(null);
  const parsed = useMemo(() => parseDiagram(text), [text]);
  const layout = useMemo(() => (parsed.nodes.size ? layoutDiagram(parsed) : null), [parsed]);

  useEffect(() => {
    ref.current?.focus();
  }, []);
  useEffect(() => saveDraft(text), [text]);
  // 1ª vez neste navegador: abre já no guia
  const [guideOpen, setGuideOpen] = useState(() => !loadFlag(GUIDE_KEY));
  const setGuide = (open: boolean) => {
    setGuideOpen(open);
    saveFlag(GUIDE_KEY);
  };

  /** Insere um exemplo do guia no texto (direção troca a 1ª linha; o resto vai para o fim). */
  const insertSnippet = (code: string, kind: 'direction' | 'line') => {
    setText((t) => {
      if (kind === 'direction') {
        const lines = t.split('\n');
        const i = lines.findIndex((l) => l.trim());
        if (i >= 0 && /^\s*(flowchart|graph)\b/i.test(lines[i])) {
          lines[i] = code;
          return lines.join('\n');
        }
        return `${code}\n${t}`;
      }
      const base = t.trim() ? t.replace(/\s+$/, '') : 'flowchart TD';
      return `${base}\n${code.split('\n').map((l) => `  ${l}`).join('\n')}`;
    });
    requestAnimationFrame(() => {
      const ta = ref.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
      ta.scrollTop = ta.scrollHeight;
    });
  };

  const insert = () => {
    const s = useBoardStore.getState();
    if (!parsed.nodes.size || !s.ensure('board.edit') || !layout) return;
    const c = viewportCenterWorld();
    const els = buildDiagramElements(parsed, { x: c.x - layout.width / 2, y: c.y - layout.height / 2 });
    s.addElements(els, { select: true });
    s.setActiveTool('select');
    s.zoomToFit(els.map((e) => e.id));
    useAppStore.getState().toast(t('modals.diagramModal.diagramInsertedDescribediagram', { describeDiagram: describeDiagram(parsed) }), 'success');
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      width={920}
      icon={<TextDiagramIcon size={20} />}
      title={t('modals.diagramModal.textDiagram')}
      description={t('modals.diagramModal.writeFlowAsTextInsert')}
      footer={
        <>
          <span className="me-auto text-xs text-ink-subtle">{parsed.nodes.size ? describeDiagram(parsed) : t('modals.diagramModal.nothingInsertYet')}</span>
          <button type="button" className="od-btn od-btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="od-btn od-btn-primary" disabled={!parsed.nodes.size || !edit.allowed} title={edit.allowed ? undefined : edit.reason} onClick={insert}>{t('common.insertBoard')}</button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {DIAGRAM_SNIPPETS.map((s) => (
              <button key={s.label} type="button" className="od-btn od-btn-soft od-btn-sm" onClick={() => setText(s.code)}>
                {s.label}
              </button>
            ))}
          </div>
          <textarea
            ref={ref}
            value={text}
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Tab') {
                // Tab indenta dentro do campo
                e.preventDefault();
                const ta = e.currentTarget;
                const start = ta.selectionStart;
                const next = `${text.slice(0, start)}  ${text.slice(ta.selectionEnd)}`;
                setText(next);
                requestAnimationFrame(() => ta.setSelectionRange(start + 2, start + 2));
              } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                insert();
              }
            }}
            className="od-input h-[320px] resize-none py-2.5 font-mono text-[12.5px] leading-[1.55]"
            aria-label={t('modals.diagramModal.diagramText')}
          />
          <button
            type="button"
            className={cn('mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-start text-[12.5px] font-semibold ring-1 transition-colors', guideOpen ? 'bg-accent-soft text-brand-900 ring-brand-300 dark:text-brand-200' : 'bg-panel-sunken text-ink ring-line hover:bg-panel-hover')}
            onClick={() => setGuide(!guideOpen)}
            aria-pressed={guideOpen}
          >
            <BookOpen size={15} className="shrink-0" />
            <span className="flex-1">{guideOpen ? t('modals.diagramModal.backDrawingPreview') : t('modals.diagramModal.howDoIWriteOpen')}</span>
            <ChevronRight size={15} className="shrink-0" />
          </button>
        </div>
        <div className="flex min-w-0 flex-col">
          <div className="mb-2 flex items-center gap-1" role="tablist" aria-label={t('modals.diagramModal.previewGuide')}>
            {(
              [
                ['preview', t('common.preview')],
                ['guide', t('modals.diagramModal.syntaxGuide')],
              ] as const
            ).map(([id, lbl]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={(id === 'guide') === guideOpen}
                className={cn('rounded-md px-2.5 py-1 text-xs font-semibold transition-colors', (id === 'guide') === guideOpen ? 'bg-accent-soft text-brand-900 dark:text-brand-200' : 'text-ink-muted hover:bg-panel-hover')}
                onClick={() => setGuide(id === 'guide')}
              >
                {lbl}
              </button>
            ))}
          </div>
          {guideOpen ? (
            <SyntaxGuide onInsert={insertSnippet} />
          ) : (
            <div className="od-dot-bg relative h-[372px] overflow-hidden rounded-xl bg-canvas ring-1 ring-line">
              {layout ? <Preview parsed={parsed} layout={layout} /> : <div className="flex h-full items-center justify-center text-sm text-ink-subtle">{t('modals.diagramModal.writeLeastOneNodeE')}</div>}
            </div>
          )}
          <div className="mt-2 max-h-[96px] space-y-1 overflow-y-auto text-xs" aria-live="polite">
            {parsed.errors.map((e, i) => (
              <p key={`e${i}`} className="flex items-start gap-1.5 text-danger">
                <CircleAlert size={13} className="mt-0.5 shrink-0" />{' '}{t('modals.diagramModal.lineLineMessage', { line: e.line, message: e.message })}
              </p>
            ))}
            {parsed.warnings.map((w, i) => (
              <p key={`w${i}`} className="flex items-start gap-1.5 text-warning">
                <TriangleAlert size={13} className="mt-0.5 shrink-0" />{' '}{t('modals.diagramModal.lineLineMessage', { line: w.line, message: w.message })}
              </p>
            ))}
            {!parsed.errors.length && !parsed.warnings.length && parsed.nodes.size > 0 && <p className="text-ink-subtle">{t('modals.diagramModal.allGoodCtrlEnterInserts')}</p>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

const GUIDE_KEY = 'ludraw:diagram-guide-seen';
function loadFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function saveFlag(key: string): void {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    /* sem armazenamento: tudo bem */
  }
}

/* ------------------------------------------------------------------------ */
/*  Guia da sintaxe (passo a passo, com desenho do resultado)               */
/* ------------------------------------------------------------------------ */

const SHAPE_GUIDE: { code: string; kind: ShapeKind; fill: string; name: string; use: string }[] = [
  { get code() { return t('modals.diagramGuide.codeStep'); }, kind: 'rectangle', fill: '#FFFFFF', get name() { return t('common.rectangle'); }, get use() { return t('modals.diagramModal.aStepTask'); } },
  { get code() { return t('modals.diagramGuide.codeStart'); }, kind: 'rounded_rectangle', fill: '#D0E4AE', get name() { return t('modals.diagramModal.capsule'); }, get use() { return t('modals.diagramModal.startEnd'); } },
  { get code() { return t('modals.diagramGuide.codeQuestion'); }, kind: 'diamond', fill: '#FFF6A5', get name() { return t('modals.diagramModal.diamond'); }, get use() { return t('modals.diagramModal.decisionYesNo'); } },
  { get code() { return t('modals.diagramGuide.codeNotice'); }, kind: 'rounded_rectangle', fill: '#FFFFFF', get name() { return t('modals.diagramModal.rounded'); }, get use() { return t('modals.diagramModal.lighterStep'); } },
  { get code() { return t('modals.diagramGuide.codeDatabase'); }, kind: 'cylinder', fill: '#E7F1D6', get name() { return t('modals.diagramModal.cylinder'); }, get use() { return t('modals.diagramModal.databaseFile'); } },
  { get code() { return t('modals.diagramGuide.codeData'); }, kind: 'parallelogram', fill: '#FBF0DC', get name() { return t('modals.diagramModal.parallelogram'); }, get use() { return t('modals.diagramModal.dataInputOutput'); } },
  { get code() { return t('modals.diagramGuide.codePrep'); }, kind: 'hexagon', fill: '#E3EDF9', get name() { return t('common.hexagon'); }, get use() { return t('modals.diagramModal.preparation'); } },
  { get code() { return t('modals.diagramGuide.codeEnd'); }, kind: 'circle', fill: '#D0E4AE', get name() { return t('modals.diagramModal.circle'); }, get use() { return t('modals.diagramModal.connectionPointEnd'); } },
];

const LINK_GUIDE: { code: string; name: string; dash?: string; width: number; arrow: boolean; label?: string }[] = [
  { code: 'a --> b', get name() { return t('modals.diagramModal.arrow'); }, width: 2, arrow: true },
  { code: 'a --- b', get name() { return t('modals.diagramModal.lineWithoutArrow'); }, width: 2, arrow: false },
  { code: 'a -.-> b', get name() { return t('modals.diagramModal.dashedArrow'); }, width: 2, arrow: true, dash: '5 4' },
  { code: 'a ==> b', get name() { return t('modals.diagramModal.thickArrow'); }, width: 4, arrow: true },
  { get code() { return t('modals.diagramGuide.codeArrowText'); }, get name() { return t('modals.diagramModal.arrowText'); }, width: 2, arrow: true, get label() { return t('modals.diagramModal.yes'); } },
];

/** Marcação dos textos do guia (`<b>`, `<code>`, `<em>` nas mensagens do catálogo). */
const GUIDE_MARKUP: TransComponents = {
  b: (c) => <strong className="text-ink">{c}</strong>,
  code: (c) => <Code>{c}</Code>,
  em: (c) => <em>{c}</em>,
};

function SyntaxGuide({ onInsert }: { onInsert: (code: string, kind: 'direction' | 'line') => void }) {
  const t = useT();
  return (
    <section id="od-diagram-guide" className="h-[372px] overflow-y-auto rounded-xl bg-panel-sunken p-3 ring-1 ring-line" aria-label={t('modals.diagramModal.syntaxGuide')}>
      <p className="text-[12.5px] leading-relaxed text-ink-muted">
        <Trans k="modals.diagramGuide.intro" components={GUIDE_MARKUP} />
      </p>

      <div className="mt-3 space-y-3">
        <Step n={1} title={t('modals.diagramModal.pickDrawingDirection')} note={t('modals.diagramModal.alwaysFirstLine')}>
          <div className="space-y-1.5">
            {[
              { code: 'flowchart TD', label: t('modals.diagramModal.topBottom'), arrow: '↓' },
              { code: 'flowchart LR', label: t('modals.diagramModal.leftRight'), arrow: '→' },
              { code: 'flowchart BT', label: t('modals.diagramModal.bottomTop'), arrow: '↑' },
              { code: 'flowchart RL', label: t('modals.diagramModal.rightLeft'), arrow: '←' },
            ].map((d) => (
              <GuideRow key={d.code} code={d.code} onInsert={() => onInsert(d.code, 'direction')}>
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-panel text-[15px] font-bold text-brand-700 ring-1 ring-line dark:text-brand-300">{d.arrow}</span>
                <span className="text-[11.5px] leading-tight text-ink-muted">{d.label}</span>
              </GuideRow>
            ))}
          </div>
        </Step>

        <Step n={2} title={t('modals.diagramModal.createBoxes')} note={<Trans k="modals.diagramGuide.boxesNote" components={GUIDE_MARKUP} />}>
          <div className="space-y-1.5">
            {SHAPE_GUIDE.map((sh) => (
              <GuideRow key={sh.code} code={sh.code} onInsert={() => onInsert(sh.code, 'line')}>
                <svg width="40" height="26" viewBox="-2 -2 48 30" aria-hidden="true" className="shrink-0">
                  <path d={getShapePath(sh.kind, 44, 26)} fill={sh.fill} stroke="#194B32" strokeWidth={1.6} />
                </svg>
                <span className="min-w-0 text-[11.5px] leading-tight">
                  <span className="block font-semibold text-ink">{sh.name}</span>
                  <span className="block text-ink-subtle">{sh.use}</span>
                </span>
              </GuideRow>
            ))}
          </div>
        </Step>

        <Step n={3} title={t('modals.diagramModal.connectBoxes')} note={<Trans k="modals.diagramGuide.linksNote" components={GUIDE_MARKUP} />}>
          <div className="space-y-1.5">
            {LINK_GUIDE.map((l) => (
              <GuideRow key={l.code} code={l.code} onInsert={() => onInsert(l.code, 'line')} wide>
                <svg width="74" height="22" viewBox="0 0 74 22" aria-hidden="true" className="shrink-0">
                  <line x1="4" y1="11" x2={l.arrow ? 62 : 70} y2="11" stroke="#5B605C" strokeWidth={l.width} strokeDasharray={l.dash} />
                  {l.arrow && <path d="M60 5 L70 11 L60 17 z" fill="#5B605C" />}
                  {l.label && (
                    <text x="34" y="9" fontSize="9" textAnchor="middle" fill="#18211C" stroke="#EEF0EC" strokeWidth="3" paintOrder="stroke" fontFamily="Figtree, sans-serif" fontWeight="600">
                      {l.label}
                    </text>
                  )}
                </svg>
                <span className="text-[11.5px] font-semibold text-ink">{l.name}</span>
              </GuideRow>
            ))}
            <div className="rounded-lg bg-panel px-2.5 py-2 text-[11.5px] leading-relaxed text-ink-muted ring-1 ring-line">
              <Trans k="modals.diagramGuide.shortcuts" components={GUIDE_MARKUP} />
            </div>
          </div>
        </Step>

        <Step n={4} title={t('modals.diagramModal.groupAnnotateOptional')} note={t('modals.diagramModal.groupsBecomeFramesBoardBoxes')}>
          <GuideRow code={t('modals.diagramModal.subgraphShopShopOrderOrder')} onInsert={() => onInsert(t('modals.diagramModal.subgraphShopShopOrderOrder'), 'line')} wide block>
            <span className="text-[11.5px] leading-snug text-ink-muted">
              <Trans k="modals.diagramGuide.subgraph" components={GUIDE_MARKUP} />
            </span>
          </GuideRow>
          <GuideRow code={t('modals.diagramModal.thisJustNote')} onInsert={() => onInsert(t('modals.diagramModal.thisJustNote'), 'line')} wide>
            <span className="text-[11.5px] leading-snug text-ink-muted">
              <Trans k="modals.diagramGuide.comments" components={GUIDE_MARKUP} />
            </span>
          </GuideRow>
          <div className="mt-1.5 rounded-lg bg-panel p-2.5 ring-1 ring-line">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">{t('modals.diagramModal.fullExampleReadOutLoud')}</div>
            <pre className="whitespace-pre-wrap font-mono text-[11.5px] leading-[1.6] text-ink">
              {t('modals.diagramModal.flowchartTdStartOrderArrived')}
            </pre>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted"><Trans k="modals.diagramGuide.readAloud" components={GUIDE_MARKUP} /></p>
          </div>
        </Step>
      </div>
    </section>
  );
}

function Step({ n, title, note, children }: { n: number; title: string; note: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-panel p-3 ring-1 ring-line">
      <div className="flex items-start gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-bold text-accent-contrast">{n}</span>
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-ink">{title}</div>
          <div className="mt-0.5 text-[11.5px] leading-snug text-ink-muted">{note}</div>
        </div>
      </div>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function GuideRow({ code, onInsert, children, block }: { code: string; onInsert: () => void; children: ReactNode; wide?: boolean; block?: boolean }) {
  const t = useT();
  return (
    <div className={cn('flex gap-2 rounded-lg bg-panel px-2 py-1.5 ring-1 ring-line', block ? 'flex-col items-stretch' : 'items-center')}>
      <div className={cn('flex min-w-0 items-center gap-2', !block && 'flex-1')}>{children}</div>
      <div className={cn('flex items-center gap-1', block ? 'min-w-0' : 'max-w-[52%] shrink-0')}>
        <code className={cn('min-w-0 rounded bg-panel-sunken px-1.5 py-0.5 font-mono text-[11px] text-ink', block ? 'flex-1 whitespace-pre' : 'truncate')} title={code}>
          {code}
        </code>
        <button type="button" className="od-btn od-btn-ghost od-btn-sm h-6 shrink-0 px-1.5 text-[11px] text-brand-700 dark:text-brand-300" onClick={onInsert} aria-label={t('modals.diagramModal.insertValue', { value: code.split('\n')[0] })} title={t('modals.diagramModal.putText')}>
          <Plus size={12} />{' '}{t('modals.diagramModal.insert')}</button>
      </div>
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-panel-sunken px-1 py-px font-mono text-[11px] text-ink ring-1 ring-line">{children}</code>;
}

function Preview({ parsed, layout }: { parsed: ReturnType<typeof parseDiagram>; layout: ReturnType<typeof layoutDiagram> }) {
  const t = useT();
  const pad = 40;
  const minX = Math.min(0, ...layout.groups.map((g) => g.x));
  const minY = Math.min(0, ...layout.groups.map((g) => g.y - 18));
  const maxX = Math.max(layout.width, ...layout.groups.map((g) => g.x + g.width));
  const maxY = Math.max(layout.height, ...layout.groups.map((g) => g.y + g.height));
  const vb = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  const center = (id: string) => {
    const b = layout.boxes.get(id)!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  return (
    <svg viewBox={vb} className="h-full w-full" role="img" aria-label={t('modals.diagramModal.diagramPreview')}>
      <defs>
        <marker id="od-dg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#5B605C" />
        </marker>
      </defs>
      {layout.groups.map((g) => (
        <g key={g.id}>
          <rect x={g.x} y={g.y} width={g.width} height={g.height} rx={6} fill="#F4F9EC" stroke="#B9C2B3" />
          <text x={g.x + 4} y={g.y - 8} fontSize={18} fontWeight={600} fill="#4F5A53" fontFamily="Figtree, sans-serif">
            {g.title}
          </text>
        </g>
      ))}
      {parsed.edges.map((e, i) => {
        if (!layout.boxes.has(e.from) || !layout.boxes.has(e.to) || e.from === e.to) return null;
        const a = center(e.from);
        const b = center(e.to);
        return (
          <g key={i}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#5B605C"
              strokeWidth={e.style === 'thick' ? 4 : 2}
              strokeDasharray={e.style === 'dotted' ? '8 6' : undefined}
              markerEnd={e.endArrow !== 'none' ? 'url(#od-dg-arrow)' : undefined}
              markerStart={e.startArrow !== 'none' ? 'url(#od-dg-arrow)' : undefined}
            />
            {e.label && (
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} fontSize={15} textAnchor="middle" dominantBaseline="middle" fill="#18211C" stroke="#F5F6F8" strokeWidth={5} paintOrder="stroke" fontFamily="Figtree, sans-serif">
                {e.label}
              </text>
            )}
          </g>
        );
      })}
      {Array.from(layout.boxes.values()).map((b) => {
        const n = parsed.nodes.get(b.id)!;
        return (
          <g key={b.id} transform={`translate(${b.x} ${b.y})`}>
            <path d={getShapePath(KIND[n.shape], b.width, b.height)} fill={n.shape === 'diamond' ? '#FFF6A5' : n.shape === 'stadium' || n.shape === 'circle' ? '#D0E4AE' : '#FFFFFF'} stroke="#194B32" strokeWidth={2} />
            <text x={b.width / 2} y={b.height / 2} fontSize={15} textAnchor="middle" dominantBaseline="middle" fill="#18211C" fontFamily="'Open Sans', sans-serif" className={cn(n.shape === 'stadium' && 'font-bold')}>
              {n.text.split('\n')[0].slice(0, 28)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
