import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { resolveArticleCover, isUnsplashCover, UNSPLASH_COVERS, assignArticleCovers, coverIdentity } from "../static/js/article-cover.js";

test("every article gets a stable Unsplash illustration without credentials", () => {
  const a = resolveArticleCover({ slug: "my-first-post" });
  assert.equal(a.cover, resolveArticleCover({ slug: "my-first-post" }).cover);
  assert.ok(isUnsplashCover(a.cover));
  assert.ok(a.coverAlt);
  assert.ok(new Set(Array.from({ length: 30 }, (_, i) => resolveArticleCover({ slug: `article-${i}` }).cover)).size > 1);
  assert.ok(UNSPLASH_COVERS.length >= 3);
  assert.ok(isUnsplashCover(resolveArticleCover({ cover: "/uploads/local.jpg", slug: "legacy" }).cover));
  assert.equal(isUnsplashCover("https://images.unsplash.com.evil.example/photo.jpg"), false);
  assert.equal(isUnsplashCover("https://user:pass@images.unsplash.com/photo.jpg"), false);
});
test("a chosen Unsplash cover retains its alt text and photographer credit", () => {
  const data = { cover: "https://images.unsplash.com/photo-selected", coverAlt: "Custom alt", coverAttribution: { photographer: "Recorded author" } };
  const cover = resolveArticleCover(data);
  assert.equal(cover.cover, data.cover);
  assert.equal(cover.coverAlt, "Custom alt");
  assert.deepEqual(cover.coverAttribution, data.coverAttribution);
});
test("built article cards, hero and social metadata all have Unsplash images", async () => {
  const home = new JSDOM(await readFile("_site/index.html", "utf8"));
  const article = new JSDOM(await readFile("_site/xay-dung-blog-tinh-voi-eleventy-11ty/index.html", "utf8"));
  try {
    assert.equal(home.window.document.querySelectorAll(".card-placeholder").length, 0);
    const cards = [...home.window.document.querySelectorAll(".article-card")];
    assert.ok(cards.length);
    assert.ok(cards.every(card => isUnsplashCover(card.querySelector("img")?.src)));
    const hero = article.window.document.querySelector(".article-hero__media img");
    assert.ok(isUnsplashCover(hero.src));
    assert.ok(hero.alt);
    assert.equal(article.window.document.querySelector('meta[property="og:image"]').content, hero.src);
    assert.match(article.window.document.querySelector("figcaption").textContent, /Unsplash/);
    assert.equal(article.window.document.querySelectorAll(".article-hero__media--empty").length, 0);
  } finally { home.window.close(); article.window.close(); }
});


test("all available catalog slots are unique, stable across input order, and never silently recycled", () => {
  const articles = UNSPLASH_COVERS.map((_, i) => ({ slug: `article-${i}` }));
  const assignments = assignArticleCovers(articles);
  assert.equal(new Set([...assignments.values()].map(item => coverIdentity(item.cover))).size, articles.length);
  assert.deepEqual([...assignArticleCovers(articles.slice().reverse())], [...assignments]);
  assert.throws(() => assignArticleCovers([...articles, { slug: "one-more" }]), /Hết ảnh/);
});

test("the same source photo at different sizes cannot be reused", () => {
  const cover = resolveArticleCover({ slug: "chosen" }).cover;
  const result = assignArticleCovers([{ slug: "a", cover }, { slug: "b", cover: cover + "&w=400" }, { slug: "c" }]);
  assert.equal(result.get("a").cover, cover);
  assert.equal(new Set([...result.values()].map(item => coverIdentity(item.cover))).size, 3);
});

test("every published article has its own pinned source photo, shared consistently with its card", async () => {
  const index = JSON.parse(await readFile("_site/search-index.json", "utf8"));
  const photos = new Set();
  for (const post of index) {
    const path = "_site/" + post.url.replace(/^\/blogmoi\//, "") + "index.html";
    const dom = new JSDOM(await readFile(path, "utf8"));
    try {
      const photo = coverIdentity(dom.window.document.querySelector(".article-hero__media img").src);
      assert.ok(photo);
      assert.ok(!photos.has(photo), `duplicate thumbnail for ${post.url}`);
      photos.add(photo);
    } finally { dom.window.close(); }
  }
  assert.equal(photos.size, index.length);
});

test("new agent Markdown without cover fields gets collision-free images through the Eleventy pipeline", async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join, resolve } = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const { default: Eleventy } = await import("@11ty/eleventy");
  const root = await mkdtemp(join(tmpdir(), "blogmoi-unique-covers-"));
  try {
    const input = join(root, "src"), output = join(root, "_site");
    await mkdir(join(input, "_includes"), { recursive: true });
    await writeFile(join(input, "_includes/layout.njk"), '<img src="{{ articleCover.cover }}">');
    for (let i = 0; i < UNSPLASH_COVERS.length; i++) {
      await writeFile(join(input, `post-${i}.md`), `---\ntitle: Fixture ${i}\nslug: fixture-${i}\ntype: article\nlayout: layout.njk\ndate: 2026-10-23\n---\nFixture content.`);
    }
    const config = join(root, "eleventy.config.mjs");
    await writeFile(config, `import configure from ${JSON.stringify(pathToFileURL(resolve("eleventy.config.mjs")).href)};\nimport computed from ${JSON.stringify(pathToFileURL(resolve("src/_data/eleventyComputed.js")).href)};\nexport default function(c) { const options=configure(c,{syncTopicStatuses:false}); c.addGlobalData("eleventyComputed", {articleCover:computed.articleCover}); return {...options,dir:{input:${JSON.stringify(input)},output:${JSON.stringify(output)},includes:"_includes",data:"_data"}}; }`);
    const build = new Eleventy(input, output, { configPath: config, quietMode: true });
    await build.write();
    const photos = new Set();
    for (let i = 0; i < UNSPLASH_COVERS.length; i++) {
      const dom = new JSDOM(await readFile(join(output, `post-${i}/index.html`), "utf8"));
      const photo = coverIdentity(dom.window.document.querySelector("img").src);
      assert.ok(photo && !photos.has(photo), `duplicate for fixture-${i}`);
      photos.add(photo); dom.window.close();
    }
    assert.equal(photos.size, UNSPLASH_COVERS.length);
  } finally { await rm(root, { recursive: true, force: true }); }
});
