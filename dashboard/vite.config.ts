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
     * A DataGrid mount in jsdom costs ~1.2s warm and ~3.5s cold, against
     * vitest's 5s default. That headroom disappeared under load and failed
     * tests whose assertions were fine — a gate that fails under load is not
     * a gate. This buys patience, not leniency: nothing is weakened, and a
     * test that genuinely hangs still fails.
     */
    testTimeout: 20_000,
    /**
     * Vitest defaults to one worker per core. On 12 cores that oversubscribes
     * the box while Docker is up, and the same DataGrid test that takes 1.2s
     * alone took 26s in the full run — a scheduling artefact reported as a
     * test failure. Six keeps the suite parallel and the timings honest.
     */
    poolOptions: { threads: { maxThreads: 6, minThreads: 1 } },
  },
});
