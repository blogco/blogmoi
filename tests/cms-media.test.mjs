import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import yaml from "js-yaml";
import MarkdownIt from "markdown-it";
import * as core from "../static/js/cms-core.js";
import { resolveArticleCover, isUnsplashCover } from "../static/js/article-cover.js";

test("CMS keeps first image on Unsplash and commits multiple uploaded body images with the article", async () => {
  const dom = new JSDOM(await readFile("_site/cms/index.html", "utf8"), { url: "https://blogco.github.io/blogmoi/cms/" });
  const oldYaml = globalThis.jsyaml, oldMarkdown = globalThis.markdownit;
  globalThis.jsyaml = yaml; globalThis.markdownit = MarkdownIt;
  dom.window.prompt = () => "Ảnh do người dùng tải lên";
  dom.window.confirm = () => true;
  const context = vm.createContext({ window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, URL, crypto: globalThis.crypto, structuredClone, console, btoa, atob, TextEncoder, TextDecoder, unsplashProxyUrl: "", ...core, resolveArticleCover, isUnsplashCover, createImageBitmap: async () => ({ width: 100, height: 100, close() {} }) });
  const source = (await readFile("static/js/cms.js", "utf8")).replace(/^import[\s\S]*?;\n/gm, "");
  vm.runInContext(source + "\nglobalThis.api = { openEditor, uploadBodyImage, currentArticleForSave, currentBody, currentMetadata, validForPublish, saveRecoveryDraft, publish, state, clearBodyUploads };", context);
  const api = context.api;
  try {
    const radio = dom.window.document.querySelector("[data-cover-source]");
    assert.ok(radio.checked && radio.disabled);
    assert.ok(!dom.window.document.querySelector(".cms-cover [data-upload-image]"));
    assert.ok(dom.window.document.querySelector(".cms-toolbar [data-upload-image]"));
    api.openEditor({ metadata: { title: "Kiểm tra ảnh", slug: "kiem-tra-anh", date: "2026-10-23T08:00:00+07:00", description: "Kiểm tra các ảnh nội dung", categories: ["Công nghệ"] }, body: "Nội dung bài viết đủ dài để kiểm tra chức năng xuất bản và tải ảnh." });
    const cover = api.currentMetadata().cover;
    await api.uploadBodyImage(new File([new Uint8Array([1, 2, 3])], "first.png", { type: "image/png" }));
    await api.uploadBodyImage(new File([new Uint8Array([4, 5, 6])], "second.webp", { type: "image/webp" }));
    assert.equal(api.state.pendingBodyUploads.length, 2);
    assert.equal(api.currentMetadata().cover, cover);
    const article = api.currentArticleForSave();
    assert.equal((article.body.match(/!\[/g) || []).length, 2);
    assert.match(article.body, /\/blogmoi\/uploads\/kiem-tra-anh-/);
    assert.ok(!article.body.includes("blob:"));
    assert.equal(api.validForPublish(article).length, 0);
    api.saveRecoveryDraft();
    const draft = structuredClone(Object.values(api.state.drafts)[0]);
    assert.equal(draft.missingUploadUrls.length, 2);
    vm.runInContext('globalThis.captured = null; createCommit = async changes => { globalThis.captured = changes; return {sha:"a".repeat(40)}; }; latestPathSha = async () => null; loadRepository = async () => {}; showDeploymentStatus = async () => {};', context);
    await api.publish();
    assert.equal(context.captured.length, 3);
    assert.equal(context.captured.filter(change => change.encoding === "base64").length, 2);
    assert.ok(context.captured[0].content.includes(cover));
    api.openEditor(draft, "recovered");
    assert.ok(api.validForPublish(api.currentArticleForSave()).some(error => error.includes("missing")));
    dom.window.document.querySelector("[data-article-body]").querySelectorAll("img").forEach(image => image.remove());
    assert.equal(api.validForPublish(api.currentArticleForSave()).length, 0);
    const before = api.state.pendingBodyUploads.length;
    await api.uploadBodyImage(new File(["not an image"], "bad.svg", { type: "image/svg+xml" }));
    assert.equal(api.state.pendingBodyUploads.length, before);
  } finally {
    api.clearBodyUploads(); dom.window.close();
    globalThis.jsyaml = oldYaml; globalThis.markdownit = oldMarkdown;
  }
});

test("standalone inline images survive the visual editor Markdown round trip", () => {
  const dom = new JSDOM('<div><img src="/blogmoi/uploads/test.png" alt="Ảnh minh họa"></div>');
  try { assert.equal(core.richTextToMarkdown(dom.window.document.querySelector("div")), "![Ảnh minh họa](/blogmoi/uploads/test.png)"); }
  finally { dom.window.close(); }
});
