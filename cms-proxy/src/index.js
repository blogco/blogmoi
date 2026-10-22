const UNSPLASH_API = "https://api.unsplash.com";
const GITHUB_API = "https://api.github.com";
const OWNER = "blogco";
const REPO = "blogmoi";
const CACHE_TTL = 180;

function json(body, status, origin, extra = {}) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    ...extra
  });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Max-Age", "600");
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

function getToken(request) {
  const authorization = request.headers.get("Authorization") || "";
  const match = /^Bearer\s+([\w-]+)$/i.exec(authorization);
  return match?.[1] || "";
}

async function mayWriteRepository(token) {
  const response = await fetch(`${GITHUB_API}/repos/${OWNER}/${REPO}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
  if (!response.ok) return false;
  const repository = await response.json();
  return repository.permissions?.push === true;
}

function readQuery(request) {
  const params = new URL(request.url).searchParams;
  const query = (params.get("query") || "").trim().slice(0, 100);
  const orientation = params.get("orientation") === "portrait" ? "portrait" : "landscape";
  const requested = Number(params.get("per_page") || 12);
  const perPage = Number.isFinite(requested) ? Math.max(1, Math.min(12, requested)) : 12;
  return { query, orientation, perPage };
}

function validDownloadLocation(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "api.unsplash.com" && /^\/photos\/[A-Za-z0-9_-]+\/download$/.test(url.pathname);
  } catch {
    return false;
  }
}

async function unsplashJson(url, key) {
  const response = await fetch(url, { headers: { Authorization: `Client-ID ${key}`, Accept: "application/json" } });
  if (!response.ok) {
    return { error: response.status === 429 ? "Unsplash rate limit reached. Wait before searching again." : `Unsplash returned HTTP ${response.status}.`, status: response.status };
  }
  return { data: await response.json(), status: response.status };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = env.CMS_ORIGIN || "https://blogco.github.io";
    if (origin !== allowedOrigin) return json({ error: "This origin is not allowed." }, 403, "");
    if (request.method === "OPTIONS") return json({}, 204, origin);
    if (!env.UNSPLASH_ACCESS_KEY) return json({ error: "Unsplash is not configured on the server." }, 503, origin);

    const path = new URL(request.url).pathname;
    const isSearch = request.method === "GET" && path === "/api/unsplash/search";
    const isRandom = request.method === "GET" && path === "/api/unsplash/random";
    const isTrack = request.method === "POST" && path === "/api/unsplash/track";
    if (!isSearch && !isRandom && !isTrack) return json({ error: "Not found." }, 404, origin);

    const token = getToken(request);
    if (!token) return json({ error: "Sign in to Blogmoi CMS first." }, 401, origin);
    let authorized = false;
    try { authorized = await mayWriteRepository(token); }
    catch { return json({ error: "GitHub authorization could not be checked." }, 502, origin); }
    if (!authorized) return json({ error: "A token with write access to blogco/blogmoi is required." }, 403, origin);

    if (isTrack) {
      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid request body." }, 400, origin); }
      if (!validDownloadLocation(body.download_location)) return json({ error: "Use the download_location supplied by Unsplash." }, 400, origin);
      const tracked = await fetch(body.download_location, { headers: { Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}`, Accept: "application/json" } });
      if (!tracked.ok) return json({ error: "Unsplash could not record the photo selection." }, tracked.status === 429 ? 429 : 502, origin);
      return json({ ok: true }, 200, origin);
    }

    const { query, orientation, perPage } = readQuery(request);
    if (query.length < 2) return json({ error: "Search needs at least two characters." }, 400, origin);
    const url = new URL(isSearch ? "/search/photos" : "/photos/random", UNSPLASH_API);
    url.searchParams.set("query", query);
    url.searchParams.set("orientation", orientation);
    if (isSearch) url.searchParams.set("per_page", String(perPage));
    const result = await unsplashJson(url.href, env.UNSPLASH_ACCESS_KEY);
    if (result.error) return json({ error: result.error }, result.status === 429 ? 429 : 502, origin);
    const cacheHeaders = { "Cache-Control": `private, max-age=${CACHE_TTL}`, "Vary": "Origin, Authorization" };
    if (isRandom) return json({ photo: result.data }, 200, origin, { "Cache-Control": "no-store", "Vary": "Origin, Authorization" });
    return json(result.data, 200, origin, cacheHeaders);
  }
};
