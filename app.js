async function logout() {
  if (window.TN170AuthGuard?.logout) {
    await window.TN170AuthGuard.logout();
    return;
  }
  console.log("LOGOUT_CLICKED");
  const sb = window.TN170FirebaseClient || window.SMTN170Firebase?.getClient?.();
  if (sb) await sb.auth.signOut();
  console.log("SIGNOUT_COMPLETE");
  window.location.href = "login.html";
}
