import type { SubmitResult } from "@rebania/sync-core";
import { Notice } from "./ui.tsx";

/** Mensagens honestas: sincronizado × salvo no aparelho × recusado. */
export function Outcome({ result, what }: { result: SubmitResult; what: string }) {
  if (result.status === "synced")
    return <Notice kind="success" text={`${what} registrado e sincronizado.`} />;
  if (result.status === "saved_locally")
    return <Notice kind="warning" text="Salvo no aparelho. Enviaremos quando houver conexão." />;
  return <Notice kind="danger" text={`Não registrado: ${result.message}`} />;
}
