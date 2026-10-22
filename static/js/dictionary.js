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
  const articleSelect = root.querySelector("[data-article-select]");
  const articleMeta = root.querySelector("[data-article-meta]");
  const candidateList = root.querySelector("[data-candidate-list]");
  const candidateStatus = root.querySelector("[data-candidate-status]");
  const translationRows = root.querySelector("[data-translation-rows]");
  const importMeta = root.querySelector("[data-import-meta]");
  const bulkFields = root.querySelector("[data-bulk-fields]");
  const bulkStatus = root.querySelector("[data-bulk-status]");
  const applyBulk = root.querySelector("[data-apply-bulk]");
  const githubToken = root.querySelector("[data-github-token]");
  const submitTranslations = root.querySelector("[data-submit-translations]");
  const importStatus = root.querySelector("[data-import-status]");
  const workflowLink = root.querySelector("[data-workflow-link]");
  const pageSize = 10;
  let entries = [];
  let visibleEntries = [];
  let currentPage = 1;
  let searchTimer;
  let returnFocus = null;
  let selectedEntry = null;
  let candidates = [];
  let articleGroups = new Map();
  let selectedArticleId = "";
  const selectedCandidateIds = new Set();
  const translationDrafts = new Map();
  const languageLabels = { vi: "Tiếng Việt", ko: "Tiếng Hàn", en: "Tiếng Anh" };

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

  function entryExample(entry) {
    const examples = entry.examples || {};
    return examples[entry.sourceLanguage] || entry.sourceContext || examples.vi || examples.ko || examples.en || "";
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
      ...(entry.definition ? [["Ý nghĩa", entry.definition]] : [])
    ];
    for (const [label, value] of groups) {
      const block = make("section", "dictionary-detail__group");
      block.append(make("h3", "", label), make("p", "", value));
      detail.append(block);
    }
    const examples = make("section", "dictionary-detail__group dictionary-detail__examples");
    examples.append(make("h3", "", "Ví dụ / cách biểu hiện"));
    for (const [language, label] of [["vi", "VI"], ["ko", "KR"], ["en", "EN"]]) {
      if (!entry.examples?.[language]) continue;
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
    const exampleCell = make("td", "dictionary-example", entryExample(entry));
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
    card.append(make("p", "dictionary-card__example", entryExample(entry)));
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

  function selectedCandidates() {
    return (articleGroups.get(selectedArticleId) || []).filter((candidate) => selectedCandidateIds.has(candidate.id));
  }

  function candidateUrl(candidate) {
    return safeArticleUrl(`/blogmoi${candidate.contentId}`);
  }

  function updateCandidateMeta() {
    const group = articleGroups.get(selectedArticleId) || [];
    articleMeta.replaceChildren();
    if (!group.length) {
      articleMeta.textContent = candidates.length ? "Chọn một bài viết để xem từ trích xuất." : "Chưa có từ trích xuất trong hàng chờ.";
      return;
    }
    const first = group[0];
    const sourceLink = candidateUrl(first);
    articleMeta.append(document.createTextNode(`Content ID: ${first.contentId} · ${languageLabels[first.sourceLanguage]} · ${group.length} mục `));
    if (sourceLink) {
      const link = make("a", "", "Mở bài gốc ↗");
      link.href = sourceLink;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      articleMeta.append(link);
    }
  }

  function renderArticleOptions() {
    articleGroups = new Map();
    for (const candidate of candidates) {
      if (!articleGroups.has(candidate.articleId)) articleGroups.set(candidate.articleId, []);
      articleGroups.get(candidate.articleId).push(candidate);
    }
    const current = selectedArticleId;
    articleSelect.replaceChildren();
    const placeholder = make("option", "", candidates.length ? "Chọn bài viết" : "Chưa có từ cần dịch");
    placeholder.value = "";
    articleSelect.append(placeholder);
    for (const [articleId, group] of articleGroups) {
      const first = group[0];
      const option = make("option", "", `${first.contentId} · ${languageLabels[first.sourceLanguage]} · ${group.length} từ`);
      option.value = articleId;
      articleSelect.append(option);
    }
    selectedArticleId = articleGroups.has(current) ? current : articleGroups.keys().next().value || "";
    articleSelect.value = selectedArticleId;
    updateCandidateMeta();
    renderCandidateList();
    renderBulkFields();
    renderTranslationRows();
  }

  function renderCandidateList() {
    const group = articleGroups.get(selectedArticleId) || [];
    candidateList.replaceChildren();
    if (!group.length) {
      candidateList.append(make("p", "dictionary-topic-empty", "Chọn bài viết để xem các từ và ngữ cảnh được trích xuất."));
      candidateStatus.textContent = candidates.length ? "Chưa chọn bài viết." : "Chưa có mục chờ dịch.";
      return;
    }
    for (const candidate of group) {
      const item = make("article", "dictionary-candidate");
      const label = make("label", "dictionary-candidate__term");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selectedCandidateIds.has(candidate.id);
      checkbox.setAttribute("aria-label", `Chọn ${candidate.term} để dịch`);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selectedCandidateIds.add(candidate.id);
        else selectedCandidateIds.delete(candidate.id);
        renderTranslationRows();
        renderBulkFields();
        updateImportButton();
        candidateStatus.textContent = `${selectedCandidates().length} / ${group.length} mục được chọn để dịch.`;
      });
      label.append(checkbox, make("strong", "", candidate.term), make("span", "dictionary-chip", candidate.sourceLanguage.toUpperCase()));
      item.append(label);
      if (candidate.sourceContext) item.append(make("p", "dictionary-candidate__context", candidate.sourceContext));
      candidateList.append(item);
    }
    candidateStatus.textContent = `${selectedCandidates().length} / ${group.length} mục được chọn để dịch.`;
  }

  function renderBulkFields() {
    const selected = selectedCandidates();
    bulkFields.replaceChildren();
    applyBulk.disabled = selected.length === 0;
    if (!selected.length) return;
    const sourceLanguage = selected[0].sourceLanguage;
    const sourceNote = make("p", "dictionary-paste-hint", `Cột ${sourceLanguage.toUpperCase()} đã có từ gốc. Dán mỗi bản dịch thành một dòng theo đúng thứ tự ${selected.length} mục đã chọn.`);
    bulkFields.append(sourceNote);
    for (const language of ["vi", "ko", "en"].filter((code) => code !== sourceLanguage)) {
      const label = make("label", "dictionary-field-label", `Bản dịch ${languageLabels[language]} · ${selected.length} dòng`);
      const textarea = document.createElement("textarea");
      textarea.rows = Math.min(7, Math.max(3, selected.length));
      textarea.dataset.bulkLanguage = language;
      textarea.setAttribute("aria-label", `Dán bản dịch ${languageLabels[language]}, mỗi dòng ứng với một mục đã chọn`);
      textarea.placeholder = selected.map((_, index) => `Bản dịch ${index + 1}`).join("\n");
      textarea.addEventListener("input", () => { bulkStatus.textContent = ""; });
      label.append(textarea);
      bulkFields.append(label);
    }
  }

  function ensureDraft(candidate) {
    if (translationDrafts.has(candidate.id)) return translationDrafts.get(candidate.id);
    const translations = { vi: "", ko: "", en: "" };
    translations[candidate.sourceLanguage] = candidate.term;
    const draft = { translations, verified: false };
    translationDrafts.set(candidate.id, draft);
    return draft;
  }

  function renderTranslationRows() {
    const selected = selectedCandidates();
    translationRows.replaceChildren();
    if (!selected.length) {
      importMeta.textContent = "Chọn từ ở bước 01 để bắt đầu.";
      return;
    }
    const first = selected[0];
    importMeta.textContent = `Content ID: ${first.contentId} · Ngôn ngữ nguồn: ${languageLabels[first.sourceLanguage]} · ${selected.length} mục. Các mục có dấu ✓ sẽ được gửi đi.`;
    for (const candidate of selected) {
      const draft = ensureDraft(candidate);
      const row = document.createElement("tr");
      const termCell = document.createElement("th");
      termCell.scope = "row";
      termCell.append(make("strong", "", candidate.term));
      if (candidate.sourceContext) termCell.append(make("small", "", candidate.sourceContext));
      row.append(termCell);
      for (const language of ["vi", "ko", "en"]) {
        const cell = document.createElement("td");
        const field = document.createElement("input");
        field.type = "text";
        field.value = draft.translations[language];
        field.maxLength = 120;
        field.required = true;
        field.readOnly = language === candidate.sourceLanguage;
        field.setAttribute("aria-label", `${languageLabels[language]} cho ${candidate.term}`);
        field.addEventListener("input", () => {
          draft.translations[language] = field.value.trim();
          updateImportButton();
        });
        cell.append(field);
        row.append(cell);
      }
      const verifiedCell = document.createElement("td");
      const verified = document.createElement("input");
      verified.type = "checkbox";
      verified.checked = draft.verified;
      verified.setAttribute("aria-label", `Xác nhận bản dịch cho ${candidate.term}`);
      verified.addEventListener("change", () => {
        draft.verified = verified.checked;
        updateImportButton();
      });
      verifiedCell.append(verified);
      row.append(verifiedCell);
      translationRows.append(row);
    }
  }

  function updateImportButton() {
    const selected = selectedCandidates();
    const translationsReady = selected.length > 0 && selected.every((candidate) => {
      const draft = ensureDraft(candidate);
      return draft.verified && ["vi", "ko", "en"].every((language) => draft.translations[language].trim());
    });
    submitTranslations.disabled = !translationsReady || !githubToken.value.trim();
  }

  function applyBulkTranslations() {
    const selected = selectedCandidates();
    if (!selected.length) return;
    const fields = [...bulkFields.querySelectorAll("[data-bulk-language]")];
    const parsed = [];
    for (const field of fields) {
      const language = field.dataset.bulkLanguage;
      const lines = field.value.replace(/\r/g, "").split("\n");
      if (lines.at(-1) === "") lines.pop();
      if (lines.length !== selected.length || lines.some((line) => !line.trim())) {
        bulkStatus.textContent = `${languageLabels[language]}: cần đúng ${selected.length} dòng dịch, mỗi dòng ứng với một mục đã chọn.`;
        return;
      }
      parsed.push({ language, lines });
    }
    for (let index = 0; index < selected.length; index += 1) {
      const draft = ensureDraft(selected[index]);
      for (const { language, lines } of parsed) draft.translations[language] = lines[index].trim();
    }
    renderTranslationRows();
    updateImportButton();
    bulkStatus.textContent = `Đã áp dụng bản dịch cho ${selected.length} mục. Hãy kiểm tra và xác nhận từng dòng.`;
  }

  async function submitManualTranslations() {
    const selected = selectedCandidates();
    if (!selected.length) return;
    const items = selected.map((candidate) => {
      const draft = ensureDraft(candidate);
      return {
        id: candidate.id,
        verified: draft.verified,
        translations: draft.translations,
        examples: {},
        definition: ""
      };
    });
    if (items.some((item) => !item.verified || ["vi", "ko", "en"].some((language) => !item.translations[language].trim()))) {
      importStatus.textContent = "Hoàn tất đủ ba ngôn ngữ và xác nhận từng mục trước khi lưu.";
      return;
    }
    const first = selected[0];
    const payload = {
      contentId: first.contentId,
      articleId: first.articleId,
      sourceLanguage: first.sourceLanguage,
      articleHash: first.articleHash,
      items
    };
    const serialized = JSON.stringify(payload);
    if (new TextEncoder().encode(serialized).length > 60_000) {
      importStatus.textContent = "Nhóm này quá lớn cho một lần gửi. Hãy chọn ít mục hơn rồi thử lại.";
      return;
    }
    const token = githubToken.value.trim();
    if (!token) {
      importStatus.textContent = "Nhập GitHub fine-grained token để mở workflow lưu dữ liệu.";
      return;
    }
    submitTranslations.disabled = true;
    importStatus.textContent = "Đang gửi bản dịch tới GitHub Actions…";
    workflowLink.hidden = true;
    githubToken.value = "";
    try {
      const response = await fetch(root.dataset.dispatchUrl, {
        method: "POST",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "x-github-api-version": "2022-11-28"
        },
        body: JSON.stringify({ ref: "main", inputs: { dictionary_payload: serialized } }),
        credentials: "omit"
      });
      if (!response.ok) {
        importStatus.textContent = response.status === 401
          ? "GitHub từ chối token. Kiểm tra token còn hạn và được chọn đúng repository."
          : response.status === 403
            ? "Token cần quyền Actions: Read and write; tổ chức có thể yêu cầu duyệt token."
            : "GitHub chưa nhận được yêu cầu. Kiểm tra quyền token hoặc thử lại sau.";
        updateImportButton();
        return;
      }
      importStatus.textContent = "Đã gửi yêu cầu lưu. Workflow sẽ xác minh bản dịch, ghi JSON, build và deploy website.";
      workflowLink.hidden = false;
    } catch {
      importStatus.textContent = "Không kết nối được GitHub. Dữ liệu còn trên trang; kiểm tra mạng rồi gửi lại.";
      updateImportButton();
    }
  }

  function initializeWorkbench(data) {
    candidates = Array.isArray(data) ? data.filter((candidate) => candidate?.id && candidate.articleId && candidate.contentId && candidate.term && languageLabels[candidate.sourceLanguage]) : [];
    candidateStatus.textContent = `${candidates.length} từ/cụm từ đang chờ bản dịch thủ công.`;
    renderArticleOptions();
  }

  root.querySelector("[data-candidates-select]").addEventListener("click", () => {
    for (const candidate of articleGroups.get(selectedArticleId) || []) selectedCandidateIds.add(candidate.id);
    renderCandidateList();
    renderBulkFields();
    renderTranslationRows();
    updateImportButton();
  });
  root.querySelector("[data-candidates-clear]").addEventListener("click", () => {
    for (const candidate of articleGroups.get(selectedArticleId) || []) selectedCandidateIds.delete(candidate.id);
    renderCandidateList();
    renderBulkFields();
    renderTranslationRows();
    updateImportButton();
  });
  root.querySelector("[data-candidates-copy]").addEventListener("click", (event) => {
    const button = event.currentTarget;
    const terms = selectedCandidates().map((candidate) => candidate.term).join("\n");
    if (terms) copyText(terms, button);
    else {
      const original = button.textContent;
      button.textContent = "Chọn từ trước";
      window.setTimeout(() => { button.textContent = original; }, 1400);
    }
  });
  articleSelect.addEventListener("change", () => {
    selectedArticleId = articleSelect.value;
    for (const candidate of candidates) selectedCandidateIds.delete(candidate.id);
    updateCandidateMeta();
    renderCandidateList();
    renderBulkFields();
    renderTranslationRows();
    updateImportButton();
  });
  applyBulk.addEventListener("click", applyBulkTranslations);
  githubToken.addEventListener("input", updateImportButton);
  submitTranslations.addEventListener("click", submitManualTranslations);

  function render() {
    const query = normalize(input.value.trim());
    const field = fieldSelect.value;
    visibleEntries = entries.filter((entry) => {
      if (field && entry.field !== field) return false;
      if (!query) return true;
      const text = normalize([
        entry.vi, entry.ko, entry.en, entry.definition,
        entry.examples?.vi, entry.examples?.ko, entry.examples?.en, entry.sourceContext,
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
      ? "Từ điển hiện chưa có mục từ được xuất bản."
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

  fetch(root.dataset.candidatesUrl, { credentials: "same-origin", cache: "no-cache" })
    .then((response) => {
      if (!response.ok) throw new Error("candidate list unavailable");
      return response.json();
    })
    .then(initializeWorkbench)
    .catch(() => {
      candidateStatus.textContent = "Chưa tải được danh sách trích xuất. Hãy thử tải lại trang.";
      articleSelect.disabled = true;
    });

  fetch(root.dataset.indexUrl, { credentials: "same-origin", cache: "force-cache" })
    .then((response) => {
      if (!response.ok) throw new Error("index unavailable");
      return response.json();
    })
    .then((data) => {
      entries = Array.isArray(data) ? data.filter((entry) => entry && entry.id && entry.vi && entry.ko && entry.en && entry.field && (entry.sourceContext || entry.examples?.vi || entry.examples?.ko || entry.examples?.en)) : [];
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
