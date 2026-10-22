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

export function resolveTopicSuggestions(posts, currentUrl, relatedPosts = []) {
  const backlog = readBacklog();
  const currentPost = posts.find((post) => post.url === currentUrl);
  if (!currentPost) return [];

  const currentSlug = postSlug(currentPost);
  const relatedUrls = new Set(relatedPosts.map((post) => post.url));
  const seenIds = new Set();
  const seenPublishedUrls = new Set();
  const seenTopics = new Set();
  const suggestions = [];
  let unpublishedCount = 0;

  for (const item of backlog.suggestions) {
    if (item.status === "rejected" || !(item.sourceArticles || []).includes(currentSlug)) continue;
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);

    const publishedPost = matchingPost(item, posts);
    if (publishedPost) {
      if (publishedPost.url === currentUrl || relatedUrls.has(publishedPost.url) || seenPublishedUrls.has(publishedPost.url)) continue;
      seenPublishedUrls.add(publishedPost.url);
      suggestions.push({
        id: item.id,
        kind: "published",
        title: publishedPost.data.title,
        description: publishedPost.data.description || "",
        url: publishedPost.url,
        priority: item.priority || "medium"
      });
      continue;
    }

    const titleKey = normalizeText(item.title);
    const rationale = item.connections?.[currentSlug];
    if (!rationale || !titleKey || seenTopics.has(titleKey) || unpublishedCount >= 2) continue;
    seenTopics.add(titleKey);
    unpublishedCount += 1;
    suggestions.push({
      id: item.id,
      kind: "topic",
      title: item.title,
      rationale,
      priority: item.priority || "medium"
    });
  }

  return suggestions
    .sort((a, b) => {
      const aKind = a.kind === "published" ? 0 : 1;
      const bKind = b.kind === "published" ? 0 : 1;
      return aKind - bKind
        || (priorityOrder[a.priority] ?? priorityOrder.medium) - (priorityOrder[b.priority] ?? priorityOrder.medium)
        || a.title.localeCompare(b.title, "vi");
    })
    .slice(0, 4);
}
