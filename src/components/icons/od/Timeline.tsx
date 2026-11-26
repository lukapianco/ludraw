import { OdIcon, type OdIconProps } from './OdIcon';

/** Cronograma — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const TimelineIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <path d="M3 12h18" /><rect className="acc" x="4" y="6" width="7" height="3.5" rx="1" /><rect x="12" y="14.5" width="8" height="3.5" rx="1" />
  </OdIcon>
);
