/**
 * TN-170 Oak Ridge Composite Squadron — portal configuration.
 * Future: Supabase project URL, anon key via env injection (never commit secrets).
 */
(function initPortalConfig(global) {
  global.SMTN170_CONFIG = {
    unitDesignator: "TN-170",
    unitName: "Oak Ridge Composite Squadron",
    motto: "Not Without Effort.",
    portalTitle: "Squadron Operations Desk",

    discordInviteUrl: "https://discord.gg/cSC5cFZJMd",
    discordLabel: "Squadron Discord",
    discordHint: "Member chat · announcements · meeting reminders",

    stewardBrand: "Steward for CAP",
    stewardBuilder: "Faith Based Innovations",
  };
})(window);
