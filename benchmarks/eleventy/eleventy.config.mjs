function slugify(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
}

function groupPosts(posts, field) {
  const groups = new Map();
  for (const post of posts) {
    for (const name of post.data[field] || []) {
      const slug = slugify(name);
      if (!groups.has(slug)) groups.set(slug, { name, slug, posts: [] });
      groups.get(slug).posts.push(post);
    }
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

export default function (eleventyConfig) {
  eleventyConfig.addGlobalData("layout", "layouts/article.njk");
  eleventyConfig.addCollection("posts", (api) => api.getFilteredByGlob("src/posts/*.md")
    .sort((a, b) => String(b.data.date).localeCompare(String(a.data.date))));
  eleventyConfig.addCollection("categories", (api) => groupPosts(api.getFilteredByGlob("src/posts/*.md"), "categories"));
  eleventyConfig.addCollection("tags", (api) => groupPosts(api.getFilteredByGlob("src/posts/*.md"), "tags"));
  eleventyConfig.addFilter("slugify", slugify);
  eleventyConfig.addFilter("canonical", (pathname) => `https://benchmark.invalid${pathname}`);
  return {
    dir: { input: ".", includes: "_includes", data: "_data", output: "_site" },
    templateFormats: ["md", "njk", "11ty.js"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
}
