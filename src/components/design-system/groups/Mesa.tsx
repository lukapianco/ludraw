/**
 * Design System · 7. Mesa (Dashboard) — cabeçalho (abas, Novo board, busca, trilha de espaços), cartão de board e o
 * aviso de trazer boards do Modo Local para o servidor.
 */
import { Building2, Check, ChevronDown, ChevronRight, CircleAlert, Folder, HardDriveUpload, Inbox, Lock, Plus, Search, UsersRound } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Block, Frame, SubTitle } from '../dsKit';
import { VerifyEmailBanner } from '../../dashboard/VerifyEmailBanner';
import { LocalModeBanner } from '../../dashboard/LocalModeBanner';

export function Mesa() {
  return (
    <>
      <Frame title="Cabeçalho da Mesa">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-5">
            <div>
              <SubTitle>Abas sublinhadas (Mesa)</SubTitle>
              <div className="flex gap-5 border-b border-line">
                {['Todos', 'Meus', 'Favoritos'].map((t, i) => (
                  <span key={t} className={cn('flex h-10 items-center border-b-2 text-[14px] font-semibold', i === 0 ? 'border-brand-900 text-ink dark:border-brand-200' : 'border-transparent text-ink-subtle')}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <SubTitle>Botão dividido “Novo board”</SubTitle>
              <span className="inline-flex overflow-hidden rounded-lg shadow-panel">
                <span className="od-btn od-btn-primary rounded-none pl-3.5 pr-3">
                  <Plus size={17} /> Novo board
                </span>
                <span className="w-px bg-brand-950/40 dark:bg-brand-950/25" />
                <span className="od-btn od-btn-primary rounded-none px-2.5">
                  <ChevronDown size={16} />
                </span>
              </span>
            </div>
            <div>
              <SubTitle>Busca da Mesa (Ctrl K)</SubTitle>
              <span className="flex h-9 max-w-[340px] items-center gap-2.5 rounded-lg bg-panel-sunken px-3 text-[13px] text-ink-subtle ring-1 ring-line">
                <Search size={16} /> Buscar boards e ações…
                <span className="od-kbd ml-auto rounded-md bg-panel px-1.5 py-0.5 ring-1 ring-line">Ctrl K</span>
              </span>
            </div>
          </div>
          <Block title="Seletor de espaço em trilha" note="Botão único no cabeçalho da Mesa: nome da organização (ink-subtle) › Time › Projeto. O popover lista Espaço pessoal, Compartilhados comigo, Geral e os times (ícone na cor do time), com Gerenciar workspace / + Novo time / + Novo projeto no rodapé conforme can().">
            <div className="space-y-2 rounded-xl bg-canvas p-3">
              <div className="flex h-8 items-center gap-1.5 rounded-lg bg-panel px-2 text-[13px] font-semibold text-ink ring-1 ring-line">
                <span className="h-3 w-3 rounded-[4px] bg-[#2C64A8]" />
                <span className="text-ink-subtle">Acme</span>
                <ChevronRight size={13} className="text-ink-subtle" /> Produto
                <ChevronRight size={13} className="text-ink-subtle" /> Lançamento
                <ChevronDown size={14} className="text-ink-subtle" />
              </div>
              <div className="od-pop w-full p-1.5 text-[13px]">
                <div className="px-2.5 py-1 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">Acme</div>
                {[
                  { icon: <Lock size={15} />, label: 'Espaço pessoal (4)' },
                  { icon: <Inbox size={15} />, label: 'Compartilhados comigo (1)' },
                  { icon: <Building2 size={15} />, label: 'Geral · Acme (2)' },
                  { icon: <UsersRound size={15} className="text-[#2C64A8]" />, label: 'Produto (3)', on: false },
                  { icon: <Folder size={15} />, label: '· Lançamento (2)', on: true },
                ].map((x) => (
                  <div key={x.label} className={cn('od-menu-item flex items-center gap-2', x.on && 'bg-panel-hover')}>
                    {x.icon}
                    <span className="flex-1">{x.label}</span>
                    {x.on && <Check size={14} />}
                  </div>
                ))}
              </div>
            </div>
          </Block>
        </div>
      </Frame>

      <Frame title="Cartão de board e avisos da Mesa">
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div>
            <SubTitle>Cartão de board</SubTitle>
            <div className="w-[180px] rounded-2xl bg-panel p-2 ring-1 ring-line">
              <div className="od-dot-bg flex aspect-[4/3] items-center justify-center rounded-xl ring-1 ring-line">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-xs font-bold text-white">CP</span>
              </div>
              <div className="px-1.5 pb-1 pt-2">
                <div className="truncate text-[13px] font-semibold text-ink">Comece por aqui</div>
                <div className="text-xs text-ink-subtle">Meu espaço · há 2 h</div>
              </div>
            </div>
          </div>
          <Block title="Trazer boards deste navegador (Modo Servidor)" note="Faixa accent-soft na Mesa (só no Modo Servidor, com boards locais ainda não trazidos) e Modal 520 px com a lista do Modo Local: o motivo de cada recusa fica na própria linha (text-danger xs) e não interrompe os outros; já trazidos = pílula accent-soft. Destino em od-input com os lugares que can() permite.">
            <div className="space-y-3 rounded-2xl bg-panel p-5 ring-1 ring-line">
              <div className="flex flex-wrap items-center gap-2.5 rounded-xl bg-accent-soft px-3.5 py-2 text-[13px] text-ink ring-1 ring-line">
                <HardDriveUpload size={16} className="shrink-0 text-brand-800 dark:text-brand-200" />
                <span className="min-w-0 flex-1">Este navegador tem 3 boards do Modo Local que ainda não estão no servidor.</span>
                <span className="od-btn od-btn-secondary od-btn-sm h-7">Trazer boards deste navegador</span>
                <span className="od-btn od-btn-ghost od-btn-sm h-7">Agora não</span>
              </div>
              <ul className="space-y-0.5">
                <ImportRow name="Retro do time" meta="42 objetos · editado ontem" checked />
                <ImportRow name="Mapa da jornada" meta="18 objetos · editado há 3 dias" pill="Já está no servidor" />
                <ImportRow name="Arquivo de imagens" meta="9 objetos · editado em 02/11" problem="Não pode ir ao servidor: Uma imagem passa de 12 MB." />
                <ImportRow name="Kickoff" meta="27 objetos · editado hoje" problem="Não entrou: Você não pode criar boards neste lugar." alert />
              </ul>
            </div>
          </Block>
          <Block wide title="Confirmar e-mail (Modo Servidor com e-mail)" note="Mesma faixa accent-soft dos outros avisos da Mesa, com MailCheck. Só aparece com e-mail ligado no servidor e e-mail ainda não confirmado; não bloqueia nada. Depois de enviar, o texto troca pelo endereço e a validade do link (60 min). 'Agora não' esconde até reabrir o app.">
            <div className="space-y-1 rounded-2xl bg-panel p-5 ring-1 ring-line">
              <VerifyEmailBanner demo="idle" />
              <VerifyEmailBanner demo="sent" />
            </div>
          </Block>
          <Block wide title="Modo Local com servidor disponível" note="Mesma faixa accent-soft, com HardDrive e UM só botão secundário 'Entrar no servidor “<organização>”'. Fixa: sem 'Agora não'. Só no Modo Local com o servidor desta instalação disponível (e permitindo o Local); sem servidor, nada aparece. O botão grava o board aberto antes de trocar; se a gravação falhar, fica no Local com o aviso de erro.">
            <div className="rounded-2xl bg-panel p-5 ring-1 ring-line">
              <LocalModeBanner demo />
            </div>
          </Block>
        </div>
      </Frame>
    </>
  );
}

function ImportRow({ name, meta, checked, pill, problem, alert }: { name: string; meta: string; checked?: boolean; pill?: string; problem?: string; alert?: boolean }) {
  const enabled = !pill && !problem;
  return (
    <li className="flex items-start gap-3 rounded-lg px-3 py-2 text-sm hover:bg-panel-hover">
      <input type="checkbox" readOnly checked={!!checked && enabled} disabled={!enabled} className="mt-0.5 size-4 accent-[var(--od-selection)]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-ink">{name}</span>
        <span className="block text-xs text-ink-subtle">{meta}</span>
        {problem && <span className="mt-0.5 block text-xs text-danger">{problem}</span>}
      </span>
      {pill && (
        <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-ink">
          <Check size={12} /> {pill}
        </span>
      )}
      {alert && <CircleAlert size={15} className="mt-0.5 shrink-0 text-danger" />}
    </li>
  );
}
