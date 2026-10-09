# ADR-002 — Isolamento de tenant
**Estado:** Adotado · 09/10/2026

**Decisão:**
1. Toda tabela de negócio tem `organization_id` e, quando aplicável, `farm_id`.
2. FKs **compostas** garantem consistência no banco: `(organization_id, farm_id) → farms`, `(farm_id, group_id) → groups`, `(farm_id, animal_id) → animals` (com `ON UPDATE CASCADE` para transferência entre fazendas), `(organization_id, dam_id) → animals` etc. Estão declaradas no `schema.prisma` (o Prisma mantém), e não em SQL solto (o Prisma as removeria).
3. Índices parciais, CHECKs e triggers ficam no SQL das migrations (o Prisma não os remove; o CI confere `migrate diff`).
4. O tenant **nunca** vem do corpo da requisição: as rotas são `/v1/farms/:farmId/...` e `requireFarm(user, farm, permission)` valida o vínculo (`allFarms` ou fazenda listada) e o papel. Fazenda de outra organização responde **404** (não revela existência); falta de permissão responde 403.
5. Recibos idempotentes são conferidos contra organização, fazenda e autor: um `mutationId` de outro tenant é rejeitado sem vazar dados.

**Avaliado e adiado:** Row-Level Security do PostgreSQL como segunda barreira. Fica para quando houver acesso de suporte e relatórios cruzados (G6).
**Teste:** `apps/api/test/tenant-isolation.test.ts`.
