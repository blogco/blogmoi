import assert from "node:assert/strict";
import test from "node:test";
import worker from "../cms-proxy/src/index.js";

const env = { CMS_ORIGIN: "https://blogco.github.io", UNSPLASH_ACCESS_KEY: "test-access-key" };

async function call(path, { origin = env.CMS_ORIGIN, token = "github_pat_test", method = "GET", body } = {}) {
  const headers = new Headers({ Origin: origin });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  const request = new Request(`https://proxy.example${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return worker.fetch(request, env);
}

async function withFetch(mock, run) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try { await run(); } finally { globalThis.fetch = original; }
}

test("proxy rejects other origins before contacting APIs", async () => {
  await withFetch(async () => { throw new Error("unexpected fetch"); }, async () => {
    const response = await call("/api/unsplash/search?query=coffee", { origin: "https://attacker.example" });
    assert.equal(response.status, 403);
  });
});

test("proxy requires a GitHub token with repository write permission", async () => {
  await withFetch(async () => new Response(JSON.stringify({ permissions: { push: false } }), { status: 200 }), async () => {
    const response = await call("/api/unsplash/search?query=coffee");
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /write access/);
  });
});

test("missing Unsplash credentials return a setup error without contacting external APIs", async () => {
  await withFetch(async () => { throw new Error("unexpected fetch"); }, async () => {
    const response = await worker.fetch(new Request("https://proxy.example/api/unsplash/search?query=coffee", { headers: { Origin: env.CMS_ORIGIN, Authorization: "Bearer github_pat_test" } }), { CMS_ORIGIN: env.CMS_ORIGIN });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /not configured/);
  });
});

test("search uses the official Unsplash API and keeps the Access Key server side", async () => {
  const requests = [];
  await withFetch(async (input, init = {}) => {
    const url = String(input); requests.push({ url, headers: new Headers(init.headers) });
    if (url.includes("api.github.com")) return new Response(JSON.stringify({ permissions: { push: true } }), { status: 200 });
    return new Response(JSON.stringify({ total: 1, results: [{ id: "photo-1", urls: { small: "https://images.unsplash.com/photo-1" } }] }), { status: 200 });
  }, async () => {
    const response = await call("/api/unsplash/search?query=coffee&per_page=12&orientation=landscape");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), env.CMS_ORIGIN);
    assert.equal(response.headers.get("Cache-Control"), "private, max-age=180");
    assert.deepEqual((await response.json()).results[0].id, "photo-1");
  });
  const upstream = requests.find((request) => request.url.includes("api.unsplash.com"));
  assert.match(upstream.url, /^https:\/\/api\.unsplash\.com\/search\/photos\?/);
  assert.equal(upstream.headers.get("Authorization"), "Client-ID test-access-key");
  assert.equal(requests.length, 2);
});

test("Unsplash rate limits become a clear retry message", async () => {
  await withFetch(async (input) => String(input).includes("api.github.com")
    ? new Response(JSON.stringify({ permissions: { push: true } }), { status: 200 })
    : new Response(JSON.stringify({ errors: ["rate limit"] }), { status: 429 }), async () => {
    const response = await call("/api/unsplash/search?query=coffee");
    assert.equal(response.status, 429);
    assert.match((await response.json()).error, /rate limit/);
  });
});

test("selecting a photo tracks only the Unsplash download_location", async () => {
  const requests = [];
  await withFetch(async (input, init = {}) => {
    const url = String(input); requests.push({ url, method: init.method || "GET", headers: new Headers(init.headers) });
    if (url.includes("api.github.com")) return new Response(JSON.stringify({ permissions: { push: true } }), { status: 200 });
    return new Response(JSON.stringify({ url: "https://images.unsplash.com/photo-1" }), { status: 200 });
  }, async () => {
    const response = await call("/api/unsplash/track", { method: "POST", body: { download_location: "https://api.unsplash.com/photos/photo-1/download" } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  });
  const tracked = requests.find((request) => request.url.includes("/photos/photo-1/download"));
  assert.equal(tracked.method, "GET");
  assert.equal(tracked.headers.get("Authorization"), "Client-ID test-access-key");
});

test("tracking refuses caller supplied URLs outside the Unsplash download endpoint", async () => {
  await withFetch(async (input) => String(input).includes("api.github.com")
    ? new Response(JSON.stringify({ permissions: { push: true } }), { status: 200 })
    : new Response("unexpected", { status: 500 }), async () => {
    const response = await call("/api/unsplash/track", { method: "POST", body: { download_location: "https://attacker.example/" } });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /download_location/);
  });
});
