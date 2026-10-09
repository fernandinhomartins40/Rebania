import type { HealthApplyInput, ProductDto } from "@rebania/contracts";
import {
  ADMIN_ROUTE_LABEL,
  ADMIN_ROUTES,
  formatQuantity,
  HEALTH_KIND_LABEL,
  HEALTH_KINDS,
  todayInTimezone,
  type AdminRoute,
  type HealthKind,
} from "@rebania/domain";
import type { GroupOperationResult } from "@rebania/contracts";
import type { LocalAnimal, SubmitResult } from "@rebania/sync-core";
import { ArrowRight } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ScrollView, Text } from "react-native";
import { AnimalPicker } from "../components/AnimalPicker.tsx";
import { Choice } from "../components/Choice.tsx";
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
import { useCachedGet } from "../lib/cached.ts";
import { mutationBase, useSession, uuid } from "../lib/session.tsx";
import { useHerd } from "./hooks.ts";

/** Aplicação sanitária em grupo (vacina, antiparasitário, medicamento), offline. */
export function ApplyScreen({ back }: { back: () => void }) {
  const { farm, engine, bump } = useSession();
  const { animals, places } = useHerd();
  const { data } = useCachedGet<{ items: ProductDto[] }>(
    farm ? `/v1/farms/${farm.id}/products` : null,
    `products:${farm?.id}`,
  );
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [ids, setIds] = useState<string[]>([]);
  const [kind, setKind] = useState<HealthKind>("vaccination");
  const [productId, setProductId] = useState("");
  const [dose, setDose] = useState("");
  const [route, setRoute] = useState<AdminRoute | "">("");
  const [applicator, setApplicator] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ r: SubmitResult; d: GroupOperationResult | null } | null>(
    null,
  );
  const eligible = useCallback((a: LocalAnimal) => a.status === "active", []);
  if (!farm || !animals) return <Loading />;
  const today = todayInTimezone(farm.timezone);
  const products = (data?.items ?? []).filter(
    (p) => !p.archived && p.kind !== "semen" && p.kind !== "feed",
  );
  const product = products.find((p) => p.id === productId);
  const doseN = Number(dose.replace(",", "."));

  if (result)
    return (
      <ScrollView contentContainerStyle={s.screen}>
        <PageHead title="Aplicação" onBack={back} />
        <Outcome result={result.r} what="Aplicação" />
        {result.d?.exceptions.length ? (
          <Notice
            kind="warning"
            text={`${result.d.exceptions.length} exceção(ões): ${result.d.exceptions.map((e) => e.message).join("; ")}`}
          />
        ) : null}
        <Button
          label="Nova aplicação"
          onPress={() => {
            setResult(null);
            setIds([]);
            setStep(1);
          }}
        />
        <Button label="Voltar" variant="secondary" onPress={back} />
      </ScrollView>
    );

  return (
    <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
      <PageHead title="Aplicação sanitária" onBack={back} />
      <Steps current={step} />
      {step === 1 ? (
        <>
          <AnimalPicker
            animals={animals}
            places={places}
            eligible={eligible}
            selected={ids}
            onChange={setIds}
          />
          <Button
            label={`Continuar com ${ids.length}`}
            icon={<ArrowRight size={20} color="#fff" />}
            disabled={!ids.length}
            onPress={() => setStep(2)}
          />
        </>
      ) : null}
      {step === 2 ? (
        <>
          <Choice
            label="Tipo"
            value={kind}
            onChange={setKind}
            options={HEALTH_KINDS.map((k) => ({ value: k, label: HEALTH_KIND_LABEL[k] }))}
          />
          {products.length === 0 ? (
            <Notice
              kind="info"
              text="Nenhum produto no estoque deste aparelho. Cadastre no navegador (Fazenda → Estoque) e sincronize."
            />
          ) : (
            <Choice
              label="Produto"
              value={productId}
              onChange={setProductId}
              options={products.map((p) => ({
                value: p.id,
                label: `${p.name} (${formatQuantity(p.balance, p.unit)})`,
              }))}
            />
          )}
          <Field
            label={`Dose por animal${product ? ` (${product.unit})` : ""}`}
            keyboardType="decimal-pad"
            value={dose}
            onChangeText={setDose}
          />
          <Choice
            label="Via (opcional)"
            value={route}
            onChange={setRoute}
            options={ADMIN_ROUTES.map((r) => ({ value: r, label: ADMIN_ROUTE_LABEL[r] }))}
          />
          <Field label="Aplicador (opcional)" value={applicator} onChangeText={setApplicator} />
          {product ? (
            <Muted>
              {product.withdrawalMeatDays !== null || product.withdrawalMilkDays !== null
                ? `Carência configurada: carne ${product.withdrawalMeatDays ?? "—"} dia(s).`
                : "Carência não configurada para este produto."}
            </Muted>
          ) : null}
          <Button label="Revisar" disabled={!product || !(doseN > 0)} onPress={() => setStep(3)} />
          <Button label="Voltar" variant="ghost" onPress={() => setStep(1)} />
        </>
      ) : null}
      {step === 3 && product ? (
        <Card>
          <Text style={s.h2}>Confirme</Text>
          <Muted>
            {HEALTH_KIND_LABEL[kind]} · {product.name} · {formatQuantity(doseN, product.unit)} por
            animal
            {route ? ` · ${ADMIN_ROUTE_LABEL[route]}` : ""}
          </Muted>
          <Muted>
            {ids.length} animal(is) · total{" "}
            {formatQuantity(Math.round(doseN * ids.length * 1000) / 1000, product.unit)} · data{" "}
            {today.split("-").reverse().join("/")}
          </Muted>
          <Button
            label={busy ? "Registrando…" : `Confirmar ${ids.length}`}
            disabled={busy || !engine}
            onPress={async () => {
              if (!engine) return;
              setBusy(true);
              const payload: HealthApplyInput = {
                kind,
                date: today,
                animalIds: ids,
                products: [{ productId, dose: doseN, ...(route ? { route } : {}) }],
                ...(applicator.trim() ? { applicator: applicator.trim() } : {}),
              };
              const r = await engine.submit({
                ...mutationBase(uuid()),
                type: "health.apply",
                payload,
              });
              setBusy(false);
              bump();
              setResult({
                r,
                d: r.status === "synced" ? ((r.detail as GroupOperationResult) ?? null) : null,
              });
            }}
          />
          <Button label="Editar" variant="ghost" onPress={() => setStep(2)} />
        </Card>
      ) : null}
    </ScrollView>
  );
}
