import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { ConnectorElement } from '../../types/canvas';
import type { ThemeMode } from '../../types/workspace';
import { useAppStore } from '../../store/useAppStore';
import { useBoardStore } from '../../store/useBoardStore';
import { adaptInk } from '../../utils/color';
import {
  arrowheadPath,
  arrowSize,
  buildOrthogonalPath,
  computeRoute,
  connectorLabelPoint,
  lineJumpKey,
  parseLineJumpKey,
  resolveLabelStyle,
  type ResolvedLabelStyle,
  strokeDasharray,
} from '../../utils/connectors';
import { useT } from '../../i18n/useT';

interface Props {
  element: ConnectorElement;
  isEditing: boolean;
}

/**
 * Conector (linha/seta) ligando objetos. Os endpoints acompanham os objetos ligados
 * automaticamente — a rota é recalculada a partir dos elementos atuais.
 * O SVG é desenhado em coordenadas de mundo relativas à bbox sincronizada do conector.
 *
 * Chat 03 · Rodada A:
 *  - saltos de linha nas rotas em cotovelo (`lineJumpKey` → arcos no `buildOrthogonalPath`);
 *  - rótulo numa pílula sobre a rota (`--od-panel`, borda na cor da linha, texto `--od-text`),
 *    editável no lugar (duplo clique, Enter com a linha selecionada ou "Inserir texto").
 *    O duplo clique fixa o rótulo onde se clicou (perto do meio = centro, `labelPosition`);
 *    com a linha selecionada, arrastar a pílula desliza o rótulo ao longo da rota.
 */
export const ConnectorView = memo(function ConnectorView({ element, isEditing }: Props) {
  const t = useT();
  const theme = useAppStore((s) => s.theme);
  const precise = useAppStore((s) => s.preferences.preciseSelection);
  const startEl = useBoardStore((s) => (element.start.elementId ? s.elements[element.start.elementId] : undefined));
  const endEl = useBoardStore((s) => (element.end.elementId ? s.elements[element.end.elementId] : undefined));
  const jumpKey = useBoardStore((s) => (element.routingType === 'orthogonal' && element.lineJumps !== false ? lineJumpKey(s.elements, element.id) : ''));
  const lookup = (id: string) => (id === startEl?.id ? startEl : id === endEl?.id ? endEl : undefined);
  const route = computeRoute(element, lookup);
  const d = jumpKey ? buildOrthogonalPath(route.points, parseLineJumpKey(jumpKey), element.strokeWidth) : route.d;
  const stroke = adaptInk(element.strokeColor, theme);
  const size = arrowSize(element.strokeWidth);
  const startHead = arrowheadPath(element.startArrow, route.start, route.startAngle, size);
  const endHead = arrowheadPath(element.endArrow, route.end, route.endAngle, size);
  const label = element.label ?? '';
  const showLabel = isEditing || label.trim() !== '';
  const labelAt = connectorLabelPoint(element, route);
  const labelStyle = resolveLabelStyle(element.labelStyle);
  const draggable = useBoardStore((s) => s.selectedIds.length === 1 && s.selectedIds[0] === element.id) && !element.locked;

  return (
    <>
      <svg
        width={Math.max(1, element.width)}
        height={Math.max(1, element.height)}
        viewBox={`${element.x} ${element.y} ${Math.max(1, element.width)} ${Math.max(1, element.height)}`}
        overflow="visible"
        className="absolute inset-0 block"
        style={{ pointerEvents: 'none' }}
      >
        <path d={route.d} fill="none" stroke="transparent" strokeWidth={precise ? Math.max(10, element.strokeWidth + 6) : Math.max(18, element.strokeWidth + 14)} strokeLinecap="round" style={{ pointerEvents: 'stroke' }} />
        <path
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={element.strokeWidth}
          strokeDasharray={strokeDasharray(element.strokeStyle, element.strokeWidth)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {[startHead, endHead].map((head, i) =>
          head ? (
            <path
              key={i}
              d={head.d}
              fill={head.filled ? stroke : 'none'}
              stroke={stroke}
              strokeWidth={element.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null,
        )}
      </svg>
      {showLabel && (
        <div
          className="absolute"
          data-connector-label={element.id}
          style={{ left: labelAt.x - element.x, top: labelAt.y - element.y, width: 'max-content', transform: 'translate(-50%, -50%)', pointerEvents: 'auto' }}
        >
          {isEditing ? (
            <LabelEditor element={element} lineColor={stroke} labelStyle={labelStyle} theme={theme} />
          ) : (
            <span className={draggable ? 'block cursor-grab' : 'block cursor-default'} title={draggable ? t('widgets.connectorView.dragMoveTextAlongLine') : undefined} style={pillStyle(stroke, labelStyle, theme)}>
              {label}
            </span>
          )}
        </div>
      )}
    </>
  );
});

/** Pílula do rótulo isolada (usada no Design System › Canvas e objetos › Conectores). */
export function ConnectorLabelPill({ text, borderColor, labelStyle }: { text: string; borderColor: string; labelStyle?: ConnectorElement['labelStyle'] }) {
  const theme = useAppStore((s) => s.theme);
  return <span style={pillStyle(borderColor, resolveLabelStyle(labelStyle), theme)}>{text}</span>;
}

/** Estilo CSS da pílula — mesma geometria de `connectorLabelBox` (padding, borda, altura de linha). */
function pillStyle(lineColor: string, st: ResolvedLabelStyle, theme: ThemeMode): CSSProperties {
  const noFill = st.fillColor === 'transparent';
  return {
    display: 'block',
    maxWidth: st.maxWidth + st.padX * 2 + st.borderWidth * 2,
    padding: `${st.padY}px ${st.padX}px`,
    borderRadius: st.borderRadius,
    border: st.borderWidth > 0 ? `${st.borderWidth}px solid ${st.borderColor ? adaptInk(st.borderColor, theme) : lineColor}` : 'none',
    background: st.fillColor ?? 'var(--od-panel)',
    color: st.textColor ? adaptInk(st.textColor, theme) : 'var(--od-text)',
    font: `${st.italic ? 'italic ' : ''}${st.fontWeight} ${st.fontSize}px/${st.lineHeight}px ${st.fontCss}`,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    textAlign: 'center',
    boxShadow: noFill ? 'none' : 'var(--od-shadow-panel)',
    userSelect: 'none',
  };
}

/**
 * Edição no lugar: um espelho invisível dimensiona a pílula e o <textarea> fica por cima.
 * Enter ou Esc confirmam, Shift+Enter quebra linha. Rótulo vazio = sem rótulo.
 * O histórico já foi gravado por `setEditingId` (um único passo de desfazer por edição).
 */
function LabelEditor({ element, lineColor, labelStyle, theme }: { element: ConnectorElement; lineColor: string; labelStyle: ResolvedLabelStyle; theme: ThemeMode }) {
  const t = useT();
  const original = useRef(element.label ?? '');
  const [value, setValue] = useState(original.current);
  const latest = useRef(original.current);
  const ref = useRef<HTMLTextAreaElement>(null);
  const finished = useRef(false);

  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.focus({ preventScroll: true });
    ta.select();
  }, []);

  const commit = (text: string, endEditing = true) => {
    if (finished.current) return;
    finished.current = true;
    const s = useBoardStore.getState();
    const clean = text.replace(/\s+$/g, '');
    if (clean !== (element.label ?? '')) s.updateElement(element.id, { label: clean ? clean : undefined });
    if (endEditing && s.editingId === element.id) s.setEditingId(null);
  };

  // Ao sair da edição por outro caminho (clique fora desmonta sem "blur"), confirma o último texto.
  // Adiado um tique: no StrictMode a desmontagem simulada é seguida de nova montagem.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.setTimeout(() => {
        if (!mounted.current) commit(latest.current, false);
      }, 0);
    };
  }, []);

  const style = pillStyle(lineColor, labelStyle, theme);
  return (
    <div data-editing="true" className="relative" style={{ minWidth: 64 }}>
      <span aria-hidden="true" style={{ ...style, visibility: 'hidden', minHeight: labelStyle.lineHeight + labelStyle.padY * 2 }}>
        {`${value || 'Texto'}​`}
      </span>
      <textarea
        ref={ref}
        value={value}
        rows={1}
        spellCheck={false}
        placeholder={t('widgets.connectorView.text')}
        aria-label={t('widgets.connectorView.lineText')}
        onChange={(e) => {
          latest.current = e.target.value;
          setValue(e.target.value);
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commit(e.currentTarget.value);
          } else if (e.key === 'Escape') {
            // mesma regra dos outros textos do board: Esc confirma e fecha
            e.preventDefault();
            commit(e.currentTarget.value);
          }
        }}
        className="absolute inset-0 resize-none overflow-hidden outline-none placeholder:text-ink-subtle"
        style={{ ...style, background: labelStyle.fillColor === 'transparent' || !labelStyle.fillColor ? 'var(--od-panel)' : labelStyle.fillColor, boxShadow: `var(--od-shadow-panel), 0 0 0 3px var(--od-selection-fill)`, userSelect: 'text' }}
      />
    </div>
  );
}
