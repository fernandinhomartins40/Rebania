/**
 * Armazenamento protegido: pede ao navegador que não apague os dados do aparelho
 * (fila de registros offline, rebanho em cache) quando faltar espaço. Chrome/Android
 * costuma conceder para o app instalado; Safari/iOS decide pelo uso do app.
 */
export type StorageProtection = "protected" | "best_effort" | "unsupported";

export async function storageProtection(): Promise<StorageProtection> {
  const s = typeof navigator !== "undefined" ? navigator.storage : undefined;
  if (!s?.persisted) return "unsupported";
  try {
    return (await s.persisted()) ? "protected" : "best_effort";
  } catch {
    return "unsupported";
  }
}

/** Pede a proteção (sem diálogo na maioria dos navegadores) e devolve o estado final. */
export async function requestStorageProtection(): Promise<StorageProtection> {
  const s = typeof navigator !== "undefined" ? navigator.storage : undefined;
  if (!s?.persist) return "unsupported";
  try {
    if (await s.persisted()) return "protected";
    return (await s.persist()) ? "protected" : "best_effort";
  } catch {
    return "unsupported";
  }
}
