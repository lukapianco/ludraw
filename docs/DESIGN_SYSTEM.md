# DESIGN_SYSTEM.md — Sistema visual de LuDraw (tokens, componentes e estados)

> **Criado no Chat 01** e atualizado a cada chat (histórico no `CHANGELOG.md`). **Organizado por tipo de design** — a mesma ordem da tela viva: Princípios · Fundamentos · Componentes base · Estúdio · Canvas e objetos · Facilitação e governança · Colaboração ao vivo · Mesa · Telas e fluxos; depois Padrões de interação e Internacionalização. Cada assunto aparece uma vez, na versão atual. **Público para todo o time.**
> Fonte da verdade em 3 lugares que devem andar juntos:
> 1. `src/styles/tokens.css` — CSS variables (claro em `:root`, escuro em `.dark`).
> 2. `tailwind.config.js` — classes mapeadas para os tokens (`bg-panel`, `text-ink`, `bg-accent`, `shadow-panel`...).
> 3. Tela viva **`#/design-system`** ("Sistema visual") — `src/components/design-system/`: `DesignSystemView.tsx` (moldura, índice e “Como contribuir”), um arquivo por grupo em `groups/` (`Foundations`, `Components`, `Studio`, `Canvas`, `Facilitation`, `Collaboration`, `Mesa`, `Flows`), as peças comuns em `dsKit.tsx` (`Group`, `Frame`, `Block`…) e as demos grandes em `studioMocks.tsx`, `ImportExportDemo.tsx` e `ExtensionsDemo.tsx`. O índice da tela é montado a partir dos próprios frames. **Chat 09 · R5:** a tela é opcional na instalação (`LUDRAW_ENABLE_DESIGN_SYSTEM`; a imagem Docker desliga). Desligada, nenhum link, menu, entrada da paleta ou texto leva a ela e a rota abre a tela inicial; sem servidor fica sempre ligada. Link novo para a tela = passar por `useDesignSystemEnabled()` (`hooks/useDesignSystemGate.ts`).
>
> Precisa de algo novo? Adicione o token em `tokens.css` (claro **e** escuro), teste o contraste, documente aqui e mostre um exemplo com estados na tela viva.
> **Chats 02, 03, 04, 05, 06, 06.5, 07, 08 e 08.2 não criaram tokens novos:** todos os componentes abaixo reutilizam os tokens existentes (cores de conteúdo do board — Kanban, Tabela, pódio — são constantes de conteúdo, como as paletas de post-it).

## 1. Princípios

- **Paleta verde**: `#194B32` (verde-floresta, primária) + `#D0E4AE` (verde-pistache, secundária).
- **Alto contraste sem exagero**: texto ≥ 4.5:1; sem preto/branco puros em grandes áreas.
- **Identidade própria, sem herança de layout de concorrentes**: a **Mesa** (Dashboard) segue o desenho da §8; o **Estúdio** (Board) segue o **Estúdio v2** (§4, Chat 08.2): barra do topo (Ficha │ Roda), Vista, Tempo, Dock e Cinta do objeto, cada função num lugar só. Prints de outros produtos servem como referência de função, nunca de layout, ícone ou texto.
- **Sem monetização e sem IA** na interface. Recursos de governança são gratuitos e sem selo "Pro".
- **Movimento suave**: nada aparece "seco"; tudo entra com fade/scale curtos.
- **Explique o "não"**: ação negada por permissão mostra o motivo (`explain()`) em tooltip ou toast. Nunca falha em silêncio.

## 2. Fundamentos

Cor, tipografia, forma, movimento, ícones e cursores. Na tela viva: grupo **01 · Fundamentos**.

### 2.1 Cores

| Grupo | Token | Claro | Escuro |
|---|---|---|---|
| Marca | `brand-50…950` | `#F4F9EC … #0F2E1F` (900 = `#194B32`, 200 = `#D0E4AE`) | idem |
| Canvas | `--od-canvas` / `--od-canvas-dot` | `#F5F6F8` / `#D1D5DB` | `#16161A` / `#2E2E38` |
| Painel | `--od-panel` / `--od-border` | `#FFFFFF` / `rgba(25,45,32,.09)` | `#212126` / `#32323A` |
| Hover / Ativo | `--od-panel-hover` / `--od-panel-active` | `#F1F4EC` / `#E4EED5` | `#2A2A31` / `#2F3A2C` |
| Texto | `--od-text` / `-muted` / `-subtle` | `#18211C` / `#4F5A53` / `#616B64` (Chat 08.6; era `#7D877F`) | `#ECEEE9` / `#BAC1BB` (era `#AAB2AB`) / `#9FA7A0` (era `#7C847E`) |
| Ação primária | `--od-accent` + `--od-accent-contrast` | `#194B32` + `#D0E4AE` | `#D0E4AE` + `#12301F` |
| Ferramenta ativa | `--od-accent-soft` | `#E4EED5` | `rgba(208,228,174,.13)` |
| Seleção / alças / marquee / laço | `--od-selection` (+ `--od-selection-fill`) | `#1F7A4C` | `#9FD08A` |
| Texto sobre a seleção (Chat 08.6) | `--od-on-selection` | `#FFFFFF` | `#12301F` |
| Anel de foco (Chat 08.6) | `--od-focus-color` → `--od-focus-ring` = traço sólido de 2 px + halo de 5 px | `#1F7A4C` | `#9FD08A` |
| Borda de campo (Chat 08.6) | `--od-input-border` (`.od-input`) | `#868E86` | `#6A6D71` |
| Estrela de favorito (Chat 08.6) | `--od-favorite` (`text-favorite`/`fill-favorite`) | `#B48112` | `#E0A21B` |
| Superfície invertida (toast, etiqueta de rotação) | `bg-ink` + `text-ink-inverse`; ícone de erro `--od-danger-on-inverse` | `#18211C` + `#F4F9EC`; `#F08672` | `#ECEEE9` + `#12301F`; `#BC3F2C` |
| Smart guides | `--od-guide` | `#E0457B` | `#FF6B9A` |
| Semânticas | success / warning / danger / info | `#2D784C` (era `#2F7D4F`) / `#976010` (era `#A66A12`) / `#BC3F2C` (era `#C2412D` até o Chat 06.5) / `#2C64A8` | versões claras |

**Contraste (Chat 08.6 · B) — regra e fonte única.** Texto ≥ **4,5:1**; borda de campo, anel de foco e ícone de estado ≥ **3:1** (WCAG 1.4.3 / 1.4.11), nos dois temas, em **todo fundo onde o token aparece** (painel, fundo do app, rebaixado, hover, item ativo, acento suave, canvas). Hierarquia mantida: principal › secundário › terciário (claro 16,5 › 7,2 › 5,5 · escuro 13,7 › 8,7 › 6,5 no painel). A lista de pares é `CONTRAST_PAIRS` em `src/utils/designTokens.ts`, lida do `tokens.css` real: a tabela "Contraste (WCAG 2.1)" da tela viva usa essa lista e o `npm run test:design` falha se um par cair abaixo do mínimo. **Token novo de texto ou de borda = par novo nessa lista.** Cor de interface nunca é hex fixo em classe (`bg-[#…]`): vem de token; cor de CONTEÚDO (post-its, tabela, medalhas) vem da constante de conteúdo (`TABLE_COLORS`, `MEDAL_COLORS`…). O validador de temas de extensão ainda não mede estes pares (backlog).

<details><summary>Antes → depois do Chat 08.6 · B (razões de contraste; ✗ = abaixo do mínimo)</summary>

| Par | mín. | claro antes → depois | escuro antes → depois |
|---|---|---|---|
| Texto principal · painel | 4.5 | 16,49 → 16,49 | 13,72 → 13,72 |
| Texto principal · fundo do app | 4.5 | 15,47 → 15,47 | 16,00 → 16,00 |
| Texto secundário · painel | 4.5 | 7,19 → 7,19 | 7,38 → 8,73 |
| Texto secundário · fundo rebaixado | 4.5 | 6,55 → 6,55 | 7,98 → 9,44 |
| Texto secundário · hover | 4.5 | 6,47 → 6,47 | 6,56 → 7,76 |
| Texto terciário · painel | 4.5 | 3,72✗ → 5,53 | 4,17✗ → 6,49 |
| Texto terciário · fundo do app | 4.5 | 3,49✗ → 5,19 | 4,86 → 7,58 |
| Texto terciário · fundo rebaixado | 4.5 | 3,39✗ → 5,04 | 4,51 → 7,02 |
| Texto terciário · hover | 4.5 | 3,35✗ → 4,98 | 3,70✗ → 5,77 |
| Texto terciário · item ativo | 4.5 | 3,10✗ → 4,61 | 3,10✗ → 4,83 |
| Texto terciário · acento suave | 4.5 | 3,10✗ → 4,61 | 2,98✗ → 4,65 |
| Texto terciário · canvas | 4.5 | 3,44✗ → 5,12 | 4,69 → 7,31 |
| Botão primário | 4.5 | 7,35 → 7,35 | 10,48 → 10,48 |
| Ferramenta ativa / identidade da Cinta | 4.5 | 8,35 → 8,35 | 8,41 → 8,41 |
| Superfície invertida (toast, etiqueta de rotação) | 4.5 | 15,40 → 15,40 | 12,24 → 12,24 |
| Texto sobre a cor de seleção (medidas) | 4.5 | 5,32 → 5,32 | 8,08 → 8,08 |
| Sucesso · fundo suave | 4.5 | 4,35✗ → 4,65 | 6,20 → 6,20 |
| Aviso · painel | 4.5 | 4,48✗ → 5,25 | 8,51 → 8,51 |
| Aviso · fundo suave | 4.5 | 3,96✗ → 4,65 | 6,31 → 6,31 |
| Erro · painel | 4.5 | 5,40 → 5,40 | 6,38 → 6,38 |
| Erro · fundo suave | 4.5 | 4,51 → 4,51 | 5,05 → 5,05 |
| Informação · fundo suave | 4.5 | 5,08 → 5,08 | 5,49 → 5,49 |
| Anel de foco · painel | 3 | 1,48✗ → 5,32 | 2,14✗ → 9,05 |
| Anel de foco · fundo do app | 3 | 1,47✗ → 4,99 | 2,13✗ → 10,56 |
| Anel de foco · canvas | 3 | 1,47✗ → 4,92 | 2,16✗ → 10,19 |
| Borda de campo · painel | 3 | 1,42✗ → 3,37 | 1,69✗ → 3,08 |
| Borda de campo · fundo rebaixado | 3 | 1,41✗ → 3,07 | 1,83✗ → 3,33 |
| Seleção · canvas | 3 | 4,92 → 4,92 | 10,19 → 10,19 |
| Guias inteligentes · canvas | 3 | 3,66 → 3,66 | 6,72 → 6,72 |
| Ícone de erro · superfície invertida | 3 | 6,56 → 6,56 | 4,40 → 4,63 |
| Estrela de favorito · painel | 3 | 2,25✗ → 3,45 | 7,14 → 7,14 |
| Estrela de favorito · hover | 3 | 2,02✗ → 3,10 | 6,35 → 6,35 |

Antes: 26 pares reprovados · depois: 0.
</details>

Conteúdo do board: 16 cores de post-it (`STICKY_PALETTE` / `STICKY_COLORS`, §2.1), 24 cores de tinta (`INK_COLORS`), 6 de marca-texto (`HIGHLIGHT_COLORS`), 16 de preenchimento (`FILL_COLORS`), todas em `src/utils/factory.ts`.
**Tags (Chat 02):** 10 cores em `TAG_COLORS` (`src/utils/stickyMeta.ts`): `#194B32 #3A8156 #2C64A8 #6B4FD8 #8C4A7A #C2412D #D9467A #E0A21B #0F766E #5B605C`. A cor do texto da pílula vem de `tagTextColor()` (branco se o contraste for ≥ 3:1, senão `#1C1C1E`). `nextTagColor()` escolhe a próxima cor do ciclo.
No modo escuro, tintas escuras sobre o canvas são clareadas automaticamente por `adaptInk()` (`src/utils/color.ts`). Para manter um texto escuro, coloque-o sobre um fundo claro, como faz o board de boas-vindas.

#### Paleta de post-its (Chat 05.5)
Definida **do zero** no Chat 05.5 (decisão do usuário de 05/11/2026; substitui a paleta do Chat 01). Fonte: `STICKY_PALETTE` em `src/utils/factory.ts` (`{ id, name, hex }`); `STICKY_COLORS` é a lista de hex na mesma ordem; `stickyColor(id)` e `stickyColorName(hex)` servem conteúdo embutido e rótulos.
* **Método:** 16 matizes a cada **22,5°** no espaço OKLCH (12,5° → 350°), claridade pastel (L 0,834–0,935) alternando um tom mais claro e um mais denso para que cores vizinhas não se confundam (distância mínima ΔE OKLab 0,038), croma limitado à gama sRGB.
* **Texto:** sempre `#1C1C1E` (`STICKY_TEXT_COLOR`). Contraste de **10,1:1 a 14,2:1** (WCAG AA exige 4,5:1; todas passam AAA).
* **Tema escuro:** post-its são conteúdo (mesmas cores nos dois temas, como Kanban e Tabela); sobre o canvas `#16161A` cada nota tem contraste ≥ 10,7:1 e o texto continua escuro sobre a nota. No claro, a nota se separa do canvas `#F5F6F8` pela sombra do post-it (contraste de cor 1,1–1,6:1, como em qualquer pastel).
* **Padrão:** **Canário** `#FBED7C` (`DEFAULT_STICKY_COLOR`).
* **Boards antigos:** a cor gravada em cada post-it é mantida (**nada é migrado**). A nota escura da paleta antiga (`#1F2421`) continua com texto claro `#F4F5F2` via `isDarkSticky()`/`stickyTextColor()` — a mesma regra na tela (`StickyNoteView`) e no export (`utils/export.ts`).
* **Seletores:** Dock → bandeja Post-it (8 × 2 com o nome da cor), Cinta → Cor da nota (8 × 2, nome no tooltip/`aria-label`), Importar planilha → Grade de post-its (as 16), tela viva (Fundamentos › Cores de conteúdo) (nome, hex e contraste calculado, sobre o canvas claro e o escuro).

| # | Nome | Hex | OKLCH (L C h) | Texto `#1C1C1E` | Nota × canvas escuro | Nota × canvas claro |
|---|---|---|---|---|---|---|
| 1 | Rosa-quartzo | `#FFC2C8` | 0,870 0,070 12° | 11,2:1 | 11,9:1 | 1,41:1 |
| 2 | Coral | `#FFB6A3` | 0,840 0,090 35° | 10,1:1 | 10,7:1 | 1,56:1 |
| 3 | Pêssego | `#FFDDC5` | 0,920 0,050 57° | 13,3:1 | 14,1:1 | 1,18:1 |
| 4 | Damasco | `#FFCF7E` | 0,880 0,113 80° | 11,7:1 | 12,4:1 | 1,34:1 |
| 5 | **Canário** (padrão) | `#FBED7C` | 0,935 0,135 102° | 14,2:1 | 15,0:1 | 1,11:1 |
| 6 | Lima | `#CEF092` | 0,909 0,125 125° | 13,4:1 | 14,2:1 | 1,18:1 |
| 7 | Hortelã | `#BCF8C2` | 0,924 0,095 147° | 14,1:1 | 14,9:1 | 1,12:1 |
| 8 | Jade | `#9EEACF` | 0,880 0,084 170° | 12,3:1 | 13,0:1 | 1,28:1 |
| 9 | Água-marinha | `#AAF7F3` | 0,925 0,076 192° | 14,0:1 | 14,9:1 | 1,12:1 |
| 10 | Celeste | `#88E0F6` | 0,859 0,090 216° | 11,4:1 | 12,1:1 | 1,38:1 |
| 11 | Bruma | `#C4E7FE` | 0,910 0,048 237° | 13,1:1 | 13,9:1 | 1,20:1 |
| 12 | Hortênsia | `#AACAFF` | 0,834 0,082 260° | 10,2:1 | 10,8:1 | 1,54:1 |
| 13 | Pervinca | `#D6D9FF` | 0,895 0,052 282° | 12,3:1 | 13,1:1 | 1,28:1 |
| 14 | Lavanda | `#DBBFFE` | 0,849 0,091 305° | 10,4:1 | 11,1:1 | 1,51:1 |
| 15 | Orquídea | `#FAC7F8` | 0,889 0,086 328° | 11,8:1 | 12,5:1 | 1,33:1 |
| 16 | Algodão-doce | `#FFB9D9` | 0,860 0,090 350° | 10,7:1 | 11,3:1 | 1,47:1 |

**Conteúdo embutido** (board de boas-vindas, demonstração, galeria de modelos, miniaturas da Mesa, grade de post-its da importação de planilha) usa `stickyColor(id)` — nenhum hex de post-it fica fixo fora de `factory.ts`. Fora do escopo do Chat 05.5 (aguardam decisão): algumas cores de **forma/fundo** ainda coincidem com a paleta antiga — `FILL_COLORS`, `TABLE_CELL_FILLS` (`utils/table.ts`), losango do diagrama por texto, formas do board de demonstração e a ilustração da tela de Login.

### 2.2 Tipografia

- UI: **Figtree** (400/500/600/700/800). Base 14 px.
- Display: **Fraunces** (título do espaço na Mesa, telas de entrada, títulos do Style Guide).
- Mono: **IBM Plex Mono** (tokens, código, teclas `.od-kbd`).
- **Tamanho mínimo da interface (Chat 08.6 · B): 11 px** (`text-2xs`) — selos, contadores, iniciais de avatar, rótulos da linha rápida e da Dock. Nada de `text-[9px]`/`[10px]`/`[10.5px]`; o `npm run test:design` recusa. Texto do CONTEÚDO do board segue o tamanho escolhido pela pessoa.
- Escala Tailwind: `2xs 11` · `xs 12` · `sm 13` · `base 14` · `md 15` · `lg 17` · `xl 20` · `2xl 24` · `3xl 32` · `4xl 44`.
- Board: **40 fontes** (`BOARD_FONTS` em `src/utils/text.ts`, cada uma com `category`: Sem serifa · Serifa · Manuscrita · Display · Mono), padrão Open Sans. **Seletor único** (`strip/FontPicker.tsx`, Chat 08.2): busca, Recentes (até 4, neste navegador), grupos por categoria e o nome escrito na própria fonte **só nos itens visíveis** (IntersectionObserver) — abrir o seletor não baixa as 40 famílias. O mesmo seletor aparece na gaveta Estilo do texto, no texto da linha do conector e nas células da tabela. Na gaveta Estilo do texto ele é **compacto** (`variant="compact"`): busca "Buscar fonte (40)", lista de ~4 linhas (32 px, nome na própria fonte em 16 px, categoria e "recente" à direita em 11 px (Chat 08.6; era 10,5), atual em `bg-accent-soft`) e **só a lista encolhe** quando falta altura (até ~2 linhas), para tamanho, estilo e posição ficarem sempre à vista.
- **Arquivos de fonte (Chat 05.5):** autohospedados — `src/styles/fonts.css` declara as famílias (18 no Chat 05.5, +20 no Chat 08.2) (pacotes Fontsource, só `latin` + `latin-ext`) com os mesmos nomes de família; nenhum `<link>` externo (o `audit:legal` bloqueia). Família nova = pacote + `@font-face` em `fonts.css` + `BOARD_FONTS` + `PROVENANCE.md` §3.1. Export de canvas aguarda `ensureFontsLoaded` (`utils/fontLoading.ts`).

### 2.3 Forma, elevação e espaçamento

- Raios: `sm 6` · `md 8` (botões) · `xl 12` (barras/painéis) · `2xl 16` (popovers/menus/modais) · `3xl 22` (seções da Mesa). Pílulas (tags, reações, avisos) usam `rounded-full`.
- Sombras: `shadow-panel` (barras), `shadow-pop` (menus/popovers/avisos), `shadow-modal` (diálogos).
- Grade de 4 px. **Estúdio v2:** barra do topo 44 px (`rounded-[14px]`, botões 34 px); Vista e Tempo 44 px (`rounded-xl`, 16 px da base); Dock com botões de 36 px e ícones 20 px; Cinta do objeto 44 px (`rounded-[14px]`, chips 34 px, lingueta 10 px); gavetas e bandejas `.od-pop` `rounded-2xl` (bandejas com língua de 14 px). Régua (44 px) e Painel (300 px) saíram no Chat 08.2.
- Telas (§11 do `STUDIO_V2_SPEC.md`): ≥ 1180 px tudo com rótulos; 1040–1180 rótulos somem (ícone + tooltip); < 1040 Vista compacta (Bússola + Exibir) e Tempo com desfazer + ampulheta; < 760 a pilha de avatares vira só `+N` e Apresentar só ícone. **Vista e Tempo são medidas contra a Dock** (`studio/useModuleFit.ts`): se ainda cruzarem, descem um nível e, em telas estreitas, sobem para logo acima da Dock. Cinta: < 900 px os chips mostram só o valor; < 640 px a identidade vira ícone e Link e Bloqueio avançado vão para o `⋯`.

### 2.4 Movimento

- `ease-out` = `cubic-bezier(0.22, 1, 0.36, 1)`; `spring` = `cubic-bezier(0.34, 1.36, 0.64, 1)`.
- Durações: `fast 120` · `base 180` · `slow 260` ms; câmera 340 ms (easeOutCubic, zoom interpolado em escala log).
- Animações Tailwind: `animate-pop-in` (reações, popovers), `animate-fade-in`, `animate-slide-in-left`, `animate-slide-up` (avisos), `animate-modal-in`.
- Revelação do Modo Privado: Web Animations API, de `blur(10px)` com opacidade 0,25 até nítido.
- "Reduzir movimento" (Preferências → Acessibilidade) aplica `.od-reduce-motion` no `<html>` e desliga animações de câmera e de revelação.
- **Chat 08.6 · A:** com "Reduzir movimento" (app **ou** sistema) toda animação CSS roda **uma vez** (`animation-iteration-count: 1`, 1 ms) e a rolagem é instantânea (`scroll-behavior: auto`; `scrollIntoView` do código também checa a preferência). Nunca só encurtar a duração: animação infinita (giro, ping, pulso) com 1 ms pisca a cada quadro.

### 2.5 Ícones próprios — “traço da pena”

- **Onde:** `src/components/icons/od/`, **um arquivo por ícone**, base `OdIcon.tsx` (mesma API dos ícones da biblioteca: `size`, `className`, `aria-hidden`).
- **Regras:** grade 24, traço **1,75**, pontas e junções redondas, **um** detalhe de acento por ícone (`class="acc"`: preenchido com `--od-accent-soft`; com o botão ativo, `--od-accent-contrast`). Desenhados do zero ou a partir das referências do próprio projeto (`ai-memory/refs/`); nada decalcado de terceiros (PROVENANCE §29–§30).
- **Escopo:** todo objeto, ferramenta ou ação do board usa o ícone próprio, onde quer que apareça — Dock, módulos (Facilitar = batuta, Tempo = ampulheta, Roteiro, Conversas = pin), pin de comentário, bandejas, Caixa de ferramentas, Cinta, menus, gavetas (Ficha, Roteiro, Linha do tempo), selo de bloqueio na seleção, seletor de níveis de bloqueio, ações do Kanban e os modais do board (Exportar/Importar, Templates, Importar planilha, Diagrama por texto, card do Kanban). **`lucide-react` continua só para os genéricos** (setas, fechar, busca, check, mais, informação, pessoas, e-mail, ajustes…) e para a Mesa e a Administração.
- **Pin de comentário:** a silhueta do próprio ícone, preenchida na cor do autor e escurecida quando preciso para as iniciais terem contraste AA (≥ 4,5:1) em qualquer cor e tema.
- **Cursor de rotação:** SVG próprio (24 px com versão 2x, ponto ativo no centro, fallback nativo `grab`) em `src/utils/cursors.ts`.

### 2.6 Cursores por situação

Decidido num lugar só, `cursorFor()` em `src/utils/cursors.ts`; o DOM só muda quando o cursor muda.

| Situação | Cursor |
|---|---|
| Mão (H) ou Espaço · leitura sem edição | `grab` → `grabbing` ao arrastar |
| Objeto selecionado (inclui título do frame e objetos de uma seleção múltipla) | `move` → `grabbing` durante o arrasto |
| Objeto não selecionado · área vazia | seta (`default`) |
| Alt + arrastar (duplica — função que já existia) | `copy` |
| Objeto travado | seta; `not-allowed` ao tentar mover |
| Alças de redimensionar (8) | direção certa, acompanhando a rotação (`ns`/`ew`/`nesw`/`nwse-resize`) |
| Alça de rotação e durante a rotação | cursor próprio em SVG (1x/2x, ponto ativo no centro; fallback `grab`) |
| Ferramentas de criar (post-it, formas, pena, conector, laço, frame, conversa) · pontos de conexão | `crosshair` |
| Ferramenta Texto | `text` |
| Borracha | círculo próprio (fallback `cell`) |

## 3. Componentes base

Classes em `src/index.css`. Na tela viva: grupo **02 · Componentes base**.

**Selo “Em breve” — um só** (`DevBadge` em `ui/Menu.tsx` = `ComingSoonBadge` da Dock): pílula `bg-panel-sunken` + `ring-line`, 11 px (`text-2xs`, Chat 08.6; era 10 px) bold `text-ink-subtle`. O item continua visível, desabilitado (`aria-disabled`), com dica.

| Classe | Uso | Estados documentados |
|---|---|---|
| `.od-panel` | barras e painéis | — |
| `.od-pop` | menus, popovers, flyouts | — |
| `.od-btn` + `-primary` / `-secondary` / `-soft` / `-ghost` / `-danger`, tamanhos `-sm` / `-lg` | botões | padrão, hover, pressionado, foco, desabilitado |
| `.od-tool` (+ `data-active`) | botões de ferramenta | padrão, hover, ativo, desabilitado |
| `.od-input` (+ `aria-invalid`) | campos | padrão, hover, foco, erro, desabilitado |
| `.od-menu-item` (+ `.is-danger`, `data-open`) | itens de menu | padrão, hover, marcado (✓), submenu, desabilitado, perigo |
| `.od-tooltip`, `.od-kbd`, `.od-divider-v`, `.od-checker`, `.od-dot-bg` | utilitários | — |

As classes `.is-hover`, `.is-active`, `.is-focus`, `.is-disabled`, `.is-error` forçam visualmente um estado (usadas na tela viva). **`.od-dock-tool`** (Chat 08.2): ferramenta ativa da Dock em `bg-accent` + ícone `--od-accent-contrast` (escuro: `bg-accent-soft` + `--od-accent`), mantido também no hover.

Componentes React reutilizáveis: `Menu` (cascata, toggles com chave `Switch` ou ✓, radios à direita, ícones, custom), `Modal`, `Tooltip`, `DevFeatureDialog` ("Em desenvolvimento"), `Toaster`, `Logo`/`LogoMark`, `LockButton` (clique trava; destravar = segurar 2 s com o mouse OU com Enter/Espaço, anel de progresso `--od-selection` no próprio botão, dica "Segure 2 s para destravar"; a variante `wide` saiu no Chat 08.2), `ConnectionHandles` (pontos de conexão `--od-selection` com anel branco).

**Componentes do Estúdio v2 (Chat 08.2):** `StudioDrawer` (gaveta presa ao botão do módulo: cabeçalho · conteúdo · rodapé; `Esc` devolve o foco), `DockTray` (bandeja da Dock com língua de 14 px presa ao centro do botão, até nas bordas), `StripPop` (botão, chip de valor ou segmento de identidade da Cinta que abre uma gaveta logo abaixo — ou acima perto da base; altura máxima = espaço livre real entre a barra do topo e a borda, até 520 px; dica opcional à direita do título, ex. "Ctrl B · I · U"), `FontPicker`, `Menu` com os tipos novos **`header`** (tipo e nome / "Neste ponto" + coordenadas em mono) e **`quick`** (linha rápida de até 5 ações com ícone e rótulo 11 px — Chat 08.6; era 10,5) e altura máxima `calc(100vh − 16px)` com rolagem interna, `useModuleFit` (Vista/Tempo × Dock) e `useStudioBarClearance` (painéis de votação, enquete e cronômetro descem para baixo da barra do topo quando cruzariam com ela).

## 4. Estúdio v2 (Board) — o board por fora

Na tela viva: grupo **03 · Estúdio**.

**Uma função, um lugar:** não existe menu `⋯` geral nem Painel lateral; cada módulo abre as próprias gavetas, presas ao botão que as abriu.

| Peça | Arquivo | Visual / comportamento |
|---|---|---|
| **Barra do topo** (Ficha │ Roda) | `studio/StudioBar.tsx` | UMA peça `.od-panel` de 44 px, `rounded-[14px]`, centralizada a 12 px do topo; Ficha e Roda separadas só por `.od-divider-v`. **Ficha:** botão Mesa (a marca), lugar + nome do board (clique abre a Ficha do board, duplo clique renomeia), selo Salvo/Ao vivo (texto curto + `truncate`; "Sem conexão" no lugar da frase longa). **Roda:** pilha dos OUTROS (`+N` < 760 px), Facilitar (batuta + estado: `04:12` mono, Votando, Conduzindo, Privado), Conversas (com contador), Apresentar (só ícone < 1180 px), Compartilhar (primário) e Você (avatar). Rótulos com `whitespace-nowrap` + `truncate` |
| **Gavetas** | `studio/StudioDrawer.tsx` + `*Drawer.tsx` | `.od-pop rounded-2xl`; as do topo abrem 8 px abaixo da barra, centradas no botão e presas à tela; as da base abrem acima do módulo. Uma aberta por vez; `Esc` e clique fora fecham e devolvem o foco; `\` (ou `Ctrl + /`) reabre a última. Ficha do board (grade 4 × 2 + Detalhes + lixeira), Tags do board, Facilitar (cartões com o motivo do `explain()` quando negados), Conversas (cartões + "Ir até"), Você (aparência, edição, acessibilidade, avisos), Exibir, Roteiro, Bússola, Linha do tempo |
| **Vista** | `studio/ViewModule.tsx` | módulo de 44 px no canto inferior esquerdo: Bússola · zoom (− % +; clique no % ajusta à tela) · Encontrar · Exibir · Roteiro. Medido contra a Dock (`useModuleFit`): rótulos → só ícones → compacto (Bússola + Exibir, com zoom e Encontrar dentro de Exibir) → acima da Dock |
| **Tempo** | `studio/TimeModule.tsx` | módulo de 44 px no canto inferior direito: desfazer · refazer · ampulheta (Linha do tempo). Mesma regra de encaixe da Vista |
| **Linha do tempo** | `studio/TimeModule.tsx` + `VersionPreviewLayer.tsx` | versões como pontos (segurança em `--od-warning`), atividade como barras `bg-accent-soft`; escolher um ponto abre a **prévia somente leitura** no próprio canvas (tom sépia, câmera própria, fade de entrada/saída e fade cruzado entre versões, enquadra o conteúdo na área livre); "Voltar ao agora"/`Esc`; Restaurar/Excluir só com `board.restoreSnapshot`; "Ver eventos" = Activity Log do trecho |
| **Dock** | `toolbar/LeftToolbar.tsx` | mesma posição e forma (base, centro). Ordem: Inserção rápida · **Mão · Selecionar** · Laço │ Post-it · Texto · Formas · Conector · Pena │ Frame · Imagem · Emojis e adesivos · Comentário │ Caixa de ferramentas. Ícones próprios; botão com bandeja = ponto de 4 px no canto; ativa = `bg-accent` (`.od-dock-tool`) |
| **Bandejas** | `toolbar/dock/DockTray.tsx`, `trays.tsx` | `.od-pop` acima do botão com língua de 14 px apontando para o centro dele. Post-it (mini-notas 8 × 2 com fita, nome da cor em Fraunces, "Um por vez · Em bloco"), Formas (4 linhas + Básicas em grade de 5 + seções de extensão), Pena, Frame (proporções desenhadas na forma), Emojis e adesivos (busca, abas, clique no centro ou arrastar para o ponto; `Shift + E`). "Reduzir movimento" = só opacidade |
| **Caixa de ferramentas** | `toolbar/dock/Toolbox.tsx` | bandeja de 600 px (`/`): busca focada, filtro Tudo · Do LuDraw · Extensões (n), Recentes, grade 2 × 2 por intenção (Organizar, Diagramar, Apresentar, Trazer e levar) com miniaturas próprias de 34 px `bg-panel-sunken`, e "Das extensões ativas" com o nome da extensão e o tipo. Itens "Em breve" visíveis, desabilitados, com dica |
| **Cinta do objeto** | `toolbar/FloatingContextToolbar.tsx`, `strip/StripPop.tsx` | peça única 44 px, raio 14, padding 4, superfície dos módulos, **segue o tema em todos os tipos (frame incluído)**; lingueta de 10 px para o centro da seleção; 18 px abaixo dela (acima se não couber), sem cobrir alças nem etiquetas de presença. Ordem: **identidade** (`bg-accent-soft`, texto `--od-accent` 13 bold, ícone próprio + tipo ou nome do frame + chevron: Converter em… / Filtrar a seleção / renomear) · **chips de valor** (34 px `bg-panel-sunken`, mostram o valor atual: "Aa Fraunces 56", "Misto", "Traço 2 px", "Pontas", "16:9") · alternâncias e cores · separador · **Comentar · Bloqueio avançado · Bloquear · ⋯**. Gavetas com cabeçalho, conteúdo e rodapé; `Esc` devolve o foco ao chip. **Estilo do texto** (340 px): fonte (seletor compacto) · Tamanho (− valor mono +, atalhos 12–72 em `bg-panel-sunken`, o atual em `bg-accent`) · Estilo e posição em **controles segmentados** (trilho `bg-panel-sunken`, opção ligada em `bg-panel` + `shadow-panel`): Ênfase B I U S │ Lista (sem · marcadores · numerada) / Alinhamento │ Recuo · Marca-texto numa linha · rodapé "Fonte, tamanho e posição num só lugar" + "Esc fecha". Travado: o meio fica `aria-disabled`, inerte e a 40 %; Bloquear (segurar 2 s) e `⋯` continuam. `role="toolbar"` com setas/Home/End; `F6` inclui a Cinta (Ficha → Roda → Cinta → Vista → Tempo → Dock) |
| **Menus de botão direito** | `ui/Menu.tsx`, `menus/canvasMenu.tsx`, `elementMenu.tsx`, `tableMenu.tsx` | Mesma anatomia: **cabeçalho** · **linha rápida** (5) · no máximo 6 linhas com submenus. Vazio: "Neste ponto" + coordenadas, Colar · Post-it · Texto · Frame · Conversa e 4 linhas (Inserir aqui · Seleção · Vista · Grade e navegação). Objeto (= `⋯` da Cinta): Copiar · Duplicar · Bloquear · Frente · Excluir e Editar · Copiar como · Organizar · Bloqueio · Frame e modelo · Exportar e info. Tabela: "Tabela · B3", Copiar · Limpar · Mesclar · Bloquear · Excluir e Linhas e colunas · Texto e alinhamento · Fundo e bordas · Ordenar · Levar para planilhas · Objeto. Nunca passam da altura da tela |
| **Janela de extensão** | `studio/ExtensionPanelWindow.tsx` | cartão `.od-pop` arrastável de 340 px com o mesmo iframe isolado; sempre dentro da tela; `Esc` fecha; setas movem pelo cabeçalho (Shift = passo maior) |
| Board de boas-vindas | `board/welcomeBoard.ts` | passos numerados com teclas (`.od-kbd` desenhadas) + mini fluxograma; texto sobre fundo sálvia para continuar legível no escuro |

**Em que difere do padrão de mercado:** nenhuma barra lateral fixa nem menu geral — cada canto responde a uma pergunta (que board é este · quem está aqui · como estou olhando · o que mudou · o que vou criar) e a Cinta separa o que o objeto É (identidade e valores atuais em chips) do que se FAZ com ele (grupo fixo à direita).

## 5. Canvas e objetos

Na tela viva: grupo **04 · Canvas e objetos**.

### 5.1 Ferramentas essenciais

- **Rodapé do post-it** (`StickyNoteView` + `stickyFooterLayout`, mesma geometria no DOM e no PNG/PDF): pílulas de tag (`rounded-full`, cor da tag) e pílulas de reação (emoji + contagem; destaque quando a reação é sua; `animate-pop-in` ao alternar).
- **TagPicker** (`StickyMetaControls.tsx`): busca/cria tag, lista com ✓ e bolinha de cor.
- **ReactionGrid**: grade de `REACTION_EMOJIS` (colunas de 36 px, número configurável por `columns`) (`👍 ❤️ 🔥 💡 ✅ 🎉 😂 👀 🙌 ⭐ ❓ 🚀`).
- **Bandeja Emojis e adesivos** (Dock, `Shift + E`; antes "flyout de stickers"): `STICKER_EMOJIS` com nome para a busca + pacotes de extensão; clicar coloca no centro, arrastar coloca no ponto (mesmo `ensure` e desfazer); imagem raster sobe ao servidor no Modo Servidor, SVG fica embutido.
- **ImageView**: imagem sem moldura; fallback "Imagem indisponível" com ícone em `text-ink-subtle`.
- **Overlay de drop**: véu `--od-selection-fill` com borda tracejada e cartão `.od-panel` central "Solte para inserir as imagens aqui".
- **Laço**: polígono `--od-selection` 1,5 px tracejado `6 4`, preenchimento `--od-selection-fill`.

### 5.2 Conectores inteligentes e mapa mental

| Peça | Arquivo | Visual / comportamento |
|---|---|---|
| **Rótulo da linha** | `elements/ConnectorView.tsx` (`ConnectorLabelPill`), `utils/connectors.ts` (`connectorLabelBox`) | pílula sobre a rota — por padrão no meio do **comprimento**; o duplo clique fixa o rótulo no ponto clicado (a até 6 % do meio ele volta ao centro; margem de 3 % nas pontas) e, com a linha selecionada, arrastar a pílula (cursor `grab`) desliza o texto ao longo da rota: fundo `--od-panel`, borda 1,5 px na cor da linha, texto `--od-text` Figtree 600 14/18, raio 12, `--od-shadow-panel`, até 220 px de texto (quebra linhas). Edição no lugar: duplo clique na linha/rótulo, `Enter` com a linha selecionada ou "Inserir texto" na Barra de ações; `Enter`/`Esc` confirmam, `Shift+Enter` quebra linha; campo com anel `--od-selection-fill`. Mesma pílula no PNG/PDF |
| **Estilo do texto da linha** | `toolbar/ConnectorLabelControls.tsx` (`ConnectorLabelPanel`), `utils/connectors.ts` (`resolveLabelStyle`) | botão **Aa · Texto** na Barra de ações (só quando a linha tem texto) → popover `.od-pop` 296 px, altura limitada ao espaço livre: fonte (lista `BOARD_FONTS`), tamanho 8–96 (− / campo / +, degraus `LABEL_FONT_SIZES`), negrito/itálico, cor do texto (Automática = `--od-text` + `INK_COLORS` + personalizada), fundo (Padrão = `--od-panel`, Sem fundo, `FILL_COLORS`, personalizada), borda 0–8 px (cor da linha ou outra), cantos 0–32 / Retos / Suaves / Pílula, "Restaurar o estilo padrão". Padding e altura de linha escalam com o tamanho (14 px → 10/4 px, linha 18). Sem fundo = sem sombra. Mesmo visual no PNG/PDF |
| **Saltos de linha** | `utils/connectors.ts` (`computeLineJumps`, `buildOrthogonalPath`) | só em rotas em cotovelo: o trecho **horizontal** desenha um arco (raio `4 + 1,5 × espessura`) onde cruza o trecho **vertical** de outra linha em cotovelo; cantos e pontas não geram salto. Ligado por padrão; "Saltos de linha" (✓) no popover **Tipo** da Barra de ações. Igual na tela e no export |
| **Desvio de objetos** | `utils/connectors.ts` (`routeAroundObstacles`) | quando a rota simples em cotovelo atravessaria um dos objetos ligados, a rota contorna as caixas (folga de 8 px para bloquear, linhas-guia a 20 px; menor comprimento + menos dobras) |
| **Mapa mental** | `elements/MindMapView.tsx`, `utils/mindmap.ts`, `utils/mindmapActions.ts`, `toolbar/MindMapControls.tsx` | raiz em pílula `#194B32` com texto `#D0E4AE` (Figtree 700 20); 1º nível Figtree 600 16 com borda 2 px na cor do ramo; demais níveis 500 14 com borda 1,5 px; fundo = cor do ramo misturada a 84 %/90 % de branco, texto `#1C1C1E` (conteúdo do board: igual nos dois temas, como os post-its). Curvas Bézier na cor do ramo (3 px a partir da raiz, 2 px nos demais). Nó ativo: contorno 2,5 px `--od-selection`. Botão redondo na ponta do nó: `−` recolhe, `+N` mostra quantas ideias estão escondidas; botão tracejado `+` cria filho |
| **Cinta do mapa** | `toolbar/MindMapControls.tsx` | grupo de direção (ramos para os lados / para baixo) em `bg-panel-sunken`, nova ideia filha (`Tab`), nova ideia irmã (`Enter`), recolher tudo, expandir tudo; desabilitados com o motivo de `useCan('board.edit')` |

**Cores dos ramos** (`MINDMAP_BRANCH_COLORS`, subconjunto de `TAG_COLORS`): `#3A8156 #2C64A8 #C2412D #8C4A7A #E0A21B #0F766E #6B4FD8 #D9467A` — cada ramo de 1º nível recebe a próxima cor; os descendentes herdam.
**Teclado do mapa** (com o mapa selecionado e um nó ativo): `Tab` filho · `Enter` irmão (sem nó ativo: edita a raiz) · `Delete`/`Backspace` remove o ramo (na raiz, apaga o mapa) · `+`/`−` expande/recolhe · setas navegam · `F2` ou digitar edita · `Esc` solta o nó ativo.
**Auto-layout:** horizontal = ramos de 1º nível alternam direita/esquerda (lado fixado na criação); vertical = cresce para baixo. Cada subárvore ocupa uma faixa própria (sem sobreposição) e a raiz fica parada na tela; o mapa não tem alças de redimensionar.

### 5.3 Frames e Modo Apresentação

| Peça | Arquivo | Visual / comportamento |
|---|---|---|
| **Frame** | `elements/FrameView.tsx`, `utils/frames.ts` | corpo com `fillColor` (paleta `FRAME_FILLS`, padrão branco), raio 3, contorno de 1 px de tela (`rgba(20,36,26,.16)` claro · `rgba(255,255,255,.18)` em frame escuro) + sombra leve. O corpo **deixa o ponteiro passar** (arrastar dentro dele faz seleção por área, duplo clique cria post-it); o frame é pego pelo **cabeçalho** |
| **Cabeçalho** | `FrameView.tsx` | acima do corpo, **tamanho fixo de tela** (26 px, não encolhe com o zoom): título Figtree 600 13 `text-ink-muted` (hover `bg-panel-hover` + `text-ink`), selo da proporção (`text-2xs text-ink-subtle`) quando não é Livre e o **olhinho** 20×20 (`Eye`/`EyeOff` 14). Edição: duplo clique, `Enter` ou "Renomear" → campo 220 px com borda `--od-selection` e `--od-focus-ring`; `Enter`/`Esc` confirmam. Some no Modo Apresentação |
| **Ocultar conteúdo** | `FrameView.tsx`, `utils/frames.ts` (`isHiddenByFrame`) | o olhinho só aparece para quem pode (`frame.toggleHidden` = facilitador); ligado fica na cor `--od-selection`. Oculto = filhos não são desenhados (tela, export, miniatura, busca, seleção por área) e o corpo mostra a capa `EyeOff` + "Conteúdo oculto" (Figtree 600, `#4F5A53` / `#F4F5F2` em frame escuro). Quem não pode ver só o selo `EyeOff` estático |
| **Proporções** | `utils/frames.ts` (`FRAME_RATIOS`) | Livre 800×520 · 16:9 960×540 · 4:3 800×600 · **1:1 720×720** (Chat 08.2) · A4 595×842 · Mobile 390×844. Ao desenhar e redimensionar, proporções fixas mantêm o aspecto. Trocar a proporção mantém a largura e ajusta a altura |
| **Cinta do frame** (Chat 08.2) | `toolbar/FrameControls.tsx` | identidade com o **nome do frame** (renomear ali; cadeado quando travado) · chip **Proporção** · Cor de fundo · Conteúdo visível (`frame.toggleHidden`) · Exportar (PDF, PNG 2×, PNG 4×, SVG) · **Apresentar** (único botão cheio, com rótulo). Segue o tema como os outros tipos (antes tinha outra superfície) |
| **Aviso dos filhos** | `modals/AppModals.tsx` (`FrameChildrenModal`) | ao excluir: "Manter o conteúdo" (primário) / "Excluir tudo"; ao encolher um frame deixando objetos fora: "Manter fora do frame" / "Excluir N objetos". Cancelar = manter |
| **Modo Apresentação** | `board/PresentationDrawer.tsx` | tela cheia; barra do topo, Vista, Tempo, Dock, Cinta, grade e cabeçalhos somem. Fora do slide: moldura `box-shadow: 0 0 0 100vmax var(--od-canvas)`. Câmera `animateCameraTo` 420 ms com margem `min(48 px, 4 %)`. Controles em pílula `.od-pop rounded-full` no rodapé: lista de slides, ←, "**n/total** · título" (13 px), →, sair — somem após 2,6 s sem mexer o mouse (opacidade + 8 px, `duration-slow`). Barra de progresso 3 px `bg-accent` sobre `--od-border`. Gaveta de slides `.od-pop` 260 px à esquerda |
| **Roteiro** (Vista; antes aba Frames do Painel) | `studio/ViewModule.tsx` (`ScriptDrawer`) + `studio/boardPanels.tsx` (`FramesTab`) | lista na ordem dos slides com número, título, selo `EyeOff`, alça de arrastar e **▷ por frame** (apresentar a partir dele); reordenar por arrastar ou ↑/↓; clicar leva a câmera ao frame; "Usar esta vista como inicial" |

**Teclado da apresentação:** `→` `↓` `PageDown` espaço `Enter` avançam · `←` `↑` `PageUp` voltam · `Home`/`End` · `Esc` fecha a gaveta ou sai. Clicar no slide avança. Nenhum atalho do board roda e o store recusa qualquer edição (`ensure`) enquanto `presenting` estiver ligado.
**Atalhos do frame:** `F` = ferramenta Frame (arrastar desenha; clique cria no tamanho da proporção) · `Enter` edita o título · `Delete` pergunta o que fazer com o conteúdo.
**Diferença do padrão de mercado:** o frame é escolhido pelo cabeçalho e o corpo nunca captura o ponteiro; a apresentação mantém o board vivo (mesma câmera, não uma cópia) com a gaveta de slides compacta.

### 5.4 Kanban, Tabela, diagrama e Comentários

Conteúdo do board (Kanban, Tabela) usa **cores fixas iguais nos dois temas**, como post-its e mapas mentais. UI de facilitação (cronômetro, votação, conversa) usa só tokens.

| Peça | Arquivo | Visual / comportamento |
|---|---|---|
| **Kanban** | `elements/KanbanView.tsx`, `utils/kanban.ts` (`layoutKanban` = geometria única DOM/export) | superfície `#F6F7F4` (borda `#DDE2D8`, raio 14), colunas `#ECEFE8` (raio 10) com faixa de 4 px na cor da coluna (`KANBAN_COLUMN_COLORS`), título Figtree 700 18, coluna 700 13,5, contador `n` ou `n/WIP` (vermelho `#C2412D` acima do limite) + pontos. Card branco (raio 8, borda `#DCE1D6`): barra de prioridade de 3 px à esquerda, título 600 14/19 (até 4 linhas), descrição 400 12,5/17 (até 3), tags em pílula `#E4EED5`/`#194B32`, linha de metadados com pílulas **Alta** `#C2412D`/`#FBE6E2` · **Média** `#A66A12`/`#FBF0DC` · **Baixa** `#2F7D4F`/`#E3F1E7`, prazo (vermelho quando vencido), pontos `#2C64A8`/`#E3EDF9` e avatar 22 px `#194B32`/`#D0E4AE` do responsável. Largura das colunas: Compacta 220 · Padrão 264 · Larga 320 (sem alças: o tamanho vem do layout). Arrastar card: fantasma inclinado 2° com sombra forte + barra de soltura 3 px `--od-selection`. Selecionado: “+ Adicionar card” por coluna, menu ⋯ (renomear, cor, WIP, ordenar, mover, excluir) e botão tracejado “+” de nova coluna fora da borda direita |
| **Editor do card** | `modals/KanbanCardModal.tsx` | `Modal` 560 px: título, descrição, responsável (sugestões), prazo (`type=date`), prioridade em segmento `bg-panel-sunken`, story points em chips (0 1 2 3 5 8 13 21 + outro), tags em pílulas `bg-accent-soft`, coluna; Excluir (perigo) · Duplicar · Cancelar · Salvar (1 passo de desfazer). Somente leitura para quem não edita |
| **Tabela** | `elements/TableView.tsx`, `utils/table.ts` (`layoutTable`) | fundo branco, raio 6, borda `#B9C2B3`, grade `#CBD2C6`; cabeçalho (1ª linha) `#E7F1D6` em negrito; Figtree 14/19, padding 8/10; o texto quebra e a linha cresce. Seleção: contorno 2 px `--od-selection` (intervalo com `--od-selection-fill`). Com a tabela selecionada: alça “⋮⋮ Tabela L × C” em `--od-selection` acima (mover), faixas de redimensionar nas bordas (realce no hover) e “+” redondos `--od-selection` perto dos cantos (o meio de cada lado é dos pontos de conexão) |
| **Cinta (Kanban e Tabela)** | `toolbar/KanbanControls.tsx`, `toolbar/TableControls.tsx` | Kanban: identidade "Kanban" (renomeia o quadro), resumo "n cards · n pts", + Card, + Coluna, largura das colunas, ordenar por prioridade. Tabela: identidade "Tabela · B3" (rótulo), Linhas, Colunas, Mesclar, Negrito/Itálico, fonte, cor do texto, fundo (`TABLE_CELL_FILLS`), alinhamento, bordas, estilo; agem no intervalo (ou na tabela toda) |
| **Diagrama por texto** | `modals/DiagramModal.tsx`, `utils/diagram.ts` | `Modal` 920 px em duas colunas: exemplos (botões `od-btn-soft`), campo IBM Plex Mono 12,5/1,55 (Tab indenta, Ctrl+Enter insere), guia rápido recolhível; prévia SVG ao vivo sobre `bg-canvas` pontilhado; erros `text-danger` e avisos `text-warning` com o número da linha. Formas geradas: retângulo branco, cápsula/círculo `#D0E4AE` (negrito), decisão `#FFF6A5`, hexágono `#E3EDF9`, cilindro `#E7F1D6`, paralelogramo `#FBF0DC`; contorno `#194B32`; grupos viram Frames `#F4F9EC` |
| **Comentário (pin)** | `elements/CommentPinView.tsx` | silhueta do ícone próprio de comentário (Chat 08.2), 30 px de **tela**, ponta no canto inferior esquerdo = posição do comentário; preenchida na cor do autor (`colorFromString`), escurecida quando preciso para as iniciais terem contraste AA; contorno `--od-panel`; selecionado: contorno extra `--od-selection`; resolvido: `#7D877F` com ✓; selo com o nº de mensagens. Não sai no PNG/PDF; some com Shift + C e na apresentação |
| **Conversa** | `board/CommentThreadPanel.tsx` | `.od-pop` 320 px flutuando ao lado do pin: cabeçalho “Conversa” + selo Aberta (`success`) / Resolvida, ✓ resolver/reabrir, lixeira (`comment.delete`), fechar; mensagens com avatar 28 px, nome 600 13, tempo relativo, texto 13/1,45 com **@menções** em `bg-accent-soft`; compositor `.od-input` com sugestões de pessoas (lista `.od-pop` acima do campo, setas/Enter), botão @ e “Responder” primário. Rascunho de comentário novo = mesmo painel com “Novo comentário” |
| **Conversas** (Roda; antes aba Comentários do Painel) | `studio/ConversationsDrawer.tsx` | gaveta presa ao botão Conversas (contador de abertas): filtros Abertas · Resolvidas · Todas, menções, cartões com avatar, autor, tempo, 2 linhas, onde está ("Post-it · …"), respostas, ✓ resolver e **Ir até** (câmera vai ao pin, que pisca 1,5 s); rodapé "Seguir todas as conversas" |
| **Galeria de templates** | `modals/TemplatesModal.tsx`, `dashboard/TemplateThumb.tsx` | `Modal` 980 px: abas sublinhadas Galeria · Meus templates, filtros por categoria, cartões com miniatura vetorial (novas: `swot`, `business9`, `journey`, `architecture`), selo de categoria e “Inserir”/“Criar board”. Meus templates: miniatura PNG gerada, renomear/excluir. Salvar como template: `modals/SaveTemplateModal.tsx` (prévia, nome, descrição, “Só a seleção / O board inteiro”, tamanho em KB) |

**Movimento:** cards e células usam `ease-out` 160 ms ao mudar de posição; selos e medalhas entram com `animate-pop-in`; painéis flutuantes com `animate-slide-up`.
**Teclado:** Kanban — `Enter` renomeia o quadro, duplo clique renomeia quadro/coluna, `Esc` cancela um arrasto. Tabela — duplo clique/`Enter`/`F2`/digitar editam, `Tab`/`Shift+Tab` andam (Tab na última célula cria linha), `Enter` desce, `Shift+Enter` quebra linha, setas (Shift estende), `Delete` limpa. `C` = ferramenta Comentário; `Shift + C` mostra/oculta pins.
**Diferença do padrão de mercado:** a conversa flutua presa ao pin (o Painel só lista/filtra); o cronômetro é um objeto flutuante arrastável com som 100 % procedural; o pódio é um painel do board (não uma tela separada) e cada item leva a câmera até ele.

#### Ajustes pós-Chat 04 (pedidos do usuário)
| Peça | Arquivo | Visual / comportamento |
|---|---|---|
| **Menu da tabela (botão direito)** | `menus/tableMenu.tsx` (+ `CanvasContextMenu.tsx`) | Como nas planilhas: o clique direito marca a célula (ou mantém o intervalo). Chat 08.2: cabeçalho "Tabela · B3", linha rápida Copiar · Limpar · Mesclar/Separar · Bloquear · Excluir e 6 linhas — Linhas e colunas (inserir N, excluir, distribuir) · Texto e alinhamento · Fundo e bordas (+ estilo da tabela) · Ordenar · Levar para planilhas · Objeto (o menu do objeto inteiro) |
| **Painéis de formatação** | `toolbar/TableFormatPanels.tsx` | Os mesmos no menu e na Cinta. **Bordas**: grade 6 × 2 de ícones 18 px (grade tracejada clara + lados escolhidos em traço 2 px), cor (10 bolinhas + seletor), espessura 1–4 px, estilo contínua/tracejada/pontilhada. **Texto**: B/I/U/S, tamanho (− campo + e chips 10…48), lista de fontes na própria fonte. **Estilo**: 6 miniaturas (Sálvia, Floresta, Azul, Cinza, Âmbar, Sem cor) + 3 chaves. **Cores**: 16 amostras + “Outra cor” |
| **Cinta da tabela** | `toolbar/TableControls.tsx` | Linhas · Colunas · Mesclar/Desfazer (ativo quando há mesclagem) · B · I · Aa (fonte, com o `FontPicker`) · cor do texto · cor de fundo · alinhamento (H + V) · bordas · estilo. Tooltips dizem o alvo ("na célula B3", "em A2:C4", "na tabela inteira") |
| **Tabela — conteúdo** | `utils/table.ts` | Célula mesclada = um bloco só (sem linhas internas). Bordas personalizadas tiram os cantos arredondados (o contorno passa a ser desenhado lado a lado). Estilos mudam cabeçalho, faixa, grade e contorno; texto automático claro sobre cabeçalho escuro (Floresta) |
| **Guia do diagrama** | `modals/DiagramModal.tsx` (`SyntaxGuide`) | Aba “Guia da sintaxe” ao lado de “Prévia” (abre sozinha na 1ª vez), altura fixa com rolagem: parágrafo de ideia geral + 4 passos numerados (círculo `bg-accent` 24 px): 1 Direção (setas ↓→↑←), 2 Caixas (desenho da forma + nome + quando usar), 3 Ligações (desenho da linha), 4 Grupos e comentários + exemplo lido em voz alta. Cada linha tem o código em mono e “+ Inserir” (coloca no texto; direção troca a 1ª linha) |
**Diferença do padrão de mercado:** a enquete é configurada num painel lateral que deixa o board clicável — as respostas podem vir direto dos post-its com um clique, sem copiar e colar.

## 6. Facilitação e governança

Na tela viva: grupo **05 · Facilitação e governança**.

### 6.1 Governança

- **Selos de bloqueio** na `SelectionBox`: cadeado (padrão), escudo (protegido), camadas (estrutura de fundo). `LockMenu` lista `LOCK_LEVELS` com ícone, título e uma linha explicativa; níveis sem permissão aparecem desabilitados com o motivo no tooltip.
- **Bloqueio na Cinta** (Chat 08.2): o cadeado trava com um clique (nível padrão); travado, **segurar 2 s** (mouse ou Enter/Espaço) destrava, com anel de progresso; o escudo **Bloqueio avançado** abre o `LockLevelPicker` (mesmo nome e regra de antes; também em `⋯` → Bloqueio ▸). Protegido: o cadeado ganha um escudo e abre o **ProtectedUnlockConfirm** (popover com o motivo do `explain()` para quem não pode destravar).
- **Aviso "Visualizando como…"** (`BoardBanners.tsx`): pílula `bg-brand-900` / `text-brand-100` (no escuro, `bg-brand-200` / `text-brand-950`), ícone `ScanEye`, botão interno "Sair da simulação". Fica centralizado **logo abaixo da barra do topo** (`top-[64px]`, Chat 08.2), entra com `animate-slide-up`. Painéis de votação, enquete e o cronômetro também descem para baixo da barra quando cruzariam com ela (`useStudioBarClearance`).
- **Aviso "Modo Privado ativo"**: pílula `.od-panel` com texto `text-ink-muted` e ação de abrir o menu.
- **Modo Privado** (Facilitar → Modo Privado; antes na Régua): itens com chave ligar/desligar, chave "Simular visão de outro participante" e botão perigo/primário "Encerrar e revelar todas as notas" (só facilitador).
- **PrivateMask** (post-it oculto): 3 barras borradas na cor do texto (opacidade 0,32), `••••` em negrito e "Nota privada" com `EyeOff`. Selo "Privada" no canto para o autor. A mesma máscara é desenhada no export.
- **Entrada do Activity Log**: avatar com a cor do autor + resumo pt-BR ("Luka adicionou 3 post-its") + tempo relativo (`relativeTime`) + ícone da ação; clicável quando há `elementIds` (foca a câmera). Filtros por autor e ação em `select` compactos; "Limpar" `.od-btn-ghost` perigo, desabilitado com motivo para quem não é titular/admin.
- **Toast de permissão negada**: `notify(reason, 'danger')` com o texto de `explain()`.

### 6.2 Cronômetro, votação, enquete e Facilitar

| Peça | Arquivo | Visual / comportamento |
|---|---|---|
| **Cronômetro (Facilitar)** | `facilitation/TimerMenu.tsx` | cartão Cronômetro na gaveta Facilitar → o mesmo `TimerPanel` (durações 1/3/5/10/15 min, personalizado, trilhas, "Neste navegador"); o tempo restante aparece ao lado da batuta na barra do topo |
| **Cronômetro flutuante** | `facilitation/TimerWidget.tsx` | `.od-panel` no canto superior direito do canvas (arrastável pela alça ⋮), anel 46 px `--od-selection` (vermelho `--od-danger` no último minuto e no fim), contagem Figtree 800 24 tabular, estado (Contando/Pausado/**Tempo esgotado!** com anel `ring-danger`), controles do facilitador (pausar/continuar, +1, zerar, fechar) e som local (trilha / “Ativar som” quando o navegador bloqueia áudio). Desce abaixo das faixas em canvas < 1100 px; acima disso as faixas centralizam no espaço restante. Fica visível na apresentação |
| **Votação** | `studio/FacilitateDrawer.tsx`, `modals/VotingSetupModal.tsx`, `facilitation/VotingOverlay.tsx` | Facilitar → Votação → modal (pergunta, pontos ± , prazo em chips, “Votação anônima” em cartão `bg-panel-sunken`, vários pontos por item). Faixa no topo `.od-panel` “— você tem n de N pontos · clique para votar, Shift + clique retira” + “Revelar resultados”. Selos no canto superior direito de cada item: pontos próprios ● `--od-selection` (anel `ring-selection`), total em pílula `.bg-panel` quando visível; medalhas ouro `#E0A21B` (troféu) · prata `#A9ADA8` · bronze `#B07D0A`. Foco do vencedor: anel pulsante `--od-selection` + halo `--od-selection-fill` |
| **Pódio** | `facilitation/VotingOverlay.tsx` (`VotingResultsPanel`) | `.od-pop` 340 px no canto superior esquerdo: título, totais, degraus 2º·1º·3º (62/86/46 px) com “nº” 800 18 e pontos, ranking com barra `bg-selection` sobre `bg-panel-sunken` e ícone de foco; “Encerrar a sessão de votação” para o facilitador |
| **Cronômetro** | `facilitation/TimerWidget.tsx` | Arrasta pelo card inteiro (cursor de mão; botões continuam clicáveis) ou pela alça. Novo botão ⚙ “Configurações do cronômetro” abre o mesmo painel da Régua (`TimerPanel`) ancorado ao card |
| **Enquete — tipo de votação** | `modals/VotingSetupModal.tsx` | Duas opções em cartões no topo do modal: **Pontos no board** (selecionado, anel `--od-selection`) e **Enquete** (abre o painel abaixo) |
| **Enquete — configuração** | `facilitation/PollPanels.tsx` (`PollSetupPanel`) | `.od-pop` 360 px no canto superior esquerdo, **não modal**: dica que fica verde (`bg-accent-soft`) quando um campo está focado — “Clique num post-it, forma, card ou célula do board para copiar o texto”; pergunta; respostas numeradas (Enter cria a próxima, Backspace vazio remove, ícone 🔗 = copiada do board, clique leva a câmera até a origem); chaves Múltipla escolha · Anônima · Mostrar resultado parcial; prazo em chips; rodapé com status + Cancelar/Iniciar |
| **Enquete — cartão** | `facilitation/PollPanels.tsx` (`PollCard`) | Mesmo lugar. Respostas como botões grandes (rádio ou caixa conforme o tipo; selecionada = `bg-accent-soft` + anel 2 px `--od-selection`); com resultado visível: barra `--od-selection-fill` atrás do texto, % e votos à direita; mais votada com anel âmbar `#E0A21B` e troféu; nomes de quem votou embaixo quando não é anônima. Rodapé: Enviar/Atualizar resposta, “Resposta enviada — dá para mudar até o fim”, Retirar; facilitador: Encerrar e revelar · Cancelar · Encerrar a sessão. Minimiza para uma pílula com “Responder” |
| **Facilitar** (Chat 08.2; antes "Facilitação no menu ⋯") | `studio/FacilitateDrawer.tsx` | cartões Cronômetro · Votação · Enquete · Modo Privado · Conduzir a tela (só ao vivo) · Ver como…; cada um abre o controle de antes; sem permissão, o motivo aparece no cartão. Estado na barra: tempo, Votando, Conduzindo, Privado |

## 7. Colaboração ao vivo

Na tela viva: grupo **06 · Colaboração ao vivo**.


**Nenhum token novo.** Cores das pessoas = `COLLABORATOR_PALETTE` (`collab/protocol.ts`, a mesma de `COLLABORATOR_COLORS`); movimento = `ease-out` da marca (`cubic-bezier(0.22,1,0.36,1)`). Tudo respeita "Reduzir movimento".

| Item | Onde | Regra visual |
|---|---|---|
| **Selo ao vivo** | `LiveBadge` na barra do topo (`toolbar/TopBar.tsx`), no lugar do `SyncBadge` quando a edição ao vivo está ligada | Mesma forma do selo "Salvo". Ao vivo `success`; conectando/sincronizando `warning` pulsando; sem conexão `warning` ("Sem conexão", frase longa na dica); somente leitura `ink-subtle`. Rótulo some abaixo de 1180 px (fica o ponto). |
| **Pilha de avatares** | `OnlineAvatars` (`components/collab/`) na Roda | círculos de 28 px sobrepostos (`-space-x-2`), anel `ring-2` na cor do painel, **só os outros** (a própria pessoa é o botão Você, logo depois), até 3 + contador `+N` em `bg-panel-sunken text-ink-muted` (tooltip com os nomes). Quem está sendo seguido: anel `--od-selection`. Abaixo de 760 px só o `+N`. |
| **Cursor de outra pessoa** | `RemotePresence` → `CollaboratorCursor` (`ui/Presence.tsx`) | Seta na cor da pessoa + pílula com o nome. Some após 6 s parado. "Movimento suave dos cursores" (Visualizar, ligado por padrão): transição `transform 160ms` `ease-out`; desligado ou "Reduzir movimento": salto direto. Mover a própria tela redesenha sem transição. |
| **Caixa de seleção de outra pessoa** | `RemotePresence` (`[data-remote-marquee]`) | O mesmo desenho do marquee local (`rounded-[2px]`, borda 1 px, preenchimento suave), trocando `--od-selection` pela cor da pessoa (`color-mix` 12 %). Some ao soltar o mouse. |
| **Seleção / edição de outra pessoa** (corrigida no Chat 08.2) | `RemotePresence` + `PresenceBox` / `PresenceLabelTag` / `PresenceEditFrame` (`ui/Presence.tsx`), `utils/presenceLayout.ts` | Seleção: **UMA caixa por pessoa** (união dos objetos de topo — um frame com filhos conta como um), borda de **2 px constante com o zoom** (`box-shadow`), sem preenchimento nem alças, e **UMA etiqueta** com o primeiro nome no canto **superior direito** (o esquerdo é do título do frame); se encostar na borda ou em outra etiqueta, vai para o inferior direito ou empilha. Cor da etiqueta escurecida até o texto ter contraste AA. Edição: contorno 2 px + fundo 6 % + selo de iniciais, sem etiqueta. O objeto fica bloqueado para os outros até a pessoa soltar (o servidor decide quem chegou primeiro); conversas (pins) são compartilhadas. |
| **Seguir / conduzir** | `FollowBanner` (`components/collab/`) no topo do canvas | Pílula do painel (`border-[var(--od-panel-border)] bg-[var(--od-panel)] shadow-md`, 12,5 px semibold). Seguindo: `Eye` na cor de seleção; pausado: `EyeOff` + primário "Voltar a seguir"; conduzido: "{nome} está conduzindo…" + "Sair do modo seguir"; quem conduz: `Users` + "Você está conduzindo a tela de N pessoas" + "Parar de conduzir". |
| **Cores diferentes** | Admin → Políticas → Servidor | `Toggle` padrão. O servidor separa cores iguais/parecidas (ΔE < 30); todas as telas veem a mesma cor, inclusive o avatar próprio. |

**Em que difere do padrão de mercado (CLAUDE.md regra 9):** a presença fica no canvas e na pilha de avatares da barra do topo já existente (sem painel lateral de participantes nem barra própria de colaboração); seguir e conduzir usam uma faixa única no topo do canvas, com pausa automática ao mexer na tela, em vez de moldura colorida em volta da janela.

## 8. Mesa (Dashboard)

Na tela viva: grupo **07 · Mesa**.

| Componente | Arquivo | Visual |
|---|---|---|
| Cabeçalho docado | `dashboard/AppHeader.tsx` | faixa `bg-panel` com borda inferior; logo · `SpaceSwitcher` (popover de espaços) · campo de busca que abre a `CommandPalette` (`Ctrl+K`) · tema · conta |
| Título do espaço | `DashboardView.tsx` | Fraunces 3xl; substitui a saudação (sem emoji) |
| Botão dividido "Novo board" | `dashboard/NewBoardMenu.tsx` | `.od-btn-primary` + segmento de seta com menu de modelos |
| Abas sublinhadas | `DashboardView.tsx` | Todos · Meus · Favoritos · Recentes · Templates; ativa com sublinhado `bg-accent` de 2 px e contador |
| Retomar / Começar com… | `ResumeCard.tsx`, `StartList.tsx`, `TemplateThumb.tsx` | cartão largo com miniatura do último board + lista de modelos com miniaturas desenhadas |
| Cartão de board | `BoardCard.tsx` (+ `BoardChip`, `BoardActionsMenu`) | miniatura 16:10, nome, tempo relativo (`timeAgo`), estrela de favorito; alternativa em lista |
| Paleta de comandos | `CommandPalette.tsx` | modal centralizado `.od-pop`, resultados navegáveis por setas |
| Confirmar e-mail (Chat 08.5) | `dashboard/VerifyEmailBanner.tsx` | mesma faixa `bg-accent-soft` `ring-line` dos outros avisos da Mesa, com `MailCheck`; secundário pequeno "Enviar link de confirmação" + "Agora não". Só no Modo Servidor com e-mail ligado e e-mail não confirmado; não bloqueia nada. Depois de enviar, o texto mostra o endereço e a validade (60 min) |

## 9. Telas e fluxos

Na tela viva: grupo **08 · Telas e fluxos**.

### 9.1 Importar e exportar

Formatos abertos apenas (`CLEAN_ROOM.md` §6). Nenhum token novo: tudo reutiliza `--od-*`; a prévia de planilha usa as cores de CONTEÚDO da tabela (iguais nos dois temas).

| Peça | Arquivo | Visual / comportamento |
|---|---|---|
| **Modal Exportar · Importar · Inspetor** | `modals/ExportImportModal.tsx` | `Modal` 920 px (780 nas abas de importação), abas sublinhadas (`border-accent` 2 px). **Exportar:** coluna de 300 px com os formatos do `ExporterRegistry` agrupados (Imagem · Vetor · Documento · Dados · Backup), cartão `bg-panel ring-line` → escolhido `bg-accent-soft` + anel 2 px `--od-selection`, extensão em mono `text-2xs`. À direita: segmento **Board inteiro · Seleção · Frames** (`bg-panel-sunken`; opção que o formato não usa a 40 % com motivo no `title`), lista de frames com nº do slide e Todos/Nenhum, opções declarativas do exportador (`select`/caixa), prévia das 3 primeiras linhas no CSV de issues, resumo vivo com `Info` e botão primário “Exportar .ext” (spinner + “Gerando página n de N…” no PDF por frames). Dados para planilhas mostram a linha “Proteção contra fórmulas”. |
| **Aba Importar arquivo** | `ExportImportModal.tsx` (`ImportTab`) | zona de soltar `border-2 border-dashed` (ativa: `--od-selection` + `--od-selection-fill`), botão primário “Escolher arquivos…” e grade 2 colunas com cada importador (nome, extensões em mono, descrição, “Base: padrão aberto”). Rodapé: “só formatos abertos e documentados”. |
| **Inspetor de colagem** | `ExportImportModal.tsx` (`InspectTab`) | campo `.od-input` 120 px “Clique aqui e cole”; lista de **tipos recebidos** em cartões `bg-panel-sunken` com selo `lido` (`bg-accent-soft`), `arquivo` (anel) ou `não lido` (`text-ink-subtle`) — tipos não padrão nunca são lidos; à direita “O que vai entrar no board” (`bg-canvas`): ✓ `--od-success` + título + detalhe, miniatura real (`generateThumbnail`) ou espiada da tabela; “Conteúdo não suportado” em `--od-danger` com o texto que dá para colar. Ações: Colar como texto · Colar como imagem · **Inserir no board** (primário). |
| **Importar planilha** | `modals/ImportSheetModal.tsx` | `Modal` 1040 px. Faixa de origem `bg-panel-sunken`: aba, separador e codificação (CSV/TSV), “Primeira linha é cabeçalho”, “Vírgula decimal (1.234,56)” e a nota “Datas ficam como texto · fórmulas não são calculadas”. Avisos do arquivo em `--od-warning`. **Prévia** (20 linhas × 14 colunas, cabeçalhos A/B/C e nº da linha fixos, `bg-panel-sunken`): cabeçalho `#E7F1D6` negrito, grade `#CBD2C6`, cores/negrito/alinhamento/mesclagens do arquivo, números à direita. **Destino** em cartões (Tabela nativa *padrão* · Cards de Kanban · Grade de post-its) e o painel do destino: mapeamento coluna → campo do card (título obrigatório) ou “Um por linha / Um por célula” + as 16 cores de post-it (nome no tooltip). Caixa “Criar um frame com o nome da planilha”. A coluna de destino rola sozinha em telas baixas; o rodapé (“Vai criar N … · um passo de desfazer” + Cancelar/Inserir) fica sempre visível. |
| **Limite de segurança** | `ImportSheetModal.tsx` | acima de 5.000 linhas × 60 colunas: caixa `bg-warning-soft ring-line` com a opção “Importar só o início (…)”; sem marcar, “Inserir no board” fica desabilitado com o motivo no `title`. |
| **Confirmação > 500** | `ImportSheetModal.tsx` | 1º clique troca o botão para `od-btn-danger` “Sim, inserir 1.240 post-its” e mostra o aviso `TriangleAlert` em `--od-warning`; tabelas pedem confirmação acima de 10.000 células. |
| **Forma importada de SVG** | `elements/ShapeView.tsx` + `utils/shapes.ts` (`shapeElementPath`) | `ShapeElement.customPath` (path normalizado M/L/C/Q/Z) desenhado na caixa original e escalado para o tamanho atual — mesma função na tela, no PNG/PDF e no SVG. Sem decoração; texto com a margem do retângulo. Trocar o tipo da forma descarta o contorno livre. |
| **Overlay de soltar no board** | `canvas/CanvasStage.tsx` | mesmo véu do Chat 02, texto “Solte para inserir aqui — imagens, planilhas, SVG ou .excalidraw”. |
| **Dado codificado na colagem** | `utils/clipboard.ts` (`detectEncodedData`), `ui/Toaster.tsx`, Inspetor | texto colado com mais de 2.000 caracteres e cara de dado codificado (%XX, XML ou base64 — detecção genérica, nada é decodificado). `Ctrl+V` no board: aviso com ícone `Info`, título “Parece dado codificado de outro programa.”, linha de ajuda em `text-xs` (“Para trazer um diagrama de outro editor, exporte como SVG ou imagem e use Importar arquivo.”) e botão de ação **Inserir mesmo assim** (pílula clara sobre o aviso escuro; fica 10 s). Inspetor: título em `--od-warning` com `TriangleAlert`, detalhe (“11.330 caracteres · 70 % em sequências %XX”), caixa de ajuda `bg-panel ring-line` com `Info`, trecho do texto em mono e **Inserir no board desabilitado**; “Colar como texto” continua disponível. |
| **Aviso com ação (Toaster)** | `ui/Toaster.tsx` | Toast pode ter `detail` (linha de ajuda) e `action` (botão). Sem eles, o visual é o mesmo de antes. |
| **Entradas** (Chat 08.2) | `studio/BoardCardDrawer.tsx`, `toolbar/dock/Toolbox.tsx`, `menus/canvasMenu.tsx`, `menus/tableMenu.tsx`, `menus/elementMenu.tsx`, `toolbar/FrameControls.tsx` | Ficha do board → **Exportar…** / **Importar…** (o modal de sempre, com Inspetor de colagem); Caixa de ferramentas → Trazer e levar → Importar / Exportar / Templates; botão direito no vazio → Inserir aqui → Arquivo (planilha, SVG…); objeto → Exportar e info → CSV; frame → Exportar (Cinta) ou Frame e modelo → Exportar frame; tabela → Levar para planilhas. |

**Textos:** nenhuma marca de terceiros na interface — os rastreadores de issues aparecem como “CSV de issues (rastreadores)” e as colunas são os nomes de campo em inglês que os assistentes de importação esperam; formatos aparecem pela extensão (`.xlsx`, `.ods`, `.csv`, `.svg`, `.excalidraw`).
**Movimento:** cartões e segmentos `duration-base` (180 ms); spinner `animate-spin` só durante a exportação.
**Diferença do padrão de mercado:** formato, escopo (board/seleção/frames) e opções ficam no MESMO diálogo, com um resumo vivo do que vai sair; na importação de planilha, origem, prévia (já com cabeçalho e mesclagens) e destino ficam na mesma tela, e o Inspetor mostra o que chegou antes de inserir.

---

### 9.2 Workspace, administração e compartilhamento


**Nenhum token novo.** Tudo reutiliza `panel`, `panel-sunken`, `accent`/`accent-soft`, `selection`, `warning-soft`, `success-soft`, `danger`, `line` e as sombras existentes. Componentes reais da área admin ficam em `src/components/admin/adminUi.tsx` (`AdminSection`, `StatCard`, `StatusPill`, `Tag`, `PersonCell`, `ConfirmButton`, `Toggle`, `NumberField`, `EmptyRow`) e aparecem na tela viva (Telas e fluxos › Administração do workspace).

| Item | Onde | Regra visual |
|---|---|---|
| **Seletor de espaço em trilha** | `dashboard/SpaceSwitcher.tsx` | Um único botão no cabeçalho da Mesa: quadradinho na cor do time (ou `brand-600`), nome da organização em `ink-subtle` (some < lg), `ChevronRight` entre Time e Projeto, `ChevronDown` no fim. Popover = `Menu` com rótulo da organização, rádios com ícone (Espaço pessoal `Lock`, Compartilhados comigo `Inbox`, Geral `Building2`, times `UsersRound` na cor do time, projetos `Folder` com “·”) e ações no rodapé. |
| **Administração (`#/admin`)** | `admin/AdminView.tsx` | Cabeçalho docado da Mesa + navegação lateral da seção (250 px; vira faixa rolável no celular) com ícone em quadrado `panel-sunken` (ativo = `accent-soft`), título, dica e contador em pílula. Conteúdo em `AdminSection` (= `Section` das Configurações: `rounded-2xl bg-panel shadow-panel`). Título da página em Fraunces 28 px. Única tela com menu lateral (é administração, não board). |
| **Alertas da Visão geral** | `admin/AdminOverview.tsx` | Faixas `rounded-2xl bg-warning-soft ring-line` com ícone, frase e ação ghost à direita, sempre no topo do conteúdo. Cartões `StatCard` (número em Fraunces 28 px, `tabular-nums`). |
| **Status de conta** | `StatusPill` | Ativa `success-soft`, Suspensa `warning-soft`, Removida `panel-sunken`/`ink-subtle`. |
| **Ações destrutivas sem diálogo** | `ConfirmButton` | 1º clique troca o rótulo por “Confirmar?”/texto específico e o botão vira `od-btn-danger` por 4 s; 2º clique executa. Desabilitado → `title` com o motivo de `explain()`. Último administrador: select de papel e “Suspender”/“Remover” desabilitados com o motivo. |
| **Modal Compartilhar** | `share/ShareBoardModal.tsx` | Modal 640 px com “abas-cartão” num segmento `bg-panel-sunken` (Pessoas · Facilitadores · Link público). Linhas de pessoa com avatar de iniciais em `accent-soft`. Interruptor `role="switch"` (24 × 44, `bg-accent` ligado). Botões de validade (1 h · 24 h · 7 dias · Sem prazo): a opção vigente fica em `bg-accent` + `text-[var(--od-accent-contrast)]` + anel `ring-selection` + semibold, com `aria-pressed`; as demais em `od-btn-secondary` (ajuste pós-teste do Chat 06). **Aviso fixo da senha local** (`ShieldAlert`, texto `ink-subtle`) abaixo do campo de senha. “Exportar e baixar” fica desabilitado com a frase da política quando `allowViewerExport` está desligada (a política é teto). Bloqueios mostram o motivo numa faixa `warning-soft`. |
| **Portão do link público / sem acesso** | `board/PublicLinkGate.tsx`, `board/BoardNoAccess.tsx` | Cartão central 420 px `shadow-modal` com ícone em `accent-soft`, título, texto e um botão; nota de modo local separada por `border-t`. |
| **Faixa de visitante / simulação** | `BoardBanners.tsx`, `DashboardView.tsx` | Visitante: `od-panel` com `Link2`. Simulação na Mesa: faixa `accent-soft` com `ScanEye` e “Sair da simulação”. |
| **Chips de domínio** | `admin/AdminPolicies.tsx` | Chips `bg-panel ring-line` com `@domínio` e X dentro de uma faixa `panel-sunken`; o campo sem borda fica no fim (Enter ou vírgula adiciona; inválido = texto `danger` abaixo). |
| **Assistente de transferência** | `admin/AdminTransfer.tsx` | Passos em pílulas: atual `accent-soft` + `ring-selection`, concluído com círculo `bg-accent` + `Check`. Escolhas em linhas `role="radio"`; prévia com checkboxes `accent-[var(--od-accent)]`. |
| **Lixeira** | `DashboardView` (aba Lixeira), `admin/AdminTrash.tsx` | Linhas com ícone do board, “Excluído por … · some em N dias”, Restaurar (`od-btn-secondary`) e Excluir de vez (ghost `danger`). O aviso de “Mover para a lixeira” traz o botão Desfazer (toast com ação). |

**Diferença do padrão de mercado:** a administração é um “caderno de seções” com alertas fixos e contadores na própria navegação, sem planos, upsell ou painéis pagos; o compartilhamento junta pessoas, facilitadores e link público numa só ficha, com o motivo de cada bloqueio visível e o aviso honesto de que a senha local só protege com servidor.

---

### 9.3 Persistência, versões, busca e backup


**Nenhum token novo.** Reutiliza `od-panel`, `panel-sunken`, `accent-soft`, `warning`/`warning-soft`, `success`, `line` e os componentes da área admin (`adminUi.tsx`).

| Item | Onde | Regra visual |
|---|---|---|
| **Histórico de versões** (Chat 08.2: a lista virou a **Linha do tempo** do Tempo, §4; o arquivo continua com a lista e o "Salvar versão") | `board/VersionHistoryDrawer.tsx` | Gaveta `od-panel` à direita do canvas (340 px, `z-[44]`, `data-od-floating`, Esc fecha), abaixo da Régua. Cabeçalho com `History`; faixa de "Salvar versão" (campo + `od-btn-primary`) e a nota da política; lista agrupada por dia (data longa em `text-2xs uppercase ink-subtle`). Ícone por tipo: `Clock` automática, `Bookmark` salva com nome, `ShieldCheck` em `--od-warning` para a versão de segurança (com o motivo na 3ª linha). Linha aberta = `bg-panel-sunken ring-line` + prévia 4:3 (`bg-canvas`, mesma máscara de privacidade do export) + Restaurar (1º clique troca para "Restaurar agora?" em `od-btn-danger` por 4 s) e excluir (ícone). |
| **Busca dentro dos boards** | `dashboard/CommandPalette.tsx` | Mesma paleta Ctrl+K; grupo novo "Dentro dos boards" com o trecho encontrado como rótulo (texto do usuário, sem tradução) e "Board · tipo" como dica; quadradinho na cor do board. Enquanto o índice é montado: linha `text-xs ink-subtle` "Procurando dentro dos boards…" (`role=status`). |
| **Backup do workspace** | `admin/AdminBackup.tsx` (`#/admin/backup`) | Duas `AdminSection`: exportar (botão primário + contagem) e restaurar (arquivo → resumo em `bg-panel-sunken` com contagens em grade e o aviso do que será substituído; confirmação em 2 cliques via `ConfirmButton`). Erros de validação em `bg-danger-soft text-danger`. Linha final informa o armazenamento em uso (IndexedDB ou localStorage). |
| **Acesso suspenso** | `auth/AccessSuspended.tsx` | Cartão central 420 px `shadow-modal` (mesmo padrão do portão do link público) com `ShieldOff` em `warning-soft`, título, texto e só o botão Sair — nenhum dado da organização na tela. |
| **Cadastro por convite / modo offline** | `auth/LoginView.tsx`, `dashboard/SpaceSwitcher.tsx` | Na aba Criar conta, faixa `accent-soft` "só aceita novas contas por convite" com o campo "Tenho um convite" embutido. Abaixo de "Continuar sem conta", uma linha `text-xs ink-subtle` explica o espaço isolado; no seletor de espaço o rótulo da organização vira "Modo offline" e só aparece o Espaço pessoal. |

**Diferença do padrão de mercado:** o histórico deixa explícitas as versões de SEGURANÇA (com o motivo: "antes de restaurar…", "antes de excluir 40 objetos"), de modo que desfazer uma restauração nunca depende de memória; o backup restaura sem destruir (o que sobra vai para a lixeira).

---

### 9.4 Extensões


**Nenhum token novo.** Reutiliza `od-panel`, `panel-sunken`, `accent-soft`, `warning`/`warning-soft`, `danger`/`danger-soft`, `line`, `shadow-modal` e os componentes `Toggle`, `Tag`, `ConfirmButton` (`admin/adminUi.tsx`), `Notice` (`share/ShareBoardModal.tsx`) e `Modal`. Temas de extensão só podem alterar tokens da **allowlist** (superfícies, texto, acentos, seleção, guia, semânticas, sombras, raios); `brand-*`, `--od-focus-ring` e movimento ficam fora — por isso as faixas "Visualizando como…" e os selos de bloqueio protegido nunca mudam.

| Item | Onde | Regra visual |
|---|---|---|
| **Gerenciador de Extensões** | `settings/ExtensionsManager.tsx` (`#/settings/extensions`) | Aba de Configurações (pessoal, deste navegador). Cartão `od-panel` com título, texto e dois botões: primário "Instalar arquivo .ludraw-ext…" e ghost "Carregar pasta (desenvolvimento)" (desabilitado com o motivo de `explain()` quando a política não permite). Abaixo, grade de 2 cartões `panel-sunken ring-line`: **Política do workspace** só para leitura (link para `#/admin/policies` se a pessoa pode editar) e **Modo Seguro** (`Toggle`; ligado, o cartão vira `warning-soft`). Seletor "Tema da interface" (`od-input`, `Palette`). Depois, duas listas: "Oficiais (embutidas)" e "Instaladas". |
| **Ficha de extensão** | `ExtensionCard` | `od-panel` arredondado 2xl. Ícone `Puzzle` em quadrado 40 px (`accent-soft` quando ativa). Nome em 15 px bold + versão `ink-subtle`; selos `Tag`: Oficial (brand), Nível 1 · declarativo, dev (warning), Alterada/Inválida (warning), Ativa (brand); "por X (declarado pelo autor)"; descrição; motivo de bloqueio em `text-warning`. `Toggle` numa faixa própria `panel-sunken ring-line` abaixo da descrição (funciona em qualquer largura); com o Modo Seguro ligado o rótulo mostra o estado efetivo (Desativada). "Detalhes" abre grade 2 colunas (rótulos `text-2xs uppercase ink-subtle`): licença, origem, proveniência, permissões ("Nenhuma — pacote declarativo"), o que traz (plural), data, **hash curto** em mono com `Fingerprint` + o aviso honesto (o hash fica no mesmo armazenamento; publisher declarado pelo autor; compare com o do autor). Remover = `ConfirmButton` (2 cliques). Ficha com problema ganha anel `--od-danger`. |
| **Aprovação da instalação** | `InstallDialog` / `InstallSummary` | `Modal` 560 px com `ShieldCheck`. Atualização: `Notice` info "versão A → B" + hash antigo → novo (ou "conteúdo idêntico"). Pasta dev: `Notice` warning. Bloco `panel-sunken`: permissões (`ShieldOff`), licença, proveniência, o que traz, e o **hash de 12 caracteres em mono 15 px bold** para comparar com o do autor. Rodapé: Cancelar (ghost) · "Instalar e ativar"/"Aprovar atualização" (primário). Falha: `Modal` com o motivo e a lista de problemas em `bg-danger-soft text-danger`, cada um com o caminho do campo em `code`. |
| **Extensões na Dock** (Chat 08.2: Caixa de ferramentas → Das extensões ativas; formas, adesivos e paletas nas bandejas) | `toolbar/dock/Toolbox.tsx`, `trays.tsx` | A antiga aba "Plugins" virou "Extensões": elementos compostos das extensões ativas agrupados pelo nome da extensão (`text-2xs uppercase`), cada um como `od-menu-item` com ícone `Shapes`; vazia = estado vazio com `Puzzle` e "Gerenciar extensões". Formas, stickers e paletas aparecem nos próprios flyouts (Formas, Stickers, Post-it) e nos popovers de cor da Barra de ações, sempre numa seção com o nome da extensão abaixo do conteúdo do núcleo. |
| **"Começar com…" e Galeria** | `dashboard/StartList.tsx`, `modals/TemplatesModal.tsx`, `extensions/TemplatePreview.tsx` | Modelos de extensão entram depois dos do núcleo, com selo `accent-soft` "Extensão" (`Puzzle` 10 px) e miniatura GERADA do próprio conteúdo (blocos nas cores dos frames/post-its sobre `--od-canvas`). |
| **Elemento composto** | `elements/DeclarativeElementView.tsx` + `utils/composite.ts` | Peças declarativas (retângulo, elipse, path normalizado, texto, selo) desenhadas pela mesma geometria na tela e no export; inválido → marcador neutro (`UnsupportedElementView`). Texto principal editável por duplo clique (`ElementText`). |
| **Tema de exemplo "Grafite" (E01)** | `extensions/builtin/tema-grafite/manifest.json` | Cinzas neutros claro/escuro com acento grafite; razões de contraste medidas pelo validador e exibidas na tela viva (Telas e fluxos › Extensões). |

**Regra de contraste dos temas (validador):** texto/painel, texto/fundo do app, texto secundário/painel, texto/fundo de aviso, erro/painel, **erro/fundo de erro**, primário-contraste/primário ≥ **4,5:1**; aviso/painel, primário/painel, seleção/canvas ≥ **3:1**. Fundos translúcidos são compostos sobre o painel antes de medir. O núcleo cumpre todas nos dois modos.

**Ajuste do núcleo (Chat 06.5, pedido do usuário):** `--od-danger` claro foi de `#C2412D` para **`#BC3F2C`** (os três canais escurecidos 3 %, mesmo matiz) — o mínimo para erro/fundo de erro sair de 4,29:1 para **4,51:1**; erro/painel foi de 5,14:1 para 5,40:1. O escuro (`#F08672`) não mudou (5,04:1). **Observação:** `--od-warning` claro sobre o painel mede 4,48:1 — passa como componente (3:1), mas `text-warning` também aparece como texto pequeno (motivos inline), onde fica 0,02 abaixo de 4,5:1 (sem alteração, aguarda decisão).

**Diferença do padrão de mercado:** não há loja nem busca remota — instalação só por arquivo local, e cada extensão é uma ficha com licença, proveniência e hash visíveis antes de ativar; o Modo Seguro desliga tudo sem desinstalar.

---

### 9.5 Extensões programáveis


**Nenhum token novo.** Mesmos componentes da §9.4 + `PermissionList`/`ElevatedRiskNotice` (`settings/ExtensionPermissions.tsx`) e `ExtensionPanelFrame` (`extensions/ExtensionPanelFrame.tsx`).

| Item | Onde | Regra visual |
|---|---|---|
| **Lista de permissões** | `PermissionList` | Uma linha por permissão: código em `code` mono (`bg-panel ring-line`) + frase simples no idioma ativo; `network` com ícone `Globe` em `--od-warning` e os domínios exatos. Na ficha (scripts), botão ghost “Revogar”/“Devolver” à direita; revogada = texto riscado `ink-subtle`. |
| **Risco elevado** | `ElevatedRiskNotice` | `ui.panel` + `board.read`: faixa `bg-danger-soft` com `ShieldAlert` em `--od-danger` e caixa de confirmação “Entendo o risco…”; o botão primário da aprovação fica desabilitado até marcar. |
| **Aprovação de embutida programável** | `ApproveDialog` (`ExtensionsManager.tsx`) | Ligar E04/E05 pela 1ª vez abre o `Modal` 560 px “Aprovar as permissões de …?” (lista + aviso de risco + dica de que dá para revogar depois). |
| **Execução na ficha** | `ExtensionCard` → “Execução” | `Cpu` + estado (em execução isolada / iniciando / parada / encerrada com o motivo) e “Reiniciar” (ghost, `RotateCcw`) quando encerrada. Abaixo, “Acessos à rede nesta sessão” em mono `text-2xs` (recusados em `--od-danger`). Selo do nível: “Nível 2 · programável”. |
| **Painel de extensão** (Chat 08.2: janela flutuante) | `studio/ExtensionPanelWindow.tsx` | cartão `.od-pop` arrastável de 340 px (sempre dentro da tela, `Esc` fecha, setas movem pelo cabeçalho) com o iframe isolado (`bg-panel`) e o rodapé `text-2xs ink-subtle` com `ShieldCheck` "Isolado: sem acesso ao app, à rede nem ao armazenamento do navegador". Abre pela API (`ludraw.ui.showPanel`, inalterada), pela Caixa de ferramentas → Das extensões ativas e pelo `Ctrl K` |
| **Comandos de extensões** | `CommandPalette` (Ctrl+K) e Caixa de ferramentas → Das extensões ativas | Grupo "Extensões" no topo da paleta (ícone `Puzzle`); na Caixa, item com o ícone próprio de extensão, o nome e "extensão · comando" + selo "extensão" |
| **Aviso de rede e de encerramento** | Toasts | “A extensão X acessou a rede: domínio” (neutro, 1ª vez por domínio na sessão); “A extensão X foi encerrada.” (danger) com o motivo no detalhe. |
| **Activity Log** | Linha do tempo → Ver eventos | Ações feitas por extensão terminam com "(via extensão "X")" e não se agrupam com ações feitas à mão. |

**Diferença do padrão de mercado:** as permissões aparecem em linguagem simples ANTES de ligar e continuam revogáveis uma a uma depois; o estado do processo isolado e cada acesso à rede ficam visíveis na própria ficha, sem loja nem conta de terceiros.

---

### 9.6 Modo Servidor


**Nenhum token novo.** Reaproveita o cartão central de `AccessSuspended`/`PublicLinkGate` (420–520 px, `shadow-modal`), as pílulas de passo do assistente de Transferência e o `Modal` base.

| Item | Onde | Regra visual |
|---|---|---|
| **Conexão com o servidor** | `ServerSettingsModal` (`modals/`), aberto pela entrada ("Conectar servidor Homelab") e por Configurações → Perfil → Sessão ("Configurar servidor…") | `Modal` 520 px com ícone `Server`. Linha do modo atual em `bg-panel-sunken` (`HardDrive` = Local, `Server` = Servidor). Campo do endereço + dica `text-xs ink-subtle`. "Testar conexão" (ghost, `PlugZap`) mostra o resultado ANTES de trocar: `bg-accent-soft` com `CheckCircle2` (organização, versão, SSO, setup pendente) ou `bg-danger-soft` com `CircleAlert`. Rodapé: "O app recarrega para trocar de modo" + primário "Conectar"; no Modo Servidor, secundário "Voltar ao modo local" (`Unplug`). |
| **Primeiro acesso** | `SetupView` (`setup/`, rota `#/setup`) | Cartão central 520 px. Três pílulas (Organização · Administrador · Pronto): atual `bg-accent-soft` + `ring-[var(--od-selection)]`; concluída com círculo `bg-accent` + `Check`. Token em `font-mono uppercase`. Modo da instalação em dois cartões-rádio (`Building2` / `UsersRound`) com a frase "A escolha é definitiva". Passo 2 termina com um resumo em `bg-panel-sunken`. Passo 3: comemoração (`SetupCelebration`, linha própria abaixo) e três ações (criar o primeiro Time, convidar, entrar na Mesa). |
| **Entrada no Modo Servidor** | `LoginView` (só o que o modo exige) | Sob o título, pílula `bg-accent-soft` com `Building2` "Servidor: <organização>". Sem as abas Entrar/Criar conta: faixa "só por convite" com "Tenho um convite". Com SSO, botão secundário largo com `KeyRound` "Entrar com <provedor>" antes do e-mail e senha, separado por "ou com e-mail e senha". Servidor fora do ar: faixa `bg-danger-soft` com "Tentar de novo". Com o Modo Local permitido, o botão discreto "Usar só neste navegador (sem sincronizar)" ganha embaixo a linha `text-xs ink-subtle` "Seus boards ficam guardados apenas neste navegador…" (Chat 08.5 · D). |
| **Convite no servidor** | `ServerInvitePanel` (`auth/`) | Mesmo layout do convite local (cabeçalho `accent-soft` com `MailOpen`); a prévia vem do servidor; regra de senha em `text-xs ink-subtle` sob o campo. |
| **Volta do SSO** | `SsoReturn` (`auth/`, rota `#/auth/sso`) | Cartão central com `LoaderCircle` enquanto conclui; erro com `KeyRound`, motivo traduzido e "Voltar para a entrada". Nenhum token passa pela URL. |
| **Troca de senha obrigatória** | `MustChangePassword` (`auth/ChangePasswordForm.tsx`) | Cartão central 420 px com `KeyRound` em `accent-soft`; bloqueia o app sem nenhum dado da organização; "Sair" ghost no fim. A troca a pedido usa o mesmo formulário num `Modal` 420 px (`ChangePasswordModal`). |
| **Envio ao servidor** | `SyncBadge` na barra do topo (`toolbar/TopBar.tsx`) | Mesmo lugar e forma do selo "Salvo" local; ponto colorido: salvo `success`, enviando `warning` pulsando, sem conexão `warning`, conflito/recusado `danger`. Conflito abre toast com ação "Recarregar". |
| **Avisos do link público** | `ShareBoardModal` e `PublicLinkGate` | No Modo Servidor o aviso "só protege com servidor" vira "Protegido pelo servidor: …" no mesmo `Notice`/rodapé. |
| **Comemoração do primeiro acesso** (ajuste pós-teste) | `SetupCelebration` (`setup/`), passo 3 do `#/setup` | Painel `bg-accent-soft` + `ring-line`, `rounded-2xl`. Confete procedural (46 peças, gerador determinístico, cores da marca + `STICKY_PALETTE`, `.od-confetti`); selo `bg-accent` com `Check` que "salta" e anel `--od-selection` que se expande; título com `PartyPopper` que balança; mini-board com três post-its (organização, administrador, modo; canário/lima/celeste, `stickyTextColor`) entrando um a um ligados por um conector tracejado que se desenha. Curvas `ease-out` da marca; com "Reduzir movimento" (app ou sistema) tudo aparece parado. Sem imagem nem biblioteca. |
| **Mostrar/ocultar senha** | `PasswordInput` (`ui/`) | Campo de senha com botão de olho dentro, à direita (`Eye`/`EyeOff` 16 px, `ink-subtle` → `ink` no hover, `aria-pressed`, rótulo "Mostrar senha"/"Ocultar senha"). Usado no setup, convites, troca de senha, portão e configuração do link público. Ícone à esquerda do campo (`absolute`) precisa de `z-10`, senão o contêiner do `PasswordInput` o cobre. |
| **Ícone ao lado do título** | cartões centrais (`PublicLinkGate`, `AccessSuspended`, `BoardNoAccess`, `MustChangePassword`, `SsoReturn`, convites, `AdminView` sem acesso) | Ícone em quadrado 44 px `rounded-2xl` `bg-accent-soft` na MESMA linha do `h1` (`flex items-center gap-3`), texto de apoio logo abaixo. |
| **Esqueci minha senha** | `ForgotPasswordModal` (`auth/`) | `Modal` 440 px com `KeyRound`. Servidor **sem e-mail**: quem redefine (admin da organização ou CLI de quem opera o servidor) e, com SSO, que a senha é a da empresa. Local: a conta só existe neste navegador. Com e-mail no servidor (Chat 08.5) o mesmo link da entrada abre a tela `#/forgot` (linha abaixo). |
| **Casco das telas de entrada** (Chat 08.5) | `AuthShell` + `AuthField` (`auth/AuthShell.tsx`) | Extraído do `LoginView` SEM mudança visual (16/16 capturas idênticas antes e depois, 4 larguras × claro/escuro × Local/Servidor): painel da marca à esquerda (`lg` em diante), coluna central `max-w-[400px]` com o botão de tema no canto. Toda tela sem conta usa este casco. |
| **E-mail e acesso** (Chat 08.5) | `ForgotPasswordView`, `ResetPasswordView`, `VerifyEmailView` (`auth/EmailAccessViews.tsx`; rotas `#/forgot`, `#/reset`, `#/verify`) | No `AuthShell`. Título Fraunces 3xl com ícone 36 px `rounded-xl` `bg-accent-soft` na mesma linha. Esqueci a senha: um campo de e-mail → faixa `accent-soft` com `CircleCheck` e resposta NEUTRA ("Se houver uma conta com …"). Nova senha: dois `PasswordInput`, nota `text-xs ink-subtle` "todas as sessões são encerradas". Link vencido/usado: `CircleAlert` + "Pedir novo link" (primário). Confirmado: `MailCheck` + "Continuar". Todas terminam com "Voltar para a entrada" (ghost). Mesma guarda do `#/setup` (trocar de aba não volta à entrada). |
| **E-mail do servidor** (Chat 08.5 · B2) | `MailSettingsSection` (`admin/MailSettings.tsx`), cartão próprio em Admin → Políticas, abaixo das políticas (salva à parte) | `AdminSection` "Envio de e-mail"; no canto, `Tag` de estado (brand "Ligado" com `Mail` / neutro "Desligado") + `Tag` da origem (variáveis, painel, os dois, pasta de saída). Interruptor `Toggle` "Usar a configuração deste painel" (travado e ligado com `LUDRAW_SMTP_HOST`). Campos `od-input h-9 text-[13px]`: servidor + porta (`select` 587/465/25/2525, dica `text-xs ink-subtle`), segurança em segmentado `bg-panel-sunken` (STARTTLS obrigatório / TLS direto), usuário + senha (`PasswordInput`, sempre vazia: placeholder "Definida — deixe em branco para manter" e link `text-danger` "Remover senha"), remetente. Campo definido por variável: `Tag` com `Lock` 10 px "definido pelo servidor" e input só leitura. Avisos `rounded-xl ring-line text-[13px]`: sem `LUDRAW_JWT_SECRET` (sunken), chave mudou (`bg-warning-soft` + `ShieldAlert`), sem `APP_URL` (warning), pasta de saída (sunken, cartão só leitura). **No `multi_org` o cartão não existe** (Chat 09 · R5: `mailPanelVisible`; o SMTP é do servidor inteiro e as rotas recusam). Rodapé `border-t`: secundário `Send` "Enviar e-mail de teste" (só ligado) + primário `Save` "Salvar" (só com mudança). Na lista de Membros, `Tag tone="warning"` "e-mail não confirmado". |
| **E-mails** (Chat 08.5 · B2) | `composeMail` (`src/utils/mailLayout.ts`), faixas `mailBannerSvg` (`src/utils/mailBanners.ts`), prévia `MailPreviews` (frame "E-mails" do `#/design-system`) | Fundo `#EDF1E8`, cartão branco 600 px `radius 20` `border #DDE5D3`. Faixa 600×168 (PNG embutido por CID; SVG só nas prévias): verde-floresta chapado, grade de pontos do canvas, trilha do logo, símbolo + "ludraw" em Figtree 800 e, à direita, ilustração por tipo (post-its+cursor, chave, prédio, envelope com selo, aviãozinho, porta, bússola) — uma por tipo de e-mail (a faixa única foi descartada pelo usuário). Etiqueta `12px` caixa-alta `#3B7A57` + letter-spacing 1.6; título `26/32` 800 `#102A1C`; corpo `16/25`; botão de tabela `#194B32` raio 12 com seta; caixa do endereço `#F4F8EE`; nota com filete pistache 3 px; rodapé fora do cartão com "ludraw" pequeno. Escuro por `@media (prefers-color-scheme)` (botão vira pistache). |
| **"Tenho um convite"** | `InviteCodeEntry` | Botão secundário de largura total (antes fantasma acinzentado; contraste insuficiente nos dois temas). |
| **Detecção automática e Modo Local bloqueado** | `LoginView`, `ServerSettingsModal`, `AdminPolicies` | App servido pelo servidor: sem "Continuar sem conta" nem "Voltar ao modo local" quando o servidor bloqueia o Modo Local (padrão). Com Modo Local permitido, um separador "ou" e um botão secundário ("Usar só neste navegador (sem sincronizar)" / "Entrar no servidor “<organização>”"); no Modo Local, "Continuar sem conta" vira um cartão de opção (`od-btn-secondary` alto, alinhado à esquerda): ícone `HardDrive` em quadrado 36 px `bg-accent-soft`, título 15 px semibold, linha `text-xs ink-muted` "Só neste navegador, sem sincronizar" e `ArrowRight` `ink-subtle` (Chat 08.5 · D). Em Admin → Políticas, grupo "Servidor" com o `Toggle` "Permitir modo local neste servidor". |
| **Mudança em outra janela / link revogado** | toast (`serverSync.ts`) e `PublicLinkGate` | Toast neutro de 30 s "Alguém salvou uma versão mais nova…" com ação "Recarregar", uma vez por revisão. Visitante com o link revogado: toast `danger` e o board dá lugar ao cartão "Este link foi revogado", sem recarregar a página. |
| **Imagem guardada no servidor** (Chat 08.2 · A-2) | `ImageView` (`elements/`) | Enquanto a imagem é buscada no servidor: o mesmo fundo do estado "Imagem indisponível" (`bg-panel-sunken`, `ring-line`) com `LoaderCircle` girando, do tamanho do ícone desse estado; falhou = "Imagem indisponível" como antes. Envio/vínculo recusado: toast `danger` com o motivo ("A imagem não foi enviada: …"). Nenhum token novo. |
| **Trazer boards deste navegador** (Chat 08.2) | `LocalImportBanner` na Mesa + `ImportLocalBoardsModal` (`modals/`), também em Configurações → Perfil → Sessão | Faixa `bg-accent-soft` `ring-line` (`HardDriveUpload`, secundário pequeno + "Agora não") só no Modo Servidor, com boards locais ainda não trazidos e `can('workspace.boards.create')`. `Modal` 520 px: lista com caixa de seleção (nome, objetos, editado), recusa na PRÓPRIA linha em `text-xs text-danger` (limites conferidos antes de enviar; erro do servidor depois), já trazido = pílula `bg-accent-soft` com `Check`; destino num `od-input` só com os lugares que `can()`/`canUsePlace` permitem; nota `text-xs ink-subtle` sobre autoria. Um board recusado nunca interrompe os outros. |

| **Link geral, cadastro e pedidos** (Chat 08.5 · B) | `JoinView`, `SignupCompleteView`, `RequestAccessView`, `AccessConfirmView` (`auth/AccessViews.tsx`; rotas `#/join`, `#/signup`, `#/request-access`, `#/access`) | No `AuthShell`, mesmo título com ícone 36 px das telas de e-mail. Prévia do link no subtítulo ("LuDraw de {org}, como {papel}") e dica `text-xs ink-subtle` do domínio. Com e-mail: só o campo de e-mail; sem e-mail: nome + e-mail (nunca senha). Tudo termina na mesma faixa `accent-soft` com `CircleCheck` e texto NEUTRO (não diz se a conta existe). Cadastro: e-mail só de leitura, nome, senha e confirmação (`AuthField raiseIcon`). Pedir acesso: nome, e-mail e mensagem opcional (textarea com `MessageSquareText`, 500 caracteres). Login: link `text-[13px] font-semibold text-ink` sublinhado (`decoration-ink-subtle`, foco com anel `--od-selection`) com `MessageSquarePlus` 15 px, "Não tem convite? Pedir acesso", dentro da caixa do convite, só com a política ligada (ajuste pós-teste: o `text-xs` verde sobre `accent-soft` ficava pouco visível). |
| **Cadastro com o e-mail da organização** (Chat 08.5 · C) | `SignupRequestView` (`auth/AccessViews.tsx`, `#/register`); interruptor e `DomainSignupNotice` em Políticas → Pessoas; `Tag` "entrou pelo domínio" em Membros | Mesmo casco e título com ícone (`UserPlus`) das telas da B. Só o campo de e-mail e a dica `text-xs ink-subtle` "Use o e-mail da sua organização…" — **nunca** a lista de domínios. Termina na mesma faixa neutra. Login: segundo link `text-[13px]` sublinhado com `UserPlus`, abaixo de "Pedir acesso", e o texto da caixa vira "Novas contas entram por convite ou com o e-mail da organização". Políticas: avisos `bg-warning-soft text-xs` "Ligado, mas inativo: …" e "Teto do dia atingido em …". |
| **Modo Local com servidor** (Chat 08.5 · D) | `dashboard/LocalModeBanner.tsx`: `LocalModeBanner` (Mesa), `LocalOnlyBadge` (Ficha, depois do `SaveStatus`), `LocalModeNotice` (topo da gaveta Você) | Só no Modo Local com o servidor desta instalação disponível. Mesa: mesma faixa `bg-accent-soft` `ring-line` dos avisos, com `HardDrive` e UM só botão secundário "Entrar no servidor “<organização>”", **sem** "Agora não". Ficha: pílula `h-6` `bg-accent-soft` `text-brand-800` com `HardDrive` "Só neste navegador" (abaixo de 1180 px só o ícone), que abre a gaveta Você ancorada nela. Gaveta: bloco `rounded-xl bg-accent-soft` com título, texto `ink-muted` e botão primário pequeno. A ação grava o board antes de trocar; falhou = fica no Local com toast `danger`. Exemplos em Mesa e em Estúdio › Selos de estado. |
| **Administração → Membros: pedidos e links** (Chat 08.5 · B) | `AccessRequestsSection`, `InviteLinksSection`, `GrantFields`, `SendEmailCheck` (`admin/AccessAdmin.tsx`) | Duas `AdminSection` acima dos convites pendentes, mesmas linhas `rounded-xl ring-line` da lista de convites. Pedidos: selos `Tag` "e-mail confirmado" (brand, `MailCheck`), "e-mail não confirmado" (warning, `MailQuestion`), "pelo link de …" (`Link2`) e "já tem conta"; mensagem `text-[13px] ink-muted` sob o e-mail; Aprovar (secundário) + Recusar (`ConfirmButton`). Links: papel com `Link2`, domínio em `Tag`, "x/máx usos" `tabular-nums`, situação ativo (brand) / esgotado ou vencido (warning) / desativado (neutro). Modal do link: o endereço aparece UMA vez, com aviso `bg-warning-soft` "Copie agora". `GrantFields` = papel membro/convidado (nunca admin), times ou escopo do convidado e nível no board. "Enviar o convite por e-mail": caixa com rótulo e dica, ligada por padrão (também no `InviteModal`, que serve o Compartilhar do board). Lista de convites: `Tag` "enviado por e-mail" e "Reenviar e-mail" (ghost, `Send`). |

**Diferença do padrão de mercado (Chat 08.5 · C, cadastro pelo domínio):** não há página pública de cadastro nem lista de domínios exposta; o link só aparece com a política ativa e qualquer endereço termina na mesma tela neutra.

**Diferença do padrão de mercado (Chat 08.5 · B2, e-mail pelo painel):** não é uma página de integrações nem um assistente: é um cartão dentro de Políticas, e cada campo diz de onde vem o valor (variável do servidor ou painel); a senha nunca volta para a tela.

**Diferença do padrão de mercado (Chat 08.5 · B, link geral e pedidos):** link e pedido terminam na mesma tela neutra de "recebido" no casco da entrada, sem cadastro aberto; a administração decide dentro da lista de Membros (sem página nem aba própria), e o link geral mostra o endereço só na criação.

**Diferença do padrão de mercado (Chat 08.5, e-mail e acesso):** a recuperação de senha e a confirmação de e-mail acontecem no mesmo casco de duas colunas da entrada (marca à esquerda), não numa página de serviço separada; o aviso de e-mail não confirmado é uma faixa da Mesa que não bloqueia nada.

**Diferença do padrão de mercado (Chat 08.2, trazer boards):** em vez de um assistente de migração em várias telas, um único diálogo com o que existe NESTE navegador, o motivo de cada recusa na própria linha e o destino escolhido uma vez.

**Diferença do padrão de mercado:** a conexão é testada e explicada antes de trocar de modo (e cada modo guarda os próprios dados, sem mistura); o primeiro acesso exige o token impresso nos logs do próprio servidor e mostra um resumo antes de gravar; não há tela de cadastro aberto — só convite ou o login da empresa. A comemoração do primeiro acesso usa o próprio vocabulário do canvas (post-its e conector), não um troféu ou mascote.

### 9.7 Splash de abertura

Especificação: `ai-memory/refs/SPLASH_SPEC.md`; animação de referência criada pelo usuário: `ai-memory/refs/splash-reference.html`. **Só o logo, sem texto visível** (pedido do usuário; o nome vai para o leitor de tela).

| Peça | Arquivo | Visual / comportamento |
|---|---|---|
| Boot estático | `index.html` (`#od-boot`) | logo completo de 132 px no centro, fundo `--od-canvas` (claro `#F5F6F8` / escuro `#16161A`, pelo tema salvo ou `prefers-color-scheme`), brilho e sombra iguais aos da splash; removido quando a splash React monta (sem salto) |
| Splash | `components/splash/SplashScreen.tsx` | `role="status"`, "Carregando o LuDraw…" só para leitor de tela; montada uma vez em `App.tsx` por cima das rotas (nunca no modo embed) |
| Portão | `components/splash/useSplashGate.ts` | sai com mínimo de 1,1 s **e** store reidratado **e** fontes prontas (no máx. 2,4 s de espera) **e** logo completo; failsafe de 4 s |
| Física do logo | `utils/logoAnimation.ts` | porte da referência: mola com inércia em fases (`line → airEnd → holdEnd → hopBack → lineBack → airStart → holdStart`), subpassos de 1/240 s, squash & stretch pela velocidade, pausa com `visibilitychange`; geometria por amostragem das Béziers (sem `getTotalLength`) |
| Campo pontilhado | `utils/splashField.ts` | grade de pontos do canvas (`--od-canvas-dot`) surgindo do logo para fora, ondas que acendem os pontos em `--od-selection`, respingos de tinta (`--od-accent`, `--od-selection`, `--od-brand-400`) e anel de encaixe (`--od-accent`) |

**Roteiro da abertura (modo `rewind`):** o boot estático "ganha vida" → a bolinha dá um pulinho e **rebobina** o traço → quica no início (respingos) → **redesenha** a curva e é lançada (respingos na direção do lançamento, o ladrilho incha) → **encaixa** no topo (o ladrilho achata, anel + onda pela grade, brilho pulsa) → **íris**: o fundo se abre a partir do logo e revela o app enquanto o logo, completo, vai a `scale(0.94)` e some (420 ms, `ease-out`). Total típico ≈ 2,6 s.
**Modo `intro`** (botão "Reproduzir" da splash na tela viva): o ladrilho nasce de uma gota que cai no canvas (onda), abre de círculo para quadrado com mola e a linha é desenhada do zero.

- **Cores:** ladrilho `--od-brand-900` (`#194B32`) e traço `--od-brand-200` (`#D0E4AE`) nos dois temas; brilho `bg-accent` a 10 % (claro) / 12 % (escuro); sombra do ladrilho `--od-shadow-modal`; vinheta das bordas = `--od-canvas` misturado a 7 % de `--od-text`.
- **Movimento:** saída 420 ms `cubic-bezier(0.22, 1, 0.36, 1)`; animações por Web Animations API e `requestAnimationFrame` (não dependem de transição CSS). Rastro de 6 "fantasmas" da bolinha só aparece em alta velocidade.
- **Reduzir movimento** (preferência do app ou do sistema): logo completo e **estático**, sem grade animada, saída só com fade de 260 ms.
- **Desempenho:** um loop de física + um loop do campo que para sozinho quando não há energia; tudo cancelado no `unmount`.
- **Logo:** a splash usa a geometria da referência do usuário (`SPLASH_LOGO`, viewBox 100); as telas continuam com `LogoMark` (viewBox 64). Os dois desenhos são parecidos, mas não idênticos.

### 9.8 E-mail e acesso (Chat 08.5) — mapa

Na tela viva: grupo **08 · Telas e fluxos**, frame **"E-mail e acesso"** (abertura com o mapa do chat, "Entrada do servidor: o que o 08.5 acrescenta", cartão "Continuar sem conta", telas de senha/confirmação e o painel de envio), mais os frames **"E-mails"** e **"Convites, link geral e pedidos de acesso"**. As linhas detalhadas ficam no §9.6 (e a faixa de confirmação no §8); esta tabela só diz onde cada peça mora.

| Peça | Componente | Onde na tela viva |
|---|---|---|
| Casco das telas sem conta | `AuthShell` + `AuthField` (`auth/AuthShell.tsx`) | todas as telas abaixo |
| Esqueci a senha · nova senha · link inválido · e-mail confirmado | `ForgotPasswordView`, `ResetPasswordView`, `VerifyEmailView` (`auth/EmailAccessViews.tsx`) | E-mail e acesso |
| Painel "Envio de e-mail" (vazio, pelo painel, variáveis + painel) — só no `single_org` (Chat 09 · R5) | `MailSettingsSection` (`admin/MailSettings.tsx`), mostrado pelo `AdminPolicies` só com `mailPanelVisible(serverInfo.mode)` | E-mail e acesso |
| Links do Login (Esqueci a senha por e-mail, Pedir acesso, Criar conta com o e-mail da organização, Usar só neste navegador) | `LoginView` (regra 9: só estes itens, cada um sob condição) | E-mail e acesso (lista) |
| Continuar sem conta (cartão de opção) | `ContinueLocalCard` (`auth/ContinueLocalCard.tsx`) | E-mail e acesso |
| E-mails (um por tipo, com a ilustração própria) | `composeMail` (`utils/mailLayout.ts`) + `mailBanners.ts` · `MailPreviews` | E-mails |
| Link de convite geral · concluir cadastro · cadastro pelo domínio · pedir acesso · pedido confirmado | `JoinView`, `SignupCompleteView`, `SignupRequestView`, `RequestAccessView`, `AccessConfirmView` (`auth/AccessViews.tsx`) | Convites, link geral e pedidos de acesso |
| Membros → Pedidos de acesso e Links de convite | `AccessRequestsSection`, `InviteLinksSection` (`admin/AccessAdmin.tsx`) | Convites, link geral e pedidos de acesso |
| Faixa "Confirme seu e-mail" | `VerifyEmailBanner` (`dashboard/`) | Mesa › Cartão de board e avisos |
| Faixa, selo e aviso do Modo Local com servidor | `LocalModeBanner`, `LocalOnlyBadge`, `LocalModeNotice` (`dashboard/LocalModeBanner.tsx`) | Mesa › avisos · Estúdio › Selos de estado |

**Regras que valem para o conjunto:** telas sem conta sempre no casco da entrada e com a guarda do primeiro acesso; respostas públicas neutras (nunca revelam se um e-mail tem conta); avisos da Mesa no mesmo desenho `bg-accent-soft` `ring-line`; nenhum controle novo dentro do board além do selo da Ficha e do bloco na gaveta Você. **Em que difere do padrão de mercado:** recuperação, confirmação e cadastro acontecem no próprio casco de duas colunas da entrada (não em páginas de serviço separadas), e o aviso de modo vive no selo de estado do board.

### 9.9 Aplicativo desktop (Chat 09.1 · R7)

* **Tela "onde trabalhar"** (`src/components/desktop/DesktopPlaceCard.tsx`, só apresentação; `DesktopWelcome.tsx`, lógica): cartão `rounded-3xl bg-panel shadow-panel ring-1 ring-line`, até 920 px, duas colunas a partir de 768 px (uma abaixo disso, com a divisória virando linha de cima). Cada coluna: ícone 40 px em `bg-accent-soft`, título `h2`, texto e o botão no fim (secundário = Modo Local; primário = servidor).
* **Estados do servidor** (`ServerStep`): parado · testando · conectando (com "Escolher outra opção") · encontrado (`bg-accent-soft`: organização, versão, login da empresa e o host onde ele abre) · problema (`bg-danger-soft`, `role="alert"`: título, explicação e o que fazer) · falha ao abrir ou guardar.
* **Problemas** (`diagnoseServer`, `utils/desktopRules.ts`): endereço inválido, endereço não encontrado, servidor não respondeu, certificado não confiável, não é LuDraw, versões diferentes. O texto do certificado nunca ensina a ignorar o aviso (o `test:desktop` confere).
* **Avisos do programa:** no título da janela por 6 s ("endereço bloqueado: …", "salvo em Downloads: …"). **Menu nativo** "LuDraw": Trocar onde trabalhar… · Recarregar · Sair; textos em `src/locales/*/desktop.json`.
* **No app (Modo Local do programa):** a janela "Servidor" mostra só "Trocar onde trabalhar" (o app embutido nunca conecta a um servidor).
* **Exemplo vivo:** `#/design-system` → Telas e fluxos → "Aplicativo desktop".

## 10. Padrões de interação

- Todo ícone tem tooltip com nome + atalho; ação bloqueada por permissão mostra o motivo no tooltip.
- Funções fora do escopo: `notifyInDevelopment(nome, 'Chat XX — módulo')`.
- Feedback de ações (exportar, copiar, desbloquear): `notify(msg, 'success')` → toast.
- Seleção no canvas: caixa `--od-selection`, alças brancas (cantos circulares, laterais em pílula), alça de rotação ↻ no canto inferior esquerdo, rótulo de graus durante a rotação. Quem não pode editar não vê alças nem pontos de conexão, e arrastar move a câmera.
- Estruturas de fundo não entram no marquee nem no laço; um clique simples ainda as seleciona.
- Barras com `role="toolbar"` (barra do topo, Vista, Tempo, Dock e Cinta) navegam com ←/→/Home/End (`rovingFocus.ts`; botões de gavetas abertas ficam fora do percurso). `F6`/`Shift + F6`: Ficha → Roda → Cinta (com seleção) → Vista → Tempo → Dock.
- **Uma função, um lugar** (Chat 08.2): cada função mora num módulo só; atalhos e `Ctrl K` chegam a tudo.
- **Mostrar só o que se aplica:** item sem sentido no contexto some ("Desbloquear todos" sem nada bloqueado); item negado por permissão aparece desabilitado com o motivo. O que ainda não existe aparece com o selo único **"Em breve"** (desabilitado, `aria-disabled`, dica).
- **Anatomia única de gaveta/bandeja/menu:** cabeçalho (título + tecla) · conteúdo (rolagem interna, `max-height` dentro da tela) · rodapé com dica curta. `Esc` fecha e devolve o foco a quem abriu.
- **Foco e alto contraste (Chat 08.6 · A/B):** `:focus-visible` = anel `--od-focus-ring` (traço sólido de 2 px em `--od-focus-color`, ≥ 3:1, + halo) **+ contorno transparente de 2 px**; o hover do campo nunca apaga o anel (`.od-input:hover:not(:focus)`) — nunca `outline: none` sozinho. No alto contraste do sistema (`forced-colors: active`) o navegador remove sombras: o bloco `@media (forced-colors: active)` do `index.css` desenha o foco com `Highlight` e as bordas de `.od-input`, `.od-btn`, `.od-tool`, `.od-panel`, `.od-pop` e `[role=switch]` com contorno `CanvasText`. Componente novo cuja borda ou estado seja só `box-shadow` entra nessa lista.
- **Rótulos de campo (Chat 08.6 · A):** `<label htmlFor>` apontando para o campo; nunca um `<label>` envolvendo o campo junto com outro controle (o primeiro controle de dentro vira o dono do rótulo). Nas telas de entrada use `AuthField` (põe o `id` no primeiro filho e liga o erro por `aria-describedby`).
- **Títulos e regiões (Chat 08.6 · A):** cada tela tem **um** `h1` e **um** `main`. Board: `h1` só para leitor de tela com o nome do board e o canvas dentro do `main`. Telas de entrada: o `h1` é o título do formulário (`useAuthHeadingTag()` dá `h2` quando a tela aparece como exemplo no Sistema visual); o slogan do painel da marca é parágrafo.
- **Nome acessível = texto visível (Chat 08.6 · A, WCAG 2.5.3):** se o controle mostra texto, o `aria-label` contém esse texto (ou use `aria-labelledby` apontando para ele, como nos cartões da Mesa); `aria-label` e `title` iguais. Atalho de teclado vai em `aria-keyshortcuts`, não no nome; iniciais de avatar são decorativas (`aria-hidden`). Conferido por `npm run test:a11y:browser`.

## 11. Internacionalização


**Nenhum token novo, nenhuma cor nova, nenhuma fonte nova.** A tela `#/design-system` continua em pt-BR por decisão (I18N_SPEC §4.10) — o idioma não muda o visual. As regras abaixo valem para qualquer componente novo.

| Item | Onde | Regra visual |
|---|---|---|
| **Seletor de idioma** | `settings/SettingsView.tsx` (`LanguageSection`, aba Perfil, seção “Idioma e região”) | `Section` + `Field` padrão de Configurações com um `select.od-input` (`data-locale-select`): primeira opção “Seguir o navegador (…)” e depois cada idioma pelo **nome nativo** (“Português (Brasil)”, “English”); a dica do campo diz o idioma em uso. Troca na hora, sem recarregar e sem toast. Idiomas `draft` não aparecem; o pseudo-idioma `qps` só aparece quando está ativo por `?lang=qps`. |
| **Texto que cresce** | todos os componentes | Prever **≈ 30 %** a mais que o pt-BR/inglês: botões, abas e pílulas sem largura fixa (`min-w-*` em vez de `w-*`), `truncate` + `title` com o texto inteiro onde o espaço for físico (barra do topo, Cinta, Dock, cartões da Mesa); listas de abas roláveis (`overflow-x-auto`) como no Painel. Verifique sempre com `?lang=qps` (texto acentuado, ~35 % mais longo, entre colchetes). |
| **CSS lógico** | componentes tocados no 05.6 | `ms-/me-/ps-/pe-`, `start-/end-`, `text-start/text-end`, `rounded-s/e`, `border-s/e` no lugar de `ml/mr/pl/pr/left/right` — deixa o RTL viável sem refazer layout. Exceções que ficam físicas: o canvas (coordenadas do mundo), a Bússola (canto inferior esquerdo) e posições calculadas em JS. `<html dir>` vem de `_meta.json` do idioma. |
| **Marcação em textos traduzidos** | `i18n/Trans.tsx` | Negrito, `kbd`, código, ênfase e link entram por tags no catálogo (`<b>`, `<kbd>`, `<code>`, `<em>`, `<link>`, `<br/>`) e viram elementos React com as classes de sempre (`kbd` = `.od-kbd`); nunca `dangerouslySetInnerHTML`. Ex.: guia da sintaxe do diagrama (`modals.diagramGuide.*`). |
| **Datas, números e listas** | `i18n/format.ts` | Sempre por `Intl` no idioma ativo (`formatTimeAgo` “há 5 minutos” / “5 minutes ago”, `formatDate`, `formatNumber`, `formatList` “A, B e C” / “A, B, and C”, `compareText` para ordenar). Não formatar à mão nem fixar `'pt-BR'`. |
| **Atalhos** | `kbd`, menus, modal de atalhos | Iguais em todos os idiomas; só o **nome** de teclas com nome (Espaço/Space) é traduzido. |
| **Conteúdo do usuário** | canvas | Nunca traduzido. Board de boas-vindas, demonstração, templates, colunas do Kanban e cores/tags padrão são criados no idioma ativo e depois pertencem ao usuário. Valores antigos gravados (“Você”, “Meu espaço”) aparecem traduzidos na tela por `personLabel()`/`spaceLabel()` (`utils/storedNames.ts`). |

**Diferença do padrão de mercado:** a troca de idioma é instantânea e o pseudo-idioma `qps` faz parte do próprio app (qualquer pessoa testa estouro de layout e texto sem tradução com `?lang=qps`, sem ferramenta externa).

---

## Numeração antiga → nova

Até o Chat 08.2 este documento (e a tela viva) seguia a ordem dos chats; desde a reorganização por tipo de design, referências antigas como “DESIGN_SYSTEM §16” valem pela tabela abaixo. Os frames numerados 00–32 da tela viva deixaram de existir: cada assunto agora mora no seu grupo.

| Antes | Agora |
|---|---|
| §1 | §1 |
| §2 · 2.1 | §2.1 |
| §3 | §2.2 |
| §4 | §2.3 |
| §5 | §2.4 |
| §6 | §3 |
| §6.1 | §2.5 |
| §7 | §8 |
| §8 | §4 |
| §9 | §5.1 |
| §10 | §6.1 |
| §11 | §10 (cursores → 2.6) |
| §12 | §9.7 |
| §13 | §5.2 |
| §14 | §5.3 |
| §15 · 15.1 | §5.4 (cronômetro, votação, enquete e Facilitar → 6.2) |
| §16 | §9.1 |
| §17 | §11 |
| §18 | §9.2 |
| §19 | §9.3 |
| §20 | §9.4 |
| §21 | §9.5 |
| §22 | §9.6 |
| §23 | §7 |
