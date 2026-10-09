import { useEffect, useState } from "react";
import { localAnimal, localAnimals, localPlaces, type LocalAnimal, type Place } from "../offline/engine.ts";
import { useSync } from "./sync.tsx";

/** Rebanho a partir do armazenamento local (funciona offline). */
export function useLocalHerd(farmId: string) {
  const { version } = useSync();
  const [animals, setAnimals] = useState<LocalAnimal[] | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    void Promise.all([localAnimals(farmId), localPlaces(farmId)]).then(([a, p]) => {
      if (!alive) return;
      setAnimals(a);
      setPlaces(p.sort((x, y) => x.name.localeCompare(y.name, "pt-BR")));
    });
    return () => {
      alive = false;
    };
  }, [farmId, version, tick]);
  return { animals, places, refresh: () => setTick((t) => t + 1) };
}

export function useLocalAnimal(id: string | undefined) {
  const { version } = useSync();
  const [animal, setAnimal] = useState<LocalAnimal | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    void localAnimal(id).then((a) => alive && setAnimal(a ?? null));
    return () => {
      alive = false;
    };
  }, [id, version, tick]);
  return { animal, refresh: () => setTick((t) => t + 1) };
}
