import { OdIcon, type OdIconProps } from './OdIcon';

/** Fluxograma: etapa, decisão e saída — desenhado do zero no Chat 08.2 · C-1. */
export const FlowchartIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <rect x="8" y="2.5" width="8" height="5" rx="1.5" /><path d="M12 7.5V10" /><path className="acc" d="M12 10l4 3.5-4 3.5-4-3.5z" /><path d="M12 17v4" />
  </OdIcon>
);
