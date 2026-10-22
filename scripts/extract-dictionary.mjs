import { createHash } from "node:crypto";
import { appendFile, readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import matter from "gray-matter";
import { writeJsonAtomically } from "../lib/dictionary-storage.js";

const sourceDirectory = "src";
const pendingPath = "data/dictionary/pending.json";
const reviewedPath = "src/_data/dictionary-data.json";
const allowedLanguages = new Set(["vi", "ko", "en"]);
const stopTerms = new Set(["la", "là", "cua", "của", "va", "và", "co", "có", "duoc", "được", "de", "để", "cho", "trong", "the", "một", "những", "các", "with", "from", "this", "that", "blogmoi"]);
const vietnameseWords = new Set("và là của có được trong một những các này đó với cho từ khi sẽ đã đang không một số trên dưới theo thành cần bài viết người sản phẩm nếu vì như nhưng tại đến giữa giúp dùng".split(" "));

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalize(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("und").trim().replace(/\s+/g, " ");
}

function asList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

function languageFor(frontmatter, sourcePath, text) {
  const declared = String(frontmatter.lang || "").toLowerCase().split(/[-_]/)[0];
  if (allowedLanguages.has(declared)) return declared;
  const directory = sourcePath.split(sep)[0];
  if (directory === "ko" || directory === "en") return directory;
  if (/[\uac00-\ud7af]/u.test(text)) return "ko";
  if (/[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/iu.test(text)) return "vi";
  const words = normalize(text).match(/[\p{L}]+/gu) || [];
  const viScore = words.reduce((total, word) => total + Number(vietnameseWords.has(word)), 0);
  return viScore >= 2 ? "vi" : "en";
}

function articlePath(frontmatter, relativePath) {
  if (typeof frontmatter.permalink === "string" && frontmatter.permalink.startsWith("/")) {
    let route = frontmatter.permalink.replace(/index\.html?$/, "");
    if (!route.endsWith("/")) route += "/";
    return route;
  }
  const filename = relativePath.split(sep).at(-1);
  const slug = String(frontmatter.slug || filename.replace(/\.md$/i, ""));
  const directories = relativePath.split(sep).slice(0, -1);
  const routeDirectories = directories[0] === "posts" ? [] : directories;
  return `/${[...routeDirectories, slug].filter(Boolean).join("/")}/`;
}

function plainText(markdown) {
  return String(markdown || "")
    .replace(/^```[\s\S]*?^```\s*/gm, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/[*_`>#~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function candidateTerms(frontmatter, markdown) {
  const terms = new Map();
  const add = (value) => {
    const term = String(value || "").replace(/\s+/g, " ").trim().replace(/^['"]|['"]$/g, "");
    if (!term || term.length > 80 || term.split(/\s+/).length > 6) return;
    if (/^(tôi|mình|chúng tôi|we|i)\b/iu.test(term)) return;
    if (!/[\p{L}]/u.test(term) || !/^[\p{L}\p{M}\p{N} .+&'’()-]+$/u.test(term)) return;
    const key = normalize(term);
    if (stopTerms.has(key.replace(/[^\p{L}]+/gu, " ").trim())) return;
    if (!terms.has(key)) terms.set(key, term);
  };

  for (const term of asList(frontmatter.dictionaryTerms)) add(term);
  for (const match of String(markdown).matchAll(/(?:\*\*|__)([^\n]{2,80}?)(?:\*\*|__)/g)) add(match[1]);
  for (const tag of asList(frontmatter.tags)) {
    if (plainText(markdown).toLocaleLowerCase("und").includes(tag.toLocaleLowerCase("und"))) add(tag);
  }
  return [...terms.values()];
}

function contextFor(term, text, fallback) {
  const lower = text.toLocaleLowerCase("und");
  const position = lower.indexOf(term.toLocaleLowerCase("und"));
  if (position < 0) return String(fallback || "").slice(0, 220);
  const start = Math.max(0, position - 90);
  const end = Math.min(text.length, position + term.length + 110);
  return `${start ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

async function markdownFiles(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return markdownFiles(path);
      return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
    }));
    return files.flat();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function normalizedCandidateStatus(candidate) {
  if (candidate.status === "pending_review") return "translated";
  if (candidate.status === "pending_translation") return "extracted";
  return candidate.status || "extracted";
}

const [files, previousQueue, reviewedData] = await Promise.all([
  Promise.all(["posts", "en", "ko"].map((folder) => markdownFiles(join(sourceDirectory, folder)))).then((groups) => groups.flat()),
  readJson(pendingPath, { version: 1, candidates: [], articleCache: {} }),
  readJson(reviewedPath, { version: 1, entries: [] })
]);
const previousCandidates = new Map((previousQueue.candidates || []).map((candidate) => [candidate.id, candidate]));
const oldCache = previousQueue.articleCache || {};
const reviewed = new Set((reviewedData.entries || [])
  .filter((entry) => ["reviewed", "published"].includes(entry.status) || entry.reviewStatus === "reviewed")
  .map((entry) => `${entry.sourceArticle}\u0000${entry.sourceLanguage}\u0000${normalize(entry[entry.sourceLanguage])}`));
const nextCache = {};
const candidatesById = new Map();
let publishedArticlesDiscovered = 0;
let skippedDraftOrUnpublished = 0;
let skippedFutureDated = 0;
let skippedNonArticle = 0;
let articlesSkippedValidCache = 0;
let articlesScanned = 0;

for (const file of files.sort()) {
  const source = await readFile(file, "utf8");
  const parsed = matter(source);
  const data = parsed.data || {};
  if (data.draft === true || data.published === false) {
    skippedDraftOrUnpublished += 1;
    continue;
  }
  if (data.type && data.type !== "article") {
    skippedNonArticle += 1;
    continue;
  }
  const rawDate = data.date instanceof Date ? data.date : data.date ? new Date(data.date) : null;
  if (rawDate && !Number.isNaN(rawDate.getTime()) && rawDate.getTime() > Date.now()) {
    skippedFutureDated += 1;
    continue;
  }

  publishedArticlesDiscovered += 1;
  articlesScanned += 1;
  const relativePath = relative(sourceDirectory, file);
  const sourceArticle = articlePath(data, relativePath);
  const cacheKey = relativePath.split(sep).join("/");
  const articleHash = hash(source);
  const cached = oldCache[cacheKey];
  const cachedCandidates = Array.isArray(cached?.candidateIds)
    ? cached.candidateIds.map((id) => previousCandidates.get(id)).filter(Boolean)
    : [];
  const cacheValid = cached?.articleHash === articleHash
    && cachedCandidates.length === (cached?.candidateIds || []).length
    && cachedCandidates.every((candidate) => candidate.articleHash === articleHash && candidate.sourceArticle === sourceArticle);
  let currentCandidates;

  if (cacheValid) {
    articlesSkippedValidCache += 1;
    currentCandidates = cachedCandidates;
  } else {
    const language = languageFor(data, relativePath, `${data.title || ""} ${data.description || ""} ${parsed.content}`);
    const field = asList(data.categories)[0] || "Khác";
    const text = plainText(parsed.content);
    const fallback = `${data.title || ""}. ${data.description || ""}`;
    currentCandidates = candidateTerms(data, parsed.content).map((term) => {
      const key = `${sourceArticle}\u0000${language}\u0000${normalize(term)}`;
      const id = hash(key).slice(0, 24);
      const old = previousCandidates.get(id);
      const unchangedTerm = old?.articleHash === articleHash && old.term === term;
      return {
        id,
        term,
        sourceLanguage: language,
        field,
        sourceArticle,
        sourceContext: contextFor(term, text, fallback),
        articleHash,
        status: unchangedTerm ? normalizedCandidateStatus(old) : "extracted",
        translationDraft: unchangedTerm ? (old.translationDraft || null) : null,
        translationError: unchangedTerm ? (old.translationError || null) : null,
        updatedAt: unchangedTerm ? old.updatedAt : new Date().toISOString()
      };
    });
  }

  const activeCandidates = currentCandidates.filter((candidate) => {
    const isReviewed = reviewed.has(`${candidate.sourceArticle}\u0000${candidate.sourceLanguage}\u0000${normalize(candidate.term)}`);
    if (isReviewed) return false;
    candidatesById.set(candidate.id, candidate);
    return true;
  });
  nextCache[cacheKey] = {
    articleHash,
    sourceArticle,
    candidateIds: activeCandidates.map((candidate) => candidate.id)
  };
}

const candidates = [...candidatesById.values()].sort((a, b) => a.sourceArticle.localeCompare(b.sourceArticle) || a.term.localeCompare(b.term, "und"));
const previousComparable = JSON.stringify({ candidates: previousQueue.candidates || [], articleCache: previousQueue.articleCache || {} });
const nextComparable = JSON.stringify({ candidates, articleCache: nextCache });
const unchangedQueue = previousComparable === nextComparable;
const recordedAt = new Date().toISOString();
const trigger = process.env.DICTIONARY_TRIGGER || (
  process.env.GITHUB_EVENT_NAME === "workflow_dispatch"
    ? "manual-workflow"
    : process.env.GITHUB_EVENT_NAME === "push" ? "automatic-publish" : "local-cli"
);
const workflowRunUrl = process.env.GITHUB_RUN_ID && process.env.GITHUB_REPOSITORY
  ? `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : null;
const queue = {
  version: 1,
  generatedAt: unchangedQueue ? (previousQueue.generatedAt || new Date().toISOString()) : new Date().toISOString(),
  candidates,
  articleCache: nextCache,
  lastRun: {
    mode: process.env.DICTIONARY_SCAN_MODE || "incremental",
    trigger,
    recordedAt,
    workflowRunUrl,
    articlesDiscovered: publishedArticlesDiscovered,
    articlesProcessed: publishedArticlesDiscovered - articlesSkippedValidCache,
    articlesSkippedValidCache,
    newlyExtracted: candidates.filter((candidate) => !previousCandidates.has(candidate.id)).length,
    translationsCompleted: 0,
    translationsFailed: 0
  }
};
const queueChanged = JSON.stringify(previousQueue) !== JSON.stringify(queue);

await writeJsonAtomically(pendingPath, queue);

const stats = {
  markdownFilesDiscovered: files.length,
  publishedArticlesDiscovered,
  articlesScanned,
  articlesProcessed: publishedArticlesDiscovered - articlesSkippedValidCache,
  articlesSkippedValidCache,
  skippedDraftOrUnpublished,
  skippedFutureDated,
  skippedNonArticle,
  candidatesExtracted: candidates.length,
  newlyExtracted: candidates.filter((candidate) => !previousCandidates.has(candidate.id)).length,
  translationFailed: candidates.filter((candidate) => candidate.status === "translation_failed").length,
  awaitingTranslation: candidates.filter((candidate) => ["extracted", "pending_translation"].includes(candidate.status)).length,
  awaitingReview: candidates.filter((candidate) => ["translated", "pending_review"].includes(candidate.status)).length,
  queueChanged
};

console.log(`Dictionary scan (${process.env.DICTIONARY_SCAN_MODE || "incremental"}): ${stats.publishedArticlesDiscovered} published, ${stats.articlesProcessed} reprocessed, ${stats.articlesSkippedValidCache} unchanged, ${stats.candidatesExtracted} candidates (${stats.newlyExtracted} new).`);
console.log(`Draft/unpublished skipped: ${skippedDraftOrUnpublished}; pages/non-articles skipped: ${skippedNonArticle}; future-dated skipped: ${skippedFutureDated}; queue: ${pendingPath}; changed: ${stats.queueChanged}.`);
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, Object.entries(stats).map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
}
