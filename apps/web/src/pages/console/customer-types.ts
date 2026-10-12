export interface InvoiceDto {
  id: string;
  organizationId: string;
  organizationName?: string;
  contractId: string | null;
  kind: string;
  reference: string | null;
  description: string;
  amountCents: number;
  dueOn: string;
  status: string;
  displayStatus: string;
  paidAt: string | null;
  paymentUrl: string | null;
  notes: string | null;
}

export interface CapacityLine {
  key: "farms" | "activeAnimals" | "users" | "mediaGb";
  limit: number | null;
  used: number;
  ratio: number | null;
  status: "ok" | "near" | "over" | "unlimited";
}

export interface Limits {
  farms?: number;
  activeAnimals?: number;
  users?: number;
  mediaGb?: number;
}

export interface ContractDto {
  id: string;
  plan: string;
  planId: string | null;
  planVersion: number | null;
  status: "draft" | "active" | "suspended" | "ended";
  implementationCents: number | null;
  monthlyCents: number | null;
  startsOn: string;
  endsOn: string | null;
  billingDay: number | null;
  limits: Limits | null;
  notes: string | null;
  amendments: {
    id: string;
    description: string;
    monthlyCents: number | null;
    limits: Limits | null;
    effectiveOn: string;
  }[];
}

export interface StepDto {
  id: string;
  title: string;
  description: string | null;
  status: "todo" | "doing" | "done" | "skipped";
  assignee: { id: string; name: string } | null;
  dueOn: string | null;
}

export interface CustomerDto {
  id: string;
  name: string;
  stage: string;
  accessMode: string;
  accessReason: string | null;
  isDemo: boolean;
  document: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  createdAt: string;
  lastActivityAt: string | null;
  accountManager: { id: string; name: string } | null;
  farms: { id: string; name: string; timezone: string; archived: boolean; createdAt: string }[];
  usage: Record<string, number>;
  capacity: CapacityLine[];
  currentMonthlyCents: number | null;
  contracts: ContractDto[];
  invoices: InvoiceDto[];
  credits: {
    balance: number;
    ledger: {
      id: string;
      kind: string;
      amount: number;
      balanceAfter: number;
      reservationId: string | null;
      note: string | null;
      createdAt: string;
    }[];
    orders: {
      id: string;
      credits: number;
      priceCents: number;
      status: string;
      createdAt: string;
    }[];
  };
  contacts: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    role: string | null;
    billing: boolean;
  }[];
  pendingInvitations: { id: string; email: string; role: string; expiresAt: string }[];
  onboarding: StepDto[];
  tickets: {
    id: string;
    number: number;
    subject: string;
    status: string;
    priority: string;
    createdAt: string;
  }[];
  supportGrants: {
    id: string;
    platformUserId: string;
    platformUserName: string;
    reason: string;
    expiresAt: string;
    active: boolean;
  }[];
  accessRequests: {
    id: string;
    platformUserName: string;
    reason: string;
    hours: number;
    status: string;
    createdAt: string;
  }[];
}

export interface StaffLite {
  userId: string;
  name: string;
  role: string;
}

export const CAPACITY_LABEL: Record<string, string> = {
  farms: "Fazendas",
  activeAnimals: "Animais ativos",
  users: "Usuários",
  mediaGb: "Fotos e anexos (GB)",
};
