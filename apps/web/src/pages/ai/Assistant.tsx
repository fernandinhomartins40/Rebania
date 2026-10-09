import { ArrowUp, Check, CircleSlash, Coins, Sparkles, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ApiError, errorMessage, get, NetworkError, post } from "../../api/client.ts";
import { Alert, Empty, Loading, PageHead } from "../../components/ui.tsx";
import { useSession } from "../../state/session.tsx";
import { useSync } from "../../state/sync.tsx";

interface Status {
  enabled: boolean;
  provider: string;
  reason: string | null;
  balance: number;
  askCost: number | null;
}
interface Preview {
  title: string;
  targets: string[];
  fields: Record<string, string>;
  impact: string;
}
interface Draft {
  id: string;
  action: string;
  preview: Preview;
  hash: string;
}
interface Turn {
  question: string;
  answer?: string;
  error?: string;
  drafts: Draft[];
  consulted: string[];
  creditsUsed?: number;
}

const TOOL_LABEL: Record<string, string> = {
  searchAnimals: "busca no rebanho",
  getAnimalHistory: "histórico do animal",
  listDueTasks: "agenda",
  getHerdMetrics: "resumo do rebanho",
  prepareHealthEvent: "rascunho de aplicação",
  prepareMovement: "rascunho de movimentação",
  prepareMating: "rascunho de cobertura",
  prepareTask: "rascunho de tarefa",
};

/**
 * T40 Assistente inteligente: pergunta → dados consultados → resposta → próxima
 * ação. Nunca grava sozinho: rascunhos vão para "Revisar ação" e só viram registro
 * com confirmação. Sem provedor/créditos, explica e o manejo manual segue normal.
 */
export function AssistantPage() {
  const { farm } = useSession();
  const { engine } = useSync();
  const [status, setStatus] = useState<Status | null>(null);
  const [offline, setOffline] = useState(false);
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState<Draft | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    get<Status>(`/v1/farms/${farm!.id}/ai/status`).then(
      (s) => {
        setStatus(s);
        setOffline(false);
      },
      (e) => setOffline(e instanceof NetworkError),
    );
  }, [farm, tick]);

  async function ask(e: FormEvent) {
    e.preventDefault();
    const question = q.trim();
    if (!question) return;
    setBusy(true);
    setQ("");
    const turn: Turn = { question, drafts: [], consulted: [] };
    try {
      const r = await post<{
        answer: string;
        drafts: Draft[];
        toolCalls: { name: string; ok: boolean }[];
        creditsUsed: number;
      }>(`/v1/farms/${farm!.id}/ai/ask`, { question, requestId: crypto.randomUUID() });
      turn.answer = r.answer;
      turn.drafts = r.drafts;
      turn.creditsUsed = r.creditsUsed;
      turn.consulted = [
        ...new Set(r.toolCalls.filter((t) => t.ok).map((t) => TOOL_LABEL[t.name] ?? t.name)),
      ];
    } catch (err) {
      turn.error =
        err instanceof NetworkError
          ? "Sem conexão. O assistente precisa de internet; registros manuais funcionam offline."
          : errorMessage(err);
    }
    setTurns((t) => [...t, turn]);
    setBusy(false);
    setTick((n) => n + 1);
  }

  if (offline)
    return (
      <section>
        <PageHead title="Assistente inteligente" />
        <Alert kind="info">
          Sem conexão. O assistente precisa de internet; registros manuais funcionam offline.
        </Alert>
      </section>
    );
  if (!status) return <Loading />;

  return (
    <section className="assistant">
      <PageHead
        title="Assistente inteligente"
        aside={
          <span className="chip" title="Saldo de créditos da organização">
            <Coins size={16} aria-hidden="true" /> {status.balance} crédito(s)
          </span>
        }
      />
      {!status.enabled ? (
        <Empty title="Assistente indisponível" icon={<CircleSlash size={40} aria-hidden="true" />}>
          <p className="hint">{status.reason}</p>
          <p className="hint">
            Todos os registros, a agenda e os relatórios continuam funcionando normalmente.
          </p>
          <Link className="btn btn-secondary" to="/registrar">
            Registrar manualmente
          </Link>
        </Empty>
      ) : (
        <>
          <p className="hint">
            Pergunte sobre o rebanho ou peça para preparar um registro. Cada pergunta usa{" "}
            {status.askCost} crédito(s). Nada é gravado sem a sua confirmação.
          </p>
          <ol className="chat" aria-live="polite">
            {turns.map((t, i) => (
              <li key={i}>
                <p className="bubble me">{t.question}</p>
                {t.error ? (
                  <Alert kind="danger">{t.error}</Alert>
                ) : (
                  <div className="bubble ai">
                    {t.consulted.length ? (
                      <p className="meta">Dados consultados: {t.consulted.join(", ")}</p>
                    ) : null}
                    <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{t.answer}</p>
                    {t.drafts.map((d) => (
                      <button
                        key={d.id}
                        className="btn btn-soft"
                        style={{ marginTop: 8 }}
                        onClick={() => setReviewing(d)}
                      >
                        Revisar ação: {d.preview.title}
                      </button>
                    ))}
                    {t.creditsUsed ? (
                      <p className="meta">{t.creditsUsed} crédito(s) usados</p>
                    ) : null}
                  </div>
                )}
              </li>
            ))}
            {busy ? (
              <li>
                <Loading label="Consultando os dados da fazenda…" />
              </li>
            ) : null}
          </ol>
          <form className="ask-bar" onSubmit={ask}>
            <Sparkles size={20} aria-hidden="true" />
            <label htmlFor="ai-q" className="visually-hidden">
              Pergunta para o assistente
            </label>
            <input
              id="ai-q"
              value={q}
              maxLength={2000}
              placeholder="Ex.: quais vacas estão com parto previsto este mês?"
              onChange={(e) => setQ(e.target.value)}
              disabled={busy}
            />
            <button className="icon-btn" aria-label="Enviar pergunta" disabled={busy || !q.trim()}>
              <ArrowUp size={22} />
            </button>
          </form>
        </>
      )}
      {reviewing ? (
        <ReviewDrawer
          draft={reviewing}
          onClose={() => setReviewing(null)}
          onDone={() => {
            setReviewing(null);
            void engine.syncNow();
          }}
        />
      ) : null}
    </section>
  );
}

/** Drawer "Revisar ação": alvos, campos e impacto; confirma ou descarta. */
function ReviewDrawer({
  draft,
  onClose,
  onDone,
}: {
  draft: Draft;
  onClose: () => void;
  onDone: () => void;
}) {
  const { farm } = useSession();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="page-head">
          <h2 id="review-title" style={{ margin: 0 }}>
            Revisar ação
          </h2>
          <button className="icon-btn" aria-label="Fechar" onClick={onClose}>
            <X size={22} />
          </button>
        </div>
        <h3>{draft.preview.title}</h3>
        <div className="review">
          <dl>
            <dt>Animais</dt>
            <dd>{draft.preview.targets.length ? draft.preview.targets.join(", ") : "—"}</dd>
            {Object.entries(draft.preview.fields).map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
            <dt>Impacto</dt>
            <dd>{draft.preview.impact}</dd>
            <dt>Custo</dt>
            <dd>Confirmar não consome créditos.</dd>
          </dl>
        </div>
        <p className="hint">
          Preparado pelo assistente. Confira os animais e os campos; se algo estiver errado,
          descarte e registre pela tela de Registrar.
        </p>
        {result ? <Alert kind={result.ok ? "success" : "danger"}>{result.message}</Alert> : null}
        {!result?.ok ? (
          <div className="actions">
            <button
              className="btn btn-primary btn-lg"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await post(`/v1/farms/${farm!.id}/ai/drafts/${draft.id}/confirm`, {
                    hash: draft.hash,
                  });
                  setResult({ ok: true, message: "Registrado e sincronizado." });
                  setTimeout(onDone, 900);
                } catch (e) {
                  setResult({
                    ok: false,
                    message: e instanceof ApiError ? e.message : "Sem conexão. Tente novamente.",
                  });
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Check size={20} aria-hidden="true" />{" "}
              {busy ? "Confirmando…" : "Confirmar e registrar"}
            </button>
            <button
              className="btn btn-ghost"
              onClick={async () => {
                await post(`/v1/farms/${farm!.id}/ai/drafts/${draft.id}/cancel`, {}).catch(
                  () => {},
                );
                onClose();
              }}
            >
              Descartar
            </button>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
