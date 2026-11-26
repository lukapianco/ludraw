/**
 * LuDraw — Chat 09 · R5: funções que a instalação liga ou desliga (módulo PURO: o servidor também importa).
 *
 *  - `designSystemGate`: a tela "Sistema visual" (`#/design-system`) é ferramenta de quem desenvolve o LuDraw.
 *    O servidor diz no `/info` (`designSystem`, variável `LUDRAW_ENABLE_DESIGN_SYSTEM`; a imagem Docker desliga).
 *    Com servidor (Modo Servidor, ou Modo Local servido por uma instalação com servidor) vale o `/info`; sem
 *    servidor (desenvolvimento, desktop no Modo Local) fica ligada. Servidor que não diz nada (versão anterior
 *    ao campo) = ligada, como sempre foi.
 *  - `mailPanelVisible`: o painel de e-mail da administração só existe no `single_org`. No `multi_org` o SMTP é
 *    do servidor inteiro (variáveis `LUDRAW_SMTP_*`) e nenhuma organização o lê nem o altera.
 */
import type { InstallMode } from '../types/workspace';

/** `on` = mostra; `off` = some e a rota redireciona; `pending` = Modo Servidor esperando o `/info` (não mostra nem redireciona). */
export type GateState = 'on' | 'off' | 'pending';

export interface DesignSystemGateInput {
  /** A página está no Modo Servidor. */
  serverMode: boolean;
  /** `/info` conhecido nesta página (do Modo Servidor ou do servidor encontrado na mesma origem); null = nenhum. */
  info: { designSystem?: boolean } | null;
  /** O servidor respondeu (false = fora do ar: sem `/info`, a tela fica desligada). */
  reachable: boolean;
}

export function designSystemGate(input: DesignSystemGateInput): GateState {
  if (input.info) return input.info.designSystem === false ? 'off' : 'on';
  if (!input.serverMode) return 'on';
  return input.reachable ? 'pending' : 'off';
}

/** Mostra o painel de e-mail (Administração → Políticas)? Modo desconhecido = ainda não (espera o `/info`). */
export function mailPanelVisible(mode: InstallMode | null | undefined): boolean {
  return mode === 'single_org';
}
