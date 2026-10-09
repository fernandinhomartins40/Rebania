import type { Tx } from "@rebania/db";
import { civilToDate } from "./dates.ts";
import type { FarmContext } from "./tenant.ts";

export interface NewTask {
  type: string;
  title: string;
  description?: string;
  dueOn: string;
  animalIds: string[];
  sourceType?: string;
  sourceId?: string;
  /** Evita duplicar tarefas derivadas em reenvios. */
  dedupeKey?: string;
}

/** Cria tarefa derivada de manejo (idempotente por dedupeKey). */
export async function createTask(tx: Tx, fctx: FarmContext, t: NewTask) {
  if (t.dedupeKey) {
    const existing = await tx.task.findFirst({
      where: { farmId: fctx.farmId, dedupeKey: t.dedupeKey },
    });
    if (existing) return existing;
  }
  return tx.task.create({
    data: {
      organizationId: fctx.organizationId,
      farmId: fctx.farmId,
      type: t.type,
      title: t.title,
      description: t.description ?? null,
      dueOn: civilToDate(t.dueOn),
      animalIds: t.animalIds,
      sourceType: t.sourceType ?? null,
      sourceId: t.sourceId ?? null,
      dedupeKey: t.dedupeKey ?? null,
      createdById: fctx.userId,
    },
  });
}

/**
 * Conclui automaticamente tarefas abertas do tipo quando TODOS os animais alvo já
 * foram atendidos (`isDone`). Tarefas parciais continuam abertas e visíveis.
 */
export async function autoCompleteTasks(
  tx: Tx,
  fctx: FarmContext,
  type: string,
  touchedAnimalIds: string[],
  isDone: (animalId: string, task: { createdAt: Date }) => Promise<boolean>,
  resolution: string,
  now: Date,
) {
  const tasks = await tx.task.findMany({
    where: { farmId: fctx.farmId, type, status: "open", animalIds: { hasSome: touchedAnimalIds } },
  });
  for (const t of tasks) {
    let all = true;
    for (const a of t.animalIds) {
      if (!(await isDone(a, t))) {
        all = false;
        break;
      }
    }
    if (all) {
      await tx.task.update({
        where: { id: t.id },
        data: { status: "done", completedAt: now, completedById: fctx.userId, resolution },
      });
    }
  }
}
