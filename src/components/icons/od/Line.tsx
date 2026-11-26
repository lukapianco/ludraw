import { OdIcon, type OdIconProps } from './OdIcon';

/** Linha reta — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const LineIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <path d="M4 18L20 6" /><circle className="acc" cx="4" cy="18" r="1.7" stroke="none" />
  </OdIcon>
);
