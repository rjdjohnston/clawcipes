import { useEffect } from "react";
import { Nav, Navbar, Container } from "react-bootstrap";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle";
import { useDemo } from "../DemoContext";

export function Layout() {
  const { demoMode, setDemoMode } = useDemo();
  const location = useLocation();

  useEffect(() => {
    const base = "ClawRecipes Kitchen";
    if (location.pathname === "/board") document.title = `Board – ${base}`;
    else if (location.pathname === "/recipes") document.title = `Recipes – ${base}`;
    else if (location.pathname === "/bindings") document.title = `Bindings – ${base}`;
    else document.title = base;
  }, [location.pathname]);

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <Navbar expand="md" className="border-bottom bg-body-tertiary">
        <Container fluid="lg">
          <Navbar.Brand className="fw-semibold">ClawRecipes Kitchen</Navbar.Brand>
          <Navbar.Toggle aria-controls="kitchen-navbar" />
          <Navbar.Collapse id="kitchen-navbar">
            <Nav className="me-auto">
              <Nav.Link as={NavLink} to="/board" end>
                Board
              </Nav.Link>
              <Nav.Link as={NavLink} to="/recipes">
                Recipes
              </Nav.Link>
              <Nav.Link as={NavLink} to="/bindings">
                Bindings
              </Nav.Link>
            </Nav>
            <div className="d-flex align-items-center gap-2">
              {demoMode && (
                <>
                  <span className="badge bg-success">demo</span>
                  <button
                    type="button"
                    onClick={() => setDemoMode(false)}
                    className="btn btn-outline-secondary btn-sm"
                  >
                    Exit demo
                  </button>
                </>
              )}
              <ThemeToggle />
            </div>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <main id="main">
        <Outlet />
      </main>
    </>
  );
}
