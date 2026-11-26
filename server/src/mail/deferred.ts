/**
 * LuDraw server — trabalho feito DEPOIS da resposta (Chat 08.5).
 *
 * As rotas públicas que recebem um e-mail (esqueci a senha…) respondem sempre do mesmo jeito e no mesmo
 * tempo, exista ou não a conta: a consulta ao banco, a criação do token e o envio rodam aqui, fora do
 * caminho da resposta. Um erro nunca volta para quem pediu; vai só ao log, sem dados da pessoa.
 */
export class Deferred {
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly onError: (err: unknown) => void) {}

  run(job: () => Promise<void>): void {
    const task = new Promise<void>((resolve) => {
      setImmediate(() => {
        Promise.resolve()
          .then(job)
          .catch((err) => this.onError(err))
          .finally(resolve);
      });
    });
    this.pending.add(task);
    void task.finally(() => this.pending.delete(task));
  }

  /** Espera tudo o que está agendado (testes e desligamento do servidor). */
  async flush(): Promise<void> {
    while (this.pending.size) await Promise.all([...this.pending]);
  }
}
