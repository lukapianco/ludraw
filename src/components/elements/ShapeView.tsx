import { memo } from 'react';
import type { ShapeElement } from '../../types/canvas';
import { useAppStore } from '../../store/useAppStore';
import { adaptInk, isTransparent } from '../../utils/color';
import { shapeElementDecoration, shapeElementPath, shapeElementTextInsets } from '../../utils/shapes';
import { withAlpha } from '../../utils/color';
import { resolveTextStyle } from '../../utils/text';
import { ElementText } from './ElementText';

interface Props {
  element: ShapeElement;
  isEditing: boolean;
}

/** Forma geométrica (11 tipos ou contorno livre importado de SVG — Chat 05) com texto interno editável. */
export const ShapeView = memo(function ShapeView({ element, isEditing }: Props) {
  const theme = useAppStore((s) => s.theme);
  const { width: w, height: h, strokeWidth } = element;
  const transparentFill = isTransparent(element.fillColor);
  const stroke = transparentFill ? adaptInk(element.strokeColor, theme) : element.strokeColor;
  const textColor = transparentFill ? adaptInk(element.textColor, theme) : element.textColor;
  const insets = shapeElementTextInsets(element);
  const decoration = shapeElementDecoration(element);
  const dash =
    element.strokeStyle === 'dashed'
      ? `${strokeWidth * 4} ${strokeWidth * 3}`
      : element.strokeStyle === 'dotted'
        ? `${strokeWidth} ${strokeWidth * 2}`
        : undefined;

  return (
    <div className="absolute inset-0">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} overflow="visible" className="absolute inset-0 block">
        <path
          d={shapeElementPath(element)}
          fill={transparentFill ? 'transparent' : withAlpha(element.fillColor, element.fillOpacity ?? 1)}
          stroke={strokeWidth > 0 ? stroke : 'none'}
          strokeWidth={strokeWidth}
          strokeDasharray={dash}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {decoration && strokeWidth > 0 && (
          <path d={decoration} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} strokeLinecap="round" />
        )}
      </svg>
      <div
        className="absolute flex items-center"
        style={{ top: insets.top, right: insets.right, bottom: insets.bottom, left: insets.left, overflow: isEditing ? 'visible' : 'hidden' }}
      >
        <ElementText
          elementId={element.id}
          text={element.text}
          style={resolveTextStyle(element, textColor)}
          fontSize={element.fontSize}
          editing={isEditing}
          selectAllOnEdit={false}
        />
      </div>
    </div>
  );
});
