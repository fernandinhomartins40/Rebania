import { HttpError } from "./errors.ts";

/** Versão esperada divergente: nada é sobrescrito; cliente precisa revisar. */
export class VersionConflictError extends HttpError {
  constructor(
    public readonly entityId: string,
    public readonly serverVersion: number,
  ) {
    super(
      409,
      "version_conflict",
      "Este animal foi alterado em outro aparelho. Revise a versão atual antes de salvar.",
      { entityId, serverVersion },
    );
  }
}
