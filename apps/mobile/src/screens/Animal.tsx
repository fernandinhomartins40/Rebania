import type { AnimalHistory } from "@rebania/contracts";
import { CATEGORY_LABEL, IDENTIFIER_LABEL, SEX_LABEL, STATUS_LABEL } from "@rebania/domain";
import type { LocalAnimal } from "@rebania/sync-core";
import {
  ArrowLeftRight,
  CalendarDays,
  ChartColumn,
  MapPin,
  Pencil,
  Tag,
  Weight,
  type LucideIcon,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import {
  Button,
  Card,
  fmtDate,
  LINE,
  Muted,
  PageHead,
  PhotoPlaceholder,
  s,
} from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { useSession } from "../lib/session.tsx";
import { color, space } from "../theme.ts";

const EVENT: Record<string, { title: string; icon: LucideIcon }> = {
  registered: { title: "Cadastro", icon: Tag },
  weighed: { title: "Pesagem", icon: Weight },
  moved: { title: "Movimentação", icon: ArrowLeftRight },
  identifier_added: { title: "Identificador adicionado", icon: Tag },
  retagged: { title: "Troca de identificação", icon: Tag },
  updated: { title: "Dados atualizados", icon: Pencil },
};

export function AnimalScreen({
  animal,
  back,
  weigh,
}: {
  animal: LocalAnimal;
  back: () => void;
  weigh: () => void;
}) {
  const { farm } = useSession();
  const [history, setHistory] = useState<AnimalHistory | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (!farm) return;
    api<AnimalHistory>("GET", `/v1/farms/${farm.id}/animals/${animal.id}/history`).then(
      setHistory,
      () => setOffline(true),
    );
  }, [farm, animal.id]);

  const stats: [LucideIcon, string, string][] = [
    [MapPin, animal.groupName ?? "—", "Lote"],
    [Weight, animal.lastWeight ? `${animal.lastWeight.weightKg} kg` : "—", "Peso atual"],
    history?.adg
      ? [ChartColumn, `${history.adg.adgKgPerDay.toLocaleString("pt-BR")}`, "GMD kg/dia"]
      : [CalendarDays, fmtDate(animal.birthDate), "Nascimento"],
  ];

  return (
    <ScrollView contentContainerStyle={s.screen}>
      <PageHead
        title={`${CATEGORY_LABEL[animal.category]} ${animal.primaryIdentifier ?? ""}`}
        onBack={back}
      />
      <View style={{ marginBottom: space.lg }}>
        <PhotoPlaceholder width="100%" height={200} rounded={16} />
        <View style={[s.badge, { position: "absolute", left: 12, bottom: 12 }]}>
          <Text style={s.badgeText}>{STATUS_LABEL[animal.status]}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", marginBottom: space.lg }}>
        {stats.map(([Icon, value, label], i) => (
          <View
            key={label}
            style={{
              flex: 1,
              flexDirection: "row",
              gap: 6,
              paddingHorizontal: 6,
              borderLeftWidth: i ? 1 : 0,
              borderLeftColor: LINE,
            }}
          >
            <Icon size={22} color={color.textPrimary} strokeWidth={1.8} />
            <View style={{ flexShrink: 1 }}>
              <Text style={{ fontWeight: "700", fontSize: 16, color: color.textPrimary }}>
                {value}
              </Text>
              <Muted>{label}</Muted>
            </View>
          </View>
        ))}
      </View>
      {animal.status === "active" ? (
        <Button
          label="Registrar pesagem"
          icon={<Weight size={20} color="#fff" />}
          onPress={weigh}
        />
      ) : null}

      <Text style={[s.h2, { marginTop: space.md }]}>Histórico</Text>
      {offline ? <Muted>Histórico completo disponível com conexão.</Muted> : null}
      {history?.timeline.map((e) => {
        const ev = EVENT[e.type] ?? { title: e.type, icon: CalendarDays };
        return (
          <View
            key={e.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: space.md,
              paddingVertical: space.sm,
              borderBottomWidth: 1,
              borderBottomColor: LINE,
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: color.surfaceMuted,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ev.icon size={22} color={color.textPrimary} strokeWidth={1.8} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{ev.title}</Text>
              <Muted>
                {fmtDate(e.occurredOn)} · {e.summary.replace(/^[^:]+:\s*/, "")}
              </Muted>
            </View>
          </View>
        );
      })}

      <Card style={{ marginTop: space.lg }}>
        <Text style={s.h2}>Dados</Text>
        <Muted>
          {SEX_LABEL[animal.sex]} · {animal.breed ?? "Raça não informada"} · Pasto:{" "}
          {animal.pastureName ?? "—"}
        </Muted>
        {animal.identifiers.map((i) => (
          <View key={i.id} style={s.row}>
            <View>
              <Text style={s.rowTitle}>{i.display}</Text>
              <Muted>{IDENTIFIER_LABEL[i.type]}</Muted>
            </View>
            <Muted>{i.status === "active" ? "Ativo" : "Substituído"}</Muted>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}
