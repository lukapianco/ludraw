import { OdIcon, type OdIconProps } from './OdIcon';

/** Roteiro: dois quadros em sequência com o play — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const ScriptIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <rect x="3.5" y="4" width="11" height="8" rx="1.5" /><rect className="acc" x="9.5" y="12" width="11" height="8" rx="1.5" /><path d="M13.5 15l3 1.5-3 1.5z" />
  </OdIcon>
);
