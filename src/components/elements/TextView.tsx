import { memo, useLayoutEffect, useRef } from 'react';
import type { TextElement } from '../../types/canvas';
import { useAppStore } from '../../store/useAppStore';
import { useBoardStore } from '../../store/useBoardStore';
import { adaptInk, isTransparent, withAlpha } from '../../utils/color';
import { resolveTextStyle } from '../../utils/text';
import { ElementText } from './ElementText';
import { useT } from '../../i18n/useT';

interface Props {
  element: TextElement;
  isEditing: boolean;
}

/**
 * Caixa de texto solta. A altura acompanha o conteúdo automaticamente
 * (a largura é controlada pelas alças laterais; cantos escalam a fonte).
 */
export const TextView = memo(function TextView({ element, isEditing }: Props) {
  const t = useT();
  const theme = useAppStore((s) => s.theme);
  const contentRef = useRef<HTMLDivElement>(null);
  const transparentBg = isTransparent(element.backgroundColor);
  // Texto com marca-texto mantém a cor original (o realce já garante o contraste)
  const color = transparentBg && !element.highlightColor ? adaptInk(element.textColor, theme) : element.textColor;
  const padding = transparentBg ? 0 : Math.max(4, element.fontSize * 0.3);

  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    // offsetHeight ignora transforms CSS → já está em unidades de mundo
    const measured = Math.ceil(node.offsetHeight + padding * 2);
    if (Math.abs(measured - element.height) > 1) {
      useBoardStore.getState().updateElement(element.id, { height: measured });
    }
  });

  return (
    <div
      className="absolute inset-x-0 top-0"
      style={{
        background: transparentBg ? 'transparent' : withAlpha(element.backgroundColor, element.fillOpacity ?? 1),
        padding,
        borderRadius: transparentBg ? 0 : Math.max(2, element.fontSize * 0.18),
        minHeight: '100%',
      }}
    >
      <div ref={contentRef}>
        <ElementText
          elementId={element.id}
          text={element.text}
          style={resolveTextStyle(element, color)}
          fontSize={element.fontSize}
          editing={isEditing}
          placeholder={t('widgets.textView.typeSomething')}
        />
      </div>
    </div>
  );
});
