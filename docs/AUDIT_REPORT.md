# AUDIT_REPORT.md — Auditoria de Sala Limpa do LuDraw

> Gerado por `npm run docs:legal` (`scripts/audit-clean-room.mjs --write`; o `npm run audit:legal` só confere) em 2026-11-26 00:09:37 UTC. Regras: `ai-memory/CLEAN_ROOM.md`; termos e exceções: `scripts/audit-terms.json`.
> **Isto não é parecer jurídico.** É uma checagem automática de engenharia; a revisão por advogado de software está prevista no Chat 09.

## Resumo

| Resultado | Quantidade |
|---|---|
| ❌ Bloqueantes | 0 |
| ⚠️ Avisos | 17 |
| ✅ Dependências com licença permitida | 455 de 455 |
| Arquivos de texto varridos (termos) | 626 |
| Assets inventariados | 49 |
| Domínios externos | 57 |

**Status: ✅ sem bloqueantes** — revise os avisos.

## ❌ Achados bloqueantes

_Nenhum._

## ⚠️ Avisos (revisar; nada é alterado sem aprovação do usuário)

| Área | Onde | Regra | Detalhe |
|---|---|---|---|
| Termos | `src/components/canvas/CanvasStage.tsx:1172` | excalidraw | Formato aberto (MIT) permitido como importação; na UI só como nome de formato (`.excalidraw`), nunca como marca/logo.<br>`s (Chat 02) e arquivos (Chat 05: planilhas, SVG, .excalidraw…) ---------- */` |
| Termos | `src/locales/en/board.json:219` | excalidraw | Formato aberto (MIT) permitido como importação; na UI só como nome de formato (`.excalidraw`), nunca como marca/logo.<br>`op to insert here — images, spreadsheets, SVG or .excalidraw",` |
| Termos | `src/locales/en/importexport.json:26` | excalidraw | Formato aberto (MIT) permitido como importação; na UI só como nome de formato (`.excalidraw`), nunca como marca/logo.<br>`tExcalidraw": "Drawings in the open JSON format (.excalidraw): shapes, lines, text and images become native ob` |
| Termos | `src/locales/en/importexport.json:29` | excalidraw | Formato aberto (MIT) permitido como importação; na UI só como nome de formato (`.excalidraw`), nunca como marca/logo.<br>`"core.excalidrawFile": ".excalidraw file",` |
| Termos | `src/locales/en/importexport.json:42` | excalidraw | Formato aberto (MIT) permitido como importação; na UI só como nome de formato (`.excalidraw`), nunca como marca/logo.<br>`"core.notValidExcalidrawFile": "Not a valid .excalidraw file.",` |
| Termos | `src/locales/en/importexport.json:75` | excalidraw | Formato aberto (MIT) permitido como importação; na UI só como nome de formato (`.excalidraw`), nunca como marca/logo.<br>`"core.theExcalidrawFileHasNo": "The .excalidraw file has no objects.",` |
| Termos | `src/locales/en/importexport.json:165` | excalidraw | Formato aberto (MIT) permitido como importação; na UI só como nome de formato (`.excalidraw`), nunca como marca/logo.<br>`tsSvgExcalidrawFilesImages": "Spreadsheets, SVG, .excalidraw files, images and text — open formats only.",` |
| Termos | `src/locales/en/menus.json:59` | excalidraw | Formato aberto (MIT) permitido como importação; na UI só como nome de formato (`.excalidraw`), nunca como marca/logo.<br>`heetsCsvSvgExcalidraw": "Spreadsheets, CSV, SVG, .excalidraw",` |
| Termos | `src/locales/en/studio.json:122` | excalidraw | Formato aberto (MIT) permitido como importação; na UI só como nome de formato (`.excalidraw`), nunca como marca/logo.<br>`"toolbox.importHint": "Spreadsheet, SVG, .excalidraw, images",` |
| Termos | `src/locales/pt-BR/board.json:219` | excalidraw | Formato aberto (MIT) permitido como importação; na UI só como nome de formato (`.excalidraw`), nunca como marca/logo.<br>`e para inserir aqui — imagens, planilhas, SVG ou .excalidraw",` |
| Termos | `src/locales/pt-BR/importexport.json:26` | excalidraw | Formato aberto (MIT) permitido como importação; na UI só como nome de formato (`.excalidraw`), nunca como marca/logo.<br>`atExcalidraw": "Desenhos no formato JSON aberto (.excalidraw): formas, linhas, textos e imagens viram objetos` |
| Termos | `src/locales/pt-BR/importexport.json:29` | excalidraw | Formato aberto (MIT) permitido como importação; na UI só como nome de formato (`.excalidraw`), nunca como marca/logo.<br>`"core.excalidrawFile": "Arquivo .excalidraw",` |
| Termos | `src/locales/pt-BR/importexport.json:42` | excalidraw | Formato aberto (MIT) permitido como importação; na UI só como nome de formato (`.excalidraw`), nunca como marca/logo.<br>`"core.notValidExcalidrawFile": "Não é um arquivo .excalidraw válido.",` |
| Termos | `src/locales/pt-BR/importexport.json:75` | excalidraw | Formato aberto (MIT) permitido como importação; na UI só como nome de formato (`.excalidraw`), nunca como marca/logo.<br>`"core.theExcalidrawFileHasNo": "O arquivo .excalidraw não tem objetos.",` |
| Termos | `src/locales/pt-BR/importexport.json:165` | excalidraw | Formato aberto (MIT) permitido como importação; na UI só como nome de formato (`.excalidraw`), nunca como marca/logo.<br>`xcalidrawFilesImages": "Planilhas, SVG, arquivos .excalidraw, imagens e texto — só formatos abertos.",` |
| Termos | `src/locales/pt-BR/menus.json:59` | excalidraw | Formato aberto (MIT) permitido como importação; na UI só como nome de formato (`.excalidraw`), nunca como marca/logo.<br>`adsheetsCsvSvgExcalidraw": "Planilhas, CSV, SVG, .excalidraw",` |
| Termos | `src/locales/pt-BR/studio.json:122` | excalidraw | Formato aberto (MIT) permitido como importação; na UI só como nome de formato (`.excalidraw`), nunca como marca/logo.<br>`"toolbox.importHint": "Planilha, SVG, .excalidraw, imagens",` |

## ✅ Licenças das dependências

| Licença | Pacotes |
|---|---|
| MIT | 367 |
| OFL-1.1 | 36 |
| ISC | 17 |
| Apache-2.0 | 12 |
| Apache-2.0 OR MIT | 12 |
| BSD-3-Clause | 6 |
| 0BSD | 2 |
| CC-BY-4.0 | 1 |
| (MIT AND Zlib) | 1 |
| MIT-0 | 1 |

<details><summary>Lista completa (pacote · versão · licença · uso)</summary>

| Pacote | Versão | Licença | Uso | Situação |
|---|---|---|---|---|
| @alloc/quick-lru | 5.3.0 | MIT | dev | ✅ |
| @babel/code-frame | 7.29.7 | MIT | dev | ✅ |
| @babel/compat-data | 7.29.7 | MIT | dev | ✅ |
| @babel/core | 7.29.13 | MIT | dev | ✅ |
| @babel/generator | 7.29.13 | MIT | dev | ✅ |
| @babel/helper-compilation-targets | 7.29.13 | MIT | dev | ✅ |
| @babel/helper-globals | 7.29.7 | MIT | dev | ✅ |
| @babel/helper-module-imports | 7.29.7 | MIT | dev | ✅ |
| @babel/helper-module-transforms | 7.29.13 | MIT | dev | ✅ |
| @babel/helper-plugin-utils | 7.29.7 | MIT | dev | ✅ |
| @babel/helper-string-parser | 7.29.13 | MIT | dev | ✅ |
| @babel/helper-validator-identifier | 7.29.7 | MIT | dev | ✅ |
| @babel/helper-validator-option | 7.29.7 | MIT | dev | ✅ |
| @babel/helpers | 7.29.13 | MIT | dev | ✅ |
| @babel/parser | 7.29.13 | MIT | dev | ✅ |
| @babel/plugin-transform-react-jsx-self | 7.29.7 | MIT | dev | ✅ |
| @babel/plugin-transform-react-jsx-source | 7.29.7 | MIT | dev | ✅ |
| @babel/template | 7.29.7 | MIT | dev | ✅ |
| @babel/traverse | 7.29.13 | MIT | dev | ✅ |
| @babel/types | 7.29.11 | MIT | dev | ✅ |
| @drizzle-team/brocli | 0.10.2 | Apache-2.0 | servidor · dev | ✅ |
| @electric-sql/pglite | 0.5.15 | Apache-2.0 | servidor · produção | ✅ |
| @epic-web/invariant | 1.0.0 | MIT | servidor · produção | ✅ |
| @esbuild-kit/core-utils | 3.3.2 | MIT | servidor · dev | ✅ |
| @esbuild-kit/esm-loader | 2.6.5 | MIT | servidor · dev | ✅ |
| @esbuild/aix-ppc64 | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/aix-ppc64 | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/aix-ppc64 | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/android-arm | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/android-arm | 0.18.20 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/android-arm | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/android-arm | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/android-arm64 | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/android-arm64 | 0.18.20 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/android-arm64 | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/android-arm64 | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/android-x64 | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/android-x64 | 0.18.20 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/android-x64 | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/android-x64 | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/darwin-arm64 | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/darwin-arm64 | 0.18.20 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/darwin-arm64 | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/darwin-arm64 | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/darwin-x64 | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/darwin-x64 | 0.18.20 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/darwin-x64 | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/darwin-x64 | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/freebsd-arm64 | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/freebsd-arm64 | 0.18.20 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/freebsd-arm64 | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/freebsd-arm64 | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/freebsd-x64 | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/freebsd-x64 | 0.18.20 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/freebsd-x64 | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/freebsd-x64 | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-arm | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/linux-arm | 0.18.20 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-arm | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-arm | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-arm64 | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/linux-arm64 | 0.18.20 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-arm64 | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-arm64 | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-ia32 | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/linux-ia32 | 0.18.20 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-ia32 | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-ia32 | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-loong64 | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/linux-loong64 | 0.18.20 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-loong64 | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-loong64 | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-mips64el | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/linux-mips64el | 0.18.20 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-mips64el | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-mips64el | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-ppc64 | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/linux-ppc64 | 0.18.20 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-ppc64 | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-ppc64 | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-riscv64 | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/linux-riscv64 | 0.18.20 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-riscv64 | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-riscv64 | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-s390x | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/linux-s390x | 0.18.20 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-s390x | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-s390x | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-x64 | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/linux-x64 | 0.18.20 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-x64 | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/linux-x64 | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/netbsd-arm64 | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/netbsd-arm64 | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/netbsd-arm64 | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/netbsd-x64 | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/netbsd-x64 | 0.18.20 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/netbsd-x64 | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/netbsd-x64 | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/openbsd-arm64 | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/openbsd-arm64 | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/openbsd-arm64 | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/openbsd-x64 | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/openbsd-x64 | 0.18.20 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/openbsd-x64 | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/openbsd-x64 | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/openharmony-arm64 | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/openharmony-arm64 | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/openharmony-arm64 | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/sunos-x64 | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/sunos-x64 | 0.18.20 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/sunos-x64 | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/sunos-x64 | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/win32-arm64 | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/win32-arm64 | 0.18.20 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/win32-arm64 | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/win32-arm64 | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/win32-ia32 | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/win32-ia32 | 0.18.20 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/win32-ia32 | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/win32-ia32 | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/win32-x64 | 0.25.12 | MIT | dev (opcional) | ✅ |
| @esbuild/win32-x64 | 0.18.20 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/win32-x64 | 0.28.2 | MIT | servidor · dev (opcional) | ✅ |
| @esbuild/win32-x64 | 0.25.12 | MIT | servidor · dev (opcional) | ✅ |
| @fastify/ajv-compiler | 4.0.7 | MIT | servidor · produção | ✅ |
| @fastify/cookie | 11.1.5 | MIT | servidor · produção | ✅ |
| @fastify/cors | 11.4.1 | MIT | servidor · produção | ✅ |
| @fastify/deepmerge | 3.2.4 | MIT | servidor · produção | ✅ |
| @fastify/error | 4.2.1 | MIT | servidor · produção | ✅ |
| @fastify/fast-json-stringify-compiler | 5.1.1 | MIT | servidor · produção | ✅ |
| @fastify/forwarded | 3.1.2 | MIT | servidor · produção | ✅ |
| @fastify/merge-json-schemas | 0.2.2 | MIT | servidor · produção | ✅ |
| @fastify/proxy-addr | 5.1.2 | MIT | servidor · produção | ✅ |
| @fastify/rate-limit | 11.2.2 | MIT | servidor · produção | ✅ |
| @fontsource-variable/bitter | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource-variable/caveat | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource-variable/comfortaa | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource-variable/dm-sans | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource-variable/eb-garamond | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource-variable/figtree | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource-variable/fira-code | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource-variable/fraunces | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource-variable/fredoka | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource-variable/ibm-plex-sans | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource-variable/inter | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource-variable/jetbrains-mono | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource-variable/lexend | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource-variable/lora | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource-variable/manrope | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource-variable/merriweather | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource-variable/noto-sans | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource-variable/open-sans | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource-variable/roboto-slab | 5.3.0 | Apache-2.0 | produção | ✅ |
| @fontsource-variable/source-serif-4 | 5.3.1 | OFL-1.1 | produção | ✅ |
| @fontsource-variable/work-sans | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource/abril-fatface | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource/architects-daughter | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource/atkinson-hyperlegible | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource/bangers | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource/bebas-neue | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource/graduate | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource/gravitas-one | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource/ibm-plex-mono | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource/ibm-plex-serif | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource/kalam | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource/nixie-one | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource/patrick-hand | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource/permanent-marker | 5.3.0 | Apache-2.0 | produção | ✅ |
| @fontsource/pt-sans | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource/righteous | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource/shadows-into-light | 5.3.0 | OFL-1.1 | produção | ✅ |
| @fontsource/space-mono | 5.3.0 | OFL-1.1 | produção | ✅ |
| @hocuspocus/common | 4.8.0 | MIT | produção | ✅ |
| @hocuspocus/common | 4.8.0 | MIT | servidor · produção | ✅ |
| @hocuspocus/provider | 4.7.1 | MIT | produção | ✅ |
| @hocuspocus/provider | 4.7.1 | MIT | servidor · dev | ✅ |
| @hocuspocus/server | 4.7.1 | MIT | servidor · produção | ✅ |
| @ioredis/commands | 2.0.0 | MIT | servidor · produção | ✅ |
| @jridgewell/gen-mapping | 0.3.13 | MIT | dev | ✅ |
| @jridgewell/remapping | 2.3.5 | MIT | dev | ✅ |
| @jridgewell/resolve-uri | 3.1.2 | MIT | dev | ✅ |
| @jridgewell/sourcemap-codec | 1.6.0 | MIT | dev | ✅ |
| @jridgewell/trace-mapping | 0.3.31 | MIT | dev | ✅ |
| @lifeomic/attempt | 3.1.0 | MIT | produção | ✅ |
| @lifeomic/attempt | 3.1.0 | MIT | servidor · dev | ✅ |
| @lukeed/ms | 2.0.2 | MIT | servidor · produção | ✅ |
| @nodelib/fs.scandir | 2.1.5 | MIT | dev | ✅ |
| @nodelib/fs.stat | 2.0.5 | MIT | dev | ✅ |
| @nodelib/fs.walk | 1.2.8 | MIT | dev | ✅ |
| @pdf-lib/standard-fonts | 1.0.0 | MIT | produção | ✅ |
| @pdf-lib/upng | 1.0.1 | MIT | produção | ✅ |
| @phc/format | 1.0.0 | MIT | servidor · produção | ✅ |
| @pinojs/redact | 0.4.0 | MIT | servidor · produção | ✅ |
| @rolldown/pluginutils | 1.0.0-beta.27 | MIT | dev | ✅ |
| @rollup/rollup-android-arm-eabi | 4.67.5 | MIT | dev (opcional) | ✅ |
| @rollup/rollup-android-arm64 | 4.67.5 | MIT | dev (opcional) | ✅ |
| @rollup/rollup-android-x64 | 4.67.5 | MIT | dev (opcional) | ✅ |
| @rollup/rollup-darwin-arm64 | 4.67.5 | MIT | dev (opcional) | ✅ |
| @rollup/rollup-darwin-x64 | 4.67.5 | MIT | dev (opcional) | ✅ |
| @rollup/rollup-freebsd-arm64 | 4.67.5 | MIT | dev (opcional) | ✅ |
| @rollup/rollup-freebsd-x64 | 4.67.5 | MIT | dev (opcional) | ✅ |
| @rollup/rollup-linux-arm-gnueabihf | 4.67.5 | MIT | dev (opcional) | ✅ |
| @rollup/rollup-linux-arm-musleabihf | 4.67.5 | MIT | dev (opcional) | ✅ |
| @rollup/rollup-linux-arm64-gnu | 4.67.5 | MIT | dev (opcional) | ✅ |
| @rollup/rollup-linux-arm64-musl | 4.67.5 | MIT | dev (opcional) | ✅ |
| @rollup/rollup-linux-loong64-gnu | 4.67.5 | MIT | dev (opcional) | ✅ |
| @rollup/rollup-linux-loong64-musl | 4.67.5 | MIT | dev (opcional) | ✅ |
| @rollup/rollup-linux-ppc64-gnu | 4.67.5 | MIT | dev (opcional) | ✅ |
| @rollup/rollup-linux-ppc64-musl | 4.67.5 | MIT | dev (opcional) | ✅ |
| @rollup/rollup-linux-riscv64-gnu | 4.67.5 | MIT | dev (opcional) | ✅ |
| @rollup/rollup-linux-riscv64-musl | 4.67.5 | MIT | dev (opcional) | ✅ |
| @rollup/rollup-linux-s390x-gnu | 4.67.5 | MIT | dev (opcional) | ✅ |
| @rollup/rollup-linux-x64-gnu | 4.67.5 | MIT | dev (opcional) | ✅ |
| @rollup/rollup-linux-x64-musl | 4.67.5 | MIT | dev (opcional) | ✅ |
| @rollup/rollup-openbsd-x64 | 4.67.5 | MIT | dev (opcional) | ✅ |
| @rollup/rollup-openharmony-arm64 | 4.67.5 | MIT | dev (opcional) | ✅ |
| @rollup/rollup-win32-arm64-msvc | 4.67.5 | MIT | dev (opcional) | ✅ |
| @rollup/rollup-win32-ia32-msvc | 4.67.5 | MIT | dev (opcional) | ✅ |
| @rollup/rollup-win32-x64-gnu | 4.67.5 | MIT | dev (opcional) | ✅ |
| @rollup/rollup-win32-x64-msvc | 4.67.5 | MIT | dev (opcional) | ✅ |
| @tauri-apps/cli | 2.12.6 | Apache-2.0 OR MIT | dev | ✅ |
| @tauri-apps/cli-darwin-arm64 | 2.12.6 | Apache-2.0 OR MIT | dev (opcional) | ✅ |
| @tauri-apps/cli-darwin-x64 | 2.12.6 | Apache-2.0 OR MIT | dev (opcional) | ✅ |
| @tauri-apps/cli-linux-arm-gnueabihf | 2.12.6 | Apache-2.0 OR MIT | dev (opcional) | ✅ |
| @tauri-apps/cli-linux-arm64-gnu | 2.12.6 | Apache-2.0 OR MIT | dev (opcional) | ✅ |
| @tauri-apps/cli-linux-arm64-musl | 2.12.6 | Apache-2.0 OR MIT | dev (opcional) | ✅ |
| @tauri-apps/cli-linux-riscv64-gnu | 2.12.6 | Apache-2.0 OR MIT | dev (opcional) | ✅ |
| @tauri-apps/cli-linux-x64-gnu | 2.12.6 | Apache-2.0 OR MIT | dev (opcional) | ✅ |
| @tauri-apps/cli-linux-x64-musl | 2.12.6 | Apache-2.0 OR MIT | dev (opcional) | ✅ |
| @tauri-apps/cli-win32-arm64-msvc | 2.12.6 | Apache-2.0 OR MIT | dev (opcional) | ✅ |
| @tauri-apps/cli-win32-ia32-msvc | 2.12.6 | Apache-2.0 OR MIT | dev (opcional) | ✅ |
| @tauri-apps/cli-win32-x64-msvc | 2.12.6 | Apache-2.0 OR MIT | dev (opcional) | ✅ |
| @types/babel__core | 7.20.5 | MIT | dev | ✅ |
| @types/babel__generator | 7.27.0 | MIT | dev | ✅ |
| @types/babel__template | 7.4.4 | MIT | dev | ✅ |
| @types/babel__traverse | 7.28.0 | MIT | dev | ✅ |
| @types/estree | 1.0.10 | MIT | dev | ✅ |
| @types/node | 22.20.5 | MIT | dev | ✅ |
| @types/node | 22.20.5 | MIT | servidor · produção | ✅ |
| @types/pg | 8.23.1 | MIT | servidor · produção | ✅ |
| @types/prop-types | 15.7.15 | MIT | produção | ✅ |
| @types/react | 18.3.31 | MIT | produção | ✅ |
| @types/react-dom | 18.3.7 | MIT | dev | ✅ |
| @types/ws | 8.18.2 | MIT | servidor · dev | ✅ |
| @vitejs/plugin-react | 4.7.0 | MIT | dev | ✅ |
| abstract-logging | 2.0.1 | MIT | servidor · produção | ✅ |
| ajv | 8.20.0 | MIT | servidor · produção | ✅ |
| ajv-formats | 3.0.1 | MIT | servidor · produção | ✅ |
| any-promise | 1.3.0 | MIT | dev | ✅ |
| anymatch | 3.1.3 | ISC | dev | ✅ |
| arg | 5.0.2 | MIT | dev | ✅ |
| argon2 | 0.45.2 | MIT | servidor · produção | ✅ |
| async-mutex | 0.5.0 | MIT | servidor · produção | ✅ |
| atomic-sleep | 1.0.0 | MIT | servidor · produção | ✅ |
| autoprefixer | 10.6.2 | MIT | dev | ✅ |
| avvio | 9.3.1 | MIT | servidor · produção | ✅ |
| baseline-browser-mapping | 2.11.35 | Apache-2.0 | dev | ✅ |
| binary-extensions | 2.3.0 | MIT | dev | ✅ |
| braces | 3.0.3 | MIT | dev | ✅ |
| browserslist | 4.29.5 | MIT | dev | ✅ |
| buffer-from | 1.1.2 | MIT | servidor · dev | ✅ |
| camelcase-css | 2.0.1 | MIT | dev | ✅ |
| caniuse-lite | 1.0.30001823 | CC-BY-4.0 | dev | ✅ |
| chokidar | 3.6.0 | MIT | dev | ✅ |
| clsx | 2.1.1 | MIT | produção | ✅ |
| cluster-key-slot | 1.1.1 | Apache-2.0 | servidor · produção | ✅ |
| commander | 4.1.1 | MIT | dev | ✅ |
| convert-source-map | 2.0.0 | MIT | dev | ✅ |
| cookie | 2.0.2 | MIT | servidor · produção | ✅ |
| cross-env | 10.1.0 | MIT | servidor · produção | ✅ |
| cross-spawn | 7.0.6 | MIT | servidor · produção | ✅ |
| crossws | 0.4.17 | MIT | servidor · produção | ✅ |
| cssesc | 3.0.0 | MIT | dev | ✅ |
| csstype | 3.2.3 | MIT | produção | ✅ |
| debug | 4.4.3 | MIT | dev | ✅ |
| debug | 4.4.3 | MIT | servidor · produção | ✅ |
| denque | 2.1.0 | Apache-2.0 | servidor · produção | ✅ |
| dequal | 2.0.3 | MIT | servidor · produção | ✅ |
| didyoumean | 1.2.2 | Apache-2.0 | dev | ✅ |
| dlv | 1.1.3 | MIT | dev | ✅ |
| drizzle-kit | 0.31.11 | MIT | servidor · dev | ✅ |
| drizzle-orm | 0.45.4 | Apache-2.0 | servidor · produção | ✅ |
| electron-to-chromium | 1.5.478 | ISC | dev | ✅ |
| es-errors | 1.3.0 | MIT | dev | ✅ |
| esbuild | 0.25.12 | MIT | dev | ✅ |
| esbuild | 0.18.20 | MIT | servidor · dev | ✅ |
| esbuild | 0.25.12 | MIT | servidor · dev | ✅ |
| esbuild | 0.28.2 | MIT | servidor · dev | ✅ |
| escalade | 3.2.0 | MIT | dev | ✅ |
| fast-decode-uri-component | 1.0.1 | MIT | servidor · produção | ✅ |
| fast-deep-equal | 3.1.3 | MIT | servidor · produção | ✅ |
| fast-glob | 3.3.3 | MIT | dev | ✅ |
| fast-json-stringify | 7.3.3 | MIT | servidor · produção | ✅ |
| fast-querystring | 1.1.2 | MIT | servidor · produção | ✅ |
| fast-uri | 3.1.9 | BSD-3-Clause | servidor · produção | ✅ |
| fast-uri | 4.2.3 | BSD-3-Clause | servidor · produção | ✅ |
| fastify | 5.12.8 | MIT | servidor · produção | ✅ |
| fastify-plugin | 6.0.1 | MIT | servidor · produção | ✅ |
| fastq | 1.20.3 | ISC | dev | ✅ |
| fastq | 1.20.3 | ISC | servidor · produção | ✅ |
| fdir | 6.5.0 | MIT | dev | ✅ |
| fdir | 6.5.0 | MIT | dev | ✅ |
| fill-range | 7.1.1 | MIT | dev | ✅ |
| find-my-way | 9.10.0 | MIT | servidor · produção | ✅ |
| fraction.js | 5.3.4 | MIT | dev | ✅ |
| fsevents | 2.3.3 | MIT | dev (opcional) | ✅ |
| fsevents | 2.3.3 | MIT | servidor · dev (opcional) | ✅ |
| function-bind | 1.1.2 | MIT | dev | ✅ |
| gensync | 1.0.0-beta.2 | MIT | dev | ✅ |
| get-tsconfig | 4.14.3 | MIT | servidor · dev | ✅ |
| glob-parent | 5.1.2 | ISC | dev | ✅ |
| glob-parent | 5.1.2 | ISC | dev | ✅ |
| glob-parent | 6.0.2 | ISC | dev | ✅ |
| hasown | 2.0.4 | MIT | dev | ✅ |
| ioredis | 6.0.0 | MIT | servidor · produção | ✅ |
| ip-address | 10.7.6 | MIT | servidor · produção | ✅ |
| ipaddr.js | 2.5.0 | MIT | servidor · produção | ✅ |
| is-binary-path | 2.1.0 | MIT | dev | ✅ |
| is-core-module | 2.18.0 | MIT | dev | ✅ |
| is-extglob | 2.1.1 | MIT | dev | ✅ |
| is-glob | 4.0.3 | MIT | dev | ✅ |
| is-number | 7.0.0 | MIT | dev | ✅ |
| isexe | 2.0.0 | ISC | servidor · produção | ✅ |
| isomorphic.js | 0.2.5 | MIT | produção | ✅ |
| isomorphic.js | 0.2.5 | MIT | servidor · produção | ✅ |
| jiti | 1.21.7 | MIT | dev | ✅ |
| jose | 6.2.16 | MIT | servidor · produção | ✅ |
| js-tokens | 4.0.0 | MIT | produção | ✅ |
| jsesc | 3.1.0 | MIT | dev | ✅ |
| json-schema-ref-resolver | 3.0.1 | MIT | servidor · produção | ✅ |
| json-schema-traverse | 1.0.0 | MIT | servidor · produção | ✅ |
| json5 | 2.2.3 | MIT | dev | ✅ |
| kleur | 4.1.5 | MIT | servidor · produção | ✅ |
| lib0 | 0.2.119 | MIT | produção | ✅ |
| lib0 | 0.2.119 | MIT | servidor · produção | ✅ |
| light-my-request | 6.8.0 | BSD-3-Clause | servidor · produção | ✅ |
| lilconfig | 3.1.4 | MIT | dev | ✅ |
| lines-and-columns | 1.2.4 | MIT | dev | ✅ |
| loose-envify | 1.4.0 | MIT | produção | ✅ |
| lru-cache | 5.1.1 | ISC | dev | ✅ |
| lucide-react | 0.460.0 | ISC | produção | ✅ |
| merge2 | 1.4.1 | MIT | dev | ✅ |
| micromatch | 4.0.8 | MIT | dev | ✅ |
| ms | 2.1.3 | MIT | dev | ✅ |
| ms | 2.1.3 | MIT | servidor · produção | ✅ |
| mz | 2.7.0 | MIT | dev | ✅ |
| nanoid | 3.3.20 | MIT | dev | ✅ |
| node-addon-api | 8.9.2 | MIT | servidor · produção | ✅ |
| node-gyp-build | 4.8.4 | MIT | servidor · produção | ✅ |
| node-releases | 2.0.63 | MIT | dev | ✅ |
| nodemailer | 10.2.1 | MIT-0 | servidor · produção | ✅ |
| normalize-path | 3.0.0 | MIT | dev | ✅ |
| oauth4webapi | 3.8.8 | MIT | servidor · produção | ✅ |
| object-assign | 4.1.1 | MIT | dev | ✅ |
| object-hash | 3.0.0 | MIT | dev | ✅ |
| on-exit-leak-free | 2.1.2 | MIT | servidor · produção | ✅ |
| openid-client | 6.8.9 | MIT | servidor · produção | ✅ |
| pako | 1.0.11 | (MIT AND Zlib) | produção | ✅ |
| path-key | 3.1.1 | MIT | servidor · produção | ✅ |
| path-parse | 1.0.7 | MIT | dev | ✅ |
| pdf-lib | 1.17.1 | MIT | produção | ✅ |
| pg | 8.23.1 | MIT | servidor · produção | ✅ |
| pg-cloudflare | 1.4.1 | MIT | servidor · produção (opcional) | ✅ |
| pg-connection-string | 2.14.1 | MIT | servidor · produção | ✅ |
| pg-int8 | 1.0.1 | ISC | servidor · produção | ✅ |
| pg-pool | 3.14.0 | MIT | servidor · produção | ✅ |
| pg-protocol | 1.16.1 | MIT | servidor · produção | ✅ |
| pg-types | 2.2.0 | MIT | servidor · produção | ✅ |
| pgpass | 1.0.5 | MIT | servidor · produção | ✅ |
| picocolors | 1.1.1 | ISC | dev | ✅ |
| picomatch | 2.3.2 | MIT | dev | ✅ |
| picomatch | 4.0.7 | MIT | dev | ✅ |
| picomatch | 4.0.7 | MIT | dev | ✅ |
| pino | 10.4.0 | MIT | servidor · produção | ✅ |
| pino-abstract-transport | 3.0.0 | MIT | servidor · produção | ✅ |
| pino-std-serializers | 7.1.0 | MIT | servidor · produção | ✅ |
| pirates | 4.0.7 | MIT | dev | ✅ |
| postcss | 8.5.32 | MIT | dev | ✅ |
| postcss-import | 15.1.0 | MIT | dev | ✅ |
| postcss-js | 4.1.0 | MIT | dev | ✅ |
| postcss-load-config | 6.0.1 | MIT | dev | ✅ |
| postcss-nested | 6.2.0 | MIT | dev | ✅ |
| postcss-selector-parser | 6.1.5 | MIT | dev | ✅ |
| postcss-value-parser | 4.2.0 | MIT | dev | ✅ |
| postgres-array | 2.0.0 | MIT | servidor · produção | ✅ |
| postgres-bytea | 1.0.1 | MIT | servidor · produção | ✅ |
| postgres-date | 1.0.7 | MIT | servidor · produção | ✅ |
| postgres-interval | 1.2.0 | MIT | servidor · produção | ✅ |
| process-warning | 5.1.1 | MIT | servidor · produção | ✅ |
| queue-microtask | 1.2.3 | MIT | dev | ✅ |
| quick-format-unescaped | 4.0.4 | MIT | servidor · produção | ✅ |
| react | 18.3.1 | MIT | produção | ✅ |
| react-dom | 18.3.1 | MIT | produção | ✅ |
| react-refresh | 0.17.0 | MIT | dev | ✅ |
| read-cache | 1.0.2 | MIT | dev | ✅ |
| readdirp | 3.6.0 | MIT | dev | ✅ |
| real-require | 1.0.0 | MIT | servidor · produção | ✅ |
| redis-errors | 1.2.0 | MIT | servidor · produção | ✅ |
| require-from-string | 2.0.2 | MIT | servidor · produção | ✅ |
| resolve | 1.22.14 | MIT | dev | ✅ |
| resolve-pkg-maps | 1.0.0 | MIT | servidor · dev | ✅ |
| ret | 0.5.1 | MIT | servidor · produção | ✅ |
| reusify | 1.1.0 | MIT | dev | ✅ |
| reusify | 1.1.0 | MIT | servidor · produção | ✅ |
| rfdc | 1.4.1 | MIT | servidor · produção | ✅ |
| rollup | 4.67.5 | MIT | dev | ✅ |
| run-parallel | 1.2.0 | MIT | dev | ✅ |
| safe-regex2 | 5.1.2 | MIT | servidor · produção | ✅ |
| safe-stable-stringify | 2.5.0 | MIT | servidor · produção | ✅ |
| scheduler | 0.23.2 | MIT | produção | ✅ |
| secure-json-parse | 4.1.1 | BSD-3-Clause | servidor · produção | ✅ |
| semver | 6.3.2 | ISC | dev | ✅ |
| semver | 7.8.6 | ISC | servidor · produção | ✅ |
| set-cookie-parser | 3.2.2 | MIT | servidor · produção | ✅ |
| shebang-command | 2.0.0 | MIT | servidor · produção | ✅ |
| shebang-regex | 3.0.0 | MIT | servidor · produção | ✅ |
| sonic-boom | 4.2.1 | MIT | servidor · produção | ✅ |
| source-map | 0.6.1 | BSD-3-Clause | servidor · dev | ✅ |
| source-map-js | 1.2.2 | BSD-3-Clause | dev | ✅ |
| source-map-support | 0.5.21 | MIT | servidor · dev | ✅ |
| split2 | 4.2.0 | ISC | servidor · produção | ✅ |
| standard-as-callback | 2.1.0 | MIT | servidor · produção | ✅ |
| sucrase | 3.35.1 | MIT | dev | ✅ |
| supports-preserve-symlinks-flag | 1.0.0 | MIT | dev | ✅ |
| tailwind-merge | 2.6.1 | MIT | produção | ✅ |
| tailwindcss | 3.4.19 | MIT | dev | ✅ |
| thenify | 3.3.1 | MIT | dev | ✅ |
| thenify-all | 1.6.0 | MIT | dev | ✅ |
| thread-stream | 4.2.1 | MIT | servidor · produção | ✅ |
| tinyglobby | 0.2.17 | MIT | dev | ✅ |
| to-regex-range | 5.0.1 | MIT | dev | ✅ |
| toad-cache | 3.7.4 | MIT | servidor · produção | ✅ |
| ts-interface-checker | 0.1.13 | Apache-2.0 | dev | ✅ |
| tslib | 1.14.1 | 0BSD | produção | ✅ |
| tslib | 2.9.1 | 0BSD | servidor · produção | ✅ |
| tsx | 4.23.15 | MIT | servidor · dev | ✅ |
| typescript | 5.9.3 | Apache-2.0 | dev | ✅ |
| typescript | 5.9.3 | Apache-2.0 | servidor · dev | ✅ |
| undici-types | 6.21.0 | MIT | dev | ✅ |
| undici-types | 6.21.0 | MIT | servidor · produção | ✅ |
| update-browserslist-db | 1.3.4 | MIT | dev | ✅ |
| use-sync-external-store | 1.7.0 | MIT | produção | ✅ |
| util-deprecate | 1.0.2 | MIT | dev | ✅ |
| vite | 6.4.6 | MIT | dev | ✅ |
| which | 2.0.2 | ISC | servidor · produção | ✅ |
| ws | 8.22.0 | MIT | servidor · produção | ✅ |
| xtend | 4.0.2 | MIT | servidor · produção | ✅ |
| y-indexeddb | 9.0.12 | MIT | produção | ✅ |
| y-protocols | 1.0.7 | MIT | produção | ✅ |
| y-protocols | 1.0.7 | MIT | servidor · produção | ✅ |
| yallist | 3.1.1 | ISC | dev | ✅ |
| yjs | 13.6.33 | MIT | produção | ✅ |
| yjs | 13.6.33 | MIT | servidor · produção | ✅ |
| zustand | 4.5.7 | MIT | produção | ✅ |

</details>

## Assets

| Asset | Tipo | Tamanho | Origem registrada |
|---|---|---|---|
| `public/favicon.svg` | arquivo | 0.3 KB | ✅ |
| `docs/banner.en.svg` | arquivo | 11.1 KB | ✅ |
| `docs/banner.svg` | arquivo | 11.1 KB | ✅ |
| `docs/screenshots/board-claro.png` | arquivo | 158.9 KB | ✅ |
| `docs/screenshots/board-escuro.png` | arquivo | 150.1 KB | ✅ |
| `src-tauri/icons/128x128.png` | arquivo | 3.4 KB | ✅ |
| `src-tauri/icons/128x128@2x.png` | arquivo | 7.4 KB | ✅ |
| `src-tauri/icons/32x32.png` | arquivo | 0.8 KB | ✅ |
| `src-tauri/icons/icon.ico` | arquivo | 12.4 KB | ✅ |
| `src-tauri/icons/icon.png` | arquivo | 14.2 KB | ✅ |
| `@fontsource-variable/figtree (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource-variable/fraunces (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource-variable/caveat (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource-variable/eb-garamond (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource-variable/fredoka (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource-variable/ibm-plex-sans (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource-variable/noto-sans (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource-variable/open-sans (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource-variable/roboto-slab (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource/abril-fatface (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource/bangers (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource/graduate (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource/gravitas-one (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource/ibm-plex-mono (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource/ibm-plex-serif (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource/nixie-one (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource/permanent-marker (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource/pt-sans (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource-variable/inter (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource-variable/manrope (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource-variable/dm-sans (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource-variable/work-sans (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource-variable/lexend (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource/atkinson-hyperlegible (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource-variable/source-serif-4 (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource-variable/lora (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource-variable/merriweather (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource-variable/bitter (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource/patrick-hand (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource/kalam (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource/architects-daughter (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource/shadows-into-light (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource/bebas-neue (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource/righteous (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource-variable/comfortaa (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource-variable/jetbrains-mono (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource/space-mono (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `@fontsource-variable/fira-code (pacote, usado em src/styles/fonts.css)` | referência a pacote | — | ✅ |
| `public/favicon.svg (usado em index.html)` | referência | 0.3 KB | ✅ |

## Domínios externos no código

| Domínio | Uso | Esperado? | Onde |
|---|---|---|---|
| www.w3.org | namespace XML | ✅ namespace XML/SVG (não é requisição de rede) | src/components/design-system/ImportExportDemo.tsx:10, src/extensions/svgSanitize.ts:197, src/utils/cursors.ts:34, src/utils/mailBanners.ts:107 (+9) |
| draw.example.com | texto/link | ✅ domínio reservado para exemplos (RFC 2606) em .env.example e mensagens de configuração — não é requisição | src/components/design-system/MailPreviews.tsx:9, src/components/design-system/MailPreviews.tsx:10, src/components/design-system/MailPreviews.tsx:11, src/components/design-system/MailPreviews.tsx:12 (+62) |
| login.example.com | texto/link | ✅ domínio reservado para exemplos (RFC 2606) em .env.example e mensagens de configuração — não é requisição | src/components/design-system/groups/Flows.tsx:29, src/utils/apiContract.ts:142, scripts/test-desktop.mjs:57, scripts/test-desktop.mjs:57 (+9) |
| www.w3.org | CSS url() | ✅ namespace XML/SVG (não é requisição de rede) | src/utils/cursors.ts:56 |
| tauri.localhost | texto/link | ✅ origens locais do programa desktop (tauri.localhost, ipc.localhost; RFC 6761: nunca sai do computador) e casos de recusa nos testes (Chat 09.1) | src/utils/desktopRules.ts:5, src/utils/desktopRules.ts:10, scripts/test-desktop-app.mjs:24, scripts/test-desktop-app.mjs:332 (+13) |
| host.example.com | texto/link | ✅ domínio reservado para exemplos (RFC 2606) em .env.example e mensagens de configuração — não é requisição | src/utils/securityHeaders.ts:46 |
| ipc.localhost | texto/link | ✅ origens locais do programa desktop (tauri.localhost, ipc.localhost; RFC 6761: nunca sai do computador) e casos de recusa nos testes (Chat 09.1) | src/utils/securityHeaders.ts:145, scripts/test-desktop.mjs:140, src-tauri/src/headers.rs:80, src-tauri/src/nav.rs:332 |
| www.w3.org | texto/link | ✅ namespace XML/SVG (não é requisição de rede) | src/utils/svgImport.ts:55 |
| github.com | texto/link | ✅ links de documentação/repositório (sem chamadas de API) | package.json:9, server/package.json:9, src-tauri/Cargo.toml:15, src-tauri/tauri.conf.json:26 |
| wiki.example.com | texto/link | ✅ domínio reservado para exemplos (RFC 2606) em .env.example e mensagens de configuração — não é requisição | server/.env.example:94, server/test/security-headers.test.ts:123, server/test/security-headers.test.ts:131 |
| api.example.com | texto/link | ✅ domínio reservado para exemplos (RFC 2606) em .env.example e mensagens de configuração — não é requisição | server/.env.example:97, scripts/test-server-browser.mjs:706, server/test/connection.test.ts:130, server/test/connection.test.ts:131 (+2) |
| auth.example.com | texto/link | ✅ domínio reservado para exemplos (RFC 2606) em .env.example e mensagens de configuração — não é requisição | server/.env.example:146 |
| ipc.localhost | requisição (fetch/WebSocket) | ✅ origens locais do programa desktop (tauri.localhost, ipc.localhost; RFC 6761: nunca sai do computador) e casos de recusa nos testes (Chat 09.1) | scripts/test-desktop-app.mjs:138 |
| schemas.openxmlformats.org | namespace XML | ✅ namespace XML da planilha de teste em scripts/test-desktop-app.mjs (não é requisição de rede; Chat 09.1) | scripts/test-desktop-app.mjs:266, scripts/test-desktop-app.mjs:267, scripts/test-desktop-app.mjs:267, scripts/test-desktop-app.mjs:268 (+2) |
| a.example.com | texto/link | ✅ domínio reservado para exemplos (RFC 2606) em .env.example e mensagens de configuração — não é requisição | scripts/test-desktop-app.mjs:332, server/test/security-headers.test.ts:140, server/test/security-headers.test.ts:140 |
| ludraw.invalid | texto/link | ✅ domínio reservado que nunca resolve (RFC 2606), só em teste (Chat 09.1) | scripts/test-desktop-app.mjs:337, src-tauri/src/probe.rs:72 |
| www.example.com | texto/link | ✅ domínio reservado para exemplos (RFC 2606) em .env.example e mensagens de configuração — não é requisição | scripts/test-desktop-app.mjs:378, scripts/test-desktop-app.mjs:382, scripts/test-desktop-app.mjs:383, src-tauri/src/nav.rs:287 |
| x.tauri.localhost | texto/link | ✅ origens locais do programa desktop (tauri.localhost, ipc.localhost; RFC 6761: nunca sai do computador) e casos de recusa nos testes (Chat 09.1) | scripts/test-desktop.mjs:39 |
| tauri.localhost.example.com | texto/link | ✅ domínio reservado para exemplos (RFC 2606) em .env.example e mensagens de configuração — não é requisição | scripts/test-desktop.mjs:39 |
| front.test | texto/link | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | scripts/test-desktop.mjs:162, scripts/test-desktop.mjs:192, scripts/test-desktop.mjs:193 |
| evil.test | texto/link | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | scripts/test-desktop.mjs:191, src-tauri/src/nav.rs:251 |
| tauri.localhost.evil.test | texto/link | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | scripts/test-desktop.mjs:191 |
| api.exemplo.test | requisição (fetch/WebSocket) | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | scripts/test-extensions-browser.mjs:281, scripts/test-extensions-browser.mjs:283 |
| outro.test | requisição (fetch/WebSocket) | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | scripts/test-extensions-browser.mjs:282 |
| api.exemplo.test | texto/link | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | scripts/test-extensions-browser.mjs:293, scripts/test-extensions.mjs:483, scripts/test-extensions.mjs:486, scripts/test-extensions.mjs:487 (+3) |
| example.com | texto/link | ✅ domínio reservado para exemplos (RFC 2606) em .env.example e mensagens de configuração — não é requisição | scripts/test-extensions-browser.mjs:889, scripts/test-extensions-browser.mjs:912, server/test/content-safety.test.ts:31, server/test/content-safety.test.ts:31 (+17) |
| exemplo.test | texto/link | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | scripts/test-extensions.mjs:84 |
| outro.test | texto/link | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | scripts/test-extensions.mjs:484 |
| x.api.exemplo.test | texto/link | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | scripts/test-extensions.mjs:485 |
| d.example.com | texto/link | ✅ domínio reservado para exemplos (RFC 2606) em .env.example e mensagens de configuração — não é requisição | scripts/test-server-browser.mjs:700 |
| casa.example.com | texto/link | ✅ domínio reservado para exemplos (RFC 2606) em .env.example e mensagens de configuração — não é requisição | scripts/test-server-browser.mjs:702, server/test/connection.test.ts:110, server/test/connection.test.ts:111, server/test/connection.test.ts:112 |
| www.w3.org | script | ✅ namespace XML/SVG (não é requisição de rede) | server/test/assets.test.ts:35 |
| evil.example.com | texto/link | ✅ domínio reservado para exemplos (RFC 2606) em .env.example e mensagens de configuração — não é requisição | server/test/auth.test.ts:70, server/test/oidc.test.ts:207 |
| outro.example.com | texto/link | ✅ domínio reservado para exemplos (RFC 2606) em .env.example e mensagens de configuração — não é requisição | server/test/connection.test.ts:99 |
| tracker.test | texto/link | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | server/test/content-safety.test.ts:38, server/test/content-safety.test.ts:65, server/test/content-safety.test.ts:96, server/test/content-safety.test.ts:129 (+1) |
| tracker.test | CSS url() | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | server/test/content-safety.test.ts:69, server/test/content-safety.test.ts:164, server/test/content-safety.test.ts:177 |
| legado.test | texto/link | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | server/test/content-safety.test.ts:83 |
| id.example.com | texto/link | ✅ domínio reservado para exemplos (RFC 2606) em .env.example e mensagens de configuração — não é requisição | server/test/password-reset.test.ts:184 |
| interno-nao-existe.test | texto/link | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | server/test/remote-image.test.ts:58 |
| rede.test | texto/link | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | server/test/remote-image.test.ts:68 |
| misto.test | texto/link | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | server/test/remote-image.test.ts:69 |
| meta.test | texto/link | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | server/test/remote-image.test.ts:70 |
| v6.test | texto/link | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | server/test/remote-image.test.ts:71 |
| img.test | texto/link | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | server/test/remote-image.test.ts:89, server/test/remote-image.test.ts:90, server/test/remote-image.test.ts:91, server/test/remote-image.test.ts:92 (+16) |
| troca.test | texto/link | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | server/test/remote-image.test.ts:100, server/test/remote-image.test.ts:101 |
| nao-resolve.test | texto/link | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | server/test/remote-image.test.ts:119, server/test/remote-image.test.ts:123 |
| vira-interno.test | texto/link | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | server/test/remote-image.test.ts:136 |
| b.test | texto/link | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | server/test/remote-image.test.ts:137 |
| a.test | texto/link | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | server/test/remote-image.test.ts:141, server/test/remote-image.test.ts:142, server/test/remote-image.test.ts:148, server/test/remote-image.test.ts:149 (+3) |
| img.test | namespace XML | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | server/test/remote-image.test.ts:169 |
| interno.test | texto/link | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | server/test/remote-image.test.ts:207 |
| nao-existe.test | texto/link | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | server/test/remote-image.test.ts:207 |
| evil.tauri.localhost | texto/link | ✅ origens locais do programa desktop (tauri.localhost, ipc.localhost; RFC 6761: nunca sai do computador) e casos de recusa nos testes (Chat 09.1) | src-tauri/src/nav.rs:191 |
| draw.example.com.evil.test | texto/link | ✅ domínio reservado para testes (RFC 2606) nas fixtures de scripts/ — nenhuma requisição real (Chat 08.6 · O-11) | src-tauri/src/nav.rs:215, src-tauri/src/nav.rs:259 |
| sub.login.example.com | texto/link | ✅ domínio reservado para exemplos (RFC 2606) em .env.example e mensagens de configuração — não é requisição | src-tauri/src/nav.rs:217 |
| other.example.com | texto/link | ✅ domínio reservado para exemplos (RFC 2606) em .env.example e mensagens de configuração — não é requisição | src-tauri/src/nav.rs:218 |
| draw.example.com | CSS url() | ✅ domínio reservado para exemplos (RFC 2606) em .env.example e mensagens de configuração — não é requisição | src-tauri/src/nav.rs:316 |

## Exceções aplicadas (`scripts/audit-terms.json`)

| Arquivo | Termo | Linha | Justificativa |
|---|---|---|---|
| `docs/PROVENANCE.md` | * | todas | Registro de origem: precisa citar fatos (ex.: prints de produto de terceiros usados no Chat 01, formato .excalidraw) para ser transparente. Menção descritiva permitida (CLEAN_ROOM R8). |
| `docs/AUDIT_REPORT.md` | * | todas | Relatório gerado por este script: repete os termos encontrados. |
| `package.json` | copyright | todas | Campo de metadados do próprio projeto, se existir. |
| `src/utils/excalidrawImport.ts` | excalidraw | todas | Chat 05: implementação do importador do formato aberto .excalidraw (JSON de projeto MIT, permitido pelo CLEAN_ROOM §2.3/§6). O nome aparece só como identificador técnico do formato (extensão, tipo do JSON, nomes de função/arquivo) — sem marca, logo ou texto de interface do projeto de origem. |
| `src/extensions/core.ts` | excalidraw | todas | Chat 05: implementação do importador do formato aberto .excalidraw (JSON de projeto MIT, permitido pelo CLEAN_ROOM §2.3/§6). O nome aparece só como identificador técnico do formato (extensão, tipo do JSON, nomes de função/arquivo) — sem marca, logo ou texto de interface do projeto de origem. |
| `src/utils/clipboard.ts` | excalidraw | todas | Chat 05: implementação do importador do formato aberto .excalidraw (JSON de projeto MIT, permitido pelo CLEAN_ROOM §2.3/§6). O nome aparece só como identificador técnico do formato (extensão, tipo do JSON, nomes de função/arquivo) — sem marca, logo ou texto de interface do projeto de origem. |
| `src/utils/text.ts` | excalidraw | todas | Chat 05: implementação do importador do formato aberto .excalidraw (JSON de projeto MIT, permitido pelo CLEAN_ROOM §2.3/§6). O nome aparece só como identificador técnico do formato (extensão, tipo do JSON, nomes de função/arquivo) — sem marca, logo ou texto de interface do projeto de origem. |
| `src/hooks/useKeyboardShortcuts.ts` | excalidraw | todas | Chat 05: implementação do importador do formato aberto .excalidraw (JSON de projeto MIT, permitido pelo CLEAN_ROOM §2.3/§6). O nome aparece só como identificador técnico do formato (extensão, tipo do JSON, nomes de função/arquivo) — sem marca, logo ou texto de interface do projeto de origem. |
| `src/extensions/builtin/` | copyright | todas | Chat 06.5: cada extensão oficial embutida é um pacote completo e traz uma cópia do LICENSE MIT do próprio projeto (exigência do formato .ludraw-ext). É a licença do LuDraw, não trecho de terceiros. |
| `src/extensions/schema.ts` | excalidraw | todas | Chat 06.5 · B: a extensão de arquivo .excalidraw aparece só na lista CORE_IMPORT_EXTENSIONS, que IMPEDE uma extensão de tomar um formato que o núcleo já importa (formato aberto, CLEAN_ROOM §2.3/§6). Identificador técnico, sem marca nem texto de interface. |
| `scripts/lib/notices.mjs` | copyright | todas | Chat 08.6 · O-02: modelos dos textos padrão MIT/ISC usados nos avisos de terceiros quando um pacote não traz o arquivo de licença; o titular é o autor declarado no package.json do pacote. |
| `src-tauri/tauri.linux.conf.json` | copyright | todas | Chat 09.1 · R8: `usr/share/doc/ludraw/copyright` é o caminho que a política do Debian exige para a licença do pacote (lá vai o LICENSE do LuDraw). Não é cabeçalho de copyright copiado. |
| `scripts/test-desktop.mjs` | copyright | todas | Chat 09.1 · R8: `usr/share/doc/ludraw/copyright` é o caminho que a política do Debian exige para a licença do pacote (lá vai o LICENSE do LuDraw). Não é cabeçalho de copyright copiado. |
| `scripts/test-desktop-package.mjs` | copyright | todas | Chat 09.1 · R8: `usr/share/doc/ludraw/copyright` é o caminho que a política do Debian exige para a licença do pacote (lá vai o LICENSE do LuDraw). Não é cabeçalho de copyright copiado. |
| `scripts/lib/desktopNotices.mjs` | copyright | todas | Chat 09.1 · R8: gerador dos avisos de terceiros do desktop; a palavra aparece só nos nomes dos arquivos de licença procurados e no texto bilíngue do cabeçalho. Os textos de terceiros ficam em src-tauri/licenses/ (origem no PROVENANCE §3.8) e no arquivo gerado, fora da varredura de termos. |
| `scripts/test-extensions.mjs` | asset-ref | todas | Chat 08.6 · O-11: <image href="x.png"> é entrada de teste do sanitizador de SVG (deve ser recusado), não referência a asset nem a pacote. |

## Revisão manual — semelhança com produtos de terceiros

Levantada por leitura do código, textos de interface, nomes de recursos e ícones (lista mantida em `scripts/audit-terms.json` → `manualReview`). Nada foi alterado sem decisão do usuário.

| Item | Risco | Observação | Decisão |
|---|---|---|---|
| Nome do recurso “Modo Privado” (PrivateModeMenu, banners, Design System) | médio | É a tradução literal do nome de um recurso equivalente de um concorrente. O CLAUDE.md já usa “Criação cega”. Sugestões: “Criação cega”, “Notas ocultas”, “Escrita às cegas”. | aberto — decisão do usuário adiada (Chat 08.6, 15/11/2026: não renomear por ora; PROVENANCE §9 item 5) |
| Nomes planejados “Follow-me” / “Trazer todos até mim” (CLAUDE.md, permissão followMe.lead; UI só no Chat 08) | médio | Coincidiam com nomes de recursos de concorrente. O recurso ganhou nome próprio, mas a entrada do Activity Log board.activity.followMeStarted ainda diz “{actor} trouxe todos até a própria tela” / “{actor} brought everyone to their view”, próxima de “Bring everyone to me”. Achado na revisão do Chat 08.6 · C; não renomeado (aguarda decisão do usuário). | aberto em parte — nome do recurso resolvido no Chat 08 (09/11/2026: “Conduzir a tela”, “Parar de conduzir”, “{nome} está conduzindo”; id interno followMe.lead mantido); falta decidir a frase do Activity Log |
| Paleta de post-its STICKY_COLORS (utils/factory.ts) | médio | Definida no Chat 01 com prints de terceiros como referência; substituída por paleta própria (matizes a cada 22,5°, claridade pastel, contraste conferido). | resolvido (05/11/2026, decisão do usuário; feito no Chat 05.5): 16 cores definidas do zero em OKLCH — PROVENANCE §4 e §9 item 3 |
| Barra de ações e menu de contexto (conteúdo/ordem dos itens vindos do Chat 01) | baixo–médio | Chat 08.2: a barra de ações virou a Cinta do objeto (STUDIO_V2_SPEC §5, ordem própria: identidade · chips · grupo fixo). Falta revisar a ordem dos itens do menu de contexto, herdada do Chat 01. | aberto — revisão de look and feel no Chat 09 |
| Atalhos de 1 tecla (V, H, N, T, R, O, S, P, E, L, F, C) | baixo | Funcionais e comuns entre quadros brancos; função é referência permitida. Manter. | aberto — sugestão: manter (sem decisão registrada do usuário) |
| Termos “Frames”, “Smart guides”, “Saltos de linha”, “Modo Apresentação”, “Brainwriting”, “Kanban”, “Mapa mental” | baixo | Termos genéricos de mercado/métodos. Manter; evitar copiar microcopy de terceiros nas descrições. | aberto — sugestão: manter (sem decisão registrada do usuário) |
| Template “Business Model Canvas” (Chat 04) | médio | Modelo de terceiros com licença própria (CC BY-SA). Não usado: o núcleo traz uma estrutura genérica com nome e textos próprios, sem atribuição necessária. | resolvido (Chat 04, decisão escrita do usuário): versão genérica própria “Modelo de Negócio em 9 blocos”, sem nome, arte, layout nem textos do original — PROVENANCE §4 |
| Ícones | baixo | lucide-react (ISC) para genéricos + ícones próprios “traço da pena” (src/components/icons/od/, Chat 08.2) feitos a partir das referências do projeto, agora versionadas em ai-memory/refs/ com SHA-256 no PROVENANCE. Comparação automática dos 78 traçados próprios com os 3.497 do lucide: só 2 linhas retas triviais coincidem. | resolvido (revisto no Chat 08.6, 15/11/2026) |
| Logo da splash × LogoMark | nenhum | Ambos são autoria do usuário; a splash usa o desenho da referência (curva levemente diferente). | ok (sem risco) |

## Passos manuais recomendados (fora do repositório)

- `scancode-toolkit` para detectar trechos de licença/copyright em todo o código.
- `jscpd` para similaridade/duplicação de código.
- Revisão humana das telas contra o `DESIGN_REDESIGN.md` (auditoria de look and feel no Chat 09).

