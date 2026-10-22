import { appendFile, readFile } from "node:fs/promises";

async function json(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch { return fallback; }
}

const [queue, dictionary, publicIndex, publicCandidates] = await Promise.all([
  json("data/dictionary/pending.json", { candidates: [], lastRun: {} }),
  json("src/_data/dictionary-data.json", { entries: [] }),
  json("_site/dictionary-index.json", []),
  json("_site/dictionary-candidates.json", [])
]);
const candidates = Array.isArray(queue.candidates) ? queue.candidates : [];
const entries = Array.isArray(dictionary.entries) ? dictionary.entries : [];
const index = Array.isArray(publicIndex) ? publicIndex : (publicIndex.entries || publicIndex.index || []);
const lastRun = queue.lastRun || {};
const published = entries.filter((entry) => ["reviewed", "published"].includes(entry.status)).length;
const extractOutcome = process.env.EXTRACT_OUTCOME || "unknown";
const importOutcome = process.env.IMPORT_OUTCOME || "skipped";
const persistOutcome = process.env.PERSIST_OUTCOME || "unknown";
const deployOutcome = process.env.DEPLOY_OUTCOME || "unknown";
const indexConsistent = index.length === published;
const candidatesConsistent = Array.isArray(publicCandidates) && publicCandidates.length === candidates.filter((candidate) => candidate.status === "extracted").length;
const rows = [
  ["Published articles scanned", lastRun.articlesDiscovered || 0],
  ["Articles re-extracted", lastRun.articlesProcessed || 0],
  ["Articles skipped by hash", lastRun.articlesSkippedValidCache || 0],
  ["Vocabulary candidates", lastRun.candidatesExtracted ?? candidates.length],
  ["New candidates this run", lastRun.newlyExtracted || 0],
  ["Waiting for manual translation", candidates.filter((candidate) => candidate.status === "extracted").length],
  ["Published entries in source JSON", published],
  ["Entries in built search index", index.length],
  ["Candidates in built list", publicCandidates.length],
  ["Import translations", importOutcome.toUpperCase()],
  ["Vocabulary extraction", extractOutcome.toUpperCase()],
  ["Persist before build", persistOutcome.toUpperCase()],
  ["GitHub Pages deployment", deployOutcome.toUpperCase()]
];
const width = Math.max("DICTIONARY PIPELINE REPORT".length, ...rows.map(([label]) => label.length));
const rule = `+${"-".repeat(width + 2)}+${"-".repeat(30)}+`;
const report = [
  rule,
  `| ${"DICTIONARY PIPELINE REPORT".padEnd(width)} | ${"RESULT".padEnd(28)} |`,
  rule,
  ...rows.map(([label, value]) => `| ${label.padEnd(width)} | ${String(value).slice(0, 28).padEnd(28)} |`),
  rule
].join("\n");
console.log(report);

let notes = "";
if (!indexConsistent) notes += `\nBuild mismatch: ${published} published source entries but ${index.length} public entries.\n`;
if (!candidatesConsistent) notes += `\nBuild mismatch: ${candidates.length} persistent candidates do not match ${publicCandidates.length} public candidates.\n`;
if (importOutcome === "failure") notes += "\nThe submitted translations were rejected. No dictionary files were committed.\n";
if (extractOutcome !== "success") notes += "\nVocabulary extraction failed. Check the extraction step.\n";
if (persistOutcome !== "success") notes += "\nDictionary files were not confirmed in the repository before build.\n";
if (deployOutcome !== "success") notes += "\nGitHub Pages deployment did not complete successfully.\n";
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n\n\`\`\`text\n${report}\n\`\`\`${notes}\n`);

if (extractOutcome !== "success" || importOutcome === "failure" || persistOutcome !== "success" || deployOutcome !== "success" || !indexConsistent || !candidatesConsistent) {
  process.exitCode = 1;
}
