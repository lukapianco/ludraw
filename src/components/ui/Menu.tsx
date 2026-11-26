import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn';
import { shortcutLabel } from '../../utils/format';
import { t } from '../../i18n';

/**
 * Menu genérico (portal) com submenus em cascata, toggles com ✓, radios, separadores,
 * rótulos e conteúdo customizado. Usado no menu do board (⋮), no menu de contexto do
 * canvas (botão direito), no menu "Mais" dos elementos e nos menus de zoom/export.
 */

export type MenuItem =
  | {
      kind: 'item';
      id: string;
      label: string;
      icon?: ReactNode;
      shortcut?: string;
      onSelect: () => void;
      disabled?: boolean;
      danger?: boolean;
      hint?: string;
      badge?: string;
    }
  | {
      kind: 'toggle';
      id: string;
      label: string;
      checked: boolean;
      onToggle: () => void;
      shortcut?: string;
      disabled?: boolean;
      icon?: ReactNode;
      /** 'switch' (padrão, chave à direita — menus do board) ou 'check' (✓ à esquerda — menu de contexto) */
      variant?: 'switch' | 'check';
    }
  | { kind: 'radio'; id: string; label: string; checked: boolean; onSelect: () => void; disabled?: boolean; icon?: ReactNode }
  | { kind: 'submenu'; id: string; label: string; icon?: ReactNode; items: MenuItem[]; disabled?: boolean; badge?: string }
  | { kind: 'separator'; id: string }
  | { kind: 'label'; id: string; label: string }
  | { kind: 'custom'; id: string; render: (close: () => void) => ReactNode }
  /** Chat 08.2 · C-2: cabeçalho (tipo e nome do objeto / "Neste ponto" + coordenadas) */
  | { kind: 'header'; id: string; title: string; detail?: string; mono?: boolean }
  /** Chat 08.2 · C-2: linha rápida (até 5 ações com ícone e rótulo curto) */
  | { kind: 'quick'; id: string; items: QuickAction[] };

export interface QuickAction {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** dica (ex.: o motivo do `explain()` quando desabilitada) */
  hint?: string;
}

interface MenuProps {
  items: MenuItem[];
  /** Ponto de ancoragem em px de viewport (canto superior esquerdo do menu) */
  x: number;
  y: number;
  onClose: () => void;
  minWidth?: number;
  /** 'end' alinha a borda direita do menu em `x` */
  align?: 'start' | 'end';
  /** Abre para cima a partir de `y` (ex.: barra inferior) */
  placement?: 'below' | 'above';
}

export function Menu({ items, x, y, onClose, minWidth = 248, align = 'start', placement = 'below' }: MenuProps) {
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('[data-od-menu]') || target?.closest('[data-od-menu-trigger]')) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onBlur = () => onClose();
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [onClose]);

  return createPortal(
    <MenuPanel items={items} x={x} y={y} onClose={onClose} minWidth={minWidth} align={align} placement={placement} depth={0} />,
    document.body,
  );
}

interface PanelProps {
  items: MenuItem[];
  x: number;
  y: number;
  onClose: () => void;
  minWidth: number;
  align: 'start' | 'end';
  placement: 'below' | 'above';
  depth: number;
  /** Para submenus: retângulo do item pai (para "virar" para a esquerda se faltar espaço) */
  parentRect?: DOMRect;
}

function MenuPanel({ items, x, y, onClose, minWidth, align, placement, depth, parentRect }: PanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; ready: boolean }>({ left: x, top: y, ready: false });
  const [openSub, setOpenSub] = useState<{ id: string; rect: DOMRect } | null>(null);
  const hoverTimer = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = align === 'end' ? x - r.width : x;
    let top = placement === 'above' ? y - r.height : y;
    if (parentRect && left + r.width > vw - 8) left = parentRect.left - r.width + 4;
    if (left + r.width > vw - 8) left = vw - r.width - 8;
    if (left < 8) left = 8;
    if (top + r.height > vh - 8) top = Math.max(8, vh - r.height - 8);
    if (top < 8) top = 8;
    setPos({ left, top, ready: true });
  }, [x, y, align, placement, parentRect, items.length]);

  useEffect(
    () => () => {
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    },
    [],
  );

  const scheduleSub = useCallback((next: { id: string; rect: DOMRect } | null, immediate = false) => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    if (immediate) {
      setOpenSub(next);
      return;
    }
    hoverTimer.current = window.setTimeout(() => setOpenSub(next), 110);
  }, []);

  const hasChecks = items.some((i) => i.kind === 'toggle' && i.variant === 'check');
  const sub = openSub ? items.find((i) => i.id === openSub.id) : null;

  return (
    <>
      <div
        ref={ref}
        data-od-menu
        role="menu"
        // nenhum menu passa da altura da tela (Chat 08.2 · C-2): rolagem interna
        className={cn('od-pop fixed z-[900] max-h-[calc(100vh-16px)] overflow-y-auto p-1.5', pos.ready ? 'animate-pop-in' : 'opacity-0')}
        style={{ left: pos.left, top: pos.top, minWidth, zIndex: 900 + depth }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {items.map((item) => {
          switch (item.kind) {
            case 'separator':
              return <div key={item.id} className="mx-2 my-1.5 h-px bg-line" />;
            case 'label':
              return (
                <div key={item.id} className="px-2.5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                  {item.label}
                </div>
              );
            case 'header':
              return (
                <div key={item.id} data-menu-header className="flex min-w-0 items-baseline gap-2 px-2.5 pb-1.5 pt-1" onPointerEnter={() => scheduleSub(null)}>
                  <span className="truncate text-[13px] font-bold text-ink" title={item.title}>
                    {item.title}
                  </span>
                  {item.detail && <span className={cn('ms-auto shrink-0 text-[11.5px] text-ink-subtle', item.mono && 'font-mono tabular-nums')}>{item.detail}</span>}
                </div>
              );
            case 'quick':
              return (
                <div key={item.id} data-menu-quick className="grid gap-0.5 px-0.5 pb-1" style={{ gridTemplateColumns: `repeat(${item.items.length}, minmax(0, 1fr))` }} onPointerEnter={() => scheduleSub(null)}>
                  {item.items.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      role="menuitem"
                      data-quick-action={q.id}
                      disabled={q.disabled}
                      title={q.hint ?? q.label}
                      aria-label={q.label}
                      className={cn(
                        'flex min-w-0 flex-col items-center gap-1 rounded-lg px-0.5 pb-1 pt-1.5 text-2xs font-semibold transition-colors duration-base hover:bg-panel-hover disabled:cursor-not-allowed disabled:opacity-40',
                        q.danger ? 'text-danger' : 'text-ink-muted hover:text-ink',
                      )}
                      onClick={() => {
                        q.onSelect();
                        onClose();
                      }}
                    >
                      <span className="flex h-[18px] items-center">{q.icon}</span>
                      <span className="w-full truncate text-center">{q.label}</span>
                    </button>
                  ))}
                </div>
              );
            case 'custom':
              return (
                <div key={item.id} onPointerEnter={() => scheduleSub(null)}>
                  {item.render(onClose)}
                </div>
              );
            case 'submenu':
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  data-open={openSub?.id === item.id}
                  className="od-menu-item"
                  onPointerEnter={(e) => scheduleSub({ id: item.id, rect: e.currentTarget.getBoundingClientRect() })}
                  onClick={(e) => scheduleSub({ id: item.id, rect: e.currentTarget.getBoundingClientRect() }, true)}
                >
                  {hasChecks && <span className="w-4" />}
                  {item.icon && <span className="flex w-[18px] shrink-0 justify-center text-ink-muted">{item.icon}</span>}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && <DevBadge text={item.badge} />}
                  <ChevronRight size={16} className="text-ink-subtle" />
                </button>
              );
            case 'toggle':
              if (item.variant === 'check') {
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={item.checked}
                    disabled={item.disabled}
                    className="od-menu-item"
                    onPointerEnter={() => scheduleSub(null)}
                    onClick={() => item.onToggle()}
                  >
                    <span className="flex w-4 shrink-0 justify-center text-selection">{item.checked && <Check size={16} strokeWidth={2.4} />}</span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.shortcut && <span className="od-kbd">{shortcutLabel(item.shortcut)}</span>}
                  </button>
                );
              }
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={item.checked}
                  disabled={item.disabled}
                  className="od-menu-item"
                  onPointerEnter={() => scheduleSub(null)}
                  onClick={() => item.onToggle()}
                >
                  {hasChecks && <span className="w-4" />}
                  {item.icon && <span className="flex w-[18px] shrink-0 justify-center text-ink-muted">{item.icon}</span>}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.shortcut && <span className="od-kbd me-1">{shortcutLabel(item.shortcut)}</span>}
                  <Switch checked={item.checked} />
                </button>
              );
            case 'radio':
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={item.checked}
                  disabled={item.disabled}
                  className="od-menu-item"
                  onPointerEnter={() => scheduleSub(null)}
                  onClick={() => item.onSelect()}
                >
                  {hasChecks && <span className="w-4" />}
                  {item.icon && <span className="flex w-[18px] shrink-0 justify-center text-ink-muted">{item.icon}</span>}
                  <span className="flex-1 truncate">{item.label}</span>
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-base',
                      item.checked ? 'border-selection' : 'border-line-strong',
                    )}
                  >
                    <span className={cn('h-2 w-2 rounded-full bg-selection transition-transform duration-base ease-spring', item.checked ? 'scale-100' : 'scale-0')} />
                  </span>
                </button>
              );
            default:
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  className={cn('od-menu-item', item.danger && 'is-danger')}
                  title={item.hint}
                  onPointerEnter={() => scheduleSub(null)}
                  onClick={() => {
                    item.onSelect();
                    onClose();
                  }}
                >
                  {hasChecks && <span className="w-4" />}
                  {item.icon && <span className={cn('flex w-[18px] shrink-0 justify-center', item.danger ? 'text-danger' : 'text-ink-muted')}>{item.icon}</span>}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && <DevBadge text={item.badge} />}
                  {item.shortcut && <span className="od-kbd ms-4">{shortcutLabel(item.shortcut)}</span>}
                </button>
              );
          }
        })}
      </div>
      {sub && sub.kind === 'submenu' && openSub && (
        <MenuPanel
          key={sub.id}
          items={sub.items}
          x={openSub.rect.right + 4}
          y={openSub.rect.top - 6}
          onClose={onClose}
          minWidth={220}
          align="start"
          placement="below"
          depth={depth + 1}
          parentRect={openSub.rect}
        />
      )}
    </>
  );
}

export function DevBadge({ text = t('common.comingSoon') }: { text?: string }) {
  return (
    // selo único “Em breve” (o mesmo da Dock e da Caixa de ferramentas, `DockTray.ComingSoonBadge`)
    <span className="ms-2 shrink-0 whitespace-nowrap rounded-full bg-panel-sunken px-1.5 py-px text-2xs font-bold text-ink-subtle ring-1 ring-line">
      {text}
    </span>
  );
}

/** Chave liga/desliga (estilo dos menus Visualizar/Preferências). */
export function Switch({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full transition-colors duration-base ease-out',
        checked ? 'bg-selection' : 'bg-[var(--od-border-strong)]',
        className,
      )}
    >
      <span
        className={cn(
          'absolute start-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-transform duration-base ease-spring',
          checked ? 'translate-x-[12px]' : 'translate-x-0',
        )}
      />
    </span>
  );
}
