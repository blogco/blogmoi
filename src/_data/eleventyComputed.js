import { resolveArticleCover, assignArticleCovers, articleCoverKey } from "../../static/js/article-cover.js";
import { resolveSeason } from "../../lib/season-resolver.js";
import seasonConfig from "./season-config.js";

export default {
  articleCover: (data) => {
    if (data.type !== "article") return null;
    const posts = data.collections?.posts;
    if (!posts?.length) return resolveArticleCover(data);
    return assignArticleCovers(posts.map(post => post.data)).get(articleCoverKey(data)) || resolveArticleCover(data);
  },
  year: () => new Date().getFullYear(),
  resolvedSeason: (data) => resolveSeason(data, seasonConfig),
  eleventyNavigation: (data) => data.eleventyNavigation
};
