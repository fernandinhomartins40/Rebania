import { candidateIdentifiers, CATEGORY_LABEL } from "@rebania/domain";
import type { LocalAnimal } from "@rebania/sync-core";
import { Camera, ScanBarcode } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { color, space } from "../theme.ts";
import { Scanner } from "./Scanner.tsx";
import { Field, Muted, Notice, PhotoPlaceholder, s } from "./ui.tsx";

/** Identificar: digitação, leitor em modo teclado ou câmera (QR). Busca local, funciona offline. */
export function IdentifyField({
  animals,
  onSelect,
}: {
  animals: LocalAnimal[];
  onSelect: (a: LocalAnimal) => void;
}) {
  const [query, setQuery] = useState("");
  const [scan, setScan] = useState(false);
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const values = candidateIdentifiers(query).map((c) => c.value);
    return animals
      .filter(
        (a) =>
          a.status === "active" &&
          a.identifiers.some((i) => values.some((v) => i.value.startsWith(v))),
      )
      .slice(0, 8);
  }, [animals, query]);
  return (
    <View>
      <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end" }}>
        <View style={{ flex: 1 }}>
          <Field
            label="Brinco, RFID ou ID provisório"
            icon={<ScanBarcode size={20} color={color.textPrimary} />}
            autoCapitalize="characters"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => matches.length === 1 && onSelect(matches[0]!)}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ler com a câmera"
          onPress={() => setScan(true)}
          style={{
            width: 52,
            height: 52,
            borderRadius: 10,
            backgroundColor: color.surfaceMuted,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: space.lg,
          }}
        >
          <Camera size={24} color={color.textPrimary} />
        </Pressable>
      </View>
      {query && matches.length === 0 ? (
        <Notice kind="warning" text="Identificador não encontrado nesta fazenda." />
      ) : null}
      {matches.map((a) => (
        <Pressable
          key={a.id}
          accessibilityRole="button"
          onPress={() => onSelect(a)}
          style={[
            s.card,
            { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md },
          ]}
        >
          <PhotoPlaceholder width={64} height={48} rounded={8} />
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>
              {CATEGORY_LABEL[a.category]} {a.primaryIdentifier}
            </Text>
            <Muted>{a.groupName ?? "Sem lote"}</Muted>
          </View>
        </Pressable>
      ))}
      <Scanner
        visible={scan}
        onClose={() => setScan(false)}
        onScan={(v) => {
          setScan(false);
          setQuery(v);
        }}
      />
    </View>
  );
}
