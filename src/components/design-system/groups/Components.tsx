/**
 * Design System · 2. Componentes base — botões, ferramentas, campos, menus, avisos e teclas, avatares e selos.
 * Cada componente aparece uma vez, na versão atual, com os estados.
 */
import { Bold, Check, ChevronRight, CircleCheck, Hammer, Mail } from 'lucide-react';
import { CommentPinIcon, LockIcon, SelectIcon, ShapesIcon, StickyIcon, TextIcon, TrashIcon } from '../../icons/od';
import { useAppStore } from '../../../store/useAppStore';
import { COLLABORATOR_PALETTE } from '../../../collab/protocol';
import { cn } from '../../../utils/cn';
import { LockButton } from '../../toolbar/LockButton';
import { DevBadge, Switch } from '../../ui/Menu';
import { Block, FieldDemo, Frame, StatesGrid, ToolDemo } from '../dsKit';
import { ContextMenuMock, MenuMock } from '../studioMocks';

export function Components() {
  const [red, blue, , , teal] = COLLABORATOR_PALETTE;
  return (
    <>
      <Frame title="Botões">
        <StatesGrid
          columns={['Padrão', 'Hover', 'Pressionado', 'Foco', 'Desabilitado']}
          rows={[
            { label: 'Primário', render: (st) => <button type="button" className={cn('od-btn od-btn-primary', st)}>Criar board</button> },
            { label: 'Secundário', render: (st) => <button type="button" className={cn('od-btn od-btn-secondary', st)}>Convidar</button> },
            { label: 'Suave', render: (st) => <button type="button" className={cn('od-btn od-btn-soft', st)}>Bloco</button> },
            { label: 'Fantasma', render: (st) => <button type="button" className={cn('od-btn od-btn-ghost', st)}>Cancelar</button> },
            { label: 'Perigo', render: (st) => <button type="button" className={cn('od-btn od-btn-danger', st)}><TrashIcon size={15} /> Excluir</button> },
          ]}
        />
      </Frame>

      <div className="grid gap-6 lg:grid-cols-2">
        <Frame title="Ferramentas (barras, Dock e Cinta)">
          <StatesGrid
            columns={['Padrão', 'Hover', 'Ativa', 'Desab.']}
            rows={[
              { label: 'Selecionar', render: (st) => <ToolDemo state={st}><SelectIcon size={20} /></ToolDemo> },
              { label: 'Post-it', render: (st) => <ToolDemo state={st}><StickyIcon size={20} /></ToolDemo> },
              { label: 'Formas', render: (st) => <ToolDemo state={st}><ShapesIcon size={20} /></ToolDemo> },
            ]}
            compact
          />
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="od-panel flex h-11 items-center gap-0.5 px-1.5">
              <span className="od-tool"><TextIcon size={18} /></span>
              <span className="od-tool" data-active="true"><Bold size={17} /></span>
              <span className="od-divider-v" />
              <span className="od-tool"><CommentPinIcon size={18} /></span>
              <LockButton locked onLock={() => undefined} onUnlock={() => useAppStore.getState().toast('Exemplo: desbloqueado após 2 s', 'success')} />
            </div>
            <span className="text-xs text-ink-subtle">← segure o cadeado por 2 s, com o mouse ou com Enter/Espaço (anel de progresso; demonstração interativa)</span>
          </div>
          <p className="mt-3 text-xs text-ink-subtle">
            Na Dock, a ferramenta ativa usa <code className="font-mono">.od-dock-tool</code>: <code className="font-mono">bg-accent</code> + ícone em <code className="font-mono">--od-accent-contrast</code> (escuro: <code className="font-mono">bg-accent-soft</code>), mantido no hover.
          </p>
        </Frame>
        <Frame title="Campos de formulário">
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldDemo label="Padrão"><input className="od-input" placeholder="voce@empresa.com" /></FieldDemo>
            <FieldDemo label="Hover"><input className="od-input is-hover" placeholder="voce@empresa.com" /></FieldDemo>
            <FieldDemo label="Foco"><input className="od-input is-focus" defaultValue="luka@largus.com" /></FieldDemo>
            <FieldDemo label="Erro" error="Digite um e-mail válido.">
              <input className="od-input is-error" defaultValue="luka@" />
            </FieldDemo>
            <FieldDemo label="Desabilitado"><input className="od-input" disabled placeholder="Indisponível" /></FieldDemo>
            <FieldDemo label="Com ícone">
              <span className="relative block">
                <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
                <input className="od-input pl-10" placeholder="E-mail" />
              </span>
            </FieldDemo>
          </div>
        </Frame>
      </div>

      <Frame title="Menus">
        <div className="grid gap-6 lg:grid-cols-2">
          <Block title="Itens e estados" note="Atalho em .od-kbd à direita, check e chave para alternâncias, chevron para submenu, perigo em vermelho; o que ainda não existe leva o selo “Em breve”.">
            <div className="od-pop w-full max-w-[300px] p-1.5">
              <div className="od-menu-item">Copiar <span className="od-kbd ml-auto">Ctrl + C</span></div>
              <div className="od-menu-item is-hover">Duplicar (hover) <span className="od-kbd ml-auto">Ctrl + D</span></div>
              <div className="od-menu-item"><span className="flex w-4 justify-center text-selection"><Check size={16} strokeWidth={2.4} /></span> Mostrar grade <span className="od-kbd ml-auto">G</span></div>
              <div className="od-menu-item">Barras de rolagem (chave) <Switch checked={false} className="ml-auto" /></div>
              <div className="od-menu-item">Alinhar objetos (chave) <Switch checked className="ml-auto" /></div>
              <div className="od-menu-item">Organizar <ChevronRight size={16} className="ml-auto text-ink-subtle" /></div>
              <div className="od-menu-item is-disabled">Colar estilo (desabilitado)</div>
              <div className="mx-2 my-1.5 h-px bg-line" />
              <div className="od-menu-item">Cronograma <DevBadge /></div>
              <div className="od-menu-item is-danger"><TrashIcon size={16} /> Excluir</div>
            </div>
          </Block>
          <Block title="Menu do objeto (= ⋯ da Cinta = botão direito)" note="Anatomia única: cabeçalho (tipo · nome), linha rápida de 5 ações e no máximo 6 linhas com submenus. Nunca passa da altura da tela: rola por dentro.">
            <MenuMock />
          </Block>
          <Block title="Botão direito no canvas vazio" note="“Neste ponto” + coordenadas em mono, 5 rápidos que agem no ponto clicado e 4 linhas. “Criar frame com a seleção” e “Desbloquear todos” só aparecem quando valem.">
            <ContextMenuMock kind="canvas" />
          </Block>
          <Block title="Botão direito na tabela" note="Como nas planilhas: o clique marca a célula (ou mantém o intervalo). “Objeto” abre o menu do objeto inteiro.">
            <ContextMenuMock kind="table" />
          </Block>
        </div>
      </Frame>

      <div className="grid gap-6 lg:grid-cols-3">
        <Frame title="Tooltip, toast e teclas">
          <div className="flex flex-col items-start gap-4">
            <span className="od-tooltip">Selecionar <span className="ml-1 opacity-60">V</span></span>
            <span className="flex items-center gap-2.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-ink-inverse shadow-pop">
              <CircleCheck size={17} className="text-brand-300 dark:text-brand-700" /> Imagem exportada (2x)
            </span>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="od-kbd">Ctrl + K</span>
            <span className="inline-flex h-9 min-w-[40px] items-center justify-center rounded-lg bg-white px-2.5 text-[14px] font-bold text-brand-900 ring-[1.5px] ring-brand-900">N</span>
          </div>
          <p className="mt-3 text-xs text-ink-subtle">Tecla da interface em <code className="font-mono">.od-kbd</code>; a tecla “desenhada” é conteúdo do board de boas-vindas.</p>
        </Frame>
        <Frame title="“Em breve” e “em desenvolvimento”">
          <div className="flex flex-wrap items-center gap-2">
            <DevBadge />
          </div>
          <p className="mb-4 mt-2 text-xs text-ink-subtle">Selo único “Em breve”: o item continua visível, desabilitado, com dica.</p>
          <div className="rounded-2xl bg-panel p-4 shadow-modal">
            <div className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-brand-900 dark:text-brand-200"><Hammer size={20} /></span>
              <div>
                <div className="font-bold text-ink">Em desenvolvimento</div>
                <div className="text-sm text-ink-muted">Kanban ainda está sendo construído.</div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-panel-sunken px-3 py-2 text-xs text-ink-muted">
              <span className="h-2 w-2 rounded-full bg-brand-500" /> Planejado para: <strong className="text-ink">próxima etapa</strong>
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-subtle">Função fora do escopo atual: <code className="font-mono">notifyInDevelopment()</code>.</p>
        </Frame>
        <Frame title="Avatares e selos">
          <div className="flex items-center -space-x-2">
            {[
              ['AM', red, true],
              ['JR', blue, false],
              ['CS', teal, false],
            ].map(([txt, c, on]) => (
              <span key={txt as string} className={cn('flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white ring-2', on ? 'ring-[var(--od-selection)]' : 'ring-[var(--od-panel)]')} style={{ background: c as string }}>
                {txt as string}
              </span>
            ))}
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-panel-sunken text-xs font-bold text-ink-muted ring-2 ring-[var(--od-panel)]">+3</span>
          </div>
          <p className="mt-2 text-xs text-ink-subtle">Pilha da barra do topo: só os OUTROS (a própria pessoa é o botão Você, logo depois); quem está sendo seguido ganha o anel de seleção; abaixo de 760 px fica só o +N.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-bold text-success">Salvo</span>
            <span className="rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-bold text-info">Offline</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-panel-sunken px-2 py-0.5 text-[11px] font-bold text-ink-muted"><LockIcon size={12} /> Bloqueado</span>
          </div>
        </Frame>
      </div>
    </>
  );
}
