import { useMemo } from 'react';
import { Check, CircleAlert, FileSpreadsheet, Info, TriangleAlert } from 'lucide-react';
import { ExportIcon, KanbanIcon, StickyIcon, TableIcon } from '../icons/od';
import type { ShapeElement } from '../../types/canvas';
import { importSvgMarkup } from '../../utils/svgImport';
import { ShapeView } from '../elements/ShapeView';
import { cn } from '../../utils/cn';
import { Block } from './dsKit';

const DEMO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 110">
  <rect x="6" y="20" width="70" height="44" rx="10" fill="#D0E4AE" stroke="#194B32" stroke-width="2"/>
  <path d="M120 14 L136 46 L172 50 L145 72 L152 106 L120 88 L88 106 L95 72 L68 50 L104 46 Z" fill="#FFF6A5" stroke="#A66A12" stroke-width="2"/>
  <circle cx="195" cy="42" r="18" fill="#E3EDF9" stroke="#2C64A8" stroke-width="2"/>
</svg>`;

/**
 * Design System › Telas e fluxos › Importar e exportar: Exportar (formato · escopo · resumo), Importar planilha
 * (prévia + destino), aviso de limite, confirmação acima de 500 itens, Inspetor de colagem e
 * formas importadas de SVG desenhadas pela View real (`ShapeView` com `customPath`).
 */
export function ImportExportDemo() {
  const shapes = useMemo(() => importSvgMarkup(DEMO_SVG).elements.filter((e): e is ShapeElement => e.type === 'shape'), []);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Block title="Exportar · formato, escopo e resumo vivo" note="Formatos vêm do ExporterRegistry (as extensões entram sozinhas). Cartão escolhido: bg-accent-soft + anel 2 px --od-selection. Escopo em segmento bg-panel-sunken (opções que o formato não usa ficam a 40 %). Resumo com Info antes do botão primário.">
        <div className="space-y-1.5 rounded-xl bg-canvas p-3">
          {[
            { label: 'SVG vetorial', ext: 'svg', on: false },
            { label: 'PDF — multipáginas por frames', ext: 'pdf', on: true },
            { label: 'CSV de issues (rastreadores)', ext: 'csv', on: false },
          ].map((f) => (
            <div key={f.label} className={cn('rounded-xl px-3 py-2 ring-1', f.on ? 'bg-accent-soft ring-2 ring-selection' : 'bg-panel ring-line')}>
              <span className="flex items-center justify-between text-[12.5px] font-semibold text-ink">
                {f.label} <span className="font-mono text-2xs text-ink-subtle">.{f.ext}</span>
              </span>
            </div>
          ))}
          <div className="mt-2 flex gap-1 rounded-lg bg-panel-sunken p-1 ring-1 ring-line text-[12px] font-semibold">
            <span className="flex-1 rounded-md py-1 text-center text-ink-muted opacity-40">Board inteiro</span>
            <span className="flex-1 rounded-md py-1 text-center text-ink-muted opacity-40">Seleção</span>
            <span className="flex-1 rounded-md bg-panel py-1 text-center text-ink shadow-panel">Frames</span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-2xs text-ink-muted">3 páginas, na ordem dos slides</span>
            <span className="od-btn od-btn-primary od-btn-sm">
              <ExportIcon size={14} /> Exportar .pdf
            </span>
          </div>
        </div>
      </Block>

      <Block title="Importar planilha · prévia + destino" note="A prévia usa as mesmas cores do conteúdo da tabela (cabeçalho #E7F1D6, grade #CBD2C6) e já mostra mesclagens. Destinos em cartões; Tabela nativa é o padrão.">
        <div className="grid grid-cols-[minmax(0,1fr)_116px] gap-2 rounded-xl bg-canvas p-3">
          <table className="border-separate border-spacing-0 self-start text-[11px]">
            <tbody>
              <tr>
                {['Título', 'Status', 'Pts'].map((h) => (
                  <td key={h} className="bg-[#E7F1D6] px-1.5 py-1 font-bold text-[#18211C] ring-1 ring-[#CBD2C6]">
                    {h}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="bg-[#FFF6A5] px-1.5 py-1 text-[#18211C] ring-1 ring-[#CBD2C6]">Login</td>
                <td rowSpan={2} className="bg-[#FFFFFF] px-1.5 py-1 align-top text-[#18211C] ring-1 ring-[#CBD2C6]">
                  A fazer
                </td>
                <td className="bg-[#FFFFFF] px-1.5 py-1 text-right text-[#18211C] ring-1 ring-[#CBD2C6]">3,5</td>
              </tr>
              <tr>
                <td className="bg-[#FFFFFF] px-1.5 py-1 text-[#18211C] ring-1 ring-[#CBD2C6]">Busca</td>
                <td className="bg-[#FFFFFF] px-1.5 py-1 text-right text-[#18211C] ring-1 ring-[#CBD2C6]">2</td>
              </tr>
            </tbody>
          </table>
          <div className="space-y-1">
            {[
              { icon: <TableIcon size={13} />, label: 'Tabela', on: true },
              { icon: <KanbanIcon size={13} />, label: 'Kanban', on: false },
              { icon: <StickyIcon size={13} />, label: 'Post-its', on: false },
            ].map((d) => (
              <div key={d.label} className={cn('flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] font-semibold ring-1', d.on ? 'bg-accent-soft text-ink ring-2 ring-selection' : 'bg-panel text-ink-muted ring-line')}>
                <span className="text-brand-700 dark:text-brand-300">{d.icon}</span> {d.label}
              </div>
            ))}
          </div>
        </div>
      </Block>

      <Block title="Inspetor de colagem · tipos recebidos" note="Só text/plain, text/html genérico, image/svg+xml e arquivos são LIDOS. Outros tipos aparecem só pelo nome com o selo “não lido” — o conteúdo nunca é decodificado (sala limpa).">
        <div className="space-y-1 rounded-xl bg-canvas p-3">
          {[
            { t: 'text/html', s: 'lido', c: 'bg-accent-soft text-ink' },
            { t: 'text/plain', s: 'lido', c: 'bg-accent-soft text-ink' },
            { t: 'image/png', s: 'arquivo', c: 'bg-panel text-ink-muted ring-1 ring-line' },
            { t: 'application/x-outro', s: 'não lido', c: 'text-ink-subtle' },
          ].map((m) => (
            <div key={m.t} className="flex items-center justify-between rounded-lg bg-panel-sunken px-2 py-1.5 ring-1 ring-line">
              <code className="font-mono text-2xs text-ink">{m.t}</code>
              <span className={cn('rounded-full px-1.5 text-2xs font-semibold', m.c)}>{m.s}</span>
            </div>
          ))}
          <p className="flex items-center gap-1.5 pt-1 text-[12px] font-semibold text-ink">
            <Check size={14} className="text-success" /> Tabela HTML → Importar planilha
          </p>
        </div>
      </Block>

      <Block wide title="Limite de segurança e confirmação" note="Arquivos acima de 5.000 linhas × 60 colunas: caixa bg-warning-soft com a opção “Importar só o início” (sem ela, “Inserir” fica desabilitado). Acima de 500 post-its/cards: o botão vira perigo com a contagem e um aviso em --od-warning.">
        <div className="grid gap-3 rounded-xl bg-canvas p-3 sm:grid-cols-2">
          <label className="flex items-start gap-2 rounded-lg bg-warning-soft p-2.5 text-xs text-ink ring-1 ring-line">
            <input type="checkbox" className="mt-0.5" defaultChecked readOnly />
            <span>
              <strong>A aba passa do limite de segurança</strong> (12.480 linhas × 72 colunas).
              <br />
              Importar só o início (5.000 linhas × 60 colunas).
            </span>
          </label>
          <div className="flex flex-col items-end justify-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-warning">
              <TriangleAlert size={14} /> São muitos itens (1.240 post-its). Confirma?
            </span>
            <span className="od-btn od-btn-danger od-btn-sm">Sim, inserir 1.240 post-its</span>
          </div>
        </div>
      </Block>

      <Block title="SVG importado · formas editáveis" note="Retângulo arredondado, estrela (path) e círculo de um SVG viram formas nativas: as duas primeiras com contorno livre (customPath, escalado ao redimensionar) e o círculo como Oval. Mesmas cores e traços do arquivo.">
        <div className="relative h-[130px] overflow-hidden rounded-xl bg-canvas">
          <div className="absolute left-4 top-2" style={{ transform: 'scale(1)' }}>
            {shapes.map((s) => (
              <div key={s.id} className="absolute" style={{ left: s.x, top: s.y, width: s.width, height: s.height }}>
                <ShapeView element={s} isEditing={false} />
              </div>
            ))}
          </div>
        </div>
      </Block>

      <Block wide title="Mensagens de importação" note="Sucesso em toast (“SVG: 3 formas, 1 linha”); avisos do arquivo (macros ignoradas, fórmulas sem valor salvo, codificação) em --od-warning na prévia; erro de leitura em --od-danger.">
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-canvas p-3 text-xs">
          <span className="flex items-center gap-1.5 text-warning">
            <TriangleAlert size={13} /> O arquivo contém macros: elas foram ignoradas (nada é executado).
          </span>
          <span className="flex items-center gap-1.5 text-danger">
            <CircleAlert size={13} /> A planilha está protegida por senha.
          </span>
          <span className="flex items-center gap-1.5 text-ink-muted">
            <FileSpreadsheet size={13} /> Datas ficam como texto · fórmulas não são calculadas
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-start gap-3 rounded-xl bg-canvas p-3">
          <div className="flex max-w-md items-start gap-2.5 rounded-xl bg-[#18211c] px-4 py-2.5 text-sm font-semibold text-[#f4f9ec] shadow-pop dark:bg-[#eceee9] dark:text-[#12301f]">
            <Info size={17} className="mt-px shrink-0 opacity-70" />
            <span>
              <span className="block">Parece dado codificado de outro programa.</span>
              <span className="mt-0.5 block text-xs font-normal opacity-80">Para trazer um diagrama de outro editor, exporte como SVG ou imagem e use Importar arquivo.</span>
            </span>
            <span className="shrink-0 self-center rounded-lg bg-[rgba(244,249,236,0.14)] px-2.5 py-1 text-xs font-bold dark:bg-[rgba(18,48,31,0.10)]">Inserir mesmo assim</span>
          </div>
          <p className="max-w-[260px] text-2xs text-ink-subtle">Detecção genérica (texto longo com %XX, XML ou base64). Nada é decodificado; no Inspetor, “Inserir no board” fica desabilitado.</p>
        </div>
      </Block>
    </div>
  );
}
