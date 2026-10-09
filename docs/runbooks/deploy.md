# Runbook — Deploy na VPS (72.60.10.112 · www.rebania.com.br)

> O pipeline publica a cada push na `main`. O único secret é `VPS_PASSWORD`, a senha de root da VPS 72.60.10.112.

## Visão geral (VPS 72.60.10.112 · www.rebania.com.br)
- **Build:** `.github/workflows/deploy.yml` roda o CI completo e, se passar, constrói `rebania-{api,worker,migrate,web}` em runners do GitHub e publica no GHCR (`ghcr.io/fernandinhomartins40/rebania-*:<sha>` e `:latest`). A VPS nunca compila.
- **Deploy:** só em push na `main` (ou "Run workflow"). Um runner do GitHub entra em `root@72.60.10.112` por SSH com a senha do secret **`VPS_PASSWORD`**, que é o único secret. Ele envia `infra/` para `/opt/rebania`, preservando o `.env`. Depois roda `setup-host.sh`, que é idempotente: instala Docker se faltar, cria o `.env` uma única vez, instala o vhost e o certificado. Em seguida roda `deploy.sh`, que faz pull → backup → migrações → up → healthcheck. Se o healthcheck falhar, volta sozinho para a release anterior. Por fim remove apenas imagens antigas do Rebania, mantendo a atual e a anterior.
- **GHCR:** o pull na VPS usa o `GITHUB_TOKEN` automático da execução, que o GitHub gera e expira sozinho. Não é um secret a configurar. A VPS faz logout no fim.
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

## 2. Secret
No GitHub: repositório → Settings → Secrets and variables → Actions → *New repository secret*: nome `VPS_PASSWORD`, valor = senha de root da VPS 72.60.10.112. Nenhum outro secret é necessário.

## 3. Primeiro deploy
Faça push/merge na `main` (ou *Run workflow*) e acompanhe em Actions. O primeiro deploy:
- prepara a VPS (Docker, `/opt/rebania`, `.env` com senha do banco gerada na própria VPS, vhost);
- tenta emitir o certificado. Se o DNS ainda não apontar para a 112, o certbot avisa e o próximo deploy tenta de novo.

Não há backup no primeiro deploy, porque o banco está vazio. Nos seguintes, o dump vai para `/var/backups/rebania` antes de migrar; envie esse diretório para fora da VPS (`backup-restore.md`).

Para ligar opcionais (DeepSeek, métricas), edite `/opt/rebania/infra/compose/.env` na VPS. O deploy nunca sobrescreve esse arquivo.

## 4. Proxy que não seja Nginx
Se a porta 80 da VPS já pertence a outro servidor (CyberPanel/OpenLiteSpeed), o `setup-host.sh` não mexe nele e apenas avisa. Nesse caso, crie um *External App* apontando para `127.0.0.1:8088` e um *Context* `/` usando esse app, mantendo `Host` e `X-Forwarded-Proto https`.

## 5. Deploy manual (emergência, sem GitHub Actions)
```bash
cd /opt/rebania
echo "$PAT" | docker login ghcr.io -u <usuario> --password-stdin   # PAT com read:packages
RELEASE=<sha publicado> infra/scripts/deploy.sh
```

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

## 6.1 Organização de demonstração (testes)
Cria "Rebania Demonstração (dados fictícios)" com 12 animais de exemplo e um usuário por perfil, todos com a mesma senha: `dono@`, `gerente@`, `campo@`, `veterinario@` e `financeiro@demo.rebania.com.br`. Reexecutar redefine a senha e não duplica dados.

Pelo GitHub (recomendado):
1. Crie o secret `DEMO_PASSWORD` (mín. 10 caracteres) em *Settings → Secrets and variables → Actions*. O repositório é público: use uma senha exclusiva para a demo.
2. Em *Actions → Seed de demonstração (VPS 112) → Run workflow*. Marque "console da plataforma" só se quiser que `dono@demo.rebania.com.br` veja todas as organizações.

Na VPS (a senha vai por variável de ambiente, fora do histórico do shell):
```bash
cd /opt/rebania/infra/compose
read -rs SEED_DEMO_PASSWORD && export SEED_DEMO_PASSWORD
docker compose exec -T -e SEED_DEMO_PASSWORD api node dist/cli/seed-demo.js   # --platform-admin opcional
```
Sem senha informada, o comando gera uma e a mostra só no terminal.

## 7. Smoke test
1. `curl -fsS https://www.rebania.com.br/v1/health` responde `ok` (e `http://rebania.com.br` redireciona para `https://www.rebania.com.br`).
2. Login web; numa fazenda de homologação: cadastro de animal, pesagem, aplicação sanitária, um animal no Modo Curral e encerramento.
3. `/fazenda/sincronizacao` sem pendências; Relatórios → Inventário abre e baixa CSV.
4. Assistente: com `AI_PROVIDER=none` mostra "indisponível" (esperado). Para ligar o DeepSeek:
   - no `.env`, defina `AI_PROVIDER=deepseek` e `DEEPSEEK_API_KEY=<chave>`;
   - rode `docker compose up -d api`;
   - publique a tabela de créditos no console;
   - faça uma pergunta de teste numa fazenda de homologação.
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
