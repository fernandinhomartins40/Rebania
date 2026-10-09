import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * Mídia do Rebania (ADR-008). Arquivos ficam em MEDIA_DIR, organizados por
 * organização/fazenda/anexo, e só são servidos por rota autenticada.
 */
// HEIC/HEIF fica de fora: o sharp pré-compilado não decodifica HEVC. O navegador
// do iPhone converte para JPEG quando o campo aceita apenas estes tipos.
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_CHUNK_BYTES = 2 * 1024 * 1024;
export const VARIANTS = { thumb: 320, display: 1280 } as const;
export type Variant = keyof typeof VARIANTS | "original";

export interface MediaKey {
  organizationId: string;
  farmId: string;
  attachmentId: string;
}

const UUID = /^[0-9a-f-]{36}$/;

export function mediaDir(root: string, k: MediaKey): string {
  for (const v of [k.organizationId, k.farmId, k.attachmentId]) {
    if (!UUID.test(v)) throw new Error("identificador de mídia inválido");
  }
  return path.join(root, k.organizationId, k.farmId, k.attachmentId);
}

export const partPath = (root: string, k: MediaKey) => path.join(mediaDir(root, k), "upload.part");
export const variantPath = (root: string, k: MediaKey, v: Variant) =>
  path.join(mediaDir(root, k), v === "original" ? "original.jpg" : `${v}.webp`);

/** Detecta o tipo real pelos primeiros bytes (não confia na extensão nem no header). */
export function sniffMime(head: Buffer): AllowedMime | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)
    return "image/jpeg";
  if (
    head.length >= 8 &&
    head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "image/png";
  if (
    head.length >= 12 &&
    head.toString("ascii", 0, 4) === "RIFF" &&
    head.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return null;
}

/** Acrescenta um bloco ao arquivo parcial no offset esperado. Retorna o novo tamanho. */
export async function appendChunk(
  root: string,
  k: MediaKey,
  offset: number,
  chunk: Buffer,
): Promise<number> {
  const dir = mediaDir(root, k);
  await mkdir(dir, { recursive: true });
  const file = partPath(root, k);
  const current = await stat(file).then(
    (s) => s.size,
    () => 0,
  );
  if (current !== offset) throw new OffsetMismatchError(current);
  const fh = await open(file, "a");
  try {
    await fh.write(chunk);
  } finally {
    await fh.close();
  }
  return offset + chunk.length;
}

export class OffsetMismatchError extends Error {
  constructor(public readonly actual: number) {
    super("offset divergente");
  }
}

export async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    createReadStream(file)
      .on("data", (d) => hash.update(d))
      .on("end", resolve)
      .on("error", reject);
  });
  return hash.digest("hex");
}

/** Confere checksum e tipo real; move para "received.bin" aguardando processamento. */
export async function finalizeUpload(
  root: string,
  k: MediaKey,
  expectedSha: string,
): Promise<AllowedMime> {
  const file = partPath(root, k);
  const actual = await sha256File(file);
  if (actual !== expectedSha) {
    await rm(file, { force: true });
    throw new Error("checksum divergente");
  }
  const fh = await open(file, "r");
  const head = Buffer.alloc(16);
  try {
    await fh.read(head, 0, 16, 0);
  } finally {
    await fh.close();
  }
  const mime = sniffMime(head);
  if (!mime) {
    await rm(file, { force: true });
    throw new Error("arquivo não é uma imagem suportada");
  }
  await rename(file, path.join(mediaDir(root, k), "received.bin"));
  return mime;
}

/**
 * Gera derivados (miniatura e exibição em WebP) e um original saneado em JPEG.
 * `rotate()` aplica a orientação EXIF; o sharp descarta metadados (inclusive GPS)
 * por padrão. O arquivo recebido é apagado ao final.
 */
export async function deriveVariants(root: string, k: MediaKey) {
  const received = path.join(mediaDir(root, k), "received.bin");
  const input = await readFile(received);
  const base = sharp(input, { failOn: "error" }).rotate();
  const meta = await base.metadata();
  await writeFile(
    variantPath(root, k, "original"),
    await base
      .clone()
      .resize({ width: 4096, height: 4096, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer(),
  );
  for (const [v, size] of Object.entries(VARIANTS)) {
    const buf = await base
      .clone()
      .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    await writeFile(variantPath(root, k, v as Variant), buf);
  }
  await rm(received, { force: true });
  const swap = (meta.orientation ?? 1) >= 5;
  return { width: swap ? meta.height : meta.width, height: swap ? meta.width : meta.height };
}

export async function removeMedia(root: string, k: MediaKey) {
  await rm(mediaDir(root, k), { recursive: true, force: true });
}
