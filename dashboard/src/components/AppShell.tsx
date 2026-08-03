import { ReactNode } from "react";
import {
  Box, Drawer, List, ListItemButton, ListItemText, MenuItem, Select, Typography,
} from "@mui/material";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { useProjects } from "../hooks/queries";
import { useProject } from "../context/ProjectContext";
import { tokens, SPACE } from "../theme";

const NAV = [
  { label: "Overview", to: "/", exact: true },
  { label: "Traces", to: "/traces", exact: false },
  { label: "Evals", to: "/evals", exact: false },
  { label: "Security", to: "/security", exact: false },
];

const RAIL_WIDTH = 208;

function isCurrent(pathname: string, to: string, exact: boolean): boolean {
  // "/" is a prefix of every path, so the index link needs an exact match.
  return exact ? pathname === to : pathname.startsWith(to);
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { project, setProject } = useProject();
  const projects = useProjects();

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: tokens.bg }}>
      <Drawer
        variant="permanent"
        sx={{
          width: RAIL_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: RAIL_WIDTH,
            boxSizing: "border-box",
            bgcolor: tokens.surface,
            borderRight: `1px solid ${tokens.border}`,
            borderRadius: 0,
            px: `${SPACE.xs}px`,
            py: `${SPACE.md}px`,
            gap: `${SPACE.md}px`,
          },
        }}
      >
        <Typography
          variant="h6"
          sx={{ px: `${SPACE.xs}px`, color: tokens.ink, letterSpacing: "-0.01em" }}
        >
          Agent<Box component="span" sx={{ color: tokens.brand.text }}>Proof</Box>
        </Typography>

        <List sx={{ display: "flex", flexDirection: "column", gap: "2px", py: 0 }}>
          {NAV.map((item) => {
            const current = isCurrent(pathname, item.to, item.exact);
            return (
              <ListItemButton
                key={item.to}
                component={RouterLink}
                to={item.to}
                selected={current}
                aria-current={current ? "page" : undefined}
                sx={{ py: "6px" }}
              >
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{ variant: "body1" }}
                />
              </ListItemButton>
            );
          })}
        </List>

        <Box sx={{ mt: "auto", px: `${SPACE.xs}px` }}>
          <Typography
            variant="caption"
            sx={{ color: tokens.muted, display: "block", mb: "4px" }}
          >
            Project
          </Typography>
          <Select
            size="small"
            displayEmpty
            fullWidth
            value={project ?? ""}
            onChange={(e) => setProject(e.target.value || undefined)}
            inputProps={{ "aria-label": "Project" }}
            sx={{ bgcolor: tokens.bg }}
          >
            <MenuItem value="">All projects</MenuItem>
            {(projects.data ?? []).map((p) => (
              <MenuItem key={p} value={p}>{p}</MenuItem>
            ))}
          </Select>
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{ flexGrow: 1, p: `${SPACE.lg}px`, minWidth: 0, bgcolor: tokens.bg }}
      >
        {children}
      </Box>
    </Box>
  );
}
