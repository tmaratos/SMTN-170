/**
 * TN-170 document viewer — PDF, images, text, CSV, spreadsheets in-page.
 */
(function initDocViewer(global) {
  const TEXT_EXT = ["txt", "csv", "json", "md", "log", "html", "htm"];

  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  function ext(name) {
    const p = (name || "").split(".");
    return p.length > 1 ? p.pop().toLowerCase() : "";
  }

  async function loadScript(src) {
    if (src.includes("xlsx") && global.XLSX) return;
    if (src.includes("mammoth") && global.mammoth) return;
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Could not load viewer library."));
      document.head.appendChild(s);
    });
  }

  async function downloadBlob(file) {
    const sb = global.SMTN170Supabase?.getClient?.();
    if (!sb) throw new Error("Sign in to view files.");
    const bucket = global.SMTN170Supabase?.storageBucket?.() || "squadron-files";
    const { data, error } = await sb.storage.from(bucket).download(file.file_path || file.storage_path);
    if (error) throw new Error(error.message);
    return data;
  }

  async function getSignedUrl(file) {
    const sb = global.SMTN170Supabase?.getClient?.();
    if (!sb) return null;
    const { data, error } = await sb.storage
      .from(global.SMTN170Supabase.storageBucket())
      .createSignedUrl(file.file_path || file.storage_path, 3600);
    if (error) return null;
    return data?.signedUrl;
  }

  async function renderContent(file, blob) {
    const e = ext(file.name);
    const mime = file.mime_type || "";

    if (e === "pdf" || mime.includes("pdf")) {
      const url = await getSignedUrl(file);
      if (!url) throw new Error("Could not load PDF.");
      return `<iframe class="doc-viewer-frame" src="${escapeHtml(url)}" title="${escapeHtml(file.name)}"></iframe>`;
    }

    if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(e) || mime.startsWith("image/")) {
      const url = await getSignedUrl(file);
      if (!url) throw new Error("Could not load image.");
      return `<div class="doc-viewer-image-wrap"><img src="${escapeHtml(url)}" alt="${escapeHtml(file.name)}" /></div>`;
    }

    if (TEXT_EXT.includes(e) || mime.includes("text")) {
      const text = await blob.text();
      return `<pre class="doc-viewer-text">${escapeHtml(text)}</pre>`;
    }

    if (e === "csv") {
      const text = await blob.text();
      const rows = text.split(/\r?\n/).filter(Boolean).slice(0, 500);
      const table = rows
        .map((line) => {
          const cells = line.split(",").map((c) => `<td>${escapeHtml(c.trim())}</td>`).join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");
      return `<div class="doc-viewer-table-wrap"><table class="doc-viewer-table"><tbody>${table}</tbody></table></div>`;
    }

    if (e === "xlsx" || e === "xls") {
      await loadScript("https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js");
      const buf = await blob.arrayBuffer();
      const wb = global.XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const html = global.XLSX.utils.sheet_to_html(sheet, { id: "doc-viewer-sheet" });
      return `<div class="doc-viewer-table-wrap">${html}</div>`;
    }

    if (e === "docx") {
      try {
        await loadScript("https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js");
        const buf = await blob.arrayBuffer();
        const result = await global.mammoth.convertToHtml({ arrayBuffer: buf });
        return `<div class="doc-viewer-docx">${result.value}</div>`;
      } catch {
        return `<p class="doc-viewer-fallback">Word document preview is not available in the browser. <a href="#" data-doc-download>Download file</a> to open locally.</p>`;
      }
    }

    const url = await getSignedUrl(file);
    if (url) {
      return `<p class="doc-viewer-fallback">No in-browser preview for this format. <a href="${escapeHtml(url)}" target="_blank" rel="noopener">Open or download file</a></p>`;
    }
    return `<p class="doc-viewer-fallback">Preview not available for this file type.</p>`;
  }

  function ensureShell() {
    if (document.getElementById("docViewerModal")) return;
    const el = document.createElement("div");
    el.id = "docViewerModal";
    el.className = "doc-viewer-modal";
    el.hidden = true;
    el.innerHTML = `
      <div class="doc-viewer-backdrop" data-doc-close></div>
      <section class="doc-viewer-panel" role="dialog" aria-modal="true" aria-labelledby="docViewerTitle">
        <header class="doc-viewer-head">
          <div>
            <h2 id="docViewerTitle">Document</h2>
            <p id="docViewerMeta" class="doc-viewer-meta"></p>
          </div>
          <button type="button" class="doc-viewer-close" data-doc-close aria-label="Close">✕</button>
        </header>
        <div class="doc-viewer-body" id="docViewerBody">
          <p class="doc-viewer-loading">Loading…</p>
        </div>
      </section>`;
    document.body.appendChild(el);
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-doc-close]")) close();
    });
  }

  function close() {
    const m = document.getElementById("docViewerModal");
    if (m) {
      m.hidden = true;
      document.body.classList.remove("doc-viewer-open");
    }
  }

  async function open(file) {
    ensureShell();
    const modal = document.getElementById("docViewerModal");
    const body = document.getElementById("docViewerBody");
    const title = document.getElementById("docViewerTitle");
    const meta = document.getElementById("docViewerMeta");
    if (!modal || !body) return;

    title.textContent = file.name || "Document";
    meta.textContent = [file.folder, file.mime_type].filter(Boolean).join(" · ");
    body.innerHTML = `<p class="doc-viewer-loading">Loading document…</p>`;
    modal.hidden = false;
    document.body.classList.add("doc-viewer-open");

    try {
      const blob = await downloadBlob(file);
      body.innerHTML = await renderContent(file, blob);
      body.querySelector("[data-doc-download]")?.addEventListener("click", async (e) => {
        e.preventDefault();
        const url = await getSignedUrl(file);
        if (url) global.open(url, "_blank");
      });
    } catch (err) {
      body.innerHTML = `<p class="doc-viewer-error">${escapeHtml(err.message)}</p>`;
    }
  }

  function injectCss() {
    if (document.querySelector('link[href*="doc-viewer.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "./css/doc-viewer.css?v=1";
    document.head.appendChild(link);
  }

  injectCss();
  global.SMTN170DocViewer = { open, close };
})(window);
