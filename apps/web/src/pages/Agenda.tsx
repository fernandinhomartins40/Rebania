import { PageHead } from "../components/ui.tsx";
export function AgendaPage() {
  return (
    <section>
      <PageHead title="Agenda" />
      <div className="card">
        <h2>Sem tarefas por enquanto</h2>
        <p className="hint">
          A agenda passa a gerar tarefas a partir dos manejos de reprodução e sanidade (próximas etapas).
          Nada aqui é inventado: só aparecerão tarefas com origem rastreável.
        </p>
      </div>
    </section>
  );
}
