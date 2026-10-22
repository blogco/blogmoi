import test from "node:test";
import assert from "node:assert/strict";
import {
  EXPENSE_CLOUD_PATH,
  GitHubExpenseSync,
  countUnsyncedExpenseChanges,
  getExpenseMigrationPreview,
} from "../static/js/expense-cloud-sync.js";
import { aggregatePeriod, normalizeTransactions, validateTransaction } from "../static/js/expense-tracker.js";

const record = (id, overrides = {}) => validateTransaction({
  id,
  merchant: "Highlands",
  itemName: "Matcha Latte",
  amount: 50_000,
  date: "2026-10-23",
  taste: "Không đường",
  category: "Đồ uống",
  iconId: "matcha",
  iconManuallySet: false,
  notes: "",
  createdAt: "2026-10-23T02:00:00.000Z",
  updatedAt: "2026-10-23T02:00:00.000Z",
  ...overrides,
});

const doc = (transactions = [], tombstones = []) => ({ schemaVersion: 1, transactions, tombstones });
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});
const base64Json = value => Buffer.from(JSON.stringify(value)).toString("base64");
const contentPath = `/repos/blogco/blogmoi/contents/${EXPENSE_CLOUD_PATH}`;

function makeGitHub({ isPrivate = false, pushAccess = true, initialDocument = null, onPut = null, repositoryStatus = 200, validTokens = ["test-token"] } = {}) {
  const state = { file: initialDocument ? { document: initialDocument, sha: "sha-1" } : null, commits: [], authHeaders: [] };
  const fetchImpl = async (urlValue, options = {}) => {
    const url = new URL(urlValue);
    state.authHeaders.push(options.headers?.Authorization || "");
    if (url.pathname === "/user") {
      if (!validTokens.some(token => options.headers?.Authorization === `Bearer ${token}`)) return jsonResponse({ message: "Bad credentials" }, 401);
      return jsonResponse({ login: "tester" });
    }
    if (url.pathname === "/repos/blogco/blogmoi") {
      if (repositoryStatus !== 200) return jsonResponse({ message: "Not Found" }, repositoryStatus);
      return jsonResponse({ private: isPrivate, full_name: "blogco/blogmoi", owner: { login: "blogco" }, name: "blogmoi", default_branch: "main", permissions: { push: pushAccess } });
    }
    if (url.pathname === contentPath) {
      if (options.method === "PUT") {
        const body = JSON.parse(options.body);
        if (onPut) {
          const outcome = await onPut({ state, body, url });
          if (outcome) return outcome;
        }
        if (state.file && body.sha !== state.file.sha) return jsonResponse({ message: "sha conflict" }, 409);
        if (!state.file && body.sha) return jsonResponse({ message: "unexpected sha" }, 409);
        const document = JSON.parse(Buffer.from(body.content, "base64").toString("utf8"));
        state.commits.push({ message: body.message, branch: body.branch, document });
        const sha = `sha-${state.commits.length + 1}`;
        state.file = { document, sha };
        return jsonResponse({ content: { sha } }, 201);
      }
      if (!state.file) return jsonResponse({ message: "Not Found" }, 404);
      return jsonResponse({ type: "file", encoding: "base64", content: base64Json(state.file.document), sha: state.file.sha });
    }
    return jsonResponse({ message: "Not Found" }, 404);
  };
  return { state, fetchImpl };
}

const client = fetchImpl => new GitHubExpenseSync({ fetchImpl, validateTransaction, waitImpl: async () => {} });
const connect = instance => instance.connect("test-token");

test("accepts classic and fine-grained PATs without prefix checks and trims whitespace", async () => {
  assert.equal(EXPENSE_CLOUD_PATH, "data/expenses/transactions.json");
  const tokens = ["ghp_classic_mock", "github_pat_fine_grained_mock"];
  const api = makeGitHub({ validTokens: tokens });
  const sync = client(api.fetchImpl);
  const result = await sync.connect(`  ${tokens[0]} \n`);
  assert.equal(result.username, "tester");
  assert.deepEqual(result.repository, { owner: "blogco", repository: "blogmoi", branch: "main", path: EXPENSE_CLOUD_PATH });
  assert.equal(result.repositoryPushAccess, true);
  assert.equal(result.contentsWriteVerified, false);
  assert.equal(sync.connected, true);
  assert.ok(api.state.authHeaders.every(header => header === `Bearer ${tokens[0]}`));
  const fineGrained = client(api.fetchImpl);
  assert.equal((await fineGrained.connect(tokens[1])).username, "tester");
  await assert.rejects(sync.connect(` ${tokens[0]} `, "blogco", "other-repo"), error => error.code === "invalid_repository");
  const privateRepo = client(makeGitHub({ isPrivate: true }).fetchImpl);
  await assert.rejects(connect(privateRepo), error => error.code === "private_repository");
  const noPushAccess = client(makeGitHub({ pushAccess: false }).fetchImpl);
  await assert.rejects(connect(noPushAccess), error => error.code === "forbidden");
  sync.disconnect();
  assert.equal(sync.connected, false);
});

test("reports repository 404 separately while treating the data file 404 as an empty file", async () => {
  const missingRepository = client(makeGitHub({ repositoryStatus: 404 }).fetchImpl);
  await assert.rejects(missingRepository.connect("test-token"), error => error.code === "not_found" && error.status === 404);

  const api = makeGitHub();
  const sync = client(api.fetchImpl);
  await connect(sync);
  const local = doc([record("file-created")]);
  const saved = await sync.sync({ local, base: doc() });
  assert.equal(saved.wrote, true);
  assert.deepEqual(api.state.file.document, local);
  assert.equal(api.state.commits.length, 1);
});

test("distinguishes a rate-limited 403 from a repository permission 403", async () => {
  const noPushAccess = client(makeGitHub({ pushAccess: false }).fetchImpl);
  await assert.rejects(connect(noPushAccess), error => error.code === "forbidden" && error.status === 403);

  const rateLimited = client(async () => new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
    status: 403,
    headers: { "Content-Type": "application/json", "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "1900000000" },
  }));
  await assert.rejects(rateLimited.connect("test-token"), error => error.code === "rate_limited" && error.status === 403);
});

test("rejects invalid tokens without exposing response bodies", async () => {
  const invalid = client(async () => jsonResponse({ message: "Bad credentials", token: "must-not-appear" }, 401));
  await assert.rejects(invalid.connect("bad"), error => error.code === "unauthorized" && !error.message.includes("must-not-appear"));
});

test("keeps local data intact when GitHub denies Contents write access", async () => {
  const api = makeGitHub({ onPut: () => jsonResponse({ message: "Resource not accessible by personal access token" }, 403) });
  const sync = client(api.fetchImpl);
  await connect(sync);
  const local = doc([record("write-denied")]);
  const before = structuredClone(local);
  await assert.rejects(sync.sync({ local, base: doc() }), error => error.code === "forbidden");
  assert.deepEqual(local, before);
  assert.equal(api.state.file, null);
  assert.equal(api.state.commits.length, 0);
});

test("reports invalid write payloads as 422 and keeps local data", async () => {
  let writes = 0;
  const api = makeGitHub({ onPut: () => {
    writes += 1;
    return jsonResponse({ message: "Invalid request" }, 422);
  } });
  const sync = client(api.fetchImpl);
  await connect(sync);
  const local = doc([record("payload-denied")]);
  await assert.rejects(sync.sync({ local, base: doc() }), error => error.code === "payload_invalid" && error.status === 422);
  assert.equal(writes, 1);
  assert.equal(api.state.commits.length, 0);
  assert.equal(local.transactions.length, 1);
});

test("development diagnostics log API metadata without exposing PATs", async () => {
  const token = "ghp_mock_secret_value";
  const sync = new GitHubExpenseSync({
    development: true,
    fetchImpl: async () => new Response(JSON.stringify({ message: `Bad credentials ${token}` }), {
      status: 401,
      headers: { "Content-Type": "application/json", "X-RateLimit-Remaining": "42" },
    }),
  });
  const entries = [];
  const originalDebug = console.debug;
  console.debug = (...args) => entries.push(args);
  try {
    await assert.rejects(sync.connect(token), error => error.code === "unauthorized");
  } finally {
    console.debug = originalDebug;
  }
  const output = JSON.stringify(entries);
  assert.match(output, /https:\/\/api\.github\.com\/user/u);
  assert.match(output, /authentication/u);
  assert.match(output, /401/u);
  assert.match(output, /remaining/u);
  assert.doesNotMatch(output, new RegExp(token));
  assert.doesNotMatch(output, /Authorization/u);
});

test("writes only changed data to main with the dedicated commit message", async () => {
  const api = makeGitHub();
  const phone = client(api.fetchImpl);
  await connect(phone);
  const local = doc([record("txn-1")]);
  const saved = await phone.sync({ local, base: doc() });
  assert.equal(saved.status, "synced");
  assert.equal(saved.wrote, true);
  assert.deepEqual(api.state.commits.map(commit => [commit.message, commit.branch]), [["data(expenses): sync transactions", "main"]]);
  assert.deepEqual(api.state.file.document.transactions, local.transactions);

  const secondDevice = client(api.fetchImpl);
  await connect(secondDevice);
  const downloaded = await secondDevice.readDocument();
  assert.deepEqual(downloaded.document, local);
  const preview = getExpenseMigrationPreview(doc(), downloaded.document, validateTransaction);
  assert.equal(preview.cloudOnly, 1);

  const noOp = await phone.sync({ local, base: local });
  assert.equal(noOp.wrote, false);
  assert.equal(api.state.commits.length, 1);
  assert.equal(countUnsyncedExpenseChanges(local, local, validateTransaction), 0);
});

test("retries temporary GitHub failures without duplicating the expense commit", async () => {
  let putAttempts = 0;
  const api = makeGitHub({ onPut: () => {
    putAttempts += 1;
    return putAttempts === 1 ? jsonResponse({ message: "temporarily unavailable" }, 503) : null;
  } });
  const delays = [];
  const sync = new GitHubExpenseSync({
    fetchImpl: api.fetchImpl,
    validateTransaction,
    waitImpl: async milliseconds => delays.push(milliseconds),
  });
  await connect(sync);
  const result = await sync.sync({ local: doc([record("retry-me")]), base: doc() });
  assert.equal(result.status, "synced");
  assert.equal(result.wrote, true);
  assert.equal(putAttempts, 2);
  assert.deepEqual(delays, [250]);
  assert.equal(api.state.commits.length, 1);
});

test("re-reads after a lost PUT response and avoids a duplicate commit", async () => {
  const api = makeGitHub();
  let lostResponse = true;
  const fetchImpl = async (url, options) => {
    const response = await api.fetchImpl(url, options);
    if (options.method === "PUT" && lostResponse) {
      lostResponse = false;
      throw new TypeError("connection dropped after GitHub saved the file");
    }
    return response;
  };
  const sync = client(fetchImpl);
  await connect(sync);
  const local = doc([record("saved-before-timeout")]);
  const result = await sync.sync({ local, base: doc() });
  assert.equal(result.status, "synced");
  assert.equal(result.wrote, true);
  assert.deepEqual(api.state.file.document, local);
  assert.equal(api.state.commits.length, 1);
});

test("does not create a commit for an empty initial sync", async () => {
  const api = makeGitHub();
  const sync = client(api.fetchImpl);
  await connect(sync);
  const result = await sync.sync({ local: doc(), base: doc() });
  assert.equal(result.wrote, false);
  assert.equal(api.state.file, null);
  assert.equal(api.state.commits.length, 0);
});

test("GitHub sync and repeated reload keep the three-transaction report at one count per ID", async () => {
  const transactions = [
    record("oct-1", { amount: 50_000, date: "2026-10-23", createdAt: "2026-10-22T17:00:00.000Z", updatedAt: "2026-10-22T17:00:00.000Z" }),
    record("oct-2", { amount: 50_000, date: "2026-10-23", createdAt: "2026-10-23T03:00:00.000Z", updatedAt: "2026-10-23T03:00:00.000Z" }),
    record("sep-1", { amount: 225_000, date: "2026-09-25", createdAt: "2026-09-24T17:00:00.000Z", updatedAt: "2026-09-24T17:00:00.000Z" }),
  ];
  const original = doc(transactions);
  const api = makeGitHub();
  const mac = client(api.fetchImpl);
  await connect(mac);
  await mac.sync({ local: original, base: doc() });

  const phone = client(api.fetchImpl);
  await connect(phone);
  const downloaded = await phone.readDocument();
  const afterFirstLoad = normalizeTransactions(downloaded.document.transactions);
  assert.equal(aggregatePeriod(afterFirstLoad).total, 325_000);
  assert.equal(aggregatePeriod(afterFirstLoad).count, 3);

  const noOp = await mac.sync({ local: original, base: original });
  assert.equal(noOp.wrote, false);
  const reloaded = await phone.readDocument();
  const afterReload = normalizeTransactions(reloaded.document.transactions);
  assert.equal(aggregatePeriod(afterReload).total, 325_000);
  assert.equal(aggregatePeriod(afterReload).count, 3);
  assert.equal(api.state.commits.length, 1);
});

test("merges an independent concurrent update after an SHA conflict", async () => {
  let injected = false;
  const api = makeGitHub({ initialDocument: doc([record("base")]), onPut: ({ state }) => {
    if (injected) return null;
    injected = true;
    state.file = { document: doc([record("base"), record("phone-only", { itemName: "Cà phê sữa", iconId: "coffee" })]), sha: "sha-race" };
    return jsonResponse({ message: "sha conflict" }, 409);
  } });
  const sync = client(api.fetchImpl);
  await connect(sync);
  const result = await sync.sync({
    base: doc([record("base")]),
    local: doc([record("base"), record("desktop-only", { itemName: "Bánh mì", category: "Đồ ăn", iconId: "bread" })]),
  });
  assert.equal(result.status, "synced");
  assert.deepEqual(api.state.file.document.transactions.map(item => item.id).sort(), ["base", "desktop-only", "phone-only"]);
  assert.equal(api.state.commits.length, 1);
});

test("keeps the last known baseline if the cloud file disappears", async () => {
  const api = makeGitHub();
  const sync = client(api.fetchImpl);
  await connect(sync);
  const baseline = doc([record("preserve-me")]);
  const result = await sync.sync({ base: baseline, local: baseline });
  assert.equal(result.wrote, true);
  assert.deepEqual(api.state.file.document, baseline);
});

test("asks before resolving same-transaction edits and propagates deletion tombstones", async () => {
  const baseline = record("shared");
  const remoteVersion = record("shared", { amount: 63_000, updatedAt: "2026-10-23T03:00:00.000Z" });
  const localVersion = record("shared", { amount: 55_000, updatedAt: "2026-10-23T04:00:00.000Z" });
  const api = makeGitHub({ initialDocument: doc([remoteVersion]) });
  const sync = client(api.fetchImpl);
  await connect(sync);
  const args = { base: doc([baseline]), local: doc([localVersion]) };
  const conflict = await sync.sync(args);
  assert.equal(conflict.status, "conflict");
  assert.equal(api.state.commits.length, 0);
  const resolution = { shared: {
    choice: "local",
    localFingerprint: conflict.conflicts[0].localFingerprint,
    remoteFingerprint: conflict.conflicts[0].remoteFingerprint,
  } };
  const resolved = await sync.sync({ ...args, resolutions: resolution });
  assert.equal(resolved.status, "synced");
  assert.equal(api.state.file.document.transactions[0].amount, 55_000);

  const deleted = doc([], [{ id: "shared", deletedAt: "2026-10-23T05:00:00.000Z" }]);
  await sync.sync({ base: api.state.file.document, local: deleted });
  assert.deepEqual(api.state.file.document.tombstones, deleted.tombstones);
});

test("keeps offline transaction data unchanged and never persists or logs the token", async () => {
  const api = makeGitHub();
  let offline = false;
  const sync = client((url, options) => {
    if (offline) throw new TypeError("offline");
    return api.fetchImpl(url, options);
  });
  await connect(sync);
  const local = doc([record("local-kept")]);
  const before = structuredClone(local);
  offline = true;
  await assert.rejects(sync.sync({ local, base: doc() }), error => error.code === "network");
  assert.deepEqual(local, before);
  assert.equal(api.state.file, null);

  const { readFileSync } = await import("node:fs");
  const tracker = readFileSync(new URL("../static/js/expense-tracker.js", import.meta.url), "utf8");
  const cloud = readFileSync(new URL("../static/js/expense-cloud-sync.js", import.meta.url), "utf8");
  assert.doesNotMatch(tracker, /localStorage|sessionStorage|console\.(?:log|info|warn|error)/u);
  assert.doesNotMatch(cloud, /localStorage|sessionStorage|console\.(?:log|info|warn|error)/u);
  assert.doesNotMatch(cloud, /private-expenses|data\/expenses\.json|public_repository/u);
});
