# Blogmoi static-site benchmark

This isolated benchmark compares Eleventy, Hugo, and Astro using one generated Markdown dataset and equivalent static HTML routes. It does not run as part of the normal Blogmoi build and does not change the production dependency list or deployment workflow.

## Layout

- `scripts/generate-dataset.mjs` creates 50, 250, or 1,000 deterministic articles with seed `20261023`.
- `eleventy/`, `hugo/`, and `astro/` contain small framework fixtures. They share the same front matter and Markdown; the fixture layouts implement article pages, a homepage, category and tag indexes, term pages, canonical and Open Graph metadata, and internal links.
- `.work/` holds generated Markdown, staged Eleventy input, caches, build logs, and output sites. It is ignored by Git.
- `results/raw.json`, `results/summary.json`, `results/summary.csv`, and `results/environment.json` hold the measured data and environment record.

## Environment used for the checked-in measurements

The run is pinned to Node.js 24.22.1, Eleventy 3.1.7, Hugo 0.168.0 extended, and Astro 7.4.2. The benchmark script checks the framework versions before starting. Dependencies are installed separately in the Eleventy and Astro fixture directories; Hugo is an external binary selected with `HUGO_BIN`.

The original run records the operating system, CPU, architecture, logical CPU count, RAM, Node and npm versions, framework versions, UTC date, and the Git commit present when the run began. The benchmark fixtures were uncommitted at measurement time; the recorded commit is therefore the source revision before the benchmark files were added.

## Reproduce

Use the matching Node.js 24 runtime and Hugo 0.168.0 extended binary. Install dependencies once in each isolated project:

```sh
cd benchmarks/eleventy && npm ci
cd ../astro && npm ci
cd ../..
```

Then run the full matrix from the repository root:

```sh
HUGO_BIN=/path/to/hugo-0.168.0 \
  /path/to/node-v24.22.1/bin/node benchmarks/scripts/run.mjs
```

The default command uses all three data sizes, one untimed warm-up for each framework and size, and five measured cold plus five measured warm full builds for every framework and size. It writes raw measurements and summary statistics under `benchmarks/results/`. `--sizes=50 --runs=1 --label=smoke --results=/tmp/benchmark-smoke.json` runs a small parity check; smoke data is not part of the reported five-run sample.

The orchestration is serial. Framework order is shuffled deterministically in each sample round; cold and warm rounds alternate order. Timing uses `process.hrtime.bigint()`. On macOS, peak resident memory uses `/usr/bin/time -l` for the direct build process. That value is the build process high-water mark, not a sum across all child processes. If the OS blocks the required system call, run the benchmark in a context where `/usr/bin/time -l` can read it or treat memory as unavailable; do not substitute a fabricated value.

## Measurement definitions

- **Cold:** the generated output directory and any framework disk cache used by the fixture are removed before the build. Installed dependencies stay available. macOS file-system and OS caches are not flushed, so “cold” describes clean framework output/cache state, not a cold machine.
- **Warm:** a full production build runs with the previous output and framework cache left in place. These are still full builds; no watch-mode or incremental build is included. Eleventy has no persistent fixture build cache, while Hugo and Astro retain their configured cache directories.
- **Output size:** the fixtures emit HTML only. `outputBytes` and `htmlBytes` are therefore equal. Generated file counts include all output files and are checked against the expected route set.
- **Peak memory:** macOS `/usr/bin/time -l` maximum resident set size for the direct build process. This does not sum a process tree.
- **Summary:** median, arithmetic mean, minimum, maximum, sample standard deviation (`n - 1`), and coefficient of variation (`sample SD / mean`) are calculated from the raw rows.

Every successful build is checked for the expected article count, exact route set, HTML-only output, article headings, metadata, category/tag values, Markdown tables and code, multilingual samples, and valid internal article links. The dataset SHA-256 is attached to each raw build row. Markdown rendering whitespace can differ between framework engines; output-size comparisons include those real fixture differences.

## Scope and exclusions

Incremental edit-to-rebuild time is not measured. Eleventy, Hugo, and Astro expose different watcher and development-server behavior, and this fixture does not provide one reliable, equivalent output signal for those modes. This is kept separate from the full-build measurements rather than treating server startup or first-request latency as an incremental build.

Preflight attempts that exposed fixture issues and the one-run smoke sample are excluded from the five-run results. Their reasons and the smoke measurements are listed in `results/excluded-runs.json`.

## Cleanup

All generated test websites, generated datasets, staged content, caches, and logs live under the ignored `benchmarks/.work/` directory. Remove those artifacts with:

```sh
node -e 'import("node:fs").then(({ rmSync }) => rmSync("benchmarks/.work", { recursive: true, force: true }))'
```

This does not remove the checked-in raw measurements, summary files, fixture source, or the generated SVG chart used by the article.
