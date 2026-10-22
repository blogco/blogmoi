(() => {
  "use strict";

  const dock = document.querySelector("[data-reading-dock]");
  if (!dock) return;

  const isArticle = dock.dataset.pageType === "article";
  const topButton = dock.querySelector("[data-reading-top]");
  const tocButton = dock.querySelector("[data-reading-toc]");
  const bottomButton = dock.querySelector("[data-reading-bottom]");
  const readingArea = isArticle ? document.querySelector("[data-reading-area]") : null;
  const readingProgress = document.querySelector("[data-reading-progress]");
  const progressFill = document.querySelector("[data-reading-progress-fill]");
  const articleHeading = isArticle ? document.querySelector(".article-hero h1") : null;
  const toc = document.querySelector(".article-sidebar .article-toc-disclosure__content .toc");
  const tocDetails = toc?.closest("details");
  const tocDialog = document.querySelector("[data-reading-toc-dialog]");
  const tocSlot = document.querySelector("[data-reading-toc-slot]");
  const closeTocButton = document.querySelector("[data-reading-toc-close]");
  const compactViewport = window.matchMedia("(max-width: 1199px)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const originalTocParent = toc?.parentNode || null;
  const originalTocNextSibling = toc?.nextSibling || null;

  if (!topButton || !bottomButton) return;

  let areaTop = 0;
  let areaHeight = 0;
  let lastDocumentHeight = getDocumentHeight();
  let bottomNavigationActive = false;
  let animationFrame = 0;
  let progressValue = -1;

  function getScrollTop() {
    return window.scrollY || window.pageYOffset || document.scrollingElement?.scrollTop || 0;
  }

  function getDocumentHeight() {
    const scrollingElement = document.scrollingElement || document.documentElement;
    return Math.max(
      scrollingElement.scrollHeight,
      scrollingElement.offsetHeight,
      document.body?.scrollHeight || 0,
      document.body?.offsetHeight || 0
    );
  }

  function isAtBottom(height = getDocumentHeight()) {
    return getScrollTop() + window.innerHeight >= height - 2;
  }

  function refreshDocumentHeight() {
    const previousHeight = lastDocumentHeight;
    const height = getDocumentHeight();
    if (height === previousHeight) return;

    const wasAtPreviousBottom = isAtBottom(previousHeight);
    lastDocumentHeight = height;
    if (bottomNavigationActive && wasAtPreviousBottom && height > previousHeight) {
      window.scrollTo({ top: height, behavior: "auto" });
    }
  }

  function updateNavigation() {
    const sufficientlyLong = lastDocumentHeight > window.innerHeight + 320;
    dock.hidden = !isArticle && !sufficientlyLong;
    topButton.disabled = getScrollTop() <= 8;
    bottomButton.disabled = isAtBottom(lastDocumentHeight);
  }

  function updateProgress() {
    if (!readingArea || !readingProgress || !progressFill || !areaHeight) return;

    const availableDistance = Math.max(1, areaHeight - window.innerHeight);
    const distanceRead = Math.max(0, getScrollTop() - areaTop);
    const fraction = Math.max(0, Math.min(1, distanceRead / availableDistance));
    const percent = Math.round(fraction * 100);
    progressFill.style.transform = `scaleX(${fraction})`;
    if (percent !== progressValue) {
      progressValue = percent;
      readingProgress.setAttribute("aria-valuenow", String(percent));
      readingProgress.setAttribute("aria-valuetext", `${percent}%`);
    }
  }

  function measureReadingArea() {
    if (!readingArea) return;
    const rect = readingArea.getBoundingClientRect();
    areaTop = rect.top + getScrollTop();
    areaHeight = rect.height;
    if (readingProgress && areaHeight > 0) readingProgress.hidden = false;
    updateProgress();
  }

  function scheduleUpdate() {
    if (animationFrame) return;
    animationFrame = window.requestAnimationFrame(() => {
      animationFrame = 0;
      updateNavigation();
      updateProgress();
    });
  }

  function scrollBehavior() {
    return reducedMotion.matches ? "auto" : "smooth";
  }

  function scrollToTop() {
    bottomNavigationActive = false;
    if (articleHeading) {
      const headingTop = articleHeading.getBoundingClientRect().top + getScrollTop();
      window.scrollTo({ top: Math.max(0, headingTop - 16), behavior: scrollBehavior() });
      articleHeading.focus({ preventScroll: true });
    } else {
      window.scrollTo({ top: 0, behavior: scrollBehavior() });
    }
  }

  function scrollToBottom() {
    bottomNavigationActive = true;
    const height = getDocumentHeight();
    lastDocumentHeight = height;
    window.scrollTo({ top: height, behavior: "auto" });
    scheduleUpdate();
  }

  function restoreToc() {
    if (!toc || !originalTocParent) return;
    if (toc.parentNode !== originalTocParent) {
      const nextSibling = originalTocNextSibling?.parentNode === originalTocParent ? originalTocNextSibling : null;
      originalTocParent.insertBefore(toc, nextSibling);
    }
    if (tocDetails && compactViewport.matches) tocDetails.open = false;
  }

  function closeMobileToc(returnFocus = true) {
    restoreToc();
    if (tocDialog?.open && typeof tocDialog.close === "function") {
      tocDialog.close();
    } else if (tocDialog?.hasAttribute("open")) {
      tocDialog.removeAttribute("open");
    }
    if (returnFocus) tocButton?.focus({ preventScroll: true });
  }

  function openMobileToc() {
    if (!toc || !tocDialog || !tocSlot) return;
    tocSlot.append(toc);
    if (typeof tocDialog.showModal === "function") {
      try {
        tocDialog.showModal();
      } catch {
        tocDialog.setAttribute("open", "");
      }
    } else {
      tocDialog.setAttribute("open", "");
    }
    window.requestAnimationFrame(() => toc.querySelector('a[href^="#"]')?.focus({ preventScroll: true }));
  }

  function focusDesktopToc() {
    if (!toc) return;
    if (tocDetails) tocDetails.open = true;
    const firstLink = toc.querySelector('a[href^="#"]');
    if (firstLink) firstLink.focus({ preventScroll: true });
  }

  function focusHeading(target) {
    if (!target) return;
    if (!target.hasAttribute("tabindex")) {
      target.setAttribute("tabindex", "-1");
      target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
    }
    target.focus({ preventScroll: true });
  }

  function goToTocHeading(event) {
    const link = event.target.closest('a[href^="#"]');
    if (!link || !tocDialog?.open) return;

    let id;
    try { id = decodeURIComponent(link.getAttribute("href").slice(1)); }
    catch { id = link.getAttribute("href").slice(1); }
    const target = document.getElementById(id);
    event.preventDefault();
    closeMobileToc(false);
    if (link.hash) {
      try { history.pushState(null, "", link.hash); }
      catch { /* The heading remains reachable even when history updates are unavailable. */ }
    }
    if (target) {
      target.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
      focusHeading(target);
    }
  }

  function releaseBottomNavigation(event) {
    if (!dock.contains(event.target)) bottomNavigationActive = false;
  }

  topButton.addEventListener("click", scrollToTop);
  bottomButton.addEventListener("click", scrollToBottom);
  tocButton?.addEventListener("click", () => {
    if (!toc) return;
    if (compactViewport.matches) openMobileToc();
    else focusDesktopToc();
  });

  tocButton && (tocButton.hidden = !toc);
  toc?.addEventListener("click", goToTocHeading);
  closeTocButton?.addEventListener("click", () => closeMobileToc());
  tocDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeMobileToc();
  });
  tocDialog?.addEventListener("close", restoreToc);
  tocDialog?.addEventListener("click", (event) => {
    if (event.target === tocDialog) closeMobileToc();
  });
  compactViewport.addEventListener("change", () => {
    if (!compactViewport.matches && tocDialog?.open) closeMobileToc(false);
    scheduleUpdate();
  });

  document.addEventListener("wheel", releaseBottomNavigation, { passive: true, capture: true });
  document.addEventListener("touchstart", releaseBottomNavigation, { passive: true, capture: true });
  document.addEventListener("pointerdown", releaseBottomNavigation, { passive: true, capture: true });
  document.addEventListener("keydown", (event) => {
    if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) releaseBottomNavigation(event);
  }, true);

  window.addEventListener("scroll", scheduleUpdate, { passive: true });
  window.addEventListener("resize", () => {
    refreshDocumentHeight();
    measureReadingArea();
    scheduleUpdate();
  }, { passive: true });
  window.visualViewport?.addEventListener("resize", () => {
    refreshDocumentHeight();
    scheduleUpdate();
  }, { passive: true });
  window.addEventListener("load", () => {
    refreshDocumentHeight();
    measureReadingArea();
    scheduleUpdate();
  }, { once: true });

  if (typeof ResizeObserver === "function") {
    const sizeObserver = new ResizeObserver(() => {
      refreshDocumentHeight();
      measureReadingArea();
      scheduleUpdate();
    });
    sizeObserver.observe(document.documentElement);
    if (document.body) sizeObserver.observe(document.body);
    if (readingArea) sizeObserver.observe(readingArea);
  }

  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      refreshDocumentHeight();
      measureReadingArea();
      scheduleUpdate();
    }).catch(() => {});
  }
  measureReadingArea();
  updateNavigation();
  updateProgress();
})();
