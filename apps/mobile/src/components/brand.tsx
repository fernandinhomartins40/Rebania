import { Image, View } from "react-native";
import full from "../../assets/brand/rebania-logo.png";
import symbol from "../../assets/brand/rebania-symbol.png";
import wordmark from "../../assets/brand/rebania-wordmark.png";

/* Marca oficial (docs/brand/pacote-landing): recortes do mesmo PNG, sem recompor o wordmark. */

export function Logo({ height = 30 }: { height?: number }) {
  return (
    <View
      accessible
      accessibilityLabel="Rebania"
      style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
    >
      <Image source={symbol} style={{ height, width: height * (711 / 702) }} resizeMode="contain" />
      <Image
        source={wordmark}
        style={{ height: height * 0.62, width: height * 0.62 * (1365 / 339) }}
        resizeMode="contain"
      />
    </View>
  );
}

export function FullLogo({ height = 72 }: { height?: number }) {
  return (
    <Image
      accessibilityLabel="Rebania — Sua fazenda em dia."
      source={full}
      style={{ height, width: height * (2170 / 725) }}
      resizeMode="contain"
    />
  );
}

/** Figura bovina da marca usada como ícone, tingida como os ícones Lucide. */
export function BrandCow({ size = 24, color }: { size?: number; color?: string }) {
  return (
    <Image
      source={symbol}
      style={{ width: size, height: size, ...(color ? { tintColor: color } : {}) }}
      resizeMode="contain"
    />
  );
}
