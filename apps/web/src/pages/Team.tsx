import type { Member } from "@rebania/contracts";
import { canAssignRole, ROLE_LABEL, ROLES, type Role } from "@rebania/domain";
import { useCallback, useEffect, useState } from "react";
import { errorMessage, get, post } from "../api/client.ts";
import { Alert, Field, formatDate, Loading, PageHead } from "../components/ui.tsx";
import { useSession } from "../state/session.tsx";

interface Pending { id: string; email: string; role: Role; expiresAt: string }

/** T04 Organização: pessoas e papéis; convite limitado e revogável. */
export function TeamPage() {
  const { farm, farms, can } = useSession();
  const orgId = farm!.organizationId;
  const orgFarms = farms.filter((f) => f.organizationId === orgId);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("field");
  const [farmIds, setFarmIds] = useState<string[]>([farm!.id]);
  const [link, setLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMembers(await get<Member[]>(`/v1/orgs/${orgId}/members`));
      if (can("members.invite")) setPending(await get<Pending[]>(`/v1/orgs/${orgId}/invitations`));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [orgId, can]);
  useEffect(() => void load(), [load]);

  const assignable = ROLES.filter((r) => canAssignRole(farm!.role, r));

  return (
    <section>
      <PageHead title="Equipe" back="/fazenda" />
      {error ? <Alert kind="danger">{error}</Alert> : null}
      <div className="card">
        {!members ? <Loading /> : (
          <ul className="list">
            {members.map((m) => (
              <li key={m.membershipId} className="list-item">
                <span>
                  <span className="title">{m.name}</span>
                  <div className="meta">{m.email} · {ROLE_LABEL[m.role]} · {m.allFarms ? "todas as fazendas" : `${m.farmIds.length} fazenda(s)`}</div>
                </span>
                {can("org.manage") && m.role !== "owner" ? (
                  <button className="btn btn-danger" onClick={async () => {
                    if (!confirm(`Remover o acesso de ${m.name}?`)) return;
                    try { await post(`/v1/orgs/${orgId}/members/${m.membershipId}/revoke`); await load(); } catch (e) { setError(errorMessage(e)); }
                  }}>Remover</button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {can("members.invite") ? (
        <>
          <div className="card">
            <h2>Convidar pessoa</h2>
            {link ? (
              <Alert kind="success">
                Convite criado. Envie este link pessoalmente (válido por 7 dias, uso único):
                <br />
                <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link do convite" />
              </Alert>
            ) : null}
            <form onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              try {
                const r = await post<{ acceptUrl: string }>(`/v1/orgs/${orgId}/invitations`, { email, role, farmIds });
                setLink(r.acceptUrl);
                setEmail("");
                await load();
              } catch (err) { setError(errorMessage(err)); }
            }}>
              <div className="grid two">
                <Field id="inv-email" label="E-mail">
                  <input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field id="inv-role" label="Papel">
                  <select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                    {assignable.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </Field>
              </div>
              <fieldset className="field" style={{ border: 0, padding: 0 }}>
                <legend style={{ fontWeight: 600, marginBottom: 4 }}>Fazendas com acesso</legend>
                {orgFarms.map((f) => (
                  <label key={f.id} style={{ fontWeight: 400, display: "flex", gap: 8, alignItems: "center", minHeight: 40 }}>
                    <input type="checkbox" style={{ width: "auto", minHeight: 0 }} checked={farmIds.includes(f.id)}
                      onChange={(e) => setFarmIds((p) => e.target.checked ? [...p, f.id] : p.filter((x) => x !== f.id))} />
                    {f.name}
                  </label>
                ))}
              </fieldset>
              <button className="btn btn-primary" disabled={!farmIds.length}>Gerar convite</button>
            </form>
          </div>
          {pending.length ? (
            <div className="card">
              <h2>Convites pendentes</h2>
              <ul className="list">
                {pending.map((p) => (
                  <li key={p.id} className="list-item">
                    <span><span className="title">{p.email}</span><div className="meta">{ROLE_LABEL[p.role]} · expira em {formatDate(p.expiresAt.slice(0, 10))}</div></span>
                    <button className="btn btn-danger" onClick={async () => { await post(`/v1/orgs/${orgId}/invitations/${p.id}/revoke`); await load(); }}>Revogar</button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
