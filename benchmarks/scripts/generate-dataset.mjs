import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SEED = 20261023;
export const SIZES = [50, 250, 1000];
export const CATEGORIES = ["Công nghệ", "Web Development", "Thiết kế"];
export const TAGS = ["Eleventy", "Hugo", "Astro", "Benchmark", "Performance", "Blogmoi"];

const here = path.dirname(fileURLToPath(import.meta.url));
export const benchmarkRoot = path.resolve(here, "..");
export const workRoot = path.join(benchmarkRoot, ".work");
export const datasetRoot = path.join(workRoot, "dataset");

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function pad(value, width = 4) {
  return String(value).padStart(width, "0");
}

function dateFor(index) {
  const value = new Date(Date.UTC(2024, 0, 1 + index));
  return value.toISOString().slice(0, 10);
}

function makeBody({ index, slug, targetSlug, category, tags }) {
  return `Blog tĩnh giúp tôi quản lý nội dung dưới dạng văn bản dễ đọc và tạo HTML trong bước build. Bài mẫu số ${index} kiểm tra cách công cụ xử lý dấu tiếng Việt như ă, â, đ, ê, ô, ơ, ư và các dấu thanh trong cùng một trang. Mỗi biến thể dùng cùng bộ quy tắc sinh nội dung, không lấy văn bản từ bài đã xuất bản.\n\n` +
    `## Nội dung đa ngôn ngữ và cấu trúc\n\n` +
    `Một đoạn tiếng Hàn dùng để kiểm tra Unicode: 정적 사이트 생성기는 마크다운 문서를 HTML 페이지로 변환합니다. English sample: a static site generator turns structured content into linked HTML pages. These strings are synthetic test material and remain identical across the three fixtures.\n\n` +
    `### Metadata và phân loại\n\n` +
    `Bài viết thuộc **${category}** và có các thẻ ${tags.map((tag) => `**${tag}**`).join(", ")}. Ngày xuất bản được sinh theo chỉ số bài, còn tiêu đề và slug có thể đối chiếu trực tiếp với manifest.\n\n` +
    `| Trường | Giá trị |\n| --- | --- |\n| Bài viết | ${pad(index)} |\n| Danh mục | ${category} |\n| Ngôn ngữ thử nghiệm | Việt, 한국어, English |\n\n` +
    `### Ví dụ mã và liên kết nội bộ\n\n` +
    "```js\n" +
    `const articlePath = "/${slug}/";\n` +
    `const nextArticlePath = "/${targetSlug}/";\n` +
    "console.log({ articlePath, nextArticlePath });\n" +
    "```\n\n" +
    `Đọc tiếp [bài thử nghiệm ${targetSlug}](/${targetSlug}/) hoặc quay về [trang chủ](/). Các đường dẫn này được tạo từ cùng manifest và trỏ tới những trang nằm trong bộ dữ liệu.\n\n` +
    `Đoạn kết của bài ${index} giúp duy trì độ dài Markdown ổn định. Mục tiêu là so sánh quá trình biến đổi nội dung và tạo danh sách, không đo hiệu năng tải trang của trình duyệt.\n`;
}

export function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
}

export async function generateDataset(size, { force = true } = {}) {
  if (!SIZES.includes(size)) throw new Error(`Unsupported dataset size: ${size}`);
  const destination = path.join(datasetRoot, String(size));
  if (force) await rm(destination, { recursive: true, force: true });
  const postsDir = path.join(destination, "posts");
  await mkdir(postsDir, { recursive: true });

  const random = createRandom(SEED + size);
  const posts = [];
  for (let zeroIndex = 0; zeroIndex < size; zeroIndex += 1) {
    const index = zeroIndex + 1;
    const slug = `benchmark-bai-viet-${pad(index)}`;
    const targetSlug = `benchmark-bai-viet-${pad(index === size ? 1 : index + 1)}`;
    const category = CATEGORIES[zeroIndex % CATEGORIES.length];
    const tagStart = Math.floor(random() * TAGS.length);
    const tags = [0, 2, 4].map((offset) => TAGS[(tagStart + offset) % TAGS.length]);
    const date = dateFor(zeroIndex);
    const title = `Bài benchmark ${pad(index)}: tạo blog tĩnh với tiếng Việt`;
    const description = `Bài nội dung tổng hợp ${pad(index)} dùng để đo build tĩnh với tiếng Việt, tiếng Hàn và English.`;
    const markdown = `---\ntitle: ${JSON.stringify(title)}\nslug: ${slug}\nurl: /${slug}/\npermalink: /${slug}/index.html\ntype: article\ndescription: ${JSON.stringify(description)}\ndate: ${date}\ncategories: ${JSON.stringify([category])}\ntags: ${JSON.stringify(tags)}\nlang: vi\n---\n\n${makeBody({ index, slug, targetSlug, category, tags })}`;
    const filePath = path.join(postsDir, `${slug}.md`);
    await writeFile(filePath, markdown, "utf8");
    posts.push({ slug, title, description, date, categories: [category], tags, file: `posts/${slug}.md` });
  }

  const fileHashes = [];
  for (const entry of await readdir(postsDir)) {
    const content = await readFile(path.join(postsDir, entry));
    fileHashes.push({ path: `posts/${entry}`, sha256: createHash("sha256").update(content).digest("hex") });
  }
  fileHashes.sort((a, b) => a.path.localeCompare(b.path));
  const manifest = {
    seed: SEED,
    size,
    categories: CATEGORIES,
    tags: TAGS,
    articleCount: posts.length,
    posts,
    files: fileHashes,
    datasetSha256: createHash("sha256").update(fileHashes.map((file) => `${file.path}:${file.sha256}`).join("\n")).digest("hex")
  };
  await writeFile(path.join(destination, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const selected = process.argv.slice(2).map(Number);
  const sizes = selected.length ? selected : SIZES;
  for (const size of sizes) {
    const manifest = await generateDataset(size);
    process.stdout.write(`${size} articles ${manifest.datasetSha256}\n`);
  }
}
