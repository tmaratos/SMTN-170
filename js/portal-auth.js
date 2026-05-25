/**
 * @deprecated Use js/auth.js — kept so old script tags still work.
 * Loads auth.js if SMTN170Auth is missing.
 */
(function () {
  if (window.SMTN170Auth) return;
  var s = document.createElement("script");
  s.src = "./js/auth.js?v=1";
  document.head.appendChild(s);
})();
