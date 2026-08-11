import { ReactNode, useEffect, useState } from "react";
import {
  Box, Drawer, IconButton, List, ListItemButton, ListItemText, MenuItem,
  Select, Typography, useMediaQuery,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { useProjectSummaries } from "../hooks/queries";
import { useProject } from "../context/ProjectContext";
import { isSyntheticProject } from "../lib/analytics";
import { SyntheticBadge } from "./SeverityChip";
import { ColumnHead } from "./Ledger";
import { tokens, SPACE, DATA, UI } from "../theme";

const NAV = [
  { label: "Overview", to: "/", exact: true },
  { label: "Traces", to: "/traces", exact: false },
  { label: "Evals", to: "/evals", exact: false },
  { label: "Security", to: "/security", exact: false },
];

/**
 * 178px. The old 208px held four links and a select, and the extra 30px was
 * empty on every screen — width the data surfaces to its right can use.
 */
const RAIL_WIDTH = 178;

/** The page width of the document, before padding. */
const MAX_CONTENT = 1180;

/**
 * Below this the rail's fixed width costs more than it gives: at 375px it
 * would leave under 200px of content. Matches the Overview grid's own
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
  const projects = useProjectSummaries();
  const isNarrow = useMediaQuery(NARROW);

  const summaries = projects.data ?? [];
  /**
   * The scope the count describes. With no project selected the rail is
   * showing every project, so the honest figure is their sum rather than a
   * blank — "all projects" still has a denominator.
   */
  const current = summaries.length
    ? (summaries.find((p) => p.name === project) ?? {
        name: "all",
        traces: summaries.reduce((sum, p) => sum + p.traces, 0),
      })
    : undefined;

  // The app lands on a named project (see DEFAULT_PROJECT), which a fresh
  // install will not have. MUI renders a Select whose value is absent from its
  // options as *blank*, so without this the rail would claim no scope while
  // every query on the page returned nothing for a project that does not
  // exist. Falling back to "all" is the honest state, and it self-heals rather
  // than requiring the reader to notice.
  const known = projects.data;
  useEffect(() => {
    if (project !== undefined && known && !known.some((p) => p.name === project)) {
      setProject(undefined);
    }
  }, [project, known, setProject]);
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
      {/* The wordmark is the product's own name, so it is written: serif,
        * one weight, no colour. The old two-tone "AgentProof" spent the
        * brand accent on a word nobody clicks. */}
      <Typography
        variant="h5"
        component="div"
        sx={{ px: `${SPACE.xs}px`, color: tokens.ink }}
      >
        AgentProof
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
              sx={{ py: "5px", px: `${SPACE.xs}px` }}
            >
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{ sx: { ...UI, fontWeight: current ? 600 : 400 } }}
              />
            </ListItemButton>
          );
        })}
      </List>

      <Box sx={{ mt: "auto", px: `${SPACE.xs}px` }}>
        <ColumnHead sx={{ display: "block", mb: "5px" }}>Project</ColumnHead>
        <Select
          size="small"
          displayEmpty
          fullWidth
          value={project ?? ""}
          onChange={(e) => setProject(e.target.value || undefined)}
          inputProps={{ "aria-label": "Project" }}
          sx={{
            ...DATA,
            bgcolor: tokens.card,
            "& .MuiOutlinedInput-notchedOutline": { borderColor: tokens.hair },
            "& .MuiSelect-select": { py: "6px" },
          }}
        >
          <MenuItem value="" sx={{ ...DATA }}>
            all projects
          </MenuItem>
          {summaries.map((p) => (
            <MenuItem key={p.name} value={p.name} sx={{ ...DATA, gap: 1 }}>
              {p.name}
              {/* Marked at the point of selection, not only after: the choice
                * between a recording and a fabrication is made here. */}
              {isSyntheticProject(p.name) && <SyntheticBadge compact />}
            </MenuItem>
          ))}
        </Select>

        {/* The count is the scope of everything the rail links to. It comes
          * from the same request that fills the switcher, so naming it here
          * costs nothing and stops "Traces" being an unqualified promise. */}
        <Box sx={{ ...DATA, color: tokens.dim, mt: "6px" }}>
          {current ? `${current.traces.toLocaleString()} traces` : " "}
        </Box>
      </Box>
    </>
  );

  const paperSx = {
    width: RAIL_WIDTH,
    boxSizing: "border-box" as const,
    // The rail is the coolest, darkest ground in the theme: it is furniture,
    // and everything to its right is the document.
    bgcolor: tokens.rail,
    borderRight: `1px solid ${tokens.hair}`,
    borderRadius: 0,
    px: `${SPACE.xs}px`,
    py: `${SPACE.md}px`,
    gap: `${SPACE.md}px`,
    display: "flex",
    flexDirection: "column" as const,
  };

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: tokens.paper }}>
      {isNarrow ? (
        <Drawer
          variant="temporary"
          open={open}
          onClose={() => setOpen(false)}
          ModalProps={{ keepMounted: true }}
          slotProps={{
            paper: {
              component: "nav",
              "aria-label": "Main navigation",
              sx: paperSx,
            },
          }}
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

      {/* A document has a page width. Without this the panels stretch to
        * whatever the monitor is, and a 62ch paragraph inside a 1700px panel
        * reads as a narrow ragged column floating in empty tint — the prose
        * looks broken even though its own measure is correct. 1180px keeps
        * the seven-column trace grid comfortable and still leaves real
        * margins above 1440. */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          bgcolor: tokens.paper,
          px: `${SPACE.lg}px`,
          pt: `${SPACE.md}px`,
          pb: `${SPACE.lg}px`,
          maxWidth: MAX_CONTENT + SPACE.lg * 2,
          mx: "auto",
          width: "100%",
        }}
      >
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
