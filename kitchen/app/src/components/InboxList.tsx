import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import { Button, ListGroup, Modal, Spinner } from "react-bootstrap";
import { fetchInbox, fetchInboxContent, type InboxItem } from "../api";

type Props = {
  teamId: string;
};

export function InboxList({ teamId }: Props) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [selectedItem, setSelectedItem] = useState<InboxItem | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [contentRetryTrigger, setContentRetryTrigger] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchInbox(teamId)
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [teamId, retryTrigger]);

  useEffect(() => {
    if (!selectedItem) {
      setContent(null);
      setContentError(null);
      return;
    }
    let cancelled = false;
    setContentLoading(true);
    setContent(null);
    setContentError(null);
    fetchInboxContent(teamId, selectedItem.id)
      .then((data) => {
        if (!cancelled) setContent(data);
      })
      .catch((e) => {
        if (!cancelled) setContentError(String(e));
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false);
      });
    return () => { cancelled = true; };
  }, [teamId, selectedItem?.id, contentRetryTrigger]);

  if (loading) {
    return (
      <div className="text-center py-4 text-muted">
        <Spinner animation="border" size="sm" className="me-2" />
        Loading inbox...
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-danger" role="alert">
        <p className="mb-2">{error}</p>
        <Button variant="primary" size="sm" onClick={() => setRetryTrigger((n) => n + 1)}>
          Retry
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-4 text-muted">
        <p className="mb-0">No inbox items yet</p>
      </div>
    );
  }

  return (
    <>
      <ListGroup>
        {items.map((item) => (
          <ListGroup.Item
            key={item.id}
            action
            active={selectedItem?.id === item.id}
            onClick={() => setSelectedItem(item)}
            className="d-flex justify-content-between align-items-start"
          >
            <div>
              <div className="fw-medium">{item.title ?? item.id}</div>
              {item.received && (
                <small className="text-muted">{item.received}</small>
              )}
            </div>
          </ListGroup.Item>
        ))}
      </ListGroup>

      <Modal
        show={!!selectedItem}
        onHide={() => setSelectedItem(null)}
        size="lg"
        scrollable
      >
        {selectedItem && (
          <>
            <Modal.Header closeButton>
              <Modal.Title>{selectedItem.title ?? selectedItem.id}</Modal.Title>
              {selectedItem.received && (
                <span className="text-muted small ms-2">{selectedItem.received}</span>
              )}
            </Modal.Header>
            <Modal.Body>
              {contentLoading && (
                <div className="text-center py-4 text-muted">
                  <Spinner animation="border" size="sm" className="me-2" />
                  Loading...
                </div>
              )}
              {contentError && !contentLoading && (
                <div className="alert alert-danger" role="alert">
                  <p className="mb-2">{contentError}</p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setContentRetryTrigger((n) => n + 1)}
                  >
                    Retry
                  </Button>
                </div>
              )}
              {content && !contentLoading && !contentError && (
                <div className="inbox-detail-markdown">
                  <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                    {content}
                  </ReactMarkdown>
                </div>
              )}
            </Modal.Body>
          </>
        )}
      </Modal>
    </>
  );
}
