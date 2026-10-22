(() => {
  "use strict";
  const input = document.querySelector("[data-search-input]");
  const results = document.querySelector("[data-search-results]");
  const status = document.querySelector("[data-search-status]");
  if (!input || !results || !status) return;

  let index = [];
  fetch(input.dataset.searchIndex, { credentials: "same-origin" })
    .then((response) => {
      if (!response.ok) throw new Error("index");
      return response.json();
    })
    .then((items) => { index = Array.isArray(items) ? items : []; })
    .catch(() => { status.textContent = "Chưa tải được chỉ mục tìm kiếm. Hãy thử tải lại trang."; });

  function makeCard(item) {
    const article = document.createElement("article");
    article.className = "article-card";
    const link = document.createElement("a");
    link.className = "article-card__link";
    try {
      const url = new URL(item.url, window.location.origin);
      if (url.origin !== window.location.origin || !url.pathname.startsWith("/blogmoi/")) return null;
      link.href = url.href;
    } catch { return null; }

    const body = document.createElement("div");
    body.className = "article-card__body";
    const category = document.createElement("p");
    category.className = "eyebrow";
    category.textContent = item.categories?.[0] || "Bài viết";
    const title = document.createElement("h3");
    title.textContent = item.title || "";
    const description = document.createElement("p");
    description.textContent = item.description || "";
    const meta = document.createElement("div");
    meta.className = "card-meta";
    const time = document.createElement("time");
    time.textContent = item.date || "";
    meta.append(time);
    body.append(category, title, description, meta);
    link.append(body);
    article.append(link);
    return article;
  }

  input.addEventListener("input", () => {
    const query = input.value.trim().toLocaleLowerCase();
    results.replaceChildren();
    if (!query) {
      status.textContent = "Nhập từ khóa để tìm kiếm.";
      return;
    }
    const found = index.filter((item) => [item.title, item.description, ...(item.categories || []), ...(item.tags || [])]
      .join(" ").toLocaleLowerCase().includes(query));
    for (const item of found) {
      const card = makeCard(item);
      if (card) results.append(card);
    }
    const count = results.childElementCount;
    status.textContent = count ? `Tìm thấy ${count} bài viết.` : "Không tìm thấy bài viết phù hợp.";
  });
})();
