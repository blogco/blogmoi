import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import { COMPANIES_URL, bangkokDay, extractArticle, fetchPublicHtml, generateBrief, pickArticle, readPublicationState, renderPost, sourceUrl, validateBrief } from "../scripts/lib/scheduled-news.mjs";
import { publishScheduledNews } from "../scripts/publish-scheduled-news.mjs";

const url = `${COMPANIES_URL}/20261023/company-reviews-funding`;
const evidence = "The company said its business outlook remained unchanged while it reviewed its financing options.";
const body = (evidence + " Market participants continued to follow developments in the sector and the company's existing operations. ").repeat(12).trim();
const article = { url, title: "Company reviews its financing options", publishedAt: "2026-10-23T08:04:00+09:00", body };
const brief = { title: "Doanh nghiệp xem xét phương án huy động vốn", description: "Doanh nghiệp cho biết triển vọng kinh doanh không thay đổi.", facts: [{ text: "Doanh nghiệp cho biết triển vọng kinh doanh không thay đổi khi xem xét các phương án vốn.", evidence }] };
const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "NewsArticle", headline: article.title, datePublished: article.publishedAt, articleBody: body })}</script>`;

test("schedule date is GMT+7, not the runner date", () => {
  assert.equal(bangkokDay(new Date("2026-10-22T17:00:00Z")), "2026-10-23");
  assert.equal(bangkokDay(new Date("2026-10-22T16:59:59Z")), "2026-10-22");
});
test("selection only accepts fresh unpublished Companies stories and preserves listing order", () => {
  const yesterday = `${COMPANIES_URL}/20261022/yesterday-story`;
  const later = `${COMPANIES_URL}/20261023/another-story`;
  const links = [yesterday, "https://evil.example/business/companies/20261023/evil", url, later, `${COMPANIES_URL}/20261024/future-story`, `${COMPANIES_URL}/20261001/old-story`].map(href => `<a href="${href}">story</a>`).join("");
  assert.equal(pickArticle(links, new Set(), "2026-10-23"), url);
  assert.equal(pickArticle(links, new Set([url]), "2026-10-23"), later);
  assert.equal(pickArticle(links, new Set([url, later, yesterday]), "2026-10-23"), null);
  assert.throws(() => sourceUrl("https://www.koreatimes.co.kr.evil.example/business/companies/20261023/story"));
});
test("extraction requires source body and publication date and stops at paywalls", () => {
  assert.deepEqual(extractArticle(html, url), article);
  assert.throws(() => extractArticle('<h1>Title only</h1>', url), /Cannot verify/);
  assert.throws(() => extractArticle(html.replace('"NewsArticle"', '"NewsArticle","isAccessibleForFree":false'), url), /paywalled/);
  assert.throws(() => extractArticle(html.replace('"NewsArticle"', '"NewsArticle","isAccessibleForFree":"False"'), url), /paywalled/);
});
test("model output must be concise Vietnamese, supported by source, and inert", () => {
  assert.equal(validateBrief(brief, article), brief);
  const change = values => ({ ...brief, ...values });
  assert.throws(() => validateBrief(change({ title: "{{ site.secret }}" }), article));
  assert.throws(() => validateBrief(change({ facts: [{ text: "Công ty huy động 999 tỷ đồng.", evidence }] }), article), /number/);
  assert.throws(() => validateBrief(change({ facts: [{ text: brief.facts[0].text, evidence: "Fabricated evidence that does not occur in this source article." }] }), article), /evidence/);
  assert.throws(() => validateBrief(change({ facts: [{ text: '<script>alert("hi")</script>', evidence }] }), article));
  assert.throws(() => validateBrief(change({ facts: [{ text: "Nội dung rất dài. ".repeat(80), evidence }] }), article));
  const post = renderPost(brief, article, "2026-10-23", "2026-10-23T01:00:00Z");
  assert.match(post.filename, /^koreatimes-2026-10-23-[a-f0-9]{12}\.md$/);
  assert.match(post.content, /sourcePublisher: "The Korea Times"/);
  assert.equal(readPublicationState([post.content], "2026-10-23").publishedToday, true);
});
test("source downloader rejects redirects outside source host, HTTP errors and non-HTML", async () => {
  await assert.rejects(fetchPublicHtml(url, async () => new Response(null, { status: 302, headers: { location: "https://evil.example/" } })), /approved host/);
  await assert.rejects(fetchPublicHtml(url, async () => new Response(null, { status: 403 })), /403/);
  await assert.rejects(fetchPublicHtml(url, async () => new Response("{}", { headers: { "content-type": "application/json" } })), /HTML/);
  assert.equal(await fetchPublicHtml(url, async () => new Response(html, { headers: { "content-type": "text/html" } })), html);
});
test("local model process failures do not produce a post", async () => {
  await assert.rejects(generateBrief(article, { python: "/nonexistent/blogmoi-python" }));
});
test("publishing is idempotent per source and Bangkok date, with non-writing dry run", async () => {
  const root = await mkdtemp(join(tmpdir(), "blogmoi-news-"));
  const posts = join(root, "src/posts");
  await mkdir(posts, { recursive: true });
  let generated = 0;
  const options = { root, now: new Date("2026-10-23T01:00:00Z"), requestedUrl: url, fetchHtml: async () => html, generate: async () => { generated++; return brief; } };
  try {
    assert.equal((await publishScheduledNews({ ...options, dryRun: true })).status, "validated");
    assert.equal((await readdir(posts)).length, 0);
    assert.equal((await publishScheduledNews(options)).status, "created");
    assert.equal((await readdir(posts)).length, 1);
    assert.equal((await publishScheduledNews(options)).status, "skipped");
    assert.equal(generated, 2);
    assert.equal((await publishScheduledNews({ ...options, now: new Date("2026-10-24T01:00:00Z") })).status, "skipped");
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("today's supplied article prevents a second automatic post", async () => {
  const source = await readFile("src/posts/sk-hynix-dung-xem-xet-niem-yet-solidigm-tai-my.md", "utf8");
  assert.equal(readPublicationState([source], "2026-10-23").publishedToday, true);
});
test("existing single Pages workflow also schedules local generation before build and commit", async () => {
  const workflow = yaml.load(await readFile(".github/workflows/deploy.yml", "utf8"));
  assert.equal(workflow.on.schedule[0].cron, "0 0 * * *");
  assert.equal(workflow.permissions.models, undefined);
  const steps = workflow.jobs.deploy.steps;
  const generation = steps.findIndex(step => step.run === "node scripts/publish-scheduled-news.mjs");
  const build = steps.findIndex(step => step.name === "Build Eleventy site");
  const persist = steps.findIndex(step => step.name === "Persist validated content before deployment");
  assert.ok(generation < build && build < persist);
  assert.ok(!steps[generation].env.GITHUB_TOKEN);
  assert.ok(steps.some(step => step.run?.includes("download.pytorch.org/whl/cpu")));
});
