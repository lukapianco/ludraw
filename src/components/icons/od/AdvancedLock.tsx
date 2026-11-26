import { OdIcon, type OdIconProps } from './OdIcon';

/** Bloqueio avançado: escudo com o ponto de acento — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const AdvancedLockIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <path d="M12 3.5l7 2.5v5.5c0 4.3-3 7.7-7 9-4-1.3-7-4.7-7-9V6z" /><circle className="acc" cx="12" cy="11.5" r="2.3" />
  </OdIcon>
);
