(() => {
  const input = document.querySelector("[data-search-input]");
  const results = document.querySelector("[data-search-results]");
  const status = document.querySelector("[data-search-status]");
  if (!input || !results) return;
  let index = [];
  fetch(new URL("../search-index.json", location.href)).then(r => {
    if (!r.ok) throw new Error("index");
    return r.json();
  }).then(data => { index = Array.isArray(data) ? data : []; }).catch(() => {
    status.textContent = "Chưa tải được chỉ mục. Hãy thử tải lại trang.";
  });
  input.addEventListener("input", () => {
    const q = input.value.trim().toLocaleLowerCase();
    results.replaceChildren();
    if (!q) { status.textContent = "Nhập từ khóa để tìm kiếm."; return; }
    const found = index.filter(item => [item.title,item.description,...(item.categories||[]),...(item.tags||[])].join(" ").toLocaleLowerCase().includes(q));
    status.textContent = found.length ? "Tìm thấy " + found.length + " bài viết." : "Không tìm thấy bài viết phù hợp.";
    for (const item of found) {
      const article = document.createElement("article");
      article.className = "article-card";
      const link=document.createElement("a");link.className="article-card__link";
      try { const url=new URL(item.url,location.href);if(url.protocol!=="https:"&&url.origin!==location.origin)continue;link.href=url.href; } catch { continue; }
      const body=document.createElement("div");body.className="article-card__body";
      const category=document.createElement("p");category.className="eyebrow";category.textContent=item.categories?.[0]||"Bài viết";
      const title=document.createElement("h3");title.textContent=item.title||"";
      const description=document.createElement("p");description.textContent=item.description||"";
      const meta=document.createElement("div");meta.className="card-meta";
      const time=document.createElement("time");time.textContent=item.date||"";
      meta.append(time);body.append(category,title,description,meta);link.append(body);article.append(link);
      results.append(article);
    }
  });
})();
