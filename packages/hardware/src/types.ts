import type { IdentifierType } from "@rebania/domain";

/**
 * Contratos de hardware (MN §8). Cada combinação leitor + firmware + plataforma +
 * tipo de tag precisa de homologação física antes de ser anunciada como suportada.
 * Sem aparelho homologado, o adapter pode existir mas a homologação fica PENDENTE.
 */
export type Transport =
  "keyboard_wedge" | "ble" | "usb_serial" | "nfc_native" | "camera" | "manual";

export interface Capability {
  transport: Transport;
  available: boolean;
  /** Motivo quando indisponível (ex.: "Web NFC não suportado no Safari/iOS"). */
  reason?: string;
}

export interface IdentifierRead {
  type: IdentifierType;
  /** Valor normalizado (ver @rebania/domain normalizeIdentifier). */
  value: string;
  raw: string;
  transport: Transport;
  readAt: number;
}

export interface WeightRead {
  weightKg: number;
  /** Balanças informam estabilidade; leituras instáveis não devem ser confirmadas automaticamente. */
  stable: boolean;
  raw: string;
  transport: Transport;
  readAt: number;
}

export type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

export interface DeviceAdapter<TRead> {
  readonly id: string;
  readonly label: string;
  readonly transport: Transport;
  /** Situação da homologação física desta combinação. */
  readonly certification: "certified" | "pending";
  state(): ConnectionState;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onRead(listener: (read: TRead) => void): () => void;
  onStateChange(listener: (state: ConnectionState) => void): () => void;
}

export type IdentifierReader = DeviceAdapter<IdentifierRead>;
export type ScaleReader = DeviceAdapter<WeightRead>;
