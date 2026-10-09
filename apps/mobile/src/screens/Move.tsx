import { CATEGORY_LABEL, todayInTimezone } from "@rebania/domain";
import type { LocalAnimal, SubmitResult } from "@rebania/sync-core";
import { ArrowRight } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { IdentifyField } from "../components/IdentifyField.tsx";
import {
  Button,
  Card,
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
import { Chips } from "./NewAnimal.tsx";

/** Movimentação (T32) com versão esperada: conflito entre aparelhos vira revisão, não sobrescrita. */
export function MoveScreen({ back }: { back: () => void }) {
  const { farm, engine, bump } = useSession();
  const { animals, places } = useHerd();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [animal, setAnimal] = useState<LocalAnimal | null>(null);
  const [groupId, setGroupId] = useState("");
  const [pastureId, setPastureId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const groups = places.filter((p) => p.kind === "group");
  const pastures = places.filter((p) => p.kind === "pasture");
  const name = (id: string) => places.find((p) => p.id === id)?.name ?? "—";
  const unchanged =
    animal && (animal.groupId ?? "") === groupId && (animal.pastureId ?? "") === pastureId;

  if (result) {
    return (
      <ScrollView contentContainerStyle={s.screen}>
        <PageHead title="Movimentação" onBack={back} />
        {result.status === "synced" ? (
          <Notice kind="success" text="Movimentação registrada e sincronizada." />
        ) : null}
        {result.status === "saved_locally" ? (
          <Notice kind="warning" text="Salvo no aparelho. Enviaremos quando houver conexão." />
        ) : null}
        {result.status === "rejected" || result.status === "conflict" ? (
          <Notice
            kind="danger"
            text={`${result.status === "conflict" ? "Conflito" : "Não registrado"}: ${result.message}`}
          />
        ) : null}
        <Button
          label="Movimentar outro"
          onPress={() => {
            setResult(null);
            setAnimal(null);
            setStep(1);
          }}
        />
        <Button label="Voltar" variant="secondary" onPress={back} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
      <PageHead title="Movimentação" onBack={back} />
      <Steps current={step} />
      {step === 1 && animals ? (
        <IdentifyField
          animals={animals}
          onSelect={(a) => {
            setAnimal(a);
            setGroupId(a.groupId ?? "");
            setPastureId(a.pastureId ?? "");
            setStep(2);
          }}
        />
      ) : null}
      {step >= 2 && animal ? (
        <Card style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <PhotoPlaceholder width={84} height={64} />
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>
              {CATEGORY_LABEL[animal.category]} {animal.primaryIdentifier}
            </Text>
            <Muted>
              Atual: {animal.groupName ?? "sem lote"} · {animal.pastureName ?? "sem pasto"}
            </Muted>
          </View>
        </Card>
      ) : null}
      {step === 2 && animal ? (
        <>
          <Text style={s.label}>Lote de destino</Text>
          <Chips
            options={[{ v: "", l: "Sem lote" }, ...groups.map((g) => ({ v: g.id, l: g.name }))]}
            value={groupId}
            onChange={setGroupId}
          />
          <Text style={s.label}>Pasto de destino</Text>
          <Chips
            options={[{ v: "", l: "Sem pasto" }, ...pastures.map((g) => ({ v: g.id, l: g.name }))]}
            value={pastureId}
            onChange={setPastureId}
          />
          {unchanged ? <Notice kind="info" text="Escolha um destino diferente do atual." /> : null}
          <Button
            label="Revisar movimentação"
            icon={<ArrowRight size={20} color="#fff" />}
            disabled={Boolean(unchanged)}
            onPress={() => setStep(3)}
          />
        </>
      ) : null}
      {step === 3 && animal && farm ? (
        <Card>
          <Text style={s.h2}>Confirme a movimentação</Text>
          <Muted>
            Para: {groupId ? name(groupId) : "sem lote"} ·{" "}
            {pastureId ? name(pastureId) : "sem pasto"}
          </Muted>
          <Muted>Data efetiva: hoje</Muted>
          <View style={{ height: space.md }} />
          <Button
            label={busy ? "Registrando…" : "Confirmar"}
            disabled={busy || !engine}
            onPress={async () => {
              if (!engine) return;
              setBusy(true);
              const r = await engine.submit(
                {
                  ...mutationBase(animal.id),
                  type: "animal.move",
                  payload: {
                    expectedVersion: animal.version,
                    groupId: groupId || null,
                    pastureId: pastureId || null,
                    effectiveOn: todayInTimezone(farm.timezone),
                  },
                },
                () =>
                  sqliteCache.putAnimals([
                    {
                      ...animal,
                      pending: true,
                      groupId: groupId || null,
                      groupName: groupId ? name(groupId) : null,
                      pastureId: pastureId || null,
                      pastureName: pastureId ? name(pastureId) : null,
                    },
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
