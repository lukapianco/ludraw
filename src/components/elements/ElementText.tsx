import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { ExternalLink } from 'lucide-react';
import { formatListLines, LINE_HEIGHT, type ResolvedTextStyle } from '../../utils/text';
import { useBoardStore } from '../../store/useBoardStore';
import { createNextStickyFrom } from '../../utils/boardActions';
import { safeLinkHref } from '../../utils/contentSafety';

interface ElementTextProps {
  elementId: string;
  text: string;
  style: ResolvedTextStyle;
  fontSize: number;
  editing: boolean;
  placeholder?: string;
  /** Seleciona todo o texto ao entrar em edição (criação de objetos novos) */
  selectAllOnEdit?: boolean;
}

/**
 * Texto de elementos do board (Sticky, Shape, Text) — modo leitura e modo edição.
 * A edição usa um <textarea> com exatamente o mesmo estilo do texto renderizado, então o
 * texto "não pula" ao entrar/sair da edição.
 */
export function ElementText({ elementId, text, style, fontSize, editing, placeholder, selectAllOnEdit = true }: ElementTextProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const updateElement = useBoardStore((s) => s.updateElement);
  const setEditingId = useBoardStore((s) => s.setEditingId);

  const css: CSSProperties = {
    fontFamily: style.fontFamilyCss,
    fontSize,
    fontWeight: style.fontWeight === 'bold' ? 700 : 400,
    fontStyle: style.fontStyle,
    lineHeight: LINE_HEIGHT,
    color: style.color,
    textAlign: style.textAlign,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    wordBreak: 'break-word',
    width: '100%',
  };

  const decoration = [style.underline || style.link ? 'underline' : '', style.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ');

  const autoSize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = '0px';
    ta.style.height = `${ta.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    if (editing) autoSize();
  });

  useEffect(() => {
    if (!editing) return;
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus({ preventScroll: true });
    if (selectAllOnEdit) ta.select();
    else ta.setSelectionRange(ta.value.length, ta.value.length);
  }, [editing, selectAllOnEdit]);

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        data-editing="true"
        className="od-element-editor"
        style={{ ...css, textDecoration: decoration || undefined }}
        value={text}
        placeholder={placeholder}
        spellCheck
        rows={1}
        onChange={(e) => {
          updateElement(elementId, { text: e.target.value });
          autoSize();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          const isSticky = useBoardStore.getState().elements[elementId]?.type === 'sticky';
          // Criação rápida em lote (Chat 02): Tab ou Ctrl+Enter num post-it cria o próximo ao lado, já em edição
          if (isSticky && ((e.key === 'Tab' && !e.shiftKey && !e.altKey) || ((e.ctrlKey || e.metaKey) && e.key === 'Enter'))) {
            e.preventDefault();
            if (!e.nativeEvent.isComposing) createNextStickyFrom(elementId);
            return;
          }
          if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) {
            e.preventDefault();
            setEditingId(null);
          }
        }}
        onBlur={() => {
          // Pequeno atraso: permite clicar na barra contextual sem perder a edição.
          window.setTimeout(() => {
            const active = document.activeElement as HTMLElement | null;
            if (active?.closest('[data-context-toolbar]')) return;
            if (useBoardStore.getState().editingId === elementId) setEditingId(null);
          }, 0);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      />
    );
  }

  const lines = formatListLines(text, style.listStyle, style.indent);
  const isEmpty = text.trim() === '';
  // Chat 08.7 · R4 (S-31): só http(s)/mailto/âncora viram link; o resto não é clicável
  const safeHref = safeLinkHref(style.link);

  return (
    <div style={css} className="select-none">
      {isEmpty && placeholder ? (
        <span style={{ opacity: 0.4 }}>{placeholder}</span>
      ) : (
        lines.map((line, i) => (
          <span key={i}>
            <span
              style={{
                textDecoration: decoration || undefined,
                backgroundColor: style.highlightColor && line ? style.highlightColor : undefined,
                boxDecorationBreak: 'clone',
                WebkitBoxDecorationBreak: 'clone',
                borderRadius: style.highlightColor ? fontSize * 0.12 : undefined,
                padding: style.highlightColor && line ? `0 ${fontSize * 0.12}px` : undefined,
              }}
            >
              {line || '​'}
            </span>
            {i < lines.length - 1 && <br />}
          </span>
        ))
      )}
      {safeHref && !isEmpty && (
        <a
          href={safeHref}
          target="_blank"
          rel="noreferrer noopener"
          className="ml-1 inline-flex align-middle opacity-70 hover:opacity-100"
          style={{ pointerEvents: 'auto' }}
          onPointerDown={(e) => e.stopPropagation()}
          title={safeHref}
        >
          <ExternalLink size={Math.max(10, fontSize * 0.7)} />
        </a>
      )}
    </div>
  );
}
