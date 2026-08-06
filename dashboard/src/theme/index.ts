import { createTheme } from "@mui/material/styles";
import { palette } from "./palette";
import { typography } from "./typography";
import { components } from "./components";

export { tokens } from "./palette";
export { contrastRatio, relativeLuminance } from "./contrast";
export { SPACE, TILE_GAP, TILE_PADDING, ROW_HEIGHT, RADIUS } from "./components";
export { TABULAR_NUMS, FONT_FAMILY } from "./typography";

export const theme = createTheme({
  palette,
  typography,
  components,
  shape: { borderRadius: 10 },
  spacing: 8,
});
