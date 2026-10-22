import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonAtomically } from "../lib/dictionary-storage.js";

const queuePath = "data/dictionary/pending.json";
const dictionaryPath = "src/_data/dictionary-data.json";
const languages = ["vi", "ko", "en"];
const allowedLanguages = new Set(languages);

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalize(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("und").trim().replace(/\s+/g, " ");
}

async function readDispatchPayload() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error("missing_GITHUB_EVENT_PATH");
  const event = JSON.parse(await readFile(eventPath, "utf8"));
  const raw = event.inputs?.dictionary_payload;
  if (typeof raw !== "string" || !raw.trim()) throw new Error("missing_dictionary_payload");
  if (raw.length > 65_000) throw new Error("dictionary_payload_too_large");
  return JSON.parse(raw);
}

async function loadJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function requiredText(value, label, maximum = 500) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maximum) throw new Error(`invalid_${label}`);
  return text;
}

function articleFilePath(articleId) {
  if (typeof articleId !== "string" || !/^(?:posts|en|ko)\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*\.md$/iu.test(articleId)) {
    throw new Error("invalid_article_id");
  }
  return join("src", articleId);
}

const payload = await readDispatchPayload();
if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("invalid_dictionary_payload");
const contentId = requiredText(payload.contentId, "content_id", 180);
const articleId = requiredText(payload.articleId, "article_id", 180);
const sourceLanguage = payload.sourceLanguage;
const articleHash = requiredText(payload.articleHash, "article_hash", 64);
if (!/^\/(?!\/)[^?#\s]*\/$/u.test(contentId)) throw new Error("invalid_content_id");
if (!allowedLanguages.has(sourceLanguage)) throw new Error("invalid_source_language");
if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 60) throw new Error("invalid_item_count");

const [queue, dictionary] = await Promise.all([
  loadJson(queuePath, { candidates: [], articleCache: {} }),
  loadJson(dictionaryPath, { version: 1, entries: [] })
]);
const articleCandidates = (queue.candidates || []).filter((candidate) => candidate.articleId === articleId);
if (!articleCandidates.length || articleCandidates[0].sourceArticle !== contentId || articleCandidates[0].sourceLanguage !== sourceLanguage) {
  throw new Error("article_not_in_current_candidate_queue");
}
if (articleCandidates.some((candidate) => candidate.articleHash !== articleHash)) throw new Error("stale_article_hash");

const source = await readFile(articleFilePath(articleId), "utf8");
if (hash(source) !== articleHash) throw new Error("source_article_changed_since_list_was_built");

const candidateById = new Map(articleCandidates.map((candidate) => [candidate.id, candidate]));
const seenIds = new Set();
const prepared = payload.items.map((item) => {
  if (!item || typeof item !== "object" || item.verified !== true) throw new Error("every_item_must_be_verified");
  const id = requiredText(item.id, "candidate_id", 24);
  if (seenIds.has(id)) throw new Error("duplicate_candidate_id_in_payload");
  seenIds.add(id);
  const candidate = candidateById.get(id);
  if (!candidate || candidate.sourceArticle !== contentId || candidate.articleHash !== articleHash || candidate.sourceLanguage !== sourceLanguage) {
    throw new Error(`unknown_or_stale_candidate_${id}`);
  }
  const translations = {};
  for (const language of languages) {
    translations[language] = language === sourceLanguage
      ? candidate.term
      : requiredText(item.translations?.[language], `translation_${language}`, 120);
  }
  const examples = { vi: "", ko: "", en: "" };
  examples[sourceLanguage] = candidate.sourceContext;
  for (const language of languages.filter((code) => code !== sourceLanguage)) {
    const example = item.examples?.[language];
    if (typeof example === "string" && example.trim()) examples[language] = example.trim().slice(0, 700);
  }
  const definition = typeof item.definition === "string" ? item.definition.trim().slice(0, 1000) : "";
  return { candidate, translations, examples, definition };
});

const entries = Array.isArray(dictionary.entries) ? [...dictionary.entries] : [];
const existingIds = new Set(entries.map((entry) => entry.id));
const existingTuples = new Set(entries.map((entry) => languages.map((language) => normalize(entry[language])).join("\u0000")));
const existingVocabulary = new Set(entries.flatMap((entry) => languages.map((language) => `${language}\u0000${normalize(entry[language])}`)));
const importedIds = [];
let duplicates = 0;

for (const { candidate, translations, examples, definition } of prepared) {
  const tuple = languages.map((language) => normalize(translations[language])).join("\u0000");
  const lexicalKeys = languages.map((language) => `${language}\u0000${normalize(translations[language])}`);
  if (existingIds.has(candidate.id) || existingTuples.has(tuple) || lexicalKeys.some((key) => existingVocabulary.has(key))) {
    duplicates += 1;
    continue;
  }
  const entry = {
    id: candidate.id,
    vi: translations.vi,
    ko: translations.ko,
    en: translations.en,
    definition,
    examples,
    relatedExpressions: [],
    field: candidate.field || "Khác",
    sourceLanguage,
    sourceArticle: contentId,
    articleId,
    sourceContext: candidate.sourceContext || "",
    articleHash,
    translationSource: "manual",
    status: "reviewed",
    reviewStatus: "reviewed",
    updatedAt: new Date().toISOString()
  };
  entries.push(entry);
  importedIds.push(candidate.id);
  existingIds.add(candidate.id);
  existingTuples.add(tuple);
  for (const key of lexicalKeys) existingVocabulary.add(key);
}

if (importedIds.length) {
  await writeJsonAtomically(dictionaryPath, {
    ...dictionary,
    version: Math.max(1, Number(dictionary.version) || 1),
    entries
  });
}

const report = [
  "+-------------------------------------+----------+",
  "| THỦ CÔNG CẬP NHẬT TỪ ĐIỂN          | KẾT QUẢ  |",
  "+-------------------------------------+----------+",
  `| Content ID                          | ${contentId.slice(0, 8).padEnd(8)} |`,
  `| Mục đã xác minh                     | ${String(prepared.length).padEnd(8)} |`,
  `| Mục mới ghi vào JSON                | ${String(importedIds.length).padEnd(8)} |`,
  `| Mục trùng được giữ nguyên           | ${String(duplicates).padEnd(8)} |`,
  "+-------------------------------------+----------+"
].join("\n");
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n\n\`\`\`text\n${report}\n\`\`\`\n`);
}
