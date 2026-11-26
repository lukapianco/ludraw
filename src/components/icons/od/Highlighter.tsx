import { OdIcon, type OdIconProps } from './OdIcon';

/** Marca-texto: ponta chanfrada sobre um traço — desenhado do zero no Chat 08.2 · C-1. */
export const HighlighterIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <path d="M14.5 4l5.5 5.5-8 8H6.5V12z" /><path d="M6.5 17.5L4 20" /><rect className="acc" x="9" y="19.2" width="11" height="2" rx="1" stroke="none" />
  </OdIcon>
);
