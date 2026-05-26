/**
 * TN-170 Squadron File Library — simple shared drive (Firebase Storage + uploadedFiles).
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
    const { data, error } = await sb.from("uploaded_files").select("*").order("created_at", { ascending: false });
    if (error) {
      console.warn("[files]", error.message);
      return [];
    }
    return (data || []).map(mapRow);
  }

  function mapRow(row) {
    const uid = global.SMTN170Auth?.actorId?.();
    const fileName = row.file_name || row.name;
    const filePath = row.file_path || row.storage_path;
    const categoryKey =
      row.file_category ||
      FOLDER_TO_CATEGORY[row.folder] ||
      (row.folder && !CATEGORY_TO_FOLDER[row.folder] ? row.folder : "general");
    const displayFolder = CATEGORY_TO_FOLDER[categoryKey] || row.folder || "General";
    const ownerName =
      row.uploaded_by_name ||
      row.owner_name ||
      (row.owner_id && row.owner_id === uid ? global.SMTN170Auth?.actorDisplay?.() : null);
    return {
      id: row.id,
      name: fileName,
      file_name: fileName,
      folder: displayFolder,
      file_category: categoryKey,
      storage_path: filePath,
      file_path: filePath,
      mime_type: row.mime_type || row.file_type,
      size_bytes: row.size_bytes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_worked_at: row.last_worked_at,
      owner_id: row.owner_id,
      visibility: row.visibility,
      steward_suggested_category: row.steward_suggested_category,
      uploaded_by_name: ownerName || "Squadron member",
      last_worked_by_name: row.last_worked_by_name || null,
    };
  }

  function showUploadError(message) {
    const el = document.getElementById("flIngestNotice");
    if (!el) return;
    el.hidden = false;
    el.innerHTML = `<p class="import-error">${escapeHtml(message)}</p>`;
  }

  function clearUploadNotice() {
    const el = document.getElementById("flIngestNotice");
    if (!el) return;
    el.hidden = true;
    el.innerHTML = "";
  }

  function subscribeRealtime() {
    return global.SMTN170Supabase?.subscribeTable?.("uploaded_files", null, async () => {
      state.files = await fetchFiles();
      renderList();
    });
  }

  async function uploadFile(file) {
    const sb = global.SMTN170Supabase?.getClient?.();
    if (!sb) {
      showUploadError("Sign in to upload files.");
      return;
    }

    const e = ext(file.name);
    if (e && !ALLOWED_EXT.includes(e)) {
      showUploadError("File type not allowed for squadron library.");
      return;
    }

    const { data: userData, error: userErr } = await sb.auth.getUser();
    const uid = userData?.user?.id;
    if (userErr || !uid) {
      showUploadError("Sign in to upload files.");
      return;
    }

    const path = `${uid}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const bucket = global.SMTN170Supabase.storageBucket();

    const item = { id: "up-" + Date.now(), name: file.name, progress: 0 };
    state.uploading.push(item);
    clearUploadNotice();
    renderList();

    let storageOk = false;
    try {
      const { error: upErr } = await sb.storage.from(bucket).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) {
        showUploadError(`Upload failed: ${upErr.message}`);
        return;
      }
      storageOk = true;

      item.progress = 80;
      renderList();

      const folderKey = FOLDER_TO_CATEGORY[state.folder] || "general";
      const { data: row, error: dbErr } = await sb
        .from("uploaded_files")
        .insert({
          owner_id: uid,
          file_name: file.name,
          file_path: path,
          file_category: folderKey,
          steward_suggested_category: folderKey,
          visibility: "squadron",
        })
        .select()
        .single();

      if (dbErr) {
        await sb.storage.from(bucket).remove([path]).catch(() => {});
        showUploadError(`File index failed: ${dbErr.message}`);
        return;
      }

      state.uploading = state.uploading.filter((u) => u.id !== item.id);
      const mapped = mapRow(row);
      state.files.unshift(mapped);
      renderList();

      if (global.SMTN170FileIngestion?.ingestUploadedFile) {
        try {
          const folderKey = FOLDER_TO_CATEGORY[state.folder] || state.folder;
          const ingestResult = await global.SMTN170FileIngestion.ingestUploadedFile(mapped, {
            detectedType: folderKey === "meeting_schedule" ? "meeting_schedule" : undefined,
          });
          showIngestNotice(ingestResult);
          global.SMTN170ImportCenter?.setPending?.(ingestResult);
        } catch (err) {
          showIngestNotice({
            ok: false,
            message: err.message?.includes("Import processor")
              ? err.message
              : `Extraction failed: ${err.message}`,
          });
        }
      }
    } finally {
      if (!storageOk || state.uploading.some((u) => u.id === item.id)) {
        state.uploading = state.uploading.filter((u) => u.id !== item.id);
        renderList();
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

  const CATEGORY_TO_FOLDER = Object.fromEntries(
    Object.entries(FOLDER_TO_CATEGORY).map(([label, key]) => [key, label])
  );

  function showIngestNotice(result) {
    const el = document.getElementById("flIngestNotice");
    if (!el) return;
    el.hidden = false;
    const conf = result?.confidence != null ? ` · confidence ${Math.round(result.confidence * 100)}%` : "";
    const detected = result?.importMeta?.label || result?.detectedType || "";
    const warn =
      result?.warnings?.length && !result.message?.includes("not installed")
        ? `<p class="page-intro" style="margin-top:8px">${escapeHtml(result.warnings.join(" "))}</p>`
        : "";
    const ocr =
      result?.needsOcr
        ? `<p class="page-intro import-ocr-notice" style="margin-top:8px">This file was uploaded and indexed. OCR is required before it can be read automatically.</p>`
        : "";
    el.innerHTML = `<p><strong>Smart import:</strong> ${escapeHtml(result?.message || "Upload complete.")}${detected ? ` <em>(${escapeHtml(detected)}${conf})</em>` : ""}</p>${ocr}${warn}`;
    if (result?.needsReview) {
      el.innerHTML += `<p class="page-intro" style="margin-top:8px">Review extracted records in the <strong>Import Center</strong> section above before confirming.</p>`;
    }
  }

  async function moveFile(id, folder) {
    const sb = global.SMTN170Supabase?.getClient?.();
    if (!sb) return;
    const fileCategory = FOLDER_TO_CATEGORY[folder] || folder;
    await sb.from("uploaded_files").update({ file_category: fileCategory }).eq("id", id);
    state.files = await fetchFiles();
    renderList();
  }

  async function renameFile(id, name) {
    const sb = global.SMTN170Supabase?.getClient?.();
    if (!sb || !name?.trim()) return;
    await sb.from("uploaded_files").update({ file_name: name.trim() }).eq("id", id);
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
    if (global.SMTN170DocViewer?.open) {
      global.SMTN170DocViewer.open(file);
      return;
    }
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
            <button type="button" class="ghost-btn" data-fl-action="preview" data-id="${escapeHtml(f.id)}">View</button>
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
        <p class="page-intro">Upload squadron files here — stored securely in Firebase. Smart import extracts meeting schedules and org chart data for review, then writes to the portal database. Open PDFs, Word, Excel, images, and text in the built-in viewer.</p>
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
      Array.from(input.files || []).forEach((f) => uploadFile(f));
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
      Array.from(e.dataTransfer?.files || []).forEach((f) => uploadFile(f));
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
    await global.SMTN170Firebase?.whenReady?.();
    await global.SMTN170Auth?.syncSessionFromFirebase?.();
    state.files = await fetchFiles();
    if (!state.files.length && !global.SMTN170Firebase?.isConfigured?.()) {
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
