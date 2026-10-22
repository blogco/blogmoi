(() => {
  "use strict";

  const root = document.querySelector("[data-deploy-status]");
  if (!root) return;

  const actionsUrl = "https://github.com/blogco/blogmoi/actions";
  const productionUrl = new URL("https://blogco.github.io/blogmoi/");
  const apiUrl = "https://api.github.com/repos/blogco/blogmoi/actions/runs?branch=main&per_page=100";
  const productionWorkflowPath = ".github/workflows/deploy.yml";
  const cacheKey = "blogmoi-deploy-status-v3";
  const cacheDuration = 120_000;
  const successLimit = 10;
  const failureLimit = 5;
  const report = root.querySelector("[data-report]");
  const runLink = root.querySelector("[data-run-link]");
  const commitAction = root.querySelector("[data-commit-action]");
  const copyButton = root.querySelector("[data-copy-sha]");
  const copyFeedback = root.querySelector("[data-copy-feedback]");
  const dataNote = root.querySelector("[data-data-note]");
  const historyLink = root.querySelector("[data-history-link]");
  const successList = root.querySelector("[data-success-list]");
  const failedList = root.querySelector("[data-failed-list]");
  const successCount = root.querySelector("[data-success-count]");
  const failedCount = root.querySelector("[data-failed-count]");
  const historyNote = root.querySelector("[data-history-note]");
  let latestSnapshot = null;
  let productionVerified = false;

  function setText(element, value) {
    if (element) element.textContent = value;
  }

  function asciiText(value, fallback, limit = 72) {
    const result = String(value ?? "")
      .split(/\r?\n/, 1)[0]
      .replace(/[Đđ]/g, (letter) => letter === "Đ" ? "D" : "d")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7E]/g, "?")
      .replace(/\s+/g, " ")
      .trim();
    if (!result) return fallback;
    return result.length > limit ? `${result.slice(0, limit - 3)}...` : result;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "Unknown time";
    return `${new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short"
    }).format(date)} · giờ địa phương`;
  }

  function formatHistoryDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "Không rõ thời gian";
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(date);
  }

  function isRepositoryUrl(value, expectedPathPrefix) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname === "github.com" && url.pathname.startsWith(expectedPathPrefix);
    } catch {
      return false;
    }
  }

  function runSteps(snapshot) {
    const jobs = snapshot.jobs?.jobs;
    if (!Array.isArray(jobs)) return [];
    return jobs.flatMap((job) => Array.isArray(job.steps) ? job.steps : []);
  }

  function stepNamed(snapshot, name) {
    return runSteps(snapshot).find((step) => step.name === name);
  }

  function getHistoryRuns(workflowRuns) {
    const candidates = workflowRuns
      .filter((candidate) => candidate.path === productionWorkflowPath && candidate.head_branch === "main")
      .filter((candidate) => typeof candidate.head_sha === "string" && /^[\da-f]{40}$/i.test(candidate.head_sha))
      .sort((left, right) => Date.parse(right.created_at || "") - Date.parse(left.created_at || ""));
    const latestByCommit = new Map();

    for (const candidate of candidates) {
      const sha = candidate.head_sha.toLowerCase();
      if (!latestByCommit.has(sha)) latestByCommit.set(sha, candidate);
    }

    const latestRuns = [...latestByCommit.values()];
    return {
      successful: latestRuns.filter((candidate) => candidate.status === "completed" && candidate.conclusion === "success").slice(0, successLimit),
      failed: latestRuns.filter((candidate) => candidate.status === "completed" && candidate.conclusion === "failure").slice(0, failureLimit)
    };
  }

  async function fetchJson(url) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {
        method: "GET",
        credentials: "omit",
        cache: "no-store",
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`GitHub API responded with ${response.status}`);
      return await response.json();
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function readCache() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
      if (cached && Date.now() - cached.savedAt < cacheDuration && cached.run?.id && Array.isArray(cached.history?.successful) && Array.isArray(cached.history?.failed)) return cached;
    } catch { /* Storage may be disabled; fetch directly. */ }
    return null;
  }

  function writeCache(snapshot) {
    snapshot.savedAt = Date.now();
    try { sessionStorage.setItem(cacheKey, JSON.stringify(snapshot)); }
    catch { /* The live result is still rendered when session storage is unavailable. */ }
  }

  async function getSnapshot() {
    const cached = readCache();
    if (cached) return cached;

    const response = await fetchJson(apiUrl);
    const workflowRuns = Array.isArray(response?.workflow_runs) ? response.workflow_runs : [];
    const run = workflowRuns
      .filter((candidate) => candidate.path === productionWorkflowPath && candidate.head_branch === "main")
      .sort((left, right) => Date.parse(right.created_at || "") - Date.parse(left.created_at || ""))[0];
    if (!run || !Number.isFinite(Number(run.id))) throw new Error("No production workflow run is available.");

    const history = getHistoryRuns(workflowRuns);
    const runsNeedingJobs = [
      run,
      ...history.failed.slice(0, 1)
    ];
    const uniqueRunsNeedingJobs = [...new Map(runsNeedingJobs.map((candidate) => [String(candidate.id), candidate])).values()];
    const jobResults = await Promise.all(uniqueRunsNeedingJobs.map(async (candidate) => {
      try {
        const jobs = await fetchJson(`https://api.github.com/repos/blogco/blogmoi/actions/runs/${encodeURIComponent(candidate.id)}/jobs?per_page=100`);
        return [String(candidate.id), jobs];
      } catch {
        return [String(candidate.id), null];
      }
    }));
    const jobsByRunId = Object.fromEntries(jobResults);

    const snapshot = {
      run,
      jobs: jobsByRunId[String(run.id)] || null,
      history: {
        successful: history.successful,
        failed: history.failed.map((failedRun, index) => ({
          run: failedRun,
          jobs: index === 0 ? jobsByRunId[String(failedRun.id)] || null : null,
          reasonIsLatest: index === 0
        }))
      },
      savedAt: Date.now()
    };
    writeCache(snapshot);
    return snapshot;
  }

  function createHistoryItem(entry, isFailure) {
    const run = isFailure ? entry.run : entry;
    const item = document.createElement("li");
    item.className = "deploy-status__history-item";

    const meta = document.createElement("div");
    meta.className = "deploy-status__history-meta";
    const shaLink = document.createElement("a");
    shaLink.className = "deploy-status__history-sha";
    shaLink.href = `https://github.com/blogco/blogmoi/commit/${run.head_sha}`;
    shaLink.target = "_blank";
    shaLink.rel = "noopener noreferrer";
    shaLink.textContent = run.head_sha.slice(0, 7);
    shaLink.title = `Mở commit ${run.head_sha}`;
    meta.append(shaLink);

    const time = document.createElement("time");
    time.className = "deploy-status__history-time";
    time.textContent = formatHistoryDate(run.updated_at || run.created_at);
    if (run.updated_at || run.created_at) time.dateTime = run.updated_at || run.created_at;
    meta.append(time);
    item.append(meta);

    const message = typeof run.head_commit?.message === "string" && run.head_commit.message.trim()
      ? run.head_commit.message.split(/\r?\n/, 1)[0]
      : run.display_title || "Không có commit message";
    const title = document.createElement("p");
    title.className = "deploy-status__history-message";
    title.textContent = message;
    item.append(title);

    if (isFailure) {
      const reason = document.createElement("p");
      reason.className = "deploy-status__history-reason";
      reason.textContent = entry.reasonIsLatest
        ? `Bước lỗi gần nhất: ${getFailureReason(entry.jobs)}`
        : "Mở log workflow để xem nguyên nhân của lần chạy này.";
      item.append(reason);

      const runLink = document.createElement("a");
      runLink.className = "deploy-status__history-run-link";
      runLink.href = `https://github.com/blogco/blogmoi/actions/runs/${encodeURIComponent(run.id)}`;
      runLink.target = "_blank";
      runLink.rel = "noopener noreferrer";
      runLink.textContent = "Mở log workflow ↗";
      item.append(runLink);
    }

    return item;
  }

  function getFailureReason(jobsResponse) {
    const jobs = jobsResponse?.jobs;
    if (!Array.isArray(jobs)) return "Workflow failed; open GitHub Actions for details.";

    const failedItems = [];
    for (const job of jobs) {
      if (job.conclusion !== "failure") continue;
      const failedSteps = Array.isArray(job.steps) ? job.steps.filter((step) => step.conclusion === "failure") : [];
      if (failedSteps.length) {
        for (const step of failedSteps) {
          failedItems.push({
            jobName: job.name || "Unknown job",
            stepName: step.name || "Unknown step",
            completedAt: Date.parse(step.completed_at || job.completed_at || "") || 0
          });
        }
      } else {
        failedItems.push({
          jobName: job.name || "Unknown job",
          stepName: "Job failed",
          completedAt: Date.parse(job.completed_at || "") || 0
        });
      }
    }

    failedItems.sort((left, right) => right.completedAt - left.completedAt);
    const latest = failedItems[0];
    return latest ? `${latest.jobName}: ${latest.stepName}` : "Workflow failed; open GitHub Actions for details.";
  }

  function renderHistory(snapshot) {
    const successful = snapshot.history?.successful || [];
    const failed = snapshot.history?.failed || [];
    setText(successCount, `${successful.length}/${successLimit}`);
    setText(failedCount, `${failed.length}/${failureLimit}`);
    setText(historyNote, `Đã tải ${successful.length} commit thành công và ${failed.length} commit thất bại từ tối đa 100 lần chạy trên main. Chi tiết lỗi đầy đủ nằm trong log workflow.`);
    historyLink.href = actionsUrl;

    successList.replaceChildren();
    if (!successful.length) {
      const empty = document.createElement("li");
      empty.className = "deploy-status__history-empty";
      empty.textContent = "Chưa có commit triển khai thành công trong dữ liệu gần đây.";
      successList.append(empty);
    } else {
      for (const run of successful) successList.append(createHistoryItem(run, false));
    }

    failedList.replaceChildren();
    if (!failed.length) {
      const empty = document.createElement("li");
      empty.className = "deploy-status__history-empty";
      empty.textContent = "Không tìm thấy commit triển khai thất bại gần đây.";
      failedList.append(empty);
    } else {
      for (const entry of failed) failedList.append(createHistoryItem(entry, true));
    }
  }

  function getStepStatus(step, run) {
    if (step?.conclusion === "success") return "PASS";
    if (step?.conclusion === "failure" || step?.conclusion === "cancelled" || step?.conclusion === "timed_out") return "FAIL";
    if (step?.conclusion === "skipped") return "NOT RUN";
    if (!step && run.status === "completed" && run.conclusion === "success") return "PASS";
    return "NOT RUN";
  }

  function getDeployStatus(deployStep, run) {
    if (deployStep?.conclusion === "success") return "PASS";
    if (run.status === "completed" && run.conclusion === "success") return "PASS";
    if (run.status === "completed") return "FAIL";
    return "PENDING";
  }

  function getReportData(snapshot, isProductionVerified) {
    const { run } = snapshot;
    const buildStep = stepNamed(snapshot, "Build Eleventy site");
    const deployStep = stepNamed(snapshot, "Deploy to Pages");
    const build = getStepStatus(buildStep, run);
    const tests = "NOT RUN";
    const push = run.event === "push" ? "PASS" : "NOT RUN";
    const deploy = getDeployStatus(deployStep, run);
    const production = isProductionVerified ? "VERIFIED" : "NOT VERIFIED";
    const failures = [build, push, deploy].filter((status) => status === "FAIL");
    const result = failures.length
      ? "FAILED"
      : deploy === "PASS" && build === "PASS" && production === "VERIFIED" && run.status === "completed" && run.conclusion === "success"
        ? "SUCCESS"
        : "PARTIAL";
    const commit = typeof run.head_sha === "string" && /^[\da-f]{40}$/i.test(run.head_sha) ? run.head_sha : "";
    const commitMessage = typeof run.head_commit?.message === "string" && run.head_commit.message.trim()
      ? run.head_commit.message
      : run.display_title;
    return {
      feature: asciiText(commitMessage, "UNKNOWN FEATURE", 48),
      commit: commit ? commit.slice(0, 7) : "UNKNOWN",
      branch: asciiText(run.head_branch, "UNKNOWN", 48),
      build,
      tests,
      push,
      deploy,
      production,
      result,
      error: failures.length ? asciiText(getFailureReason(snapshot.jobs), "Workflow failed", 48) : ""
    };
  }

  function renderReport(data) {
    const contentWidth = 60;
    const border = `+${"-".repeat(contentWidth + 2)}+`;
    const row = (value) => `| ${asciiText(value, "", contentWidth).padEnd(contentWidth, " ")} |`;
    const lines = [
      border,
      row("BLOGMOI DEPLOY STATUS"),
      border,
      row(`FEATURE     ${data.feature}`),
      row(`COMMIT      ${data.commit}`),
      row(`BRANCH      ${data.branch}`),
      row(`BUILD       ${data.build}`),
      row(`TESTS       ${data.tests}`),
      row(`PUSH        ${data.push}`),
      row(`DEPLOY      ${data.deploy}`),
      row(`PRODUCTION  ${data.production}`)
    ];
    if (data.error) lines.push(row(`ERROR       ${data.error}`));
    lines.push(border, row(`RESULT      ${data.result}`), border);
    report.textContent = lines.join("\n");
    root.dataset.state = data.result.toLowerCase();
  }

  function renderSnapshot(snapshot) {
    latestSnapshot = snapshot;
    renderHistory(snapshot);
    const { run } = snapshot;
    const runUrl = isRepositoryUrl(run.html_url, "/blogco/blogmoi/actions/runs/") ? run.html_url : actionsUrl;
    const fullSha = typeof run.head_sha === "string" && /^[\da-f]{40}$/i.test(run.head_sha) ? run.head_sha : "";

    runLink.href = runUrl;
    if (fullSha) {
      commitAction.href = `https://github.com/blogco/blogmoi/commit/${fullSha}`;
      commitAction.hidden = false;
      copyButton.disabled = false;
      copyButton.dataset.sha = fullSha;
    } else {
      commitAction.hidden = true;
      copyButton.disabled = true;
      delete copyButton.dataset.sha;
    }

    const data = getReportData(snapshot, productionVerified);
    renderReport(data);

    if (dataNote) {
      const checkedAt = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(new Date(snapshot.savedAt));
      const isCached = Date.now() - snapshot.savedAt > 2000;
      dataNote.textContent = ` · ${isCached ? "Cache" : "GitHub API"} ${checkedAt}`;
    }
  }

  function setUnknownState() {
    latestSnapshot = null;
    renderReport({
      feature: "UNKNOWN FEATURE",
      commit: "UNKNOWN",
      branch: "UNKNOWN",
      build: "NOT RUN",
      tests: "NOT RUN",
      push: "NOT RUN",
      deploy: "PENDING",
      production: productionVerified ? "VERIFIED" : "NOT VERIFIED",
      result: "PARTIAL",
      error: ""
    });
    setText(copyFeedback, "");
    setText(dataNote, " · GitHub Actions data unavailable");
    setText(successCount, `—/${successLimit}`);
    setText(failedCount, `—/${failureLimit}`);
    setText(historyNote, "Chưa thể tải lịch sử commit từ GitHub Actions.");
    for (const list of [successList, failedList]) {
      const item = document.createElement("li");
      item.className = "deploy-status__history-empty";
      item.textContent = "Chưa thể tải lịch sử từ GitHub Actions.";
      list.replaceChildren(item);
    }
  }

  async function verifyProduction() {
    if (window.location.origin !== productionUrl.origin || !window.location.pathname.startsWith(productionUrl.pathname)) return false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(productionUrl, {
        method: "GET",
        credentials: "omit",
        cache: "no-store",
        headers: { Accept: "text/html" },
        signal: controller.signal
      });
      return response.ok && new URL(response.url).origin === productionUrl.origin;
    } catch {
      return false;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function copySha() {
    const value = copyButton.dataset.sha;
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const field = document.createElement("textarea");
        field.value = value;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.append(field);
        field.select();
        const copied = document.execCommand("copy");
        field.remove();
        if (!copied) throw new Error("Clipboard unavailable.");
      }
      setText(copyFeedback, "SHA đã được sao chép.");
    } catch {
      setText(copyFeedback, "Không thể sao chép SHA trên thiết bị này.");
    }
  }

  async function start() {
    copyButton.addEventListener("click", copySha);
    const productionPromise = verifyProduction().then((verified) => {
      productionVerified = verified;
      if (latestSnapshot) renderSnapshot(latestSnapshot);
      else setUnknownState();
    });

    try {
      const snapshot = await getSnapshot();
      renderSnapshot(snapshot);
    } catch {
      setUnknownState();
    }
    await productionPromise;
  }

  start();
})();
