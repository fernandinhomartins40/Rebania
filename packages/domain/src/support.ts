/**
 * Chamados de suporte: prazos por prioridade e transições de estado. Prazos em horas
 * corridas (sem calendário útil) até haver política de atendimento aprovada.
 */
export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_STATUSES = ["open", "waiting_customer", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_CHANNELS = ["app", "whatsapp", "email", "phone", "other"] as const;
export type TicketChannel = (typeof TICKET_CHANNELS)[number];

export const TICKET_PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Aguardando equipe",
  waiting_customer: "Aguardando cliente",
  resolved: "Resolvido",
  closed: "Fechado",
};

export const TICKET_CHANNEL_LABEL: Record<TicketChannel, string> = {
  app: "App",
  whatsapp: "WhatsApp",
  email: "E-mail",
  phone: "Telefone",
  other: "Outro",
};

/** Horas para a 1ª resposta e para a solução. */
export const SLA_HOURS: Record<TicketPriority, { firstResponse: number; resolution: number }> = {
  urgent: { firstResponse: 2, resolution: 24 },
  high: { firstResponse: 4, resolution: 48 },
  normal: { firstResponse: 24, resolution: 120 },
  low: { firstResponse: 48, resolution: 240 },
};

const HOUR = 3_600_000;

export function slaTargets(priority: TicketPriority, openedAt: Date) {
  const h = SLA_HOURS[priority];
  return {
    firstResponseDueAt: new Date(openedAt.getTime() + h.firstResponse * HOUR),
    resolutionDueAt: new Date(openedAt.getTime() + h.resolution * HOUR),
  };
}

export type SlaState = "met" | "ok" | "at_risk" | "breached";

/** "at_risk" quando falta 25% ou menos do prazo. */
export function slaState(openedAt: Date, dueAt: Date, doneAt: Date | null, now: Date): SlaState {
  if (doneAt) return doneAt <= dueAt ? "met" : "breached";
  if (now > dueAt) return "breached";
  const total = dueAt.getTime() - openedAt.getTime();
  return dueAt.getTime() - now.getTime() <= total * 0.25 ? "at_risk" : "ok";
}

/**
 * Estado após uma mensagem. Nota interna não muda nada; resposta do cliente reabre;
 * resposta pública da equipe passa a aguardar o cliente.
 */
export function statusAfterMessage(
  current: TicketStatus,
  author: "customer" | "staff",
  internal: boolean,
): TicketStatus {
  if (internal) return current;
  if (author === "customer") return "open";
  return current === "closed" ? "closed" : "waiting_customer";
}
