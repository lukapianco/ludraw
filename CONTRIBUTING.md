# Contribuindo com o LuDraw

Obrigado pelo interesse! O LuDraw é um quadro branco infinito, open-source (MIT) e local-first. Este guia explica como preparar o ambiente, o que o CI confere e — o mais importante — **as regras de origem do código**, que valem para toda contribuição.

## 1. Ambiente

- **Node.js 22.6 ou mais novo** (a versão está em `.nvmrc`; com nvm: `nvm use`). O `npm run test:permissions` usa `--experimental-strip-types`, que exige Node ≥ 22.6.
- npm (vem com o Node).

```bash
git clone https://github.com/lukapianco/ludraw.git
cd ludraw
npm ci          # instala exatamente o que está no package-lock.json
npm run dev     # http://localhost:5173
```

As fontes vêm dos pacotes Fontsource em `node_modules` — o app funciona offline e não pede nada a servidores externos.

## 2. Antes de abrir o pull request

O CI (`.github/workflows/ci.yml`) roda estes comandos; rode-os antes:

| Comando | O que confere |
|---|---|
| `npm run typecheck` | TypeScript em modo strict, sem erros |
| `npm run build` | build de produção (Vite) |
| `npm run test:permissions` | matriz de permissões (`can()`/`ensure()`) |
| `npm run audit:legal` | licenças das dependências, termos proibidos, origem dos assets, domínios externos, SHA-256 das provas de origem e avisos de terceiros atualizados (zero bloqueantes). Só confere; o relatório `docs/AUDIT_REPORT.md` é gravado por `npm run docs:legal` |
| `npm run notices` | regenera `THIRD_PARTY_NOTICES.txt` e `server/THIRD_PARTY_NOTICES.txt` — obrigatório depois de instalar, atualizar ou remover pacote (versões novas só com ≥ 7 dias, `docs/PROVENANCE.md` §3.5) |
| `npm run audit:features` | catálogo de funções em dia com o código |
| `npm run audit:i18n` | catálogos de tradução: chaves, placeholders, marcação, plurais, texto fixo em português no código e `docs/LANGUAGES.md` em dia |
| `npm run test:extensions` · `npm run test:design` | plataforma de extensões · contraste e regras do Design System |
| `npm run test:server` | testes do servidor no PostgreSQL embutido (sem Docker) |
| `npm run audit:version` | a mesma versão em todos os lugares (raiz, servidor, lockfiles, Dockerfile, compose, CHANGELOG) |
| `npm run audit:name` | o nome antigo do projeto não voltou a nenhum arquivo nem nome de arquivo (veja "Nome do projeto e prefixo `od`") |

Em jobs separados, o CI também roda:
- **segredos no histórico inteiro** com o gitleaks (veja 2.1);
- `npm audit signatures` e `npm audit --omit=dev --audit-level=high` no app e no servidor;
- `npm run test:server:pg`, num PostgreSQL e num Valkey descartáveis;
- `npm run test:docker`, que constrói a imagem e faz backup e restauração;
- `npm run test:server:multi`, com duas instâncias;
- **programa desktop:** `npm run test:desktop` (no job de verificação) e os testes do Rust (`npm run test:desktop:rust`: `cargo fmt`, `clippy -D warnings` e `cargo test`) no Windows e no Linux.

Os jobs do PostgreSQL, do Docker e das duas instâncias precisam de Docker. Localmente, veja [docs/TESTAR_LOCALMENTE.md](docs/TESTAR_LOCALMENTE.md). Os testes de navegador continuam fora do CI.

As actions do CI ficam fixadas pelo SHA do commit, com a tag num comentário ao lado. Para atualizar uma delas:
1. use uma versão publicada há 7 dias ou mais;
2. confira a licença;
3. confira o SHA no repositório oficial.

### 2.0 Programa desktop (Tauri)

Precisa do Rust pelo [rustup](https://rustup.rs) (a versão fica em `src-tauri/rust-toolchain.toml` e é instalada sozinha) e, no Linux, de `libwebkit2gtk-4.1-dev`. Os comandos `cargo` rodam **dentro de `src-tauri/`**: só assim o rustup usa a versão fixada.

| Comando | O que faz |
|---|---|
| `npm run desktop:dev` | compila e abre o programa (perfil real em `%LOCALAPPDATA%\app.ludraw` ou `~/.local/share/app.ludraw`) |
| `npm run desktop:package` | instalador do sistema atual: NSIS no Windows, `.deb` no Linux (`src-tauri/target/release/bundle/`) |
| `npm run test:desktop` · `npm run test:desktop:rust` | configuração, permissões e CSP · `cargo fmt`, `clippy` e `cargo test` (rode `npm run desktop:web` antes) |
| `npm run test:desktop:app` | o programa de verdade num perfil descartável, só com `localhost` |
| `npm run test:desktop:package` | instala, confere e desinstala o pacote gerado; nunca marca "apagar os dados" e recusa começar se o LuDraw já estiver instalado |
| `npm run crates` → `npm run notices:desktop` | inventário das crates (licença e SHA-256) → avisos de terceiros do desktop. Crate nova só com a licença aprovada antes e publicada há 7 dias ou mais |

Os instaladores oficiais saem do workflow **Desktop** (`.github/workflows/desktop.yml`): disparo manual ou tag `v*` igual à versão. Ele instala e desinstala cada pacote em máquina descartável, publica os arquivos com `SHA256SUMS` e, na tag, cria um Release em **rascunho**.

### 2.1 Segredos (gitleaks)

O CI varre **o histórico inteiro** com o [gitleaks](https://github.com/gitleaks/gitleaks), versão fixa em `GITLEAKS_VERSION` no `ci.yml`. O binário vem do release oficial e o SHA-256 é conferido; o gitleaks nunca entra no repositório. Os valores encontrados são sempre redigidos (`--redact`).

- **Falso positivo** (senha de teste, hash público, nome que contém "key"): acrescente a impressão (`commit:arquivo:regra:linha`) ao `.gitleaksignore`, com o motivo na linha de cima.
- **Segredo de verdade:** não ponha no `.gitleaksignore`. Troque o segredo, avise os mantenedores e limpe o histórico.
- **Antes de cada commit (opcional):** instale o mesmo binário fora do repositório, no `PATH` ou em `GITLEAKS=/caminho`, e ative o gancho:

  ```sh
  cp scripts/pre-commit-gitleaks.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
  ```

  O gancho olha só o que está no stage. Para varrer o histórico inteiro, como o CI: `gitleaks git . --redact --no-banner`.

E também:

- **Boards salvos continuam abrindo.** Mudou um formato de dados? Mantenha a leitura do formato antigo (campos novos sempre opcionais).
- **Permissões:** toda ação que altera o board passa por `ensure(ação)` no store; nada de checar papel espalhado pela UI. Ação nova = regra nova em `scripts/test-permissions.mjs`.
- **Interface:** use os tokens e componentes do Design System (`docs/DESIGN_SYSTEM.md`) e acrescente o exemplo em `#/design-system`.
- **Textos de interface (i18n):** nenhum texto visível fica fixo em `.ts`/`.tsx` — rótulos, dicas, `aria-label`, `title`, toasts e mensagens de erro passam por `t('área.chave')` (ou `<Trans k="…">` quando há marcação). Toda chave nova entra **no mesmo commit** em `src/locales/pt-BR/` e `src/locales/en/` (o `en` faltando quebra o typecheck); o inglês é escrito do zero, sem copiar microcopy de outros produtos. Sem concatenar frases: use `{placeholders}` e plurais (`_one`/`_other`). Datas, números, listas e ordenação vêm de `src/i18n/format.ts` (`Intl`), nunca formatados à mão. Dados guardados nos boards (Activity Log, avisos de importação) guardam **chave + parâmetros**, não a frase pronta. Conteúdo do usuário nunca é traduzido. Exceções documentadas (tela `#/design-system`, valores de dados salvos) ficam em `scripts/audit-i18n-allow.json`, cada uma com o motivo. Guia completo: [docs/TRANSLATING.md](docs/TRANSLATING.md).
- **Traduções:** um idioma novo é só uma pasta `src/locales/<código>/` com JSON — siga o [docs/TRANSLATING.md](docs/TRANSLATING.md) e abra o PR com o modelo de tradução (`?template=translation.md`).
- **Catálogo de funções:** função nova ou alterada entra em `docs/features.json` (esquema em `docs/FEATURES.md`); depois rode `npm run docs:features`. Nunca apague uma linha: descontinuar muda o `status` (`deprecated` → `removed`).
- **CHANGELOG:** acrescente a mudança em `[Não lançado]` (formato Keep a Changelog).
- **Commits:** mensagens curtas no imperativo; prefixos como `feat:`, `fix:`, `docs:`, `chore:` ajudam a montar o CHANGELOG.
<!-- audit:name:nota-início -->
- **Nome do projeto e prefixo `od`:** o projeto se chamava OpenDraw antes de ser publicado e passou a se chamar **LuDraw** (identificador técnico `ludraw`, variáveis `LUDRAW_*`, arquivos `.ludraw*`, prefixo de extensões `dev.ludraw.`). O prefixo **`od`** que aparece no código — tokens CSS `--od-*`, classes `od-*`, `OdIcon`, `src/components/icons/od/`, atributos `data-od-*` e marcadores internos `od:` — é um **prefixo técnico histórico** e fica como está: não é visível para quem usa o app e não deve ser trocado. O `npm run audit:name` aceita esses padrões e recusa o nome antigo em qualquer outro lugar (as exceções, como o histórico do CHANGELOG e as provas de origem em `ai-memory/refs/`, estão listadas no próprio script).
<!-- audit:name:nota-fim -->

## 3. Regras de origem do código (sala limpa)

O LuDraw é escrito **do zero**. Para que o projeto possa ser distribuído com segurança, toda contribuição segue estas regras. Na dúvida sobre origem ou licença, **pare e pergunte** na issue antes de enviar.

**Pode usar como fonte:**

1. Requisitos descritos com suas palavras (o que a função deve fazer).
2. Conhecimento geral de engenharia: algoritmos, estruturas de dados, geometria, padrões de projeto.
3. Padrões e formatos **abertos e documentados**: SVG, CSV (RFC 4180), PDF, PNG/WebP, JSON, Markdown, `.excalidraw`, área de transferência padrão do navegador.
4. Bibliotecas com licença permitida (abaixo), declaradas em `docs/PROVENANCE.md`.
5. Conteúdo de sua autoria.

**Nunca:**

- copiar, reproduzir ou parafrasear de perto código de produtos proprietários ou de projetos sem licença clara;
- procurar implementações de concorrentes para replicar ("como o produto X faz isso");
- inspecionar código minificado, source maps, DevTools ou tráfego de rede de produtos de terceiros;
- reproduzir layout, ícones, ilustrações, textos de interface, nomes de recursos ou identidade visual de terceiros — prints servem como referência de **função**, nunca de aparência;
- usar APIs, SDKs, endpoints ou chaves de serviços de terceiros;
- contornar proteções ou controles de acesso de outros produtos;
- decodificar formatos proprietários não documentados no núcleo (isso só pode existir como extensão opcional, desligada por padrão);
- usar marcas ou logotipos de terceiros na interface (menção factual em documentação, como "importa `.excalidraw`", é aceita).

**Dependências e assets:**

| Situação | Licenças |
|---|---|
| ✅ Permitidas | MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD, CC0-1.0, Unlicense, OFL-1.1 (fontes), Zlib |
| ⚠️ Só com aprovação explícita do mantenedor | LGPL, MPL-2.0, CC-BY, CC-BY-SA |
| ❌ Proibidas | GPL, AGPL, SSPL, BUSL, "source-available", cláusula de não concorrência, sem licença ou `UNLICENSED` |

- Toda dependência nova é **declarada no PR** (nome@versão — licença) e registrada em `docs/PROVENANCE.md`. Prefira resolver sem dependência nova.
- Todo asset (ícone, fonte, imagem, som, template) precisa de origem registrada em `docs/PROVENANCE.md`. Prefira criar do zero (SVG próprio, áudio procedural).

**Código gerado por IA** segue as mesmas regras: quem envia responde pela origem. Revise o que a ferramenta produziu e não peça que ela reproduza produtos de terceiros.

Todo PR termina com a **Declaração de Sala Limpa** (já está no modelo de pull request).

## 4. Issues

Use os modelos de **Relatar um problema** ou **Sugerir uma função**. Não anexe boards com dados pessoais. Vulnerabilidades seguem o [SECURITY.md](SECURITY.md) — nunca em issue pública.

## 5. Licença

Ao contribuir, você concorda que sua contribuição será distribuída sob a [licença MIT](LICENSE) do projeto.
