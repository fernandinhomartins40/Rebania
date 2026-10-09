import { CircleAlert, CloudCheck, CloudOff, CloudUpload, RefreshCw } from "lucide-react-native";
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
  let Icon = CloudCheck;
  if (problems) {
    c = color.danger;
    text = `${problems} para revisar`;
    Icon = CircleAlert;
  } else if (!sync.online) {
    c = color.warning;
    text = sync.pending ? `Sem internet · ${sync.pending} no aparelho` : "Sem internet";
    Icon = CloudOff;
  } else if (sync.phase === "syncing") {
    c = color.info;
    text = "Sincronizando…";
    Icon = RefreshCw;
  } else if (sync.pending) {
    c = color.warning;
    text = `${sync.pending} aguardando envio`;
    Icon = CloudUpload;
  } else if (sync.phase === "error") {
    c = color.danger;
    text = "Falha ao sincronizar";
    Icon = CircleAlert;
  }
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        borderWidth: 1,
        borderColor: c,
        borderRadius: radius.pill,
        paddingHorizontal: space.md,
        paddingVertical: 4,
        backgroundColor: color.surface,
      }}
    >
      <Icon size={16} color={c} strokeWidth={2} />
      <Text style={{ color: c, fontSize: typography.small }}>{text}</Text>
    </View>
  );
}
