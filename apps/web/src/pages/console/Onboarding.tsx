import { useState } from "react";
import { Link } from "react-router";
import { post } from "../../api/client.ts";
import { Empty, Field, formatDate, PageHead } from "../../components/ui.tsx";
import { CardForm, Loaded, RunButton, StageBadge, useResource, useStaff } from "./kit.tsx";

interface BoardItem {
  id: string;
  name: string;
  stage: string;
  accountManager: string | null;
  total: number;
  done: number;
  overdue: number;
  next: { title: string; dueOn: string | null; assignee: string | null } | null;
  signals: { key: string; label: string; done: boolean }[];
}
interface Template {
  id: string;
  name: string;
  steps: { title: string; description?: string }[];
}

/** T03 Implantações em andamento: progresso, atrasos, próximo passo e sinais do app. */
export function OnboardingPage() {
  const { can } = useStaff();
  const board = useResource<{ items: BoardItem[] }>("/v1/platform/onboarding");
  const templates = useResource<{ items: Template[] }>("/v1/platform/onboarding-templates");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState("");
  return (
    <section>
      <PageHead title="Implantações" />
      <Loaded r={board}>
        {(d) =>
          d.items.length === 0 ? (
            <Empty title="Nenhuma implantação em andamento">
              Novas implantações começam em <Link to="/console/clientes">Clientes</Link>.
            </Empty>
          ) : (
            <div className="console-table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Progresso</th>
                    <th>Próxima etapa</th>
                    <th>No app</th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link to={`/console/clientes/${o.id}?aba=implantacao`}>{o.name}</Link>{" "}
                        <StageBadge stage={o.stage} />
                        <div className="meta">{o.accountManager ?? "Sem responsável"}</div>
                      </td>
                      <td style={{ minWidth: 150 }}>
                        {o.total ? (
                          <>
                            <div className="progress-bar" aria-hidden="true">
                              <span style={{ width: `${(o.done / o.total) * 100}%` }} />
                            </div>
                            <div className="meta">
                              {o.done}/{o.total} etapas
                              {o.overdue ? (
                                <>
                                  {" "}
                                  ·{" "}
                                  <span className="badge badge-danger">
                                    {o.overdue} atrasada(s)
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </>
                        ) : (
                          <span className="badge badge-warn">sem checklist</span>
                        )}
                      </td>
                      <td>
                        {o.next ? (
                          <>
                            {o.next.title}
                            <div className="meta">
                              {o.next.assignee ?? "sem responsável"}
                              {o.next.dueOn ? ` · até ${formatDate(o.next.dueOn)}` : ""}
                            </div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {o.signals.filter((s) => s.done).length}/{o.signals.length}
                        <div className="meta">
                          {o.signals.find((s) => !s.done)?.label
                            ? `falta: ${o.signals.find((s) => !s.done)!.label.toLowerCase()}`
                            : "tudo em uso"}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Loaded>

      <h2 className="section-title">Modelos de checklist</h2>
      <Loaded r={templates}>
        {(d) => (
          <>
            {d.items.length === 0 ? (
              <p className="hint">Nenhum modelo. Crie um para padronizar as implantações.</p>
            ) : (
              <div className="grid two">
                {d.items.map((t) => (
                  <div className="card" key={t.id}>
                    <h3 style={{ marginTop: 0, fontSize: 16 }}>{t.name}</h3>
                    <ol style={{ margin: 0, paddingLeft: 20 }}>
                      {t.steps.map((s, i) => (
                        <li key={i}>{s.title}</li>
                      ))}
                    </ol>
                    {can("onboarding.manage") ? (
                      <div className="actions">
                        <RunButton
                          label="Arquivar"
                          confirmText={`Arquivar o modelo "${t.name}"? Checklists já criados não mudam.`}
                          run={async () => {
                            await post(`/v1/platform/onboarding-templates/${t.id}/archive`);
                            templates.reload();
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            {can("onboarding.manage") ? (
              creating ? (
                <CardForm
                  title="Novo modelo"
                  submitLabel="Criar modelo"
                  onCancel={() => setCreating(false)}
                  onSubmit={async () => {
                    await post("/v1/platform/onboarding-templates", {
                      name,
                      steps: steps
                        .split("\n")
                        .map((l) => l.trim())
                        .filter(Boolean)
                        .map((title) => ({ title })),
                    });
                    setCreating(false);
                    setName("");
                    setSteps("");
                    templates.reload();
                  }}
                >
                  <Field id="tp-name" label="Nome do modelo">
                    <input
                      id="tp-name"
                      required
                      minLength={2}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </Field>
                  <Field id="tp-steps" label="Etapas" hint="uma por linha, na ordem">
                    <textarea
                      id="tp-steps"
                      rows={8}
                      required
                      value={steps}
                      onChange={(e) => setSteps(e.target.value)}
                    />
                  </Field>
                </CardForm>
              ) : (
                <div className="actions">
                  <button className="btn btn-soft" onClick={() => setCreating(true)}>
                    Novo modelo
                  </button>
                </div>
              )
            ) : null}
          </>
        )}
      </Loaded>
    </section>
  );
}
