import assert from "node:assert/strict";
import test from "node:test";
import yaml from "js-yaml";
import MarkdownIt from "markdown-it";

globalThis.jsyaml = yaml;
globalThis.markdownit = MarkdownIt;
const { parseArticle, serializeArticle, richTextToMarkdown, renderMarkdown, suggestSlug } = await import("../static/js/cms-core.js");

function text(value) { return { nodeType: 3, nodeValue: value }; }

function element(tag, children = [], attributes = {}) {
  const node = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    childNodes: children,
    children: children.filter((child) => child.nodeType === 1),
    attributes,
    style: { textAlign: /text-align\s*:\s*(left|center|right)/i.exec(attributes.style || "")?.[1]?.toLowerCase() || "" },
    classList: new Set(String(attributes.class || "").split(/\s+/).filter(Boolean)),
    getAttribute(name) { return this.attributes[name] ?? null; },
    get textContent() { return this.childNodes.map((child) => child.nodeType === 3 ? child.nodeValue : child.textContent).join(""); },
    querySelector(selector) {
      const target = selector.toLowerCase();
      for (const child of this.children) {
        if (child.tagName.toLowerCase() === target) return child;
        const nested = child.querySelector(selector);
        if (nested) return nested;
      }
      return null;
    },
    querySelectorAll(selector) {
      const target = selector.toLowerCase();
      const found = [];
      for (const child of this.children) {
        if (child.tagName.toLowerCase() === target) found.push(child);
        found.push(...child.querySelectorAll(selector));
      }
      return found;
    }
  };
  return node;
}

test("front matter save preserves unknown metadata and Markdown body bytes", () => {
  const body = "\n## Bảng & kết quả\n\n| Công cụ | Tốc độ |\n| --- | ---: |\n| Eleventy | 1 giây |\n\n```js\nconst word = 'tiếng Việt 한국어';\n```\n\n[Liên kết](https://example.com/path)\n";
  const source = `---\ntitle: \"Bài tiếng Việt\"\ndate: 2026-10-22\nunknownMetadata:\n  nested: giữ nguyên\ncoverAttribution:\n  photographer: An\nfaq:\n  - question: Câu hỏi\n    answer: Câu trả lời\n---${body}`;
  const parsed = parseArticle(source);
  const saved = parseArticle(serializeArticle(parsed.metadata, parsed.body));
  assert.equal(saved.body, body);
  assert.deepEqual(saved.metadata.unknownMetadata, { nested: "giữ nguyên" });
  assert.equal(saved.metadata.coverAttribution.photographer, "An");
  assert.equal(saved.metadata.faq[0].answer, "Câu trả lời");
  assert.match(renderMarkdown(saved.body), /<table>/);
  assert.match(renderMarkdown(saved.body), /<code class="language-js">/);
  assert.match(renderMarkdown(saved.body), /tiếng Việt 한국어/);
  assert.match(renderMarkdown(saved.body), /href="https:\/\/example\.com\/path"/);
});

test("visual HTML round-trip retains Unicode, links, tables and code fences", () => {
  const root = element("div", [
    element("h2", [text("Tiếng Việt 한국어")]),
    element("p", [text("Đọc thêm: "), element("a", [text("tài liệu")], { href: "https://example.com/docs" })]),
    element("table", [
      element("thead", [element("tr", [element("th", [text("Công cụ")]), element("th", [text("Kết quả")], { style: "text-align:right" })])]),
      element("tbody", [element("tr", [element("td", [text("Eleventy")]), element("td", [text("nhanh & gọn")])])])
    ]),
    element("pre", [element("code", [text("const label = 'Xin chào';")], { class: "language-js" })])
  ]);
  const markdown = richTextToMarkdown(root);
  const html = renderMarkdown(markdown);
  assert.match(markdown, /Tiếng Việt 한국어/);
  assert.match(markdown, /\[tài liệu\]\(https:\/\/example\.com\/docs\)/);
  assert.match(markdown, /\| Công cụ \| Kết quả \|/);
  assert.match(markdown, /\| --- \| ---: \|/);
  assert.match(markdown, /```js\nconst label = 'Xin chào';\n```/);
  assert.match(html, /<table>/);
  assert.match(html, /href="https:\/\/example\.com\/docs"/);
  assert.match(html, /Xin chào/);
});

test("slug suggestion normalizes Vietnamese text", () => {
  assert.equal(suggestSlug("Bài viết về Điện toán đám mây"), "bai-viet-ve-dien-toan-dam-may");
});
