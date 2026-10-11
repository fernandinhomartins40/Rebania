import { useState } from "react";
import { post } from "../../api/client.ts";
import { Alert, Field, PageHead } from "../../components/ui.tsx";
import {
  emptyLimits,
  formToLimits,
  LimitsFields,
  limitsText,
  limitsToForm,
  type PlanDto,
} from "./CustomerMoney.tsx";
import { brl, CardForm, Loaded, RunButton, useResource, useStaff } from "./kit.tsx";

const reais = (v: string) =>
  v.trim() === "" ? null : Number(v.replace(/\./g, "").replace(",", "."));
const toInput = (cents: number | null) =>
  cents == null ? "" : (cents / 100).toFixed(2).replace(".", ",");

/** Catálogo de planos (versionado) e créditos do assistente (tabela por ação e pacotes). */
export function PlansPage() {
  const { can } = useStaff();
  const plans = useResource<{ items: PlanDto[] }>("/v1/platform/plans");
  const [editing, setEditing] = useState<PlanDto | "new" | null>(null);
  return (
    <section>
      <PageHead title="Planos e créditos" />
      <Alert kind="warning">
        Cadastre só valores aprovados. O catálogo nasce vazio e nada daqui aparece na página
        pública.
      </Alert>

      <h2 className="section-title">Catálogo de planos</h2>
      <Loaded r={plans}>
        {(d) => (
          <>
            {d.items.length === 0 ? <p className="hint">Nenhum plano cadastrado.</p> : null}
            <div className="grid two">
              {d.items.map((p) => (
                <div className="card" key={p.code}>
                  <h3 style={{ marginTop: 0, fontSize: 18 }}>
                    {p.name} <span className="badge badge-muted">versão {p.version}</span>{" "}
                    {p.archived ? <span className="badge badge-warn">arquivado</span> : null}
                  </h3>
                  {p.description ? <p>{p.description}</p> : null}
                  <div className="review">
                    <dl>
                      <dt>Implantação</dt>
                      <dd>{brl(p.implementationCents)}</dd>
                      <dt>Mensalidade</dt>
                      <dd>{brl(p.monthlyCents)}</dd>
                      <dt>Capacidade</dt>
                      <dd>{limitsText(p.limits)}</dd>
                      <dt>Contratos ativos</dt>
                      <dd>{p.activeContracts}</dd>
                    </dl>
                  </div>
                  {can("contracts.manage") ? (
                    <div className="actions">
                      <button className="btn btn-ghost" onClick={() => setEditing(p)}>
                        Nova versão
                      </button>
                      {!p.archived ? (
                        <RunButton
                          label="Arquivar"
                          confirmText={`Arquivar "${p.name}"? Contratos existentes continuam valendo.`}
                          run={async () => {
                            await post(`/v1/platform/plans/${p.code}/archive`);
                            plans.reload();
                          }}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            {can("contracts.manage") && !editing ? (
              <div className="actions">
                <button className="btn btn-soft" onClick={() => setEditing("new")}>
                  Novo plano
                </button>
              </div>
            ) : null}
            {editing ? (
              <PlanForm
                base={editing === "new" ? null : editing}
                onCancel={() => setEditing(null)}
                onDone={() => {
                  setEditing(null);
                  plans.reload();
                }}
              />
            ) : null}
          </>
        )}
      </Loaded>

      <Credits />
    </section>
  );
}

function PlanForm({
  base,
  onCancel,
  onDone,
}: {
  base: PlanDto | null;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [f, setF] = useState({
    name: base?.name ?? "",
    description: base?.description ?? "",
    implementation: toInput(base?.implementationCents ?? null),
    monthly: toInput(base?.monthlyCents ?? null),
  });
  const [limits, setLimits] = useState(base ? limitsToForm(base.limits) : emptyLimits);
  return (
    <CardForm
      title={base ? `Nova versão de ${base.name}` : "Novo plano"}
      submitLabel={base ? "Publicar nova versão" : "Criar plano"}
      onCancel={onCancel}
      onSubmit={async () => {
        await post(base ? `/v1/platform/plans/${base.code}/versions` : "/v1/platform/plans", {
          name: f.name,
          description: f.description || null,
          implementation: reais(f.implementation),
          monthly: reais(f.monthly),
          limits: formToLimits(limits),
        });
        onDone();
      }}
    >
      {base ? (
        <p className="hint">
          Contratos já firmados continuam com os termos da versão em que nasceram.
        </p>
      ) : null}
      <Field id="pl-name" label="Nome">
        <input
          id="pl-name"
          required
          minLength={2}
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
      </Field>
      <Field id="pl-desc" label="Descrição" hint="opcional">
        <input
          id="pl-desc"
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
        />
      </Field>
      <div className="grid two" style={{ gap: 12 }}>
        <Field id="pl-impl" label="Implantação (R$)" hint="vazio = a combinar">
          <input
            id="pl-impl"
            inputMode="decimal"
            value={f.implementation}
            onChange={(e) => setF({ ...f, implementation: e.target.value })}
          />
        </Field>
        <Field id="pl-month" label="Mensalidade (R$)" hint="vazio = a combinar">
          <input
            id="pl-month"
            inputMode="decimal"
            value={f.monthly}
            onChange={(e) => setF({ ...f, monthly: e.target.value })}
          />
        </Field>
      </div>
      <h3 style={{ fontSize: 16 }}>Capacidade incluída</h3>
      <LimitsFields idPrefix="pl-lim" value={limits} onChange={setLimits} />
    </CardForm>
  );
}

function Credits() {
  const { can } = useStaff();
  const manage = can("credits.manage");
  const cards = useResource<{ items: { version: number; actions: Record<string, number> }[] }>(
    "/v1/platform/rate-cards",
  );
  const packages = useResource<{
    items: { id: string; name: string; credits: number; priceCents: number }[];
  }>("/v1/platform/credit-packages");
  const [askCost, setAskCost] = useState("");
  const [pkg, setPkg] = useState({ name: "", credits: "", price: "" });
  const current = cards.data?.items[0];
  return (
    <>
      <h2 className="section-title">Créditos do assistente</h2>
      <div className="grid two">
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginTop: 0, fontSize: 18 }}>Tabela por ação</h3>
            {current ? (
              <p>
                Versão {current.version}:{" "}
                {Object.entries(current.actions)
                  .map(([k, v]) => `${k === "ask" ? "pergunta" : k} = ${v} crédito(s)`)
                  .join(", ")}
              </p>
            ) : (
              <p className="hint">
                Nenhuma tabela publicada: o assistente fica indisponível para os clientes.
              </p>
            )}
          </div>
          {manage ? (
            <CardForm
              title="Publicar nova versão"
              submitLabel="Publicar"
              onSubmit={async () => {
                await post("/v1/platform/rate-cards", { actions: { ask: Number(askCost) } });
                setAskCost("");
                cards.reload();
              }}
            >
              <Field id="rc-ask" label="Créditos por pergunta ao assistente">
                <input
                  id="rc-ask"
                  required
                  inputMode="numeric"
                  value={askCost}
                  onChange={(e) => setAskCost(e.target.value.replace(/\D/g, ""))}
                />
              </Field>
            </CardForm>
          ) : null}
        </div>
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginTop: 0, fontSize: 18 }}>Pacotes</h3>
            {packages.data?.items.length ? (
              <ul className="list">
                {packages.data.items.map((p) => (
                  <li key={p.id} className="list-item">
                    <span>
                      <span className="title">{p.name}</span>
                      <div className="meta">
                        {p.credits} créditos · {brl(p.priceCents)}
                      </div>
                    </span>
                    {manage ? (
                      <RunButton
                        label="Arquivar"
                        confirmText={`Arquivar o pacote "${p.name}"?`}
                        run={async () => {
                          await post(`/v1/platform/credit-packages/${p.id}/archive`);
                          packages.reload();
                        }}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">Nenhum pacote cadastrado.</p>
            )}
            <p className="hint">
              A compra online fica indisponível até haver provedor de pagamento; créditos entram por
              concessão na ficha do cliente.
            </p>
          </div>
          {manage ? (
            <CardForm
              title="Novo pacote"
              submitLabel="Cadastrar pacote"
              onSubmit={async () => {
                await post("/v1/platform/credit-packages", {
                  name: pkg.name,
                  credits: Number(pkg.credits),
                  price: reais(pkg.price),
                });
                setPkg({ name: "", credits: "", price: "" });
                packages.reload();
              }}
            >
              <Field id="pk-name" label="Nome">
                <input
                  id="pk-name"
                  required
                  value={pkg.name}
                  onChange={(e) => setPkg({ ...pkg, name: e.target.value })}
                />
              </Field>
              <div className="grid two" style={{ gap: 12 }}>
                <Field id="pk-credits" label="Créditos">
                  <input
                    id="pk-credits"
                    required
                    inputMode="numeric"
                    value={pkg.credits}
                    onChange={(e) => setPkg({ ...pkg, credits: e.target.value.replace(/\D/g, "") })}
                  />
                </Field>
                <Field id="pk-price" label="Preço (R$)">
                  <input
                    id="pk-price"
                    required
                    inputMode="decimal"
                    value={pkg.price}
                    onChange={(e) => setPkg({ ...pkg, price: e.target.value })}
                  />
                </Field>
              </div>
            </CardForm>
          ) : null}
        </div>
      </div>
    </>
  );
}
