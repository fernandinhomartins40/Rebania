import { z } from "zod";
import { isCivilDate } from "@rebania/domain";

export const uuid = z.uuid();
export const civilDate = z
  .string()
  .refine(isCivilDate, { message: "Data inválida (use AAAA-MM-DD)." });

export const ErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

export const Page = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });
