import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

const normalize = text => text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function verifyExploreNextTopics(directory = "_site") {
  const root = resolve(directory);
  const posts = JSON.parse(readFileSync(join(root, "search-index.json"), "utf8"));
  const failures = [];
  const articleFiles = new Set();
  let covered = 0, missing = 0, duplicate = 0;
  const publishedTitles = new Set(posts.map(post => normalize(post.title)));
  for (const post of posts) {
    const fail = reason => failures.push(`${post.url}: ${reason}`);
    const path = join(root, post.url.replace(/^\/blogmoi\//, "").replace(/^\//, ""), "index.html");
    articleFiles.add(path);
    let dom;
    try {
      dom = new JSDOM(readFileSync(path, "utf8"));
      const document = dom.window.document;
      const panels = document.querySelectorAll(".topic-discovery-panel");
      if (!panels.length) { missing++; fail("missing ExploreNextTopics"); continue; }
      if (panels.length !== 1) { duplicate++; fail(`rendered ${panels.length} panels`); continue; }
      const panel = panels[0];
      if (panel.dataset.component !== "ExploreNextTopics" || panel.hidden) fail("wrong or hidden shared component");
      const cards = [...panel.querySelectorAll(".topic-discovery-card")];
      if (cards.length < 3 || cards.length > 5) fail(`expected 3-5 ideas, got ${cards.length}`);
      const titles = new Set();
      for (const card of cards) {
        const title = normalize(card.querySelector("h3")?.textContent || "");
        if (!title || titles.has(title) || publishedTitles.has(title)) fail(`empty, duplicate or already published idea: ${title}`);
        titles.add(title);
        if (!card.querySelector(".topic-discovery__description")?.textContent.trim() || !card.querySelector(".topic-discovery__rationale")?.textContent.trim()) fail("missing angle or rationale");
        if (card.querySelector("a, script, [onclick]")) fail("future idea contains a link or executable behavior");
      }
      const content = document.querySelector("#article-content");
      const endmatter = document.querySelector(".article-endmatter");
      if (!content || !(content.compareDocumentPosition(panel) & 4) || !endmatter || !(panel.compareDocumentPosition(endmatter) & 4)) fail("wrong position relative to article/endmatter");
      for (const selector of [".source-panel", ".internal-panel", ".faq-panel", "footer"]) if (!document.querySelector(selector)) fail(`missing existing component ${selector}`);
      covered++;
    } catch (error) { fail(error.message); }
    finally { dom?.window.close(); }
  }
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
  for (const file of walk(root).filter(file => file.endsWith(".html") && !articleFiles.has(file))) {
    if (/data-component="ExploreNextTopics"/.test(readFileSync(file, "utf8"))) failures.push(`${file}: article ideas on a non-article page`);
  }
  const result = { total: posts.length, covered, missing, duplicate, failures };
  if (failures.length) throw new Error(JSON.stringify(result, null, 2));
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(verifyExploreNextTopics(process.argv[2]), null, 2));
}
