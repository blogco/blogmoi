import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import matter from "gray-matter";
import { renderPost } from "../scripts/lib/scheduled-news.mjs";

const slugs = [
  "sk-hynix-dung-xem-xet-niem-yet-solidigm-tai-my",
  "fix-loi-scope-label-dong-bo-github-indexeddb",
  "blogmoi-codex-report-theo-doi-lap-trinh-ai-terminal",
  "kham-pha-theo-chu-de-blogmoi-thuat-toan-phan-loai",
];

test("same-day articles have explicit publication times and sort newest first", async () => {
  const posts = await Promise.all(slugs.map(async slug => ({ slug, data: matter(await readFile(`src/posts/${slug}.md`, "utf8")).data })));
  for (const { data } of posts) {
    assert.equal(typeof data.date, "string");
    assert.match(data.date, /^2026-10-23T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/);
  }
  assert.deepEqual(posts.sort((a, b) => new Date(b.data.date) - new Date(a.data.date)).map(post => post.slug), slugs);
});

test("built homepage, search and RSS put the newer Solidigm report before both older articles", async () => {
  const dom = new JSDOM(await readFile("_site/index.html", "utf8"));
  const feed = new JSDOM(await readFile("_site/index.xml", "utf8"), { contentType: "text/xml" });
  try {
    const links = [...dom.window.document.querySelectorAll(".section--latest .article-card__link, [aria-labelledby='latest-title'] .article-card__link")].map(node => node.getAttribute("href"));
    assert.ok(links.length, "latest articles must be rendered");
    assert.ok(links[0].includes(slugs[0]));
    const index = JSON.parse(await readFile("_site/search-index.json", "utf8"));
    assert.ok(index[0].url.includes(slugs[0]));
    const items = [...feed.window.document.querySelectorAll("item")];
    assert.ok(items[0].querySelector("link").textContent.includes(slugs[0]));
    assert.equal(Date.parse(items[0].querySelector("pubDate").textContent), Date.parse("2026-10-23T08:23:57+07:00"));
    for (const slug of slugs.slice(2)) assert.ok(index.findIndex(post => post.url.includes(slug)) > 0);
  } finally { dom.window.close(); feed.window.close(); }
});

test("automatic articles use the actual publication instant rather than date-only UTC midnight", () => {
  const post = renderPost({ title: "Bản tin thử nghiệm", description: "Mô tả thử nghiệm", facts: [] }, { url: "https://www.koreatimes.co.kr/business/companies/20261023/test-story", publishedAt: "2026-10-22T23:00:00Z" }, "2026-10-23", "2026-10-23T00:06:12Z");
  const data = matter(post.content).data;
  assert.equal(data.date, "2026-10-23T00:06:12Z");
  assert.equal(data.scheduledNewsDate, "2026-10-23");
  assert.throws(() => renderPost({}, {}, "2026-10-23", "2026-10-24T01:00:00Z"), /timestamp/);
});
