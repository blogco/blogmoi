import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/chi-phi-hang-thang/index.njk", import.meta.url), "utf8");
const css = readFileSync(new URL("../static/css/expense-tracker.css", import.meta.url), "utf8");
const script = readFileSync(new URL("../static/js/expense-tracker.js", import.meta.url), "utf8");

test("report contains the icon playground, health insights, ranking, and PDF action", () => {
  assert.match(page, /id="print-report"[^>]*>In \/ Xuất PDF/u);
  assert.match(page, /id="food-bubbles"/u);
  assert.match(page, /id="bubble-ranking-rows"/u);
  assert.match(page, /id="health-insight-list"/u);
  assert.match(page, /data-icon-sprite=.*food-drink\.svg/u);
  assert.ok(page.indexOf("id=\"food-bubbles\"") < page.indexOf("id=\"health-insight-list\""));
});

test("bubble layout caps each circle to its grid cell and respects reduced motion", () => {
  assert.match(css, /\.bubble-chart\s*\{[^}]*display:\s*grid/su);
  assert.match(css, /\.food-bubble\s*\{[^}]*width:\s*min\(var\(--bubble-size\),\s*100%\)[^}]*aspect-ratio:\s*1/su);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.food-bubble\s*\{\s*transition:\s*none/su);
});

test("print stylesheet scopes output to section 02 and keeps charts and report rows printable", () => {
  assert.match(css, /@page\s*\{\s*size:\s*A4 portrait;\s*margin:/u);
  assert.match(css, /@media print\s*\{[\s\S]*?body > \*\s*\{\s*display:\s*none !important;\s*\}[\s\S]*?#main-content > #expense-app[\s\S]*?#expense-app > #expense-dashboard\s*\{\s*display:\s*block !important/su);
  assert.match(css, /\.line-chart\s*\{[^}]*width:\s*100% !important/su);
  assert.match(css, /\.expense-app tr\s*\{\s*break-inside:\s*avoid/su);
  assert.match(css, /@media print[\s\S]*?\.cloud-sync-panel,[\s\S]*?#storage-error\s*\{\s*display:\s*none !important/su);
  assert.match(script, /window\.print\(\)/u);
  assert.match(script, /blogmoi-chi-phi-\$\{month\}/u);
  assert.match(script, /applySyncedDocument[\s\S]*?await persistAndRender\(\)/u);
});
