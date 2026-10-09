import { ArrowLeft, Check } from "lucide-react-native";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { color, radius, space, touchTarget, typography } from "../theme.ts";
import { BrandCow } from "./brand.tsx";

export const LINE = "#E6E0D3";

export function PageHead({
  title,
  onBack,
  aside,
}: {
  title: string;
  onBack?: () => void;
  aside?: ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        marginBottom: space.lg,
        minHeight: 44,
      }}
    >
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          onPress={onBack}
          hitSlop={12}
          style={{ marginLeft: -4 }}
        >
          <ArrowLeft size={26} color={color.textPrimary} strokeWidth={1.8} />
        </Pressable>
      ) : null}
      <Text accessibilityRole="header" style={[s.h1, { flex: 1, marginBottom: 0 }]}>
        {title}
      </Text>
      {aside}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        s.btn,
        s[`btn_${variant}`],
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        {icon}
        <Text
          style={[
            s.btnText,
            variant === "primary"
              ? { color: color.textOnBrand }
              : { color: variant === "danger" ? color.danger : color.brandPrimary },
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export function Field({
  label,
  error,
  icon,
  ...props
}: TextInputProps & { label: string; error?: string | null; icon?: ReactNode }) {
  return (
    <View style={{ marginBottom: space.lg }}>
      <Text style={s.label}>{label}</Text>
      <View style={[s.inputWrap, error ? { borderColor: color.danger } : null]}>
        {icon}
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={color.textSecondary}
          style={s.input}
          {...props}
        />
      </View>
      {error ? (
        <Text style={s.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function Steps({ current }: { current: 1 | 2 | 3 }) {
  const labels = ["Identificar", "Informar", "Confirmar"];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: space.sm,
        marginBottom: space.lg,
      }}
      accessibilityLabel={`Etapa ${current} de 3: ${labels[current - 1]}`}
    >
      {labels.map((l, i) => {
        const n = i + 1;
        const active = n <= current;
        return (
          <View key={l} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {i > 0 ? (
              <View
                style={{
                  width: 22,
                  height: 2,
                  backgroundColor: active ? color.brandPrimary : "#BFCDBE",
                }}
              />
            ) : null}
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 2,
                borderColor: active ? color.brandPrimary : "#BFCDBE",
                backgroundColor: active ? color.brandPrimary : "transparent",
              }}
            >
              {n < current ? (
                <Check size={16} color="#fff" strokeWidth={3} />
              ) : (
                <Text style={{ color: active ? "#fff" : color.textSecondary, fontWeight: "700" }}>
                  {n}
                </Text>
              )}
            </View>
            <Text
              style={{
                fontSize: 13,
                fontWeight: n === current ? "700" : "400",
                color: n === current ? color.textPrimary : color.textSecondary,
              }}
            >
              {l}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function Notice({
  kind,
  text,
}: {
  kind: "success" | "warning" | "danger" | "info";
  text: string;
}) {
  const map = {
    success: [color.success, color.successBg],
    warning: [color.warning, color.warningBg],
    danger: [color.danger, color.dangerBg],
    info: [color.info, color.infoBg],
  } as const;
  const [fg, bg] = map[kind];
  return (
    <View
      style={[s.notice, { borderColor: fg, backgroundColor: bg }]}
      accessibilityLiveRegion="polite"
    >
      <Text style={{ color: fg, fontSize: typography.body }}>{text}</Text>
    </View>
  );
}

/** Espaço da foto: ilustração neutra da marca até o módulo de mídia. */
export function PhotoPlaceholder({
  width,
  height,
  rounded = radius.md,
}: {
  width: number | "100%";
  height: number;
  rounded?: number;
}) {
  return (
    <View
      style={{
        width,
        height,
        borderRadius: rounded,
        backgroundColor: "#D9E3D3",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <BrandCow size={Math.min(height * 0.5, 96)} color="#8FA88F" />
    </View>
  );
}

export function Loading() {
  return <ActivityIndicator color={color.brandPrimary} style={{ margin: space.xl }} />;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={s.muted}>{children}</Text>;
}

export const fmtDate = (d: string | null | undefined) =>
  d ? d.split("-").reverse().join("/") : "—";

export const s = StyleSheet.create({
  screen: { padding: space.lg, paddingBottom: 120 },
  h1: { fontSize: 26, fontWeight: "700", color: color.textPrimary, marginBottom: space.lg },
  h2: { fontSize: 20, fontWeight: "700", color: color.textPrimary, marginBottom: space.md },
  card: {
    backgroundColor: color.surface,
    borderColor: LINE,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.md,
    shadowColor: "#182A24",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  btn: {
    minHeight: 54,
    borderRadius: radius.md,
    paddingHorizontal: space.xl,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  btn_primary: { backgroundColor: color.brandPrimary },
  btn_secondary: { backgroundColor: color.surface, borderColor: color.brandPrimary },
  btn_ghost: { backgroundColor: "transparent" },
  btn_danger: { backgroundColor: color.surface, borderColor: color.danger },
  btnText: { fontSize: 17, fontWeight: "700" },
  label: { fontSize: 15, fontWeight: "600", color: color.textPrimary, marginBottom: 6 },
  inputWrap: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    backgroundColor: color.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  input: { flex: 1, fontSize: 17, color: color.textPrimary, minHeight: 50 },
  error: { color: color.danger, fontSize: typography.small, marginTop: space.xs },
  notice: { borderWidth: 1, borderRadius: radius.md, padding: space.md, marginBottom: space.lg },
  muted: { color: color.textSecondary, fontSize: 15 },
  row: {
    minHeight: touchTarget,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowTitle: { fontSize: 17, fontWeight: "700", color: color.textPrimary },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: color.successBg,
  },
  badgeText: { color: color.success, fontWeight: "600", fontSize: 13 },
});
