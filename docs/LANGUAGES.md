# Idiomas do LuDraw

> Arquivo gerado por `npm run docs:languages` (`scripts/audit-i18n.mjs --write`). Não edite à mão.
> Como traduzir: [TRANSLATING.md](TRANSLATING.md).

A interface tem **3912 mensagens** (chaves lógicas; formas de plural contam como uma). O
português do Brasil é a fonte; chaves que faltam num idioma aparecem no idioma de fallback
(`fallback` do `_meta.json`) e, por fim, em pt-BR.

| Código | Idioma | Nome em inglês | Situação | Completude | Mensagens | Iguais à fonte¹ | Tradutores |
|---|---|---|---|---|---|---|---|
| `pt-BR` | Português (Brasil) | Portuguese (Brazil) | fonte | 100,0 % | 3912 / 3912 | — | Equipe LuDraw |
| `en` | English | English | oficial | 100,0 % | 3912 / 3912 | 121 | Equipe LuDraw |

¹ Mensagens idênticas ao pt-BR — normal para siglas, formatos e termos do glossário (Kanban, PDF, Frame);
a lista sai com `npm run audit:i18n -- --verbose`.

Teste qualquer idioma com `?lang=<código>` na URL (ex.: `?lang=en`). O pseudo-idioma `?lang=qps`
mostra o inglês acentuado e mais longo, para achar texto fixo e estouro de layout.
