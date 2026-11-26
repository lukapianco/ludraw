import { OdIcon, type OdIconProps } from './OdIcon';

/** Divisor — desenhado do zero no Chat 08.2 · C-1. */
export const DividerIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <path d="M3 12h7M14 12h7M3 8.5v7M21 8.5v7" /><circle className="acc" cx="12" cy="12" r="1.6" stroke="none" />
  </OdIcon>
);
