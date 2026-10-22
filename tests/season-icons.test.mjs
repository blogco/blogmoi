import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sprite = await readFile(new URL("../static/icons/season-icons.svg", import.meta.url), "utf8");
const siteCss = await readFile(new URL("../static/css/site.css", import.meta.url), "utf8");
const articleCss = await readFile(new URL("../static/css/article.css", import.meta.url), "utf8");
const labelTemplate = await readFile(new URL("../src/_includes/components/season-label.njk", import.meta.url), "utf8");

function symbol(name) {
  const match = sprite.match(new RegExp(`<symbol id="season-${name}" viewBox="0 0 100 100">([\\s\\S]*?)<\\/symbol>`));
  assert.ok(match, `season-${name} uses the shared 0 0 100 100 viewBox`);
  return match[1];
}

test("spring icon matches the five-petal geometry and palette", () => {
  const markup = symbol("spring");
  assert.equal((markup.match(/<ellipse /g) || []).length, 5);
  assert.match(markup, /<ellipse cx="50" cy="31" rx="15" ry="28" transform="rotate\(0 50 50\)"\/>/);
  assert.deepEqual([...markup.matchAll(/rotate\((\d+) 50 50\)/g)].map((match) => Number(match[1])), [0, 72, 144, 216, 288]);
  assert.match(markup, /<g fill="#E99AB0">/);
  assert.match(markup, /<circle cx="50" cy="50" r="14" fill="#F9CC69"\/>/);
  assert.doesNotMatch(markup, /stroke=|<path /);
});

test("summer icon matches the eight rays and outlined sun disk", () => {
  const markup = symbol("summer");
  assert.equal((markup.match(/<rect /g) || []).length, 8);
  assert.equal((markup.match(/x="45" y="4" width="10" height="24" rx="5"/g) || []).length, 8);
  assert.deepEqual([...markup.matchAll(/rotate\((\d+) 50 50\)/g)].map((match) => Number(match[1])), [0, 45, 90, 135, 180, 225, 270, 315]);
  assert.match(markup, /<g fill="#D58A18">/);
  assert.match(markup, /<circle cx="50" cy="50" r="29" fill="#F8C85F" stroke="#D58A18" stroke-width="4"\/>/);
});

test("autumn icon uses the supplied single-leaf silhouette and veins", () => {
  const markup = symbol("autumn");
  assert.match(markup, /d="M50 8 C78 13 89 40 73 64 C64 77 51 87 50 91 C44 79 18 67 16 44 C14 25 29 13 50 8Z" fill="#B66D43"/);
  assert.match(markup, /d="M50 18 Q46 54 51 91 M47 53 L21 38 M49 67 L75 44" fill="none" stroke="#FBEBDD" stroke-width="4\.5" stroke-linecap="round"\/>/);
  assert.equal((markup.match(/<path /g) || []).length, 2);
});

test("winter icon repeats the supplied snow axis at 0, 60 and 120 degrees", () => {
  const markup = symbol("winter");
  assert.equal((markup.match(/d="M50 9 V91 M41 21 L50 30 L59 21 M41 79 L50 70 L59 79"/g) || []).length, 3);
  assert.deepEqual([...markup.matchAll(/rotate\((\d+) 50 50\)/g)].map((match) => Number(match[1])), [0, 60, 120]);
  assert.match(markup, /fill="none" stroke="#5793BF" stroke-width="5\.5" stroke-linecap="round" stroke-linejoin="round"/);
});

test("season labels keep the requested backgrounds and icon sizes", () => {
  const backgrounds = { spring: "#FAEAF0", summer: "#FFF2D6", autumn: "#FBEBDD", winter: "#EAF3FA" };
  for (const [season, background] of Object.entries(backgrounds)) {
    assert.match(siteCss, new RegExp(`--season-${season}-bg: ${background};`, "i"));
  }
  assert.match(siteCss, /\.season-label__icon \{ width: 40px; height: 40px;/);
  assert.match(siteCss, /\.season-label--related \.season-label__icon \{ width: 24px; height: 24px;/);
  assert.match(siteCss, /\.season-label--article \.season-label__icon \{ width: 48px; height: 48px;/);
  assert.match(siteCss, /\.season-label--card \.season-label__icon \{ width: 36px; height: 36px;/);
  assert.match(siteCss, /\.season-label--article \.season-label__icon \{ width: 44px; height: 44px;/);
  assert.match(articleCss, /\.season-label--article \.season-label__icon \{ width: 44px; height: 44px;/);
  assert.match(labelTemplate, /<span class="sr-only">\{\{ seasonData\.accessibleLabel \}\}<\/span>/);
});
