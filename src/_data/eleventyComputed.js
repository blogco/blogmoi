import { resolveArticleCover } from "../../static/js/article-cover.js";
import { resolveSeason } from "../../lib/season-resolver.js";
import seasonConfig from "./season-config.js";

export default {
  articleCover: (data) => data.type === "article" ? resolveArticleCover(data) : null,
  year: () => new Date().getFullYear(),
  resolvedSeason: (data) => resolveSeason(data, seasonConfig),
  eleventyNavigation: (data) => data.eleventyNavigation
};
