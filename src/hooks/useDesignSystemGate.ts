/**
 * LuDraw — Chat 09 · R5: a tela "Sistema visual" (`#/design-system`) está ligada nesta página?
 *
 * Fonte do `/info`, nesta ordem: o que o Modo Servidor carregou (`serverInfo`), o que o boot obteve
 * (`connection.info`) e, no Modo Local servido por uma instalação com servidor, o servidor encontrado na mesma
 * origem (`connection.available.info`). A regra em si é pura: `designSystemGate` (`utils/featureGates.ts`).
 * Todo link, item de menu ou entrada da paleta que leve à tela passa por aqui — nunca por um teste solto.
 */
import { useAppStore } from '../store/useAppStore';
import { designSystemGate, type GateState } from '../utils/featureGates';
import { connection, isServerMode } from '../utils/serverConfig';

export function useDesignSystemGate(): GateState {
  return useAppStore((s) =>
    designSystemGate({
      serverMode: isServerMode(),
      info: s.serverInfo ?? connection.info ?? connection.available?.info ?? null,
      reachable: s.serverReachable,
    }),
  );
}

/** Mostra links e atalhos para a tela? (só quando a decisão já é "ligada") */
export function useDesignSystemEnabled(): boolean {
  return useDesignSystemGate() === 'on';
}
