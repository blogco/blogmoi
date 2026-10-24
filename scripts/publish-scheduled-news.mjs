import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { NEWS_HOME_URL, bangkokDay, extractArticle, fetchPublicHtml, generateBrief, pickArticle, readPublicationState, renderPost, sourceUrl } from "./lib/scheduled-news.mjs";

export async function publishScheduledNews({ root = process.cwd(), now = new Date(), requestedUrl = "", dryRun = false, fetchHtml = fetchPublicHtml, generate = generateBrief, random } = {}) {
  const day = bangkokDay(now);
  const directory = resolve(root, "src/posts");
  const files = await readdir(directory);
  const state = readPublicationState(await Promise.all(files.filter(file => file.endsWith(".md")).map(file => readFile(resolve(directory, file), "utf8"))), day);
  if (state.publishedToday) return { status: "skipped", reason: "Already published a scheduled brief for this Bangkok date." };
  const listing = requestedUrl ? "" : await fetchHtml(NEWS_HOME_URL);
  const excluded = new Set(state.urls);
  let article, brief, lastError;
  for (let attempt = 0; attempt < (requestedUrl ? 1 : 3); attempt++) {
    const url = requestedUrl ? sourceUrl(requestedUrl) : pickArticle(listing, excluded, day, random);
    if (!url || state.urls.has(url)) break;
    excluded.add(url);
    try {
      article = extractArticle(await fetchHtml(url), url);
      if (Date.parse(article.publishedAt) > now.getTime()) throw new Error("Source publication date is in the future.");
      brief = await generate(article);
      break;
    } catch (error) { article = null; brief = null; lastError = error; console.error(`Skipped unreadable or unverifiable source: ${url}: ${error.message}`); }
  }
  if (!article || !brief) {
    if (lastError) throw lastError;
    return { status: "skipped", reason: "No fresh unpublished source article." };
  }

  const post = renderPost(brief, article, day, now.toISOString(), state.articles);
  if (!dryRun) await writeFile(resolve(directory, post.filename), post.content, { flag: "wx" });
  return { status: dryRun ? "validated" : "created", filename: post.filename, source: article.url, day };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await publishScheduledNews({ requestedUrl: process.env.NEWS_SOURCE_URL || "", dryRun: process.argv.includes("--dry-run") });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(`Scheduled news stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
