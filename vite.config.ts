/// <reference types="node" />
import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";

// A strict Content-Security-Policy, injected only into the production HTML.
// Tokens live in localStorage, so the payoff is defense-in-depth: even if an
// XSS were ever introduced, `script-src 'self'` blocks injected/inline script
// and `connect-src` pins network egress to GitHub's API — so a token can't be
// exfiltrated to an attacker's host. `default-src 'none'` denies everything not
// listed below.
//
// It is build-only on purpose: Vite's dev server injects an inline React-refresh
// preamble and talks to an HMR websocket, both of which a CSP this strict would
// block. `frame-ancestors` is omitted because browsers ignore it in a <meta>
// tag (it needs an HTTP header, which GitHub Pages can't set).
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  // React sets inline styles via the CSSOM (not blocked by CSP); 'unsafe-inline'
  // only covers any <style>/style="" the bundler emits. script-src stays strict.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  // The PWA manifest (<link rel="manifest">) is same-origin; without this it
  // falls back to default-src 'none' and the browser blocks it.
  "manifest-src 'self'",
  "connect-src https://api.github.com",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function cspMeta(): Plugin {
  return {
    name: "csp-meta",
    apply: "build",
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: CSP },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

// Project Pages are served from https://<org>.github.io/pr-triage/, so the
// built asset URLs must be prefixed with the repo path or they 404.
// Override with `VITE_BASE=/` when deploying to a user/org root or a custom domain.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/pr-triage/",
  plugins: [react(), cspMeta()],
  // No inline module-preload polyfill, so the production HTML carries zero inline
  // script and `script-src 'self'` needs no hash or nonce.
  build: { modulePreload: { polyfill: false } },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
