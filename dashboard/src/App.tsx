import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { OverviewPage } from "./pages/OverviewPage";
import { TracesPage } from "./pages/TracesPage";
import { TraceDetailPage } from "./pages/TraceDetailPage";
import { EvalsPage } from "./pages/EvalsPage";
import { MetricDetailPage } from "./pages/MetricDetailPage";
import { SecurityPage } from "./pages/SecurityPage";

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/traces" element={<TracesPage />} />
        <Route path="/traces/:traceId" element={<TraceDetailPage />} />
        <Route path="/evals" element={<EvalsPage />} />
        <Route path="/evals/:metric" element={<MetricDetailPage />} />
        <Route path="/security" element={<SecurityPage />} />
      </Routes>
    </AppShell>
  );
}
