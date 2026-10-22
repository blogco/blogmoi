import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const extractor = resolve(repositoryRoot, "scripts/extract-dictionary.mjs");
const translator = resolve(repositoryRoot, "scripts/translate-dictionary.mjs");
const approver = resolve(repositoryRoot, "scripts/approve-dictionary-entry.mjs");

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "blogmoi-dictionary-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all([
    mkdir(join(root, "src/posts"), { recursive: true }),
    mkdir(join(root, "src/en"), { recursive: true }),
    mkdir(join(root, "src/_data"), { recursive: true }),
    mkdir(join(root, "data/dictionary"), { recursive: true })
  ]);
  await Promise.all([
    writeFile(join(root, "src/_data/dictionary-data.json"), JSON.stringify({ version: 1, entries: [] }, null, 2)),
    writeFile(join(root, "data/dictionary/pending.json"), JSON.stringify({ version: 1, candidates: [], articleCache: {} }, null, 2))
  ]);
  return root;
}

function article({ title = "Bài cũ", slug = "old-article", date = "2020-01-01", extra = "", terms = ["Eleventy", "data cascade"], body = "Eleventy dùng data cascade để tạo trang tĩnh." } = {}) {
  return `---\ntitle: ${title}\nslug: ${slug}\ndate: ${date}\ncategories:\n  - Công nghệ\n${extra}${terms.length ? `dictionaryTerms:\n${terms.map((term) => `  - ${term}`).join("\n")}\n` : ""}---\n\n${body}\n`;
}

function run(script, args, cwd, env = {}, nodeArgs = []) {
  return spawnSync(process.execPath, [...nodeArgs, script, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env }
  });
}

async function readQueue(root) {
  return JSON.parse(await readFile(join(root, "data/dictionary/pending.json"), "utf8"));
}

test("backfill discovers published articles, excludes pages and unpublished sources, and skips unchanged articles", async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, "src/posts/old.md"), article());
  await writeFile(join(root, "src/posts/draft.md"), article({ slug: "draft", extra: "draft: true\n" }));
  await writeFile(join(root, "src/posts/future.md"), article({ slug: "future", date: "2099-01-01" }));
  await writeFile(join(root, "src/posts/unpublished.md"), article({ slug: "unpublished", extra: "published: false\n" }));
  await writeFile(join(root, "src/posts/page.md"), article({ slug: "page", extra: "type: page\n" }));
  await writeFile(join(root, "src/en/static-sites.md"), article({
    title: "Static sites",
    slug: "static-sites",
    terms: ["static generation"],
    extra: "lang: en\n",
    body: "Static generation creates a site during the build."
  }));
  await writeFile(join(root, "src/about.md"), article({ slug: "page-outside-article-collection" }));

  const first = run(extractor, [], root, { DICTIONARY_SCAN_MODE: "backfill" });
  assert.equal(first.status, 0, first.stderr);
  let queue = await readQueue(root);
  assert.equal(queue.lastRun.articlesDiscovered, 2);
  assert.equal(queue.lastRun.articlesProcessed, 2);
  assert.equal(queue.lastRun.articlesSkippedValidCache, 0);
  assert.equal(queue.candidates.length, 3);
  assert.ok(queue.candidates.some((candidate) => candidate.sourceLanguage === "en"));
  const ids = queue.candidates.map((candidate) => candidate.id).sort();

  const second = run(extractor, [], root, {
    DICTIONARY_SCAN_MODE: "backfill",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REPOSITORY: "blogco/blogmoi",
    GITHUB_RUN_ID: "12345"
  });
  assert.equal(second.status, 0, second.stderr);
  queue = await readQueue(root);
  assert.equal(queue.lastRun.articlesDiscovered, 2);
  assert.equal(queue.lastRun.articlesProcessed, 0);
  assert.equal(queue.lastRun.articlesSkippedValidCache, 2);
  assert.equal(queue.lastRun.workflowRunUrl, "https://github.com/blogco/blogmoi/actions/runs/12345");
  assert.deepEqual(queue.candidates.map((candidate) => candidate.id).sort(), ids);
});

test("changed article content updates its candidate context and preserves reviewed entries", async (t) => {
  const root = await fixture(t);
  const sourcePath = join(root, "src/posts/old.md");
  await writeFile(sourcePath, article({ slug: "old", terms: ["Eleventy"], body: "Eleventy builds a static site." }));
  const initial = run(extractor, [], root);
  assert.equal(initial.status, 0, initial.stderr);
  let queue = await readQueue(root);
  const candidate = queue.candidates[0];
  candidate.status = "translated";
  candidate.translationDraft = { vi: "Eleventy", ko: "일레븐티", en: "Eleventy" };
  await writeFile(join(root, "data/dictionary/pending.json"), JSON.stringify(queue, null, 2));

  await writeFile(sourcePath, article({ slug: "old", terms: ["Eleventy", "build pipeline"], body: "Eleventy now uses a changed build pipeline for static pages." }));
  const changed = run(extractor, [], root);
  assert.equal(changed.status, 0, changed.stderr);
  queue = await readQueue(root);
  const updated = queue.candidates.find((item) => item.term === "Eleventy");
  assert.equal(queue.lastRun.articlesProcessed, 1);
  assert.equal(queue.lastRun.articlesSkippedValidCache, 0);
  assert.equal(updated.status, "extracted");
  assert.equal(updated.translationDraft, null);
  assert.match(updated.sourceContext, /changed build pipeline/);
  assert.ok(queue.candidates.some((item) => item.term === "build pipeline"));

  const reviewed = {
    id: candidate.id,
    vi: "Eleventy",
    ko: "일레븐티",
    en: "Eleventy",
    definition: "A reviewed term.",
    examples: { vi: "Ví dụ", ko: "예시", en: "Example" },
    field: "Công nghệ",
    sourceLanguage: "vi",
    sourceArticle: "/old/",
    sourceContext: "Reviewed context.",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "reviewed"
  };
  await writeFile(join(root, "src/_data/dictionary-data.json"), JSON.stringify({ version: 1, entries: [reviewed] }, null, 2));
  const afterReview = run(extractor, [], root);
  assert.equal(afterReview.status, 0, afterReview.stderr);
  queue = await readQueue(root);
  assert.equal(queue.candidates.some((item) => item.term === "Eleventy"), false);
  const savedDictionary = JSON.parse(await readFile(join(root, "src/_data/dictionary-data.json"), "utf8"));
  assert.deepEqual(savedDictionary.entries[0], reviewed);
});

test("missing translation credentials leave candidates pending without fabricated drafts", async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, "src/posts/old.md"), article({ terms: ["Eleventy"] }));
  const extracted = run(extractor, [], root);
  assert.equal(extracted.status, 0, extracted.stderr);
  const translated = run(translator, [], root, { OPENAI_API_KEY: "", DICTIONARY_OPENAI_MODEL: "" });
  assert.equal(translated.status, 1);
  assert.match(translated.stderr, /Translation is pending/);
  const queue = await readQueue(root);
  assert.equal(queue.candidates[0].status, "extracted");
  assert.equal(queue.candidates[0].translationDraft, null);
});

test("translation failure midway preserves successful work and leaves failures retryable", async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, "src/posts/old.md"), article({ terms: ["alpha", "beta"] }));
  const extracted = run(extractor, [], root);
  assert.equal(extracted.status, 0, extracted.stderr);
  const mockPath = join(root, "mock-provider.mjs");
  await writeFile(mockPath, `
let calls = 0;
globalThis.fetch = async () => {
  calls += 1;
  if (calls === 2) return { ok: false, status: 503 };
  const draft = {
    vi: "draft", ko: "초안", en: "draft", definition: "A concise definition.",
    examples: { vi: "Ví dụ.", ko: "예시.", en: "Example." },
    relatedExpressions: [], uncertain: false, uncertaintyNote: ""
  };
  return { ok: true, json: async () => ({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(draft) }] }] }) };
};
`);
  const translated = run(translator, [], root, {
    OPENAI_API_KEY: "test-only",
    DICTIONARY_OPENAI_MODEL: "test-model"
  }, ["--import", mockPath]);
  assert.equal(translated.status, 1, translated.stdout);
  const queue = await readQueue(root);
  assert.equal(queue.candidates.find((candidate) => candidate.term === "alpha").status, "translated");
  assert.equal(queue.candidates.find((candidate) => candidate.term === "beta").status, "translation_failed");
  assert.equal(queue.lastRun.translationsCompleted, 1);
  assert.equal(queue.lastRun.translationsFailed, 1);
});

test("approval can be retried without duplicating or overwriting a reviewed entry", async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, "src/posts/old.md"), article({ terms: ["Eleventy"] }));
  const extracted = run(extractor, [], root);
  assert.equal(extracted.status, 0, extracted.stderr);
  const queue = await readQueue(root);
  const candidate = queue.candidates[0];
  candidate.status = "translated";
  candidate.translationDraft = {
    vi: "Eleventy", ko: "일레븐티", en: "Eleventy", definition: "A site generator.",
    examples: { vi: "Dùng Eleventy.", ko: "Eleventy를 사용합니다.", en: "Use Eleventy." },
    relatedExpressions: [], uncertain: false
  };
  await writeFile(join(root, "data/dictionary/pending.json"), JSON.stringify(queue, null, 2));

  const first = run(approver, [`--id=${candidate.id}`, "--approve"], root);
  assert.equal(first.status, 0, first.stderr);
  const saved = JSON.parse(await readFile(join(root, "src/_data/dictionary-data.json"), "utf8"));
  assert.equal(saved.entries.length, 1);
  saved.entries[0].ko = "검토된 번역";
  await writeFile(join(root, "src/_data/dictionary-data.json"), JSON.stringify(saved, null, 2));

  const retry = run(approver, [`--id=${candidate.id}`, "--approve"], root);
  assert.equal(retry.status, 0, retry.stderr);
  const afterRetry = JSON.parse(await readFile(join(root, "src/_data/dictionary-data.json"), "utf8"));
  assert.equal(afterRetry.entries.length, 1);
  assert.equal(afterRetry.entries[0].ko, "검토된 번역");
});

test("public launch UI points to the authenticated workflow and does not expose credentials", async () => {
  const template = await readFile(resolve(repositoryRoot, "src/tu-dien-vi-kr/index.njk"), "utf8");
  assert.match(template, /dictionaryStatus\.workflowUrl/);
  assert.match(template, /không tự khởi chạy/i);
  assert.match(template, /quyền ghi repository/i);
  assert.doesNotMatch(template, /GITHUB_TOKEN|OPENAI_API_KEY/);
});
