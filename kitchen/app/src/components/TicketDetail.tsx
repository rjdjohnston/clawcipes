import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import { Button, Dropdown, Modal } from "react-bootstrap";

const METADATA_KEYS = ["Created", "Owner", "Status", "Inbox", "Assignment"];

function parseTicketMetadata(content: string): { metadata: Array<{ key: string; value: string }>; body: string } {
  const metadata: Array<{ key: string; value: string }> = [];
  const lines = content.split("\n");
  let i = 0;
  // Skip initial # title line
  if (lines[i]?.startsWith("# ")) i++;
  // Parse key: value lines until we hit ## or end
  while (i < lines.length) {
    const line = lines[i];
    if (!line?.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("## ")) break;
    const match = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (match && METADATA_KEYS.includes(match[1])) {
      metadata.push({ key: match[1], value: match[2].trim() });
      i++;
    } else {
      break;
    }
  }
  const body = lines.slice(i).join("\n");
  return { metadata, body };
}

function TicketContent({ content }: { content: string }) {
  const { metadata, body } = parseTicketMetadata(content);
  return (
    <>
      {metadata.length > 0 && (
        <div className="ticket-detail-metadata mb-3">
          <div className="row row-cols-1 row-cols-sm-2 g-2">
            {metadata.map(({ key, value }) => (
              <div key={key} className="col">
                <span className="text-muted small">{key}:</span>{" "}
                <span className="text-break">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="ticket-detail-markdown">
        <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{body}</ReactMarkdown>
      </div>
    </>
  );
}
import {
  fetchTicketContent,
  moveTicket,
  assignTicket,
  takeTicket,
  handoffTicket,
  completeTicket,
} from "../api";
import type { Ticket } from "../api";
import { OWNERS, STAGES } from "../constants";

type Props = {
  ticket: Ticket;
  teamId: string;
  onClose: () => void;
  demoMode?: boolean;
  onUpdated?: () => void;
};

export function TicketDetail({ ticket, teamId, onClose, demoMode = false, onUpdated }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentRetryTrigger, setContentRetryTrigger] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const disabled = demoMode || teamId === "demo-team";

  const runAction = async (fn: () => Promise<void>) => {
    if (disabled) return;
    setActionError(null);
    setActionLoading(true);
    try {
      await fn();
      onUpdated?.();
      onClose();
    } catch (e) {
      setActionError(String(e));
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);
    fetchTicketContent(teamId, ticket.id)
      .then((data) => {
        if (!cancelled) setContent(data);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [teamId, ticket.id, contentRetryTrigger]);

  return (
    <Modal show onHide={onClose} size="lg" scrollable>
      <Modal.Header closeButton>
        <div>
          <Modal.Title id="ticket-modal-title" as="h2" className="h5 mb-0">
            {ticket.title ?? ticket.id}
          </Modal.Title>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {(ticket.title && ticket.id !== ticket.title) && (
              <span className="text-muted small">{ticket.id}</span>
            )}
            {ticket.owner && <span className="badge bg-secondary">{ticket.owner}</span>}
          </div>
        </div>
      </Modal.Header>
      <Modal.Body>
        {loading && (
          <div className="text-center text-muted py-4">
            <div className="spinner-border me-2" role="status" aria-hidden="true" />
            Loading...
          </div>
        )}
        {error && (
          <div className="alert alert-danger" role="alert">
            <p className="mb-2">{error}</p>
            <Button variant="primary" size="sm" onClick={() => setContentRetryTrigger((n) => n + 1)}>
              Retry
            </Button>
          </div>
        )}
        {content && (
          <TicketContent content={content} />
        )}
        {actionError && <div className="alert alert-danger mt-2" role="alert">{actionError}</div>}
      </Modal.Body>
      {!disabled && (
        <Modal.Footer className="flex-wrap gap-2">
          {ticket.stage === "backlog" && (
            <Dropdown>
              <Dropdown.Toggle variant="primary" size="sm" disabled={actionLoading}>
                Take
              </Dropdown.Toggle>
              <Dropdown.Menu>
                {OWNERS.map((owner) => (
                  <Dropdown.Item
                    key={owner}
                    onClick={() =>
                      runAction(() => takeTicket(teamId, ticket.id, owner))
                    }
                  >
                    Take as {owner}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
          )}
          {ticket.stage === "in-progress" && (
            <Button
              variant="primary"
              size="sm"
              disabled={actionLoading}
              onClick={() => runAction(() => handoffTicket(teamId, ticket.id))}
            >
              Handoff to QA
            </Button>
          )}
          {ticket.stage === "testing" && (
            <Button
              variant="success"
              size="sm"
              disabled={actionLoading}
              onClick={() => runAction(() => completeTicket(teamId, ticket.id))}
            >
              Complete
            </Button>
          )}
          <Dropdown>
            <Dropdown.Toggle variant="outline-secondary" size="sm" disabled={actionLoading}>
              Assign
            </Dropdown.Toggle>
            <Dropdown.Menu>
              {OWNERS.map((owner) => (
                <Dropdown.Item
                  key={owner}
                  onClick={() =>
                    runAction(() => assignTicket(teamId, ticket.id, owner))
                  }
                >
                  Assign to {owner}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
          <Dropdown>
            <Dropdown.Toggle variant="outline-secondary" size="sm" disabled={actionLoading}>
              Move to...
            </Dropdown.Toggle>
            <Dropdown.Menu>
              {STAGES.filter((s) => s.key !== ticket.stage).map(({ key, label }) => (
                <Dropdown.Item
                  key={key}
                  onClick={() =>
                    runAction(() =>
                      moveTicket(teamId, ticket.id, key, key === "done")
                    )
                  }
                >
                  {label}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
        </Modal.Footer>
      )}
    </Modal>
  );
}
