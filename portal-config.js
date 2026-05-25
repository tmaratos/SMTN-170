/**
 * Squadron portal links — update invite URL when the Discord server is ready.
 */
(function initPortalConfig(global) {
  global.SMTN170_CONFIG = {
    /** Official squadron Discord invite (https://discord.gg/…) */
    discordInviteUrl: "https://discord.gg/cSC5cFZJMd",

    discordLabel: "Squadron Discord",
    discordHint: "Member chat · announcements · meeting reminders",
  };
})(window);
