/// <reference types="node" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Project Pages are served from https://<org>.github.io/pr-triage/, so the
// built asset URLs must be prefixed with the repo path or they 404.
// Override with `VITE_BASE=/` when deploying to a user/org root or a custom domain.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/pr-triage/",
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
