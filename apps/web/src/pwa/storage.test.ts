import { afterEach, describe, expect, it, vi } from "vitest";
import { requestStorageProtection, storageProtection } from "./storage.ts";

function stubStorage(storage: Partial<StorageManager> | undefined) {
  Object.defineProperty(navigator, "storage", { value: storage, configurable: true });
}

describe("armazenamento protegido", () => {
  afterEach(() => stubStorage(undefined));

  it("sem a API, informa que não há suporte", async () => {
    stubStorage(undefined);
    expect(await storageProtection()).toBe("unsupported");
    expect(await requestStorageProtection()).toBe("unsupported");
  });

  it("pede proteção só quando ainda não tem", async () => {
    const persist = vi.fn(async () => true);
    stubStorage({ persisted: async () => false, persist });
    expect(await storageProtection()).toBe("best_effort");
    expect(await requestStorageProtection()).toBe("protected");
    expect(persist).toHaveBeenCalledTimes(1);

    const again = vi.fn(async () => true);
    stubStorage({ persisted: async () => true, persist: again });
    expect(await requestStorageProtection()).toBe("protected");
    expect(again).not.toHaveBeenCalled();
  });

  it("navegador recusa: continua funcionando, só sem garantia", async () => {
    stubStorage({ persisted: async () => false, persist: async () => false });
    expect(await requestStorageProtection()).toBe("best_effort");
  });
});
