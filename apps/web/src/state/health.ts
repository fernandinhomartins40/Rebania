import type { PlanItemDto, ProductDto } from "@rebania/contracts";
import { useCachedGet } from "./cached.ts";

export function useProducts(farmId: string) {
  const r = useCachedGet<{ items: ProductDto[] }>(
    `/v1/farms/${farmId}/products`,
    `products:${farmId}`,
  );
  return { products: r.data?.items ?? null, offline: r.offline, reload: r.reload };
}

export function usePlan(farmId: string) {
  const r = useCachedGet<{ items: PlanItemDto[] }>(
    `/v1/farms/${farmId}/health/plan`,
    `plan:${farmId}`,
  );
  return { plan: r.data?.items ?? null, offline: r.offline, reload: r.reload };
}
