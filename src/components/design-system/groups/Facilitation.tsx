/**
 * Design System · 5. Facilitação e governança — cronômetro, votação e pódio; avisos do facilitador (Visualizar como…,
 * Modo Privado, seguir e conduzir). Tudo passa por can()/explain().
 */
import type { ReactNode } from 'react';
import { Eye, EyeOff, Medal, Pause, RotateCcw, ScanEye, Trophy, Users, Volume2, X } from 'lucide-react';
import { Block, Code, Frame } from '../dsKit';

export function Facilitation() {
  return (
    <>
      <Frame title="Cronômetro, votação e pódio">
        <div className="grid gap-6 lg:grid-cols-3">
          <Block wide title="Cronômetro flutuante" note="Anel de progresso --od-selection (vermelho no último minuto e no fim), contagem Figtree 800 24 tabular, controles do facilitador e som local. Música procedural: Lo-Fi, Ambient Pad, Focus Pulse.">
            <div className="flex h-[120px] items-center justify-center rounded-xl bg-canvas">
              <div className="od-panel flex items-center gap-2 py-1.5 pl-2 pr-1.5">
                <svg width="46" height="46" className="-rotate-90" aria-hidden="true">
                  <circle cx="23" cy="23" r="19" fill="none" stroke="var(--od-border)" strokeWidth="4" />
                  <circle cx="23" cy="23" r="19" fill="none" stroke="var(--od-selection)" strokeWidth="4" strokeLinecap="round" strokeDasharray={119.4} strokeDashoffset={42} />
                </svg>
                <div>
                  <div className="text-[24px] font-extrabold leading-none tabular-nums text-ink">03:12</div>
                  <div className="mt-1 text-[11px] font-semibold text-ink-subtle">Contando</div>
                </div>
                <span className="od-divider-v mx-0.5" />
                <span className="od-tool h-8 w-8"><Pause size={16} /></span>
                <span className="od-tool h-8 w-auto px-1.5 text-[12px] font-bold">+1</span>
                <span className="od-tool h-8 w-8"><RotateCcw size={15} /></span>
                <span className="od-divider-v mx-0.5" />
                <span className="od-tool h-8 w-auto gap-1 px-1.5 text-[11.5px] font-semibold"><Volume2 size={15} /> Lo-Fi</span>
                <span className="od-tool h-8 w-7"><X size={15} /></span>
              </div>
            </div>
          </Block>
          <Block title="Votação · selos de pontos" note="Anônima: cada pessoa vê só os próprios pontos (●, --od-selection). Sem anonimato ou após revelar: o total. Medalhas no 1º/2º/3º lugar.">
            <div className="flex h-[120px] items-center justify-center gap-5 rounded-xl bg-canvas">
              <div className="relative h-[72px] w-[72px] bg-[#FBED7C] shadow-panel">
                <span className="absolute right-1.5 top-1.5 flex h-6 items-center gap-[3px] rounded-full bg-panel px-1.5 shadow-pop ring-1 ring-selection">
                  <span className="h-2.5 w-2.5 rounded-full bg-selection" />
                  <span className="h-2.5 w-2.5 rounded-full bg-selection" />
                </span>
              </div>
              <div className="relative h-[72px] w-[72px] bg-[#AACAFF] shadow-panel">
                <span className="absolute right-1.5 top-1.5 flex items-center gap-1">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#E0A21B] text-white shadow-pop"><Trophy size={13} /></span>
                  <span className="flex h-6 items-center rounded-full bg-panel px-1.5 text-[12px] font-extrabold text-ink shadow-pop ring-1 ring-line">7</span>
                </span>
              </div>
            </div>
          </Block>
          <Block title="Pódio ao revelar" note="Degraus 1º (86 px) · 2º (62) · 3º (46) com ouro #E0A21B, prata #A9ADA8 e bronze #B07D0A; cada item leva a câmera até ele.">
            <div className="flex h-[120px] items-end justify-center gap-2 rounded-xl bg-canvas pb-0 pt-3">
              {[
                [2, 46, '#A9ADA8'],
                [1, 70, '#E0A21B'],
                [3, 36, '#B07D0A'],
              ].map(([place, h, color]) => (
                <span key={place} className="flex w-[64px] flex-col items-center rounded-t-lg pt-1 text-white" style={{ height: h as number, background: color as string }}>
                  <span className="text-[15px] font-extrabold leading-none">{place}º</span>
                  {place === 1 ? <Trophy size={12} className="mt-1" /> : <Medal size={12} className="mt-1" />}
                </span>
              ))}
            </div>
          </Block>
        </div>
        <p className="mt-4 text-xs text-ink-subtle">Abrem pela gaveta Facilitar (barra do topo); o tempo restante aparece ao lado da batuta.</p>
      </Frame>

      <Frame title="Avisos do facilitador">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-5">
            <div>
              <div className="mb-3 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">Visualizar como… (simulação de perfil)</div>
              <span className="inline-flex items-center gap-2.5 rounded-full bg-brand-900 py-1.5 pl-3.5 pr-1.5 text-[13px] font-semibold text-brand-100 shadow-pop dark:bg-brand-200 dark:text-brand-950">
                <ScanEye size={16} /> Visualizando como <strong>Visitante (leitor)</strong>
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-bold dark:bg-black/10">Sair da simulação</span>
              </span>
            </div>
            <div>
              <div className="mb-3 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">Modo Privado ativo</div>
              <span className="od-panel inline-flex items-center gap-2.5 py-1.5 pl-3.5 pr-1.5 text-[12.5px] text-ink-muted">
                <EyeOff size={15} className="text-brand-700 dark:text-brand-300" />
                <span>
                  <strong className="text-ink">Modo Privado ativo</strong> — Suas notas estão ocultas para os demais
                </span>
                <span className="od-btn od-btn-soft od-btn-sm h-7 px-2.5">Revelar notas</span>
              </span>
            </div>
          </div>
          <Block title="Seguir e conduzir" note="Faixa no topo do canvas (pílula do painel, shadow-md). Seguindo: Eye na cor de seleção; pausado (mexeu na tela): EyeOff e Voltar a seguir. Quem conduz vê quantas pessoas acompanham.">
            <div className="space-y-2 rounded-2xl bg-canvas p-4 ring-1 ring-line">
              <Banner icon={<Eye size={14} className="text-[var(--od-selection)]" />} text="Ana Souza está conduzindo — sua tela segue a dela" action="Sair do modo seguir" />
              <Banner icon={<EyeOff size={14} className="text-ink-subtle" />} text="Seguir em pausa — você mexeu na tela" primary="Voltar a seguir" action="Parar de seguir" />
              <Banner icon={<Users size={14} className="text-[var(--od-selection)]" />} text="Você está conduzindo a tela de 4 pessoas" action="Parar de conduzir" />
            </div>
          </Block>
        </div>
        <p className="mt-5 text-xs text-ink-subtle">Avisos ficam logo abaixo da barra do topo. 
          Toda checagem passa por <Code>can()</Code>/<Code>explain()</Code> em <Code>src/utils/permissions.ts</Code>; ações negadas mostram o motivo em toast. Local ≠ seguro: no Modo Servidor o servidor
          reaplica as mesmas regras.
        </p>
      </Frame>
    </>
  );
}

function Banner({ icon, text, action, primary }: { icon: ReactNode; text: string; action: string; primary?: string }) {
  return (
    <div className="flex w-fit items-center gap-2 rounded-full border border-[var(--od-panel-border)] bg-[var(--od-panel)] py-1 ps-3 pe-1 text-[12.5px] font-semibold text-ink shadow-md">
      {icon}
      <span>{text}</span>
      {primary && <span className="rounded-full bg-[var(--od-selection)] px-2.5 py-1 text-white">{primary}</span>}
      <span className="rounded-full px-2.5 py-1">{action}</span>
    </div>
  );
}
