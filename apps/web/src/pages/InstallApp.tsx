import { CircleCheck, Download } from "lucide-react";
import { useState } from "react";
import { InstallSteps, useInstallState, usePlatform } from "../components/InstallBanner.tsx";
import { Alert, PageHead } from "../components/ui.tsx";
import { promptInstall, type InstallPlatform } from "../pwa/install.ts";

const TABS: { id: InstallPlatform; label: string }[] = [
  { id: "android", label: "Android" },
  { id: "ios-safari", label: "iPhone e iPad" },
  { id: "desktop", label: "Computador" },
];

/** Como instalar o Rebania em cada aparelho (Fazenda → Instalar o app). */
export function InstallAppPage() {
  const platform = usePlatform();
  const { canPrompt, installed } = useInstallState();
  const [tab, setTab] = useState<InstallPlatform>(
    platform === "ios-other" ? "ios-safari" : platform,
  );
  return (
    <section>
      <PageHead title="Instalar o app" back="/fazenda" />
      {installed ? (
        <Alert kind="success">
          <CircleCheck size={18} aria-hidden="true" /> O Rebania já está instalado neste aparelho.
        </Alert>
      ) : canPrompt ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <p>Este aparelho permite instalar com um toque.</p>
          <button type="button" className="btn btn-primary" onClick={() => void promptInstall()}>
            <Download size={18} aria-hidden="true" /> Instalar agora
          </button>
        </div>
      ) : null}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Por que instalar</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Abre direto da tela inicial, em tela cheia, sem barra do navegador.</li>
          <li>Registros feitos sem sinal ficam no aparelho e sobem quando a conexão voltar.</li>
          <li>
            É o mesmo Rebania do navegador: mesma conta, mesmos dados, sem baixar nada da loja.
          </li>
        </ul>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id || (t.id === "ios-safari" && tab === "ios-other")}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="card">
        {tab === "android" ? (
          <>
            <p>No Chrome, Samsung Internet ou Edge:</p>
            <InstallSteps platform="android" />
            <p className="hint">
              Se aparecer um aviso “Instalar Rebania” embaixo da tela, é só tocar nele.
            </p>
          </>
        ) : tab === "desktop" ? (
          <InstallSteps platform="desktop" />
        ) : (
          <>
            <p>No Safari (navegador padrão do iPhone e do iPad):</p>
            <InstallSteps platform="ios-safari" />
            <p>No Chrome ou em outro navegador do iPhone:</p>
            <InstallSteps platform="ios-other" />
            <p className="hint">
              A Apple não permite instalação automática por sites: é preciso fazer estes passos uma
              vez.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
