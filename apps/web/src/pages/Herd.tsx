import { candidateIdentifiers, CATEGORY_LABEL, type Category } from "@rebania/domain";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Empty, formatKg, Loading } from "../components/ui.tsx";
import { useLocalHerd } from "../state/local-data.ts";
import { useSession } from "../state/session.tsx";

const FILTERS: { key: string; label: string; match: (c: Category) => boolean }[] = [
  { key: "todos", label: "Todos", match: () => true },
  { key: "matrizes", label: "Matrizes e novilhas", match: (c) => c === "cow" || c === "heifer" },
  { key: "bezerros", label: "Bezerros", match: (c) => c === "calf_female" || c === "calf_male" },
  { key: "machos", label: "Garrotes e bois", match: (c) => c === "steer" || c === "ox" },
  { key: "touros", label: "Touros", match: (c) => c === "bull" },
];

export function HerdPage() {
  const { farm, can } = useSession();
  const { animals, places } = useLocalHerd(farm!.id);
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const filter = params.get("filtro") ?? "todos";
  const groupId = params.get("lote") ?? "";
  const noGroup = params.get("semLote") === "1";

  const list = useMemo(() => {
    if (!animals) return [];
    const values = q.trim() ? [...new Set(candidateIdentifiers(q).map((c) => c.value))] : null;
    const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0]!;
    return animals
      .filter((a) => a.status === "active")
      .filter((a) => f.match(a.category))
      .filter((a) => (groupId ? a.groupId === groupId : true))
      .filter((a) => (noGroup ? !a.groupId : true))
      .filter((a) => !values || a.identifiers.some((i) => values.some((v) => i.value.startsWith(v))))
      .sort((a, b) => (a.primaryIdentifier ?? "").localeCompare(b.primaryIdentifier ?? "", "pt-BR", { numeric: true }));
  }, [animals, q, filter, groupId, noGroup]);

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  if (!animals) return <Loading />;
  const groups = places.filter((p) => p.kind === "group");

  return (
    <section>
      <div className="topbar">
        <h1 style={{ margin: 0 }}>Rebanho</h1>
        <span className="hint">{list.length} animal(is)</span>
      </div>
      <div className="search">
        <label htmlFor="herd-q" className="visually-hidden">Buscar por brinco ou RFID</label>
        <input id="herd-q" placeholder="Buscar pelo brinco ou RFID" value={q} onChange={(e) => { setQ(e.target.value); set("q", e.target.value || null); }} />
      </div>
      <div className="chips" role="group" aria-label="Categoria">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => set("filtro", f.key === "todos" ? null : f.key)}>
            {f.label}
          </button>
        ))}
      </div>
      {groups.length ? (
        <div className="field" style={{ maxWidth: 320 }}>
          <label htmlFor="herd-group">Lote</label>
          <select id="herd-group" value={noGroup ? "__none" : groupId} onChange={(e) => {
            const v = e.target.value;
            const next = new URLSearchParams(params);
            next.delete("lote");
            next.delete("semLote");
            if (v === "__none") next.set("semLote", "1");
            else if (v) next.set("lote", v);
            setParams(next, { replace: true });
          }}>
            <option value="">Todos os lotes</option>
            <option value="__none">Sem lote</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      ) : null}

      <div className="card">
        {list.length === 0 ? (
          animals.length === 0 ? (
            <Empty title="Nenhum animal cadastrado">
              {can("animals.write") ? <Link className="btn btn-primary" to="/registrar/animal">Cadastrar primeiro animal</Link> : null}
            </Empty>
          ) : (
            <Empty title="Nenhum animal com esses filtros" />
          )
        ) : (
          <ul className="list">
            {list.map((a) => (
              <li key={a.id}>
                <Link className="list-item" to={`/rebanho/${a.id}`}>
                  <span>
                    <span className="title">{a.primaryIdentifier ?? "Sem identificador"}</span>{" "}
                    {a.pending ? <span className="badge badge-warn">salvo no aparelho</span> : null}
                    <div className="meta">
                      {CATEGORY_LABEL[a.category]}
                      {a.breed ? ` · ${a.breed}` : ""} · {a.groupName ?? "sem lote"}
                      {a.lastWeight ? ` · ${formatKg(a.lastWeight.weightKg)}` : ""}
                    </div>
                  </span>
                  <span className="chev" aria-hidden="true">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
