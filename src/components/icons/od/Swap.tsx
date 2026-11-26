import { OdIcon, type OdIconProps } from './OdIcon';

/** Inverter o sentido — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const SwapIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <path d="M4 8h13M13.5 4.5L17 8l-3.5 3.5M20 16H7M10.5 12.5L7 16l3.5 3.5" /><circle className="acc" cx="4" cy="8" r="1.4" stroke="none" />
  </OdIcon>
);
