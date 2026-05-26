/**
 * Global Steward launcher — thin stub; loads full Steward bundle only on first open.
 */
(function initStewardLauncher(global) {
  const STEWARD_SCRIPTS = [
    "./js/steward-client.js?v=8",
    "./js/steward-site-index.js?v=2",
    "./js/steward-ui.js?v=8",
  ];

  let loadPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const base = src.split("?")[0];
      if (document.querySelector(`script[src^="${base}"]`)) {
        resolve();
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.body.appendChild(s);
    });
  }

  async function loadStewardBundle() {
    if (global.SMTN170Steward?.openSteward) return global.SMTN170Steward;
    if (!loadPromise) {
      loadPromise = (async () => {
        for (const src of STEWARD_SCRIPTS) {
          await loadScript(src);
        }
        if (!global.SMTN170Steward?.openSteward) {
          throw new Error("Steward UI did not load");
        }
        return global.SMTN170Steward;
      })().catch((err) => {
        loadPromise = null;
        throw err;
      });
    }
    return loadPromise;
  }

  function injectFab() {
    if (document.getElementById("stewardFab")) return;

    const fab = document.createElement("button");
    fab.type = "button";
    fab.className = "steward-fab steward-fab--secondary";
    fab.id = "stewardFab";
    fab.setAttribute("aria-expanded", "false");
    fab.setAttribute("aria-controls", "stewardPanel");
    fab.setAttribute("aria-label", "Open Steward for CAP");
    fab.innerHTML =
      '<span class="steward-fab-icon" aria-hidden="true">S</span><span class="steward-fab-label">Steward</span>';
    fab.addEventListener("click", (e) => {
      e.preventDefault();
      const panel = document.getElementById("stewardPanel");
      if (panel?.classList.contains("open") && global.SMTN170Steward?.closePanel) {
        global.SMTN170Steward.closePanel();
        return;
      }
      openSteward();
    });
    document.body.appendChild(fab);
  }

  function bindOpenTriggers() {
    document.querySelectorAll("[data-steward-open]").forEach((el) => {
      if (el.dataset.stewardBound === "1") return;
      el.dataset.stewardBound = "1";
      el.addEventListener("click", (e) => {
        e.preventDefault();
        openSteward();
      });
    });
  }

  function rebind() {
    bindOpenTriggers();
  }

  async function openSteward(promptText = "") {
    try {
      const steward = await loadStewardBundle();
      return steward.openSteward(promptText);
    } catch (err) {
      console.error("[openSteward]", err);
      const panel = document.getElementById("stewardPanelRoot");
      if (panel) {
        panel.insertAdjacentHTML(
          "beforeend",
          `<p class="steward-inline-error" role="alert">Steward is unavailable right now: ${
            err?.message ? String(err.message) : "Please try again later."
          }</p>`
        );
      }
    }
  }

  global.openSteward = openSteward;
  global.SMTN170StewardLauncher = { openSteward, rebind, injectFab };

  function boot() {
    injectFab();
    bindOpenTriggers();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
