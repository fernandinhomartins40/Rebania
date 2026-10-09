import type { FarmSettings } from "@rebania/contracts";
import { useEffect, useState } from "react";
import { errorMessage, get, patch } from "../api/client.ts";
import { Alert, Field, Loading, PageHead } from "../components/ui.tsx";
import { useSession } from "../state/session.tsx";

/** T44 Configurações: parâmetros que alimentam estimativas e tarefas (sempre declarados). */
export function SettingsPage() {
  const { farm, can, reload } = useSession();
  const [s, setS] = useState<FarmSettings | null>(null);
  const [msg, setMsg] = useState<{ kind: "success" | "danger"; text: string } | null>(null);
  useEffect(() => {
    get<FarmSettings>(`/v1/farms/${farm!.id}/settings`).then(setS, (e) =>
      setMsg({ kind: "danger", text: errorMessage(e) }),
    );
  }, [farm]);
  if (!s) return msg ? <Alert kind="danger">{msg.text}</Alert> : <Loading />;
  const editable = can("settings.manage");
  const num = (k: keyof FarmSettings["repro"], label: string, hint: string) => (
    <Field id={`set-${k}`} label={label} hint={hint}>
      <input
        id={`set-${k}`}
        type="number"
        inputMode="numeric"
        disabled={!editable}
        value={s.repro[k]}
        onChange={(e) => setS({ ...s, repro: { ...s.repro, [k]: Number(e.target.value) } })}
      />
    </Field>
  );
  return (
    <section>
      <PageHead title="Configurações" back="/fazenda" />
      {msg ? <Alert kind={msg.kind}>{msg.text}</Alert> : null}
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            setS(
              await patch<FarmSettings>(`/v1/farms/${farm!.id}/settings`, {
                name: s.name,
                repro: s.repro,
              }),
            );
            setMsg({ kind: "success", text: "Configurações salvas." });
            await reload();
          } catch (err) {
            setMsg({ kind: "danger", text: errorMessage(err) });
          }
        }}
      >
        <h2>Fazenda</h2>
        <Field id="set-name" label="Nome">
          <input
            id="set-name"
            disabled={!editable}
            value={s.name}
            onChange={(e) => setS({ ...s, name: e.target.value })}
          />
        </Field>
        <p className="hint">
          Fuso horário: {s.timezone} (datas civis da fazenda seguem este fuso).
        </p>
        <h2 style={{ marginTop: 24 }}>Reprodução</h2>
        <p className="hint">
          Parâmetros técnicos definidos pela fazenda/veterinário. São usados nas estimativas (sempre
          exibidas como estimativa, com a origem) e nas tarefas sugeridas.
        </p>
        <div className="grid two">
          {num("gestationDays", "Duração da gestação (dias)", "260–310")}
          {num("calvingWindowDays", "Margem da previsão de parto (± dias)", "0–30")}
          {num("pregnancyCheckAfterDays", "Diagnóstico após cobertura (dias)", "25–120")}
          {num("weaningAgeDays", "Idade de desmama (dias)", "90–300")}
        </div>
        {editable ? (
          <button className="btn btn-primary">Salvar</button>
        ) : (
          <p className="hint">Somente proprietário ou gerente altera estes parâmetros.</p>
        )}
      </form>
    </section>
  );
}
