import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cofre de segredos da plataforma (chave do VeloMail, segredos TOTP). AES-256-GCM com a
 * chave de PLATFORM_SECRETS_KEY (32 bytes em base64 ou 64 caracteres hex). Sem a chave,
 * nada é cifrado: o console avisa e os recursos que dependem dela ficam indisponíveis.
 */
export interface SecretBox {
  readonly available: boolean;
  seal(plain: string): string;
  open(sealed: string): string;
}

export class SecretsUnavailableError extends Error {
  constructor() {
    super("PLATFORM_SECRETS_KEY não configurada no servidor.");
  }
}

export function parseSecretsKey(raw: string | null | undefined): Buffer | null {
  if (!raw) return null;
  const v = raw.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(v) ? Buffer.from(v, "hex") : Buffer.from(v, "base64");
  return key.length === 32 ? key : null;
}

export function createSecretBox(raw: string | null | undefined): SecretBox {
  const key = parseSecretsKey(raw);
  return {
    available: key !== null,
    seal(plain) {
      if (!key) throw new SecretsUnavailableError();
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", key, iv);
      const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
      return [
        "v1",
        iv.toString("base64"),
        c.getAuthTag().toString("base64"),
        data.toString("base64"),
      ].join(":");
    },
    open(sealed) {
      if (!key) throw new SecretsUnavailableError();
      const [v, iv, tag, data] = sealed.split(":");
      if (v !== "v1" || !iv || !tag || !data) throw new Error("Segredo em formato desconhecido.");
      const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
      d.setAuthTag(Buffer.from(tag, "base64"));
      return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
    },
  };
}
