import { ChevronRight, ScanBarcode } from "lucide-react";
import { candidateIdentifiers, CATEGORY_LABEL } from "@rebania/domain";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { LocalAnimal } from "../offline/engine.ts";
import { Alert, AnimalPhoto } from "./ui.tsx";

/**
 * Etapa "Identificar": digitação ou leitor RFID/QR em modo teclado (HID), que
 * digita o número e envia Enter. Busca no rebanho local (funciona offline).
 */
export function IdentifyAnimal({
  animals,
  onSelect,
  filter,
}: {
  animals: LocalAnimal[];
  onSelect: (a: LocalAnimal) => void;
  filter?: (a: LocalAnimal) => boolean;
}) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");

  const results = useMemo(() => {
    const q = submitted || query;
    if (!q.trim()) return [];
    const values = new Set(candidateIdentifiers(q).map((c) => c.value));
    return animals
      .filter((a) => (filter ? filter(a) : true))
      .map((a) => {
        const exact = a.identifiers.find((i) => values.has(i.value));
        const partial = a.identifiers.find((i) => [...values].some((v) => i.value.startsWith(v)));
        const hit = exact ?? partial;
        return hit ? { animal: a, hit, exact: Boolean(exact) } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort(
        (x, y) =>
          Number(y.exact) - Number(x.exact) ||
          Number(y.hit.status === "active") - Number(x.hit.status === "active"),
      )
      .slice(0, 20);
  }, [animals, query, submitted, filter]);

  const exactActive = results.filter((r) => r.exact && r.hit.status === "active");

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(query);
          if (exactActive.length === 1) onSelect(exactActive[0]!.animal);
        }}
      >
        <div className="field">
          <label htmlFor="identify">Brinco, RFID ou ID provisório</label>
          <div className="searchbar" style={{ margin: 0 }}>
            <div className="input-icon">
              <ScanBarcode size={22} aria-hidden="true" />
              <input
                id="identify"
                autoFocus
                autoComplete="off"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSubmitted("");
                }}
              />
            </div>
            <button type="submit" className="btn btn-primary">
              Buscar
            </button>
          </div>
        </div>
      </form>
      {submitted && results.length === 0 ? (
        <Alert kind="warning">
          Identificador <strong>{submitted}</strong> não encontrado nesta fazenda.{" "}
          <Link to={`/registrar/animal?tag=${encodeURIComponent(submitted)}`}>
            Cadastrar animal com este brinco
          </Link>
        </Alert>
      ) : null}
      <div className="animal-list" aria-label="Resultados">
        {results.map(({ animal, hit }) => (
          <button
            key={animal.id}
            type="button"
            className="animal-card"
            style={{ textAlign: "left", font: "inherit", cursor: "pointer", padding: 0 }}
            onClick={() => onSelect(animal)}
          >
            <AnimalPhoto size="md" />
            <span className="body">
              <span className="name">
                {CATEGORY_LABEL[animal.category]} {animal.primaryIdentifier ?? ""}
                {hit.status === "retired" ? (
                  <span className="badge badge-warn">brinco antigo: {hit.display}</span>
                ) : null}
              </span>
              <span className="meta">
                {animal.groupName ?? "Sem lote"}
                {animal.status !== "active" ? " · inativo" : ""}
              </span>
            </span>
            <span className="chev">
              <ChevronRight size={22} aria-hidden="true" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
