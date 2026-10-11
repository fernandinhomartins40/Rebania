/**
 * Modelos de e-mail transacional. Todo e-mail sai daqui (assunto, HTML e texto). Sem
 * imagens remotas além do logo do próprio site; texto curto, em pt-BR.
 */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const civilBr = (civil: string) => civil.split("-").reverse().join("/");

interface Block {
  lines: string[];
  action?: { label: string; url: string };
  footnote?: string;
}

function layout(base: string, title: string, b: Block): { html: string; text: string } {
  const paras = b.lines.map((l) => `<p style="margin:0 0 14px">${esc(l)}</p>`).join("");
  const button = b.action
    ? `<p style="margin:22px 0"><a href="${esc(b.action.url)}" style="background:#163e32;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block">${esc(b.action.label)}</a></p>`
    : "";
  const foot = b.footnote
    ? `<p style="color:#4e6158;font-size:13px;margin:18px 0 0">${esc(b.footnote)}</p>`
    : "";
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f7f4ed;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#182a24">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<img src="${esc(base)}/brand/rebania-logo.png" alt="Rebania" width="150" style="display:block;margin:0 0 22px">
<div style="background:#fff;border-radius:14px;padding:26px 24px;border:1px solid #e6e0d3">
<h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>${paras}${button}${foot}
</div>
<p style="color:#4e6158;font-size:12px;margin:18px 4px 0">Rebania · Sua fazenda em dia.</p>
</div></body></html>`;
  const text = [
    title,
    "",
    ...b.lines,
    ...(b.action ? ["", `${b.action.label}: ${b.action.url}`] : []),
    ...(b.footnote ? ["", b.footnote] : []),
    "",
    "Rebania · Sua fazenda em dia.",
  ].join("\n");
  return { html, text };
}

type Renderer<D> = (base: string, d: D) => RenderedEmail;

function make<D>(
  subject: (d: D) => string,
  title: (d: D) => string,
  block: (base: string, d: D) => Block,
): Renderer<D> {
  return (base, d) => ({ subject: subject(d), ...layout(base, title(d), block(base, d)) });
}

const payBlock = (d: { paymentUrl?: string | null; instructions?: string | null }) => [
  ...(d.instructions ? [`Como pagar: ${d.instructions}`] : []),
];

export const TEMPLATES = {
  mail_test: make<Record<string, never>>(
    () => "Teste de envio do Rebania",
    () => "O envio de e-mails está funcionando",
    () => ({ lines: ["Esta é uma mensagem de teste enviada pelo console da plataforma."] }),
  ),
  password_reset: make<{ name: string; url: string; requestedByStaff: boolean }>(
    () => "Redefinir sua senha do Rebania",
    () => "Redefinir senha",
    (_b, d) => ({
      lines: [
        `Olá, ${d.name}.`,
        d.requestedByStaff
          ? "A equipe Rebania enviou um link para você definir uma nova senha."
          : "Recebemos um pedido para redefinir a senha da sua conta.",
        "O link vale por 1 hora e só pode ser usado uma vez.",
      ],
      action: { label: "Definir nova senha", url: d.url },
      footnote: "Se você não pediu, ignore este e-mail: sua senha continua a mesma.",
    }),
  ),
  invitation: make<{ organizationName: string; roleLabel: string; url: string; expiresOn: string }>(
    (d) => `Convite para ${d.organizationName} no Rebania`,
    () => "Você foi convidado",
    (_b, d) => ({
      lines: [
        `Você foi convidado para participar de ${d.organizationName} como ${d.roleLabel}.`,
        `O convite vale até ${civilBr(d.expiresOn)} e só pode ser usado uma vez.`,
      ],
      action: { label: "Aceitar convite", url: d.url },
    }),
  ),
  staff_welcome: make<{ name: string; roleLabel: string; url: string }>(
    () => "Seu acesso ao console do Rebania",
    () => "Bem-vindo à equipe",
    (_b, d) => ({
      lines: [
        `Olá, ${d.name}. Você tem acesso ao console da plataforma como ${d.roleLabel}.`,
        "Defina sua senha pelo link abaixo (vale 1 hora). No primeiro acesso, ative a verificação em duas etapas.",
      ],
      action: { label: "Definir senha", url: d.url },
    }),
  ),
  invoice_issued: make<{
    organizationName: string;
    description: string;
    amountCents: number;
    dueOn: string;
    paymentUrl: string | null;
    instructions: string | null;
    planUrl: string;
  }>(
    (d) => `Fatura Rebania: ${d.description}`,
    () => "Nova fatura disponível",
    (_b, d) => ({
      lines: [
        `${d.organizationName}, sua fatura "${d.description}" de ${brl(d.amountCents)} vence em ${civilBr(d.dueOn)}.`,
        ...payBlock(d),
      ],
      action: d.paymentUrl
        ? { label: "Pagar fatura", url: d.paymentUrl }
        : { label: "Ver faturas", url: d.planUrl },
    }),
  ),
  invoice_reminder: make<{
    stage: "before_due" | "due_today" | "overdue" | "overdue_week";
    description: string;
    amountCents: number;
    dueOn: string;
    paymentUrl: string | null;
    instructions: string | null;
    planUrl: string;
    graceDays: number;
  }>(
    (d) =>
      d.stage === "before_due"
        ? `Fatura vence em ${civilBr(d.dueOn)}`
        : d.stage === "due_today"
          ? "Fatura vence hoje"
          : "Fatura em atraso",
    (d) =>
      d.stage === "before_due" || d.stage === "due_today"
        ? "Lembrete de vencimento"
        : "Fatura em atraso",
    (_b, d) => ({
      lines: [
        `Fatura "${d.description}" de ${brl(d.amountCents)} com vencimento em ${civilBr(d.dueOn)}.`,
        ...(d.stage === "overdue" || d.stage === "overdue_week"
          ? [
              `Com mais de ${d.graceDays} dias de atraso, a conta passa a somente leitura: os dados continuam visíveis, mas novos registros ficam bloqueados até o pagamento.`,
            ]
          : []),
        ...payBlock(d),
      ],
      action: d.paymentUrl
        ? { label: "Pagar fatura", url: d.paymentUrl }
        : { label: "Ver faturas", url: d.planUrl },
      footnote: "Se já pagou, desconsidere. A baixa pode levar até um dia útil.",
    }),
  ),
  access_read_only: make<{ organizationName: string; reason: string; planUrl: string }>(
    () => "Sua conta Rebania está em somente leitura",
    () => "Conta em somente leitura",
    (_b, d) => ({
      lines: [
        `${d.organizationName}: ${d.reason}`,
        "Seus dados continuam disponíveis para consulta, mas novos registros estão bloqueados.",
      ],
      action: { label: "Ver plano e faturas", url: d.planUrl },
    }),
  ),
  access_restored: make<{ organizationName: string }>(
    () => "Acesso completo restabelecido",
    () => "Tudo certo com sua conta",
    (_b, d) => ({
      lines: [`${d.organizationName}: o acesso completo ao Rebania foi restabelecido.`],
    }),
  ),
  ticket_reply: make<{ number: number; subject: string; excerpt: string; url: string }>(
    (d) => `Resposta no chamado #${d.number}`,
    (d) => `Chamado #${d.number}: ${d.subject}`,
    (_b, d) => ({
      lines: ["A equipe Rebania respondeu:", d.excerpt],
      action: { label: "Abrir chamado", url: d.url },
    }),
  ),
  ticket_new_team: make<{
    number: number;
    subject: string;
    organizationName: string;
    priority: string;
    url: string;
  }>(
    (d) => `[Chamado #${d.number}] ${d.subject}`,
    (d) => `Novo chamado de ${d.organizationName}`,
    (_b, d) => ({
      lines: [`Assunto: ${d.subject}`, `Prioridade: ${d.priority}`],
      action: { label: "Atender no console", url: d.url },
    }),
  ),
  support_access_request: make<{
    organizationName: string;
    staffName: string;
    hours: number;
    reason: string;
    url: string;
  }>(
    () => "A equipe Rebania pede acesso de suporte",
    () => "Pedido de acesso de suporte",
    (_b, d) => ({
      lines: [
        `${d.staffName}, da equipe Rebania, pede acesso de leitura aos dados de ${d.organizationName} por ${d.hours} hora(s).`,
        `Motivo: ${d.reason}`,
        "O acesso só é liberado se você aprovar, pode ser revogado a qualquer momento e cada leitura fica registrada.",
      ],
      action: { label: "Revisar pedido", url: d.url },
    }),
  ),
} as const;

export type TemplateName = keyof typeof TEMPLATES;
export type TemplateData<T extends TemplateName> = Parameters<(typeof TEMPLATES)[T]>[1];

export function renderEmail<T extends TemplateName>(
  name: T,
  baseUrl: string,
  data: TemplateData<T>,
): RenderedEmail {
  const r = TEMPLATES[name] as unknown as Renderer<TemplateData<T>>;
  return r(baseUrl.replace(/\/$/, ""), data);
}
