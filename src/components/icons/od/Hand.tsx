import { OdIcon, type OdIconProps } from './OdIcon';

/** Mão (mover o board) — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const HandIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <path d="M8 20c-2-1.5-4-4-4-6.5 0-1 1-1.6 1.9-1l1.6 1.2V6.5a1.5 1.5 0 0 1 3 0V11M10.5 10V4.8a1.5 1.5 0 0 1 3 0V10M13.5 10V6a1.5 1.5 0 0 1 3 0v4.5M16.5 10.5V8.5a1.5 1.5 0 0 1 3 0V14c0 3.5-2.5 6-6 6H8" /><circle className="acc" cx="12" cy="15.5" r="1.4" stroke="none" />
  </OdIcon>
);
