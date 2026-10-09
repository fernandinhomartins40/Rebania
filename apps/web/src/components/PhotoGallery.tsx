import type { Media } from "@rebania/contracts";
import { Camera, CloudOff, ImagePlus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { errorMessage, get, post } from "../api/client.ts";
import {
  discardUpload,
  onUploadsChange,
  pendingUploads,
  processUploads,
  queuePhoto,
  type PendingUpload,
} from "../offline/uploads.ts";
import { useSession } from "../state/session.tsx";
import { useSync } from "../state/sync.tsx";
import { Alert, Empty, formatDate, Loading } from "./ui.tsx";

/** Galeria cronológica (T12): fotos enviadas + fila no aparelho com progresso. */
export function PhotoGallery({ animalId }: { animalId: string }) {
  const { farm, can } = useSession();
  const { state, version } = useSync();
  const [items, setItems] = useState<Media[] | null>(null);
  const [pending, setPending] = useState<(PendingUpload & { preview: string })[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Media | null>(null);

  const load = useCallback(() => {
    get<Media[]>(`/v1/farms/${farm!.id}/animals/${animalId}/media`).then(setItems, (e) => {
      setItems([]);
      setError(errorMessage(e));
    });
  }, [farm, animalId]);

  const loadPending = useCallback(async () => {
    const list = await pendingUploads(animalId);
    setPending((old) => {
      old.forEach((o) => URL.revokeObjectURL(o.preview));
      return list.map((u) => ({ ...u, preview: URL.createObjectURL(u.blob) }));
    });
  }, [animalId]);

  useEffect(() => void load(), [load, version]);
  useEffect(() => {
    void loadPending();
    return onUploadsChange(() => {
      void loadPending();
      void pendingUploads(animalId).then((l) => l.length === 0 && load());
    });
  }, [loadPending, load, animalId]);

  // Fotos ainda processando no servidor: atualiza em alguns segundos.
  useEffect(() => {
    if (!items?.some((i) => i.status === "processing")) return;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [items, load]);

  const onFiles = async (files: FileList | null) => {
    setError(null);
    for (const file of Array.from(files ?? [])) {
      try {
        await queuePhoto({ farmId: farm!.id, animalId, file });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível adicionar a foto.");
      }
    }
    if (navigator.onLine) void processUploads();
  };

  return (
    <div>
      {can("animals.write") ? (
        <div className="actions" style={{ marginTop: 0, marginBottom: 16 }}>
          <label className="btn btn-primary" style={{ margin: 0 }}>
            <Camera size={20} aria-hidden="true" /> Fotografar
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              hidden
              onChange={(e) => void onFiles(e.target.files)}
            />
          </label>
          <label className="btn btn-secondary" style={{ margin: 0 }}>
            <ImagePlus size={20} aria-hidden="true" /> Selecionar fotos
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={(e) => void onFiles(e.target.files)}
            />
          </label>
        </div>
      ) : null}
      {error ? <Alert kind="danger">{error}</Alert> : null}

      {pending.length ? (
        <div className="card">
          <h2>No aparelho</h2>
          {pending.map((u) => {
            const pct = Math.round((u.uploadedBytes / u.sizeBytes) * 100);
            return (
              <div key={u.id} className="upload-row">
                <img src={u.preview} alt="" />
                <div style={{ flex: 1 }}>
                  <div className="hint">
                    {u.error ? u.error : !state.online ? "Aguardando conexão" : `Enviando ${pct}%`}
                  </div>
                  <div className="progress" aria-label={`Enviado ${pct}%`}>
                    <span style={{ width: `${pct}%` }} />
                  </div>
                </div>
                {!state.online ? <CloudOff size={20} aria-hidden="true" /> : null}
                <button
                  className="icon-btn"
                  aria-label="Descartar foto"
                  onClick={() => void discardUpload(u.id)}
                >
                  <Trash2 size={20} />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {!items ? (
        <Loading />
      ) : items.length === 0 && pending.length === 0 ? (
        <Empty title="Nenhuma foto ainda" icon={<ImagePlus size={44} aria-hidden="true" />}>
          <p className="hint">
            Fotos ajudam a lembrar o animal. Não comprovam identidade, peso ou diagnóstico.
          </p>
        </Empty>
      ) : (
        <div className="gallery">
          {items.map((m) => (
            <figure key={m.id}>
              {m.status === "failed" ? (
                <div
                  className="photo"
                  style={{ width: "100%", aspectRatio: "4/3", padding: 8, textAlign: "center" }}
                >
                  <span className="hint" style={{ color: "var(--color-danger)" }}>
                    Não foi possível processar. Envie a foto de novo.
                  </span>
                </div>
              ) : m.thumbUrl ? (
                <img
                  src={m.thumbUrl}
                  alt={m.caption ?? "Foto do animal"}
                  loading="lazy"
                  onClick={() => setOpen(m)}
                />
              ) : (
                <div className="photo" style={{ width: "100%", aspectRatio: "4/3" }}>
                  <span className="hint">Processando…</span>
                </div>
              )}
              <figcaption>
                {formatDate((m.takenOn ?? m.createdAt).slice(0, 10))}
                {m.authorName ? ` · ${m.authorName}` : ""}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {open ? (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Foto ampliada"
          onClick={() => setOpen(null)}
        >
          <img src={open.displayUrl ?? ""} alt={open.caption ?? "Foto do animal"} />
          <div style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 8 }}>
            {can("animals.write") ? (
              <button
                className="btn btn-danger"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!confirm("Excluir esta foto?")) return;
                  await post(`/v1/farms/${farm!.id}/media/${open.id}/delete`);
                  setOpen(null);
                  load();
                }}
              >
                <Trash2 size={18} /> Excluir
              </button>
            ) : null}
            <button className="btn btn-soft" aria-label="Fechar" onClick={() => setOpen(null)}>
              <X size={20} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
