/**
 * Complete Your Profile banner — shown when first/last name missing.
 */
(function initProfileBanner(global) {
  const BANNER_ID = "profileCompleteBanner";

  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  function shouldShow() {
    const row = global.SMTN170Auth?.getProfile?.();
    if (!row || !global.SMTN170Auth?.isApproved?.()) return false;
    return global.SMTN170Profile?.isProfileIncomplete?.(row);
  }

  function renderBanner() {
    let el = document.getElementById(BANNER_ID);
    if (!shouldShow()) {
      el?.remove();
      return;
    }

    const html = `
      <aside id="${BANNER_ID}" class="profile-complete-banner card-warning" role="region" aria-labelledby="profileCompleteTitle">
        <div class="profile-complete-inner">
          <h2 id="profileCompleteTitle">Complete your profile</h2>
          <p>Please add your name so the squadron portal can greet you correctly and show the right information on shared records.</p>
          <a href="profile.html" class="btn-gold btn-lg">Complete your profile</a>
          <button type="button" class="ghost-btn btn-lg profile-complete-dismiss" id="profileCompleteDismiss">Remind me later</button>
        </div>
      </aside>`;

    if (el) {
      el.outerHTML = html;
    } else {
      const main = document.querySelector(".portal-main");
      const content = main?.querySelector(".portal-content");
      if (content) {
        content.insertAdjacentHTML("afterbegin", html);
      } else if (main) {
        main.insertAdjacentHTML("afterbegin", html);
      }
    }

    document.getElementById("profileCompleteDismiss")?.addEventListener("click", () => {
      try {
        sessionStorage.setItem("smtn170_profile_banner_dismissed", "1");
      } catch {
        /* ignore */
      }
      document.getElementById(BANNER_ID)?.remove();
    });
  }

  function refresh() {
    const path = (global.location.pathname || "").split("/").pop();
    if (!shouldShow()) {
      document.getElementById(BANNER_ID)?.remove();
      return;
    }
    if (path === "profile.html") {
      renderBanner();
      return;
    }
    try {
      if (sessionStorage.getItem("smtn170_profile_banner_dismissed") === "1") return;
    } catch {
      /* ignore */
    }
    renderBanner();
  }

  function init() {
    refresh();
    global.addEventListener("smtn170:auth-changed", refresh);
    global.addEventListener("smtn170:profile-updated", refresh);
  }

  global.SMTN170ProfileBanner = { refresh, init };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
