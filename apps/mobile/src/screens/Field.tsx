import type { BirthInput, ProductDto } from "@rebania/contracts";
import {
  CATEGORY_LABEL,
  OCCURRENCE_TARGET_LABEL,
  SEVERITY_LABEL,
  STATUS_LABEL,
  todayInTimezone,
  type OccurrenceSeverity,
} from "@rebania/domain";
import type { LocalAnimal, SubmitResult } from "@rebania/sync-core";
import { Plus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Choice } from "../components/Choice.tsx";
import { IdentifyField } from "../components/IdentifyField.tsx";
import { Outcome } from "../components/Outcome.tsx";
import {
  Button,
  Card,
  Field,
  Loading,
  Muted,
  Notice,
  PageHead,
  s,
  Steps,
} from "../components/ui.tsx";
import { api, errorMessage, NetworkError } from "../lib/api.ts";
import { useCachedGet } from "../lib/cached.ts";
import { mutationBase, useSession, uuid } from "../lib/session.tsx";
import { color, space } from "../theme.ts";
import { useHerd } from "./hooks.ts";

function Selected({ animal, change }: { animal: LocalAnimal; change: () => void }) {
  return (
    <Card style={{ flexDirection: "row", alignItems: "center" }}>
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>
          {CATEGORY_LABEL[animal.category]} {animal.primaryIdentifier}
        </Text>
        <Muted>{animal.groupName ?? "Sem lote"}</Muted>
      </View>
      <Button label="Trocar" variant="ghost" onPress={change} />
    </Card>
  );
}

function Done({
  title,
  result,
  what,
  again,
  back,
}: {
  title: string;
  result: SubmitResult;
  what: string;
  again: () => void;
  back: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={s.screen}>
      <PageHead title={title} onBack={back} />
      <Outcome result={result} what={what} />
      <Button label="Novo registro" onPress={again} />
      <Button label="Voltar" variant="secondary" onPress={back} />
    </ScrollView>
  );
}

/** Nascimento: mãe → crias (gêmeos/natimorto) → confirmar. Transacional no servidor. */
export function BirthScreen({ back }: { back: () => void }) {
  const { farm, engine, bump } = useSession();
  const { animals } = useHerd();
  const [dam, setDam] = useState<LocalAnimal | null>(null);
  const [calves, setCalves] = useState<
    { sex: "female" | "male"; tag: string; stillborn: boolean }[]
  >([{ sex: "female", tag: "", stillborn: false }]);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  if (!farm || !animals) return <Loading />;
  const today = todayInTimezone(farm.timezone);
  if (result)
    return (
      <Done
        title="Nascimento"
        result={result}
        what="Nascimento"
        back={back}
        again={() => {
          setResult(null);
          setDam(null);
          setConfirming(false);
          setCalves([{ sex: "female", tag: "", stillborn: false }]);
        }}
      />
    );
  const valid = calves.every((c) => c.stillborn || c.tag.trim());
  return (
    <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
      <PageHead title="Nascimento" onBack={back} />
      <Steps current={!dam ? 1 : confirming ? 3 : 2} />
      {!dam ? (
        <IdentifyField
          animals={animals.filter(
            (a) => a.sex === "female" && (a.category === "cow" || a.category === "heifer"),
          )}
          onSelect={setDam}
        />
      ) : (
        <>
          <Selected animal={dam} change={() => setDam(null)} />
          {calves.map((c, i) => (
            <Card key={i}>
              <Text style={s.h2}>Cria {i + 1}</Text>
              <Choice
                label="Sexo"
                value={c.sex}
                onChange={(v) => setCalves(calves.map((x, j) => (j === i ? { ...x, sex: v } : x)))}
                options={[
                  { value: "female", label: "Fêmea" },
                  { value: "male", label: "Macho" },
                ]}
              />
              <Choice
                label="Nasceu"
                value={c.stillborn ? "morta" : "viva"}
                onChange={(v) =>
                  setCalves(
                    calves.map((x, j) => (j === i ? { ...x, stillborn: v === "morta" } : x)),
                  )
                }
                options={[
                  { value: "viva", label: "Viva" },
                  { value: "morta", label: "Natimorta" },
                ]}
              />
              {!c.stillborn ? (
                <Field
                  label="Brinco ou ID provisório"
                  autoCapitalize="characters"
                  value={c.tag}
                  onChangeText={(t) =>
                    setCalves(calves.map((x, j) => (j === i ? { ...x, tag: t } : x)))
                  }
                />
              ) : null}
              {calves.length > 1 ? (
                <Button
                  label="Remover cria"
                  variant="ghost"
                  icon={<Trash2 size={18} color={color.brandPrimary} />}
                  onPress={() => setCalves(calves.filter((_, j) => j !== i))}
                />
              ) : null}
            </Card>
          ))}
          {calves.length < 4 && !confirming ? (
            <Button
              label="Gêmeos: outra cria"
              variant="secondary"
              icon={<Plus size={18} color={color.brandPrimary} />}
              onPress={() => setCalves([...calves, { sex: "female", tag: "", stillborn: false }])}
            />
          ) : null}
          {!confirming ? (
            <Button label="Revisar" disabled={!valid} onPress={() => setConfirming(true)} />
          ) : (
            <Card>
              <Text style={s.h2}>Confirme</Text>
              <Muted>
                Mãe {dam.primaryIdentifier} · {calves.length} cria(s) ·{" "}
                {today.split("-").reverse().join("/")}
              </Muted>
              <Button
                label="Confirmar nascimento"
                disabled={!engine}
                onPress={async () => {
                  const id = uuid();
                  const payload: BirthInput = {
                    damId: dam.id,
                    date: today,
                    calves: calves.map((c) => ({
                      sex: c.sex,
                      stillborn: c.stillborn,
                      identifiers: c.stillborn ? [] : [{ type: "visual_tag", value: c.tag.trim() }],
                    })),
                  };
                  const r = await engine!.submit({
                    ...mutationBase(id),
                    type: "birth.record",
                    payload,
                  });
                  bump();
                  setResult(r);
                }}
              />
              <Button label="Editar" variant="ghost" onPress={() => setConfirming(false)} />
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

/** Trato por lote: dieta, produto do estoque e quantidade (offline). */
export function FeedingScreen({ back }: { back: () => void }) {
  const { farm, engine, bump } = useSession();
  const { animals, places } = useHerd();
  const { data } = useCachedGet<{ items: ProductDto[] }>(
    farm ? `/v1/farms/${farm.id}/products` : null,
    `products:${farm?.id}`,
  );
  const [groupId, setGroupId] = useState("");
  const [productId, setProductId] = useState("");
  const [diet, setDiet] = useState("");
  const [qty, setQty] = useState("");
  const [result, setResult] = useState<SubmitResult | null>(null);
  if (!farm || !animals) return <Loading />;
  if (result)
    return (
      <Done
        title="Trato"
        result={result}
        what="Trato"
        back={back}
        again={() => {
          setResult(null);
          setQty("");
        }}
      />
    );
  const feeds = (data?.items ?? []).filter(
    (p) => !p.archived && (p.kind === "feed" || p.kind === "supplement"),
  );
  const product = feeds.find((p) => p.id === productId);
  const q = Number(qty.replace(",", "."));
  const groups = places.filter((p) => p.kind === "group");
  return (
    <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
      <PageHead title="Trato" onBack={back} />
      {groups.length ? (
        <Choice
          label="Lote"
          value={groupId}
          onChange={setGroupId}
          options={groups.map((g) => ({ value: g.id, label: g.name }))}
        />
      ) : null}
      {groupId ? (
        <Muted>
          {animals.filter((a) => a.status === "active" && a.groupId === groupId).length} animal(is)
          no lote
        </Muted>
      ) : null}
      {feeds.length ? (
        <Choice
          label="Produto do estoque (opcional)"
          value={productId}
          onChange={(v) => setProductId(v === productId ? "" : v)}
          options={feeds.map((p) => ({ value: p.id, label: p.name }))}
        />
      ) : null}
      <Field
        label="Dieta / descrição"
        value={diet}
        onChangeText={setDiet}
        placeholder={product?.name ?? "Ex.: silagem + concentrado"}
      />
      <Field
        label={`Quantidade (${product?.unit ?? "kg"})`}
        keyboardType="decimal-pad"
        value={qty}
        onChangeText={setQty}
      />
      <Button
        label="Registrar trato"
        disabled={!(q > 0) || (!product && !diet.trim()) || !engine}
        onPress={async () => {
          const r = await engine!.submit({
            ...mutationBase(uuid()),
            type: "feeding.record",
            payload: {
              date: todayInTimezone(farm.timezone),
              diet: diet.trim() || product?.name || "Trato",
              quantity: q,
              ...(groupId ? { groupId } : {}),
              ...(productId ? { productId } : { unit: "kg" }),
            },
          });
          bump();
          setResult(r);
        }}
      />
    </ScrollView>
  );
}

/** Saída: morte, descarte ou transferência — encerra a situação sem apagar histórico. */
export function ExitScreen({ back }: { back: () => void }) {
  const { farm, engine, bump } = useSession();
  const { animals } = useHerd();
  const [animal, setAnimal] = useState<LocalAnimal | null>(null);
  const [kind, setKind] = useState<"dead" | "culled" | "transferred_out">("dead");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  if (!farm || !animals) return <Loading />;
  if (result)
    return (
      <Done
        title="Saída"
        result={result}
        what="Saída"
        back={back}
        again={() => {
          setResult(null);
          setAnimal(null);
          setReason("");
          setConfirming(false);
        }}
      />
    );
  return (
    <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
      <PageHead title="Morte, descarte ou transferência" onBack={back} />
      <Steps current={!animal ? 1 : confirming ? 3 : 2} />
      {!animal ? (
        <IdentifyField animals={animals} onSelect={setAnimal} />
      ) : (
        <>
          <Selected animal={animal} change={() => setAnimal(null)} />
          <Choice
            label="Tipo"
            value={kind}
            onChange={setKind}
            options={(["dead", "culled", "transferred_out"] as const).map((k) => ({
              value: k,
              label: STATUS_LABEL[k],
            }))}
          />
          <Field
            label={kind === "dead" ? "Causa" : kind === "culled" ? "Motivo do descarte" : "Destino"}
            value={reason}
            onChangeText={setReason}
          />
          {!confirming ? (
            <Button
              label="Revisar"
              disabled={reason.trim().length < 2}
              onPress={() => setConfirming(true)}
            />
          ) : (
            <Card>
              <Notice
                kind="warning"
                text={`${animal.primaryIdentifier} passará a "${STATUS_LABEL[kind]}" e deixa de receber manejos. Confirma?`}
              />
              <Button
                label="Confirmar saída"
                disabled={!engine}
                onPress={async () => {
                  const r = await engine!.submit({
                    ...mutationBase(animal.id),
                    type: "animal.exit",
                    payload: { kind, date: todayInTimezone(farm.timezone), reason: reason.trim() },
                  });
                  bump();
                  setResult(r);
                }}
              />
              <Button label="Editar" variant="ghost" onPress={() => setConfirming(false)} />
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

/** Ocorrência rápida (exige conexão; o texto fica no campo se faltar sinal). */
export function OccurrenceScreen({ back }: { back: () => void }) {
  const { farm } = useSession();
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<OccurrenceSeverity>("medium");
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [key, setKey] = useState(uuid());
  if (!farm) return null;
  return (
    <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
      <PageHead title="Ocorrência" onBack={back} />
      {msg ? <Notice kind={msg.tone} text={msg.text} /> : null}
      <Field
        label="O que aconteceu"
        value={title}
        onChangeText={setTitle}
        placeholder="Ex.: bebedouro vazando no piquete 2"
      />
      <Choice
        label="Gravidade"
        value={severity}
        onChange={setSeverity}
        options={(["low", "medium", "high"] as const).map((v) => ({
          value: v,
          label: SEVERITY_LABEL[v],
        }))}
      />
      <Muted>
        Local: {OCCURRENCE_TARGET_LABEL.other} (detalhe no navegador se precisar vincular a animal
        ou pasto).
      </Muted>
      <View style={{ height: space.md }} />
      <Button
        label="Registrar"
        disabled={title.trim().length < 2}
        onPress={async () => {
          try {
            await api(
              "POST",
              `/v1/farms/${farm.id}/occurrences`,
              {
                targetType: "other",
                title: title.trim(),
                severity,
                occurredOn: todayInTimezone(farm.timezone),
              },
              { "idempotency-key": key },
            );
            setMsg({ tone: "success", text: "Ocorrência registrada." });
            setTitle("");
            setKey(uuid());
          } catch (e) {
            setMsg({
              tone: "danger",
              text:
                e instanceof NetworkError
                  ? "Sem conexão. O texto continua aqui; tente com sinal."
                  : errorMessage(e),
            });
          }
        }}
      />
    </ScrollView>
  );
}
