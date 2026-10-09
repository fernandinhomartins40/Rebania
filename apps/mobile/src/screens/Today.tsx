import { CATEGORY_LABEL, type Category } from "@rebania/domain";
import { Text, View } from "react-native";
import { Button, Card, Loading, Muted, s, Screen } from "../components/ui.tsx";
import { useSession } from "../lib/session.tsx";
import { color, radius, space } from "../theme.ts";
import { useHerd } from "./hooks.ts";

export function TodayScreen({ go }: { go: (tab: "registrar" | "rebanho") => void }) {
  const { me } = useSession();
  const { animals } = useHerd();
  if (!animals) return <Loading />;
  const active = animals.filter((a) => a.status === "active");
  const counts = new Map<Category, number>();
  for (const a of active) counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
  return (
    <Screen title={`Olá, ${me?.user.name.split(" ")[0] ?? ""}!`}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md, marginBottom: space.lg }}>
        {[["animais ativos", active.length] as const, ...[...counts.entries()].slice(0, 3).map(([c, n]) => [CATEGORY_LABEL[c], n] as const)].map(([label, n]) => (
          <View key={label} style={{ backgroundColor: color.brandSage, borderRadius: radius.md, padding: space.md, minWidth: "45%", flexGrow: 1 }}>
            <Text style={{ fontSize: 28, fontWeight: "700", color: color.textPrimary }}>{n}</Text>
            <Muted>{label}</Muted>
          </View>
        ))}
      </View>
      <Card>
        <Text style={s.h2}>Próximo manejo</Text>
        <Muted>Dados locais deste aparelho; funcionam sem internet.</Muted>
      </Card>
      <Button label="Iniciar registro" onPress={() => go("registrar")} />
      <Button label="Ver rebanho" variant="secondary" onPress={() => go("rebanho")} />
    </Screen>
  );
}
