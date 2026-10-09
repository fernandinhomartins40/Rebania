import { candidateIdentifiers, CATEGORY_LABEL } from "@rebania/domain";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { LocalAnimal } from "../offline/engine.ts";
import { Alert, Field } from "./ui.tsx";

/**
 * Etapa "Identificar": digitação ou leitor RFID/QR em modo teclado (HID), que
 * digita o número e envia Enter. Busca no rebanho local (funciona offline).
 * Leitores BLE/NFC nativos ficam no app mobile (packages/hardware, G4).
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
      .sort((x, y) => Number(y.exact) - Number(x.exact) || Number(y.hit.status === "active") - Number(x.hit.status === "active"))
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
        <Field id="identify" label="Brinco, RFID ou ID provisório" hint="digite ou use o leitor">
          <div className="search">
            <input
              id="identify"
              autoFocus
              inputMode="text"
              autoComplete="off"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSubmitted("");
              }}
            />
            <button type="submit" className="btn btn-primary">Buscar</button>
          </div>
        </Field>
      </form>
      {submitted && results.length === 0 ? (
        <Alert kind="warning">
          Identificador <strong>{submitted}</strong> não encontrado nesta fazenda.{" "}
          <Link to={`/registrar/animal?tag=${encodeURIComponent(submitted)}`}>Cadastrar animal com este brinco</Link>
        </Alert>
      ) : null}
      <ul className="list" aria-label="Resultados">
        {results.map(({ animal, hit }) => (
          <li key={animal.id}>
            <button
              type="button"
              className="list-item"
              style={{ width: "100%", background: "none", border: 0, textAlign: "left", cursor: "pointer", font: "inherit" }}
              onClick={() => onSelect(animal)}
            >
              <span>
                <span className="title">{animal.primaryIdentifier ?? "Sem identificador"}</span>{" "}
                {hit.status === "retired" ? <span className="badge badge-warn">identificador antigo: {hit.display}</span> : null}
                <div className="meta">
                  {CATEGORY_LABEL[animal.category]} · {animal.groupName ?? "sem lote"}
                  {animal.status !== "active" ? " · inativo" : ""}
                </div>
              </span>
              <span className="chev" aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
