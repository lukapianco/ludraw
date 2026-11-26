import { useMemo, useRef, useState } from 'react';
import { Check, Minus, Plus, Search, Settings2 } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { useAppStore } from '../../store/useAppStore';
import type { StickyNoteElement } from '../../types/canvas';
import { nextTagColor, REACTION_EMOJIS, tagTextColor } from '../../utils/stickyMeta';
import { allReacted, toggleReactionOnElements } from '../../utils/boardActions';
import { cn } from '../../utils/cn';
import { useT } from '../../i18n/useT';
import { Trans } from '../../i18n/Trans';

const board = () => useBoardStore.getState();

/**
 * Conteúdo do popover "Tags" da Barra de ações (Chat 02 · Rodada A): marca/desmarca tags do
 * catálogo nos post-its selecionados, cria tag nova pelo campo de busca e leva ao Painel.
 */
export function TagPicker({ stickies, onManage }: { stickies: StickyNoteElement[]; onManage: () => void }) {
  const t = useT();
  const boardTags = useBoardStore((s) => s.boardTags);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const ids = stickies.map((s) => s.id);
  const q = query.trim().toLocaleLowerCase('pt-BR');
  const filtered = useMemo(() => boardTags.filter((t) => !q || t.label.toLocaleLowerCase('pt-BR').includes(q)), [boardTags, q]);
  const exact = boardTags.some((t) => t.label.toLocaleLowerCase('pt-BR') === q);
  const editable = stickies.some((s) => !s.locked);

  const stateOf = (tagId: string): 'all' | 'some' | 'none' => {
    const n = stickies.filter((s) => s.tags?.some((t) => t.id === tagId)).length;
    return n === 0 ? 'none' : n === stickies.length ? 'all' : 'some';
  };

  const create = () => {
    const tag = board().createBoardTag(query);
    if (!tag) return;
    if (stateOf(tag.id) !== 'all') board().toggleElementTag(ids, tag.id);
    setQuery('');
    inputRef.current?.focus();
  };

  return (
    <div className="w-[260px] p-2" data-allow-focus>
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
        <input
          ref={inputRef}
          autoFocus
          className="od-input h-8 ps-8 text-[13px]"
          placeholder={boardTags.length ? t('board.stickyMetaControls.searchCreateTag') : t('board.stickyMetaControls.firstTagName')}
          value={query}
          maxLength={40}
          disabled={!editable}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              if (q && !exact) create();
              else if (filtered[0]) board().toggleElementTag(ids, filtered[0].id);
            }
          }}
          aria-label={t('board.stickyMetaControls.searchCreateTag2')}
        />
      </div>
      <div className="mt-1.5 max-h-[220px] overflow-y-auto">
        {filtered.map((t) => {
          const st = stateOf(t.id);
          return (
            <button
              key={t.id}
              type="button"
              className="od-menu-item min-h-[32px] gap-2 text-[13px]"
              disabled={!editable}
              role="menuitemcheckbox"
              aria-checked={st === 'all' ? true : st === 'some' ? 'mixed' : false}
              onClick={() => board().toggleElementTag(ids, t.id)}
            >
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] ring-1 transition-colors',
                  st === 'none' ? 'ring-line-strong' : 'bg-selection text-on-selection ring-selection',
                )}
              >
                {st === 'all' && <Check size={12} strokeWidth={3} />}
                {st === 'some' && <Minus size={12} strokeWidth={3} />}
              </span>
              <span className="inline-flex max-w-[170px] items-center truncate rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ background: t.color, color: tagTextColor(t.color) }}>
                <span className="truncate">{t.label}</span>
              </span>
            </button>
          );
        })}
        {q && !exact && editable && (
          <button type="button" className="od-menu-item min-h-[32px] gap-2 text-[13px]" onClick={create}>
            <Plus size={15} className="text-ink-muted" />
            <span className="min-w-0 truncate"><Trans k="board.stickyMetaControls.createTrim" params={{ trim: query.trim() }} components={{ b: (c) => <span className="rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ background: nextTagColor(boardTags), color: tagTextColor(nextTagColor(boardTags)) }}>{c}</span> }} />
            </span>
          </button>
        )}
        {!q && boardTags.length === 0 && <p className="px-2 py-2 text-xs text-ink-subtle">{t('board.stickyMetaControls.typeNamePressEnterCreate')}</p>}
        {!editable && <p className="px-2 py-2 text-xs text-ink-subtle">{t('board.stickyMetaControls.unlockStickyNotesChangeTheir')}</p>}
      </div>
      <div className="mx-1 my-1.5 h-px bg-line" />
      <button type="button" className="od-menu-item min-h-[32px] text-[13px] text-ink-muted" onClick={onManage}>
        <Settings2 size={15} />{' '}{t('board.stickyMetaControls.manageBoardsTags')}</button>
    </div>
  );
}

/** Grade de reações (popover da Barra de ações e seção da Dock). */
export function ReactionGrid({ ids, onPicked, columns = 6 }: { ids: string[]; onPicked?: () => void; columns?: number }) {
  const t = useT();
  // Re-renderiza quando os elementos (e portanto as reações) mudam
  useBoardStore((s) => s.elements);
  useAppStore((s) => s.user?.id);
  return (
    <div className="grid gap-1 p-2" style={{ gridTemplateColumns: `repeat(${columns}, 36px)` }}>
      {REACTION_EMOJIS.map((emoji) => {
        const on = allReacted(ids, emoji);
        return (
          <button
            key={emoji}
            type="button"
            className={cn('flex h-9 w-9 items-center justify-center rounded-lg text-[20px] transition-transform duration-base ease-spring hover:scale-110 hover:bg-panel-hover', on && 'bg-accent-soft ring-1 ring-selection')}
            onClick={() => {
              toggleReactionOnElements(ids, emoji);
              onPicked?.();
            }}
            aria-pressed={on}
            aria-label={on ? t('board.stickyMetaControls.removeReactionEmoji', { emoji }) : t('board.stickyMetaControls.reactEmoji', { emoji })}
            title={on ? t('board.stickyMetaControls.removeYourReaction') : t('common.react')}
          >
            {emoji}
          </button>
        );
      })}
    </div>
  );
}
