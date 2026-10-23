import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { selectFeaturedPosts } from "../lib/featured-posts.js";

const post = (id, featured = false, draft = false) => ({ id, data: { featured, draft } });
test("manual selections take priority, then newest remaining articles fill three places", () => {
  const posts = [post("newest"), post("next"), post("older"), post("selected", true)];
  assert.deepEqual(selectFeaturedPosts(posts).map(item => item.id), ["selected", "newest", "next"]);
  assert.deepEqual(posts.map(item => item.id), ["newest", "next", "older", "selected"]);
  assert.deepEqual(selectFeaturedPosts(posts.slice(0, 3)).map(item => item.id), ["newest", "next", "older"]);
});
test("limit, empty state, draft exclusion and publication order remain intact", () => {
  assert.deepEqual(selectFeaturedPosts([]), []);
  assert.deepEqual(selectFeaturedPosts([post("only")]).map(item => item.id), ["only"]);
  const posts = [post("draft", true, true), ...["a", "b", "c", "d"].map(id => post(id, true))];
  assert.deepEqual(selectFeaturedPosts(posts).map(item => item.id), ["a", "b", "c"]);
});
test("built homepage displays three distinct featured cards and preserves newest-first section", async () => {
  const dom = new JSDOM(await readFile("_site/index.html", "utf8"));
  try {
    const links = [...dom.window.document.querySelectorAll(".section--featured .article-card__link")].map(node => node.getAttribute("href"));
    assert.equal(links.length, 3);
    assert.equal(new Set(links).size, 3);
    assert.ok(links[0].includes("/xay-dung-blog-tinh-voi-eleventy-11ty/"));
    assert.ok(dom.window.document.querySelector(".section--latest .article-card__link").getAttribute("href").includes("/sk-hynix-dung-xem-xet-niem-yet-solidigm-tai-my/"));
  } finally { dom.window.close(); }
});
