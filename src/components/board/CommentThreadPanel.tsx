import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AtSign, CircleCheck, RotateCcw, SendHorizontal, X } from 'lucide-react';
import { TrashIcon } from '../icons/od';
import type { CommentElement } from '../../types/canvas';
import { useBoardStore } from '../../store/useBoardStore';
import { useAppStore } from '../../store/useAppStore';
import { useCan } from '../../hooks/useCan';
import { worldToScreen } from '../../utils/math';
import { relativeTime } from '../../utils/activity';
import { colorFromString } from '../../utils/color';
import { initials } from '../../utils/format';
import { cancelCommentDraft, knownPeople, mentionQueryAt, mentionSegments, replyComment, submitCommentDraft, useCommentUi } from '../../utils/comments';
import { COMMENT_PIN_PX } from '../elements/CommentPinView';
import { cn } from '../../utils/cn';
import { Tooltip } from '../ui/Tooltip';
import { useT } from '../../i18n/useT';

const PANEL_W = 320;

/**
 * Conversa do comentário (Chat 04), em coordenadas de tela ao lado do pin: mensagens com
 * @menções destacadas, responder, resolver/reabrir e excluir (`comment.delete`). Também mostra o
 * compositor de um comentário novo (rascunho de `useCommentUi`). Diferente do padrão de mercado de
 * painel lateral fixo: a conversa flutua junto do pin e o Painel lista/filtra as conversas.
 */
export function CommentThreadPanel() {
  const draft = useCommentUi((s) => s.draft);
  const selectedComment = useBoardStore((s) => {
    if (s.selectedIds.length !== 1) return null;
    const el = s.elements[s.selectedIds[0]];
    return el && el.type === 'comment' ? el : null;
  });
  const camera = useBoardStore((s) => s.camera);
  const viewport = useBoardStore((s) => s.viewport);
  const interaction = useBoardStore((s) => s.interaction);
  const showComments = useAppStore((s) => s.preferences.showComments);

  // Clique no canvas fora do compositor descarta um rascunho vazio
  useEffect(() => {
    if (!draft) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-comment-panel]')) return;
      const ta = document.querySelector('[data-comment-panel] textarea') as HTMLTextAreaElement | null;
      if (!ta || !ta.value.trim()) cancelCommentDraft();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [draft]);

  const anchor = draft ? draft.world : selectedComment ? { x: selectedComment.x, y: selectedComment.y } : null;
  if (!anchor || !showComments || interaction === 'dragging') return null;
  const p = worldToScreen(anchor, camera);
  const pinTop = p.y - COMMENT_PIN_PX;
  let left = p.x + COMMENT_PIN_PX + 10;
  if (left + PANEL_W > viewport.width - 12) left = Math.max(12, p.x - PANEL_W - 10);
  const top = Math.max(12, Math.min(pinTop - 6, viewport.height - 360));

  return (
    <div
      data-comment-panel
      data-od-floating
      className="od-pop absolute z-[46] flex max-h-[min(520px,calc(100%-24px))] animate-pop-in flex-col overflow-hidden"
      style={{ left, top, width: PANEL_W }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      {draft ? <DraftComposer /> : selectedComment ? <Thread comment={selectedComment} /> : null}
    </div>
  );
}

function DraftComposer() {
  const t = useT();
  const can = useCan('board.comment');
  return (
    <>
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
        <span className="text-sm font-bold text-ink">{t('board.commentThreadPanel.newComment')}</span>
        <button type="button" className="od-tool ms-auto h-7 w-7" onClick={cancelCommentDraft} aria-label={t('common.cancel')}>
          <X size={16} />
        </button>
      </div>
      <div className="p-3">
        <Composer autoFocus placeholder={t('board.commentThreadPanel.writeCommentUseMention')} submitLabel={t('board.commentThreadPanel.comment')} disabledReason={can.allowed ? undefined : can.reason} onSubmit={(text) => !!submitCommentDraft(text)} onCancel={cancelCommentDraft} />
      </div>
    </>
  );
}

function Thread({ comment }: { comment: CommentElement }) {
  const t = useT();
  const comment_ = useCan('board.comment');
  const authorId = comment.messages[0]?.authorId ?? comment.createdBy ?? null;
  const del = useCan('comment.delete', { authorId });
  const listRef = useRef<HTMLDivElement>(null);
  const b = useBoardStore.getState;

  useLayoutEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [comment.messages.length]);

  return (
    <>
      <div className="flex items-center gap-1 border-b border-line py-2 ps-3.5 pe-2">
        <span className="text-sm font-bold text-ink">{t('board.commentThreadPanel.conversation')}</span>
        <span className={cn('ms-1 rounded-full px-2 py-px text-[11px] font-bold', comment.resolved ? 'bg-panel-sunken text-ink-subtle' : 'bg-success-soft text-success')}>
          {comment.resolved ? t('board.commentThreadPanel.resolved') : t('board.commentThreadPanel.open')}
        </span>
        <span className="flex-1" />
        <Tooltip label={comment_.allowed ? (comment.resolved ? t('board.commentThreadPanel.reopenConversation') : t('board.commentThreadPanel.markAsResolved')) : comment_.reason ?? ''} side="bottom">
          <button type="button" className="od-tool h-8 w-8" disabled={!comment_.allowed} onClick={() => b().setCommentResolved(comment.id, !comment.resolved)} aria-label={comment.resolved ? t('board.commentThreadPanel.reopen') : t('board.commentThreadPanel.resolve')}>
            {comment.resolved ? <RotateCcw size={16} /> : <CircleCheck size={17} />}
          </button>
        </Tooltip>
        <Tooltip label={del.allowed ? t('board.commentThreadPanel.deleteConversation') : del.reason ?? ''} side="bottom">
          <button type="button" className="od-tool h-8 w-8 hover:text-danger" disabled={!del.allowed} onClick={() => b().deleteComment(comment.id)} aria-label={t('board.commentThreadPanel.deleteConversation')}>
            <TrashIcon size={16} />
          </button>
        </Tooltip>
        <button type="button" className="od-tool h-8 w-8" onClick={() => b().clearSelection()} aria-label={t('common.close')}>
          <X size={16} />
        </button>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
        {comment.messages.map((m) => (
          <div key={m.id} className="flex gap-2.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-2xs font-bold text-white" style={{ background: colorFromString(m.author) }}>
              {initials(m.author)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="truncate text-[13px] font-semibold text-ink">{m.author}</span>
                <span className="shrink-0 text-[11px] text-ink-subtle">{relativeTime(m.createdAt)}</span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-[1.45] text-ink">
                {mentionSegments(m.text, m.mentions).map((seg, i) =>
                  seg.mention ? (
                    <span key={i} className="rounded bg-accent-soft px-0.5 font-semibold text-brand-900 dark:text-brand-200">
                      {seg.text}
                    </span>
                  ) : (
                    <span key={i}>{seg.text}</span>
                  ),
                )}
              </p>
            </div>
          </div>
        ))}
        {comment.resolved && comment.resolvedByName && (
          <p className="flex items-center gap-1.5 text-[11.5px] text-ink-subtle">
            <CircleCheck size={13} />{' '}{t('board.commentThreadPanel.resolvedResolvedbynameValue', { resolvedByName: comment.resolvedByName, value: comment.resolvedAt ? ` · ${relativeTime(comment.resolvedAt)}` : '' })}
          </p>
        )}
      </div>
      <div className="border-t border-line p-3">
        <Composer
          key={comment.id}
          placeholder={comment.resolved ? t('board.commentThreadPanel.replyingReopensConversation') : t('board.commentThreadPanel.replyUseMention')}
          submitLabel={t('board.commentThreadPanel.reply')}
          disabledReason={comment_.allowed ? undefined : comment_.reason}
          onSubmit={(text) => {
            replyComment(comment.id, text);
            return true;
          }}
          onCancel={() => b().clearSelection()}
        />
      </div>
    </>
  );
}

/** Campo de mensagem com sugestões de @menção (setas/Enter escolhem; Enter envia; Shift+Enter quebra linha). */
function Composer({
  placeholder,
  submitLabel,
  autoFocus,
  disabledReason,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  disabledReason?: string;
  onSubmit: (text: string) => boolean;
  onCancel: () => void;
}) {
  const t = useT();
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  /** Posição do cursor a aplicar logo após o próximo render (escolher uma menção, botão @) */
  const pendingCaret = useRef<number | null>(null);
  const people = useMemo(() => knownPeople(), []);
  const query = mentionQueryAt(text, caret);
  const suggestions = query ? people.filter((p) => p.toLocaleLowerCase('pt-BR').includes(query.query.toLocaleLowerCase('pt-BR'))).slice(0, 6) : [];

  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  useEffect(() => setActive(0), [query?.query]);
  useLayoutEffect(() => {
    if (pendingCaret.current === null || !ref.current) return;
    ref.current.focus();
    ref.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [text]);

  const pick = (name: string) => {
    if (!query) return;
    const next = `${text.slice(0, query.start)}@${name} ${text.slice(caret)}`;
    const pos = query.start + name.length + 2;
    pendingCaret.current = pos;
    setText(next);
    setCaret(pos);
  };
  const send = () => {
    if (!text.trim() || disabledReason) return;
    if (onSubmit(text)) {
      setText('');
      setCaret(0);
    }
  };

  if (disabledReason) return <p className="text-xs leading-relaxed text-warning">{disabledReason}</p>;

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={text}
        rows={2}
        placeholder={placeholder}
        className="od-input min-h-[60px] resize-none py-2 text-[13px] leading-[1.45]"
        onChange={(e) => {
          setText(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (suggestions.length) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => (i + 1) % suggestions.length);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              pick(suggestions[active]);
              return;
            }
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        aria-label={placeholder}
      />
      {suggestions.length > 0 && (
        <div className="od-pop absolute bottom-[calc(100%+6px)] start-0 z-10 w-full animate-pop-in p-1" role="listbox" aria-label={t('board.commentThreadPanel.mentionPerson')}>
          {suggestions.map((name, i) => (
            <button
              key={name}
              type="button"
              role="option"
              aria-selected={i === active}
              className={cn('od-menu-item min-h-[34px]', i === active && 'bg-accent-soft')}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => pick(name)}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-2xs font-bold text-white" style={{ background: colorFromString(name) }}>
                {initials(name)}
              </span>
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          className="od-tool h-8 w-8"
          title={t('board.commentThreadPanel.mentionSomeone')}
          aria-label={t('board.commentThreadPanel.mentionSomeone')}
          onClick={() => {
            const next = `${text}${text && !/\s$/.test(text) ? ' ' : ''}@`;
            pendingCaret.current = next.length;
            setText(next);
            setCaret(next.length);
          }}
        >
          <AtSign size={16} />
        </button>
        <span className="text-[11px] text-ink-subtle">{t('board.commentThreadPanel.enterSendsShiftEnterAdds')}</span>
        <button type="button" className="od-btn od-btn-primary od-btn-sm ms-auto" disabled={!text.trim()} onClick={send}>
          <SendHorizontal size={14} /> {submitLabel}
        </button>
      </div>
    </div>
  );
}
