# Traduzindo o LuDraw

> **In English, in short:** copy `src/locales/en/` to `src/locales/<code>/`, edit `_meta.json`, translate the values (never the keys), run `npm run audit:i18n`, try it with `?lang=<code>`, run `npm run docs:languages` and open a pull request using the **translation** template. No code changes are needed: the build discovers the new folder by itself. The rest of this guide explains each step, the glossary and the tone.

A interface do LuDraw é traduzida só com arquivos JSON. Criar um idioma novo **não exige mexer em código**: basta uma pasta em `src/locales/`, a verificação `npm run audit:i18n` limpa e um pull request.

- Idiomas atuais e a completude de cada um: [LANGUAGES.md](LANGUAGES.md) (gerado).
- Especificação técnica: `ai-memory/I18N_SPEC.md`.
- Regras de origem: a tradução tem de ser **sua**. Não copie textos de outros produtos, nem de memórias de tradução ou glossários de terceiros (veja `CONTRIBUTING.md` §3). Tradução automática pode servir de rascunho, mas cada frase precisa ser revisada por uma pessoa fluente.

## 1. Como os catálogos estão organizados

```text
src/locales/
├── pt-BR/            ← fonte (todas as chaves nascem aqui)
│   ├── _meta.json
│   ├── common.json   ← um arquivo por área (namespace)
│   ├── board.json
│   └── …
├── en/               ← inglês oficial, mantido pela equipe
└── <código>/         ← o seu idioma
```

Cada arquivo é um objeto **plano** de `"chave": "texto"`. A chave completa é `<arquivo>.<chave>` — por exemplo, `"dock.stickyNote"` em `board.json` é `board.dock.stickyNote` no código.

| Arquivo | O que contém |
|---|---|
| `common.json` | Palavras e ações repetidas em todo o app, contagens, tempos relativos |
| `auth.json`, `dashboard.json`, `settings.json` | Entrada, Mesa e Configurações |
| `board.json`, `menus.json`, `modals.json` | Board, Régua, Dock, Painel, menus, janelas e o Activity Log |
| `widgets.json` | Kanban, tabelas, mapa mental, timer, votação, enquete… |
| `importexport.json` | Importar, exportar, colar e avisos de arquivo |
| `templates.json` | Conteúdo dos templates, do board de boas-vindas e do board de demonstração |
| `permissions.json` | Papéis e motivos de "não permitido" |

## 2. Passo a passo

1. **Escolha o código** no padrão BCP 47: `es`, `fr`, `de`, `it`, `pt-PT`, `zh-Hans`… Ele precisa ser aceito por `Intl` (o audit confere).
2. **Copie o inglês:** `cp -r src/locales/en src/locales/<código>`. Partir do inglês costuma ser mais fácil, mas o pt-BR é a fonte: na dúvida sobre o sentido de uma frase, confira lá.
3. **Edite o `_meta.json`:**

   ```json
   {
     "code": "es",
     "name": "Spanish",
     "nativeName": "Español",
     "dir": "ltr",
     "fallback": "en",
     "translators": ["Seu nome ou usuário"],
     "status": "draft"
   }
   ```

   | Campo | Significado |
   |---|---|
   | `code` | Igual ao nome da pasta |
   | `name` / `nativeName` | Nome em inglês e nome no próprio idioma (o seletor mostra o `nativeName`) |
   | `dir` | `ltr` ou `rtl` (árabe, hebraico, persa…). Só a interface muda de direção; o canvas e o conteúdo dos boards não |
   | `fallback` | Idioma usado para chaves que ainda faltam (normalmente `en`); por último vem sempre o pt-BR |
   | `translators` | Quem traduziu e responde por revisões |
   | `status` | `draft` enquanto estiver incompleto (não aparece no seletor, só por `?lang=`); `community` quando estiver pronto para uso |

4. **Traduza os valores, nunca as chaves.** Pode traduzir por partes: o que faltar aparece no idioma de `fallback`. Mantenha intactos:
   - **placeholders** entre chaves: `{count}`, `{name}`, `{title}`… (pode mudá-los de lugar na frase, nunca de nome);
   - **marcação** permitida: `<b>…</b>`, `<kbd>…</kbd>`, `<code>…</code>`, `<em>…</em>`, `<link>…</link>`, `<br/>` — mesmas tags e mesma quantidade da fonte, sempre fechadas;
   - **teclas e atalhos** (`Ctrl`, `Shift`, `Esc`, `Tab`, letras de atalho): os atalhos são iguais em todos os idiomas. Mas traduza o *nome* de teclas que têm nome na sua língua quando a fonte também traduz (ex.: `Espaço` → `Space`).
5. **Rode a verificação:** `npm run audit:i18n`. Ela precisa terminar com **0 erros**. Avisos (por exemplo, mensagens idênticas à fonte, como "PDF" ou "Kanban") são aceitáveis.
6. **Teste no app:** `npm run dev` e abra `http://localhost:5173/?lang=<código>` (também funciona no hash: `#/board/<id>?lang=<código>`). O `?lang=` vale só para aquela aba e não é salvo. Passe pela Mesa, por um board com Kanban, tabela e votação, pelos menus, pela importação/exportação e pelas Configurações. Procure textos cortados ou que estourem botões.
7. **Atualize a lista de idiomas:** `npm run docs:languages` (regenera `docs/LANGUAGES.md`).
8. **Abra o pull request** com o modelo de tradução: `…/compare/main...<sua-branch>?template=translation.md` (o arquivo está em `.github/PULL_REQUEST_TEMPLATE/translation.md`).

## 3. Plurais

Mensagens com contagem usam sufixos: `_zero`, `_one`, `_two`, `_few`, `_many`, `_other`. **Cada idioma só usa as categorias que a sua gramática tem**, conforme `Intl.PluralRules(<código>).resolvedOptions().pluralCategories`:

| Idioma | Categorias exigidas |
|---|---|
| inglês, alemão, holandês, sueco | `one`, `other` |
| português, espanhol, italiano | `one`, `other` (no LuDraw o 0 do português usa `other`: "0 linhas") |
| francês | `one` (0 e 1), `other` |
| russo, ucraniano, polonês | `one`, `few`, `many` (e `other`, para frações) |
| árabe | `zero`, `one`, `two`, `few`, `many`, `other` |
| japonês, chinês, coreano | só `other` |

Português, espanhol, francês e italiano também têm a categoria `many`, mas ela só se aplica a milhões redondos ("1 milhão de…"); o audit não a exige e, sem ela, vale a forma `_other`.

Ao copiar do inglês, **acrescente** as formas que o seu idioma exige e **apague** as que ele não usa — o audit diz exatamente quais faltam (`precisa da forma de plural _few`). Exemplo em russo:

```json
"count.board_one": "{amount} доска",
"count.board_few": "{amount} доски",
"count.board_many": "{amount} досок",
"count.board_other": "{amount} доски"
```

`_zero` é **opcional** em qualquer idioma e vale só para o número 0 (ex.: `"Nenhuma tag"` em vez de `"0 tags"`). Use `{count}` para o número cru e, quando a fonte trouxer, `{amount}` para o número já formatado no seu idioma (separador de milhar).

## 4. Datas, números e listas

Não traduza formatos: datas ("há 5 minutos", "12 de mar."), números (`1.234,5` × `1,234.5`), listas ("A, B e C") e a ordem alfabética saem de `Intl` no idioma ativo. Por isso não há chaves para "ontem", "há 3 dias" ou para o "e" de listas — só `common.time.justNow` ("agora mesmo").

## 5. O que nunca se traduz

- **Conteúdo do usuário:** nomes de boards, post-its, tags, títulos de frames, comentários. Templates, o board de boas-vindas e o board de demonstração são criados **no idioma ativo na hora da criação** e, a partir daí, pertencem ao usuário — trocar de idioma não os altera.
- **Cabeçalhos de formatos de arquivo:** o CSV de issues (`Summary, Description, Issue Type…`) segue o padrão de importação dos rastreadores e fica em inglês em todos os idiomas.
- **Nomes de formatos e extensões:** PNG, SVG, PDF, CSV, TSV, `.xlsx`, `.ods`, `.ludraw`, `.excalidraw`.
- **LuDraw** (nome do projeto).
- A tela **`#/design-system`** (guia interno, fica em pt-BR) e os documentos de `ai-memory/`.
- **Nomes de produtos de terceiros:** não acrescente nenhum que a fonte não tenha.

## 6. Tom e estilo

- **Direto, neutro e inclusivo.** Frases curtas, sem gírias, sem exclamações em excesso, sem humor que não se traduz.
- **Trate a pessoa de forma informal e respeitosa** (o equivalente a "você"). Em idiomas com T/V (tu/vous, du/Sie), prefira o informal se for o costume em software no seu idioma; senão, o formal — e seja consistente.
- **Botões e itens de menu** no infinitivo ou imperativo, conforme o costume do idioma ("Exportar", "Export", "Exporter"). Rótulos que abrem uma janela terminam com reticências (`…`), como na fonte.
- **Mensagens de erro** dizem o que aconteceu e o que fazer, sem culpar a pessoa.
- **Comprimento:** textos podem ficar até ~30 % maiores que o inglês sem quebrar o layout; se ficar muito maior, procure um sinônimo mais curto. Teste com `?lang=qps` para ver o efeito de textos longos.
- **Maiúsculas:** só na primeira palavra de botões e títulos (sentence case), exceto onde o idioma exige outra coisa (substantivos em alemão).
- **Aspas e pontuação** do seu idioma (« », „ “, 「」), não as da fonte.

## 7. Glossário

Use sempre o mesmo termo para o mesmo conceito. Se o seu idioma tem um termo consagrado para algum destes, use-o e registre a escolha na descrição do PR.

| pt-BR (fonte) | en | O que é |
|---|---|---|
| board | board | O quadro infinito onde se trabalha |
| Mesa | Desk | Tela inicial com a lista de boards |
| Régua | Ruler | Barra superior do board (nome, Apresentar, compartilhar, menu ⋮) |
| Dock | Dock | Barra de ferramentas na base do board |
| Painel | Panel | Painel lateral do board (`Ctrl + /`) |
| Barra de ações | Action bar | Barra que aparece sob a seleção |
| Menu do board | Board menu | Menu ⋮ da Régua |
| post-it / nota adesiva | sticky note | Nota colorida |
| frame | frame | Área com título; também é o slide da apresentação |
| forma | shape | Retângulo, oval, losango… |
| conector | connector | Linha que liga objetos |
| ponta (de linha) | cap (start cap / end cap) | Seta, círculo… nas extremidades |
| mapa mental | mind map | |
| Kanban, card, coluna | Kanban, card, column | |
| limite WIP | WIP limit | |
| tabela, célula | table, cell | |
| template / modelo | template | Board pronto da galeria |
| votação por pontos | dot voting | |
| enquete | poll | |
| Modo Apresentação | Presentation mode | |
| espaço de trabalho / espaço | workspace / space | |
| proprietário, editor, comentador, leitor | owner, editor, commenter, viewer | Papéis no board |
| administrador, membro, convidado B2B, visitante | administrator, member, B2B guest, visitor | Papéis no espaço de trabalho |
| bloqueio protegido | protected lock | Trava que só facilitadores desfazem |
| Activity Log / atividades | activity | Histórico de ações do board |
| Inspetor de colagem | Paste inspector | |
| backup | backup | Arquivo `.ludraw` |

## 8. Traduzindo o catálogo de funções

As funções de vitrine em `docs/features.json` (as que têm `"readme": { "highlight": true }`) levam traduções num campo `i18n`, usado pelo `README.en.md` e, no futuro, pela ajuda do app (`#/ajuda`):

```json
"i18n": {
  "en": {
    "title": "Frames",
    "summary": "Titled areas with a fixed or free aspect ratio…",
    "how": ["Click Frame in the Dock (F) and choose an aspect ratio.", "…"]
  }
}
```

Para o seu idioma, acrescente `"<código>": { "title", "summary", "how" }` ao lado do `en`. Regras (conferidas por `npm run audit:features`): o código precisa existir em `src/locales/`, `summary` é uma frase só, e `how` tem **o mesmo número de passos** do original. Nos passos, use os rótulos **exatamente** como aparecem na interface traduzida.

## 9. Revisando uma tradução

- Abra o app com `?lang=<código>` e percorra as telas com a lista do modelo de PR.
- Confira as contagens com 0, 1, 2, 5 e 21 itens (por exemplo, selecionando objetos ou criando cards).
- Leia em voz alta: se soa como tradução, reescreva.
- Leitores de tela usam os mesmos catálogos (`aria-label`, dicas e avisos) — não abrevie esses textos.

## 10. Manutenção

Quando o app ganha texto novo, a chave entra em `pt-BR` e `en` no mesmo commit (o `en` faltando quebra o typecheck). Nos outros idiomas, a chave nova aparece no idioma de `fallback` até alguém traduzi-la; `npm run audit:i18n -- --verbose` lista o que falta, e `docs/LANGUAGES.md` mostra a completude.
