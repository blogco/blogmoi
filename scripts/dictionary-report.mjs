import { readFile, writeFile } from "node:fs/promises";

async function json(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

const [queue, dictionary, publicIndex] = await Promise.all([
  json("data/dictionary/pending.json", { candidates: [] }),
  json("src/_data/dictionary-data.json", { entries: [] }),
  json("_site/dictionary-index.json", { entries: [] })
]);
const candidates = queue.candidates || [];
const entries = dictionary.entries || [];
const translated = candidates.filter((candidate) => ["translated", "pending_review"].includes(candidate.status)).length;
const translationFailed = candidates.filter((candidate) => candidate.status === "translation_failed").length;
const pending = candidates.filter((candidate) => ["extracted", "pending_translation"].includes(candidate.status)).length;
const approved = entries.filter((entry) => ["reviewed", "published"].includes(entry.status) || entry.reviewStatus === "reviewed").length;
const publicCount = (publicIndex.entries || publicIndex.index || []).length;
const get = (name, fallback = "0") => process.env[name] ?? fallback;
const translationState = process.env.TRANSLATION_CONFIGURED === "true" ? "configured" : "credentials missing";
const needsEditorialWork = translationFailed > 0 || pending > 0 || translated > 0;
const deployment = process.env.DEPLOY_OUTCOME === "success"
  ? (needsEditorialWork ? "DEPLOYED; TERMS PENDING" : "SUCCESS (GitHub Pages)")
  : (process.env.DEPLOY_OUTCOME || "NOT RUN").toUpperCase();
const rows = [
  ["Published articles discovered", get("PUBLISHEDARTICLES_DISCOVERED")],
  ["Articles scanned", get("ARTICLESSCANNED")],
  ["Articles skipped (valid cache)", get("ARTICLESSKIPPEDVALIDCACHE")],
  ["Vocabulary candidates extracted", get("CANDIDATESEXTRACTED", String(candidates.length))],
  ["Translation succeeded", get("TRANSLATED_THIS_RUN")],
  ["Translation failed / pending", String(translationFailed + pending)],
  ["Awaiting editorial review", String(translated)],
  ["Approved vocabulary entries", String(approved)],
  ["Entries in persistent review queue", String(candidates.length)],
  ["Public entries in build", String(publicCount)],
  ["Deployment status", deployment]
];
const width = Math.max("DICTIONARY BACKFILL REPORT".length, ...rows.map(([label]) => label.length));
const left = width + 2;
const line = `+${"-".repeat(left)}+${"-".repeat(28)}+`;
const report = [
  line,
  `| ${"DICTIONARY BACKFILL REPORT".padEnd(width)} | ${"RESULT".padEnd(26)} |`,
  line,
  ...rows.map(([label, value]) => `| ${label.padEnd(width)} | ${String(value).slice(0, 26).padEnd(26)} |`),
  line
].join("\n");
console.log(report);

const extracted = process.env.EXTRACT_OUTCOME === "success";
const persisted = process.env.PERSIST_OUTCOME === "success";
const deployed = process.env.DEPLOY_OUTCOME === "success";
const translationRunFailed = process.env.TRANSLATION_OUTCOME === "failure";
const manualBackfill = process.env.BACKFILL_MODE === "true";
const buildConsistent = publicCount === approved;
let summary = "\n\n```text\n" + report + "\n```\n\n";
if (!extracted) summary += "Dictionary extraction failed. Check the extraction step log.\n";
if (!persisted) summary += "The review queue did not persist to the repository. Check contents: write permission and branch protection.\n";
if (translationState === "credentials missing" && candidates.length) summary += "Translation is pending. Configure repository Actions secret OPENAI_API_KEY and variable DICTIONARY_OPENAI_MODEL, or edit candidate translations and approve locally.\n";
if (translationFailed) summary += "Some translation requests failed; those candidates remain retryable. Inspect translationError in the persisted review queue.\n";
if (translationRunFailed) summary += "The translation step returned an error. Its outcome and remaining retryable candidates are included above.\n";
if (translated) summary += "Translated drafts are still private until a human reviews and approves them.\n";
if (!buildConsistent) summary += `Build mismatch: ${approved} reviewed entries in source data, ${publicCount} entries in the generated public index.\n`;
if (!deployed) summary += "GitHub Pages deployment did not complete successfully.\n";
const complete = extracted && persisted && deployed && buildConsistent && !translationRunFailed && !needsEditorialWork;
summary += `\nDictionary pipeline result: ${complete ? "COMPLETE" : "INCOMPLETE"}. Translation provider state: ${translationState}.`;
if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, summary, { flag: "a" });

if (!extracted || !persisted || !deployed || !buildConsistent || (manualBackfill && (translationRunFailed || needsEditorialWork))) {
  if (manualBackfill && needsEditorialWork) console.error("Backfill is incomplete: translation and/or editorial approval remains pending; see the report and setup instructions.");
  process.exitCode = 1;
}
