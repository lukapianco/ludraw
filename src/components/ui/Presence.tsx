import type { CSSProperties, ReactNode } from 'react';
import { COLLABORATOR_PALETTE } from '../../collab/protocol';
import { initials } from '../../utils/format';
import { cn } from '../../utils/cn';
import { presenceLabelColors, type PresenceLabel, type Rect } from '../../utils/presenceLayout';

const labelStyle = (color: string) => {
  const c = presenceLabelColors(color);
  return { background: c.background, color: c.text };
};

/**
 * LuDraw — Presença de colaboradores (visual pronto para o multiplayer do Chat 07).
 *  - `CollaboratorCursor`: cursor de outra pessoa com o nome numa pílula da cor dela.
 *  - `CollaboratorEditingFrame`: contorno + selo com avatar quando outra pessoa está mexendo num objeto.
 * As cores vêm de `COLLABORATOR_COLORS` (atribuídas em ordem de entrada na sessão).
 */

export const COLLABORATOR_COLORS: string[] = [...COLLABORATOR_PALETTE];

/** Fundo claro da pílula derivado da cor do colaborador. */
function tint(color: string, alpha: number): string {
  const n = parseInt(color.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

interface CursorProps {
  name: string;
  color: string;
  className?: string;
  style?: CSSProperties;
}

export function CollaboratorCursor({ name, color, className, style }: CursorProps) {
  return (
    <div className={className} style={{ position: 'absolute', pointerEvents: 'none', ...style }}>
      <svg width="18" height="20" viewBox="0 0 18 20" aria-hidden="true" style={{ display: 'block', filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.25))' }}>
        <path d="M2 1.5 L15.5 9.2 L9.2 10.6 L6.4 17 Z" fill={tint(color, 0.85)} stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <span
        className="absolute start-[14px] top-[14px] whitespace-nowrap rounded-full px-2 py-[2px] text-[12px] font-semibold"
        style={{ background: tint(color, 0.18), color, boxShadow: `inset 0 0 0 1.5px ${color}`, backdropFilter: 'blur(2px)' }}
      >
        {name}
      </span>
    </div>
  );
}

interface FrameProps {
  name: string;
  color: string;
  /** true = a pessoa está EDITANDO (selo com avatar); false = só selecionou (nome acima do objeto) */
  editing: boolean;
  style: CSSProperties;
}

/**
 * Contorno de um objeto que outra pessoa selecionou ou está editando — versão em camada sobre o canvas
 * (o `CollaboratorEditingFrame` abaixo envolve o objeto; aqui o objeto é desenhado pelo canvas).
 */
export function CollaboratorFrame({ name, color, editing, style }: FrameProps) {
  return (
    <div className="pointer-events-none absolute rounded-[6px]" style={{ ...style, boxShadow: `0 0 0 2px ${color}`, background: editing ? tint(color, 0.06) : 'transparent' }}>
      {editing ? (
        <span className="absolute -bottom-[5px] -end-[5px] flex translate-y-full items-center gap-1.5 rounded-b-md rounded-ss-md py-[3px] ps-[3px] pe-2 text-[11px] font-semibold text-white" style={{ background: color }}>
          <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white/25 text-2xs font-bold">{initials(name)}</span>
          {name.split(' ')[0]}
        </span>
      ) : (
        <span className="absolute -top-[19px] start-[-2px] whitespace-nowrap rounded-t-md px-1.5 py-[1px] text-2xs font-semibold text-white" style={{ background: color }}>
          {name.split(' ')[0]}
        </span>
      )}
    </div>
  );
}

/* ---------------- Chat 08.2 (STUDIO_V2_SPEC §6): uma caixa e uma etiqueta por pessoa ---------------- */

/** Caixa da seleção de outra pessoa: borda 2 px (px de tela, constante com o zoom), sem alças nem preenchimento. */
export function PresenceBox({ uid, color, rect }: { uid: string; color: string; rect: Rect }) {
  return (
    <div
      data-remote-selection={uid}
      className="pointer-events-none absolute rounded-[2px]"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, boxShadow: `0 0 0 2px ${color}` }}
    />
  );
}

/** Etiqueta com o primeiro nome, fora da caixa; texto escuro ou claro escolhido pelo contraste (WCAG AA). */
export function PresenceLabelTag({ label }: { label: PresenceLabel }) {
  return (
    <span
      data-remote-label={label.uid}
      data-place={label.place}
      className={cn('pointer-events-none absolute flex items-center justify-center whitespace-nowrap px-1.5 text-2xs font-semibold leading-none', label.place === 'top' ? 'rounded-t-md rounded-bs-md' : 'rounded-b-md rounded-ts-md')}
      // mesma largura usada no cálculo: a borda direita bate com a da caixa e a checagem de sobreposição fica exata
      style={{ left: label.x, top: label.y, width: label.width, height: label.height, ...labelStyle(label.color) }}
    >
      {label.text}
    </span>
  );
}

/** Objeto que outra pessoa edita: contorno 2 px + fundo 6 % + selo de iniciais (sem etiqueta de nome). */
export function PresenceEditFrame({ uid, name, color, rect }: { uid: string; name: string; color: string; rect: Rect }) {
  return (
    <div
      data-remote-editing={uid}
      className="pointer-events-none absolute rounded-[2px]"
      style={{ left: rect.x - 3, top: rect.y - 3, width: rect.width + 6, height: rect.height + 6, boxShadow: `0 0 0 2px ${color}`, background: tint(color, 0.06) }}
    >
      <span
        className="absolute -bottom-[9px] -end-[9px] flex h-[18px] w-[18px] items-center justify-center rounded-full text-2xs font-bold ring-2 ring-[var(--od-panel)]"
        style={labelStyle(color)}
        title={name}
      >
        {initials(name)}
      </span>
    </div>
  );
}

interface EditingFrameProps {
  name: string;
  color: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** Envolve um objeto que outra pessoa está editando/movendo. */
export function CollaboratorEditingFrame({ name, color, children, className, style }: EditingFrameProps) {
  return (
    <div className={className} style={{ position: 'absolute', ...style }}>
      {children}
      <div className="pointer-events-none absolute -inset-[5px] rounded-[6px]" style={{ boxShadow: `0 0 0 2px ${color}`, background: tint(color, 0.06) }} />
      <span
        className="absolute -bottom-[5px] -end-[5px] flex translate-y-full items-center gap-1.5 rounded-b-md rounded-ss-md py-[3px] ps-[3px] pe-2 text-[11px] font-semibold text-white"
        style={{ background: color }}
      >
        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white/25 text-2xs font-bold">{initials(name)}</span>
        {name.split(' ')[0]}
      </span>
    </div>
  );
}
