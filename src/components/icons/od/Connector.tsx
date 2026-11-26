import { OdIcon, type OdIconProps } from './OdIcon';

/** Conector — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const ConnectorIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <circle className="acc" cx="5.5" cy="17.5" r="2.4" /><circle cx="18.5" cy="6.5" r="2.4" /><path d="M7.7 16.3c4.6-1.2 3-8 8.6-8.9" />
  </OdIcon>
);
