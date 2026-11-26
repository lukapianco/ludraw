import { OdIcon, type OdIconProps } from './OdIcon';

/** Modelos — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const TemplatesIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2" /><path className="acc" d="M3.5 9V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2V9z" stroke="none" /><path d="M3.5 9h17M9 9v11.5" />
  </OdIcon>
);
