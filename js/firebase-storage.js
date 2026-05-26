/**
 * @deprecated V1 — Firebase Storage not used in portal runtime.
 * TN-170 Firebase Storage helpers — squadron-files/{uid}/..., imports/{uid}/...
 */
(function initFirebaseStorage(global) {
  const DEFAULT_BUCKET = "squadron-files";

  function squadronPath(uid, fileName) {
    const safe = (fileName || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
    return `squadron-files/${uid}/${Date.now()}-${safe}`;
  }

  function importPath(uid, fileName) {
    const safe = (fileName || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
    return `imports/${uid}/${Date.now()}-${safe}`;
  }

  async function uploadSquadronFile(uid, file, opts) {
    const client = await global.SMTN170Firebase?.whenReady?.();
    if (!client) throw new Error("Sign in to upload files.");
    const path = opts?.path || squadronPath(uid, file.name);
    const bucket = global.SMTN170Firebase?.storageBucket?.() || DEFAULT_BUCKET;
    const { error } = await client.storage.from(bucket).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      ...(opts || {}),
    });
    if (error) throw error;
    return { path, bucket };
  }

  async function removeFile(storagePath) {
    const client = global.SMTN170Firebase?.getClient?.();
    if (!client || !storagePath) return;
    const bucket = global.SMTN170Firebase?.storageBucket?.() || DEFAULT_BUCKET;
    await client.storage.from(bucket).remove([storagePath]);
  }

  async function getDownloadUrl(storagePath) {
    const client = global.SMTN170Firebase?.getClient?.();
    if (!client || !storagePath) return null;
    const bucket = global.SMTN170Firebase?.storageBucket?.() || DEFAULT_BUCKET;
    const { data, error } = await client.storage.from(bucket).createSignedUrl(storagePath, 3600);
    if (error) return null;
    return data?.signedUrl || null;
  }

  async function createUploadedFileDoc(payload) {
    const row = {
      ownerId: payload.ownerId || payload.owner_id,
      fileName: payload.fileName || payload.file_name,
      storagePath: payload.storagePath || payload.storage_path || payload.file_path,
      fileCategory: payload.fileCategory || payload.file_category || "general",
      stewardSuggestedCategory: payload.stewardSuggestedCategory || payload.steward_suggested_category,
      visibility: payload.visibility || "squadron",
      importStatus: payload.importStatus || payload.import_status || "indexed",
      mimeType: payload.mimeType || payload.mime_type || null,
      sizeBytes: payload.sizeBytes || payload.size_bytes || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const { data, error } = await global.SMTN170FirebaseData.from("uploaded_files").insert(row);
    if (error) throw error;
    return data;
  }

  global.SMTN170FirebaseStorage = {
    DEFAULT_BUCKET,
    squadronPath,
    importPath,
    uploadSquadronFile,
    removeFile,
    getDownloadUrl,
    createUploadedFileDoc,
  };
})(window);
