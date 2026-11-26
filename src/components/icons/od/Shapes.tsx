import { OdIcon, type OdIconProps } from './OdIcon';

/** Formas — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const ShapesIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <circle cx="9" cy="14.5" r="5.5" /><path className="acc" d="M15 3.5l6 10.5H9z" />
  </OdIcon>
);
