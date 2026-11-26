/**
 * LuDraw — quanto cabe nos módulos da base (Vista e Tempo) sem encostar na Dock (Chat 08.2 · C-1, ajuste pós-teste;
 * `STUDIO_V2_SPEC.md` §11). Antes era só pela largura da janela (1180/1040 px), mas a Dock ficou mais larga com a
 * Caixa de ferramentas e, entre ~1180 e ~1400 px, a Vista passava por cima dela.
 *
 * Níveis: `full` (com rótulos) → `icons` (só ícones) → `compact` (Vista: Bússola + Exibir, com zoom e Encontrar dentro
 * da gaveta Exibir; Tempo: desfazer + ampulheta) → `lifted` (compacto e logo ACIMA da Dock — telas estreitas, onde
 * nem o compacto cabe ao lado dela; a Dock não muda). Começa no nível que a largura permite (as faixas do §11 continuam
 * como piso) e, se o módulo ainda cruzar a Dock, desce um nível — medido antes de pintar, sem piscar.
 */
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { create } from 'zustand';

export type ModuleFit = 'full' | 'icons' | 'compact' | 'lifted';
type ModuleId = 'view' | 'time';

const ORDER: ModuleFit[] = ['full', 'icons', 'compact', 'lifted'];

/** Compacto (sem zoom/Encontrar/Roteiro na Vista, sem refazer no Tempo)? Vale também quando sobe acima da Dock. */
export const isCompact = (fit: ModuleFit) => fit === 'compact' || fit === 'lifted';
const GAP = 8;
const byWidth = (w: number): ModuleFit => (w < 1040 ? 'compact' : w < 1180 ? 'icons' : 'full');

export const useModuleFitStore = create<Record<ModuleId, ModuleFit>>(() => ({
  view: typeof window === 'undefined' ? 'full' : byWidth(window.innerWidth),
  time: typeof window === 'undefined' ? 'full' : byWidth(window.innerWidth),
}));

export function useModuleFit(id: ModuleId, ref: RefObject<HTMLElement>): ModuleFit {
  const fit = useModuleFitStore((s) => s[id]);
  const [, setTick] = useState(0);

  // a janela ou a Dock mudaram de tamanho: recomeça pelo nível da largura e mede de novo
  useEffect(() => {
    const reset = () => {
      useModuleFitStore.setState({ [id]: byWidth(window.innerWidth) } as Partial<Record<ModuleId, ModuleFit>>);
      setTick((n) => n + 1);
    };
    reset();
    window.addEventListener('resize', reset);
    const dock = document.querySelector('[data-od-dock]');
    const ro = new ResizeObserver(reset);
    if (dock) ro.observe(dock);
    return () => {
      window.removeEventListener('resize', reset);
      ro.disconnect();
    };
  }, [id]);

  // a cada desenho (inclusive troca de idioma): se cruzar a Dock, desce um nível (nunca sobe aqui → sem laço)
  useLayoutEffect(() => {
    const el = ref.current;
    const dock = document.querySelector('[data-od-dock]');
    if (!el || !dock) return;
    const a = el.getBoundingClientRect();
    const d = dock.getBoundingClientRect();
    // acima da Dock não há cruzamento possível (outra faixa vertical)
    const crosses = a.bottom > d.top - GAP && a.right + GAP > d.left && a.left < d.right + GAP;
    const i = ORDER.indexOf(fit);
    if (crosses && i < ORDER.length - 1) useModuleFitStore.setState({ [id]: ORDER[i + 1] } as Partial<Record<ModuleId, ModuleFit>>);
  });

  return fit;
}
