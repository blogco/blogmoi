import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { IDBFactory } from "fake-indexeddb";
import { record, makeGitHub } from "./helpers/expense-github.mjs";
// Execute the actual production output modules against production HTML.
const production = await import("../_site/js/expense-tracker.js");
const html = await readFile(new URL("../_site/chi-phi-hang-thang/index.html", import.meta.url), "utf8");
const settle = async predicate => {
  for (let n = 0; n < 200; n++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("UI did not settle");
};

test("production DOM: seeded IndexedDB, connect, migrate, repeated Sync, reload; no scope or false DB errors", async () => {
  const factory = new IDBFactory();
  const db = await production.openDatabase(factory);
  await production.writeTransactionsAndRestore(db, [record("real-render-path", { itemName: "Cà phê", iconId: "coffee" })]);
  db.close();
  const api = makeGitHub();
  const keys = ["window", "document", "navigator", "indexedDB", "fetch", "CSS", "Option", "FormData"];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let dom;
  const mount = async () => {
    dom = new JSDOM(html, { url: "https://blogco.github.io/blogmoi/chi-phi-hang-thang/" });
    for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, indexedDB: factory, fetch: api.fetchImpl, Option: dom.window.Option, FormData: dom.window.FormData, CSS: { escape: value => value } })) {
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
    dom.window.fetch = api.fetchImpl;
    await production.startExpenseTracker();
    assert.equal(document.querySelector("#expense-app").dataset.state, "ready");
    assert.match(document.querySelector("#insight-list").textContent, /cà phê/i);
    assert.equal(document.querySelector("#storage-error").hidden, true);
    assert.equal(document.querySelector("#github-auth-status").textContent, "Chưa kết nối");
    const token = document.querySelector("#cloud-token");
    token.value = "test-token";
    document.querySelector("#cloud-connect-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    await settle(() => !document.querySelector("#cloud-connect").disabled);
    assert.equal(token.value, "");
    assert.equal(document.querySelector("#github-auth-status").textContent, "Đã kết nối");
  };
  try {
    await mount();
    document.querySelector("#cloud-migrate").click();
    await settle(() => document.querySelector("#cloud-sync-status").dataset.state === "success");
    await settle(() => document.querySelector("#cloud-sync-message").textContent.includes("Đã xác minh"));
    assert.equal(document.querySelector("#local-storage-status").textContent, "Sẵn sàng");
    assert.match(document.querySelector("#cloud-pending-count").textContent, /^0/);
    for (let n = 0; n < 10; n++) document.querySelector("#cloud-sync-now").click();
    await settle(() => document.querySelector("#cloud-sync-status").dataset.state === "no_changes");
    assert.equal(api.state.commits.length, 1);
    dom.window.dispatchEvent(new dom.window.Event("pagehide"));
    dom.window.close();
    await mount();
    assert.equal(document.querySelector("#cloud-sync-status").dataset.state, "no_changes");
    assert.equal(api.state.commits.length, 1);
    assert.equal(api.state.file.document.transactions.length, 1);
  } finally {
    dom?.window.dispatchEvent(new dom.window.Event("pagehide"));
    dom?.window.close();
    for (const key of keys) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else delete globalThis[key];
    }
  }
});
