import type { LocalAnimal, Place } from "@rebania/sync-core";
import { useEffect, useState } from "react";
import { localAnimals, localPlaces } from "../lib/db.ts";
import { useSession } from "../lib/session.tsx";

export function useHerd() {
  const { farm, dataVersion } = useSession();
  const [animals, setAnimals] = useState<LocalAnimal[] | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  useEffect(() => {
    if (!farm) return;
    let alive = true;
    void Promise.all([localAnimals(farm.id), localPlaces(farm.id)]).then(([a, p]) => {
      if (alive) {
        setAnimals(a);
        setPlaces(p);
      }
    });
    return () => {
      alive = false;
    };
  }, [farm, dataVersion]);
  return { animals, places };
}
