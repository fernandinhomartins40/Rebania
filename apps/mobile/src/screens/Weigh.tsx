import {
  assertWeightKg,
  candidateIdentifiers,
  CATEGORY_LABEL,
  DomainError,
  todayInTimezone,
  weightConsistencyWarning,
} from "@rebania/domain";
import { ReadDeduper } from "@rebania/hardware";
import type { LocalAnimal, SubmitResult } from "@rebania/sync-core";
import { ArrowRight, ScanBarcode, Weight } from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  Button,
  Card,
  Field,
  Muted,
  Notice,
  PageHead,
  PhotoPlaceholder,
  s,
  Steps,
} from "../components/ui.tsx";
import { sqliteCache } from "../lib/db.ts";
import { mutationBase, useSession } from "../lib/session.tsx";
import { space } from "../theme.ts";
import { useHerd } from "./hooks.ts";

/** Pesagem em três etapas, offline-first (SQLite + outbox). */
export function WeighScreen({ back, preset }: { back: () => void; preset?: LocalAnimal | null }) {
  const { farm, engine, bump } = useSession();
  const { animals } = useHerd();
  const [step, setStep] = useState<1 | 2 | 3>(preset ? 2 : 1);
  const [animal, setAnimal] = useState<LocalAnimal | null>(preset ?? null);
  const [query, setQuery] = useState("");
  const [weight, setWeight] = useState("");
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const deduper = useRef(new ReadDeduper());
  const today = farm ? todayInTimezone(farm.timezone) : "";

  const matches = useMemo(() => {
    if (!query.trim() || !animals) return [];
    const values = candidateIdentifiers(query).map((c) => c.value);
    return animals
      .filter(
        (a) =>
          a.status === "active" &&
          a.identifiers.some((i) => values.some((v) => i.value.startsWith(v))),
      )
      .slice(0, 8);
  }, [animals, query]);

  const kg = Number(weight.replace(",", "."));
  let weightError: string | null = null;
  if (weight) {
    try {
      assertWeightKg(kg);
    } catch (e) {
      weightError = e instanceof DomainError ? e.message : "Peso inválido.";
    }
  }
  const warning =
    animal && weight && !weightError
      ? weightConsistencyWarning(animal.lastWeight ?? undefined, {
          measuredOn: today,
          weightKg: kg,
        })
      : null;

  const select = (a: LocalAnimal) => {
    const seen = deduper.current.accept(a.id, Date.now());
    if (seen === "suppressed") return;
    setAnimal(a);
    setStep(2);
  };

  if (result) {
    return (
      <ScrollView contentContainerStyle={s.screen}>
        <PageHead title="Pesagem" onBack={back} />
        {result.status === "synced" ? (
          <Notice kind="success" text="Pesagem registrada e sincronizada." />
        ) : null}
        {result.status === "saved_locally" ? (
          <Notice kind="warning" text="Salvo no aparelho. Enviaremos quando houver conexão." />
        ) : null}
        {result.status === "rejected" || result.status === "conflict" ? (
          <Notice kind="danger" text={`Não registrado: ${result.message}`} />
        ) : null}
        <Button
          label="Pesar próximo animal"
          onPress={() => {
            setResult(null);
            setAnimal(null);
            setWeight("");
            setQuery("");
            setStep(1);
          }}
        />
        <Button label="Voltar" variant="secondary" onPress={back} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
      <PageHead title="Pesagem" onBack={back} />
      <Steps current={step} />
      {step === 1 ? (
        <>
          <Field
            label="Brinco, RFID ou ID provisório"
            icon={<ScanBarcode size={20} color="#182A24" />}
            autoFocus
            autoCapitalize="characters"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => matches.length === 1 && select(matches[0]!)}
          />
          {query && matches.length === 0 ? (
            <Notice kind="warning" text="Identificador não encontrado nesta fazenda." />
          ) : null}
          {matches.map((a) => (
            <Pressable
              key={a.id}
              accessibilityRole="button"
              onPress={() => select(a)}
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
        </>
      ) : null}
      {step >= 2 && animal ? (
        <Card style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <PhotoPlaceholder width={84} height={64} />
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>
              {CATEGORY_LABEL[animal.category]} {animal.primaryIdentifier}
            </Text>
            <Muted>
              {animal.groupName ?? "Sem lote"} ·{" "}
              {animal.lastWeight ? `${animal.lastWeight.weightKg} kg` : "sem pesagem"}
            </Muted>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setAnimal(null);
              setStep(1);
            }}
          >
            <Text style={{ fontWeight: "700", textDecorationLine: "underline", color: "#163E32" }}>
              Trocar
            </Text>
          </Pressable>
        </Card>
      ) : null}
      {step === 2 && animal ? (
        <>
          <Field
            label="Peso vivo (kg)"
            icon={<Weight size={20} color="#182A24" />}
            keyboardType="decimal-pad"
            value={weight}
            onChangeText={setWeight}
            error={weightError}
            autoFocus
          />
          {warning ? <Notice kind="warning" text={warning} /> : null}
          <Button
            label="Revisar pesagem"
            icon={<ArrowRight size={20} color="#fff" />}
            disabled={!weight || Boolean(weightError)}
            onPress={() => setStep(3)}
          />
        </>
      ) : null}
      {step === 3 && animal ? (
        <Card>
          <Text style={s.h2}>Confirme a pesagem</Text>
          <Muted>Animal: {animal.primaryIdentifier}</Muted>
          <Muted>
            Peso vivo: {kg} kg · Data: {today.split("-").reverse().join("/")}
          </Muted>
          <View style={{ height: space.md }} />
          <Button
            label={busy ? "Registrando…" : "Confirmar e próximo"}
            disabled={busy || !engine}
            onPress={async () => {
              if (!engine) return;
              setBusy(true);
              const r = await engine.submit(
                {
                  ...mutationBase(animal.id),
                  type: "weight.record",
                  payload: { weightKg: kg, measuredOn: today, source: "manual" },
                },
                () =>
                  sqliteCache.putAnimals([
                    { ...animal, pending: true, lastWeight: { weightKg: kg, measuredOn: today } },
                  ]),
              );
              setBusy(false);
              bump();
              setResult(r);
            }}
          />
          <Button label="Editar" variant="ghost" onPress={() => setStep(2)} />
        </Card>
      ) : null}
    </ScrollView>
  );
}
