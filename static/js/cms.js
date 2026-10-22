import { unsplashProxyUrl } from "./cms-config.js";
import {
  articleWordCount,
  markdownRenderer,
  parseArticle,
  renderMarkdown,
  richTextToMarkdown,
  serializeArticle,
  splitList,
  suggestSlug
} from "./cms-core.js";

const OWNER = "blogco";
const REPO = "blogmoi";
const BRANCH = "main";
const API = "https://api.github.com";
const PATH_PREFIX = "/blogmoi/";
const DRAFT_KEY = "blogmoi.cms.drafts.v1";
const root = document.querySelector("[data-cms-root]");
const loginPanel = root.querySelector("[data-login-panel]");
const app = root.querySelector("[data-app]");
const tokenInput = root.querySelector("#github-token");
const loginStatus = root.querySelector("[data-login-status]");
const editorBody = root.querySelector("[data-article-body]");
const previewFrame = root.querySelector("[data-preview-frame]");
const fieldElements = [...root.querySelectorAll("[data-field]")];
const fieldMap = new Map(fieldElements.map((element) => [element.dataset.field, element]));
const state = { token: "", user: null, posts: [], article: null, modified: false, selectedPhoto: null, pendingUpload: null, randomSeen: new Set(), randomQuery: "", drafts: {}, topicBacklog: null };
const photoSearchCache = new Map();
const markdown = markdownRenderer();
let toastTimer = 0;
let searchTimer = 0;
let previewTimer = 0;
let recoveryTimer = 0;
let previewReady = false;

function status(element, message, kind = "") {
  if (!element) return;
  element.textContent = message;
  element.dataset.kind = kind;
}

function toast(message) {
  const element = root.querySelector("[data-toast]");
  element.textContent = message;
  element.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { element.hidden = true; }, 4200);
}

function tokenHeaders(extra = {}) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${state.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    ...extra
  };
}

async function github(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: tokenHeaders(options.headers || {})
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || `GitHub returned HTTP ${response.status}.`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function decodeBase64Utf8(value) {
  const bytes = Uint8Array.from(atob(String(value).replace(/\s/g, "")), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const step = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += step) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + step, bytes.length)));
  }
  return btoa(binary);
}

async function verifyToken(value) {
  state.token = value;
  const user = await github("/user");
  const repository = await github(`/repos/${OWNER}/${REPO}`);
  if (repository.permissions?.push !== true) throw new Error("This token can read the repository but does not have write access.");
  state.user = user;
  return user;
}

async function readPost(file) {
  const response = await github(`/repos/${OWNER}/${REPO}/contents/${encodePath(file.path)}?ref=${encodeURIComponent(BRANCH)}`);
  const parsed = parseArticle(decodeBase64Utf8(response.content));
  return { path: file.path, sha: response.sha, metadata: parsed.metadata, body: parsed.body };
}

async function listPostFiles(directory = "src/posts") {
  const entries = await github(`/repos/${OWNER}/${REPO}/contents/${encodePath(directory)}?ref=${encodeURIComponent(BRANCH)}`);
  const files = entries.filter((entry) => entry.type === "file" && entry.name.endsWith(".md"));
  const directories = entries.filter((entry) => entry.type === "dir");
  const nested = await Promise.all(directories.map((entry) => listPostFiles(entry.path)));
  return [...files, ...nested.flat()];
}

async function loadRepository() {
  const articleFiles = await listPostFiles();
  const results = new Array(articleFiles.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(8, articleFiles.length) }, async () => {
    while (next < articleFiles.length) {
      const index = next++;
      const entry = articleFiles[index];
      try { results[index] = await readPost(entry); }
      catch (error) { results[index] = { path: entry.path, error: error.message }; }
    }
  }));
  state.posts = results.filter((entry) => entry.metadata).sort((a, b) => String(b.metadata.date || "").localeCompare(String(a.metadata.date || "")));
  const backlog = await github(`/repos/${OWNER}/${REPO}/contents/data/editorial-topic-suggestions.json?ref=${encodeURIComponent(BRANCH)}`).then((entry) => JSON.parse(decodeBase64Utf8(entry.content))).catch(() => null);
  state.topicBacklog = backlog?.suggestions || [];
  state.drafts = readDrafts();
  renderWorkspace();
}

function readDrafts() {
  try {
    const value = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function writeDrafts() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state.drafts));
    updateCounts();
  } catch {
    toast("Browser storage is full. Copy this draft before leaving the page.");
  }
}

function postStatus(post) {
  return post.metadata.draft ? "Draft" : "Published";
}

function htmlEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function postRow(post, extra = "") {
  const title = post.metadata?.title || post.slug || post.path;
  const slug = post.metadata?.slug || post.path?.split("/").pop()?.replace(/\.md$/, "") || "";
  const date = String(post.metadata?.date || "").slice(0, 10);
  const summary = [postStatus(post), date, slug, ...(post.metadata?.tags || []).slice(0, 3)].filter(Boolean).join(" · ");
  const deleteButton = extra === "delete" ? `<button type="button" data-delete-draft="${htmlEscape(post.draftKey)}">Delete draft</button>` : "";
  const href = `${PATH_PREFIX}${encodeURIComponent(slug)}/`;
  return `<article class="cms-post-row"><div><h2>${htmlEscape(title)}</h2><p>${htmlEscape(summary)}</p></div><div class="cms-post-actions"><button type="button" data-edit-post="${htmlEscape(post.path || "")}" ${post.path ? "" : `data-draft-key="${htmlEscape(post.draftKey)}"`}>Edit</button>${post.path && !post.metadata?.draft ? `<a href="${href}" target="_blank" rel="noopener">View</a>` : ""}${deleteButton}${post.path ? `<button type="button" data-delete-post="${htmlEscape(post.path)}">Delete</button>` : ""}</div></article>`;
}

function renderWorkspace() {
  const published = state.posts.filter((post) => !post.metadata.draft);
  const rows = published.map((post) => postRow(post)).join("") || '<p class="cms-info-card">No published articles found.</p>';
  root.querySelector("[data-post-list]").innerHTML = rows;
  root.querySelector("[data-recent-posts]").innerHTML = published.slice(0, 4).map((post) => postRow(post)).join("") || '<p class="cms-info-card">No published articles found.</p>';
  root.querySelector("[data-media-list]").innerHTML = state.posts.map((post) => postRow(post)).join("");
  const repositoryDrafts = state.posts.filter((post) => post.metadata.draft).map((post) => postRow(post)).join("");
  const localDrafts = Object.entries(state.drafts).map(([key, draft]) => postRow({ metadata: draft.metadata, path: "", draftKey: key }, "delete")).join("");
  root.querySelector("[data-draft-list]").innerHTML = repositoryDrafts + localDrafts || '<p class="cms-info-card">No drafts yet.</p>';
  updateCounts();
  root.querySelector("[data-user-name]").textContent = state.user?.login || "Connected";
  root.querySelector("[data-settings-user]").textContent = `Signed in to GitHub as ${state.user?.login || ""}.`;
  root.querySelector("[data-unsplash-setup]").textContent = unsplashProxyUrl
    ? `Proxy configured at ${unsplashProxyUrl}. Search is available when the Worker has its Unsplash Access Key secret.`
    : "No proxy is configured. Configure the Worker secret and set unsplashProxyUrl in static/js/cms-config.js to enable search.";
}

function updateCounts() {
  const published = state.posts.filter((post) => !post.metadata.draft).length;
  const drafts = Object.keys(state.drafts).length + state.posts.filter((post) => post.metadata.draft).length;
  root.querySelector("[data-post-count]").textContent = `(${published})`;
  root.querySelector("[data-draft-count]").textContent = `(${drafts})`;
  root.querySelector("[data-dashboard-posts]").textContent = String(published);
  root.querySelector("[data-dashboard-drafts]").textContent = String(drafts);
}

function showView(name) {
  for (const view of root.querySelectorAll("[data-page]")) view.hidden = view.dataset.page !== name;
  for (const button of root.querySelectorAll("[data-view]")) button.classList.toggle("is-active", button.dataset.view === name);
}

function emptyMetadata() {
  return {
    title: "",
    slug: "",
    description: "",
    date: new Date().toISOString().slice(0, 10),
    lang: "vi",
    author: "Blogmoi",
    categories: [],
    tags: []
  };
}

function dateInputValue(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  return String(value || "").slice(0, 10);
}

function openEditor(article, draftKey = "") {
  state.article = {
    path: article.path || "",
    baseSha: article.sha || article.baseSha || null,
    metadata: structuredClone(article.metadata || emptyMetadata()),
    body: article.body || "",
    draftKey: draftKey || article.draftKey || article.metadata.slug || `new-${crypto.randomUUID()}`,
    originalDate: article.metadata?.date || "",
    uploadMissing: Boolean(article.uploadMissing)
  };
  clearPendingUpload();
  state.modified = false;
  root.querySelector("[data-editor-state]").textContent = article.path ? `Editing ${article.metadata.slug}` : draftKey ? "Recovered local draft" : "New article";
  for (const element of fieldElements) {
    const key = element.dataset.field;
    const value = state.article.metadata[key];
    if (key === "categories" || key === "tags" || key === "dictionaryTerms") element.value = Array.isArray(value) ? value.join(", ") : "";
    else if (key === "keyPoints") element.value = Array.isArray(value) ? value.join("\n") : "";
    else if (key === "date" || key === "sourcePublicationDate") element.value = dateInputValue(value);
    else element.value = value ?? "";
  }
  fieldMap.get("slug").readOnly = Boolean(article.path);
  fieldMap.get("slug").title = article.path ? "Published URL is preserved to avoid breaking existing links." : "Slug becomes the published article URL.";
  renderFaq(state.article.metadata.faq || []);
  editorBody.innerHTML = renderMarkdown(state.article.body);
  updateCover();
  updateMetrics();
  updateSeoPreview();
  updateValidation();
  updateRelatedSuggestions();
  updatePreview();
  showView("editor");
  if (state.article.uploadMissing) toast("This local draft referenced an uploaded image. Select that file again before publishing.");
}

function renderFaq(faq) {
  const list = root.querySelector("[data-faq-list]");
  list.replaceChildren();
  for (const item of Array.isArray(faq) ? faq : []) addFaq(item.question || "", item.answer || "");
}

function addFaq(question = "", answer = "") {
  const row = document.createElement("div");
  row.className = "cms-faq-item";
  row.innerHTML = '<label>Question<input type="text" data-faq-question></label><label>Answer<textarea rows="2" data-faq-answer></textarea></label><button class="button button--quiet" type="button" data-remove-faq aria-label="Remove Q&A">Remove</button>';
  row.querySelector("[data-faq-question]").value = question;
  row.querySelector("[data-faq-answer]").value = answer;
  root.querySelector("[data-faq-list]").append(row);
}

function currentBody() {
  return richTextToMarkdown(editorBody);
}

function currentMetadata() {
  const metadata = structuredClone(state.article?.metadata || emptyMetadata());
  for (const [key, element] of fieldMap) {
    const value = element.value.trim();
    if (["categories", "tags", "dictionaryTerms"].includes(key)) {
      const items = splitList(value);
      if (items.length) metadata[key] = items;
      else delete metadata[key];
    } else if (key === "keyPoints") {
      const items = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      if (items.length) metadata[key] = items;
      else delete metadata[key];
    } else if (key === "date" && state.article?.originalDate && value === dateInputValue(state.article.originalDate)) {
      metadata.date = state.article.originalDate;
    } else if (value) metadata[key] = value;
    else if (["coverAttribution"].includes(key)) continue;
    else delete metadata[key];
  }
  const faq = [...root.querySelectorAll("[data-faq-question]")].map((question) => ({
    question: question.value.trim(),
    answer: question.closest(".cms-faq-item").querySelector("[data-faq-answer]").value.trim()
  })).filter((item) => item.question || item.answer);
  if (faq.length) metadata.faq = faq;
  else delete metadata.faq;
  if (metadata.cover !== (state.article?.metadata?.cover || "")) delete metadata.coverAttribution;
  if (metadata.seoTitle === metadata.title) delete metadata.seoTitle;
  if (metadata.seoDescription === metadata.description) delete metadata.seoDescription;
  return metadata;
}

function markModified() {
  if (!state.article) return;
  state.modified = true;
  updateMetrics();
  updateSeoPreview();
  updateValidation();
  updateCover();
  schedulePreview();
  window.clearTimeout(recoveryTimer);
  recoveryTimer = window.setTimeout(saveRecoveryDraft, 400);
}

function updateMetrics() {
  const count = articleWordCount(currentBody());
  root.querySelector("[data-word-count]").textContent = `${count} ${count === 1 ? "word" : "words"}`;
  root.querySelector("[data-reading-time]").textContent = `${Math.max(1, Math.ceil(count / 220))} min read`;
}

function updateSeoPreview() {
  const metadata = currentMetadata();
  root.querySelector("[data-seo-title]").textContent = metadata.seoTitle || metadata.title || "Article title";
  root.querySelector("[data-seo-slug]").textContent = metadata.slug || "slug";
  root.querySelector("[data-seo-description]").textContent = metadata.seoDescription || metadata.description || "Article description";
}

function safeCoverUrl(value) {
  if (!value) return "";
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch { return ""; }
}

function safeWebUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch { return ""; }
}

function siteCoverUrl(value) {
  const safe = safeCoverUrl(value);
  if (!safe || /^https:\/\//.test(safe)) return safe;
  const withoutPrefix = safe.replace(/^\/+/, "");
  return safe.startsWith(PATH_PREFIX) ? safe : `${PATH_PREFIX}${withoutPrefix}`;
}

function updateCover() {
  const preview = root.querySelector("[data-cover-preview]");
  const url = state.pendingUpload?.previewUrl || siteCoverUrl(fieldMap.get("cover").value.trim());
  preview.replaceChildren();
  if (!url) {
    const label = document.createElement("span");
    label.textContent = "No cover selected";
    preview.append(label);
  } else {
    const image = document.createElement("img");
    image.src = url;
    image.alt = fieldMap.get("coverAlt").value.trim();
    image.loading = "lazy";
    preview.append(image);
  }
  const attribution = currentMetadata().coverAttribution;
  const line = root.querySelector("[data-cover-attribution]");
  line.replaceChildren();
  if (attribution?.photographer) {
    line.append(document.createTextNode("Photo by "));
    const photographerUrl = safeWebUrl(attribution.photographerUrl);
    const photographer = photographerUrl ? document.createElement("a") : document.createElement("span");
    if (photographerUrl) { photographer.href = photographerUrl; photographer.target = "_blank"; photographer.rel = "noopener noreferrer"; }
    photographer.textContent = attribution.photographer;
    const photoUrl = safeWebUrl(attribution.photoUrl);
    const source = photoUrl ? document.createElement("a") : document.createElement("span");
    if (photoUrl) { source.href = photoUrl; source.target = "_blank"; source.rel = "noopener noreferrer"; }
    source.textContent = "Unsplash";
    line.append(photographer, document.createTextNode(" on "), source);
  }
  root.querySelector("[data-cover-state]").textContent = state.pendingUpload ? "Upload ready to commit" : url ? "Current cover" : "Fallback image on article cards";
}

function clearPendingUpload() {
  if (state.pendingUpload?.previewUrl) URL.revokeObjectURL(state.pendingUpload.previewUrl);
  state.pendingUpload = null;
}

function updateValidation() {
  const metadata = currentMetadata();
  const checks = [
    ["Title is required", Boolean(metadata.title)],
    ["Slug uses lowercase kebab case", Boolean(metadata.slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.slug))],
    ["Description is required", Boolean(metadata.description)],
    ["Date is valid", Boolean(metadata.date && !Number.isNaN(Date.parse(metadata.date)))],
    ["At least one category is recommended", Boolean(metadata.categories?.length)],
    ["Cover has descriptive alt text", !metadata.cover || Boolean(metadata.coverAlt)],
    ["Key points contain 3–5 reviewed items", !metadata.keyPoints?.length || (metadata.keyPoints.length >= 3 && metadata.keyPoints.length <= 5)],
    ["Q&A contains 3–5 reviewed items", !metadata.faq?.length || (metadata.faq.length >= 3 && metadata.faq.length <= 5)],
    ["No other article uses this slug", !state.posts.some((post) => post.path !== state.article?.path && (post.metadata.slug || post.path.split("/").pop().replace(/\.md$/, "")) === metadata.slug)]
  ];
  const target = root.querySelector("[data-validation]");
  target.innerHTML = `<strong>Publish checks</strong><ul>${checks.map(([label, valid]) => `<li data-valid="${valid}">${valid ? "✓" : "•"} ${htmlEscape(label)}</li>`).join("")}</ul>`;
}

function updateRelatedSuggestions() {
  const metadata = currentMetadata();
  const related = state.posts.filter((post) => post.path !== state.article?.path && (post.metadata.categories || []).some((category) => (metadata.categories || []).includes(category))).slice(0, 3);
  const target = root.querySelector("[data-related-posts]");
  target.textContent = related.length ? `Related by Blogmoi category logic: ${related.map((post) => post.metadata.title).join(" · ")}` : "No category-related posts yet.";
}

function schedulePreview() {
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(updatePreview, 300);
}

function articleTopics(doc, metadata) {
  const sidebar = doc.querySelector(".article-sidebar");
  if (!sidebar) return;
  sidebar.replaceChildren();
  const headings = [...doc.querySelectorAll(".article-content__body h2, .article-content__body h3")];
  const used = new Map();
  const tocItems = headings.map((heading) => {
    const base = suggestSlug(heading.textContent) || "section";
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    heading.id = count ? `${base}-${count + 1}` : base;
    return { id: heading.id, level: Number(heading.tagName[1]), title: heading.textContent };
  });
  const sections = [];
  if (tocItems.length) {
    const section = document.createElement("section");
    section.className = "article-sidebar__section";
    section.setAttribute("aria-labelledby", "article-toc-title");
    const h2 = document.createElement("h2"); h2.id = "article-toc-title"; h2.textContent = "Mục lục bài viết";
    const nav = document.createElement("nav"); nav.className = "toc"; nav.setAttribute("aria-label", "Mục lục");
    const eyebrow = document.createElement("p"); eyebrow.className = "eyebrow"; eyebrow.textContent = "Trong bài viết";
    const list = document.createElement("ol");
    for (const item of tocItems) {
      const li = document.createElement("li"); li.className = `toc-level-${item.level}`;
      const a = document.createElement("a"); a.href = `#${item.id}`; a.textContent = item.title;
      li.append(a); list.append(li);
    }
    nav.append(eyebrow, list); section.append(h2, nav); sections.push(section);
  }
  const categories = [...(metadata.categories || []), ...(metadata.tags || []).filter((tag) => tag.toLowerCase() !== "posts")];
  if (categories.length) {
    const section = document.createElement("section"); section.className = "article-sidebar__section article-sidebar__section--topics";
    const h2 = document.createElement("h2"); h2.id = "article-topics-title"; h2.textContent = "Chủ đề liên quan";
    const list = document.createElement("ul"); list.className = "topic-pills";
    for (const topic of categories) {
      const li = document.createElement("li"); const a = document.createElement("a");
      const isCategory = (metadata.categories || []).includes(topic);
      a.href = `${PATH_PREFIX}${isCategory ? "categories" : "tags"}/${suggestSlug(topic)}/`;
      a.textContent = topic; li.append(a); list.append(li);
    }
    section.setAttribute("aria-labelledby", "article-topics-title"); section.append(h2, list); sections.push(section);
  }
  sidebar.append(...sections);
}

function renderPreviewSource(doc, metadata) {
  const sourcePanel = doc.querySelector(".source-panel");
  if (!sourcePanel) return;
  const details = sourcePanel.querySelector(".source-details");
  details.replaceChildren();
  const rows = [
    ["Tác giả gốc", metadata.originalAuthor], ["Đơn vị xuất bản", metadata.sourcePublisher],
    ["Nguồn", metadata.sourceUrl], ["Ngày xuất bản nguồn", metadata.sourcePublicationDate], ["Bản quyền", metadata.copyrightHolder]
  ].filter(([, value]) => value);
  for (const [label, value] of rows) {
    const row = document.createElement("div"); const dt = document.createElement("dt"); dt.textContent = label; const dd = document.createElement("dd");
    if (label === "Nguồn") {
      const href = safeWebUrl(value);
      if (href) { const a = document.createElement("a"); a.href = href; a.textContent = value; a.rel = "noopener noreferrer"; dd.append(a); }
      else dd.textContent = value;
    } else dd.textContent = value;
    row.append(dt, dd); details.append(row);
  }
  sourcePanel.querySelectorAll(".source-note").forEach((note) => note.remove());
  for (const key of ["editorialNote", "copyrightNotice"]) if (metadata[key]) { const note = document.createElement("p"); note.className = "source-note"; note.textContent = metadata[key]; sourcePanel.append(note); }
  sourcePanel.querySelector(".component-empty")?.remove();
  if (!rows.length && !metadata.editorialNote && !metadata.copyrightNotice) {
    const empty = document.createElement("p"); empty.className = "component-empty"; empty.textContent = "Thông tin nguồn và bản quyền chưa được cung cấp cho bài viết này."; sourcePanel.append(empty);
  }
}

function renderPreviewFaq(doc, metadata) {
  const panel = doc.querySelector(".faq-panel");
  if (!panel) return;
  const old = panel.querySelector(".faq-list");
  if (old) old.remove();
  panel.querySelector(".component-empty")?.remove();
  const items = Array.isArray(metadata.faq) ? metadata.faq : [];
  if (!items.length) {
    const empty = document.createElement("p"); empty.className = "component-empty"; empty.textContent = "Chưa có câu hỏi được biên tập dựa trên nội dung bài viết."; panel.append(empty); return;
  }
  const list = document.createElement("div"); list.className = "faq-list";
  for (const item of items) {
    const details = document.createElement("details"); details.className = "faq-item";
    const summary = document.createElement("summary"); const question = document.createElement("span"); question.textContent = item.question || "";
    const icon = document.createElement("span"); icon.className = "faq-item__icon"; icon.setAttribute("aria-hidden", "true"); summary.append(question, icon);
    const answer = document.createElement("div"); answer.className = "faq-item__answer"; answer.textContent = item.answer || "";
    details.append(summary, answer); list.append(details);
  }
  panel.append(list);
}

function normalizeText(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function previewTopicSuggestions(metadata, related) {
  const slug = metadata.slug || "";
  const relatedSlugs = new Set(related.map((post) => post.metadata.slug));
  const suggestions = [];
  const seen = new Set();
  let topicCount = 0;
  for (const item of state.topicBacklog || []) {
    if (item.status === "rejected" || !(item.sourceArticles || []).includes(slug) || seen.has(item.id)) continue;
    seen.add(item.id);
    const terms = (item.match?.allTerms || []).map(normalizeText).filter(Boolean);
    let candidate = null;
    if (item.publishedArticleSlug) candidate = state.posts.find((post) => post.metadata.slug === item.publishedArticleSlug);
    if (!candidate && terms.length >= 2) {
      candidate = state.posts.filter((post) => post.metadata.slug !== slug && (post.metadata.categories || []).some((category) => (metadata.categories || []).includes(category)))
        .filter((post) => terms.every((term) => ` ${normalizeText([post.metadata.title, post.metadata.slug, post.metadata.description, post.metadata.categories, post.metadata.tags, post.metadata.keyPoints, post.metadata.faq].join(" "))} `.includes(` ${term} `)))
        .sort((a, b) => String(b.metadata.date || "").localeCompare(String(a.metadata.date || "")))[0];
    }
    if (candidate && candidate.metadata.slug !== slug && !relatedSlugs.has(candidate.metadata.slug)) {
      suggestions.push({ kind: "published", title: candidate.metadata.title, description: candidate.metadata.description, slug: candidate.metadata.slug, priority: item.priority || "medium" });
    } else {
      const rationale = item.connections?.[slug];
      if (!rationale || !item.title || topicCount >= 2) continue;
      topicCount += 1;
      suggestions.push({ kind: "topic", title: item.title, rationale, priority: item.priority || "medium" });
    }
  }
  const order = { high: 0, medium: 1, low: 2 };
  return suggestions.sort((a, b) => (a.kind === "published" ? 0 : 1) - (b.kind === "published" ? 0 : 1) || (order[a.priority] ?? 1) - (order[b.priority] ?? 1) || a.title.localeCompare(b.title, "vi")).slice(0, 4);
}

function renderPreviewTopics(doc, metadata, related) {
  const existing = doc.querySelector(".topic-discovery-panel");
  const suggestions = previewTopicSuggestions(metadata, related);
  if (!suggestions.length) { existing?.remove(); return; }
  const panel = existing || doc.createElement("section");
  panel.className = "article-panel topic-discovery-panel";
  panel.replaceChildren();
  const heading = doc.createElement("div"); heading.className = "article-panel__heading";
  const number = doc.createElement("span"); number.className = "article-panel__number"; number.textContent = "04";
  const title = doc.createElement("h2"); title.textContent = "Khám phá tiếp chủ đề này"; heading.append(number, title);
  const intro = doc.createElement("p"); intro.className = "topic-discovery__intro"; intro.textContent = "Muốn tìm hiểu sâu hơn? Khám phá những góc nhìn liên quan đến nội dung bạn vừa đọc.";
  const grid = doc.createElement("ul"); grid.className = "topic-discovery__grid";
  for (const item of suggestions) {
    const card = doc.createElement("li"); card.className = `topic-discovery-card${item.kind === "published" ? " topic-discovery-card--published" : ""}`;
    const label = doc.createElement("p"); label.className = "topic-discovery__label"; label.textContent = item.kind === "published" ? "Đã có bài viết" : "Chủ đề có thể bạn quan tâm";
    const h3 = doc.createElement("h3"); h3.textContent = item.title; card.append(label, h3);
    if (item.description || item.rationale) { const description = doc.createElement("p"); description.className = "topic-discovery__description"; description.textContent = item.description || item.rationale; card.append(description); }
    if (item.slug) { const link = doc.createElement("a"); link.className = "topic-discovery__link"; link.href = `${PATH_PREFIX}${item.slug}/`; link.textContent = "Đọc bài viết →"; card.append(link); }
    grid.append(card);
  }
  panel.append(heading, intro, grid);
  const endmatter = doc.querySelector(".article-endmatter"); if (endmatter && !existing) endmatter.append(panel);
}

function updatePreview() {
  if (!state.article) return;
  const doc = previewFrame.contentDocument;
  if (!doc || !doc.querySelector(".article-content__body")) return;
  previewReady = true;
  const metadata = currentMetadata();
  const body = currentBody();
  doc.title = `${metadata.seoTitle || metadata.title || "Article"} · Blogmoi`;
  const h1 = doc.querySelector(".article-hero h1"); if (h1) h1.textContent = metadata.title || "Article title";
  const deck = doc.querySelector(".article-deck"); if (deck) deck.textContent = metadata.description || "Article description";
  const content = doc.querySelector(".article-content__body"); content.innerHTML = renderMarkdown(body);
  const publishedDate = doc.querySelector(".article-byline time");
  if (publishedDate && metadata.date) { publishedDate.dateTime = new Date(metadata.date).toISOString(); publishedDate.textContent = new Intl.DateTimeFormat("vi-VN", { dateStyle: "long", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(metadata.date)); }
  const cover = doc.querySelector(".article-hero__media");
  const coverUrl = state.pendingUpload?.previewUrl || siteCoverUrl(metadata.cover);
  if (cover) {
    cover.replaceChildren();
    if (coverUrl) {
      cover.classList.remove("article-hero__media--empty");
      const image = doc.createElement("img"); image.src = coverUrl; image.alt = metadata.coverAlt || ""; image.width = 1440; image.height = 810; image.fetchPriority = "high";
      cover.append(image);
      if (metadata.coverAttribution?.photographer) {
        const caption = doc.createElement("figcaption"); caption.append(doc.createTextNode("Photo by "));
        const photographerUrl = safeWebUrl(metadata.coverAttribution.photographerUrl);
        const photoUrl = safeWebUrl(metadata.coverAttribution.photoUrl);
        const photographer = photographerUrl ? doc.createElement("a") : doc.createElement("span");
        if (photographerUrl) { photographer.href = photographerUrl; photographer.rel = "noopener noreferrer"; }
        photographer.textContent = metadata.coverAttribution.photographer;
        const source = photoUrl ? doc.createElement("a") : doc.createElement("span");
        if (photoUrl) { source.href = photoUrl; source.rel = "noopener noreferrer"; }
        source.textContent = "Unsplash";
        caption.append(photographer, doc.createTextNode(" on "), source); cover.append(caption);
      }
    } else { cover.classList.add("article-hero__media--empty"); const label = doc.createElement("span"); label.textContent = "Blogmoi"; cover.append(label); }
  }
  const category = metadata.categories?.[0] || "";
  const kicker = doc.querySelector(".article-kicker");
  if (kicker) { kicker.textContent = category; kicker.href = `${PATH_PREFIX}categories/${suggestSlug(category)}/`; kicker.hidden = !category; }
  const byline = doc.querySelector(".article-byline");
  if (byline) {
    const spans = [...byline.querySelectorAll("span")].filter((item) => !item.classList.contains("byline-separator"));
    const author = spans.find((item) => item.textContent === "Blogmoi" || item.dataset.cmsAuthor);
    if (author) { author.textContent = metadata.author || "Blogmoi"; author.dataset.cmsAuthor = "true"; }
    const categoryLink = byline.querySelector("a");
    if (categoryLink) { categoryLink.textContent = category; categoryLink.href = `${PATH_PREFIX}categories/${suggestSlug(category)}/`; categoryLink.hidden = !category; }
    const readingTime = spans.find((item) => item.textContent.includes("phút đọc"));
    if (readingTime) readingTime.textContent = `${Math.max(1, Math.ceil(articleWordCount(body) / 220))} phút đọc`;
  }
  const breadcrumbs = doc.querySelector(".article-breadcrumbs ol");
  if (breadcrumbs) {
    const home = doc.createElement("li"); const homeLink = doc.createElement("a"); homeLink.href = PATH_PREFIX; homeLink.textContent = "Trang chủ"; home.append(homeLink);
    const crumbs = [home];
    for (const item of (metadata.categories || []).slice(0, 2)) {
      const li = doc.createElement("li"); const link = doc.createElement("a"); link.href = `${PATH_PREFIX}categories/${suggestSlug(item)}/`; link.textContent = item; li.append(link); crumbs.push(li);
    }
    const current = doc.createElement("li"); current.setAttribute("aria-current", "page"); current.textContent = metadata.title || "Article title"; crumbs.push(current);
    breadcrumbs.replaceChildren(...crumbs);
  }
  const canonical = doc.querySelector('link[rel="canonical"]'); if (canonical) canonical.href = metadata.canonical || `https://blogco.github.io${PATH_PREFIX}${metadata.slug || ""}/`;
  const metaDescription = doc.querySelector('meta[name="description"]'); if (metaDescription) metaDescription.content = metadata.seoDescription || metadata.description || "";
  const ogTitle = doc.querySelector('meta[property="og:title"]'); if (ogTitle) ogTitle.content = `${metadata.seoTitle || metadata.title || "Article"} · Blogmoi`;
  const ogDescription = doc.querySelector('meta[property="og:description"]'); if (ogDescription) ogDescription.content = metadata.seoDescription || metadata.description || "";
  const ogImage = doc.querySelector('meta[property="og:image"]'); if (ogImage && coverUrl) ogImage.content = /^https:\/\//.test(coverUrl) ? coverUrl : `https://blogco.github.io${coverUrl}`;
  const points = Array.isArray(metadata.keyPoints) ? metadata.keyPoints : [];
  const keypointList = doc.querySelector(".keypoints ol");
  if (keypointList) { keypointList.replaceChildren(...points.map((point) => { const li = doc.createElement("li"); li.textContent = point; return li; })); }
  const keypointEmpty = doc.querySelector(".keypoints .component-empty");
  if (points.length) keypointEmpty?.remove();
  else if (!keypointEmpty) { const empty = doc.createElement("p"); empty.className = "component-empty"; empty.textContent = "Điểm chính sẽ xuất hiện khi được biên tập từ nội dung bài viết."; doc.querySelector(".keypoints")?.append(empty); }
  articleTopics(doc, metadata);
  renderPreviewSource(doc, metadata);
  renderPreviewFaq(doc, metadata);
  const internalPanel = doc.querySelector(".internal-panel");
  if (internalPanel) {
    const relatedList = internalPanel.querySelector(".internal-links-list");
    const categories = metadata.categories || [];
    const related = state.posts.filter((post) => post.path !== state.article.path && (post.metadata.categories || []).some((category) => categories.includes(category))).slice(0, 3);
    internalPanel.querySelector(".component-empty")?.remove();
    relatedList?.remove();
    if (related.length) {
      const list = doc.createElement("ul"); list.className = "internal-links-list";
      list.replaceChildren(...related.map((post) => {
      const li = doc.createElement("li"); const link = doc.createElement("a"); link.href = `${PATH_PREFIX}${post.metadata.slug}/`;
      const category = doc.createElement("span"); category.textContent = post.metadata.categories?.[0] || "Góc nhìn";
      const title = doc.createElement("strong"); title.textContent = post.metadata.title || "";
      const date = doc.createElement("time"); date.textContent = String(post.metadata.date || "").slice(0, 10); link.append(category, title, date); li.append(link); return li;
      }));
      internalPanel.append(list);
    } else {
      const empty = doc.createElement("p"); empty.className = "component-empty"; empty.textContent = "Không có liên kết nội bộ.";
      internalPanel.append(empty);
    }
    renderPreviewTopics(doc, metadata, related);
  }
}

function currentArticleForSave() {
  const metadata = currentMetadata();
  metadata.slug = metadata.slug || suggestSlug(metadata.title);
  metadata.draft = false;
  if (state.article.path && state.modified) metadata.lastModified = new Date().toISOString();
  return { metadata, body: currentBody() };
}

function validForPublish(article) {
  const { metadata, body } = article;
  const errors = [];
  if (!metadata.title?.trim()) errors.push("Add a title.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.slug || "")) errors.push("Use a lowercase kebab case slug.");
  if (!metadata.description?.trim()) errors.push("Add a description.");
  if (!metadata.date || Number.isNaN(Date.parse(metadata.date))) errors.push("Add a valid date.");
  if (metadata.cover && !safeCoverUrl(metadata.cover)) errors.push("Cover URL must be HTTPS or a root-relative path.");
  if (metadata.cover && !metadata.coverAlt?.trim()) errors.push("Add descriptive cover alt text.");
  if (metadata.sourceUrl && !safeWebUrl(metadata.sourceUrl)) errors.push("Source URL must use HTTPS or HTTP.");
  if (metadata.keyPoints?.length && (metadata.keyPoints.length < 3 || metadata.keyPoints.length > 5)) errors.push("Use 3–5 editor reviewed key points.");
  if (metadata.faq?.length && (metadata.faq.length < 3 || metadata.faq.length > 5)) errors.push("Use 3–5 editor reviewed Q&A items.");
  if (body.length < 40) errors.push("Add article content before publishing.");
  if (!metadata.categories?.length) errors.push("Add at least one category.");
  const duplicate = state.posts.find((post) => post.path !== state.article.path && (post.metadata.slug || post.path.split("/").pop().replace(/\.md$/, "")) === metadata.slug);
  if (duplicate) errors.push(`Slug already exists in ${duplicate.path}.`);
  return errors;
}

function draftKey(article) {
  return article.draftKey || article.path || article.metadata.slug || `new-${crypto.randomUUID()}`;
}

function saveRecoveryDraft() {
  if (!state.article) return;
  const value = currentArticleForSave();
  const key = draftKey(state.article);
  value.metadata.draft = true;
  state.drafts[key] = { ...value, path: state.article.path, baseSha: state.article.baseSha, draftKey: key, updatedAt: new Date().toISOString(), uploadMissing: Boolean(state.pendingUpload || state.article.uploadMissing) };
  state.article.draftKey = key;
  writeDrafts();
}

function saveDraft() {
  if (!state.article) return;
  saveRecoveryDraft();
  state.modified = false;
  renderWorkspace();
  toast("Draft saved in this browser.");
}

function askToLeave() {
  if (!state.modified) return true;
  return window.confirm("There are unsaved changes. Leave the editor? A recovery copy is saved in this browser.");
}

async function latestPathSha(path, ref = BRANCH) {
  try {
    const result = await github(`/repos/${OWNER}/${REPO}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`);
    return result.sha;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function createCommit(changes, message, guard = null) {
  const ref = await github(`/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
  const headSha = ref.object.sha;
  if (guard && await latestPathSha(guard.path, headSha) !== guard.expectedSha) {
    throw new Error("This post changed on GitHub while the commit was being prepared. Reload it before publishing.");
  }
  const head = await github(`/repos/${OWNER}/${REPO}/git/commits/${headSha}`);
  const entries = [];
  for (const change of changes) {
    if (change.delete) {
      entries.push({ path: change.path, mode: "100644", type: "blob", sha: null });
      continue;
    }
    const blob = await github(`/repos/${OWNER}/${REPO}/git/blobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: change.content, encoding: change.encoding || "utf-8" })
    });
    entries.push({ path: change.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const tree = await github(`/repos/${OWNER}/${REPO}/git/trees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base_tree: head.tree.sha, tree: entries })
  });
  const commit = await github(`/repos/${OWNER}/${REPO}/git/commits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, tree: tree.sha, parents: [headSha] })
  });
  await github(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sha: commit.sha, force: false })
  });
  return commit;
}

async function publish() {
  if (!state.article) return;
  const article = currentArticleForSave();
  const errors = validForPublish(article);
  if (errors.length) { status(root.querySelector("[data-publish-status]"), errors.join(" "), "error"); toast(errors[0]); return; }
  if (!window.confirm(`Publish “${article.metadata.title}” to the main branch? This creates a GitHub commit and starts the Pages deployment.`)) return;
  const output = root.querySelector("[data-publish-status]");
  status(output, "Checking for concurrent edits…");
  try {
    const path = state.article.path || `src/posts/${article.metadata.slug}.md`;
    const remoteSha = await latestPathSha(path);
    if (remoteSha !== state.article.baseSha) throw new Error("This post changed on GitHub since you opened it. Reload the post before publishing; no changes were written.");
    const changes = [{ path, content: serializeArticle(article.metadata, article.body), encoding: "utf-8" }];
    if (state.pendingUpload) changes.push({ path: state.pendingUpload.path, content: bufferToBase64(await state.pendingUpload.file.arrayBuffer()), encoding: "base64" });
    status(output, "Creating one commit…");
    const commit = await createCommit(changes, `content(posts): ${state.article.path ? "update" : "publish"} ${article.metadata.slug}`, { path, expectedSha: state.article.baseSha });
    state.modified = false;
    delete state.drafts[draftKey(state.article)];
    writeDrafts();
    status(output, `Committed ${commit.sha.slice(0, 7)}. GitHub Actions is starting the site build.`, "success");
    state.article = null;
    showView("posts");
    await showDeploymentStatus(commit.sha, root.querySelector("[data-deployment-status]"));
    try { await loadRepository(); }
    catch { toast(`Commit ${commit.sha.slice(0, 7)} is saved. The post list could not be refreshed.`); }
  } catch (error) {
    status(output, error.message || "Publish failed. The current branch was not overwritten.", "error");
  }
}

async function showDeploymentStatus(commitSha, target) {
  target.innerHTML = `Commit <a href="https://github.com/${OWNER}/${REPO}/commit/${commitSha}" target="_blank" rel="noopener">${commitSha.slice(0, 7)}</a> saved. <button type="button" data-refresh-deploy="${commitSha}">Check build status</button>`;
  const button = target.querySelector("[data-refresh-deploy]");
  button.addEventListener("click", async () => {
    status(target, "Checking GitHub Actions…");
    try {
      const result = await github(`/repos/${OWNER}/${REPO}/actions/runs?head_sha=${commitSha}&per_page=1`);
      const run = result.workflow_runs?.[0];
      if (!run) { status(target, "Commit saved. GitHub Actions has not reported a run yet."); return; }
      const link = document.createElement("a"); link.href = run.html_url; link.target = "_blank"; link.rel = "noopener"; link.textContent = `${run.name}: ${run.status}${run.conclusion ? ` · ${run.conclusion}` : ""}`;
      target.replaceChildren(document.createTextNode(`Commit ${commitSha.slice(0, 7)} · `), link);
    } catch (error) {
      status(target, `Commit saved. Build status unavailable (${error.status === 403 ? "add Actions read permission to the token" : error.message}).`, "error");
    }
  });
}

async function deletePost(path) {
  const post = state.posts.find((entry) => entry.path === path);
  if (!post || !window.confirm(`Delete “${post.metadata.title}” (${path}) from the repository? This publishes a deletion commit.`)) return;
  try {
    const latestSha = await latestPathSha(path);
    if (latestSha !== post.sha) throw new Error("The post changed on GitHub. Reload before deleting.");
    const commit = await createCommit([{ path, delete: true }], `content(posts): delete ${post.metadata.slug || path.split("/").pop()}`, { path, expectedSha: post.sha });
    toast(`Deleted in commit ${commit.sha.slice(0, 7)}.`);
    await loadRepository();
  } catch (error) { toast(error.message || "Could not delete post."); }
}

function selectPhoto(photo) {
  state.selectedPhoto = photo;
  const target = root.querySelector("[data-selected-photo]");
  target.replaceChildren();
  const image = document.createElement("img"); image.src = photo.urls.small; image.alt = photo.alt_description || photo.description || "Selected Unsplash photo";
  const copy = document.createElement("p"); copy.textContent = `${photo.user.name} · Unsplash`;
  target.append(image, copy); target.hidden = false;
  root.querySelector("[data-use-photo]").disabled = false;
  for (const button of root.querySelectorAll("[data-photo-id]")) button.setAttribute("aria-pressed", String(button.dataset.photoId === photo.id));
}

function renderPhotos(photos) {
  const grid = root.querySelector("[data-photo-grid]"); grid.replaceChildren();
  for (const photo of photos) {
    const button = document.createElement("button"); button.type = "button"; button.className = "cms-photo-option"; button.dataset.photoId = photo.id; button.setAttribute("aria-label", `Select photo by ${photo.user.name}`); button.setAttribute("aria-pressed", "false");
    const image = document.createElement("img"); image.src = photo.urls.small; image.alt = photo.alt_description || photo.description || "Unsplash photo"; image.loading = "lazy"; button.append(image);
    button.addEventListener("click", () => selectPhoto(photo)); grid.append(button);
  }
}

function setUnsplashOpen(open) {
  root.querySelector("[data-unsplash-panel]").hidden = !open;
  if (open && !unsplashProxyUrl) status(root.querySelector("[data-unsplash-status]"), "Unsplash is not configured. Set a Worker URL and its Access Key secret; manual cover selection remains available.", "error");
}

async function unsplashRequest(path, options = {}) {
  if (!unsplashProxyUrl) throw new Error("Unsplash proxy is not configured. Add the Cloudflare Worker URL in cms-config.js and set its Access Key secret.");
  const response = await fetch(`${unsplashProxyUrl.replace(/\/$/, "")}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${state.token}`, ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Unsplash service returned HTTP ${response.status}.`);
  return body;
}

function searchQuery() {
  const metadata = currentMetadata();
  return [metadata.title, ...(metadata.tags || []).slice(0, 2), ...(metadata.categories || []).slice(0, 1)].filter(Boolean).join(" ").slice(0, 100);
}

async function searchUnsplash(query) {
  const target = root.querySelector("[data-unsplash-status]");
  const cacheKey = query.trim().toLocaleLowerCase("en");
  const cached = photoSearchCache.get(cacheKey);
  state.selectedPhoto = null;
  root.querySelector("[data-selected-photo]").replaceChildren();
  root.querySelector("[data-selected-photo]").hidden = true;
  root.querySelector("[data-use-photo]").disabled = true;
  root.querySelector("[data-photo-grid]").replaceChildren();
  if (cached && Date.now() - cached.at < 180_000) {
    renderPhotos(cached.photos);
    status(target, `${cached.photos.length} cached photos. Images are served directly from Unsplash.`, "success");
    return;
  }
  status(target, "Searching Unsplash…");
  try {
    const results = await unsplashRequest(`/api/unsplash/search?query=${encodeURIComponent(query)}&orientation=landscape&per_page=12`);
    if (!results.results?.length) { renderPhotos([]); status(target, "No photos match that search. Try another topic.", "error"); return; }
    photoSearchCache.set(cacheKey, { at: Date.now(), photos: results.results });
    renderPhotos(results.results);
    status(target, `${results.results.length} photos. Images are served directly from Unsplash.` , "success");
  } catch (error) { status(target, error.message, "error"); }
}

async function randomUnsplash() {
  const target = root.querySelector("[data-unsplash-status]");
  const query = searchQuery();
  state.selectedPhoto = null;
  root.querySelector("[data-selected-photo]").replaceChildren();
  root.querySelector("[data-selected-photo]").hidden = true;
  root.querySelector("[data-use-photo]").disabled = true;
  root.querySelector("[data-photo-grid]").replaceChildren();
  if (state.randomQuery !== query) { state.randomQuery = query; state.randomSeen = new Set(); }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      status(target, "Finding a relevant image…");
      const result = await unsplashRequest(`/api/unsplash/random?query=${encodeURIComponent(query)}&orientation=landscape`);
      const photo = result.photo;
      if (!state.randomSeen.has(photo?.id)) { state.randomSeen.add(photo.id); renderPhotos([photo]); selectPhoto(photo); status(target, "Random Unsplash result. Review it, then choose Use selected image.", "success"); return; }
    } catch (error) { status(target, error.message, "error"); return; }
  }
  status(target, "Unsplash returned the same result repeatedly. Search the topic to see other candidates.", "error");
}

function addUnsplashAttribution(metadata, photo) {
  const profile = new URL(photo.user.links.html);
  profile.searchParams.set("utm_source", "blogmoi"); profile.searchParams.set("utm_medium", "referral");
  const photoUrl = new URL(photo.links.html);
  photoUrl.searchParams.set("utm_source", "blogmoi"); photoUrl.searchParams.set("utm_medium", "referral");
  metadata.coverAttribution = { photographer: photo.user.name, photographerUrl: profile.href, photoUrl: photoUrl.href };
  metadata.cover = photo.urls.regular;
  metadata.coverAlt = photo.alt_description || photo.description || metadata.title || "Unsplash photo";
}

async function useSelectedPhoto() {
  if (!state.selectedPhoto || !state.article) return;
  const photo = state.selectedPhoto;
  const target = root.querySelector("[data-unsplash-status]");
  status(target, "Recording Unsplash download event…");
  try {
    await unsplashRequest("/api/unsplash/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ download_location: photo.links.download_location }) });
    clearPendingUpload();
    const metadata = currentMetadata(); addUnsplashAttribution(metadata, photo);
    state.article.metadata = metadata;
    state.article.uploadMissing = false;
    for (const key of ["cover", "coverAlt"]) fieldMap.get(key).value = metadata[key];
    state.modified = true;
    updateCover(); updateSeoPreview(); schedulePreview(); saveRecoveryDraft(); setUnsplashOpen(false);
    status(target, "Cover selected with attribution.", "success");
  } catch (error) { status(target, error.message, "error"); }
}

async function uploadCover(file) {
  if (!file) return;
  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
  if (!allowed.has(file.type) || file.size > 5 * 1024 * 1024) { toast("Choose a JPEG, PNG, WebP or AVIF image under 5 MB."); return; }
  let image;
  try { image = await createImageBitmap(file); } catch { toast("That image file could not be opened."); return; }
  if (image.width > 9000 || image.height > 9000) { image.close(); toast("Image dimensions must be at most 9000 × 9000 pixels."); return; }
  image.close();
  clearPendingUpload();
  const slug = fieldMap.get("slug").value.trim() || suggestSlug(fieldMap.get("title").value) || "article";
  const extension = file.type.split("/")[1].replace("jpeg", "jpg");
  const name = `${slug}-${Date.now()}.${extension}`;
  state.pendingUpload = { file, path: `static/uploads/${name}`, url: `/uploads/${name}` };
  fieldMap.get("cover").value = state.pendingUpload.url;
  if (!fieldMap.get("coverAlt").value.trim()) fieldMap.get("coverAlt").value = fieldMap.get("title").value.trim();
  const localUrl = URL.createObjectURL(file);
  state.pendingUpload.previewUrl = localUrl;
  root.querySelector("[data-cover-preview]").innerHTML = "";
  const preview = document.createElement("img"); preview.src = localUrl; preview.alt = fieldMap.get("coverAlt").value; root.querySelector("[data-cover-preview]").append(preview);
  state.article.metadata.cover = state.pendingUpload.url;
  state.article.uploadMissing = false;
  delete state.article.metadata.coverAttribution;
  state.modified = true; updateCover(); updatePreview(); saveRecoveryDraft();
  toast("Image validated. It will be committed with the article when you publish.");
}

function removeDraft(key) {
  if (!window.confirm("Delete this local draft from this browser?")) return;
  delete state.drafts[key]; writeDrafts(); renderWorkspace();
}

async function login() {
  const value = tokenInput.value.trim();
  if (!value) { status(loginStatus, "Enter your GitHub token.", "error"); return; }
  status(loginStatus, "Checking GitHub identity and repository write access…");
  try {
    const user = await verifyToken(value);
    tokenInput.value = "";
    loginPanel.hidden = true; app.hidden = false;
    root.querySelector("[data-user-name]").textContent = user.login;
    status(loginStatus, "");
    await loadRepository();
    showView("dashboard");
  } catch (error) {
    loginPanel.hidden = false;
    app.hidden = true;
    state.token = "";
    state.user = null;
    status(loginStatus, error.status === 401 ? "GitHub rejected this token. Check it and try again." : error.message, "error");
  }
}

function logout() {
  if (!askToLeave()) return;
  state.token = ""; state.user = null; state.posts = []; state.article = null; state.modified = false;
  state.selectedPhoto = null; clearPendingUpload(); previewReady = false;
  app.hidden = true; loginPanel.hidden = false; tokenInput.value = ""; tokenInput.focus();
}

function newPost() {
  if (!askToLeave()) return;
  const metadata = emptyMetadata();
  openEditor({ metadata, body: "\n" });
}

function editPath(path) {
  if (!askToLeave()) return;
  const post = state.posts.find((entry) => entry.path === path);
  if (post) openEditor(post);
}

function suggestDescription() {
  const text = currentBody().replace(/```[\s\S]*?```/g, " ").replace(/[#>*_`\[\]()]|\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const sentence = text.split(/(?<=[.!?])\s/u)[0] || "";
  fieldMap.get("description").value = sentence.slice(0, 210).trim();
  markModified();
}

function insertLink() {
  const value = window.prompt("Link URL (https://…)");
  if (!value) return;
  let url;
  try { url = new URL(value); } catch { toast("Enter a valid URL."); return; }
  if (!(["https:", "http:"].includes(url.protocol))) { toast("Only HTTP and HTTPS links are supported."); return; }
  const selection = window.getSelection();
  const label = selection?.toString() || url.hostname;
  const link = document.createElement("a"); link.href = url.href; link.textContent = label;
  if (selection?.rangeCount) { const range = selection.getRangeAt(0); range.deleteContents(); range.insertNode(link); }
  else editorBody.append(link);
  markModified();
}

function insertImage() {
  const value = window.prompt("Image URL (HTTPS or /uploads/…)");
  if (!value || !safeCoverUrl(value)) { if (value) toast("Use an HTTPS or root-relative image URL."); return; }
  const alt = window.prompt("Image alt text") || "";
  const image = document.createElement("img"); image.src = value; image.alt = alt;
  const selection = window.getSelection(); if (selection?.rangeCount) selection.getRangeAt(0).insertNode(image); else editorBody.append(image);
  markModified();
}

function insertTable() {
  const rows = Number(window.prompt("Table rows (2–8)", "3"));
  const columns = Number(window.prompt("Table columns (2–6)", "3"));
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 2 || rows > 8 || columns < 2 || columns > 6) return;
  const table = document.createElement("table");
  const head = document.createElement("thead"); const header = document.createElement("tr");
  for (let col = 0; col < columns; col += 1) { const cell = document.createElement("th"); cell.textContent = `Header ${col + 1}`; header.append(cell); }
  head.append(header); table.append(head); const body = document.createElement("tbody");
  for (let row = 1; row < rows; row += 1) { const tr = document.createElement("tr"); for (let col = 0; col < columns; col += 1) { const td = document.createElement("td"); td.textContent = `Cell ${row}, ${col + 1}`; tr.append(td); } body.append(tr); }
  table.append(body); const range = window.getSelection()?.getRangeAt(0); if (range) range.insertNode(table); else editorBody.append(table); markModified();
}

function insertCode() {
  const language = window.prompt("Code language (optional)", "js") || "";
  const pre = document.createElement("pre"); const code = document.createElement("code"); if (language) code.className = `language-${language.replace(/[^a-z0-9_-]/gi, "")}`; code.textContent = "Write code here"; pre.append(code);
  const range = window.getSelection()?.getRangeAt(0); if (range) range.insertNode(pre); else editorBody.append(pre); markModified();
}

function handleInput(event) {
  if (event.target.matches("[data-field]")) {
    const key = event.target.dataset.field;
    if (key === "cover") {
      if (state.pendingUpload && event.target.value.trim() !== state.pendingUpload.url) clearPendingUpload();
      state.article.uploadMissing = false;
    }
    if (key === "title" && !state.article.path && !fieldMap.get("slug").value) fieldMap.get("slug").value = suggestSlug(event.target.value);
    if (key === "title" && !fieldMap.get("coverAlt").value) fieldMap.get("coverAlt").value = event.target.value;
    markModified();
  } else if (event.target === editorBody || event.target.matches("[data-faq-question], [data-faq-answer]")) markModified();
}

root.addEventListener("click", async (event) => {
  const target = event.target.closest("button"); if (!target) return;
  if (target.matches("[data-login]")) return login();
  if (target.matches("[data-logout]")) return logout();
  if (target.matches("[data-view]")) { if (root.querySelector('[data-page="editor"]:not([hidden])') && !askToLeave()) return; state.article = null; return showView(target.dataset.view); }
  if (target.matches("[data-new-post]")) return newPost();
  if (target.matches("[data-edit-post]") && target.dataset.editPost) return editPath(target.dataset.editPost);
  if (target.matches("[data-draft-key]") && target.dataset.draftKey) {
    if (!askToLeave()) return;
    const key = target.dataset.draftKey; const draft = state.drafts[key];
    if (draft) openEditor({ ...draft, uploadMissing: draft.uploadMissing }, key);
    return;
  }
  if (target.matches("[data-delete-draft]")) return removeDraft(target.dataset.deleteDraft);
  if (target.matches("[data-delete-post]")) return deletePost(target.dataset.deletePost);
  if (target.matches("[data-save-draft]")) return saveDraft();
  if (target.matches("[data-publish]")) return publish();
  if (target.matches("[data-preview]")) { showView("editor"); previewFrame.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  if (target.matches("[data-cancel-editor]")) { if (askToLeave()) { state.article = null; showView("posts"); } return; }
  if (target.matches("[data-suggest-slug]")) { fieldMap.get("slug").value = suggestSlug(fieldMap.get("title").value); markModified(); return; }
  if (target.matches("[data-suggest-description]")) { suggestDescription(); return; }
  if (target.matches("[data-add-faq]")) { addFaq(); markModified(); return; }
  if (target.matches("[data-remove-faq]")) { target.closest(".cms-faq-item").remove(); markModified(); return; }
  if (target.matches("[data-command]")) { editorBody.focus(); document.execCommand(target.dataset.command, false, target.dataset.value || null); markModified(); return; }
  if (target.matches("[data-block]")) { editorBody.focus(); document.execCommand("formatBlock", false, target.dataset.block); markModified(); return; }
  if (target.matches("[data-insert-link]")) return insertLink();
  if (target.matches("[data-insert-image]")) return insertImage();
  if (target.matches("[data-insert-table]")) return insertTable();
  if (target.matches("[data-insert-code]")) return insertCode();
  if (target.matches("[data-auto-suggest]")) { setUnsplashOpen(true); if (unsplashProxyUrl) await searchUnsplash(searchQuery()); return; }
  if (target.matches("[data-open-search]")) { setUnsplashOpen(true); root.querySelector("[data-unsplash-query]").focus(); return; }
  if (target.matches("[data-random]")) { setUnsplashOpen(true); return randomUnsplash(); }
  if (target.matches("[data-use-photo]")) return useSelectedPhoto();
  if (target.matches("[data-upload-image]")) { root.querySelector("[data-image-file]").click(); return; }
});

root.addEventListener("input", handleInput);
root.querySelector("[data-post-search]").addEventListener("input", (event) => {
  const query = event.target.value.trim().toLocaleLowerCase("vi");
  for (const row of root.querySelectorAll("[data-post-list] .cms-post-row")) row.hidden = !row.textContent.toLocaleLowerCase("vi").includes(query);
});
root.querySelector("[data-unsplash-form]").addEventListener("submit", (event) => { event.preventDefault(); const query = root.querySelector("[data-unsplash-query]").value.trim(); if (query.length >= 2) searchUnsplash(query); });
root.querySelector("[data-unsplash-query]").addEventListener("input", (event) => {
  window.clearTimeout(searchTimer); const query = event.target.value.trim();
  if (query.length >= 2) searchTimer = window.setTimeout(() => searchUnsplash(query), 450);
});
root.querySelector("[data-image-file]").addEventListener("change", (event) => uploadCover(event.target.files?.[0]));
editorBody.addEventListener("paste", (event) => {
  event.preventDefault(); const text = event.clipboardData?.getData("text/plain") || ""; document.execCommand("insertText", false, text); markModified();
});
previewFrame.addEventListener("load", () => { previewReady = true; updatePreview(); });
window.addEventListener("beforeunload", (event) => { if (state.modified) { saveRecoveryDraft(); event.preventDefault(); event.returnValue = ""; } });

// Keep format commands scoped to the visual article body.
for (const button of root.querySelectorAll("[data-command], [data-block]")) button.addEventListener("mousedown", (event) => event.preventDefault());
