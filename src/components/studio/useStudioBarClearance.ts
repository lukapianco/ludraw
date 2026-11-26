/**
 * LuDraw — afasta painéis presos ao topo do board (votação, enquete, cronômetro) da barra do topo do Estúdio v2
 * (Chat 08.2 · B, ajuste pós-teste). Em telas largas o painel fica no canto de sempre (`base`); quando a faixa
 * horizontal dele cruza a da barra centralizada (telas menores, nomes longos, `?lang=qps`), ele desce para logo
 * abaixo da barra — antes ficava por trás dela e não dava para fechar.
 *
 * Uso: `const { ref, top } = useStudioBarClearance(12)` e `<div ref={ref} style={{ top }}>`. Callback ref para
 * funcionar com painéis que aparecem e somem (renderização condicional).
 */
import { useCallback, useLayoutEffect, useState } from 'react';

const GAP = 8;

export function useStudioBarClearance(base = 12): { ref: (el: HTMLElement | null) => void; top: number } {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [top, setTop] = useState(base);
  const ref = useCallback((node: HTMLElement | null) => setEl(node), []);

  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => {
      const bar = document.querySelector<HTMLElement>('[data-testid="studio-bar"]');
      const host = (el.offsetParent as HTMLElement | null) ?? document.body;
      if (!bar) return setTop(base);
      const b = bar.getBoundingClientRect();
      const r = el.getBoundingClientRect(); // a posição horizontal não depende do topo: sem laço de medida
      const crosses = r.left < b.right + GAP && r.right > b.left - GAP;
      setTop(crosses ? Math.max(base, Math.round(b.bottom - host.getBoundingClientRect().top + GAP)) : base);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const bar = document.querySelector('[data-testid="studio-bar"]');
    if (bar) ro.observe(bar);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [el, base]);

  return { ref, top };
}
