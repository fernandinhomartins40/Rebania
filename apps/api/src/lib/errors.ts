import { DomainError } from "@rebania/domain";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFound = (what = "Registro") =>
  new HttpError(404, "not_found", `${what} não encontrado.`);
export const forbidden = () =>
  new HttpError(403, "forbidden", "Seu perfil não tem permissão para esta ação.");
export const unauthorized = (message = "Sessão expirada. Entre novamente.") =>
  new HttpError(401, "unauthorized", message);

/** Violação de unicidade/FK do Postgres via Prisma (driver adapter). */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string }; meta?: { driverAdapterError?: { cause?: { kind?: string } } } };
  return (
    e?.code === "P2002" ||
    e?.cause?.code === "23505" ||
    e?.meta?.driverAdapterError?.cause?.kind === "UniqueConstraintViolation"
  );
}

export function isForeignKeyViolation(err: unknown): boolean {
  const e = err as { code?: string; meta?: { driverAdapterError?: { cause?: { kind?: string } } } };
  return (
    e?.code === "P2003" ||
    e?.meta?.driverAdapterError?.cause?.kind === "ForeignKeyConstraintViolation"
  );
}

export function zodDetails(err: ZodError) {
  return {
    issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  };
}

export function errorHandler(
  err: FastifyError | Error,
  req: FastifyRequest,
  reply: FastifyReply,
) {
  if (err instanceof HttpError) {
    return reply
      .status(err.status)
      .send({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof DomainError) {
    return reply
      .status(422)
      .send({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    return reply.status(400).send({
      error: { code: "validation_error", message: "Confira os campos informados.", details: zodDetails(err) },
    });
  }
  const fe = err as FastifyError;
  if (fe.statusCode === 429) {
    return reply
      .status(429)
      .send({ error: { code: "rate_limited", message: "Muitas tentativas. Aguarde um pouco." } });
  }
  if (fe.statusCode && fe.statusCode >= 400 && fe.statusCode < 500) {
    return reply
      .status(fe.statusCode)
      .send({ error: { code: fe.code ?? "bad_request", message: "Requisição inválida." } });
  }
  if (isUniqueViolation(err)) {
    return reply
      .status(409)
      .send({ error: { code: "duplicate", message: "Já existe um registro com esses dados." } });
  }
  req.log.error({ err }, "erro não tratado");
  return reply
    .status(500)
    .send({ error: { code: "internal_error", message: "Erro inesperado. Tente novamente." } });
}
