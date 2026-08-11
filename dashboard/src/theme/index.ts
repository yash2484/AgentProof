import { createTheme } from "@mui/material/styles";
import { palette } from "./palette";
import { typography } from "./typography";
import { components, RADIUS } from "./components";

export { tokens } from "./palette";
export { contrastRatio, relativeLuminance } from "./contrast";
export {
  SPACE,
  TILE_GAP,
  TILE_PADDING,
  ROW_HEIGHT,
  RADIUS,
  DATA_PANEL,
} from "./components";
export {
  TABULAR_NUMS,
  FONT_FAMILY,
  FONT_SERIF,
  FONT_SANS,
  FONT_MONO,
  SIZE,
  PROSE_MEASURE,
  LEDE,
  H3,
  PROSE,
  UI,
  DATA,
  MICRO,
} from "./typography";

export const theme = createTheme({
  palette,
  typography,
  components,
  shape: { borderRadius: RADIUS },
  spacing: 8,
  // No page-load choreography. The product loads into a task, and 180ms is
  // enough for a state change to read as a change rather than a jump.
  transitions: { duration: { shortest: 120, shorter: 150, short: 180, standard: 200 } },
});
