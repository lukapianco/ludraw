import { OdIcon, type OdIconProps } from './OdIcon';

/** Texto sobre a linha — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const LineLabelIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <path d="M2.5 12h2M19.5 12h2" /><rect x="4.5" y="7" width="15" height="10" rx="2" /><path className="acc" d="M8.5 12h7" />
  </OdIcon>
);
