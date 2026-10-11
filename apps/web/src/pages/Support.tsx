import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { errorMessage, get, post } from "../api/client.ts";
import { Alert, Empty, Field, formatDateTime, Loading, PageHead } from "../components/ui.tsx";
import { useSession } from "../state/session.tsx";

interface TicketRow {
  id: string;
  number: number;
  subject: string;
  status: "open" | "waiting_customer" | "resolved" | "closed";
  priority: string;
  updatedAt: string;
}

const STATUS: Record<TicketRow["status"], [string, string]> = {
  open: ["Com a equipe Rebania", "badge-info"],
  waiting_customer: ["Aguardando sua resposta", "badge-warn"],
  resolved: ["Resolvido", "badge-ok"],
  closed: ["Fechado", "badge-muted"],
};

function StatusBadge({ status }: { status: TicketRow["status"] }) {
  const [label, cls] = STATUS[status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

/** Chamados de suporte do cliente. Continua disponível mesmo com a conta em somente leitura. */
export function SupportPage() {
  const { farm } = useSession();
  const orgId = farm!.organizationId;
  const navigate = useNavigate();
  const [items, setItems] = useState<TicketRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ subject: "", body: "", priority: "normal" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    get<{ items: TicketRow[] }>(`/v1/orgs/${orgId}/support/tickets`).then(
      (r) => setItems(r.items),
      (e) => setError(errorMessage(e)),
    );
  }, [orgId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ id: string }>(`/v1/orgs/${orgId}/support/tickets`, {
        ...f,
        farmId: farm!.id,
      });
      navigate(`/fazenda/suporte/${r.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <PageHead
        title="Suporte"
        back="/fazenda"
        aside={
          !creating ? (
            <button className="btn btn-soft" onClick={() => setCreating(true)}>
              Novo chamado
            </button>
          ) : null
        }
      />
      {error ? <Alert kind="danger">{error}</Alert> : null}
      {creating ? (
        <form className="card" onSubmit={submit} style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Como podemos ajudar?</h2>
          <p className="hint">
            A equipe Rebania não vê os dados da sua fazenda. Se for preciso, ela pede um acesso de
            leitura que só o proprietário aprova.
          </p>
          <Field id="sp-subject" label="Assunto">
            <input
              id="sp-subject"
              required
              minLength={3}
              maxLength={160}
              value={f.subject}
              onChange={(e) => setF({ ...f, subject: e.target.value })}
            />
          </Field>
          <Field id="sp-body" label="O que está acontecendo">
            <textarea
              id="sp-body"
              rows={5}
              required
              minLength={5}
              value={f.body}
              onChange={(e) => setF({ ...f, body: e.target.value })}
            />
          </Field>
          <Field id="sp-priority" label="Urgência">
            <select
              id="sp-priority"
              value={f.priority}
              onChange={(e) => setF({ ...f, priority: e.target.value })}
            >
              <option value="low">Pode esperar</option>
              <option value="normal">Normal</option>
              <option value="high">Está atrapalhando o trabalho</option>
              <option value="urgent">Parou o manejo</option>
            </select>
          </Field>
          <div className="actions">
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Enviando…" : "Abrir chamado"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setCreating(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
      {!items ? (
        error ? null : (
          <Loading />
        )
      ) : items.length === 0 ? (
        <Empty title="Nenhum chamado">
          Abra um chamado quando precisar de ajuda da equipe Rebania.
        </Empty>
      ) : (
        <ul className="list">
          {items.map((t) => (
            <li key={t.id} className="list-item">
              <span>
                <Link className="title" to={`/fazenda/suporte/${t.id}`}>
                  #{t.number} {t.subject}
                </Link>
                <div className="meta">Atualizado {formatDateTime(t.updatedAt)}</div>
              </span>
              <StatusBadge status={t.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface TicketDto {
  id: string;
  number: number;
  subject: string;
  status: TicketRow["status"];
  messages: {
    id: string;
    authorKind: "customer" | "staff" | "system";
    authorName: string | null;
    body: string;
    createdAt: string;
  }[];
}

export function SupportTicketPage() {
  const { farm } = useSession();
  const orgId = farm!.organizationId;
  const { id } = useParams();
  const [t, setT] = useState<TicketDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    get<TicketDto>(`/v1/orgs/${orgId}/support/tickets/${id}`).then(setT, (e) =>
      setError(errorMessage(e)),
    );
  }, [orgId, id, tick]);
  if (error && !t) return <Alert kind="danger">{error}</Alert>;
  if (!t) return <Loading />;
  return (
    <section>
      <PageHead
        title={`#${t.number} ${t.subject}`}
        back="/fazenda/suporte"
        aside={<StatusBadge status={t.status} />}
      />
      {error ? <Alert kind="danger">{error}</Alert> : null}
      <ul className="thread">
        {t.messages.map((m) => (
          <li key={m.id} className={m.authorKind}>
            {m.authorKind === "system" ? (
              <>
                {m.body} · {formatDateTime(m.createdAt)}
              </>
            ) : (
              <>
                <div className="who">
                  {m.authorName} · {formatDateTime(m.createdAt)}
                </div>
                <div className="body">{m.body}</div>
              </>
            )}
          </li>
        ))}
      </ul>
      {t.status === "closed" ? (
        <Alert kind="info">Chamado fechado. Se precisar, abra um novo chamado.</Alert>
      ) : (
        <form
          className="card"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              await post(`/v1/orgs/${orgId}/support/tickets/${id}/messages`, { body });
              setBody("");
              setTick((n) => n + 1);
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <Field
            id="sp-reply"
            label={t.status === "resolved" ? "Responder (reabre o chamado)" : "Responder"}
          >
            <textarea
              id="sp-reply"
              rows={3}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
          <div className="actions">
            <button className="btn btn-primary">Enviar</button>
            {t.status !== "resolved" ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={async () => {
                  await post(`/v1/orgs/${orgId}/support/tickets/${id}/resolve`);
                  setTick((n) => n + 1);
                }}
              >
                Já foi resolvido
              </button>
            ) : null}
          </div>
        </form>
      )}
    </section>
  );
}
