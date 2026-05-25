/**
 * Global Steward launcher — available before steward.js finishes loading.
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
          reject(new Error("Steward is still loading. Refresh the page and try again."));
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
      alert(err.message || "Could not open Steward.");
    }
  };
})(window);
