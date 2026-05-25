/**
 * Steward for CAP — Phase 3 UI shell (GitHub Pages).
 * Brain runs in Supabase Edge Function steward-core via steward-api.js.
 */
(function initSteward(global) {
  const DISCLAIMER =
    "Steward responses are assistance only. Official CAP publications and command guidance remain authoritative.";

  const DEFAULT_PROMPTS = [
    "Build next month's meeting schedule",
    "Show overdue flight reviews",
    "Prepare inspection readiness checklist",
    "Find latest uploaded safety files",
    "Help update the organization chart",
    "Show open inspection items",
  ];

  const CAP_PROMPTS = [
      "Find CAP regulations",
      "Search uniform standards",
      "Find inspection guidance",
      "Search aerospace education resources",
      "Find emergency services guidance",
      "Find safety resources",
    ];

  const MODES = [
    { id: "chat", label: "Chat" },
    { id: "files", label: "Files" },
    { id: "meetings", label: "Meetings" },
    { id: "readiness", label: "Readiness" },
    { id: "org", label: "Org Chart" },
    { id: "cap", label: "CAP Website" },
  ];

  const CAP_SEARCH_MARKER = "CAP_SEARCH_URL:";

  let activeMode = "chat";

  const LOCAL_KEY = "smtn170_steward_phase1";

  let state = {
    conversationId: null,
    conversationTitle: "New conversation",
    messages: [],
    conversations: [],
    isThinking: false,
    loaded: false,
    dataConnected: false,
    pendingConfirmation: null,
  };

  function titleFromMessage(text) {
    const clean = (text || "").trim().replace(/\s+/g, " ");
    if (!clean) return "New conversation";
    return clean.length > 48 ? clean.slice(0, 45) + "…" : clean;
  }

  function canUseStewardCore() {
    return !!(
      global.SMTN170StewardApi?.isConfigured?.() &&
      getUserId() &&
      global.SMTN170StewardApi?.functionsUrl?.()
    );
  }

  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  function getPrompts() {
    if (activeMode === "cap") {
      return global.SMTN170_DATA?.STEWARD_CAP_PROMPTS?.length
        ? global.SMTN170_DATA.STEWARD_CAP_PROMPTS
        : CAP_PROMPTS;
    }
    const list = global.SMTN170_DATA?.STEWARD_PROMPTS;
    return list?.length ? list : DEFAULT_PROMPTS;
  }

  function getUserId() {
    return global.SMTN170Auth?.actorId?.() || null;
  }

  function getSupabase() {
    return global.SMTN170Supabase?.getClient?.() || null;
  }

  function isOnline() {
    return !!getSupabase() && !!getUserId() && global.SMTN170Supabase?.isConfigured?.();
  }

  function saveLocalFallback() {
    try {
      localStorage.setItem(
        LOCAL_KEY,
        JSON.stringify({
          conversationId: state.conversationId,
          title: state.conversationTitle,
          messages: state.messages,
        })
      );
    } catch {
      /* ignore */
    }
  }

  function loadLocalFallback() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      state.conversationId = data.conversationId || "local-" + Date.now();
      state.conversationTitle = data.title || "New conversation";
      state.messages = Array.isArray(data.messages) ? data.messages : [];
      return true;
    } catch {
      return false;
    }
  }

  async function listConversations() {
    const sb = getSupabase();
    const uid = getUserId();
    if (!sb || !uid) return [];
    const { data, error } = await sb
      .from("steward_conversations")
      .select("id, title, archived_at, updated_at, created_at")
      .eq("profile_id", uid)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(30);
    if (error) {
      console.warn("[Steward] list conversations", error.message);
      return [];
    }
    return data || [];
  }

  async function createConversation(title) {
    const sb = getSupabase();
    const uid = getUserId();
    if (!sb || !uid) {
      const id = "local-" + Date.now();
      state.conversationId = id;
      state.conversationTitle = title || "New conversation";
      state.messages = [];
      saveLocalFallback();
      return { id, title: state.conversationTitle };
    }
    const now = new Date().toISOString();
    const { data, error } = await sb
      .from("steward_conversations")
      .insert({
        profile_id: uid,
        title: title || "New conversation",
        updated_at: now,
      })
      .select("id, title")
      .single();
    if (error) throw error;
    return data;
  }

  async function updateConversation(patch) {
    const sb = getSupabase();
    const uid = getUserId();
    if (!sb || !uid || !state.conversationId || String(state.conversationId).startsWith("local-")) {
      if (patch.title) state.conversationTitle = patch.title;
      saveLocalFallback();
      return;
    }
    await sb
      .from("steward_conversations")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", state.conversationId)
      .eq("profile_id", uid);
  }

  async function loadMessagesForConversation(conversationId) {
    const sb = getSupabase();
    const uid = getUserId();
    if (!sb || !uid || String(conversationId).startsWith("local-")) {
      return state.messages;
    }
    const { data, error } = await sb
      .from("steward_chat_messages")
      .select("id, role, message, created_at")
      .eq("conversation_id", conversationId)
      .eq("profile_id", uid)
      .order("created_at", { ascending: true })
      .limit(300);
    if (error) {
      console.warn("[Steward] load messages", error.message);
      return [];
    }
    return (data || []).map((r) => parseStoredMessage(r));
  }

  function parseStoredMessage(row) {
    const text = row.message || "";
    const capMatch = text.match(/CAP_SEARCH_URL:(https?:\/\/[^\s]+)/);
    const capSearchUrl = capMatch ? capMatch[1] : null;
    const displayText = capSearchUrl ? text.replace(/\n*CAP_SEARCH_URL:https?:\/\/[^\s]+/, "").trim() : text;
    return {
      id: row.id,
      role: row.role === "user" ? "user" : "steward",
      text: displayText,
      at: row.created_at,
      capSearchUrl,
    };
  }

  function appendCapSearchMarker(text, url) {
    if (!url) return text;
    return text + "\n\n" + CAP_SEARCH_MARKER + url;
  }

  function renderCapActions(capSearchUrl) {
    if (!capSearchUrl) return "";
    const safeUrl = escapeHtml(capSearchUrl);
    return `<div class="steward-cap-actions">
      <a href="${safeUrl}" class="steward-cap-btn steward-cap-btn--primary" target="_blank" rel="noopener noreferrer" data-cap-open-tab="${safeUrl}">Open CAP Reference</a>
      <button type="button" class="steward-cap-btn steward-cap-btn--secondary" data-cap-open-tab="${safeUrl}">Open in new tab</button>
    </div>`;
  }
  }

  async function ensureActiveConversation() {
    if (!isOnline()) {
      if (!loadLocalFallback()) {
        state.conversationId = "local-" + Date.now();
        state.conversationTitle = "New conversation";
        state.messages = [];
        saveLocalFallback();
      }
      return;
    }

    state.conversations = await listConversations();
    let active = state.conversations[0];
    if (!active) {
      active = await createConversation("New conversation");
      state.conversations = await listConversations();
    }
    state.conversationId = active.id;
    state.conversationTitle = active.title || "New conversation";
    state.messages = await loadMessagesForConversation(active.id);
  }

  async function insertMessage(role, text) {
    const msg = {
      id: "tmp-" + Date.now(),
      role: role === "user" ? "user" : "steward",
      text,
      at: new Date().toISOString(),
    };

    const sb = getSupabase();
    const uid = getUserId();
    if (!sb || !uid || !state.conversationId || String(state.conversationId).startsWith("local-")) {
      msg.id = role + "-" + Date.now();
      return msg;
    }

    const { data, error } = await sb
      .from("steward_chat_messages")
      .insert({
        conversation_id: state.conversationId,
        profile_id: uid,
        role: role === "user" ? "user" : "steward",
        message: text,
      })
      .select("id, created_at")
      .single();

    if (error) throw error;
    msg.id = data.id;
    msg.at = data.created_at;
    await updateConversation({ updated_at: msg.at });
    return msg;
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  function scrollMessagesToEnd() {
    const root = document.getElementById("stewardMessages");
    if (!root) return;
    requestAnimationFrame(() => {
      root.scrollTop = root.scrollHeight;
    });
  }

  function setThinking(on) {
    state.isThinking = on;
    const typing = document.getElementById("stewardTyping");
    if (typing) typing.hidden = !on;
    setComposeEnabled(!on);
    if (on) scrollMessagesToEnd();
  }

  function setComposeEnabled(enabled) {
    const input = document.getElementById("stewardInput");
    const sendBtn = document.getElementById("stewardSend");
    document.querySelectorAll(".steward-prompt-chip").forEach((c) => {
      c.disabled = !enabled;
    });
    if (input) input.disabled = !enabled;
    if (sendBtn) sendBtn.disabled = !enabled;
  }

  function renderTitleField() {
    const el = document.getElementById("stewardConvoTitle");
    if (el) el.value = state.conversationTitle;
  }

  function getOpeningGreeting() {
    const profile = global.SMTN170Auth?.getProfile?.();
    const g = global.SMTN170Profile?.computeWelcomeGreeting?.(profile);
    if (g?.full) {
      const h = new Date().getHours();
      const timeWord = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
      const name = (profile?.preferred_name || profile?.first_name || "").trim().split(/\s+/)[0];
      const nameBit = name ? `, ${name}` : "";
      return `${timeWord}${nameBit}. I can help with meeting schedules, flight reviews, inspection prep, file organization, org charts, and CAP references. What would you like to work on?`;
    }
    return "Good afternoon. I can help with meeting schedules, flight reviews, inspection prep, file organization, org charts, and CAP references. What would you like to work on?";
  }

  function renderModeHint() {
    const el = document.getElementById("stewardModeHint");
    if (!el) return;
    const hints = global.SMTN170StewardEngine?.MODE_HINTS || {};
    el.textContent = hints[activeMode] || hints.chat || "";
  }

  function renderModeTabs() {
    const root = document.getElementById("stewardModeTabs");
    if (!root) return;
    root.innerHTML = MODES.map(
      (m) =>
        `<button type="button" class="steward-mode-tab ${m.id === activeMode ? "active" : ""}" data-steward-mode="${escapeHtml(m.id)}" aria-selected="${m.id === activeMode}">${escapeHtml(m.label)}</button>`
    ).join("");
    renderModeHint();
  }

  function setActiveMode(modeId) {
    if (!MODES.some((m) => m.id === modeId)) return;
    activeMode = modeId;
    renderModeTabs();
    renderPrompts();
    document.getElementById("stewardInput")?.focus();
  }

  function injectStewardCss() {
    if (document.querySelector('link[href*="steward-workspace.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "./css/steward-workspace.css?v=1";
    document.head.appendChild(link);
  }

  function renderMessages() {
    const root = document.getElementById("stewardMessages");
    if (!root) return;

    if (!state.messages.length) {
      const greeting = escapeHtml(getOpeningGreeting());
      root.innerHTML = `
        <div class="steward-welcome">
          <div class="steward-welcome-avatar" aria-hidden="true">S</div>
          <div class="steward-welcome-copy">
            <p><strong>Steward for CAP</strong></p>
            <p>${greeting}</p>
          </div>
        </div>`;
      return;
    }

    root.innerHTML =
      state.messages
        .map((m) => {
          const isUser = m.role === "user";
          const label = isUser ? "You" : "Steward";
          const avatar = isUser ? "You" : "S";
          const time = m.at ? `<time class="steward-msg-time">${escapeHtml(formatTime(m.at))}</time>` : "";
          const body = formatMessageHtml(m.text);
          const capActions = m.role === "steward" ? renderCapActions(m.capSearchUrl) : "";
          return `<div class="steward-msg steward-msg--${m.role}" data-msg-id="${escapeHtml(m.id || "")}">
          <div class="steward-msg-meta">
            <span class="steward-msg-avatar" aria-hidden="true">${escapeHtml(avatar)}</span>
            <span class="steward-msg-label">${escapeHtml(label)}</span>
            ${time}
          </div>
          <div class="steward-msg-bubble">${body}${capActions}</div>
        </div>`;
        })
        .join("") + renderConfirmBar();

    scrollMessagesToEnd();
  }

  function formatMessageHtml(text) {
    const raw = text == null ? "" : String(text);
    let html = escapeHtml(raw).replace(/\n/g, "<br>");
    html = html.replace(/(Source: Official CAP Website)/g, '<p class="steward-msg-source">$1</p>');
    html = html.replace(/(Source:[^<]+?)(?=<br>|$)/g, '<p class="steward-msg-source">$1</p>');
    if (raw.includes(DISCLAIMER)) {
      html = html.replace(escapeHtml(DISCLAIMER), `<span class="steward-msg-disclaimer-inline">${escapeHtml(DISCLAIMER)}</span>`);
    }
    return html;
  }

  function renderConfirmBar() {
    const pending = state.pendingConfirmation;
    if (!pending) return "";
    return `<div class="steward-confirm-bar" id="stewardConfirmBar" role="group" aria-label="Confirm action">
      <p class="steward-confirm-text">${escapeHtml(pending.summary || "Confirm this change?")}</p>
      <div class="steward-confirm-actions">
        <button type="button" class="steward-confirm-btn steward-confirm-btn--yes" data-steward-confirm="1">Confirm</button>
        <button type="button" class="steward-confirm-btn steward-confirm-btn--no" data-steward-cancel="1">Cancel</button>
      </div>
    </div>`;
  }

  function renderDataStatus(connected) {
    state.dataConnected = !!connected;
    const el = document.querySelector(".steward-status");
    if (!el) return;
    if (connected) {
      el.innerHTML =
        '<span class="steward-status-dot steward-status-dot--live" aria-hidden="true"></span> Data connected';
      el.classList.add("steward-status--live");
    } else {
      el.innerHTML = '<span class="steward-status-dot" aria-hidden="true"></span> Ready to help';
      el.classList.remove("steward-status--live");
    }
  }

  function renderPrompts() {
    const root = document.getElementById("stewardPrompts");
    if (!root) return;
    root.innerHTML = getPrompts()
      .map(
        (p) =>
          `<button type="button" class="steward-prompt-chip" data-prompt="${escapeHtml(p)}">${escapeHtml(p)}</button>`
      )
      .join("");
  }

  function pushStewardReplyFromApi(result) {
    const api = global.SMTN170StewardApi;
    const capUrl =
      result.cap_search?.searchUrl || api?.parseCapUrlFromText?.(result.reply) || null;
    if (result.cap_search?.openInNewTab && capUrl) {
      api?.openCapUrl?.(capUrl);
    }
    state.messages.push({
      id: result.steward_message_id || "steward-" + Date.now(),
      role: "steward",
      text: api?.stripCapMarker?.(result.reply) || result.reply || "",
      at: result.steward_message_at || new Date().toISOString(),
      capSearchUrl: capUrl,
    });
    state.pendingConfirmation = result.pending_confirmation || null;
    renderDataStatus(!!result.data_connected);
  }

  async function sendMessage(text) {
    const trimmed = (text || "").trim();
    if (!trimmed || state.isThinking) return;

    if (!state.conversationId) await ensureActiveConversation();

    if (!canUseStewardCore()) {
      alert("Sign in with Supabase configured to use Steward. Deploy the steward-core Edge Function if you have not already.");
      return;
    }

    setThinking(true);

    const input = document.getElementById("stewardInput");
    const optimisticId = "tmp-u-" + Date.now();

    try {
      state.messages.push({
        id: optimisticId,
        role: "user",
        text: trimmed,
        at: new Date().toISOString(),
      });
      renderMessages();
      if (input) input.value = "";

      const convId =
        state.conversationId && !String(state.conversationId).startsWith("local-")
          ? state.conversationId
          : undefined;

      const result = await global.SMTN170StewardApi.invoke({
        message: trimmed,
        conversation_id: convId,
        active_mode: activeMode,
      });

      if (result.conversation_id) state.conversationId = result.conversation_id;

      const userIdx = state.messages.findIndex((m) => m.id === optimisticId);
      if (userIdx >= 0) {
        if (result.user_message_id) state.messages[userIdx].id = result.user_message_id;
      }

      if (
        state.messages.filter((m) => m.role === "user").length === 1 &&
        (state.conversationTitle === "New conversation" || !state.conversationTitle)
      ) {
        state.conversationTitle = titleFromMessage(trimmed);
        await updateConversation({ title: state.conversationTitle });
        renderTitleField();
      }

      pushStewardReplyFromApi(result);
      saveLocalFallback();
      renderMessages();
      input?.focus();
    } catch (err) {
      console.error("[Steward] send", err);
      state.messages = state.messages.filter((m) => m.id !== optimisticId);
      renderMessages();
      alert(err.message || "Steward could not respond. Check your connection and Edge Function deployment.");
    } finally {
      setThinking(false);
    }
  }

  async function startNewChat() {
    const conv = await createConversation("New conversation");
    state.conversationId = conv.id;
    state.conversationTitle = conv.title || "New conversation";
    state.messages = [];
    state.conversations = await listConversations();
    renderTitleField();
    renderMessages();
    saveLocalFallback();
    document.getElementById("stewardInput")?.focus();
  }

  async function archiveCurrentChat() {
    if (
      !confirm(
        "Archive this conversation? It will be hidden from your active list. You can start a new chat afterward. (Nothing is permanently deleted.)"
      )
    ) {
      return;
    }

    const sb = getSupabase();
    const uid = getUserId();
    if (sb && uid && state.conversationId && !String(state.conversationId).startsWith("local-")) {
      await sb
        .from("steward_conversations")
        .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", state.conversationId)
        .eq("profile_id", uid);
    }

    await startNewChat();
  }

  async function switchConversation(id) {
    const conv = state.conversations.find((c) => c.id === id);
    if (!conv) return;
    state.conversationId = conv.id;
    state.conversationTitle = conv.title || "New conversation";
    state.messages = await loadMessagesForConversation(conv.id);
    renderTitleField();
    renderMessages();
    document.getElementById("stewardConvoList")?.querySelectorAll("[data-convo-id]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.convoId === id);
    });
  }

  function renderConversationList() {
    const root = document.getElementById("stewardConvoList");
    if (!root) return;
    if (!state.conversations.length) {
      root.innerHTML = "";
      return;
    }
    root.innerHTML = state.conversations
      .slice(0, 8)
      .map(
        (c) =>
          `<button type="button" class="steward-convo-item ${c.id === state.conversationId ? "active" : ""}" data-convo-id="${escapeHtml(c.id)}">${escapeHtml(c.title || "Conversation")}</button>`
      )
      .join("");
  }

  function openPanel() {
    const panel = document.getElementById("stewardPanel");
    panel?.classList.add("open");
    panel?.setAttribute("aria-hidden", "false");
    document.body.classList.add("steward-open");
    document.getElementById("stewardFab")?.setAttribute("aria-expanded", "true");
    renderModeTabs();
    loadAndRender().then(() => {
      renderMessages();
      setTimeout(() => document.getElementById("stewardInput")?.focus(), 280);
    });
  }

  function closePanel() {
    const panel = document.getElementById("stewardPanel");
    panel?.classList.remove("open");
    panel?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("steward-open");
    document.getElementById("stewardFab")?.setAttribute("aria-expanded", "false");
  }

  function togglePanel() {
    const panel = document.getElementById("stewardPanel");
    if (panel?.classList.contains("open")) closePanel();
    else openPanel();
  }

  function bindPanelEvents() {
    const root = document.getElementById("stewardRoot");
    if (!root || root.dataset.eventsBound === "1") return;
    root.dataset.eventsBound = "1";

    document.getElementById("stewardFab")?.addEventListener("click", togglePanel);
    document.getElementById("stewardClose")?.addEventListener("click", closePanel);
    document.getElementById("stewardBackdrop")?.addEventListener("click", closePanel);

    document.getElementById("stewardNewChat")?.addEventListener("click", () => startNewChat());
    document.getElementById("stewardArchiveChat")?.addEventListener("click", () => archiveCurrentChat());

    document.getElementById("stewardConvoTitle")?.addEventListener("change", async (e) => {
      state.conversationTitle = e.target.value.trim() || "New conversation";
      await updateConversation({ title: state.conversationTitle });
    });

    document.getElementById("stewardConvoList")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-convo-id]");
      if (!btn) return;
      switchConversation(btn.dataset.convoId);
    });

    document.getElementById("stewardForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      sendMessage(document.getElementById("stewardInput")?.value);
    });

    document.getElementById("stewardInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(e.target.value);
      }
    });

    document.getElementById("stewardPrompts")?.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-prompt]");
      if (!chip || chip.disabled) return;
      sendMessage(chip.dataset.prompt || "");
    });

    document.getElementById("stewardModeTabs")?.addEventListener("click", (e) => {
      const tab = e.target.closest("[data-steward-mode]");
      if (!tab) return;
      setActiveMode(tab.dataset.stewardMode);
    });

    document.getElementById("stewardMessages")?.addEventListener("click", (e) => {
      const capBtn = e.target.closest("[data-cap-open-tab]");
      if (capBtn) {
        e.preventDefault();
        const url = capBtn.getAttribute("data-cap-open-tab");
        if (url) global.open(url, "_blank", "noopener,noreferrer");
        return;
      }
    });

    document.getElementById("stewardMessages")?.addEventListener("click", async (e) => {
      if (e.target.closest("[data-steward-confirm]")) {
        e.preventDefault();
        await handleConfirmAction();
        return;
      }
      if (e.target.closest("[data-steward-cancel]")) {
        e.preventDefault();
        await handleCancelAction();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && document.getElementById("stewardPanel")?.classList.contains("open")) {
        closePanel();
      }
    });
  }

  async function handleConfirmAction() {
    if (!state.pendingConfirmation || !canUseStewardCore()) return;
    setThinking(true);
    try {
      const result = await global.SMTN170StewardApi.invoke({
        conversation_id: state.conversationId,
        active_mode: activeMode,
        confirm_pending: true,
      });
      pushStewardReplyFromApi(result);
      saveLocalFallback();
      renderMessages();
    } catch (err) {
      console.error("[Steward] confirm", err);
      alert(err.message || "Could not complete that action.");
    } finally {
      setThinking(false);
    }
  }

  async function handleCancelAction() {
    if (!canUseStewardCore()) return;
    setThinking(true);
    try {
      const result = await global.SMTN170StewardApi.invoke({
        conversation_id: state.conversationId,
        active_mode: activeMode,
        cancel_pending: true,
      });
      pushStewardReplyFromApi(result);
      saveLocalFallback();
      renderMessages();
    } catch (err) {
      console.error("[Steward] cancel", err);
      alert(err.message || "Could not cancel.");
    } finally {
      setThinking(false);
    }
  }

  function bindOpenTriggers() {
    document.querySelectorAll("[data-steward-open]").forEach((el) => {
      if (el.dataset.stewardBound === "1") return;
      el.dataset.stewardBound = "1";
      el.addEventListener("click", (e) => {
        e.preventDefault();
        openPanel();
      });
    });
  }

  function injectWidget() {
    if (document.getElementById("stewardRoot")) return;

    const root = document.createElement("div");
    root.id = "stewardRoot";
    root.innerHTML = `
      <button type="button" class="steward-fab steward-fab--secondary" id="stewardFab" aria-expanded="false" aria-controls="stewardPanel" aria-label="Open Steward for CAP">
        <span class="steward-fab-icon" aria-hidden="true">S</span>
        <span class="steward-fab-label">Steward</span>
      </button>
      <div class="steward-backdrop" id="stewardBackdrop" aria-hidden="true"></div>
      <section class="steward-panel" id="stewardPanel" role="dialog" aria-modal="true" aria-labelledby="stewardTitle" aria-hidden="true">
        <header class="steward-panel-head">
          <div class="steward-head-text">
            <p class="steward-kicker">TN-170 Senior Member operations assistant</p>
            <h2 id="stewardTitle">Steward for CAP</h2>
            <p class="steward-status"><span class="steward-status-dot" aria-hidden="true"></span> Ready to help</p>
          </div>
          <button type="button" class="steward-close" id="stewardClose" aria-label="Close Steward">✕</button>
        </header>

        <p class="steward-continuity">Steward helps preserve squadron continuity on the TN-170 Senior Member operations portal — conversations, files, schedules, and operational context.</p>

        <div class="steward-mode-tabs" id="stewardModeTabs" role="tablist" aria-label="Steward modes"></div>
        <p class="steward-mode-hint" id="stewardModeHint"></p>

        <div class="steward-workspace-layout">
          <aside class="steward-side-col" aria-label="Conversations">
            <label class="visually-hidden" for="stewardConvoTitle">Conversation title</label>
            <input type="text" id="stewardConvoTitle" class="steward-convo-title" value="New conversation" maxlength="80" />
            <div class="steward-side-actions">
              <button type="button" class="steward-tool-btn" id="stewardNewChat">New Chat</button>
              <button type="button" class="steward-tool-btn steward-tool-btn--muted" id="stewardArchiveChat">Archive</button>
            </div>
            <div class="steward-convo-list" id="stewardConvoList" role="list" aria-label="Recent conversations"></div>
          </aside>

          <div class="steward-main-col">
            <p class="steward-disclaimer">${escapeHtml(DISCLAIMER)}</p>
            <div class="steward-chat-body">
              <div class="steward-messages" id="stewardMessages" role="log" aria-live="polite"></div>
              <div class="steward-typing" id="stewardTyping" hidden aria-live="polite">
                <div class="steward-msg steward-msg--steward">
                  <div class="steward-msg-meta">
                    <span class="steward-msg-avatar" aria-hidden="true">S</span>
                    <span class="steward-msg-label">Steward</span>
                  </div>
                  <div class="steward-msg-bubble steward-msg-bubble--typing">
                    <span class="steward-typing-dots" aria-label="Steward is thinking"><span></span><span></span><span></span></span>
                  </div>
                </div>
              </div>
            </div>

            <footer class="steward-chat-footer">
              <div class="steward-prompts-label">Suggested for TN-170 operations</div>
              <div class="steward-prompts" id="stewardPrompts"></div>
              <form class="steward-compose" id="stewardForm">
                <label class="steward-input-wrap">
                  <span class="visually-hidden">Message Steward</span>
                  <textarea id="stewardInput" name="message" rows="3" placeholder="Ask Steward about meetings, files, readiness, org chart, or CAP references…" autocomplete="off"></textarea>
                </label>
                <button type="submit" class="steward-send" id="stewardSend">Send</button>
              </form>
              <p class="steward-fbi-footer">Built by <strong>Faith Based Innovations</strong></p>
            </footer>
          </div>
        </div>
      </section>`;

    document.body.appendChild(root);
    bindPanelEvents();
    renderModeTabs();
    renderPrompts();
  }

  async function loadAndRender() {
    await global.SMTN170Auth?.syncSessionFromSupabase?.();
    await ensureActiveConversation();
    state.loaded = true;
    renderTitleField();
    renderConversationList();
    renderMessages();
    saveLocalFallback();
  }

  async function init() {
    injectStewardCss();
    await global.SMTN170Supabase?.whenReady?.();
    if (!document.getElementById("stewardRoot")) injectWidget();
    else {
      renderPrompts();
      bindPanelEvents();
    }
    bindOpenTriggers();
  }

  function rebind() {
    bindOpenTriggers();
  }

  function askFromDashboard(text) {
    openPanel();
    if ((text || "").trim()) {
      setTimeout(() => sendMessage(text), 200);
    }
  }

  global.SMTN170Steward = {
    openPanel,
    closePanel,
    sendMessage,
    askFromDashboard,
    startNewChat,
    archiveCurrentChat,
    loadAndRender,
    rebind,
    init,
  };

  global.addEventListener("smtn170:auth-changed", () => {
    state.loaded = false;
    if (document.getElementById("stewardPanel")?.classList.contains("open")) {
      loadAndRender();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
