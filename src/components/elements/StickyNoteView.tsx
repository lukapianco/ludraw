import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { EyeOff } from 'lucide-react';
import type { StickyNoteElement } from '../../types/canvas';
import { isDarkSticky, stickyTextColor } from '../../utils/factory';
import { withAlpha } from '../../utils/color';
import { fitFontSize, formatListLines, resolveTextStyle } from '../../utils/text';
import { stickyFooterLayout, tagTextColor } from '../../utils/stickyMeta';
import { useBoardStore } from '../../store/useBoardStore';
import { isPrivateDraftHidden } from '../../utils/permissions';
import { ElementText } from './ElementText';
import { useT } from '../../i18n/useT';

interface Props {
  element: StickyNoteElement;
  isEditing: boolean;
}

/**
 * Post-it: cor, sombra realista, texto com auto-fit e edição por duplo clique.
 * Chat 02 · Rodada A: rodapé com pílulas de tags e contadores de reações (clique alterna a
 * reação de quem clicou). Tab / Ctrl+Enter na edição criam o próximo post-it (ElementText).
 * Chat 02 · Rodada B: Modo Privado — notas `isPrivateDraft` de outros autores (ou todas, com
 * "Simular visão de outro participante") aparecem borradas com `••••`; ao revelar, o texto
 * surge com uma transição suave. É regra de UI: a garantia real é do servidor (Chat 07/08).
 */
export const StickyNoteView = memo(function StickyNoteView({ element, isEditing }: Props) {
  const t = useT();
  const { width: w, height: h } = element;
  const pad = Math.min(w, h) * 0.09;
  const dark = isDarkSticky(element.color);
  const style = resolveTextStyle(element, element.textColor ?? stickyTextColor(element.color));
  const formatted = formatListLines(element.text, style.listStyle, style.indent).join('\n');
  const footer = stickyFooterLayout(element);
  const textHeight = Math.max(1, h - pad * 2 - footer.height);
  const hidden = useBoardStore((s) => isPrivateDraftHidden(element, s.access.userId, s.facilitation.privateMode.previewOwnNotes));
  const contentRef = useRef<HTMLDivElement>(null);
  const wasHidden = useRef(hidden);

  // Revelação suave: desfoque → nítido (respeita "Reduzir movimento")
  useLayoutEffect(() => {
    const node = contentRef.current;
    if (wasHidden.current && !hidden && node && typeof node.animate === 'function' && !document.documentElement.classList.contains('od-reduce-motion')) {
      node.animate(
        [
          { filter: 'blur(10px)', opacity: 0.25 },
          { filter: 'blur(0px)', opacity: 1 },
        ],
        { duration: 560, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    }
    wasHidden.current = hidden;
  }, [hidden]);

  const fontSize = useMemo(() => {
    if (typeof element.fontSize === 'number') return element.fontSize;
    return fitFontSize(formatted, w - pad * 2, textHeight, style);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element.fontSize, formatted, w, textHeight, pad, style.fontFamilyCss, style.fontWeight, style.fontStyle]);

  return (
    <div
      className="absolute inset-0"
      style={{
        background: withAlpha(element.color, element.fillOpacity ?? 1),
        boxShadow: (element.fillOpacity ?? 1) < 0.6 ? 'none' : '0 1px 1px rgba(20,30,24,0.06), 0 6px 14px -6px rgba(20,30,24,0.28)',
        borderRadius: Math.min(3, w * 0.01),
      }}
    >
      {hidden ? (
        <PrivateMask width={w} height={h} pad={pad} color={style.color} />
      ) : (
        <div ref={contentRef} className="absolute inset-0">
          <div className="absolute flex items-center" style={{ left: pad, right: pad, top: pad, bottom: pad + footer.height, overflow: 'hidden' }}>
            <ElementText elementId={element.id} text={element.text} style={style} fontSize={fontSize} editing={isEditing} />
          </div>
          {footer.height > 0 && <StickyFooter element={element} pad={pad} dark={dark} />}
          {element.isPrivateDraft && (
            <span
              className="absolute flex items-center gap-1 rounded-full font-semibold"
              style={{
                right: pad * 0.5,
                top: pad * 0.5,
                fontSize: Math.max(8, Math.min(w, h) * 0.05),
                padding: `${Math.min(w, h) * 0.012}px ${Math.min(w, h) * 0.035}px`,
                background: dark ? 'rgba(255,255,255,0.2)' : 'rgba(25,75,50,0.14)',
                color: dark ? '#F4F5F2' : '#194B32',
              }}
              title={t('widgets.stickyNoteView.privateNoteOnlyYouSee')}
            >
              <EyeOff size={Math.max(8, Math.min(w, h) * 0.055)} />{' '}{t('widgets.stickyNoteView.private')}</span>
          )}
        </div>
      )}
    </div>
  );
});

/** Máscara do Modo Privado: linhas borradas + "••••" (o texto real nem é renderizado). */
function PrivateMask({ width, height, pad, color }: { width: number; height: number; pad: number; color: string }) {
  const t = useT();
  const unit = Math.min(width, height);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ padding: pad, gap: unit * 0.05 }} aria-label={t('widgets.stickyNoteView.hiddenPrivateNote')}>
      <div className="flex w-full flex-col items-center" style={{ gap: unit * 0.045, filter: `blur(${Math.max(2, unit * 0.025)}px)` }}>
        {[0.78, 0.62, 0.7].map((f, i) => (
          <span key={i} className="block rounded-full" style={{ width: `${f * 100}%`, height: unit * 0.07, background: color, opacity: 0.32 }} />
        ))}
      </div>
      <span className="font-bold leading-none" style={{ fontSize: unit * 0.14, letterSpacing: unit * 0.02, color, opacity: 0.75 }}>
        ••••
      </span>
      <span className="flex items-center font-semibold" style={{ gap: unit * 0.02, fontSize: Math.max(8, unit * 0.055), color, opacity: 0.6 }}>
        <EyeOff size={Math.max(8, unit * 0.06)} />{' '}{t('widgets.stickyNoteView.privateNote')}</span>
    </div>
  );
}

function StickyFooter({ element, pad, dark }: { element: StickyNoteElement; pad: number; dark: boolean }) {
  const t = useT();
  const f = stickyFooterLayout(element);
  const readOnly = useBoardStore((s) => s.readOnly);
  const userId = useBoardStore((s) => s.access.userId);
  const toggle = useBoardStore((s) => s.toggleElementReaction);
  const pill = { height: f.pillHeight, fontSize: f.fontSize, borderRadius: f.pillHeight / 2 };

  return (
    <div className="absolute flex flex-col" style={{ left: pad, right: pad, bottom: pad, gap: f.gap }}>
      {f.tags.length > 0 && (
        <div className="flex min-w-0 items-center overflow-hidden" style={{ gap: f.gap }}>
          {f.tags.map((t) => (
            <span
              key={t.id}
              className="inline-flex min-w-0 shrink items-center truncate font-semibold leading-none"
              style={{ ...pill, maxWidth: '62%', padding: `0 ${f.fontSize * 0.6}px`, background: t.color, color: tagTextColor(t.color) }}
              title={t.label}
            >
              <span className="truncate">{t.label}</span>
            </span>
          ))}
          {f.extraTags > 0 && (
            <span
              className="inline-flex shrink-0 items-center font-semibold leading-none"
              style={{ ...pill, padding: `0 ${f.fontSize * 0.5}px`, background: dark ? 'rgba(255,255,255,0.22)' : 'rgba(20,30,24,0.12)', color: dark ? '#F4F5F2' : '#1C1C1E' }}
              title={(element.tags ?? []).slice(f.tags.length).map((t) => t.label).join(', ')}
            >
              +{f.extraTags}
            </span>
          )}
        </div>
      )}
      {f.reactions.length > 0 && (
        <div className="flex min-w-0 items-center overflow-hidden" style={{ gap: f.gap }}>
          {f.reactions.map(([emoji, count]) => {
            const mine = !!element.reactedBy?.[emoji]?.includes(userId);
            const common = {
              className: 'inline-flex shrink-0 animate-pop-in items-center font-semibold leading-none tabular-nums',
              style: {
                ...pill,
                gap: f.fontSize * 0.3,
                padding: `0 ${f.fontSize * 0.45}px`,
                background: mine ? (dark ? 'rgba(208,228,174,0.35)' : 'rgba(25,75,50,0.16)') : dark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.62)',
                boxShadow: mine ? `inset 0 0 0 ${Math.max(1, f.fontSize * 0.1)}px ${dark ? '#D0E4AE' : '#194B32'}` : undefined,
                color: dark ? '#F4F5F2' : '#1C1C1E',
              },
            };
            const content = (
              <>
                <span style={{ fontSize: f.fontSize * 1.05 }}>{emoji}</span>
                <span>{count}</span>
              </>
            );
            if (readOnly) {
              return (
                <span key={`${emoji}-${count}`} {...common}>
                  {content}
                </span>
              );
            }
            return (
              <button
                key={`${emoji}-${count}`}
                type="button"
                {...common}
                style={{ ...common.style, pointerEvents: 'auto', cursor: 'pointer' }}
                title={mine ? t('widgets.stickyNoteView.removeYourReactionEmoji', { emoji }) : t('widgets.stickyNoteView.reactEmoji', { emoji })}
                aria-label={t(mine ? 'widgets.stickyNoteView.reactionAriaRemove' : 'widgets.stickyNoteView.reactionAriaAdd', { emoji, count })}
                aria-pressed={mine}
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(element.id, emoji, userId);
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
