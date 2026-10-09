import { useCallback, useEffect, useState } from "react";

/**
 * Rascunho persistido em sessionStorage: recarregar a página não limpa o
 * formulário nem volta a etapa (MN §7 "refresh não fecha drawers nem limpa formulário").
 */
export function useDraft<T>(
  key: string,
  initial: T,
): [T, (next: T | ((prev: T) => T)) => void, () => void] {
  const storageKey = `rebania.draft.${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      return raw ? ({ ...initial, ...JSON.parse(raw) } as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* armazenamento indisponível: segue só em memória */
    }
  }, [storageKey, value]);
  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    setValue(initial);
  }, [storageKey]);
  return [value, setValue, clear];
}
