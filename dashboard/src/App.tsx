import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { TracesPage } from "./pages/TracesPage";
import { TraceDetailPage } from "./pages/TraceDetailPage";
import { EvalsPage } from "./pages/EvalsPage";
import { SecurityPage } from "./pages/SecurityPage";

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/traces" replace />} />
        <Route path="/traces" element={<TracesPage />} />
        <Route path="/traces/:traceId" element={<TraceDetailPage />} />
        <Route path="/evals" element={<EvalsPage />} />
        <Route path="/security" element={<SecurityPage />} />
      </Routes>
    </AppShell>
  );
}
