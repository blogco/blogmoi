import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import matter from "gray-matter";

const sourceDirectory = "src";
const pendingPath = "data/dictionary/pending.json";
const reviewedPath = "src/_data/dictionary-data.json";
const allowedLanguages = new Set(["vi", "ko", "en"]);
const stopTerms = new Set(["la", "là", "cua", "của", "va", "và", "co", "có", "duoc", "được", "de", "để", "cho", "trong", "the", "một", "những", "các", "with", "from", "this", "that", "blogmoi"]);

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

function languageFor(frontmatter, sourcePath) {
  const declared = String(frontmatter.lang || "").toLowerCase().split(/[-_]/)[0];
  if (allowedLanguages.has(declared)) return declared;
  const directory = sourcePath.split(sep)[0];
  if (["vi", "ko", "en"].includes(directory)) return directory;
  return "vi";
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

const [files, previousQueue, reviewedData] = await Promise.all([
  Promise.all(["posts", "en", "ko"].map((folder) => markdownFiles(join(sourceDirectory, folder)))).then((groups) => groups.flat()),
  readJson(pendingPath, { version: 1, candidates: [] }),
  readJson(reviewedPath, { version: 1, entries: [] })
]);
const previous = new Map((previousQueue.candidates || []).map((candidate) => [candidate.id, candidate]));
const reviewed = new Set((reviewedData.entries || [])
  .filter((entry) => entry.status === "reviewed")
  .map((entry) => `${entry.sourceArticle}\u0000${entry.sourceLanguage}\u0000${normalize(entry[entry.sourceLanguage])}`));
const candidates = [];

for (const file of files.sort()) {
  const source = await readFile(file, "utf8");
  const parsed = matter(source);
  const data = parsed.data || {};
  if (data.draft === true || data.published === false) continue;
  const relativePath = relative(sourceDirectory, file);
  const language = languageFor(data, relativePath);
  const sourceArticle = articlePath(data, relativePath);
  const field = asList(data.categories)[0] || "Khác";
  const articleHash = hash(source);
  const text = plainText(parsed.content);
  const fallback = `${data.title || ""}. ${data.description || ""}`;

  for (const term of candidateTerms(data, parsed.content)) {
    const key = `${sourceArticle}\u0000${language}\u0000${normalize(term)}`;
    if (reviewed.has(key)) continue;
    const id = hash(key).slice(0, 24);
    const old = previous.get(id);
    const unchanged = old?.articleHash === articleHash && old.term === term;
    candidates.push({
      id,
      term,
      sourceLanguage: language,
      field,
      sourceArticle,
      sourceContext: contextFor(term, text, fallback),
      articleHash,
      status: unchanged && old.translationDraft ? "pending_review" : "pending_translation",
      translationDraft: unchanged ? (old.translationDraft || null) : null,
      updatedAt: unchanged ? old.updatedAt : new Date().toISOString()
    });
  }
}

await mkdir(dirname(pendingPath), { recursive: true });
await writeFile(pendingPath, `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), candidates }, null, 2)}\n`);
console.log(`Extracted ${candidates.length} vocabulary candidates from ${files.length} published articles. Review queue: ${pendingPath}`);
