import { formatTaxId, maskTaxId, onlyDigits, taxIdKind } from "@rebania/domain";
import { Building2, MapPinPlus } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ApiError, errorMessage, get, post } from "../../api/client.ts";
import { Alert, Field } from "../../components/ui.tsx";
import { CardForm, StageBadge, TIMEZONES, useResource, useStaff } from "./kit.tsx";

interface Template {
  id: string;
  name: string;
}
interface TeamLite {
  items: { userId: string; name: string }[];
}
interface FoundCustomer {
  id: string;
  name: string;
  document: string | null;
  stage: string;
  city: string | null;
  state: string | null;
  farms: { id: string; name: string; timezone: string }[];
  farmLimit: number | null;
}

/** Qual formulário de implantação está aberto (com CPF/CNPJ já digitado, se veio de outro). */
export type ImplantationMode = { kind: "customer" | "farm"; document?: string } | null;

type Done =
  | { kind: "customer"; url: string; emailQueued: boolean }
  | { kind: "farm"; farm: string; customer: { id: string; name: string } };

/** Cliente dono do CPF/CNPJ digitado; `undefined` enquanto o documento não está completo. */
function useCustomerByDocument(document: string) {
  const digits = onlyDigits(document);
  const valid = taxIdKind(digits) !== null;
  const [state, setState] = useState<{
    digits: string;
    customer?: FoundCustomer | null;
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (!valid) return;
    let alive = true;
    get<{ customer: FoundCustomer | null }>(
      `/v1/platform/customers/lookup?document=${digits}`,
    ).then(
      (r) => alive && setState({ digits, customer: r.customer }),
      (e) => alive && setState({ digits, error: errorMessage(e) }),
    );
    return () => {
      alive = false;
    };
  }, [digits, valid]);
  const current = state?.digits === digits ? state : null;
  return {
    digits,
    valid,
    /** Algo digitado que (ainda) não é CPF nem CNPJ válido. */
    invalid: digits.length > 0 && !valid,
    searching: valid && !current,
    customer: current?.customer,
    error: current?.error,
  };
}

function DocumentInput({
  id,
  label,
  value,
  onChange,
  invalid,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
  autoFocus?: boolean;
}) {
  // CNPJ passa por 11 dígitos durante a digitação: o erro só aparece com 14 ou ao sair do campo.
  const [left, setLeft] = useState(false);
  const show = invalid && (left || onlyDigits(value).length === 14);
  return (
    <Field id={id} label={label} error={show ? "CPF ou CNPJ inválido. Confira os números." : null}>
      <input
        onBlur={() => setLeft(true)}
        onFocus={() => setLeft(false)}
        id={id}
        required
        inputMode="numeric"
        autoComplete="off"
        placeholder="000.000.000-00 ou 00.000.000/0000-00"
        autoFocus={autoFocus}
        aria-invalid={show || undefined}
        aria-describedby={show ? `${id}-error` : undefined}
        value={value}
        onChange={(e) => onChange(maskTaxId(e.target.value))}
      />
    </Field>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="form-block">
      <legend>{title}</legend>
      {hint ? <p className="hint">{hint}</p> : null}
      <div className="grid two" style={{ gap: 12 }}>
        {children}
      </div>
    </fieldset>
  );
}

function FarmLimitAlert({ count, limit }: { count: number; limit: number | null }) {
  if (limit === null || count < limit) return null;
  return (
    <Alert kind="warning">
      O contrato prevê {limit} fazenda(s) e o cliente já tem {count}. Dá para adicionar, mas combine
      um aditivo com o cliente.
    </Alert>
  );
}

function CustomerCard({ c }: { c: FoundCustomer }) {
  return (
    <div className="found-customer">
      <div>
        <Link to={`/console/clientes/${c.id}`} className="title">
          {c.name}
        </Link>{" "}
        <StageBadge stage={c.stage} />
        <div className="meta">
          {[formatTaxId(c.document), [c.city, c.state].filter(Boolean).join(" · ")]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
      <div className="meta">
        {c.farms.length === 0
          ? "Nenhuma fazenda ainda."
          : `Fazendas atuais (${c.farms.length}${c.farmLimit ? ` de ${c.farmLimit} contratadas` : ""}): ${c.farms.map((f) => f.name).join(", ")}`}
      </div>
      <FarmLimitAlert count={c.farms.length} limit={c.farmLimit} />
    </div>
  );
}

/** Fazenda nova num cliente que já existe, achado pelo CPF/CNPJ (ou já escolhido na ficha). */
export function AddFarmForm({
  customer: fixed,
  initialDocument = "",
  onCancel,
  onDone,
  onNewCustomer,
}: {
  customer?: { id: string; name: string; farms: string[]; farmLimit: number | null };
  initialDocument?: string;
  onCancel: () => void;
  onDone: (r: { farm: string; customer: { id: string; name: string } }) => void;
  /** Nenhum cliente com o documento: abre a nova implantação já com ele preenchido. */
  onNewCustomer?: (document: string) => void;
}) {
  const [document, setDocument] = useState(maskTaxId(initialDocument));
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(TIMEZONES[0]!);
  const lookup = useCustomerByDocument(fixed ? "" : document);
  const target = fixed ?? lookup.customer ?? null;
  return (
    <CardForm
      title={fixed ? `Adicionar fazenda a ${fixed.name}` : "Adicionar fazenda a um cliente"}
      submitLabel="Adicionar fazenda"
      canSubmit={Boolean(target)}
      onCancel={onCancel}
      onSubmit={async () => {
        if (!target)
          throw new ApiError(0, "no_customer", "Informe o CPF ou CNPJ de um cliente cadastrado.");
        await post(`/v1/platform/customers/${target.id}/farms`, { name, timezone });
        onDone({ farm: name.trim(), customer: { id: target.id, name: target.name } });
      }}
    >
      {fixed ? (
        <>
          <p className="hint">
            {fixed.farms.length
              ? `Fazendas atuais: ${fixed.farms.join(", ")}.`
              : "Este cliente ainda não tem fazenda."}
          </p>
          <FarmLimitAlert count={fixed.farms.length} limit={fixed.farmLimit} />
        </>
      ) : (
        <>
          <p className="hint">
            Use quando o cliente já existe e tem mais uma propriedade. A fazenda entra no mesmo
            cadastro, com a mesma equipe e o mesmo contrato.
          </p>
          <div className="grid two" style={{ gap: 12 }}>
            <DocumentInput
              id="af-doc"
              label="CPF ou CNPJ do cliente"
              value={document}
              onChange={setDocument}
              invalid={lookup.invalid}
              autoFocus
            />
          </div>
          {lookup.searching ? <p className="hint">Procurando cliente…</p> : null}
          {lookup.error ? <Alert kind="danger">{lookup.error}</Alert> : null}
          {lookup.customer ? <CustomerCard c={lookup.customer} /> : null}
          {lookup.customer === null ? (
            <>
              <Alert kind="info">
                Nenhum cliente com o CPF/CNPJ {formatTaxId(lookup.digits)}.
                {onNewCustomer ? " Se é um cliente novo, comece uma nova implantação." : null}
              </Alert>
              {onNewCustomer ? (
                <div className="actions" style={{ marginTop: 0 }}>
                  <button
                    type="button"
                    className="btn btn-soft"
                    onClick={() => onNewCustomer(lookup.digits)}
                  >
                    <Building2 size={20} aria-hidden="true" /> Nova implantação com este CPF/CNPJ
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </>
      )}
      {target ? (
        <div className="grid two" style={{ gap: 12 }}>
          <Field id="af-name" label="Nome da fazenda">
            <input
              id="af-name"
              required
              minLength={2}
              maxLength={120}
              autoFocus={Boolean(fixed)}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field id="af-tz" label="Fuso horário da fazenda">
            <select id="af-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {TIMEZONES.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </Field>
        </div>
      ) : null}
    </CardForm>
  );
}

/** Cliente novo: cadastro + proprietário (convite) + primeira fazenda + acompanhamento. */
export function NewCustomerForm({
  initialDocument = "",
  onCancel,
  onDone,
  onAddFarm,
}: {
  initialDocument?: string;
  onCancel: () => void;
  onDone: (c: { url: string; emailQueued: boolean }) => void;
  /** O CPF/CNPJ já é de um cliente: abre "Adicionar fazenda" com ele. */
  onAddFarm: (document: string) => void;
}) {
  const templates = useResource<{ items: Template[] }>("/v1/platform/onboarding-templates");
  const team = useResource<TeamLite>("/v1/platform/staff");
  const [f, setF] = useState({
    document: maskTaxId(initialDocument),
    orgName: "",
    phone: "",
    city: "",
    state: "",
    ownerName: "",
    ownerEmail: "",
    farmName: "",
    timezone: TIMEZONES[0]!,
    stage: "onboarding",
    templateId: "",
    accountManagerId: "",
  });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  const lookup = useCustomerByDocument(f.document);
  const existing = lookup.customer;
  return (
    <CardForm
      title="Nova implantação"
      submitLabel="Criar cliente e convidar proprietário"
      canSubmit={!existing}
      onCancel={onCancel}
      onSubmit={async () => {
        if (existing)
          throw new ApiError(
            409,
            "document_in_use",
            `Este CPF/CNPJ já é do cliente "${existing.name}". Use "Adicionar fazenda".`,
          );
        if (!lookup.valid) throw new ApiError(422, "invalid_document", "CPF ou CNPJ inválido.");
        const r = await post<{ acceptUrl: string; emailQueued: boolean }>(
          "/v1/platform/customers",
          {
            document: lookup.digits,
            orgName: f.orgName,
            farmName: f.farmName,
            ownerEmail: f.ownerEmail,
            timezone: f.timezone,
            stage: f.stage,
            ...(f.ownerName ? { ownerName: f.ownerName } : {}),
            ...(f.phone ? { phone: f.phone } : {}),
            ...(f.city ? { city: f.city } : {}),
            ...(f.state ? { state: f.state } : {}),
            ...(f.templateId ? { templateId: f.templateId } : {}),
            ...(f.accountManagerId ? { accountManagerId: f.accountManagerId } : {}),
          },
        );
        onDone({ url: r.acceptUrl, emailQueued: r.emailQueued });
      }}
    >
      <Block title="1. Cliente" hint="Quem contrata: pessoa (CPF) ou empresa (CNPJ).">
        <DocumentInput
          id="n-doc"
          label="CPF ou CNPJ"
          value={f.document}
          onChange={(v) => setF({ ...f, document: v })}
          invalid={lookup.invalid}
          autoFocus
        />
        <Field id="n-org" label="Nome do cliente" hint="como no contrato">
          <input id="n-org" required minLength={2} value={f.orgName} onChange={up("orgName")} />
        </Field>
        <Field id="n-phone" label="Telefone" hint="opcional">
          <input id="n-phone" type="tel" value={f.phone} onChange={up("phone")} />
        </Field>
        <div className="grid two" style={{ gap: 12, gridTemplateColumns: "1fr 80px" }}>
          <Field id="n-city" label="Cidade" hint="opcional">
            <input id="n-city" value={f.city} onChange={up("city")} />
          </Field>
          <Field id="n-state" label="UF">
            <input id="n-state" maxLength={2} value={f.state} onChange={up("state")} />
          </Field>
        </div>
      </Block>
      {existing ? (
        <>
          <Alert kind="warning">
            Este CPF/CNPJ já é do cliente <strong>{existing.name}</strong>. Para mais uma
            propriedade dele, não crie outro cliente: adicione a fazenda ao cadastro existente.
          </Alert>
          <div className="actions" style={{ marginTop: 0, marginBottom: 16 }}>
            <button type="button" className="btn btn-soft" onClick={() => onAddFarm(lookup.digits)}>
              <MapPinPlus size={20} aria-hidden="true" /> Adicionar fazenda a {existing.name}
            </button>
          </div>
        </>
      ) : null}
      <Block title="2. Proprietário" hint="Recebe o convite para entrar e montar a equipe.">
        <Field id="n-owner" label="Nome" hint="opcional">
          <input id="n-owner" value={f.ownerName} onChange={up("ownerName")} />
        </Field>
        <Field id="n-email" label="E-mail">
          <input
            id="n-email"
            type="email"
            required
            value={f.ownerEmail}
            onChange={up("ownerEmail")}
          />
        </Field>
      </Block>
      <Block
        title="3. Primeira fazenda"
        hint="Outras fazendas do mesmo cliente entram depois, em “Adicionar fazenda”."
      >
        <Field id="n-farm" label="Nome da fazenda">
          <input id="n-farm" required minLength={2} value={f.farmName} onChange={up("farmName")} />
        </Field>
        <Field id="n-tz" label="Fuso horário da fazenda">
          <select id="n-tz" value={f.timezone} onChange={up("timezone")}>
            {TIMEZONES.map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </Field>
      </Block>
      <Block title="4. Acompanhamento">
        <Field id="n-stage" label="Estágio inicial">
          <select id="n-stage" value={f.stage} onChange={up("stage")}>
            <option value="onboarding">Em implantação</option>
            <option value="lead">Negociação</option>
          </select>
        </Field>
        <Field id="n-tpl" label="Checklist de implantação">
          <select id="n-tpl" value={f.templateId} onChange={up("templateId")}>
            <option value="">Sem checklist</option>
            {templates.data?.items.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        {team.data ? (
          <Field id="n-mgr" label="Responsável na equipe">
            <select id="n-mgr" value={f.accountManagerId} onChange={up("accountManagerId")}>
              <option value="">Ninguém</option>
              {team.data.items.map((t) => (
                <option key={t.userId} value={t.userId}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </Block>
    </CardForm>
  );
}

/** Botões "Nova implantação" e "Adicionar fazenda" (cabeçalho das páginas). */
export function ImplantationButtons({ onOpen }: { onOpen: (m: ImplantationMode) => void }) {
  const { can } = useStaff();
  if (!can("customers.write")) return null;
  return (
    <span className="actions" style={{ marginTop: 0 }}>
      <button className="btn btn-soft" onClick={() => onOpen({ kind: "customer" })}>
        <Building2 size={20} aria-hidden="true" /> Nova implantação
      </button>
      <button className="btn btn-ghost" onClick={() => onOpen({ kind: "farm" })}>
        <MapPinPlus size={20} aria-hidden="true" /> Adicionar fazenda
      </button>
    </span>
  );
}

/** Formulário aberto + resultado da última ação. */
export function ImplantationPanel({
  mode,
  setMode,
  onChanged,
}: {
  mode: ImplantationMode;
  setMode: (m: ImplantationMode) => void;
  onChanged: () => void;
}) {
  const [done, setDone] = useState<Done | null>(null);
  const open = (m: ImplantationMode) => {
    setDone(null);
    setMode(m);
  };
  return (
    <>
      {mode?.kind === "customer" ? (
        <NewCustomerForm
          key={`c-${mode.document ?? ""}`}
          initialDocument={mode.document}
          onCancel={() => setMode(null)}
          onAddFarm={(document) => open({ kind: "farm", document })}
          onDone={(c) => {
            setDone({ kind: "customer", ...c });
            setMode(null);
            onChanged();
          }}
        />
      ) : null}
      {mode?.kind === "farm" ? (
        <AddFarmForm
          key={`f-${mode.document ?? ""}`}
          initialDocument={mode.document}
          onCancel={() => setMode(null)}
          onNewCustomer={(document) => open({ kind: "customer", document })}
          onDone={(r) => {
            setDone({ kind: "farm", ...r });
            setMode(null);
            onChanged();
          }}
        />
      ) : null}
      {done?.kind === "customer" ? (
        <Alert kind="success">
          Cliente criado.{" "}
          {done.emailQueued
            ? "O convite foi enviado por e-mail ao proprietário."
            : "O e-mail está desligado: entregue este convite ao proprietário (exibido uma única vez):"}
          {done.emailQueued ? null : <p className="secret-box">{done.url}</p>}
        </Alert>
      ) : null}
      {done?.kind === "farm" ? (
        <Alert kind="success">
          Fazenda “{done.farm}” adicionada a{" "}
          <Link to={`/console/clientes/${done.customer.id}`}>{done.customer.name}</Link>. Quem tem
          acesso a todas as fazendas, como o proprietário, já a vê no app; quem foi convidado só
          para fazendas específicas não a vê.
        </Alert>
      ) : null}
    </>
  );
}
