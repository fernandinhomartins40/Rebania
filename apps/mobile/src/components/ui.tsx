import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { color, radius, space, touchTarget, typography } from "../theme.ts";

export function Screen({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={s.screen}>
      {title ? <Text style={s.h1} accessibilityRole="header">{title}</Text> : null}
      {children}
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={s.card}>{children}</View>;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [s.btn, s[`btn_${variant}`], (pressed || disabled) && { opacity: 0.7 }]}
    >
      <Text style={[s.btnText, variant === "primary" ? { color: color.textOnBrand } : { color: variant === "danger" ? color.danger : color.brandPrimary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={{ marginBottom: space.lg }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={color.textSecondary}
        style={[s.input, error ? { borderColor: color.danger } : null]}
        {...props}
      />
      {error ? <Text style={s.error} accessibilityLiveRegion="polite">{error}</Text> : null}
    </View>
  );
}

export function Notice({ kind, text }: { kind: "success" | "warning" | "danger" | "info"; text: string }) {
  const map = {
    success: [color.success, color.successBg],
    warning: [color.warning, color.warningBg],
    danger: [color.danger, color.dangerBg],
    info: [color.info, color.infoBg],
  } as const;
  const [fg, bg] = map[kind];
  return (
    <View style={[s.notice, { borderColor: fg, backgroundColor: bg }]} accessibilityLiveRegion="polite">
      <Text style={{ color: fg, fontSize: typography.body }}>{text}</Text>
    </View>
  );
}

export function Loading() {
  return <ActivityIndicator color={color.brandPrimary} style={{ margin: space.xl }} />;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={s.muted}>{children}</Text>;
}

export const s = StyleSheet.create({
  screen: { flex: 1, padding: space.lg },
  h1: { fontSize: typography.display, fontWeight: "700", color: color.textPrimary, marginBottom: space.lg },
  h2: { fontSize: typography.title, fontWeight: "700", color: color.textPrimary, marginBottom: space.md },
  card: { backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: radius.lg, padding: space.lg, marginBottom: space.lg },
  btn: { minHeight: touchTarget, borderRadius: radius.md, paddingHorizontal: space.xl, alignItems: "center", justifyContent: "center", marginBottom: space.md, borderWidth: 1, borderColor: "transparent" },
  btn_primary: { backgroundColor: color.brandPrimary },
  btn_secondary: { backgroundColor: color.surface, borderColor: color.brandPrimary },
  btn_ghost: { backgroundColor: "transparent" },
  btn_danger: { backgroundColor: color.surface, borderColor: color.danger },
  btnText: { fontSize: typography.body, fontWeight: "700" },
  label: { fontSize: typography.body, fontWeight: "600", color: color.textPrimary, marginBottom: space.xs },
  input: { minHeight: touchTarget, borderWidth: 1, borderColor: color.border, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: typography.body, color: color.textPrimary, backgroundColor: color.surface },
  error: { color: color.danger, fontSize: typography.small, marginTop: space.xs },
  notice: { borderWidth: 1, borderRadius: radius.md, padding: space.md, marginBottom: space.lg },
  muted: { color: color.textSecondary, fontSize: typography.small },
  row: { minHeight: touchTarget, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: color.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowTitle: { fontSize: typography.body, fontWeight: "700", color: color.textPrimary },
});
