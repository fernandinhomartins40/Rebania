import { randomUUID } from "node:crypto";
import {
  BirthInput,
  BreedingInput,
  PregnancyCheckInput,
  WeaningInput,
  type GroupOperationResult,
} from "@rebania/contracts";
import {
  addDays,
  assertBreedable,
  assertCanCalve,
  assertEventDate,
  assertWeightKg,
  BREEDING_LABEL,
  categoryAfterCalving,
  categoryAfterWeaning,
  DomainError,
  parseReproSettings,
  PREGNANCY_LABEL,
  projectRepro,
  todayInTimezone,
  type ReproSettings,
} from "@rebania/domain";
import type { Prisma, Tx } from "@rebania/db";
import { audit } from "../../lib/audit.ts";
import { recordChange } from "../../lib/changes.ts";
import { civilToDate, dateToCivil } from "../../lib/dates.ts";
import { notFound } from "../../lib/errors.ts";
import { autoCompleteTasks, createTask } from "../../lib/tasks.ts";
import type { FarmContext } from "../../lib/tenant.ts";
import { createAnimal, recordWeight, type MutationMeta } from "../animals/service.ts";

const fmt = (d: string) => d.split("-").reverse().join("/");

export async function loadSettings(tx: Tx, farmId: string): Promise<ReproSettings> {
  const farm = await tx.farm.findUniqueOrThrow({
    where: { id: farmId },
    select: { settings: true },
  });
  return parseReproSettings((farm.settings as { repro?: unknown } | null)?.repro);
}

async function addEvent(
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

/** Recalcula a projeção reprodutiva da fêmea a partir do histórico não anulado. */
export async function recomputeRepro(
  tx: Tx,
  fctx: FarmContext,
  femaleId: string,
  settings?: ReproSettings,
) {
  const s = settings ?? (await loadSettings(tx, fctx.farmId));
  const [breedings, checks, births] = await Promise.all([
    tx.breedingEvent.findMany({
      where: { femaleId, voidedAt: null },
      select: { date: true, endDate: true },
    }),
    tx.pregnancyCheck.findMany({
      where: { femaleId, voidedAt: null },
      select: { date: true, result: true, estimatedGestationDays: true },
    }),
    tx.birth.findMany({ where: { damId: femaleId }, select: { date: true } }),
  ]);
  const p = projectRepro(
    {
      breedings: breedings.map((b) => ({
        date: dateToCivil(b.date),
        endDate: dateToCivil(b.endDate),
      })),
      checks: checks.map((c) => ({
        date: dateToCivil(c.date),
        result: c.result,
        estimatedGestationDays: c.estimatedGestationDays,
      })),
      births: births.map((b) => ({ date: dateToCivil(b.date) })),
    },
    s,
  );
  await tx.animal.update({
    where: { id: femaleId },
    data: {
      reproStatus: p.status,
      reproStatusSince: p.since ? civilToDate(p.since) : null,
      expectedCalvingOn: p.expectedCalving ? civilToDate(p.expectedCalving.date) : null,
    },
  });
  await recordChange(tx, fctx, "animal", femaleId);
  return p;
}

async function loadFemale(tx: Tx, fctx: FarmContext, id: string) {
  const a = await tx.animal.findFirst({ where: { id, farmId: fctx.farmId } });
  if (!a) return { error: { code: "not_found", message: "Animal não encontrado nesta fazenda." } };
  if (a.status !== "active")
    return { error: { code: "animal_not_active", message: "Animal não está ativo." } };
  try {
    if (a.sex !== "female") throw new DomainError("not_female", "Somente fêmeas.");
    assertBreedable(a.category);
  } catch (e) {
    return { error: { code: (e as DomainError).code, message: (e as DomainError).message } };
  }
  return { animal: a };
}

// ---- Cobertura / IA / repasse ----------------------------------------------------

export async function recordBreeding(
  tx: Tx,
  fctx: FarmContext,
  raw: BreedingInput,
  meta: MutationMeta,
) {
  const input = BreedingInput.parse(raw);
  const operationId = input.operationId ?? meta.mutationId ?? randomUUID();
  const today = todayInTimezone(fctx.timezone, meta.now);
  const s = await loadSettings(tx, fctx.farmId);
  assertEventDate(input.date, { today });
  if (input.endDate) assertEventDate(input.endDate, { today });

  if (input.sireId) {
    const sire = await tx.animal.findFirst({
      where: { id: input.sireId, organizationId: fctx.organizationId },
    });
    if (!sire) throw new DomainError("sire_not_found", "Touro não encontrado.");
    if (sire.sex !== "male")
      throw new DomainError("sire_not_male", "O touro precisa ser um macho.");
  }
  if (input.seasonId) {
    const season = await tx.breedingSeason.findFirst({
      where: { id: input.seasonId, farmId: fctx.farmId },
    });
    if (!season) throw new DomainError("season_not_found", "Estação de monta não encontrada.");
  }
  if (input.executionId) {
    const ex = await tx.protocolExecution.findFirst({
      where: { id: input.executionId, farmId: fctx.farmId },
    });
    if (!ex) throw new DomainError("execution_not_found", "Execução de protocolo não encontrada.");
  }

  const result: GroupOperationResult = { operationId, done: [], exceptions: [] };
  for (const id of input.femaleIds) {
    const f = await loadFemale(tx, fctx, id);
    if (f.error) {
      result.exceptions.push({ animalId: id, ...f.error });
      continue;
    }
    const a = f.animal;
    if (a.reproStatus === "pregnant") {
      result.exceptions.push({
        animalId: id,
        code: "already_pregnant",
        message: "Consta como prenha; registre um diagnóstico vazio antes, se for o caso.",
      });
      continue;
    }
    try {
      assertEventDate(input.date, { today, birthDate: dateToCivil(a.birthDate) });
    } catch (e) {
      result.exceptions.push({
        animalId: id,
        code: (e as DomainError).code,
        message: (e as DomainError).message,
      });
      continue;
    }
    const b = await tx.breedingEvent.create({
      data: {
        organizationId: fctx.organizationId,
        farmId: fctx.farmId,
        femaleId: id,
        kind: input.kind,
        date: civilToDate(input.date),
        endDate: input.endDate ? civilToDate(input.endDate) : null,
        sireId: input.sireId ?? null,
        semen: input.semen ?? null,
        technician: input.technician ?? null,
        seasonId: input.seasonId ?? null,
        executionId: input.executionId ?? null,
        notes: input.notes ?? null,
        createdById: fctx.userId,
      },
    });
    await addEvent(
      tx,
      fctx,
      id,
      "bred",
      input.date,
      {
        breedingId: b.id,
        kind: input.kind,
        endDate: input.endDate ?? null,
        sireId: input.sireId ?? null,
        semen: input.semen ?? null,
        technician: input.technician ?? null,
      },
      meta,
    );
    await recomputeRepro(tx, fctx, id, s);
    result.done.push(id);
  }
  if (result.done.length === 0) {
    throw new DomainError("nothing_recorded", result.exceptions.map((e) => e.message).join(" "), {
      exceptions: result.exceptions,
    });
  }
  const checkBase = input.endDate ?? input.date;
  await createTask(tx, fctx, {
    type: "pregnancy_check",
    title: `Diagnóstico de prenhez (${result.done.length} ${result.done.length === 1 ? "fêmea" : "fêmeas"})`,
    description: `${BREEDING_LABEL[input.kind]} em ${fmt(input.date)}. Prazo configurado: ${s.pregnancyCheckAfterDays} dias.`,
    dueOn: addDays(checkBase, s.pregnancyCheckAfterDays),
    animalIds: result.done,
    sourceType: "breeding_operation",
    sourceId: operationId,
    dedupeKey: `pregcheck:${operationId}`,
  });
  return { entityId: operationId, version: null, detail: result };
}

// ---- Diagnóstico de prenhez ----------------------------------------------------

export async function recordPregnancyChecks(
  tx: Tx,
  fctx: FarmContext,
  raw: PregnancyCheckInput,
  meta: MutationMeta,
) {
  const input = PregnancyCheckInput.parse(raw);
  const operationId = input.operationId ?? meta.mutationId ?? randomUUID();
  const today = todayInTimezone(fctx.timezone, meta.now);
  const s = await loadSettings(tx, fctx.farmId);
  assertEventDate(input.date, { today });
  const result: GroupOperationResult = { operationId, done: [], exceptions: [] };
  for (const r of input.results) {
    const f = await loadFemale(tx, fctx, r.animalId);
    if (f.error) {
      result.exceptions.push({ animalId: r.animalId, ...f.error });
      continue;
    }
    if (r.result !== "pregnant" && r.estimatedGestationDays) {
      result.exceptions.push({
        animalId: r.animalId,
        code: "gestation_without_pregnancy",
        message: "Idade gestacional só se aplica a prenhes.",
      });
      continue;
    }
    const c = await tx.pregnancyCheck.create({
      data: {
        organizationId: fctx.organizationId,
        farmId: fctx.farmId,
        femaleId: r.animalId,
        date: civilToDate(input.date),
        result: r.result,
        method: input.method,
        examiner: input.examiner ?? null,
        estimatedGestationDays: r.estimatedGestationDays ?? null,
        seasonId: input.seasonId ?? null,
        notes: r.notes ?? null,
        createdById: fctx.userId,
      },
    });
    const p = await recomputeRepro(tx, fctx, r.animalId, s);
    await addEvent(
      tx,
      fctx,
      r.animalId,
      "pregnancy_check",
      input.date,
      {
        checkId: c.id,
        result: r.result,
        method: input.method,
        examiner: input.examiner ?? null,
        estimatedGestationDays: r.estimatedGestationDays ?? null,
        expectedCalving: p.expectedCalving,
      } as unknown as Prisma.InputJsonValue,
      meta,
    );
    result.done.push(r.animalId);
  }
  if (result.done.length === 0) {
    throw new DomainError("nothing_recorded", result.exceptions.map((e) => e.message).join(" "));
  }
  await autoCompleteTasks(
    tx,
    fctx,
    "pregnancy_check",
    result.done,
    async (animalId, task) =>
      (await tx.pregnancyCheck.count({
        where: { femaleId: animalId, voidedAt: null, createdAt: { gte: task.createdAt } },
      })) > 0,
    "Diagnósticos registrados",
    meta.now,
  );
  return { entityId: operationId, version: null, detail: result };
}

// ---- Nascimento ---------------------------------------------------------------------

/**
 * Parto transacional: cria as crias vivas (vínculo com a mãe e, quando inequívoco,
 * com o pai), registra natimortos, atualiza a mãe e agenda a desmama.
 */
export async function recordBirth(tx: Tx, fctx: FarmContext, raw: BirthInput, meta: MutationMeta) {
  const input = BirthInput.parse(raw);
  const birthId = input.id ?? meta.mutationId ?? randomUUID();
  const today = todayInTimezone(fctx.timezone, meta.now);
  const s = await loadSettings(tx, fctx.farmId);
  const dam = await tx.animal.findFirst({ where: { id: input.damId, farmId: fctx.farmId } });
  if (!dam) throw notFound("Mãe");
  if (dam.status !== "active") throw new DomainError("animal_not_active", "A mãe não está ativa.");
  if (dam.sex !== "female") throw new DomainError("not_female", "A mãe precisa ser fêmea.");
  assertCanCalve(dam.category);
  assertEventDate(input.date, { today, birthDate: dateToCivil(dam.birthDate) });
  const recent = await tx.birth.findFirst({
    where: { damId: dam.id, date: { gt: civilToDate(addDays(input.date, -240)) } },
  });
  if (recent) {
    throw new DomainError(
      "birth_too_close",
      `Já existe parto desta mãe em ${fmt(dateToCivil(recent.date))}. Corrija o registro anterior se necessário.`,
    );
  }

  // Pai: só quando há exatamente um touro informado nas coberturas compatíveis com a gestação.
  const candidates = await tx.breedingEvent.findMany({
    where: {
      femaleId: dam.id,
      voidedAt: null,
      date: {
        gte: civilToDate(addDays(input.date, -(s.gestationDays + 30))),
        lte: civilToDate(addDays(input.date, -(s.gestationDays - 30))),
      },
    },
    select: { sireId: true },
  });
  const sires = new Set(candidates.map((c) => c.sireId));
  const sireId = sires.size === 1 ? [...sires][0]! : null;

  const birth = await tx.birth.create({
    data: {
      id: birthId,
      organizationId: fctx.organizationId,
      farmId: fctx.farmId,
      damId: dam.id,
      date: civilToDate(input.date),
      assistance: input.assistance,
      sireId,
      notes: input.notes ?? null,
      createdById: fctx.userId,
    },
  });
  const calfIds: string[] = [];
  for (const c of input.calves) {
    if (c.stillborn) {
      await tx.birthCalf.create({
        data: {
          organizationId: fctx.organizationId,
          birthId: birth.id,
          sex: c.sex,
          stillborn: true,
          birthWeightKg: c.weightKg ?? null,
        },
      });
      continue;
    }
    if (c.weightKg) assertWeightKg(Math.max(10, c.weightKg));
    const created = await createAnimal(
      tx,
      fctx,
      {
        ...(c.id ? { id: c.id } : {}),
        sex: c.sex,
        category: c.sex === "female" ? "calf_female" : "calf_male",
        origin: "born_on_farm",
        birthDate: input.date,
        birthDateEstimated: false,
        breed: dam.breed ?? undefined,
        damId: dam.id,
        sireId,
        groupId: c.groupId ?? dam.groupId,
        pastureId: dam.pastureId,
        identifiers: c.identifiers,
      },
      meta,
    );
    calfIds.push(created.entityId);
    await tx.birthCalf.create({
      data: {
        organizationId: fctx.organizationId,
        birthId: birth.id,
        animalId: created.entityId,
        sex: c.sex,
        birthWeightKg: c.weightKg ?? null,
      },
    });
    if (c.weightKg && c.weightKg >= 10) {
      await recordWeight(
        tx,
        fctx,
        created.entityId,
        { weightKg: c.weightKg, measuredOn: input.date, source: "manual", notes: "Peso ao nascer" },
        { now: meta.now },
      );
    }
  }
  const stillborn = input.calves.filter((c) => c.stillborn).length;
  const newCategory = categoryAfterCalving(dam.category);
  if (newCategory !== dam.category) {
    await tx.animal.update({
      where: { id: dam.id },
      data: { category: newCategory, version: { increment: 1 } },
    });
  }
  await addEvent(
    tx,
    fctx,
    dam.id,
    "calved",
    input.date,
    {
      birthId: birth.id,
      calfIds,
      stillborn,
      assistance: input.assistance,
      sireId,
      categoryChanged:
        newCategory !== dam.category ? { from: dam.category, to: newCategory } : null,
    },
    meta,
  );
  await recomputeRepro(tx, fctx, dam.id, s);
  if (calfIds.length) {
    await createTask(tx, fctx, {
      type: "weaning",
      title: `Desmama (${calfIds.length} ${calfIds.length === 1 ? "cria" : "crias"})`,
      description: `Nascimento em ${fmt(input.date)}. Idade de desmama configurada: ${s.weaningAgeDays} dias.`,
      dueOn: addDays(input.date, s.weaningAgeDays),
      animalIds: calfIds,
      sourceType: "birth",
      sourceId: birth.id,
      dedupeKey: `weaning:${birth.id}`,
    });
  }
  return {
    entityId: birth.id,
    version: null,
    detail: { birthId: birth.id, calfIds, stillborn, sireId },
  };
}

// ---- Desmama -------------------------------------------------------------------------

export async function recordWeaning(
  tx: Tx,
  fctx: FarmContext,
  raw: WeaningInput,
  meta: MutationMeta,
) {
  const input = WeaningInput.parse(raw);
  const operationId = input.operationId ?? meta.mutationId ?? randomUUID();
  const today = todayInTimezone(fctx.timezone, meta.now);
  const result: GroupOperationResult = { operationId, done: [], exceptions: [] };
  for (const item of input.items) {
    const a = await tx.animal.findFirst({ where: { id: item.animalId, farmId: fctx.farmId } });
    if (!a || a.status !== "active") {
      result.exceptions.push({
        animalId: item.animalId,
        code: "animal_not_active",
        message: "Animal não encontrado ou inativo.",
      });
      continue;
    }
    if (a.category !== "calf_female" && a.category !== "calf_male") {
      result.exceptions.push({
        animalId: item.animalId,
        code: "not_calf",
        message: "Só bezerros(as) podem ser desmamados.",
      });
      continue;
    }
    try {
      assertEventDate(input.date, { today, birthDate: dateToCivil(a.birthDate) });
      if (item.weightKg) assertWeightKg(item.weightKg);
    } catch (e) {
      result.exceptions.push({
        animalId: item.animalId,
        code: (e as DomainError).code,
        message: (e as DomainError).message,
      });
      continue;
    }
    if (item.weightKg) {
      await recordWeight(
        tx,
        fctx,
        a.id,
        {
          weightKg: item.weightKg,
          measuredOn: input.date,
          source: "manual",
          notes: "Peso à desmama",
        },
        { now: meta.now },
      );
    }
    const next = categoryAfterWeaning(a.category);
    await tx.animal.update({
      where: { id: a.id },
      data: { category: next, version: { increment: 1 } },
    });
    await addEvent(
      tx,
      fctx,
      a.id,
      "weaned",
      input.date,
      { weightKg: item.weightKg ?? null, from: a.category, to: next },
      meta,
    );
    await recordChange(tx, fctx, "animal", a.id);
    result.done.push(a.id);
  }
  if (result.done.length === 0)
    throw new DomainError("nothing_recorded", result.exceptions.map((e) => e.message).join(" "));
  await autoCompleteTasks(
    tx,
    fctx,
    "weaning",
    result.done,
    async (animalId) => (await tx.animalEvent.count({ where: { animalId, type: "weaned" } })) > 0,
    "Desmama registrada",
    meta.now,
  );
  return { entityId: operationId, version: null, detail: result };
}

// ---- Correções rastreáveis --------------------------------------------------------

export async function voidRecord(
  tx: Tx,
  fctx: FarmContext,
  kind: "breeding" | "pregnancy_check" | "weight",
  id: string,
  reason: string,
  meta: MutationMeta & { ip?: string },
) {
  const today = todayInTimezone(fctx.timezone, meta.now);
  let animalId: string;
  let label: string;
  if (kind === "breeding") {
    const r = await tx.breedingEvent.findFirst({
      where: { id, farmId: fctx.farmId, voidedAt: null },
    });
    if (!r) throw notFound("Registro");
    await tx.breedingEvent.update({
      where: { id },
      data: { voidedAt: meta.now, voidReason: reason },
    });
    animalId = r.femaleId;
    label = `${BREEDING_LABEL[r.kind]} de ${fmt(dateToCivil(r.date))}`;
  } else if (kind === "pregnancy_check") {
    const r = await tx.pregnancyCheck.findFirst({
      where: { id, farmId: fctx.farmId, voidedAt: null },
    });
    if (!r) throw notFound("Registro");
    await tx.pregnancyCheck.update({
      where: { id },
      data: { voidedAt: meta.now, voidReason: reason },
    });
    animalId = r.femaleId;
    label = `Diagnóstico (${PREGNANCY_LABEL[r.result]}) de ${fmt(dateToCivil(r.date))}`;
  } else {
    const r = await tx.weightMeasurement.findFirst({
      where: { id, farmId: fctx.farmId, voidedAt: null },
    });
    if (!r) throw notFound("Registro");
    await tx.weightMeasurement.update({ where: { id }, data: { voidedAt: meta.now } });
    animalId = r.animalId;
    label = `Pesagem de ${Number(r.weightKg)} kg em ${fmt(dateToCivil(r.measuredOn))}`;
    await recordChange(tx, fctx, "weight", id, "delete");
  }
  await addEvent(tx, fctx, animalId, "correction", today, { kind, refId: id, label, reason }, meta);
  if (kind !== "weight") await recomputeRepro(tx, fctx, animalId);
  else await recordChange(tx, fctx, "animal", animalId);
  await audit(tx, {
    organizationId: fctx.organizationId,
    farmId: fctx.farmId,
    actorUserId: fctx.userId,
    action: `${kind}.voided`,
    entityType: kind,
    entityId: id,
    data: { reason, animalId },
    ip: meta.ip ?? null,
  });
  return { entityId: id, version: null };
}
