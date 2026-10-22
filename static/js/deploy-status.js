(() => {
  "use strict";

  const root = document.querySelector("[data-deploy-status]");
  if (!root) return;

  const actionsUrl = "https://github.com/blogco/blogmoi/actions";
  const apiUrl = "https://api.github.com/repos/blogco/blogmoi/actions/workflows/deploy.yml/runs?branch=main&per_page=1";
  const cacheKey = "blogmoi-deploy-status-v1";
  const cacheDuration = 120_000;
  const statusTitle = root.querySelector("[data-status-title]");
  const statusSummary = root.querySelector("[data-status-summary]");
  const statusStage = root.querySelector("[data-status-stage]");
  const runNumber = root.querySelector("[data-run-number]");
  const runStatus = root.querySelector("[data-run-status]");
  const workflowName = root.querySelector("[data-workflow-name]");
  const runLink = root.querySelector("[data-run-link]");
  const actionsLink = root.querySelector("[data-actions-link]");
  const commitLink = root.querySelector("[data-commit-link]");
  const commitPlaceholder = root.querySelector("[data-commit-placeholder]");
  const commitSha = root.querySelector("[data-commit-sha]");
  const commitAction = root.querySelector("[data-commit-action]");
  const commitMessage = root.querySelector("[data-commit-message]");
  const branch = root.querySelector("[data-branch]");
  const updated = root.querySelector("[data-updated]");
  const updatedLabel = root.querySelector("[data-updated-label]");
  const duration = root.querySelector("[data-duration]");
  const durationLabel = root.querySelector("[data-duration-label]");
  const dataNote = root.querySelector("[data-data-note]");
  const copyButton = root.querySelector("[data-copy-sha]");
  const copyFeedback = root.querySelector("[data-copy-feedback]");

  function setText(element, value) {
    if (element) element.textContent = value;
  }

  function setState(state, title, summary, stage = "") {
    root.dataset.state = state;
    setText(statusTitle, title);
    setText(statusSummary, summary);
    if (statusStage) {
      statusStage.textContent = stage;
      statusStage.hidden = !stage;
    }
  }

  function formatDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "Chưa có dữ liệu";
    return `${new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short"
    }).format(date)} · giờ địa phương`;
  }

  function formatDuration(startValue, endValue) {
    const start = Date.parse(startValue || "");
    const end = endValue ? Date.parse(endValue) : Date.now();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "Chưa có dữ liệu";
    const seconds = Math.floor((end - start) / 1000);
    if (seconds < 60) return `${seconds} giây`;
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    if (minutes < 60) return remaining ? `${minutes} phút ${remaining} giây` : `${minutes} phút`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours} giờ ${remainingMinutes} phút` : `${hours} giờ`;
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
      if (cached && Date.now() - cached.savedAt < cacheDuration && cached.run?.id) return cached;
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
    const run = response?.workflow_runs?.[0];
    if (!run || !Number.isFinite(Number(run.id))) throw new Error("No production workflow run is available.");

    const statusNeedsJobSteps = run.status === "in_progress" || run.status === "completed" && run.conclusion !== "success";
    let jobs = null;
    if (statusNeedsJobSteps) {
      try { jobs = await fetchJson(`https://api.github.com/repos/blogco/blogmoi/actions/runs/${encodeURIComponent(run.id)}/jobs?per_page=100`); }
      catch { /* The run status is still usable; completed runs without deploy-step evidence become unknown. */ }
    }

    const snapshot = { run, jobs, savedAt: Date.now() };
    writeCache(snapshot);
    return snapshot;
  }

  function renderSnapshot(snapshot) {
    const { run } = snapshot;
    const steps = runSteps(snapshot);
    const buildStep = steps.find((step) => step.name === "Build Eleventy site");
    const deployStep = steps.find((step) => step.name === "Deploy to Pages");
    const runUrl = isRepositoryUrl(run.html_url, "/blogco/blogmoi/actions/runs/") ? run.html_url : actionsUrl;
    const fullSha = typeof run.head_sha === "string" && /^[\da-f]{40}$/i.test(run.head_sha) ? run.head_sha : "";
    const commitUrl = fullSha ? `https://github.com/blogco/blogmoi/commit/${fullSha}` : "";
    const commit = run.head_commit || {};
    const isActive = ["queued", "requested", "waiting", "pending", "in_progress"].includes(run.status);
    const isQueued = ["queued", "requested", "waiting", "pending"].includes(run.status);
    const startTime = isQueued ? run.created_at || run.run_started_at : run.run_started_at || run.created_at;
    const finishTime = run.status === "completed" ? run.updated_at : "";
    const runTime = finishTime || startTime;

    setText(workflowName, run.name || "GitHub Actions deployment");
    setText(runNumber, `RUN #${run.run_number ?? "?"} · ID ${run.id}`);
    setText(runStatus, `${run.status || "unknown"} · ${run.conclusion || "—"}`);
    setText(branch, run.head_branch || "Không xác định");
    setText(updated, formatDate(runTime));
    setText(duration, formatDuration(startTime, finishTime));
    setText(updatedLabel, finishTime ? "THỜI ĐIỂM CẬP NHẬT" : isQueued ? "ĐƯỢC TẠO LÚC" : "BẮT ĐẦU LÚC");
    setText(durationLabel, isQueued ? "ĐÃ CHỜ" : isActive ? "ĐÃ CHẠY" : "THỜI LƯỢNG");
    setText(commitMessage, typeof commit.message === "string" && commit.message.trim() ? commit.message.split(/\r?\n/, 1)[0] : run.display_title || "Không có commit message");
    if (dataNote) {
      const checkedAt = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(new Date(snapshot.savedAt));
      const isCached = Date.now() - snapshot.savedAt > 2000;
      dataNote.textContent = ` · ${isCached ? "Dữ liệu đã kiểm tra" : "GitHub API đã kiểm tra"} lúc ${checkedAt} · giờ địa phương`;
    }

    runLink.href = runUrl;
    actionsLink.href = actionsUrl;
    if (fullSha) {
      commitLink.href = commitUrl;
      commitLink.hidden = false;
      commitPlaceholder.hidden = true;
      commitAction.href = commitUrl;
      commitAction.hidden = false;
      setText(commitSha, fullSha.slice(0, 7));
      copyButton.disabled = false;
      copyButton.dataset.sha = fullSha;
    } else {
      commitLink.hidden = true;
      commitPlaceholder.hidden = false;
      commitAction.hidden = true;
      setText(commitSha, "—");
      copyButton.disabled = true;
      delete copyButton.dataset.sha;
    }

    if (run.status === "completed" && run.conclusion === "success") {
      setState("success", "TRIỂN KHAI THÀNH CÔNG", "GitHub Actions đã hoàn tất bước xuất bản lên GitHub Pages.");
      return;
    }

    if (deployStep?.conclusion === "success") {
      setState("success", "TRIỂN KHAI THÀNH CÔNG", "GitHub Pages đã nhận phiên bản này.", "Một bước báo cáo trong workflow kết thúc không thành công sau khi xuất bản.");
      return;
    }

    if (isActive) {
      let summary = "GitHub Actions đang chuẩn bị hoặc xử lý phiên bản này. Bản đang chạy trên website vẫn được giữ cho tới khi xuất bản hoàn tất.";
      if (run.status === "queued" || run.status === "requested" || run.status === "waiting") {
        summary = "Workflow đang chờ GitHub Actions bắt đầu; phiên bản hiện tại trên website vẫn đang hoạt động.";
      } else if (buildStep?.conclusion === "success") {
        summary = "Bản dựng đã hoàn tất; GitHub Actions đang tiếp tục tới bước xuất bản. Website hiện vẫn dùng phiên bản đang hoạt động.";
      } else if (deployStep?.status === "in_progress") {
        summary = "GitHub Pages đang nhận phiên bản mới; trạng thái thành công sẽ được xác nhận khi bước xuất bản hoàn tất.";
      }
      setState("running", "ĐANG TRIỂN KHAI", summary);
      return;
    }

    if (run.status === "completed" && run.conclusion !== "success") {
      if (!Array.isArray(snapshot.jobs?.jobs)) {
        setState("unknown", "CHƯA XÁC ĐỊNH TRẠNG THÁI", "Không thể xác nhận bước xuất bản của lần chạy này.", "GitHub Actions không trả về chi tiết các bước. Mở workflow để xem kết quả mới nhất.");
        return;
      }
      if (buildStep?.conclusion === "failure") {
        setState("failed", "TRIỂN KHAI THẤT BẠI", "Bản dựng Eleventy gặp lỗi trước khi xuất bản.", "Phiên bản đã xuất bản trước đó tiếp tục được phục vụ.");
        return;
      }
      if (deployStep && deployStep.conclusion !== "success") {
        setState("failed", "TRIỂN KHAI THẤT BẠI", "Bản dựng không được xuất bản thành công lên GitHub Pages.", "Phiên bản đã xuất bản trước đó tiếp tục được phục vụ.");
        return;
      }
      setState("failed", "TRIỂN KHAI KHÔNG HOÀN TẤT", "Workflow kết thúc mà chưa xác nhận được lần xuất bản thành công.", "Mở chi tiết workflow để xem bước đã dừng.");
      return;
    }

    setState("unknown", "CHƯA XÁC ĐỊNH TRẠNG THÁI", "Không thể tải thông tin triển khai mới nhất từ GitHub Actions.");
  }

  function setUnknownState() {
    setState("unknown", "CHƯA XÁC ĐỊNH TRẠNG THÁI", "Không thể tải thông tin triển khai mới nhất từ GitHub Actions.", "Thử lại sau hoặc mở GitHub Actions để xem trạng thái hiện tại.");
    setText(runNumber, "CHƯA CÓ DỮ LIỆU");
    setText(runStatus, "unknown");
    setText(copyFeedback, "");
    setText(dataNote, " · Chưa thể xác nhận dữ liệu GitHub Actions");
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

  copyButton.addEventListener("click", copySha);
  getSnapshot().then(renderSnapshot).catch(setUnknownState);
})();
