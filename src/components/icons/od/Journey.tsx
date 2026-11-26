import { OdIcon, type OdIconProps } from './OdIcon';

/** Mapa de jornada: a curva com as etapas — desenhado do zero no Chat 08.2 · C-1. */
export const JourneyIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <path d="M3 17c3-6 5-6 7-3s4 3 6-2 3-5 5-5" /><circle className="acc" cx="10" cy="14" r="1.7" /><path d="M3 20.5h18" />
  </OdIcon>
);
