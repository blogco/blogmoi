(() => {
  "use strict";

  const root = document.querySelector("[data-dictionary]");
  if (!root) return;

  const form = root.querySelector("[data-search-form]");
  const input = root.querySelector("[data-dictionary-query]");
  const fieldSelect = root.querySelector("[data-dictionary-field]");
  const status = root.querySelector("[data-dictionary-status]");
  const tableBody = root.querySelector("[data-dictionary-rows]");
  const cards = root.querySelector("[data-dictionary-cards]");
  const empty = root.querySelector("[data-dictionary-empty]");
  const noResults = root.querySelector("[data-dictionary-no-results]");
  const pagination = root.querySelector("[data-dictionary-pagination]");
  const resultCount = root.querySelector(".dictionary-result-count");
  const dialog = document.querySelector("[data-dictionary-dialog]");
  const detail = dialog?.querySelector("[data-dictionary-detail]");
  const copyDetail = dialog?.querySelector("[data-detail-copy]");
  const sourceDetail = dialog?.querySelector("[data-detail-source]");
  const pageSize = 10;
  let entries = [];
  let visibleEntries = [];
  let currentPage = 1;
  let searchTimer;
  let returnFocus = null;
  let selectedEntry = null;

  const normalize = (value) => String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLocaleLowerCase("und");

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function entryCopyText(entry) {
    return `VI: ${entry.vi}\nKR: ${entry.ko}\nEN: ${entry.en}`;
  }

  async function copyText(text, button) {
    const original = button.textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Đã sao chép";
    } catch {
      button.textContent = "Không thể sao chép";
    }
    window.setTimeout(() => { button.textContent = original; }, 1500);
  }

  function safeArticleUrl(path) {
    try {
      const url = new URL(path, window.location.origin);
      if (url.origin !== window.location.origin || !url.pathname.startsWith("/blogmoi/")) return "";
      return url.href;
    } catch {
      return "";
    }
  }

  function openDetail(entry, trigger) {
    if (!dialog || !detail) return;
    selectedEntry = entry;
    returnFocus = trigger;
    detail.replaceChildren();
    const groups = [
      ["Tiếng Việt", entry.vi],
      ["Tiếng Hàn", entry.ko],
      ["Tiếng Anh", entry.en],
      ["Lĩnh vực", entry.field],
      ["Ý nghĩa", entry.definition]
    ];
    for (const [label, value] of groups) {
      const block = make("section", "dictionary-detail__group");
      block.append(make("h3", "", label), make("p", "", value));
      detail.append(block);
    }
    const examples = make("section", "dictionary-detail__group dictionary-detail__examples");
    examples.append(make("h3", "", "Ví dụ / cách biểu hiện"));
    for (const [language, label] of [["vi", "VI"], ["ko", "KR"], ["en", "EN"]]) {
      const line = make("p", "dictionary-detail__example");
      line.append(make("b", "", `${label}:`), document.createTextNode(` ${entry.examples[language]}`));
      examples.append(line);
    }
    detail.append(examples);
    if (Array.isArray(entry.relatedExpressions) && entry.relatedExpressions.length) {
      const related = make("section", "dictionary-detail__group");
      related.append(make("h3", "", "Biểu hiện liên quan"));
      const list = make("ul", "dictionary-related");
      for (const expression of entry.relatedExpressions) list.append(make("li", "", expression));
      related.append(list);
      detail.append(related);
    }
    if (entry.sourceContext) {
      const context = make("section", "dictionary-detail__group");
      context.append(make("h3", "", "Ngữ cảnh nguồn"), make("p", "", entry.sourceContext));
      detail.append(context);
    }
    const articleUrl = safeArticleUrl(entry.sourceArticle);
    sourceDetail.href = articleUrl || "#";
    sourceDetail.hidden = !articleUrl;
    copyDetail.textContent = "Sao chép ba ngôn ngữ";
    dialog.showModal();
  }

  function openButton(entry, label = "Xem chi tiết") {
    const button = make("button", "dictionary-detail-button", label);
    button.type = "button";
    button.addEventListener("click", () => openDetail(entry, button));
    return button;
  }

  function tableRow(entry, number) {
    const row = document.createElement("tr");
    const indexCell = make("td", "dictionary-number", String(number));
    const viCell = document.createElement("td");
    viCell.append(openButton(entry, entry.vi));
    const koCell = make("td", "dictionary-korean", entry.ko);
    const enCell = make("td", "dictionary-english", entry.en);
    const exampleCell = make("td", "dictionary-example", entry.examples.vi);
    const fieldCell = make("td");
    fieldCell.append(make("span", "dictionary-chip", entry.field));
    const actionCell = document.createElement("td");
    const copy = make("button", "dictionary-copy", "Sao chép");
    copy.type = "button";
    copy.setAttribute("aria-label", `Sao chép ${entry.vi}, ${entry.ko}, ${entry.en}`);
    copy.addEventListener("click", () => copyText(entryCopyText(entry), copy));
    actionCell.append(copy);
    row.append(indexCell, viCell, koCell, enCell, exampleCell, fieldCell, actionCell);
    return row;
  }

  function vocabularyCard(entry, number) {
    const card = make("article", "dictionary-card");
    card.append(make("span", "dictionary-card__number", `#${number}`));
    const heading = make("div", "dictionary-card__heading");
    heading.append(openButton(entry, entry.vi), make("span", "dictionary-chip", entry.field));
    card.append(heading);
    card.append(make("p", "dictionary-card__ko", entry.ko), make("p", "dictionary-card__en", entry.en));
    card.append(make("p", "dictionary-card__example", entry.examples.vi));
    const actions = make("div", "dictionary-card__actions");
    const copy = make("button", "dictionary-action", "Sao chép");
    copy.type = "button";
    copy.setAttribute("aria-label", `Sao chép ${entry.vi}, ${entry.ko}, ${entry.en}`);
    copy.addEventListener("click", () => copyText(entryCopyText(entry), copy));
    actions.append(copy, openButton(entry));
    card.append(actions);
    return card;
  }

  function paginationButton(label, page, disabled = false, current = false) {
    const button = make("button", current ? "is-current" : "", label);
    button.type = "button";
    button.disabled = disabled;
    if (current) button.setAttribute("aria-current", "page");
    button.addEventListener("click", () => {
      currentPage = page;
      render();
    });
    return button;
  }

  function renderPagination(totalPages) {
    pagination.replaceChildren();
    if (totalPages <= 1) return;
    pagination.append(paginationButton("Trước", Math.max(1, currentPage - 1), currentPage === 1));
    const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
    let previous = 0;
    for (const page of [...pages].filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b)) {
      if (previous && page - previous > 1) pagination.append(make("span", "dictionary-pagination__ellipsis", "…"));
      pagination.append(paginationButton(String(page), page, false, page === currentPage));
      previous = page;
    }
    pagination.append(paginationButton("Tiếp", Math.min(totalPages, currentPage + 1), currentPage === totalPages));
  }

  function render() {
    const query = normalize(input.value.trim());
    const field = fieldSelect.value;
    visibleEntries = entries.filter((entry) => {
      if (field && entry.field !== field) return false;
      if (!query) return true;
      const text = normalize([
        entry.vi, entry.ko, entry.en, entry.definition,
        entry.examples.vi, entry.examples.ko, entry.examples.en,
        ...(entry.relatedExpressions || []), entry.field
      ].join(" "));
      return text.includes(query);
    });
    const totalPages = Math.max(1, Math.ceil(visibleEntries.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * pageSize;
    const pageEntries = visibleEntries.slice(start, start + pageSize);
    tableBody.replaceChildren(...pageEntries.map((entry, index) => tableRow(entry, start + index + 1)));
    cards.replaceChildren(...pageEntries.map((entry, index) => vocabularyCard(entry, start + index + 1)));
    const isEmpty = entries.length === 0;
    empty.hidden = !isEmpty;
    noResults.hidden = isEmpty || visibleEntries.length > 0;
    root.querySelector("[data-table-wrap]").hidden = isEmpty || visibleEntries.length === 0;
    cards.hidden = isEmpty || visibleEntries.length === 0;
    resultCount.textContent = `${visibleEntries.length} ${visibleEntries.length === 1 ? "mục từ" : "mục từ"}`;
    status.textContent = isEmpty
      ? "Từ điển hiện chưa có mục từ được biên tập và duyệt."
      : `Có ${visibleEntries.length} mục từ phù hợp${query ? ` với “${input.value.trim()}”` : ""}.`;
    renderPagination(totalPages);
  }

  fieldSelect.addEventListener("change", () => {
    currentPage = 1;
    render();
  });
  input.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      currentPage = 1;
      render();
    }, 140);
  });
  form.addEventListener("submit", (event) => event.preventDefault());
  dialog?.querySelector("[data-dialog-close]")?.addEventListener("click", () => dialog.close());
  dialog?.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog?.addEventListener("close", () => {
    if (returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  });
  copyDetail?.addEventListener("click", () => {
    if (selectedEntry) copyText(entryCopyText(selectedEntry), copyDetail);
  });

  fetch(root.dataset.indexUrl, { credentials: "same-origin", cache: "force-cache" })
    .then((response) => {
      if (!response.ok) throw new Error("index unavailable");
      return response.json();
    })
    .then((data) => {
      entries = Array.isArray(data) ? data.filter((entry) => entry && entry.id && entry.vi && entry.ko && entry.en && entry.field && entry.definition && entry.examples?.vi && entry.examples?.ko && entry.examples?.en) : [];
      render();
    })
    .catch(() => {
      status.textContent = "Chưa tải được chỉ mục từ vựng. Hãy thử tải lại trang.";
      root.querySelector("[data-table-wrap]").hidden = true;
      cards.hidden = true;
      empty.hidden = true;
      noResults.hidden = false;
      noResults.querySelector("h2").textContent = "Không tải được từ điển";
      noResults.querySelector("p").textContent = "Kiểm tra kết nối rồi thử tải lại trang.";
    });
})();
