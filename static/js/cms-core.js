const FRONT_MATTER = /^(\uFEFF?---[ \t]*\r?\n)([\s\S]*?)\r?\n---[ \t]*(?=$|\r?\n)/;

export function parseArticle(source) {
  const match = FRONT_MATTER.exec(String(source ?? ""));
  if (!match) throw new Error("This file does not have a YAML front matter block.");
  const metadata = globalThis.jsyaml.load(match[2], { json: false }) || {};
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") {
    throw new Error("Article front matter must be a YAML mapping.");
  }
  return { metadata, body: String(source).slice(match[0].length), frontMatter: match[2] };
}
export function serializeArticle(metadata, body) {
  const yaml = globalThis.jsyaml.dump(metadata, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
    forceQuotes: false
  }).trimEnd();
  const content = String(body ?? "");
  const separator = content.startsWith("\n") || content.startsWith("\r\n") ? "" : "\n";
  return `---\n${yaml}\n---${separator}${content.endsWith("\n") ? content : `${content}\n`}`;
}

export function markdownRenderer() {
  return globalThis.markdownit("default", {
    html: false,
    linkify: false,
    typographer: false,
    breaks: false
  });
}

export function renderMarkdown(markdown) {
  return markdownRenderer().render(String(markdown ?? ""));
}

function escapeText(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/([`*_{}\[\]<>#+\-.!|])/g, "\\$1");
}

function escapeDestination(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/[()\s]/g, (char) => char === " " ? "%20" : `\\${char}`);
}

function inline(node) {
  if (node.nodeType === 3) return escapeText(node.nodeValue || "");
  if (node.nodeType !== 1) return "";
  const tag = node.tagName.toLowerCase();
  if (tag === "br") return "  \n";
  if (tag === "img") {
    const alt = String(node.getAttribute("alt") || "").replace(/([\\[\]])/g, "\\$1");
    const title = node.getAttribute("title");
    return `![${alt}](${escapeDestination(node.getAttribute("src") || "")}${title ? ` \"${title.replace(/\"/g, "\\\"")}\"` : ""})`;
  }
  const content = [...node.childNodes].map(inline).join("");
  if (tag === "strong" || tag === "b") return `**${content}**`;
  if (tag === "em" || tag === "i") return `*${content}*`;
  if (tag === "del" || tag === "s") return `~~${content}~~`;
  if (tag === "code") {
    const fence = "`".repeat(Math.max(1, ...[...content.matchAll(/`+/g)].map((match) => match[0].length + 1)));
    return `${fence}${content.startsWith("`") || content.endsWith("`") ? ` ${content} ` : content}${fence}`;
  }
  if (tag === "a") {
    const href = escapeDestination(node.getAttribute("href") || "");
    const title = node.getAttribute("title");
    return `[${content}](${href}${title ? ` \"${title.replace(/\"/g, "\\\"")}\"` : ""})`;
  }
  return content;
}

function listMarkdown(list, depth = 0) {
  const ordered = list.tagName.toLowerCase() === "ol";
  let number = Number(list.getAttribute("start") || 1);
  const lines = [];
  for (const item of [...list.children].filter((child) => child.tagName.toLowerCase() === "li")) {
    const nested = [...item.children].filter((child) => ["ul", "ol"].includes(child.tagName.toLowerCase()));
    const firstBlock = [...item.children].find((child) => !["ul", "ol"].includes(child.tagName.toLowerCase()));
    const text = firstBlock?.tagName.toLowerCase() === "p"
      ? [...firstBlock.childNodes].map(inline).join("")
      : [...item.childNodes].filter((child) => child.nodeType !== 1 || !["ul", "ol"].includes(child.tagName.toLowerCase())).map((child) => child.nodeType === 1 ? inline(child) : inline(child)).join("");
    const prefix = ordered ? `${number++}. ` : "- ";
    lines.push(`${"  ".repeat(depth)}${prefix}${text.trim()}`);
    for (const child of nested) lines.push(listMarkdown(child, depth + 1));
  }
  return lines.join("\n");
}

function tableMarkdown(table) {
  const domRows = [...table.querySelectorAll("tr")];
  const rows = domRows.map((row) => [...row.children]
    .filter((cell) => ["th", "td"].includes(cell.tagName.toLowerCase()))
    .map((cell) => [...cell.childNodes].map(inline).join("").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim()));
  if (!rows.length) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const padded = rows.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill("")]);
  const header = padded[0];
  const headerCells = [...(domRows[0]?.children || [])].filter((cell) => ["th", "td"].includes(cell.tagName.toLowerCase()));
  const alignments = Array.from({ length: width }, (_, index) => {
    const style = headerCells[index]?.style?.textAlign || /text-align\s*:\s*(left|center|right)/i.exec(headerCells[index]?.getAttribute("style") || "")?.[1]?.toLowerCase() || "";
    return style === "center" ? ":---:" : style === "right" ? "---:" : style === "left" ? ":---" : "---";
  });
  return [
    `| ${header.join(" | ")} |`,
    `| ${alignments.join(" | ")} |`,
    ...padded.slice(1).map((row) => `| ${row.join(" | ")} |`)
  ].join("\n");
}

function block(node) {
  if (node.nodeType === 3) return escapeText(node.nodeValue || "").trim();
  if (node.nodeType !== 1) return "";
  const tag = node.tagName.toLowerCase();
  if (tag === "img") return inline(node);
  if (tag === "p") return [...node.childNodes].map(inline).join("").trim();
  if (/^h[1-6]$/.test(tag)) return `${"#".repeat(Number(tag[1]))} ${[...node.childNodes].map(inline).join("").trim()}`;
  if (tag === "ul" || tag === "ol") return listMarkdown(node);
  if (tag === "blockquote") {
    const content = [...node.childNodes].map(block).filter(Boolean).join("\n\n");
    return content.split("\n").map((line) => `> ${line}`).join("\n");
  }
  if (tag === "pre") {
    const code = node.querySelector("code");
    const text = (code || node).textContent.replace(/\n+$/, "");
    const language = [...(code?.classList || [])].find((name) => name.startsWith("language-"))?.slice(9) || "";
    const fenceLength = Math.max(3, ...[...text.matchAll(/`+/g)].map((match) => match[0].length + 1));
    const fence = "`".repeat(fenceLength);
    return `${fence}${language}\n${text}\n${fence}`;
  }
  if (tag === "table") return tableMarkdown(node);
  if (tag === "hr") return "---";
  if (tag === "figure") return [...node.children].map(block).filter(Boolean).join("\n\n");
  if (tag === "figcaption") return [...node.childNodes].map(inline).join("");
  return [...node.childNodes].map(block).filter(Boolean).join("\n\n");
}

export function richTextToMarkdown(root) {
  return [...root.childNodes].map(block).filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function suggestSlug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function splitList(value) {
  return String(value || "").split(",").map((part) => part.trim()).filter(Boolean);
}

export function articleWordCount(markdown) {
  const text = String(markdown || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!?(?:\[([^\]]*)\])\([^)]*\)/g, "$1")
    .replace(/[#>*_~|`-]/g, " ")
    .trim();
  return text ? text.split(/\s+/u).length : 0;
}
