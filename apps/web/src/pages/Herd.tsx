import {
  Camera,
  ChevronRight,
  Keyboard,
  ScanBarcode,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import {
  ageInMonths,
  candidateIdentifiers,
  CATEGORY_LABEL,
  todayInTimezone,
  type Category,
} from "@rebania/domain";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ageLabel, AnimalPhoto, Empty, formatKg, Loading } from "../components/ui.tsx";
import { useLocalHerd } from "../state/local-data.ts";
import { useSession } from "../state/session.tsx";

const TABS: { key: string; label: string; match?: (c: Category) => boolean }[] = [
  { key: "todos", label: "Todos", match: () => true },
  { key: "matrizes", label: "Matrizes", match: (c) => c === "cow" || c === "heifer" },
  { key: "bezerros", label: "Bezerros", match: (c) => c === "calf_female" || c === "calf_male" },
  { key: "reprodutores", label: "Reprodutores", match: (c) => c === "bull" },
  { key: "lotes", label: "Lotes" },
];

export function HerdPage() {
  const { farm, can } = useSession();
  const { animals, places } = useLocalHerd(farm!.id);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [showFilters, setShowFilters] = useState(
    Boolean(params.get("lote") || params.get("semLote")),
  );
  const tab = params.get("filtro") ?? "todos";
  const groupId = params.get("lote") ?? "";
  const noGroup = params.get("semLote") === "1";
  const today = todayInTimezone(farm!.timezone);

  const active = useMemo(() => (animals ?? []).filter((a) => a.status === "active"), [animals]);
  const list = useMemo(() => {
    const values = q.trim() ? [...new Set(candidateIdentifiers(q).map((c) => c.value))] : null;
    const needle = q.trim().toLowerCase();
    const t = TABS.find((x) => x.key === tab);
    return active
      .filter((a) => (t?.match ? t.match(a.category) : true))
      .filter((a) => (groupId ? a.groupId === groupId : true))
      .filter((a) => (noGroup ? !a.groupId : true))
      .filter(
        (a) =>
          !values ||
          a.identifiers.some((i) => values.some((v) => i.value.startsWith(v))) ||
          (a.groupName ?? "").toLowerCase().includes(needle) ||
          CATEGORY_LABEL[a.category].toLowerCase().includes(needle),
      )
      .sort((a, b) =>
        (a.primaryIdentifier ?? "").localeCompare(b.primaryIdentifier ?? "", "pt-BR", {
          numeric: true,
        }),
      );
  }, [active, q, tab, groupId, noGroup]);

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
      <div className="page-head">
        <h1>Rebanho</h1>
        <div className="aside">{active.length} animais</div>
      </div>
      <div className="searchbar">
        <div className="input-icon">
          <Search size={22} aria-hidden="true" />
          <label htmlFor="herd-q" className="visually-hidden">
            Buscar pelo brinco, lote ou categoria
          </label>
          <input
            id="herd-q"
            placeholder="Buscar pelo brinco, lote ou categoria"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              set("q", e.target.value || null);
            }}
          />
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Filtros"
          aria-expanded={showFilters}
          onClick={() => setShowFilters((v) => !v)}
        >
          <SlidersHorizontal size={28} />
        </button>
      </div>
      {showFilters ? (
        <div className="field" style={{ maxWidth: 360 }}>
          <label htmlFor="herd-group">Lote</label>
          <select
            id="herd-group"
            value={noGroup ? "__none" : groupId}
            onChange={(e) => {
              const v = e.target.value;
              const next = new URLSearchParams(params);
              next.delete("lote");
              next.delete("semLote");
              if (v === "__none") next.set("semLote", "1");
              else if (v) next.set("lote", v);
              setParams(next, { replace: true });
            }}
          >
            <option value="">Todos os lotes</option>
            <option value="__none">Sem lote</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="tabs" role="tablist" aria-label="Categoria">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => set("filtro", t.key === "todos" ? null : t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "lotes" ? (
        groups.length === 0 ? (
          <Empty title="Nenhum lote cadastrado">
            <Link className="btn btn-secondary" to="/fazenda/lotes">
              Criar lote
            </Link>
          </Empty>
        ) : (
          <div className="animal-list">
            {groups.map((g) => (
              <Link
                key={g.id}
                className="animal-card"
                to={`/rebanho?lote=${g.id}`}
                onClick={() => setShowFilters(true)}
              >
                <div className="body">
                  <span className="name">{g.name}</span>
                  <span className="meta">
                    {active.filter((a) => a.groupId === g.id).length} animal(is)
                  </span>
                </div>
                <span className="chev">
                  <ChevronRight size={22} aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        )
      ) : list.length === 0 ? (
        animals.length === 0 ? (
          <Empty title="Nenhum animal cadastrado">
            {can("animals.write") ? (
              <Link className="btn btn-primary" to="/registrar/animal">
                Cadastrar primeiro animal
              </Link>
            ) : null}
          </Empty>
        ) : (
          <Empty title="Nenhum animal com esses filtros" />
        )
      ) : (
        <div className="animal-list">
          {list.map((a) => (
            <Link key={a.id} className="animal-card" to={`/rebanho/${a.id}`}>
              <AnimalPhoto />
              <div className="body">
                <span className="name">
                  {CATEGORY_LABEL[a.category]} {a.primaryIdentifier ?? "s/ identificação"}
                  {a.pending ? (
                    <span className="badge badge-warn">no aparelho</span>
                  ) : (
                    <span className="badge badge-ok">Ativo</span>
                  )}
                </span>
                <span className="meta">
                  {[a.breed ?? "Raça não informada", a.groupName ?? "Sem lote"].join(" · ")}
                </span>
                <span className="meta">
                  {[
                    a.lastWeight ? formatKg(a.lastWeight.weightKg) : "Sem pesagem",
                    a.birthDate ? ageLabel(ageInMonths(a.birthDate, today)) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <span className="chev">
                <ChevronRight size={22} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      )}

      <h2 style={{ fontSize: 20, margin: "24px 0 4px" }}>Identificar animal</h2>
      <div className="id-tiles">
        <button
          type="button"
          className="id-tile"
          onClick={() => navigate("/rebanho/identificar?modo=leitor")}
        >
          <ScanBarcode size={34} aria-hidden="true" /> Leitor
        </button>
        <button
          type="button"
          className="id-tile"
          disabled
          title="Leitura de QR/OCR pela câmera chega na próxima entrega"
        >
          <Camera size={34} aria-hidden="true" /> Câmera <small>em breve</small>
        </button>
        <button
          type="button"
          className="id-tile"
          onClick={() => navigate("/rebanho/identificar?modo=digitar")}
        >
          <Keyboard size={34} aria-hidden="true" /> Digitar
        </button>
      </div>
    </section>
  );
}
