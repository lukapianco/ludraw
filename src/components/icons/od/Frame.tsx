import { OdIcon, type OdIconProps } from './OdIcon';

/** Frame — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const FrameIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <path d="M7.5 3v4.5H3M16.5 3v4.5H21M7.5 21v-4.5H3M16.5 21v-4.5H21" /><rect className="acc" x="9.5" y="9.5" width="5" height="5" rx="1" stroke="none" />
  </OdIcon>
);
