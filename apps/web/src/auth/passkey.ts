/**
 * Passkeys no navegador: entrar com digital, senha do celular ou Face ID (WebAuthn).
 * A biometria fica no aparelho; o servidor só recebe a assinatura.
 */
import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
  WebAuthnError,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { ApiError, NetworkError, post } from "../api/client.ts";
import { detectPlatform } from "../pwa/install.ts";

export const passkeySupported = () => browserSupportsWebAuthn();

/** Aparelho com leitor próprio (digital, Face ID, Windows Hello…), não só chave USB. */
export async function deviceUnlockAvailable(): Promise<boolean> {
  if (!browserSupportsWebAuthn()) return false;
  try {
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

/** Como o aparelho chama a trava: "digital ou Face ID" no iPhone, "digital" no Android. */
export function unlockName(): string {
  const p = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
  if (p === "ios-safari" || p === "ios-other") return "Face ID ou Touch ID";
  if (p === "android") return "digital ou senha do celular";
  return "biometria ou PIN do computador";
}

/** Rótulo curto do botão de entrada (cabe numa linha no celular). */
export function passkeyLoginLabel(): string {
  const p = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
  if (p === "ios-safari" || p === "ios-other") return "Entrar com Face ID";
  if (p === "android") return "Entrar com a digital";
  return "Entrar sem senha";
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "iPad";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) return "Celular Android";
  if (/Windows/i.test(ua)) return "Computador Windows";
  if (/Macintosh/i.test(ua)) return "Mac";
  return "Este aparelho";
}

/** Cancelar no diálogo do sistema não é erro: devolve null. */
function cancelled(err: unknown) {
  if (err instanceof WebAuthnError && err.code === "ERROR_CEREMONY_ABORTED") return true;
  return err instanceof Error && (err.name === "NotAllowedError" || err.name === "AbortError");
}

export async function registerPasskey(): Promise<"ok" | "cancelled"> {
  const { challengeId, options } = await post<{
    challengeId: string;
    options: PublicKeyCredentialCreationOptionsJSON;
  }>("/v1/auth/passkeys/register/options");
  let response;
  try {
    response = await startRegistration({ optionsJSON: options });
  } catch (err) {
    if (cancelled(err)) return "cancelled";
    if (err instanceof WebAuthnError && err.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED")
      throw new Error("Este aparelho já está cadastrado para entrar sem senha.");
    throw err;
  }
  await post("/v1/auth/passkeys/register/verify", { challengeId, response, label: deviceLabel() });
  return "ok";
}

export async function loginWithPasskey(): Promise<"ok" | "cancelled"> {
  const { challengeId, options } = await post<{
    challengeId: string;
    options: PublicKeyCredentialRequestOptionsJSON;
  }>("/v1/auth/passkeys/login/options");
  let response;
  try {
    response = await startAuthentication({ optionsJSON: options });
  } catch (err) {
    if (cancelled(err)) return "cancelled";
    throw err;
  }
  await post("/v1/auth/passkeys/login/verify", { challengeId, response });
  return "ok";
}

/** Mensagem em português: as do navegador vêm em inglês. */
export function passkeyErrorMessage(err: unknown): string {
  if (err instanceof ApiError || err instanceof NetworkError) return err.message;
  if (err instanceof Error && err.message.startsWith("Este aparelho")) return err.message;
  return "O aparelho não conseguiu usar a trava de tela agora. Tente de novo ou entre com a senha.";
}

// Oferta "entrar com a digital" depois do login por senha: por aparelho, sem insistir.
const OFFER_KEY = "rebania.passkeyOffer";
export function offerDismissed(userId: string): boolean {
  try {
    return localStorage.getItem(`${OFFER_KEY}.${userId}`) !== null;
  } catch {
    return true;
  }
}
export function dismissOffer(userId: string, why: "done" | "later") {
  try {
    localStorage.setItem(`${OFFER_KEY}.${userId}`, why);
  } catch {
    /* preferência opcional */
  }
}
