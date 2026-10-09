import type { HandlingSessionDto } from "@rebania/contracts";
import { ChevronRight, ClipboardList, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { get } from "../../api/client.ts";
import { Empty, formatDate, Loading, PageHead } from "../../components/ui.tsx";
import { listLocalSessions, summaryOf, type LocalSession } from "../../offline/curral.ts";
import { useSession } from "../../state/session.tsx";
import { useSync } from "../../state/sync.tsx";

/** Lista de sessões do Modo Curral: abertas neste aparelho primeiro, depois as do servidor. */
export function CurralSessionsPage() {
  const { farm, can } = useSession();
  const { version } = useSync();
  const [local, setLocal] = useState<LocalSession[] | null>(null);
  const [remote, setRemote] = useState<HandlingSessionDto[]>([]);
  useEffect(() => {
    void listLocalSessions(farm!.id).then(setLocal);
    get<{ items: HandlingSessionDto[] }>(`/v1/farms/${farm!.id}/handling-sessions`).then(
      (r) => setRemote(r.items),
      () => setRemote([]),
    );
  }, [farm, version]);
  if (!local) return <Loading />;
  const localIds = new Set(local.map((s) => s.id));
  const rows = [
    ...local.map((s) => ({
      id: s.id,
      name: s.name,
      date: s.date,
      status: s.status,
      summary: summaryOf(s),
      here: true,
    })),
    ...remote.filter((r) => !localIds.has(r.id)).map((r) => ({ ...r, here: false })),
  ];
  const open = rows.filter((r) => r.status === "open");
  const closed = rows.filter((r) => r.status === "closed");
  const Row = ({ r }: { r: (typeof rows)[number] }) => (
    <li>
      <Link className="list-item" to={`/curral/${r.id}`}>
        <span>
          <span className="title">{r.name}</span>
          <div className="meta">
            {formatDate(r.date)} · {r.summary.done} de {r.summary.total} realizados
            {r.summary.exceptions ? ` · ${r.summary.exceptions} exceção(ões)` : ""}
            {r.here ? "" : " · outro aparelho"}
          </div>
        </span>
        <ChevronRight size={20} aria-hidden="true" />
      </Link>
    </li>
  );
  return (
    <section>
      <PageHead
        title="Modo Curral"
        aside={
          can("events.write") ? (
            <Link className="btn btn-primary" to="/curral/nova">
              <Plus size={20} aria-hidden="true" /> Nova sessão
            </Link>
          ) : null
        }
      />
      <p className="hint">
        Configure o manejo uma vez, leia cada animal, confirme o que foi feito e avance. Funciona
        sem sinal; reiniciar o aparelho não encerra a sessão.
      </p>
      {rows.length === 0 ? (
        <Empty title="Nenhuma sessão de manejo" icon={<ClipboardList size={40} />} />
      ) : (
        <>
          {open.length ? (
            <>
              <h2 style={{ fontSize: 18 }}>Em andamento</h2>
              <ul className="list">
                {open.map((r) => (
                  <Row key={r.id} r={r} />
                ))}
              </ul>
            </>
          ) : null}
          {closed.length ? (
            <>
              <h2 style={{ fontSize: 18, marginTop: 24 }}>Encerradas</h2>
              <ul className="list">
                {closed.slice(0, 30).map((r) => (
                  <Row key={r.id} r={r} />
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
