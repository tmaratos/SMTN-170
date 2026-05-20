function portalLogin(event) {
  event.preventDefault();

  localStorage.setItem("oakridgePortalLoggedIn", "true");
  window.location.href = "dashboard.html";
}

function logout() {
  localStorage.removeItem("oakridgePortalLoggedIn");
  window.location.href = "index.html";
}

(function protectPages() {
  const publicPages = ["index.html", "", "/"];
  const currentPage = window.location.pathname.split("/").pop();

  if (!publicPages.includes(currentPage)) {
    const loggedIn = localStorage.getItem("oakridgePortalLoggedIn");

    if (loggedIn !== "true") {
      window.location.href = "index.html";
    }
  }
})();
