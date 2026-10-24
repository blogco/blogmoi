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
const brief = { title: "Company reviews its financing options", titleKo: "회사가 자금 조달 방안을 검토합니다", description: "The company said its business outlook remained unchanged.", facts: [{ en: "The company said its business outlook remained unchanged while reviewing financing options.", ko: "회사는 자금 조달 방안을 검토하면서 사업 전망에는 변화가 없다고 밝혔습니다.", evidence }] };
const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "NewsArticle", headline: article.title, datePublished: article.publishedAt, articleBody: body })}</script>`;

test("schedule date is GMT+7, not the runner date", () => {
  assert.equal(bangkokDay(new Date("2026-10-22T17:00:00Z")), "2026-10-23");
  assert.equal(bangkokDay(new Date("2026-10-22T16:59:59Z")), "2026-10-22");
});
test("selection only accepts fresh unpublished Companies stories and preserves listing order", () => {
  const yesterday = `${COMPANIES_URL}/20261022/yesterday-story`;
  const later = `${COMPANIES_URL}/20261023/another-story`;
  const links = [yesterday, "https://evil.example/business/companies/20261023/evil", url, later, `${COMPANIES_URL}/20261024/future-story`, `${COMPANIES_URL}/20261001/old-story`].map(href => `<a href="${href}">story</a>`).join("");
  assert.equal(pickArticle(links, new Set(), "2026-10-23", () => 0), url);
  assert.equal(pickArticle(links, new Set([url]), "2026-10-23", () => 0), later);
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
  assert.throws(() => validateBrief(change({ facts: [{ en: "The company operates 999 factories.", ko: "회사는 999개 공장을 운영합니다.", evidence }] }), article), /number/);
  assert.throws(() => validateBrief(change({ facts: [{ en: brief.facts[0].en, ko: brief.facts[0].ko, evidence: "Fabricated evidence that does not occur in this source article." }] }), article), /evidence/);
  assert.throws(() => validateBrief(change({ facts: [{ en: '<script>alert("hi")</script>', ko: brief.facts[0].ko, evidence }] }), article));
  assert.throws(() => validateBrief(change({ facts: [{ en: "A lengthy English paragraph. ".repeat(80), ko: brief.facts[0].ko, evidence }] }), article));
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
  const generation = steps.findIndex(step => step.run === "node --use-env-proxy scripts/publish-scheduled-news.mjs");
  const build = steps.findIndex(step => step.name === "Build Eleventy site");
  const persist = steps.findIndex(step => step.name === "Persist validated content before deployment");
  assert.ok(generation < build && build < persist);
  assert.ok(!steps[generation].env.GITHUB_TOKEN);
  assert.ok(steps.some(step => step.run?.includes("download.pytorch.org/whl/cpu")));
});

test("homepage selection samples eligible sections and bilingual output includes both languages", () => {
  const a="https://www.koreatimes.co.kr/southkorea/society/20261023/test-story";
  const b="https://www.koreatimes.co.kr/world/20261023/another-story";
  const listing=`<a href="${a}">a</a><a href="${b}">b</a>`;
  assert.equal(pickArticle(listing,new Set(),"2026-10-23",()=>0),a);
  assert.equal(pickArticle(listing,new Set(),"2026-10-23",()=>1),b);
  assert.equal(pickArticle(listing,new Set([b]),"2026-10-23",()=>0),a);
  const post=renderPost(brief,article,"2026-10-23","2026-10-23T01:00:00Z");
  assert.match(post.content,/lang: en/);
  assert.match(post.content,/languages: \[en, ko\]/);
  assert.match(post.content,/### English/);
  assert.match(post.content,/### 한국어/);
  assert.ok(post.content.includes(brief.facts[0].en));
  assert.ok(post.content.includes(brief.facts[0].ko));
});
