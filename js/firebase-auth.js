/**
 * TN-170 Firebase Auth helpers for portal pages.
 */
(function initFirebaseAuthHelpers(global) {
  async function ensureAuthReady() {
    await global.SMTN170Firebase?.whenReady?.();
    return global.SMTN170Firebase?.getAuth?.();
  }

  async function getCurrentUser() {
    const auth = await ensureAuthReady();
    return auth?.currentUser || null;
  }

  async function getIdToken() {
    const user = await getCurrentUser();
    if (!user) return null;
    return user.getIdToken();
  }

  async function signIn(email, password) {
    const client = await global.SMTN170Firebase?.whenReady?.();
    if (!client) throw new Error("Firebase is not configured. Contact the portal administrator.");
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const client = global.SMTN170Firebase?.getClient?.();
    if (client) await client.auth.signOut();
  }

  function mapFirebaseAuthError(error) {
    if (!error) return "Could not sign in.";
    const code = error.code || "";
    const map = {
      "auth/invalid-email": "Invalid email address.",
      "auth/user-disabled": "This account has been disabled.",
      "auth/user-not-found": "No account found for that email.",
      "auth/wrong-password": "Incorrect password.",
      "auth/invalid-credential": "Incorrect email or password.",
      "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
    };
    return map[code] || error.message || "Could not sign in.";
  }

  global.SMTN170FirebaseAuth = {
    ensureAuthReady,
    getCurrentUser,
    getIdToken,
    signIn,
    signOut,
    mapFirebaseAuthError,
  };
})(window);
