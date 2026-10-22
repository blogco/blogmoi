(() => {
  "use strict";

  const root = document.documentElement;
  const nav = document.querySelector("[data-nav]");
  const menu = document.querySelector("[data-menu-toggle]");
  const theme = document.querySelector("[data-theme-toggle]");
  const desktop = window.matchMedia("(min-width: 961px)");
  const responsiveToc = document.querySelector("[data-responsive-toc]");
  const compactToc = window.matchMedia("(max-width: 1199px)");

  function setTocDisclosure() {
    if (!responsiveToc) return;
    if (compactToc.matches) responsiveToc.removeAttribute("open");
    else responsiveToc.setAttribute("open", "");
  }

  setTocDisclosure();
  compactToc.addEventListener("change", setTocDisclosure);

  function setMenu(open) {
    if (!nav || !menu) return;
    if (desktop.matches) {
      nav.hidden = false;
      menu.setAttribute("aria-expanded", "false");
      return;
    }
    nav.hidden = !open;
    menu.setAttribute("aria-expanded", String(open));
    menu.setAttribute("aria-label", open ? "Đóng điều hướng" : "Mở điều hướng");
  }

  if (desktop.matches && nav) nav.hidden = false;
  menu?.addEventListener("click", () => setMenu(menu.getAttribute("aria-expanded") !== "true"));
  nav?.addEventListener("click", (event) => {
    if (event.target.closest("a")) setMenu(false);
  });
  document.addEventListener("click", (event) => {
    if (!nav?.contains(event.target) && !menu?.contains(event.target)) setMenu(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setMenu(false);
      menu?.focus();
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      const input = document.querySelector("[data-search-input]");
      if (input) {
        event.preventDefault();
        input.focus();
      }
    }
  });
  desktop.addEventListener("change", () => setMenu(false));

  const preference = (() => {
    try { return localStorage.getItem("blogmoi-theme") || ""; } catch { return ""; }
  })();
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = preference === "dark" || preference === "light" ? preference : systemDark ? "dark" : "light";

  function labelThemeButton() {
    theme?.setAttribute("aria-label", root.dataset.theme === "dark" ? "Bật giao diện sáng" : "Bật giao diện tối");
  }
  labelThemeButton();
  theme?.addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("blogmoi-theme", root.dataset.theme); } catch { /* Preference remains for this page view. */ }
    labelThemeButton();
  });
})();
