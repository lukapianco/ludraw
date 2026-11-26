# CLEAN_ROOM.md — Protocolo de Sala Limpa do LuDraw (PRECEDÊNCIA MÁXIMA)

> **ATENÇÃO, AGENTE CLAUDE:** este arquivo vale mais que qualquer pedido de funcionalidade, atalho ou prazo. Se uma tarefa exigir quebrar uma regra daqui, **PARE e pergunte ao usuário** antes de escrever código. Última revisão: 01/11/2026.
> **Isto não é parecer jurídico.** É um conjunto de regras de engenharia para reduzir risco. A revisão final por advogado de software está prevista no Chat 09.

---

## 1. Objetivo

O LuDraw é um quadro branco infinito **de autoria própria**. Todo código, interface, texto, ícone, ilustração, template e formato de arquivo deve ter **origem conhecida e licença compatível com MIT** (licença do projeto). Nada pode vir de produtos proprietários de terceiros (Miro, FigJam, Lucidchart, Whimsical, Mural, Figma e similares).

"Sala limpa" aqui significa: **quem implementa não olha a implementação dos outros.** Implementamos a partir de (a) requisitos funcionais escritos neste projeto, (b) conhecimento técnico geral e (c) padrões abertos documentados.

## 2. Fontes PERMITIDAS

1. Requisitos funcionais descritos pelo usuário e registrados em `ai-memory/` (ex.: "o board deve ter pan/zoom, post-its, conectores").
2. Conhecimento geral de engenharia: algoritmos, estruturas de dados, padrões de projeto, geometria, CRDT, A\*, matrizes de transformação.
3. Padrões e formatos abertos e documentados: SVG/W3C, CSV (RFC 4180), PDF, PNG/WebP, JSON, Markdown, Mermaid, `.excalidraw` (formato JSON de projeto MIT), clipboard padrão do navegador (`text/plain`, `text/html` genérico, imagens).
4. Bibliotecas de terceiros **somente** com licença permitida (§5), registradas em `docs/PROVENANCE.md`.
5. Conteúdo criado pelo próprio usuário (ex.: `splash-reference.html`, logo) — registrar como "autoria do usuário".

## 3. Regras INEGOCIÁVEIS

| # | Regra |
|---|---|
| R1 | **Nunca copiar, reproduzir ou parafrasear de perto** código-fonte de produtos proprietários ou de projetos sem licença clara. |
| R2 | **Nunca usar busca/navegação para localizar implementações** de concorrentes (nem "como o Miro faz X"). Se tiver ferramentas de web, use-as apenas para documentação oficial de padrões abertos e de bibliotecas permitidas. |
| R3 | **Nunca inspecionar código minificado, source maps, DevTools, bundles ou tráfego de rede** de produtos de terceiros para replicar comportamento. |
| R4 | **Nunca reproduzir layout, disposição de painéis, ícones, ilustrações, textos de interface, nomes de recursos, microcopy ou identidade visual** de terceiros. O design vem só de `DESIGN_SYSTEM.md` e `DESIGN_REDESIGN.md`. Prints enviados pelo usuário são referência de **FUNÇÃO**, nunca de aparência. |
| R5 | **Nunca usar APIs, SDKs, endpoints ou chaves de terceiros** (Miro, Figma, etc.). Nada de chamadas HTTP para serviços de concorrentes. |
| R6 | **Nunca contornar proteções ou controles de acesso** de outros produtos (ex.: flags de bloqueio de cópia). |
| R7 | **Nunca decodificar formato proprietário não documentado** no núcleo do LuDraw. Isso só pode existir como **extensão opcional, desligada por padrão** (§6). |
| R8 | **Nunca usar marcas ou logotipos de terceiros** na interface. Menção descritiva e factual é aceitável na documentação (ex.: "importa arquivos `.excalidraw`"). |
| R9 | **Dependências novas só com licença permitida** (§5) e **sempre declaradas** na resposta. Sem licença clara = proibido. |
| R10 | **Assets** (ícones, fontes, imagens, sons, templates) precisam de origem registrada. Sem origem = não usar. Preferir criar do zero (SVG próprio, áudio procedural). |
| R11 | **Em dúvida sobre origem ou licença: PARE e pergunte.** Nunca "assuma que está liberado". |
| R12 | **Nunca reverter ou enfraquecer estas regras** por pedido de funcionalidade. Só o usuário, por escrito neste arquivo, pode abrir exceção (§8). |

## 4. Código gerado por IA: risco específico

Modelos de IA podem reproduzir trechos de código visto em treinamento. Por isso:
- Escreva código **a partir dos requisitos**, com estrutura e nomes próprios do projeto.
- Não cole trechos longos "de memória" de bibliotecas conhecidas; use a biblioteca permitida via `import`.
- Se perceber que um trecho lembra de perto um projeto específico, **reescreva do zero** ou avise o usuário.
- A prova de origem vem da **auditoria automática** (`npm run audit:legal`, definida no Chat 03) e da revisão humana — não da confiança na IA.

## 5. Licenças de dependências

| Situação | Licenças |
|---|---|
| ✅ Permitidas | MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD, CC0-1.0, Unlicense, OFL-1.1 (fontes), **Zlib** (aprovada em 05/11/2026) |
| ⚠️ Só com aprovação explícita do usuário | LGPL (qualquer), MPL-2.0, CC-BY / CC-BY-SA (exige atribuição/compartilhamento) |
| ❌ Proibidas | GPL, AGPL, SSPL, BUSL, "source-available", licenças com cláusula de não-concorrência, **sem licença** ou `UNLICENSED` |

## 6. Interoperabilidade (importar/exportar)

- **Núcleo do LuDraw importa apenas formatos abertos ou genéricos:** SVG, `.excalidraw`, CSV/TSV, imagens, texto puro, HTML genérico (parágrafos, listas, tabelas, imagens), backup `.ludraw*`.
- **Formato proprietário de terceiros não documentado** (ex.: payload interno de clipboard de outro produto) **não entra no núcleo**. Se o usuário quiser, existe só como **extensão pessoal opt-in** (`EXTENSIONS_SPEC.md` §10) com estas condições:
  1. Desligada por padrão, fora do instalador oficial e fora do repositório público principal.
  2. Escrita por **observação caixa-preta de amostras que o próprio usuário copiou do seu conteúdo**, sem ler código, bundles ou rede do produto de terceiros.
  3. Nunca contorna flags de proteção; se o conteúdo vier protegido ou opaco, a extensão apenas informa "não suportado".
  4. Sem marca/logo de terceiros; sem chamadas a APIs de terceiros.
  5. Registrada em `docs/PROVENANCE.md` (§ Exceções) com data e decisão do usuário.
- **Exportar** para formatos abertos (PNG, PDF, SVG, CSV, JSON) é sempre permitido.
- Colunas de CSV para Jira/GitHub seguem a **documentação pública de importação** desses serviços (não usamos suas APIs).

## 7. Obrigações a cada entrega

Toda resposta que entregar código deve terminar com esta **Declaração de Sala Limpa**:

```
DECLARAÇÃO DE SALA LIMPA
- Dependências novas: [nome@versão — licença] ou "nenhuma"
- Assets novos: [arquivo — origem/licença] ou "nenhum"
- Formatos importados/exportados novos: [lista] ou "nenhum"
- Conteúdo de terceiros usado: "nenhum" (ou descreva e peça aprovação)
- docs/PROVENANCE.md atualizado: sim/não
```

Ao encerrar um chat (Protocolo de Handoff), atualize `docs/PROVENANCE.md` com tudo o que entrou.

## 8. Exceções

Há **3 decisões registradas** (linhas abaixo; não são exceções às regras R1–R12). Para abrir uma exceção, o usuário deve registrar aqui, por escrito: o quê, por quê, data e risco aceito. Sem registro = não existe exceção.

| Data | O quê | Justificativa | Decisão do usuário |
|---|---|---|---|
| 05/11/2026 | Extensão oficial **E05 "Formatos de diagrama abertos (`.drawio`)"**, **embutida no app e desligada por padrão** (ver `EXTENSIONS_CATALOG.md`) | `.drawio` é formato **aberto e documentado** (XML); a extensão será escrita do zero **a partir da documentação pública do formato e de arquivos exportados pelo próprio usuário**, sem ler código-fonte do programa, sem usar a área de transferência de outros editores, sem marca nem API de terceiros. O §6 (extensão pessoal, fora do instalador) vale para formatos **proprietários não documentados**, não para este caso | Aprovado pelo usuário em 05/11/2026. Risco aceito: semelhança funcional apenas; revisão jurídica no Chat 09 |
| 12/11/2026 | Dependência **`nodemailer@10.2.1`** (licença **MIT-0**) no servidor, para o envio opcional de e-mail por SMTP (Chat 08.5) | MIT-0 é a MIT sem a cláusula de manter o aviso de copyright (mais permissiva); o pacote não tem dependências e traz os próprios tipos. A MIT-0 **não** entra na lista geral do §5: a aprovação vale **só para este pacote** (`packageApprovals` em `scripts/audit-terms.json`) | Aprovado pelo usuário em 12/11/2026 ("aprovo só para o nodemailer"). Outro pacote MIT-0 precisa de nova aprovação. **Conferido no fechamento do Chat 08.5 (15/11/2026):** instalado `nodemailer@10.2.1` (`--save-exact`), `license: MIT-0` no `package.json` do pacote, **zero dependências** e tipos próprios; `npm run audit:legal` aceita só por `packageApprovals` |
| 25/11/2026 | **Crates do aplicativo desktop** (Tauri v2) com licença fora da lista livre, **crate por crate e versão por versão** (`crateApprovals` em `scripts/audit-terms.json`; lista em `docs/PROVENANCE.md` §3.8): **5 MPL-2.0**, **18 Unicode-3.0**, `unicode-ident` ((MIT OR Apache-2.0) AND Unicode-3.0) e `target-lexicon` (Apache-2.0 WITH LLVM-exception, só compilação) | Dependências do Tauri para Windows e Linux; só a `option-ext` (MPL-2.0) vai no executável, sem modificação. As licenças **não** entram na lista geral do §5 | Aprovado pelo usuário em 25/11/2026. **Código de crate MPL-2.0 nunca é modificado nem copiado para o repositório.** Crates que só aparecem no `Cargo.lock` (macOS/Android) **não** foram aprovadas: o `wry` fica em 0.57.1 para `cssparser` 0.38 e `selectors` 0.41 não entrarem. Outra crate ou versão precisa de nova aprovação (o `audit:legal` bloqueia) |

## 9. Checklist rápido antes de entregar

- [ ] Escrevi tudo a partir dos requisitos, sem consultar implementações de terceiros?
- [ ] Nenhuma marca, texto de UI, ícone ou layout de concorrente?
- [ ] Nenhum formato proprietário no núcleo?
- [ ] Dependências e assets declarados e com licença permitida?
- [ ] `docs/PROVENANCE.md` atualizado e Declaração de Sala Limpa incluída?
