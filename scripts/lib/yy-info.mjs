import { JSDOM } from "jsdom";
import { YY_AIRPORTS } from "../../static/js/yy-airports.js";

export const YY_SOURCES = {
  delays: "https://nasstatus.faa.gov/api/airport-status-information",
  metar: "https://aviationweather.gov/api/data/metar?format=json&ids=" + YY_AIRPORTS.map(airport => airport.icao).join(","),
  news: "https://www.flightglobal.com/rss",
};

function xmlDocument(text) {
  if (/<!DOCTYPE|<!ENTITY/iu.test(text)) throw new Error("Unsupported XML declarations");
  const dom = new JSDOM(text, { contentType: "text/xml" });
  if (dom.window.document.querySelector("parsererror")) { dom.window.close(); throw new Error("Invalid XML"); }
  return dom;
}
const clean = (value, max = 600) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);

export function parseFAADelays(text) {
  const dom = xmlDocument(text);
  try {
    const document = dom.window.document;
    if (!document.querySelector("AIRPORT_STATUS_INFORMATION")) throw new Error("Unexpected FAA feed");
    const updated = document.querySelector("Update_Time")?.textContent;
    if (!Number.isFinite(Date.parse(updated))) throw new Error("FAA update time missing");
    const items = [];
    const selectors = [["Ground_Delay_List > Ground_Delay", "Chương trình delay mặt đất"], ["Ground_Stop_List > Ground_Stop", "Tạm dừng khởi hành đến sân bay"], ["Arrival_Departure_Delay_List > Delay", "Chậm đến / khởi hành"], ["Airport_Closure_List > Airport", "Hạn chế sân bay · xem NOTAM"]];
    for (const [selector, type] of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        const get = name => clean(node.querySelector(name)?.textContent);
        const airport = get("ARPT");
        if (!/^[A-Z0-9]{3,4}$/.test(airport)) continue;
        items.push({ airport, type, reason: get("Reason"), average: get("Avg"), minimum: get("Min"), maximum: get("Max"), starts: get("Start"), ends: get("EndTime") || get("Reopen"), direction: clean(node.querySelector("Arrival_Departure")?.getAttribute("Type")) });
      }
    }
    return { updatedAt: new Date(updated).toISOString(), coverage: "US", items };
  } finally { dom.window.close(); }
}

export function parseMETAR(data) {
  if (!Array.isArray(data)) throw new Error("Unexpected METAR response");
  const allowed = new Set(YY_AIRPORTS.map(airport => airport.icao));
  return { items: data.filter(item => allowed.has(item.icaoId) && typeof item.rawOb === "string" && Number.isFinite(Number(item.obsTime))).map(item => ({
    icao: item.icaoId, observedAt: new Date(Number(item.obsTime) * 1000).toISOString(), raw: clean(item.rawOb, 1000), category: ["VFR","MVFR","IFR","LIFR"].includes(item.fltCat) ? item.fltCat : "", temperature: typeof item.temp === "number" ? item.temp : null, windKnots: typeof item.wspd === "number" ? item.wspd : null, visibilityMiles: clean(item.visib, 30),
  })) };
}

export function parseAviationNews(text, now = new Date()) {
  const dom = xmlDocument(text);
  try {
    const seen = new Set();
    const items = [...dom.window.document.querySelectorAll("item")].flatMap(item => {
      const title = clean(item.querySelector("title")?.textContent, 240);
      const link = item.querySelector("link")?.textContent?.trim();
      const published = Date.parse(item.querySelector("pubDate")?.textContent);
      let url;
      try { url = new URL(link); } catch { return []; }
      if (!title || url.protocol !== "https:" || !["www.flightglobal.com","flightglobal.com"].includes(url.hostname) || url.username || url.password || !Number.isFinite(published) || published > now.getTime() + 300000 || seen.has(url.href)) return [];
      seen.add(url.href);
      return [{ title, url: url.href, publishedAt: new Date(published).toISOString(), publisher: "FlightGlobal" }];
    }).sort((a,b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 8);
    if (!items.length) throw new Error("No verified aviation headlines in RSS");
    return { items };
  } finally { dom.window.close(); }
}

export async function fetchYYSource(url, fetchImpl = fetch) {
  const allowed = new URL(url).hostname;
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(20000), headers: { "User-Agent": "Blogmoi-YYInfo/1.0 (+https://blogco.github.io/blogmoi/yy-info/)" } });
    if ([301,302,303,307,308].includes(response.status)) {
      const next = new URL(response.headers.get("location"), url);
      if (next.protocol !== "https:" || next.hostname !== allowed || next.username || next.password) throw new Error("Unexpected source redirect");
      url = next.href; continue;
    }
    if (!response.ok) throw new Error(`Source HTTP ${response.status}`);
    const reader = response.body.getReader();
    let size = 0;
    const chunks = [];
    while (true) {
      const {done,value} = await reader.read(); if (done) break;
      size += value.length;
      if (size > 2_000_000) { await reader.cancel(); throw new Error("Source response too large"); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  throw new Error("Too many source redirects");
}

export async function refreshYYData(previous = {}, { fetchText = fetchYYSource, now = new Date() } = {}) {
  const snapshot = { schemaVersion: 1, generatedAt: now.toISOString() };
  const parsers = { delays: parseFAADelays, metar: text => parseMETAR(JSON.parse(text)), news: text => parseAviationNews(text, now) };
  await Promise.all(Object.entries(YY_SOURCES).map(async ([key,url]) => {
    try {
      const result = parsers[key](await fetchText(url));
      snapshot[key] = { ...result, sourceUrl: url, status: "ok", fetchedAt: now.toISOString(), checkedAt: now.toISOString() };
    } catch {
      snapshot[key] = { ...(previous[key] || { items: [] }), sourceUrl: url, status: "unavailable", checkedAt: now.toISOString() };
    }
  }));
  return snapshot;
}
