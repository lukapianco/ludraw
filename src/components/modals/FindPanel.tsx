import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { ELEMENT_TYPE_LABELS, getElementText } from '../../utils/factory';
import { isPrivateDraftHidden } from '../../utils/permissions';
import { isHiddenByFrame } from '../../utils/frames';
import { useT } from '../../i18n/useT';

/** Editar → Encontrar (Ctrl+F): busca por texto nos objetos e navega com zoom suave. */
export function FindPanel() {
  const open = useBoardStore((s) => s.findOpen);
  if (!open) return null;
  return <FindPanelInner />;
}

function FindPanelInner() {
  const t = useT();
  const elements = useBoardStore((s) => s.elements);
  const order = useBoardStore((s) => s.elementOrder);
  const viewerId = useBoardStore((s) => s.access.userId);
  const simulate = useBoardStore((s) => s.facilitation.privateMode.previewOwnNotes);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const b = useBoardStore.getState;

  useEffect(() => inputRef.current?.focus(), []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return order.filter((id) => {
      const el = elements[id];
      // Notas do Modo Privado ocultas para quem busca não entram no resultado
      if (el?.type === 'sticky' && isPrivateDraftHidden(el, viewerId, simulate)) return false;
      // conteúdo de frames ocultos também não aparece na busca (Chat 03)
      if (el && isHiddenByFrame(el, (x) => elements[x])) return false;
      return el && getElementText(el).toLowerCase().includes(q);
    });
  }, [query, elements, order, viewerId, simulate]);

  useEffect(() => setIndex(0), [query]);

  const go = (i: number) => {
    if (results.length === 0) return;
    const next = (i + results.length) % results.length;
    setIndex(next);
    const id = results[next];
    b().setSelectedIds([id]);
    b().zoomToElement(id);
  };

  const close = () => b().setFindOpen(false);
  const current = results[index] ? elements[results[index]] : null;

  return (
    <div className="od-panel pointer-events-auto absolute end-2 top-[60px] z-50 w-[340px] animate-pop-in p-2" data-od-floating>
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            ref={inputRef}
            className="od-input h-9 ps-8 text-[13px]"
            placeholder={t('modals.findPanel.findBoard')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') go(e.shiftKey ? index - 1 : results.length && current ? index + 1 : 0);
              if (e.key === 'Escape') close();
            }}
          />
        </div>
        <span className="w-12 text-center text-xs tabular-nums text-ink-subtle">{results.length ? `${index + 1}/${results.length}` : '0/0'}</span>
        <button type="button" className="od-tool h-8 w-8" onClick={() => go(index - 1)} disabled={!results.length} aria-label={t('modals.findPanel.previous')}>
          <ChevronUp size={16} />
        </button>
        <button type="button" className="od-tool h-8 w-8" onClick={() => go(index + 1)} disabled={!results.length} aria-label={t('modals.findPanel.next')}>
          <ChevronDown size={16} />
        </button>
        <button type="button" className="od-tool h-8 w-8" onClick={close} aria-label={t('modals.findPanel.closeSearch')}>
          <X size={16} />
        </button>
      </div>
      {query && (
        <div className="mt-2 max-h-56 overflow-y-auto">
          {results.length === 0 && <div className="px-2 py-3 text-center text-sm text-ink-subtle">{t('modals.findPanel.nothingFound')}</div>}
          {results.slice(0, 50).map((id, i) => {
            const el = elements[id];
            return (
              <button key={id} type="button" className="od-menu-item min-h-[40px] items-start py-1.5" data-open={i === index} onClick={() => go(i)}>
                <span className="mt-0.5 shrink-0 rounded bg-panel-sunken px-1.5 py-0.5 text-2xs font-semibold uppercase text-ink-subtle">{ELEMENT_TYPE_LABELS[el.type]}</span>
                <span className="line-clamp-2 text-[13px]">{getElementText(el)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
