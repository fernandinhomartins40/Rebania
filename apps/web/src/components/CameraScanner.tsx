import { useEffect, useRef, useState } from "react";
import { createDetector } from "./barcode.ts";
import { Alert } from "./ui.tsx";

export { cameraScanSupported } from "./barcode.ts";

/**
 * Leitura de QR/código de barras pela câmera: leitor nativo no Chrome/Android, ZXing
 * (WebAssembly) no iPhone e nos demais. OCR de brinco depende do provedor de IA (G6).
 */
export function CameraScanner({ onDetect }: { onDetect: (value: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        let detector;
        try {
          detector = await createDetector();
        } catch {
          setError(
            "O leitor de código ainda não foi baixado neste aparelho. Abra com internet uma vez ou use Leitor/Digitar.",
          );
          return;
        }
        const tick = async () => {
          if (stop || !video.current) return;
          try {
            const codes = await detector.detect(video.current);
            if (codes[0]?.rawValue) {
              onDetect(codes[0].rawValue);
              return;
            }
          } catch {
            /* quadro sem leitura */
          }
          setTimeout(tick, 250);
        };
        void tick();
      } catch {
        setError("Não foi possível abrir a câmera. Verifique a permissão ou use Leitor/Digitar.");
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetect]);

  if (error) return <Alert kind="warning">{error}</Alert>;
  return (
    <div className="scanner">
      <video ref={video} playsInline muted aria-label="Câmera para leitura do código" />
      <span className="frame" aria-hidden="true" />
    </div>
  );
}
