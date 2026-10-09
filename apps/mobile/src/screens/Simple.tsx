import type { OutboxItem } from "@rebania/sync-core";
import { ArrowLeftRight, ChevronRight, LogOut, Weight } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { BrandCow } from "../components/brand.tsx";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SyncBadge } from "../components/SyncBadge.tsx";
import { Button, Card, Muted, PageHead, s } from "../components/ui.tsx";
import { useSession } from "../lib/session.tsx";
import { color, radius, space } from "../theme.ts";

export function RegisterScreen({ open }: { open: (kind: "new" | "weigh" | "move") => void }) {
  const items: {
    kind: "new" | "weigh" | "move";
    title: string;
    desc: string;
    icon: ReactNode;
    ochre?: boolean;
  }[] = [
    {
      kind: "new",
      title: "Cadastrar animal",
      desc: "Brinco ou ID provisório, categoria e origem.",
      icon: <BrandCow size={30} color={color.brandPrimary} />,
    },
    {
      kind: "weigh",
      title: "Pesagem",
      desc: "Ler ou digitar o brinco e informar o peso.",
      icon: <Weight size={30} color={color.brandOchre} strokeWidth={1.8} />,
      ochre: true,
    },
    {
      kind: "move",
      title: "Movimentação",
      desc: "Trocar de lote ou pasto.",
      icon: <ArrowLeftRight size={30} color={color.brandPrimary} strokeWidth={1.8} />,
    },
  ];
  return (
    <ScrollView contentContainerStyle={s.screen}>
      <PageHead title="Registrar" />
      {items.map((i) => (
        <Pressable
          key={i.kind}
          accessibilityRole="button"
          onPress={() => open(i.kind)}
          style={[s.card, { flexDirection: "row", alignItems: "center", gap: space.lg }]}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: radius.md,
              backgroundColor: i.ochre ? color.brandOchreSoft : color.brandSage,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {i.icon}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>{i.title}</Text>
            <Muted>{i.desc}</Muted>
          </View>
          <ChevronRight size={22} color={color.textPrimary} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function AgendaScreen() {
  return (
    <ScrollView contentContainerStyle={s.screen}>
      <PageHead title="Agenda" />
      <Card>
        <Muted>
          Sem tarefas por enquanto. A agenda passa a ser gerada pelos manejos de reprodução e
          sanidade.
        </Muted>
      </Card>
    </ScrollView>
  );
}

const TYPE_LABEL: Record<string, string> = {
  "animal.create": "Cadastro",
  "animal.update": "Edição",
  "animal.move": "Movimentação",
  "weight.record": "Pesagem",
};

export function FarmScreen() {
  const { farm, me, engine, sync, logout, dataVersion } = useSession();
  const [items, setItems] = useState<OutboxItem[]>([]);
  useEffect(() => {
    void engine?.problems().then(setItems);
  }, [engine, dataVersion, sync?.pending, sync?.rejected]);
  const unsent = items.length;
  return (
    <ScrollView contentContainerStyle={s.screen}>
      <PageHead title="Fazenda" />
      <Muted>
        {farm?.name} · {farm?.organizationName} · {me?.user.name}
      </Muted>
      <View style={{ height: space.lg }} />
      <Card>
        <Text style={s.h2}>Sincronização</Text>
        <SyncBadge />
        <View style={{ height: space.md }} />
        {items.length === 0 ? <Muted>Tudo enviado.</Muted> : null}
        {items.map((i) => (
          <View key={i.mutation.mutationId} style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{TYPE_LABEL[i.mutation.type] ?? i.mutation.type}</Text>
              <Muted>
                {i.state === "pending" ? "aguardando envio" : (i.lastError?.message ?? i.state)}
              </Muted>
            </View>
            {i.state !== "pending" ? (
              <Button
                label="Descartar"
                variant="danger"
                onPress={() =>
                  void engine
                    ?.discard(i.mutation.mutationId)
                    .then(() => engine.problems().then(setItems))
                }
              />
            ) : null}
          </View>
        ))}
        <Button
          label="Sincronizar agora"
          variant="secondary"
          onPress={() => void engine?.syncNow()}
        />
      </Card>
      <Button
        label={unsent ? `Sair (apaga ${unsent} registro(s) não enviado(s))` : "Sair deste aparelho"}
        variant="danger"
        icon={<LogOut size={20} color={color.danger} />}
        onPress={() => void logout()}
      />
    </ScrollView>
  );
}
