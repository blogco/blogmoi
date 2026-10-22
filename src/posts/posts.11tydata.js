export default {
  layout: "layouts/article.njk",
  type: "article",
  lang: "vi",
  author: "Blogmoi",
  permalink: (data) => `/${data.slug || data.page.fileSlug}/index.html`
};
