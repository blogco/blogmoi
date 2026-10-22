import { ExpenseSyncError } from "./expense-cloud-sync.js";

export class LocalExpenseError extends Error {
  constructor(code, operation, cause) {
    super(code === "storage_unavailable" ? "IndexedDB không khả dụng." : "Không thể truy cập dữ liệu cục bộ.", { cause });
    this.code = code;
    this.operation = operation;
  }
}

export function describeExpenseError(error, operation) {
  const code = error.code || "ui_error";
  const phase = error.operation || error.diagnostics?.phase || operation;
  const messages = {
    storage_unavailable: "IndexedDB không khả dụng.",
    storage_error: "Không thể truy cập dữ liệu cục bộ.",
    unauthorized: "Không thể xác thực tài khoản GitHub.",
    forbidden: "GitHub từ chối truy cập hoặc ghi dữ liệu.",
    payload_invalid: "GitHub từ chối ghi dữ liệu.",
    network: "Mất kết nối mạng. Dữ liệu đang chờ đồng bộ.",
    unverified: "Chưa xác minh được kết quả đồng bộ. Vui lòng kiểm tra lại.",
    ui_error: "Không thể cập nhật giao diện.",
  };
  return `${messages[code] || error.message} [${code}; ${phase}]`;
}

// State belongs to each layer. History and queue length never prove cloud success.
export class ExpenseSyncSession {
  constructor({ github, capture, checkpoint, apply, render, online = () => true, onState = () => {} }) {
    Object.assign(this, { github, capture, checkpoint, apply, render, online, onState });
    this.state = { auth: "disconnected", local: "loading", cloud: "idle", queue: "completed", pending: null, receipt: null, error: null };
    this.running = null;
  }

  publish(patch) {
    Object.assign(this.state, patch);
    try { this.onState({ ...this.state }); }
    catch {
      // An observer cannot turn a confirmed remote write into a failed write.
      this.state.error = { code: "ui_error", operation: "render_status" };
    }
  }

  sync(options = {}) {
    if (this.running) return this.running;
    this.running = this.execute(options).finally(() => { this.running = null; });
    return this.running;
  }

  async execute({ base, resolutions = {}, repositoryMatches = () => true } = {}) {
    let operation = "capture_local";
    let result;
    this.publish({ cloud: "syncing", queue: "processing", receipt: null, error: null });
    try {
      const snapshot = await this.capture();
      this.publish({ local: "ready" });
      if (!this.github.connected) throw new ExpenseSyncError("empty_token");
      if (!this.online()) throw new ExpenseSyncError("network", 0, { phase: "read" });
      const baseline = base === undefined ? (repositoryMatches(snapshot.meta.repository) ? snapshot.meta.base : null) : base;
      operation = "authenticate_github";
      await this.github.request("/user", { phase: "authentication" });
      this.publish({ auth: "connected" });
      operation = "checkpoint_prepared";
      await this.checkpoint({ phase: "prepared", local: snapshot.document, base: baseline, repository: this.github.repository });
      operation = "cloud_sync";
      result = await this.github.sync({ local: snapshot.document, base: baseline, resolutions });
      if (result.status === "conflict") {
        this.publish({ cloud: "failed", queue: "failed", error: { code: "version_conflict", operation } });
        return result;
      }
      this.publish({ cloud: result.wrote ? "success" : "no_changes", receipt: result });
      operation = "checkpoint_verified";
      await this.checkpoint({ phase: "verified", result, repository: this.github.repository });
      operation = "apply_local";
      await this.apply(snapshot.document, result, this.github.repository);
      this.publish({ local: "ready", queue: "completed" });
      operation = "render_dashboard";
      await this.render();
      return result;
    } catch (error) {
      const localFailure = error instanceof LocalExpenseError || operation.startsWith("checkpoint") || operation === "capture_local" || operation === "apply_local";
      const receipt = result || error.receipt || null;
      this.publish({
        ...(localFailure ? { local: error.code === "storage_unavailable" ? "unavailable" : "error" } : {}),
        ...(error.code === "unauthorized" ? { auth: "authentication_error" } : {}),
        cloud: result ? (result.wrote ? "success" : "no_changes") : (error.code === "unverified" || error.diagnostics?.phase === "write" && ["network", "timeout", "api_error"].includes(error.code) ? "unverified" : "failed"),
        queue: operation === "render_dashboard" ? "completed" : "failed",
        receipt,
        error: { code: error.code || (localFailure ? "storage_error" : "ui_error"), operation: error.operation || error.diagnostics?.phase || operation },
      });
      return { status: this.state.cloud, error, receipt, operation };
    }
  }
}
