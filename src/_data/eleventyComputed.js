import { resolveSeason } from "../../lib/season-resolver.js";
import seasonConfig from "./season-config.js";

export default {
  year: () => new Date().getFullYear(),
  resolvedSeason: (data) => resolveSeason(data, seasonConfig),
  eleventyNavigation: (data) => data.eleventyNavigation
};
