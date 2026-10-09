import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Layout } from "./components/Layout.tsx";
import { Loading } from "./components/ui.tsx";
import { AcceptInvitePage } from "./pages/AcceptInvite.tsx";
import { AccountPage } from "./pages/Account.tsx";
import { AgendaPage } from "./pages/Agenda.tsx";
import { AnimalPage } from "./pages/Animal.tsx";
import { FarmPage } from "./pages/Farm.tsx";
import { HerdPage } from "./pages/Herd.tsx";
import { IdentifyPage } from "./pages/Identify.tsx";
import { ImportPage } from "./pages/Import.tsx";
import { LandingPage } from "./pages/landing/Landing.tsx";
import { LoginPage } from "./pages/Login.tsx";
import { MovePage } from "./pages/Move.tsx";
import { NewAnimalPage } from "./pages/NewAnimal.tsx";
import { PlacesPage } from "./pages/Places.tsx";
import { RegisterPage } from "./pages/Register.tsx";
import { SyncCenterPage } from "./pages/SyncCenter.tsx";
import { TeamPage } from "./pages/Team.tsx";
import { TodayPage } from "./pages/Today.tsx";
import { WeighPage } from "./pages/Weigh.tsx";
import { SessionProvider, useSession } from "./state/session.tsx";
import { SyncProvider } from "./state/sync.tsx";

function Routed() {
  const { status, farm } = useSession();
  if (status === "loading")
    return (
      <div className="center-page">
        <Loading />
      </div>
    );
  if (status === "anonymous") {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/entrar" element={<LoginPage />} />
        <Route path="/convite" element={<AcceptInvitePage />} />
        <Route path="*" element={<Navigate to="/entrar" replace />} />
      </Routes>
    );
  }
  if (!farm) {
    return (
      <div className="center-page">
        <div className="card auth-card">
          <h2>Nenhuma fazenda disponível</h2>
          <p className="hint">
            Seu acesso ainda não inclui fazendas. Fale com o proprietário ou gerente.
          </p>
        </div>
      </div>
    );
  }
  return (
    <SyncProvider key={farm.id} farmId={farm.id}>
      <Routes>
        <Route path="/convite" element={<AcceptInvitePage />} />
        <Route path="/entrar" element={<Navigate to="/" replace />} />
        <Route element={<Layout />}>
          <Route index element={<TodayPage />} />
          <Route path="rebanho" element={<HerdPage />} />
          <Route path="rebanho/identificar" element={<IdentifyPage />} />
          <Route path="rebanho/:id" element={<AnimalPage />} />
          <Route path="registrar" element={<RegisterPage />} />
          <Route path="registrar/animal" element={<NewAnimalPage />} />
          <Route path="registrar/pesagem" element={<WeighPage />} />
          <Route path="registrar/movimentacao" element={<MovePage />} />
          <Route path="agenda" element={<AgendaPage />} />
          <Route path="fazenda" element={<FarmPage />} />
          <Route path="fazenda/equipe" element={<TeamPage />} />
          <Route path="fazenda/importar" element={<ImportPage />} />
          <Route path="fazenda/lotes" element={<PlacesPage />} />
          <Route path="fazenda/sincronizacao" element={<SyncCenterPage />} />
          <Route path="fazenda/conta" element={<AccountPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </SyncProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routed />
      </SessionProvider>
    </BrowserRouter>
  );
}
