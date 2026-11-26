import { memo } from 'react';
import type { FreehandElement } from '../../types/canvas';
import { useAppStore } from '../../store/useAppStore';
import { adaptInk } from '../../utils/color';
import { smoothPathFromPoints } from '../../utils/math';

interface Props {
  element: FreehandElement;
  isEditing: boolean;
}

/**
 * Traço livre (caneta / marca-texto). A área clicável é só o traço (com folga),
 * então clicar no "vazio" dentro da caixa do desenho não o seleciona.
 */
export const FreehandView = memo(function FreehandView({ element }: Props) {
  const theme = useAppStore((s) => s.theme);
  const precise = useAppStore((s) => s.preferences.preciseSelection);
  const d = smoothPathFromPoints(element.points);
  const stroke = element.isHighlighter ? element.strokeColor : adaptInk(element.strokeColor, theme);
  return (
    <svg
      width={element.width}
      height={element.height}
      viewBox={`0 0 ${element.width} ${element.height}`}
      overflow="visible"
      className="absolute inset-0 block"
      style={{ pointerEvents: 'none' }}
    >
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(element.strokeWidth + (precise ? 6 : 14), precise ? 10 : 18)}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ pointerEvents: 'stroke' }}
      />
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={element.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={element.isHighlighter ? 0.45 : 1}
        style={{ pointerEvents: 'none', mixBlendMode: element.isHighlighter && theme === 'light' ? 'multiply' : 'normal' }}
      />
    </svg>
  );
});
