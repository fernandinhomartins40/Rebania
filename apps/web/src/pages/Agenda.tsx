import type { TaskDto } from "@rebania/contracts";
import { addDays, daysBetween, todayInTimezone } from "@rebania/domain";
import { CalendarDays, Check, ChevronRight, Plus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { errorMessage, get, post } from "../api/client.ts";
import { Alert, Empty, Field, Loading, PageHead, formatDate } from "../components/ui.tsx";
import { idbGet, idbPut } from "../offline/idb.ts";
import { useLocalHerd } from "../state/local-data.ts";
import { useSession } from "../state/session.tsx";
import { useSync } from "../state/sync.tsx";

/** Para cada tipo de tarefa, o registro que a resolve (origem rastreável). */
function actionFor(t: TaskDto): { to: string; label: string } | null {
  const ids = t.animalIds.join(",");
  if (t.type === "pregnancy_check")
    return { to: `/registrar/diagnostico?animais=${ids}`, label: "Registrar diagnóstico" };
  if (t.type === "weaning")
    return { to: `/registrar/desmama?animais=${ids}`, label: "Registrar desmama" };
  if (t.type === "protocol_insemination")
    return {
      to: `/registrar/inseminacao?animais=${ids}&execucao=${t.sourceId ?? ""}`,
      label: "Registrar inseminação",
    };
  if (t.type === "health_application")
    return { to: `/registrar/sanidade?animais=${ids}`, label: "Registrar aplicação" };
  return null;
}

const SOURCE_LABEL: Record<string, string> = {
  breeding_operation: "Gerada pela cobertura/inseminação",
  birth: "Gerada pelo nascimento",
  protocol_execution: "Etapa de protocolo IATF",
  health_plan: "Calendário sanitário",
};

/** T41 Agenda: atrasadas, hoje e próximas; cada tarefa mostra a origem e o registro que a resolve. */
export function AgendaPage() {
  const { farm, can } = useSession();
  const { version } = useSync();
  const { animals } = useLocalHerd(farm!.id);
  const [tasks, setTasks] = useState<TaskDto[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ title: string; dueOn: string } | null>(null);
  const today = todayInTimezone(farm!.timezone);
  const cacheKey = `tasks:${farm!.id}`;

  const load = useCallback(async () => {
    try {
      const list = await get<TaskDto[]>(`/v1/farms/${farm!.id}/tasks`);
      setTasks(list);
      setOffline(false);
      await idbPut("meta", JSON.stringify(list), cacheKey);
    } catch {
      const cached = await idbGet<string>("meta", cacheKey);
      setTasks(cached ? (JSON.parse(cached) as TaskDto[]) : []);
      setOffline(true);
    }
  }, [farm, cacheKey]);
  useEffect(() => void load(), [load, version]);

  const tag = (id: string) => animals?.find((a) => a.id === id)?.primaryIdentifier ?? "?";
  if (!tasks) return <Loading />;
  const groups: [string, TaskDto[]][] = [
    ["Atrasadas", tasks.filter((t) => daysBetween(t.dueOn, today) > 0)],
    ["Hoje", tasks.filter((t) => t.dueOn === today)],
    ["Próximos 7 dias", tasks.filter((t) => t.dueOn > today && t.dueOn <= addDays(today, 7))],
    ["Depois", tasks.filter((t) => t.dueOn > addDays(today, 7))],
  ];

  const act = async (t: TaskDto, action: "complete" | "cancel") => {
    let resolution: string | undefined;
    if (action === "cancel") {
      resolution = prompt("Justificativa do cancelamento:") ?? undefined;
      if (!resolution || resolution.trim().length < 3) return;
    }
    try {
      await post(`/v1/farms/${farm!.id}/tasks/${t.id}/${action}`, resolution ? { resolution } : {});
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <section>
      <PageHead
        title="Agenda"
        aside={
          can("tasks.manage") ? (
            <button className="btn btn-soft" onClick={() => setForm({ title: "", dueOn: today })}>
              <Plus size={18} /> Tarefa
            </button>
          ) : null
        }
      />
      {offline ? (
        <Alert kind="info">
          Sem conexão: mostrando a última agenda baixada. Concluir tarefas exige conexão.
        </Alert>
      ) : null}
      {error ? <Alert kind="danger">{error}</Alert> : null}
      {form ? (
        <form
          className="card"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await post(`/v1/farms/${farm!.id}/tasks`, form);
              setForm(null);
              await load();
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <div className="grid two">
            <Field id="t-title" label="Tarefa">
              <input
                id="t-title"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </Field>
            <Field id="t-due" label="Prazo" icon={<CalendarDays size={22} aria-hidden="true" />}>
              <input
                id="t-due"
                type="date"
                required
                value={form.dueOn}
                onChange={(e) => setForm({ ...form, dueOn: e.target.value })}
              />
            </Field>
          </div>
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="btn btn-primary">Criar</button>
            <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
      {tasks.length === 0 ? (
        <Empty title="Nenhuma tarefa aberta" icon={<CalendarDays size={44} aria-hidden="true" />}>
          <p className="hint">
            Tarefas surgem dos manejos (diagnóstico após inseminação, desmama após nascimento,
            etapas de protocolo) ou podem ser criadas manualmente.
          </p>
        </Empty>
      ) : (
        groups
          .filter(([, l]) => l.length)
          .map(([title, list]) => (
            <div key={title}>
              <div className="section-head">
                <h2 style={{ color: title === "Atrasadas" ? "var(--color-danger)" : undefined }}>
                  {title} ({list.length})
                </h2>
              </div>
              <div className="prio-list">
                {list.map((t) => {
                  const action = actionFor(t);
                  return (
                    <div key={t.id} className="prio" style={{ cursor: "default" }}>
                      <button
                        type="button"
                        className="prio-main"
                        style={{
                          background: "none",
                          border: 0,
                          textAlign: "left",
                          font: "inherit",
                          cursor: "pointer",
                          width: "100%",
                        }}
                        aria-expanded={open === t.id}
                        onClick={() => setOpen(open === t.id ? null : t.id)}
                      >
                        <CalendarDays size={34} className="ic" aria-hidden="true" />
                        <span style={{ flex: 1 }}>
                          <strong>{t.title}</strong>
                          <small style={{ display: "block" }}>
                            {formatDate(t.dueOn)} · {t.animalIds.length} animal(is)
                            {t.sourceType ? ` · ${SOURCE_LABEL[t.sourceType] ?? t.sourceType}` : ""}
                          </small>
                        </span>
                        <ChevronRight
                          size={22}
                          aria-hidden="true"
                          style={{ transform: open === t.id ? "rotate(90deg)" : undefined }}
                        />
                      </button>
                      {open === t.id ? (
                        <div style={{ padding: "0 16px 16px" }}>
                          {t.description ? <p className="hint">{t.description}</p> : null}
                          {t.animalIds.length ? (
                            <p className="hint">
                              Animais: {t.animalIds.slice(0, 60).map(tag).join(", ")}
                            </p>
                          ) : null}
                          <div className="actions" style={{ marginTop: 8 }}>
                            {action ? (
                              <Link className="btn btn-primary" to={action.to}>
                                {action.label}
                              </Link>
                            ) : null}
                            {!offline ? (
                              <button
                                className="btn btn-secondary"
                                onClick={() => void act(t, "complete")}
                              >
                                <Check size={18} /> Concluir
                              </button>
                            ) : null}
                            {!offline ? (
                              <button
                                className="btn btn-ghost"
                                onClick={() => void act(t, "cancel")}
                              >
                                <X size={18} /> Cancelar
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
      )}
    </section>
  );
}
