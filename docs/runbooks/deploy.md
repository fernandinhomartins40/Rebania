# Runbook — Deploy na VPS (72.60.10.112 · www.rebania.com.br)

> O pipeline está configurado, mas só publica quando houver push na `main` com o runner da VPS 112 registrado. Nada foi publicado ainda.

## Visão geral (VPS 72.60.10.112 · www.rebania.com.br)
- **Build:** `.github/workflows/deploy.yml` roda o CI completo e, se passar, constrói `rebania-{api,worker,migrate,web}` em runners do GitHub e publica no GHCR (`ghcr.io/fernandinhomartins40/rebania-*:<sha>` e `:latest`). A VPS nunca compila.
- **Deploy:** só em push na `main` (ou "Run workflow"), no runner self-hosted **da VPS 112** com rótulo `rebania`. Ele chama `infra/scripts/deploy.sh`, que faz pull → backup → migrações → up → healthcheck. Se o healthcheck falhar, volta sozinho para a release anterior. Por fim remove apenas imagens antigas do Rebania, mantendo a atual e a anterior.
- **Rollback manual:** Actions → *Deploy (GHCR -> VPS 112)* → *Run workflow* com `release=<sha anterior>`. O build é pulado e a imagem já publicada é reimplantada.
- **Proteção:** o job usa o environment `production`. Em Settings → Environments → production, exija aprovação se quiser um "ok" antes de cada deploy.

## 0. Auditoria (somente leitura, antes do primeiro deploy)
```bash
ss -tlnp                      # portas em uso (80/443 pertencem ao Nginx do host); confirme que 8088 está livre
docker ps --format '{{.Names}}\t{{.Ports}}\t{{.Labels}}'
free -h; nproc; df -h          # RAM, CPU, disco
systemctl status lsws nginx 2>/dev/null | head   # CyberPanel/LiteSpeed ou Nginx?
ls /etc/letsencrypt/live 2>/dev/null             # certificados
crontab -l; ls /etc/cron.d                        # rotinas de backup existentes
docker compose version || docker-compose version  # o deploy aceita os dois
```
Registre o resultado em `docs/DECISIONS.md` (P-04). Se 8088 estiver ocupada, troque `REBANIA_HTTP_PORT` no `.env` e o `proxy_pass` do vhost.

## 1. DNS
No registro do domínio, crie registros `A` para `rebania.com.br` e `www.rebania.com.br` apontando para `72.60.10.112`.

## 2. Preparação única da VPS (como root)
```bash
git clone https://github.com/fernandinhomartins40/Rebania.git /root/rebania-setup
/root/rebania-setup/infra/scripts/setup-host.sh voce@rebania.com.br
```
Esse script:
- cria `/opt/rebania/infra/compose/.env` com permissão 600 e senha do banco gerada, sem sobrescrever um `.env` existente;
- instala o vhost `infra/nginx/host/rebania.com.br.conf` (apex → www, proxy para `127.0.0.1:8088`) sem tocar nos vhosts de outras aplicações, e o desfaz se `nginx -t` falhar;
- emite o certificado com `certbot --nginx --redirect`.

Revise o `.env` (por exemplo `METRICS_TOKEN`).

## 3. Runner self-hosted na VPS 112
1. No GitHub: repositório → Settings → Actions → Runners → *New self-hosted runner* (Linux x64). Siga os comandos mostrados, num usuário sem root dedicado (ex.: `github-runner`).
2. No `./config.sh`, informe o rótulo extra **`rebania`**. É ele que garante que o deploy rode na 112 e não na 108.
3. Instale como serviço: `sudo ./svc.sh install github-runner && sudo ./svc.sh start`.
4. Dê ao usuário do runner acesso ao Docker e aos diretórios:
   ```bash
   usermod -aG docker github-runner
   chown -R github-runner: /opt/rebania /var/backups/rebania
   ```
5. O token do GHCR é o `GITHUB_TOKEN` da execução. Não é preciso criar nenhum secret.

## 4. Primeiro deploy
Faça merge na `main` (ou rode o workflow manualmente) e acompanhe em Actions. No primeiro deploy não há backup, porque o banco está vazio. Nos seguintes, o dump vai para `/var/backups/rebania` antes de migrar; envie esse diretório para fora da VPS (`backup-restore.md`).

## 5. Deploy manual (emergência, sem GitHub Actions)
```bash
cd /opt/rebania
echo "$PAT" | docker login ghcr.io -u <usuario> --password-stdin   # PAT com read:packages
RELEASE=<sha publicado> infra/scripts/deploy.sh
```
Num proxy que não seja Nginx (CyberPanel/OpenLiteSpeed), crie um *External App* apontando para `127.0.0.1:8088` e um *Context* `/` usando esse app, mantendo `Host` e `X-Forwarded-Proto https`.

## 6. Implantação de um cliente
Os comandos `docker compose` abaixo rodam em `/opt/rebania/infra/compose`, onde ficam o compose e o `.env`.
```bash
cd /opt/rebania/infra/compose
docker compose exec api node dist/cli/bootstrap.js --org "Nome" --farm "Fazenda" --email dono@cliente.com --timezone America/Cuiaba
```
Entregue o link do convite pessoalmente (uso único, 7 dias).

Também é possível implantar pelo console da plataforma (Fazenda → Console). Para dar acesso ao console a alguém da equipe (a pessoa precisa já ter conta):
```bash
docker compose exec api node dist/cli/platform-admin.js --email pessoa@rebania.com.br      # --revoke para retirar
```

## 7. Smoke test
1. `curl -fsS https://www.rebania.com.br/v1/health` responde `ok` (e `http://rebania.com.br` redireciona para `https://www.rebania.com.br`).
2. Login web; numa fazenda de homologação: cadastro de animal, pesagem, aplicação sanitária, um animal no Modo Curral e encerramento.
3. `/fazenda/sincronizacao` sem pendências; Relatórios → Inventário abre e baixa CSV.
4. Assistente mostra "indisponível" enquanto `AI_PROVIDER=none` (esperado).
5. Com `METRICS_TOKEN`: `curl -H "Authorization: Bearer $METRICS_TOKEN" .../v1/metrics` retorna métricas.

## Rollback
1. Automático se o healthcheck falhar. Manual: *Run workflow* com `release=<sha anterior>`, ou na VPS `RELEASE=<sha anterior> infra/scripts/deploy.sh`. A imagem anterior fica em disco e todas ficam no GHCR.
2. Migrações são aditivas e compatíveis com a versão anterior. Se uma migração precisar ser desfeita, restaure o backup feito no passo 3 (ver `backup-restore.md`) após avaliar a perda de dados entre o backup e o rollback.

## Limites e medição
Os limites do compose são ponto de partida. Meça `docker stats` (RSS ocioso/pico), conexões (`select count(*) from pg_stat_activity`) e duração de jobs durante o piloto; ajuste deixando margem para o SO e as outras aplicações.

## Nunca
`docker compose down -v` · `docker system prune` global · reinstalar a VPS · publicar 80/443 pelo compose do Rebania.

## Limpeza segura de imagens antigas
```bash
docker images --filter label=project=rebania --format '{{.Repository}}:{{.Tag}} {{.ID}}'   # revise e remova só tags antigas do Rebania
```
