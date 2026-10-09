# Runbook — Deploy na VPS compartilhada

> Nada foi publicado. Este roteiro exige autorização específica antes de ser executado em produção.

## 0. Auditoria (somente leitura, antes do primeiro deploy)
```bash
ss -tlnp                      # portas em uso (80/443 pertencem ao proxy existente)
docker ps --format '{{.Names}}\t{{.Ports}}\t{{.Labels}}'
free -h; nproc; df -h          # RAM, CPU, disco
systemctl status lsws nginx 2>/dev/null | head   # CyberPanel/LiteSpeed ou Nginx?
ls /etc/letsencrypt/live 2>/dev/null             # certificados
crontab -l; ls /etc/cron.d                        # rotinas de backup existentes
```
Registre o resultado em `docs/DECISIONS.md` (P-04) e escolha a porta loopback livre (`REBANIA_HTTP_PORT`).

## 1. Preparar o diretório
```bash
sudo mkdir -p /opt/rebania && cd /opt/rebania
# copie infra/compose/docker-compose.yml e crie .env a partir de .env.production.example
chmod 600 .env
```

## 2. Imagens (build fora da VPS)
O CI constrói as imagens `rebania-{api,worker,migrate,web}`. Publique-as num registry privado com tag de versão e configure `REBANIA_REGISTRY`/`REBANIA_TAG`. Na VPS: `docker compose pull`.

## 3. Banco e migrações
```bash
docker compose up -d postgres
infra/scripts/backup.sh /var/backups/rebania          # SEMPRE antes de migrar (exceto o 1º deploy)
docker compose --profile migrate run --rm migrate
```

## 4. Subir a aplicação
```bash
docker compose up -d api worker web
docker compose ps                                       # api healthy, web healthy
curl -fsS http://127.0.0.1:${REBANIA_HTTP_PORT}/v1/health
```

## 5. Proxy existente → Rebania
Encaminhe o domínio para `http://127.0.0.1:${REBANIA_HTTP_PORT}` mantendo `Host` e `X-Forwarded-Proto https`. Exemplo (Nginx central):
```nginx
location / {
  proxy_pass http://127.0.0.1:8088;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto https;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  client_max_body_size 4m;
}
```
No CyberPanel/OpenLiteSpeed: crie um *External App* (proxy) apontando para `127.0.0.1:8088` e um *Context* `/` usando esse app. **Não** altere vhosts de outras aplicações.

## 6. Implantação de um cliente
```bash
docker compose exec api node dist/cli/bootstrap.js --org "Nome" --farm "Fazenda" --email dono@cliente.com --timezone America/Cuiaba
```
Entregue o link do convite pessoalmente (uso único, 7 dias).

Também é possível implantar pelo console da plataforma (Fazenda → Console). Para dar acesso ao console a alguém da equipe (a pessoa precisa já ter conta):
```bash
docker compose exec api node dist/cli/platform-admin.js --email pessoa@rebania.com.br      # --revoke para retirar
```

## 7. Smoke test
1. `curl -fsS http://127.0.0.1:${REBANIA_HTTP_PORT}/v1/health` responde `ok`.
2. Login web; numa fazenda de homologação: cadastro de animal, pesagem, aplicação sanitária, um animal no Modo Curral e encerramento.
3. `/fazenda/sincronizacao` sem pendências; Relatórios → Inventário abre e baixa CSV.
4. Assistente mostra "indisponível" enquanto `AI_PROVIDER=none` (esperado).
5. Com `METRICS_TOKEN`: `curl -H "Authorization: Bearer $METRICS_TOKEN" .../v1/metrics` retorna métricas.

## Rollback
1. `REBANIA_TAG=<anterior> docker compose up -d api worker web` (as imagens anteriores ficam no registro; não as remova antes de o novo deploy estabilizar).
2. Migrações são aditivas e compatíveis com a versão anterior. Se uma migração precisar ser desfeita, restaure o backup feito no passo 3 (ver `backup-restore.md`) após avaliar a perda de dados entre o backup e o rollback.

## Limites e medição
Os limites do compose são ponto de partida. Meça `docker stats` (RSS ocioso/pico), conexões (`select count(*) from pg_stat_activity`) e duração de jobs durante o piloto; ajuste deixando margem para o SO e as outras aplicações.

## Nunca
`docker compose down -v` · `docker system prune` global · reinstalar a VPS · publicar 80/443 pelo compose do Rebania.

## Limpeza segura de imagens antigas
```bash
docker images --filter label=project=rebania --format '{{.Repository}}:{{.Tag}} {{.ID}}'   # revise e remova só tags antigas do Rebania
```
