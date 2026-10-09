import type { LocalAnimal } from "@rebania/sync-core";
import { StatusBar } from "expo-status-bar";
import { Bell, CalendarDays, House, Plus, Warehouse } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { BrandCow, Logo } from "./src/components/brand.tsx";
import { SyncBadge } from "./src/components/SyncBadge.tsx";
import { LINE, Loading } from "./src/components/ui.tsx";
import { SessionProvider, useSession } from "./src/lib/session.tsx";
import { AnimalScreen } from "./src/screens/Animal.tsx";
import { HerdScreen } from "./src/screens/Herd.tsx";
import { LoginScreen } from "./src/screens/Login.tsx";
import { MoveScreen } from "./src/screens/Move.tsx";
import { NewAnimalScreen } from "./src/screens/NewAnimal.tsx";
import { AgendaScreen, FarmScreen, RegisterScreen } from "./src/screens/Simple.tsx";
import { TodayScreen } from "./src/screens/Today.tsx";
import { WeighScreen } from "./src/screens/Weigh.tsx";
import { color } from "./src/theme.ts";

type Tab = "hoje" | "rebanho" | "registrar" | "agenda" | "fazenda";
type Overlay =
  | { kind: "animal"; animal: LocalAnimal }
  | { kind: "weigh"; animal?: LocalAnimal }
  | { kind: "new" }
  | { kind: "move" }
  | null;

function initials(name?: string) {
  const p = (name ?? "?").trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? (p[p.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

function Shell() {
  const { status, me, farm } = useSession();
  const [tab, setTab] = useState<Tab>("hoje");
  const [overlay, setOverlay] = useState<Overlay>(null);

  if (status === "loading") return <Loading />;
  if (status === "anonymous") return <LoginScreen />;
  if (!farm) return <Text style={{ padding: 24 }}>Seu acesso ainda não inclui fazendas.</Text>;

  let content;
  if (overlay?.kind === "animal") {
    content = (
      <AnimalScreen
        animal={overlay.animal}
        back={() => setOverlay(null)}
        weigh={() => setOverlay({ kind: "weigh", animal: overlay.animal })}
      />
    );
  } else if (overlay?.kind === "new") {
    content = <NewAnimalScreen back={() => setOverlay(null)} />;
  } else if (overlay?.kind === "move") {
    content = <MoveScreen back={() => setOverlay(null)} />;
  } else if (overlay?.kind === "weigh") {
    content = <WeighScreen preset={overlay.animal ?? null} back={() => setOverlay(null)} />;
  } else if (tab === "hoje") {
    content = <TodayScreen go={(t) => setTab(t)} />;
  } else if (tab === "rebanho") {
    content = <HerdScreen open={(a) => setOverlay({ kind: "animal", animal: a })} />;
  } else if (tab === "registrar") {
    content = <RegisterScreen open={(kind) => setOverlay({ kind })} />;
  } else if (tab === "agenda") {
    content = <AgendaScreen />;
  } else {
    content = <FarmScreen />;
  }

  const items: { key: Tab; label: string }[] = [
    { key: "hoje", label: "Hoje" },
    { key: "rebanho", label: "Rebanho" },
    { key: "registrar", label: "Registrar" },
    { key: "agenda", label: "Agenda" },
    { key: "fazenda", label: "Fazenda" },
  ];

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 8,
          gap: 12,
        }}
      >
        <Logo height={30} />
        <View style={{ flex: 1 }} />
        <SyncBadge />
        <Bell size={24} color={color.textPrimary} strokeWidth={1.8} />
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: color.brandPrimary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>{initials(me?.user.name)}</Text>
        </View>
      </View>
      <View style={{ flex: 1 }}>{content}</View>
      <View
        style={{
          flexDirection: "row",
          borderTopWidth: 1,
          borderTopColor: LINE,
          backgroundColor: color.surface,
        }}
        accessibilityRole="tablist"
      >
        {items.map((it) => {
          const active = tab === it.key && !overlay;
          const c = active ? color.brandPrimary : color.textPrimary;
          const sw = active ? 2.4 : 1.8;
          return (
            <Pressable
              key={it.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={it.label}
              onPress={() => {
                setOverlay(null);
                setTab(it.key);
              }}
              style={{
                flex: 1,
                minHeight: 66,
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
              }}
            >
              {it.key === "registrar" ? (
                <View
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: 25,
                    backgroundColor: color.brandOchre,
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: -24,
                    elevation: 3,
                  }}
                >
                  <Plus size={26} color="#fff" strokeWidth={2.6} />
                </View>
              ) : it.key === "hoje" ? (
                <House size={24} color={c} strokeWidth={sw} />
              ) : it.key === "rebanho" ? (
                <BrandCow size={26} color={c} />
              ) : it.key === "agenda" ? (
                <CalendarDays size={24} color={c} strokeWidth={sw} />
              ) : (
                <Warehouse size={24} color={c} strokeWidth={sw} />
              )}
              <Text style={{ fontSize: 12, color: c, fontWeight: active ? "700" : "400" }}>
                {it.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: color.canvas }} edges={["top", "bottom"]}>
        <StatusBar style="dark" />
        <SessionProvider>
          <Shell />
        </SessionProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
