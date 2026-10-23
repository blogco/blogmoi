import { YY_AIRPORTS } from "./yy-airports.js";
export function localDay(now = new Date(), timeZone = "Asia/Bangkok") {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year:"numeric", month:"2-digit", day:"2-digit" }).format(now);
}
const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
export function googleFlightsUrl(origin, destination, departure) {
  const from = String(origin).trim().toUpperCase(), to = String(destination).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || from === to || !validDay(departure)) throw new Error("Nhập hai mã sân bay khác nhau và ngày khởi hành hợp lệ.");
  const url = new URL("https://www.google.com/travel/flights");
  url.search = new URLSearchParams({ hl:"vi", curr:"VND", q:`Flights from ${from} to ${to} on ${departure}` });
  return url.href;
}
export function flightStatusUrl(flight, date) {
  const number = String(flight).replace(/\s/g, "").toUpperCase();
  if (!/^(?:[A-Z]{3}|[A-Z][A-Z0-9]|[0-9][A-Z])\d{1,4}[A-Z]?$/.test(number) || !validDay(date)) throw new Error("Nhập số hiệu chuyến bay, ví dụ VN300, và ngày bay hợp lệ.");
  const url = new URL("https://www.google.com/search"); url.searchParams.set("q", `${number} flight status ${date}`); return url.href;
}
export function weatherLabel(code) {
  if (code === 0) return ["Trời quang","☀"];
  if ([1,2].includes(code)) return ["Ít mây / có mây","⛅"];
  if (code === 3) return ["Nhiều mây","☁"];
  if ([45,48].includes(code)) return ["Sương mù","≋"];
  if ([51,53,55,56,57].includes(code)) return ["Mưa phùn","☂"];
  if ([61,63,65,66,67,80,81,82].includes(code)) return ["Mưa / mưa rào","☂"];
  if ([71,73,75,77,85,86].includes(code)) return ["Tuyết","❄"];
  if ([95,96,99].includes(code)) return ["Dông","ϟ"];
  return ["Chưa rõ điều kiện","☁"];
}
const timestamp = (value, zone="Asia/Bangkok") => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("vi-VN",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",timeZone:zone}).format(new Date(value)) : "chưa rõ";
export function initYYInfo(root, { fetchImpl = fetch, now = () => new Date(), open = (...args) => window.open(...args), autoRefresh = true } = {}) {
  const doc = root.ownerDocument;
  const $ = selector => root.querySelector(selector);
  const text = (selector,value) => { $(selector).textContent = value; };
  const make = (tag,cls,content) => { const element=doc.createElement(tag); if(cls) element.className=cls; if(content!==undefined) element.textContent=content; return element; };
  let snapshot = {}, request = 0, destroyed = false, weatherAbort;
  const route = $("[data-route-form]"), flight = $("[data-flight-form]"), airportSelect = $("[data-weather-airport]");
  for (const airport of YY_AIRPORTS) {
    const option = make("option","",`${airport.iata} · ${airport.name}`); option.value=airport.iata; airportSelect.append(option);
    const hint = make("option","",airport.name); hint.value=airport.iata; $("#yy-airports").append(hint);
  }
  route.elements.departure.value=localDay(now()); route.elements.departure.min=localDay(now()); flight.elements.date.value=localDay(now());
  const tabs=[...root.querySelectorAll("[data-yy-tab]")];
  function activate(tab) {
    for(const button of tabs) { const active=button===tab; button.setAttribute("aria-selected",String(active)); button.tabIndex=active?0:-1; }
    for(const panel of root.querySelectorAll("[data-yy-panel]")) panel.hidden=panel.dataset.yyPanel!==tab.dataset.yyTab;
  }
  for(const tab of tabs) { tab.addEventListener("click",()=>activate(tab)); tab.addEventListener("keydown",event=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();const index=event.key==="Home"?0:event.key==="End"?tabs.length-1:(tabs.indexOf(tab)+(event.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;activate(tabs[index]);tabs[index].focus();}); }
  function search(event, build) {
    event.preventDefault();
    try { const url=build(); const link=$("[data-search-link]");link.href=url;link.hidden=false;text("[data-search-status]","Đã mở nguồn tra cứu ở tab mới. Nếu trình duyệt chặn, dùng liên kết bên dưới.");open(url,"_blank","noopener,noreferrer"); }
    catch(error) { $("[data-search-link]").hidden=true;text("[data-search-status]",error.message); }
  }
  route.addEventListener("submit",event=>search(event,()=>googleFlightsUrl(route.elements.origin.value,route.elements.destination.value,route.elements.departure.value)));
  flight.addEventListener("submit",event=>search(event,()=>flightStatusUrl(flight.elements.flight.value,flight.elements.date.value)));
  function sourceStatus(part, label, maxAge=5400000) {
    if(!part?.fetchedAt) return `${label}: chưa có dữ liệu xác minh được.`;
    const stamp=part.updatedAt || part.fetchedAt;
    const stale=now().getTime()-Date.parse(stamp)>maxAge;
    return `${label} · ${timestamp(stamp)} GMT+7${part.status!=="ok"?" · Lần tải mới bị lỗi; đang giữ dữ liệu trước đó":stale?" · Dữ liệu cũ":""}`;
  }
  function renderDelays() {
    const part=snapshot.delays, list=$("[data-delay-list]");list.replaceChildren();
    text("[data-delay-status]",sourceStatus(part,"FAA / chỉ Mỹ"));text("[data-delay-count]",part?.fetchedAt?String(part.items.length):"—");
    const query=$("[data-delay-filter]").value.trim().toUpperCase();
    const items=(part?.items || []).filter(item=>item.airport.includes(query));
    for(const item of items) {
      const card=make("article","yy-delay-card"), header=make("header");header.append(make("strong","",item.airport),make("span","",item.type));card.append(header,make("p","",item.reason || "Xem chi tiết tại FAA."));
      const times=[item.average&&`Trung bình: ${item.average}`,item.minimum&&`Tối thiểu: ${item.minimum}`,item.maximum&&`Tối đa: ${item.maximum}`,item.ends&&`Kết thúc / mở lại: ${item.ends}`].filter(Boolean).join(" · ");
      if(times) card.append(make("p","yy-delay-times",times));list.append(card);
    }
    if(!items.length) list.append(make("p","yy-empty",part?.fetchedAt?(query?"Không có thông báo khớp mã này trong dữ liệu đang hiển thị.":"Feed FAA hiện không có thông báo. Điều này không xác nhận từng chuyến bay đúng giờ."):"Chưa tải được nguồn FAA. Mở bảng chính thức để kiểm tra."));
  }
  function renderMETAR() {
    const airport=YY_AIRPORTS.find(item=>item.iata===airportSelect.value), part=snapshot.metar;
    const report=part?.items?.find(item=>item.icao===airport.icao);
    text("[data-metar-category]",report?.category || "—");text("[data-metar-raw]",report?.raw || `Chưa có báo cáo METAR cho ${airport.icao}.`);
    const stale=report && now().getTime()-Date.parse(report.observedAt)>10800000;
    text("[data-metar-status]",report?`${airport.icao} · quan trắc ${timestamp(report.observedAt,airport.timeZone)} giờ sân bay${stale?" · Báo cáo cũ":""}${part.status!=="ok"?" · Nguồn cập nhật đang lỗi":""}`:"Không suy đoán thời tiết khi chưa có quan trắc.");
  }
  function renderNews() {
    const part=snapshot.news, list=$("[data-news-list]");list.replaceChildren();text("[data-news-status]",sourceStatus(part,"RSS FlightGlobal · tiêu đề gốc",172800000));
    for(const item of part?.items || []) {
      let url;try{url=new URL(item.url);}catch{continue;}
      if(url.protocol!=="https:" || !["flightglobal.com","www.flightglobal.com"].includes(url.hostname)) continue;
      const card=make("article","yy-news-card"), heading=make("h3"), link=make("a","",item.title);link.href=url.href;link.target="_blank";link.rel="noopener noreferrer";heading.append(link);
      const time=make("time","",timestamp(item.publishedAt)+" GMT+7");time.dateTime=item.publishedAt;card.append(make("span","","FLIGHTGLOBAL / AVIATION"),heading,time);list.append(card);
    }
    if(!list.children.length) list.append(make("p","yy-empty","Chưa tải được RSS. Bạn có thể đọc tin trực tiếp tại FlightGlobal."));
  }
  async function weather() {
    const id=++request; weatherAbort?.abort();weatherAbort=new AbortController();
    const airport=YY_AIRPORTS.find(item=>item.iata===airportSelect.value);
    renderMETAR();text("[data-weather-status]",`Đang tải thời tiết ${airport.iata}…`);
    for(const selector of ["[data-weather-temperature]","[data-weather-wind]","[data-weather-gust]"]) text(selector,"—");
    text("[data-weather-description]","Đang tải…");text("[data-weather-icon]","☁");text("[data-airport-clock]",new Intl.DateTimeFormat("vi-VN",{hour:"2-digit",minute:"2-digit",timeZone:airport.timeZone}).format(now()));
    const url=new URL("https://api.open-meteo.com/v1/forecast");url.search=new URLSearchParams({latitude:airport.latitude,longitude:airport.longitude,current:"temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m",timezone:airport.timeZone,wind_speed_unit:"kmh"});
    try {
      const response=await fetchImpl(url.href,{signal:AbortSignal.any([weatherAbort.signal,AbortSignal.timeout(15000)]),credentials:"omit"});if(!response.ok)throw new Error("weather");const data=await response.json();
      if(destroyed || id!==request)return;
      const current=data.current;
      if(!current || !Number.isFinite(current.temperature_2m))throw new Error("weather");
      const [label,icon]=weatherLabel(current.weather_code);
      text("[data-weather-temperature]",`${Math.round(current.temperature_2m)}°C`);text("[data-weather-description]",label);text("[data-weather-icon]",icon);
      for(const [selector,value] of [["[data-weather-wind]",current.wind_speed_10m],["[data-weather-gust]",current.wind_gusts_10m]])text(selector,Number.isFinite(value)?`${value} km/h`:"—");
      const stamp=Date.parse(current.time+"Z")-Number(data.utc_offset_seconds || 0)*1000;
      if(!Number.isFinite(stamp))throw new Error("weather");
      text("[data-weather-status]",`${airport.iata} · mô hình lúc ${timestamp(new Date(stamp).toISOString(),airport.timeZone)} giờ sân bay${now().getTime()-stamp>7200000?" · Dữ liệu cũ":""}`);
    } catch(error) { if(destroyed || id!==request || error.name==="AbortError")return;for(const selector of ["[data-weather-temperature]","[data-weather-wind]","[data-weather-gust]"])text(selector,"—");text("[data-weather-status]","Chưa tải được Open-Meteo. Quan trắc METAR và liên kết nguồn vẫn có thể sử dụng.");text("[data-weather-description]","Chưa có dữ liệu"); }
  }
  async function refresh() {
    $("[data-refresh]").disabled=true;
    try {const response=await fetchImpl(root.dataset.snapshotUrl,{cache:"no-store",credentials:"omit"});if(!response.ok)throw new Error("snapshot");const data=await response.json();if(data.schemaVersion!==1)throw new Error("schema");for(const key of ["delays","metar","news"])if(!Array.isArray(data[key]?.items))throw new Error("schema");if(!destroyed)snapshot=data;}
    catch { if(snapshot.delays)snapshot.delays={...snapshot.delays,status:"unavailable"};if(snapshot.news)snapshot.news={...snapshot.news,status:"unavailable"};if(snapshot.metar)snapshot.metar={...snapshot.metar,status:"unavailable"}; }
    finally { if(!destroyed){renderDelays();renderMETAR();renderNews();$("[data-refresh]").disabled=false;} }
  }
  airportSelect.addEventListener("change",weather);$("[data-delay-filter]").addEventListener("input",renderDelays);$("[data-refresh]").addEventListener("click",()=>{void refresh();void weather();});
  const ready=Promise.all([refresh(),weather()]);
  const timer=autoRefresh?setInterval(()=>{if(doc.visibilityState!=="hidden"){void refresh();void weather();}},300000):null;
  return {ready,refresh,weather,destroy(){destroyed=true;weatherAbort?.abort();if(timer)clearInterval(timer);}};
}
if(typeof document!=="undefined") { const root=document.querySelector("[data-yy-info]");if(root)initYYInfo(root); }
