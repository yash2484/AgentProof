/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { host: "0.0.0.0", port: 5173 },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    /**
     * The first mount of an @mui/x-data-grid in jsdom measures 3.3–3.5s on
     * this machine, against vitest's 5s default. That 1.5s of headroom
     * disappears when anything else is running and the suite fails on a test
     * whose assertion is fine — a gate that fails under load is not a gate.
     *
     * This buys patience, not leniency: no assertion is weakened, and a test
     * that genuinely hangs still fails, just later.
     */
    testTimeout: 20_000,
  },
});
