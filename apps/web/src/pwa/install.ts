/**
 * Instalação do app (PWA). Android/Chrome avisa por `beforeinstallprompt`, que pode
 * disparar antes do React montar: o evento é guardado aqui, na carga do módulo.
 * iPhone/iPad não têm instalação automática: só por Compartilhar → Adicionar à Tela de Início.
 */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // nós mostramos o convite, no momento certo
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    emit();
  });
}

export function subscribeInstall(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const canPromptInstall = () => deferred !== null;
export const justInstalled = () => installed;

/** Abre o diálogo nativo de instalação (Android/Chrome/Edge). */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const e = deferred;
  if (!e) return "unavailable";
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === "accepted") installed = true;
  emit();
  return outcome;
}

export type InstallPlatform = "ios-safari" | "ios-other" | "android" | "desktop";

/** Plataforma pelo user agent (iPadOS se apresenta como Mac com tela de toque). */
export function detectPlatform(ua: string, maxTouchPoints = 0): InstallPlatform {
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//i.test(ua) ? "ios-other" : "ios-safari";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// "Agora não": volta a aparecer depois de alguns dias, sem insistir.
const SNOOZE_KEY = "rebania.installSnoozedUntil";
export const SNOOZE_DAYS = 14;

export function isSnoozed(now = Date.now()): boolean {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > now;
  } catch {
    return false;
  }
}

export function snooze(now = Date.now()) {
  try {
    localStorage.setItem(SNOOZE_KEY, String(now + SNOOZE_DAYS * 86_400_000));
  } catch {
    /* preferência opcional */
  }
  emit(); // o próximo convite (ex.: entrar com a digital) pode aparecer
}
