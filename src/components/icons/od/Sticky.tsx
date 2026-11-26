import { OdIcon, type OdIconProps } from './OdIcon';

/** Post-it com o pedaço de fita — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const StickyIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <rect x="4.5" y="6.5" width="15" height="14" rx="1.6" /><rect className="acc" x="9" y="3.8" width="6" height="4.4" rx=".9" transform="rotate(-6 12 6)" />
  </OdIcon>
);
