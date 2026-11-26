import { OdIcon, type OdIconProps } from './OdIcon';

/** Mapa mental — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const MindMapIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <circle className="acc" cx="12" cy="12" r="3" /><path d="M15 12h5M4.5 6.5L9.6 10M4.5 17.5L9.6 14" /><circle cx="20.5" cy="12" r="1" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="18" r="1" />
  </OdIcon>
);
