/**
 * Design System · 8. Telas e fluxos — importar e exportar, administração do workspace, extensões, Modo Servidor,
 * e-mail e acesso (Chat 08.5) e a splash de abertura. Telas inteiras ou trechos delas com os componentes reais.
 */
import { useEffect, useState } from 'react';
import { ArrowRightLeft, Building2, Check, CheckCircle2, CirclePlay, Copy, HardDrive, KeyRound, Link2, Pause, Play, Server, ShieldAlert, Users, Wand2, X } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { PersonCell, StatusPill, Tag, Toggle } from '../../admin/adminUi';
import { SetupView } from '../../setup/SetupView';
import { MustChangePassword } from '../../auth/ChangePasswordForm';
import { ForgotPasswordView, ResetPasswordView, VerifyEmailView } from '../../auth/EmailAccessViews';
import { MailSettingsSection } from '../../admin/MailSettings';
import { MailPreviews } from '../MailPreviews';
import { AccessConfirmView, JoinView, RequestAccessView, SignupCompleteView, SignupRequestView } from '../../auth/AccessViews';
import { AccessRequestsSection, InviteLinksSection } from '../../admin/AccessAdmin';
import { ContinueLocalCard } from '../../auth/ContinueLocalCard';
import { DesktopPlaceCard, type ServerStep } from '../../desktop/DesktopPlaceCard';
import type { MailSettingsView } from '../../../utils/apiContract';

/* Chat 09.1 · R7: estados do cartão do programa desktop (dados fictícios) */
const DS_DESKTOP_STEPS: { title: string; note: string; url: string; step: ServerStep }[] = [
  { title: 'Primeiro uso', note: 'As duas opções lado a lado; nada é testado sozinho.', url: '', step: { step: 'idle' } },
  {
    title: 'Servidor encontrado',
    note: 'O que o servidor oferece aparece antes de mudar: organização, login da empresa e onde ele abre.',
    url: 'https://draw.example.com',
    step: {
      step: 'ok',
      info: { name: 'ludraw', version: '0.9.0', apiVersion: 1, setupRequired: false, mode: 'single_org', organizationName: 'Empresa Exemplo', sso: { enabled: true, label: 'Login da Empresa' }, registration: 'invite_only', localMode: 'blocked', ssoOrigin: 'https://login.example.com' },
    },
  },
  { title: 'Servidor lembrado, abrindo', note: 'Na abertura do programa; dá para escolher outra opção a qualquer momento.', url: 'https://draw.example.com', step: { step: 'connecting', host: 'draw.example.com' } },
  { title: 'Certificado próprio não confiável', note: 'Linguagem clara, o que fazer para quem usa e para quem cuida do servidor; nunca ensina a ignorar o aviso.', url: 'https://draw.example.com', step: { step: 'problem', problem: 'certificate' } },
];

/* Chat 08.5 · B2: estados do cartão de e-mail (dados fictícios; a senha nunca aparece) */
const DS_MAIL_BASE: MailSettingsView = {
  active: false,
  source: 'none',
  enabled: false,
  enabledLocked: false,
  values: { host: null, port: null, security: null, user: null, from: null },
  locked: { host: false, port: false, security: false, user: false, password: false, from: false },
  passwordSet: false,
  passwordUnreadable: false,
  canStorePassword: false,
  appUrlMissing: false,
  serverOnly: false,
  allowPrivateHost: false,
  problem: 'off',
};
const DS_MAIL_EMPTY = DS_MAIL_BASE;
const DS_MAIL_PANEL: MailSettingsView = {
  ...DS_MAIL_BASE,
  active: true,
  source: 'panel',
  enabled: true,
  values: { host: 'smtp.empresa.com', port: 587, security: 'starttls', user: 'ludraw@empresa.com', from: 'LuDraw <nao-responda@empresa.com>' },
  passwordSet: true,
  canStorePassword: true,
  problem: null,
};
const DS_MAIL_MIXED: MailSettingsView = {
  ...DS_MAIL_PANEL,
  source: 'mixed',
  enabledLocked: true,
  values: { host: 'smtp.empresa.com', port: 465, security: 'tls', user: 'ludraw@empresa.com', from: 'LuDraw <nao-responda@empresa.com>' },
  locked: { host: true, port: true, security: true, user: false, password: false, from: true },
};

const DS_NOW = Date.UTC(2026, 10, 12, 15, 0);
const DS_REQUESTS = [
  { id: 'r1', kind: 'email' as const, email: 'caio@empresa.com', name: 'Caio Silva', message: 'Sou do time de vendas e preciso dos boards do Q3.', status: 'pending' as const, emailConfirmed: true, existingAccount: false, createdAt: DS_NOW - 2 * 3600_000 },
  { id: 'r2', kind: 'link' as const, inviteLinkId: 'l1', email: 'dora@empresa.com', name: 'Dora Lima', status: 'pending' as const, emailConfirmed: false, existingAccount: false, createdAt: DS_NOW - 26 * 3600_000 },
  { id: 'r3', kind: 'email' as const, email: 'ana@empresa.com', name: 'Ana', status: 'pending' as const, emailConfirmed: false, existingAccount: true, createdAt: DS_NOW - 50 * 3600_000 },
];
const DS_LINKS = [
  { id: 'l1', role: 'member' as const, allowedDomain: 'empresa.com', maxUses: 25, uses: 7, createdBy: 'ana', createdAt: DS_NOW - 3 * 86400_000, expiresAt: DS_NOW + 27 * 86400_000 },
  { id: 'l2', role: 'guest_b2b' as const, projectId: 'p', boardRole: 'commenter' as const, maxUses: 5, uses: 5, createdBy: 'ana', createdAt: DS_NOW - 9 * 86400_000, expiresAt: DS_NOW + 86400_000 },
  { id: 'l3', role: 'member' as const, maxUses: 10, uses: 2, createdBy: 'ana', createdAt: DS_NOW - 40 * 86400_000, expiresAt: DS_NOW - 10 * 86400_000, revokedAt: DS_NOW - 12 * 86400_000 },
];
import { SplashScreen } from '../../splash/SplashScreen';
import { SPLASH_MIN_MS } from '../../splash/useSplashGate';
import { Block, Code, Frame } from '../dsKit';
import { ImportExportDemo } from '../ImportExportDemo';
import { ExtensionsDemo } from '../ExtensionsDemo';

export function Flows() {
  return (
    <>
      <Frame title="Importar e exportar">
        <ImportExportDemo />
      </Frame>

      <Frame title="Administração do workspace">
        <div className="grid gap-6 lg:grid-cols-3">
          <Block wide title="Membros · status, papel e último administrador" note="Tabela em anel ring-line; status em pílulas (success-soft / warning-soft / panel-sunken). O select de papel do último administrador ativo fica desabilitado com o motivo de explain() no title. Ações destrutivas pedem 2 cliques (ConfirmButton vira od-btn-danger por 4 s).">
            <div className="overflow-hidden rounded-xl bg-panel ring-1 ring-line">
              {[
                { name: 'Ana Prado', email: 'ana@acme.com', color: '#194B32', role: 'Administrador', status: 'active' as const, you: true, locked: true },
                { name: 'Bruno Reis', email: 'bruno@acme.com', color: '#C2412D', role: 'Membro', status: 'suspended' as const },
                { name: 'Pessoa removida 7F2A', email: undefined, color: '#8A8F98', role: 'Membro', status: 'removed' as const },
              ].map((m) => (
                <div key={m.name} className="flex flex-wrap items-center gap-3 border-t border-line px-3.5 py-2.5 first:border-t-0">
                  <div className="min-w-[180px] flex-1">
                    <PersonCell name={m.name} email={m.email} color={m.color} extra={m.you ? <Tag tone="brand">você</Tag> : undefined} />
                  </div>
                  <select className="od-input h-8 w-[140px] text-[12.5px]" disabled={m.locked} title={m.locked ? 'Esta é a última conta de administrador ativa.' : undefined} defaultValue={m.role}>
                    <option>{m.role}</option>
                  </select>
                  <StatusPill status={m.status} />
                  <button type="button" className="od-btn od-btn-ghost od-btn-sm h-8" disabled={m.locked}><Pause size={14} /> Suspender</button>
                  <button type="button" className="od-btn od-btn-danger od-btn-sm h-8">Remover e anonimizar?</button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-ink ring-1 ring-line">
              <ShieldAlert size={17} /> Só existe 1 administrador ativo. Promova outra pessoa para não perder o acesso.
            </div>
          </Block>
          <Block title="Domínios em chips e interruptores" note="Chips bg-panel + ring-line com X; entrada sem borda no fim da faixa (Enter ou vírgula adiciona). Toggle = linha com título, dica e role=switch.">
            <div className="space-y-2 rounded-xl bg-canvas p-3">
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-panel-sunken p-2 ring-1 ring-line">
                {['acme.com', 'acme.com.br'].map((d) => (
                  <span key={d} className="inline-flex items-center gap-1 rounded-full bg-panel px-2.5 py-1 text-[12.5px] font-semibold text-ink ring-1 ring-line">@{d} <X size={13} className="text-ink-subtle" /></span>
                ))}
                <span className="px-1.5 text-[13px] text-ink-subtle">empresa.com.br e Enter</span>
              </div>
              <div className="rounded-xl bg-panel px-3 ring-1 ring-line">
                <Toggle checked label="Permitir links públicos" hint="Desligado: o Compartilhar não oferece link." onChange={() => undefined} />
              </div>
            </div>
          </Block>
          <Block wide title="Compartilhar · abas-cartão e link público" note="Segmento bg-panel-sunken com 3 abas (Pessoas · Facilitadores · Link público). Interruptor role=switch em --od-accent. O aviso da senha local (ShieldAlert, ink-subtle) aparece sempre abaixo da senha. Download respeita a política como teto: desabilitado com a frase da política.">
            <div className="rounded-2xl bg-panel p-4 shadow-modal">
              <div className="mb-3 flex gap-1 rounded-xl bg-panel-sunken p-1 ring-1 ring-line">
                {[{ i: <Users size={15} />, l: 'Pessoas' }, { i: <Wand2 size={15} />, l: 'Facilitadores' }, { i: <Link2 size={15} />, l: 'Link público', on: true }].map((x) => (
                  <span key={x.l} className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[13px] font-semibold', x.on ? 'bg-panel text-ink shadow-panel' : 'text-ink-muted')}>{x.i} {x.l}</span>
                ))}
              </div>
              <div className="flex items-center justify-between rounded-xl bg-panel-sunken px-3.5 py-3 ring-1 ring-line">
                <div>
                  <div className="text-sm font-semibold text-ink">Link público de visitante</div>
                  <div className="text-xs text-ink-muted">Ativo até 14/11/2026, 10:00</div>
                </div>
                <span className="relative h-6 w-11 rounded-full bg-accent"><span className="absolute start-[22px] top-0.5 h-5 w-5 rounded-full bg-white shadow" /></span>
              </div>
              <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-subtle"><ShieldAlert size={13} className="mt-0.5" /> No modo local, a senha só protege de verdade quando houver servidor.</p>
              <div className="mt-3 flex gap-2">
                <input className="od-input h-9 flex-1 font-mono text-[12px]" readOnly value="…/#/board/x1y2?share=Qk3…" />
                <button type="button" className="od-btn od-btn-primary h-9"><Copy size={15} /> Copiar</button>
              </div>
            </div>
          </Block>
          <Block title="Transferência em 4 passos" note="Passos em pílulas (atual = bg-accent-soft + ring-selection; concluído = círculo --od-accent com Check). Escolhas em linhas role=radio; prévia com checkboxes em accent.">
            <div className="space-y-3 rounded-xl bg-canvas p-3">
              <ol className="flex flex-wrap gap-2">
                {['Quem sai', 'Quem recebe', 'Prévia', 'Confirmar'].map((l, i) => (
                  <li key={l} className={cn('flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold ring-1', i === 2 ? 'bg-accent-soft text-ink ring-selection' : i < 2 ? 'bg-panel text-ink ring-line' : 'bg-panel text-ink-subtle ring-line')}>
                    <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[11px]', i < 2 ? 'bg-accent text-[var(--od-accent-contrast)]' : 'bg-panel-sunken')}>{i < 2 ? <Check size={12} /> : i + 1}</span>
                    {l}
                  </li>
                ))}
              </ol>
              <div className="flex items-center gap-3 rounded-xl bg-panel px-3.5 py-2.5 ring-1 ring-line text-sm">
                <ArrowRightLeft size={16} className="text-brand-800 dark:text-brand-200" /> 12 boards passam de Bruno Reis para Ana Prado.
              </div>
            </div>
          </Block>
        </div>
        <p className="mt-6 text-xs leading-relaxed text-ink-subtle">
          Estrutura da organização (times, projetos, papéis, convites, políticas, transferência, lixeira e auditoria) só se gerencia em <Code>#/admin</Code> e no seletor de espaço, sempre por <Code>can()</Code> com as ações <Code>workspace.*</Code>.
        </p>
      </Frame>

      <Frame title="Extensões">
        <ExtensionsDemo />
      </Frame>

      <Frame title="Modo Servidor">
        <div className="grid gap-8 lg:grid-cols-2">
          <Block title="Primeiro acesso (#/setup)" note="Cartão central como AccessSuspended; pílulas de passo do assistente de transferência (atual accent-soft + ring-selection, concluído com círculo bg-accent). Só aparece com o banco vazio; o servidor responde 404 depois.">
            <div className="h-[760px] overflow-auto rounded-2xl ring-1 ring-line">
              <SetupView />
            </div>
          </Block>
          <div className="grid content-start gap-8">
            <Block title="Troca de senha obrigatória" note="Bloqueia o app sem mostrar dado nenhum da organização até trocar (conta da CLI, do bootstrap ou senha redefinida).">
              <div className="h-[560px] overflow-auto rounded-2xl ring-1 ring-line">
                <MustChangePassword />
              </div>
            </Block>
            <Block title="Entrada no Modo Servidor" note="Selo do servidor sob o título, convite obrigatório e o botão do login da empresa (SSO) antes do e-mail e senha.">
              <div className="space-y-3 rounded-2xl bg-panel p-5 ring-1 ring-line">
                <p className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-brand-800 ring-1 ring-line dark:text-brand-200">
                  <Building2 size={13} /> Servidor: Empresa Exemplo
                </p>
                <div className="rounded-xl bg-accent-soft px-3.5 py-3 text-sm text-ink ring-1 ring-line">Este servidor só aceita novas contas por convite.</div>
                <span className="od-btn od-btn-secondary od-btn-lg w-full">
                  <KeyRound size={17} /> Entrar com Login da Empresa
                </span>
              </div>
            </Block>
            <Block title="Conexão (Configurações → Sessão)" note="O teste de conexão mostra o que o servidor oferece antes de trocar de modo; trocar recarrega o app sem misturar dados.">
              <div className="space-y-3 rounded-2xl bg-panel p-5 ring-1 ring-line">
                <div className="flex items-center gap-2 rounded-xl bg-panel-sunken px-3 py-2.5 text-sm text-ink ring-1 ring-line">
                  <HardDrive size={16} className="text-ink-muted" /> Modo Local — dados só neste navegador
                </div>
                <div className="rounded-xl bg-accent-soft px-3.5 py-3 text-sm text-ink ring-1 ring-line">
                  <p className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 size={16} className="text-brand-700 dark:text-brand-300" /> Conectado a “Empresa Exemplo” · LuDraw 0.9.0
                  </p>
                  <p className="mt-1 text-ink-muted">Login da empresa disponível: Login da Empresa</p>
                </div>
                <span className="od-btn od-btn-primary">
                  <Server size={16} /> Conectar
                </span>
              </div>
            </Block>
          </div>
        </div>
      </Frame>

      <Frame title="Aplicativo desktop">
        <p className="mb-5 max-w-3xl text-sm text-ink-muted">
          Tela “onde trabalhar” do programa (Chat 09.1 · R7), na janela de escolha — a única com permissão de falar com o programa. O board abre em outra janela, sem permissão nenhuma. Cada problema de conexão tem título, explicação e o que fazer: endereço inválido, endereço não encontrado, servidor que não respondeu, certificado não confiável, endereço que não é LuDraw e versões diferentes. Em que difere do padrão de mercado: nenhuma conta nem nuvem obrigatória; as duas opções ficam lado a lado e o servidor mostra o que oferece antes de a pessoa mudar.
        </p>
        <div className="grid gap-8">
          {DS_DESKTOP_STEPS.map((x) => (
            <Block key={x.title} title={x.title} note={x.note}>
              <DesktopPlaceCard heading="h3" url={x.url} step={x.step} onUrl={() => undefined} onLocal={() => undefined} onTest={() => undefined} onConnect={() => undefined} onCancel={() => undefined} />
            </Block>
          ))}
        </div>
      </Frame>

      <Frame title="E-mail e acesso">
        <p className="mb-3 max-w-3xl text-sm text-ink-muted">
          Chat 08.5 inteiro. O e-mail é opcional: sem SMTP o servidor funciona como antes (convite por link, senha redefinida pela administração). Com e-mail, entram a recuperação de senha, a confirmação do e-mail, os convites por e-mail, o link de convite geral, os pedidos de acesso e o cadastro com o e-mail da organização. As telas sem conta usam o mesmo casco da entrada (AuthShell: painel da marca + coluna central de 400 px) e a guarda do primeiro acesso (trocar de aba não volta para #/login); o token do link sai do endereço antes de qualquer requisição e a tela usa Referrer-Policy no-referrer. As respostas públicas nunca revelam se um e-mail tem conta.
        </p>
        <p className="mb-5 max-w-3xl text-sm text-ink-muted">
          Onde está cada peça: telas de senha e confirmação e o painel de envio (aqui) · e-mails (frame E-mails) · convites, link geral, pedidos e cadastro pelo domínio (frame Convites) · faixas da Mesa (Mesa › Cartão de board e avisos) · selo e aviso do Modo Local (Estúdio › Selos de estado). Em que difere do padrão de mercado: a recuperação e a confirmação acontecem no próprio casco de duas colunas da entrada, não numa página de serviço separada.
        </p>
        <div className="grid gap-8 xl:grid-cols-2">
          <Block title="Esqueci a senha (#/forgot) · resposta neutra" note="A resposta é a mesma exista ou não a conta (o servidor responde antes de procurar). Sem e-mail no servidor, o link da entrada continua abrindo o aviso antigo.">
            <div className="h-[560px] overflow-auto rounded-2xl ring-1 ring-line">
              <ForgotPasswordView demo="sent" />
            </div>
          </Block>
          <Block title="Criar nova senha (#/reset)" note="Mesma regra de força da troca de senha; salvar encerra todas as sessões e derruba o tempo real da conta. Link vencido ou usado mostra a variante 'Este link não vale mais' com 'Pedir novo link'.">
            <div className="h-[560px] overflow-auto rounded-2xl ring-1 ring-line">
              <ResetPasswordView demo="form" />
            </div>
          </Block>
          <Block title="Link que não vale mais" note="Vencido, usado, substituído por um pedido mais novo ou recarregado (o token não sobrevive à recarga, de propósito).">
            <div className="h-[460px] overflow-auto rounded-2xl ring-1 ring-line">
              <ResetPasswordView demo="invalid" />
            </div>
          </Block>
          <Block title="E-mail confirmado (#/verify)" note="O token basta: abre em outro navegador, sem sessão. Com sessão, 'Continuar' leva à Mesa.">
            <div className="h-[460px] overflow-auto rounded-2xl ring-1 ring-line">
              <VerifyEmailView demo="ok" />
            </div>
          </Block>
          <Block title="Entrada do servidor: o que o 08.5 acrescenta" note="Regra 9: só estes itens mudaram no Login, e cada um aparece apenas quando a condição vale. Com nada ligado, o Login é idêntico ao do Chat 07 (conferido por captura).">
            <ul className="space-y-2.5 rounded-2xl bg-panel p-5 text-sm text-ink ring-1 ring-line">
              <li><strong>Esqueci minha senha</strong> → #/forgot <span className="text-ink-muted">— com e-mail no servidor (sem ele, o aviso antigo)</span></li>
              <li><strong>Pedir acesso</strong> <span className="text-ink-muted">— link sublinhado na caixa do convite, com a política “Aceitar pedidos de acesso”</span></li>
              <li><strong>Criar conta com o e-mail da organização</strong> <span className="text-ink-muted">— logo abaixo, só com o cadastro pelo domínio ATIVO (política + e-mail + domínio)</span></li>
              <li><strong>Usar só neste navegador (sem sincronizar)</strong> <span className="text-ink-muted">— botão discreto + linha de dica, só com o Modo Local permitido pelo servidor</span></li>
            </ul>
          </Block>
          <Block title="Continuar sem conta (entrada do Modo Local)" note="Chat 08.5 · D. Cartão de opção na largura da coluna: ícone HardDrive em quadrado accent-soft 36 px, título 15 px semibold, linha text-xs ink-muted 'Só neste navegador, sem sincronizar' e seta ink-subtle que anda 2 px no hover. Substitui o botão de uma linha, que com o texto novo alargava a coluna.">
            <div className="rounded-2xl bg-panel p-5 ring-1 ring-line">
              <div className="mx-auto max-w-[400px] space-y-1.5">
                <ContinueLocalCard demo />
                <p className="text-center text-xs text-ink-subtle">Sem conta você fica num espaço isolado, só com os seus boards.</p>
              </div>
            </div>
          </Block>
          <Block wide title="Administração → Políticas → Envio de e-mail · vazio" note="Chat 08.5 · B2. Cartão próprio (salva à parte das políticas: o SMTP é do servidor). Sem LUDRAW_JWT_SECRET o campo de senha fica travado com a explicação; só um SMTP sem autenticação funciona.">
            <MailSettingsSection demo={DS_MAIL_EMPTY} />
          </Block>
          <Block wide title="Envio de e-mail · configurado pelo painel" note="Senha nunca volta do servidor: só 'Definida — deixe em branco para manter' e 'Remover senha'. Ligado: botão de teste (vai para o e-mail de quem clicou; limite próprio; registra no Audit Log).">
            <MailSettingsSection demo={DS_MAIL_PANEL} />
          </Block>
          <Block wide title="Envio de e-mail · variáveis + painel" note="Variável vence campo a campo: o campo fica travado com o selo 'definido pelo servidor'. Com LUDRAW_SMTP_HOST o interruptor fica sempre ligado.">
            <MailSettingsSection demo={DS_MAIL_MIXED} />
          </Block>
        </div>
      </Frame>

      <Frame title="E-mails">
        <p className="mb-5 max-w-3xl text-sm text-ink-muted">
          Chat 08.5 · B2. Prévia real (mesmo montador do servidor, `composeMail`). Faixa da marca no topo — no e-mail ela vai como PNG embutido na própria mensagem (nada externo); aqui aparece em SVG. Etiqueta, título, frase com quem e onde, botão que funciona no Outlook, endereço para copiar, nota de segurança com filete pistache e rodapé fora do cartão. Em que difere do padrão de mercado: cada e-mail parece um pedaço do quadro (grade de pontos, trilha do logo, post-its), não um cartão genérico.
        </p>
        <MailPreviews />
      </Frame>

      <Frame title="Convites, link geral e pedidos de acesso">
        <p className="mb-5 max-w-3xl text-sm text-ink-muted">
          Modo Servidor. As telas sem conta usam o casco da entrada e a guarda do primeiro acesso; o token do link sai do endereço ao abrir. A resposta nunca revela se um e-mail já tem conta. Nenhum pedido leva senha: aprovar gera um convite. Em que difere do padrão de mercado: link e pedido terminam na mesma tela neutra de "recebido", e a administração decide dentro da lista de Membros, sem página própria.
        </p>
        <div className="grid gap-8 xl:grid-cols-2">
          <Block title="Link de convite geral (#/join) · com e-mail" note="Prévia do link (organização, papel, domínio). Com e-mail no servidor só pede o e-mail; a conta nasce ao abrir o link recebido.">
            <div className="h-[560px] overflow-auto rounded-2xl ring-1 ring-line">
              <JoinView demo="email" />
            </div>
          </Block>
          <Block title="Link de convite geral · sem e-mail no servidor" note="Pede nome e e-mail (nunca senha) e vira pedido na fila; a resposta é a mesma para quem já tem conta.">
            <div className="h-[560px] overflow-auto rounded-2xl ring-1 ring-line">
              <JoinView demo="sent-approval" />
            </div>
          </Block>
          <Block title="Concluir cadastro (#/signup)" note="E-mail travado (veio do link), nome e senha com a regra de força; ao concluir, já entra na Mesa.">
            <div className="h-[620px] overflow-auto rounded-2xl ring-1 ring-line">
              <SignupCompleteView demo="form" />
            </div>
          </Block>
          <Block title="Criar conta com o e-mail da organização (#/register)" note="Chat 08.5 · C. Só com a política ativa (e-mail + domínio + uma organização); o Login mostra o link logo abaixo de 'Pedir acesso'. Só o e-mail — a tela NUNCA mostra os domínios aceitos, e a resposta é a mesma faixa neutra para qualquer endereço. A conclusão é a mesma tela do link geral, como membro.">
            <div className="h-[560px] overflow-auto rounded-2xl ring-1 ring-line">
              <SignupRequestView demo="form" />
            </div>
          </Block>
          <Block title="Cadastro pedido (resposta neutra)" note="Domínio fora, conta existente, pessoa removida ou teto do dia: a tela e a resposta do servidor são idênticas.">
            <div className="h-[560px] overflow-auto rounded-2xl ring-1 ring-line">
              <SignupRequestView demo="sent" />
            </div>
          </Block>
          <Block title="Pedir acesso (#/request-access)" note="Só com a política ligada; o Login mostra 'Não tem convite? Pedir acesso' na caixa do convite. Mensagem opcional de até 500 caracteres.">
            <div className="h-[620px] overflow-auto rounded-2xl ring-1 ring-line">
              <RequestAccessView demo="form" />
            </div>
          </Block>
          <Block title="Pedido confirmado (#/access)" note="O token do e-mail põe o pedido na fila; sem confirmação ele some em 24 h.">
            <div className="h-[420px] overflow-auto rounded-2xl ring-1 ring-line">
              <AccessConfirmView demo="ok" />
            </div>
          </Block>
          <Block title="Cadastro: link que não vale mais" note="Vencido, usado ou link geral desativado/esgotado.">
            <div className="h-[420px] overflow-auto rounded-2xl ring-1 ring-line">
              <SignupCompleteView demo="invalid" />
            </div>
          </Block>
          <Block wide title="Administração → Membros · Pedidos de acesso" note="Selos: e-mail confirmado (accent) ou não confirmado (warning), 'pelo link de …' e 'já tem conta' (aprovar só fecha). Aprovar abre o papel (membro ou convidado), times/escopo, validade e 'Enviar o convite por e-mail'.">
            <AccessRequestsSection demo={DS_REQUESTS} />
          </Block>
          <Block wide title="Administração → Membros · Links de convite" note="Usos x/máx em números tabulares; ativo (accent), esgotado ou vencido (warning), desativado (neutro). O endereço aparece só na criação, com o aviso 'Copie agora'.">
            <InviteLinksSection demo={DS_LINKS} />
          </Block>
        </div>
      </Frame>

      <Frame title="Splash de abertura">
        <SplashDemo />
      </Frame>
    </>
  );
}

type SplashDemoMode = 'static' | 'intro' | 'open' | 'reduced';

/** Splash estática + "Reproduzir" (gota → desenho) + abertura completa do app (rebobina → íris). */
function SplashDemo() {
  const [run, setRun] = useState<{ key: number; mode: SplashDemoMode }>({ key: 0, mode: 'static' });
  const [ready, setReady] = useState(false);
  const [exited, setExited] = useState(false);

  useEffect(() => {
    setExited(false);
    setReady(run.mode === 'intro');
    if (run.mode !== 'open' && run.mode !== 'reduced') return;
    const t = window.setTimeout(() => setReady(true), SPLASH_MIN_MS);
    return () => window.clearTimeout(t);
  }, [run]);

  const play = (mode: SplashDemoMode) => setRun((r) => ({ key: r.key + 1, mode }));
  const leaves = run.mode === 'open' || run.mode === 'reduced';

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="relative h-[340px] overflow-hidden rounded-xl ring-1 ring-line" style={{ background: 'var(--od-app-bg)' }}>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-ink-subtle">
          <span>App carregado por baixo da splash</span>
          <button type="button" className="od-btn od-btn-sm od-btn-secondary" onClick={() => setRun((r) => ({ key: r.key + 1, mode: 'static' }))}>
            Voltar à splash
          </button>
        </div>
        {!exited && (
          <SplashScreen
            key={run.key}
            contained
            mode={run.mode === 'intro' ? 'intro' : 'rewind'}
            reduceMotion={run.mode === 'static' || run.mode === 'reduced' ? true : undefined}
            ready={ready}
            stayOnSettle={!leaves}
            onExited={() => setExited(true)}
          />
        )}
      </div>
      <div className="flex flex-col gap-3 text-sm text-ink-muted">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="od-btn od-btn-sm od-btn-primary" onClick={() => play('intro')}>
            <Play size={14} /> Reproduzir
          </button>
          <button type="button" className="od-btn od-btn-sm od-btn-secondary" onClick={() => play('open')}>
            <CirclePlay size={14} /> Abertura do app
          </button>
          <button type="button" className="od-btn od-btn-sm od-btn-ghost" onClick={() => play('reduced')}>
            Com “Reduzir movimento”
          </button>
        </div>
        <ol className="list-decimal space-y-1.5 pl-4 text-[13px]">
          <li><b className="text-ink">Boot estático</b> em <Code>index.html</Code>: logo completo antes do React (sem flash branco).</li>
          <li><b className="text-ink">Rebobina:</b> a bolinha dá um pulinho, recolhe o traço com inércia e quica no início (respingos).</li>
          <li><b className="text-ink">Redesenha:</b> a mola puxa a bolinha pela curva; ao soltar, respingos de tinta saem na direção do lançamento.</li>
          <li><b className="text-ink">Encaixa:</b> o ladrilho sente o impacto, um anel se abre e uma onda atravessa a grade de pontos.</li>
          <li><b className="text-ink">Íris:</b> o canvas se abre a partir do logo (420 ms, <Code>ease-out</Code>) e revela o app.</li>
        </ol>
        <p className="text-xs text-ink-subtle">
          “Reproduzir” mostra o modo <Code>intro</Code> (o ladrilho nasce de uma gota). Cores: <Code>--od-canvas</Code>, <Code>--od-canvas-dot</Code>, <Code>--od-selection</Code>, <Code>--od-accent</Code>, marca{' '}
          <Code>#194B32</Code> + <Code>#D0E4AE</Code>. Mínimo 1,1 s, failsafe 4 s. Código: <Code>components/splash/</Code>, <Code>utils/logoAnimation.ts</Code>, <Code>utils/splashField.ts</Code>.
        </p>
      </div>
    </div>
  );
}
