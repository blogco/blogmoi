import test from "node:test";
import assert from "node:assert/strict";
import nunjucks from "nunjucks";
import { resolveTopicSuggestions, removeLegacyTopicPanels } from "../lib/editorial-topic-discovery.js";
import { verifyExploreNextTopics } from "../scripts/verify-explore-next-topics.mjs";
const post = data => ({ url: "/fixture/", fileSlug: "fixture", data: { title: "Đồng bộ GitHub và IndexedDB", ...data } });
const ideas = (current, body = "", backlog = { suggestions: [] }) => resolveTopicSuggestions([current], current.url, [], body, backlog);
for (const data of [{}, { tags: [] }, { categories: [] }, { title: "Trồng rau trên ban công" }, { title: "Ghi chép" }]) {
  test(`deterministic complete ideas without metadata: ${JSON.stringify(data)}`, () => {
    const current = post(data);
    const result = ideas(current);
    assert.ok(result.length >= 3 && result.length <= 5);
    assert.equal(new Set(result.map(item => item.title)).size, result.length);
    assert.ok(result.every(item => item.description && item.rationale && !item.url && item.kind === "topic"));
    assert.deepEqual(ideas(current), result);
    if (data.title === "Trồng rau trên ban công") assert.ok(result.every(item => !/GitHub|Eleventy/.test(item.title)));
  });
}
test("manual suggestions win; duplicate titles and malformed entries cannot hide the component", () => {
  const custom = { title: "Thử nghiệm riêng", description: "Góc khai thác đã chọn", rationale: "Nối tiếp bài này" };
  const current = post({ exploreNextTopics: [custom, custom, null, { title: "Thiếu mô tả" }] });
  const result = ideas(current);
  assert.equal(result[0].title, custom.title);
  assert.equal(result.filter(item => item.title === custom.title).length, 1);
  assert.ok(result.length >= 3);
});
test("3-5 valid manual ideas are preserved, not replaced by rules", () => {
  const manual = Array.from({ length: 5 }, (_, i) => ({ title: `Ý tưởng ${i}`, description: "Góc khai thác", rationale: "Liên hệ bài gốc" }));
  assert.deepEqual(ideas(post({ exploreNextTopics: manual })).map(item => item.title), manual.map(item => item.title));
});
test("existing proposed backlog ideas win; published/rejected ideas stay out", () => {
  const rows = ["proposed", "approved", "published", "rejected"].map(status => ({ id: status, status, title: status, sourceArticles: ["fixture"], rationale: "Góc khai thác", connections: { fixture: "Liên hệ riêng" } }));
  const result = ideas(post({}), "", { suggestions: rows });
  assert.deepEqual(result.slice(0, 2).map(item => item.title), ["proposed", "approved"]);
  assert.ok(result.every(item => !["published", "rejected"].includes(item.title)));
});
test("headings and body provide relevant signals without tags/category/title keywords", () => {
  const current = post({ title: "Nhật ký hôm nay" });
  assert.match(ideas(current, "<h2>IndexedDB và hàng chờ</h2><p>Đồng bộ GitHub.</p>")[0].title, /đồng bộ/);
  assert.match(ideas(current, "## Font WOFF2\nKiểm tra unicode-range.")[0].title, /font/);
});
test("generic fallback anchors angles in actual headings", () => {
  const result = ideas(post({ title: "Trồng rau" }), "## Tưới nước\nNội dung.\n## Chọn đất\nNội dung.");
  assert.match(result[0].title, /Tưới nước/);
  assert.match(result[1].title, /Chọn đất/);
});
test("published titles do not become future ideas", () => {
  const current = post({});
  const first = ideas(current)[0];
  const other = { url: "/already/", data: { title: first.title } };
  assert.ok(resolveTopicSuggestions([current, other], current.url, [], "", { suggestions: [] }).every(item => item.title !== first.title));
});
test("legacy panels are removed once without consuming article prose or adjacent endmatter", () => {
  const source = '<p>Before</p><section class="topic-discovery-panel"><section>Nested</section></section><p>After</p>';
  assert.equal(removeLegacyTopicPanels(source), "<p>Before</p><p>After</p>");
  assert.equal(removeLegacyTopicPanels('<section class="other">Keep</section>'), '<section class="other">Keep</section>');
});
test("shared Nunjucks component escapes front matter and has no broken-link behavior", () => {
  const environment = new nunjucks.Environment(new nunjucks.FileSystemLoader("src/_includes"));
  const html = environment.render("components/ExploreNextTopics.njk", { topicDiscovery: [{ title: '<img src=x onerror="alert(1)">', description: "Angle", rationale: "Why" }] });
  assert.ok(html.includes("&lt;img"));
  assert.doesNotMatch(html, /<img|<script|<a\b/);
});
test("every published article gets exactly one panel; non-article pages get none", () => {
  const result = verifyExploreNextTopics();
  assert.ok(result.total > 0);
  assert.equal(result.covered, result.total);
  assert.equal(result.missing, 0);
  assert.equal(result.duplicate, 0);
});
