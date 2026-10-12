import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { Layout } from "./components/Layout.tsx";
import { Loading } from "./components/ui.tsx";
import { AcceptInvitePage } from "./pages/AcceptInvite.tsx";
import { AccountPage } from "./pages/Account.tsx";
import { ConsoleShell } from "./components/ConsoleShell.tsx";
import { ChangePasswordPage, ProvisionalPasswordPage } from "./pages/ChangePassword.tsx";
import { AgendaPage } from "./pages/Agenda.tsx";
import { AnimalPage } from "./pages/Animal.tsx";
import { FarmPage } from "./pages/Farm.tsx";
import { HerdPage } from "./pages/Herd.tsx";
import { IdentifyPage } from "./pages/Identify.tsx";
import { ImportPage } from "./pages/Import.tsx";
import { BirthPage } from "./pages/repro/Birth.tsx";
import { BreedingPage } from "./pages/repro/Breeding.tsx";
import { PregnancyPage } from "./pages/repro/Pregnancy.tsx";
import { ReproductionPage } from "./pages/repro/Reproduction.tsx";
import { WeaningPage } from "./pages/repro/Weaning.tsx";
import { SettingsPage } from "./pages/Settings.tsx";
import { ApplyPage } from "./pages/health/Apply.tsx";
import { ExamPage } from "./pages/health/Exam.tsx";
import { HealthPage } from "./pages/health/Health.tsx";
import { StockPage } from "./pages/health/Stock.tsx";
import { TreatmentPage } from "./pages/health/Treatment.tsx";
import { CurralRunPage } from "./pages/curral/Run.tsx";
import { CurralSessionsPage } from "./pages/curral/Sessions.tsx";
import { CurralSetupPage } from "./pages/curral/Setup.tsx";
import { CommercialDetailPage, CommercialPage } from "./pages/commerce/Commercial.tsx";
import { ExitPage } from "./pages/commerce/Exit.tsx";
import { FeedingPage } from "./pages/commerce/Feeding.tsx";
import { FinancePage } from "./pages/commerce/Finance.tsx";
import { PurchasePage } from "./pages/commerce/Purchase.tsx";
import { ReportsPage } from "./pages/commerce/Reports.tsx";
import { SalePage } from "./pages/commerce/Sale.tsx";
import { AssistantPage } from "./pages/ai/Assistant.tsx";
import { PlanPage } from "./pages/ai/Plan.tsx";
import { AssetsPage } from "./pages/depth/Assets.tsx";
import { ConfinementPage } from "./pages/depth/Confinement.tsx";
import { OccurrencesPage } from "./pages/depth/Occurrences.tsx";
import { PasturesPage } from "./pages/depth/Pastures.tsx";
import {
  AnnouncementsPage,
  AuditPage,
  OperationsPage,
  SettingsPage as ConsoleSettingsPage,
  TeamPage as ConsoleTeamPage,
} from "./pages/console/Admin.tsx";
import { BillingPage } from "./pages/console/Billing.tsx";
import { CustomerPage } from "./pages/console/Customer.tsx";
import { CustomersPage } from "./pages/console/Customers.tsx";
import { MfaSetupPage, MfaVerifyPage } from "./pages/console/Mfa.tsx";
import { OnboardingPage } from "./pages/console/Onboarding.tsx";
import { OverviewPage } from "./pages/console/Overview.tsx";
import { PlansPage } from "./pages/console/Plans.tsx";
import { SupportReadPage, TicketPage, TicketsPage } from "./pages/console/Tickets.tsx";
import { ForgotPasswordPage, ResetPasswordPage } from "./pages/PasswordReset.tsx";
import { SupportPage, SupportTicketPage } from "./pages/Support.tsx";
import { InstallAppPage } from "./pages/InstallApp.tsx";
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
  const { status, farm, me } = useSession();
  const location = useLocation();
  // O link de redefinição vale para qualquer pessoa, logada ou não.
  if (location.pathname === "/redefinir-senha") return <ResetPasswordPage />;
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
        <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
        <Route path="*" element={<Navigate to="/entrar" replace />} />
      </Routes>
    );
  }
  if (me?.user.mustChangePassword) {
    return (
      <Routes>
        <Route path="/trocar-senha" element={<ProvisionalPasswordPage />} />
        <Route path="*" element={<Navigate to="/trocar-senha" replace />} />
      </Routes>
    );
  }
  // Equipe da plataforma: conta separada, sem fazendas; só o console (área própria).
  if (me?.platformAdmin) {
    // Verificação em duas etapas antes de qualquer tela do console (o servidor também exige).
    if (me.platform?.mfaRequired && !me.platform.mfaEnrolled) return <MfaSetupPage />;
    if (me.platform?.mfaRequired && !me.platform.mfaVerified) return <MfaVerifyPage />;
    return (
      <Routes>
        <Route element={<ConsoleShell />}>
          <Route path="console" element={<OverviewPage />} />
          <Route path="console/clientes" element={<CustomersPage />} />
          <Route path="console/clientes/:id" element={<CustomerPage />} />
          <Route path="console/clientes/:id/leitura/:farmId" element={<SupportReadPage />} />
          <Route path="console/implantacoes" element={<OnboardingPage />} />
          <Route path="console/cobranca" element={<BillingPage />} />
          <Route path="console/planos" element={<PlansPage />} />
          <Route path="console/suporte" element={<TicketsPage />} />
          <Route path="console/suporte/:id" element={<TicketPage />} />
          <Route path="console/comunicados" element={<AnnouncementsPage />} />
          <Route path="console/operacao" element={<OperationsPage />} />
          <Route path="console/auditoria" element={<AuditPage />} />
          <Route path="console/equipe" element={<ConsoleTeamPage />} />
          <Route path="console/configuracoes" element={<ConsoleSettingsPage />} />
          <Route path="conta/senha" element={<ChangePasswordPage back="/console" />} />
          <Route path="*" element={<Navigate to="/console" replace />} />
        </Route>
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
          <Route path="registrar/nascimento" element={<BirthPage />} />
          <Route path="registrar/inseminacao" element={<BreedingPage />} />
          <Route path="registrar/diagnostico" element={<PregnancyPage />} />
          <Route path="registrar/desmama" element={<WeaningPage />} />
          <Route path="reproducao" element={<ReproductionPage />} />
          <Route path="registrar/aplicacao" element={<ApplyPage />} />
          <Route path="registrar/tratamento" element={<TreatmentPage />} />
          <Route path="registrar/exame" element={<ExamPage />} />
          <Route path="sanidade" element={<HealthPage />} />
          <Route path="curral" element={<CurralSessionsPage />} />
          <Route path="curral/nova" element={<CurralSetupPage />} />
          <Route path="curral/:id" element={<CurralRunPage />} />
          <Route path="fazenda/estoque" element={<StockPage />} />
          <Route path="registrar/trato" element={<FeedingPage />} />
          <Route path="registrar/saida" element={<ExitPage />} />
          <Route path="comercial" element={<CommercialPage />} />
          <Route path="comercial/venda" element={<SalePage />} />
          <Route path="comercial/compra" element={<PurchasePage />} />
          <Route path="comercial/:id" element={<CommercialDetailPage />} />
          <Route path="fazenda/financeiro" element={<FinancePage />} />
          <Route path="relatorios" element={<ReportsPage />} />
          <Route path="assistente" element={<AssistantPage />} />
          <Route path="ocorrencias" element={<OccurrencesPage />} />
          <Route path="fazenda/confinamento" element={<ConfinementPage />} />
          <Route path="fazenda/pastagem" element={<PasturesPage />} />
          <Route path="fazenda/patrimonio" element={<AssetsPage />} />
          <Route path="fazenda/plano" element={<PlanPage />} />
          <Route path="fazenda/suporte" element={<SupportPage />} />
          <Route path="fazenda/instalar" element={<InstallAppPage />} />
          <Route path="fazenda/suporte/:id" element={<SupportTicketPage />} />
          <Route path="fazenda/configuracoes" element={<SettingsPage />} />
          <Route path="agenda" element={<AgendaPage />} />
          <Route path="fazenda" element={<FarmPage />} />
          <Route path="fazenda/equipe" element={<TeamPage />} />
          <Route path="fazenda/importar" element={<ImportPage />} />
          <Route path="fazenda/lotes" element={<PlacesPage />} />
          <Route path="fazenda/sincronizacao" element={<SyncCenterPage />} />
          <Route path="fazenda/conta" element={<AccountPage />} />
          <Route
            path="fazenda/conta/senha"
            element={<ChangePasswordPage back="/fazenda/conta" />}
          />
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
