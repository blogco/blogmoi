import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, cp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Eleventy from "@11ty/eleventy";
import { verifyExploreNextTopics } from "../scripts/verify-explore-next-topics.mjs";

test("new Markdown/Nunjucks articles, metadata gaps, nested layouts and manual panels render exactly once", async () => {
  const root = await mkdtemp(join(tmpdir(), "blogmoi-topic-fixtures-"));
  const input = join(root, "src"), output = join(root, "_site");
  try {
    await mkdir(join(input, "posts"), { recursive: true });
    await mkdir(join(input, "_data"), { recursive: true });
    await cp("src/_includes", join(input, "_includes"), { recursive: true });
    await cp("src/_data/site.json", join(input, "_data/site.json"));
    await cp("src/posts/posts.11tydata.js", join(input, "posts/posts.11tydata.js"));
    await cp("src/search-index.njk", join(input, "search-index.njk"));
    await writeFile(join(input, "_includes/layouts/alternate.njk"), '---\nlayout: layouts/article.njk\n---\n{{ content | safe }}');
    const cases = [
      ["no-tags.md", "categories: [Công nghệ]\n", "## IndexedDB\nMột tình huống đồng bộ."],
      ["no-category.md", "tags: [GitHub]\n", "Nội dung ngắn."],
      ["minimal.md", "", "Chọn đất."],
      ["alternate.md", "layout: layouts/alternate.njk\n", "## Tưới nước\nTrồng rau."],
      ["legacy.md", "", '<p>Nội dung giữ nguyên.</p><section class="topic-discovery-panel"><h2>Khám phá tiếp chủ đề này</h2></section>'],
      ["new-template.njk", "", "<h2>Font WOFF2</h2><p>Kiểm tra font.</p>"],
    ];
    for (const [file, metadata, body] of cases) await writeFile(join(input, "posts", file), `---\ntitle: "${file}"\ntype: article\npermalink: /${file.replace(/\.(md|njk)$/, "")}/index.html\n${metadata.includes("layout:") ? "" : "layout: layouts/article.njk\n"}date: 2026-10-23\n${metadata}---\n${body}`);
    await writeFile(join(input, "about.njk"), '---\npermalink: /about/index.html\n---\nTrang tĩnh');
    const config = join(root, "eleventy.config.mjs");
    await writeFile(config, `import configure from ${JSON.stringify(pathToFileURL(resolve("eleventy.config.mjs")).href)};\nexport default function(c) { const options = configure(c, {syncTopicStatuses:false}); c.addGlobalData("resolvedSeason", {timeZone:"Asia/Ho_Chi_Minh"}); return {...options, dir:{input:${JSON.stringify(input)},output:${JSON.stringify(output)},includes:"_includes",data:"_data"}}; }`);
    const build = new Eleventy(input, output, { configPath: config, quietMode: true });
    await build.write();
    const result = verifyExploreNextTopics(output);
    assert.equal(result.total, cases.length);
    assert.equal(result.covered, cases.length);
    // Simulate a future layout accidentally omitting the shared component.
    const file = join(output, "minimal/index.html");
    const html = await readFile(file, "utf8");
    await writeFile(file, html.replace('class="article-panel topic-discovery-panel"', 'class="removed-panel"'));
    assert.throws(() => verifyExploreNextTopics(output), /minimal.*missing ExploreNextTopics/s);
  } finally { await rm(root, { recursive: true, force: true }); }
});
