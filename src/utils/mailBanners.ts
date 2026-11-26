/**
 * Chat 08.5 · B2 — faixas da marca dos e-mails (desenho próprio, em SVG).
 *
 * As faixas são desenhadas aqui em SVG (1200×336 = 600×168 em dobro, para telas retina) e:
 *  - viram PNG uma única vez por `npm run mail:assets` (Chrome sem janela, sem dependência nova), porque
 *    Gmail e Outlook não mostram SVG em e-mail; o PNG vai EMBUTIDO na mensagem (anexo inline, CID);
 *  - aparecem direto (SVG) nas prévias do `#/design-system`.
 *
 * Elementos: fundo verde-floresta com a grade de pontos do canvas, a "trilha" do logo atravessando a faixa,
 * o símbolo + "ludraw" à esquerda e, à direita, uma ilustração por tipo de e-mail (escolha do usuário no
 * Chat 08.5 · B2, no lugar de uma faixa única). Nenhum texto traduzível dentro da imagem — só a marca.
 *
 * Arquivo puro (sem DOM, sem Node): também roda em `node --experimental-strip-types`.
 */

export type MailBannerArt = 'invite' | 'key' | 'building' | 'envelope' | 'plane' | 'door' | 'compass';

export const MAIL_BANNER_ARTS: readonly MailBannerArt[] = ['invite', 'key', 'building', 'envelope', 'plane', 'door', 'compass'];

/** Tamanho da faixa no e-mail (CSS px); o desenho tem o dobro. */
export const MAIL_BANNER_SIZE = { width: 600, height: 168 } as const;

const FOREST = '#194B32';
const PISTACHIO = '#D0E4AE';
const LEAF = '#9FD08A';
const PAPER = '#F3F8E9';

/** Ilustração do lado direito (caixa ~320×300, já posicionada). */
const ARTS: Record<MailBannerArt, string> = {
  // convite: dois post-its e um cursor chegando com a etiqueta de quem entra
  invite: `<g transform="translate(860 30)">
    <g transform="rotate(9 170 130)"><rect x="96" y="34" width="168" height="168" rx="16" fill="${LEAF}"/></g>
    <g transform="rotate(-6 120 150)">
      <rect x="22" y="62" width="184" height="184" rx="16" fill="${PISTACHIO}"/>
      <rect x="50" y="104" width="112" height="13" rx="6.5" fill="${FOREST}" opacity=".55"/>
      <rect x="50" y="134" width="130" height="13" rx="6.5" fill="${FOREST}" opacity=".32"/>
      <rect x="50" y="164" width="86" height="13" rx="6.5" fill="${FOREST}" opacity=".32"/>
    </g>
    <path d="M206 168 L206 252 L226 234 L242 270 L260 262 L244 226 L272 224 Z" fill="${PAPER}" stroke="${FOREST}" stroke-width="6" stroke-linejoin="round"/>
    <rect x="262" y="240" width="62" height="28" rx="14" fill="${LEAF}"/>
    <circle cx="281" cy="254" r="5" fill="${FOREST}" opacity=".6"/><rect x="292" y="250" width="22" height="8" rx="4" fill="${FOREST}" opacity=".45"/>
  </g>`,
  // redefinir senha: chave inclinada sobre um círculo de luz
  key: `<g transform="translate(860 24)">
    <circle cx="170" cy="144" r="128" fill="${PISTACHIO}" opacity=".10"/>
    <g transform="rotate(-30 170 144)">
      <circle cx="96" cy="144" r="52" fill="none" stroke="${PISTACHIO}" stroke-width="24"/>
      <path d="M150 144 H290" stroke="${PISTACHIO}" stroke-width="24" stroke-linecap="round"/>
      <path d="M248 144 V184 M282 144 V174" stroke="${PISTACHIO}" stroke-width="22" stroke-linecap="round"/>
    </g>
    <path d="M296 50 v28 M282 64 h28" stroke="${LEAF}" stroke-width="8" stroke-linecap="round"/>
    <path d="M46 238 v20 M36 248 h20" stroke="${LEAF}" stroke-width="7" stroke-linecap="round"/>
  </g>`,
  // conta pelo login da empresa: prédio com janelas acesas e uma ala menor
  building: `<g transform="translate(880 28)">
    <rect x="200" y="122" width="96" height="156" rx="12" fill="${LEAF}"/>
    <rect x="56" y="40" width="156" height="238" rx="14" fill="${PISTACHIO}"/>
    ${[0, 1, 2, 3, 4]
      .map((r) => [0, 1, 2].map((c) => `<rect x="${82 + c * 40}" y="${68 + r * 36}" width="24" height="20" rx="4" fill="${FOREST}" opacity="${(r + c) % 3 === 0 ? '.75' : '.38'}"/>`).join(''))
      .join('')}
    <rect x="114" y="236" width="40" height="42" rx="6" fill="${FOREST}" opacity=".7"/>
    <rect x="222" y="150" width="20" height="18" rx="4" fill="${FOREST}" opacity=".4"/><rect x="254" y="150" width="20" height="18" rx="4" fill="${FOREST}" opacity=".4"/>
    <rect x="222" y="184" width="20" height="18" rx="4" fill="${FOREST}" opacity=".4"/><rect x="254" y="184" width="20" height="18" rx="4" fill="${FOREST}" opacity=".4"/>
  </g>`,
  // confirmar e-mail: envelope com selo de confirmação
  envelope: `<g transform="translate(856 38)">
    <rect x="22" y="44" width="244" height="170" rx="20" fill="${PISTACHIO}"/>
    <path d="M38 64 L144 146 L250 64" fill="none" stroke="${FOREST}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>
    <circle cx="262" cy="208" r="50" fill="${LEAF}" stroke="${FOREST}" stroke-width="9"/>
    <path d="M238 208 l17 17 l31 -33" fill="none" stroke="${FOREST}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`,
  // teste de envio: aviãozinho de papel com trilha pontilhada
  plane: `<g transform="translate(846 34)">
    <path d="M14 250 C 70 268, 118 196, 82 170 S 52 108, 158 122" fill="none" stroke="${PISTACHIO}" stroke-width="8" stroke-dasharray="2 20" stroke-linecap="round" opacity=".75"/>
    <path d="M160 124 L330 36 L270 230 L222 176 Z" fill="${PISTACHIO}"/>
    <path d="M222 176 L234 228 L270 230 Z" fill="${LEAF}"/>
    <path d="M160 124 L222 176 L330 36" fill="none" stroke="${FOREST}" stroke-width="7" stroke-linejoin="round" opacity=".45"/>
  </g>`,
  // link geral / pedido de acesso: porta entreaberta com luz saindo
  door: `<g transform="translate(880 24)">
    <path d="M178 42 L318 76 L318 262 L178 282 Z" fill="${PISTACHIO}" opacity=".16"/>
    <rect x="52" y="34" width="132" height="254" rx="12" fill="#0F3020" stroke="${PISTACHIO}" stroke-width="12"/>
    <path d="M58 40 L134 60 L134 270 L58 282 Z" fill="${PISTACHIO}"/>
    <circle cx="118" cy="164" r="9" fill="${FOREST}"/>
    <circle cx="232" cy="120" r="6" fill="${LEAF}"/><circle cx="270" cy="176" r="5" fill="${LEAF}" opacity=".8"/><circle cx="240" cy="226" r="7" fill="${LEAF}" opacity=".7"/>
  </g>`,
  // "já tem conta": bússola (o caminho certo é a entrada)
  compass: `<g transform="translate(880 30)">
    <circle cx="150" cy="140" r="110" fill="${PISTACHIO}" opacity=".10"/>
    <circle cx="150" cy="140" r="106" fill="none" stroke="${PISTACHIO}" stroke-width="16"/>
    <path d="M150 46 v22 M150 212 v22 M56 140 h22 M222 140 h22" stroke="${PISTACHIO}" stroke-width="10" stroke-linecap="round"/>
    <g transform="rotate(38 150 140)">
      <path d="M150 64 L176 140 L124 140 Z" fill="${PISTACHIO}"/>
      <path d="M150 216 L176 140 L124 140 Z" fill="${LEAF}" opacity=".7"/>
    </g>
    <circle cx="150" cy="140" r="13" fill="${FOREST}" stroke="${PISTACHIO}" stroke-width="6"/>
  </g>`,
};

/** Faixa completa em SVG (1200×336). */
export function mailBannerSvg(art: MailBannerArt): string {
  const mark = `<g transform="translate(72 116)">
    <rect width="104" height="104" rx="26" fill="${PISTACHIO}"/>
    <g transform="scale(1.625)"><path d="M15 42c6-14 12-20 18-18s4 10 10 10c4 0 6-4 7-8" fill="none" stroke="${FOREST}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="48" cy="18" r="5" fill="${FOREST}"/></g>
  </g>`;
  const word = `<text x="200" y="190" font-family="Figtree, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif" font-weight="800" font-size="58" letter-spacing="-1.6" fill="${PAPER}">Lu<tspan fill="${PISTACHIO}">Draw</tspan></text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="336" viewBox="0 0 1200 336">
  <defs>
    <pattern id="oddots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="14" cy="14" r="2.6" fill="#3E6E4F"/></pattern>
    <pattern id="oddotsfaint" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="14" cy="14" r="2.6" fill="#2A5A3D"/></pattern>
  </defs>
  <!-- cores chapadas (sem degradê nem transparência no fundo): o PNG fica leve -->
  <rect width="1200" height="336" fill="${FOREST}"/>
  <rect width="560" height="336" fill="url(#oddotsfaint)"/>
  <rect x="560" width="640" height="336" fill="url(#oddots)"/>
  <path d="M-40 318 C 150 342, 300 262, 440 250 S 660 120, 820 176" fill="none" stroke="${PISTACHIO}" stroke-width="14" stroke-linecap="round" opacity=".18"/>
  <circle cx="820" cy="176" r="10" fill="${PISTACHIO}" opacity=".3"/>
  ${mark}
  ${word}
  ${ARTS[art]}
</svg>`;
}

/** Tipo de e-mail → ilustração. */
export const MAIL_KIND_ART = {
  resetPassword: 'key',
  resetPasswordSso: 'building',
  verifyEmail: 'envelope',
  testMail: 'plane',
  invitation: 'invite',
  joinLink: 'door',
  joinExisting: 'compass',
  accessConfirm: 'door',
  accessExisting: 'compass',
  domainSignup: 'door',
} as const satisfies Record<string, MailBannerArt>;

/** Ilustração da faixa de um tipo de e-mail. */
export function mailBannerArtFor(kind: keyof typeof MAIL_KIND_ART): MailBannerArt {
  return MAIL_KIND_ART[kind];
}

/** Texto que identifica o desenho atual (todas as faixas, na ordem). O gerador grava o SHA-256 disto junto dos PNGs. */
export function mailBannerSource(): string {
  return MAIL_BANNER_ARTS.map((art) => `${art}:${mailBannerSvg(art)}`).join('\n');
}

/** `data:` URL do SVG (prévias no navegador). */
export function mailBannerDataUrl(art: MailBannerArt): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(mailBannerSvg(art))}`;
}
