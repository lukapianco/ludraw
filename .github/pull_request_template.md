## O que muda

<!-- Descreva a mudança e o motivo. Ligue a issue: "Resolve #123". -->
<!-- É uma tradução? Use o modelo próprio: acrescente ?template=translation.md ao endereço da comparação. -->

## Como testar

<!-- Passos para quem revisa conferir. -->

## Checklist

- [ ] `npm run typecheck` e `npm run build` passam
- [ ] `npm run test:permissions` passa (se mexeu em permissões, acrescentei regras)
- [ ] `npm run audit:legal` sem bloqueantes
- [ ] Função nova ou alterada registrada em `docs/features.json` e `npm run docs:features` executado (`npm run audit:features` passa)
- [ ] Textos de interface novos passam por `t()` e estão em `pt-BR` **e** `en` (`npm run audit:i18n` passa)
- [ ] Boards salvos antes desta mudança continuam abrindo
- [ ] UI nova usa os tokens do Design System e tem exemplo em `#/design-system`
- [ ] Entrada em `CHANGELOG.md` → `[Não lançado]`

## Declaração de origem (sala limpa)

<!-- Obrigatória. Veja CONTRIBUTING.md → "Regras de origem do código". -->

- [ ] Escrevi esta contribuição a partir de requisitos, padrões abertos e conhecimento geral — **sem copiar ou parafrasear código, textos de interface, ícones ou layout de produtos de terceiros**.
- [ ] Não usei APIs, SDKs ou formatos proprietários de terceiros.

```
DECLARAÇÃO DE SALA LIMPA
- Dependências novas: [nome@versão — licença] ou "nenhuma"
- Assets novos: [arquivo — origem/licença] ou "nenhum"
- Formatos importados/exportados novos: [lista] ou "nenhum"
- Conteúdo de terceiros usado: "nenhum" (ou descreva)
- docs/PROVENANCE.md atualizado: sim/não
```
