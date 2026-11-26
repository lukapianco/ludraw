import { useBoardStore } from '../../store/useBoardStore';

/**
 * Linhas guias magnéticas (smart guides) exibidas durante o arrasto quando bordas
 * ou centros se alinham com outros objetos. Cor de destaque complementar ao verde
 * (`--od-guide`) para não se confundir com a seleção.
 */
export function SmartGuidesOverlay() {
  const guides = useBoardStore((s) => s.smartGuides);
  const camera = useBoardStore((s) => s.camera);
  if (guides.length === 0) return null;

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
      {guides.map((g, i) => {
        if (g.orientation === 'vertical') {
          const x = g.position * camera.zoom + camera.x;
          const y1 = g.start * camera.zoom + camera.y - 8;
          const y2 = g.end * camera.zoom + camera.y + 8;
          return (
            <g key={`v${i}`}>
              <line x1={x} x2={x} y1={y1} y2={y2} stroke="var(--od-guide)" strokeWidth={1} />
              <circle cx={x} cy={y1 + 8} r={2} fill="var(--od-guide)" />
              <circle cx={x} cy={y2 - 8} r={2} fill="var(--od-guide)" />
            </g>
          );
        }
        const y = g.position * camera.zoom + camera.y;
        const x1 = g.start * camera.zoom + camera.x - 8;
        const x2 = g.end * camera.zoom + camera.x + 8;
        return (
          <g key={`h${i}`}>
            <line x1={x1} x2={x2} y1={y} y2={y} stroke="var(--od-guide)" strokeWidth={1} />
            <circle cx={x1 + 8} cy={y} r={2} fill="var(--od-guide)" />
            <circle cx={x2 - 8} cy={y} r={2} fill="var(--od-guide)" />
          </g>
        );
      })}
    </svg>
  );
}
