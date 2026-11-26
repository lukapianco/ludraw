import { OdIcon, type OdIconProps } from './OdIcon';

/** Duplicar: cópia com o sinal de mais — desenhado do zero no Chat 08.2 · C-1. */
export const DuplicateIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <rect x="3.5" y="3.5" width="11" height="11" rx="2" /><rect className="acc" x="9.5" y="9.5" width="11" height="11" rx="2" /><path d="M15 13v4M13 15h4" />
  </OdIcon>
);
