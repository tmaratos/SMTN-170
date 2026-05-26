/**
 * Global Steward launcher — available before steward-ui.js finishes loading.
 */
(function initStewardLauncher(global) {
  function waitForSteward(maxMs) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        if (global.SMTN170Steward?.openSteward) {
          resolve(global.SMTN170Steward);
          return;
        }
        if (Date.now() - start > (maxMs || 10000)) {
          reject(new Error("Steward UI did not load"));
          return;
        }
        setTimeout(tick, 40);
      };
      tick();
    });
  }

  global.openSteward = async function openSteward(promptText = "") {
    try {
      const steward = await waitForSteward();
      return steward.openSteward(promptText);
    } catch (err) {
      console.error("[openSteward]", err);
      const root = document.getElementById("stewardRoot");
      if (root) {
        root.insertAdjacentHTML(
          "beforeend",
          `<p class="steward-inline-error" role="alert">Steward is unavailable right now: ${
            err?.message ? String(err.message) : "Please try again later."
          }</p>`
        );
      }
    }
  };
})(window);
