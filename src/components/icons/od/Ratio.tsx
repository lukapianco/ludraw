import { OdIcon, type OdIconProps } from './OdIcon';

/** Proporção — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const RatioIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <rect x="4" y="6" width="16" height="12" rx="2" /><path className="acc" d="M8 10V9h1M16 14v1h-1" />
  </OdIcon>
);
