/**
 * LuDraw — base dos ícones próprios "traço da pena" (`STUDIO_V2_SPEC.md` §9). Grade 24, traço 1,75, pontas e junções
 * redondas, UM detalhe de acento por ícone (`acc`: preenchido com `--od-accent-soft`; com o botão ativo,
 * `--od-accent-contrast` — regra em `index.css`). Mesma API dos ícones da biblioteca: `size`, `className`, `aria-hidden`.
 * Obra do projeto (MIT): desenhos da referência do projeto e desenhos novos feitos do zero — nada decalcado de terceiros.
 */
import type { ReactNode, SVGProps } from 'react';

export interface OdIconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number;
}

export function OdIcon({ size = 18, className, children, ...rest }: OdIconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={['od-icon', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </svg>
  );
}
