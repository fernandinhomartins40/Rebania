import { createDb, enqueueJob } from "@rebania/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { drain, scheduleRecurring } from "../src/runner.ts";

const db = createDb({ url: process.env.TEST_DATABASE_URL!, max: 5 });
afterAll(() => db.$disconnect());
beforeEach(async () => {
  await db.job.deleteMany();
});

describe("fila PostgreSQL", () => {
  it("executa uma vez mesmo com vários workers concorrentes", async () => {
    let runs = 0;
    const handlers = { "test.count": async () => { runs++; } };
    for (let i = 0; i < 20; i++) await enqueueJob(db, "test.count");
    const counts = await Promise.all(["w1", "w2", "w3"].map((workerId) => drain({ db, workerId, handlers })));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(20);
    expect(runs).toBe(20);
    expect(await db.job.count({ where: { status: "done" } })).toBe(20);
  });

  it("falha reagenda com backoff e marca failed ao esgotar tentativas", async () => {
    const handlers = { "test.fail": async () => { throw new Error("boom"); } };
    const job = await enqueueJob(db, "test.fail", {}, { maxAttempts: 2 });
    await drain({ db, workerId: "w", handlers });
    let row = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(row).toMatchObject({ status: "queued", attempts: 1, lastError: "boom" });
    expect(row.runAt.getTime()).toBeGreaterThan(Date.now());
    await db.job.update({ where: { id: job.id }, data: { runAt: new Date(0) } });
    await drain({ db, workerId: "w", handlers });
    row = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(row).toMatchObject({ status: "failed", attempts: 2 });
  });

  it("agendamento periódico é deduplicado por janela", async () => {
    const schedules = [{ queue: "maintenance.sessions", everyMs: 3600_000 }];
    const now = Date.now();
    await scheduleRecurring(db, schedules, now);
    await scheduleRecurring(db, schedules, now + 1000);
    expect(await db.job.count({ where: { queue: "maintenance.sessions" } })).toBe(1);
  });
});
