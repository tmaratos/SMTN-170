/**
 * Firestore Admin adapter — Supabase-like API for steward actions and import audit.
 */
const TABLE_MAP = {
  profiles: "profiles",
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
  schedules: "schedules",
};

const FIELD_MAP = {
  owner_id: "ownerId",
  file_name: "fileName",
  file_path: "storagePath",
  storage_path: "storagePath",
  file_category: "fileCategory",
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
  rank: "rank",
  account_status: "status",
  meeting_date: "meetingDate",
  meeting_time: "meetingTime",
  assigned_member_name: "assignedMemberName",
  parent_id: "parentId",
  sort_order: "sortOrder",
  due_date: "dueDate",
  work_unit: "workUnit",
  profile_id: "profileId",
  conversation_id: "conversationId",
  archived_at: "archivedAt",
  completed_at: "completedAt",
  pending_action: "pendingAction",
  actor_id: "actorId",
  target_table: "targetTable",
  target_id: "targetId",
  agenda_draft: "agendaDraft",
  name: "fileName",
  folder: "fileCategory",
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
  const out = {};
  Object.entries(data || {}).forEach(([k, v]) => {
    if (v === undefined) return;
    out[toCamelKey(k)] = v;
  });
  return out;
}

function fromFirestore(data, id) {
  const out = { id: id || data.id || null };
  Object.entries(data || {}).forEach(([k, v]) => {
    if (k === "id") return;
    out[toSnakeKey(k)] = v;
    if (toSnakeKey(k) === "status") out.account_status = v;
  });
  return out;
}

class QueryBuilder {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.collectionName = TABLE_MAP[table] || table;
    this.filters = [];
    this.orderField = null;
    this.orderAsc = true;
    this.limitN = null;
    this.singleMode = null;
    this.inFilter = null;
  }

  select() {
    return this;
  }

  eq(field, value) {
    this.filters.push({ op: "==", field, value });
    return this;
  }

  gte(field, value) {
    this.filters.push({ op: ">=", field, value });
    return this;
  }

  in(field, values) {
    this.inFilter = { field, values };
    return this;
  }

  order(field, opts = {}) {
    this.orderField = field;
    this.orderAsc = opts.ascending !== false;
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

  async execute() {
    const col = this.db.collection(this.collectionName);
    let q = col;
    this.filters.forEach((f) => {
      q = q.where(toCamelKey(f.field), f.op, f.value);
    });
    if (this.inFilter) {
      q = q.where(toCamelKey(this.inFilter.field), "in", this.inFilter.values.slice(0, 10));
    }
    if (this.orderField) {
      q = q.orderBy(toCamelKey(this.orderField), this.orderAsc ? "asc" : "desc");
    }
    if (this.limitN) q = q.limit(this.limitN);

    try {
      const snap = await q.get();
      let rows = snap.docs.map((d) => fromFirestore(d.data(), d.id));
      if (this.singleMode) {
        const one = rows[0] || null;
        if (this.singleMode === "single" && !one) return { data: null, error: { message: "Not found", code: "404" } };
        return { data: one, error: null };
      }
      return { data: rows, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
}

class MutationBuilder {
  constructor(db, table, mode, payload) {
    this.db = db;
    this.table = table;
    this.collectionName = TABLE_MAP[table] || table;
    this.mode = mode;
    this.payload = payload;
    this.filters = [];
    this.returnRow = false;
  }

  eq(field, value) {
    this.filters.push({ field, value });
    return this;
  }

  select() {
    this.returnRow = true;
    return this;
  }

  single() {
    this.returnRow = true;
    return this;
  }

  async execute() {
    const col = this.db.collection(this.collectionName);
    try {
      if (this.mode === "insert") {
        const raw = Array.isArray(this.payload) ? this.payload[0] : this.payload;
        const data = toFirestore(raw);
        const id = raw.id;
        if (id) delete data.id;
        const now = new Date().toISOString();
        if (!data.createdAt) data.createdAt = now;
        if (!data.updatedAt) data.updatedAt = now;
        let ref;
        if (id) {
          ref = col.doc(id);
          await ref.set(data, { merge: true });
        } else {
          ref = await col.add(data);
        }
        const snap = await ref.get();
        return { data: fromFirestore(snap.data(), snap.id), error: null };
      }
      if (this.mode === "update") {
        const idFilter = this.filters.find((f) => f.field === "id");
        if (!idFilter) return { data: null, error: { message: "update requires id" } };
        const data = toFirestore(this.payload);
        delete data.id;
        data.updatedAt = new Date().toISOString();
        const ref = col.doc(idFilter.value);
        await ref.set(data, { merge: true });
        if (this.returnRow) {
          const snap = await ref.get();
          return { data: fromFirestore(snap.data(), snap.id), error: null };
        }
        return { data: null, error: null };
      }
      if (this.mode === "delete") {
        const idFilter = this.filters.find((f) => f.field === "id");
        if (!idFilter) return { data: null, error: { message: "delete requires id" } };
        await col.doc(idFilter.value).delete();
        return { data: null, error: null };
      }
    } catch (error) {
      return { data: null, error };
    }
    return { data: null, error: { message: "Unknown mutation" } };
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
}

function createDbAdapter(db) {
  return {
    from(table) {
      return {
        select() {
          return new QueryBuilder(db, table);
        },
        insert(payload) {
          const m = new MutationBuilder(db, table, "insert", payload);
          m.returnRow = true;
          return m;
        },
        update(payload) {
          return new MutationBuilder(db, table, "update", payload);
        },
        delete() {
          return new MutationBuilder(db, table, "delete", null);
        },
      };
    },
  };
}

module.exports = { createDbAdapter, fromFirestore, toFirestore, TABLE_MAP };
