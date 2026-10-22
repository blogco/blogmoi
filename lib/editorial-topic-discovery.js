import { topicIdeaRules } from "./topic-idea-rules.js";
import { readFileSync, writeFileSync } from "node:fs";

const backlogUrl = new URL("../data/editorial-topic-suggestions.json", import.meta.url);
const validStatuses = new Set(["proposed", "approved", "published", "rejected"]);
const priorityOrder = { high: 0, medium: 1, low: 2 };

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function containsTerm(text, term) {
  return ` ${text} `.includes(` ${term} `);
}

function valuesAsText(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(valuesAsText);
  if (typeof value === "object") return Object.values(value).flatMap(valuesAsText);
  return [String(value)];
}

function postSlug(post) {
  return String(post.data.slug || post.fileSlug || post.url.replace(/^\/+|\/+$/g, ""));
}

function postMetadataText(post) {
  const data = post.data || {};
  return normalizeText(valuesAsText([
    data.title,
    data.slug,
    data.description,
    data.categories,
    data.tags,
    data.keyPoints,
    data.faq
  ]).join(" "));
}

function readBacklog() {
  const backlog = JSON.parse(readFileSync(backlogUrl, "utf8"));
  if (!Array.isArray(backlog.suggestions)) {
    throw new TypeError("Editorial topic backlog must contain a suggestions array.");
  }

  const ids = new Set();
  for (const suggestion of backlog.suggestions) {
    if (!suggestion.id || ids.has(suggestion.id)) {
      throw new TypeError(`Editorial topic IDs must be present and unique: ${suggestion.id || "missing id"}`);
    }
    ids.add(suggestion.id);
    if (!validStatuses.has(suggestion.status)) {
      throw new TypeError(`Invalid editorial topic status for ${suggestion.id}: ${suggestion.status}`);
    }
  }
  return backlog;
}

function matchingPost(suggestion, posts) {
  const sourceSlugs = new Set(suggestion.sourceArticles || []);
  const terms = (suggestion.match?.allTerms || []).map(normalizeText).filter(Boolean);
  if (terms.length < 2) return null;

  const eligible = posts.filter((post) => !sourceSlugs.has(postSlug(post)));
  const pinned = eligible.find((post) => postSlug(post) === suggestion.publishedArticleSlug);
  if (pinned) return pinned;

  return eligible
    .filter((post) => {
      const searchable = postMetadataText(post);
      return terms.every((term) => containsTerm(searchable, term));
    })
    .sort((a, b) => {
      const aTitle = normalizeText(`${a.data.title || ""} ${a.data.slug || ""}`);
      const bTitle = normalizeText(`${b.data.title || ""} ${b.data.slug || ""}`);
      const aMatches = terms.filter((term) => containsTerm(aTitle, term)).length;
      const bMatches = terms.filter((term) => containsTerm(bTitle, term)).length;
      return bMatches - aMatches || b.date - a.date;
    })[0] || null;
}

export function syncEditorialTopicStatuses(posts) {
  const backlog = readBacklog();
  let changed = false;

  for (const suggestion of backlog.suggestions) {
    if (suggestion.status === "rejected") continue;
    const publishedPost = matchingPost(suggestion, posts);
    if (publishedPost) {
      const slug = postSlug(publishedPost);
      if (suggestion.status !== "published" || suggestion.publishedArticleSlug !== slug) {
        suggestion.status = "published";
        suggestion.publishedArticleSlug = slug;
        changed = true;
      }
    } else if (suggestion.status === "published") {
      suggestion.status = "proposed";
      delete suggestion.publishedArticleSlug;
      changed = true;
    }
  }

  if (changed) writeFileSync(backlogUrl, `${JSON.stringify(backlog, null, 2)}\n`);
}

function plainText(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/&(?:amp|lt|gt|quot|#39);/g, " ").replace(/\s+/g, " ").trim();
}

function contentSignals(post, content) {
  const data = post.data || {};
  const body = String(content || post.rawInput || "");
  const headings = [...body.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>|^#{1,6}\s+(.+)$/gim)]
    .map(match => plainText(match[1] || match[2]))
    .filter(label => !/^(?:\d+[. /-]*)?(?:kết luận|tài liệu|nguồn|liên kết|bản quyền)/iu.test(label));
  return {
    title: normalizeText(data.title),
    description: normalizeText(data.description),
    metadata: normalizeText(valuesAsText([data.categories, data.tags]).join(" ")),
    headings: normalizeText(headings.join(" ")),
    body: normalizeText(plainText(body)),
    labels: headings,
  };
}

function generatedIdeas(post, content) {
  const signals = contentSignals(post, content);
  const ranked = topicIdeaRules.map(rule => ({ rule, score: rule.terms.reduce((sum, term) => {
    const needle = normalizeText(term);
    return sum + [ [signals.title, 10], [signals.description, 5], [signals.headings, 4], [signals.metadata, 3], [signals.body, 1] ]
      .reduce((total, [haystack, weight]) => total + (containsTerm(haystack, needle) ? weight : 0), 0);
  }, 0) + (rule.id !== "ssg" && rule.terms.some(term => containsTerm(signals.title, normalizeText(term))) ? 1000 : 0) })).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  const contextual = ranked.flatMap(({ rule }) => rule.ideas.map(([title, description, rationale], index) => ({
    id: `rule-${rule.id}-${index}`, kind: "topic", title, description, rationale, origin: "rule",
  })));
  const title = plainText(post.data?.title || post.fileSlug || "chủ đề của bài viết").slice(0, 140);
  const anchors = [...new Set(signals.labels)].slice(0, 3);
  const focus = anchors[0] || title;
  const fallback = [
    [`${focus}: một tình huống thực hành từ đầu đến cuối`, `Lên kế hoạch một ví dụ cụ thể về ${focus}, ghi rõ đầu vào, các bước và cách kiểm tra kết quả.`, `Phát triển phần “${focus}” thành bài thực hành riêng.`],
    [`Những lựa chọn cần cân nhắc khi áp dụng ${anchors[1] || title}`, `So sánh các lựa chọn trong cùng một tình huống, nêu điều kiện phù hợp và giới hạn của từng cách.`, `Bổ sung góc ra quyết định cho nội dung “${anchors[1] || title}”.`],
    [`Các câu hỏi dễ bỏ sót khi bắt đầu ${anchors[2] || title}`, `Xây dựng danh sách câu hỏi từ phạm vi bài gốc, rồi đề xuất ví dụ để kiểm tra từng điểm chưa rõ.`, `Mở rộng phần “${anchors[2] || title}” cho người mới tiếp cận.`],
    [`${title}: thiết kế một nhật ký thử nghiệm có thể đối chiếu`, `Đề xuất cách ghi điều kiện ban đầu, quan sát và tiêu chí đánh giá để người đọc tự thử trong hoàn cảnh của họ.`, `Nối nội dung bài hiện tại với một phương pháp tự kiểm chứng.`],
  ].map(([title, description, rationale], index) => ({ id: `context-${index}`, kind: "topic", title, description, rationale, origin: "context" }));
  return [...contextual, ...fallback];
}

export function resolveTopicSuggestions(posts, currentUrl, relatedPosts = [], content = "", backlog = readBacklog()) {
  const currentPost = posts.find(post => post.url === currentUrl);
  if (!currentPost) return [];
  const slug = postSlug(currentPost);
  const publishedTitles = new Set(posts.map(post => normalizeText(post.data.title)));
  const manual = currentPost.data.exploreNextTopics || currentPost.data.topicSuggestions || [];
  if (!Array.isArray(manual)) throw new TypeError(`exploreNextTopics must be an array: ${currentUrl}`);
  const curated = manual.filter(item => item && typeof item === "object").map((item, index) => ({ ...item, id: item.id || `manual-${index}`, kind: "topic", origin: "manual" }));
  for (const item of backlog.suggestions) {
    if (!["proposed", "approved"].includes(item.status) || !(item.sourceArticles || []).includes(slug) || matchingPost(item, posts)) continue;
    curated.push({
      id: item.id, kind: "topic", title: item.title,
      description: item.description || item.rationale,
      rationale: item.connections?.[slug] || item.rationale,
      priority: item.priority || "medium", origin: "backlog",
    });
  }
  const suggestions = [];
  const seen = new Set();
  const add = item => {
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const key = normalizeText(title);
    if (!key || seen.has(key) || publishedTitles.has(key) || typeof item.description !== "string" || !item.description.trim() || typeof item.rationale !== "string" || !item.rationale.trim()) return;
    if (item.publishedArticleSlug && posts.some(post => postSlug(post) === item.publishedArticleSlug)) return;
    if (item.match && matchingPost(item, posts)) return;
    seen.add(key);
    // Deliberately omit URL: these cards are writing ideas, not article links.
    suggestions.push({ id: item.id, kind: "topic", title, description: item.description.trim(), rationale: item.rationale.trim(), origin: item.origin });
  };
  curated.sort((a, b) => (a.origin === "manual" ? -1 : priorityOrder[a.priority] ?? 1) - (b.origin === "manual" ? -1 : priorityOrder[b.priority] ?? 1)).forEach(add);
  if (suggestions.length < 3) {
    for (const item of generatedIdeas(currentPost, content)) {
      add(item);
      if (suggestions.length >= 4) break;
    }
  }
  return suggestions.slice(0, 5);
}

// Remove only known legacy panel sections from rendered article content.
// Balanced section tokens also handle nested markup without consuming endmatter.
export function removeLegacyTopicPanels(html) {
  const source = String(html || "");
  const tokens = [...source.matchAll(/<\/?section\b[^>]*>/gi)];
  const ranges = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (/^<\//.test(token[0]) || !/(?:topic-discovery-panel|data-component=["']ExploreNextTopics["'])/.test(token[0])) continue;
    let depth = 1;
    let end = index;
    while (++end < tokens.length) {
      depth += /^<\//.test(tokens[end][0]) ? -1 : 1;
      if (!depth) break;
    }
    if (depth) throw new Error("Unclosed legacy topic discovery panel");
    ranges.push([token.index, tokens[end].index + tokens[end][0].length]);
    index = end;
  }
  let result = source;
  for (const [start, end] of ranges.reverse()) result = result.slice(0, start) + result.slice(end);
  return result;
}
