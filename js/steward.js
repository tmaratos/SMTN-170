/**
 * Steward for CAP — conversational assistant UI (front-end prototype).
 * Built by Faith Based Innovations · adapted for Civil Air Patrol operations.
 * Future: Supabase per-user chat history, CAP publications index, squadron files.
 */
(function initSteward(global) {
  const STORAGE_KEY = "smtn170_steward_chat_session";
  const DISCLAIMER =
    "Steward responses are assistance only. Official CAP publications and command guidance remain authoritative.";

  const DEFAULT_PROMPTS = [
    "What monthly tasks should our squadron complete?",
    "Help prepare a senior member meeting agenda.",
    "What inspection items should we check this month?",
    "Find Biannual Flight Review readiness items.",
    "Help categorize uploaded files.",
  ];

  const FALLBACK_RESPONSES = {
    monthly:
      "For this month, prioritize the monthly activity report, logged safety briefing, updated squadron calendar, and filed staff meeting minutes.",
    agenda:
      "Suggested senior member meeting flow: call to order, safety moment, commander remarks, directorate updates, training block, and announcements.",
    inspection:
      "Inspection prep should cover ORMS evidence, cadet protection compliance, finance accountability, and directorate packets.",
    bfr:
      "Biannual Flight Review items include directorate packets, scheduled review nights, overdue directorates, and missing documentation.",
    files:
      "When uploading, Steward will suggest a filing category; staff can override before the file is stored.",
  };

  let activeSource = "cap";
  let messages = [];
  let isThinking = false;
  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  function getData() {
    return global.SMTN170_DATA || {};
  }

  function getPrompts() {
    const list = getData().STEWARD_PROMPTS;
    return list && list.length ? list : DEFAULT_PROMPTS;
  }

  function loadSession() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveSession() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* quota / private mode */
    }
  }

  function sourceLabel() {
    const map = {
      cap: "CAP reference placeholder",
      files: "Squadron file placeholder",
      history: "Profile history placeholder",
    };
    return map[activeSource] || map.cap;
  }

  function pickResponse(userText) {
    const t = (userText || "").toLowerCase();
    const responses = getData().STEWARD_RESPONSES || FALLBACK_RESPONSES;

    if (/monthly|task|report/.test(t)) return responses.monthly;
    if (/agenda|meeting|staff/.test(t)) return responses.agenda;
    if (/inspection|sui|checklist/.test(t)) return responses.inspection;
    if (/biannual|bfr|flight review|readiness/.test(t)) return responses.bfr;
    if (/categor|upload|file|library/.test(t)) return responses.files;

    const fallback = getData().STEWARD_PLACEHOLDER_RESPONSES || [];
    if (fallback.length) {
      const idx = messages.filter((m) => m.role === "steward").length % fallback.length;
      const item = fallback[idx];
      return typeof item === "string" ? item : item.text;
    }

    return (
      "I can help with squadron operations topics in this prototype — monthly tasks, meeting agendas, inspection prep, Biannual Flight Reviews, and file categorization. Connect Supabase and CAP sources for live answers."
    );
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
    isThinking = on;
    const typing = document.getElementById("stewardTyping");
    if (typing) typing.hidden = !on;
    setComposeEnabled(!on);
    if (on) scrollMessagesToEnd();
  }

  function renderMessages() {
    const root = document.getElementById("stewardMessages");
    if (!root) return;

    if (!messages.length) {
      root.innerHTML = `
        <div class="steward-welcome">
          <div class="steward-welcome-avatar" aria-hidden="true">S</div>
          <div class="steward-welcome-copy">
            <p><strong>Steward for CAP</strong></p>
            <p>Ask about squadron operations, readiness, inspections, Biannual Flight Reviews, and filing. This is a <strong>front-end prototype</strong> — responses are placeholders until Supabase and CAP sources connect.</p>
          </div>
        </div>`;
      return;
    }

    root.innerHTML = messages
      .map((m) => {
        const isUser = m.role === "user";
        const label = isUser ? "You" : "Steward";
        const avatar = isUser ? "You" : "S";
        const source =
          m.source && !isUser
            ? `<span class="steward-source-tag">${escapeHtml(m.source)}</span>`
            : "";
        const time = m.at ? `<time class="steward-msg-time">${escapeHtml(formatTime(m.at))}</time>` : "";

        return `<div class="steward-msg steward-msg--${m.role}" data-msg-id="${escapeHtml(m.id || "")}">
          <div class="steward-msg-meta">
            <span class="steward-msg-avatar" aria-hidden="true">${escapeHtml(avatar)}</span>
            <span class="steward-msg-label">${escapeHtml(label)}</span>
            ${time}
          </div>
          <div class="steward-msg-bubble">${escapeHtml(m.text)}${source}</div>
        </div>`;
      })
      .join("");

    scrollMessagesToEnd();
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

  function setComposeEnabled(enabled) {
    const input = document.getElementById("stewardInput");
    const sendBtn = document.getElementById("stewardSend");
    const chips = document.querySelectorAll(".steward-prompt-chip");
    if (input) input.disabled = !enabled;
    if (sendBtn) sendBtn.disabled = !enabled;
    chips.forEach((c) => {
      c.disabled = !enabled;
    });
  }

  function sendMessage(text) {
    const trimmed = (text || "").trim();
    if (!trimmed || isThinking) return;

    const userMsg = {
      id: `u-${Date.now()}`,
      role: "user",
      text: trimmed,
      at: new Date().toISOString(),
    };
    messages.push(userMsg);
    saveSession();
    renderMessages();

    const input = document.getElementById("stewardInput");
    if (input) {
      input.value = "";
      input.focus();
    }

    setThinking(true);

    const delay = 550 + Math.min(trimmed.length * 8, 400);

    setTimeout(() => {
      const replyText = pickResponse(trimmed);
      messages.push({
        id: `s-${Date.now()}`,
        role: "steward",
        text: replyText,
        source: sourceLabel(),
        at: new Date().toISOString(),
      });
      saveSession();
      setThinking(false);
      renderMessages();
      input?.focus();
    }, delay);
  }

  function setSource(source) {
    activeSource = source;
    document.querySelectorAll("[data-steward-source]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.stewardSource === source);
      btn.setAttribute("aria-selected", btn.dataset.stewardSource === source ? "true" : "false");
    });
  }

  function openPanel() {
    const panel = document.getElementById("stewardPanel");
    panel?.classList.add("open");
    panel?.setAttribute("aria-hidden", "false");
    document.body.classList.add("steward-open");
    document.getElementById("stewardFab")?.setAttribute("aria-expanded", "true");
    setTimeout(() => document.getElementById("stewardInput")?.focus(), 280);
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

    document.querySelectorAll("[data-steward-source]").forEach((btn) => {
      btn.addEventListener("click", () => setSource(btn.dataset.stewardSource));
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && document.getElementById("stewardPanel")?.classList.contains("open")) {
        closePanel();
      }
    });
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
      <button type="button" class="steward-fab" id="stewardFab" aria-expanded="false" aria-controls="stewardPanel" aria-label="Open Steward for CAP chat">
        <span class="steward-fab-icon" aria-hidden="true">💬</span>
        <span class="steward-fab-label">Steward</span>
      </button>
      <div class="steward-backdrop" id="stewardBackdrop" aria-hidden="true"></div>
      <section class="steward-panel" id="stewardPanel" role="dialog" aria-modal="true" aria-labelledby="stewardTitle" aria-hidden="true">
        <header class="steward-panel-head">
          <div class="steward-head-text">
            <p class="steward-kicker">Built by Faith Based Innovations</p>
            <h2 id="stewardTitle">Steward for CAP</h2>
            <p class="steward-status"><span class="steward-status-dot" aria-hidden="true"></span> Front-end prototype</p>
          </div>
          <button type="button" class="steward-close" id="stewardClose" aria-label="Close Steward chat">✕</button>
        </header>

        <p class="steward-disclaimer">${escapeHtml(DISCLAIMER)}</p>

        <div class="steward-source-tabs" role="tablist" aria-label="Reference source filter">
          <button type="button" role="tab" class="active" data-steward-source="cap" aria-selected="true">CAP Standards</button>
          <button type="button" role="tab" data-steward-source="files" aria-selected="false">Squadron Files</button>
          <button type="button" role="tab" data-steward-source="history" aria-selected="false">My Profile History</button>
        </div>

        <div class="steward-chat-body">
          <div class="steward-messages" id="stewardMessages" role="log" aria-live="polite" aria-relevant="additions"></div>
          <div class="steward-typing" id="stewardTyping" hidden>
            <div class="steward-msg steward-msg--steward">
              <div class="steward-msg-meta">
                <span class="steward-msg-avatar" aria-hidden="true">S</span>
                <span class="steward-msg-label">Steward</span>
              </div>
              <div class="steward-msg-bubble steward-msg-bubble--typing">
                <span class="steward-typing-dots" aria-label="Steward is typing"><span></span><span></span><span></span></span>
              </div>
            </div>
          </div>
        </div>

        <footer class="steward-chat-footer">
          <div class="steward-prompts-label">Suggested prompts</div>
          <div class="steward-prompts" id="stewardPrompts"></div>
          <form class="steward-compose" id="stewardForm">
            <button type="button" class="steward-mic" id="stewardMic" title="Voice input (coming soon)" disabled aria-label="Voice input placeholder">🎤</button>
            <label class="steward-input-wrap">
              <span class="visually-hidden">Ask Steward</span>
              <input type="text" id="stewardInput" name="message" placeholder="Ask Steward…" autocomplete="off" aria-label="Ask Steward" />
            </label>
            <button type="submit" class="steward-send" id="stewardSend">Send</button>
          </form>
        </footer>
      </section>`;

    document.body.appendChild(root);
    bindPanelEvents();
    renderPrompts();
    renderMessages();
  }

  function init() {
    messages = loadSession();
    if (!document.getElementById("stewardRoot")) {
      injectWidget();
    } else {
      renderPrompts();
      renderMessages();
    }
    bindOpenTriggers();
  }

  function rebind() {
    bindOpenTriggers();
  }

  global.SMTN170Steward = {
    STORAGE_KEY,
    openPanel,
    closePanel,
    sendMessage,
    rebind,
    init,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
