import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { slugify } from "./generate-dataset.mjs";

async function listFiles(directory, prefix = "") {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(path.join(directory, entry.name), relative));
    else result.push(relative);
  }
  return result.sort();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function expectedPaths(manifest) {
  const paths = ["index.html", "categories/index.html", "tags/index.html"];
  for (const post of manifest.posts) paths.push(`${post.slug}/index.html`);
  for (const category of manifest.categories) paths.push(`categories/${slugify(category)}/index.html`);
  for (const tag of manifest.tags) paths.push(`tags/${slugify(tag)}/index.html`);
  return paths.sort();
}

export async function verifyOutput(outputDirectory, manifest) {
  const files = await listFiles(outputDirectory);
  const actualHtml = files.filter((file) => file.endsWith(".html"));
  if (files.length !== actualHtml.length) {
    throw new Error(`Expected HTML-only output, found ${files.length - actualHtml.length} non-HTML files in ${outputDirectory}`);
  }
  const expected = expectedPaths(manifest);
  const missing = expected.filter((file) => !files.includes(file));
  const extra = files.filter((file) => !expected.includes(file));
  if (missing.length || extra.length) {
    throw new Error(`Output route mismatch in ${outputDirectory}; missing=${missing.join(",")}; extra=${extra.join(",")}`);
  }

  const articlePaths = [];
  for (const post of manifest.posts) {
    const relative = `${post.slug}/index.html`;
    const html = await readFile(path.join(outputDirectory, relative), "utf8");
    const required = [
      `<h1>${escapeHtml(post.title)}</h1>`,
      `name="description" content="${escapeHtml(post.description)}"`,
      `rel="canonical" href="https://benchmark.invalid/${post.slug}/"`,
      `property="og:type" content="article"`,
      `href="/${post.slug === manifest.posts.at(-1).slug ? manifest.posts[0].slug : manifest.posts[manifest.posts.indexOf(post) + 1].slug}/"`,
      "<h2", "<h3", "<table", "<pre", "<a href=", "정적 사이트", "English sample"
    ];
    const missingMarker = required.find((marker) => !html.includes(marker));
    if (missingMarker) throw new Error(`${relative} is missing required equivalent output marker: ${missingMarker}`);
    for (const category of post.categories) {
      if (!html.includes(escapeHtml(category))) throw new Error(`${relative} is missing category ${category}`);
    }
    for (const tag of post.tags) {
      if (!html.includes(escapeHtml(tag))) throw new Error(`${relative} is missing tag ${tag}`);
    }
    articlePaths.push(`/${post.slug}/`);
  }

  const bytesByFile = await Promise.all(files.map(async (file) => (await stat(path.join(outputDirectory, file))).size));
  const htmlBytes = bytesByFile.reduce((sum, bytes) => sum + bytes, 0);
  return {
    generatedFiles: files.length,
    htmlFiles: actualHtml.length,
    outputBytes: htmlBytes,
    htmlBytes,
    articlePaths,
    paths: files
  };
}

export { expectedPaths };
