import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { DemoProvider } from "./DemoContext";
import { Layout } from "./components/Layout";
import { BoardPage } from "./pages/BoardPage";
import { RecipesPage } from "./pages/RecipesPage";
import { BindingsPage } from "./pages/BindingsPage";
import { SettingsPage } from "./pages/SettingsPage";

export default function App() {
  return (
    <DemoProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/board" replace />} />
            <Route path="board" element={<BoardPage />} />
            <Route path="recipes" element={<RecipesPage />} />
            <Route path="bindings" element={<BindingsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/board" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </DemoProvider>
  );
}
