/**
 * LuDraw server — guarda do host SMTP vindo do painel (Chat 08.5 · B2).
 *
 * O painel deixa a administração digitar um host; sem esta guarda, o servidor viraria uma ponte para a rede
 * interna (SSRF): banco, painel do roteador, metadados da nuvem (169.254.169.254)…
 *
 *  - O nome é resolvido AQUI (`lookup`), e se QUALQUER endereço for interno o host é recusado.
 *  - A conexão usa o IP que acabou de ser conferido (`pinned`) — o nodemailer não resolve IP de novo
 *    (`shared.resolveHostname`: host que já é IP volta sem consulta) — e o nome original segue como
 *    `servername`, para o certificado TLS continuar sendo validado pelo nome. Assim, trocar o DNS entre a
 *    conferência e a conexão (DNS rebinding) não leva a lugar nenhum.
 *  - A conferência roda ao salvar E a cada envio.
 *  - `LUDRAW_SMTP_ALLOW_PRIVATE_HOST=true` (homelab) libera os endereços internos, só para o host do painel.
 *
 * Só `node:net` e `node:dns` (nada de dependência nova).
 */
import { promises as dnsPromises } from 'node:dns';
import { BlockList, isIP, isIPv4 } from 'node:net';

/** Resolve um nome para TODOS os endereços (injetável nos testes). */
export type HostLookup = (host: string) => Promise<string[]>;

export const defaultLookup: HostLookup = async (host) => {
  const all = await dnsPromises.lookup(host, { all: true, verbatim: true });
  return all.map((a) => a.address);
};

const internal = new BlockList();
// IPv4: "esta rede", privadas, CGNAT, loopback, link-local (inclui metadados), IETF, benchmark, multicast, reservado
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) internal.addSubnet(net, prefix, 'ipv4');
// IPv6: não especificado, loopback, NAT64 (alcança IPv4 interno), documentação, ULA (inclui fd00:ec2::254), link-local, multicast
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) internal.addSubnet(net, prefix, 'ipv6');

/** `::ffff:a.b.c.d` / `::ffff:7f00:1` → `a.b.c.d` (o IPv4 de dentro é o que vale). */
function mappedIPv4(ip: string): string | null {
  const lower = ip.toLowerCase();
  const dotted = /^(?:0{0,4}:){0,5}:?ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
  if (dotted && isIPv4(dotted[1])) return dotted[1];
  let hostname: string;
  try {
    hostname = new URL(`http://[${lower}]/`).hostname; // normaliza a escrita do IPv6
  } catch {
    return null;
  }
  const hex = /^\[::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})\]$/.exec(hostname);
  if (!hex) return null;
  const hi = parseInt(hex[1], 16);
  const lo = parseInt(hex[2], 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

/** Endereço interno (loopback, privado, link-local, metadados, multicast…)? Endereço inválido conta como interno. */
export function isInternalAddress(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const family = isIP(bare);
  if (family === 4) return internal.check(bare, 'ipv4');
  if (family === 6) {
    const v4 = mappedIPv4(bare);
    if (v4) return internal.check(v4, 'ipv4');
    return internal.check(bare, 'ipv6');
  }
  return true;
}

/** Nome de host aceitável (letras, dígitos, hífen e ponto) ou IP literal. */
export function isValidSmtpHost(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, '');
  if (isIP(bare)) return true;
  if (host.length > 253) return false;
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(host);
}

export type HostCheck = { ok: true; addresses: string[] } | { ok: false; reason: 'invalid' | 'private' | 'unresolved' };

/**
 * Confere o host do painel: resolve, recusa se qualquer endereço for interno (a menos que `allowPrivate`) e
 * devolve os endereços conferidos — a conexão usa um DELES, nunca o nome.
 */
export async function checkSmtpHost(host: string, opts: { lookup: HostLookup; allowPrivate: boolean }): Promise<HostCheck> {
  const bare = host.trim().replace(/^\[|\]$/g, '');
  if (!isValidSmtpHost(bare)) return { ok: false, reason: 'invalid' };
  let addresses: string[];
  if (isIP(bare)) addresses = [bare];
  else {
    try {
      addresses = await opts.lookup(bare);
    } catch {
      return { ok: false, reason: 'unresolved' };
    }
  }
  if (!addresses.length) return { ok: false, reason: 'unresolved' };
  if (!opts.allowPrivate && addresses.some(isInternalAddress)) return { ok: false, reason: 'private' };
  return { ok: true, addresses };
}
