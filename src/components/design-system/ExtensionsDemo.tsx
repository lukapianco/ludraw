import { ShieldAlert } from 'lucide-react';
import grafiteManifest from '../../extensions/builtin/tema-grafite/manifest.json';
import fluxogramaManifest from '../../extensions/builtin/formas-fluxograma/manifest.json';
import scrumManifest from '../../extensions/builtin/modelos-scrum/manifest.json';
import drawioManifest from '../../extensions/builtin/formatos-drawio/manifest.json';
import { ElevatedRiskNotice, PermissionList } from '../settings/ExtensionPermissions';
import { Cpu, Globe, RotateCcw } from 'lucide-react';
import type { InstallPreview } from '../../extensions/loader';
import { themeContrast } from '../../extensions/schema';
import { resolveParts } from '../../extensions/contributions/declarative';
import type { DeclPart, ExtensionManifest, ExtensionRecord } from '../../extensions/types';
import type { InstalledExtension } from '../../store/useExtensionsStore';
import type { CompositeElement } from '../../types/canvas';
import { scaleNormalizedPath, parsePathData, serializePath } from '../../utils/svgPath';
import { Toggle } from '../admin/adminUi';
import { DeclarativeElementView } from '../elements/DeclarativeElementView';
import { ExtensionCard, InstallSummary } from '../settings/ExtensionsManager';
import { Notice } from '../share/ShareBoardModal';
import { Block } from './dsKit';

/**
 * Design System › Telas e fluxos › Extensões: Gerenciador de Extensões. Ficha de extensão
 * (aberta, com licença/proveniência/hash), ficha com arquivo alterado, tela de aprovação da instalação,
 * Modo Seguro, o tema de exemplo "Grafite" com as razões de contraste medidas pelo validador, as formas
 * do Fluxograma e o elemento composto "Cartão de história". Usa os componentes REAIS
 * (`ExtensionsManager.tsx`, `DeclarativeElementView`) com dados das extensões embutidas; nenhum token novo.
 */
const grafite = grafiteManifest as unknown as ExtensionManifest;
const fluxograma = fluxogramaManifest as unknown as ExtensionManifest;
const scrum = scrumManifest as unknown as ExtensionManifest;
const drawio = drawioManifest as unknown as ExtensionManifest;
/** Manifest fictício só para mostrar o aviso de risco elevado e a rede (ui.panel + board.read + network). */
const risky = { ...drawio, id: 'dev.exemplo.painel', name: 'Painel de exemplo', permissions: ['board.read', 'ui.panel', 'network'], networkAllowlist: ['api.exemplo.com'] } as ExtensionManifest;

const demoRecord = (m: ExtensionManifest, over: Partial<ExtensionRecord> = {}): ExtensionRecord => ({
  id: m.id,
  name: m.name,
  version: m.version,
  publisher: m.publisher,
  kind: 'pack',
  source: 'builtin',
  dev: false,
  packageHash: '8dabffb5751d0c3e9a4f1b27c6d8e0a1f2b3c4d5e6f708192a3b4c5d6e7f8091',
  fileHashes: {},
  approvedPermissions: [],
  installedAt: Date.UTC(2026, 10, 8, 12, 0),
  updatedAt: Date.UTC(2026, 10, 8, 12, 0),
  installedBy: 'demo',
  enabled: true,
  ...over,
});

const okCard: InstalledExtension = { record: demoRecord(fluxograma), manifest: fluxograma, status: 'ok', builtin: true };
const tamperedCard: InstalledExtension = {
  record: demoRecord({ ...grafite, id: 'dev.exemplo.tema-claro', name: 'Tema de exemplo', publisher: 'Exemplo' }, { source: 'file', enabled: false }),
  manifest: null,
  status: 'tampered',
  problem: { key: 'extensions.status.tampered', params: { file: 'manifest.json' } },
  builtin: false,
};

const demoPreview: InstallPreview = {
  manifest: { ...scrum, id: 'dev.exemplo.modelos', name: 'Modelos de exemplo', publisher: 'Exemplo', i18n: undefined },
  pkg: { files: {}, fileHashes: {}, packageHash: 'a1b2c3d4e5f6a7b8c9d0', totalBytes: 0 },
  source: 'file',
  dev: false,
  shortHash: 'a1b2c3d4e5f6',
  existing: null,
  newPermissions: [],
  sameContent: false,
};

/** Normaliza (como o validador faz) para desenhar no Design System sem passar pelo loader. */
const normalize = (d: string) => serializePath(parsePathData(d));

function storyCard(): CompositeElement {
  const et = scrum.contributes!.elementTypes![0];
  const parts = resolveParts(et.parts.map((p): DeclPart => (p.kind === 'path' ? { ...p, d: normalize(p.d) } : p)), et.strings, 'pt-BR');
  const main = parts.find((p) => p.kind === 'text' && p.slot === 'main');
  const fields: Record<string, string> = {};
  for (const p of parts) if ((p.kind === 'text' || p.kind === 'badge') && p.slot && p.slot !== 'main') fields[p.slot] = p.text ?? '';
  return {
    id: 'ds-story', type: 'composite', x: 0, y: 0, width: 300, height: 184, rotation: 0, zIndex: 0, parentId: null, groupId: null, locked: false, opacity: 1, createdAt: 0, updatedAt: 0,
    typeRef: { extensionId: scrum.id, typeId: et.id }, typeName: et.name, parts, text: main && main.kind === 'text' ? main.text ?? '' : '', fields,
  } as CompositeElement;
}

export function ExtensionsDemo() {
  const theme = grafite.contributes!.themes![0];
  const shapes = fluxograma.contributes!.shapes!;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Block wide title="Ficha de extensão (aberta)" note="Lista vertical de fichas em Configurações → Extensões. Selos: Oficial (brand), Nível 1 · declarativo, dev (warning), Alterada/Inválida (warning), Ativa (brand). Detalhes mostram licença, origem, proveniência, permissões, contribuições, data e o hash curto com o aviso honesto sobre integridade. Diferença de mercado: sem loja — a ficha mostra a origem e o hash antes de ativar.">
        <ExtensionCard ext={okCard} locale="pt-BR" safe={false} defaultOpen />
      </Block>

      <Block title="Arquivo alterado após a instalação" note="Pinning: o hash gravado na instalação não confere ao carregar → ficha com contorno danger, selo Alterada, motivo traduzido e interruptor bloqueado. Também vai para o Audit Log.">
        <ExtensionCard ext={tamperedCard} locale="pt-BR" safe={false} />
      </Block>

      <Block wide title="Aprovação da instalação" note="Modal (480–560 px) antes de gravar: permissões (Nível 1 = nenhuma), licença, proveniência, o que traz e o hash de 12 caracteres em destaque (fonte mono, 15 px) para comparar com o publicado pelo autor. Atualização mostra versão anterior → nova e se o hash mudou; publisher diferente é bloqueado antes desta tela.">
        <div className="rounded-2xl bg-panel p-4 shadow-modal ring-1 ring-line">
          <div className="mb-3 text-[15px] font-bold text-ink">Instalar “Modelos de exemplo”?</div>
          <InstallSummary preview={demoPreview} />
        </div>
      </Block>

      <Block title="Modo Seguro" note="Toggle no cartão de política; ligado, o cartão vira warning-soft e todas as extensões saem dos registries sem desinstalar. `#/?safe=1` liga só naquela aba (aviso abaixo do toggle).">
        <div className="space-y-2">
          <div className="rounded-xl bg-warning-soft p-3.5 ring-1 ring-line">
            <Toggle checked onChange={() => undefined} label="Modo Seguro" hint="Desliga todas as extensões sem desinstalar nada." />
            <p className="mt-2 text-xs text-ink">Esta aba foi aberta com ?safe=1.</p>
          </div>
          <Notice tone="info">
            <span className="inline-flex items-center gap-1.5">
              <ShieldAlert size={14} /> Política do workspace aparece só para leitura aqui; a edição fica em Administração → Políticas.
            </span>
          </Notice>
        </div>
      </Block>

      <Block wide title="Tema de exemplo — Grafite" note="Só tokens da allowlist (superfícies, texto, acentos, seleção, semânticas, sombras, raios). Marca (brand-*), anel de foco e movimento ficam de fora: as faixas “Visualizando como…” e os selos de bloqueio protegido não mudam. Razões medidas pelo mesmo validador da instalação (mínimo 4,5:1 para texto; 3:1 para componente).">
        <div className="grid gap-3 md:grid-cols-2">
          {(['light', 'dark'] as const).map((mode) => {
            const tk = theme[mode];
            return (
              <div key={mode} className="overflow-hidden rounded-xl ring-1 ring-line" style={{ background: tk.canvas }}>
                <div className="m-3 rounded-lg p-3" style={{ background: tk.panel, boxShadow: tk['shadow-panel'] }}>
                  <div className="text-sm font-bold" style={{ color: tk.text }}>{mode === 'light' ? 'Claro' : 'Escuro'}</div>
                  <div className="text-xs" style={{ color: tk['text-muted'] }}>Texto secundário</div>
                  <div className="mt-2 flex gap-1.5">
                    <span className="rounded-md px-2 py-1 text-xs font-semibold" style={{ background: tk.accent, color: tk['accent-contrast'] }}>Primário</span>
                    <span className="rounded-md px-2 py-1 text-xs" style={{ background: tk['warning-soft'], color: tk.text }}>Aviso</span>
                    <span className="rounded-md px-2 py-1 text-xs" style={{ background: tk['danger-soft'], color: tk.danger }}>Erro</span>
                  </div>
                  <ul className="mt-2 space-y-0.5 font-mono text-2xs" style={{ color: tk['text-muted'] }}>
                    {themeContrast(tk).map((c) => (
                      <li key={`${c.fg}-${c.bg}`}>
                        {c.fg} / {c.bg}: {c.ratio}:1 {c.ok ? '✓' : '✗'}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </Block>

      <Block title="Formas do Fluxograma e Cartão de história" note="Formas de extensão aparecem na bandeja Formas do Dock, numa seção com o nome da extensão; o desenho fica copiado no elemento (customPath/customDecoration). O Cartão de história é um elemento composto (peças declarativas, sem JS de render), desenhado pela mesma geometria na tela e no export; texto principal editável por duplo clique.">
        <div className="flex flex-wrap gap-2 rounded-xl bg-canvas p-3">
          {shapes.map((s) => {
            const d = scaleNormalizedPath(normalize(s.path), s.viewBox.width, s.viewBox.height, 36, 26);
            const deco = s.decoration ? scaleNormalizedPath(normalize(s.decoration), s.viewBox.width, s.viewBox.height, 36, 26) : null;
            return (
              <span key={s.id} className="flex flex-col items-center gap-1 rounded-lg bg-panel px-2 py-1.5 text-2xs text-ink-muted ring-1 ring-line">
                <svg width="40" height="30" viewBox="-2 -2 40 30" aria-hidden="true">
                  <path d={d} fill="var(--od-panel)" stroke="currentColor" strokeWidth="1.4" />
                  {deco && <path d={deco} fill="none" stroke="currentColor" strokeWidth="1.4" />}
                </svg>
                {s.name}
              </span>
            );
          })}
        </div>
        <div className="relative mt-3 h-[184px] w-[300px]">
          <DeclarativeElementView element={storyCard()} isEditing={false} />
        </div>
      </Block>
      <Block wide title="Nível 2 — aprovação de permissões" note="Extensão programável (Worker isolado) pede permissões; a tela lista cada uma em linguagem simples, com o código da permissão em mono. network mostra os domínios EXATOS (ícone Globe em warning). ui.panel + board.read = risco elevado: faixa danger-soft e caixa de confirmação que libera o botão. Na ficha, cada permissão tem Revogar/Devolver (reinicia o Worker).">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl bg-panel p-4 shadow-modal ring-1 ring-line">
            <div className="mb-2 text-[15px] font-bold text-ink">Aprovar as permissões de “Formatos de diagrama abertos (.drawio)”?</div>
            <div className="rounded-xl bg-panel-sunken p-3.5 ring-1 ring-line">
              <PermissionList manifest={drawio} />
            </div>
          </div>
          <div className="space-y-3 rounded-2xl bg-panel p-4 shadow-modal ring-1 ring-line">
            <div className="rounded-xl bg-panel-sunken p-3.5 ring-1 ring-line">
              <PermissionList manifest={risky} approved={['board.read', 'ui.panel']} onToggle={() => undefined} />
            </div>
            <ElevatedRiskNotice manifest={risky} confirmed={false} onConfirm={() => undefined} />
          </div>
        </div>
      </Block>

      <Block title="Execução isolada e rede" note="Estado do Worker na ficha (Cpu): em execução, iniciando, parada ou encerrada com o motivo (timeout de 5 s, sem resposta, mensagens demais) e botão Reiniciar. Cada acesso à rede pelo host vira linha mono (recusado em danger) e um aviso “A extensão X acessou a rede: domínio” na 1ª vez da sessão.">
        <div className="space-y-2 rounded-xl bg-panel p-3.5 text-sm ring-1 ring-line">
          <div className="flex items-center gap-2 text-ink"><Cpu size={14} className="text-ink-muted" /> Em execução, isolada (Web Worker)</div>
          <div className="flex flex-wrap items-center gap-2 text-ink"><Cpu size={14} className="text-ink-muted" /> Encerrada: ela parou de responder (possível laço infinito) e foi encerrada.
            <button type="button" className="od-btn od-btn-ghost od-btn-sm"><RotateCcw size={14} /> Reiniciar</button>
          </div>
          <ul className="space-y-0.5 font-mono text-2xs text-ink-muted">
            <li className="flex items-center gap-1"><Globe size={11} /> api.exemplo.com · 08/11/2026, 12:45</li>
            <li className="text-danger">outro.com · 08/11/2026, 12:46 · recusado</li>
          </ul>
        </div>
      </Block>
    </div>
  );
}
