import { randomUUID } from "node:crypto";
import type {
  Animal as AnimalDto,
  CreateAnimalInput,
  MoveAnimalInput,
  RecordWeightInput,
  TimelineEntry,
  UpdateAnimalInput,
} from "@rebania/contracts";
import {
  CreateAnimalInput as CreateAnimalSchema,
  MoveAnimalInput as MoveAnimalSchema,
  RecordWeightInput as RecordWeightSchema,
  UpdateAnimalInput as UpdateAnimalSchema,
} from "@rebania/contracts";
import {
  assertAnimalAcceptsHandling,
  assertCategoryMatchesSex,
  assertEventDate,
  assertWeightKg,
  CATEGORY_LABEL,
  daysBetween,
  DomainError,
  formatIdentifier,
  IDENTIFIER_LABEL,
  normalizeIdentifier,
  todayInTimezone,
  weightConsistencyWarning,
  type IdentifierType,
} from "@rebania/domain";
import type { Db, Prisma, Tx } from "@rebania/db";
import { audit } from "../../lib/audit.ts";
import { recordChange } from "../../lib/changes.ts";
import { VersionConflictError } from "../../lib/conflict.ts";
import { civilToDate, dateToCivil } from "../../lib/dates.ts";
import { notFound } from "../../lib/errors.ts";
import type { FarmContext } from "../../lib/tenant.ts";

export interface MutationMeta {
  now: Date;
  mutationId?: string;
}

const ANIMAL_INCLUDE = {
  group: { select: { name: true } },
  pasture: { select: { name: true } },
  identifiers: { orderBy: { createdAt: "asc" } },
  weights: {
    where: { voidedAt: null },
    orderBy: [{ measuredOn: "desc" }, { createdAt: "desc" }],
    take: 1,
  },
  attachments: {
    where: { status: "ready", deletedAt: null, kind: "photo" },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { id: true },
  },
} satisfies Prisma.AnimalInclude;

export const mediaUrl = (farmId: string, id: string, variant: "thumb" | "display" | "original") =>
  `/v1/farms/${farmId}/media/${id}/${variant}`;

type AnimalWithRelations = Prisma.AnimalGetPayload<{ include: typeof ANIMAL_INCLUDE }>;

const PRIMARY_ORDER: IdentifierType[] = ["visual_tag", "provisional", "rfid", "nfc", "qr", "other"];

/** Identificador exibido como "nome" do animal (mesma ordem do DTO). */
export function primaryTag(
  identifiers: { type: IdentifierType; normalizedValue: string; status: string }[],
): string | null {
  const active = identifiers.filter((i) => i.status === "active");
  const p = PRIMARY_ORDER.map((t) => active.find((i) => i.type === t)).find(Boolean);
  return p ? formatIdentifier(p.type, p.normalizedValue) : null;
}

export function toAnimalDto(a: AnimalWithRelations): AnimalDto {
  const active = a.identifiers.filter((i) => i.status === "active");
  const primary = PRIMARY_ORDER.map((t) => active.find((i) => i.type === t)).find(Boolean);
  const last = a.weights[0];
  const photo = a.attachments[0];
  return {
    id: a.id,
    farmId: a.farmId,
    sex: a.sex,
    category: a.category,
    status: a.status,
    breed: a.breed,
    birthDate: dateToCivil(a.birthDate),
    birthDateEstimated: a.birthDateEstimated,
    origin: a.origin,
    entryDate: dateToCivil(a.entryDate),
    groupId: a.groupId,
    groupName: a.group?.name ?? null,
    pastureId: a.pastureId,
    pastureName: a.pasture?.name ?? null,
    damId: a.damId,
    sireId: a.sireId,
    notes: a.notes,
    version: a.version,
    identifiers: a.identifiers.map((i) => ({
      id: i.id,
      type: i.type,
      value: i.normalizedValue,
      display: formatIdentifier(i.type, i.normalizedValue),
      status: i.status,
      createdAt: i.createdAt.toISOString(),
      retiredAt: i.retiredAt?.toISOString() ?? null,
    })),
    primaryIdentifier: primary ? formatIdentifier(primary.type, primary.normalizedValue) : null,
    lastWeight: last
      ? { weightKg: Number(last.weightKg), measuredOn: dateToCivil(last.measuredOn) }
      : null,
    repro:
      a.sex === "female" && (a.category === "heifer" || a.category === "cow")
        ? {
            status: a.reproStatus ?? "unknown",
            since: dateToCivil(a.reproStatusSince),
            expectedCalvingOn: dateToCivil(a.expectedCalvingOn),
          }
        : null,
    withdrawal:
      a.withdrawalMeatUntil || a.withdrawalMilkUntil
        ? {
            meatUntil: dateToCivil(a.withdrawalMeatUntil),
            milkUntil: dateToCivil(a.withdrawalMilkUntil),
          }
        : null,
    photo: photo
      ? {
          id: photo.id,
          thumbUrl: mediaUrl(a.farmId, photo.id, "thumb"),
          displayUrl: mediaUrl(a.farmId, photo.id, "display"),
        }
      : null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export async function getAnimalDto(db: Db | Tx, farmId: string, id: string): Promise<AnimalDto> {
  const a = await db.animal.findFirst({ where: { id, farmId }, include: ANIMAL_INCLUDE });
  if (!a) throw notFound("Animal");
  return toAnimalDto(a);
}

export async function getAnimalDtos(db: Db | Tx, farmId: string, ids: string[]) {
  const rows = await db.animal.findMany({
    where: { id: { in: ids }, farmId },
    include: ANIMAL_INCLUDE,
  });
  return rows.map(toAnimalDto);
}

export { ANIMAL_INCLUDE };

// ---------------------------------------------------------------------------

async function assertGroupAndPasture(
  tx: Tx,
  fctx: FarmContext,
  groupId: string | null | undefined,
  pastureId: string | null | undefined,
) {
  if (groupId) {
    const g = await tx.group.findFirst({
      where: { id: groupId, farmId: fctx.farmId, archivedAt: null },
    });
    if (!g) throw new DomainError("group_not_found", "Lote não encontrado nesta fazenda.");
  }
  if (pastureId) {
    const p = await tx.pasture.findFirst({
      where: { id: pastureId, farmId: fctx.farmId, archivedAt: null },
    });
    if (!p) throw new DomainError("pasture_not_found", "Pasto não encontrado nesta fazenda.");
  }
}

async function assertParent(
  tx: Tx,
  fctx: FarmContext,
  id: string | null | undefined,
  sex: "female" | "male",
  selfId: string,
) {
  if (!id) return;
  if (id === selfId)
    throw new DomainError("parent_self", "O animal não pode ser pai/mãe de si mesmo.");
  const parent = await tx.animal.findFirst({ where: { id, organizationId: fctx.organizationId } });
  if (!parent) throw new DomainError("parent_not_found", "Mãe/pai não encontrado(a).");
  if (parent.sex !== sex) {
    throw new DomainError(
      sex === "female" ? "dam_not_female" : "sire_not_male",
      sex === "female" ? "A mãe precisa ser uma fêmea." : "O pai precisa ser um macho.",
    );
  }
}

async function assertIdentifierAvailable(
  tx: Tx,
  fctx: FarmContext,
  type: IdentifierType,
  normalized: string,
) {
  const farmScoped = type === "visual_tag" || type === "provisional" || type === "other";
  const clash = await tx.animalIdentifier.findFirst({
    where: {
      type,
      normalizedValue: normalized,
      status: "active",
      ...(farmScoped ? { farmId: fctx.farmId } : { organizationId: fctx.organizationId }),
    },
    select: { animalId: true },
  });
  if (clash) {
    throw new DomainError(
      "identifier_in_use",
      `${IDENTIFIER_LABEL[type]} ${formatIdentifier(type, normalized)} já está em uso por outro animal.`,
      { animalId: clash.animalId, type, value: normalized },
    );
  }
}

export async function addEvent(
  tx: Tx,
  fctx: FarmContext,
  animalId: string,
  type: string,
  occurredOn: string,
  data: Prisma.InputJsonValue,
  meta: MutationMeta,
) {
  await tx.animalEvent.create({
    data: {
      organizationId: fctx.organizationId,
      farmId: fctx.farmId,
      animalId,
      type,
      occurredOn: civilToDate(occurredOn),
      data,
      sourceMutationId: meta.mutationId ?? null,
      actorUserId: fctx.userId,
    },
  });
}

export async function createAnimal(
  tx: Tx,
  fctx: FarmContext,
  raw: CreateAnimalInput,
  meta: MutationMeta,
): Promise<{ entityId: string; version: number }> {
  const input = CreateAnimalSchema.parse(raw);
  const today = todayInTimezone(fctx.timezone, meta.now);
  const id = input.id ?? randomUUID();
  assertCategoryMatchesSex(input.category, input.sex);
  if (input.birthDate) assertEventDate(input.birthDate, { today });
  if (input.entryDate)
    assertEventDate(input.entryDate, { today, birthDate: input.birthDate ?? null });
  await assertGroupAndPasture(tx, fctx, input.groupId, input.pastureId);
  await assertParent(tx, fctx, input.damId, "female", id);
  await assertParent(tx, fctx, input.sireId, "male", id);

  const identifiers = input.identifiers.map((i) => ({
    type: i.type,
    raw: i.value,
    normalized: normalizeIdentifier(i.type, i.value),
  }));
  const seen = new Set<string>();
  for (const i of identifiers) {
    const key = `${i.type}:${i.normalized}`;
    if (seen.has(key))
      throw new DomainError("identifier_duplicated", "Identificador repetido no cadastro.");
    seen.add(key);
    await assertIdentifierAvailable(tx, fctx, i.type, i.normalized);
  }

  await tx.animal.create({
    data: {
      id,
      organizationId: fctx.organizationId,
      farmId: fctx.farmId,
      sex: input.sex,
      category: input.category,
      breed: input.breed ?? null,
      birthDate: input.birthDate ? civilToDate(input.birthDate) : null,
      birthDateEstimated: input.birthDateEstimated,
      origin: input.origin,
      entryDate: input.entryDate ? civilToDate(input.entryDate) : null,
      groupId: input.groupId ?? null,
      pastureId: input.pastureId ?? null,
      damId: input.damId ?? null,
      sireId: input.sireId ?? null,
      notes: input.notes ?? null,
      createdById: fctx.userId,
    },
  });
  await tx.animalIdentifier.createMany({
    data: identifiers.map((i) => ({
      organizationId: fctx.organizationId,
      farmId: fctx.farmId,
      animalId: id,
      type: i.type,
      rawValue: i.raw,
      normalizedValue: i.normalized,
      createdById: fctx.userId,
    })),
  });
  await addEvent(
    tx,
    fctx,
    id,
    "registered",
    input.entryDate ?? input.birthDate ?? today,
    {
      category: input.category,
      origin: input.origin,
      identifiers: identifiers.map((i) => ({ type: i.type, value: i.normalized })),
      groupId: input.groupId ?? null,
    },
    meta,
  );
  await recordChange(tx, fctx, "animal", id);
  return { entityId: id, version: 1 };
}

async function loadForWrite(tx: Tx, fctx: FarmContext, id: string) {
  const a = await tx.animal.findFirst({ where: { id, farmId: fctx.farmId } });
  if (!a) throw notFound("Animal");
  return a;
}

/** Atualização condicional por versão: nunca sobrescreve alteração concorrente. */
async function bumpVersion(
  tx: Tx,
  fctx: FarmContext,
  id: string,
  expectedVersion: number,
  data: Prisma.AnimalUncheckedUpdateManyInput,
) {
  const r = await tx.animal.updateMany({
    where: { id, farmId: fctx.farmId, version: expectedVersion },
    data: { ...data, version: { increment: 1 } },
  });
  if (r.count !== 1) {
    const current = await loadForWrite(tx, fctx, id);
    throw new VersionConflictError(id, current.version);
  }
  return expectedVersion + 1;
}

export async function updateAnimal(
  tx: Tx,
  fctx: FarmContext,
  id: string,
  raw: UpdateAnimalInput,
  meta: MutationMeta,
) {
  const { expectedVersion, patch } = UpdateAnimalSchema.parse(raw);
  const current = await loadForWrite(tx, fctx, id);
  if (current.version !== expectedVersion) throw new VersionConflictError(id, current.version);
  const today = todayInTimezone(fctx.timezone, meta.now);
  if (patch.category) assertCategoryMatchesSex(patch.category, current.sex);
  if (patch.birthDate) assertEventDate(patch.birthDate, { today });
  if (patch.damId !== undefined) await assertParent(tx, fctx, patch.damId, "female", id);
  if (patch.sireId !== undefined) await assertParent(tx, fctx, patch.sireId, "male", id);

  const before: Record<string, unknown> = {};
  const data: Prisma.AnimalUncheckedUpdateManyInput = {};
  for (const [k, v] of Object.entries(patch)) {
    const key = k as keyof typeof patch;
    const prev = current[key as keyof typeof current];
    before[key] = prev instanceof Date ? dateToCivil(prev) : prev;
    (data as Record<string, unknown>)[key] =
      key === "birthDate" && typeof v === "string" ? civilToDate(v) : v;
  }
  const version = await bumpVersion(tx, fctx, id, expectedVersion, data);
  await addEvent(
    tx,
    fctx,
    id,
    "updated",
    today,
    { before, after: patch } as Prisma.InputJsonValue,
    meta,
  );
  await recordChange(tx, fctx, "animal", id);
  return { entityId: id, version };
}

export async function moveAnimal(
  tx: Tx,
  fctx: FarmContext,
  id: string,
  raw: MoveAnimalInput,
  meta: MutationMeta,
) {
  const input = MoveAnimalSchema.parse(raw);
  const current = await loadForWrite(tx, fctx, id);
  assertAnimalAcceptsHandling(current.status);
  if (current.version !== input.expectedVersion)
    throw new VersionConflictError(id, current.version);
  const today = todayInTimezone(fctx.timezone, meta.now);
  assertEventDate(input.effectiveOn, { today, birthDate: dateToCivil(current.birthDate) });
  await assertGroupAndPasture(tx, fctx, input.groupId, input.pastureId);
  if (current.groupId === input.groupId && current.pastureId === input.pastureId) {
    throw new DomainError("move_noop", "O animal já está neste lote e pasto.");
  }
  const version = await bumpVersion(tx, fctx, id, input.expectedVersion, {
    groupId: input.groupId,
    pastureId: input.pastureId,
  });
  await addEvent(
    tx,
    fctx,
    id,
    "moved",
    input.effectiveOn,
    {
      from: { groupId: current.groupId, pastureId: current.pastureId },
      to: { groupId: input.groupId, pastureId: input.pastureId },
      reason: input.reason ?? null,
    },
    meta,
  );
  await recordChange(tx, fctx, "animal", id);
  return { entityId: id, version };
}

export async function recordWeight(
  tx: Tx,
  fctx: FarmContext,
  animalId: string,
  raw: RecordWeightInput,
  meta: MutationMeta,
) {
  const input = RecordWeightSchema.parse(raw);
  const animal = await loadForWrite(tx, fctx, animalId);
  assertAnimalAcceptsHandling(animal.status);
  const today = todayInTimezone(fctx.timezone, meta.now);
  assertEventDate(input.measuredOn, { today, birthDate: dateToCivil(animal.birthDate) });
  assertWeightKg(input.weightKg);

  const previous = await tx.weightMeasurement.findFirst({
    where: { animalId, voidedAt: null, measuredOn: { lt: civilToDate(input.measuredOn) } },
    orderBy: [{ measuredOn: "desc" }, { createdAt: "desc" }],
  });
  const warning = weightConsistencyWarning(
    previous
      ? { measuredOn: dateToCivil(previous.measuredOn), weightKg: Number(previous.weightKg) }
      : undefined,
    { measuredOn: input.measuredOn, weightKg: input.weightKg },
  );
  const id = input.id ?? meta.mutationId ?? randomUUID();
  await tx.weightMeasurement.create({
    data: {
      id,
      organizationId: fctx.organizationId,
      farmId: fctx.farmId,
      animalId,
      weightKg: input.weightKg.toFixed(2),
      measuredOn: civilToDate(input.measuredOn),
      source: input.source,
      notes: input.notes ?? null,
      createdById: fctx.userId,
    },
  });
  const adg =
    previous && daysBetween(dateToCivil(previous.measuredOn), input.measuredOn) > 0
      ? Math.round(
          ((input.weightKg - Number(previous.weightKg)) /
            daysBetween(dateToCivil(previous.measuredOn), input.measuredOn)) *
            1000,
        ) / 1000
      : null;
  await addEvent(
    tx,
    fctx,
    animalId,
    "weighed",
    input.measuredOn,
    { weightId: id, weightKg: input.weightKg, source: input.source, adgKgPerDay: adg, warning },
    meta,
  );
  await recordChange(tx, fctx, "weight", id);
  await recordChange(tx, fctx, "animal", animalId);
  return { entityId: id, version: null, warning };
}

export async function addIdentifier(
  tx: Tx,
  fctx: FarmContext,
  animalId: string,
  input: { type: IdentifierType; value: string; replaceActiveOfSameType: boolean; reason?: string },
  meta: MutationMeta & { ip?: string },
) {
  const animal = await loadForWrite(tx, fctx, animalId);
  assertAnimalAcceptsHandling(animal.status);
  const normalized = normalizeIdentifier(input.type, input.value);
  await assertIdentifierAvailable(tx, fctx, input.type, normalized);
  const today = todayInTimezone(fctx.timezone, meta.now);
  const retired: string[] = [];
  if (input.replaceActiveOfSameType) {
    const olds = await tx.animalIdentifier.findMany({
      where: { animalId, type: input.type, status: "active" },
    });
    for (const old of olds) {
      await tx.animalIdentifier.update({
        where: { id: old.id },
        data: { status: "retired", retiredAt: meta.now, retiredReason: input.reason ?? "retag" },
      });
      retired.push(old.normalizedValue);
    }
  }
  const created = await tx.animalIdentifier.create({
    data: {
      organizationId: fctx.organizationId,
      farmId: fctx.farmId,
      animalId,
      type: input.type,
      rawValue: input.value,
      normalizedValue: normalized,
      createdById: fctx.userId,
    },
  });
  await addEvent(
    tx,
    fctx,
    animalId,
    retired.length ? "retagged" : "identifier_added",
    today,
    { type: input.type, value: normalized, retired, reason: input.reason ?? null },
    meta,
  );
  await audit(tx, {
    organizationId: fctx.organizationId,
    farmId: fctx.farmId,
    actorUserId: fctx.userId,
    action: retired.length ? "animal.retagged" : "animal.identifier_added",
    entityType: "animal",
    entityId: animalId,
    data: { type: input.type, value: normalized, retired },
    ip: meta.ip ?? null,
  });
  await recordChange(tx, fctx, "animal", animalId);
  return { entityId: created.id, version: null };
}

// ---- Linha do tempo --------------------------------------------------------

export function summarizeEvent(
  type: string,
  data: Record<string, unknown>,
  names: Map<string, string>,
): string {
  switch (type) {
    case "registered":
      return `Cadastrado como ${CATEGORY_LABEL[data.category as keyof typeof CATEGORY_LABEL] ?? "animal"}`;
    case "weighed": {
      const adg = data.adgKgPerDay as number | null;
      return `Pesagem: ${Number(data.weightKg).toLocaleString("pt-BR")} kg${
        adg !== null && adg !== undefined ? ` · GMD ${adg.toLocaleString("pt-BR")} kg/dia` : ""
      }`;
    }
    case "moved": {
      const to = data.to as { groupId: string | null; pastureId: string | null };
      const parts = [
        to.groupId ? `lote ${names.get(to.groupId) ?? "—"}` : "sem lote",
        to.pastureId ? `pasto ${names.get(to.pastureId) ?? "—"}` : null,
      ].filter(Boolean);
      return `Movimentado para ${parts.join(", ")}`;
    }
    case "identifier_added":
      return `Identificador adicionado: ${formatIdentifier(data.type as IdentifierType, String(data.value))}`;
    case "retagged":
      return `Troca de identificação: ${formatIdentifier(data.type as IdentifierType, String(data.value))} (anterior: ${(data.retired as string[]).join(", ")})`;
    case "bred": {
      const kinds: Record<string, string> = {
        artificial_insemination: "Inseminação artificial",
        natural_service: "Monta natural",
        cleanup_bull: "Repasse",
      };
      return `${kinds[String(data.kind)] ?? "Cobertura"}${data.semen ? ` · sêmen ${String(data.semen)}` : ""}${data.technician ? ` · ${String(data.technician)}` : ""}`;
    }
    case "pregnancy_check": {
      const r: Record<string, string> = {
        pregnant: "Prenha",
        open: "Vazia",
        inconclusive: "Inconclusivo",
      };
      const ec = data.expectedCalving as { date?: string } | null;
      return `Diagnóstico: ${r[String(data.result)] ?? "—"}${data.estimatedGestationDays ? ` · ${String(data.estimatedGestationDays)} dias de gestação` : ""}${ec?.date ? ` · parto previsto ${ec.date.split("-").reverse().join("/")}` : ""}`;
    }
    case "calved": {
      const n = (data.calfIds as string[] | undefined)?.length ?? 0;
      const st = Number(data.stillborn ?? 0);
      return `Parto: ${n} cria(s) viva(s)${st ? ` · ${st} natimorto(s)` : ""}`;
    }
    case "weaned":
      return `Desmama${data.weightKg ? ` · ${Number(data.weightKg).toLocaleString("pt-BR")} kg` : ""}`;
    case "correction":
      return `Correção: ${String(data.label)} anulado(a) · ${String(data.reason)}`;
    case "health_applied":
      return `${String(data.productName)}${data.dose ? ` · ${Number(data.dose).toLocaleString("pt-BR")} ${String(data.unit ?? "")}` : ""}${data.withdrawalMeatUntil ? ` · carência até ${String(data.withdrawalMeatUntil).split("-").reverse().join("/")}` : ""}${data.applicator ? ` · ${String(data.applicator)}` : ""}`;
    case "treatment_started":
      return `Tratamento iniciado: ${String(data.condition)}`;
    case "treatment_closed":
      return `Tratamento encerrado: ${String(data.statusLabel)}${data.outcome ? ` · ${String(data.outcome)}` : ""}`;
    case "sold":
      return `Vendido para ${String(data.counterparty)}${data.liveWeightKg ? ` · ${Number(data.liveWeightKg).toLocaleString("pt-BR")} kg vivo` : ""}${data.withdrawalOverride ? " · com exceção de carência" : ""}`;
    case "purchased":
      return `Comprado de ${String(data.counterparty)}`;
    case "died":
      return `Morte: ${String(data.reason)}`;
    case "exited":
      return `${data.kind === "culled" ? "Descarte" : "Transferência"}: ${String(data.reason)}`;
    case "exam_collected":
      return `Exame coletado: ${String(data.kindLabel)}`;
    case "exam_result":
      return `Resultado de exame (${String(data.kindLabel)}): ${String(data.result)}`;
    case "updated":
      return `Dados atualizados: ${Object.keys((data.after as object) ?? {}).join(", ")}`;
    default:
      return type;
  }
}

export async function getTimeline(
  db: Db,
  fctx: FarmContext,
  animalId: string,
): Promise<TimelineEntry[]> {
  const events = await db.animalEvent.findMany({
    where: { animalId, organizationId: fctx.organizationId },
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  const actorIds = [
    ...new Set(events.map((e) => e.actorUserId).filter((x): x is string => Boolean(x))),
  ];
  const actors = await db.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true },
  });
  const actorName = new Map(actors.map((a) => [a.id, a.name]));
  const [groups, pastures] = await Promise.all([
    db.group.findMany({ where: { farmId: fctx.farmId }, select: { id: true, name: true } }),
    db.pasture.findMany({ where: { farmId: fctx.farmId }, select: { id: true, name: true } }),
  ]);
  const names = new Map([...groups, ...pastures].map((g) => [g.id, g.name]));
  return events.map((e) => ({
    id: e.id,
    type: e.type,
    occurredOn: dateToCivil(e.occurredOn),
    summary: summarizeEvent(e.type, e.data as Record<string, unknown>, names),
    data: e.data as Record<string, unknown>,
    actorName: e.actorUserId ? (actorName.get(e.actorUserId) ?? null) : null,
    recordedAt: e.createdAt.toISOString(),
  }));
}
