import { useCallback, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { CameraScanner } from "../components/CameraScanner.tsx";
import { IdentifyAnimal } from "../components/IdentifyAnimal.tsx";
import { Alert, Loading, PageHead } from "../components/ui.tsx";
import { useLocalHerd } from "../state/local-data.ts";
import { useSession } from "../state/session.tsx";

/** T09 Identificar: leitor (modo teclado/HID) ou digitação. Busca no rebanho local (offline). */
export function IdentifyPage() {
  const { farm } = useSession();
  const { animals } = useLocalHerd(farm!.id);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reader = params.get("modo") === "leitor";
  const camera = params.get("modo") === "camera";
  const [scanned, setScanned] = useState<string | null>(null);
  const onDetect = useCallback((v: string) => setScanned(v), []);
  if (!animals) return <Loading />;
  return (
    <section>
      <PageHead title="Identificar animal" back="/rebanho" />
      {reader ? (
        <Alert kind="info">
          Conecte o leitor RFID em modo teclado (USB/Bluetooth HID) e faça a leitura: o número
          aparece no campo abaixo. Leitores Bluetooth dedicados e NFC ficam no aplicativo, após
          homologação do aparelho.
        </Alert>
      ) : null}
      {camera && !scanned ? <CameraScanner onDetect={onDetect} /> : null}
      {camera && scanned ? <Alert kind="success">Código lido: {scanned}</Alert> : null}
      <div className="card">
        <IdentifyAnimal
          key={scanned ?? "manual"}
          initialQuery={scanned ?? undefined}
          animals={animals}
          onSelect={(a) => navigate(`/rebanho/${a.id}`)}
        />
      </div>
    </section>
  );
}
