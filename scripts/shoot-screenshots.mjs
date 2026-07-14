// Regenerate the marketing/onboarding screenshots in `public/` from the live
// app's demo mode. See AGENTS.md → "Screenshots" for when to run this.
//
// Usage:
//   npm run dev                       # in one terminal (serves /pr-triage/)
//   npm i -D playwright-core          # once, if not already present
//   node scripts/shoot-screenshots.mjs
//
// Env overrides:
//   PW_BASE_URL        default http://localhost:5173/pr-triage/
//   PW_CHROMIUM_PATH   path to a Chromium binary (else Playwright's default)
//   OUT_DIR            default ./public
//
// The demo board is captured first so the welcome page can load the PNGs it
// embeds (`demo-light.png` / `demo-dark.png`).

import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";

const BASE = process.env.PW_BASE_URL ?? "http://localhost:5173/pr-triage/";
const OUT = process.env.OUT_DIR ?? "public";
const EXE = process.env.PW_CHROMIUM_PATH;
mkdirSync(OUT, { recursive: true });

const launchOpts = EXE && existsSync(EXE) ? { executablePath: EXE } : {};
const browser = await chromium.launch(launchOpts);

async function shoot({ url, theme, width, file, fullPage, selector }) {
  const ctx = await browser.newContext({
    colorScheme: theme,
    viewport: { width, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  if (selector) await page.waitForSelector(selector);
  // Settle layout before capture: fonts loaded, every <img> decoded, scrolled
  // to the top so a full-page capture doesn't stitch oddly.
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((img) =>
        img.complete ? Promise.resolve() : img.decode().catch(() => {}),
      ),
    );
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(600);
  if (selector) {
    await page.locator(selector).screenshot({ path: `${OUT}/${file}` });
  } else {
    await page.screenshot({ path: `${OUT}/${file}`, fullPage: !!fullPage });
  }
  console.log("wrote", `${OUT}/${file}`);
  await ctx.close();
}

// Demo board (clipped to the app column) — the hero image reused everywhere.
await shoot({ url: `${BASE}?demo`, theme: "light", width: 1000, file: "demo-light.png", selector: ".app" });
await shoot({ url: `${BASE}?demo`, theme: "dark", width: 1000, file: "demo-dark.png", selector: ".app" });

// Welcome / no-token page — full page, for the README.
await shoot({ url: BASE, theme: "light", width: 1040, file: "welcome-light.png", fullPage: true });
await shoot({ url: BASE, theme: "dark", width: 1040, file: "welcome-dark.png", fullPage: true });

await browser.close();
console.log("done");
