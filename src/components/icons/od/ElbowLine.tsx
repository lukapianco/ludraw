import { OdIcon, type OdIconProps } from './OdIcon';

/** Cotovelo — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const ElbowLineIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <path d="M4 6h8v12h8M16.5 14.5L20 18l-3.5 3.5" /><circle className="acc" cx="4" cy="6" r="1.7" stroke="none" />
  </OdIcon>
);
