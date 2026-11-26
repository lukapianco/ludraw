import { OdIcon, type OdIconProps } from './OdIcon';

/** Bloquear — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const LockIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <rect className="acc" x="5" y="11" width="14" height="9.5" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </OdIcon>
);
