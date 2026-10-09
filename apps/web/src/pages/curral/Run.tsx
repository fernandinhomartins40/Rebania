import type { HandlingSessionDto } from "@rebania/contracts";
import {
  ADMIN_ROUTE_LABEL,
  candidateIdentifiers,
  CATEGORY_LABEL,
  formatQuantity,
  todayInTimezone,
  weightConsistencyWarning,
  type AdminRoute,
  type HandlingItemStatus,
} from "@rebania/domain";
import { KeyboardWedgeReader, ReadDeduper } from "@rebania/hardware";
import {
  Bluetooth,
  BluetoothOff,
  Check,
  CircleHelp,
  Keyboard,
  ScanBarcode,
  SkipForward,
  Undo2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { ApiError, errorMessage, get, post } from "../../api/client.ts";
import {
  Alert,
  AnimalPhoto,
  Empty,
  formatDate,
  formatDateTime,
  formatKg,
  Loading,
  PageHead,
} from "../../components/ui.tsx";
import {
  fromServer,
  loadSession,
  saveSession,
  summaryOf,
  type LocalSession,
} from "../../offline/curral.ts";
import { newMutationBase, type LocalAnimal } from "../../offline/engine.ts";
import { pendingUploads } from "../../offline/uploads.ts";
import { useLocalHerd } from "../../state/local-data.ts";
import { useSession } from "../../state/session.tsx";
import { useSync } from "../../state/sync.tsx";

type Notice =
  | { kind: "repeat"; animalId: string; at: string | null }
  | { kind: "outside"; animalId: string }
  | { kind: "unknown"; value: string }
  | { kind: "ambiguous"; ids: string[]; value: string }
  | { kind: "suppressed"; value: string }
  | { kind: "saved"; text: string; tone: "success" | "warning" | "danger" };

type ListTab = "pending" | "done" | "skipped" | "exceptions";

/** T27 Sessão de Curral + T28 encerramento. */
export function CurralRunPage() {
  const { id } = useParams();
  const { farm } = useSession();
  const { engine, state } = useSync();
  const { animals } = useLocalHerd(farm!.id);
  const [s, setS] = useState<LocalSession | null | undefined>(undefined);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [line, setLine] = useState("");
  const [weight, setWeight] = useState("");
  const [skipNote, setSkipNote] = useState<string | null>(null);
  const [tab, setTab] = useState<ListTab>("pending");
  const [closing, setClosing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Cada leitura/ação gera um aviso novo; resultados de envio que chegam depois
  // não podem sobrescrever o aviso da leitura seguinte (operador já avançou).
  const seq = useRef(0);
  const show = useCallback((n: Notice | null) => {
    seq.current++;
    setNotice(n);
  }, []);
  const showLater = useCallback((at: number, n: Notice) => {
    if (seq.current === at) setNotice(n);
  }, []);
  const reader = useMemo(() => new KeyboardWedgeReader(), []);
  const deduper = useMemo(() => new ReadDeduper(4000), []);

  // Carrega do aparelho; se não houver (outro aparelho), busca no servidor.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const local = await loadSession(id!);
      if (local) {
        deduper.restore(local.reads);
        if (alive) setS(local);
        return;
      }
      try {
        const dto = await get<HandlingSessionDto>(`/v1/farms/${farm!.id}/handling-sessions/${id}`);
        const fresh = fromServer(farm!.id, dto);
        if (fresh.status === "open") await saveSession(fresh);
        if (alive) setS(fresh);
      } catch {
        if (alive) setS(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, farm, deduper]);

  useEffect(() => {
    if (!s) return;
    if (s.readerConnected) void reader.connect();
    else void reader.disconnect();
  }, [s?.readerConnected, reader, s]);

  // Ref com o estado mais recente: ações em sequência (marcar → próxima leitura)
  // nunca partem de uma cópia antiga, e cada mudança é gravada no aparelho.
  const ref = useRef<LocalSession | null>(null);
  ref.current = s ?? null;
  const update = useCallback(async (fn: (prev: LocalSession) => LocalSession) => {
    if (!ref.current) return;
    const next = fn(ref.current);
    ref.current = next;
    setS(next);
    await saveSession(next);
  }, []);

  const byId = useMemo(() => new Map((animals ?? []).map((a) => [a.id, a])), [animals]);

  if (s === undefined || !animals) return <Loading />;
  if (s === null)
    return (
      <Empty title="Sessão não encontrada">
        <Link to="/curral">Voltar ao Modo Curral</Link>
      </Empty>
    );

  const session = s;
  const today = todayInTimezone(farm!.timezone);
  const itemOf = (animalId: string) => session.items.find((i) => i.animalId === animalId);
  const current = session.currentId ? byId.get(session.currentId) : undefined;
  const currentItem = current ? itemOf(current.id) : undefined;
  const summary = summaryOf(session);
  const readonly = session.status === "closed";
  const focusReader = () => setTimeout(() => inputRef.current?.focus(), 0);

  const submitMark = async (
    animalId: string,
    status: HandlingItemStatus,
    extra: { weightKg?: number; note?: string } = {},
  ) => {
    const weightId = extra.weightKg ? crypto.randomUUID() : undefined;
    show(null);
    const at = seq.current;
    await update((p) => {
      const exists = p.items.some((i) => i.animalId === animalId);
      const patch = {
        status,
        weightKg: status === "done" ? (extra.weightKg ?? null) : null,
        note: extra.note ?? null,
        doneAt: status === "done" ? new Date().toISOString() : null,
      };
      return {
        ...p,
        currentId: null,
        items: exists
          ? p.items.map((i) => (i.animalId === animalId ? { ...i, ...patch } : i))
          : [...p.items, { animalId, added: true, ...patch }],
      };
    });
    const r = await engine.submit({
      ...newMutationBase(session.id),
      type: "handling.mark",
      payload: {
        animalId,
        status,
        ...(extra.weightKg ? { weightKg: extra.weightKg, weightId, weightSource: "manual" } : {}),
        ...(extra.note ? { note: extra.note } : {}),
      },
    });
    const tag = byId.get(animalId)?.primaryIdentifier ?? "animal";
    showLater(at, {
      kind: "saved",
      tone: r.status === "synced" ? "success" : r.status === "saved_locally" ? "warning" : "danger",
      text:
        r.status === "synced"
          ? `${tag}: ${status === "done" ? "realizado" : status === "skipped" ? "não realizado" : "desfeito"} e sincronizado.`
          : r.status === "saved_locally"
            ? `${tag}: salvo no aparelho. Enviaremos quando houver conexão.`
            : `${tag}: não registrado — ${r.message}`,
    });
    setWeight("");
    setSkipNote(null);
    focusReader();
  };

  const addException = async (
    kind: string,
    value?: string,
    note?: string,
    resolvedAnimalId?: string,
  ) => {
    const exId = crypto.randomUUID();
    await update((p) => ({
      ...p,
      exceptions: [
        ...p.exceptions,
        {
          id: exId,
          kind,
          value: value ?? null,
          note: note ?? null,
          resolvedAnimalId: resolvedAnimalId ?? null,
          createdAt: new Date().toISOString(),
        },
      ],
    }));
    await engine.submit({
      ...newMutationBase(session.id),
      type: "handling.exception",
      payload: {
        id: exId,
        kind: kind as "unknown_identifier",
        ...(value ? { value } : {}),
        ...(note ? { note } : {}),
        ...(resolvedAnimalId ? { resolvedAnimalId } : {}),
      },
    });
  };

  const select = async (a: LocalAnimal) => {
    await update((p) => ({ ...p, currentId: a.id }));
    setWeight("");
    setSkipNote(null);
  };

  /** Leitura do bastão (modo teclado) ou digitação: sempre o mesmo caminho. */
  const handleRead = async (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setLine("");
    const read = session.readerConnected ? reader.submitLine(text) : null;
    const values = new Set([
      ...(read ? [read.value] : []),
      ...candidateIdentifiers(text).map((c) => c.value),
    ]);
    const matches = animals.filter(
      (a) => a.status === "active" && a.identifiers.some((i) => values.has(i.value)),
    );
    const key = matches.length === 1 ? matches[0]!.id : text.toUpperCase();
    const verdict = deduper.accept(key, Date.now());
    if (verdict === "suppressed") {
      show({ kind: "suppressed", value: text });
      return;
    }
    if (!session.reads.includes(key)) await update((p) => ({ ...p, reads: [...p.reads, key] }));
    if (matches.length === 0) {
      show({ kind: "unknown", value: read?.value ?? text.toUpperCase() });
      return;
    }
    if (matches.length > 1) {
      show({ kind: "ambiguous", ids: matches.map((m) => m.id), value: text });
      return;
    }
    const a = matches[0]!;
    const item = itemOf(a.id);
    if (!item) {
      show({ kind: "outside", animalId: a.id });
      return;
    }
    if (item.status === "done") {
      // Retorno do mesmo animal: avisa e deixa o operador decidir (não reaplica).
      show({ kind: "repeat", animalId: a.id, at: item.doneAt });
      return;
    }
    show(null);
    await select(a);
  };

  const confirmDone = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!current) return;
    const w = weight ? Number(weight.replace(",", ".")) : undefined;
    if (session.config.weigh && weight && (!w || w <= 0 || w > 1500)) return;
    await submitMark(current.id, "done", w ? { weightKg: w } : {});
  };

  // ---------- Encerramento (T28) ----------
  if (closing || readonly) {
    return (
      <CloseView
        session={session}
        pendingSync={state.pending}
        readonly={readonly}
        onBack={() => setClosing(false)}
        onClose={async (note) => {
          await update((p) => ({ ...p, status: "closed", closedAt: new Date().toISOString() }));
          return engine.submit({
            ...newMutationBase(session.id),
            type: "handling.close",
            payload: note ? { note } : {},
          });
        }}
        tagOf={(aid) => byId.get(aid)?.primaryIdentifier ?? aid.slice(0, 8)}
      />
    );
  }

  const lists: Record<ListTab, LocalSession["items"]> = {
    pending: session.items.filter((i) => i.status === "pending"),
    done: session.items.filter((i) => i.status === "done"),
    skipped: session.items.filter((i) => i.status === "skipped"),
    exceptions: [],
  };
  const pct = summary.total
    ? Math.round(((summary.done + summary.skipped) / summary.total) * 100)
    : 0;
  const warning =
    current && weight && current.lastWeight
      ? weightConsistencyWarning(
          { measuredOn: current.lastWeight.measuredOn, weightKg: current.lastWeight.weightKg },
          { measuredOn: session.date, weightKg: Number(weight.replace(",", ".")) || 0 },
        )
      : null;

  return (
    <section className="curral">
      <PageHead
        title={session.name}
        back="/curral"
        aside={
          <button className="btn btn-secondary" onClick={() => setClosing(true)}>
            Encerrar
          </button>
        }
      />
      <div className="curral-progress" aria-label="Progresso da sessão">
        <div className="bar">
          <span style={{ width: `${pct}%` }} />
        </div>
        <p>
          <strong>{summary.done}</strong> realizados · {summary.skipped} não realizados ·{" "}
          {summary.pending} pendentes
          {summary.exceptions ? ` · ${summary.exceptions} exceção(ões)` : ""}
          {state.pending ? ` · ${state.pending} aguardando envio` : ""}
        </p>
      </div>

      <div className="curral-config">
        {session.config.products.map((p) => (
          <span key={p.productId} className="chip">
            {p.productName ?? "Produto"} · {formatQuantity(p.dose, p.unit ?? "")}
            {p.route ? ` · ${ADMIN_ROUTE_LABEL[p.route as AdminRoute]}` : ""}
          </span>
        ))}
        {session.config.weigh ? <span className="chip">Pesagem</span> : null}
      </div>

      <form
        className="curral-reader"
        onSubmit={(e) => {
          e.preventDefault();
          void handleRead(line);
        }}
      >
        <label htmlFor="curral-read">
          {session.readerConnected ? (
            <>
              <ScanBarcode size={20} aria-hidden="true" /> Leia o brinco ou RFID (leitor em modo
              teclado)
            </>
          ) : (
            <>
              <Keyboard size={20} aria-hidden="true" /> Digite o brinco
            </>
          )}
        </label>
        <div className="row">
          <input
            id="curral-read"
            ref={inputRef}
            autoFocus
            autoComplete="off"
            inputMode={session.readerConnected ? "text" : "numeric"}
            value={line}
            onChange={(e) => setLine(e.target.value)}
            placeholder={session.readerConnected ? "Aguardando leitura…" : "Número do brinco"}
          />
          <button className="btn btn-primary">OK</button>
        </div>
        <button
          type="button"
          className="link-btn"
          onClick={async () => {
            const connected = !session.readerConnected;
            await update((p) => ({ ...p, readerConnected: connected }));
            if (!connected)
              await addException(
                "reader_disconnected",
                undefined,
                "Leitor desconectado; seguindo por digitação",
              );
            focusReader();
          }}
        >
          {session.readerConnected ? (
            <>
              <BluetoothOff size={16} aria-hidden="true" /> Leitor parou? Seguir digitando
            </>
          ) : (
            <>
              <Bluetooth size={16} aria-hidden="true" /> Voltar a usar o leitor
            </>
          )}
        </button>
      </form>

      {notice ? (
        <NoticeView
          notice={notice}
          session={session}
          byId={byId}
          onDismiss={() => {
            show(null);
            focusReader();
          }}
          onSelect={async (a) => {
            show(null);
            await select(a);
          }}
          onUndo={async (aid) => {
            show(null);
            await submitMark(aid, "pending");
          }}
          onException={addException}
          onNotice={show}
        />
      ) : null}

      {current && currentItem?.status !== "done" ? (
        <form className="card curral-current" onSubmit={confirmDone}>
          <div className="head">
            <AnimalPhoto size="md" src={current.photo?.thumbUrl} />
            <div>
              <strong>
                {CATEGORY_LABEL[current.category]} {current.primaryIdentifier}
              </strong>
              <span className="hint">
                {current.groupName ?? "Sem lote"} ·{" "}
                {current.lastWeight
                  ? `${formatKg(current.lastWeight.weightKg)} em ${formatDate(current.lastWeight.measuredOn)}`
                  : "sem pesagem"}
              </span>
              {!currentItem ? (
                <span className="badge badge-info">Fora da seleção inicial</span>
              ) : null}
              {current.withdrawal?.meatUntil && current.withdrawal.meatUntil >= today ? (
                <span className="badge badge-warn">
                  Em carência até {formatDate(current.withdrawal.meatUntil)}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label="Fechar animal"
              onClick={() => update((p) => ({ ...p, currentId: null })).then(focusReader)}
            >
              <X size={22} />
            </button>
          </div>
          {session.config.weigh ? (
            <div className="field">
              <label htmlFor="curral-w">Peso (kg)</label>
              <input
                id="curral-w"
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="Digite o peso da balança"
              />
              <p className="hint" style={{ margin: "4px 0 0" }}>
                Balança integrada ainda não homologada: digite o valor mostrado no visor.
              </p>
              {warning ? <div className="field-error">{warning}</div> : null}
            </div>
          ) : null}
          {session.config.products.length ? (
            <ul className="curral-todo">
              {session.config.products.map((p) => (
                <li key={p.productId}>
                  <Check size={18} aria-hidden="true" /> {p.productName ?? "Produto"} ·{" "}
                  {formatQuantity(p.dose, p.unit ?? "")}
                </li>
              ))}
            </ul>
          ) : null}
          {skipNote !== null ? (
            <div className="field">
              <label htmlFor="curral-skip">Motivo de não realizar</label>
              <input
                id="curral-skip"
                autoFocus
                value={skipNote}
                onChange={(e) => setSkipNote(e.target.value)}
                placeholder="Ex.: animal machucado, fugiu do brete"
              />
              <div className="actions" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    submitMark(
                      current.id,
                      "skipped",
                      skipNote.trim() ? { note: skipNote.trim() } : {},
                    )
                  }
                >
                  Confirmar não realizado
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setSkipNote(null)}>
                  Voltar
                </button>
              </div>
            </div>
          ) : (
            <div className="actions curral-actions">
              <button className="btn btn-primary btn-lg">
                <Check size={22} aria-hidden="true" /> Confirmar realizado
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setSkipNote("")}>
                <SkipForward size={20} aria-hidden="true" /> Não realizado
              </button>
            </div>
          )}
        </form>
      ) : null}

      <div className="tabs" role="tablist" aria-label="Lista da sessão">
        {(
          [
            ["pending", `Pendentes (${lists.pending.length})`],
            ["done", `Realizados (${lists.done.length})`],
            ["skipped", `Não realizados (${lists.skipped.length})`],
            ["exceptions", `Exceções (${session.exceptions.length})`],
          ] as const
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "exceptions" ? (
        session.exceptions.length === 0 ? (
          <p className="hint">Nenhuma exceção.</p>
        ) : (
          <ul className="list">
            {session.exceptions.map((e) => (
              <li key={e.id} className="list-item">
                <span>
                  <span className="title">
                    {e.kind === "unknown_identifier"
                      ? `ID desconhecido ${e.value ?? ""}`
                      : e.kind === "reader_disconnected"
                        ? "Leitor desconectado"
                        : "Observação"}
                  </span>
                  <div className="meta">
                    {formatDateTime(e.createdAt)}
                    {e.note ? ` · ${e.note}` : ""}
                    {e.resolvedAnimalId
                      ? ` · associado a ${byId.get(e.resolvedAnimalId)?.primaryIdentifier ?? "animal"}`
                      : e.kind === "unknown_identifier"
                        ? " · sem associação"
                        : ""}
                  </div>
                </span>
              </li>
            ))}
          </ul>
        )
      ) : (
        <ul className="list">
          {lists[tab].map((i) => {
            const a = byId.get(i.animalId);
            return (
              <li key={i.animalId}>
                <button
                  className="list-item"
                  style={{ width: "100%", textAlign: "left" }}
                  disabled={!a}
                  onClick={() => (a ? select(a) : undefined)}
                >
                  <span>
                    <span className="title">
                      {a ? `${CATEGORY_LABEL[a.category]} ${a.primaryIdentifier ?? ""}` : "Animal"}
                      {i.added ? <span className="badge badge-info">incluído</span> : null}
                    </span>
                    <div className="meta">
                      {i.status === "done"
                        ? `${i.weightKg ? `${formatKg(i.weightKg)} · ` : ""}${formatDateTime(i.doneAt)}`
                        : i.status === "skipped"
                          ? (i.note ?? "Sem motivo informado")
                          : (a?.groupName ?? "Sem lote")}
                    </div>
                  </span>
                  {i.status === "done" ? (
                    <span
                      role="button"
                      tabIndex={0}
                      className="link-btn"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        void submitMark(i.animalId, "pending");
                      }}
                    >
                      <Undo2 size={16} aria-hidden="true" /> Desfazer
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
          {lists[tab].length === 0 ? <li className="hint">Nada aqui.</li> : null}
        </ul>
      )}
    </section>
  );
}

function NoticeView({
  notice,
  session,
  byId,
  onDismiss,
  onSelect,
  onUndo,
  onException,
  onNotice,
}: {
  notice: Notice;
  session: LocalSession;
  byId: Map<string, LocalAnimal>;
  onDismiss: () => void;
  onSelect: (a: LocalAnimal) => void;
  onUndo: (animalId: string) => void;
  onException: (kind: string, value?: string, note?: string, resolved?: string) => Promise<void>;
  onNotice: (n: Notice) => void;
}) {
  const { farm, can } = useSession();
  const [associating, setAssociating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (notice.kind === "saved") return <Alert kind={notice.tone}>{notice.text}</Alert>;
  if (notice.kind === "suppressed")
    return (
      <p className="hint">
        Leitura repetida de {notice.value} ignorada (mesmo brinco em sequência).
      </p>
    );
  if (notice.kind === "repeat") {
    const a = byId.get(notice.animalId);
    return (
      <Alert kind="warning">
        {a?.primaryIdentifier} já foi realizado nesta sessão
        {notice.at
          ? ` às ${new Date(notice.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
          : ""}
        . Nada foi aplicado de novo.
        <div className="actions" style={{ marginTop: 8 }}>
          <button className="btn btn-soft" onClick={onDismiss}>
            Ok, próximo
          </button>
          <button className="btn btn-ghost" onClick={() => onUndo(notice.animalId)}>
            <Undo2 size={18} aria-hidden="true" /> Desfazer registro
          </button>
        </div>
      </Alert>
    );
  }
  if (notice.kind === "outside") {
    const a = byId.get(notice.animalId)!;
    return (
      <Alert kind="info">
        {CATEGORY_LABEL[a.category]} {a.primaryIdentifier} não está na seleção inicial.
        <div className="actions" style={{ marginTop: 8 }}>
          <button className="btn btn-soft" onClick={() => onSelect(a)}>
            Incluir nesta sessão
          </button>
          <button className="btn btn-ghost" onClick={onDismiss}>
            Ignorar
          </button>
        </div>
      </Alert>
    );
  }
  if (notice.kind === "ambiguous") {
    return (
      <Alert kind="warning">
        “{notice.value}” corresponde a mais de um animal. Escolha:
        <div className="actions" style={{ marginTop: 8 }}>
          {notice.ids.map((aid) => {
            const a = byId.get(aid)!;
            return (
              <button key={aid} className="btn btn-soft" onClick={() => onSelect(a)}>
                {CATEGORY_LABEL[a.category]} {a.primaryIdentifier}
              </button>
            );
          })}
        </div>
      </Alert>
    );
  }
  // ID desconhecido: associação revisada ou cadastro mínimo — nunca cria por suposição.
  const pendingInSession = session.items
    .filter((i) => i.status === "pending")
    .map((i) => byId.get(i.animalId))
    .filter((a): a is LocalAnimal => !!a);
  const type = /^\d{15}$/.test(notice.value) ? "rfid" : "visual_tag";
  return (
    <Alert kind="warning">
      <CircleHelp size={18} aria-hidden="true" /> Identificador <strong>{notice.value}</strong> não
      encontrado neste aparelho.
      {error ? <div className="field-error">{error}</div> : null}
      {associating ? (
        <div style={{ marginTop: 8 }}>
          <p className="hint" style={{ margin: "0 0 6px" }}>
            Escolha o animal da seleção que recebeu este identificador (exige conexão):
          </p>
          <ul className="list" style={{ maxHeight: 240, overflow: "auto" }}>
            {pendingInSession.map((a) => (
              <li key={a.id}>
                <button
                  className="list-item"
                  style={{ width: "100%", textAlign: "left" }}
                  onClick={async () => {
                    setError(null);
                    try {
                      await post(
                        `/v1/farms/${farm!.id}/animals/${a.id}/identifiers`,
                        { type, value: notice.value },
                        { idempotencyKey: crypto.randomUUID() },
                      );
                      await onException(
                        "unknown_identifier",
                        notice.value,
                        "Associado durante a sessão",
                        a.id,
                      );
                      onSelect(a);
                    } catch (err) {
                      setError(
                        err instanceof ApiError
                          ? errorMessage(err)
                          : "Sem conexão: registre como exceção e associe depois.",
                      );
                    }
                  }}
                >
                  {CATEGORY_LABEL[a.category]} {a.primaryIdentifier ?? "sem identificação"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="actions" style={{ marginTop: 8 }}>
          {can("animals.write") ? (
            <button className="btn btn-soft" onClick={() => setAssociating(true)}>
              Associar a animal da seleção
            </button>
          ) : null}
          {can("animals.write") ? (
            <Link
              className="btn btn-ghost"
              to={`/registrar/animal?tag=${encodeURIComponent(notice.value)}`}
            >
              Cadastro mínimo
            </Link>
          ) : null}
          <button
            className="btn btn-ghost"
            onClick={() => {
              // Aviso imediato (registro local); o envio segue pelo outbox.
              onNotice({
                kind: "saved",
                tone: "warning",
                text: `${notice.value} registrado como exceção.`,
              });
              void onException("unknown_identifier", notice.value);
            }}
          >
            Registrar exceção
          </button>
        </div>
      )}
    </Alert>
  );
}

function CloseView({
  session,
  pendingSync,
  readonly,
  onBack,
  onClose,
  tagOf,
}: {
  session: LocalSession;
  pendingSync: number;
  readonly: boolean;
  onBack: () => void;
  onClose: (note: string) => Promise<{ status: string; message?: string }>;
  tagOf: (id: string) => string;
}) {
  const s = summaryOf(session);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ status: string; message?: string } | null>(null);
  const [uploads, setUploads] = useState(0);
  useEffect(() => {
    void pendingUploads().then((u) => setUploads(u.length));
  }, []);
  const notDone = session.items.filter((i) => i.status !== "done");
  return (
    <section>
      <PageHead
        title={readonly ? session.name : "Encerrar sessão"}
        back={readonly ? "/curral" : undefined}
        onBack={readonly ? undefined : onBack}
      />
      {readonly ? (
        <Alert kind="info">
          Sessão encerrada{session.closedAt ? ` em ${formatDateTime(session.closedAt)}` : ""}.
          Correções são feitas no histórico de cada animal.
        </Alert>
      ) : null}
      <div className="stats">
        <div className="stat">
          <div>
            <strong>{s.done}</strong>
            <span>Realizados</span>
          </div>
        </div>
        <div className="stat">
          <div>
            <strong>{s.skipped + s.pending}</strong>
            <span>Não realizados</span>
          </div>
        </div>
        <div className="stat">
          <div>
            <strong>{s.exceptions}</strong>
            <span>Exceções</span>
          </div>
        </div>
      </div>
      <div className="card review">
        <dl>
          <dt>Selecionados</dt>
          <dd>
            {s.total - s.addedDuringSession}
            {s.addedDuringSession ? ` + ${s.addedDuringSession} incluído(s) na sessão` : ""}
          </dd>
          <dt>Aguardando envio</dt>
          <dd>{pendingSync ? `${pendingSync} registro(s) no aparelho` : "Tudo sincronizado"}</dd>
          <dt>Anexos pendentes</dt>
          <dd>{uploads ? `${uploads} foto(s) aguardando envio` : "Nenhum"}</dd>
        </dl>
        {notDone.length ? (
          <>
            <h3 style={{ margin: "12px 0 6px" }}>Não manejados</h3>
            <p className="hint" style={{ marginTop: 0 }}>
              {notDone.map((i) => tagOf(i.animalId)).join(", ")}
            </p>
            {!readonly ? (
              <p className="hint">Ao encerrar, uma tarefa com estes animais vai para a Agenda.</p>
            ) : null}
          </>
        ) : null}
        {result ? (
          result.status === "synced" ? (
            <Alert kind="success">Sessão encerrada e sincronizada.</Alert>
          ) : result.status === "saved_locally" ? (
            <Alert kind="warning">Salvo no aparelho. Enviaremos quando houver conexão.</Alert>
          ) : (
            <Alert kind="danger">Não encerrada: {result.message}</Alert>
          )
        ) : null}
        {!readonly && !result ? (
          <>
            <div className="field">
              <label htmlFor="close-note">Observação</label>
              <input id="close-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="actions">
              <button
                className="btn btn-primary btn-lg"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setResult(await onClose(note.trim()));
                  setBusy(false);
                }}
              >
                {busy ? "Encerrando…" : "Encerrar sessão"}
              </button>
              <button className="btn btn-ghost" onClick={onBack}>
                Continuar manejo
              </button>
            </div>
          </>
        ) : null}
        {result || readonly ? (
          <div className="actions">
            <Link className="btn btn-secondary" to="/curral">
              Voltar ao Modo Curral
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
