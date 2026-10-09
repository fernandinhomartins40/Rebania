import { Pressable, Text, View } from "react-native";
import { color, radius, space } from "../theme.ts";
import { s } from "./ui.tsx";

/** Seleção por "chips" grandes (bom para luva e sol); acessível como radio. */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | "";
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ marginBottom: space.lg }}>
      <Text style={s.label}>{label}</Text>
      <View
        style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}
        accessibilityRole="radiogroup"
      >
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => onChange(o.value)}
              style={{
                minHeight: 44,
                paddingHorizontal: space.md,
                justifyContent: "center",
                borderRadius: radius.md,
                borderWidth: 2,
                borderColor: on ? color.brandPrimary : "#CBD5CC",
                backgroundColor: on ? color.brandSage : color.surface,
              }}
            >
              <Text
                style={{ fontWeight: on ? "800" : "600", color: color.textPrimary, fontSize: 16 }}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
