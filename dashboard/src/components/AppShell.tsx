import { ReactNode, useEffect, useState } from "react";
import {
  Box, Drawer, IconButton, List, ListItemButton, ListItemText, MenuItem,
  Select, Typography, useMediaQuery,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
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

/**
 * Below this the rail's fixed 208px costs more than it gives: at 375px it
 * would leave 119px of content. Matches the Overview grid's own
 * single-column breakpoint, so the rail leaves exactly when the grid folds.
 */
export const RAIL_BREAKPOINT = 768;
const NARROW = `(max-width:${RAIL_BREAKPOINT - 0.05}px)`;

function isCurrent(pathname: string, to: string, exact: boolean): boolean {
  // "/" is a prefix of every path, so the index link needs an exact match.
  return exact ? pathname === to : pathname.startsWith(to);
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { project, setProject } = useProject();
  const projects = useProjects();
  const isNarrow = useMediaQuery(NARROW);
  const [open, setOpen] = useState(false);

  // The permanent branch ignores `open`, so a drawer left open on a narrow
  // viewport would still be open in state when the layout later returns to
  // narrow -- popping the overlay back up with no user interaction. Close it
  // on the way out.
  useEffect(() => {
    if (!isNarrow) setOpen(false);
  }, [isNarrow]);

  const railContent = (
    <>
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
              onClick={() => setOpen(false)}
              sx={{ py: "6px" }}
            >
              <ListItemText primary={item.label} primaryTypographyProps={{ variant: "body1" }} />
            </ListItemButton>
          );
        })}
      </List>

      <Box sx={{ mt: "auto", px: `${SPACE.xs}px` }}>
        <Typography variant="caption" sx={{ color: tokens.muted, display: "block", mb: "4px" }}>
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
    </>
  );

  const paperSx = {
    width: RAIL_WIDTH,
    boxSizing: "border-box" as const,
    bgcolor: tokens.surface,
    borderRight: `1px solid ${tokens.border}`,
    borderRadius: 0,
    px: `${SPACE.xs}px`,
    py: `${SPACE.md}px`,
    gap: `${SPACE.md}px`,
    display: "flex",
    flexDirection: "column" as const,
  };

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: tokens.bg }}>
      {isNarrow ? (
        <Drawer
          variant="temporary"
          open={open}
          onClose={() => setOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ [`& .MuiDrawer-paper`]: paperSx }}
        >
          {railContent}
        </Drawer>
      ) : (
        <Drawer
          variant="permanent"
          component="nav"
          aria-label="Main navigation"
          sx={{ width: RAIL_WIDTH, flexShrink: 0, [`& .MuiDrawer-paper`]: paperSx }}
        >
          {railContent}
        </Drawer>
      )}

      <Box component="main" sx={{ flexGrow: 1, p: `${SPACE.lg}px`, minWidth: 0, bgcolor: tokens.bg }}>
        {isNarrow && (
          <IconButton
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
            sx={{ mb: `${SPACE.sm}px`, color: tokens.ink }}
          >
            <MenuIcon />
          </IconButton>
        )}
        {children}
      </Box>
    </Box>
  );
}
