import source from "./dictionary-data.json" with { type: "json" };

const pathPrefix = "/blogmoi/";
const requiredFields = ["id", "vi", "ko", "en", "field", "sourceLanguage", "sourceArticle", "updatedAt"];
const seen = new Set();

function normalize(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("und").trim().replace(/\s+/g, " ");
}

function publicEntry(entry) {
  if (!entry || !["reviewed", "published"].includes(entry.status)) return false;
  if (!requiredFields.every((field) => typeof entry[field] === "string" && entry[field].trim())) return false;
  if (entry.examples && (typeof entry.examples !== "object" || Object.values(entry.examples).some((value) => typeof value !== "string"))) return false;
  const hasExample = ["vi", "ko", "en"].some((language) => typeof entry.examples?.[language] === "string" && entry.examples[language].trim());
  if (!entry.sourceContext && !hasExample) return false;
  if (!/^\/(?!\/)/.test(entry.sourceArticle)) return false;
  const key = [entry.vi, entry.ko, entry.en].map(normalize).join("\u0000");
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

const entries = (Array.isArray(source.entries) ? source.entries : []).filter(publicEntry);
const fieldCounts = new Map();
const sourceArticles = new Set();

for (const entry of entries) {
  fieldCounts.set(entry.field, (fieldCounts.get(entry.field) || 0) + 1);
  sourceArticles.add(entry.sourceArticle);
}

const fields = [...fieldCounts.entries()]
  .map(([name, count]) => ({ name, count }))
  .sort((a, b) => a.name.localeCompare(b.name, "vi"));

const index = entries.map((entry) => ({
  id: entry.id,
  vi: entry.vi,
  ko: entry.ko,
  en: entry.en,
  definition: typeof entry.definition === "string" ? entry.definition : "",
  examples: entry.examples || { vi: "", ko: "", en: "" },
  relatedExpressions: Array.isArray(entry.relatedExpressions) ? entry.relatedExpressions : [],
  field: entry.field,
  sourceLanguage: entry.sourceLanguage,
  sourceArticle: pathPrefix + entry.sourceArticle.replace(/^\/+/, ""),
  sourceContext: entry.sourceContext || "",
  updatedAt: entry.updatedAt
}));

export default {
  version: source.version || 1,
  entries: index,
  index,
  fields,
  fieldCount: fields.length,
  entryCount: index.length,
  sourcePostCount: sourceArticles.size
};
