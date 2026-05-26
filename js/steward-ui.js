/**
 * Steward for CAP — UI only (GitHub Pages public repo).
 * All brain logic runs on the Cloudflare Worker via js/steward-client.js.
 */
(function initSteward(global) {
  const DISCLAIMER =
    "Steward responses are assistance only. Official CAP publications and command guidance remain authoritative.";

  const WORKFLOW_ACTIONS = [
    {
      id: "schedule",
      icon: "📋",
      title: "Build Meeting Schedule",
      subtitle: "Plan month and meeting nights",
      prompt: "Help me build this month's squadron meeting schedule with uniforms and training nights.",
    },
    {
      id: "bfr",
      icon: "✈",
      title: "Review Flight Expirations",
      subtitle: "BFR and review currency",
      prompt: "Show overdue and due-soon flight reviews for the squadron.",
    },
    {
      id: "inspection",
      icon: "✓",
      title: "Prepare Inspection Checklist",
      subtitle: "SUI readiness tracking",
      prompt: "Prepare inspection readiness checklist items we should track.",
    },
    {
      id: "org",
      icon: "◇",
      title: "Review Org Chart",
      subtitle: "Staffing and vacancies",
      prompt: "Help me review the squadron organization chart and vacant positions.",
    },
    {
      id: "resources",
      icon: "🔗",
      title: "Find Resource Links",
      subtitle: "Files & Resources directory",
      href: "documents.html",
      prompt: "Help me find squadron resource links for schedules, forms, and CAP references.",
    },
    {
      id: "tasks",
      icon: "☑",
      title: "Review Open Tasks",
      subtitle: "Squadron follow-ups",
      href: "tasks.html",
      prompt: "Show open squadron tasks that need attention.",
    },
  ];

  const DEFAULT_PROMPTS = [
    "Build next month's meeting schedule",
    "Show overdue flight reviews",
    "Prepare inspection readiness checklist",
    "Find squadron resource links",
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
    conversationTitle: "New operation",
    messages: [],
    conversations: [],
    isThinking: false,
    loaded: false,
    dataConnected: false,
    pendingConfirmation: null,
    workspaceContext: null,
    openedUrls: {},
  };

  function titleFromMessage(text) {
    const clean = (text || "").trim().replace(/\s+/g, " ");
    if (!clean) return "New conversation";
    return clean.length > 48 ? clean.slice(0, 45) + "…" : clean;
  }

  function canUseStewardCore() {
    const profile = global.SMTN170Auth?.getProfile?.() || global.SMTN170Auth?.loadSession?.();
    const approved = global.SMTN170Profile?.isProfileStatusApproved?.(profile);
    return !!(global.SMTN170StewardClient?.isConfigured?.() && getUserId() && approved);
  }

  function getClientApi() {
    return global.SMTN170StewardClient;
  }

  function stewardErrorMessage(err, fallback) {
    const msg = err?.message ? String(err.message) : fallback || "Please try again later.";
    if (msg.startsWith("Steward is unavailable right now:")) return msg;
    return "Steward is unavailable right now: " + msg;
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

  function isOnline() {
    return canUseStewardCore();
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
    return state.conversations || [];
  }

  async function createConversation(title) {
    const id = "local-" + Date.now();
    state.conversationId = id;
    state.conversationTitle = title || "New conversation";
    state.messages = [];
    saveLocalFallback();
    return { id, title: state.conversationTitle };
  }

  async function updateConversation(patch) {
    if (patch.title) state.conversationTitle = patch.title;
    saveLocalFallback();
  }

  async function loadMessagesForConversation(conversationId) {
    if (String(conversationId).startsWith("local-")) return state.messages;
    try {
      const raw = localStorage.getItem(LOCAL_KEY + ":" + conversationId);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data.messages) ? data.messages : [];
    } catch {
      return [];
    }
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

  function renderOpenUrlButton(openUrl, label) {
    if (!openUrl) return "";
    const safeUrl = escapeHtml(openUrl);
    const btnLabel = escapeHtml(label || "Open link");
    return `<div class="steward-cap-actions">
      <a href="${safeUrl}" class="steward-cap-btn steward-cap-btn--primary" target="_blank" rel="noopener noreferrer" data-cap-open-tab="${safeUrl}">${btnLabel}</a>
      <button type="button" class="steward-cap-btn steward-cap-btn--secondary" data-cap-open-tab="${safeUrl}">Open in new tab</button>
    </div>`;
  }

  function renderNavigateButton(navigateTo) {
    const targetPath = typeof navigateTo === "string" ? navigateTo : navigateTo?.path;
    if (!targetPath) return "";
    const path = escapeHtml(targetPath);
    const label = escapeHtml((typeof navigateTo === "object" ? navigateTo?.label : "") || "Open page");
    return `<div class="steward-cap-actions">
      <a href="${path}" class="steward-cap-btn steward-cap-btn--primary steward-nav-btn" data-steward-navigate="${path}">${label}</a>
    </div>`;
  }

  function tryLocalNavigation(message) {
    const api = global.StewardSiteIndex;
    if (!api?.getNavigationTarget) return null;
    const target = api.getNavigationTarget(message);
    if (!target?.path) return null;
    if (target.path === "admin.html" && !api.get?.()?.canAccessAdmin) return null;
    return target;
  }

  function handleNavigationIntent(message, fromWorker) {
    const target = fromWorker || tryLocalNavigation(message);
    if (!target?.path) return false;
    const label = target.label || "Open page";
    state.messages.push({
      id: "nav-" + Date.now(),
      role: "steward",
      text: `Opening ${label}.`,
      at: new Date().toISOString(),
      navigateTo: target,
      actions: [{ href: target.path, label: `Open ${label}` }],
    });
    renderMessages();
    global.location.href = target.path;
    return true;
  }

  function shouldAutoOpenCapUrl(userMessage, url) {
    if (!url || !/gocivilairpatrol\.com/i.test(url)) return false;
    const text = String(userMessage || "").toLowerCase();
    return /(find|search|open)\b/.test(text) && /(cap|capr|publication|reference|form)/.test(text);
  }

  function rememberOpenedUrl(url) {
    if (!url) return;
    state.openedUrls[url] = true;
  }

  function hasOpenedUrl(url) {
    return !!(url && state.openedUrls[url]);
  }

  function renderCapActions(capSearchUrl) {
    if (!capSearchUrl) return "";
    return renderOpenUrlButton(capSearchUrl, "Open official CAP search");
  }

  async function ensureActiveConversation() {
    if (!state.conversationId) {
      if (!loadLocalFallback()) {
        state.conversationId = null;
        state.conversationTitle = "New operation";
        state.messages = [];
      }
    }
    state.conversations = await listConversations();
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
    document.querySelectorAll(".steward-chip").forEach((c) => {
      if (c.tagName === "BUTTON") c.disabled = !enabled;
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
      return `${timeWord}${nameBit}. Steward is ready to help find resource links, plan meetings, track tasks, review the org chart, and search CAP references. What operation should we run?`;
    }
    return "Steward is ready to help find resource links, plan meetings, track tasks, review the org chart, and search CAP references. What operation should we run?";
  }

  function renderModeTabs() {
    const root = document.getElementById("stewardModeTabs");
    if (!root) return;
    root.innerHTML = MODES.map(
      (m) =>
        `<button type="button" class="steward-mode-tab ${m.id === activeMode ? "active" : ""}" data-steward-mode="${escapeHtml(m.id)}" aria-selected="${m.id === activeMode}">${escapeHtml(m.label)}</button>`
    ).join("");
  }

  function toggleContextDrawer(forceOpen) {
    const open = forceOpen === true ? true : forceOpen === false ? false : !document.body.classList.contains("steward-ctx-open");
    document.body.classList.toggle("steward-ctx-open", open);
    document.getElementById("stewardCtxToggle")?.setAttribute("aria-expanded", open ? "true" : "false");
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
    link.href = "./css/steward-workspace.css?v=4";
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
            <p><strong>Steward for CAP</strong> — mission support</p>
            <p>${greeting}</p>
            <p class="steward-welcome-hint">Ask about schedules, readiness, org chart, resource links, or CAP guidance. Google Drive integration may be added later.</p>
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
          const openUrlActions =
            m.role === "steward"
              ? renderCapActions(m.capSearchUrl) ||
                renderNavigateButton(m.navigateTo) ||
                renderOpenUrlButton(m.openUrl, m.openUrlLabel)
              : "";
          const suggestionActions = m.role === "steward" ? renderMessageActions(m) : "";
          return `<div class="steward-msg steward-msg--${m.role}" data-msg-id="${escapeHtml(m.id || "")}">
          <div class="steward-msg-meta">
            <span class="steward-msg-avatar" aria-hidden="true">${escapeHtml(avatar)}</span>
            <span class="steward-msg-label">${escapeHtml(label)}</span>
            ${time}
          </div>
          <div class="steward-msg-bubble">${body}${openUrlActions}${suggestionActions}</div>
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

  function renderMessageActions(msg) {
    const chips = [];
    (msg.suggestions || []).forEach((s, i) => {
      const label = typeof s === "string" ? s : s.label || s.text || "Suggestion";
      const prompt = typeof s === "string" ? s : s.prompt || s.message || label;
      chips.push(
        `<button type="button" class="steward-chip steward-chip--inline" data-prompt="${escapeHtml(prompt)}">${escapeHtml(label)}</button>`
      );
    });
    (msg.actions || []).forEach((a) => {
      if (a.href || a.url) {
        chips.push(
          `<a href="${escapeHtml(a.href || a.url)}" class="steward-chip steward-chip--link">${escapeHtml(a.label || a.title || "Open")}</a>`
        );
      } else if (a.prompt || a.message) {
        chips.push(
          `<button type="button" class="steward-chip steward-chip--inline" data-prompt="${escapeHtml(a.prompt || a.message)}">${escapeHtml(a.label || a.title || "Run")}</button>`
        );
      }
    });
    if (!chips.length) return "";
    return `<div class="steward-msg-actions">${chips.join("")}</div>`;
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
        '<span class="steward-status-dot steward-status-dot--live" aria-hidden="true"></span> Portal data linked';
      el.classList.add("steward-status--live");
    } else {
      el.innerHTML = '<span class="steward-status-dot" aria-hidden="true"></span> Operational standby';
      el.classList.remove("steward-status--live");
    }
  }

  function renderPrompts() {
    const root = document.getElementById("stewardPrompts");
    if (!root) return;
    const actions =
      activeMode === "chat"
        ? WORKFLOW_ACTIONS
        : WORKFLOW_ACTIONS.filter((a) => {
            if (activeMode === "cap") return a.id === "resources";
            if (activeMode === "files") return a.id === "resources";
            if (activeMode === "meetings") return a.id === "schedule" || a.id === "resources";
            if (activeMode === "readiness") return a.id === "bfr" || a.id === "inspection";
            if (activeMode === "org") return a.id === "org";
            return true;
          });

    const chips = actions
      .map((a) => {
        if (a.href) {
          return `<a href="${escapeHtml(a.href)}" class="steward-chip steward-chip--link">${escapeHtml(a.title)}</a>`;
        }
        const label = a.title.length > 36 ? a.title.slice(0, 34) + "…" : a.title;
        return `<button type="button" class="steward-chip" data-workflow-id="${escapeHtml(a.id)}" data-prompt="${escapeHtml(a.prompt || "")}">${escapeHtml(label)}</button>`;
      })
      .join("");
    root.innerHTML = chips;
  }

  function renderContextList(items, emptyLabel) {
    if (!items?.length) return `<li class="steward-ctx-empty">${escapeHtml(emptyLabel)}</li>`;
    return items.join("");
  }

  function renderWorkspaceContext() {
    const root = document.getElementById("stewardWorkspaceContext");
    if (!root) return;
    const ctx = state.workspaceContext;
    if (!ctx) {
      root.innerHTML = `<p class="steward-ctx-loading">Loading workspace context…</p>`;
      return;
    }

    const opItems = ctx.operations
      .map(
        (o) =>
          `<li><button type="button" class="steward-ctx-link" data-convo-id="${escapeHtml(o.id)}">${escapeHtml(o.label)}</button></li>`
      );
    const schedItems = ctx.schedules.map(
      (s) => `<li><a class="steward-ctx-link" href="calendar.html">${escapeHtml(s.label)}</a></li>`
    );
    const resourceItems = ctx.resources.map(
      (u) => `<li><a class="steward-ctx-link" href="documents.html">${escapeHtml(u.label)}</a></li>`
    );
    const taskItems = ctx.tasks.map(
      (t) => `<li><a class="steward-ctx-link" href="tasks.html">${escapeHtml(t.label)}</a></li>`
    );
    const expItems = ctx.expirations.map(
      (e) => `<li><a class="steward-ctx-link" href="flight-review.html">${escapeHtml(e.label)}</a></li>`
    );

    root.innerHTML = `
      <div class="steward-ctx-block">
        <h3 class="steward-ctx-head">Recent operations</h3>
        <ul class="steward-ctx-list">${renderContextList(opItems, "No recent operations")}</ul>
        <button type="button" class="steward-ctx-action" id="stewardNewChat">Start new operation</button>
      </div>
      <div class="steward-ctx-block">
        <h3 class="steward-ctx-head">Recent schedules</h3>
        <ul class="steward-ctx-list">${renderContextList(schedItems, "No upcoming meetings")}</ul>
      </div>
      <div class="steward-ctx-block">
        <h3 class="steward-ctx-head">Resource links</h3>
        <ul class="steward-ctx-list">${renderContextList(resourceItems, "No resource links yet")}</ul>
        <a href="documents.html" class="steward-ctx-action">Open Files &amp; Resources</a>
      </div>
      <div class="steward-ctx-block">
        <h3 class="steward-ctx-head">Recent tasks</h3>
        <ul class="steward-ctx-list">${renderContextList(taskItems, "No open tasks")}</ul>
      </div>
      <div class="steward-ctx-block">
        <h3 class="steward-ctx-head">Upcoming expirations</h3>
        <ul class="steward-ctx-list">${renderContextList(expItems, "No expirations flagged")}</ul>
      </div>`;
  }

  async function loadWorkspaceContext() {
    const empty = { operations: [], schedules: [], resources: [], tasks: [], expirations: [] };
    state.workspaceContext = {
      ...empty,
      operations: (state.conversations || []).slice(0, 6).map((c) => ({
        id: c.id,
        label: (c.title || c.label || "Operation").slice(0, 42),
      })),
    };
    return state.workspaceContext;
  }

  function pushStewardReplyFromApi(result) {
    const api = getClientApi();
    const navRaw = result.navigateTo || result.navigate_to || null;
    const navigateTo =
      typeof navRaw === "string"
        ? { path: navRaw, label: result.navigateLabel || result.navigate_label || "Open Page" }
        : navRaw;
    const openUrl = result.openUrl || result.open_url || null;
    const capFromSearch = result.cap_search?.searchUrl || null;
    const capFromText = api?.parseCapUrlFromText?.(result.reply) || null;
    const capSearchUrl =
      capFromSearch ||
      capFromText ||
      (openUrl && /gocivilairpatrol\.com/i.test(openUrl) ? openUrl : null);
    const messageOpenUrl = openUrl && !capSearchUrl ? openUrl : null;
    state.messages.push({
      id: result.steward_message_id || result.stewardMessageId || "steward-" + Date.now(),
      role: "steward",
      text: api?.stripCapMarker?.(result.reply) || result.reply || "",
      at: result.steward_message_at || result.stewardMessageAt || new Date().toISOString(),
      capSearchUrl,
      openUrl: messageOpenUrl,
      openUrlLabel: result.openUrlLabel || result.open_url_label || null,
      navigateTo,
      suggestions: result.suggestions || [],
      actions: result.actions || (navigateTo ? [{ href: navigateTo.path, label: navigateTo.label || "Open page" }] : []),
    });
    state.pendingConfirmation = result.pending_confirmation || result.pendingConfirmation || null;
    renderDataStatus(!!result.data_connected || !!result.dataConnected);
  }

  function pageContext() {
    return {
      pagePath: global.location?.pathname || "",
      pageTitle: document.title || "",
    };
  }

  async function sendMessage(text) {
    const trimmed = (text || "").trim();
    if (!trimmed || state.isThinking) return;

    if (!state.conversationId) await ensureActiveConversation();

    if (!canUseStewardCore()) {
      state.messages.push({
        id: "err-" + Date.now(),
        role: "steward",
        text: "Please sign in to use Steward.",
        at: new Date().toISOString(),
      });
      renderMessages();
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

      await global.StewardSiteIndex?.build?.().catch(() => {});

      const localNav = global.StewardSiteIndex?.isNavigationIntent?.(trimmed)
        ? tryLocalNavigation(trimmed)
        : null;

      const result = await getClientApi().invoke({
        message: trimmed,
        conversationId: state.conversationId,
        ...pageContext(),
      });

      if (localNav && !result.navigateTo && !result.navigate_to) {
        result.navigateTo = localNav;
      }

      if (result.conversation_id || result.conversationId) {
        state.conversationId = result.conversation_id || result.conversationId;
      }

      const userIdx = state.messages.findIndex((m) => m.id === optimisticId);
      if (userIdx >= 0 && result.user_message_id) {
        state.messages[userIdx].id = result.user_message_id;
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
      const openUrl = result.openUrl || result.open_url || result.cap_search?.searchUrl || null;
      if (shouldAutoOpenCapUrl(trimmed, openUrl) && !hasOpenedUrl(openUrl)) {
        getClientApi()?.openCapUrl?.(openUrl);
        rememberOpenedUrl(openUrl);
      }
      saveLocalFallback();
      renderMessages();
      input?.focus();
    } catch (err) {
      console.error("[Steward] send", err);
      state.messages = state.messages.filter((m) => m.id !== optimisticId);
      state.messages.push({
        id: "err-" + Date.now(),
        role: "steward",
        text: stewardErrorMessage(err),
        at: new Date().toISOString(),
      });
      renderMessages();
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
        "Archive this operation? It will be hidden from your active list. You can start a new operation afterward. (Nothing is permanently deleted.)"
      )
    ) {
      return;
    }
    await startNewChat();
  }

  async function switchConversation(id) {
    const conv = state.conversations.find((c) => c.id === id);
    if (!conv) return;
    state.conversationId = conv.id;
    state.conversationTitle = conv.title || "New operation";
    state.messages = await loadMessagesForConversation(conv.id);
    renderTitleField();
    renderMessages();
    state.conversations = await listConversations();
    await loadWorkspaceContext();
    renderWorkspaceContext();
  }

  function closePortalMenuBackdrop() {
    document.getElementById("portalSidebar")?.classList.remove("open");
    document.getElementById("portalBackdrop")?.classList.remove("open");
    document.body.classList.remove("menu-open");
    document.getElementById("portalMenuToggle")?.setAttribute("aria-expanded", "false");
  }

  function openPanel() {
    closePortalMenuBackdrop();
    const panel = document.getElementById("stewardPanel");
    const backdrop = document.getElementById("stewardBackdrop");
    panel?.classList.add("open");
    panel?.setAttribute("aria-hidden", "false");
    backdrop?.setAttribute("aria-hidden", "false");
    document.body.classList.add("steward-open");
    document.getElementById("stewardFab")?.setAttribute("aria-expanded", "true");
    renderModeTabs();
    loadAndRender().then(() => {
      renderMessages();
      renderWorkspaceContext();
      setTimeout(() => document.getElementById("stewardInput")?.focus(), 280);
    });
  }

  function closePanel() {
    const panel = document.getElementById("stewardPanel");
    const backdrop = document.getElementById("stewardBackdrop");
    panel?.classList.remove("open");
    panel?.setAttribute("aria-hidden", "true");
    backdrop?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("steward-open", "steward-ctx-open");
    document.getElementById("stewardFab")?.setAttribute("aria-expanded", "false");
    document.getElementById("stewardCtxToggle")?.setAttribute("aria-expanded", "false");
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

    document.getElementById("stewardArchiveChat")?.addEventListener("click", () => archiveCurrentChat());

    document.getElementById("stewardCtxToggle")?.addEventListener("click", () => toggleContextDrawer());
    document.getElementById("stewardCtxScrim")?.addEventListener("click", () => toggleContextDrawer(false));

    document.getElementById("stewardConvoTitle")?.addEventListener("change", async (e) => {
      state.conversationTitle = e.target.value.trim() || "New operation";
      await updateConversation({ title: state.conversationTitle });
    });

    document.getElementById("stewardWorkspaceContext")?.addEventListener("click", (e) => {
      if (e.target.closest("#stewardNewChat")) {
        e.preventDefault();
        startNewChat();
        return;
      }
      const convoBtn = e.target.closest("[data-convo-id]");
      if (convoBtn?.dataset.convoId) {
        e.preventDefault();
        switchConversation(convoBtn.dataset.convoId);
      }
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
      const chip = e.target.closest(".steward-chip");
      if (!chip || chip.disabled || chip.tagName === "A") return;
      const prompt = chip.dataset.prompt || "";
      if (prompt) sendMessage(prompt);
    });

    const inputEl = document.getElementById("stewardInput");
    inputEl?.addEventListener("input", () => {
      inputEl.style.height = "auto";
      inputEl.style.height = `${Math.min(inputEl.scrollHeight, 160)}px`;
    });

    document.getElementById("stewardModeTabs")?.addEventListener("click", (e) => {
      const tab = e.target.closest("[data-steward-mode]");
      if (!tab) return;
      setActiveMode(tab.dataset.stewardMode);
      toggleContextDrawer(false);
    });

    document.getElementById("stewardMessages")?.addEventListener("click", (e) => {
      const chip = e.target.closest(".steward-chip[data-prompt]");
      if (chip?.dataset.prompt) {
        e.preventDefault();
        sendMessage(chip.dataset.prompt);
        return;
      }
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
      const result = await getClientApi().invoke({
        ...pageContext(),
        conversationId: state.conversationId,
        pendingActionId: state.pendingConfirmation.action_id || state.pendingConfirmation.id,
        actionPayload: state.pendingConfirmation.payload || null,
        confirmation: true,
      });
      pushStewardReplyFromApi(result);
      saveLocalFallback();
      renderMessages();
    } catch (err) {
      console.error("[Steward] confirm", err);
      state.messages.push({
        id: "err-" + Date.now(),
        role: "steward",
        text: stewardErrorMessage(err),
        at: new Date().toISOString(),
      });
      renderMessages();
    } finally {
      setThinking(false);
    }
  }

  async function handleCancelAction() {
    if (!canUseStewardCore()) return;
    setThinking(true);
    try {
      const result = await getClientApi().invoke({
        ...pageContext(),
        conversationId: state.conversationId,
        pendingActionId: state.pendingConfirmation?.action_id || state.pendingConfirmation?.id,
        actionPayload: state.pendingConfirmation?.payload || null,
        confirmation: false,
      });
      pushStewardReplyFromApi(result);
      saveLocalFallback();
      renderMessages();
    } catch (err) {
      console.error("[Steward] cancel", err);
      state.messages.push({
        id: "err-" + Date.now(),
        role: "steward",
        text: stewardErrorMessage(err),
        at: new Date().toISOString(),
      });
      renderMessages();
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
        (global.openSteward || openSteward)();
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
        <header class="steward-gpt-head">
          <button type="button" class="steward-gpt-menu" id="stewardCtxToggle" aria-expanded="false" aria-controls="stewardWorkspaceContext" title="History &amp; context">☰</button>
          <div class="steward-gpt-title-wrap">
            <h2 id="stewardTitle">Steward for CAP</h2>
            <p class="steward-gpt-status steward-status"><span class="steward-status-dot" aria-hidden="true"></span> Operational standby</p>
          </div>
          <button type="button" class="steward-gpt-close" id="stewardClose" aria-label="Close Steward">✕</button>
        </header>

        <div class="steward-gpt-body">
          <div class="steward-ctx-scrim" id="stewardCtxScrim" aria-hidden="true"></div>
          <aside class="steward-ctx-drawer" aria-label="History and squadron context">
            <div class="steward-op-title-row">
              <label class="visually-hidden" for="stewardConvoTitle">Operation title</label>
              <input type="text" id="stewardConvoTitle" class="steward-op-title" value="New operation" maxlength="80" placeholder="Operation title" />
              <button type="button" class="steward-ctx-action" id="stewardArchiveChat" style="margin-top:8px">Archive operation</button>
            </div>
            <div id="stewardWorkspaceContext"><p class="steward-ctx-loading">Loading…</p></div>
          </aside>

          <div class="steward-gpt-main">
            <div class="steward-mode-pills" id="stewardModeTabs" role="tablist" aria-label="Steward focus areas"></div>
            <div class="steward-conversation-pane">
              <div class="steward-messages" id="stewardMessages" role="log" aria-live="polite"></div>
              <div class="steward-typing" id="stewardTyping" hidden aria-live="polite">
                <div class="steward-msg steward-msg--steward">
                  <div class="steward-msg-bubble">
                    <span class="steward-typing-dots" aria-label="Steward is working"><span></span><span></span><span></span></span>
                  </div>
                </div>
              </div>
            </div>
            <footer class="steward-gpt-composer">
              <div class="steward-chips" id="stewardPrompts"></div>
              <form class="steward-composer-box" id="stewardForm">
                <label class="visually-hidden" for="stewardInput">Message Steward</label>
                <textarea id="stewardInput" name="message" rows="1" placeholder="Message Steward…" autocomplete="off"></textarea>
                <button type="submit" class="steward-send-icon" id="stewardSend" aria-label="Send message">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </button>
              </form>
              <p class="steward-composer-foot">${escapeHtml(DISCLAIMER)} Resource links are managed on Files &amp; Resources. Google Drive integration may be added later.</p>
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
    await global.SMTN170Auth?.syncSessionFromFirebase?.();
    await ensureActiveConversation();
    await loadWorkspaceContext();
    state.loaded = true;
    renderTitleField();
    renderWorkspaceContext();
    renderMessages();
    saveLocalFallback();
  }

  async function init() {
    injectStewardCss();
    await global.SMTN170Firebase?.whenReady?.();
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
    openSteward(text);
  }

  async function openSteward(promptText = "") {
    if (!document.getElementById("stewardRoot")) {
      injectWidget();
      bindPanelEvents();
    } else {
      bindPanelEvents();
      bindOpenTriggers();
    }
    openPanel();
    try {
      await loadAndRender();
    } catch (err) {
      console.error("[Steward] load", err);
    }
    if ((promptText || "").trim()) {
      await sendMessage(String(promptText).trim());
    }
  }

  global.openSteward = openSteward;

  global.SMTN170Steward = {
    openPanel,
    openSteward,
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
