import type { ConnectionState, IdentifierRead, IdentifierReader } from "./types.ts";
import { parseRfidLine } from "./parsers.ts";

/**
 * Leitor em modo teclado (HID): o bastão "digita" o código e envia Enter.
 * Funciona no web e no nativo sem driver; serve também de fallback quando o
 * leitor BLE desconecta. Homologação por modelo continua PENDENTE.
 */
export class KeyboardWedgeReader implements IdentifierReader {
  readonly id = "keyboard-wedge";
  readonly label = "Leitor em modo teclado";
  readonly transport = "keyboard_wedge" as const;
  readonly certification = "pending" as const;
  private readListeners = new Set<(r: IdentifierRead) => void>();
  private stateListeners = new Set<(s: ConnectionState) => void>();
  private current: ConnectionState = "disconnected";

  constructor(private readonly now: () => number = Date.now) {}

  state() {
    return this.current;
  }
  async connect() {
    this.setState("connected");
  }
  async disconnect() {
    this.setState("disconnected");
  }
  onRead(fn: (r: IdentifierRead) => void) {
    this.readListeners.add(fn);
    return () => {
      this.readListeners.delete(fn);
    };
  }
  onStateChange(fn: (s: ConnectionState) => void) {
    this.stateListeners.add(fn);
    return () => {
      this.stateListeners.delete(fn);
    };
  }

  /** Chamado pela UI quando o campo de leitura recebe Enter. */
  submitLine(line: string): IdentifierRead | null {
    if (this.current !== "connected") return null;
    const rfid = parseRfidLine(line);
    const read: IdentifierRead = rfid
      ? { type: "rfid", value: rfid, raw: line, transport: this.transport, readAt: this.now() }
      : { type: "visual_tag", value: line.trim().toUpperCase(), raw: line, transport: this.transport, readAt: this.now() };
    if (!read.value) return null;
    for (const fn of this.readListeners) fn(read);
    return read;
  }

  private setState(s: ConnectionState) {
    this.current = s;
    for (const fn of this.stateListeners) fn(s);
  }
}
