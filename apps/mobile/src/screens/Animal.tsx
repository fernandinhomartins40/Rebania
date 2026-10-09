import { CATEGORY_LABEL, IDENTIFIER_LABEL, SEX_LABEL, STATUS_LABEL } from "@rebania/domain";
import type { LocalAnimal } from "@rebania/sync-core";
import { ScrollView, Text, View } from "react-native";
import { Button, Card, Muted, s } from "../components/ui.tsx";

const fmt = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

export function AnimalScreen({ animal, back, weigh }: { animal: LocalAnimal; back: () => void; weigh: () => void }) {
  return (
    <ScrollView contentContainerStyle={s.screen}>
      <Button label="‹ Voltar" variant="ghost" onPress={back} />
      <Text style={s.h1}>{CATEGORY_LABEL[animal.category]} {animal.primaryIdentifier}</Text>
      <Muted>{animal.breed ?? "Raça não informada"} · {SEX_LABEL[animal.sex]} · {STATUS_LABEL[animal.status]}</Muted>
      <View style={{ height: 16 }} />
      <Card>
        <Text style={s.rowTitle}>Lote: {animal.groupName ?? "—"}</Text>
        <Text style={s.rowTitle}>Pasto: {animal.pastureName ?? "—"}</Text>
        <Text style={s.rowTitle}>
          Último peso: {animal.lastWeight ? `${animal.lastWeight.weightKg} kg em ${fmt(animal.lastWeight.measuredOn)}` : "—"}
        </Text>
        <Text style={s.rowTitle}>Nascimento: {fmt(animal.birthDate)}{animal.birthDateEstimated ? " (estimada)" : ""}</Text>
      </Card>
      <Card>
        <Text style={s.h2}>Identificadores</Text>
        {animal.identifiers.map((i) => (
          <View key={i.id} style={s.row}>
            <View>
              <Text style={s.rowTitle}>{i.display}</Text>
              <Muted>{IDENTIFIER_LABEL[i.type]}</Muted>
            </View>
            <Muted>{i.status === "active" ? "Ativo" : "Substituído"}</Muted>
          </View>
        ))}
      </Card>
      {animal.status === "active" ? <Button label="Registrar pesagem" onPress={weigh} /> : null}
      <Muted>Histórico completo, fotos e retag: disponíveis no web; no app chegam nas próximas versões.</Muted>
    </ScrollView>
  );
}
