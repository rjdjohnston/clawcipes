import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  fetchTeams,
  fetchTickets,
  moveTicket,
  removeTeam,
  DEMO_TEAMS,
  DEMO_TEAM_ID,
  type Team,
  type TicketsResponse,
} from "../api";
import { Button, Container, Modal, Nav } from "react-bootstrap";
import { TeamPicker } from "../components/TeamPicker";
import { KanbanBoard } from "../components/KanbanBoard";
import { TicketDetail } from "../components/TicketDetail";
import { DispatchModal } from "../components/DispatchModal";
import { InboxList } from "../components/InboxList";
import { useDemo } from "../DemoContext";
import type { Ticket } from "../api";

const REFRESH_INTERVAL_MS = 30000;

export function BoardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { demoMode, setDemoMode } = useDemo();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState<string | null>(null);

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [boardTab, setBoardTab] = useState<"board" | "inbox">("board");
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [ticketsData, setTicketsData] = useState<TicketsResponse | null>(null);
  const [ticketsDataVersion, setTicketsDataVersion] = useState(0);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [ticketsRefreshTrigger, setTicketsRefreshTrigger] = useState(0);
  const [ticketMoveError, setTicketMoveError] = useState<string | null>(null);
  const [removeConfirmTeamId, setRemoveConfirmTeamId] = useState<string | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const prevDemoMode = useRef(demoMode);
  const teamFromUrl = searchParams.get("team");

  // When URL has ?team=demo-team, enter demo mode so demo data loads consistently (e.g. after refresh).
  useEffect(() => {
    if (teamFromUrl !== DEMO_TEAM_ID) return;
    if (demoMode) return;
    setDemoMode(true);
    setTeams(DEMO_TEAMS);
    setTeamsLoading(false);
    setTeamsError(null);
  }, [teamFromUrl, demoMode, setDemoMode]);

  useEffect(() => {
    if (!teamFromUrl) return;
    setSelectedTeamId((prev) => (prev !== teamFromUrl ? teamFromUrl : prev));
  }, [teamFromUrl]);

  useEffect(() => {
    if (prevDemoMode.current && !demoMode) {
      setSelectedTeamId(null);
      setSearchParams({}, { replace: true });
      setSelectedTicket(null);
      setTicketsData(null);
      setTicketsLoading(true);
      setRefreshTrigger((n) => n + 1);
    }
    prevDemoMode.current = demoMode;
  }, [demoMode, setSearchParams]);

  useEffect(() => {
    if (demoMode) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchTeams();
        if (!cancelled) setTeams(data);
      } catch (e) {
        if (!cancelled) setTeamsError(String(e));
      } finally {
        if (!cancelled) setTeamsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [demoMode, refreshTrigger]);

  useEffect(() => {
    if (!selectedTeamId) {
      setTicketsData(null);
      setTicketsError(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setTicketsLoading(true);
      setTicketsError(null);
      try {
        const data = await fetchTickets(selectedTeamId);
        if (!cancelled) {
          setTicketsData(data);
          setTicketsDataVersion((v) => v + 1);
        }
      } catch (e) {
        if (!cancelled) {
          setTicketsError(String(e));
          setTicketsData(null);
        }
      } finally {
        if (!cancelled) setTicketsLoading(false);
      }
    };

    load();
    const id = setInterval(load, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [selectedTeamId, demoMode, refreshTrigger, ticketsRefreshTrigger]);

  const handleRefresh = () => {
    if (demoMode) return;
    setRefreshTrigger((n) => n + 1);
  };

  const handleTicketMove = async (
    ticketId: string,
    to: string,
    completed?: boolean
  ) => {
    if (!selectedTeamId || demoMode || selectedTeamId === "demo-team") return;
    setTicketMoveError(null);
    try {
      await moveTicket(selectedTeamId, ticketId, to, completed);
      setTicketsRefreshTrigger((n) => n + 1);
    } catch (e) {
      setTicketMoveError(String(e));
    }
  };

  const handleTicketUpdated = () => {
    if (demoMode) return;
    setTicketsRefreshTrigger((n) => n + 1);
  };

  const handleUseDemo = () => {
    setDemoMode(true);
    setTeams(DEMO_TEAMS);
    setTeamsLoading(false);
    setTeamsError(null);
    setSelectedTeamId(DEMO_TEAM_ID);
    setSearchParams({ team: DEMO_TEAM_ID }, { replace: true });
    setSelectedTicket(null);
    setTicketsData(null);
    setTicketsLoading(true);
    setTicketsError(null);
  };

  const displayTeams = demoMode ? DEMO_TEAMS : teams;

  const handleSelectTeam = (teamId: string | null) => {
    setSelectedTeamId(teamId);
    setSearchParams(teamId ? { team: teamId } : {}, { replace: true });
  };

  const handleRemoveTeam = (teamId: string) => {
    setRemoveConfirmTeamId(teamId);
    setRemoveError(null);
  };

  const handleConfirmRemove = async () => {
    if (!removeConfirmTeamId) return;
    setRemoveLoading(true);
    setRemoveError(null);
    try {
      await removeTeam(removeConfirmTeamId);
      setRemoveConfirmTeamId(null);
      if (selectedTeamId === removeConfirmTeamId) {
        setSelectedTeamId(null);
        setSearchParams({}, { replace: true });
        setSelectedTicket(null);
        setTicketsData(null);
      }
      setRefreshTrigger((n) => n + 1);
    } catch (e) {
      setRemoveError(String(e));
    } finally {
      setRemoveLoading(false);
    }
  };

  return (
    <Container fluid="lg" className="py-4">
      <TeamPicker
        teams={displayTeams}
        selectedTeamId={selectedTeamId}
        onSelect={handleSelectTeam}
        onUseDemo={(teams.length === 0 && !teamsLoading) || teamsError ? handleUseDemo : undefined}
        onRefresh={!demoMode && teams.length > 0 ? handleRefresh : undefined}
        onRemoveTeam={!demoMode ? handleRemoveTeam : undefined}
        loading={teamsLoading}
        error={teamsError}
      />

      <Modal
        show={!!removeConfirmTeamId}
        onHide={() => !removeLoading && setRemoveConfirmTeamId(null)}
      >
        <Modal.Header closeButton>
          <Modal.Title>Delete team</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {removeError && (
            <div className="alert alert-danger" role="alert">{removeError}</div>
          )}
          <p className="mb-0">
            This will delete <strong>workspace-{removeConfirmTeamId}</strong>, remove matching
            agents from OpenClaw config, and remove stamped cron jobs. This cannot be undone.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setRemoveConfirmTeamId(null)} disabled={removeLoading}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirmRemove}
            disabled={removeLoading}
          >
            {removeLoading ? "Deleting…" : "Delete team"}
          </Button>
        </Modal.Footer>
      </Modal>

      {selectedTeamId && (
        <>
          {demoMode && (
            <div className="alert alert-info py-2 mb-2" role="status">
              Actions disabled in demo mode.
            </div>
          )}
          <Nav variant="tabs" className="mb-3">
            <Nav.Item>
              <Nav.Link
                id="board-tab"
                active={boardTab === "board"}
                onClick={() => setBoardTab("board")}
              >
                Board
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link
                id="inbox-tab"
                active={boardTab === "inbox"}
                onClick={() => setBoardTab("inbox")}
              >
                Inbox
              </Nav.Link>
            </Nav.Item>
          </Nav>

          {boardTab === "board" && (
            <div role="tabpanel" id="board-panel" aria-labelledby="board-tab">
              {ticketMoveError && (
                <div className="alert alert-danger alert-dismissible py-2 mb-2" role="alert">
                  {ticketMoveError}
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close"
                    onClick={() => setTicketMoveError(null)}
                  />
                </div>
              )}
              <div className="d-flex justify-content-end mb-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setDispatchModalOpen(true)}
                  disabled={demoMode || selectedTeamId === "demo-team"}
                >
                  New ticket
                </button>
              </div>
              <KanbanBoard
            backlog={ticketsData?.backlog ?? []}
            inProgress={ticketsData?.inProgress ?? []}
            testing={ticketsData?.testing ?? []}
            done={ticketsData?.done ?? []}
            loading={ticketsLoading}
            error={ticketsError}
            onSelectTicket={setSelectedTicket}
            dataVersion={ticketsDataVersion}
            teamId={selectedTeamId}
            demoMode={demoMode}
            onTicketMove={handleTicketMove}
              />

              {selectedTicket && (
            <TicketDetail
              ticket={selectedTicket}
              teamId={selectedTeamId}
              onClose={() => setSelectedTicket(null)}
              demoMode={demoMode}
              onUpdated={handleTicketUpdated}
              />
              )}
              <DispatchModal
            teamId={selectedTeamId}
            show={dispatchModalOpen}
            onClose={() => setDispatchModalOpen(false)}
            onSuccess={handleTicketUpdated}
              disabled={demoMode || selectedTeamId === "demo-team"}
              />
            </div>
          )}

          {boardTab === "inbox" && (
            <div role="tabpanel" id="inbox-panel" aria-labelledby="inbox-tab">
              <InboxList teamId={selectedTeamId} />
            </div>
          )}
        </>
      )}
    </Container>
  );
}
