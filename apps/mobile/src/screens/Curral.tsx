import type { HandlingOpenInput, ProductDto } from "@rebania/contracts";
import {
  candidateIdentifiers,
  CATEGORY_LABEL,
  formatQuantity,
  HEALTH_KIND_LABEL,
  todayInTimezone,
  weightConsistencyWarning,
  type HandlingItemStatus,
} from "@rebania/domain";
import { ReadDeduper } from "@rebania/hardware";
import type { LocalAnimal } from "@rebania/sync-core";
import {
  Camera,
  Check,
  ChevronRight,
  ClipboardList,
  Keyboard,
  ScanBarcode,
  SkipForward,
  Undo2,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { AnimalPicker } from "../components/AnimalPicker.tsx";
import { Choice } from "../components/Choice.tsx";
import { Scanner } from "../components/Scanner.tsx";
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
import {
  listSessions,
  loadSession,
  saveSession,
  summaryOf,
  type LocalSession,
} from "../lib/curral.ts";
import { mutationBase, useSession, uuid } from "../lib/session.tsx";
import { color, radius, space } from "../theme.ts";
import { useHerd } from "./hooks.ts";

/** Modo Curral: lista de sessões → configurar uma vez → manejar animal a animal → encerrar. */
export function CurralScreen({ back }: { back: () => void }) {
  const { farm } = useSession();
  const [view, setView] = useState<
    { kind: "list" } | { kind: "new" } | { kind: "run"; id: string }
  >({ kind: "list" });
  const [sessions, setSessions] = useState<LocalSession[] | null>(null);
  useEffect(() => {
    if (farm && view.kind === "list") void listSessions(farm.id).then(setSessions);
  }, [farm, view]);
  if (view.kind === "new")
    return (
      <Setup
        back={() => setView({ kind: "list" })}
        started={(id) => setView({ kind: "run", id })}
      />
    );
  if (view.kind === "run") return <Run id={view.id} back={() => setView({ kind: "list" })} />;
  if (!sessions) return <Loading />;
  const open = sessions.filter((x) => x.status === "open");
  return (
    <ScrollView contentContainerStyle={s.screen}>
      <PageHead title="Modo Curral" onBack={back} />
      <Muted>
        Configure uma vez, leia cada animal, confirme o que foi feito. Funciona sem sinal e retoma
        após reiniciar.
      </Muted>
      <View style={{ height: space.md }} />
      <Button
        label="Nova sessão"
        icon={<ClipboardList size={20} color="#fff" />}
        onPress={() => setView({ kind: "new" })}
      />
      {open.map((x) => {
        const sm = summaryOf(x);
        return (
          <Pressable
            key={x.id}
            accessibilityRole="button"
            onPress={() => setView({ kind: "run", id: x.id })}
            style={[s.card, { flexDirection: "row", alignItems: "center" }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{x.name}</Text>
              <Muted>
                {sm.done} de {sm.total} realizados · {sm.pending} pendentes
              </Muted>
            </View>
            <ChevronRight size={22} color={color.textPrimary} />
          </Pressable>
        );
      })}
      {sessions
        .filter((x) => x.status === "closed")
        .slice(0, 10)
        .map((x) => (
          <Card key={x.id}>
            <Text style={s.rowTitle}>{x.name} (encerrada)</Text>
            <Muted>
              {summaryOf(x).done} realizados de {summaryOf(x).total}
            </Muted>
          </Card>
        ))}
    </ScrollView>
  );
}

function Setup({ back, started }: { back: () => void; started: (id: string) => void }) {
  const { farm, engine } = useSession();
  const { animals, places } = useHerd();
  const { data } = useCachedGet<{ items: ProductDto[] }>(
    farm ? `/v1/farms/${farm.id}/products` : null,
    `products:${farm?.id}`,
  );
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [ids, setIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [weigh, setWeigh] = useState<"sim" | "nao">("nao");
  const [productId, setProductId] = useState("");
  const [dose, setDose] = useState("");
  const eligible = useCallback((a: LocalAnimal) => a.status === "active", []);
  if (!farm || !animals) return <Loading />;
  const products = (data?.items ?? []).filter(
    (p) => !p.archived && p.kind !== "semen" && p.kind !== "feed",
  );
  const product = products.find((p) => p.id === productId);
  const doseN = Number(dose.replace(",", "."));
  const ok = weigh === "sim" || (product && doseN > 0);
  return (
    <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
      <PageHead title="Nova sessão" onBack={back} />
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
            disabled={!ids.length}
            onPress={() => setStep(2)}
          />
        </>
      ) : null}
      {step === 2 ? (
        <>
          <Field
            label="Nome da sessão (opcional)"
            value={name}
            onChangeText={setName}
            placeholder="Ex.: Vacinação lote 3"
          />
          <Choice
            label="Pesar cada animal?"
            value={weigh}
            onChange={setWeigh}
            options={[
              { value: "sim", label: "Sim" },
              { value: "nao", label: "Não" },
            ]}
          />
          {products.length ? (
            <Choice
              label="Produto a aplicar (opcional)"
              value={productId}
              onChange={(v) => setProductId(v === productId ? "" : v)}
              options={products.map((p) => ({ value: p.id, label: `${p.name} (${p.unit})` }))}
            />
          ) : (
            <Notice
              kind="info"
              text="Sem produtos neste aparelho: a sessão pode ser só de pesagem."
            />
          )}
          {product ? (
            <Field
              label={`Dose por animal (${product.unit})`}
              keyboardType="decimal-pad"
              value={dose}
              onChangeText={setDose}
            />
          ) : null}
          <Button label="Revisar" disabled={!ok} onPress={() => setStep(3)} />
          <Button label="Voltar" variant="ghost" onPress={() => setStep(1)} />
        </>
      ) : null}
      {step === 3 ? (
        <Card>
          <Text style={s.h2}>Iniciar manejo</Text>
          <Muted>{ids.length} animal(is) selecionados</Muted>
          <Muted>{weigh === "sim" ? "Com pesagem" : "Sem pesagem"}</Muted>
          {product ? (
            <Muted>{`${product.name} · ${formatQuantity(doseN, product.unit)} por animal`}</Muted>
          ) : null}
          <Notice
            kind="info"
            text="Nada é registrado ao iniciar: cada animal só conta quando você confirmar."
          />
          <Button
            label="Iniciar"
            disabled={!engine}
            onPress={async () => {
              if (!engine) return;
              const id = uuid();
              const products = product ? [{ productId: product.id, dose: doseN }] : [];
              const nm =
                name.trim() ||
                [product ? HEALTH_KIND_LABEL.vaccination : null, weigh === "sim" ? "Pesagem" : null]
                  .filter(Boolean)
                  .join(" + ");
              const payload: HandlingOpenInput = {
                name: nm,
                date: todayInTimezone(farm.timezone),
                animalIds: ids,
                config: { weigh: weigh === "sim", healthKind: "vaccination", products },
              };
              await saveSession({
                id,
                farmId: farm.id,
                name: nm,
                date: payload.date,
                status: "open",
                config: {
                  weigh: weigh === "sim",
                  healthKind: "vaccination",
                  products: products.map((p) => ({
                    ...p,
                    productName: product?.name,
                    unit: product?.unit,
                  })),
                },
                items: ids.map((animalId) => ({
                  animalId,
                  status: "pending",
                  added: false,
                  weightKg: null,
                  note: null,
                  doneAt: null,
                })),
                exceptions: [],
                reads: [],
                readerConnected: true,
                createdAt: new Date().toISOString(),
              });
              await engine.submit({ ...mutationBase(id), type: "handling.open", payload });
              started(id);
            }}
          />
        </Card>
      ) : null}
    </ScrollView>
  );
}

type Notice2 =
  | { kind: "repeat"; animalId: string }
  | { kind: "outside"; animalId: string }
  | { kind: "unknown"; value: string }
  | { kind: "msg"; tone: "success" | "warning" | "danger" | "info"; text: string };

function Run({ id, back }: { id: string; back: () => void }) {
  const { engine, sync } = useSession();
  const { animals } = useHerd();
  const [sess, setSess] = useState<LocalSession | null>(null);
  const ref = useRef<LocalSession | null>(null);
  ref.current = sess;
  const [line, setLine] = useState("");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [weight, setWeight] = useState("");
  const [notice, setNotice] = useState<Notice2 | null>(null);
  const [scan, setScan] = useState(false);
  const [closing, setClosing] = useState(false);
  const seq = useRef(0);
  const deduper = useMemo(() => new ReadDeduper(4000), []);
  const inputRef = useRef<TextInput>(null);
  useEffect(() => {
    void loadSession(id).then((x) => {
      if (x) deduper.restore(x.reads);
      setSess(x);
    });
  }, [id, deduper]);
  const update = useCallback(async (fn: (p: LocalSession) => LocalSession) => {
    if (!ref.current) return;
    const next = fn(ref.current);
    ref.current = next;
    setSess(next);
    await saveSession(next);
  }, []);
  const byId = useMemo(() => new Map((animals ?? []).map((a) => [a.id, a])), [animals]);
  if (!sess || !animals) return <Loading />;
  const summary = summaryOf(sess);
  const current = currentId ? byId.get(currentId) : undefined;
  const show = (n: Notice2 | null) => {
    seq.current++;
    setNotice(n);
  };

  const mark = async (
    animalId: string,
    status: HandlingItemStatus,
    extra: { weightKg?: number; note?: string } = {},
  ) => {
    show(null);
    const at = seq.current;
    await update((p) => {
      const exists = p.items.some((i) => i.animalId === animalId);
      const patch = {
        status,
        weightKg: status === "done" ? (extra.weightKg ?? null) : null,
        note: extra.note ?? null,
        doneAt: status === "done" ? new Date().toISOString() : null,
      };
      return {
        ...p,
        items: exists
          ? p.items.map((i) => (i.animalId === animalId ? { ...i, ...patch } : i))
          : [...p.items, { animalId, added: true, ...patch }],
      };
    });
    setCurrentId(null);
    setWeight("");
    const r = await engine!.submit({
      ...mutationBase(sess.id),
      type: "handling.mark",
      payload: {
        animalId,
        status,
        ...(extra.weightKg
          ? { weightKg: extra.weightKg, weightId: uuid(), weightSource: "manual" }
          : {}),
        ...(extra.note ? { note: extra.note } : {}),
      },
    });
    const tag = byId.get(animalId)?.primaryIdentifier ?? "animal";
    if (seq.current === at)
      setNotice({
        kind: "msg",
        tone:
          r.status === "synced" ? "success" : r.status === "saved_locally" ? "warning" : "danger",
        text:
          r.status === "synced"
            ? `${tag}: registrado e sincronizado.`
            : r.status === "saved_locally"
              ? `${tag}: salvo no aparelho. Enviaremos quando houver conexão.`
              : `${tag}: não registrado — ${r.message}`,
      });
    inputRef.current?.focus();
  };

  const exception = async (kind: string, value?: string, note?: string) => {
    const exId = uuid();
    await update((p) => ({
      ...p,
      exceptions: [
        ...p.exceptions,
        {
          id: exId,
          kind,
          value: value ?? null,
          note: note ?? null,
          createdAt: new Date().toISOString(),
        },
      ],
    }));
    await engine!.submit({
      ...mutationBase(sess.id),
      type: "handling.exception",
      payload: {
        id: exId,
        kind: kind as "note",
        ...(value ? { value } : {}),
        ...(note ? { note } : {}),
      },
    });
  };

  const read = async (raw: string) => {
    const text = raw.trim();
    setLine("");
    if (!text) return;
    const values = new Set(candidateIdentifiers(text).map((c) => c.value));
    const matches = animals.filter(
      (a) => a.status === "active" && a.identifiers.some((i) => values.has(i.value)),
    );
    const key = matches.length === 1 ? matches[0]!.id : text.toUpperCase();
    if (deduper.accept(key, Date.now()) === "suppressed") {
      show({ kind: "msg", tone: "info", text: `Leitura repetida de ${text} ignorada.` });
      return;
    }
    if (!sess.reads.includes(key)) await update((p) => ({ ...p, reads: [...p.reads, key] }));
    if (matches.length !== 1) {
      show({ kind: "unknown", value: text.toUpperCase() });
      return;
    }
    const a = matches[0]!;
    const item = sess.items.find((i) => i.animalId === a.id);
    if (!item) return show({ kind: "outside", animalId: a.id });
    if (item.status === "done") return show({ kind: "repeat", animalId: a.id });
    show(null);
    setCurrentId(a.id);
  };

  if (closing || sess.status === "closed") {
    const notDone = sess.items.filter((i) => i.status !== "done");
    return (
      <ScrollView contentContainerStyle={s.screen}>
        <PageHead
          title="Encerrar sessão"
          onBack={sess.status === "closed" ? back : () => setClosing(false)}
        />
        <Card>
          <Text style={s.h2}>{sess.name}</Text>
          <Muted>Realizados: {summary.done}</Muted>
          <Muted>Não realizados: {summary.skipped + summary.pending}</Muted>
          <Muted>Exceções: {summary.exceptions}</Muted>
          <Muted>
            Aguardando envio: {sync?.pending ? `${sync.pending} registro(s)` : "tudo sincronizado"}
          </Muted>
          {notDone.length ? (
            <Muted>
              Não manejados:{" "}
              {notDone.map((i) => byId.get(i.animalId)?.primaryIdentifier ?? "?").join(", ")} (vão
              para a Agenda)
            </Muted>
          ) : null}
        </Card>
        {notice?.kind === "msg" ? <Notice kind={notice.tone} text={notice.text} /> : null}
        {sess.status === "open" ? (
          <Button
            label="Encerrar sessão"
            onPress={async () => {
              await update((p) => ({ ...p, status: "closed" }));
              const r = await engine!.submit({
                ...mutationBase(sess.id),
                type: "handling.close",
                payload: {},
              });
              setNotice({
                kind: "msg",
                tone:
                  r.status === "synced"
                    ? "success"
                    : r.status === "saved_locally"
                      ? "warning"
                      : "danger",
                text:
                  r.status === "synced"
                    ? "Sessão encerrada e sincronizada."
                    : r.status === "saved_locally"
                      ? "Salvo no aparelho. Enviaremos quando houver conexão."
                      : `Não encerrada: ${r.message}`,
              });
            }}
          />
        ) : (
          <Button label="Voltar ao Modo Curral" variant="secondary" onPress={back} />
        )}
      </ScrollView>
    );
  }

  const pct = summary.total ? (summary.done + summary.skipped) / summary.total : 0;
  const w = Number(weight.replace(",", "."));
  const warn =
    current && weight && current.lastWeight
      ? weightConsistencyWarning(current.lastWeight, { measuredOn: sess.date, weightKg: w || 0 })
      : null;
  return (
    <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
      <PageHead
        title={sess.name}
        onBack={back}
        aside={<Button label="Encerrar" variant="secondary" onPress={() => setClosing(true)} />}
      />
      <View
        style={{ height: 12, borderRadius: 999, backgroundColor: color.border, overflow: "hidden" }}
      >
        <View
          style={{
            width: `${Math.round(pct * 100)}%`,
            height: "100%",
            backgroundColor: color.brandPrimary,
          }}
        />
      </View>
      <Muted>
        {summary.done} realizados · {summary.skipped} não realizados · {summary.pending} pendentes
        {summary.exceptions ? ` · ${summary.exceptions} exceção(ões)` : ""}
      </Muted>
      <View
        style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginVertical: space.sm }}
      >
        {sess.config.products.map((p) => (
          <Text
            key={p.productId}
            style={{
              backgroundColor: color.brandSage,
              borderRadius: radius.md,
              paddingHorizontal: 10,
              paddingVertical: 6,
              fontWeight: "700",
              color: color.brandPrimary,
            }}
          >
            {p.productName} · {formatQuantity(p.dose, p.unit ?? "")}
          </Text>
        ))}
        {sess.config.weigh ? (
          <Text
            style={{
              backgroundColor: color.brandSage,
              borderRadius: radius.md,
              paddingHorizontal: 10,
              paddingVertical: 6,
              fontWeight: "700",
              color: color.brandPrimary,
            }}
          >
            Pesagem
          </Text>
        ) : null}
      </View>
      <Card style={{ borderWidth: 2, borderColor: color.brandPrimary }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          {sess.readerConnected ? (
            <ScanBarcode size={20} color={color.textPrimary} />
          ) : (
            <Keyboard size={20} color={color.textPrimary} />
          )}
          <Text style={s.label}>
            {sess.readerConnected
              ? "Leia o brinco/RFID (leitor em modo teclado)"
              : "Digite o brinco"}
          </Text>
        </View>
        <TextInput
          ref={inputRef}
          accessibilityLabel="Leitura do brinco"
          autoFocus
          autoCapitalize="characters"
          blurOnSubmit={false}
          value={line}
          onChangeText={setLine}
          onSubmitEditing={() => void read(line)}
          placeholder="Aguardando leitura…"
          placeholderTextColor={color.textSecondary}
          style={[
            s.input,
            {
              fontSize: 22,
              minHeight: 56,
              borderWidth: 1,
              borderColor: color.border,
              borderRadius: radius.md,
              paddingHorizontal: space.md,
            },
          ]}
        />
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              label="Câmera"
              variant="secondary"
              icon={<Camera size={18} color={color.brandPrimary} />}
              onPress={() => setScan(true)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={sess.readerConnected ? "Leitor parou" : "Usar leitor"}
              variant="ghost"
              onPress={async () => {
                const on = !sess.readerConnected;
                await update((p) => ({ ...p, readerConnected: on }));
                if (!on)
                  await exception(
                    "reader_disconnected",
                    undefined,
                    "Leitor desconectado; seguindo por digitação",
                  );
              }}
            />
          </View>
        </View>
      </Card>
      <Scanner
        visible={scan}
        onClose={() => setScan(false)}
        onScan={(v) => {
          setScan(false);
          void read(v);
        }}
      />

      {notice?.kind === "msg" ? <Notice kind={notice.tone} text={notice.text} /> : null}
      {notice?.kind === "repeat" ? (
        <Card>
          <Notice
            kind="warning"
            text={`${byId.get(notice.animalId)?.primaryIdentifier} já foi realizado nesta sessão. Nada foi aplicado de novo.`}
          />
          <Button label="Ok, próximo" variant="secondary" onPress={() => show(null)} />
          <Button
            label="Desfazer registro"
            variant="ghost"
            icon={<Undo2 size={18} color={color.brandPrimary} />}
            onPress={() => void mark(notice.animalId, "pending")}
          />
        </Card>
      ) : null}
      {notice?.kind === "outside" ? (
        <Card>
          <Notice
            kind="info"
            text={`${byId.get(notice.animalId)?.primaryIdentifier} não está na seleção inicial.`}
          />
          <Button
            label="Incluir nesta sessão"
            variant="secondary"
            onPress={() => {
              setCurrentId(notice.animalId);
              show(null);
            }}
          />
          <Button label="Ignorar" variant="ghost" onPress={() => show(null)} />
        </Card>
      ) : null}
      {notice?.kind === "unknown" ? (
        <Card>
          <Notice
            kind="warning"
            text={`Identificador ${notice.value} não encontrado neste aparelho. Associe ou cadastre depois; nada é criado por suposição.`}
          />
          <Button
            label="Registrar exceção"
            variant="secondary"
            onPress={() => {
              const v = notice.value;
              show({ kind: "msg", tone: "warning", text: `${v} registrado como exceção.` });
              void exception("unknown_identifier", v);
            }}
          />
        </Card>
      ) : null}

      {current ? (
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={[s.h2, { marginBottom: 2 }]}>
                {CATEGORY_LABEL[current.category]} {current.primaryIdentifier}
              </Text>
              <Muted>
                {current.groupName ?? "Sem lote"} ·{" "}
                {current.lastWeight ? `${current.lastWeight.weightKg} kg` : "sem pesagem"}
              </Muted>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar animal"
              onPress={() => setCurrentId(null)}
              hitSlop={12}
            >
              <X size={24} color={color.textPrimary} />
            </Pressable>
          </View>
          {sess.config.weigh ? (
            <Field
              label="Peso (kg) do visor da balança"
              keyboardType="decimal-pad"
              value={weight}
              onChangeText={setWeight}
              error={warn}
            />
          ) : null}
          <Button
            label="Confirmar realizado"
            icon={<Check size={22} color="#fff" />}
            disabled={sess.config.weigh && Boolean(weight) && !(w > 0 && w <= 1500)}
            onPress={() => void mark(current.id, "done", w > 0 ? { weightKg: w } : {})}
          />
          <Button
            label="Não realizado"
            variant="secondary"
            icon={<SkipForward size={20} color={color.brandPrimary} />}
            onPress={() => void mark(current.id, "skipped")}
          />
        </Card>
      ) : null}

      <Text style={[s.h2, { marginTop: space.lg }]}>Pendentes ({summary.pending})</Text>
      {sess.items
        .filter((i) => i.status === "pending")
        .slice(0, 100)
        .map((i) => {
          const a = byId.get(i.animalId);
          return (
            <Pressable
              key={i.animalId}
              accessibilityRole="button"
              style={s.row}
              onPress={() => setCurrentId(i.animalId)}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>
                  {a ? `${CATEGORY_LABEL[a.category]} ${a.primaryIdentifier ?? ""}` : "Animal"}
                </Text>
                <Muted>{a?.groupName ?? "Sem lote"}</Muted>
              </View>
              <ChevronRight size={20} color={color.textPrimary} />
            </Pressable>
          );
        })}
    </ScrollView>
  );
}
