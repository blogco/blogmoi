const API_BASE = "https://api.github.com";
const API_VERSION = "2022-11-28";
export const EXPENSE_CLOUD_PATH = "data/expenses/transactions.json";
export const EXPENSE_CLOUD_SCHEMA_VERSION = 1;
export const EXPENSE_REPOSITORY = Object.freeze({ owner: "blogco", repository: "blogmoi", branch: "main" });
const MAX_WRITE_ATTEMPTS = 3;
const MAX_TRANSIENT_RETRIES = 3;
const RETRY_DELAYS_MS = [250, 1_000, 2_500];

const emptyDocument = () => ({ schemaVersion: EXPENSE_CLOUD_SCHEMA_VERSION, transactions: [], tombstones: [] });

export class ExpenseSyncError extends Error {
  constructor(code, status = 0) {
    const messages = {
      empty_token: "Nhập GitHub Personal Access Token để kết nối.",
      invalid_repository: "Expense Sync chỉ kết nối blogco/blogmoi trên nhánh main.",
      private_repository: "blogco/blogmoi phải là repository public để Expense Sync ghi dữ liệu công khai.",
      unauthorized: "Token không hợp lệ, đã hết hạn hoặc bị thu hồi. Dữ liệu cục bộ vẫn được giữ.",
      forbidden: "Tài khoản hoặc token không đủ quyền truy cập/ghi repository. Fine-grained PAT cần Contents: Read and write; classic PAT cần public_repo hoặc repo. Dữ liệu cục bộ vẫn được giữ.",
      rate_limited: "GitHub đang giới hạn API hoặc đã hết hạn mức. Hãy chờ rồi thử lại; dữ liệu cục bộ vẫn được giữ.",
      not_found: "Không tìm thấy repository hoặc tệp chi phí, hoặc token không có quyền truy cập. Dữ liệu cục bộ vẫn được giữ.",
      network: "Không thể kết nối GitHub API (mạng hoặc CORS). Dữ liệu cục bộ vẫn được giữ; hãy kiểm tra kết nối rồi thử lại.",
      invalid_document: "Tệp chi phí trên GitHub không đúng schema hoặc có dữ liệu không hợp lệ.",
      unsupported_schema: "Phiên bản dữ liệu trên GitHub chưa được hỗ trợ.",
      version_conflict: "Phiên bản tệp trên GitHub đã thay đổi và chưa thể gộp an toàn. Dữ liệu cục bộ vẫn được giữ; hãy đồng bộ lại.",
      conflict_retry: "Repository thay đổi liên tục. Dữ liệu cục bộ vẫn được giữ; hãy đồng bộ lại.",
      payload_invalid: "GitHub từ chối nội dung cập nhật (HTTP 422). Dữ liệu cục bộ vẫn được giữ.",
      api_error: `GitHub API trả về lỗi${status ? ` HTTP ${status}` : ""}. Dữ liệu cục bộ vẫn được giữ.`,
    };
    super(messages[code] || messages.api_error);
    this.name = "ExpenseSyncError";
    this.code = code;
    this.status = status;
  }
}

function canonicalTransaction(input, validateTransaction) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ExpenseSyncError("invalid_document");
  const required = ["id", "merchant", "itemName", "amount", "date", "category", "createdAt", "updatedAt"];
  if (!required.every(key => Object.hasOwn(input, key))) throw new ExpenseSyncError("invalid_document");
  let record;
  try {
    record = validateTransaction ? validateTransaction(input) : input;
  } catch {
    throw new ExpenseSyncError("invalid_document");
  }
  if (typeof record.id !== "string" || !record.id || typeof record.merchant !== "string" || typeof record.itemName !== "string") {
    throw new ExpenseSyncError("invalid_document");
  }
  return {
    id: record.id,
    merchant: record.merchant,
    itemName: record.itemName,
    amount: Number(record.amount),
    date: record.date,
    taste: typeof record.taste === "string" ? record.taste : "",
    category: record.category,
    iconId: typeof record.iconId === "string" ? record.iconId : "other",
    iconManuallySet: Boolean(record.iconManuallySet),
    notes: typeof record.notes === "string" ? record.notes : "",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function canonicalTombstone(input) {
  if (!input || typeof input !== "object" || typeof input.id !== "string" || !input.id || typeof input.deletedAt !== "string" || !Number.isFinite(Date.parse(input.deletedAt))) {
    throw new ExpenseSyncError("invalid_document");
  }
  return { id: input.id, deletedAt: input.deletedAt };
}

export function normalizeExpenseDocument(input, validateTransaction) {
  if (input == null) return emptyDocument();
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ExpenseSyncError("invalid_document");
  if (input.schemaVersion !== EXPENSE_CLOUD_SCHEMA_VERSION) throw new ExpenseSyncError("unsupported_schema");
  if (!Array.isArray(input.transactions) || !Array.isArray(input.tombstones)) throw new ExpenseSyncError("invalid_document");
  const transactions = input.transactions.map(record => canonicalTransaction(record, validateTransaction));
  const tombstones = input.tombstones.map(canonicalTombstone);
  const seen = new Set();
  for (const record of transactions) {
    if (seen.has(record.id)) throw new ExpenseSyncError("invalid_document");
    seen.add(record.id);
  }
  for (const tombstone of tombstones) {
    if (seen.has(tombstone.id)) throw new ExpenseSyncError("invalid_document");
    seen.add(tombstone.id);
  }
  transactions.sort((a, b) => a.id.localeCompare(b.id));
  tombstones.sort((a, b) => a.id.localeCompare(b.id));
  return { schemaVersion: EXPENSE_CLOUD_SCHEMA_VERSION, transactions, tombstones };
}

function stateMap(document) {
  const states = new Map(document.transactions.map(record => [record.id, { kind: "record", value: record }]));
  for (const tombstone of document.tombstones) states.set(tombstone.id, { kind: "deleted", value: tombstone });
  return states;
}

export function expenseStateFingerprint(state) {
  return JSON.stringify(state ?? null);
}

function statesEqual(left, right) {
  return expenseStateFingerprint(left) === expenseStateFingerprint(right);
}

function documentFromStates(states) {
  const transactions = [];
  const tombstones = [];
  for (const state of states.values()) {
    if (state?.kind === "record") transactions.push(state.value);
    if (state?.kind === "deleted") tombstones.push(state.value);
  }
  return normalizeExpenseDocument({ schemaVersion: EXPENSE_CLOUD_SCHEMA_VERSION, transactions, tombstones });
}

export function mergeExpenseStates({ base, local, remote, resolutions = {} }, validateTransaction) {
  const baseDocument = normalizeExpenseDocument(base || emptyDocument(), validateTransaction);
  const localDocument = normalizeExpenseDocument(local || emptyDocument(), validateTransaction);
  const remoteDocument = normalizeExpenseDocument(remote || emptyDocument(), validateTransaction);
  const baseStates = stateMap(baseDocument);
  const localStates = stateMap(localDocument);
  const remoteStates = stateMap(remoteDocument);
  const mergedStates = new Map();
  const conflicts = [];
  const ids = new Set([...baseStates.keys(), ...localStates.keys(), ...remoteStates.keys()]);

  for (const id of ids) {
    const baseState = baseStates.get(id);
    const localState = localStates.get(id);
    const remoteState = remoteStates.get(id);
    if (statesEqual(localState, remoteState)) {
      if (localState) mergedStates.set(id, localState);
      continue;
    }

    const localChanged = !statesEqual(localState, baseState);
    const remoteChanged = !statesEqual(remoteState, baseState);
    if (localChanged && remoteChanged) {
      const localFingerprint = expenseStateFingerprint(localState);
      const remoteFingerprint = expenseStateFingerprint(remoteState);
      const resolution = resolutions[id];
      if (resolution && resolution.localFingerprint === localFingerprint && resolution.remoteFingerprint === remoteFingerprint && ["local", "remote"].includes(resolution.choice)) {
        const selected = resolution.choice === "local" ? localState : remoteState;
        if (selected) mergedStates.set(id, selected);
      } else {
        conflicts.push({ id, local: localState || null, remote: remoteState || null, localFingerprint, remoteFingerprint });
      }
      continue;
    }

    const selected = localChanged ? localState : remoteState;
    if (selected) mergedStates.set(id, selected);
  }

  return { document: documentFromStates(mergedStates), conflicts, base: baseDocument, local: localDocument, remote: remoteDocument };
}

export function getExpenseMigrationPreview(localInput, remoteInput, validateTransaction) {
  const local = normalizeExpenseDocument(localInput || emptyDocument(), validateTransaction);
  const remote = normalizeExpenseDocument(remoteInput || emptyDocument(), validateTransaction);
  const localStates = stateMap(local);
  const remoteStates = stateMap(remote);
  let duplicates = 0;
  let conflicts = 0;
  for (const [id, localState] of localStates) {
    const remoteState = remoteStates.get(id);
    if (!remoteState) continue;
    if (statesEqual(localState, remoteState)) duplicates += 1;
    else conflicts += 1;
  }
  let localOnly = 0;
  let cloudOnly = 0;
  for (const id of localStates.keys()) if (!remoteStates.has(id)) localOnly += 1;
  for (const id of remoteStates.keys()) if (!localStates.has(id)) cloudOnly += 1;
  return { localCount: local.transactions.length, cloudCount: remote.transactions.length, localOnly, cloudOnly, duplicates, conflicts };
}

export function countUnsyncedExpenseChanges(localInput, baseInput, validateTransaction) {
  const local = normalizeExpenseDocument(localInput || emptyDocument(), validateTransaction);
  const base = normalizeExpenseDocument(baseInput || emptyDocument(), validateTransaction);
  const localStates = stateMap(local);
  const baseStates = stateMap(base);
  let count = 0;
  for (const id of new Set([...localStates.keys(), ...baseStates.keys()])) {
    if (!statesEqual(localStates.get(id), baseStates.get(id))) count += 1;
  }
  return count;
}

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return globalThis.btoa(binary);
}

function decodeBase64Utf8(value) {
  const binary = globalThis.atob(String(value).replace(/\s/gu, ""));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function repositoryApiPath(owner, repository, path = "") {
  const root = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
  return path ? `${root}/${path}` : root;
}

function isDevelopmentEnvironment() {
  const hostname = globalThis.location?.hostname || "";
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".localhost");
}

function sanitizeGithubMessage(message, token) {
  let safe = String(message || "").slice(0, 500);
  if (token) safe = safe.split(token).join("[redacted]");
  return safe
    .replace(/\b(?:github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9_]+)\b/giu, "[redacted PAT]")
    .replace(/\bBearer\s+\S+/giu, "Bearer [redacted]")
    .replace(/\b(authorization|token)\s*[:=]\s*[^\s,;]+/giu, "$1=[redacted]");
}

function getRateLimitMetadata(headers) {
  const names = [
    ["limit", "x-ratelimit-limit"],
    ["remaining", "x-ratelimit-remaining"],
    ["reset", "x-ratelimit-reset"],
    ["used", "x-ratelimit-used"],
    ["resource", "x-ratelimit-resource"],
    ["retryAfter", "retry-after"],
  ];
  return Object.fromEntries(names.flatMap(([key, header]) => {
    const value = headers.get(header);
    return value === null ? [] : [[key, value]];
  }));
}

function isRetryableSyncError(error) {
  return error instanceof ExpenseSyncError
    && (error.code === "network" || error.code === "rate_limited" || error.status === 408 || error.status === 429 || error.status >= 500);
}

export class GitHubExpenseSync {
  constructor({ fetchImpl = globalThis.fetch, validateTransaction, filePath = EXPENSE_CLOUD_PATH, waitImpl, development = isDevelopmentEnvironment() } = {}) {
    this.fetchImpl = fetchImpl;
    this.validateTransaction = validateTransaction;
    this.filePath = filePath;
    this.waitImpl = waitImpl || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
    this.development = development;
    this.token = "";
    this.repository = null;
  }

  get connected() {
    return Boolean(this.token && this.repository);
  }

  disconnect() {
    this.token = "";
    this.repository = null;
  }

  async request(path, { token = this.token, method = "GET", body, allowNotFound = false, phase } = {}) {
    if (!token) throw new ExpenseSyncError("empty_token");
    const requestPhase = phase || (method === "PUT" ? "write" : path === "/user" ? "authentication" : path.includes("/contents/") ? "read" : "repository");
    const endpoint = `${API_BASE}${path}`;
    let response;
    try {
      response = await this.fetchImpl(endpoint, {
        method,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": API_VERSION,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      if (this.development) {
        globalThis.console?.debug?.("[expense-sync] GitHub API", {
          endpoint,
          phase: requestPhase,
          status: null,
          message: "Network/CORS failure",
          rateLimit: {},
        });
      }
      throw new ExpenseSyncError("network");
    }

    let githubMessage = "";
    if (!response.ok) {
      try {
        const errorBody = await response.clone().json();
        if (typeof errorBody?.message === "string") githubMessage = errorBody.message;
      } catch {
        // Keep non-JSON response bodies out of logs and user-facing errors.
      }
    }
    if (this.development) {
      globalThis.console?.debug?.("[expense-sync] GitHub API", {
        endpoint,
        phase: requestPhase,
        status: response.status,
        message: sanitizeGithubMessage(githubMessage, token),
        rateLimit: getRateLimitMetadata(response.headers),
      });
    }

    const rateLimited = response.status === 429
      || (response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || /rate limit|abuse detection/iu.test(githubMessage)));
    if (response.status === 401) {
      if (token === this.token) this.disconnect();
      throw new ExpenseSyncError("unauthorized", 401);
    }
    if (response.status === 404 && allowNotFound) return null;
    if (rateLimited) throw new ExpenseSyncError("rate_limited", response.status);
    if (response.status === 403) throw new ExpenseSyncError("forbidden", 403);
    if (response.status === 404) throw new ExpenseSyncError("not_found", 404);
    if (response.status === 409) throw new ExpenseSyncError("version_conflict", 409);
    if (response.status === 422) throw new ExpenseSyncError("payload_invalid", 422);
    if (!response.ok) throw new ExpenseSyncError("api_error", response.status);
    if (response.status === 204) return null;
    try {
      return await response.json();
    } catch {
      throw new ExpenseSyncError("api_error", response.status);
    }
  }

  async connect(tokenInput, ownerInput = EXPENSE_REPOSITORY.owner, repositoryInput = EXPENSE_REPOSITORY.repository) {
    this.disconnect();
    const token = String(tokenInput || "").trim();
    const owner = String(ownerInput || "").trim();
    const repository = String(repositoryInput || "").trim();
    if (!token) throw new ExpenseSyncError("empty_token");
    if (owner.toLocaleLowerCase("en-US") !== EXPENSE_REPOSITORY.owner || repository.toLocaleLowerCase("en-US") !== EXPENSE_REPOSITORY.repository) {
      throw new ExpenseSyncError("invalid_repository");
    }
    const user = await this.request("/user", { token, phase: "authentication" });
    const info = await this.request(repositoryApiPath(owner, repository), { token, phase: "repository" });
    if (typeof info.full_name === "string" && info.full_name.toLocaleLowerCase("en-US") !== `${EXPENSE_REPOSITORY.owner}/${EXPENSE_REPOSITORY.repository}`) {
      throw new ExpenseSyncError("invalid_repository");
    }
    if (info.private !== false) throw new ExpenseSyncError("private_repository");
    if (info.permissions?.push === false) throw new ExpenseSyncError("forbidden", 403);
    const config = {
      owner: EXPENSE_REPOSITORY.owner,
      repository: EXPENSE_REPOSITORY.repository,
      branch: EXPENSE_REPOSITORY.branch,
      path: this.filePath,
    };
    await this.readDocumentWith(token, config);
    this.token = token;
    this.repository = config;
    return {
      username: typeof user.login === "string" ? user.login : owner,
      repository: config,
      repositoryPushAccess: info.permissions?.push === true,
      contentsWriteVerified: false,
    };
  }

  contentsPath(config = this.repository) {
    const path = config.path.split("/").map(encodeURIComponent).join("/");
    const query = config.branch ? `?ref=${encodeURIComponent(config.branch)}` : "";
    return `${repositoryApiPath(config.owner, config.repository, `contents/${path}`)}${query}`;
  }

  async readDocumentWith(token, config) {
    const contents = await this.request(this.contentsPath(config), { token, allowNotFound: true, phase: "read" });
    if (!contents) return { document: emptyDocument(), sha: null, exists: false };
    if (contents.type !== "file" || contents.encoding !== "base64" || typeof contents.content !== "string" || typeof contents.sha !== "string") {
      throw new ExpenseSyncError("invalid_document");
    }
    let parsed;
    try {
      parsed = JSON.parse(decodeBase64Utf8(contents.content));
    } catch {
      throw new ExpenseSyncError("invalid_document");
    }
    return { document: normalizeExpenseDocument(parsed, this.validateTransaction), sha: contents.sha, exists: true };
  }

  async readDocument() {
    if (!this.connected) throw new ExpenseSyncError("empty_token");
    return this.readDocumentWith(this.token, this.repository);
  }

  async sync({ local, base, resolutions = {} }) {
    if (!this.connected) throw new ExpenseSyncError("empty_token");
    const localDocument = normalizeExpenseDocument(local, this.validateTransaction);
    const baseDocument = normalizeExpenseDocument(base || emptyDocument(), this.validateTransaction);
    let writeAttempts = 0;
    let transientRetries = 0;
    let uncertainWrite = false;
    while (writeAttempts < MAX_WRITE_ATTEMPTS) {
      let remoteFile;
      try {
        remoteFile = await this.readDocument();
        const hasBaselineData = baseDocument.transactions.length > 0 || baseDocument.tombstones.length > 0;
        const remoteDocument = !remoteFile.exists && hasBaselineData ? baseDocument : remoteFile.document;
        const merged = mergeExpenseStates({ base: baseDocument, local: localDocument, remote: remoteDocument, resolutions }, this.validateTransaction);
        if (merged.conflicts.length) return { status: "conflict", conflicts: merged.conflicts, document: remoteFile.document, sha: remoteFile.sha };
        if (!remoteFile.exists && !merged.document.transactions.length && !merged.document.tombstones.length) {
          return { status: "synced", document: merged.document, sha: null, wrote: false };
        }
        if (remoteFile.exists && JSON.stringify(merged.document) === JSON.stringify(remoteFile.document)) {
          return { status: "synced", document: merged.document, sha: remoteFile.sha, wrote: uncertainWrite };
        }
        const payload = {
          message: "data(expenses): sync transactions",
          content: encodeBase64Utf8(`${JSON.stringify(merged.document, null, 2)}\n`),
          ...(remoteFile.sha ? { sha: remoteFile.sha } : {}),
          ...(this.repository.branch ? { branch: this.repository.branch } : {}),
        };
        writeAttempts += 1;
        const saved = await this.request(this.contentsPath(), { method: "PUT", body: payload, phase: "write" });
        return { status: "synced", document: merged.document, sha: saved.content?.sha || null, wrote: true };
      } catch (error) {
        if (error instanceof ExpenseSyncError && error.status === 409) {
          let latest;
          try {
            latest = await this.readDocument();
          } catch (readError) {
            if (!isRetryableSyncError(readError) || transientRetries >= MAX_TRANSIENT_RETRIES) throw readError;
            await this.waitImpl(RETRY_DELAYS_MS[transientRetries++]);
            continue;
          }
          if (latest.sha === remoteFile?.sha) throw error;
          continue;
        }
        if (!isRetryableSyncError(error) || transientRetries >= MAX_TRANSIENT_RETRIES || writeAttempts >= MAX_WRITE_ATTEMPTS) throw error;
        if (writeAttempts > 0) uncertainWrite = true;
        await this.waitImpl(RETRY_DELAYS_MS[transientRetries++]);
      }
    }
    throw new ExpenseSyncError("version_conflict", 409);
  }
}
