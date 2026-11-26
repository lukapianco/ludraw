import { OdIcon, type OdIconProps } from './OdIcon';

/** Selecionar: seta + canto de seleção — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const SelectIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <path className="acc" d="M5.5 4.5L18 10.6l-5.4 1.8-2 5.4z" /><path d="M15.5 20.5h5v-5" />
  </OdIcon>
);
