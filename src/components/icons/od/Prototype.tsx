import { OdIcon, type OdIconProps } from './OdIcon';

/** Protótipo — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const PrototypeIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <rect x="7" y="3" width="10" height="18" rx="2" /><path d="M10.5 17.5h3" /><rect className="acc" x="9.5" y="6" width="5" height="6" rx="1" stroke="none" />
  </OdIcon>
);
