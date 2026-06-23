import { ReactNode } from "react";
import {
  AppBar, Box, Drawer, List, ListItemButton, ListItemText, MenuItem,
  Select, Toolbar, Typography,
} from "@mui/material";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { useProjects } from "../hooks/queries";
import { useProject } from "../context/ProjectContext";

const NAV = [
  { label: "Traces", to: "/traces" },
  { label: "Evals", to: "/evals" },
  { label: "Security", to: "/security" },
];

const DRAWER_WIDTH = 200;

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { project, setProject } = useProject();
  const projects = useProjects();
  return (
    <Box sx={{ display: "flex" }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>AgentProof</Typography>
          <Select
            size="small"
            displayEmpty
            value={project ?? ""}
            onChange={(e) => setProject(e.target.value || undefined)}
            sx={{ minWidth: 180, bgcolor: "background.paper" }}
            inputProps={{ "aria-label": "Project" }}
          >
            <MenuItem value="">All projects</MenuItem>
            {(projects.data ?? []).map((p) => (
              <MenuItem key={p} value={p}>{p}</MenuItem>
            ))}
          </Select>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{ width: DRAWER_WIDTH, [`& .MuiDrawer-paper`]: { width: DRAWER_WIDTH, boxSizing: "border-box" } }}
      >
        <Toolbar />
        <List>
          {NAV.map((item) => (
            <ListItemButton
              key={item.to}
              component={RouterLink}
              to={item.to}
              selected={pathname.startsWith(item.to)}
            >
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
}
