/**
 * Leitor de QR/código de barras. Chrome/Android tem o leitor nativo (Barcode Detection API);
 * Safari/iPhone e outros usam o ZXing em WebAssembly, servido pelo próprio site (sem CDN)
 * e baixado com antecedência para que o service worker o guarde e funcione offline.
 */
export interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => Detector;
  }
}

const FORMATS = ["qr_code", "code_128", "ean_13", "code_39"] as const;

export const nativeBarcodeSupported = () =>
  typeof window !== "undefined" && "BarcodeDetector" in window;

export const cameraScanSupported = () =>
  typeof window !== "undefined" &&
  Boolean(navigator.mediaDevices?.getUserMedia) &&
  (nativeBarcodeSupported() || typeof WebAssembly === "object");

let fallback: Promise<Detector> | null = null;

function loadFallback(): Promise<Detector> {
  fallback ??= (async () => {
    const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
      import("barcode-detector/ponyfill"),
      import("zxing-wasm/reader/zxing_reader.wasm?url"),
    ]);
    await prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith(".wasm") ? wasmUrl : prefix + path,
      },
      fireImmediately: true,
    });
    return new BarcodeDetector({ formats: [...FORMATS] });
  })().catch((err: unknown) => {
    fallback = null; // tenta de novo na próxima vez (ex.: sem rede no primeiro acesso)
    throw err;
  });
  return fallback;
}

export async function createDetector(): Promise<Detector> {
  if (nativeBarcodeSupported()) return new window.BarcodeDetector!({ formats: [...FORMATS] });
  return loadFallback();
}

/** Onde não há leitor nativo, baixa o de reserva em segundo plano (fica em cache para o curral). */
export function preloadBarcodeFallback() {
  if (nativeBarcodeSupported() || !cameraScanSupported()) return;
  const run = () => void loadFallback().catch(() => undefined);
  if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 10_000 });
  else setTimeout(run, 3_000);
}
