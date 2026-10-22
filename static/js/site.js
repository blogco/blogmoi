(() => {
  const nav = document.querySelector("#primary-nav");
  const toggle = document.querySelector(".menu-toggle");
  toggle?.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    nav?.classList.toggle("is-open", open);
  });
  document.addEventListener("click", (event) => {
    if (!nav?.contains(event.target) && !toggle?.contains(event.target)) {
      nav.classList.remove("is-open");
      toggle?.setAttribute("aria-expanded", "false");
    }
  });
  const page = document.documentElement;
  let saved = "";
  try { saved = localStorage.getItem("blogmoi-theme") || ""; } catch {}
  if (saved === "dark" || saved === "light") page.dataset.theme = saved;
  else if (matchMedia("(prefers-color-scheme: dark)").matches) page.dataset.theme = "dark";
  document.querySelector(".theme-toggle")?.addEventListener("click", () => {
    page.dataset.theme = page.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("blogmoi-theme", page.dataset.theme); } catch {}
  });
})();
