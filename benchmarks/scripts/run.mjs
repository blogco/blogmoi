import { spawn, spawnSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { benchmarkRoot, datasetRoot, generateDataset, SIZES, workRoot } from "./generate-dataset.mjs";
import { verifyOutput } from "./verify-output.mjs";
import { writeSummary } from "./summarize.mjs";

const frameworks = ["eleventy", "hugo", "astro"];
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(benchmarkRoot, "..");
const outputFromArgs = process.argv.find((value) => value.startsWith("--results="))?.split("=").slice(1).join("=");
const sizesArg = process.argv.find((value) => value.startsWith("--sizes="))?.split("=").slice(1).join("=");
const runsArg = process.argv.find((value) => value.startsWith("--runs="))?.split("=").slice(1).join("=");
const resultsPath = path.resolve(repoRoot, outputFromArgs || "benchmarks/results/raw.json");
const sizes = sizesArg ? sizesArg.split(",").map(Number) : SIZES;
const measuredRuns = runsArg ? Number(runsArg) : 5;
const labels = process.argv.filter((value) => value.startsWith("--label=")).map((value) => value.slice(8));
const label = labels[0] || "production";
const logRoot = path.join(workRoot, "logs", label);
const outputRoot = path.join(workRoot, "output");
const cacheRoot = path.join(workRoot, "cache");
const projectRoot = path.join(workRoot, "projects");

if (!measuredRuns || !Number.isInteger(measuredRuns)) throw new Error("--runs must be a positive integer");
for (const size of sizes) if (!SIZES.includes(size)) throw new Error(`Unsupported size ${size}; choose ${SIZES.join(", ")}`);

function capture(command, args, cwd = repoRoot, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

function shuffled(values, seed) {
  const result = [...values];
  let state = seed >>> 0;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function buildPaths(framework, size) {
  return {
    output: path.join(outputRoot, framework, String(size)),
    cache: framework === "hugo" || framework === "astro" ? path.join(cacheRoot, framework, String(size)) : null
  };
}

async function clearBuildState(framework, size) {
  const paths = buildPaths(framework, size);
  await rm(paths.output, { recursive: true, force: true });
  if (paths.cache) await rm(paths.cache, { recursive: true, force: true });
}

async function prepareEleventy(size) {
  const stage = path.join(projectRoot, `eleventy-${size}`);
  await rm(stage, { recursive: true, force: true });
  await mkdir(path.dirname(stage), { recursive: true });
  await cp(path.join(benchmarkRoot, "eleventy", "site"), stage, { recursive: true });
  await cp(path.join(benchmarkRoot, "eleventy", "eleventy.config.mjs"), path.join(stage, "eleventy.config.mjs"));
  const destination = path.join(stage, "src", "posts");
  await mkdir(destination, { recursive: true });
  await cp(path.join(datasetRoot, String(size), "posts"), destination, { recursive: true });
  return stage;
}

const packageEleventy = await readJson(path.join(benchmarkRoot, "eleventy", "package.json"));
const packageAstro = await readJson(path.join(benchmarkRoot, "astro", "package.json"));
const installedEleventy = await readJson(path.join(benchmarkRoot, "eleventy", "node_modules", "@11ty", "eleventy", "package.json"));
const installedAstro = await readJson(path.join(benchmarkRoot, "astro", "node_modules", "astro", "package.json"));
const hugoVersion = capture(process.env.HUGO_BIN || "hugo", ["version"]).match(/hugo (v\d+\.\d+\.\d+)/i)?.[1];
const versions = {
  eleventy: installedEleventy.version,
  hugo: hugoVersion,
  astro: installedAstro.version
};
if (versions.eleventy !== packageEleventy.devDependencies["@11ty/eleventy"] || versions.astro !== packageAstro.devDependencies.astro) {
  throw new Error("Installed Eleventy or Astro version does not match the pinned benchmark package.json version.");
}
const expectedVersions = { node: "v24.22.1", eleventy: "3.1.7", hugo: "v0.168.0", astro: "7.4.2" };
if (process.version !== expectedVersions.node || versions.eleventy !== expectedVersions.eleventy || versions.hugo !== expectedVersions.hugo || versions.astro !== expectedVersions.astro) {
  throw new Error(`Version mismatch. Expected Node ${expectedVersions.node}, Eleventy ${expectedVersions.eleventy}, Hugo ${expectedVersions.hugo}, Astro ${expectedVersions.astro}; got Node ${process.version}, Eleventy ${versions.eleventy}, Hugo ${versions.hugo}, Astro ${versions.astro}.`);
}
const environment = {
  benchmarkDateUtc: new Date().toISOString(),
  os: `${os.type()} ${os.release()}`,
  platform: process.platform,
  architecture: os.arch(),
  cpuModel: os.cpus()[0]?.model || "unknown",
  logicalCpuCount: os.cpus().length,
  ramBytes: os.totalmem(),
  ramGiB: Number((os.totalmem() / (1024 ** 3)).toFixed(2)),
  nodeVersion: process.version,
  npmVersion: capture("npm", ["--version"]),
  packageManager: "npm",
  gitCommit: capture("git", ["rev-parse", "HEAD"]),
  frameworkVersions: versions,
  memoryMeasurement: "macOS /usr/bin/time -l, maximum resident set size for the direct build process",
  timer: "process.hrtime.bigint() (monotonic nanosecond clock)",
  measuredRuns,
  warmupBuilds: 1,
  executionPolicy: "Serial; framework order randomized with a fixed scheduler seed within each sample round.",
  cachePolicy: "Cold removes output and framework disk cache; warm preserves output and cache. Dependencies remain installed.",
  outputPolicy: "Only generated HTML is emitted; total output bytes therefore equal HTML bytes.",
  incrementalRebuild: "Not measured: the three frameworks expose different watch/dev-server semantics, and no shared, directly comparable output signal was established."
};

const raw = {
  schemaVersion: 1,
  label,
  complete: false,
  startedAtUtc: new Date().toISOString(),
  environment,
  frameworkVersions: versions,
  dataset: [],
  records: [],
  failures: []
};

async function writeProgress() {
  await mkdir(path.dirname(resultsPath), { recursive: true });
  await writeFile(resultsPath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  await writeFile(path.join(path.dirname(resultsPath), "environment.json"), `${JSON.stringify(environment, null, 2)}\n`, "utf8");
}

function commandFor(framework, size, paths) {
  const commonEnv = { ...process.env, CI: "1", NO_COLOR: "1", TZ: "UTC" };
  if (framework === "eleventy") {
    const stage = path.join(projectRoot, `eleventy-${size}`);
    const bin = path.join(benchmarkRoot, "eleventy", "node_modules", "@11ty", "eleventy", "cmd.cjs");
    return { command: process.execPath, args: [bin, `--input=${path.join(stage, "src")}`, `--output=${paths.output}`], cwd: stage, env: commonEnv };
  }
  if (framework === "hugo") {
    const contentDir = path.join(datasetRoot, String(size), "posts");
    const args = [`--contentDir=${contentDir}`, `--destination=${paths.output}`, `--cacheDir=${paths.cache}`, "--quiet"];
    return { command: process.env.HUGO_BIN || "hugo", args, cwd: path.join(benchmarkRoot, "hugo"), env: commonEnv };
  }
  const contentDir = path.join(datasetRoot, String(size), "posts");
  return {
    command: process.execPath,
    args: [path.join(benchmarkRoot, "astro", "node_modules", "astro", "bin", "astro.mjs"), "build"],
    cwd: path.join(benchmarkRoot, "astro"),
    env: {
      ...commonEnv,
      BENCH_CONTENT_DIR: contentDir,
      BENCH_OUT_DIR: paths.output,
      BENCH_CACHE_DIR: paths.cache,
      BENCH_SIZE: String(size)
    }
  };
}

async function executeBuild(framework, size, buildType, runNumber, round, manifest) {
  const paths = buildPaths(framework, size);
  if (buildType === "cold") await clearBuildState(framework, size);
  const config = commandFor(framework, size, paths);
  const safeName = `${framework}-${size}-${buildType}-${runNumber}`;
  await mkdir(logRoot, { recursive: true });
  const timeLog = path.join(logRoot, `${safeName}.time.txt`);
  const buildLog = path.join(logRoot, `${safeName}.log`);
  const logFd = await import("node:fs/promises").then(({ open }) => open(buildLog, "w"));
  const started = process.hrtime.bigint();
  const child = spawn("/usr/bin/time", ["-l", "-o", timeLog, config.command, ...config.args], {
    cwd: config.cwd,
    env: config.env,
    stdio: ["ignore", logFd.fd, logFd.fd]
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  await logFd.close();
  const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  if (exitCode !== 0) {
    const log = await readFile(buildLog, "utf8").catch(() => "");
    const message = `Build failed: ${framework}/${size}/${buildType} run ${runNumber}, exit=${exitCode}\n${log.slice(-8000)}`;
    raw.failures.push({ framework, datasetSize: size, buildType, run: runNumber, round, exitCode, message, log: path.relative(benchmarkRoot, buildLog) });
    await writeProgress();
    throw new Error(message);
  }
  const timeOutput = await readFile(timeLog, "utf8");
  const memoryMatch = timeOutput.match(/([\d,]+)\s+maximum resident set size/i);
  const peakMemoryBytes = memoryMatch ? Number(memoryMatch[1].replaceAll(",", "")) : null;
  const output = await verifyOutput(paths.output, manifest);
  const record = {
    framework,
    datasetSize: size,
    buildType,
    run: runNumber,
    round,
    runOrder: raw.records.length + 1,
    durationMs: Number(durationMs.toFixed(3)),
    peakMemoryBytes,
    peakMemoryMiB: peakMemoryBytes === null ? null : Number((peakMemoryBytes / (1024 ** 2)).toFixed(3)),
    outputBytes: output.outputBytes,
    htmlBytes: output.htmlBytes,
    generatedFiles: output.generatedFiles,
    htmlFiles: output.htmlFiles,
    datasetSha256: manifest.datasetSha256,
    cachePolicy: buildType === "cold" ? "output and framework cache removed before build" : "output and framework cache kept from prior build",
    log: path.relative(benchmarkRoot, buildLog),
    timeLog: path.relative(benchmarkRoot, timeLog)
  };
  raw.records.push(record);
  await writeProgress();
  process.stdout.write(`${framework.padEnd(8)} ${String(size).padStart(4)} ${buildType.padEnd(4)} run ${runNumber}: ${record.durationMs.toFixed(2)} ms, ${record.peakMemoryMiB ?? "n/a"} MiB, ${record.outputBytes} bytes, ${record.generatedFiles} pages\n`);
}

await mkdir(workRoot, { recursive: true });
await writeProgress();

try {
  for (const size of sizes) {
    const manifest = await generateDataset(size);
    raw.dataset.push({ size, seed: manifest.seed, articles: manifest.articleCount, sha256: manifest.datasetSha256 });
    await prepareEleventy(size);
    for (const framework of frameworks) {
      const output = buildPaths(framework, size).output;
      await rm(output, { recursive: true, force: true });
      await mkdir(path.dirname(output), { recursive: true });
    }

    const warmupOrder = shuffled(frameworks, 20261023 + size);
    process.stdout.write(`Warm-up ${size} articles: ${warmupOrder.join(" -> ")}\n`);
    for (const framework of warmupOrder) {
      await clearBuildState(framework, size);
      const paths = buildPaths(framework, size);
      const config = commandFor(framework, size, paths);
      const log = path.join(logRoot, `${framework}-${size}-warmup.log`);
      const time = path.join(logRoot, `${framework}-${size}-warmup.time.txt`);
      await mkdir(logRoot, { recursive: true });
      const result = spawnSync("/usr/bin/time", ["-l", "-o", time, config.command, ...config.args], { cwd: config.cwd, env: config.env, encoding: "utf8" });
      await writeFile(log, `${result.stdout || ""}${result.stderr || ""}`);
      if (result.status !== 0) throw new Error(`${framework} warm-up failed for ${size} articles: ${result.stderr || result.stdout}`);
      await verifyOutput(paths.output, manifest);
    }

    for (let round = 1; round <= measuredRuns; round += 1) {
      const buildTypes = round % 2 ? ["cold", "warm"] : ["warm", "cold"];
      for (const buildType of buildTypes) {
        const order = shuffled(frameworks, 20261023 + size * 31 + round * 17 + buildType.charCodeAt(0));
        for (const framework of order) await executeBuild(framework, size, buildType, round, round, manifest);
      }
    }
  }
  raw.complete = true;
  raw.finishedAtUtc = new Date().toISOString();
  await writeProgress();
  const summaryPath = path.join(path.dirname(resultsPath), resultsPath.endsWith("raw.json") ? "summary.json" : `${path.basename(resultsPath, ".json")}-summary.json`);
  await writeSummary(resultsPath, summaryPath);
  process.stdout.write(`Completed ${raw.records.length} measured builds. Raw: ${resultsPath}\nSummary: ${summaryPath}\n`);
} catch (error) {
  raw.complete = false;
  raw.finishedAtUtc = new Date().toISOString();
  raw.failures.push({ phase: "run", message: String(error?.stack || error) });
  await writeProgress();
  throw error;
}
