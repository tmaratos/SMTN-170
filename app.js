async function logout() {
  if (window.TN170AuthGuard?.logout) {
    await window.TN170AuthGuard.logout();
    return;
  }
  console.log("LOGOUT_CLICKED");
  const sb = window.TN170SupabaseClient || window.SMTN170Supabase?.getClient?.();
  if (sb) await sb.auth.signOut();
  console.log("SIGNOUT_COMPLETE");
  window.location.href = "login.html";
}
