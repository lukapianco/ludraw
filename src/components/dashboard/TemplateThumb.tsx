/** Miniaturas vetoriais dos templates do dashboard (paleta LuDraw, sem imagens externas). */

import { STICKY_COLORS, stickyColor } from '../../utils/factory';

/** Post-its das miniaturas: mesma paleta dos boards (Chat 05.5). */
const S = {
  canario: stickyColor('canario'),
  lima: stickyColor('lima'),
  hortensia: stickyColor('hortensia'),
  coral: stickyColor('coral'),
  damasco: stickyColor('damasco'),
  algodao: stickyColor('algodao-doce'),
};

export type TemplateThumbKind = 'blank' | 'demo' | 'flowchart' | 'brainwriting' | 'kanban' | 'roadmap' | 'retro' | 'mindmap' | 'welcome' | 'swot' | 'business9' | 'journey' | 'architecture';

export function TemplateThumb({ kind }: { kind: TemplateThumbKind }) {
  const bg = 'var(--od-panel)';
  switch (kind) {
    case 'demo':
      return (
        <svg viewBox="0 0 150 90" className="h-full w-full" aria-hidden="true">
          <rect width="150" height="90" fill={bg} />
          <rect x="12" y="12" width="70" height="7" rx="3.5" fill="#194B32" />
          <rect x="12" y="24" width="96" height="4" rx="2" fill="#A9ADA8" />
          {[S.canario, S.lima, S.hortensia, S.algodao].map((c, i) => (
            <rect key={c} x={12 + i * 32} y="38" width="26" height="26" rx="2" fill={c} />
          ))}
          <circle cx="132" cy="51" r="11" fill="none" stroke="#194B32" strokeWidth="2" />
          <rect x="12" y="70" width="40" height="12" rx="6" fill="#194B32" />
        </svg>
      );
    case 'flowchart':
      return (
        <svg viewBox="0 0 150 90" className="h-full w-full" aria-hidden="true">
          <rect width="150" height="90" fill={bg} />
          <rect x="10" y="38" width="26" height="14" rx="7" fill="#D0E4AE" />
          <path d="M36 45 H52" stroke="#5B605C" strokeWidth="1.5" />
          <rect x="52" y="38" width="24" height="14" fill="#FFF6A5" />
          <path d="M76 45 H88" stroke="#5B605C" strokeWidth="1.5" />
          <path d="M98 34 L109 45 L98 56 L87 45 Z" fill="#194B32" />
          <path d="M109 45 H120 M98 56 V70 H112" stroke="#5B605C" strokeWidth="1.5" fill="none" />
          <rect x="120" y="38" width="22" height="14" fill="#FFC58F" />
          <rect x="112" y="64" width="22" height="12" fill="#FFD0EC" />
        </svg>
      );
    case 'brainwriting':
      return (
        <svg viewBox="0 0 150 90" className="h-full w-full" aria-hidden="true">
          <rect width="150" height="90" fill={bg} />
          {Array.from({ length: 12 }).map((_, i) => {
            const colors = STICKY_COLORS;
            const col = i % 4;
            const row = Math.floor(i / 4);
            return <rect key={i} x={26 + col * 26} y={10 + row * 25} width="21" height="21" rx="1.5" fill={colors[i % colors.length]} />;
          })}
        </svg>
      );
    case 'kanban':
      return (
        <svg viewBox="0 0 150 90" className="h-full w-full" aria-hidden="true">
          <rect width="150" height="90" fill={bg} />
          {[0, 1, 2].map((c) => (
            <g key={c}>
              <rect x={10 + c * 46} y="10" width="40" height="72" rx="4" fill="var(--od-panel-sunken)" />
              <rect x={14 + c * 46} y="14" width="22" height="4" rx="2" fill={['#194B32', '#E0A21B', '#5FA067'][c]} />
              {Array.from({ length: 3 - c }).map((_, i) => (
                <rect key={i} x={14 + c * 46} y={24 + i * 17} width="32" height="13" rx="2" fill="var(--od-panel)" stroke="var(--od-border-strong)" />
              ))}
            </g>
          ))}
        </svg>
      );
    case 'roadmap':
      return (
        <svg viewBox="0 0 150 90" className="h-full w-full" aria-hidden="true">
          <rect width="150" height="90" fill={bg} />
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x="10" y={12 + i * 14} width="26" height="6" rx="3" fill="#A9ADA8" />
          ))}
          <path d="M44 8 V84 M72 8 V84 M100 8 V84 M128 8 V84" stroke="var(--od-border-strong)" />
          <rect x="44" y="11" width="44" height="8" rx="4" fill="#82AEFA" />
          <rect x="60" y="25" width="56" height="8" rx="4" fill="#D0E4AE" />
          <rect x="80" y="39" width="36" height="8" rx="4" fill="#FFE066" />
          <rect x="50" y="53" width="70" height="8" rx="4" fill="#194B32" />
          <rect x="96" y="67" width="40" height="8" rx="4" fill="#FFC58F" />
        </svg>
      );
    case 'retro':
      return (
        <svg viewBox="0 0 150 90" className="h-full w-full" aria-hidden="true">
          <rect width="150" height="90" fill={bg} />
          {[S.lima, S.damasco, S.hortensia].map((c, col) => (
            <g key={c}>
              <rect x={10 + col * 46} y="10" width="40" height="8" rx="4" fill={c} />
              <rect x={14 + col * 46} y="24" width="16" height="16" rx="1.5" fill={c} opacity="0.85" />
              <rect x={32 + col * 46} y="30" width="16" height="16" rx="1.5" fill={c} opacity="0.85" />
              <rect x={18 + col * 46} y="50" width="16" height="16" rx="1.5" fill={c} opacity="0.85" />
            </g>
          ))}
        </svg>
      );
    case 'mindmap':
      return (
        <svg viewBox="0 0 150 90" className="h-full w-full" aria-hidden="true">
          <rect width="150" height="90" fill={bg} />
          <path d="M75 45 C 55 45, 50 22, 30 22 M75 45 C 55 45, 50 68, 30 68 M75 45 C 95 45, 100 22, 120 22 M75 45 C 95 45, 100 68, 120 68" stroke="#5FA067" strokeWidth="2" fill="none" />
          <rect x="57" y="37" width="36" height="16" rx="8" fill="#194B32" />
          {[
            [12, 16],
            [12, 62],
            [114, 16],
            [114, 62],
          ].map(([x, y]) => (
            <rect key={`${x}${y}`} x={x} y={y} width="24" height="12" rx="6" fill="#D0E4AE" />
          ))}
        </svg>
      );
    case 'welcome':
      return (
        <svg viewBox="0 0 150 90" className="h-full w-full" aria-hidden="true">
          <rect width="150" height="90" fill={bg} />
          <rect x="10" y="8" width="54" height="6" rx="3" fill="#194B32" />
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <rect x="10" y={20 + i * 13} width="84" height="10" rx="3" fill="#EEF4E4" stroke="#D0E4AE" />
              <circle cx="16" cy={25 + i * 13} r="3" fill="#194B32" />
              <rect x="80" y={22.5 + i * 13} width="10" height="5" rx="1.5" fill="#FFFFFF" stroke="#194B32" strokeWidth="0.8" />
            </g>
          ))}
          <rect x="108" y="20" width="28" height="9" rx="4.5" fill="#D0E4AE" />
          <rect x="108" y="38" width="28" height="9" fill="#FFFFFF" stroke="#194B32" strokeWidth="0.8" />
          <path d="M122 56 L130 62 L122 68 L114 62 Z" fill="#FFF6A5" stroke="#194B32" strokeWidth="0.8" />
          <rect x="108" y="74" width="28" height="9" rx="4.5" fill="#194B32" />
          <path d="M122 29 V38 M122 47 V56 M122 68 V74" stroke="#194B32" strokeWidth="1" />
        </svg>
      );
    case 'swot':
      return (
        <svg viewBox="0 0 150 90" className="h-full w-full" aria-hidden="true">
          <rect width="150" height="90" fill={bg} />
          {['#E7F1D6', '#FBE6E2', '#E3EDF9', '#FBF0DC'].map((c, i) => (
            <g key={c}>
              <rect x={14 + (i % 2) * 63} y={10 + Math.floor(i / 2) * 37} width="59" height="33" rx="2" fill={c} stroke="var(--od-border-strong)" strokeWidth="0.6" />
              <rect x={18 + (i % 2) * 63} y={14 + Math.floor(i / 2) * 37} width="20" height="3" rx="1.5" fill="#4F5A53" />
              <rect x={18 + (i % 2) * 63} y={21 + Math.floor(i / 2) * 37} width="11" height="11" rx="1" fill={[S.lima, S.coral, S.hortensia, S.damasco][i]} />
              <rect x={31 + (i % 2) * 63} y={21 + Math.floor(i / 2) * 37} width="11" height="11" rx="1" fill={[S.lima, S.coral, S.hortensia, S.damasco][i]} />
            </g>
          ))}
        </svg>
      );
    case 'business9':
      return (
        <svg viewBox="0 0 150 90" className="h-full w-full" aria-hidden="true">
          <rect width="150" height="90" fill={bg} />
          {Array.from({ length: 9 }).map((_, i) => (
            <g key={i}>
              <rect x={12 + (i % 3) * 43} y={8 + Math.floor(i / 3) * 25} width="40" height="22" rx="2" fill={['#E7F1D6', '#E3EDF9', '#FBF0DC'][Math.floor(i / 3)]} stroke="var(--od-border-strong)" strokeWidth="0.6" />
              <rect x={15 + (i % 3) * 43} y={11 + Math.floor(i / 3) * 25} width="14" height="2.5" rx="1.25" fill="#4F5A53" />
            </g>
          ))}
          <rect x="16" y="16" width="9" height="9" rx="1" fill={S.canario} />
        </svg>
      );
    case 'journey':
      return (
        <svg viewBox="0 0 150 90" className="h-full w-full" aria-hidden="true">
          <rect width="150" height="90" fill={bg} />
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x={30 + i * 23} y="8" width="21" height="8" rx="2" fill="#194B32" />
          ))}
          {[0, 1, 2, 3].map((r) => (
            <g key={r}>
              <rect x="8" y={20 + r * 17} width="20" height="14" rx="1.5" fill="#ECEFE8" />
              <rect x="30" y={20 + r * 17} width="113" height="14" rx="1.5" fill={r === 2 ? '#FBE6E2' : r === 3 ? '#E7F1D6' : 'var(--od-panel-sunken)'} />
            </g>
          ))}
          <path d="M40 30 C 55 24, 62 46, 78 40 S 100 22, 118 34 S 132 28, 138 30" stroke="#3A8156" strokeWidth="1.6" fill="none" />
          <rect x="34" y="55" width="9" height="9" rx="1" fill={S.coral} />
          <rect x="102" y="72" width="9" height="9" rx="1" fill={S.lima} />
        </svg>
      );
    case 'architecture':
      return (
        <svg viewBox="0 0 150 90" className="h-full w-full" aria-hidden="true">
          <rect width="150" height="90" fill={bg} />
          <rect x="8" y="20" width="24" height="12" rx="1.5" fill="#FFFFFF" stroke="#194B32" strokeWidth="0.8" />
          <rect x="8" y="40" width="24" height="12" rx="1.5" fill="#FFFFFF" stroke="#194B32" strokeWidth="0.8" />
          <path d="M42 30 L48 26 L58 26 L64 30 L58 34 L48 34 Z" fill="#E3EDF9" stroke="#194B32" strokeWidth="0.8" />
          <rect x="72" y="18" width="26" height="12" rx="5" fill="#D0E4AE" stroke="#194B32" strokeWidth="0.8" />
          <rect x="72" y="38" width="26" height="12" rx="5" fill="#D0E4AE" stroke="#194B32" strokeWidth="0.8" />
          <ellipse cx="117" cy="20" rx="10" ry="3" fill="#E7F1D6" stroke="#194B32" strokeWidth="0.8" />
          <path d="M107 20 V32 A10 3 0 0 0 127 32 V20" fill="#E7F1D6" stroke="#194B32" strokeWidth="0.8" />
          <path d="M32 26 H42 M32 46 H40 V32 M64 30 H68 V24 H72 M68 30 V44 H72 M98 24 H107" stroke="#5B605C" strokeWidth="0.9" fill="none" />
          <rect x="108" y="54" width="34" height="30" rx="2" fill="#F4F9EC" stroke="var(--od-border-strong)" strokeWidth="0.6" />
          <rect x="118" y="58" width="14" height="6" rx="3" fill="#D0E4AE" />
          <path d="M125 66 L130 70 L125 74 L120 70 Z" fill="#FFF6A5" stroke="#194B32" strokeWidth="0.6" />
          <rect x="118" y="77" width="14" height="5" fill="#FFFFFF" stroke="#194B32" strokeWidth="0.6" />
        </svg>
      );
    case 'blank':
      return (
        <svg viewBox="0 0 150 90" className="h-full w-full" aria-hidden="true">
          <rect width="150" height="90" fill={bg} />
          {Array.from({ length: 8 }).map((_, r) =>
            Array.from({ length: 13 }).map((__, c) => <circle key={`${r}-${c}`} cx={9 + c * 11} cy={8 + r * 11} r="0.9" fill="var(--od-border-strong)" />),
          )}
          <path d="M75 34 V56 M64 45 H86" stroke="#194B32" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}
