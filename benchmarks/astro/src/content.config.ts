import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";

const posts = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: process.env.BENCH_CONTENT_DIR || "../.work/dataset/50/posts"
  })
});

export const collections = { posts };
