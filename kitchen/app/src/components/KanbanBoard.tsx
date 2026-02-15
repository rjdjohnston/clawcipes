import type { Ticket } from "../api";
import { KANBAN_COLUMNS } from "../constants";
import { TicketCard } from "./TicketCard";

type Props = {
  backlog: Ticket[];
  inProgress: Ticket[];
  testing: Ticket[];
  done: Ticket[];
  loading: boolean;
  error: string | null;
  onSelectTicket?: (ticket: Ticket) => void;
  dataVersion?: number;
  teamId?: string;
  demoMode?: boolean;
  onTicketMove?: (ticketId: string, to: string, completed?: boolean) => void;
};

export function KanbanBoard({
  backlog,
  inProgress,
  testing,
  done,
  loading,
  error,
  onSelectTicket,
  dataVersion = 0,
  teamId,
  demoMode,
  onTicketMove,
}: Props) {
  const cols = { backlog, inProgress, testing, done };

  if (error) {
    return <div className="alert alert-danger" role="alert">{error}</div>;
  }

  if (loading) {
    return (
      <div className="row g-4" aria-busy="true" aria-label="Loading tickets">
        {KANBAN_COLUMNS.map(({ colKey, label, accent }) => (
          <div key={colKey} className="col-12 col-sm-6 col-xl-3">
            <div className={`card h-100 shadow-sm kanban-column-card border-start border-${accent}`}>
              <div className={`card-header py-2 bg-${accent}-subtle border-0`}>
                <div className="skeleton-text skeleton-header" />
              </div>
              <div className="card-body py-2">
                <div className="skeleton-placeholder" />
                <div className="skeleton-placeholder" />
                <div className="skeleton-placeholder skeleton-short" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="row g-4">
      {KANBAN_COLUMNS.map(({ colKey, label, accent }) => (
        <div key={colKey} className="col-12 col-sm-6 col-xl-3">
          <div className={`card h-100 shadow-sm kanban-column-card border-start border-${accent}`}>
            <div className={`card-header py-2 bg-${accent}-subtle border-0`}>
              <strong className={`small text-${accent}-emphasis`}>
                {label} ({cols[colKey].length})
              </strong>
            </div>
            <div className="card-body py-2">
              {cols[colKey].length === 0 ? (
                <div className="kanban-empty-state">
                  <svg className="kanban-empty-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z" />
                  </svg>
                  <p className="text-muted mb-0">Nothing here yet</p>
                </div>
              ) : (
                <div className="d-flex flex-column gap-2">
                  {cols[colKey].map((t) => (
                    <TicketCard
                      key={t.id}
                      ticket={t}
                      onSelect={onSelectTicket}
                      dataVersion={dataVersion}
                      teamId={teamId}
                      demoMode={demoMode}
                      onMove={onTicketMove}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
