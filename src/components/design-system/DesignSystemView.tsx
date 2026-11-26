import { useEffect, useState } from 'react';
import { ArrowLeft, ListTree, Moon, Sun } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { Logo, LogoMark } from '../ui/Logo';
import { Code, Frame, Group, Pill, Step, scrollToDs } from './dsKit';
import { Foundations } from './groups/Foundations';
import { Components } from './groups/Components';
import { Studio } from './groups/Studio';
import { Canvas } from './groups/Canvas';
import { Facilitation } from './groups/Facilitation';
import { Collaboration } from './groups/Collaboration';
import { Mesa } from './groups/Mesa';
import { Flows } from './groups/Flows';

/** Grupos da tela, na ordem de leitura (por tipo de design, não por etapa do projeto). */
const GROUPS = [
  { title: 'Fundamentos', lead: 'Cor, tipografia, forma, movimento, ícones e cursores.', Body: Foundations },
  { title: 'Componentes base', lead: 'Botões, ferramentas, campos, menus, avisos, avatares e selos.', Body: Components },
  { title: 'Estúdio', lead: 'O board por fora: barra do topo, Vista, Tempo, Dock, Cinta e Linha do tempo.', Body: Studio },
  { title: 'Canvas e objetos', lead: 'Seleção, post-its, conectores, frames, Kanban, Tabela e Comentários.', Body: Canvas },
  { title: 'Facilitação e governança', lead: 'Cronômetro, votação e os avisos do facilitador.', Body: Facilitation },
  { title: 'Colaboração ao vivo', lead: 'Cursores, seleção e edição das outras pessoas.', Body: Collaboration },
  { title: 'Mesa', lead: 'A tela inicial: cabeçalho, cartões e avisos.', Body: Mesa },
  { title: 'Telas e fluxos', lead: 'Importar e exportar, administração, extensões, Modo Servidor e splash.', Body: Flows },
] as const;

/**
 * "Sistema visual — tokens e estados" (Style Guide / Design System do LuDraw). Organizado por tipo de design: cada
 * assunto aparece UMA vez, na versão atual. O índice é montado a partir dos próprios frames (data-ds-*).
 * Fonte da verdade visual — os tokens vivem em src/styles/tokens.css; as regras, em docs/DESIGN_SYSTEM.md.
 */
export function DesignSystemView() {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const user = useAppStore((s) => s.user);
  const navigate = useAppStore((s) => s.navigate);
  const index = useDsIndex();

  return (
    <div className="od-dot-bg h-full overflow-y-auto">
      {/* Barra superior estilo board, com atalhos para os grupos */}
      <div className="sticky top-0 z-30 flex items-start justify-between gap-2 p-2 pb-4" style={{ background: 'linear-gradient(var(--od-canvas) 72%, transparent)' }}>
        <div className="od-panel flex h-11 min-w-0 items-center gap-1 px-1.5">
          <button type="button" className="od-tool" onClick={() => navigate(user ? { name: 'dashboard' } : { name: 'login' })} aria-label="Voltar">
            <ArrowLeft size={18} />
          </button>
          <span className="mx-1.5 hidden sm:block">
            <Logo showMark={false} />
          </span>
          <span className="hidden h-5 w-px bg-line sm:block" />
          <span className="ml-2 mr-2 truncate text-[14px] font-semibold text-ink">Sistema visual</span>
          <span className="hidden h-5 w-px bg-line lg:block" />
          <nav className="hidden items-center gap-0.5 overflow-x-auto lg:flex" aria-label="Grupos">
            {GROUPS.map((g, i) => (
              <button key={g.title} type="button" className="od-btn od-btn-sm od-btn-ghost h-8 whitespace-nowrap px-2 text-[12.5px]" onClick={() => scrollToDs(index[i]?.id ?? '')}>
                {g.title}
              </button>
            ))}
          </nav>
        </div>
        <div className="od-panel flex h-11 shrink-0 items-center gap-1 px-1.5">
          <button type="button" className="od-btn od-btn-sm od-btn-ghost" onClick={() => scrollToDs('ds-indice')}>
            <ListTree size={15} /> <span className="hidden sm:inline">Índice</span>
          </button>
          <button type="button" className="od-btn od-btn-sm od-btn-ghost" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />} <span className="hidden sm:inline">{theme === 'dark' ? 'Modo claro' : 'Modo escuro'}</span>
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-[1180px] px-4 pb-24 pt-6 md:px-8">
        <Frame title="Leia primeiro">
          <div className="flex flex-col gap-6 md:flex-row md:items-center">
            <LogoMark size={72} />
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-[34px] font-semibold leading-tight tracking-[-0.02em] text-ink md:text-[42px]">Sistema visual de LuDraw</h1>
              <p className="mt-2 max-w-3xl text-md text-ink-muted">
                Este Style Guide é a <strong className="text-ink">fonte da verdade visual</strong> do projeto, organizado por tipo de design: cada assunto aparece uma vez, na versão atual. Consulte-o
                antes de criar qualquer tela. Precisa de algo novo? Estenda os tokens em <Code>src/styles/tokens.css</Code>, documente em
                <Code>docs/DESIGN_SYSTEM.md</Code> e exiba aqui.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Pill>Paleta verde: #194B32 + #D0E4AE</Pill>
                <Pill>Alto contraste, sem exagero (texto ≥ 4.5:1)</Pill>
                <Pill>Animações suaves (ease-out, 120–260 ms)</Pill>
                <Pill>Sem botões de pagamento ou IA</Pill>
              </div>
            </div>
          </div>
        </Frame>

        <section id="ds-indice" className="mb-6 scroll-mt-20">
          <div className="mb-1.5 px-1 text-xs font-semibold text-ink-muted">Índice</div>
          <div className="grid gap-x-6 gap-y-5 rounded-2xl bg-panel p-5 shadow-panel sm:grid-cols-2 md:p-6 lg:grid-cols-4">
            {index.map((g, i) => (
              <div key={g.id}>
                <button type="button" className="text-left text-[14px] font-bold text-ink hover:underline" onClick={() => scrollToDs(g.id)}>
                  <span className="me-1.5 font-mono text-[12px] font-semibold text-ink-subtle">{String(i + 1).padStart(2, '0')}</span>
                  {g.title}
                </button>
                <ul className="mt-1.5 space-y-0.5">
                  {g.frames.map((f) => (
                    <li key={f.id}>
                      <button type="button" className="text-left text-[12.5px] text-ink-muted hover:text-ink hover:underline" onClick={() => scrollToDs(f.id)}>
                        {f.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {GROUPS.map((g, i) => (
          <Group key={g.title} n={i + 1} title={g.title} lead={g.lead}>
            <g.Body />
          </Group>
        ))}

        <Group n={GROUPS.length + 1} title="Como contribuir" lead="Tokens, extensão do sistema e onde mostrar o que é novo.">
          <Frame title="Como contribuir com este guia">
            <ol className="grid gap-4 text-sm text-ink-muted md:grid-cols-3">
              <Step n={1} title="Use os tokens">Classes Tailwind mapeadas (bg-panel, text-ink, bg-accent…) ou var(--od-*). Nunca hex solto em componentes de UI.</Step>
              <Step n={2} title="Estenda com cuidado">Novo token? Adicione em tokens.css (claro e escuro), teste o contraste e registre em docs/DESIGN_SYSTEM.md.</Step>
              <Step n={3} title="Mostre aqui">Todo componente novo ganha um exemplo com seus estados nesta página — é assim que o time o descobre.</Step>
            </ol>
            <p className="mt-4 text-xs text-ink-subtle">
              Coloque o exemplo no grupo do assunto (não num grupo novo por etapa do projeto) e substitua o exemplo antigo quando o visual mudar — a tela mostra só o que vale hoje.
            </p>
          </Frame>
        </Group>
      </div>
    </div>
  );
}

/** Índice lido da própria página: grupos (h2) e frames, na ordem em que aparecem. */
function useDsIndex(): { id: string; title: string; frames: { id: string; title: string }[] }[] {
  const [index, setIndex] = useState<{ id: string; title: string; frames: { id: string; title: string }[] }[]>([]);
  useEffect(() => {
    const groups = [...document.querySelectorAll<HTMLElement>('[data-ds-group]')].filter((g) => g.dataset.dsGroup !== 'Como contribuir');
    setIndex(
      groups.map((g) => ({
        id: g.id,
        title: g.dataset.dsGroup ?? '',
        frames: [...g.querySelectorAll<HTMLElement>('[data-ds-frame]')].map((f) => ({ id: f.id, title: f.dataset.dsFrame ?? '' })),
      })),
    );
  }, []);
  return index;
}
