# Política de segurança

## Versões com suporte

O LuDraw é um **projeto de estudo** (versões `0.x`), sem compromisso de manutenção contínua. Quando uma correção de segurança for possível, ela entra na versão mais recente da branch `main`; versões anteriores não recebem correções.

| Versão | Suporte |
|---|---|
| `main` / última `0.x` | ✅ (melhor esforço) |
| versões `0.x` anteriores | ❌ |

## Como relatar uma vulnerabilidade

**Não abra issue pública.** Use o relato privado do GitHub: aba **Security → Report a vulnerability** do repositório (GitHub Security Advisories).

Inclua, se possível:

- o que é afetado (função, arquivo ou ID do catálogo em `docs/FEATURES.md`);
- passos para reproduzir e o impacto esperado;
- um arquivo de exemplo **só com conteúdo de teste** (por exemplo, um `.ludraw`, `.svg`, `.csv` ou `.xlsx` que dispare o problema).

Por ser um projeto de estudo mantido por uma pessoa, não há prazo garantido. A meta é confirmar o recebimento em até **14 dias** e informar o plano de correção depois de reproduzir o problema. Pedimos que a divulgação pública espere a correção ou 90 dias, o que vier primeiro.

## O que o projeto cobre

O LuDraw tem dois modos de uso:

- **Modo Local:** roda inteiro no navegador; os boards ficam no armazenamento do dispositivo.
- **Modo Servidor:** API própria (Node.js, Fastify e PostgreSQL) com contas, permissões, edição ao vivo e envio de e-mail opcional.

São especialmente relevantes:

- **Autenticação e sessões** (login com senha, login da empresa por OIDC, convites, redefinição de senha) e **permissões** (perfis, links públicos, convidados).
- **Edição ao vivo** (WebSocket) e as regras de acesso aos boards e às imagens.
- **Importação de arquivos e colagem** (SVG, `.excalidraw`, CSV/TSV, `.xlsx`/`.ods`, HTML, backups `.ludraw`): execução de script, XML com entidades externas, arquivos compactados maliciosos (zip bomb), consumo excessivo de memória.
- **Exportação**: injeção de fórmulas em CSV e vazamento de conteúdo oculto em PNG/PDF/SVG/CSV.
- **Extensões**: o isolamento das extensões (Worker e painel com política de segurança de conteúdo). Foi verificado em navegadores baseados em Chromium; Firefox e Safari ainda não.
- **Board incorporado** (`?embed=1`) e links externos.

## O que já foi feito

O projeto passou por **auditorias internas** de origem do código, design e acessibilidade e de segurança, com os achados e as correções registrados. **Não houve auditoria externa independente.** Se você vai hospedar o LuDraw para uma equipe, recomendo colocá-lo atrás de HTTPS, manter o servidor e as dependências atualizados e fazer backup do banco e da pasta de imagens.

As proteções de formatos estão descritas em `docs/PROVENANCE.md` §5 e no código de cada importador.
