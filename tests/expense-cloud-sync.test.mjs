import test from "node:test";
import assert from "node:assert/strict";
import {
  ExpenseSyncError,
  GitHubExpenseSync,
  countUnsyncedExpenseChanges,
  getExpenseMigrationPreview,
} from "../static/js/expense-cloud-sync.js";
import { validateTransaction } from "../static/js/expense-tracker.js";

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

function makeGitHub({ privateRepository = true, initialDocument = null, onPut = null } = {}) {
  const state = { file: initialDocument ? { document: initialDocument, sha: "sha-1" } : null, commits: 0, authHeaders: [] };
  const fetchImpl = async (urlValue, options = {}) => {
    const url = new URL(urlValue);
    state.authHeaders.push(options.headers?.Authorization || "");
    if (url.pathname === "/user") {
      if (options.headers?.Authorization !== "Bearer test-token") return jsonResponse({ message: "Bad credentials" }, 401);
      return jsonResponse({ login: "tester" });
    }
    if (url.pathname === "/repos/blogco/private-expenses") {
      return jsonResponse({ private: privateRepository, owner: { login: "blogco" }, name: "private-expenses", default_branch: "main" });
    }
    if (url.pathname === "/repos/blogco/private-expenses/contents/data/expenses.json") {
      if (options.method === "PUT") {
        const body = JSON.parse(options.body);
        if (onPut) {
          const outcome = await onPut({ state, body });
          if (outcome) return outcome;
        }
        if (state.file && body.sha !== state.file.sha) return jsonResponse({ message: "sha conflict" }, 409);
        if (!state.file && body.sha) return jsonResponse({ message: "unexpected sha" }, 409);
        const document = JSON.parse(Buffer.from(body.content, "base64").toString("utf8"));
        state.commits += 1;
        const sha = `sha-${state.commits + 1}`;
        state.file = { document, sha };
        return jsonResponse({ content: { sha } });
      }
      if (!state.file) return jsonResponse({ message: "Not Found" }, 404);
      return jsonResponse({ type: "file", encoding: "base64", content: base64Json(state.file.document), sha: state.file.sha });
    }
    return jsonResponse({ message: "Not Found" }, 404);
  };
  return { state, fetchImpl };
}

function client(fetchImpl) {
  return new GitHubExpenseSync({ fetchImpl, validateTransaction });
}

async function connect(instance) {
  return instance.connect("test-token", "blogco", "private-expenses");
}

test("accepts an authenticated token only for a private repository", async () => {
  const api = makeGitHub();
  const sync = client(api.fetchImpl);
  const result = await connect(sync);
  assert.equal(result.username, "tester");
  assert.equal(sync.connected, true);
  assert.ok(api.state.authHeaders.every(header => header === "Bearer test-token"));
  sync.disconnect();
  assert.equal(sync.connected, false);

  const publicApi = makeGitHub({ privateRepository: false });
  await assert.rejects(connect(client(publicApi.fetchImpl)), error => error instanceof ExpenseSyncError && error.code === "public_repository");
});

test("rejects invalid and expired tokens without exposing response bodies", async () => {
  const invalid = client(async () => jsonResponse({ message: "Bad credentials", token: "must-not-appear" }, 401));
  await assert.rejects(invalid.connect("bad", "blogco", "private-expenses"), error => error.code === "unauthorized" && !error.message.includes("must-not-appear"));

  const api = makeGitHub();
  let expireContentsRead = false;
  const expired = client(async (url, options) => {
    if (expireContentsRead && new URL(url).pathname === "/repos/blogco/private-expenses/contents/data/expenses.json") return jsonResponse({ message: "Bad credentials" }, 401);
    return api.fetchImpl(url, options);
  });
  await connect(expired);
  expireContentsRead = true;
  await assert.rejects(expired.readDocument(), error => error.code === "unauthorized");
  assert.equal(expired.connected, false);
});

test("writes schema data once, imports it on another client, and skips no-op commits", async () => {
  const api = makeGitHub();
  const mac = client(api.fetchImpl);
  await connect(mac);
  const original = doc([record("txn-1")]);
  const saved = await mac.sync({ local: original, base: doc() });
  assert.equal(saved.status, "synced");
  assert.equal(saved.wrote, true);
  assert.equal(api.state.file.document.schemaVersion, 1);
  assert.deepEqual(api.state.file.document.transactions[0], record("txn-1"));

  const phone = client(api.fetchImpl);
  await connect(phone);
  const downloaded = await phone.readDocument();
  assert.deepEqual(downloaded.document, original);
  const preview = getExpenseMigrationPreview(doc(), downloaded.document, validateTransaction);
  assert.equal(preview.cloudOnly, 1);

  const noOp = await mac.sync({ local: original, base: original });
  assert.equal(noOp.wrote, false);
  assert.equal(api.state.commits, 1);
  assert.equal(countUnsyncedExpenseChanges(original, original, validateTransaction), 0);
});

test("merges an independent concurrent commit after HTTP 409", async () => {
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
    local: doc([record("base"), record("mac-only", { itemName: "Bánh mì", category: "Đồ ăn", iconId: "bread" })]),
  });
  assert.equal(result.status, "synced");
  assert.deepEqual(api.state.file.document.transactions.map(item => item.id).sort(), ["base", "mac-only", "phone-only"]);
  assert.equal(api.state.commits, 1);
});

test("restores a missing contents file from the last baseline instead of treating it as mass deletion", async () => {
  const api = makeGitHub();
  const sync = client(api.fetchImpl);
  await connect(sync);
  const baseline = doc([record("preserve-me")]);
  const restored = await sync.sync({ base: baseline, local: baseline });
  assert.equal(restored.status, "synced");
  assert.equal(restored.wrote, true);
  assert.deepEqual(api.state.file.document, baseline);
  assert.equal(api.state.commits, 1);
});

test("reports same-transaction conflicts and applies only an explicit resolution", async () => {
  const baseline = record("shared");
  const remoteVersion = record("shared", { amount: 63_000, updatedAt: "2026-10-23T03:00:00.000Z" });
  const localVersion = record("shared", { amount: 55_000, updatedAt: "2026-10-23T04:00:00.000Z" });
  const api = makeGitHub({ initialDocument: doc([remoteVersion]) });
  const sync = client(api.fetchImpl);
  await connect(sync);
  const args = { base: doc([baseline]), local: doc([localVersion]) };
  const conflict = await sync.sync(args);
  assert.equal(conflict.status, "conflict");
  assert.equal(conflict.conflicts.length, 1);
  assert.equal(api.state.commits, 0);
  const resolution = {
    shared: {
      choice: "local",
      localFingerprint: conflict.conflicts[0].localFingerprint,
      remoteFingerprint: conflict.conflicts[0].remoteFingerprint,
    },
  };
  const resolved = await sync.sync({ ...args, resolutions: resolution });
  assert.equal(resolved.status, "synced");
  assert.equal(api.state.file.document.transactions[0].amount, 55_000);
  assert.equal(api.state.commits, 1);
});

test("propagates deletion tombstones and keeps local state untouched on network failure", async () => {
  const beforeDelete = record("to-delete");
  const api = makeGitHub({ initialDocument: doc([beforeDelete]) });
  const sync = client(api.fetchImpl);
  await connect(sync);
  const deleted = doc([], [{ id: "to-delete", deletedAt: "2026-10-23T05:00:00.000Z" }]);
  const result = await sync.sync({ base: doc([beforeDelete]), local: deleted });
  assert.equal(result.status, "synced");
  assert.deepEqual(api.state.file.document.tombstones, deleted.tombstones);

  const networkApi = makeGitHub();
  let offline = false;
  const offlineClient = client((url, options) => {
    if (offline) throw new TypeError("offline");
    return networkApi.fetchImpl(url, options);
  });
  await connect(offlineClient);
  const unchanged = doc([record("local-kept")]);
  const before = structuredClone(unchanged);
  offline = true;
  await assert.rejects(offlineClient.sync({ local: unchanged, base: doc() }), error => error.code === "network");
  assert.deepEqual(unchanged, before);
  assert.equal(networkApi.state.file, null);
});

test("sync code never persists credentials in browser storage or emits them to logs", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../static/js/expense-tracker.js", import.meta.url), "utf8");
  const cloud = readFileSync(new URL("../static/js/expense-cloud-sync.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /localStorage|sessionStorage/u);
  assert.doesNotMatch(cloud, /localStorage|sessionStorage|console\.(?:log|info|warn|error)/u);
});
