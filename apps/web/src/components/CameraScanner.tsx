import { useEffect, useRef, useState } from "react";
import { Alert } from "./ui.tsx";

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => Detector;
  }
}

export const cameraScanSupported = () =>
  typeof window !== "undefined" &&
  "BarcodeDetector" in window &&
  Boolean(navigator.mediaDevices?.getUserMedia);

/**
 * Leitura de QR/código de barras pela câmera (Barcode Detection API, disponível no
 * Chrome/Android). Onde não houver suporte, a opção fica indisponível com explicação.
 * OCR de brinco depende do provedor de IA (G6) e não é feito aqui.
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
        const detector = new window.BarcodeDetector!({
          formats: ["qr_code", "code_128", "ean_13", "code_39"],
        });
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
