import { OdIcon, type OdIconProps } from './OdIcon';

/** Imagem — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const ImageIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <rect x="4" y="3" width="16" height="18" rx="1.6" /><path d="M7 6.5h10v8.5H7z" /><circle className="acc" cx="14.5" cy="9" r="1.3" />
  </OdIcon>
);
