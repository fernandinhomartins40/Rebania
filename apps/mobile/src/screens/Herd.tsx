import { candidateIdentifiers, CATEGORY_LABEL } from "@rebania/domain";
import type { LocalAnimal } from "@rebania/sync-core";
import { useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { Field, Loading, Muted, s, Screen } from "../components/ui.tsx";
import { useHerd } from "./hooks.ts";

export function HerdScreen({ open }: { open: (a: LocalAnimal) => void }) {
  const { animals } = useHerd();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const values = q.trim() ? candidateIdentifiers(q).map((c) => c.value) : null;
    return (animals ?? [])
      .filter((a) => a.status === "active")
      .filter((a) => !values || a.identifiers.some((i) => values.some((v) => i.value.startsWith(v))))
      .sort((a, b) => (a.primaryIdentifier ?? "").localeCompare(b.primaryIdentifier ?? "", "pt-BR", { numeric: true }));
  }, [animals, q]);
  if (!animals) return <Loading />;
  return (
    <Screen title="Rebanho">
      <Field label="Buscar pelo brinco ou RFID" value={q} onChangeText={setQ} autoCapitalize="characters" />
      <Muted>{list.length} animal(is)</Muted>
      <FlatList
        data={list}
        keyExtractor={(a) => a.id}
        ListEmptyComponent={<Muted>Nenhum animal encontrado.</Muted>}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => open(item)} style={s.row}>
            <View>
              <Text style={s.rowTitle}>{item.primaryIdentifier ?? "Sem identificador"}{item.pending ? " · no aparelho" : ""}</Text>
              <Muted>
                {CATEGORY_LABEL[item.category]} · {item.groupName ?? "sem lote"}
                {item.lastWeight ? ` · ${item.lastWeight.weightKg} kg` : ""}
              </Muted>
            </View>
            <Text accessibilityElementsHidden>›</Text>
          </Pressable>
        )}
      />
    </Screen>
  );
}
