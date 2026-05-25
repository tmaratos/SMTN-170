function portalLogin(event) {
  event.preventDefault();
  localStorage.setItem("smtn170_logged_in", "true");
  window.location.href = "dashboard.html";
}

function logout() {
  localStorage.removeItem("smtn170_logged_in");
  window.location.href = "index.html";
}

function fakeGenerate() {
  alert("Schedule preview generated. Real save/export logic can be connected to Supabase later.");
}

(function protectPrototypePages() {
  const current = window.location.pathname.split("/").pop();
  const publicPages = ["", "index.html"];

  if (!publicPages.includes(current)) {
    const loggedIn = localStorage.getItem("smtn170_logged_in");
    if (loggedIn !== "true") {
      window.location.href = "index.html";
    }
  }
})();
