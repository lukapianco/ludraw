## Tradução / Translation

<!--
PT: Guia completo em docs/TRANSLATING.md. Preencha os campos abaixo.
EN: Full guide in docs/TRANSLATING.md. Please fill in the fields below.
-->

- **Idioma / Language:** <!-- ex.: Español -->
- **Código / Code:** `src/locales/<código>/` <!-- ex.: es -->
- **Situação / Status (`_meta.json`):** `draft` / `community`
- **Tradutores / Translators:** <!-- nomes ou usuários; também em _meta.json → translators -->
- **Novo idioma ou revisão? / New language or update?**

## Verificações / Checks

- [ ] `npm run audit:i18n` termina com **0 erros** / finishes with **0 errors**
- [ ] `npm run docs:languages` executado e `docs/LANGUAGES.md` incluído / run, and `docs/LANGUAGES.md` included
- [ ] Só arquivos em `src/locales/<código>/`, `docs/LANGUAGES.md` e, se for o caso, `docs/features.json` (`i18n.<código>`) / Only these files changed
- [ ] Chaves intactas; só os valores foram traduzidos / Keys untouched; only values translated
- [ ] Placeholders (`{count}`, `{name}`…) e marcação (`<b>`, `<kbd>`, `<link>`…) preservados / Placeholders and markup preserved
- [ ] Formas de plural do idioma completas (o audit lista as que faltam) / Plural forms required by the language are complete

## Revisão no app / In-app review (`npm run dev` → `?lang=<código>`)

- [ ] Mesa: abas, ordenação, busca e criação de board / Desk: tabs, sorting, search, new board
- [ ] Board: Régua, Dock, Painel, Barra de ações e menus de clique direito / Board: Ruler, Dock, Panel, Action bar, context menus
- [ ] Kanban, tabela, mapa mental, timer, votação e enquete / Kanban, table, mind map, timer, voting and poll
- [ ] Importar e exportar (incluindo avisos) / Import and export (including warnings)
- [ ] Configurações e permissões ("não permitido") / Settings and permission messages
- [ ] Contagens com 0, 1, 2, 5 e 21 itens / Counts with 0, 1, 2, 5 and 21 items
- [ ] Nenhum texto cortado ou estourando botões / No clipped text or overflowing buttons
- [ ] Glossário de `docs/TRANSLATING.md` §7 seguido (termos escolhidos para o idioma listados abaixo) / Glossary followed

**Termos escolhidos / Chosen terms:**

<!-- board → …, sticky note → …, frame → …, Desk → …, Ruler → …, Dock → …, Panel → …, Action bar → … -->

## Declaração de origem / Origin statement (sala limpa / clean room)

- [ ] A tradução é minha (ou da equipe listada), feita a partir dos catálogos do LuDraw. **Não copiei textos de interface de outros produtos**, nem memórias de tradução ou glossários de terceiros. / The translation is my own (or by the listed team), made from the LuDraw catalogs. **I did not copy interface text from other products**, nor third-party translation memories or glossaries.
- [ ] Se usei tradução automática como rascunho, cada frase foi revisada por uma pessoa fluente. / If machine translation was used as a draft, every sentence was reviewed by a fluent speaker.

```
DECLARAÇÃO DE SALA LIMPA / CLEAN-ROOM STATEMENT
- Dependências novas / New dependencies: nenhuma / none
- Assets novos / New assets: nenhum / none
- Conteúdo de terceiros usado / Third-party content used: nenhum / none (ou descreva / or describe)
```
