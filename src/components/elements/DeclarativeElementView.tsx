import { memo } from 'react';
import type { CompositeElement } from '../../types/canvas';
import { layoutComposite, isValidComposite } from '../../utils/composite';
import { ElementText } from './ElementText';
import { UnsupportedElementView } from './UnsupportedElementView';

interface Props {
  element: CompositeElement;
  isEditing: boolean;
}

/**
 * Chat 06.5: elemento composto de extensão (`EXTENSIONS_SPEC.md` §4 `elementTypes`). Desenha só peças
 * declarativas validadas (retângulo, elipse, path normalizado, texto, selo) — nenhum código da extensão
 * roda aqui. Inválido → marcador neutro (o dado fica no board, sem quebrar nada). A peça `main` é o
 * texto editável por duplo clique.
 */
export const DeclarativeElementView = memo(function DeclarativeElementView({ element, isEditing }: Props) {
  if (!isValidComposite(element)) return <UnsupportedElementView element={element} isEditing={false} />;
  const prims = layoutComposite(element);
  const { width: w, height: h } = element;
  return (
    <div className="absolute inset-0" data-composite-type={element.typeRef.typeId}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} overflow="visible" className="absolute inset-0 block">
        {prims.map((p, i) => {
          if (p.kind === 'rect')
            return <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={Math.min(p.radius, p.w / 2, p.h / 2)} fill={p.fill} stroke={p.strokeWidth > 0 ? p.stroke : 'none'} strokeWidth={p.strokeWidth} strokeDasharray={p.dashed ? `${p.strokeWidth * 4} ${p.strokeWidth * 3}` : undefined} />;
          if (p.kind === 'ellipse')
            return <ellipse key={i} cx={p.x + p.w / 2} cy={p.y + p.h / 2} rx={p.w / 2} ry={p.h / 2} fill={p.fill} stroke={p.strokeWidth > 0 ? p.stroke : 'none'} strokeWidth={p.strokeWidth} strokeDasharray={p.dashed ? `${p.strokeWidth * 4} ${p.strokeWidth * 3}` : undefined} />;
          if (p.kind === 'path') return <path key={i} transform={`translate(${p.x} ${p.y})`} d={p.d} fill={p.fill} stroke={p.strokeWidth > 0 ? p.stroke : 'none'} strokeWidth={p.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />;
          if (p.badge) return <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={p.h / 2} fill={p.badge} />;
          return null;
        })}
      </svg>
      {prims.map((p, i) =>
        p.kind === 'text' ? (
          <div
            key={i}
            className="absolute flex"
            style={{ left: p.x, top: p.y, width: p.w, height: p.h, alignItems: p.valign === 'middle' ? 'center' : p.valign === 'bottom' ? 'flex-end' : 'flex-start', overflow: p.main && isEditing ? 'visible' : 'hidden' }}
          >
            <ElementText elementId={element.id} text={p.text} style={p.style} fontSize={p.fontSize} editing={p.main && isEditing} selectAllOnEdit={false} />
          </div>
        ) : null,
      )}
    </div>
  );
});
