import type { CreateAnimalInput } from "@rebania/contracts";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  CATEGORY_SEX,
  daysBetween,
  DomainError,
  normalizeIdentifier,
  parseDate,
  todayInTimezone,
  type Category,
  type Origin,
} from "@rebania/domain";
import type { SubmitResult } from "@rebania/sync-core";
import { ArrowRight, CalendarDays, ScanBarcode, Tag } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Scanner } from "../components/Scanner.tsx";
import { Button, Card, Field, Muted, Notice, PageHead, s, Steps } from "../components/ui.tsx";
import { sqliteCache } from "../lib/db.ts";
import { mutationBase, useSession } from "../lib/session.tsx";
import { color, radius, space } from "../theme.ts";
import { useHerd } from "./hooks.ts";

function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { v: T; l: string }[];
  value: T | "";
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.lg }}>
      {options.map((o) => (
        <Pressable
          key={o.v}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === o.v }}
          onPress={() => onChange(o.v)}
          style={{
            paddingHorizontal: 14,
            minHeight: 44,
            justifyContent: "center",
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: value === o.v ? color.brandPrimary : "#CBD5CC",
            backgroundColor: value === o.v ? color.brandSage : color.surface,
          }}
        >
          <Text style={{ color: color.textPrimary, fontWeight: value === o.v ? "700" : "400" }}>
            {o.l}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const ORIGINS: { v: Origin; l: string }[] = [
  { v: "purchased", l: "Comprado" },
  { v: "born_on_farm", l: "Nascido na fazenda" },
  { v: "transferred_in", l: "Transferido" },
  { v: "unknown", l: "Desconhecida" },
];

/** Cadastro mínimo em três etapas (T10), offline. */
export function NewAnimalScreen({ back }: { back: () => void }) {
  const { farm, engine, bump } = useSession();
  const { animals, places } = useHerd();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [tag, setTag] = useState("");
  const [rfid, setRfid] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [origin, setOrigin] = useState<Origin>("purchased");
  const [birth, setBirth] = useState("");
  const [groupId, setGroupId] = useState<string>("");
  const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const today = farm ? todayInTimezone(farm.timezone) : "";

  let tagError: string | null = null;
  try {
    const n = normalizeIdentifier("visual_tag", tag || " ");
    if (
      animals?.some((a) =>
        a.identifiers.some(
          (i) => i.status === "active" && i.type === "visual_tag" && i.value === n,
        ),
      )
    )
      tagError = "Brinco já usado por outro animal.";
  } catch (e) {
    tagError = tag ? (e instanceof DomainError ? e.message : "Inválido.") : null;
  }
  let rfidError: string | null = null;
  if (rfid) {
    try {
      normalizeIdentifier("rfid", rfid);
    } catch (e) {
      rfidError = e instanceof DomainError ? e.message : "Inválido.";
    }
  }
  const birthIso = birth ? parseDate(birth) : null;
  const birthError =
    birth && !birthIso
      ? "Use DD/MM/AAAA."
      : birthIso && daysBetween(today, birthIso) > 0
        ? "Data no futuro."
        : null;
  const groups = places.filter((p) => p.kind === "group");

  if (result) {
    return (
      <ScrollView contentContainerStyle={s.screen}>
        <PageHead title="Cadastrar animal" onBack={back} />
        {result.status === "synced" ? (
          <Notice kind="success" text="Animal cadastrado e sincronizado." />
        ) : null}
        {result.status === "saved_locally" ? (
          <Notice kind="warning" text="Salvo no aparelho. Enviaremos quando houver conexão." />
        ) : null}
        {result.status === "rejected" || result.status === "conflict" ? (
          <Notice kind="danger" text={`Não registrado: ${result.message}`} />
        ) : null}
        <Button
          label="Cadastrar outro"
          onPress={() => {
            setResult(null);
            setTag("");
            setRfid("");
            setCategory("");
            setBirth("");
            setStep(1);
          }}
        />
        <Button label="Voltar" variant="secondary" onPress={back} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
      <PageHead title="Cadastrar animal" onBack={back} />
      <Steps current={step} />
      {step === 1 ? (
        <>
          <Field
            label="Número do brinco"
            icon={<Tag size={20} color={color.textPrimary} />}
            autoCapitalize="characters"
            value={tag}
            onChangeText={setTag}
            error={tagError}
          />
          <Field
            label="RFID (opcional, 15 dígitos)"
            icon={<ScanBarcode size={20} color={color.textPrimary} />}
            keyboardType="number-pad"
            value={rfid}
            onChangeText={setRfid}
            error={rfidError}
          />
          <Button
            label="Ler código com a câmera"
            variant="secondary"
            onPress={() => setScan(true)}
          />
          <Button
            label="Continuar"
            icon={<ArrowRight size={20} color="#fff" />}
            disabled={!tag || Boolean(tagError || rfidError)}
            onPress={() => setStep(2)}
          />
          <Scanner
            visible={scan}
            onClose={() => setScan(false)}
            onScan={(v) => {
              setScan(false);
              if (/^\d[\d\s-]{14,}$/.test(v)) setRfid(v);
              else setTag(v);
            }}
          />
        </>
      ) : null}
      {step === 2 ? (
        <>
          <Text style={s.label}>Categoria</Text>
          <Chips
            options={CATEGORIES.map((c) => ({ v: c, l: CATEGORY_LABEL[c] }))}
            value={category}
            onChange={setCategory}
          />
          <Text style={s.label}>Origem</Text>
          <Chips options={ORIGINS} value={origin} onChange={setOrigin} />
          <Field
            label="Nascimento (opcional, DD/MM/AAAA)"
            icon={<CalendarDays size={20} color={color.textPrimary} />}
            keyboardType="numbers-and-punctuation"
            value={birth}
            onChangeText={setBirth}
            error={birthError}
          />
          {groups.length ? (
            <>
              <Text style={s.label}>Lote</Text>
              <Chips
                options={[{ v: "", l: "Sem lote" }, ...groups.map((g) => ({ v: g.id, l: g.name }))]}
                value={groupId}
                onChange={setGroupId}
              />
            </>
          ) : null}
          <Button
            label="Revisar cadastro"
            icon={<ArrowRight size={20} color="#fff" />}
            disabled={!category || Boolean(birthError)}
            onPress={() => setStep(3)}
          />
          <Button label="Voltar" variant="ghost" onPress={() => setStep(1)} />
        </>
      ) : null}
      {step === 3 && category ? (
        <Card>
          <Text style={s.h2}>Revise antes de confirmar</Text>
          <Muted>
            Brinco: {normalizeIdentifier("visual_tag", tag)}
            {rfid ? ` · RFID ${normalizeIdentifier("rfid", rfid)}` : ""}
          </Muted>
          <Muted>
            {CATEGORY_LABEL[category]} · {ORIGINS.find((o) => o.v === origin)?.l}
          </Muted>
          <Muted>
            Nascimento: {birth || "—"} · Lote:{" "}
            {groups.find((g) => g.id === groupId)?.name ?? "Sem lote"}
          </Muted>
          <View style={{ height: space.md }} />
          <Button
            label={busy ? "Registrando…" : "Confirmar cadastro"}
            disabled={busy || !engine || !farm}
            onPress={async () => {
              if (!engine || !farm) return;
              setBusy(true);
              const id = mutationBase("x").mutationId;
              const payload: CreateAnimalInput = {
                sex: CATEGORY_SEX[category],
                category,
                origin,
                birthDateEstimated: false,
                identifiers: [
                  { type: "visual_tag", value: tag },
                  ...(rfid ? [{ type: "rfid" as const, value: rfid }] : []),
                ],
                ...(birthIso ? { birthDate: birthIso } : {}),
                ...(groupId ? { groupId } : {}),
              };
              const r = await engine.submit(
                { ...mutationBase(id), type: "animal.create", payload },
                () =>
                  sqliteCache.putAnimals([
                    {
                      id,
                      farmId: farm.id,
                      sex: payload.sex,
                      category,
                      status: "active",
                      breed: null,
                      birthDate: birthIso,
                      birthDateEstimated: false,
                      origin,
                      entryDate: null,
                      groupId: groupId || null,
                      groupName: groups.find((g) => g.id === groupId)?.name ?? null,
                      pastureId: null,
                      pastureName: null,
                      damId: null,
                      sireId: null,
                      notes: null,
                      version: 1,
                      identifiers: payload.identifiers.map((i) => ({
                        id: mutationBase("x").mutationId,
                        type: i.type,
                        value: normalizeIdentifier(i.type, i.value),
                        display: normalizeIdentifier(i.type, i.value),
                        status: "active" as const,
                        createdAt: new Date().toISOString(),
                        retiredAt: null,
                      })),
                      primaryIdentifier: normalizeIdentifier("visual_tag", tag),
                      lastWeight: null,
                      photo: null,
                      repro:
                        category === "heifer" || category === "cow"
                          ? { status: "unknown", since: null, expectedCalvingOn: null }
                          : null,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      pending: true,
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

export { Chips };
