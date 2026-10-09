import { z } from "zod";
import { civilDate, uuid } from "./common.ts";

export const MEDIA_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

export const CreateMediaInput = z.object({
  id: uuid,
  animalId: uuid.nullable().optional(),
  mime: z.enum(MEDIA_MIME),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(15 * 1024 * 1024, "Foto acima de 15 MB."),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  caption: z.string().trim().max(200).optional(),
  takenOn: civilDate.optional(),
});
export type CreateMediaInput = z.input<typeof CreateMediaInput>;

export const Media = z.object({
  id: uuid,
  animalId: uuid.nullable(),
  status: z.enum(["uploading", "processing", "ready", "failed"]),
  sizeBytes: z.number().int(),
  uploadedBytes: z.number().int(),
  caption: z.string().nullable(),
  takenOn: z.string().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  thumbUrl: z.string().nullable(),
  displayUrl: z.string().nullable(),
  createdAt: z.string(),
  authorName: z.string().nullable(),
});
export type Media = z.infer<typeof Media>;
