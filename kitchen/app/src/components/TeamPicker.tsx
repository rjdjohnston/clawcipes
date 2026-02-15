import { Button, Form, InputGroup, Spinner } from "react-bootstrap";
import type { Team } from "../api";

type Props = {
  teams: Team[];
  selectedTeamId: string | null;
  onSelect: (teamId: string | null) => void;
  onUseDemo?: () => void;
  onRefresh?: () => void;
  onRemoveTeam?: (teamId: string) => void;
  loading: boolean;
  error: string | null;
};

export function TeamPicker({ teams, selectedTeamId, onSelect, onUseDemo, onRefresh, onRemoveTeam, loading, error }: Props) {
  if (error) {
    return (
      <div className="alert alert-danger mb-4" role="alert">
        <p className="mb-3">{error}</p>
        {onUseDemo && (
          <Button variant="primary" onClick={onUseDemo}>
            Use demo data instead
          </Button>
        )}
      </div>
    );
  }

  if (!loading && teams.length === 0) {
    return (
      <div className="card mb-4 teams-empty-card">
        <div className="card-body text-center">
          <svg className="teams-empty-icon mb-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
          <h5 className="card-title">No teams found</h5>
          <p className="card-text text-muted small mb-4">
            Connect OpenClaw and scaffold a team, or try the demo to explore the UI.
          </p>
          <Button variant="primary" onClick={onUseDemo}>
            Use demo data
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <Form.Group>
        <Form.Label htmlFor="team-select" className="fw-medium">
          Team
        </Form.Label>
        <InputGroup>
          <Form.Select
            id="team-select"
            className="team-select"
            value={selectedTeamId ?? ""}
            onChange={(e) => onSelect(e.target.value || null)}
            disabled={loading}
          >
            <option value="">Select a team...</option>
            {selectedTeamId &&
              !teams.some((t) => t.teamId === selectedTeamId) && (
                <option value={selectedTeamId}>{selectedTeamId}</option>
              )}
            {teams.map((t) => (
              <option key={t.teamId} value={t.teamId}>
                {t.recipeName || t.teamId} ({t.teamId})
              </option>
            ))}
          </Form.Select>
          {onRefresh && (
            <Button
              variant="outline-secondary"
              onClick={onRefresh}
              disabled={loading}
              aria-label="Refresh teams"
            >
              {loading ? (
                <>
                  <Spinner animation="border" size="sm" className="me-1" aria-hidden />
                  Refresh
                </>
              ) : (
                "Refresh"
              )}
            </Button>
          )}
          {onRemoveTeam &&
            selectedTeamId &&
            selectedTeamId !== "demo-team" &&
            teams.some((t) => t.teamId === selectedTeamId) && (
              <Button
                variant="outline-danger"
                onClick={() => onRemoveTeam(selectedTeamId)}
                disabled={loading}
                aria-label="Delete team"
              >
                Delete
              </Button>
            )}
        </InputGroup>
      </Form.Group>
    </div>
  );
}
