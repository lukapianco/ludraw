/**
 * LuDraw server — endereço das requisições no log, sem tokens (Chat 08.7 · R5 · achado S-06).
 *
 * O `LOG_REDACT` do pino mascara campos (cabeçalhos, corpo), mas a linha "incoming request" grava `req.url`, e várias
 * rotas levam o token NO CAMINHO (`/invitations/:token`, `/public/links/:token`, `/join/:token`, `/signup/:token`,
 * `/auth/password/reset/:token`) ou na QUERY (callback do SSO: `code`, `state`…). Quem lê o log (operador, agregador,
 * backup do log) obteria tokens ainda válidos. Aqui o segmento do token vira `***` e os parâmetros sensíveis também;
 * o resto do endereço continua no log (útil para diagnóstico).
 */

/** Prefixos de rota cujo PRÓXIMO segmento é um token (ou id que não precisa ir ao log). */
const TOKEN_SEGMENT = /(\/(?:invitations|public\/links|join|signup|auth\/password\/reset)\/)[^/?#]+/g;

/** Parâmetros de query que carregam segredo (SSO e afins). */
const SENSITIVE_PARAMS = new Set(['code', 'state', 'token', 'share', 'id_token', 'access_token', 'refresh_token', 'session_state', 'iss', 'password']);

export function redactUrl(url: string | undefined): string | undefined {
  if (typeof url !== 'string') return url;
  const q = url.indexOf('?');
  const path = (q < 0 ? url : url.slice(0, q)).replace(TOKEN_SEGMENT, '$1***');
  if (q < 0) return path;
  const query = url
    .slice(q + 1)
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      const name = eq < 0 ? pair : pair.slice(0, eq);
      let key = name;
      try {
        key = decodeURIComponent(name);
      } catch {
        /* nome com escape inválido: fica como veio */
      }
      return SENSITIVE_PARAMS.has(key.toLowerCase()) ? `${name}=***` : pair;
    })
    .join('&');
  return `${path}?${query}`;
}
