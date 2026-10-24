import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import yaml from "js-yaml";
import { parseFAADelays,parseMETAR,parseAviationNews,refreshYYData,fetchYYSource } from "../scripts/lib/yy-info.mjs";
import {googleFlightsUrl,flightStatusUrl,weatherLabel,localDay,initYYInfo} from "../static/js/yy-info.js";
const now=new Date("2026-10-23T02:30:00Z");
const faa='<AIRPORT_STATUS_INFORMATION><Update_Time>Fri Oct 23 02:13:01 2026 GMT</Update_Time><Ground_Delay_List><Ground_Delay><ARPT>SFO</ARPT><Reason>low ceilings</Reason><Avg>1 hour</Avg></Ground_Delay></Ground_Delay_List><Airport_Closure_List><Airport><ARPT>LAX</ARPT><Reason>GA restrictions only</Reason></Airport></Airport_Closure_List></AIRPORT_STATUS_INFORMATION>';
const metar=[{icaoId:"VVTS",obsTime:1792722000,rawOb:"VVTS 230200Z 27004KT 9999 SCT020 29/25 Q1008",fltCat:"VFR",temp:29,wspd:4}];
const news='<rss><channel><item><title>Verified aviation headline</title><link>https://www.flightglobal.com/test-story</link><pubDate>Fri, 23 Oct 2026 01:00:00 GMT</pubDate></item><item><title>Bad link</title><link>javascript:alert(1)</link><pubDate>Fri, 23 Oct 2026 01:00:00 GMT</pubDate></item></channel></rss>';
const weather={utc_offset_seconds:25200,current:{time:"2026-10-23T09:15",temperature_2m:29,weather_code:3,wind_speed_10m:0,wind_gusts_10m:10}};

test("Google lookup links encode inputs, validate dates, and never present scraped flight status",()=>{
 const url=new URL(googleFlightsUrl("sgn","ICN","2026-10-23"));assert.equal(url.origin,"https://www.google.com");assert.match(url.searchParams.get("q"),/SGN to ICN/);
 assert.throws(()=>googleFlightsUrl("SGN","SGN","2026-10-23"));assert.throws(()=>googleFlightsUrl("SGN","ICN","2026-02-30"));
 assert.match(flightStatusUrl("vn 300","2026-10-23"),/VN300/);assert.throws(()=>flightStatusUrl("12345","2026-10-23"));assert.throws(()=>flightStatusUrl("<script>","2026-10-23"));
 assert.equal(localDay(new Date("2026-10-22T17:00:00Z")),"2026-10-23");assert.deepEqual(weatherLabel(95),["Dông","ϟ"]);
});
test("FAA distinguishes ground delays and restricted airport notices; METAR stays airport observations",()=>{
 const parsed=parseFAADelays(faa);assert.equal(parsed.coverage,"US");assert.equal(parsed.items.length,2);assert.match(parsed.items[1].type,/Hạn chế/);assert.equal(parsed.items[0].average,"1 hour");
 assert.throws(()=>parseFAADelays('<html>blocked</html>'));assert.throws(()=>parseFAADelays('<!DOCTYPE x><x/>'));
 assert.equal(parseMETAR(metar).items[0].icao,"VVTS");assert.equal(parseMETAR([{...metar[0],icaoId:"EVIL"}]).items.length,0);
 assert.equal(parseAviationNews(news,now).items.length,1);
});
test("refresh preserves last successful data and its timestamp on provider failure",async()=>{
 const first=await refreshYYData({}, {now,fetchText:async url=>url.includes("faa.gov")?faa:url.includes("metar")?JSON.stringify(metar):news});
 assert.ok(["delays","metar","news"].every(key=>first[key].status==="ok"));
 const failed=await refreshYYData(first,{now:new Date("2026-10-23T03:00:00Z"),fetchText:async()=>{throw new Error("offline");}});
 assert.equal(failed.delays.fetchedAt,first.delays.fetchedAt);assert.equal(failed.delays.status,"unavailable");assert.equal(failed.delays.items.length,2);
 await assert.rejects(fetchYYSource("https://nasstatus.faa.gov/a",async()=>new Response(null,{status:302,headers:{location:"https://evil.example"}})),/redirect/);
});
test("YY page works with real-source-shaped fixtures and handles outages without fabricated zeroes",async()=>{
 const dom=new JSDOM(await readFile("_site/yy-info/index.html","utf8"),{url:"https://blogco.github.io/blogmoi/yy-info/"});
 const root=dom.window.document.querySelector("[data-yy-info]");
 const snapshot=await refreshYYData({}, {now,fetchText:async url=>url.includes("faa.gov")?faa:url.includes("metar")?JSON.stringify(metar):news});
 let offline=false;const opened=[];
 const app=initYYInfo(root,{now:()=>now,autoRefresh:false,open:(...args)=>opened.push(args),fetchImpl:async url=>{if(offline)throw new Error("offline");return new Response(JSON.stringify(String(url).includes("open-meteo")?weather:snapshot));}});
 try{
 await app.ready;assert.equal(root.querySelector("[data-delay-count]").textContent,"2");assert.equal(root.querySelectorAll(".yy-delay-card").length,2);assert.equal(root.querySelector("[data-weather-temperature]").textContent,"29°C");assert.equal(root.querySelector("[data-weather-wind]").textContent,"0 km/h");assert.match(root.querySelector("[data-metar-raw]").textContent,/VVTS/);assert.equal(root.querySelectorAll(".yy-news-card").length,1);
 root.querySelector("[data-route-form]").dispatchEvent(new dom.window.Event("submit",{cancelable:true}));assert.match(opened[0][0],/google.com\/travel\/flights/);assert.equal(opened[0][2],"noopener,noreferrer");
 root.querySelector('[data-yy-tab="flight"]').click();assert.equal(root.querySelector('[data-yy-panel="route"]').hidden,true);
 const filter=root.querySelector("[data-delay-filter]");filter.value="SFO";filter.dispatchEvent(new dom.window.Event("input"));assert.equal(root.querySelectorAll(".yy-delay-card").length,1);
 offline=true;await app.refresh();await app.weather();assert.match(root.querySelector("[data-delay-status]").textContent,/bị lỗi/);assert.equal(root.querySelector("[data-weather-temperature]").textContent,"—");assert.equal(root.querySelectorAll(".yy-delay-card").length,1);
 }finally{app.destroy();dom.window.close();}
});
test("workflow refreshes every 30 minutes without running the daily news models each time",async()=>{
 const workflow=yaml.load(await readFile(".github/workflows/deploy.yml","utf8"));assert.ok(workflow.on.schedule.some(item=>item.cron==="*/30 * * * *"));
 const steps=workflow.jobs.deploy.steps;const modelStep=steps.find(step=>step.name==="Generate one English-Korean news brief locally");assert.match(modelStep.if,/news_due/);
 assert.ok(steps.find(step=>step.name==="Refresh YY info public feeds").run.includes("refresh-yy-info.mjs"));assert.ok(steps.find(step=>step.id==="persist_dictionary").run.includes("static/data/yy-info.json"));
});
