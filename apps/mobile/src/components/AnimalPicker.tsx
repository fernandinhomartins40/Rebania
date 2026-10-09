import { candidateIdentifiers, CATEGORY_LABEL } from "@rebania/domain";
import type { LocalAnimal, Place } from "@rebania/sync-core";
import { Check, Search } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { color, radius, space } from "../theme.ts";
import { Button, Field, Muted, s } from "./ui.tsx";

/**
 * Seleção em grupo (snapshot): filtrar por brinco/lote e marcar individualmente.
 * Mudar o filtro depois não altera quem já foi marcado.
 */
export function AnimalPicker({
  animals,
  places,
  eligible,
  selected,
  onChange,
}: {
  animals: LocalAnimal[];
  places: Place[];
  eligible: (a: LocalAnimal) => boolean;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [groupId, setGroupId] = useState("");
  const pool = useMemo(
    () => animals.filter((a) => a.status === "active" && eligible(a)),
    [animals, eligible],
  );
  const visible = useMemo(() => {
    const values = q.trim() ? candidateIdentifiers(q).map((c) => c.value) : null;
    return pool
      .filter((a) => (groupId ? a.groupId === groupId : true))
      .filter(
        (a) => !values || a.identifiers.some((i) => values.some((v) => i.value.startsWith(v))),
      )
      .sort((a, b) =>
        (a.primaryIdentifier ?? "").localeCompare(b.primaryIdentifier ?? "", "pt-BR", {
          numeric: true,
        }),
      )
      .slice(0, 200);
  }, [pool, q, groupId]);
  const set = new Set(selected);
  const groups = places.filter((p) => p.kind === "group");
  return (
    <View>
      <Field
        label="Buscar por brinco"
        icon={<Search size={20} color={color.textPrimary} />}
        autoCapitalize="characters"
        value={q}
        onChangeText={setQ}
      />
      {groups.length ? (
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.md }}
        >
          {[{ id: "", name: "Todos os lotes" }, ...groups].map((g) => (
            <Pressable
              key={g.id || "all"}
              accessibilityRole="button"
              accessibilityState={{ selected: groupId === g.id }}
              onPress={() => setGroupId(g.id)}
              style={{
                minHeight: 40,
                paddingHorizontal: space.md,
                justifyContent: "center",
                borderRadius: radius.md,
                backgroundColor: groupId === g.id ? color.brandSage : color.surface,
                borderWidth: 1,
                borderColor: "#CBD5CC",
              }}
            >
              <Text style={{ fontWeight: "700", color: color.textPrimary }}>{g.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Button
            label={`Marcar ${visible.length} visíveis`}
            variant="secondary"
            disabled={!visible.length}
            onPress={() => onChange([...new Set([...selected, ...visible.map((a) => a.id)])])}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label="Limpar"
            variant="ghost"
            disabled={!selected.length}
            onPress={() => onChange([])}
          />
        </View>
      </View>
      <Muted>
        {selected.length} selecionado(s) de {pool.length} apto(s)
      </Muted>
      <View style={{ marginTop: space.sm }}>
        {visible.map((a) => {
          const on = set.has(a.id);
          return (
            <Pressable
              key={a.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() =>
                onChange(on ? selected.filter((x) => x !== a.id) : [...selected, a.id])
              }
              style={[s.row, { minHeight: 56 }]}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  borderWidth: 2,
                  borderColor: color.brandPrimary,
                  backgroundColor: on ? color.brandPrimary : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {on ? <Check size={18} color="#fff" /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>
                  {CATEGORY_LABEL[a.category]} {a.primaryIdentifier}
                </Text>
                <Muted>{a.groupName ?? "Sem lote"}</Muted>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
