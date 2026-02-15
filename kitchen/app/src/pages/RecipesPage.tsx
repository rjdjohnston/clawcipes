import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import {
  Card,
  Container,
  Form,
  Modal,
  Spinner,
  Button as BsButton,
} from "react-bootstrap";
import {
  fetchRecipes,
  fetchRecipe,
  fetchRecipeStatus,
  fetchHealth,
  scaffoldRecipeTeam,
  type Recipe,
  type RecipeStatus,
} from "../api";

function RecipeContent({ md }: { md: string }) {
  const hasFrontmatter = md.startsWith("---\n");
  let frontmatter = "";
  let body = md;
  if (hasFrontmatter) {
    const end = md.indexOf("\n---", 4);
    if (end > 0) {
      frontmatter = md.slice(4, end);
      body = md.slice(end + 4).trimStart();
    }
  }
  return (
    <>
      {body && (
        <div className="recipe-detail-markdown mb-3">
          <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{body}</ReactMarkdown>
        </div>
      )}
      {frontmatter && (
        <pre className="recipe-frontmatter p-3 rounded overflow-auto">
          {frontmatter}
        </pre>
      )}
    </>
  );
}

export function RecipesPage() {
  const navigate = useNavigate();
  const [health, setHealth] = useState<{ openclaw: boolean } | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthRetryTrigger, setHealthRetryTrigger] = useState(0);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [recipeMd, setRecipeMd] = useState<string | null>(null);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [recipeError, setRecipeError] = useState<string | null>(null);
  const [recipeRetryTrigger, setRecipeRetryTrigger] = useState(0);
  const [scaffoldModalRecipe, setScaffoldModalRecipe] = useState<Recipe | null>(null);
  const [scaffoldTeamId, setScaffoldTeamId] = useState("");
  const [scaffoldOverwrite, setScaffoldOverwrite] = useState(false);
  const [scaffoldLoading, setScaffoldLoading] = useState(false);
  const [scaffoldError, setScaffoldError] = useState<string | null>(null);
  const [recipeStatusMap, setRecipeStatusMap] = useState<Record<string, RecipeStatus>>({});

  useEffect(() => {
    let cancelled = false;
    setHealth(null);
    setHealthError(null);
    fetchHealth()
      .then((h) => {
        if (!cancelled) {
          setHealth(h);
          setHealthError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setHealthError(String(e));
          setHealth({ openclaw: false });
        }
      });
    return () => { cancelled = true; };
  }, [healthRetryTrigger]);

  useEffect(() => {
    if (!health?.openclaw) {
      setLoading(false);
      setRecipes([]);
      setRecipeStatusMap({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchRecipes(), fetchRecipeStatus()])
      .then(([recipesData, statusList]) => {
        if (!cancelled) {
          setRecipes(recipesData);
          const map: Record<string, RecipeStatus> = {};
          for (const s of statusList) {
            map[s.id] = s;
          }
          setRecipeStatusMap(map);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [health?.openclaw]);

  useEffect(() => {
    if (!selectedRecipe) {
      setRecipeMd(null);
      setRecipeError(null);
      return;
    }
    let cancelled = false;
    setRecipeLoading(true);
    setRecipeMd(null);
    setRecipeError(null);
    fetchRecipe(selectedRecipe.id)
      .then(({ md }) => {
        if (!cancelled) setRecipeMd(md);
      })
      .catch((e) => {
        if (!cancelled) setRecipeError(String(e));
      })
      .finally(() => {
        if (!cancelled) setRecipeLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedRecipe?.id, recipeRetryTrigger]);

  const handleScaffold = async () => {
    if (!scaffoldModalRecipe || !scaffoldTeamId.trim()) return;
    if (!scaffoldTeamId.trim().endsWith("-team")) {
      setScaffoldError("teamId must end with -team");
      return;
    }
    setScaffoldError(null);
    setScaffoldLoading(true);
    try {
      await scaffoldRecipeTeam(scaffoldModalRecipe.id, scaffoldTeamId.trim(), scaffoldOverwrite);
      setScaffoldModalRecipe(null);
      setScaffoldTeamId("");
      setScaffoldOverwrite(false);
      navigate(`/board?team=${encodeURIComponent(scaffoldTeamId.trim())}`);
    } catch (e) {
      setScaffoldError(String(e));
    } finally {
      setScaffoldLoading(false);
    }
  };

  const teamRecipes = recipes.filter((r) => r.kind === "team" || !r.kind);
  const agentRecipes = recipes.filter((r) => r.kind === "agent");
  const otherRecipes = recipes.filter(
    (r) => r.kind !== "team" && r.kind !== "agent" && r.kind
  );

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
    const isConnectionError =
      healthError && !/openclaw|unavailable/i.test(healthError);
    return (
      <Container fluid="lg" className="py-4">
        <div className="py-5 text-center">
          <div className="alert alert-info mx-auto" style={{ maxWidth: "32rem" }}>
            {isConnectionError ? (
              <>
                <strong>Unable to connect to Kitchen server</strong>
                <p className="mb-0 mt-2 text-muted small">
                  {healthError}
                </p>
              </>
            ) : (
              <>
                <strong>Connect OpenClaw to browse recipes</strong>
                <p className="mb-0 mt-2 text-muted small">
                  Recipes require OpenClaw to be configured (agents.defaults.workspace).
                </p>
              </>
            )}
            <BsButton
              variant="primary"
              size="sm"
              className="mt-3"
              onClick={() => setHealthRetryTrigger((n) => n + 1)}
            >
              Check again
            </BsButton>
          </div>
        </div>
      </Container>
    );
  }

  if (loading) {
    return (
      <Container fluid="lg" className="py-4">
        <div className="text-center py-5 text-muted">
          <Spinner animation="border" size="sm" className="me-2" />
          Loading recipes...
        </div>
      </Container>
    );
  }

  if (error) {
    return (
      <Container fluid="lg" className="py-4">
        <div className="alert alert-danger" role="alert">{error}</div>
      </Container>
    );
  }

  return (
    <Container fluid="lg" className="py-4">
      <h2 className="h5 mb-3">Recipes</h2>
      {recipes.length === 0 ? (
        <p className="text-muted">No recipes found.</p>
      ) : (
        <div className="row g-3">
          {teamRecipes.length > 0 && (
            <div className="col-12">
              <h3 className="h6 text-muted mb-2">Team recipes</h3>
              <div className="row g-2">
                {teamRecipes.map((r) => {
                  const status = recipeStatusMap[r.id];
                  const missingSkills = status?.missingSkills ?? [];
                  return (
                  <div key={r.id} className="col-12 col-md-6 col-lg-4">
                    <Card
                      className="h-100 recipe-card"
                      style={{ cursor: "pointer" }}
                      onClick={() => setSelectedRecipe(r)}
                    >
                      <Card.Body className="py-2">
                        <div className="d-flex align-items-center gap-2">
                          <span className="fw-medium">{r.name ?? r.id}</span>
                          {missingSkills.length > 0 && (
                            <span
                              className="badge bg-warning text-dark"
                              title={`Missing skills: ${missingSkills.join(", ")}`}
                            >
                              {missingSkills.length} missing
                            </span>
                          )}
                        </div>
                        <small className="text-muted">{r.id} · {r.source}</small>
                        <div className="mt-2">
                          <BsButton
                            variant="outline-primary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setScaffoldModalRecipe(r);
                              setScaffoldTeamId("");
                              setScaffoldError(null);
                            }}
                          >
                            Scaffold team
                          </BsButton>
                        </div>
                      </Card.Body>
                    </Card>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
          {agentRecipes.length > 0 && (
            <div className="col-12">
              <h3 className="h6 text-muted mb-2 mt-3">Agent recipes</h3>
              <div className="row g-2">
                {agentRecipes.map((r) => (
                  <div key={r.id} className="col-12 col-md-6 col-lg-4">
                    <Card
                      className="h-100 recipe-card"
                      style={{ cursor: "pointer" }}
                      onClick={() => setSelectedRecipe(r)}
                    >
                      <Card.Body className="py-2">
                        <div className="fw-medium">{r.name ?? r.id}</div>
                        <small className="text-muted">{r.id} · {r.source}</small>
                      </Card.Body>
                    </Card>
                  </div>
                ))}
              </div>
            </div>
          )}
          {otherRecipes.length > 0 && (
            <div className="col-12">
              <h3 className="h6 text-muted mb-2 mt-3">Other recipes</h3>
              <div className="row g-2">
                {otherRecipes.map((r) => (
                  <div key={r.id} className="col-12 col-md-6 col-lg-4">
                    <Card
                      className="h-100 recipe-card"
                      style={{ cursor: "pointer" }}
                      onClick={() => setSelectedRecipe(r)}
                    >
                      <Card.Body className="py-2">
                        <div className="fw-medium">{r.name ?? r.id}</div>
                        <small className="text-muted">{r.id} · {r.source}</small>
                      </Card.Body>
                    </Card>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Modal
        show={!!selectedRecipe}
        onHide={() => setSelectedRecipe(null)}
        size="lg"
        scrollable
      >
        {selectedRecipe && (
          <>
            <Modal.Header closeButton>
              <Modal.Title>{selectedRecipe.name ?? selectedRecipe.id}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {recipeLoading && (
                <div className="text-center py-4 text-muted">
                  <Spinner animation="border" size="sm" className="me-2" />
                  Loading...
                </div>
              )}
              {recipeError && !recipeLoading && (
                <div className="alert alert-danger" role="alert">
                  <p className="mb-2">{recipeError}</p>
                  <BsButton
                    variant="primary"
                    size="sm"
                    onClick={() => setRecipeRetryTrigger((n) => n + 1)}
                  >
                    Retry
                  </BsButton>
                </div>
              )}
              {recipeStatusMap[selectedRecipe.id]?.missingSkills?.length > 0 && (
                <div className="alert alert-warning py-2 mb-3" role="alert">
                  <strong>Missing skills:</strong>{" "}
                  {recipeStatusMap[selectedRecipe.id].missingSkills.join(", ")}
                  {recipeStatusMap[selectedRecipe.id].installCommands.length > 0 && (
                    <pre className="mt-2 mb-0 small bg-dark text-light p-2 rounded">
                      {recipeStatusMap[selectedRecipe.id].installCommands.join("\n")}
                    </pre>
                  )}
                </div>
              )}
              {recipeMd && !recipeLoading && !recipeError && (
                <RecipeContent md={recipeMd} />
              )}
              {(selectedRecipe.kind === "team" || !selectedRecipe.kind) && recipeMd && !recipeError && (
                <div className="mt-3">
                  <BsButton
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setScaffoldModalRecipe(selectedRecipe);
                      setScaffoldTeamId("");
                      setScaffoldError(null);
                    }}
                  >
                    Scaffold team
                  </BsButton>
                </div>
              )}
            </Modal.Body>
          </>
        )}
      </Modal>

      <Modal
        show={!!scaffoldModalRecipe}
        onHide={() => !scaffoldLoading && setScaffoldModalRecipe(null)}
      >
        {scaffoldModalRecipe && (
          <>
            <Modal.Header closeButton>
              <Modal.Title>Scaffold team</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <p className="text-muted small">
                Scaffold <strong>{scaffoldModalRecipe.name ?? scaffoldModalRecipe.id}</strong> as
                a team workspace.
              </p>
              {scaffoldError && <div className="alert alert-danger" role="alert">{scaffoldError}</div>}
              <Form.Group className="mb-2">
                <Form.Label>Team ID (must end with -team)</Form.Label>
                <Form.Control
                  type="text"
                  value={scaffoldTeamId}
                  onChange={(e) => setScaffoldTeamId(e.target.value)}
                  placeholder="e.g. my-team-team"
                  disabled={scaffoldLoading}
                />
              </Form.Group>
              <Form.Check
                type="checkbox"
                label="Overwrite existing files"
                checked={scaffoldOverwrite}
                onChange={(e) => setScaffoldOverwrite(e.target.checked)}
                disabled={scaffoldLoading}
              />
            </Modal.Body>
            <Modal.Footer>
              <BsButton variant="secondary" onClick={() => setScaffoldModalRecipe(null)} disabled={scaffoldLoading}>
                Cancel
              </BsButton>
              <BsButton
                variant="primary"
                onClick={handleScaffold}
                disabled={
                  scaffoldLoading ||
                  !scaffoldTeamId.trim() ||
                  !scaffoldTeamId.trim().endsWith("-team")
                }
              >
                {scaffoldLoading ? "Scaffolding…" : "Scaffold"}
              </BsButton>
            </Modal.Footer>
          </>
        )}
      </Modal>
    </Container>
  );
}
