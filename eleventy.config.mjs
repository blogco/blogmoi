import { resolveTopicSuggestions, syncEditorialTopicStatuses } from "./lib/editorial-topic-discovery.js";

const PATH_PREFIX = "/blogmoi/";
const SITE_ORIGIN = "https://blogco.github.io";

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "") || "muc";
}

function groupPosts(posts, field) {
  const groups = new Map();
  for (const post of posts) {
    const values = Array.isArray(post.data[field]) ? post.data[field] : [];
    for (const value of values) {
      const name = String(value || "").trim();
      if (!name || (field === "tags" && name.toLowerCase() === "posts")) continue;
      const key = slugify(name);
      if (!groups.has(key)) groups.set(key, { name, slug: key, posts: [] });
      groups.get(key).posts.push(post);
    }
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

export default function (eleventyConfig) {
  eleventyConfig.addGlobalData("year", new Date().getFullYear());
  eleventyConfig.addPassthroughCopy({ static: "." });
  eleventyConfig.addCollection("posts", (api) => {
    const posts = api.getFilteredByGlob("src/posts/**/*.md")
      .filter((post) => !post.data.draft)
      .sort((a, b) => b.date - a.date);
    syncEditorialTopicStatuses(posts);
    return posts;
  });
  eleventyConfig.addCollection("categoryGroups", (api) => groupPosts(api.getFilteredByGlob("src/posts/**/*.md").filter((post) => !post.data.draft), "categories"));
  eleventyConfig.addCollection("tagGroups", (api) => groupPosts(api.getFilteredByGlob("src/posts/**/*.md").filter((post) => !post.data.draft), "tags"));

  eleventyConfig.addFilter("absoluteUrl", (path = "/") => {
    if (/^https?:\/\//i.test(String(path))) return String(path);
    return SITE_ORIGIN + PATH_PREFIX + String(path).replace(/^\/+/, "");
  });
  eleventyConfig.addFilter("slugify", slugify);
  eleventyConfig.addFilter("safeExternalUrl", (value = "") => {
    try {
      const url = new URL(String(value));
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch {
      return "";
    }
  });
  eleventyConfig.addFilter("padStart", (value, length = 2, fill = "0") => String(value).padStart(Number(length), String(fill)));
  eleventyConfig.addFilter("relatedPosts", (posts, currentUrl, categories = []) => posts
    .filter((post) => post.url !== currentUrl && (post.data.categories || []).some((category) => categories.includes(category)))
    .slice(0, 3));
  eleventyConfig.addFilter("topicSuggestions", (posts, currentUrl, relatedPosts = []) =>
    resolveTopicSuggestions(posts, currentUrl, relatedPosts));
  eleventyConfig.addFilter("featuredPosts", (posts) => posts.filter((post) => post.data.featured));
  eleventyConfig.addFilter("dateReadable", (date) => new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "long", timeZone: "Asia/Ho_Chi_Minh"
  }).format(new Date(date)));
  eleventyConfig.addFilter("dateIso", (date) => new Date(date).toISOString());
  eleventyConfig.addFilter("dateRfc822", (date) => new Date(date).toUTCString());
  eleventyConfig.addFilter("readingTime", (html) => {
    const words = String(html || "").replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ").trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 220));
  });
  eleventyConfig.addFilter("toc", (html) => {
    const headings = [...String(html || "").matchAll(/<h([23])\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/gi)];
    if (!headings.length) return "";
    const rows = headings.map(([, level, id, label]) => {
      const text = label.replace(/<[^>]*>/g, "");
      const safeId = id.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
      return `<li class="toc-level-${level}"><a href="#${safeId}">${text}</a></li>`;
    }).join("");
    return `<nav class="toc" aria-label="Mục lục"><p class="eyebrow">Trong bài viết</p><ol>${rows}</ol></nav>`;
  });
  eleventyConfig.addFilter("searchData", (posts) => posts.map((post) => ({
    title: post.data.title,
    description: post.data.description || "",
    date: post.date.toISOString().slice(0, 10),
    url: PATH_PREFIX + post.url.replace(/^\/+/, ""),
    categories: post.data.categories || [],
    tags: post.data.tags || []
  })));
  eleventyConfig.addFilter("json", (value) => JSON.stringify(value).replace(/</g, "\\u003c"));
  eleventyConfig.addFilter("xmlEscape", (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  })[char]));

  eleventyConfig.amendLibrary("md", (markdown) => {
    markdown.core.ruler.push("blogmoiHeadingIds", (state) => {
      const counts = new Map();
      for (let index = 0; index < state.tokens.length; index += 1) {
        const token = state.tokens[index];
        if (token.type !== "heading_open") continue;
        const heading = state.tokens[index + 1];
        const base = slugify(heading?.content || "section");
        const count = counts.get(base) || 0;
        counts.set(base, count + 1);
        token.attrSet("id", count ? `${base}-${count + 1}` : base);
      }
    });
  });

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    templateFormats: ["md", "njk", "11ty.js"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    pathPrefix: PATH_PREFIX
  };
}
