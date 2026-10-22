import { resolve } from "node:path";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://benchmark.invalid",
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
  cacheDir: resolve(process.env.BENCH_CACHE_DIR || ".astro"),
  outDir: resolve(process.env.BENCH_OUT_DIR || "dist")
});
