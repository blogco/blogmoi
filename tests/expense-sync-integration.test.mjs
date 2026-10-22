import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { openDatabase, captureLocalExpenseState, checkpointExpenseSync, applySyncedDocument, writeTransactionsAndRestore, getInsightRecords, aggregatePeriod, readSyncMeta } from "../static/js/expense-tracker.js";
import { ExpenseSyncSession, LocalExpenseError } from "../static/js/expense-sync-session.js";
import { mergeExpenseStates } from "../static/js/expense-cloud-sync.js";
import { record, doc, makeGitHub, client, connect, jsonResponse } from "./helpers/expense-github.mjs";

async function fixture(options = {}) {
  const factory = new IDBFactory();
  const db = await openDatabase(factory);
  const api = makeGitHub(options);
  const github = client(api.fetchImpl);
  await connect(github);
  const createSession = overrides => new ExpenseSyncSession({ github,
    capture: () => captureLocalExpenseState(db), checkpoint: attempt => checkpointExpenseSync(db, attempt),
    apply: (snapshot, result, repository) => applySyncedDocument(db, snapshot, result, repository), render: async () => {}, ...overrides });
  return { factory, db, api, github, createSession };
}

test("scopeLabel is lexical to insights for all/month/custom and nonempty coffee/category paths", () => {
  const records = [record("coffee", { itemName: "Cà phê", iconId: "coffee" })];
  for (const period of ["all", "2026-10", "2026-09"]) {
    const summary = aggregatePeriod(records, period);
    const insights = getInsightRecords(records, summary, null, { period });
    assert.ok(Array.isArray(insights));
    assert.doesNotMatch(JSON.stringify(insights), /undefined/);
  }
});

test("IndexedDB opens v2, preserves transactions across close/reopen and unavailable is explicit", async () => {
  const { db, factory } = await fixture();
  await writeTransactionsAndRestore(db, [record("preserved")]);
  assert.equal(db.version, 2);
  db.close();
  const reopened = await openDatabase(factory);
  assert.equal((await captureLocalExpenseState(reopened)).document.transactions[0].id, "preserved");
  await assert.rejects(openDatabase(null), e => e.code === "storage_unavailable" && e.operation === "open_database");
  await assert.rejects(openDatabase({ open() { throw new DOMException("Denied", "SecurityError"); } }), e => e.code === "storage_error");
  reopened.close();
});

test("legacy v1 upgrade adds metadata store without deleting records; optional checkpoint is backward compatible", async () => {
  const factory = new IDBFactory();
  await new Promise((resolve, reject) => {
    const request = factory.open("blogmoi-expenses", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("transactions", { keyPath: "id" });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("transactions", "readwrite");
      tx.objectStore("transactions").put(record("legacy"));
      tx.oncomplete = () => { db.close(); resolve(); };
    };
  });
  const db = await openDatabase(factory);
  assert.equal((await captureLocalExpenseState(db)).document.transactions[0].id, "legacy");
  await checkpointExpenseSync(db, { phase: "prepared" });
  assert.equal((await captureLocalExpenseState(db)).document.transactions.length, 1);
  assert.equal((await readSyncMeta(db)).syncAttempt.phase, "prepared");
  db.close();
});

test("cloud write verified before atomic local apply; repeated sync and reload create no extra commits", async () => {
  const f = await fixture();
  await writeTransactionsAndRestore(f.db, [record("one")]);
  const session = f.createSession();
  const first = await session.sync();
  assert.equal(first.verified, true);
  assert.equal(session.state.cloud, "success");
  assert.equal((await readSyncMeta(f.db)).syncAttempt, null);
  f.db.close();
  const reopened = await openDatabase(f.factory);
  const reloaded = f.createSession({ capture: () => captureLocalExpenseState(reopened), checkpoint: attempt => checkpointExpenseSync(reopened, attempt), apply: (snapshot, result, repository) => applySyncedDocument(reopened, snapshot, result, repository) });
  assert.equal((await reloaded.sync()).wrote, false);
  assert.equal(reloaded.state.cloud, "no_changes");
  assert.equal(f.api.state.commits.length, 1);
  reopened.close();
});

for (const failure of ["checkpoint_verified", "apply_local", "render_dashboard"]) {
  test(`verified GitHub write survives ${failure} failure and retry preserves queue`, async () => {
    const f = await fixture();
    await writeTransactionsAndRestore(f.db, [record("retained")]);
    const failed = f.createSession({
      ...(failure === "checkpoint_verified" ? { checkpoint: attempt => attempt.phase === "verified" ? Promise.reject(new LocalExpenseError("storage_error", failure)) : checkpointExpenseSync(f.db, attempt) } : {}),
      ...(failure === "apply_local" ? { apply: async () => { throw new LocalExpenseError("storage_error", failure); } } : {}),
      ...(failure === "render_dashboard" ? { render: async () => { throw new ReferenceError("UI bug"); } } : {}),
    });
    const result = await failed.sync();
    assert.equal(result.receipt.verified, true);
    assert.equal(failed.state.cloud, "success");
    assert.equal(failed.state.error.operation, failure);
    const snapshot = await captureLocalExpenseState(f.db);
    assert.equal(snapshot.document.transactions[0].id, "retained");
    if (failure !== "render_dashboard") {
      assert.equal(snapshot.meta.base, null);
      assert.ok(snapshot.meta.syncAttempt);
      assert.equal(failed.state.queue, "failed");
    }
    assert.equal((await f.createSession().sync()).wrote, false);
    assert.equal(f.api.state.commits.length, 1);
    assert.equal((await readSyncMeta(f.db)).syncAttempt, null);
    f.db.close();
  });
}

test("status observer exception cannot erase verified remote receipt", async () => {
  const f = await fixture();
  await writeTransactionsAndRestore(f.db, [record("observer")]);
  const session = f.createSession({ onState() { throw new ReferenceError("UI failure"); } });
  assert.equal((await session.sync()).verified, true);
  assert.equal(session.state.cloud, "success");
  assert.equal(session.state.receipt.verified, true);
  f.db.close();
});

test("capture failure is local, does not claim auth failure or call GitHub", async () => {
  const f = await fixture();
  const before = f.api.state.authHeaders.length;
  const session = f.createSession({ capture: async () => { throw new LocalExpenseError("storage_error", "capture_local"); } });
  session.publish({ auth: "connected" });
  await session.sync();
  assert.equal(session.state.auth, "connected");
  assert.equal(session.state.local, "error");
  assert.equal(f.api.state.authHeaders.length, before);
  f.db.close();
});

test("offline then online retries durable changes without clearing queue", async () => {
  const f = await fixture();
  await writeTransactionsAndRestore(f.db, [record("offline")]);
  let online = false;
  const session = f.createSession({ online: () => online });
  await session.sync();
  assert.equal(session.state.cloud, "failed");
  assert.equal((await captureLocalExpenseState(f.db)).document.transactions.length, 1);
  assert.equal(f.api.state.commits.length, 0);
  online = true;
  assert.equal((await session.sync()).verified, true);
  assert.equal(f.api.state.commits.length, 1);
  f.db.close();
});

test("many simultaneous Sync clicks share one operation and one cloud commit", async () => {
  const f = await fixture();
  await writeTransactionsAndRestore(f.db, [record("single-flight")]);
  const session = f.createSession();
  const results = await Promise.all(Array.from({ length: 20 }, () => session.sync()));
  assert.ok(results.every(r => r.verified));
  assert.equal(f.api.state.commits.length, 1);
  f.db.close();
});

test("zero local pending still pulls divergent cloud data; independent newer local/remote edits merge", async () => {
  const baseline = doc([record("base")]);
  const remote = doc([record("base"), record("remote-only")]);
  const f = await fixture({ initialDocument: remote });
  await writeTransactionsAndRestore(f.db, baseline.transactions);
  await applySyncedDocument(f.db, baseline, { document: baseline, sha: "old" }, f.github.repository);
  const session = f.createSession();
  assert.equal((await session.sync()).wrote, false);
  assert.equal((await captureLocalExpenseState(f.db)).document.transactions.length, 2);
  assert.equal(f.api.state.commits.length, 0);
  f.db.close();
  const older = record("version");
  const newer = record("version", { amount: 90000, updatedAt: "2026-10-23T08:00:00Z" });
  assert.deepEqual(mergeExpenseStates({ base: doc([older]), local: doc([newer]), remote: doc([older]) }).document.transactions, [newer]);
  assert.deepEqual(mergeExpenseStates({ base: doc([older]), local: doc([older]), remote: doc([newer]) }).document.transactions, [newer]);
  assert.equal(mergeExpenseStates({ base: doc(), local: doc([older]), remote: doc([newer]) }).conflicts.length, 1);
});

test("missing records cannot silently delete baseline transactions without tombstones", () => {
  const base = doc([record("protected")]);
  const merged = mergeExpenseStates({ base, local: base, remote: doc() });
  assert.equal(merged.document.transactions[0].id, "protected");
});

for (const status of [401, 403, 409, 422, 500, 503]) {
  test(`GitHub ${status} preserves local queue and baseline`, async () => {
    const f = await fixture({ onPut: () => jsonResponse({ message: "test rejection" }, status) });
    await writeTransactionsAndRestore(f.db, [record(`http-${status}`)]);
    const session = f.createSession();
    const result = await session.sync();
    assert.ok(result.error);
    const snapshot = await captureLocalExpenseState(f.db);
    assert.equal(snapshot.document.transactions.length, 1);
    assert.equal(snapshot.meta.base, null);
    assert.equal(snapshot.meta.syncAttempt.phase, "prepared");
    assert.equal(f.api.state.commits.length, 0);
    f.db.close();
  });
}

test("readback mismatch is unverified and never acknowledges local queue", async () => {
  const f = await fixture();
  await writeTransactionsAndRestore(f.db, [record("unverified")]);
  const original = f.github.verifyWrite.bind(f.github);
  f.github.verifyWrite = async (document, sha) => {
    f.api.state.file.sha = "changed-after-write";
    return original(document, sha);
  };
  const session = f.createSession();
  const result = await session.sync();
  assert.equal(result.status, "unverified");
  assert.equal(session.state.receipt.wrote, true);
  assert.equal(session.state.receipt.verified, false);
  assert.equal((await readSyncMeta(f.db)).base, null);
  assert.equal((await readSyncMeta(f.db)).syncAttempt.phase, "prepared");
  f.db.close();
});

test("local edits during sync are retained and remain pending after verified apply", async () => {
  const f = await fixture();
  const before = record("in-flight");
  await writeTransactionsAndRestore(f.db, [before]);
  const after = record("in-flight", { amount: 120000, updatedAt: "2026-10-23T09:00:00Z" });
  const session = f.createSession({ apply: async (snapshot, result, repository) => {
    await writeTransactionsAndRestore(f.db, [after]);
    await applySyncedDocument(f.db, snapshot, result, repository);
  } });
  await session.sync();
  const snapshot = await captureLocalExpenseState(f.db);
  assert.equal(snapshot.document.transactions[0].amount, 120000);
  assert.equal(snapshot.meta.base.transactions[0].amount, before.amount);
  f.db.close();
});

test("actual IndexedDB abort rolls back transactions and metadata atomically", async () => {
  const f = await fixture();
  const before = doc([record("atomic")]);
  await writeTransactionsAndRestore(f.db, before.transactions);
  const aborting = { transaction(...args) { const tx = f.db.transaction(...args); queueMicrotask(() => tx.abort()); return tx; } };
  await assert.rejects(applySyncedDocument(aborting, before, { document: doc([record("new")]), sha: "verified" }, f.github.repository), e => e.code === "storage_error");
  assert.deepEqual((await captureLocalExpenseState(f.db)).document, before);
  assert.equal((await readSyncMeta(f.db)).base, null);
  f.db.close();
});
