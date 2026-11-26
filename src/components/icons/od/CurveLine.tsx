import { OdIcon, type OdIconProps } from './OdIcon';

/** Curva — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const CurveLineIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <path d="M4 18C8 4 16 20 20 6" /><circle className="acc" cx="4" cy="18" r="1.7" stroke="none" />
  </OdIcon>
);
