import { Download, EllipsisVertical, Share, SquarePlus, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Link, useLocation } from "react-router";
import {
  canPromptInstall,
  detectPlatform,
  isSnoozed,
  isStandalone,
  justInstalled,
  promptInstall,
  snooze,
  subscribeInstall,
  type InstallPlatform,
} from "../pwa/install.ts";

export function usePlatform(): InstallPlatform {
  return detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
}

export function useInstallState() {
  const canPrompt = useSyncExternalStore(subscribeInstall, canPromptInstall, () => false);
  const installed = useSyncExternalStore(subscribeInstall, justInstalled, () => false);
  return { canPrompt, installed: installed || isStandalone() };
}

/** Passo a passo curto para quando não há instalação automática. */
export function InstallSteps({ platform }: { platform: InstallPlatform }) {
  if (platform === "ios-safari")
    return (
      <ol className="install-steps">
        <li>
          Toque em <strong>Compartilhar</strong>{" "}
          <Share size={18} aria-label="(ícone de compartilhar)" /> na barra do Safari.
        </li>
        <li>
          Role e escolha <strong>Adicionar à Tela de Início</strong>{" "}
          <SquarePlus size={18} aria-hidden="true" />.
        </li>
        <li>
          Toque em <strong>Adicionar</strong>. O Rebania aparece como app na tela do iPhone.
        </li>
      </ol>
    );
  if (platform === "ios-other")
    return (
      <ol className="install-steps">
        <li>
          Toque em <strong>Compartilhar</strong>{" "}
          <Share size={18} aria-label="(ícone de compartilhar)" /> (no Chrome, fica no topo, ao lado
          do endereço).
        </li>
        <li>
          Escolha <strong>Adicionar à Tela de Início</strong>.
        </li>
        <li>Se a opção não aparecer, abra www.rebania.com.br no Safari e faça por lá.</li>
      </ol>
    );
  if (platform === "android")
    return (
      <ol className="install-steps">
        <li>
          Toque no menu <EllipsisVertical size={18} aria-label="(três pontinhos)" /> do navegador.
        </li>
        <li>
          Escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.
        </li>
        <li>Confirme. O Rebania aparece junto dos outros apps.</li>
      </ol>
    );
  return (
    <ol className="install-steps">
      <li>
        No Chrome ou Edge, clique no ícone de instalar <Download size={18} aria-hidden="true" /> na
        barra de endereço.
      </li>
      <li>Confirme em Instalar.</li>
    </ol>
  );
}

/**
 * Convite para instalar o app na fazenda. Android: botão que abre a instalação do
 * próprio sistema. iPhone/iPad: passo a passo (a Apple não permite instalação automática).
 * Some quando já está instalado; "Agora não" adia por 14 dias.
 */
export function InstallBanner() {
  const platform = usePlatform();
  const { canPrompt, installed } = useInstallState();
  const [hidden, setHidden] = useState(() => isSnoozed());
  const [showSteps, setShowSteps] = useState(false);
  const onInstallPage = useLocation().pathname === "/fazenda/instalar";
  useEffect(() => {
    if (installed) setHidden(true);
  }, [installed]);

  // Computador sem instalação automática: não incomoda (a página Instalar o app explica).
  const mobile = platform !== "desktop";
  if (hidden || installed || onInstallPage || (!canPrompt && !mobile)) return null;

  const close = () => {
    snooze();
    setHidden(true);
  };

  return (
    <section className="install-banner" aria-label="Instalar o app Rebania">
      <img className="install-icon" src="/icon-192.png" alt="" width={48} height={48} />
      <div className="install-text">
        <strong>Instale o Rebania no {platform.startsWith("ios") ? "iPhone" : "celular"}</strong>
        <span>
          Abre direto da tela inicial, em tela cheia, e funciona no curral mesmo sem sinal.
        </span>
        {showSteps ? <InstallSteps platform={platform} /> : null}
      </div>
      <div className="install-actions">
        {canPrompt ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              const r = await promptInstall();
              if (r === "dismissed") close();
            }}
          >
            <Download size={18} aria-hidden="true" /> Instalar
          </button>
        ) : !showSteps ? (
          <button type="button" className="btn btn-primary" onClick={() => setShowSteps(true)}>
            Como instalar
          </button>
        ) : (
          <Link className="btn btn-ghost" to="/fazenda/instalar">
            Mais detalhes
          </Link>
        )}
        <button type="button" className="icon-btn" aria-label="Agora não" onClick={close}>
          <X size={20} />
        </button>
      </div>
    </section>
  );
}
