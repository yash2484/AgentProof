import { ReactElement } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@mui/material";
import { theme } from "../theme";
import { ProjectProvider } from "../context/ProjectContext";

export function renderWithProviders(
  ui: ReactElement,
  opts: { route?: string; project?: string | null } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={theme}>
        {/* `project: null` pins the unscoped state, which is a real state and
            distinct from "whatever the app happens to land on". Omitting it
            gets the app's own landing default. */}
        <ProjectProvider initialProject={opts.project}>
          <MemoryRouter initialEntries={[opts.route ?? "/"]}>{ui}</MemoryRouter>
        </ProjectProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}
