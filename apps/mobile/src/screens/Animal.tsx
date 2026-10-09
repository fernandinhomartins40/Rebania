import type { AnimalHistory, Media } from "@rebania/contracts";
import { CATEGORY_LABEL, IDENTIFIER_LABEL, SEX_LABEL, STATUS_LABEL } from "@rebania/domain";
import type { LocalAnimal } from "@rebania/sync-core";
import * as ImagePicker from "expo-image-picker";
import {
  ArrowLeftRight,
  CalendarDays,
  Camera,
  ChartColumn,
  ImagePlus,
  MapPin,
  Pencil,
  Tag,
  Weight,
  type LucideIcon,
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";
import {
  Button,
  Card,
  fmtDate,
  LINE,
  Muted,
  PageHead,
  PhotoPlaceholder,
  s,
} from "../components/ui.tsx";
import { api, API_URL, authHeaders } from "../lib/api.ts";
import { useSession } from "../lib/session.tsx";
import { pendingUploads, processUploads, queuePhoto, type PendingUpload } from "../lib/uploads.ts";
import { color, space } from "../theme.ts";

const EVENT: Record<string, { title: string; icon: LucideIcon }> = {
  registered: { title: "Cadastro", icon: Tag },
  weighed: { title: "Pesagem", icon: Weight },
  moved: { title: "Movimentação", icon: ArrowLeftRight },
  identifier_added: { title: "Identificador adicionado", icon: Tag },
  retagged: { title: "Troca de identificação", icon: Tag },
  updated: { title: "Dados atualizados", icon: Pencil },
};

/** Passaporte (T11) no app: foto, métricas, fotos com envio offline e histórico. */
export function AnimalScreen({
  animal,
  back,
  weigh,
}: {
  animal: LocalAnimal;
  back: () => void;
  weigh: () => void;
}) {
  const { farm, dataVersion } = useSession();
  const [history, setHistory] = useState<AnimalHistory | null>(null);
  const [offline, setOffline] = useState(false);
  const [photos, setPhotos] = useState<Media[]>([]);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [photoError, setPhotoError] = useState<string | null>(null);

  const loadPhotos = useCallback(() => {
    if (!farm) return;
    api<Media[]>("GET", `/v1/farms/${farm.id}/animals/${animal.id}/media`).then(
      setPhotos,
      () => undefined,
    );
    void pendingUploads(animal.id).then(setPending);
  }, [farm, animal.id]);

  useEffect(() => {
    if (!farm) return;
    api<AnimalHistory>("GET", `/v1/farms/${farm.id}/animals/${animal.id}/history`).then(
      setHistory,
      () => setOffline(true),
    );
    loadPhotos();
    void authHeaders().then(setHeaders);
  }, [farm, animal.id, dataVersion, loadPhotos]);

  const addPhoto = async (camera: boolean) => {
    if (!farm) return;
    setPhotoError(null);
    const perm = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setPhotoError("Permissão negada. Ative nas configurações do aparelho.");
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ["images"],
      quality: 0.8,
      exif: false,
    };
    const r = camera
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    const asset = r.canceled ? undefined : r.assets[0];
    if (!asset) return;
    try {
      await queuePhoto(farm.id, animal.id, asset.uri, asset.mimeType ?? "image/jpeg");
    } catch {
      setPhotoError("Não foi possível guardar a foto no aparelho.");
      return;
    }
    loadPhotos();
    await processUploads();
    loadPhotos();
  };

  const stats: [LucideIcon, string, string][] = [
    [MapPin, animal.groupName ?? "—", "Lote"],
    [Weight, animal.lastWeight ? `${animal.lastWeight.weightKg} kg` : "—", "Peso atual"],
    history?.adg
      ? [ChartColumn, `${history.adg.adgKgPerDay.toLocaleString("pt-BR")}`, "GMD kg/dia"]
      : [CalendarDays, fmtDate(animal.birthDate), "Nascimento"],
  ];

  return (
    <ScrollView contentContainerStyle={s.screen}>
      <PageHead
        title={`${CATEGORY_LABEL[animal.category]} ${animal.primaryIdentifier ?? ""}`}
        onBack={back}
      />
      <View style={{ marginBottom: space.lg }}>
        {animal.photo ? (
          <Image
            source={{ uri: `${API_URL}${animal.photo.displayUrl}`, headers }}
            style={{ width: "100%", height: 220, borderRadius: 16 }}
            accessibilityLabel="Foto do animal"
          />
        ) : (
          <PhotoPlaceholder width="100%" height={200} rounded={16} />
        )}
        <View style={[s.badge, { position: "absolute", left: 12, bottom: 12 }]}>
          <Text style={s.badgeText}>{STATUS_LABEL[animal.status]}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", marginBottom: space.lg }}>
        {stats.map(([Icon, value, label], i) => (
          <View
            key={label}
            style={{
              flex: 1,
              flexDirection: "row",
              gap: 6,
              paddingHorizontal: 6,
              borderLeftWidth: i ? 1 : 0,
              borderLeftColor: LINE,
            }}
          >
            <Icon size={22} color={color.textPrimary} strokeWidth={1.8} />
            <View style={{ flexShrink: 1 }}>
              <Text style={{ fontWeight: "700", fontSize: 16, color: color.textPrimary }}>
                {value}
              </Text>
              <Muted>{label}</Muted>
            </View>
          </View>
        ))}
      </View>
      {animal.status === "active" ? (
        <Button
          label="Registrar pesagem"
          icon={<Weight size={20} color="#fff" />}
          onPress={weigh}
        />
      ) : null}

      <Text style={[s.h2, { marginTop: space.md }]}>Fotos</Text>
      {photoError ? <Muted>{photoError}</Muted> : null}
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Button
            label="Fotografar"
            variant="secondary"
            icon={<Camera size={20} color={color.brandPrimary} />}
            onPress={() => void addPhoto(true)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label="Galeria"
            variant="secondary"
            icon={<ImagePlus size={20} color={color.brandPrimary} />}
            onPress={() => void addPhoto(false)}
          />
        </View>
      </View>
      {pending.length ? (
        <Muted>{pending.length} foto(s) no aparelho aguardando envio.</Muted>
      ) : null}
      <View
        style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.md }}
      >
        {photos
          .filter((p) => p.thumbUrl)
          .map((p) => (
            <Image
              key={p.id}
              source={{ uri: `${API_URL}${p.thumbUrl}`, headers }}
              style={{ width: 104, height: 78, borderRadius: 8 }}
              accessibilityLabel={`Foto de ${fmtDate((p.takenOn ?? p.createdAt).slice(0, 10))}`}
            />
          ))}
      </View>

      <Text style={[s.h2, { marginTop: space.md }]}>Histórico</Text>
      {offline ? <Muted>Histórico completo disponível com conexão.</Muted> : null}
      {history?.timeline.map((e) => {
        const ev = EVENT[e.type] ?? { title: e.type, icon: CalendarDays };
        return (
          <View
            key={e.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: space.md,
              paddingVertical: space.sm,
              borderBottomWidth: 1,
              borderBottomColor: LINE,
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: color.surfaceMuted,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ev.icon size={22} color={color.textPrimary} strokeWidth={1.8} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{ev.title}</Text>
              <Muted>
                {fmtDate(e.occurredOn)} · {e.summary.replace(/^[^:]+:\s*/, "")}
              </Muted>
            </View>
          </View>
        );
      })}

      <Card style={{ marginTop: space.lg }}>
        <Text style={s.h2}>Dados</Text>
        <Muted>
          {SEX_LABEL[animal.sex]} · {animal.breed ?? "Raça não informada"} · Pasto:{" "}
          {animal.pastureName ?? "—"}
        </Muted>
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
    </ScrollView>
  );
}
