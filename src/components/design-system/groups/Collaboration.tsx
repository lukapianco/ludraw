/**
 * Design System · 6. Colaboração ao vivo — cursores, seleção e edição de outras pessoas (a versão atual: UMA caixa e
 * UMA etiqueta por pessoa). Componentes reais de src/components/ui/Presence.tsx.
 */
import { COLLABORATOR_PALETTE } from '../../../collab/protocol';
import { CollaboratorCursor, PresenceBox, PresenceEditFrame, PresenceLabelTag } from '../../ui/Presence';
import { Code, Frame } from '../dsKit';

export function Collaboration() {
  const [red, blue, , , teal] = COLLABORATOR_PALETTE;
  return (
    <Frame title="Cursores, seleção e edição de outras pessoas">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="relative h-[280px] overflow-hidden rounded-2xl bg-canvas ring-1 ring-line">
          {/* frame com filhos selecionado pela Ana: conta como UM objeto → uma caixa e uma etiqueta */}
          <div className="absolute rounded-[3px] bg-white shadow-sm ring-1 ring-black/10" style={{ left: 28, top: 52, width: 210, height: 120 }}>
            <div className="absolute -top-5 left-0 text-[12px] font-semibold text-ink-muted">Frame · Sprint 3</div>
            <div className="absolute rounded-[3px] bg-[#FBED7C]" style={{ left: 14, top: 18, width: 70, height: 70 }} />
            <div className="absolute rounded-[3px] bg-[#AACAFF]" style={{ left: 100, top: 18, width: 70, height: 70 }} />
          </div>
          <PresenceBox uid="ana" color={red} rect={{ x: 25, y: 49, width: 216, height: 126 }} />
          <PresenceLabelTag label={{ uid: 'ana', text: 'Ana', color: red, place: 'top', x: 205, y: 27, width: 36, height: 18 }} />
          {/* João está editando o texto deste post-it */}
          <div className="absolute rounded-[3px] bg-[#BCF8C2]" style={{ left: 300, top: 80, width: 100, height: 90 }} />
          <PresenceEditFrame uid="joao" name="João Reis" color={blue} rect={{ x: 300, y: 80, width: 100, height: 90 }} />
          <CollaboratorCursor name="Ana Souza" color={red} style={{ left: 190, top: 205 }} />
          <CollaboratorCursor name="Carla Silva" color={teal} style={{ left: 420, top: 40 }} />
        </div>
        <div className="space-y-3 text-sm text-ink-muted">
          <p>
            <strong className="text-ink">Cursor:</strong> seta na cor da pessoa com o nome numa pílula; some após 6 s parado e respeita “Mostrar cursores” (Exibir). Deslize de 160 ms opcional.
          </p>
          <p>
            <strong className="text-ink">Seleção de outra pessoa:</strong> UMA caixa por pessoa (união dos objetos de topo — um frame com filhos conta como um), borda de 2 px constante com o zoom, sem preenchimento nem alças, e UMA etiqueta com o primeiro nome no canto superior direito (vai para baixo ou empilha se encostar). Cor escurecida até o texto ter contraste AA.
          </p>
          <p>
            <strong className="text-ink">Edição:</strong> contorno de 2 px + fundo 6 % + selo de iniciais, sem etiqueta. O objeto fica bloqueado para os outros até a pessoa soltar.
          </p>
          <p className="text-xs text-ink-subtle">
            Componentes: <Code>CollaboratorCursor</Code>, <Code>PresenceBox</Code>, <Code>PresenceLabelTag</Code> e <Code>PresenceEditFrame</Code>. As cores das pessoas estão em Fundamentos › Cores de conteúdo; o selo “Ao vivo”, em Estúdio › Selos de estado.
          </p>
        </div>
      </div>
    </Frame>
  );
}
