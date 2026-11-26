import { useMemo } from 'react';
import type { TemplateDefinition } from '../../extensions/registries';
import type { CanvasElement } from '../../types/canvas';
import { getBoundsOfElements } from '../../utils/math';

/**
 * Chat 06.5: miniatura gerada de um modelo de extensão (sem desenho à mão): frames, post-its, formas
 * e elementos compostos como blocos nas suas cores. Só leitura; não toca no board.
 */
export function TemplatePreview({ template }: { template: Pick<TemplateDefinition, 'build'> }) {
  const elements = useMemo(() => {
    try {
      return template.build().filter((e) => e.type !== 'connector' && e.type !== 'comment');
    } catch {
      return [] as CanvasElement[];
    }
  }, [template]);
  const b = elements.length ? getBoundsOfElements(elements) : null;
  if (!b || b.width <= 0 || b.height <= 0) return <div className="h-full w-full bg-panel-sunken" />;
  const pad = Math.max(b.width, b.height) * 0.04;
  const fill = (e: CanvasElement): string => {
    if (e.type === 'sticky') return e.color;
    if (e.type === 'frame') return e.fillColor && e.fillColor !== 'transparent' ? e.fillColor : 'var(--od-panel)';
    if (e.type === 'shape') return e.fillColor && e.fillColor !== 'transparent' ? e.fillColor : 'var(--od-panel-sunken)';
    if (e.type === 'composite') return 'var(--od-panel)';
    return 'var(--od-panel-sunken)';
  };
  return (
    <svg className="block h-full w-full bg-[var(--od-canvas)]" viewBox={`${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {elements.map((e) =>
        e.type === 'text' ? (
          <rect key={e.id} x={e.x} y={e.y + e.height * 0.3} width={Math.min(e.width, e.width * 0.7)} height={Math.max(e.height * 0.35, 4)} rx={2} fill="var(--od-text-subtle)" opacity={0.5} />
        ) : (
          <rect key={e.id} x={e.x} y={e.y} width={e.width} height={e.height} rx={e.type === 'frame' ? 6 : 3} fill={fill(e)} stroke="var(--od-border-strong)" strokeWidth={Math.max(b.width, b.height) / 300} />
        ),
      )}
    </svg>
  );
}
