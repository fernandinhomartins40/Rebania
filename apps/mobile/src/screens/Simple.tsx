import type { OutboxItem } from "@rebania/sync-core";
import { ChevronRight, LogOut, Weight } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SyncBadge } from "../components/SyncBadge.tsx";
import { Button, Card, Muted, PageHead, s } from "../components/ui.tsx";
import { useSession } from "../lib/session.tsx";
import { color, radius, space } from "../theme.ts";

export function RegisterScreen({ weigh }: { weigh: () => void }) {
  return (
    <ScrollView contentContainerStyle={s.screen}>
      <PageHead title="Registrar" />
      <Pressable
        accessibilityRole="button"
        onPress={weigh}
        style={[s.card, { flexDirection: "row", alignItems: "center", gap: space.lg }]}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: radius.md,
            backgroundColor: color.brandOchreSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Weight size={30} color={color.brandOchre} strokeWidth={1.8} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle}>Pesagem</Text>
          <Muted>Ler ou digitar o brinco e informar o peso.</Muted>
        </View>
        <ChevronRight size={22} color={color.textPrimary} />
      </Pressable>
      <Muted>Cadastro e movimentação estão no web; chegam ao app na próxima versão.</Muted>
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
