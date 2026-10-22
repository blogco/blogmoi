import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const summary = JSON.parse(await readFile(path.join(root, "results/summary.json"), "utf8"));
const sizes = [50, 250, 1000];
const frameworks = [
  { id: "hugo", label: "Hugo", color: "#ef8354" },
  { id: "eleventy", label: "Eleventy", color: "#4b9b83" },
  { id: "astro", label: "Astro", color: "#6877c5" }
];
const panels = sizes.map((size, panelIndex) => {
  const x = 78 + panelIndex * 286;
  const records = frameworks.map((framework) => ({
    ...framework,
    seconds: summary.results.find((row) => row.framework === framework.id && row.datasetSize === size && row.buildType === "cold").durationMs.median / 1000
  }));
  const maximum = Math.max(...records.map((record) => record.seconds));
  const ceiling = Math.ceil(maximum * 2) / 2;
  const chartTop = 92;
  const chartHeight = 244;
  const barWidth = 40;
  const gap = 26;
  const content = records.map((record, index) => {
    const barHeight = record.seconds / ceiling * chartHeight;
    const barX = x + 28 + index * (barWidth + gap);
    const barY = chartTop + chartHeight - barHeight;
    return `<rect x="${barX}" y="${barY.toFixed(1)}" width="${barWidth}" height="${barHeight.toFixed(1)}" rx="5" fill="${record.color}"/><text x="${barX + barWidth / 2}" y="${(barY - 9).toFixed(1)}" text-anchor="middle" class="value">${record.seconds.toFixed(3)}s</text><text x="${barX + barWidth / 2}" y="${chartTop + chartHeight + 24}" text-anchor="middle" class="framework">${record.label}</text>`;
  }).join("");
  const grid = [0, 0.5, 1].map((fraction) => {
    const y = chartTop + chartHeight - fraction * chartHeight;
    const value = (ceiling * fraction).toFixed(1);
    return `<line x1="${x + 8}" y1="${y.toFixed(1)}" x2="${x + 252}" y2="${y.toFixed(1)}" class="grid"/><text x="${x}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="tick">${value}</text>`;
  }).join("");
  return `<g><text x="${x + 130}" y="48" text-anchor="middle" class="panel-title">${size.toLocaleString("en-US")} bài viết</text>${grid}${content}</g>`;
}).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 410" role="img" aria-labelledby="title desc">
<title id="title">Thời gian cold build trung vị của Hugo, Eleventy và Astro</title>
<desc id="desc">Ba biểu đồ cột so sánh thời gian build production trung vị, tính bằng giây, trên 50, 250 và 1000 bài viết. Hugo có thời gian thấp nhất ở cả ba cỡ dữ liệu trong phép đo này.</desc>
<style>text{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#24322f}.panel-title{font-size:18px;font-weight:700}.value{font-size:13px;font-weight:650}.framework{font-size:12px}.tick{font-size:11px;fill:#64716e}.grid{stroke:#dbe2df;stroke-width:1}.axis-label{font-size:13px;font-weight:600}</style>
<rect width="960" height="410" rx="14" fill="#fff"/><text x="480" y="24" text-anchor="middle" class="axis-label">Cold build — trung vị của 5 lượt build đầy đủ</text>
${panels}
<text x="24" y="220" transform="rotate(-90 24 220)" text-anchor="middle" class="axis-label">Giây</text>
</svg>`;

await writeFile(path.resolve(root, "../static/images/benchmark-sgg-build-time.svg"), svg, "utf8");
