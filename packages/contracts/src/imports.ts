import { IMPORT_COLUMNS } from "@rebania/domain";
import { z } from "zod";
import { uuid } from "./common.ts";

const RawRow = z.partialRecord(z.enum(IMPORT_COLUMNS), z.string().max(500));

export const IMPORT_MAX_ROWS = 5000;

export const ImportPreviewRequest = z.object({
  rows: z
    .array(z.object({ line: z.number().int().positive(), raw: RawRow }))
    .min(1)
    .max(IMPORT_MAX_ROWS),
});

export const ImportRowStatus = z.object({
  line: z.number().int(),
  status: z.enum(["valid", "invalid"]),
  errors: z.array(z.string()),
  tag: z.string().nullable(),
  newGroup: z.string().nullable(),
});
export type ImportRowStatus = z.infer<typeof ImportRowStatus>;

export const ImportPreviewResponse = z.object({
  rows: z.array(ImportRowStatus),
  valid: z.number().int(),
  invalid: z.number().int(),
  newGroups: z.array(z.string()),
});
export type ImportPreviewResponse = z.infer<typeof ImportPreviewResponse>;

export const ImportCommitRequest = z.object({
  fileName: z.string().trim().min(1).max(200),
  rows: z
    .array(z.object({ line: z.number().int().positive(), mutationId: uuid, raw: RawRow }))
    .min(1)
    .max(IMPORT_MAX_ROWS),
});
