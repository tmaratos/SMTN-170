/**
 * TN-170 Squadron File Library — simple shared drive (Supabase storage + uploaded_files).
 */
(function initFileLibrary(global) {
  const FOLDERS = [
    "General",
    "Meeting Schedule",
    "Meeting Minutes",
    "Safety",
    "Operations",
    "Emergency Services",
    "Aerospace Education",
    "Cadet Programs",
    "Training",
    "Finance",
    "Forms",
  ];

  const ALLOWED_EXT = ["pdf", "doc", "docx", "xls", "xlsx", "csv", "png", "jpg", "jpeg", "gif", "webp", "zip"];

  let state = { folder: "General", files: [], uploading: [] };

  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
  }

  function ext(name) {
    const p = (name || "").split(".");
    return p.length > 1 ? p.pop().toLowerCase() : "";
  }

  function formatSize(n) {
    if (!n) return "—";
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }

  function formatWhen(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  async function fetchFiles() {
    const sb = global.SMTN170Supabase?.getClient?.();
    if (!sb) return [];
    const { data, error } = await sb.from("uploaded_files").select("*").order("updated_at", { ascending: false });
    if (error) {
      console.warn("[files]", error.message);
      return [];
    }
    return (data || []).map(mapRow);
  }

  function mapRow(row) {
    return {
      id: row.id,
      name: row.name,
      folder: row.folder || "General",
      storage_path: row.storage_path,
      mime_type: row.mime_type,
      size_bytes: row.size_bytes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_worked_at: row.last_worked_at,
      uploaded_by_name: row.uploaded_by_name || global.SMTN170Auth?.actorDisplay?.() || "Squadron member",
      last_worked_by_name: row.last_worked_by_name || null,
    };
  }

  function subscribeRealtime() {
    return global.SMTN170Supabase?.subscribeTable?.("uploaded_files", null, async () => {
      state.files = await fetchFiles();
      renderList();
    });
  }

  async function uploadFile(file) {
    const sb = global.SMTN170Supabase?.getClient?.();
    const auth = global.SMTN170Auth;
    if (!sb || !auth?.loadSession?.()) throw new Error("Sign in to upload files");

    const e = ext(file.name);
    if (e && !ALLOWED_EXT.includes(e)) throw new Error("File type not allowed for squadron library");

    const uid = auth.actorId();
    const path = `${uid}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const bucket = global.SMTN170Supabase.storageBucket();

    const item = { id: "up-" + Date.now(), name: file.name, progress: 0 };
    state.uploading.push(item);
    renderList();

    const { error: upErr } = await sb.storage.from(bucket).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (upErr) throw upErr;

    item.progress = 80;
    renderList();

    const now = new Date().toISOString();
    const { data: row, error: dbErr } = await sb
      .from("uploaded_files")
      .insert({
        name: file.name,
        folder: state.folder,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: uid,
        last_worked_by: uid,
        last_worked_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (dbErr) throw dbErr;

    state.uploading = state.uploading.filter((u) => u.id !== item.id);
    const mapped = mapRow(row);
    state.files.unshift(mapped);
    renderList();

    if (global.SMTN170FileIngestion?.ingestUploadedFile) {
      try {
        const folderKey = FOLDER_TO_CATEGORY[state.folder] || state.folder;
        const ingestResult = await global.SMTN170FileIngestion.ingestUploadedFile({
          ...row,
          folder: folderKey,
        });
        showIngestNotice(ingestResult);
        global.SMTN170ImportCenter?.setPending?.(ingestResult);
      } catch (err) {
        showIngestNotice({ message: err.message, ok: false });
      }
    }
  }

  const FOLDER_TO_CATEGORY = {
    General: "general",
    "Meeting Schedule": "meeting_schedule",
    "Meeting Minutes": "meeting_minutes",
    Safety: "safety",
    Operations: "general",
    "Emergency Services": "general",
    "Aerospace Education": "training",
    "Cadet Programs": "training",
    Training: "training",
    Finance: "forms",
    Forms: "forms",
  };

  function showIngestNotice(result) {
    const el = document.getElementById("flIngestNotice");
    if (!el) return;
    el.hidden = false;
    const conf = result?.confidence != null ? ` · confidence ${Math.round(result.confidence * 100)}%` : "";
    const detected = result?.importMeta?.label || result?.detectedType || "";
    el.innerHTML = `<p><strong>Smart import:</strong> ${escapeHtml(result?.message || "Upload complete.")}${detected ? ` <em>(${escapeHtml(detected)}${conf})</em>` : ""}</p>`;
    if (result?.needsReview) {
      el.innerHTML += `<p class="page-intro" style="margin-top:8px">Review extracted records in the <strong>Import Center</strong> section above before confirming.</p>`;
    }
    if (result?.needsReview && result.drafts?.length) {
      el.innerHTML += `<button type="button" class="btn-gold btn-sm" id="flCommitDrafts" style="margin-top:10px">Confirm ${result.drafts.length} record(s) here</button>`;
      document.getElementById("flCommitDrafts")?.addEventListener("click", async () => {
        try {
          const out = await global.SMTN170FileIngestion.confirmImport(result);
          el.innerHTML = `<p>${escapeHtml(out.message || `${result.drafts.length} record(s) imported.`)}</p>`;
          global.SMTN170Shell?.renderDashboardV2?.();
        } catch (e) {
          el.innerHTML = `<p class="import-error">${escapeHtml(e.message)}</p>`;
        }
      });
    }
  }

  async function moveFile(id, folder) {
    const sb = global.SMTN170Supabase?.getClient?.();
    const uid = global.SMTN170Auth?.actorId?.();
    if (!sb) return;
    const now = new Date().toISOString();
    await sb
      .from("uploaded_files")
      .update({ folder, last_worked_by: uid, last_worked_at: now, updated_at: now })
      .eq("id", id);
    state.files = await fetchFiles();
    renderList();
  }

  async function renameFile(id, name) {
    const sb = global.SMTN170Supabase?.getClient?.();
    const uid = global.SMTN170Auth?.actorId?.();
    if (!sb || !name?.trim()) return;
    const now = new Date().toISOString();
    await sb
      .from("uploaded_files")
      .update({ name: name.trim(), last_worked_by: uid, last_worked_at: now, updated_at: now })
      .eq("id", id);
    state.files = await fetchFiles();
    renderList();
  }

  async function deleteFile(id, storagePath) {
    if (!global.SMTN170Auth?.can?.("delete_records")) {
      if (!confirm("Remove this file from the squadron library?")) return;
    }
    const sb = global.SMTN170Supabase?.getClient?.();
    if (!sb) return;
    const bucket = global.SMTN170Supabase.storageBucket();
    if (storagePath) await sb.storage.from(bucket).remove([storagePath]);
    await sb.from("uploaded_files").delete().eq("id", id);
    state.files = await fetchFiles();
    renderList();
  }

  async function getPublicUrl(storagePath) {
    const sb = global.SMTN170Supabase?.getClient?.();
    if (!sb) return null;
    const { data } = sb.storage.from(global.SMTN170Supabase.storageBucket()).getPublicUrl(storagePath);
    return data?.publicUrl || null;
  }

  async function previewFile(file) {
    const sb = global.SMTN170Supabase?.getClient?.();
    if (!sb) return;
    const { data, error } = await sb.storage
      .from(global.SMTN170Supabase.storageBucket())
      .createSignedUrl(file.storage_path, 120);
    if (error) {
      alert("Could not open preview.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  function renderList() {
    const list = document.getElementById("flFileList");
    if (!list) return;

    const inFolder = state.files.filter((f) => f.folder === state.folder);
    const uploads = state.uploading
      .map(
        (u) => `
      <div class="fl-file-row">
        <div class="fl-file-icon">…</div>
        <div class="fl-file-main">
          <strong>${escapeHtml(u.name)}</strong>
          <div class="fl-progress"><span style="width:${u.progress}%"></span></div>
          <p class="fl-file-meta">Uploading…</p>
        </div>
      </div>`
      )
      .join("");

    const rows = inFolder.length
      ? inFolder
          .map((f) => {
            const audit = global.SMTN170Auth?.renderAuditHtml?.({
              last_worked_by_name: f.last_worked_by_name,
              last_worked_at: f.last_worked_at,
              updated_at: f.updated_at,
            });
            return `
        <div class="fl-file-row" data-file-id="${escapeHtml(f.id)}">
          <div class="fl-file-icon">${escapeHtml(ext(f.name).toUpperCase().slice(0, 3) || "DOC")}</div>
          <div class="fl-file-main">
            <strong>${escapeHtml(f.name)}</strong>
            <p class="fl-file-meta">Uploaded by ${escapeHtml(f.uploaded_by_name)} · ${formatSize(f.size_bytes)} · ${formatWhen(f.updated_at)}</p>
            ${audit || ""}
          </div>
          <div class="fl-file-actions">
            <button type="button" class="ghost-btn" data-fl-action="preview" data-id="${escapeHtml(f.id)}">Open</button>
            <button type="button" class="ghost-btn" data-fl-action="rename" data-id="${escapeHtml(f.id)}">Rename</button>
            <button type="button" class="ghost-btn" data-fl-action="move" data-id="${escapeHtml(f.id)}">Move</button>
            <button type="button" class="ghost-btn" data-fl-action="delete" data-id="${escapeHtml(f.id)}" data-path="${escapeHtml(f.storage_path)}">Delete</button>
          </div>
        </div>`;
          })
          .join("")
      : `<p class="page-intro" style="margin:0">No files have been uploaded yet. Drop a file above to add your first upload.</p>`;

    list.innerHTML = uploads + rows;
  }

  function render() {
    const root = document.getElementById("fileLibraryRoot");
    if (!root) return;

    const folderBtns = FOLDERS.map(
      (f) =>
        `<button type="button" class="fl-folder-btn ${state.folder === f ? "active" : ""}" data-fl-folder="${escapeHtml(f)}">${escapeHtml(f)}</button>`
    ).join("");

    root.innerHTML = `
      <div class="fl-root">
        <p class="page-intro">Shared squadron drive — drop files here, sort into folders, open PDFs and forms. All approved members can upload and organize.</p>
        <div data-steward-context="files"></div>
        <div class="fl-toolbar">
          <div class="fl-folders" role="group" aria-label="Folders">${folderBtns}</div>
        </div>
        <div class="fl-dropzone" id="flDropzone">
          <p><strong>Drop files here</strong> or tap to choose</p>
          <small>PDF, Word, Excel, images, ZIP · stored in squadron-files</small>
          <input type="file" id="flFileInput" multiple hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.webp,.zip" />
        </div>
        <div class="ingest-review-panel" id="flIngestNotice" hidden role="status"></div>
        <div class="fl-file-list" id="flFileList"></div>
      </div>`;

    global.SMTN170Pages?.injectStewardContexts?.();
    global.SMTN170Pages?.bindStewardContextActions?.();

    const dz = document.getElementById("flDropzone");
    const input = document.getElementById("flFileInput");
    dz?.addEventListener("click", () => input?.click());
    input?.addEventListener("change", () => {
      Array.from(input.files || []).forEach((f) => uploadFile(f).catch((e) => alert(e.message)));
      input.value = "";
    });
    ["dragenter", "dragover"].forEach((ev) => {
      dz?.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.add("fl-dropzone--over");
      });
    });
    dz?.addEventListener("dragleave", () => dz.classList.remove("fl-dropzone--over"));
    dz?.addEventListener("drop", (e) => {
      e.preventDefault();
      dz.classList.remove("fl-dropzone--over");
      Array.from(e.dataTransfer?.files || []).forEach((f) => uploadFile(f).catch((err) => alert(err.message)));
    });

    root.addEventListener("click", async (e) => {
      const folderBtn = e.target.closest("[data-fl-folder]");
      if (folderBtn) {
        state.folder = folderBtn.dataset.flFolder;
        render();
        return;
      }
      const btn = e.target.closest("[data-fl-action]");
      if (!btn) return;
      const id = btn.dataset.id;
      const file = state.files.find((f) => f.id === id);
      if (btn.dataset.flAction === "preview" && file) previewFile(file);
      if (btn.dataset.flAction === "rename" && file) {
        const n = prompt("New file name:", file.name);
        if (n) renameFile(id, n);
      }
      if (btn.dataset.flAction === "move" && file) {
        const f = prompt("Move to folder:\n" + FOLDERS.join(", "), file.folder);
        if (f && FOLDERS.includes(f)) moveFile(id, f);
      }
      if (btn.dataset.flAction === "delete") deleteFile(id, btn.dataset.path);
    });

    renderList();
  }

  async function init() {
    await global.SMTN170Supabase?.whenReady?.();
    await global.SMTN170Auth?.syncSessionFromSupabase?.();
    state.files = await fetchFiles();
    if (!state.files.length && !global.SMTN170Supabase?.isConfigured?.()) {
      state.files = [];
    }
    render();
    subscribeRealtime();
  }

  global.SMTN170FileLibrary = { init, render, fetchFiles };
  global.addEventListener("smtn170:auth-changed", () => init());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (document.getElementById("fileLibraryRoot")) init();
    });
  } else if (document.getElementById("fileLibraryRoot")) {
    init();
  }
})(window);
