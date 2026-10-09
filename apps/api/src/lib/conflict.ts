import { HttpError } from "./errors.ts";

/** Versão/estado divergente: nada é sobrescrito; cliente precisa revisar. */
export class VersionConflictError extends HttpError {
  constructor(
    public readonly entityId: string,
    public readonly serverVersion: number,
    code = "version_conflict",
    message = "Este animal foi alterado em outro aparelho. Revise a versão atual antes de salvar.",
  ) {
    super(409, code, message, { entityId, serverVersion });
  }
}
