import type { GroupOperationResult } from "@rebania/contracts";
import type { SubmitResult } from "../offline/engine.ts";
import type { LocalAnimal } from "../offline/engine.ts";
import { Alert } from "./ui.tsx";

/** Resultado honesto de operação em grupo: realizados, exceções e estado de sincronização. */
export function GroupOutcome({
  result,
  detail,
  animals,
  label,
}: {
  result: SubmitResult;
  detail?: GroupOperationResult | null;
  animals: LocalAnimal[];
  label: string;
}) {
  const tag = (id: string) => animals.find((a) => a.id === id)?.primaryIdentifier ?? id.slice(0, 8);
  if (result.status === "saved_locally")
    return (
      <Alert kind="warning">
        Salvo no aparelho. Enviaremos quando houver conexão; exceções aparecerão na Central de
        Sincronização.
      </Alert>
    );
  if (result.status !== "synced")
    return <Alert kind="danger">Não registrado: {result.message}</Alert>;
  return (
    <>
      <Alert kind="success">
        {label}: {detail?.done.length ?? "—"} animal(is) registrados e sincronizados.
      </Alert>
      {detail?.exceptions.length ? (
        <Alert kind="warning">
          {detail.exceptions.length} exceção(ões) — não registradas:
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {detail.exceptions.map((e) => (
              <li key={e.animalId}>
                {tag(e.animalId)}: {e.message}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
    </>
  );
}
