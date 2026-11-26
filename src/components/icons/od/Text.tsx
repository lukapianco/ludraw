import { OdIcon, type OdIconProps } from './OdIcon';

/** Texto com o cursor — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const TextIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <path d="M5 6.5V5h11v1.5M10.5 5v14M8 19h5" /><rect className="acc" x="17.6" y="10" width="1.8" height="10" rx=".9" stroke="none" />
  </OdIcon>
);
