import { OdIcon, type OdIconProps } from './OdIcon';

/** Pena — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const PenIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <path d="M12 3l5.2 7.3L12 21l-5.2-10.7z" /><path d="M12 12.5V17" /><circle className="acc" cx="12" cy="10.3" r="1.5" />
  </OdIcon>
);
