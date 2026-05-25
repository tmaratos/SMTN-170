/**
 * Phase 3: Rules engine removed from public frontend.
 * Steward Core Edge Function handles all responses.
 */
(function initStewardEngineStub(global) {
  global.SMTN170StewardEngine = {
    MODE_HINTS: {
      chat: "Ask about anything operational — conversations are saved on the server.",
      files: "Files mode — squadron uploads and folders.",
      meetings: "Meetings mode — schedules and meeting records.",
      readiness: "Readiness mode — inspection prep and flight reviews.",
      org: "Org Chart mode — positions and vacancies.",
      cap: "CAP Website mode — official CAP guidance on gocivilairpatrol.com.",
    },
  };
})(window);
