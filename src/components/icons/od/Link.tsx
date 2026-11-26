import { OdIcon, type OdIconProps } from './OdIcon';

/** Link — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const LinkIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /><circle className="acc" cx="12" cy="12" r="1.3" stroke="none" />
  </OdIcon>
);
