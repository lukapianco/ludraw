# FEATURES.md — Catálogo de Funções do LuDraw

> **Gerado a partir de `docs/features.json`** (fonte da verdade) por `npm run docs:features`. Não edite as tabelas à mão: altere o JSON e regenere. `npm run audit:features` confere o catálogo contra o código. Esquema e regras: `ai-memory/FEATURES_SPEC.md`.

**146 funções** — 137 estáveis, 7 beta/experimentais, 1 planejadas, 0 descontinuadas, 1 removidas. Todas funcionam **localmente** (sem servidor) nesta versão.

Convenções (Estúdio v2, Chat 08.2): **barra do topo** = Ficha (Mesa, nome do board → Ficha do board) e Roda (pessoas, Facilitar, Conversas, Apresentar, Compartilhar, Você); **Vista** = módulo no canto inferior esquerdo (Bússola, zoom, Encontrar, Exibir, Roteiro); **Tempo** = módulo no canto inferior direito (desfazer, refazer, Linha do tempo); **Dock** = barra de ferramentas na base; `\` ou `Ctrl + /` reabre a última gaveta; **Cinta do objeto** = barra presa à seleção (identidade, chips de valor, Comentar · Bloqueio avançado · Bloquear · ⋯); "Clique direito…" = menu de contexto. No macOS, `Ctrl` = `⌘`.

## Vitrine (README)

| Prioridade | Função | Onde encontrar |
|---|---|---|
| 1 | [Board infinito com zoom e navegação](#ft-canvas-001) | Dock: Mão (mover o board) |
| 2 | [Post-its (notas adesivas)](#ft-objetos-001) | Clique direito no board vazio → Post-it · Dock: Nota adesiva |
| 3 | [Mesa (início)](#ft-dashboard-001) | `#/` |
| 4 | [Conectores entre objetos](#ft-conectores-001) | Dock: Conector (seta) |
| 5 | [Frames](#ft-objetos-015) | Clique direito no board vazio → Inserir aqui → Criar frame a partir da seleção · Dock: Frame |
| 6 | [Mapa mental](#ft-objetos-017) | Dock: Caixa de ferramentas |
| 7 | [Kanban](#ft-objetos-018) | Dock: Caixa de ferramentas |
| 8 | [Tabelas](#ft-objetos-019) | Clique direito na célula → Mesclar células · Dock: Caixa de ferramentas |
| 9 | [Diagrama por texto](#ft-diagramas-001) | Dock: Caixa de ferramentas |
| 10 | [Modo Apresentação](#ft-facilitacao-001) | Clique direito no objeto → Frame e modelo → Apresentar a partir deste frame · Barra do topo: Apresentar |
| 11 | [Votação por pontos](#ft-facilitacao-003) | Facilitar → Votação |
| 12 | [Galeria de templates](#ft-facilitacao-006) | Dock: Caixa de ferramentas · `#/templates` |
| 12 | [Modo Servidor (conectar a um servidor da equipe)](#ft-sistema-015) | Conectar a um servidor Homelab → Configurar servidor… → Permitir modo local neste servidor · `#/settings/profile` |
| 13 | [Importar arquivo](#ft-importar-001) | Ficha do board → Importar… → Importar arquivo · Dock: Caixa de ferramentas |
| 14 | [Importar planilha](#ft-importar-005) | Ficha do board → Importar… → Importar arquivo |
| 15 | [PDF multipáginas por frames](#ft-exportar-004) | Ficha do board → Exportar… → PDF — multipáginas por frames |
| — | [Edição ao vivo com várias pessoas](#ft-colaboracao-006) | `#/board/:id` |

## Board e navegação

| ID | Função | Status | Desde | Onde encontrar | Atalho |
|---|---|---|---|---|---|
| `FT-CANVAS-001` | Board infinito com zoom e navegação | estável | Chat 01 | Dock: Mão (mover o board) | `Espaço + arrastar` |
| `FT-CANVAS-002` | Grade de linhas ou pontos e ajuste à grade | estável | Chat 01 | Vista → Exibir → Grade e encaixe | `G` |
| `FT-CANVAS-003` | Minimapa | estável | Chat 01 | Vista → Bússola | — |
| `FT-CANVAS-004` | Seleção por retângulo, Shift + clique e laço | estável | Chat 01 | Dock: Laço (seleção livre) | `V` |
| `FT-CANVAS-005` | Guias inteligentes de alinhamento | estável | Chat 01 | Vista → Exibir → Encaixar em objetos | — |
| `FT-CANVAS-006` | Desfazer e refazer | estável | Chat 01 | Tempo → Desfazer | `Ctrl + Z` |
| `FT-CANVAS-007` | Encontrar no board | estável | Chat 01 | Vista → Encontrar | `Ctrl + F` |
| `FT-CANVAS-008` | Ajustar à tela e zoom na seleção | estável | Chat 01 | Clique direito no board vazio → Vista → Mostrar tudo | `Shift + 1` |
| `FT-CANVAS-009` | Cor de fundo do board | estável | Chat 01 | Ficha do board → Cor de fundo | — |
| `FT-CANVAS-010` | Visualização inicial do board | estável | Chat 03 | Clique direito no board vazio → Vista → Definir visualização atual como inicial | — |
| `FT-CANVAS-011` | Indicadores de visualização | estável | Chat 01 | Vista → Exibir → Barras de rolagem | — |
| `FT-CANVAS-012` | Tela inteira | estável | Chat 01 | Vista → Exibir → Tela inteira | `F11` |
| `FT-CANVAS-013` | Destacar por tag | estável | Chat 08.2 | Vista → Exibir → Destacar por tag | — |
| `FT-CANVAS-014` | Cursores contextuais | estável | Chat 08.2 | Dock: Mão (mover o board) | — |

### FT-CANVAS-001

**Board infinito com zoom e navegação** — Área de trabalho sem limites, com zoom de 2% a 400% centrado no cursor e navegação por arraste, roda ou trackpad.

**Como usar:**

1. Segure Espaço e arraste (ou use a ferramenta Mão, tecla H) para mover o board.
2. Use Ctrl + roda do mouse, a pinça do trackpad ou os botões Diminuir zoom / Aumentar zoom no canto inferior.
3. Clique no nível de zoom para abrir as opções de zoom; Ctrl + 0 volta a 100%.

<details><summary>Roteiro de captura</summary>

- **Preparar:** Abrir o board "Comece por aqui"
- **Passos:** Dar zoom de 25% até 200% sobre o fluxograma; Arrastar com Espaço para outro trecho
- **Texto alternativo:** Board infinito com o controle de zoom no canto inferior · tema claro

</details>

### FT-CANVAS-002

**Grade de linhas ou pontos e ajuste à grade** — Mostra uma grade adaptativa ao zoom e, se quiser, prende os objetos a ela.

**Como usar:**

1. Na Vista (canto inferior esquerdo), abra Exibir → Grade e encaixe.
2. Escolha Pontos, Linhas ou Nenhum.
3. Ligue Ajustar à grade para alinhar ao mover.

<details><summary>Roteiro de captura</summary>

- **Preparar:** Abrir um board novo em branco
- **Passos:** Ativar Grade de pontos; Mover um post-it com Ajustar à grade ligado
- **Texto alternativo:** Board com grade de pontos · tema claro

</details>

### FT-CANVAS-003

**Minimapa** — Miniatura do board no canto inferior esquerdo; clicar ou arrastar leva a câmera ao ponto.

**Como usar:**

1. Clique na Bússola, no começo da Vista (canto inferior esquerdo); para deixá-la sempre aberta, use Exibir → Bússola sempre aberta.
2. Clique ou arraste o retângulo da Bússola para navegar.

<details><summary>Roteiro de captura</summary>

- **Preparar:** Abrir o board de demonstração (Inserção rápida → Conteúdo de demonstração)
- **Passos:** Ligar o Minimapa; Arrastar o retângulo de visão
- **Texto alternativo:** Minimapa no canto inferior esquerdo · tema claro

</details>

### FT-CANVAS-004

**Seleção por retângulo, Shift + clique e laço** — Seleciona vários objetos arrastando no vazio, somando com Shift ou desenhando um laço livre.

**Como usar:**

1. Com a ferramenta Selecionar (V), arraste no vazio para selecionar por retângulo.
2. Segure Shift e clique para somar ou tirar objetos.
3. Para formas irregulares, escolha Laço (seleção livre) no Dock e contorne os objetos.

<details><summary>Roteiro de captura</summary>

- **Preparar:** Abrir o board de demonstração
- **Passos:** Desenhar um laço em volta de 3 post-its espalhados
- **Texto alternativo:** Seleção por laço envolvendo post-its · tema claro

</details>

### FT-CANVAS-005

**Guias inteligentes de alinhamento** — Linhas guia magnéticas aparecem ao alinhar centros ou bordas com outros objetos.

**Como usar:**

1. Arraste um objeto perto de outro: as guias aparecem quando bordas ou centros se alinham.
2. Segure Ctrl ao arrastar para desligar o ímã.
3. Desligue em Vista → Exibir → Encaixar em objetos.

<details><summary>Roteiro de captura</summary>

- **Preparar:** Abrir um board novo em branco
- **Passos:** Criar duas formas; Arrastar uma até alinhar o centro com a outra
- **Texto alternativo:** Guias magnéticas entre duas formas · tema claro

</details>

### FT-CANVAS-006

**Desfazer e refazer** — Histórico de alterações do board com desfazer e refazer.

**Como usar:**

1. Pressione Ctrl + Z para desfazer e Ctrl + Y (ou Ctrl + Shift + Z) para refazer.
2. Ou use Desfazer / Refazer no módulo Tempo (canto inferior direito).

### FT-CANVAS-007

**Encontrar no board** — Busca texto em post-its, formas, textos e frames e leva a câmera a cada resultado.

**Como usar:**

1. Pressione Ctrl + F (ou a lupa da Vista; em telas estreitas, Exibir → Encontrar).
2. Digite o termo.
3. Use Anterior / Próximo para passar pelos resultados.

<details><summary>Roteiro de captura</summary>

- **Preparar:** Abrir o board "Comece por aqui"
- **Passos:** Buscar a palavra "frame"
- **Texto alternativo:** Painel de busca com resultado destacado · tema claro

</details>

### FT-CANVAS-008

**Ajustar à tela e zoom na seleção** — Enquadra todo o conteúdo ou só a seleção com um atalho.

**Como usar:**

1. Pressione Shift + 1 (ou Alt + 1) para ver tudo.
2. Com objetos selecionados, Shift + 2 dá zoom na seleção.
3. Shift + 0 volta a 100%.

### FT-CANVAS-009

**Cor de fundo do board** — Escolhe uma cor de fundo para o board entre 11 opções ou o padrão do tema.

**Como usar:**

1. Clique no nome do board, no topo, para abrir a Ficha do board → Cor de fundo.
2. Clique numa das cores (ou Padrão do tema).

### FT-CANVAS-010

**Visualização inicial do board** — Define o enquadramento com que o board abre para quem chega.

**Como usar:**

1. Enquadre o board como quer que ele abra.
2. Clique direito no vazio → Vista → Definir visualização atual como inicial (ou Definir visualização inicial para enquadrar a seleção).
3. Também no Roteiro (Vista) → Usar esta vista como inicial.

### FT-CANVAS-011

**Indicadores de visualização** — Liga ou desliga barras de rolagem, dimensões do objeto e do projeto, controles de desfazer e conectores.

**Como usar:**

1. Abra Vista → Exibir.
2. Ligue ou desligue Barras de rolagem, Medidas do objeto, Medidas do board, Conectores, cursores e o Módulo Tempo.

### FT-CANVAS-012

**Tela inteira** — Esconde a interface do navegador para trabalhar ou apresentar em tela cheia.

**Como usar:**

1. Abra Vista → Exibir → Tela inteira (ou F11).
2. Pressione Esc para sair.

### FT-CANVAS-013

**Destacar por tag** — Esmaece o que não tem as tags escolhidas para destacar um assunto; só muda a visualização de quem ligou, nada no board.

**Como usar:**

1. Abra Vista → Exibir → Destacar por tag.
2. Clique em uma ou mais tags: os objetos sem elas ficam esmaecidos (frames e comentários continuam visíveis).
3. Limpar volta ao normal.

Relacionadas: [FT-OBJETOS-002](#ft-objetos-002)

### FT-CANVAS-014

**Cursores contextuais** — O cursor mostra o que vai acontecer: mover no que está selecionado, mão para navegar, cruz para criar, direção certa nas alças (mesmo girado) e um cursor próprio para girar.

**Como usar:**

1. Passe o mouse sobre um objeto selecionado: o cursor vira "mover"; arrastando, "agarrar".
2. Nas alças, o cursor aponta para a direção do redimensionamento, acompanhando a rotação; na alça de girar, aparece o cursor de rotação.
3. Com a Mão ou Espaço, o cursor é de mão; nas ferramentas de criar, uma cruz; no Texto, o cursor de texto. Objeto travado mostra "não permitido" ao tentar mover.

Relacionadas: [FT-OBJETOS-009](#ft-objetos-009), [FT-GOVERNANCA-001](#ft-governanca-001)

## Objetos

| ID | Função | Status | Desde | Onde encontrar | Atalho |
|---|---|---|---|---|---|
| `FT-OBJETOS-001` | Post-its (notas adesivas) | estável | Chat 01 | Clique direito no board vazio → Post-it · Dock: Nota adesiva | `N` |
| `FT-OBJETOS-002` | Tags coloridas nos post-its | estável | Chat 02 | Ficha do board → Tags do board | — |
| `FT-OBJETOS-003` | Reações com emoji | estável | Chat 02 | — | — |
| `FT-OBJETOS-004` | Texto com formatação rica | estável | Chat 01 | Dock: Texto | `T` |
| `FT-OBJETOS-005` | Formas (11 tipos) | estável | Chat 01 | Dock: Formas | `S` |
| `FT-OBJETOS-006` | Caneta, marca-texto e borracha | estável | Chat 01 | Dock: Caneta | `P` |
| `FT-OBJETOS-007` | Imagens | estável | Chat 02 | Clique direito no board vazio → Inserir aqui → Inserir imagem… · Dock: Imagem (também: arrastar ou Ctrl + V) | — |
| `FT-OBJETOS-008` | Emojis e adesivos | estável | Chat 02 | Dock: Emojis e adesivos | `Shift + E` |
| `FT-OBJETOS-009` | Transformar: mover, redimensionar, girar e camadas | estável | Chat 01 | Clique direito no objeto → Organizar → Trazer para a frente | `PgUp` |
| `FT-OBJETOS-010` | Alinhar e distribuir | estável | Chat 01 | Clique direito no objeto → Organizar → Distribuir na horizontal | — |
| `FT-OBJETOS-011` | Agrupar e desagrupar | estável | Chat 01 | Clique direito no objeto → Organizar → Agrupar | `Ctrl + G` |
| `FT-OBJETOS-012` | Copiar, colar, duplicar e copiar estilo | estável | Chat 01 | Clique direito no objeto → Editar → Copiar estilo | `Ctrl + D` |
| `FT-OBJETOS-013` | Copiar link para um objeto | estável | Chat 03 | Clique direito no objeto → Copiar como → Link do objeto | `Ctrl + Alt + Shift + C` |
| `FT-OBJETOS-014` | Informações do objeto | estável | Chat 01 | Clique direito no objeto → Exportar e info → Info | — |
| `FT-OBJETOS-015` | Frames | estável | Chat 03 | Clique direito no board vazio → Inserir aqui → Criar frame a partir da seleção · Dock: Frame | `F` |
| `FT-OBJETOS-016` | Ocultar conteúdo do frame | estável | Chat 03 | Clique direito no objeto → Frame e modelo → Ocultar o conteúdo | — |
| `FT-OBJETOS-017` | Mapa mental | estável | Chat 03 | Dock: Caixa de ferramentas | — |
| `FT-OBJETOS-018` | Kanban | estável | Chat 04 | Dock: Caixa de ferramentas | — |
| `FT-OBJETOS-019` | Tabelas | estável | Chat 04 | Clique direito na célula → Mesclar células · Dock: Caixa de ferramentas | — |
| `FT-OBJETOS-020` | Inserção rápida de conjuntos prontos | estável | Chat 02 | Dock: Inserção rápida | — |
| `FT-OBJETOS-021` | Cinta do objeto | estável | Chat 08.2 | Clique direito no objeto → Editar | — |
| `FT-OBJETOS-022` | Fontes do board (40) com busca | estável | Chat 08.2 | Clique direito no objeto → Editar | — |

### FT-OBJETOS-001

**Post-its (notas adesivas)** — Notas com 16 cores próprias, ajuste automático da fonte e criação rápida em sequência.

**Como usar:**

1. Clique em Nota adesiva no Dock (ou tecle N) e escolha a cor.
2. Clique no board para criar e digite.
3. Enquanto edita, Tab cria o próximo post-it ao lado e Ctrl + Enter cria abaixo, com a mesma cor e tags.

<details><summary>Roteiro de captura</summary>

- **Preparar:** Abrir um board novo em branco
- **Passos:** Criar um post-it Canário; Pressionar Tab duas vezes para criar mais dois; Trocar a cor de um deles na Cinta do objeto
- **Texto alternativo:** Três post-its em sequência com cores diferentes · tema claro

</details>

Relacionadas: [FT-OBJETOS-002](#ft-objetos-002), [FT-OBJETOS-003](#ft-objetos-003)

### FT-OBJETOS-002

**Tags coloridas nos post-its** — Etiquetas com 10 cores, gerenciadas por board e aplicadas pela Cinta do objeto.

**Como usar:**

1. Selecione um post-it e clique em Tags na Cinta do objeto.
2. Busque ou crie uma tag.
3. Renomeie, recolora ou exclua em Ficha do board → Tags do board.

<details><summary>Roteiro de captura</summary>

- **Preparar:** Abrir o board de demonstração
- **Passos:** Criar a tag "Urgente" vermelha; Aplicar em dois post-its; Abrir a aba Tags do Painel
- **Texto alternativo:** Post-its com tags e a aba Tags do Painel · tema claro

</details>

Relacionadas: [FT-OBJETOS-001](#ft-objetos-001)

### FT-OBJETOS-003

**Reações com emoji** — Uma reação por pessoa por emoji em post-its, com contagem no rodapé.

**Como usar:**

1. Selecione um post-it.
2. Clique em Reagir na Cinta do objeto e escolha o emoji.
3. Clique de novo no mesmo emoji para retirar.

Relacionadas: [FT-OBJETOS-001](#ft-objetos-001)

### FT-OBJETOS-004

**Texto com formatação rica** — Fonte (20 opções), tamanho, negrito, itálico, sublinhado, tachado, listas, recuo, link, cor e realce.

**Como usar:**

1. Clique em Texto no Dock (ou tecle T) e clique no board.
2. Selecione o objeto e use a Cinta: Estilo do texto (fonte, tamanho, negrito/itálico/sublinhado/tachado, lista, alinhamento e marca-texto), Negrito, Cor do texto e Link.
3. Atalhos durante a edição: Ctrl + B, Ctrl + I, Ctrl + U.

<details><summary>Roteiro de captura</summary>

- **Preparar:** Abrir um board novo em branco
- **Passos:** Criar um texto; Aplicar a fonte Fraunces, negrito e uma lista com marcadores
- **Texto alternativo:** Texto formatado com lista e realce · tema claro

</details>

### FT-OBJETOS-005

**Formas (11 tipos)** — Retângulo, retângulo arredondado, oval, losango, triângulo, paralelogramo, estrela, balão de fala, hexágono, cilindro e nuvem, com texto dentro.

**Como usar:**

1. Clique em Formas no Dock (S) e escolha o tipo — R e O criam retângulo e oval direto.
2. Clique ou arraste no board.
3. Mude preenchimento, borda, opacidade e tipo pela Cinta (Preenchimento; o tipo muda em Forma ▾ → Converter em…).

<details><summary>Roteiro de captura</summary>

- **Preparar:** Abrir um board novo em branco
- **Passos:** Criar um losango e uma nuvem; Trocar a cor e a opacidade
- **Texto alternativo:** Formas variadas com texto · tema claro

</details>

### FT-OBJETOS-006

**Caneta, marca-texto e borracha** — Desenho à mão livre com espessuras e cores, marca-texto translúcido e borracha.

**Como usar:**

1. Clique em Caneta no Dock (P) e escolha Fina, Média ou Grossa ou uma cor.
2. Desenhe arrastando.
3. Use Marca-texto para destacar e Borracha (E) para apagar traços.

### FT-OBJETOS-007

**Imagens** — Insere imagens por botão, arrastar ou Ctrl + V, com compressão; imagem de outro site nunca carrega sozinha (no Modo Servidor, cole o endereço e use "Baixar para o board").

**Como usar:**

1. Clique em Imagem no Dock, arraste um arquivo para o board ou cole com Ctrl + V.
2. Redimensione pelas alças.
3. Colou o endereço de uma imagem de outro site? No Modo Servidor, clique em Baixar para o board no aviso: o servidor baixa a imagem uma vez e ela passa a ficar dentro do board. No Modo Local, salve a imagem e arraste o arquivo.
4. Imagem antiga com endereço de outro site aparece como espaço reservado: no Modo Servidor, quem edita clica em Baixar para o board; os outros veem como trazê-la.

<details><summary>Roteiro de captura</summary>

- **Preparar:** Abrir um board novo em branco
- **Passos:** Arrastar uma foto para o board
- **Texto alternativo:** Imagem inserida com alças de redimensionamento · tema claro

</details>

### FT-OBJETOS-008

**Emojis e adesivos** — Emojis grandes e adesivos (do LuDraw e das extensões) como objetos do board: clique para o centro da tela ou arraste para o lugar; funciona ao vivo no Modo Servidor.

**Como usar:**

1. Clique em Emojis e adesivos na Dock (ou Shift + E).
2. Busque pelo nome ou troque de aba: Emojis · Adesivos · Das extensões.
3. Clique para colocar no centro da tela ou arraste até o ponto do board; Ctrl + Z desfaz.
4. Reagir a um post-it fica na Cinta do objeto.

**Permissões envolvidas:** `board.edit`

### FT-OBJETOS-009

**Transformar: mover, redimensionar, girar e camadas** — Oito alças de tamanho, alça de rotação com passos de 15°, setas para mover e controle de camadas.

**Como usar:**

1. Arraste as alças para redimensionar (Shift mantém proporção).
2. Arraste a alça de rotação (Shift = passos de 15°).
3. Setas movem 1 px (Shift + setas, 10 px).
4. Clique direito → Organizar para trazer à frente, enviar para trás ou mudar uma camada.

### FT-OBJETOS-010

**Alinhar e distribuir** — Alinha vários objetos pelas bordas ou centros e distribui o espaço entre eles.

**Como usar:**

1. Selecione 2 ou mais objetos (3 para distribuir).
2. Clique direito → Organizar.
3. Escolha À esquerda, Ao centro, Ao topo… ou Distribuir na horizontal / vertical.

### FT-OBJETOS-011

**Agrupar e desagrupar** — Junta objetos num grupo que se move e seleciona como um só.

**Como usar:**

1. Selecione os objetos.
2. Pressione Ctrl + G (Ctrl + Shift + G desagrupa).

### FT-OBJETOS-012

**Copiar, colar, duplicar e copiar estilo** — Área de transferência interna e do sistema, duplicar e transferir o estilo de um objeto para outros.

**Como usar:**

1. Ctrl + C / Ctrl + V copiam e colam; Ctrl + D duplica; Alt + arrastar duplica arrastando.
2. Ctrl + Alt + C copia o estilo e Ctrl + Alt + V aplica nos selecionados.
3. Ctrl + Shift + C copia a seleção como imagem.

### FT-OBJETOS-013

**Copiar link para um objeto** — Gera um link que abre o board com a câmera no objeto.

**Como usar:**

1. Clique direito no objeto (ou ⋯ da Cinta) → Copiar como → Link do objeto.
2. Envie o link: ao abrir, o board foca o objeto.

### FT-OBJETOS-014

**Informações do objeto** — Mostra tipo, autor, datas, tamanho, rotação, caracteres e ID.

**Como usar:**

1. Clique direito no objeto (ou ⋯ da Cinta) → Exportar e info → Info.
2. Confira tipo, autor, datas, tamanho, rotação e ID; O ⋯ da Cinta abre o mesmo menu do botão direito.

### FT-OBJETOS-015

**Frames** — Áreas com título e proporção (Livre, 16:9, 4:3, 1:1, A4, Celular) que levam junto os objetos de dentro.

**Como usar:**

1. Clique em Frame no Dock (F) e escolha a proporção na bandeja (ou troque depois pelo chip Proporção da Cinta).
2. Clique ou arraste no board; ou selecione objetos e use Criar frame a partir da seleção.
3. Mover o frame move o conteúdo; o título é editável.

<details><summary>Roteiro de captura</summary>

- **Preparar:** Abrir um board novo em branco
- **Passos:** Criar 3 post-its; Selecioná-los e criar frame a partir da seleção; Renomear o frame
- **Texto alternativo:** Frame com post-its dentro · tema claro

</details>

Relacionadas: [FT-OBJETOS-016](#ft-objetos-016), [FT-FACILITACAO-001](#ft-facilitacao-001), [FT-EXPORTAR-008](#ft-exportar-008), [FT-EXPORTAR-004](#ft-exportar-004)

### FT-OBJETOS-016

**Ocultar conteúdo do frame** — Esconde o conteúdo de um frame (olhinho) para revelar no momento certo de uma dinâmica.

**Como usar:**

1. Clique direito no frame → Frame e modelo → Ocultar o conteúdo (ou Conteúdo visível na Cinta) (ou o olhinho do título).
2. Use Mostrar o conteúdo para revelar.

**Permissões envolvidas:** `frame.toggleHidden`

### FT-OBJETOS-017

**Mapa mental** — Ramifica ideias com Tab (filha) e Enter (irmã), com layout automático e ramos recolhíveis.

**Como usar:**

1. Na Dock, abra a Caixa de ferramentas (ou /) → Mapa mental.
2. Selecione um nó: Tab cria ideia filha, Enter cria irmã, Delete apaga o ramo.
3. Use a Cinta do objeto para trocar a direção e recolher/expandir ramos.

<details><summary>Roteiro de captura</summary>

- **Preparar:** Abrir um board novo em branco
- **Passos:** Inserir um mapa mental; Criar 3 ramos com 2 filhos cada
- **Texto alternativo:** Mapa mental com ramos coloridos · tema claro

</details>

### FT-OBJETOS-018

**Kanban** — Quadro com colunas, limite WIP e cards com responsável, prazo, prioridade, story points e tags.

**Como usar:**

1. Na Dock, abra a Caixa de ferramentas (ou /) → Kanban.
2. Use Novo card / Nova coluna na Cinta do objeto (o nome do quadro fica na identidade, à esquerda).
3. Arraste cards entre colunas; um clique no card (sem arrastar) abre o editor completo.

<details><summary>Roteiro de captura</summary>

- **Preparar:** Abrir um board novo em branco
- **Passos:** Inserir um Kanban; Criar 4 cards com prioridades diferentes; Mover um card para "Em andamento"
- **Texto alternativo:** Kanban com cards e prioridades · tema claro

</details>

Relacionadas: [FT-IMPORTAR-005](#ft-importar-005), [FT-EXPORTAR-005](#ft-exportar-005)

### FT-OBJETOS-019

**Tabelas** — Tabela editável com teclado de planilha, mesclagem, bordas, estilos, ordenação e cópia para planilhas.

**Como usar:**

1. Na Dock, abra a Caixa de ferramentas (ou /) → Tabela.
2. Clique numa célula e digite; setas, Tab e Enter navegam.
3. Clique direito na célula para inserir/excluir linhas e colunas, mesclar, alinhar, colorir, bordas e ordenar.

<details><summary>Roteiro de captura</summary>

- **Preparar:** Abrir um board novo em branco
- **Passos:** Inserir uma tabela 4 × 3; Preencher e mesclar o cabeçalho; Aplicar linhas alternadas
- **Texto alternativo:** Tabela formatada com cabeçalho mesclado · tema claro

</details>

Relacionadas: [FT-EXPORTAR-006](#ft-exportar-006), [FT-IMPORTAR-005](#ft-importar-005)

### FT-OBJETOS-020

**Inserção rápida de conjuntos prontos** — Bloco de post-its 3 × 3, fluxograma simples, brainwriting e conteúdo de demonstração com um clique.

**Como usar:**

1. Clique em Inserção rápida (raio) no Dock.
2. Escolha Bloco de post-its, Fluxograma simples, Brainwriting ou Conteúdo de demonstração.

### FT-OBJETOS-021

**Cinta do objeto** — Barra presa ao que está selecionado: identidade (tipo ou nome), chips com os valores atuais e, sempre à direita, Comentar · Bloqueio avançado · Bloquear · ⋯ (o mesmo menu do botão direito).

**Como usar:**

1. Selecione um objeto: a Cinta aparece logo abaixo dele (ou acima, se não couber), com a lingueta apontando para ele.
2. Clique na identidade para converter (post-it, texto, forma), filtrar a seleção (vários objetos) ou renomear (frame e Kanban).
3. Os chips mostram o valor atual e abrem uma gaveta: Estilo do texto, Traço, Pontas, Proporção…
4. O cadeado trava com um clique; para destravar, segure 2 s (mouse ou Enter/Espaço). O ⋯ abre o menu do objeto.

**Permissões envolvidas:** `board.edit`, `element.unlockProtected`, `frame.toggleHidden`, `board.export`

Relacionadas: [FT-GOVERNANCA-001](#ft-governanca-001), [FT-OBJETOS-004](#ft-objetos-004), [FT-CONECTORES-001](#ft-conectores-001)

### FT-OBJETOS-022

**Fontes do board (40) com busca** — 40 famílias de licença aberta em cinco grupos (Sem serifa, Serifa, Manuscrita, Display, Mono), com busca e Recentes; cada família só é baixada quando usada.

**Como usar:**

1. Selecione um texto, post-it ou forma e abra o chip Estilo do texto na Cinta.
2. Busque pelo nome ou percorra os grupos; as usadas por último ficam em Recentes.
3. O mesmo seletor aparece no texto da linha do conector e nas células da tabela.

**Permissões envolvidas:** `board.edit`

Relacionadas: [FT-SISTEMA-010](#ft-sistema-010), [FT-OBJETOS-004](#ft-objetos-004)

## Conectores

| ID | Função | Status | Desde | Onde encontrar | Atalho |
|---|---|---|---|---|---|
| `FT-CONECTORES-001` | Conectores entre objetos | estável | Chat 01 | Dock: Conector (seta) | `L` |
| `FT-CONECTORES-002` | Texto na linha | estável | Chat 03 | — | — |
| `FT-CONECTORES-003` | Saltos de linha e roteamento automático | estável | Chat 03 | — | — |
| `FT-CONECTORES-004` | Criar objeto conectado pelos pontos de ancoragem | estável | Chat 03 | — | — |

### FT-CONECTORES-001

**Conectores entre objetos** — Linhas reta, curva ou em cotovelo que acompanham os objetos, com pontas configuráveis.

**Como usar:**

1. Escolha Conector (seta) no Dock (L) e arraste de um objeto a outro — ou puxe um dos 4 pontos de ancoragem.
2. Na Cinta, use Traço (espessura, percurso e estilo), Pontas (início e fim, com ⇄ para inverter) e Cor da linha.
3. Trocar as extremidades da linha inverte o sentido.

<details><summary>Roteiro de captura</summary>

- **Preparar:** Abrir um board novo em branco
- **Passos:** Criar duas formas; Ligar com um conector em cotovelo e ponta Seta cheia
- **Texto alternativo:** Duas formas ligadas por conector em cotovelo · tema claro

</details>

Relacionadas: [FT-CONECTORES-002](#ft-conectores-002), [FT-CONECTORES-003](#ft-conectores-003), [FT-CONECTORES-004](#ft-conectores-004)

### FT-CONECTORES-002

**Texto na linha** — Rótulo editável em qualquer ponto da linha, com fonte, tamanho, cores, fundo, borda e cantos.

**Como usar:**

1. Dê duplo clique em qualquer ponto da linha e digite (ou Enter com a linha selecionada).
2. Arraste a pílula para deslizar o texto pela rota.
3. Use Estilo do texto da linha na Cinta do objeto para fonte, cores, fundo e borda.

### FT-CONECTORES-003

**Saltos de linha e roteamento automático** — Linhas em cotovelo desviam dos objetos ligados e fazem um pequeno salto ao cruzar outra linha.

**Como usar:**

1. Use o tipo de linha em cotovelo.
2. Ajustar percurso automaticamente recalcula a rota; os saltos aparecem sozinhos nos cruzamentos (também no export).

### FT-CONECTORES-004

**Criar objeto conectado pelos pontos de ancoragem** — Os 4 pontos ao redor de um objeto criam um novo objeto já ligado ou puxam uma seta.

**Como usar:**

1. Passe o mouse sobre um objeto para ver os 4 pontos.
2. Clique num ponto para criar um objeto conectado ou arraste para puxar uma seta.
3. Inserir forma, na Cinta da linha, adiciona uma forma no meio.

## Diagramas

| ID | Função | Status | Desde | Onde encontrar | Atalho |
|---|---|---|---|---|---|
| `FT-DIAGRAMAS-001` | Diagrama por texto | estável | Chat 04 | Dock: Caixa de ferramentas | — |

### FT-DIAGRAMAS-001

**Diagrama por texto** — Escreva o fluxo em texto e gere formas e conectores nativos editáveis, com prévia ao vivo e guia da sintaxe.

**Como usar:**

1. Na Dock, abra a Caixa de ferramentas (ou /) → Diagrama por texto.
2. Escreva o fluxo (ou use o Guia da sintaxe passo a passo).
3. Confira a prévia e insira no board.

<details><summary>Roteiro de captura</summary>

- **Preparar:** Abrir um board novo em branco
- **Passos:** Abrir Diagrama por texto; Usar o exemplo de fluxo de login; Inserir no board
- **Texto alternativo:** Modal do diagrama por texto com prévia · tema claro

</details>

## Facilitação

| ID | Função | Status | Desde | Onde encontrar | Atalho |
|---|---|---|---|---|---|
| `FT-FACILITACAO-001` | Modo Apresentação | estável | Chat 03 | Clique direito no objeto → Frame e modelo → Apresentar a partir deste frame · Barra do topo: Apresentar | — |
| `FT-FACILITACAO-002` | Cronômetro com música | estável | Chat 04 | Facilitar → Cronômetro | — |
| `FT-FACILITACAO-003` | Votação por pontos | estável | Chat 04 | Facilitar → Votação | — |
| `FT-FACILITACAO-004` | Enquete | estável | Chat 04 | Facilitar → Enquete | — |
| `FT-FACILITACAO-005` | Modo Privado (criação cega) | estável | Chat 02 | Facilitar → Modo Privado | — |
| `FT-FACILITACAO-006` | Galeria de templates | estável | Chat 04 | Dock: Caixa de ferramentas · `#/templates` | — |
| `FT-FACILITACAO-007` | Salvar como template | estável | Chat 04 | Ficha do board → Salvar como modelo | — |
| `FT-FACILITACAO-008` | Trazer todos até mim | beta | Chat 08 | Trazer todos até mim → Parar de conduzir → Sair do modo seguir | — |
| `FT-FACILITACAO-009` | Facilitar: controles da sessão num só lugar | estável | Chat 08.2 | Facilitar | — |

### FT-FACILITACAO-001

**Modo Apresentação** — Navegação em tela cheia de frame em frame, com câmera animada e ordem dos slides editável.

**Como usar:**

1. Crie frames para cada slide.
2. Clique em Apresentar na barra do topo (ou no ▷ de um frame no Roteiro).
3. ← / → ou espaço passam os slides; Esc sai.
4. Reordene os slides no Roteiro (Vista).

<details><summary>Roteiro de captura</summary>

- **Preparar:** Abrir o modelo "Retrospectiva ágil" como board novo
- **Passos:** Clicar em Apresentar; Avançar dois slides
- **Texto alternativo:** Modo Apresentação com controles · tema escuro

</details>

Relacionadas: [FT-OBJETOS-015](#ft-objetos-015), [FT-EXPORTAR-004](#ft-exportar-004)

### FT-FACILITACAO-002

**Cronômetro com música** — Contagem regressiva com alarme e música ambiente gerada no navegador (Lo-Fi, Ambient Pad, Focus Pulse).

**Como usar:**

1. Clique em Facilitar (batuta) na barra do topo → Cronômetro.
2. Escolha 1, 3, 5, 10, 15 min ou um tempo personalizado e a música.
3. Inicie, pause, some +1 min ou zere; o tempo restante aparece ao lado da batuta.

**Permissões envolvidas:** `timer.manage`

### FT-FACILITACAO-003

**Votação por pontos** — Cada pessoa distribui pontos em post-its, formas e cards; modo anônimo e pódio com resultados.

**Como usar:**

1. Abra Facilitar → Votação.
2. Defina pergunta, pontos por pessoa, prazo e anonimato.
3. Participantes clicam nos itens para votar (Shift + clique retira).
4. Encerrar e revelar resultados mostra o pódio.

**Permissões envolvidas:** `voting.manage`

<details><summary>Roteiro de captura</summary>

- **Preparar:** Abrir o modelo "Retrospectiva ágil"
- **Passos:** Criar votação com 3 pontos; Votar em 3 post-its; Revelar resultados
- **Texto alternativo:** Pódio da votação por pontos · tema claro

</details>

Relacionadas: [FT-FACILITACAO-004](#ft-facilitacao-004)

### FT-FACILITACAO-004

**Enquete** — Pergunta com respostas, múltipla escolha e anônima; com Mostrar resultado parcial todos acompanham a contagem, desligado ela só aparece ao encerrar (para todos).

**Como usar:**

1. Abra Facilitar → Enquete.
2. Escreva a pergunta e as respostas (ou traga do board).
3. Decida se todos acompanham o resultado parcial e encerre para revelar.

**Permissões envolvidas:** `voting.manage`

Relacionadas: [FT-FACILITACAO-003](#ft-facilitacao-003)

### FT-FACILITACAO-005

**Modo Privado (criação cega)** — Cada pessoa cria post-its que os outros veem borrados até o facilitador revelar todos de uma vez. No Modo Servidor o texto nem sai do servidor antes de revelar.

**Como usar:**

1. Abra Facilitar → Modo Privado → Ativar Modo Privado.
2. Os post-its novos ficam ocultos para os demais (teste com Facilitar → Ver como…).
3. O facilitador usa Encerrar e revelar todas as notas.

**Permissões envolvidas:** `privateMode.toggle`, `privateMode.reveal`

### FT-FACILITACAO-006

**Galeria de templates** — Seis modelos prontos (SWOT, Retrospectiva, Modelo de negócio em 9 blocos, Kanban de sprint, Jornada do usuário, Arquitetura) com estrutura travada no fundo.

**Como usar:**

1. No board, abra a Caixa de ferramentas → Trazer e levar → Templates (ou a aba Templates da Mesa).
2. Filtre por categoria e escolha o modelo.
3. Insira no board atual ou crie um board novo.

<details><summary>Roteiro de captura</summary>

- **Preparar:** Abrir a Mesa na aba Templates
- **Passos:** Escolher "Matriz SWOT"; Criar board novo
- **Texto alternativo:** Galeria de templates com miniaturas · tema claro

</details>

Relacionadas: [FT-FACILITACAO-007](#ft-facilitacao-007)

### FT-FACILITACAO-007

**Salvar como template** — Guarda a seleção ou o board inteiro como template pessoal, do time (diretório de templates do time) ou do workspace.

**Como usar:**

1. Selecione objetos (ou nada, para o board inteiro).
2. Use Salvar como template no menu do objeto ou Ficha do board → Salvar como modelo.
3. Escolha onde guardar: Só para mim, Para o time ou Para o workspace.
4. Encontre na Mesa (aba Templates) ou na galeria, nas abas Meus, Do time e Do workspace.

**Permissões envolvidas:** `workspace.templates.team`, `workspace.templates.manage`

Relacionadas: [FT-FACILITACAO-006](#ft-facilitacao-006)

### FT-FACILITACAO-008

**Trazer todos até mim** — O facilitador conduz a tela de todos: quem está no board passa a seguir a dele; cada pessoa pode sair do modo seguir, e a condução acaba quando ele para ou sai do board.

**Como usar:**

1. No board ao vivo, abra Facilitar → Conduzir a tela → Trazer todos até mim.
2. Navegue: a tela de todos acompanha a sua.
3. Quem quiser usa Sair do modo seguir; você encerra com Parar de conduzir.

**Permissões envolvidas:** `followMe.lead`

Relacionadas: [FT-COLABORACAO-008](#ft-colaboracao-008), [FT-FACILITACAO-001](#ft-facilitacao-001)

### FT-FACILITACAO-009

**Facilitar: controles da sessão num só lugar** — Cronômetro, votação, enquete, Modo Privado, conduzir a tela e Ver como… em cartões; o estado (tempo restante, votando, privado) aparece ao lado da batuta.

**Como usar:**

1. Clique na batuta (Facilitar) na barra do topo.
2. Escolha um cartão: cada um abre o controle que você já conhece.
3. Sem permissão, o cartão mostra o motivo em vez de abrir.

**Permissões envolvidas:** `timer.manage`, `voting.manage`, `privateMode.toggle`, `followMe.lead`

Relacionadas: [FT-FACILITACAO-002](#ft-facilitacao-002), [FT-FACILITACAO-003](#ft-facilitacao-003), [FT-FACILITACAO-005](#ft-facilitacao-005), [FT-FACILITACAO-008](#ft-facilitacao-008)

## Colaboração

| ID | Função | Status | Desde | Onde encontrar | Atalho |
|---|---|---|---|---|---|
| `FT-COLABORACAO-001` | Comentários com conversas e @menções | estável | Chat 04 | Dock: Comentário · Barra do topo: Conversas | `C` |
| `FT-COLABORACAO-002` | Registro de atividades | estável | Chat 02 | Tempo → Linha do tempo → Ver eventos | — |
| `FT-COLABORACAO-003` | Inserir board em outra página | estável | Chat 03 | Barra do topo: Compartilhar | — |
| `FT-COLABORACAO-004` | Compartilhar com pessoas e link público | estável | Chat 06 | Barra do topo: Compartilhar | — |
| `FT-COLABORACAO-005` | Convites por link ou código | estável | Chat 06 | Convidar → Tenho um convite · `#/invite` | — |
| `FT-COLABORACAO-006` | Edição ao vivo com várias pessoas | beta | Chat 08 | `#/board/:id` | — |
| `FT-COLABORACAO-007` | Presença: cursores, seleção e quem está editando | beta | Chat 08 | Mostrar cursores dos colaboradores → Movimento suave dos cursores | — |
| `FT-COLABORACAO-008` | Seguir a tela de um colega | beta | Chat 08 | Voltar a seguir → Parar de seguir | — |
| `FT-COLABORACAO-009` | Conversas com "Ir até" | estável | Chat 08.2 | Barra do topo: Conversas | — |

### FT-COLABORACAO-001

**Comentários com conversas e @menções** — Pins de comentário no board com respostas, @menções, resolver/reabrir e filtros no Painel.

**Como usar:**

1. Escolha Comentário no Dock (C) e clique no board.
2. Escreva (use @ para mencionar) e envie.
3. Responda, resolva e filtre em Conversas (barra do topo); Ir até leva a câmera ao pin; Shift + C oculta os pins.

**Permissões envolvidas:** `board.comment`, `comment.delete`

<details><summary>Roteiro de captura</summary>

- **Preparar:** Abrir o board de demonstração
- **Passos:** Criar um comentário com @menção; Responder; Abrir a aba Comentários
- **Texto alternativo:** Conversa de comentário aberta · tema claro

</details>

Relacionadas: [FT-COLABORACAO-002](#ft-colaboracao-002)

### FT-COLABORACAO-002

**Registro de atividades** — Linha do tempo de quem criou, moveu, bloqueou ou exportou, agrupada, filtrável e mostrada no idioma da interface.

**Como usar:**

1. Abra a Linha do tempo (ampulheta no módulo Tempo) → Ver eventos.
2. Escolha uma versão para ver só os eventos daquele trecho.
3. Clique numa entrada para focar os objetos.

### FT-COLABORACAO-003

**Inserir board em outra página** — Gera o código para mostrar o board (só leitura) dentro de outra página HTML.

**Como usar:**

1. Clique em Compartilhar na barra do topo → Inserir em outro site….
2. Escolha o tamanho e a visualização.
3. Copie o código e cole na página.

### FT-COLABORACAO-004

**Compartilhar com pessoas e link público** — Dá acesso por board (editor, comentador ou leitor, com prazo), escolhe facilitadores e cria um link público de visitante com senha, validade e controle de download.

**Como usar:**

1. No board, clique em Compartilhar na barra do topo (ou ⋯ do board na Mesa → Compartilhar…).
2. Na aba Pessoas, escolha alguém do workspace, o papel e o prazo e clique em Adicionar.
3. Na aba Facilitadores, marque quem conduz cronômetro, votação e Modo Privado.
4. Na aba Link público, ligue o link, escolha o nível, a validade e a senha e copie o endereço.
5. Sem LUDRAW_JWT_SECRET no servidor, o endereço do link aparece só na criação; perdeu? Na aba Link público, clique em Gerar link novo para copiar (o antigo para de funcionar).

**Permissões envolvidas:** `board.share`, `board.publicLink`

Relacionadas: [FT-COLABORACAO-005](#ft-colaboracao-005), [FT-GOVERNANCA-008](#ft-governanca-008)

### FT-COLABORACAO-005

**Convites por link ou código** — Convida membros, administradores ou convidados B2B (restritos a um projeto ou board) com link e código copiáveis e prazo; a pessoa aceita na tela de entrada.

**Como usar:**

1. Clique em Convidar no cabeçalho da Mesa (ou em Administração → Membros/Convidados).
2. Informe o e-mail, o papel, os times (ou o projeto/board do convidado) e a validade.
3. Copie o link ou o código e envie para a pessoa.
4. Ela abre o link (ou usa Tenho um convite na entrada) e cria a conta com o e-mail convidado.

**Permissões envolvidas:** `workspace.members.invite`, `workspace.guests.invite`

Relacionadas: [FT-GOVERNANCA-007](#ft-governanca-007), [FT-COLABORACAO-004](#ft-colaboracao-004)

### FT-COLABORACAO-006

**Edição ao vivo com várias pessoas** — No Modo Servidor, todos editam o mesmo board ao mesmo tempo; sem rede, a edição continua no aparelho e volta objeto por objeto, deixando de fora só o que outra pessoa usa ou apagou.

**Como usar:**

1. Conecte o app a um servidor LuDraw e abra um board com outra pessoa.
2. Edite normalmente: o que cada um faz aparece para os outros em instantes.
3. O selo ao lado do nome do board mostra Ao vivo, Sincronizando ou Sem conexão.
4. Ctrl + Z desfaz só o que você fez, sem apagar o trabalho dos outros.

**Permissões envolvidas:** `board.edit`, `board.comment`

<details><summary>Roteiro de captura</summary>

- **Preparar:** Servidor ligado (npm run server:dev) e duas janelas com pessoas diferentes no mesmo board.
- **Passos:** Crie um post-it numa janela.; Veja o post-it surgir na outra e mova-o por lá.
- **Texto alternativo:** Duas janelas do mesmo board: um post-it criado numa aparece na outra. · tema claro

</details>

Relacionadas: [FT-COLABORACAO-007](#ft-colaboracao-007), [FT-COLABORACAO-002](#ft-colaboracao-002), [FT-SISTEMA-015](#ft-sistema-015)

### FT-COLABORACAO-007

**Presença: cursores, seleção e quem está editando** — Cursor com nome, caixa de seleção e contorno do que cada pessoa seleciona ou edita; o servidor decide quem chegou primeiro e o objeto fica bloqueado até a pessoa soltar.

**Como usar:**

1. Abra um board ao vivo com outra pessoa.
2. Veja o cursor, a seleção e o que ela está editando na cor dela.
3. Um objeto selecionado por outra pessoa não entra na sua seleção até ela soltar.
4. Em Visualizar, ligue ou desligue os cursores e o movimento suave.

Relacionadas: [FT-COLABORACAO-006](#ft-colaboracao-006), [FT-COLABORACAO-008](#ft-colaboracao-008), [FT-GOVERNANCA-014](#ft-governanca-014)

### FT-COLABORACAO-008

**Seguir a tela de um colega** — Clique no avatar de alguém na barra do topo para a sua tela acompanhar a dela; mexer na tela pausa, com Voltar a seguir e Parar de seguir.

**Como usar:**

1. No board ao vivo, clique no avatar da pessoa na barra do topo.
2. Sua tela acompanha a dela; arrastar ou dar zoom pausa o seguir.
3. Use Voltar a seguir ou Parar de seguir na faixa do topo.

Relacionadas: [FT-COLABORACAO-007](#ft-colaboracao-007), [FT-FACILITACAO-008](#ft-facilitacao-008)

### FT-COLABORACAO-009

**Conversas com "Ir até"** — Todas as conversas do board em cartões, com filtro, menções, resolver rápido e "Ir até", que leva a câmera ao pin e o destaca.

**Como usar:**

1. Clique em Conversas na barra do topo (o número mostra as abertas).
2. Filtre por Abertas, Resolvidas ou Todas e resolva direto no cartão.
3. Ir até leva a câmera ao pin e abre a conversa.

Relacionadas: [FT-COLABORACAO-001](#ft-colaboracao-001)

## Governança

| ID | Função | Status | Desde | Onde encontrar | Atalho |
|---|---|---|---|---|---|
| `FT-GOVERNANCA-001` | Bloqueio em quatro níveis | estável | Chat 02 | Clique direito no objeto → Bloqueio | `Ctrl + Shift + L` |
| `FT-GOVERNANCA-002` | Visualizar como… (simular perfis) | estável | Chat 02 | Facilitar → Ver como… | — |
| `FT-GOVERNANCA-003` | Permissões centralizadas | estável | Chat 02 | — | — |
| `FT-GOVERNANCA-004` | Exportação negada por padrão a leitores | estável | Chat 05 | — | — |
| `FT-GOVERNANCA-005` | Histórico de versões | estável | Chat 06 | Tempo → Linha do tempo | — |
| `FT-GOVERNANCA-006` | Lixeira | estável | Chat 06 | `#/trash` | — |
| `FT-GOVERNANCA-007` | Administração do Workspace | estável | Chat 06 | Administração do Workspace → Gerenciar workspace · `#/admin/overview` | — |
| `FT-GOVERNANCA-008` | Políticas e domínios do workspace | estável | Chat 06 | `#/admin/policies` | — |
| `FT-GOVERNANCA-009` | Auditoria do workspace | estável | Chat 06 | `#/admin/audit` | — |
| `FT-GOVERNANCA-010` | Transferência de propriedade (offboarding) | estável | Chat 06 | `#/admin/transfer` | — |
| `FT-GOVERNANCA-011` | Backup completo do workspace | estável | Chat 06 | `#/admin/backup` | — |
| `FT-GOVERNANCA-012` | Login da empresa (SSO por OIDC) | estável | Chat 07 | Entrar com {label} | — |
| `FT-GOVERNANCA-013` | Sessões e troca de senha | estável | Chat 07 | Trocar senha… → Sair de todos os dispositivos → Baixar e sair · `#/settings/profile` | — |
| `FT-GOVERNANCA-014` | Cores diferentes para cada pessoa | beta | Chat 08 | Cores diferentes para cada pessoa nos boards ao vivo · `#/admin/policies` | — |
| `FT-GOVERNANCA-015` | Linha do tempo com prévia somente leitura | estável | Chat 08.2 | Tempo → Linha do tempo | — |
| `FT-GOVERNANCA-016` | Envio de e-mail (SMTP opcional) | estável | Chat 08.5 | Administração do Workspace → Políticas e domínios → Envio de e-mail · `#/admin/policies` | — |
| `FT-GOVERNANCA-017` | Convites por e-mail | estável | Chat 08.5 | Convidar → Enviar o convite por e-mail | — |
| `FT-GOVERNANCA-018` | Link de convite geral | estável | Chat 08.5 | Administração do Workspace → Membros → Links de convite → Novo link · `#/admin/members` | — |
| `FT-GOVERNANCA-019` | Pedidos de acesso | estável | Chat 08.5 | Administração do Workspace → Políticas e domínios → Aceitar pedidos de acesso · `#/admin/members` | — |
| `FT-GOVERNANCA-020` | Cadastro com o e-mail da organização | estável | Chat 08.5 | Administração do Workspace → Políticas e domínios → Permitir cadastro com o e-mail da organização · `#/register` | — |

### FT-GOVERNANCA-001

**Bloqueio em quatro níveis** — Bloqueio padrão, bloqueio protegido de facilitador, estrutura de fundo e estrutura de fundo protegida.

**Como usar:**

1. Selecione o objeto → clique direito → Bloqueio (ou o cadeado da Cinta; o escudo "Bloqueio avançado" traz os outros níveis). Para destravar, segure o cadeado 2 s (mouse ou Enter/Espaço).
2. Escolha o nível; estruturas de fundo vão para trás e não entram na seleção por retângulo.
3. Destravar um bloqueio protegido pede confirmação e permissão.

**Permissões envolvidas:** `element.lockStandard`, `element.lockProtected`, `element.unlockProtected`

### FT-GOVERNANCA-002

**Visualizar como… (simular perfis)** — Simula como uma pessoa do workspace (inclusive usuários simulados) ou um perfil genérico vê a Mesa e o board e o que pode fazer.

**Como usar:**

1. Clique em Facilitar → Ver como… no board (ou em Visualizar como… no cabeçalho da Mesa).
2. Escolha uma pessoa do workspace ou um perfil genérico: uma faixa mostra a simulação ativa.
3. Volte para Eu mesmo ou clique em Sair da simulação.

Relacionadas: [FT-GOVERNANCA-003](#ft-governanca-003), [FT-GOVERNANCA-004](#ft-governanca-004)

### FT-GOVERNANCA-003

**Permissões centralizadas** — Toda ação que altera o board passa pela mesma regra de permissão, com o motivo explicado quando é negada.

**Como usar:**

1. Tente uma ação não permitida no perfil atual (por exemplo, editar como leitor em Visualizar como…).
2. O app bloqueia e mostra o motivo.

Mais detalhes: `ai-memory/ARCHITECTURE_MAP.md §5`

### FT-GOVERNANCA-004

**Exportação negada por padrão a leitores** — Visitantes leitores e comentadores só exportam quando o link ou a política do espaço permitem.

**Como usar:**

1. Simule um visitante leitor em Visualizar como….
2. Tente exportar: o motivo aparece e nada é baixado.

**Permissões envolvidas:** `board.export`

Relacionadas: [FT-GOVERNANCA-003](#ft-governanca-003), [FT-EXPORTAR-011](#ft-exportar-011)

### FT-GOVERNANCA-005

**Histórico de versões** — Versões automáticas, salvas com nome e de segurança (antes de restaurar ou de excluir em massa), com prévia e restauração em 1 clique registrada no Activity Log e na auditoria.

**Como usar:**

1. Abra a Linha do tempo (ampulheta no módulo Tempo, ou Ficha do board → Histórico).
2. Use Salvar versão (com nome, opcional) para guardar o estado atual.
3. Escolha uma versão para ver a prévia somente leitura no próprio canvas.
4. Restaurar esta versão (2º clique confirma) guarda antes uma versão de segurança; Ctrl+Z também desfaz.

**Permissões envolvidas:** `board.edit`, `board.restoreSnapshot`

Relacionadas: [FT-GOVERNANCA-011](#ft-governanca-011), [FT-COLABORACAO-002](#ft-colaboracao-002)

### FT-GOVERNANCA-006

**Lixeira** — Excluir um board manda para a lixeira; dá para restaurar até o prazo da política, depois ele some sozinho.

**Como usar:**

1. Na Ficha do board (clique no nome do board), escolha Mover para a lixeira (o aviso traz Desfazer).
2. Na Mesa, abra a aba Lixeira para restaurar ou excluir de vez.
3. Administradores veem a lixeira do workspace inteiro em Administração → Lixeira.

**Permissões envolvidas:** `board.delete`, `workspace.trash.manage`

Relacionadas: [FT-GOVERNANCA-008](#ft-governanca-008)

### FT-GOVERNANCA-007

**Administração do Workspace** — Área só para administradores com visão geral, alertas, membros, convidados B2B, times e projetos, políticas, auditoria, lixeira e transferência.

**Como usar:**

1. Abra o menu do avatar → Administração do Workspace (ou o seletor de espaço → Gerenciar workspace).
2. Na Visão geral, confira os alertas (por exemplo, só existe 1 administrador).
3. Em Membros, mude papéis, suspenda, reative ou remova (anonimiza); o último administrador fica protegido.
4. Em modo local, use Adicionar usuários simulados para testar papéis com Visualizar como….

**Permissões envolvidas:** `workspace.admin.view`, `workspace.members.manage`

Relacionadas: [FT-GOVERNANCA-008](#ft-governanca-008), [FT-GOVERNANCA-009](#ft-governanca-009), [FT-GOVERNANCA-010](#ft-governanca-010), [FT-COLABORACAO-005](#ft-colaboracao-005)

### FT-GOVERNANCA-008

**Políticas e domínios do workspace** — Nome da organização, domínios de e-mail permitidos e políticas de links públicos, convidados, exportação, retenção e extensões, aplicadas na interface pelo can().

**Como usar:**

1. Abra Administração do Workspace → Políticas e domínios.
2. Edite a organização (nome, domínios em chips, exigir domínio para membros) e salve.
3. Ajuste as políticas e clique em Salvar; cada alteração entra na auditoria com antes e depois.

**Permissões envolvidas:** `workspace.policies.manage`

Relacionadas: [FT-GOVERNANCA-004](#ft-governanca-004), [FT-COLABORACAO-004](#ft-colaboracao-004)

### FT-GOVERNANCA-009

**Auditoria do workspace** — Registro de convites, papéis, links públicos, políticas, lixeira e transferências, com filtros e exportação CSV; autores aparecem pelo nome atual (conta removida = Usuário removido).

**Como usar:**

1. Abra Administração do Workspace → Auditoria.
2. Filtre por autor, ação e período; abra as alterações de um evento.
3. Clique em Exportar CSV para baixar o que está filtrado.

**Permissões envolvidas:** `workspace.audit.view`

Relacionadas: [FT-COLABORACAO-002](#ft-colaboracao-002)

### FT-GOVERNANCA-010

**Transferência de propriedade (offboarding)** — Assistente em 4 passos para passar os boards de quem sai para quem fica, com prévia e opção de suspender a conta depois.

**Como usar:**

1. Abra Administração do Workspace → Transferência (ou o botão de transferir na linha do membro).
2. Escolha quem sai e quem recebe.
3. Revise a prévia dos boards e desmarque o que não deve mudar.
4. Confirme (opcional: suspender a conta depois).

**Permissões envolvidas:** `workspace.ownership.transfer`

Relacionadas: [FT-GOVERNANCA-007](#ft-governanca-007)

### FT-GOVERNANCA-011

**Backup completo do workspace** — Exporta e restaura um arquivo .ludraw-workspace com organização, políticas, pessoas, times, projetos, templates, auditoria, boards e versões; formato e versão são validados antes de aplicar.

**Como usar:**

1. Abra Administração do Workspace → Backup.
2. Clique em Baixar backup para gerar o arquivo .ludraw-workspace.
3. Para restaurar, use Escolher arquivo…, confira o resumo e confirme com 2 cliques.
4. Boards daqui que não estão no backup vão para a lixeira (nada é apagado na hora).

**Permissões envolvidas:** `workspace.backup.manage`

Relacionadas: [FT-GOVERNANCA-007](#ft-governanca-007), [FT-GOVERNANCA-005](#ft-governanca-005)

### FT-GOVERNANCA-012

**Login da empresa (SSO por OIDC)** — Entrar com o provedor da empresa (Keycloak, Authentik, Google, Entra ID…) configurado no servidor; conta nova só com convite ou para domínios permitidos.

**Como usar:**

1. O administrador do servidor define OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET e OIDC_REDIRECT_URI.
2. Na entrada do Modo Servidor aparece o botão Entrar com o nome do provedor.
3. Depois do provedor, o app volta sozinho para a Mesa (nenhum token passa pela URL).

Relacionadas: [FT-SISTEMA-015](#ft-sistema-015), [FT-COLABORACAO-005](#ft-colaboracao-005)

### FT-GOVERNANCA-013

**Sessões e troca de senha** — No Modo Servidor: troca de senha, sair de todos os dispositivos e sair que apaga deste navegador a cópia da organização, perguntando antes se há mudanças não enviadas.

**Como usar:**

1. Abra Configurações → Perfil → Sessão.
2. Clique em Trocar senha… para definir uma senha nova (as outras sessões são encerradas).
3. Clique em Sair de todos os dispositivos para encerrar todas as sessões abertas.
4. Ao sair com mudanças que o servidor ainda não recebeu, escolha Baixar e sair para guardar um arquivo do board antes.

Relacionadas: [FT-SISTEMA-015](#ft-sistema-015), [FT-GOVERNANCA-007](#ft-governanca-007)

### FT-GOVERNANCA-014

**Cores diferentes para cada pessoa** — Política do servidor: quando duas pessoas têm cores iguais ou muito parecidas, quem chega depois recebe uma cor bem diferente para cursor, contornos e avatar.

**Como usar:**

1. Abra Administração → Políticas (Modo Servidor).
2. No grupo Servidor, ligue ou desligue Cores diferentes para cada pessoa nos boards ao vivo.

**Permissões envolvidas:** `workspace.policies.manage`

Relacionadas: [FT-COLABORACAO-007](#ft-colaboracao-007)

### FT-GOVERNANCA-015

**Linha do tempo com prévia somente leitura** — Versões como pontos e atividade como barras numa só linha; escolher um ponto mostra o board daquele momento no próprio canvas, sem mexer no board atual.

**Como usar:**

1. Clique na ampulheta do módulo Tempo (canto inferior direito).
2. Escolha um ponto (ou arraste o seletor) para ver o board daquele momento; dá para navegar, mas não editar.
3. Voltar ao agora (ou Esc) fecha a prévia; Restaurar esta versão e Excluir versão pedem permissão de restaurar.
4. Ver eventos lista o que aconteceu naquele trecho.

**Permissões envolvidas:** `board.edit`, `board.restoreSnapshot`

Relacionadas: [FT-GOVERNANCA-005](#ft-governanca-005), [FT-COLABORACAO-002](#ft-colaboracao-002)

### FT-GOVERNANCA-016

**Envio de e-mail (SMTP opcional)** — Liga o envio de e-mail do servidor por variáveis ou pelo painel, sem reiniciar; sem e-mail tudo continua funcionando por links.

**Como usar:**

1. Abra Administração do Workspace → Políticas e domínios → Envio de e-mail.
2. Preencha Servidor SMTP, porta, usuário, senha e remetente (campos definidos por variável aparecem travados: o servidor manda).
3. Ligue Usar a configuração deste painel e clique em Salvar.
4. Clique em Enviar e-mail de teste: a mensagem vai para o seu próprio e-mail.

**Permissões envolvidas:** `workspace.policies.manage`

Relacionadas: [FT-SISTEMA-021](#ft-sistema-021), [FT-GOVERNANCA-017](#ft-governanca-017), [FT-GOVERNANCA-020](#ft-governanca-020)

Mais detalhes: `server/.env.example`

### FT-GOVERNANCA-017

**Convites por e-mail** — O convite pode sair por e-mail direto do servidor, além do link copiável de sempre.

**Como usar:**

1. Clique em Convidar (Mesa ou Administração → Membros).
2. Digite o e-mail e marque Enviar o convite por e-mail.
3. Confirme: o servidor envia o e-mail e o link também fica disponível para copiar.

**Permissões envolvidas:** `workspace.members.invite`

Relacionadas: [FT-GOVERNANCA-016](#ft-governanca-016), [FT-GOVERNANCA-018](#ft-governanca-018)

### FT-GOVERNANCA-018

**Link de convite geral** — Um link para várias pessoas, com papel fixo, validade, limite de usos e domínio opcional; pode ser desativado a qualquer momento.

**Como usar:**

1. Abra Administração do Workspace → Membros → Links de convite e clique em Novo link.
2. Escolha o papel, a validade, o limite de usos e, se quiser, Só e-mails do domínio; clique em Criar link.
3. Copie o link na hora (ele só aparece agora) e compartilhe.
4. Com e-mail no servidor, cada pessoa confirma o endereço antes de a conta ser criada; sem e-mail, cada uso vira um pedido na fila. Desativar encerra o link.

**Permissões envolvidas:** `workspace.members.manage`

Relacionadas: [FT-GOVERNANCA-019](#ft-governanca-019), [FT-GOVERNANCA-017](#ft-governanca-017)

### FT-GOVERNANCA-019

**Pedidos de acesso** — Quem não tem convite pede acesso pela tela de entrada; a administração aprova (gera um convite) ou recusa numa fila em Membros.

**Como usar:**

1. Em Administração do Workspace → Políticas e domínios, ligue Aceitar pedidos de acesso.
2. Na tela de entrada aparece Não tem convite? Pedir acesso: a pessoa informa nome, e-mail e uma mensagem opcional (com e-mail no servidor, confirma pelo link recebido).
3. Em Membros → Pedidos de acesso, clique em Aprovar (escolha o acesso e crie o convite) ou Recusar.

**Permissões envolvidas:** `workspace.members.manage`, `workspace.policies.manage`

Relacionadas: [FT-GOVERNANCA-018](#ft-governanca-018)

### FT-GOVERNANCA-020

**Cadastro com o e-mail da organização** — Quem tem e-mail de um domínio cadastrado cria a própria conta como membro, provando o e-mail; desligado por padrão e sem mostrar os domínios.

**Como usar:**

1. Cadastre o domínio da organização em Políticas e domínios e deixe o envio de e-mail funcionando.
2. Ligue Permitir cadastro com o e-mail da organização (o servidor recusa sem e-mail ou sem domínio).
3. Na tela de entrada aparece Criar conta com o e-mail da organização: a pessoa digita o e-mail e conclui pelo link recebido.
4. Só vale o domínio exato; pessoas removidas não voltam sozinhas e há um teto diário de contas criadas.

**Permissões envolvidas:** `workspace.policies.manage`

Relacionadas: [FT-GOVERNANCA-016](#ft-governanca-016), [FT-GOVERNANCA-019](#ft-governanca-019)

## Importar

| ID | Função | Status | Desde | Onde encontrar | Atalho |
|---|---|---|---|---|---|
| `FT-IMPORTAR-001` | Importar arquivo | estável | Chat 05 | Ficha do board → Importar… → Importar arquivo · Dock: Caixa de ferramentas | — |
| `FT-IMPORTAR-002` | Colar de qualquer lugar | estável | Chat 05 | Clique direito no board vazio → Colar | `Ctrl + V` |
| `FT-IMPORTAR-003` | SVG vetorial editável | estável | Chat 05 | Ficha do board → Importar… → Importar arquivo | — |
| `FT-IMPORTAR-004` | Arquivos .excalidraw | estável | Chat 05 | Ficha do board → Importar… → Importar arquivo | — |
| `FT-IMPORTAR-005` | Importar planilha | estável | Chat 05 | Ficha do board → Importar… → Importar arquivo | — |
| `FT-IMPORTAR-006` | Inspetor de colagem | estável | Chat 05 | Ficha do board → Importar… → Inspetor de colagem | — |
| `FT-IMPORTAR-007` | Proteção contra dado codificado | estável | Chat 05 | — | — |
| `FT-IMPORTAR-008` | Importar backup .ludraw | estável | Chat 01 | Ficha do board → Importar… → Importar arquivo | — |

### FT-IMPORTAR-001

**Importar arquivo** — Abre planilhas, CSV/TSV, SVG, .excalidraw, tabelas HTML, texto, imagens e backups .ludraw.

**Como usar:**

1. Abra Ficha do board → Importar… (ou clique direito no vazio → Importar arquivo…).
2. Escolha um ou mais arquivos.
3. Confira o plano e insira.

**Permissões envolvidas:** `board.edit`

<details><summary>Roteiro de captura</summary>

- **Preparar:** Abrir um board novo em branco
- **Passos:** Importar um .svg e um .csv
- **Texto alternativo:** Modal Exportar/Importar na aba Importar · tema claro

</details>

Relacionadas: [FT-IMPORTAR-002](#ft-importar-002), [FT-IMPORTAR-003](#ft-importar-003), [FT-IMPORTAR-004](#ft-importar-004), [FT-IMPORTAR-005](#ft-importar-005), [FT-IMPORTAR-006](#ft-importar-006)

### FT-IMPORTAR-002

**Colar de qualquer lugar** — Ctrl + V entende objetos do LuDraw, imagens, SVG, tabelas, listas e texto e transforma em objetos nativos.

**Como usar:**

1. Copie de outro programa.
2. Clique no board e pressione Ctrl + V.
3. Lista vira post-its, parágrafo vira texto, tabela vira tabela nativa.

Relacionadas: [FT-IMPORTAR-006](#ft-importar-006), [FT-IMPORTAR-007](#ft-importar-007)

### FT-IMPORTAR-003

**SVG vetorial editável** — Retângulos, círculos e caminhos do SVG viram formas e conectores nativos editáveis.

**Como usar:**

1. Importe um .svg ou cole o código <svg>.
2. Edite cores, textos e setas como objetos do board.

### FT-IMPORTAR-004

**Arquivos .excalidraw** — Formas, textos, setas ligadas, traços, imagens e frames de arquivos .excalidraw viram objetos nativos.

**Como usar:**

1. Importe o arquivo .excalidraw (ou cole o conteúdo).
2. Confira o resumo e insira.

### FT-IMPORTAR-005

**Importar planilha** — Planilhas .xlsx, .ods, .csv e .tsv viram Tabela, Kanban ou Post-its, com prévia, escolha de aba e cabeçalho.

**Como usar:**

1. Importe ou cole a planilha.
2. No modal Importar planilha, confira a prévia, a aba e Primeira linha é cabeçalho.
3. Escolha o destino (Tabela, Kanban ou Post-its) e, se quiser, Criar um frame com o nome da planilha.

<details><summary>Roteiro de captura</summary>

- **Preparar:** Abrir um board novo em branco
- **Passos:** Importar um .xlsx com 3 colunas; Escolher destino Kanban
- **Texto alternativo:** Modal Importar planilha com prévia · tema claro

</details>

Relacionadas: [FT-OBJETOS-019](#ft-objetos-019), [FT-OBJETOS-018](#ft-objetos-018)

### FT-IMPORTAR-006

**Inspetor de colagem** — Mostra o que está na área de transferência, o que será lido e a prévia antes de inserir.

**Como usar:**

1. Abra Ficha do board → Importar… → Inspetor de colagem.
2. Cole na área indicada.
3. Confira os tipos recebidos e o plano; insira, cole como texto ou como imagem.

Relacionadas: [FT-IMPORTAR-002](#ft-importar-002), [FT-IMPORTAR-007](#ft-importar-007)

### FT-IMPORTAR-007

**Proteção contra dado codificado** — Texto colado que parece dado codificado de outro programa não é inserido sem confirmação.

**Como usar:**

1. Cole um texto muito longo e codificado.
2. O app avisa e oferece Inserir mesmo assim ou Colar como texto.

### FT-IMPORTAR-008

**Importar backup .ludraw** — Restaura um board a partir do arquivo de backup.

**Como usar:**

1. Abra Ficha do board → Importar… e escolha o arquivo .ludraw (ou Novo board → Importar backup (.ludraw) na Mesa).
2. Confira o plano e insira.

## Exportar

| ID | Função | Status | Desde | Onde encontrar | Atalho |
|---|---|---|---|---|---|
| `FT-EXPORTAR-001` | Exportar como imagem PNG | estável | Chat 01 | Ficha do board → Exportar… → Imagem PNG | — |
| `FT-EXPORTAR-002` | Salvar como PDF | estável | Chat 01 | Ficha do board → Exportar… → PDF — página única | — |
| `FT-EXPORTAR-003` | SVG vetorial | estável | Chat 05 | Ficha do board → Exportar… | — |
| `FT-EXPORTAR-004` | PDF multipáginas por frames | estável | Chat 05 | Ficha do board → Exportar… → PDF — multipáginas por frames | — |
| `FT-EXPORTAR-005` | CSV de issues para rastreadores | estável | Chat 05 | Ficha do board → Exportar… → CSV de issues (rastreadores) | — |
| `FT-EXPORTAR-006` | Tabelas em CSV e de volta para planilhas | estável | Chat 05 | Clique direito na célula → Levar para planilhas | — |
| `FT-EXPORTAR-007` | Lista de objetos em CSV | estável | Chat 01 | Clique direito no objeto → Exportar e info → Exportar para CSV (planilha) | — |
| `FT-EXPORTAR-008` | Exportar um frame | estável | Chat 03 | Clique direito no objeto → Frame e modelo → Exportar frame | — |
| `FT-EXPORTAR-009` | Backup do board (.ludraw) | estável | Chat 01 | Ficha do board → Exportar… → Backup .ludraw | — |
| `FT-EXPORTAR-010` | Copiar como imagem | estável | Chat 01 | Clique direito no objeto → Copiar como → Imagem | `Ctrl + Shift + C` |
| `FT-EXPORTAR-011` | Todos os formatos (modal Exportar) | estável | Chat 05 | Ficha do board → Exportar… | — |

### FT-EXPORTAR-001

**Exportar como imagem PNG** — PNG em 1x, 2x ou 4x do board inteiro ou só da seleção.

**Como usar:**

1. Abra Ficha do board → Exportar… → Imagem PNG.
2. Escolha o que exportar e a qualidade, confira a prévia e exporte.

**Permissões envolvidas:** `board.export`

### FT-EXPORTAR-002

**Salvar como PDF** — PDF de página única com o board inteiro.

**Como usar:**

1. Abra Ficha do board → Exportar… → PDF — página única.
2. Escolha o que exportar e exporte.

**Permissões envolvidas:** `board.export`

### FT-EXPORTAR-003

**SVG vetorial** — Exporta board, seleção ou frames como SVG com formas, linhas e textos vetoriais.

**Como usar:**

1. Abra Ficha do board → Exportar… e escolha SVG.
2. Escolha o que exportar (board, seleção ou frames) e baixe.

**Permissões envolvidas:** `board.export`

### FT-EXPORTAR-004

**PDF multipáginas por frames** — Um PDF com uma página por frame, na ordem dos slides, com resolução para impressão.

**Como usar:**

1. Organize os slides no Roteiro (Vista).
2. Abra Ficha do board → Exportar… → PDF — multipáginas por frames.
3. Escolha a resolução e exporte.

**Permissões envolvidas:** `board.export`

<details><summary>Roteiro de captura</summary>

- **Preparar:** Abrir o modelo "Retrospectiva ágil"
- **Passos:** Exportar PDF multipáginas por frames em 3x
- **Texto alternativo:** Resumo da exportação de PDF por frames · tema claro

</details>

### FT-EXPORTAR-005

**CSV de issues para rastreadores** — Post-its e cards viram linhas de issue (resumo, tipo, prioridade, responsável, etiquetas, votos…) para importar em rastreadores.

**Como usar:**

1. Abra Ficha do board → Exportar… → CSV de issues (rastreadores).
2. Escolha o tipo e as colunas extras.
3. Baixe e importe no seu rastreador.

**Permissões envolvidas:** `board.export`

Relacionadas: [FT-OBJETOS-018](#ft-objetos-018), [FT-OBJETOS-001](#ft-objetos-001)

### FT-EXPORTAR-006

**Tabelas em CSV e de volta para planilhas** — Exporta tabelas em CSV (ponto e vírgula ou vírgula) ou copia como TSV + HTML preservando mesclagens e cores.

**Como usar:**

1. Clique direito numa célula → Levar para planilhas.
2. Copie a tabela inteira (TSV + HTML) ou exporte a tabela em CSV.
3. Ou use Ficha do board → Exportar… → Tabelas em CSV.

**Permissões envolvidas:** `board.export`

### FT-EXPORTAR-007

**Lista de objetos em CSV** — Exporta os objetos selecionados em CSV, com proteção contra fórmulas.

**Como usar:**

1. Selecione os objetos.
2. Clique direito → Exportar e info → Exportar para CSV (planilha).

**Permissões envolvidas:** `board.export`

### FT-EXPORTAR-008

**Exportar um frame** — Exporta só um frame em PDF de alta resolução, PNG 2x/4x ou SVG.

**Como usar:**

1. Clique direito no frame → Frame e modelo → Exportar frame (ou Exportar na Cinta do frame).
2. Escolha PDF (alta resolução), PNG — Alta qualidade (2x), PNG — Ultra HD (4x) ou SVG vetorial.

**Permissões envolvidas:** `board.export`

### FT-EXPORTAR-009

**Backup do board (.ludraw)** — Arquivo com todo o conteúdo do board para guardar ou mover entre computadores.

**Como usar:**

1. Abra Ficha do board → Exportar… → Backup .ludraw.
2. Guarde o arquivo .ludraw.

### FT-EXPORTAR-010

**Copiar como imagem** — Copia a seleção como imagem para colar em outros programas.

**Como usar:**

1. Selecione os objetos.
2. Pressione Ctrl + Shift + C e cole onde quiser.

**Permissões envolvidas:** `board.export`

### FT-EXPORTAR-011

**Todos os formatos (modal Exportar)** — Um só lugar para exportar board, seleção ou frames em qualquer formato, com resumo do que sai.

**Como usar:**

1. Abra Ficha do board → Exportar….
2. Escolha o formato e o que exportar.
3. Confira o resumo e exporte.

**Permissões envolvidas:** `board.export`

Relacionadas: [FT-EXPORTAR-001](#ft-exportar-001), [FT-EXPORTAR-002](#ft-exportar-002), [FT-EXPORTAR-003](#ft-exportar-003), [FT-EXPORTAR-004](#ft-exportar-004), [FT-EXPORTAR-005](#ft-exportar-005), [FT-EXPORTAR-006](#ft-exportar-006)

## Mesa (dashboard)

| ID | Função | Status | Desde | Onde encontrar | Atalho |
|---|---|---|---|---|---|
| `FT-DASHBOARD-001` | Mesa (início) | estável | Chat 02 | `#/` | — |
| `FT-DASHBOARD-002` | Busca de boards e ações | estável | Chat 02 | — | `Ctrl + K` |
| `FT-DASHBOARD-003` | Novo board (em branco, guiado, template ou backup) | estável | Chat 02 | Mais formas de criar um board → Comece por aqui (guiado) | — |
| `FT-DASHBOARD-004` | Favoritos e recentes | estável | Chat 01 | `#/favorites` | — |
| `FT-DASHBOARD-005` | Ações do cartão de board | estável | Chat 01 | Mais opções → Duplicar | — |
| `FT-DASHBOARD-006` | Board de boas-vindas "Comece por aqui" | estável | Chat 02 | Mais formas de criar um board → Comece por aqui (guiado) | — |
| `FT-DASHBOARD-007` | Organização, times e projetos | estável | Chat 06 | + Novo time → + Novo projeto → Mover para… | — |
| `FT-DASHBOARD-008` | Notificações | planejada | Chat 07 | — | — |
| `FT-DASHBOARD-009` | Busca global profunda | estável | Chat 06 | — | `Ctrl + K` |

### FT-DASHBOARD-001

**Mesa (início)** — Lista de boards em grade ou lista, com abas Todos, Meus, Favoritos, Recentes e Templates, ordenação e filtro.

**Como usar:**

1. Abra o app: a Mesa mostra Retomar, Começar com… e seus boards.
2. Alterne Grade / Lista e use Ordenar por e Filtrar por tipo.

<details><summary>Roteiro de captura</summary>

- **Preparar:** Ter 4 boards criados
- **Passos:** Abrir a Mesa em grade
- **Texto alternativo:** Mesa com cartões de boards · tema claro

</details>

### FT-DASHBOARD-002

**Busca de boards e ações** — Paleta de comandos para abrir boards e executar ações sem tirar a mão do teclado.

**Como usar:**

1. Na Mesa, pressione Ctrl + K (ou clique em Buscar).
2. Digite o nome do board ou da ação.
3. Enter abre.

### FT-DASHBOARD-003

**Novo board (em branco, guiado, template ou backup)** — Cria board em branco, guiado (Comece por aqui), a partir de template ou importando backup.

**Como usar:**

1. Na Mesa, clique em Novo board (em branco) ou na seta ao lado.
2. Escolha Comece por aqui (guiado), A partir de template… ou Importar backup (.ludraw).

### FT-DASHBOARD-004

**Favoritos e recentes** — Marque boards como favoritos e reencontre os recentes.

**Como usar:**

1. Clique na estrela do cartão (ou Marcar como favorito na Ficha do board).
2. Abra as abas Favoritos ou Recentes; no board, Ctrl K também lista Favoritos e Recentes.

### FT-DASHBOARD-005

**Ações do cartão de board** — Abrir, renomear, duplicar, fazer backup, ver detalhes e excluir direto da Mesa.

**Como usar:**

1. Na Mesa, clique em Mais opções no cartão.
2. Escolha Abrir, Renomear, Duplicar, Fazer backup (.ludraw), Detalhes ou Excluir.

### FT-DASHBOARD-006

**Board de boas-vindas "Comece por aqui"** — Board guiado com passo a passo e mini fluxograma, criado na primeira abertura.

**Como usar:**

1. Abra o app pela primeira vez (ou crie um board guiado).
2. Siga os passos numerados.

### FT-DASHBOARD-007

**Organização, times e projetos** — Seletor em trilha Organização › Time › Projeto, com Espaço pessoal privado, Compartilhados comigo e Geral; num time, os projetos aparecem como pastas e os boards de projeto levam um selo de pasta.

**Como usar:**

1. Clique na trilha ao lado do logo, no cabeçalho da Mesa.
2. Escolha Espaço pessoal, Compartilhados comigo, Geral ou um time; dentro do time, abra um projeto pela pasta.
3. Crie times (administradores) e projetos (membros, se a política permitir) pelo rodapé do seletor.
4. No ⋯ de um board, use Mover para… para trocar o lugar.

**Permissões envolvidas:** `workspace.teams.manage`, `workspace.projects.create`, `board.move`

Relacionadas: [FT-GOVERNANCA-007](#ft-governanca-007)

### FT-DASHBOARD-008

**Notificações** — Central de notificações de menções e atividades.

**Situação:**

1. Planejado para o Chat 07 (colaboração).

### FT-DASHBOARD-009

**Busca global profunda** — Procura pelo nome do board, pelo time/projeto e pelo texto dentro de post-its, formas, textos, frames, mapas mentais, Kanbans e tabelas — só nos boards que a pessoa pode ver.

**Como usar:**

1. Na Mesa, clique no campo de busca do cabeçalho ou tecle Ctrl + K.
2. Digite pelo menos 2 letras: aparecem os boards e o grupo Dentro dos boards.
3. Escolha um resultado: o board abre com o objeto encontrado selecionado.

**Permissões envolvidas:** `board.view`

Relacionadas: [FT-DASHBOARD-007](#ft-dashboard-007)

## Sistema

| ID | Função | Status | Desde | Onde encontrar | Atalho |
|---|---|---|---|---|---|
| `FT-SISTEMA-001` | Salvamento automático local | estável | Chat 01 | — | — |
| `FT-SISTEMA-002` | Login local e perfil | estável | Chat 01 | `#/settings/profile` | — |
| `FT-SISTEMA-003` | Configurações pessoais de notificações | estável | Chat 01 | `#/settings/notifications` | — |
| `FT-SISTEMA-004` | Tema claro e escuro | estável | Chat 01 | — | — |
| `FT-SISTEMA-005` | Painel do board | removida | Chat 02 | — | `\ ou Ctrl + /` |
| `FT-SISTEMA-006` | Preferências de entrada e seleção | estável | Chat 01 | Você → Navegar com | — |
| `FT-SISTEMA-007` | Sistema visual (Design System vivo) | estável | Chat 01 | `#/design-system` | — |
| `FT-SISTEMA-008` | Splash de abertura | estável | Chat 03 | — | — |
| `FT-SISTEMA-009` | Atalhos de teclado (lista) | estável | Chat 01 | Menu do usuário → Atalhos de teclado | `?` |
| `FT-SISTEMA-010` | Fontes autohospedadas (funciona offline) | estável | Chat 05.5 | — | — |
| `FT-SISTEMA-011` | Idioma da interface | estável | Chat 05.6 | `#/settings/profile` | — |
| `FT-SISTEMA-012` | Idiomas da comunidade | estável | Chat 05.6 | `#/settings/profile` | — |
| `FT-SISTEMA-013` | Armazenamento local sem limite de 5 MB | estável | Chat 06 | — | — |
| `FT-SISTEMA-014` | Cadastro por convite e modo offline isolado | estável | Chat 06 | Tenho um convite | — |
| `FT-SISTEMA-015` | Modo Servidor (conectar a um servidor da equipe) | estável | Chat 07 | Conectar a um servidor Homelab → Configurar servidor… → Permitir modo local neste servidor · `#/settings/profile` | — |
| `FT-SISTEMA-016` | Primeiro acesso do servidor | estável | Chat 07 | `#/setup` | — |
| `FT-SISTEMA-017` | Configuração por variáveis e recuperação pela linha de comando | estável | Chat 07 | — | — |
| `FT-SISTEMA-018` | Trazer boards deste navegador para o servidor | beta | Chat 08.2 | Trazer boards deste navegador · `#/settings/profile` | — |
| `FT-SISTEMA-019` | Ficha do board | estável | Chat 08.2 | Ficha do board | `\ ou Ctrl + /` |
| `FT-SISTEMA-020` | Caixa de ferramentas | estável | Chat 08.2 | Dock: Caixa de ferramentas | `/` |
| `FT-SISTEMA-021` | Esqueci minha senha por e-mail | estável | Chat 08.5 | Esqueci minha senha · `#/forgot` | — |
| `FT-SISTEMA-022` | Confirmar o e-mail | estável | Chat 08.5 | Mesa → Enviar link de confirmação · `#/` | — |
| `FT-SISTEMA-023` | Aviso do Modo Local com servidor | estável | Chat 08.5 | Mesa → Ficha do board → Só neste navegador | — |
| `FT-SISTEMA-024` | Instalação com Docker, backup e restauração | estável | Chat 09 | — | — |
| `FT-SISTEMA-025` | Aplicativo desktop (Windows e Linux) | beta | Chat 09.1 | Trocar onde trabalhar… | — |

### FT-SISTEMA-001

**Salvamento automático local** — Tudo é salvo neste dispositivo automaticamente, com indicador ao lado do nome do board.

**Como usar:**

1. Edite normalmente.
2. O indicador ao lado do nome do board mostra "Salvando neste dispositivo…" e depois "Salvo neste dispositivo".

### FT-SISTEMA-002

**Login local e perfil** — Conta local com nome, e-mail, organização e função.

**Como usar:**

1. Entre com uma conta local.
2. Abra Configurações (menu do usuário) → Perfil e edite os dados.

### FT-SISTEMA-003

**Configurações pessoais de notificações** — Escolhe o que notifica e por qual canal. Desde o Chat 06, membros e convites ficam na Administração do Workspace.

**Como usar:**

1. Abra o menu do usuário → Configurações.
2. Escolha a aba Notificações.

Relacionadas: [FT-GOVERNANCA-007](#ft-governanca-007)

### FT-SISTEMA-004

**Tema claro e escuro** — Alterna o tema da interface; post-its e conteúdo mantêm as cores.

**Como usar:**

1. Abra o Painel (\ ou Ctrl + /).
2. Clique em Alternar tema; sem escolha salva, o app segue o tema do sistema.

### FT-SISTEMA-005

**Painel do board** — Painel lateral com abas Navegação, Frames, Comentários, Atividades e Tags — substituído pelas gavetas do Estúdio v2 no Chat 08.2.

**Como usar:**

1. Pressione \ ou Ctrl + / para reabrir a última gaveta usada (ou a Ficha do board).
2. F6 / Shift + F6 passam pelas regiões: Ficha, Roda, Vista, Tempo e Dock; Esc fecha a gaveta e devolve o foco.

### FT-SISTEMA-006

**Preferências de entrada e seleção** — Escolhe mouse ou trackpad (ou detecção automática) e se o retângulo de seleção pega objetos só de passar por cima.

**Como usar:**

1. Clique em Você (seu avatar, no fim da barra do topo) → Navegar com e escolha Automático, Mouse ou Trackpad.
2. Ligue ou desligue Selecionar só de passar por cima.

### FT-SISTEMA-007

**Sistema visual (Design System vivo)** — Tela com tokens, componentes e telas, organizada por tipo de design (cada assunto uma vez, na versão atual), para quem contribui.

> Ferramenta de desenvolvimento: aparece só sem servidor ou com `LUDRAW_ENABLE_DESIGN_SYSTEM` ligada no servidor (a imagem Docker desliga).

**Como usar:**

1. Abra o menu do usuário → Sistema visual (ou a rota #/design-system). Só aparece sem servidor ou com LUDRAW_ENABLE_DESIGN_SYSTEM ligado no servidor (padrão no desenvolvimento; a imagem Docker desliga, e então a rota leva à tela inicial).
2. Use o índice ou os atalhos da barra do topo para ir a um grupo (Fundamentos, Componentes base, Estúdio, Canvas e objetos, Facilitação e governança, Colaboração ao vivo, Mesa, Telas e fluxos).

### FT-SISTEMA-008

**Splash de abertura** — Logo animado enquanto o app carrega, respeitando o tema e Reduzir movimento.

**Como usar:**

1. Abra o app.
2. A splash some quando os dados e as fontes estão prontos (com Reduzir movimento, sem animação).

### FT-SISTEMA-009

**Atalhos de teclado (lista)** — Lista dos atalhos agrupados por Ferramentas, Edição e Visualização.

**Como usar:**

1. Pressione ? no board (ou menu do usuário → Atalhos de teclado).
2. Os atalhos de um caractere podem ser desligados em Acessibilidade.

### FT-SISTEMA-010

**Fontes autohospedadas (funciona offline)** — As 18 famílias de fontes vêm com o app; nada é baixado de servidores de fontes, também offline e no export.

**Como usar:**

1. Use qualquer uma das 40 fontes na gaveta Estilo do texto da Cinta, mesmo sem internet.
2. O export espera as fontes carregarem antes de desenhar.

### FT-SISTEMA-011

**Idioma da interface** — Interface em português (Brasil) ou inglês, com troca na hora, opção de seguir o navegador e datas, números e listas no formato do idioma.

**Como usar:**

1. Abra Configurações (menu do usuário) → Perfil.
2. Em “Idioma e região”, escolha o idioma ou “Seguir o navegador”; a interface muda sem recarregar e a escolha fica salva.
3. Conteúdo novo (board de boas-vindas, templates, colunas do Kanban) nasce no idioma ativo; o que você já escreveu nunca é traduzido.
4. Para testar traduções, acrescente ?lang=<código> à URL (ex.: ?lang=qps mostra o pseudo-idioma).

<details><summary>Roteiro de captura</summary>

- **Preparar:** Abrir o app com um board aberto e o Painel na aba Atividades
- **Passos:** Configurações → Perfil → Idioma e região → English; Voltar ao board: barra do topo, Dock, gavetas e linha do tempo em inglês, sem recarregar; Abrir com ?lang=qps para ver o pseudo-idioma
- **Texto alternativo:** Configurações com o seletor de idioma em English e o board com a interface em inglês · tema claro

</details>

Relacionadas: [FT-SISTEMA-012](#ft-sistema-012), [FT-COLABORACAO-002](#ft-colaboracao-002)

### FT-SISTEMA-012

**Idiomas da comunidade** — Qualquer pessoa pode acrescentar um idioma só com arquivos JSON; o app o encontra sozinho e completa o que faltar com o idioma de reserva.

**Como usar:**

1. Copie src/locales/en para src/locales/<código> e traduza os valores (guia em docs/TRANSLATING.md).
2. Rode npm run audit:i18n até zerar os erros e teste com ?lang=<código>.
3. Com status “community” no _meta.json, o idioma aparece em Configurações → Perfil → Idioma e região; em “draft”, só por ?lang=.

Relacionadas: [FT-SISTEMA-011](#ft-sistema-011)

Mais detalhes: `docs/TRANSLATING.md`

### FT-SISTEMA-013

**Armazenamento local sem limite de 5 MB** — Os boards e o histórico de versões ficam no banco do navegador (IndexedDB), com migração automática do armazenamento antigo e alternativa segura quando o navegador não libera o banco.

**Como usar:**

1. Nada a fazer: na primeira abertura depois da atualização, os boards migram sozinhos e um aviso confirma.
2. Em Administração → Backup, a linha de armazenamento mostra qual banco está em uso.

Relacionadas: [FT-GOVERNANCA-011](#ft-governanca-011)

### FT-SISTEMA-014

**Cadastro por convite e modo offline isolado** — Depois que a organização tem um administrador, novas contas só entram por convite; “Continuar sem conta” vira um espaço isolado, só com os próprios boards.

**Como usar:**

1. Na tela de entrada, a aba Criar conta avisa quando a organização só aceita convites.
2. Use Tenho um convite e cole o código ou o link recebido.
3. Continuar sem conta abre o Modo offline: seus boards ficam separados da organização.

**Permissões envolvidas:** `workspace.boards.create`

Relacionadas: [FT-COLABORACAO-005](#ft-colaboracao-005), [FT-GOVERNANCA-007](#ft-governanca-007)

### FT-SISTEMA-015

**Modo Servidor (conectar a um servidor da equipe)** — Liga o app a um servidor LuDraw da equipe (sozinho, quando aberto pelo endereço dele): boards, pessoas, permissões e links passam a ficar no servidor; o Modo Local continua separado.

**Como usar:**

1. Abra o app pelo endereço do servidor: ele detecta o servidor sozinho e vai para o primeiro acesso ou para a entrada com o nome da organização.
2. App aberto fora do servidor: na tela de entrada clique em Conectar a um servidor Homelab, digite o endereço e clique em Testar conexão; confira a organização e clique em Conectar (o app recarrega).
3. Entre com e-mail e senha ou com o login da empresa. Mudanças salvas em outra janela ou por outra pessoa aparecem num aviso com Recarregar.
4. O Modo Local, com servidor, vem bloqueado; o admin libera em Admin → Políticas → Permitir modo local neste servidor (ou LUDRAW_ALLOW_LOCAL_MODE). Aí a entrada mostra Usar só neste navegador (sem sincronizar).

**Permissões envolvidas:** `workspace.boards.create`

<details><summary>Roteiro de captura</summary>

- **Preparar:** Servidor local rodando (npm run server:dev) com o banco vazio; App em npm run dev
- **Passos:** Abrir o app pelo endereço do servidor (detecção automática); Concluir o primeiro acesso (#/setup); Criar um board e ver o selo Salvo no servidor ao lado do nome do board
- **Texto alternativo:** Janela de conexão com o servidor mostrando a organização encontrada · tema claro

</details>

Relacionadas: [FT-SISTEMA-016](#ft-sistema-016), [FT-GOVERNANCA-012](#ft-governanca-012), [FT-GOVERNANCA-013](#ft-governanca-013), [FT-SISTEMA-023](#ft-sistema-023), [FT-GOVERNANCA-016](#ft-governanca-016)

### FT-SISTEMA-016

**Primeiro acesso do servidor** — Assistente de 3 passos (organização, administrador, pronto) que só aparece com o banco vazio, exige o token impresso nos logs do servidor e deixa de existir depois de concluído.

**Como usar:**

1. Suba o servidor e copie o token de configuração que aparece uma vez no log (perdeu? npm run setup:token; no Docker: docker compose exec app ludraw setup:token).
2. Conecte o app ao servidor: o assistente abre sozinho.
3. Passo 1: token, nome da organização, domínios permitidos e o modo da instalação (definitivo).
4. Passo 2: seu nome, e-mail e senha; confira o resumo e clique em Criar organização.
5. Passo 3: crie o primeiro Time ou convide alguém; o assistente não volta mais.

Relacionadas: [FT-SISTEMA-015](#ft-sistema-015), [FT-SISTEMA-017](#ft-sistema-017)

### FT-SISTEMA-017

**Configuração por variáveis e recuperação pela linha de comando** — Para homelab/DevOps: LUDRAW_ORG_NAME, LUDRAW_ADMIN_EMAIL e LUDRAW_ADMIN_PASSWORD (ou _FILE) criam a organização no primeiro boot; admin:create e admin:reset-password recuperam o acesso, tudo no Audit Log.

**Como usar:**

1. Defina as variáveis LUDRAW_* no server/.env (ver server/.env.example) e suba o servidor com o banco vazio.
2. Entre com o administrador criado: a troca de senha é obrigatória no primeiro login; depois remova a senha do .env.
3. Para recuperar o acesso: npm run admin:reset-password -- --email <e-mail> (ou --generate) no servidor (no Docker: docker compose exec app ludraw admin:reset-password --email <e-mail> --generate).
4. Para criar outro administrador: npm run admin:create -- --email <e-mail> --name <nome>.

Relacionadas: [FT-SISTEMA-016](#ft-sistema-016), [FT-GOVERNANCA-013](#ft-governanca-013), [FT-SISTEMA-024](#ft-sistema-024)

### FT-SISTEMA-018

**Trazer boards deste navegador para o servidor** — No Modo Servidor, copia para a organização os boards criados no Modo Local deste navegador: você escolhe quais e o destino; as cópias locais ficam intactas, nada é duplicado e cada board recusado mostra o motivo.

**Como usar:**

1. Na Mesa, quando aparecer a faixa sobre boards do Modo Local, clique em Trazer boards deste navegador (ou vá em Configurações → Perfil → Sessão).
2. Marque os boards e escolha o destino (Espaço pessoal, Geral ou um time/projeto em que você pode criar boards).
3. Clique em Trazer: os que estiverem acima dos limites mostram o motivo e não impedem os outros; os já trazidos aparecem como Já está no servidor.

**Permissões envolvidas:** `workspace.boards.create`

Relacionadas: [FT-SISTEMA-015](#ft-sistema-015), [FT-GOVERNANCA-013](#ft-governanca-013)

### FT-SISTEMA-019

**Ficha do board** — Nome, favorito, lugar, ações do board (novo, duplicar, exportar, importar, modelo, histórico, fundo, tags) e detalhes como dono, datas e tamanho, num só cartão.

**Como usar:**

1. Clique no nome do board, no começo da barra do topo.
2. Renomeie, marque como favorito ou use Mover para… para trocar o lugar.
3. Use os atalhos da grade para exportar, importar, salvar como modelo, abrir o histórico, mudar o fundo ou as tags.
4. Confira em Detalhes o dono, as datas, quem editou por último e o tamanho.

**Permissões envolvidas:** `board.edit`, `board.move`, `board.delete`

Relacionadas: [FT-CANVAS-009](#ft-canvas-009), [FT-EXPORTAR-011](#ft-exportar-011), [FT-IMPORTAR-001](#ft-importar-001)

### FT-SISTEMA-020

**Caixa de ferramentas** — Tudo o que se insere no board, agrupado pelo que você quer fazer (Organizar, Diagramar, Apresentar, Trazer e levar), com busca, recentes e uma seção própria para o que vem de extensões.

**Como usar:**

1. Clique na Caixa de ferramentas, no fim da Dock (ou aperte /): a busca já vem focada.
2. Digite para filtrar tudo, inclusive extensões; Enter insere o primeiro resultado no centro da tela.
3. Use o filtro Tudo · Do LuDraw · Extensões; o que vem de extensão aparece em "Das extensões ativas", com o nome da extensão e o tipo.
4. Itens com o selo "Em breve" aparecem desabilitados até ficarem prontos.

Relacionadas: [FT-EXTENSOES-009](#ft-extensoes-009), [FT-OBJETOS-018](#ft-objetos-018), [FT-FACILITACAO-006](#ft-facilitacao-006)

### FT-SISTEMA-021

**Esqueci minha senha por e-mail** — Com e-mail no servidor, a pessoa recebe um link de uso único (30 min) para criar outra senha; a resposta é a mesma exista ou não a conta.

**Como usar:**

1. Na tela de entrada, clique em Esqueci minha senha.
2. Digite o seu e-mail e envie: a tela confirma do mesmo jeito para qualquer endereço.
3. Abra o link recebido por e-mail e crie a nova senha (todas as sessões abertas são encerradas).

Relacionadas: [FT-GOVERNANCA-016](#ft-governanca-016), [FT-GOVERNANCA-013](#ft-governanca-013)

### FT-SISTEMA-022

**Confirmar o e-mail** — Uma faixa na Mesa pede a confirmação do e-mail; confirmado, ele passa a servir para recuperar a senha e receber convites.

**Como usar:**

1. Com e-mail no servidor e o seu ainda não confirmado, a Mesa mostra Confirme seu e-mail.
2. Clique em Enviar link de confirmação.
3. Abra o link recebido (vale por 60 minutos, em qualquer navegador).

Relacionadas: [FT-SISTEMA-021](#ft-sistema-021)

### FT-SISTEMA-023

**Aviso do Modo Local com servidor** — No Modo Local de um app que tem servidor, uma faixa na Mesa e um selo no board lembram que os boards ficam só neste navegador, com o botão Entrar no servidor.

**Como usar:**

1. Com o Modo Local permitido pelo servidor, na entrada clique em Usar só neste navegador (sem sincronizar) e depois em Continuar sem conta.
2. A Mesa mostra a faixa Modo Local: estes boards ficam só neste navegador…; no board, o selo Só neste navegador aparece ao lado de Salvo.
3. Clique no selo: a gaveta Você mostra o aviso com Entrar no servidor.
4. Entrar no servidor grava o board e volta ao Modo Servidor; lá, Trazer boards deste navegador leva os boards para a organização.

Relacionadas: [FT-SISTEMA-015](#ft-sistema-015), [FT-SISTEMA-018](#ft-sistema-018)

### FT-SISTEMA-024

**Instalação com Docker, backup e restauração** — Imagem única (app, API e tempo real) e docker-compose de produção com PostgreSQL, migração separada e senhas por arquivo, mais backup e restauração com SHA-256 conferido.

**Como usar:**

1. Na pasta do repositório: node scripts/docker-secrets.mjs (gera os segredos em deploy/secrets/ sem mostrar os valores).
2. Opcional: copie deploy/ludraw.env.example para deploy/ludraw.env e defina o endereço público, o e-mail ou o SSO.
3. docker compose up -d --build sobe o banco, a migração e o app; abra http://localhost:8080 e conclua o Primeiro acesso do servidor com o token de docker compose logs app.
4. Várias instâncias (opcional): node scripts/docker-secrets.mjs, LUDRAW_REDIS_URL_FILE=/run/secrets/redis_url no deploy/ludraw.env e docker compose --profile redis up -d (Valkey) — limites de tentativa e o painel de e-mail passam a valer para todas.
5. Backup: node scripts/docker-backup.mjs backup (pasta com o banco, as imagens e o manifest.json).
6. Restauração: node scripts/docker-backup.mjs restore <pasta> --yes (apaga o conteúdo atual do banco; funciona numa máquina nova, com segredos novos). Guia completo em docs/DOCKER.md e docs/BACKUP.md.

Relacionadas: [FT-SISTEMA-016](#ft-sistema-016), [FT-SISTEMA-017](#ft-sistema-017)

### FT-SISTEMA-025

**Aplicativo desktop (Windows e Linux)** — Programa que abre o LuDraw numa janela própria e, no primeiro uso, pergunta onde trabalhar: neste computador (Modo Local) ou no servidor da organização. Lembra a escolha e explica cada problema de conexão.

**Como usar:**

1. Primeira abertura: escolha Trabalhar neste computador (sem internet e sem conta) ou digite o endereço do servidor e clique em Conectar.
2. O servidor é testado antes de abrir: aparecem a organização, o login da empresa e onde ele abre. Se algo falhar, a tela diz o motivo (endereço, rede, certificado, versão) e o que fazer.
3. Depois disso o programa abre direto no lugar escolhido. Para mudar: menu LuDraw → Trocar onde trabalhar…, ou Configurações → Configurar servidor… no Modo Local.
4. Links para outros sites abrem no navegador do sistema e os arquivos exportados vão para a pasta Downloads. Os boards deste computador não aparecem no navegador nem no servidor: leve-os por exportação ou backup.
5. Instale pelo instalador do Windows (só para o seu usuário, sem administrador) ou pelo pacote .deb do Linux, e confira o arquivo pelo SHA256SUMS. Desinstalar não apaga os boards. Ao fechar, o programa espera o board terminar de gravar.

Relacionadas: [FT-SISTEMA-015](#ft-sistema-015)

## Acessibilidade

| ID | Função | Status | Desde | Onde encontrar | Atalho |
|---|---|---|---|---|---|
| `FT-ACESSIBILIDADE-001` | Reduzir movimento | estável | Chat 01 | Você → Reduzir movimento | — |
| `FT-ACESSIBILIDADE-002` | Atalhos de um caractere desligáveis | estável | Chat 01 | Você → Atalhos de teclado de um caractere | — |
| `FT-ACESSIBILIDADE-003` | Seleção precisa | estável | Chat 01 | Você → Seleção precisa | — |

### FT-ACESSIBILIDADE-001

**Reduzir movimento** — Diminui as animações da interface e da splash.

**Como usar:**

1. Abra Você (seu avatar, na barra do topo).
2. Ligue Reduzir movimento.

### FT-ACESSIBILIDADE-002

**Atalhos de um caractere desligáveis** — Desliga os atalhos de uma tecla (V, N, T…) para quem usa leitor de tela ou teclados especiais.

**Como usar:**

1. Abra Você (seu avatar, na barra do topo).
2. Desmarque Atalhos de teclado de um caractere.

### FT-ACESSIBILIDADE-003

**Seleção precisa** — Afina a área de clique de linhas e traços de caneta para selecionar exatamente o que está sob o cursor.

**Como usar:**

1. Abra Você (seu avatar, na barra do topo).
2. Ligue Seleção precisa.

## Extensões

| ID | Função | Status | Desde | Onde encontrar | Atalho |
|---|---|---|---|---|---|
| `FT-EXTENSOES-001` | Registries internos de importadores, exportadores, formas e modelos | estável | Chat 05 | — | — |
| `FT-EXTENSOES-002` | Plataforma de extensões | estável | Chat 06.5 | Configurações → Extensões · `#/settings/extensions` | — |
| `FT-EXTENSOES-003` | Modo Seguro das extensões | estável | Chat 06.5 | Configurações → Extensões → Modo Seguro · `#/settings/extensions` | — |
| `FT-EXTENSOES-004` | Política de extensões aplicada | estável | Chat 06.5 | `#/admin/policies` | — |
| `FT-EXTENSOES-005` | Tema Grafite (extensão oficial) | estável | Chat 06.5 | Configurações → Extensões → Tema da interface · `#/settings/extensions` | — |
| `FT-EXTENSOES-006` | Formas de fluxograma (extensão oficial) | estável | Chat 06.5 | Configurações → Extensões · Dock: Formas | — |
| `FT-EXTENSOES-007` | Modelos Scrum (extensão oficial) | estável | Chat 06.5 | Configurações → Extensões · Dock: Caixa de ferramentas | — |
| `FT-EXTENSOES-008` | Extensões programáveis isoladas | estável | Chat 06.5 | Configurações → Extensões · `#/settings/extensions` | — |
| `FT-EXTENSOES-009` | Comandos e painéis de extensões | estável | Chat 06.5 | Dock: Caixa de ferramentas | `Ctrl K` |
| `FT-EXTENSOES-010` | Contador de palavras (extensão oficial) | estável | Chat 06.5 | Configurações → Extensões | `Ctrl K` |
| `FT-EXTENSOES-011` | Formatos de diagrama abertos .drawio (extensão oficial) | estável | Chat 06.5 | Configurações → Extensões | — |

### FT-EXTENSOES-001

**Registries internos de importadores, exportadores, formas e modelos** — O núcleo registra 12 importadores, 8 exportadores, 11 formas e 6 modelos num mesmo mecanismo, base da futura plataforma de extensões.

**Como usar:**

1. Para desenvolvedores: veja src/extensions/registries.ts e src/extensions/core.ts.
2. Os modais Importar/Exportar e a Galeria de templates leem estes registries.

Mais detalhes: `ai-memory/EXTENSIONS_SPEC.md`

### FT-EXTENSOES-002

**Plataforma de extensões** — Pacotes declarativos e extensões programáveis em Web Worker isolado, instalados por arquivo local, com integridade conferida, permissões aprovadas e revogáveis e a política do workspace aplicada.

**Como usar:**

1. Abra Configurações → Extensões.
2. Ative uma extensão oficial ou use "Instalar arquivo .ludraw-ext…".
3. Confira licença, proveniência, permissões e o hash na tela de aprovação e confirme.
4. As contribuições aparecem no Dock, na Galeria, no Ctrl+K e no Painel sem recarregar.

**Permissões envolvidas:** `extensions.use`, `extensions.manage`, `extensions.useScripts`

Relacionadas: [FT-EXTENSOES-001](#ft-extensoes-001), [FT-EXTENSOES-003](#ft-extensoes-003), [FT-EXTENSOES-004](#ft-extensoes-004), [FT-EXTENSOES-005](#ft-extensoes-005), [FT-EXTENSOES-006](#ft-extensoes-006), [FT-EXTENSOES-007](#ft-extensoes-007)

Mais detalhes: `ai-memory/EXTENSIONS_SPEC.md`

### FT-EXTENSOES-003

**Modo Seguro das extensões** — Desliga todas as extensões de uma vez, sem desinstalar, pelo botão em Configurações ou abrindo o app com ?safe=1.

**Como usar:**

1. Abra Configurações → Extensões.
2. Ligue "Modo Seguro" (ou abra o endereço com ?safe=1 só naquela aba).
3. Desligue o Modo Seguro para voltar ao normal.

Relacionadas: [FT-EXTENSOES-002](#ft-extensoes-002)

### FT-EXTENSOES-004

**Política de extensões aplicada** — A política do workspace (todas, só pacotes declarativos ou nenhuma) e a lista de extensões permitidas valem na instalação e na ativação; visitantes de link público não usam extensões.

**Como usar:**

1. Em Administração do Workspace → Políticas, escolha o nível de extensões.
2. Opcional: preencha a lista de extensões permitidas com ids no formato dev.autor.nome.
3. Em Configurações → Extensões, extensões fora da política aparecem bloqueadas com o motivo.

**Permissões envolvidas:** `extensions.use`, `extensions.manage`, `extensions.useScripts`, `workspace.policies.manage`

Relacionadas: [FT-EXTENSOES-002](#ft-extensoes-002)

### FT-EXTENSOES-005

**Tema Grafite (extensão oficial)** — Tema neutro em tons de grafite para claro e escuro, com contraste AA conferido; vem embutido e desligado.

**Como usar:**

1. Em Configurações → Extensões, ative "Tema Grafite".
2. Em "Tema da interface", escolha Grafite.
3. Para voltar, escolha "Padrão do LuDraw" ou desative a extensão.

Relacionadas: [FT-EXTENSOES-002](#ft-extensoes-002)

### FT-EXTENSOES-006

**Formas de fluxograma (extensão oficial)** — Terminador, decisão, processo, documento e banco de dados no flyout Formas do Dock, com o desenho copiado no elemento.

**Como usar:**

1. Em Configurações → Extensões, ative "Formas de fluxograma".
2. No board, abra Formas no Dock e escolha uma forma da seção da extensão.
3. Clique ou arraste no canvas para criar; conecte como qualquer forma.

Relacionadas: [FT-EXTENSOES-002](#ft-extensoes-002)

### FT-EXTENSOES-007

**Modelos Scrum (extensão oficial)** — Planejamento, revisão e retrospectiva da sprint com estruturas protegidas, mais o elemento composto Cartão de história.

**Como usar:**

1. Em Configurações → Extensões, ative "Modelos Scrum".
2. Na Mesa, use "Começar com…" ou a Galeria de templates.
3. No board, insira o Cartão de história pela Caixa de ferramentas → Das extensões ativas.

Relacionadas: [FT-EXTENSOES-002](#ft-extensoes-002), [FT-FACILITACAO-006](#ft-facilitacao-006)

### FT-EXTENSOES-008

**Extensões programáveis isoladas** — O código da extensão roda num Web Worker isolado pela política do navegador, sem rede nem acesso ao app; tudo passa pela API ludraw.* com as permissões aprovadas.

**Como usar:**

1. Ative uma extensão programável em Configurações → Extensões.
2. Aprove as permissões pedidas (cada uma em linguagem simples).
3. Em Detalhes, revogue ou devolva permissões e veja a execução e os acessos à rede.

**Permissões envolvidas:** `extensions.use`, `extensions.manage`, `extensions.useScripts`, `board.edit`

Relacionadas: [FT-EXTENSOES-002](#ft-extensoes-002), [FT-EXTENSOES-003](#ft-extensoes-003), [FT-EXTENSOES-004](#ft-extensoes-004)

Mais detalhes: `ai-memory/EXTENSIONS_SPEC.md`

### FT-EXTENSOES-009

**Comandos e painéis de extensões** — Extensões acrescentam comandos ao Ctrl+K e à Caixa de ferramentas (seção "Das extensões ativas") e painéis isolados numa janela flutuante.

**Como usar:**

1. No board, aperte Ctrl+K ou abra a Caixa de ferramentas (/) e use o filtro Extensões: comandos, painéis, elementos e importadores ficam em "Das extensões ativas", com o nome da extensão e o tipo.
2. Painéis de extensões abrem numa janela flutuante: arraste pelo cabeçalho (ou use as setas com o foco nele) e feche com Esc.

Relacionadas: [FT-EXTENSOES-008](#ft-extensoes-008)

### FT-EXTENSOES-010

**Contador de palavras (extensão oficial)** — Comando no Ctrl+K que soma as palavras dos post-its selecionados; só lê o board.

**Como usar:**

1. Em Configurações → Extensões, ative "Contador de palavras" e aprove as permissões.
2. No board, selecione post-its.
3. Aperte Ctrl+K e escolha "Contar palavras dos post-its selecionados".

Relacionadas: [FT-EXTENSOES-009](#ft-extensoes-009)

### FT-EXTENSOES-011

**Formatos de diagrama abertos .drawio (extensão oficial)** — Importa arquivos .drawio (XML aberto, com ou sem compressão) como formas, textos, frames e conectores editáveis, com grupos e rotas das linhas; não lê a área de transferência de outros programas.

**Como usar:**

1. Em Configurações → Extensões, ative "Formatos de diagrama abertos (.drawio)" e aprove as permissões.
2. No board, use Importar arquivo (ou arraste o arquivo .drawio para o canvas).
3. Confira os avisos (páginas extras e formas aproximadas) e ajuste o diagrama.

Relacionadas: [FT-EXTENSOES-008](#ft-extensoes-008)

<!-- A CONFIRMAR: mantido à mão; o gerador preserva tudo daqui para baixo -->
## A confirmar

Itens encontrados na interface que **não entraram no catálogo** porque não foi possível confirmar no código que fazem algo além de mudar a própria opção (varredura do Chat 05.5). Quem confirmar o comportamento move a linha para `docs/features.json` (ou marca como `planned`) e regenera este arquivo.

| Onde aparece | Rótulo | Por que está aqui |
|---|---|---|
| Vista → Exibir → Pessoas | Mostrar cursores dos colaboradores | A preferência `showCursors` só é lida pelo próprio menu; cursores de outras pessoas dependem da colaboração em tempo real (Chat 08). |
| Conversas → rodapé | Seguir todas as conversas | `followConversations` não é lida fora do menu; notificações são do Chat 07. |
| Você → Avisos | Não perturbe | `doNotDisturb` não é lida fora do menu. |
| Você → Avisos (escondido até existir o app) | Sempre abrir no aplicativo para desktop | `alwaysOpenDesktop` não é lida fora do menu; o aplicativo desktop é do Chat 09. |
| Clique direito no board vazio | Sugerir tamanho do objeto | `suggestObjectSize` é lida em um único ponto; o efeito visível não foi confirmado nesta varredura. |
| Modal Atalhos de teclado (`?`) | lista de atalhos | Não lista atalhos que existem no código: `C` (comentário), `F` (frame), `Shift + C` (mostrar/ocultar comentários), `Ctrl + Shift + C` (copiar como imagem), `Ctrl + Alt + Shift + C` (copiar link), `Ctrl + Backspace` (limpar conteúdo), `Ctrl + K` (busca da Mesa) e `?`. Sugestão para o Chat 05.6/09 — sem mudança de produto neste chat. |
| Dock → Caixa de ferramentas · bandejas Formas e Frame | Cronograma, Fluxos, Protótipo, Documento, Gravação em vídeo · Seta de bloco, Divisor · Protótipo navegável, Atividades interativas | Visíveis e desabilitados com o selo único "Em breve" (Chat 08.2 · C-1); sem capítulo no ROADMAP — registrados no `QUALITY_BACKLOG.md`. Não catalogados como `planned` até haver chat definido. |
