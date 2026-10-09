import { candidateIdentifiers, CATEGORY_LABEL, REPRO_STATUS_LABEL } from "@rebania/domain";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { LocalAnimal, Place } from "../offline/engine.ts";

/**
 * Seleção de grupo para manejo: candidatos filtrados, adicionar por lote ou por
 * brinco e marcação individual. O conjunto marcado é um SNAPSHOT: mudar o filtro
 * depois não altera quem já foi selecionado (MN §7).
 */
export function GroupPicker({
  animals,
  places,
  eligible,
  selected,
  onChange,
  hint,
}: {
  animals: LocalAnimal[];
  places: Place[];
  eligible: (a: LocalAnimal) => boolean;
  selected: string[];
  onChange: (ids: string[]) => void;
  hint?: string;
}) {
  const [q, setQ] = useState("");
  const [groupId, setGroupId] = useState("");
  const pool = useMemo(
    () => animals.filter((a) => a.status === "active" && eligible(a)),
    [animals, eligible],
  );
  const visible = useMemo(() => {
    const values = q.trim() ? candidateIdentifiers(q).map((c) => c.value) : null;
    return pool
      .filter((a) => (groupId ? a.groupId === groupId : true))
      .filter(
        (a) => !values || a.identifiers.some((i) => values.some((v) => i.value.startsWith(v))),
      )
      .sort((a, b) =>
        (a.primaryIdentifier ?? "").localeCompare(b.primaryIdentifier ?? "", "pt-BR", {
          numeric: true,
        }),
      );
  }, [pool, q, groupId]);
  const set = new Set(selected);
  const toggle = (id: string) =>
    onChange(set.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const groups = places.filter((p) => p.kind === "group");

  return (
    <div>
      {hint ? <p className="hint">{hint}</p> : null}
      <div className="searchbar">
        <div className="input-icon">
          <Search size={20} aria-hidden="true" />
          <input
            aria-label="Buscar por brinco"
            placeholder="Buscar por brinco ou RFID"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {groups.length ? (
          <select
            aria-label="Filtrar por lote"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            style={{ width: "auto", maxWidth: 180 }}
          >
            <option value="">Todos os lotes</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div className="actions" style={{ marginTop: 0, marginBottom: 8 }}>
        <button
          type="button"
          className="btn btn-soft"
          onClick={() => onChange([...new Set([...selected, ...visible.map((a) => a.id)])])}
          disabled={!visible.length}
        >
          Marcar {visible.length} visíveis
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => onChange([])}
          disabled={!selected.length}
        >
          Limpar seleção
        </button>
      </div>
      <p aria-live="polite">
        <strong>{selected.length}</strong> selecionado(s) de {pool.length} apto(s)
      </p>
      <ul className="list" style={{ maxHeight: 420, overflow: "auto" }}>
        {visible.map((a) => (
          <li key={a.id}>
            <label className="list-item" style={{ cursor: "pointer", fontWeight: 400, margin: 0 }}>
              <span className="check">
                <input type="checkbox" checked={set.has(a.id)} onChange={() => toggle(a.id)} />
                <span>
                  <span className="title">
                    {CATEGORY_LABEL[a.category]} {a.primaryIdentifier}
                  </span>
                  <span className="meta" style={{ display: "block" }}>
                    {a.groupName ?? "Sem lote"}
                    {a.repro ? ` · ${REPRO_STATUS_LABEL[a.repro.status]}` : ""}
                  </span>
                </span>
              </span>
            </label>
          </li>
        ))}
        {visible.length === 0 ? (
          <li className="hint">Nenhum animal apto com esses filtros.</li>
        ) : null}
      </ul>
    </div>
  );
}

/** Resumo do snapshot na etapa de confirmação. */
export function SelectionSummary({ animals, ids }: { animals: LocalAnimal[]; ids: string[] }) {
  const byId = new Map(animals.map((a) => [a.id, a]));
  const tags = ids.map((id) => byId.get(id)?.primaryIdentifier ?? "?");
  return (
    <p>
      <strong>{ids.length}</strong> animal(is):{" "}
      <span className="hint">
        {tags.slice(0, 40).join(", ")}
        {tags.length > 40 ? "…" : ""}
      </span>
    </p>
  );
}
