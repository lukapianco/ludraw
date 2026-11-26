import { OdIcon, type OdIconProps } from './OdIcon';

/** Menu do objeto (três pontos) — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const MoreIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <circle cx="5.5" cy="12" r="1.6" fill="currentColor" /><circle className="acc" cx="12" cy="12" r="1.9" /><circle cx="18.5" cy="12" r="1.6" fill="currentColor" />
  </OdIcon>
);
