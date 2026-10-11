import { Link } from "react-router";
import { patch, post } from "../../api/client.ts";
import { Empty, formatDate } from "../../components/ui.tsx";
import type { InvoiceDto } from "./customer-types.ts";
import { askReason, brl, InvoiceBadge, INVOICE_KIND, RunButton, useStaff } from "./kit.tsx";

/** Tabela de faturas com as ações de cobrança manual (baixa, link de pagamento, reenvio). */
export function InvoiceTable({
  items,
  reload,
  showCustomer = false,
}: {
  items: InvoiceDto[];
  reload: () => void;
  showCustomer?: boolean;
}) {
  const { can } = useStaff();
  const manage = can("billing.manage");
  if (!items.length) return <Empty title="Nenhuma fatura" />;
  return (
    <div className="console-table-wrap">
      <table className="data">
        <thead>
          <tr>
            {showCustomer ? <th>Cliente</th> : null}
            <th>Fatura</th>
            <th>Vencimento</th>
            <th>Valor</th>
            <th>Situação</th>
            {manage ? <th>Ações</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const open = i.status === "pending" || i.status === "failed";
            return (
              <tr key={i.id}>
                {showCustomer ? (
                  <td>
                    <Link to={`/console/clientes/${i.organizationId}?aba=faturas`}>
                      {i.organizationName}
                    </Link>
                  </td>
                ) : null}
                <td>
                  {i.description}
                  <div className="meta">
                    {INVOICE_KIND[i.kind] ?? i.kind}
                    {i.paymentUrl ? " · com link de pagamento" : ""}
                    {i.notes ? ` · ${i.notes}` : ""}
                  </div>
                </td>
                <td>{formatDate(i.dueOn)}</td>
                <td>{brl(i.amountCents)}</td>
                <td>
                  <InvoiceBadge status={i.displayStatus} />
                  {i.paidAt ? (
                    <div className="meta">em {formatDate(i.paidAt.slice(0, 10))}</div>
                  ) : null}
                </td>
                {manage ? (
                  <td>
                    {open ? (
                      <>
                        <RunButton
                          label="Dar baixa"
                          run={async () => {
                            const note = askReason(
                              "Como foi pago? (ex.: Pix conferido no extrato de 12/10)",
                            );
                            if (!note) return;
                            await post(`/v1/platform/invoices/${i.id}/mark`, {
                              status: "paid",
                              note,
                            });
                            reload();
                          }}
                        />
                        <RunButton
                          label="Link"
                          run={async () => {
                            const url = window.prompt(
                              "Link de pagamento (Pix/boleto). Deixe vazio para remover:",
                              i.paymentUrl ?? "",
                            );
                            if (url === null) return;
                            await patch(`/v1/platform/invoices/${i.id}`, {
                              paymentUrl: url.trim() || null,
                            });
                            reload();
                          }}
                        />
                        <RunButton
                          label="Reenviar"
                          run={async () => {
                            const r = await post<{ recipients: number }>(
                              `/v1/platform/invoices/${i.id}/resend`,
                            );
                            window.alert(
                              r.recipients
                                ? `Fatura enviada a ${r.recipients} destinatário(s).`
                                : "Nenhum destinatário com e-mail (ou e-mail desligado).",
                            );
                          }}
                        />
                        <RunButton
                          label="Cancelar"
                          run={async () => {
                            const note = askReason("Motivo do cancelamento:");
                            if (!note) return;
                            await post(`/v1/platform/invoices/${i.id}/mark`, {
                              status: "cancelled",
                              note,
                            });
                            reload();
                          }}
                        />
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
