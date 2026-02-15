import { useEffect, useState } from "react";
import { Dropdown } from "react-bootstrap";
import type { Ticket } from "../api";
import { STAGES } from "../constants";

type Props = {
  ticket: Ticket;
  onSelect?: (ticket: Ticket) => void;
  dataVersion?: number;
  teamId?: string;
  demoMode?: boolean;
  onMove?: (ticketId: string, to: string, completed?: boolean) => void;
};

export function TicketCard({ ticket, onSelect, dataVersion = 0, teamId, demoMode, onMove }: Props) {
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (dataVersion === 0) return;
    setFlash(true);
    const id = setTimeout(() => setFlash(false), 500);
    return () => clearTimeout(id);
  }, [dataVersion]);

  const canMove = teamId && !demoMode && onMove;
  const otherStages = STAGES.filter((s) => s.key !== ticket.stage);

  return (
    <div
      className={`border rounded p-2 position-relative ticket-card-wrapper ${onSelect ? "ticket-card-clickable" : ""} ${flash ? "ticket-card-flash" : ""}`}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect ? () => onSelect(ticket) : undefined}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === "Enter") onSelect(ticket);
              if (e.key === " ") {
                e.preventDefault();
                onSelect(ticket);
              }
            }
          : undefined
      }
    >
      <div className="d-flex align-items-start justify-content-between gap-1">
        <div className="flex-grow-1 min-w-0">
          <div className="fw-medium ticket-card-title" title={ticket.title ?? ticket.id}>
            {ticket.title ?? ticket.id}
          </div>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {ticket.title && ticket.id !== ticket.title && (
              <small className="text-muted">{ticket.id}</small>
            )}
            {ticket.owner && (
              <span className="badge bg-secondary text-nowrap">{ticket.owner}</span>
            )}
          </div>
        </div>
        {canMove && otherStages.length > 0 && (
          <Dropdown align="end" onClick={(e) => e.stopPropagation()}>
            <Dropdown.Toggle
              variant="link"
              size="sm"
              className="p-0 text-muted ticket-card-menu-btn"
              title="Move ticket"
            >
              &#8942;
            </Dropdown.Toggle>
            <Dropdown.Menu>
              {otherStages.map(({ key, label }) => (
                <Dropdown.Item
                  key={key}
                  onClick={() =>
                    onMove(ticket.id, key, key === "done")
                  }
                >
                  Move to {label}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
        )}
      </div>
    </div>
  );
}
