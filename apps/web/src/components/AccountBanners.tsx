import { useEffect, useState } from "react";
import { Link } from "react-router";
import { get } from "../api/client.ts";
import { useSession } from "../state/session.tsx";
import { Alert } from "./ui.tsx";

interface Announcement {
  id: string;
  title: string;
  body: string;
  level: "info" | "warning" | "maintenance";
}

const DISMISSED_KEY = "rebania.dismissedAnnouncements";

function readDismissed(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(DISMISSED_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/**
 * Avisos da conta no topo do app: somente leitura (com o motivo e o caminho para resolver)
 * e comunicados da equipe Rebania. O bloqueio em si é do servidor; aqui é só informação.
 */
export function AccountBanners() {
  const { farm, can } = useSession();
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  useEffect(() => {
    get<{ items: Announcement[] }>("/v1/announcements").then(
      (r) => setItems(r.items),
      () => setItems([]),
    );
  }, []);
  const visible = items.filter((a) => !dismissed.includes(a.id));
  if (farm?.accessMode !== "read_only" && visible.length === 0) return null;
  return (
    <div className="account-banners">
      {farm?.accessMode === "read_only" ? (
        <Alert kind="warning">
          <strong>Conta em somente leitura.</strong> {farm.accessReason} Você consulta tudo, mas
          novos registros estão bloqueados.{" "}
          {can("org.manage") ? (
            <Link to="/fazenda/plano">Ver plano e faturas</Link>
          ) : (
            "Fale com o proprietário."
          )}{" "}
          <Link to="/fazenda/suporte">Falar com o suporte</Link>
        </Alert>
      ) : null}
      {visible.map((a) => (
        <Alert key={a.id} kind={a.level === "info" ? "info" : "warning"}>
          <strong>{a.title}.</strong> {a.body}{" "}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              const next = [...dismissed, a.id];
              setDismissed(next);
              try {
                sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
              } catch {
                /* preferência opcional */
              }
            }}
          >
            Dispensar
          </button>
        </Alert>
      ))}
    </div>
  );
}
