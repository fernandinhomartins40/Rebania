import type { AiGateway } from "@rebania/ai-gateway";
import type { Db } from "@rebania/db";
import type { SecretBox } from "@rebania/saas";
import type { Config } from "../config.ts";
import type { PaymentAdapter } from "./billing.ts";

/** Dependências compartilhadas pelas rotas. */
export interface AppContext {
  db: Db;
  config: Config;
  now: () => Date;
  /** Gateway de IA; sem provedor configurado (P-02) usa DisabledProvider. */
  ai?: AiGateway;
  /** Adapter de pagamento; null enquanto o provedor não for decidido (P-02). */
  billing?: PaymentAdapter | null;
  /** Cofre de segredos do console; montado de PLATFORM_SECRETS_KEY se ausente. */
  secrets?: SecretBox;
}
