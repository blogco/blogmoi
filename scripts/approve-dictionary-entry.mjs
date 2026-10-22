import { readFile, writeFile } from "node:fs/promises";

const queuePath = "data/dictionary/pending.json";
const dictionaryPath = "src/_data/dictionary-data.json";
const idArg = process.argv.find((arg) => arg.startsWith("--id="));
const id = idArg?.slice("--id=".length).trim();
const explicitlyApproved = process.argv.includes("--approve");

if (!id || !explicitlyApproved) {
  console.error("Usage: npm run dictionary:approve -- --id=<candidate-id> --approve");
  process.exit(2);
}

const [queue, dictionary] = await Promise.all([
  readFile(queuePath, "utf8").then(JSON.parse),
  readFile(dictionaryPath, "utf8").then(JSON.parse)
]);
const candidateIndex = queue.candidates.findIndex((candidate) => candidate.id === id);
if (candidateIndex < 0) throw new Error(`Candidate ${id} was not found in ${queuePath}.`);
const candidate = queue.candidates[candidateIndex];
const draft = candidate.translationDraft;
if (!draft || !["translated", "pending_review"].includes(candidate.status)) {
  throw new Error(`Candidate ${id} has not been translated. Review is blocked until a complete draft exists.`);
}
if (draft.uncertain) throw new Error(`Candidate ${id} is flagged as uncertain. Resolve the ambiguity in the draft before approving it.`);

const languages = ["vi", "ko", "en"];
if (languages.some((language) => typeof draft[language] !== "string" || !draft[language].trim())) throw new Error("All three language values must be present.");
if (languages.some((language) => typeof draft.examples?.[language] !== "string" || !draft.examples[language].trim())) throw new Error("A reviewed example in Vietnamese, Korean and English is required.");
if (typeof draft.definition !== "string" || !draft.definition.trim()) throw new Error("A reviewed Vietnamese definition is required.");
if (!candidate.sourceArticle?.startsWith("/") || candidate.sourceArticle.startsWith("//") || !candidate.sourceContext?.trim()) throw new Error("The source article and source context are required.");

const entry = {
  id: candidate.id,
  vi: draft.vi.trim(),
  ko: draft.ko.trim(),
  en: draft.en.trim(),
  definition: draft.definition.trim(),
  examples: Object.fromEntries(languages.map((language) => [language, draft.examples[language].trim()])),
  relatedExpressions: Array.isArray(draft.relatedExpressions) ? draft.relatedExpressions.map(String).map((value) => value.trim()).filter(Boolean) : [],
  field: candidate.field || "Khác",
  sourceLanguage: candidate.sourceLanguage,
  sourceArticle: candidate.sourceArticle,
  sourceContext: candidate.sourceContext,
  reviewedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  status: "reviewed"
};

const normalizedTuple = (item) => languages.map((language) => String(item[language] || "").normalize("NFC").toLocaleLowerCase("und").trim()).join("\u0000");
if (dictionary.entries.some((item) => normalizedTuple(item) === normalizedTuple(entry))) throw new Error("An identical trilingual entry already exists in the public data file.");

dictionary.version = dictionary.version || 1;
dictionary.entries.push(entry);
queue.candidates.splice(candidateIndex, 1);
for (const article of Object.values(queue.articleCache || {})) {
  article.candidateIds = (article.candidateIds || []).filter((candidateId) => candidateId !== id);
}
queue.generatedAt = new Date().toISOString();

await Promise.all([
  writeFile(dictionaryPath, `${JSON.stringify(dictionary, null, 2)}\n`),
  writeFile(queuePath, `${JSON.stringify(queue, null, 2)}\n`)
]);
console.log(`Approved ${entry.vi} / ${entry.ko} / ${entry.en}. It is now eligible for the public Eleventy build after these repository changes are committed and deployed.`);
