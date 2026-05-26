/**
 * TN-170 password reset helper.
 *
 * Uses Firebase Auth's modular sendPasswordResetEmail. Works on:
 *   - login.html ("Forgot password?" flow, signed-out)
 *   - profile.html ("Send password reset email" Security button, signed-in)
 *
 * For senior-friendly UX, callers should:
 *   - show the same generic confirmation ("If an account exists, a link
 *     was sent to {email}") regardless of whether Firebase reports a
 *     user-not-found error — Firebase intentionally hides that detail.
 *   - present errors in plain English (network / config issues only).
 */
(function initPasswordReset(global) {
  const RESET_REDIRECT_URL = "https://tmaratos.github.io/SMTN-170/login.html";

  function isEmail(value) {
    const v = String(value || "").trim();
    if (!v) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  function isBenignAuthError(error) {
    const code = String(error?.code || "").toLowerCase();
    return (
      code === "auth/user-not-found" ||
      code === "auth/invalid-email" ||
      code === "auth/email-not-found"
    );
  }

  function isRateLimited(error) {
    const code = String(error?.code || "").toLowerCase();
    return code === "auth/too-many-requests";
  }

  /**
   * Send a password reset email to `email`.
   * Resolves to { ok: true, email, masked: false } on success.
   * Resolves to { ok: true, email, masked: true } on benign errors that we
   * should mask for security (user-not-found / invalid-email).
   * Rejects only for real failures (config / network / rate limit).
   */
  async function requestPasswordReset(email) {
    const trimmed = String(email || "").trim();
    if (!isEmail(trimmed)) {
      const err = new Error("Enter a valid email address.");
      err.code = "tn170/invalid-email";
      throw err;
    }

    const fb = global.SMTN170Firebase;
    if (!fb) {
      const err = new Error("Sign-in service is not available right now. Please try again in a moment.");
      err.code = "tn170/no-firebase";
      throw err;
    }

    await fb.whenReady?.({ authOnly: true });
    const auth = fb.getAuth?.();
    const authMod = fb.getAuthModule?.();
    const send = authMod?.sendPasswordResetEmail;
    if (!auth || typeof send !== "function") {
      const err = new Error("Sign-in service is not available right now. Please try again in a moment.");
      err.code = "tn170/no-auth";
      throw err;
    }

    const actionCodeSettings = {
      url: RESET_REDIRECT_URL,
      handleCodeInApp: false,
    };

    try {
      await send(auth, trimmed, actionCodeSettings);
      return { ok: true, email: trimmed, masked: false };
    } catch (error) {
      if (isBenignAuthError(error)) {
        console.warn("[password-reset] benign auth error, masking", error?.code || error?.message || error);
        return { ok: true, email: trimmed, masked: true };
      }
      if (isRateLimited(error)) {
        const err = new Error("Too many reset attempts. Please wait a few minutes and try again.");
        err.code = error.code;
        throw err;
      }
      const message =
        global.SMTN170FirebaseAuth?.formatAuthError?.(error) ||
        error?.message ||
        "Could not send the reset email. Please try again.";
      const err = new Error(message);
      err.code = error?.code || "tn170/unknown";
      throw err;
    }
  }

  function buildGenericSuccessMessage(email) {
    const safeEmail = String(email || "").trim();
    return safeEmail
      ? `If an account exists for ${safeEmail}, a password reset link has been sent. Please check your inbox and spam folder.`
      : "If an account exists for that address, a password reset link has been sent. Please check your inbox and spam folder.";
  }

  function buildProfileSuccessMessage(email) {
    const safeEmail = String(email || "").trim();
    return safeEmail
      ? `A password reset link was sent to ${safeEmail}. Use it to choose a new password.`
      : "A password reset link was sent. Use it to choose a new password.";
  }

  global.SMTN170PasswordReset = {
    requestPasswordReset,
    buildGenericSuccessMessage,
    buildProfileSuccessMessage,
  };
})(window);
