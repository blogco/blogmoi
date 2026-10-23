import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import matter from "gray-matter";

export const COMPANIES_URL = "https://www.koreatimes.co.kr/business/companies";
const ARTICLE_PATH = /^\/business\/companies\/(\d{8})\/[a-z0-9-]+$/;

export function sourceUrl(value) {
  const url = new URL(value, COMPANIES_URL);
  if (url.origin !== new URL(COMPANIES_URL).origin || !ARTICLE_PATH.test(url.pathname) || url.username || url.password) {
    throw new Error("Only public Korea Times Companies article URLs are supported.");
  }
  return url.origin + url.pathname;
}

export function bangkokDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function readPublicationState(files, day) {
  const urls = new Set();
  let publishedToday = false;
  for (const file of files) {
    const { data } = matter(file);
    if (data.sourceUrl) urls.add(data.sourceUrl);
    if (data.scheduledNewsDate === day) publishedToday = true;
  }
  return { urls, publishedToday };
}

export function pickArticle(html, publishedUrls, day) {
  const dom = new JSDOM(html);
  try {
    const links = [...dom.window.document.querySelectorAll("a[href]")].flatMap(link => {
      try { return [sourceUrl(link.getAttribute("href"))]; } catch { return []; }
    });
    const candidates = [...new Set(links)].filter(url => {
      const date = ARTICLE_PATH.exec(new URL(url).pathname)[1];
      const isoDay = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`;
      const age = (Date.parse(day) - Date.parse(isoDay)) / 86400000;
      return age >= 0 && age <= 3 && !publishedUrls.has(url);
    });
    // Sort by the date in each validated path; preserve listing order within a day.
    candidates.sort((a, b) => ARTICLE_PATH.exec(new URL(b).pathname)[1].localeCompare(ARTICLE_PATH.exec(new URL(a).pathname)[1]));
    return candidates[0] || null;
  } finally { dom.window.close(); }
}

function structuredArticles(value) {
  if (Array.isArray(value)) return value.flatMap(structuredArticles);
  if (!value || typeof value !== "object") return [];
  const types = [value["@type"]].flat();
  return [...(types.some(type => /^(NewsArticle|Article|ReportageNewsArticle)$/.test(type)) ? [value] : []), ...structuredArticles(value["@graph"])];
}

export function extractArticle(html, url) {
  sourceUrl(url);
  const dom = new JSDOM(html);
  try {
    const document = dom.window.document;
    const objects = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(script => {
      try { return structuredArticles(JSON.parse(script.textContent)); } catch { return []; }
    });
    if (objects.some(item => String(item.isAccessibleForFree).toLowerCase() === "false")) {
      throw new Error("Source is marked paywalled; publication stopped.");
    }
    const metadata = objects.find(item => item.articleBody) || objects[0] || {};
    const title = metadata.headline || document.querySelector('meta[property="og:title"]')?.content || document.querySelector("h1")?.textContent;
    const publishedAt = metadata.datePublished || document.querySelector('meta[property="article:published_time"]')?.content;
    const container = document.querySelector('[itemprop="articleBody"], .article-body, #article-body, article');
    container?.querySelectorAll("script, style, nav, aside, form, figure, .related, .advertisement").forEach(node => node.remove());
    const body = String(metadata.articleBody || (container ? [...container.querySelectorAll("p")].map(p => p.textContent).join("\n\n") : "")).replace(/\r/g, "").trim();
    if (!title || !publishedAt || !Number.isFinite(Date.parse(publishedAt)) || body.length < 600 || body.length > 100000) {
      throw new Error("Cannot verify a complete public article and its publication date; publication stopped.");
    }
    return { url: sourceUrl(url), title: String(title).trim(), publishedAt, body };
  } finally { dom.window.close(); }
}

export async function fetchPublicHtml(url, fetchImpl = fetch) {
  const allowed = new URL(COMPANIES_URL).origin;
  for (let redirects = 0; redirects < 4; redirects++) {
    if (new URL(url).origin !== allowed) throw new Error("Source redirect outside the approved host.");
    const response = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(30000), headers: { "User-Agent": "BlogmoiNews/1.0 (+https://blogco.github.io/blogmoi/)" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      url = new URL(response.headers.get("location"), url).href;
      continue;
    }
    if (!response.ok) throw new Error(`Source request failed: HTTP ${response.status}.`);
    if (!response.headers.get("content-type")?.includes("text/html")) throw new Error("Source did not return HTML.");
    const reader = response.body.getReader();
    const parts = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2_000_000) { await reader.cancel(); throw new Error("Source response exceeded size limit."); }
      parts.push(Buffer.from(value));
    }
    return Buffer.concat(parts).toString("utf8");
  }
  throw new Error("Too many source redirects.");
}

export async function generateBrief(article, { python = process.env.NEWS_PYTHON || "python3" } = {}) {
  const runner = fileURLToPath(new URL("../news/local_brief.py", import.meta.url));
  const brief = await new Promise((resolve, reject) => {
    const child = spawn(python, [runner], { stdio: ["pipe", "pipe", "inherit"] });
    let output = "";
    const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Local news generation timed out.")); }, 600000);
    child.on("error", error => { clearTimeout(timeout); reject(error); });
    child.stdin.on("error", () => {});
    child.stdout.on("data", chunk => {
      output += chunk;
      if (output.length > 50000) { child.kill("SIGKILL"); reject(new Error("Local model output exceeded limit.")); }
    });
    child.on("close", code => {
      clearTimeout(timeout);
      if (code !== 0) return reject(new Error("Local models failed. Check Python dependencies, model downloads and source evidence."));
      try { resolve(JSON.parse(output)); } catch { reject(new Error("Local models returned invalid JSON.")); }
    });
    child.stdin.end(JSON.stringify(article));
  });
  return validateBrief(brief, article);
}

export function validateBrief(brief, article) {
  const safeText = (value, max) => typeof value === "string" && value.trim().length >= 10 && value.length <= max
    && !/[<>{}\[\]`#*_\\]|https?:\/\//u.test(value) && /[ăâđêôơưáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]/iu.test(value);
  if (!brief || !safeText(brief.title, 160) || !safeText(brief.description, 260) || !Array.isArray(brief.facts) || brief.facts.length < 1 || brief.facts.length > 5) throw new Error("Brief failed required format checks.");
  for (const text of [brief.title, brief.description]) {
    for (const number of text.match(/\d+(?:[.,]\d+)*/g) || []) {
      if (!article.body.includes(number)) throw new Error("Brief headline or description contains an ungrounded number.");
    }
  }
  for (const fact of brief.facts) {
    if (!safeText(fact.text, 650) || typeof fact.evidence !== "string" || fact.evidence.length < 40 || fact.evidence.length > 400 || !article.body.includes(fact.evidence)) {
      throw new Error("Brief contains unsupported evidence or unsafe text.");
    }
    // Numeric facts must be present in each paragraph's supporting evidence.
    for (const number of fact.text.match(/\d+(?:[.,]\d+)*/g) || []) {
      if (!fact.evidence.includes(number)) throw new Error("Brief contains an ungrounded number.");
    }
  }
  const words = brief.facts.map(fact => fact.text).join(" ").trim().split(/\s+/).length;
  if (words > 180 || words > article.body.split(/\s+/).length * 0.35) throw new Error("Brief is too long relative to the source.");
  return brief;
}

export function renderPost(brief, article, day, publishedAt = new Date().toISOString()) {
  if (!Number.isFinite(Date.parse(publishedAt)) || bangkokDay(new Date(publishedAt)) !== day) {
    throw new Error("Publication timestamp must match the Bangkok publication date.");
  }
  const hash = createHash("sha256").update(article.url).digest("hex").slice(0, 12);
  const slug = `koreatimes-${day}-${hash}`;
  const quote = value => JSON.stringify(value);
  return { filename: `${slug}.md`, content: `---\ntitle: ${quote(brief.title)}\nslug: ${slug}\ndescription: ${quote(brief.description)}\ndate: ${quote(publishedAt)}\nlastModified: ${day}\nlang: vi\nauthor: Blogmoi\ncategories:\n  - Kinh doanh\n  - Doanh nghiệp\ntags:\n  - Hàn Quốc\nsourcePublisher: "The Korea Times"\nsourceUrl: ${quote(article.url)}\nsourcePublicationDate: ${quote(article.publishedAt)}\nscheduledNewsDate: ${quote(day)}\neditorialNote: "Bản tin tiếng Việt được biên soạn tự động, tóm lược bằng lời riêng từ bài nguồn; không phải bản dịch toàn văn. Hãy đọc bài gốc để xem đầy đủ thông tin."\ncopyrightNotice: "Bài nguồn thuộc The Korea Times và các chủ thể được ghi trong bài gốc. Blogmoi không sử dụng lại ảnh hoặc toàn văn của nguồn."\n---\n\n${brief.facts.map(fact => fact.text).join("\n\n")}\n\nNguồn: [The Korea Times](${article.url}).\n` };
}
