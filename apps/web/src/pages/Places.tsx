import type { Group } from "@rebania/contracts";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { errorMessage, get, post } from "../api/client.ts";
import { Alert, Empty, Field, Loading, PageHead } from "../components/ui.tsx";
import { useSession } from "../state/session.tsx";
import { useSync } from "../state/sync.tsx";

function PlaceSection({ kind }: { kind: "groups" | "pastures" }) {
  const { farm, can } = useSession();
  const { engine } = useSync();
  const label = kind === "groups" ? "Lotes" : "Pastos";
  const [items, setItems] = useState<Group[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    () =>
      get<Group[]>(`/v1/farms/${farm!.id}/${kind}`).then(setItems, (e) =>
        setError(errorMessage(e)),
      ),
    [farm, kind],
  );
  useEffect(() => void load(), [load]);

  return (
    <div className="card">
      <h2>{label}</h2>
      {error ? <Alert kind="danger">{error}</Alert> : null}
      {!items ? (
        error ? null : (
          <Loading />
        )
      ) : items.length === 0 ? (
        <Empty title={`Nenhum ${label.toLowerCase().slice(0, -1)} cadastrado`} />
      ) : (
        <ul className="list">
          {items.map((g) => (
            <li key={g.id} className="list-item">
              <span>
                <span className="title">{g.name}</span>
                <div className="meta">{g.activeAnimals} animal(is) ativo(s)</div>
              </span>
              {kind === "groups" ? (
                <Link to={`/rebanho?lote=${g.id}`} className="btn btn-ghost">
                  Ver animais
                </Link>
              ) : null}
              {can("groups.manage") && g.activeAnimals === 0 ? (
                <button
                  className="btn btn-danger"
                  onClick={async () => {
                    try {
                      await post(`/v1/farms/${farm!.id}/${kind}/${g.id}/archive`);
                      await load();
                      void engine.syncNow();
                    } catch (e) {
                      setError(errorMessage(e));
                    }
                  }}
                >
                  Arquivar
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {can("groups.manage") ? (
        <form
          style={{ marginTop: 16 }}
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              await post(`/v1/farms/${farm!.id}/${kind}`, { name });
              setName("");
              await load();
              void engine.syncNow();
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <Field id={`new-${kind}`} label={`Novo ${label.toLowerCase().slice(0, -1)}`}>
            <div className="search">
              <input
                id={`new-${kind}`}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button className="btn btn-primary">Adicionar</button>
            </div>
          </Field>
        </form>
      ) : null}
    </div>
  );
}

export function PlacesPage() {
  return (
    <section>
      <PageHead title="Lotes e pastos" back="/fazenda" />
      <p className="hint">
        A localização vem do manejo declarado, não de rastreamento GPS do animal.
      </p>
      <div className="grid two">
        <PlaceSection kind="groups" />
        <PlaceSection kind="pastures" />
      </div>
    </section>
  );
}
