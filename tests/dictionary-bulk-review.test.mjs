import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { makeDictionaryDispatchChunks, setVisibleReviewSelection, summarizeReviewSelection } from "../static/js/dictionary-review.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

test("review selection is scoped to visible rows and reports the three checkbox states", () => {
  const selected = new Set(["a"]);
  assert.deepEqual(summarizeReviewSelection(["a", "b"], selected), {
    visibleCount: 2,
    selectedCount: 1,
    allSelected: false,
    someSelected: true
  });
  setVisibleReviewSelection(["b", "c"], selected, true);
  assert.deepEqual(selected, new Set(["a", "b", "c"]));
  assert.deepEqual(summarizeReviewSelection(["b", "c"], selected), {
    visibleCount: 2,
    selectedCount: 2,
    allSelected: true,
    someSelected: false
  });
  setVisibleReviewSelection(["b", "c"], selected, false);
  assert.deepEqual(selected, new Set(["a"]));
});

test("the existing workflow's 60-item limit is honored for 50–100 selected words", () => {
  const base = { contentId: "posts/sample.md", articleId: "posts/sample.md", sourceLanguage: "vi", articleHash: "a".repeat(64) };
  const items = Array.from({ length: 100 }, (_, index) => ({
    id: `term-${index + 1}`,
    verified: true,
    translations: { vi: `Từ ${index + 1}`, ko: `한국어 ${index + 1}`, en: `Term ${index + 1}` },
    examples: {},
    definition: ""
  }));
  const chunks = makeDictionaryDispatchChunks(base, items);
  assert.deepEqual(chunks.map(({ ids }) => ids.length), [60, 40]);
  assert.deepEqual(chunks.flatMap(({ ids }) => ids), items.map(({ id }) => id));
  for (const chunk of chunks) {
    assert.ok(new TextEncoder().encode(chunk.serialized).length <= 60_000);
    assert.ok(JSON.parse(chunk.serialized).items.length <= 60);
  }
  assert.throws(() => makeDictionaryDispatchChunks(base, [{ id: "large", content: "x".repeat(61_000) }]), RangeError);
});

test("review UI separates selection from quality confirmation and keeps failures reviewable", async () => {
  const [template, script, styles, workflow, importer, layout] = await Promise.all([
    readFile(resolve(repositoryRoot, "src/tu-dien-vi-kr/index.njk"), "utf8"),
    readFile(resolve(repositoryRoot, "static/js/dictionary.js"), "utf8"),
    readFile(resolve(repositoryRoot, "static/css/dictionary.css"), "utf8"),
    readFile(resolve(repositoryRoot, ".github/workflows/deploy.yml"), "utf8"),
    readFile(resolve(repositoryRoot, "scripts/import-dictionary-entries.mjs"), "utf8"),
    readFile(resolve(repositoryRoot, "src/_includes/layouts/base.njk"), "utf8")
  ]);
  assert.match(template, /data-review-select-all/);
  assert.match(template, /data-review-selected-count/);
  assert.match(template, /data-review-mark-selected/);
  assert.match(script, /selectReview\.dataset\.reviewId = candidate\.id/);
  assert.match(script, /currentReviewCandidates\(\)/);
  assert.match(script, /reviewSelectAll\.indeterminate = someSelected/);
  assert.match(script, /window\.confirm\(/);
  assert.match(script, /ensureDraft\(candidate\)\.verified = true/);
  assert.match(script, /uncertainDispatchIds\.add\(id\)/);
  assert.match(script, /Dữ liệu nháp vẫn còn trên trang/);
  assert.match(script, /selectedReviewIds\.clear\(\)/);
  assert.match(script, /event\.key === "Escape"/);
  assert.match(script, /setVisibleReviewSelection\(currentReviewCandidates\(\)\.map/);
  assert.match(styles, /@media \(max-width:/);
  assert.match(styles, /dictionary-review-row-select:focus-visible/);
  assert.match(layout, /\/js\/dictionary\.js'.*type="module"/);
  assert.match(workflow, /workflow_dispatch:[\s\S]*dictionary_payload/);
  assert.match(importer, /payload\.items\.length > 60/);
  const submitFunction = script.match(/async function submitManualTranslations\(\) \{([\s\S]*?)\n  \}/)?.[1];
  assert.ok(submitFunction);
  assert.doesNotMatch(submitFunction, /selectedReviewIds\.clear\(\)/);
});
