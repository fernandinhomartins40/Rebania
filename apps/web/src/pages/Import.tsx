import type { ImportPreviewResponse, SyncReceipt } from "@rebania/contracts";
import {
  importTemplateCsv,
  mapHeader,
  parseCsv,
  type ImportColumn,
  type RawRow,
} from "@rebania/domain";
import { ArrowRight, Download, FileSpreadsheet, Upload } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { errorMessage, post } from "../api/client.ts";
import { Alert, PageHead, Steps } from "../components/ui.tsx";
import { useSession } from "../state/session.tsx";
import { useSync } from "../state/sync.tsx";

interface Row {
  line: number;
  raw: RawRow;
  mutationId: string;
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const csvCell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** T15 Importação: preparar arquivo → revisar inconsistências → confirmar. A prévia não grava nada. */
export function ImportPage() {
  const { farm } = useSession();
  const { engine } = useSync();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [unknownCols, setUnknownCols] = useState<string[]>([]);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [result, setResult] = useState<{
    accepted: number;
    rejected: number;
    results: { line: number; receipt: SyncReceipt; errors: string[] }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const step: 1 | 2 | 3 = result ? 3 : preview ? 2 : 1;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setPreview(null);
    setResult(null);
    const table = parseCsv(await file.text());
    if (table.length < 2) return setError("O arquivo precisa de cabeçalho e ao menos uma linha.");
    const header = table[0]!;
    const cols = mapHeader(header);
    if (!cols.includes("brinco"))
      return setError('Coluna "brinco" não encontrada. Baixe o modelo de planilha.');
    setUnknownCols(header.filter((_, i) => cols[i] === null));
    const parsed: Row[] = table.slice(1).map((cells, i) => {
      const raw: RawRow = {};
      cells.forEach((c, j) => {
        const col = cols[j];
        if (col) raw[col as ImportColumn] = c;
      });
      return { line: i + 2, raw, mutationId: crypto.randomUUID() };
    });
    if (parsed.length > 5000) return setError("Máximo de 5.000 linhas por arquivo.");
    setFileName(file.name);
    setRows(parsed);
    setBusy(true);
    try {
      setPreview(
        await post<ImportPreviewResponse>(`/v1/farms/${farm!.id}/imports/preview`, {
          rows: parsed.map(({ line, raw }) => ({ line, raw })),
        }),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <PageHead title="Importar rebanho" back="/fazenda" />
      <Steps current={step} labels={["Preparar", "Revisar", "Confirmar"]} />
      {error ? <Alert kind="danger">{error}</Alert> : null}

      {step === 1 ? (
        <div className="card">
          <h2>Preparar arquivo</h2>
          <p className="hint">
            Planilha CSV (Excel: “Salvar como → CSV”). Colunas: brinco, rfid, sexo, categoria, raça,
            nascimento, origem, entrada, lote, peso, data_peso, observações. Datas em DD/MM/AAAA.
          </p>
          <div className="actions">
            <label className="btn btn-primary" style={{ margin: 0 }}>
              <Upload size={20} aria-hidden="true" /> {busy ? "Lendo…" : "Escolher arquivo CSV"}
              <input
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
            </label>
            <button
              className="btn btn-secondary"
              onClick={() => download("modelo-rebanho.csv", importTemplateCsv())}
            >
              <Download size={20} aria-hidden="true" /> Baixar modelo
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 && preview ? (
        <>
          <div className="card">
            <h2>
              <FileSpreadsheet size={22} aria-hidden="true" /> {fileName}
            </h2>
            <p>
              <span className="badge badge-ok">{preview.valid} prontas</span>{" "}
              <span className={`badge ${preview.invalid ? "badge-danger" : "badge-muted"}`}>
                {preview.invalid} com erro
              </span>
            </p>
            {preview.newGroups.length ? (
              <Alert kind="info">
                Lotes novos que serão criados: {preview.newGroups.join(", ")}.
              </Alert>
            ) : null}
            {unknownCols.length ? (
              <Alert kind="warning">Colunas ignoradas: {unknownCols.join(", ")}.</Alert>
            ) : null}
            <p className="hint">
              Nada foi gravado ainda. Linhas com erro não serão importadas; corrija e envie de novo
              depois.
            </p>
            <div className="actions">
              <button
                className="btn btn-primary btn-lg"
                disabled={busy || preview.valid === 0}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await post<NonNullable<typeof result>>(
                      `/v1/farms/${farm!.id}/imports/commit`,
                      { fileName, rows },
                    );
                    setResult(r);
                    void engine.syncNow();
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Importando…" : `Importar ${preview.valid} animal(is)`}{" "}
                <ArrowRight size={20} aria-hidden="true" />
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setPreview(null);
                  setRows([]);
                }}
              >
                Trocar arquivo
              </button>
            </div>
          </div>
          {preview.invalid ? (
            <div className="card" style={{ padding: 0, overflow: "auto" }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>Brinco</th>
                    <th>Problema</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows
                    .filter((r) => r.status === "invalid")
                    .map((r) => (
                      <tr key={r.line} style={{ cursor: "default" }}>
                        <td>{r.line}</td>
                        <td>{rows.find((x) => x.line === r.line)?.raw.brinco ?? "—"}</td>
                        <td style={{ color: "var(--color-danger)" }}>{r.errors.join(" ")}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}

      {step === 3 && result ? (
        <div className="card">
          <Alert kind={result.rejected ? "warning" : "success"}>
            {result.accepted} animal(is) importado(s) e sincronizado(s).{" "}
            {result.rejected ? `${result.rejected} linha(s) não importada(s).` : ""}
          </Alert>
          <div className="actions">
            {result.rejected ? (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  const cols = ["linha", "brinco", "erro", ...Object.keys(rows[0]?.raw ?? {})];
                  const bad = result.results.filter((x) => x.receipt.status !== "accepted");
                  const lines = bad.map((b) => {
                    const r = rows.find((x) => x.line === b.line)!;
                    return [
                      String(b.line),
                      r.raw.brinco ?? "",
                      b.errors.join(" "),
                      ...cols.slice(3).map((c) => r.raw[c as ImportColumn] ?? ""),
                    ]
                      .map(csvCell)
                      .join(";");
                  });
                  download("linhas-para-corrigir.csv", [cols.join(";"), ...lines].join("\n"));
                }}
              >
                <Download size={20} aria-hidden="true" /> Baixar linhas para corrigir
              </button>
            ) : null}
            <Link className="btn btn-primary" to="/rebanho">
              Ver rebanho
            </Link>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setResult(null);
                setPreview(null);
                setRows([]);
              }}
            >
              Nova importação
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
