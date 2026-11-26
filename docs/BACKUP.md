# Backup e restauração (Docker)

Como copiar e recuperar uma instalação do LuDraw feita com o [`docker-compose.yml`](DOCKER.md). Os comandos rodam na pasta do `docker-compose.yml`, com Node.js 22+ na máquina.

## O que precisa de backup

| Onde | O que tem | No backup? |
|---|---|---|
| volume `db-data` (PostgreSQL) | boards, contas (senhas só como hash argon2), organização, convites, histórico, auditoria, metadados das imagens | **sim** (`db.dump`) |
| volume `assets` | os arquivos das imagens dos boards | **sim** (`assets.tar`) |
| `deploy/secrets/` | senhas dos papéis do banco e a chave das sessões | não (veja abaixo) |
| `deploy/ludraw.env` | suas configurações | guarde junto, se quiser |

Os segredos **não são necessários para restaurar**:
- os papéis do banco são criados de novo, com as senhas novas, quando o volume do banco nasce vazio;
- as senhas das pessoas estão no próprio banco;
- uma chave de sessão nova só faz todo mundo entrar de novo.

## Fazer um backup

```sh
node scripts/docker-backup.mjs backup                  # → backups/ludraw-AAAAMMDD-HHMMSS/
node scripts/docker-backup.mjs backup --out /mnt/nas/ludraw-hoje
```

O script:
1. para o app por alguns segundos, para que o banco e as imagens fiquem do mesmo instante;
2. gera `db.dump` com o `pg_dump` de dentro do contêiner do banco, que entra pelo socket local, sem senha em argumento;
3. gera `assets.tar` com o `tar` da própria imagem do LuDraw;
4. liga o app de novo e espera o *healthcheck*;
5. grava `manifest.json`, com a data, a versão da imagem e o SHA-256 e o tamanho de cada arquivo.

`--online` copia sem parar o app. As imagens nunca são alteradas, mas uma imagem enviada durante a cópia pode ficar de fora.

> A pasta do backup contém **todos os dados** da organização. Guarde-a cifrada, fora do servidor, e teste a restauração de vez em quando. Os arquivos são criados com permissão `0600`.

Para agendar, use o agendador do sistema. Exemplo com `cron`, todo dia às 3h:

```
0 3 * * *  cd /srv/ludraw && node scripts/docker-backup.mjs backup --out /srv/backups/ludraw-$(date +\%F) >> /var/log/ludraw-backup.log 2>&1
```

## Restaurar

```sh
node scripts/docker-backup.mjs restore backups/ludraw-20261122-030000 --yes
```

A restauração **apaga o conteúdo atual do banco** e põe o do backup no lugar. Sem `--yes`, ela só confere os arquivos e não mexe em nada. A ordem:
1. confere o SHA-256 e o tamanho dos arquivos com o `manifest.json`; se algo não bate, para antes de qualquer mudança;
2. sobe o banco (num volume vazio, o PostgreSQL cria os papéis);
3. para o app;
4. restaura o banco (`pg_restore --clean`) e as imagens;
5. sobe a migração e o app. Um backup de versão anterior é atualizado pela migração antes do app subir.

### Recuperar numa máquina nova

```sh
git clone … ludraw && cd ludraw                    # a mesma versão do backup, ou mais nova
node scripts/docker-secrets.mjs                        # segredos novos
docker compose build
node scripts/docker-backup.mjs restore /caminho/do/backup --yes
```

Todos entram com as senhas de sempre. As sessões abertas antes caem, porque a chave das sessões é nova.

## Testado

O `npm run test:docker` faz este caminho inteiro a cada execução:
1. backup com o app parado;
2. a restauração sem `--yes` é recusada;
3. um backup com um byte a mais é recusado;
4. `docker compose down -v` e segredos apagados e gerados de novo;
5. restauração.

No fim, a mesma senha entra, o board volta com a última edição feita ao vivo, a imagem tem o mesmo SHA-256 e o tempo real funciona.
