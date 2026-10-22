import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStandardDeviation(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}

export function summarizeRecords(records) {
  const keys = new Map();
  for (const record of records) {
    const key = `${record.framework}|${record.datasetSize}|${record.buildType}`;
    if (!keys.has(key)) keys.set(key, []);
    keys.get(key).push(record);
  }

  return [...keys.entries()].map(([key, rows]) => {
    const [framework, datasetSize, buildType] = key.split("|");
    const durations = rows.map((row) => row.durationMs);
    const memory = rows.map((row) => row.peakMemoryMiB).filter(Number.isFinite);
    const outputBytes = rows.map((row) => row.outputBytes);
    const htmlBytes = rows.map((row) => row.htmlBytes);
    const average = mean(durations);
    const standardDeviation = sampleStandardDeviation(durations);
    return {
      framework,
      datasetSize: Number(datasetSize),
      buildType,
      validRuns: rows.length,
      durationMs: {
        median: median(durations),
        mean: average,
        min: Math.min(...durations),
        max: Math.max(...durations),
        sampleStandardDeviation: standardDeviation,
        coefficientOfVariationPercent: average ? (standardDeviation / average) * 100 : 0
      },
      peakMemoryMiB: memory.length ? {
        median: median(memory),
        mean: mean(memory),
        min: Math.min(...memory),
        max: Math.max(...memory)
      } : null,
      generatedFiles: median(rows.map((row) => row.generatedFiles)),
      outputBytes: median(outputBytes),
      htmlBytes: median(htmlBytes)
    };
  }).sort((a, b) => a.datasetSize - b.datasetSize || a.buildType.localeCompare(b.buildType) || a.framework.localeCompare(b.framework));
}

export async function writeSummary(rawPath, summaryPath = path.join(path.dirname(rawPath), "summary.json")) {
  const raw = JSON.parse(await readFile(rawPath, "utf8"));
  if (!raw.complete) throw new Error(`Raw benchmark is not complete: ${rawPath}`);
  const summary = {
    schemaVersion: 1,
    source: path.basename(rawPath),
    generatedAt: new Date().toISOString(),
    environment: raw.environment,
    frameworkVersions: raw.frameworkVersions,
    statistics: "Sample standard deviation (n-1); coefficient of variation = sample standard deviation / mean.",
    results: summarizeRecords(raw.records)
  };
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  const csvPath = summaryPath.replace(/\.json$/i, ".csv");
  const columns = ["framework", "datasetSize", "buildType", "validRuns", "medianMs", "meanMs", "minMs", "maxMs", "sampleSdMs", "cvPercent", "medianPeakMemoryMiB", "medianOutputBytes", "medianHtmlBytes", "generatedFiles"];
  const rows = summary.results.map((row) => [
    row.framework, row.datasetSize, row.buildType, row.validRuns,
    row.durationMs.median.toFixed(2), row.durationMs.mean.toFixed(2), row.durationMs.min.toFixed(2), row.durationMs.max.toFixed(2),
    row.durationMs.sampleStandardDeviation.toFixed(2), row.durationMs.coefficientOfVariationPercent.toFixed(2),
    row.peakMemoryMiB?.median.toFixed(2) ?? "", row.outputBytes, row.htmlBytes, row.generatedFiles
  ]);
  await writeFile(csvPath, `${columns.join(",")}\n${rows.map((row) => row.join(",")).join("\n")}\n`, "utf8");
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const rawPath = path.resolve(process.argv[2] || "benchmarks/results/raw.json");
  const summaryPath = path.resolve(process.argv[3] || path.join(path.dirname(rawPath), "summary.json"));
  await writeSummary(rawPath, summaryPath);
  process.stdout.write(`${summaryPath}\n`);
}
