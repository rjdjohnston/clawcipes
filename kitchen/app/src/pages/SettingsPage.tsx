import { useEffect, useState } from "react";
import {
  Card,
  Container,
  Form,
  Spinner,
  Button as BsButton,
  Alert,
} from "react-bootstrap";
import {
  fetchHealth,
  migrateTeam,
  type MigrateResult,
} from "../api";

export function SettingsPage() {
  const [health, setHealth] = useState<{ openclaw: boolean } | null>(null);
  const [migrateTeamId, setMigrateTeamId] = useState("");
  const [migrateMode, setMigrateMode] = useState<"move" | "copy">("move");
  const [migrateDryRun, setMigrateDryRun] = useState(true);
  const [migrateOverwrite, setMigrateOverwrite] = useState(false);
  const [migrateLoading, setMigrateLoading] = useState(false);
  const [migrateResult, setMigrateResult] = useState<MigrateResult | null>(null);
  const [migrateError, setMigrateError] = useState<string | null>(null);

  useEffect(() => {
    fetchHealth()
      .then((h) => setHealth(h))
      .catch(() => setHealth({ ok: false, openclaw: false }));
  }, []);

  const handleMigrate = async () => {
    const tid = migrateTeamId.trim();
    if (!tid || !tid.endsWith("-team")) return;
    setMigrateError(null);
    setMigrateResult(null);
    setMigrateLoading(true);
    try {
      const result = await migrateTeam(tid, {
        dryRun: migrateDryRun,
        mode: migrateMode,
        overwrite: migrateOverwrite,
      });
      setMigrateResult(result);
    } catch (e) {
      setMigrateError(String(e));
    } finally {
      setMigrateLoading(false);
    }
  };

  if (!health) {
    return (
      <Container fluid="lg" className="py-4">
        <div className="text-center py-5 text-muted">
          <Spinner animation="border" size="sm" className="me-2" />
          Checking...
        </div>
      </Container>
    );
  }

  if (!health.openclaw) {
    return (
      <Container fluid="lg" className="py-4">
        <div className="py-5 text-center">
          <Alert variant="info" className="mx-auto" style={{ maxWidth: "32rem" }}>
            <strong>Connect OpenClaw for settings</strong>
            <p className="mb-0 mt-2 text-muted small">
              Settings require OpenClaw to be configured.
            </p>
          </Alert>
        </div>
      </Container>
    );
  }

  return (
    <Container fluid="lg" className="py-4">
      <h2 className="h5 mb-3">Settings</h2>

      <Card className="mb-4">
        <Card.Header>Legacy team migration</Card.Header>
        <Card.Body>
          <p className="text-muted small mb-3">
            Migrate old teams/ + agents/ layout to workspace-&lt;teamId&gt;/ + roles/ layout.
            Use dry run first to preview changes.
          </p>
          {migrateError && (
            <Alert variant="danger" onClose={() => setMigrateError(null)} dismissible>
              {migrateError}
            </Alert>
          )}
          {migrateResult && (
            <Alert variant="success">
              <pre className="mb-0 small">{JSON.stringify(migrateResult, null, 2)}</pre>
            </Alert>
          )}
          <Form.Group className="mb-2">
            <Form.Label>Team ID (must end with -team)</Form.Label>
            <Form.Control
              type="text"
              value={migrateTeamId}
              onChange={(e) => setMigrateTeamId(e.target.value)}
              placeholder="e.g. my-team-team"
              disabled={migrateLoading}
            />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>Mode</Form.Label>
            <Form.Select
              value={migrateMode}
              onChange={(e) => setMigrateMode(e.target.value as "move" | "copy")}
              disabled={migrateLoading}
            >
              <option value="move">Move (default)</option>
              <option value="copy">Copy</option>
            </Form.Select>
          </Form.Group>
          <Form.Check
            type="checkbox"
            id="migrate-dry-run"
            label="Dry run (preview only, no changes)"
            checked={migrateDryRun}
            onChange={(e) => setMigrateDryRun(e.target.checked)}
            disabled={migrateLoading}
            className="mb-2"
          />
          <Form.Check
            type="checkbox"
            id="migrate-overwrite"
            label="Overwrite existing destination"
            checked={migrateOverwrite}
            onChange={(e) => setMigrateOverwrite(e.target.checked)}
            disabled={migrateLoading}
            className="mb-3"
          />
          <BsButton
            variant="primary"
            onClick={handleMigrate}
            disabled={
              migrateLoading ||
              !migrateTeamId.trim() ||
              !migrateTeamId.trim().endsWith("-team")
            }
          >
            {migrateLoading ? "Running…" : migrateDryRun ? "Preview migration" : "Migrate"}
          </BsButton>
        </Card.Body>
      </Card>
    </Container>
  );
}
