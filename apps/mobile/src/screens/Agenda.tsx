import type { TaskDto } from "@rebania/contracts";
import { daysBetween, todayInTimezone } from "@rebania/domain";
import { CalendarDays, Check } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Button, Card, fmtDate, Loading, Muted, Notice, PageHead, s } from "../components/ui.tsx";
import { api, errorMessage } from "../lib/api.ts";
import { useCachedGet } from "../lib/cached.ts";
import { useSession } from "../lib/session.tsx";
import { color, space } from "../theme.ts";

/** Agenda: tarefas derivadas dos manejos, por prazo; conclusão exige conexão. */
export function AgendaScreen() {
  const { farm } = useSession();
  const { data, offline, reload } = useCachedGet<TaskDto[]>(
    farm ? `/v1/farms/${farm.id}/tasks` : null,
    `tasks:${farm?.id}`,
  );
  const [msg, setMsg] = useState<string | null>(null);
  if (!farm) return null;
  const today = todayInTimezone(farm.timezone);
  if (!data)
    return offline ? (
      <Notice kind="info" text="Agenda disponível depois da primeira conexão." />
    ) : (
      <Loading />
    );
  const groups = [
    { title: "Atrasadas", items: data.filter((t) => t.dueOn < today) },
    { title: "Hoje", items: data.filter((t) => t.dueOn === today) },
    {
      title: "Próximos 7 dias",
      items: data.filter((t) => t.dueOn > today && daysBetween(today, t.dueOn) <= 7),
    },
    { title: "Depois", items: data.filter((t) => daysBetween(today, t.dueOn) > 7) },
  ];
  return (
    <ScrollView contentContainerStyle={s.screen}>
      <PageHead title="Agenda" />
      {offline ? <Notice kind="info" text="Sem conexão: lista da última atualização." /> : null}
      {msg ? <Notice kind="info" text={msg} /> : null}
      {data.length === 0 ? (
        <Card>
          <Muted>
            Nenhuma tarefa aberta. As tarefas nascem dos manejos (diagnóstico, partos, curral,
            manutenção).
          </Muted>
        </Card>
      ) : null}
      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <View key={g.title}>
            <Text style={[s.h2, g.title === "Atrasadas" ? { color: color.danger } : null]}>
              {g.title} ({g.items.length})
            </Text>
            {g.items.map((t) => (
              <Card key={t.id}>
                <View style={{ flexDirection: "row", gap: space.md }}>
                  <CalendarDays size={24} color={color.brandOchreText} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle}>{t.title}</Text>
                    <Muted>
                      {fmtDate(t.dueOn)}
                      {t.animalIds.length ? ` · ${t.animalIds.length} animal(is)` : ""}
                    </Muted>
                    {t.description ? <Muted>{t.description}</Muted> : null}
                  </View>
                </View>
                <Button
                  label="Concluir"
                  variant="secondary"
                  icon={<Check size={18} color={color.brandPrimary} />}
                  disabled={offline}
                  onPress={async () => {
                    try {
                      await api("POST", `/v1/farms/${farm.id}/tasks/${t.id}/complete`, {});
                      reload();
                    } catch (e) {
                      setMsg(errorMessage(e));
                    }
                  }}
                />
              </Card>
            ))}
          </View>
        ))}
    </ScrollView>
  );
}
