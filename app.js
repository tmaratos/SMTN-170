async function portalLogin(event) {
  if (event) event.preventDefault();
  const email = document.getElementById("loginEmail")?.value?.trim() || "";
  const password = document.getElementById("loginPassword")?.value || "";
  const auth = window.SMTN170Auth;

  if (window.SMTN170Supabase?.isConfigured?.() && auth?.signIn) {
    await auth.signIn(email, password);
    const s = auth.loadSession();
    window.location.href =
      s?.accountStatus === auth.ACCOUNT_STATUS.AWAITING ? "pending-approval.html" : "dashboard.html";
    return;
  }

  if (auth) {
    auth.login(email, auth.ACCOUNT_STATUS.APPROVED, auth.ROLES.SENIOR_MEMBER.id);
  } else {
    localStorage.setItem("smtn170_logged_in", "true");
  }
  window.location.href = "dashboard.html";
}

async function logout() {
  if (window.SMTN170AuthSession?.signOut) {
    await window.SMTN170AuthSession.signOut();
    return;
  }
  if (window.SMTN170Auth?.logout) {
    await window.SMTN170Auth.logout();
  } else {
    localStorage.removeItem("smtn170_logged_in");
  }
  window.location.href = "login.html?signed_out=1";
}
