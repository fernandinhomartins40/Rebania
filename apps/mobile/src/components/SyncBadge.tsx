import { Text, View } from "react-native";
import { useSession } from "../lib/session.tsx";
import { color, radius, space, typography } from "../theme.ts";

/** Estado único de conectividade/sincronização (mesma lógica do web). */
export function SyncBadge() {
  const { sync } = useSession();
  if (!sync) return null;
  const problems = sync.rejected + sync.conflict;
  let c: string = color.success;
  let text = "Sincronizado";
  if (problems) {
    c = color.danger;
    text = `${problems} para revisar`;
  } else if (!sync.online) {
    c = color.warning;
    text = sync.pending ? `Sem internet · ${sync.pending} no aparelho` : "Sem internet";
  } else if (sync.phase === "syncing") {
    c = color.info;
    text = "Sincronizando…";
  } else if (sync.pending) {
    c = color.warning;
    text = `${sync.pending} aguardando envio`;
  } else if (sync.phase === "error") {
    c = color.danger;
    text = "Falha ao sincronizar";
  }
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ flexDirection: "row", alignItems: "center", gap: space.sm, borderWidth: 1, borderColor: c, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 4, backgroundColor: color.surface }}
    >
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c }} />
      <Text style={{ color: c, fontSize: typography.small }}>{text}</Text>
    </View>
  );
}
