import { useState } from "react";
import { Button, Form, Modal } from "react-bootstrap";
import { dispatchTicket } from "../api";
import { OWNERS } from "../constants";

type Props = {
  teamId: string;
  show: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  disabled?: boolean;
};

export function DispatchModal({
  teamId,
  show,
  onClose,
  onSuccess,
  disabled = false,
}: Props) {
  const [request, setRequest] = useState("");
  const [owner, setOwner] = useState<(typeof OWNERS)[number]>("dev");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled || !request.trim()) return;
    setError(null);
    setLoading(true);
    try {
      await dispatchTicket(teamId, request.trim(), owner);
      setRequest("");
      setOwner("dev");
      onSuccess?.();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setRequest("");
      setError(null);
      onClose();
    }
  };

  return (
    <Modal show={show} onHide={handleClose}>
      <Modal.Header closeButton>
        <Modal.Title>New ticket</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
          <Form.Group className="mb-3">
            <Form.Label>Request</Form.Label>
            <Form.Control
              as="textarea"
              rows={4}
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="Describe the work to be done..."
              disabled={disabled}
            />
          </Form.Group>
          <Form.Group>
            <Form.Label>Owner</Form.Label>
            <Form.Select
              value={owner}
              onChange={(e) => setOwner(e.target.value as typeof owner)}
              disabled={disabled}
            >
              {OWNERS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={disabled || loading || !request.trim()}
          >
            {loading ? "Creating…" : "Create ticket"}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
