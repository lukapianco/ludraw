/**
 * LuDraw server — carteiro em memória (Chat 08.5), usado SÓ pelos testes: guarda as mensagens em vez
 * de enviá-las. `delayMs` simula um servidor SMTP lento; `fail` simula um servidor fora do ar.
 */
import type { Mailer, MailMessage } from './mailer';

export class MemoryMailer implements Mailer {
  readonly enabled = true;
  readonly sent: MailMessage[] = [];
  delayMs = 0;
  fail = false;

  async send(message: MailMessage): Promise<void> {
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    if (this.fail) throw Object.assign(new Error('smtp down'), { code: 'ECONNREFUSED', command: 'CONN' });
    this.sent.push(message);
  }

  /** Última mensagem para um endereço (ou undefined). */
  last(to: string): MailMessage | undefined {
    return [...this.sent].reverse().find((m) => m.to === to);
  }

  /** Primeiro link `…/#/<rota>/<token>` do texto da mensagem. */
  static linkOf(message: MailMessage): string | null {
    return /https?:\/\/\S+/.exec(message.text)?.[0] ?? null;
  }

  /** Token no fim do link da mensagem. */
  static tokenOf(message: MailMessage): string | null {
    const link = MemoryMailer.linkOf(message);
    return link ? (link.split('/').pop() ?? null) : null;
  }
}
