import { addDays, daysBetween, todayInTimezone } from "@rebania/domain";
import { ChevronRight, ClipboardList, Moon, Play, Sun, Weight } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { BrandCow } from "../components/brand.tsx";
import { Button, Card, Loading, Muted, s } from "../components/ui.tsx";
import { useSession } from "../lib/session.tsx";
import { color, radius, space } from "../theme.ts";
import { useHerd } from "./hooks.ts";

export function TodayScreen({ go }: { go: (tab: "registrar" | "rebanho") => void }) {
  const { me, farm, sync } = useSession();
  const { animals } = useHerd();
  if (!animals || !farm) return <Loading />;
  const today = todayInTimezone(farm.timezone);
  const active = animals.filter((a) => a.status === "active");
  const notWeighed = active.filter(
    (a) => !a.lastWeight || daysBetween(addDays(today, -90), a.lastWeight.measuredOn) < 0,
  );
  const problems = (sync?.rejected ?? 0) + (sync?.conflict ?? 0);
  const priorities = [
    ...(problems
      ? [{ title: `${problems} registro(s) para revisar`, why: "Não aceitos pelo servidor." }]
      : []),
    ...(notWeighed.length
      ? [
          {
            title: `${notWeighed.length} sem pesagem recente`,
            why: "Sem pesagem nos últimos 90 dias.",
          },
        ]
      : []),
  ];
  const h = new Date().getHours();
  const night = h < 5 || h >= 18;
  const greet = h >= 5 && h < 12 ? "Bom dia" : h >= 12 && h < 18 ? "Boa tarde" : "Boa noite";
  const GreetIcon = night ? Moon : Sun;

  return (
    <ScrollView contentContainerStyle={s.screen}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.md,
          marginBottom: space.lg,
        }}
      >
        <GreetIcon size={48} color={color.brandOchre} strokeWidth={1.6} />
        <View>
          <Text style={[s.h1, { marginBottom: 0 }]}>
            {greet}, {me?.user.name.split(" ")[0]}!
          </Text>
          <Muted>{farm.name}</Muted>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: space.md, marginBottom: space.xl }}>
        <Pressable
          onPress={() => go("rebanho")}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: space.md,
            backgroundColor: color.brandSage,
            borderRadius: radius.lg,
            padding: space.lg,
          }}
        >
          <BrandCow size={44} color={color.brandPrimary} />
          <View>
            <Text style={{ fontSize: 28, fontWeight: "700", color: color.textPrimary }}>
              {active.length}
            </Text>
            <Muted>animais</Muted>
          </View>
        </Pressable>
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: space.md,
            backgroundColor: color.brandOchreSoft,
            borderRadius: radius.lg,
            padding: space.lg,
          }}
        >
          <ClipboardList size={40} color={color.brandOchre} strokeWidth={1.8} />
          <View>
            <Text style={{ fontSize: 28, fontWeight: "700", color: color.textPrimary }}>
              {priorities.length}
            </Text>
            <Muted>pendências</Muted>
          </View>
        </View>
      </View>
      <Text style={s.h2}>Suas prioridades de hoje</Text>
      {priorities.length === 0 ? (
        <Card>
          <Muted>Nada pendente pelos critérios disponíveis.</Muted>
        </Card>
      ) : (
        priorities.map((p) => (
          <Card key={p.title} style={{ flexDirection: "row", alignItems: "center", gap: space.lg }}>
            <Weight size={34} color={color.brandOchre} strokeWidth={1.8} />
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{p.title}</Text>
              <Muted>{p.why}</Muted>
            </View>
            <ChevronRight size={22} color={color.textPrimary} />
          </Card>
        ))
      )}
      <View style={{ height: space.md }} />
      <Button
        label="Iniciar manejo"
        icon={<Play size={20} color="#fff" fill="#fff" />}
        onPress={() => go("registrar")}
      />
    </ScrollView>
  );
}
