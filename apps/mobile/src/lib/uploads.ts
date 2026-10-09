import { CryptoDigestAlgorithm, digest } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { api, ApiError, NetworkError } from "./api.ts";
import { db } from "./db.ts";
import { uuid } from "./ids.ts";

/**
 * Fotos no app: a imagem é copiada para a área do aplicativo e enviada em blocos
 * quando houver conexão, retomando do offset informado pelo servidor.
 */
export interface PendingUpload {
  id: string;
  farmId: string;
  animalId: string;
  path: string;
  mime: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
  sha256: string;
  uploadedBytes: number;
  createdAt: string;
  error?: string;
}

const CHUNK = 512 * 1024;

async function save(u: PendingUpload) {
  await (
    await db()
  ).runAsync(
    "INSERT OR REPLACE INTO uploads (id, created_at, doc) VALUES (?, ?, ?)",
    u.id,
    u.createdAt,
    JSON.stringify(u),
  );
}

export async function pendingUploads(animalId?: string): Promise<PendingUpload[]> {
  const rows = await (
    await db()
  ).getAllAsync<{ doc: string }>("SELECT doc FROM uploads ORDER BY created_at");
  return rows
    .map((r) => JSON.parse(r.doc) as PendingUpload)
    .filter((u) => !animalId || u.animalId === animalId);
}

async function remove(u: PendingUpload) {
  await (await db()).runAsync("DELETE FROM uploads WHERE id = ?", u.id);
  try {
    new File(u.path).delete();
  } catch {
    /* arquivo já removido */
  }
}

export async function queuePhoto(
  farmId: string,
  animalId: string,
  uri: string,
  mime = "image/jpeg",
) {
  const id = uuid();
  const dir = new Directory(Paths.document, "uploads");
  if (!dir.exists) dir.create();
  const src = new File(uri);
  const dest = new File(dir, `${id}.jpg`);
  src.copy(dest);
  const bytes = new Uint8Array(await dest.arrayBuffer());
  const hash = Array.from(new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, bytes)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const item: PendingUpload = {
    id,
    farmId,
    animalId,
    path: dest.uri,
    mime: (["image/jpeg", "image/png", "image/webp"].includes(mime)
      ? mime
      : "image/jpeg") as PendingUpload["mime"],
    sizeBytes: bytes.length,
    sha256: hash,
    uploadedBytes: 0,
    createdAt: new Date().toISOString(),
  };
  await save(item);
  return item;
}

let running: Promise<void> | null = null;

export function processUploads(): Promise<void> {
  running ??= (async () => {
    for (const u of await pendingUploads()) {
      try {
        const base = `/v1/farms/${u.farmId}/media`;
        let media = await api<{ status: string; uploadedBytes: number }>("POST", base, {
          id: u.id,
          animalId: u.animalId,
          mime: u.mime,
          sizeBytes: u.sizeBytes,
          sha256: u.sha256,
        });
        const bytes = new Uint8Array(await new File(u.path).arrayBuffer());
        let offset = media.uploadedBytes;
        while (media.status === "uploading") {
          try {
            media = await api(
              "PATCH",
              `${base}/${u.id}`,
              bytes.subarray(offset, Math.min(offset + CHUNK, u.sizeBytes)),
              {
                "content-type": "application/offset+octet-stream",
                "upload-offset": String(offset),
              },
            );
          } catch (err) {
            if (err instanceof ApiError && err.code === "offset_mismatch") {
              offset = Number(err.details?.uploadedBytes ?? 0);
              continue;
            }
            throw err;
          }
          offset = media.uploadedBytes;
          await save({ ...u, uploadedBytes: offset });
        }
        await remove(u);
      } catch (err) {
        if (err instanceof NetworkError) break;
        await save({ ...u, error: err instanceof Error ? err.message : "Falha no envio." });
      }
    }
  })().finally(() => {
    running = null;
  });
  return running;
}
