import { OdIcon, type OdIconProps } from './OdIcon';

/** Seta — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const ArrowLineIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <path d="M4 18L19 7M13 6.5h6.5V13" /><circle className="acc" cx="4" cy="18" r="1.7" stroke="none" />
  </OdIcon>
);
