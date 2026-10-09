import type { Media } from "@rebania/contracts";
import { ApiError, NetworkError } from "../api/client.ts";
import { idbAll, idbDelete, idbPut } from "./idb.ts";

/**
 * Fila de fotos (T12): a foto é salva no aparelho primeiro e enviada em blocos
 * quando houver conexão. Se a conexão cair, o envio continua do ponto em que parou.
 */
export interface PendingUpload {
  id: string;
  farmId: string;
  animalId: string;
  blob: Blob;
  mime: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
  sha256: string;
  caption?: string;
  takenOn?: string;
  createdAt: string;
  uploadedBytes: number;
  error?: string;
}

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const CHUNK = 1024 * 1024;
const MAX = 15 * 1024 * 1024;

const listeners = new Set<() => void>();
export function onUploadsChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
const notify = () => listeners.forEach((fn) => fn());

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function queuePhoto(input: {
  farmId: string;
  animalId: string;
  file: File;
  caption?: string;
  takenOn?: string;
}) {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(input.file.type)) {
    throw new Error("Formato não suportado. Use foto JPEG, PNG ou WebP.");
  }
  if (input.file.size > MAX) throw new Error("Foto acima de 15 MB.");
  const item: PendingUpload = {
    id: crypto.randomUUID(),
    farmId: input.farmId,
    animalId: input.animalId,
    blob: input.file,
    mime: input.file.type as PendingUpload["mime"],
    sizeBytes: input.file.size,
    sha256: await sha256(input.file),
    ...(input.caption ? { caption: input.caption } : {}),
    ...(input.takenOn ? { takenOn: input.takenOn } : {}),
    createdAt: new Date().toISOString(),
    uploadedBytes: 0,
  };
  await idbPut("uploads", item);
  notify();
  return item;
}

export async function pendingUploads(animalId?: string): Promise<PendingUpload[]> {
  const all = await idbAll<PendingUpload>("uploads");
  return all
    .filter((u) => !animalId || u.animalId === animalId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function discardUpload(id: string) {
  await idbDelete("uploads", id);
  notify();
}

async function request(
  method: string,
  url: string,
  body?: BodyInit,
  headers: Record<string, string> = {},
) {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: { "x-rebania-csrf": "1", ...headers },
      body,
    });
  } catch {
    throw new NetworkError();
  }
  const data = await res.json().catch(() => null);
  if (!res.ok)
    throw new ApiError(
      res.status,
      data?.error?.code ?? "error",
      data?.error?.message ?? "Falha no envio.",
      data?.error?.details,
    );
  return data as Media;
}

let running: Promise<void> | null = null;

/** Envia todas as fotos pendentes; chamadas concorrentes compartilham a execução. */
export function processUploads(): Promise<void> {
  running ??= (async () => {
    for (const u of await pendingUploads()) {
      try {
        const base = `/v1/farms/${u.farmId}/media`;
        let media = await request(
          "POST",
          base,
          JSON.stringify({
            id: u.id,
            animalId: u.animalId,
            mime: u.mime,
            sizeBytes: u.sizeBytes,
            sha256: u.sha256,
            caption: u.caption,
            takenOn: u.takenOn,
          }),
          { "content-type": "application/json" },
        );
        let offset = media.uploadedBytes;
        while (media.status === "uploading") {
          const chunk = u.blob.slice(offset, Math.min(offset + CHUNK, u.sizeBytes));
          try {
            media = await request("PATCH", `${base}/${u.id}`, chunk, {
              "content-type": "application/offset+octet-stream",
              "upload-offset": String(offset),
            });
          } catch (err) {
            if (err instanceof ApiError && err.code === "offset_mismatch") {
              offset = Number(err.details?.uploadedBytes ?? 0);
              continue;
            }
            throw err;
          }
          offset = media.uploadedBytes;
          await idbPut("uploads", { ...u, uploadedBytes: offset });
          notify();
        }
        await idbDelete("uploads", u.id);
        notify();
      } catch (err) {
        if (err instanceof NetworkError) break; // tenta de novo quando houver conexão
        await idbPut("uploads", {
          ...u,
          error: err instanceof Error ? err.message : "Falha no envio.",
        });
        notify();
      }
    }
  })().finally(() => {
    running = null;
  });
  return running;
}
