import { createHash } from "node:crypto";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  appendChunk,
  deriveVariants,
  finalizeUpload,
  OffsetMismatchError,
  sniffMime,
  variantPath,
} from "./index.ts";

const key = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  farmId: "00000000-0000-4000-8000-000000000002",
  attachmentId: "00000000-0000-4000-8000-000000000003",
};

async function jpegWithGps() {
  return sharp({ create: { width: 2000, height: 1000, channels: 3, background: "#6a8" } })
    .jpeg()
    .withExif({
      IFD0: { Make: "TesteCam" },
      IFD3: { GPSLatitudeRef: "S", GPSLatitude: "15/1 30/1 0/1" },
    })
    .toBuffer();
}

describe("mídia", () => {
  it("detecta tipo real pelos bytes", async () => {
    expect(sniffMime(await jpegWithGps())).toBe("image/jpeg");
    expect(sniffMime(Buffer.from("<html>"))).toBeNull();
  });

  it("upload retomável por offset, checksum e derivados sem metadados", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "media-"));
    const file = await jpegWithGps();
    const sha = createHash("sha256").update(file).digest("hex");
    const half = Math.floor(file.length / 2);
    let offset = await appendChunk(root, key, 0, file.subarray(0, half));
    await expect(appendChunk(root, key, 0, file.subarray(0, half))).rejects.toBeInstanceOf(
      OffsetMismatchError,
    );
    offset = await appendChunk(root, key, offset, file.subarray(half));
    expect(offset).toBe(file.length);
    expect(await finalizeUpload(root, key, sha)).toBe("image/jpeg");
    const dims = await deriveVariants(root, key);
    expect(dims).toEqual({ width: 2000, height: 1000 });
    const thumb = await sharp(await readFile(variantPath(root, key, "thumb"))).metadata();
    expect(thumb.width).toBe(320);
    const original = await sharp(await readFile(variantPath(root, key, "original"))).metadata();
    expect(original.exif).toBeUndefined();
    expect((await stat(variantPath(root, key, "display"))).size).toBeGreaterThan(0);
  });

  it("checksum divergente é rejeitado", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "media-"));
    await appendChunk(root, key, 0, Buffer.from([0xff, 0xd8, 0xff, 0x00]));
    await expect(finalizeUpload(root, key, "0".repeat(64))).rejects.toThrow(/checksum/);
  });
});
