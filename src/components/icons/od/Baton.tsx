import { OdIcon, type OdIconProps } from './OdIcon';

/** Facilitar: batuta — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const BatonIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <path d="M4 20L14.5 9.5" /><circle className="acc" cx="15.8" cy="8.2" r="2" /><path d="M18.5 3.5c1 .6 1.6 1.2 2 2M20.5 9.5c.4 0 .8.1 1 .3M14.5 2.5c0 .3.1.7.3 1" />
  </OdIcon>
);
