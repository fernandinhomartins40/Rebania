import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handlers } from "../../worker/src/handlers.ts";
import {
  createTenant,
  createTestEnv,
  createUser,
  login,
  newAnimal,
  type Client,
  type Tenant,
  type TestEnv,
} from "./helpers.ts";

let env: TestEnv;
let t: Tenant;
let owner: Client;
let token: string;
const base = () => `/v1/farms/${t.farmId}`;

beforeAll(async () => {
  env = await createTestEnv();
  t = await createTenant(env.db);
  const u = await createUser(env.db, t.orgId, "owner");
  owner = await login(env.app, u.email);
  const res = await env.app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: { "x-rebania-csrf": "1" },
    payload: { email: u.email, password: "senha-de-teste-123", channel: "mobile" },
  });
  token = res.json().tokens.accessToken;
});
afterAll(() => env.close());

async function photo() {
  return sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#7a6" } })
    .jpeg()
    .withExif({ IFD3: { GPSLatitudeRef: "S", GPSLatitude: "15/1 30/1 0/1" } })
    .toBuffer();
}

function patch(id: string, offset: number, chunk: Buffer) {
  return env.app.inject({
    method: "PATCH",
    url: `${base()}/media/${id}`,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/offset+octet-stream",
      "upload-offset": String(offset),
    },
    payload: chunk,
  });
}

async function runWorker() {
  const jobs = await env.db.job.findMany({ where: { queue: "media.derive", status: "queued" } });
  for (const j of jobs) {
    await handlers["media.derive"]!({ db: env.db, mediaDir: env.mediaDir }, j.payload);
    await env.db.job.update({ where: { id: j.id }, data: { status: "done" } });
  }
}

describe("fotos", () => {
  it("upload retomável, derivados sem GPS e foto no passaporte", async () => {
    const animal = (await owner.post(`${base()}/animals`, newAnimal())).json();
    const file = await photo();
    const id = randomUUID();
    const meta = {
      id,
      animalId: animal.id,
      mime: "image/jpeg",
      sizeBytes: file.length,
      sha256: createHash("sha256").update(file).digest("hex"),
    };
    expect((await owner.post(`${base()}/media`, meta)).statusCode).toBe(201);
    expect((await owner.post(`${base()}/media`, meta)).statusCode).toBe(200); // retomar é seguro

    const half = Math.floor(file.length / 2);
    const r1 = await patch(id, 0, file.subarray(0, half));
    expect(r1.json()).toMatchObject({ status: "uploading", uploadedBytes: half });
    // conexão caiu e o aparelho reenviou do zero: servidor informa onde parou
    const stale = await patch(id, 0, file.subarray(0, half));
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.details.uploadedBytes).toBe(half);
    const r2 = await patch(id, half, file.subarray(half));
    expect(r2.json()).toMatchObject({ status: "processing" });

    await runWorker();
    const list = (await owner.get(`${base()}/animals/${animal.id}/media`)).json();
    expect(list[0]).toMatchObject({ id, status: "ready", width: 1600, height: 1200 });

    const img = await env.app.inject({
      method: "GET",
      url: list[0].displayUrl,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(img.statusCode).toBe(200);
    expect(img.headers["content-type"]).toBe("image/webp");
    const original = await env.app.inject({
      method: "GET",
      url: `${base()}/media/${id}/original`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect((await sharp(original.rawPayload).metadata()).exif).toBeUndefined();

    const a = (await owner.get(`${base()}/animals/${animal.id}`)).json();
    expect(a.photo).toMatchObject({ id });

    // anônimo e outro tenant não acessam a foto
    expect((await env.app.inject({ method: "GET", url: list[0].displayUrl })).statusCode).toBe(401);
    const other = await createTenant(env.db);
    const intruder = await login(env.app, (await createUser(env.db, other.orgId, "owner")).email);
    expect((await intruder.get(list[0].displayUrl)).statusCode).toBe(404);
  });

  it("arquivo que não é imagem ou com checksum errado é recusado", async () => {
    const fake = Buffer.from("<html>não sou foto</html>");
    const id = randomUUID();
    await owner.post(`${base()}/media`, {
      id,
      mime: "image/jpeg",
      sizeBytes: fake.length,
      sha256: createHash("sha256").update(fake).digest("hex"),
    });
    const r = await patch(id, 0, fake);
    expect(r.statusCode).toBe(422);
    expect(r.json().error.code).toBe("media_invalid");

    const real = await photo();
    const id2 = randomUUID();
    await owner.post(`${base()}/media`, {
      id: id2,
      mime: "image/jpeg",
      sizeBytes: real.length,
      sha256: "0".repeat(64),
    });
    expect((await patch(id2, 0, real)).statusCode).toBe(422);
  });

  it("excluir remove do passaporte e registra auditoria", async () => {
    const animal = (await owner.post(`${base()}/animals`, newAnimal())).json();
    const file = await photo();
    const id = randomUUID();
    await owner.post(`${base()}/media`, {
      id,
      animalId: animal.id,
      mime: "image/jpeg",
      sizeBytes: file.length,
      sha256: createHash("sha256").update(file).digest("hex"),
    });
    await patch(id, 0, file);
    await runWorker();
    expect((await owner.post(`${base()}/media/${id}/delete`)).statusCode).toBe(204);
    expect((await owner.get(`${base()}/animals/${animal.id}`)).json().photo).toBeNull();
    expect(
      await env.db.auditEntry.count({ where: { entityId: id, action: "media.deleted" } }),
    ).toBe(1);
  });
});

describe("importação", () => {
  const rows = [
    {
      line: 2,
      raw: {
        brinco: "IMP1",
        sexo: "F",
        categoria: "Vaca",
        raca: "Nelore",
        nascimento: "10/03/2021",
        lote: "Lote Importado",
        peso: "450",
        data_peso: "01/10/2026",
      },
    },
    { line: 3, raw: { brinco: "IMP2", categoria: "Boi", lote: "Lote Importado" } },
    { line: 4, raw: { brinco: "IMP2", categoria: "Novilha" } },
    { line: 5, raw: { brinco: "IMP4", sexo: "M", categoria: "Vaca" } },
  ];

  it("prévia não grava nada e aponta erros por linha", async () => {
    const before = await env.db.animal.count({ where: { farmId: t.farmId } });
    const p = (await owner.post(`${base()}/imports/preview`, { rows })).json();
    expect(p).toMatchObject({ valid: 1, invalid: 3, newGroups: ["Lote Importado"] });
    expect(p.rows.find((r: { line: number }) => r.line === 3).errors[0]).toMatch(/repetido/);
    expect(p.rows.find((r: { line: number }) => r.line === 5).errors[0]).toMatch(/incompatível/);
    expect(await env.db.animal.count({ where: { farmId: t.farmId } })).toBe(before);
  });

  it("confirmação grava as válidas; corrigir e reenviar não repete as aceitas", async () => {
    const withIds = rows.map((r) => ({ ...r, mutationId: randomUUID() }));
    const first = (
      await owner.post(`${base()}/imports/commit`, { fileName: "rebanho.csv", rows: withIds })
    ).json();
    expect(first).toMatchObject({ accepted: 1, rejected: 3 });
    const imported = (await owner.get(`${base()}/animals?q=IMP1`)).json().items[0];
    expect(imported).toMatchObject({
      groupName: "Lote Importado",
      lastWeight: { weightKg: 450, measuredOn: "2026-10-01" },
    });

    // usuário corrige as linhas 3-5 (novos ids só para as corrigidas) e reenvia tudo
    const fixed = withIds.map((r) =>
      r.line === 4
        ? { ...r, mutationId: randomUUID(), raw: { brinco: "IMP3", categoria: "Novilha" } }
        : r.line === 5
          ? {
              ...r,
              mutationId: randomUUID(),
              raw: { brinco: "IMP4", sexo: "F", categoria: "Vaca" },
            }
          : r,
    );
    const second = (
      await owner.post(`${base()}/imports/commit`, {
        fileName: "rebanho-corrigido.csv",
        rows: fixed,
      })
    ).json();
    expect(second.results.map((x: { receipt: { status: string } }) => x.receipt.status)).toEqual([
      "accepted",
      "accepted",
      "accepted",
      "accepted",
    ]);
    expect(
      await env.db.animal.count({
        where: {
          farmId: t.farmId,
          identifiers: { some: { normalizedValue: { startsWith: "IMP" } } },
        },
      }),
    ).toBe(4);
    expect(await env.db.group.count({ where: { farmId: t.farmId, name: "Lote Importado" } })).toBe(
      1,
    );
    expect(await env.db.importBatch.count({ where: { farmId: t.farmId } })).toBe(2);
  });
});
