import { OdIcon, type OdIconProps } from './OdIcon';

/** Fluxos (sequências automáticas) — desenhado do zero no Chat 08.2 · C-1. */
export const FlowsIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.5 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.5" /><path className="acc" d="M12.5 15.8l2.6 2.2-2.6 2.2z" />
  </OdIcon>
);
