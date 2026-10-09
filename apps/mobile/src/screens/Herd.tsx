import {
  ageInMonths,
  candidateIdentifiers,
  CATEGORY_LABEL,
  todayInTimezone,
  type Category,
} from "@rebania/domain";
import type { LocalAnimal } from "@rebania/sync-core";
import { ChevronRight, Search } from "lucide-react-native";
import { useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { Field, LINE, Loading, Muted, PageHead, PhotoPlaceholder, s } from "../components/ui.tsx";
import { useSession } from "../lib/session.tsx";
import { color, radius, space } from "../theme.ts";
import { useHerd } from "./hooks.ts";

const TABS: { key: string; label: string; match: (c: Category) => boolean }[] = [
  { key: "todos", label: "Todos", match: () => true },
  { key: "matrizes", label: "Matrizes", match: (c) => c === "cow" || c === "heifer" },
  { key: "bezerros", label: "Bezerros", match: (c) => c === "calf_female" || c === "calf_male" },
  { key: "reprodutores", label: "Reprodutores", match: (c) => c === "bull" },
];

const age = (m: number) => (m < 24 ? `${m} meses` : `${Math.floor(m / 12)} anos`);

export function HerdScreen({ open }: { open: (a: LocalAnimal) => void }) {
  const { farm } = useSession();
  const { animals } = useHerd();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("todos");
  const active = useMemo(() => (animals ?? []).filter((a) => a.status === "active"), [animals]);
  const list = useMemo(() => {
    const values = q.trim() ? candidateIdentifiers(q).map((c) => c.value) : null;
    const t = TABS.find((x) => x.key === tab)!;
    return active
      .filter((a) => t.match(a.category))
      .filter(
        (a) => !values || a.identifiers.some((i) => values.some((v) => i.value.startsWith(v))),
      )
      .sort((a, b) =>
        (a.primaryIdentifier ?? "").localeCompare(b.primaryIdentifier ?? "", "pt-BR", {
          numeric: true,
        }),
      );
  }, [active, q, tab]);
  if (!animals || !farm) return <Loading />;
  const today = todayInTimezone(farm.timezone);

  return (
    <FlatList
      contentContainerStyle={s.screen}
      data={list}
      keyExtractor={(a) => a.id}
      ListHeaderComponent={
        <View>
          <PageHead
            title="Rebanho"
            aside={
              <Text style={{ fontWeight: "600", color: color.textPrimary }}>
                {active.length} animais
              </Text>
            }
          />
          <Field
            label="Buscar pelo brinco ou RFID"
            icon={<Search size={20} color={color.textPrimary} />}
            value={q}
            onChangeText={setQ}
            autoCapitalize="characters"
          />
          <View
            style={{
              flexDirection: "row",
              borderBottomWidth: 1,
              borderBottomColor: LINE,
              marginBottom: space.md,
            }}
          >
            {TABS.map((t) => (
              <Pressable
                key={t.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === t.key }}
                onPress={() => setTab(t.key)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  alignItems: "center",
                  borderBottomWidth: 3,
                  borderBottomColor: tab === t.key ? color.brandPrimary : "transparent",
                }}
              >
                <Text
                  style={{
                    fontWeight: tab === t.key ? "700" : "400",
                    color: tab === t.key ? color.textPrimary : color.textSecondary,
                  }}
                >
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      }
      ListEmptyComponent={<Muted>Nenhum animal encontrado.</Muted>}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => open(item)}
          style={[s.card, { padding: 0, flexDirection: "row", overflow: "hidden" }]}
        >
          <PhotoPlaceholder width={110} height={100} rounded={0} />
          <View style={{ flex: 1, padding: space.md, gap: 2 }}>
            <Text style={s.rowTitle}>
              {CATEGORY_LABEL[item.category]} {item.primaryIdentifier}
            </Text>
            <View style={[s.badge, item.pending ? { backgroundColor: color.warningBg } : null]}>
              <Text style={[s.badgeText, item.pending ? { color: color.warning } : null]}>
                {item.pending ? "No aparelho" : "Ativo"}
              </Text>
            </View>
            <Muted>
              {item.breed ?? "Raça não informada"} · {item.groupName ?? "Sem lote"}
            </Muted>
            <Muted>
              {item.lastWeight ? `${item.lastWeight.weightKg} kg` : "Sem pesagem"}
              {item.birthDate ? ` · ${age(ageInMonths(item.birthDate, today))}` : ""}
            </Muted>
          </View>
          <View style={{ justifyContent: "center", paddingRight: space.md }}>
            <ChevronRight size={22} color={color.textPrimary} />
          </View>
        </Pressable>
      )}
      ItemSeparatorComponent={() => <View style={{ height: 2 }} />}
      style={{ borderRadius: radius.md }}
    />
  );
}
