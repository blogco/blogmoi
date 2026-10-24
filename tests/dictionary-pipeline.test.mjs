import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const extractor = resolve(repositoryRoot, "scripts/extract-dictionary.mjs");
const importer = resolve(repositoryRoot, "scripts/import-dictionary-entries.mjs");

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "blogmoi-dictionary-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all([
    mkdir(join(root, "src/posts"), { recursive: true }),
    mkdir(join(root, "src/en"), { recursive: true }),
    mkdir(join(root, "src/ko"), { recursive: true }),
    mkdir(join(root, "src/_data"), { recursive: true }),
    mkdir(join(root, "data/dictionary"), { recursive: true })
  ]);
  await Promise.all([
    writeFile(join(root, "src/_data/dictionary-data.json"), JSON.stringify({ version: 1, entries: [] }, null, 2)),
    writeFile(join(root, "data/dictionary/pending.json"), JSON.stringify({ version: 1, candidates: [], articleCache: {} }, null, 2))
  ]);
  return root;
}

function article({ language, slug, terms, body = "" }) {
  const candidates = terms.map((term) => `- ${term}`).join("\n");
  const content = terms.map((term) => `**${term}** xuất hiện trong ngữ cảnh bài viết.`).join("\n\n");
  return `---\ntitle: "Article ${slug}"\nslug: ${slug}\ndate: 2025-01-01\nlang: ${language}\ncategories:\n  - Ngôn ngữ\ndictionaryTerms:\n${candidates}\n---\n\n${content}\n\n${body}\n`;
}

function run(script, cwd, env = {}) {
  return spawnSync(process.execPath, [script], {
    cwd,
    encoding: "utf8",
    timeout: 20_000,
    env: { ...process.env, ...env }
  });
}

async function json(root, path) {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

test("extracts explicit terms from VI, KR and EN articles without translation", async (t) => {
  const root = await fixture(t);
  const sources = [
    { language: "vi", file: "src/posts/vietnamese.md", slug: "vietnamese", terms: ["ngữ cảnh nguồn", "từ vựng gốc"] },
    { language: "ko", file: "src/ko/korean.md", slug: "korean", terms: ["원문 문맥", "원본 어휘"] },
    { language: "en", file: "src/en/english.md", slug: "english", terms: ["source context", "original vocabulary"] }
  ];
  for (const item of sources) await writeFile(join(root, item.file), article(item));

  const result = run(extractor, root);
  assert.equal(result.status, 0, result.stderr);
  const queue = await json(root, "data/dictionary/pending.json");
  assert.equal(queue.candidates.length, 6);
  assert.deepEqual(new Set(queue.candidates.map((candidate) => candidate.sourceLanguage)), new Set(["vi", "ko", "en"]));
  assert.ok(queue.candidates.every((candidate) => candidate.status === "extracted" && candidate.translationDraft === null));
  assert.ok(queue.candidates.every((candidate) => candidate.articleId && candidate.sourceArticle && candidate.sourceContext));
});

test("one scan handles existing and new articles, caches unchanged hashes, and deduplicates terms", async (t) => {
  const root = await fixture(t);
  const oldPath = join(root, "src/posts/old.md");
  const oldArticle = article({ language: "vi", slug: "old", terms: ["bản gốc", "ngữ cảnh"] });
  await writeFile(oldPath, oldArticle);
  assert.equal(run(extractor, root).status, 0);
  await writeFile(join(root, "src/posts/new.md"), article({ language: "vi", slug: "new", terms: ["bản mới", "ngữ cảnh"] }));

  const next = run(extractor, root);
  assert.equal(next.status, 0, next.stderr);
  let queue = await json(root, "data/dictionary/pending.json");
  assert.equal(queue.lastRun.articlesDiscovered, 2);
  assert.equal(queue.lastRun.articlesProcessed, 1);
  assert.equal(queue.lastRun.articlesSkippedValidCache, 1);
  assert.equal(queue.candidates.length, 4);

  const same = run(extractor, root);
  assert.equal(same.status, 0, same.stderr);
  queue = await json(root, "data/dictionary/pending.json");
  assert.equal(queue.lastRun.articlesProcessed, 0);
  assert.equal(queue.lastRun.articlesSkippedValidCache, 2);
  assert.equal(queue.candidates.filter((candidate) => candidate.term === "ngữ cảnh").length, 2);
});

test("imports only verified translations for current article candidates and removes them from the pending list", async (t) => {
  const root = await fixture(t);
  const articleId = "posts/source.md";
  const source = article({ language: "vi", slug: "source", terms: ["ngữ cảnh nguồn", "từ vựng gốc"] });
  await writeFile(join(root, "src", articleId), source);
  assert.equal(run(extractor, root).status, 0);
  const queue = await json(root, "data/dictionary/pending.json");
  const candidate = queue.candidates[0];
  const item = {
    id: candidate.id,
    verified: true,
    translations: { vi: candidate.term, ko: "원문 어휘", en: "source vocabulary" },
    examples: {},
    definition: ""
  };
  const payload = {
    contentId: candidate.sourceArticle,
    articleId,
    sourceLanguage: "vi",
    articleHash: candidate.articleHash,
    items: [item]
  };
  const eventPath = join(root, "event.json");
  await writeFile(eventPath, JSON.stringify({ inputs: { dictionary_payload: JSON.stringify(payload) } }));
  const imported = run(importer, root, { GITHUB_EVENT_PATH: eventPath });
  assert.equal(imported.status, 0, imported.stderr);
  let dictionary = await json(root, "src/_data/dictionary-data.json");
  assert.equal(dictionary.entries.length, 1);
  assert.equal(dictionary.entries[0].status, "reviewed");
  assert.equal(dictionary.entries[0].vi, candidate.term);
  assert.equal(dictionary.entries[0].ko, "원문 어휘");
  assert.equal(dictionary.entries[0].en, "source vocabulary");
  assert.equal(dictionary.entries[0].examples.vi, candidate.sourceContext);

  const repeat = run(importer, root, { GITHUB_EVENT_PATH: eventPath });
  assert.equal(repeat.status, 0, repeat.stderr);
  dictionary = await json(root, "src/_data/dictionary-data.json");
  assert.equal(dictionary.entries.length, 1);
  assert.equal(run(extractor, root).status, 0);
  const updatedQueue = await json(root, "data/dictionary/pending.json");
  assert.equal(updatedQueue.candidates.some((entry) => entry.id === candidate.id), false);
});

test("rejects unverified, stale, or tampered article submissions without changing the dictionary", async (t) => {
  const root = await fixture(t);
  const articleId = "posts/safe.md";
  await writeFile(join(root, "src", articleId), article({ language: "en", slug: "safe", terms: ["source phrase"] }));
  assert.equal(run(extractor, root).status, 0);
  const candidate = (await json(root, "data/dictionary/pending.json")).candidates[0];
  const payload = {
    contentId: candidate.sourceArticle,
    articleId,
    sourceLanguage: "en",
    articleHash: candidate.articleHash,
    items: [{
      id: candidate.id,
      verified: false,
      translations: { vi: "cụm từ nguồn", ko: "원문 표현" }
    }]
  };
  const eventPath = join(root, "event.json");
  await writeFile(eventPath, JSON.stringify({ inputs: { dictionary_payload: JSON.stringify(payload) } }));
  const rejected = run(importer, root, { GITHUB_EVENT_PATH: eventPath });
  assert.notEqual(rejected.status, 0);
  const dictionary = await json(root, "src/_data/dictionary-data.json");
  assert.equal(dictionary.entries.length, 0);

  payload.items[0].verified = true;
  payload.articleHash = "0".repeat(64);
  await writeFile(eventPath, JSON.stringify({ inputs: { dictionary_payload: JSON.stringify(payload) } }));
  const stale = run(importer, root, { GITHUB_EVENT_PATH: eventPath });
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /stale_article_hash/);
  assert.equal((await json(root, "src/_data/dictionary-data.json")).entries.length, 0);
});

test("manual entry uses a transient Contents token and preserves the legacy importer", async () => {
  const template=await readFile(resolve(repositoryRoot,"src/tu-dien-vi-kr/index.njk"),"utf8");
  const script=await readFile(resolve(repositoryRoot,"static/js/dictionary-manual.js"),"utf8");
  const workflow=await readFile(resolve(repositoryRoot,".github/workflows/deploy.yml"),"utf8");
  assert.match(template,/data-github-token[^>]*type="password"/);
  assert.match(template,/Contents: Read and write/);
  assert.match(script,/force:false/);
  assert.match(script,/src\/_data\/dictionary-data\.json/);
  assert.doesNotMatch(script,/localStorage|sessionStorage/);
  assert.match(workflow,/npm run dictionary:import/);
  assert.match(workflow,/npm run dictionary:sync/);
  const ignored=workflow.split("paths-ignore:")[1].split("schedule:")[0];
  assert.doesNotMatch(ignored,/src\/_data\/dictionary-data\.json/);
});
