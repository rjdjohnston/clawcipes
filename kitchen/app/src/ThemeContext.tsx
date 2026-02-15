import { createContext, useCallback, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "clawrecipes-theme";

export type ThemePreference = "light" | "dark" | "auto";

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    return stored === "light" || stored === "dark" || stored === "auto" ? stored : "auto";
  } catch {
    return "auto";
  }
}

function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(getStoredPreference);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const resolvedTheme = resolveTheme(preference);
    document.documentElement.setAttribute("data-bs-theme", resolvedTheme);
  }, [preference]);

  useEffect(() => {
    if (preference !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      document.documentElement.setAttribute("data-bs-theme", mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [preference]);

  return (
    <ThemeContext.Provider value={{ preference, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
