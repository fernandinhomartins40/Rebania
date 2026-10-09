# ADR-009 — Deploy em VPS compartilhada
**Estado:** Adotado · 09/10/2026

- Imagens multi-stage, usuário sem root, `init`, healthchecks e labels `project=rebania`. Build **fora** da VPS (CI) e pull por tag/digest.
- O Nginx interno do Rebania publica **somente** `127.0.0.1:${REBANIA_HTTP_PORT}`. O proxy/ingress já existente (CyberPanel/LiteSpeed/Nginx) encaminha o domínio e termina o TLS. Nunca usar 80/443 nem substituir o proxy existente.
- API, worker e PostgreSQL ficam apenas na rede interna; volumes nomeados e separados.
- Proibido: `docker compose down -v`, `docker system prune` global, reinstalar o servidor.
- Migrações rodam como job (`--profile migrate`) após backup.
- Detalhes: `docs/runbooks/deploy.md` e `docs/runbooks/backup-restore.md`.
