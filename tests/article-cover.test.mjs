import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { resolveArticleCover, isUnsplashCover, UNSPLASH_COVERS } from "../static/js/article-cover.js";

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
