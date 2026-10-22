(() => {
  "use strict";
  const root = document.querySelector("[data-cms]");
  if (!root) return;
  const $ = (s, el = root) => el.querySelector(s);
  const $$ = (s, el = root) => Array.from(el.querySelectorAll(s));
  const editor = $("[data-body]");
  const status = $("[data-cms-status]");
  const dbName = "blogmoi-authoring-v1";
  const apiRoot = "/blogmoi/api";
  let dbPromise;
  let activeDraftId = "";
  let editSlug = "";
  let editSha = "";
  let activeTable = null;
  let activeCell = null;
  let activeFigure = null;
  let coverData = null;
  let savedCoverUrl = "";
  let titleSlugTouched = false;
  let saveTimer;

  function setStatus(message, kind) {
    status.textContent = message;
    status.dataset.state = kind || "";
  }
  function openDB() {
    if (!("indexedDB" in window)) return Promise.reject(new Error("IndexedDB is unavailable"));
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("drafts", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }
  async function draftOp(mode, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("drafts", "readwrite");
      const store = tx.objectStore("drafts");
      const req = mode === "all" ? store.getAll() : mode === "get" ? store.get(value) : mode === "delete" ? store.delete(value) : store.put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  const slugify = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "bai-viet";
  const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function safeUrl(value, image) {
    try {
      if (String(value).startsWith("data:image/") && image) return value;
      const u = new URL(value, location.origin);
      if (u.protocol === "https:" || u.protocol === "http:" && u.origin === location.origin || u.protocol === "mailto:" && !image) return u.href;
    } catch {}
    return "";
  }
  const allowed = new Set(["P","H2","H3","H4","STRONG","B","EM","I","U","A","UL","OL","LI","BLOCKQUOTE","BR","FIGURE","FIGCAPTION","IMG","TABLE","THEAD","TBODY","TR","TH","TD","HR"]);
  function cleanNode(node, into) {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) { into.append(document.createTextNode(child.nodeValue || "")); continue; }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = child.tagName;
      if (!allowed.has(tag)) { cleanNode(child, into); continue; }
      const copy = document.createElement(tag.toLowerCase());
      if (tag === "A") { const href = safeUrl(child.getAttribute("href"), false); if (href) { copy.setAttribute("href", href); copy.setAttribute("rel", "noopener noreferrer"); } }
      if (tag === "IMG") { const src = safeUrl(child.getAttribute("src"), true); if (!src) continue; copy.setAttribute("src", src); copy.setAttribute("alt", child.getAttribute("alt") || ""); const width = child.getAttribute("width"); if (/^(25|50|75|100)$/.test(width || "")) copy.setAttribute("width", width); }
      if (tag === "FIGURE") { const a = child.dataset.align; const w = child.dataset.width; if (["left","center","right"].includes(a)) copy.dataset.align = a; if (["25","50","75","100"].includes(w)) copy.dataset.width = w; }
      if (["P","H2","H3","H4","BLOCKQUOTE"].includes(tag) && ["left","center","right"].includes(child.dataset.align)) copy.dataset.align = child.dataset.align;
      if (tag === "TH") copy.setAttribute("scope", "col");
      if (!["BR","IMG","HR"].includes(tag)) cleanNode(child, copy);
      into.append(copy);
    }
  }
  function cleanHtml(html) { const doc = new DOMParser().parseFromString("<div>" + html + "</div>", "text/html"); const out = document.createElement("div"); cleanNode(doc.body.firstElementChild || doc.body, out); return out.innerHTML; }
  function getMeta() {
    const val = (name) => $("[data-field='" + name + "']")?.value?.trim() || "";
    const title = val("title");
    return {title, slug: val("slug") || slugify(title), excerpt: val("excerpt"), author: val("author") || "Blogmoi", date: val("date"), language: val("language") || "vi", categories: val("categories").split(",").map(x=>x.trim()).filter(Boolean), tags: val("tags").split(",").map(x=>x.trim()).filter(Boolean), coverAlt: val("coverAlt"), coverCaption: val("coverCaption"), seoTitle: val("seoTitle"), seoDescription: val("seoDescription"), canonical: val("canonical"), ogImage: val("ogImage")};
  }
  function loadMeta(m = {}) {
    const pairs = {title:m.title,slug:m.slug,excerpt:m.excerpt,author:m.author,date:m.date,language:m.language,categories:(m.categories||[]).join(", "),tags:(m.tags||[]).join(", "),coverAlt:m.cover?.alt,coverCaption:m.cover?.caption,seoTitle:m.seoTitle,seoDescription:m.seoDescription,canonical:m.canonical,ogImage:m.ogImage};
    Object.entries(pairs).forEach(([k,v]) => { const el = $("[data-field='" + k + "']"); if (el && v != null) el.value = v; });
    savedCoverUrl = m.cover?.url || m.coverUrl || "";
    coverData = savedCoverUrl.startsWith("data:") ? {data:savedCoverUrl,name:"cover.webp"} : null;
    showCover(m.cover?.url || "");
  }
  function formSnapshot() {
    const meta=getMeta(); meta.coverUrl=savedCoverUrl;
    return {id:activeDraftId || crypto.randomUUID(),updatedAt:Date.now(),meta,body:cleanHtml(editor.innerHTML),cover:coverData,targetSlug:editSlug,targetSha:editSha};
  }
  async function saveDraft(quiet) {
    try {
      const d = formSnapshot(); activeDraftId = d.id; await draftOp("put", d);
      if (!quiet) setStatus("Đã lưu bản nháp trên thiết bị này.", "ok");
    } catch { setStatus("Không lưu được bản nháp. Hãy kiểm tra dung lượng trình duyệt.", "error"); }
  }
  function queueSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => saveDraft(true), 400); }
  async function restoreDraft(d) {
    if (!d) return;
    activeDraftId = d.id; editSlug=d.targetSlug||""; editSha=d.targetSha||""; loadMeta(d.meta || {}); titleSlugTouched = Boolean(d.meta?.slug && d.meta.slug !== slugify(d.meta?.title || "")); editor.innerHTML = cleanHtml(d.body || "");
    if (d.cover) { coverData=d.cover; savedCoverUrl=d.cover.data || savedCoverUrl; showCover(d.cover.data || savedCoverUrl); }
    loadRepeaters(d.meta || {});
    updateCount(); setStatus("Đã khôi phục bản nháp trên thiết bị này.", "ok");
  }
  function updateCount() { const words = (editor.innerText.trim().match(/\S+/g) || []).length; $("[data-word-count]").textContent = words + (words === 1 ? " từ" : " từ"); }
  async function api(path, options = {}) {
    const response = await fetch(apiRoot + path, { ...options, headers: {"Content-Type":"application/json", ...(options.headers||{})}, cache:"no-store" });
    let data = {}; try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || ("Publisher error " + response.status));
    return data;
  }
  function localPublisherAvailable() { return location.hostname === "127.0.0.1" && location.port === "4173"; }
  async function fillManager() {
    const posts = $("[data-post-list]"), drafts = $("[data-draft-list]");
    posts.innerHTML = ""; drafts.innerHTML = "";
    try {
      if (localPublisherAvailable()) {
        const data = await api("/posts");
        (data.posts || []).forEach((p) => posts.append(makeRow(p.title || p.slug, p.date || "", "Mở", () => openPost(p.slug))));
      } else posts.innerHTML = '<p class="cms-muted">Mở publisher cục bộ để tải bài viết và xuất bản an toàn.</p>';
      const items = (await draftOp("all")).sort((a,b)=>b.updatedAt-a.updatedAt);
      items.forEach((d) => drafts.append(makeRow(d.meta?.title || "Bản nháp chưa đặt tên", new Date(d.updatedAt).toLocaleString(), "Tiếp tục", () => restoreDraft(d))));
    } catch (e) { posts.innerHTML = '<p class="cms-muted">' + esc(e.message) + '</p>'; }
  }
  function makeRow(title, detail, action, fn) { const item=document.createElement("div"); item.className="cms-list-item"; item.innerHTML='<div><strong>'+esc(title)+'</strong><small>'+esc(detail)+'</small></div><button type="button">'+esc(action)+'</button>'; item.querySelector("button").addEventListener("click",fn); return item; }
  async function openPost(slug) {
    try { const d=await api("/posts/"+encodeURIComponent(slug)); editSlug=slug; editSha=d.sha; loadMeta(d.post); titleSlugTouched=true; loadRepeaters(d.post); editor.innerHTML=cleanHtml(d.post.bodyHtml||""); root.querySelector("[data-manager]").hidden=true; root.querySelector("[data-editor]").hidden=false; updateCount(); queueSave(); setStatus("Đang chỉnh sửa bài đã xuất bản. Bản nháp hiện tại vẫn được giữ.", "ok"); }
    catch(e){setStatus(e.message,"error");}
  }
  function newDraft() {
    editSlug=""; editSha=""; activeDraftId=crypto.randomUUID(); coverData=null; savedCoverUrl="";
    root.querySelector("[data-editor]").reset(); editor.innerHTML=""; loadRepeaters({}); $("[data-field=date]").value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16); $("[data-field=author]").value="Blogmoi"; showCover(""); root.querySelector("[data-manager]").hidden=true; root.querySelector("[data-editor]").hidden=false; titleSlugTouched=false; updateCount(); queueSave();
  }
  function showCover(src) { const box=$("[data-cover-preview]"); box.innerHTML=src?'<img alt="" src="'+esc(src)+'">':"Chưa có ảnh"; }
  function selectBlock(tag) { document.execCommand("formatBlock",false,tag); editor.focus(); queueSave(); }
  function insertTable() {
    const rows=Math.max(2,Math.min(20,Number(prompt("Số hàng (bao gồm tiêu đề)", "4"))||4));
    const cols=Math.max(2,Math.min(10,Number(prompt("Số cột", "3"))||3));
    let html="<table><thead><tr>"; for(let c=0;c<cols;c++) html+="<th scope=\"col\">Tiêu đề</th>"; html+="</tr></thead><tbody>";
    for(let r=1;r<rows;r++){html+="<tr>";for(let c=0;c<cols;c++)html+="<td><br></td>";html+="</tr>";} html+="</tbody></table><p><br></p>";
    document.execCommand("insertHTML",false,html); editor.focus(); queueSave();
  }
  function tableAction(action) {
    const table=activeTable; if(!table?.isConnected) return;
    const cell=activeCell?.isConnected&&table.contains(activeCell)?activeCell:table.querySelector("td,th"); const row=cell?.parentElement; const ri=row?Array.from(table.rows).indexOf(row):0; const ci=cell?Array.from(row.cells).indexOf(cell):0;
    if(action==="delete-table"){table.remove();activeTable=null;activeCell=null;$("[data-table-tools]").hidden=true;queueSave();return;}
    if(action==="delete-row"&&table.rows.length>1)table.deleteRow(ri);
    else if(action==="row-above"||action==="row-below"){const nr=table.insertRow(ri+(action==="row-below"?1:0));for(let i=0;i<table.rows[0].cells.length;i++)nr.insertCell().innerHTML="<br>";}
    else if(action==="delete-column"&&table.rows[0].cells.length>1)Array.from(table.rows).forEach(r=>r.deleteCell(ci));
    else if(action==="column-left"||action==="column-right")Array.from(table.rows).forEach(r=>r.insertCell(Math.min(ci+(action==="column-right"?1:0),r.cells.length)).innerHTML="<br>");
    editor.focus();queueSave();
  }
  function dataUrlToPayload(data) { const parts=data.split(","); return {mime:(parts[0].match(/data:([^;]+)/)||[])[1]||"image/jpeg",base64:parts[1]||""}; }
  async function compressImage(file) {
    if(file.type==="image/gif") return file;
    const bitmap=await createImageBitmap(file), scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height)), canvas=document.createElement("canvas");
    canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",.84));
    return blob||file;
  }
  async function fileData(file) { const prepared=await compressImage(file); return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve({data:r.result,name:file.name,mime:prepared.type||file.type});r.onerror=()=>reject(r.error);r.readAsDataURL(prepared);}); }
  function insertImage(data, alt) {
    const fig=document.createElement("figure");fig.dataset.align="center";fig.dataset.width="100";
    const img=document.createElement("img");img.src=data.data;img.alt=alt||"";img.dataset.localImage="true";fig.append(img);
    const caption=document.createElement("figcaption");caption.contentEditable="true";caption.textContent="";fig.append(caption);
    const sel=getSelection();if(sel.rangeCount&&editor.contains(sel.anchorNode)){const range=sel.getRangeAt(0);range.deleteContents();range.insertNode(fig);}else editor.append(fig);
    editor.focus();queueSave();
  }
  async function publish() {
    if(!localPublisherAvailable()){setStatus("Xuất bản an toàn cần publisher cục bộ. Chạy python3 cms_server.py rồi mở http://127.0.0.1:4173/blogmoi/admin/.","error");return;}
    const m=getMeta(); if(!m.title){setStatus("Hãy nhập tiêu đề.","error");$("[data-field=title]").focus();return;}
    if(!(editor.innerText||"").trim()){setStatus("Hãy thêm nội dung bài viết.","error");editor.focus();return;}
    if(!confirm("Xuất bản bài viết lên blogmoi và đẩy commit lên GitHub?"))return;
    const button=$("[data-publish]");button.disabled=true;setStatus("Đang chuẩn bị nội dung và ảnh...");
    try{
      const coverUrl=coverData?.data||savedCoverUrl;
      const post={...m,cover:{url:coverUrl,alt:m.coverAlt,caption:m.coverCaption},bodyHtml:cleanHtml(editor.innerHTML),faq:readRepeater("[data-faq-list]","faq"),sources:readRepeater("[data-source-list]","source"),related:readRepeater("[data-related-list]","related")};
      setStatus("Đang tạo commit và đẩy lên blogco/blogmoi...");
      const result=await api("/posts/"+encodeURIComponent(m.slug),{method:"POST",body:JSON.stringify({post,sha:editSha})});
      await draftOp("delete",activeDraftId);editSlug=m.slug;editSha=result.sha;savedCoverUrl=coverUrl;coverData=null;setStatus("Đã xuất bản và đẩy commit "+result.commit+". GitHub Actions sẽ triển khai trang.","ok");
    }catch(e){setStatus(e.message+" Bản nháp vẫn còn trên thiết bị này.","error");}
    finally{button.disabled=false;}
  }
  function readRepeater(selector,type) { return $$(selector+" .repeat-row").map(row=>{const title=row.querySelector("[data-repeat-title]")?.value.trim()||"";const url=row.querySelector("[data-repeat-url]")?.value.trim()||"";const answer=row.querySelector("[data-repeat-answer]")?.value.trim()||"";const publisher=row.querySelector("[data-repeat-publisher]")?.value.trim()||"";return type==="faq"?{question:title,answer}:type==="source"?{title,url,publisher}:{title,url};}).filter(x=>Object.values(x).some(Boolean)); }
  function loadRepeaters(post) { $("[data-faq-list]").innerHTML="";$("[data-source-list]").innerHTML="";$("[data-related-list]").innerHTML="";(post.faq||[]).forEach(x=>addRepeat("faq",{title:x.question,answer:x.answer}));(post.sources||[]).forEach(x=>addRepeat("source",x));(post.related||[]).forEach(x=>addRepeat("related",x)); }
  function addRepeat(type, item={}) {
    const target=type==="faq"?"[data-faq-list]":type==="source"?"[data-source-list]":"[data-related-list]";
    const row=document.createElement("div");row.className="repeat-row";
    row.innerHTML='<input data-repeat-title placeholder="'+(type==="faq"?"Câu hỏi":"Tiêu đề")+'" value="'+esc(item.title||item.question||"")+'"><input data-repeat-url placeholder="URL (nếu có)" value="'+esc(item.url||"")+'">'+(type==="faq"?'<textarea data-repeat-answer placeholder="Trả lời">'+esc(item.answer||"")+'</textarea>':type==="source"?'<input data-repeat-publisher placeholder="Tác giả / đơn vị" value="'+esc(item.publisher||"")+'">':"")+'<button type="button" aria-label="Xóa dòng">Xóa</button>';
    row.querySelector("button").onclick=()=>{row.remove();queueSave();};$ (target).append(row);row.addEventListener("input",queueSave);
  }
  function suggestFaq() {
    const doc=new DOMParser().parseFromString("<div>"+editor.innerHTML+"</div>","text/html");let count=0;
    for(const h of doc.querySelectorAll("h2,h3")){const next=h.nextElementSibling;if(!next||!next.textContent.trim())continue;addRepeat("faq",{question:"Phần “"+h.textContent.trim()+"” nói về điều gì?",answer:next.textContent.trim()});count++;if(count===5)break;}
    if(!count){const p=doc.querySelector("p");if(p?.textContent.trim())addRepeat("faq",{question:"Ý chính của bài viết là gì?",answer:p.textContent.trim()});}
    setStatus("Đã tạo gợi ý từ nội dung hiện có. Hãy kiểm tra trước khi đăng.","ok");queueSave();
  }
  root.addEventListener("click",async (event)=>{
    const b=event.target.closest("button");if(!b)return;
    if(b.matches("[data-view-manager]")){await saveDraft(true);root.querySelector("[data-editor]").hidden=true;root.querySelector("[data-manager]").hidden=false;await fillManager();}
    if(b.matches("[data-new-post],[data-new-draft]"))newDraft();
    if(b.matches("[data-save-draft]"))saveDraft(false);
    if(b.matches("[data-publish]"))publish();
    if(b.matches("[data-preview]"))preview();
    if(b.matches("[data-suggest-qa]"))suggestFaq();
    if(b.matches("[data-add-faq]"))addRepeat("faq");
    if(b.matches("[data-add-source]"))addRepeat("source");
    if(b.matches("[data-add-related]"))addRepeat("related");
    if(b.matches("[data-link]")){const href=prompt("Địa chỉ liên kết (https://...)");if(href&&safeUrl(href,false)){document.execCommand("createLink",false,href);queueSave();}}
    if(b.matches("[data-table]"))insertTable();
    if(b.matches("[data-image]"))$("[data-image-file]").click();
    const command=b.dataset.command;if(command){if(command==="formatBlock")document.execCommand("formatBlock",false,b.dataset.value);else document.execCommand(command,false,null);editor.focus();queueSave();}
    if(b.dataset.align){const sel=getSelection();let node=sel.anchorNode?.nodeType===1?sel.anchorNode:sel.anchorNode?.parentElement;const block=node?.closest("p,h2,h3,h4,blockquote");if(block){block.dataset.align=b.dataset.align;queueSave();}}
    if(b.dataset.tableAction)tableAction(b.dataset.tableAction);
    if(b.dataset.imageWidth&&activeFigure){activeFigure.dataset.width=b.dataset.imageWidth;queueSave();}
    if(b.matches("[data-image-alt]")&&activeFigure){const img=activeFigure.querySelector("img");const alt=prompt("Mô tả ảnh thay thế",img.alt);if(alt!==null){img.alt=alt;queueSave();}}
    if(b.matches("[data-image-caption]")&&activeFigure){activeFigure.querySelector("figcaption")?.focus(); }
    if(b.matches("[data-image-delete]")&&activeFigure){activeFigure.remove();activeFigure=null;$("[data-image-tools]").hidden=true;queueSave();}
  });
  function preview(){
    const m=getMeta();const html=cleanHtml(editor.innerHTML);const box=$("[data-preview-content]");
    const cover=coverData?.data||savedCoverUrl;box.innerHTML='<article class="preview-page"><p class="cms-kicker">'+esc(m.categories[0]||"Blogmoi")+'</p><h1>'+esc(m.title||"Tiêu đề bài viết")+'</h1><p>'+esc(m.excerpt)+'</p><p class="cms-muted">'+esc(m.author)+" · "+esc(m.date||"Chưa đặt ngày")+'</p>'+(cover?'<figure><img src="'+esc(cover)+'" alt="'+esc(m.coverAlt)+'"><figcaption>'+esc(m.coverCaption)+'</figcaption></figure>':'')+'<div class="prose">'+html+'</div></article>';
    $("[data-preview-dialog]").showModal();
  }
  editor.addEventListener("input",()=>{updateCount();queueSave();});
  editor.addEventListener("click",event=>{activeTable=event.target.closest("table");activeCell=event.target.closest("td,th");activeFigure=event.target.closest("figure");$("[data-table-tools]").hidden=!activeTable;$("[data-image-tools]").hidden=!activeFigure;});
  editor.addEventListener("keyup",updateCount);
  $("[data-format]").addEventListener("change",e=>selectBlock(e.target.value));
  $("[data-image-file]").addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;try{const data=await fileData(file);insertImage(data,prompt("Mô tả ảnh thay thế","")||"");}catch(err){setStatus("Không đọc được ảnh: "+err.message,"error");}e.target.value="";});
  $("[data-cover-file]").addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;try{coverData=await fileData(file);savedCoverUrl="";showCover(coverData.data);queueSave();}catch(err){setStatus("Không đọc được ảnh: "+err.message,"error");}e.target.value="";});
  $("[data-preview-dialog]").addEventListener("click",e=>{if(e.target.matches("[data-preview-dialog]"))e.currentTarget.close();});
  $$("[data-field]").forEach(el=>el.addEventListener("input",()=>{if(el.dataset.field==="title"&&!titleSlugTouched)$("[data-field=slug]").value=slugify(el.value);if(el.dataset.field==="slug")titleSlugTouched=true;queueSave();}));
  if(localPublisherAvailable())$("[data-auth-state]").textContent="Publisher local đã sẵn sàng. Git xác thực trên máy này.";
  else $("[data-auth-state]").textContent="Xuất bản: mở publisher cục bộ tại http://127.0.0.1:4173/blogmoi/admin/.";
  async function init(){try{const all=await draftOp("all");if(all.length){await restoreDraft(all.sort((a,b)=>b.updatedAt-a.updatedAt)[0]);}else newDraft();}catch{newDraft();setStatus("Trình duyệt không hỗ trợ lưu bản nháp bền vững.","error");}}
  init();
})();
