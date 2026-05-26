/**
 * TN-170 Firestore CRUD abstraction with snake_case ↔ camelCase mapping.
 * Exposes a Supabase-like `.from(table)` API for portal modules.
 */
(function initFirebaseData(global) {
  const TABLE_MAP = {
    profiles: "profiles",
    users: "users",
    uploaded_files: "uploadedFiles",
    import_jobs: "importJobs",
    parsed_documents: "parsedDocuments",
    meetings: "meetings",
    org_positions: "orgPositions",
    portal_tasks: "tasks",
    flight_reviews: "flightReviews",
    inspection_items: "inspectionItems",
    steward_conversations: "stewardConversations",
    steward_chat_messages: "stewardMessages",
    audit_log: "auditLog",
    resource_links: "resourceLinks",
    schedules: "schedules",
  };

  /**
   * Builder report collections (camelCase end-to-end, no snake/camel translation).
   * These store full report documents authored in `js/orgchart-builder.js` and
   * `js/schedule-builder.js` separate from the live `orgPositions` directory.
   */
  const REPORT_COLLECTIONS = {
    orgCharts: "orgCharts",
    monthlySchedules: "monthlySchedules",
  };

  const FIELD_MAP = {
    owner_id: "ownerId",
    file_name: "fileName",
    file_path: "storagePath",
    storage_path: "storagePath",
    file_category: "fileCategory",
    steward_suggested_category: "stewardSuggestedCategory",
    import_status: "importStatus",
    created_at: "createdAt",
    updated_at: "updatedAt",
    created_by: "createdBy",
    updated_by: "updatedBy",
    last_worked_by: "lastWorkedBy",
    last_worked_at: "lastWorkedAt",
    uploaded_file_id: "uploadedFileId",
    detected_type: "detectedType",
    target_type: "targetType",
    error_message: "errorMessage",
    record_count: "recordCount",
    extracted_text: "extractedText",
    extracted_json: "extractedJson",
    parser_version: "parserVersion",
    first_name: "firstName",
    last_name: "lastName",
    preferred_name: "preferredName",
    cap_id: "capId",
    duty_position: "dutyPosition",
    profile_photo_url: "profilePhotoUrl",
    account_status: "status",
    meeting_date: "meetingDate",
    meeting_time: "meetingTime",
    assigned_member_name: "assignedMemberName",
    parent_id: "parentId",
    sort_order: "sortOrder",
    is_command: "isCommand",
    due_date: "dueDate",
    work_unit: "workUnit",
    profile_id: "profileId",
    conversation_id: "conversationId",
    archived_at: "archivedAt",
    completed_at: "completedAt",
    mime_type: "mimeType",
    size_bytes: "sizeBytes",
    uploaded_by_name: "uploadedByName",
    last_worked_by_name: "lastWorkedByName",
    member_name: "memberName",
    review_date: "reviewDate",
    expiration_date: "expirationDate",
    actor_id: "actorId",
    target_table: "targetTable",
    target_id: "targetId",
    pending_action: "pendingAction",
    last_reviewed_at: "lastReviewedAt",
    role_default: "roleDefault",
    approved_at: "approvedAt",
    approved_by: "approvedBy",
    denied_at: "deniedAt",
    denied_by: "deniedBy",
  };

  const CAMEL_MAP = Object.fromEntries(Object.entries(FIELD_MAP).map(([k, v]) => [v, k]));

  function toCamelKey(key) {
    return FIELD_MAP[key] || key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  }

  function toSnakeKey(key) {
    if (CAMEL_MAP[key]) return CAMEL_MAP[key];
    return key.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
  }

  function toFirestore(data) {
    if (!data || typeof data !== "object") return data;
    const out = {};
    Object.entries(data).forEach(([k, v]) => {
      if (v === undefined) return;
      out[toCamelKey(k)] = v;
    });
    return out;
  }

  function fromFirestore(data, id) {
    if (!data) return null;
    const out = { id: id || data.id || null };
    Object.entries(data).forEach(([k, v]) => {
      if (k === "id") return;
      const snake = toSnakeKey(k);
      out[snake] = v;
      if (snake === "status" && data.status != null) out.account_status = data.status;
    });
    return out;
  }

  function pickFields(row, selectStr) {
    if (!selectStr || selectStr === "*") return row;
    const keys = selectStr.split(",").map((s) => s.trim().split("(")[0].trim()).filter(Boolean);
    const out = { id: row.id };
    keys.forEach((k) => {
      if (row[k] !== undefined) out[k] = row[k];
    });
    return out;
  }

  function fb() {
    return global.SMTN170Firebase;
  }

  function getDb() {
    return fb()?.getFirestore?.();
  }

  function getMod() {
    return fb()?.getFirestoreModule?.();
  }

  class QueryBuilder {
    constructor(table) {
      this.table = table;
      this.collectionName = TABLE_MAP[table] || table;
      this.filters = [];
      this.orderField = null;
      this.orderAsc = true;
      this.limitN = null;
      this.selectStr = "*";
      this.joinSpec = null;
      this.singleMode = null;
    }

    select(cols) {
      const str = String(cols || "*");
      const joinMatch = str.match(/,\s*(\w+)\(([^)]+)\)/);
      if (joinMatch) {
        this.joinSpec = { table: joinMatch[1], cols: joinMatch[2] };
        this.selectStr = str.split(",")[0].trim() || "*";
      } else {
        this.selectStr = str;
      }
      return this;
    }

    eq(field, value) {
      this.filters.push({ op: "==", field, value });
      return this;
    }

    in(field, values) {
      this.filters.push({ op: "in", field, value: values });
      return this;
    }

    neq(field, value) {
      this.filters.push({ op: "!=", field, value });
      return this;
    }

    gte(field, value) {
      this.filters.push({ op: ">=", field, value });
      return this;
    }

    is(field, value) {
      if (value === null) this.filters.push({ op: "null", field, value: null });
      else this.filters.push({ op: "==", field, value });
      return this;
    }

    order(field, opts) {
      this.orderField = field;
      this.orderAsc = opts?.ascending !== false;
      if (opts?.nullsFirst === false) this.orderAsc = this.orderAsc;
      return this;
    }

    limit(n) {
      this.limitN = n;
      return this;
    }

    maybeSingle() {
      this.singleMode = "maybe";
      return this;
    }

    single() {
      this.singleMode = "single";
      return this;
    }

    async _runQuery() {
      const mod = getMod();
      const db = getDb();
      if (!mod || !db) return { data: null, error: new Error("Firestore not ready") };

      const { collection, query, where, orderBy, limit, getDocs, doc, getDoc } = mod;
      const colRef = collection(db, this.collectionName);

      if (this.singleMode && this.filters.length === 1 && this.filters[0].field === "id") {
        const id = this.filters[0].value;
        const snap = await getDoc(doc(db, this.collectionName, id));
        if (!snap.exists()) {
          return { data: this.singleMode === "single" ? null : null, error: this.singleMode === "single" ? new Error("Not found") : null };
        }
        const row = fromFirestore(snap.data(), snap.id);
        return { data: pickFields(row, this.selectStr), error: null };
      }

      const constraints = [];
      this.filters.forEach((f) => {
        const field = toCamelKey(f.field);
        if (f.op === "null") constraints.push(where(field, "==", null));
        else if (f.op === "in") constraints.push(where(field, "in", f.value));
        else constraints.push(where(field, f.op, f.value));
      });
      if (this.orderField) constraints.push(orderBy(toCamelKey(this.orderField), this.orderAsc ? "asc" : "desc"));
      if (this.limitN) constraints.push(limit(this.limitN));

      const q = constraints.length ? query(colRef, ...constraints) : colRef;
      const snap = await getDocs(q);
      let rows = snap.docs.map((d) => pickFields(fromFirestore(d.data(), d.id), this.selectStr));

      if (this.joinSpec) {
        const joinCol = TABLE_MAP[this.joinSpec.table] || this.joinSpec.table;
        const fileIds = [...new Set(rows.map((r) => r.uploaded_file_id).filter(Boolean))];
        const fileMap = {};
        await Promise.all(
          fileIds.map(async (fid) => {
            const fs = await getDoc(doc(db, joinCol, fid));
            if (fs.exists()) fileMap[fid] = pickFields(fromFirestore(fs.data(), fs.id), this.joinSpec.cols);
          })
        );
        rows = rows.map((r) => ({
          ...r,
          [this.joinSpec.table]: fileMap[r.uploaded_file_id] || null,
        }));
      }

      if (this.singleMode) {
        const one = rows[0] || null;
        if (this.singleMode === "single" && !one) return { data: null, error: new Error("Not found") };
        return { data: one, error: null };
      }
      return { data: rows, error: null };
    }

    then(resolve, reject) {
      return this._runQuery().then(resolve, reject);
    }
  }

  class MutationBuilder {
    constructor(table, mode, payload) {
      this.table = table;
      this.collectionName = TABLE_MAP[table] || table;
      this.mode = mode;
      this.payload = payload;
      this.filters = [];
    }

    eq(field, value) {
      this.filters.push({ field, value });
      return this;
    }

    select() {
      this.returnRow = true;
      return this;
    }

    async _execute() {
      const mod = getMod();
      const db = getDb();
      if (!mod || !db) return { data: null, error: new Error("Firestore not ready") };
      const { collection, doc, setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp, getDoc } = mod;

      try {
        if (this.mode === "insert") {
          const raw = Array.isArray(this.payload) ? this.payload[0] : this.payload;
          const data = toFirestore(raw);
          const id = raw.id || data.id;
          if (id) delete data.id;
          if (!data.createdAt) data.createdAt = new Date().toISOString();
          if (!data.updatedAt) data.updatedAt = data.createdAt;
          let ref;
          if (id) {
            ref = doc(db, this.collectionName, id);
            await setDoc(ref, data, { merge: true });
          } else {
            ref = await addDoc(collection(db, this.collectionName), data);
          }
          const snap = await getDoc(ref);
          return { data: fromFirestore(snap.data(), snap.id), error: null };
        }

        if (this.mode === "upsert") {
          const raw = Array.isArray(this.payload) ? this.payload[0] : this.payload;
          const id = raw.id;
          if (!id) return { data: null, error: new Error("upsert requires id") };
          const data = toFirestore(raw);
          delete data.id;
          data.updatedAt = new Date().toISOString();
          const ref = doc(db, this.collectionName, id);
          await setDoc(ref, data, { merge: true });
          const snap = await getDoc(ref);
          return { data: fromFirestore(snap.data(), snap.id), error: null };
        }

        if (this.mode === "update") {
          const idFilter = this.filters.find((f) => f.field === "id");
          if (!idFilter) return { data: null, error: new Error("update requires .eq(id)") };
          const data = toFirestore(this.payload);
          delete data.id;
          data.updatedAt = new Date().toISOString();
          const ref = doc(db, this.collectionName, idFilter.value);
          await updateDoc(ref, data);
          if (this.returnRow) {
            const snap = await getDoc(ref);
            return { data: fromFirestore(snap.data(), snap.id), error: null };
          }
          return { data: null, error: null };
        }

        if (this.mode === "delete") {
          const idFilter = this.filters.find((f) => f.field === "id");
          if (!idFilter) return { data: null, error: new Error("delete requires .eq(id)") };
          await deleteDoc(doc(db, this.collectionName, idFilter.value));
          return { data: null, error: null };
        }
      } catch (err) {
        return { data: null, error: err };
      }
      return { data: null, error: new Error("Unknown mutation") };
    }

    then(resolve, reject) {
      return this._execute().then(resolve, reject);
    }

    single() {
      this.returnRow = true;
      return this;
    }
  }

  function from(table) {
    return {
      select(cols) {
        const q = new QueryBuilder(table);
        return q.select(cols);
      },
      insert(payload) {
        const m = new MutationBuilder(table, "insert", payload);
        m.returnRow = true;
        return m;
      },
      upsert(payload) {
        const m = new MutationBuilder(table, "upsert", payload);
        m.returnRow = true;
        return m;
      },
      update(payload) {
        return new MutationBuilder(table, "update", payload);
      },
      delete() {
        return new MutationBuilder(table, "delete", null);
      },
    };
  }

  function subscribeCollection(table, filter, cb) {
    const mod = getMod();
    const db = getDb();
    if (!mod || !db) return null;
    const { collection, query, where, onSnapshot } = mod;
    const collectionName = TABLE_MAP[table] || table;
    const colRef = collection(db, collectionName);
    let q = colRef;
    if (filter) {
      const m = String(filter).match(/(\w+)=eq\.(.+)/);
      if (m) q = query(colRef, where(toCamelKey(m[1]), "==", m[2]));
    }
    return onSnapshot(q, () => cb?.({ eventType: "UPDATE" }));
  }

  /**
   * Direct (no key translation) CRUD helpers for builder report collections.
   * Used by Org Chart and Monthly Schedule builders for full versioned reports.
   */
  function reports(collectionName) {
    const real = REPORT_COLLECTIONS[collectionName] || collectionName;
    return {
      async list({ limit: lim, order } = {}) {
        const mod = getMod();
        const db = getDb();
        if (!mod || !db) return { data: null, error: new Error("Firestore not ready") };
        const { collection, query, orderBy, limit, getDocs } = mod;
        const colRef = collection(db, real);
        const cons = [];
        if (order?.field) cons.push(orderBy(order.field, order.asc ? "asc" : "desc"));
        if (lim) cons.push(limit(lim));
        try {
          const q = cons.length ? query(colRef, ...cons) : colRef;
          const snap = await getDocs(q);
          return {
            data: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
            error: null,
          };
        } catch (error) {
          return { data: null, error };
        }
      },
      async get(id) {
        const mod = getMod();
        const db = getDb();
        if (!mod || !db) return { data: null, error: new Error("Firestore not ready") };
        const { doc, getDoc } = mod;
        try {
          const snap = await getDoc(doc(db, real, id));
          if (!snap.exists()) return { data: null, error: null };
          return { data: { id: snap.id, ...snap.data() }, error: null };
        } catch (error) {
          return { data: null, error };
        }
      },
      async save(payload) {
        const mod = getMod();
        const db = getDb();
        if (!mod || !db) return { data: null, error: new Error("Firestore not ready") };
        const { collection, doc, setDoc, addDoc, getDoc } = mod;
        try {
          const id = payload?.id;
          const body = { ...payload };
          delete body.id;
          body.updatedAt = new Date().toISOString();
          if (!body.createdAt) body.createdAt = body.updatedAt;
          let ref;
          if (id) {
            ref = doc(db, real, id);
            await setDoc(ref, body, { merge: true });
          } else {
            ref = await addDoc(collection(db, real), body);
          }
          const snap = await getDoc(ref);
          return { data: { id: snap.id, ...snap.data() }, error: null };
        } catch (error) {
          return { data: null, error };
        }
      },
      async remove(id) {
        const mod = getMod();
        const db = getDb();
        if (!mod || !db) return { data: null, error: new Error("Firestore not ready") };
        const { doc, deleteDoc } = mod;
        try {
          await deleteDoc(doc(db, real, id));
          return { data: { id }, error: null };
        } catch (error) {
          return { data: null, error };
        }
      },
      subscribe(cb) {
        const mod = getMod();
        const db = getDb();
        if (!mod || !db) return null;
        const { collection, onSnapshot } = mod;
        return onSnapshot(collection(db, real), () => cb?.());
      },
    };
  }

  global.SMTN170FirebaseData = {
    TABLE_MAP,
    REPORT_COLLECTIONS,
    toFirestore,
    fromFirestore,
    from,
    reports,
    orgCharts: () => reports("orgCharts"),
    monthlySchedules: () => reports("monthlySchedules"),
    subscribeCollection,
  };
})(window);
