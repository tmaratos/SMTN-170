/**
 * TN-170 profile display and completeness helpers.
 *
 * Profile data in Firestore is camelCase (firstName, lastName, capId, dutyPosition…).
 * Some legacy callers still pass snake_case rows from older code paths, so every
 * field reader here tolerates BOTH formats.
 */
(function initProfileService(global) {
  const PROFILE_STATUS = {
    PENDING: "pending",
    AWAITING: "awaiting_approval",
    APPROVED: "approved",
    ACTIVE: "active",
    DENIED: "denied",
  };

  /** Editable camelCase fields written from the profile page. */
  const EDITABLE_FIELDS = [
    "firstName",
    "lastName",
    "preferredName",
    "rank",
    "capId",
    "phone",
    "dutyPosition",
  ];

  /** Server-managed fields users must NEVER be able to overwrite from the profile page. */
  const PROTECTED_FIELDS = [
    "role",
    "status",
    "approved",
    "isAdmin",
    "accountStatus",
    "portalRole",
    "approvedAt",
    "approvedBy",
    "deniedAt",
    "deniedBy",
    "createdAt",
  ];

  function trim(v) {
    return v == null ? "" : String(v).trim();
  }

  /** Read a profile field tolerating both camelCase and snake_case keys. */
  function readField(row, ...keys) {
    if (!row) return "";
    for (const k of keys) {
      const v = row[k];
      if (v != null && String(v).trim() !== "") return String(v);
    }
    return "";
  }

  function getFirstName(row) {
    return trim(readField(row, "firstName", "first_name"));
  }
  function getLastName(row) {
    return trim(readField(row, "lastName", "last_name"));
  }
  function getPreferredName(row) {
    return trim(readField(row, "preferredName", "preferred_name"));
  }
  function getCapId(row) {
    return trim(readField(row, "capId", "cap_id"));
  }
  function getDutyPosition(row) {
    return trim(readField(row, "dutyPosition", "duty_position"));
  }
  function getPhone(row) {
    return trim(readField(row, "phone"));
  }
  function getProfilePhotoUrl(row) {
    return trim(readField(row, "profilePhotoUrl", "profile_photo_url"));
  }
  function getRank(row) {
    return normalizeRank(readField(row, "rank"));
  }
  function getUpdatedAt(row) {
    return readField(row, "updatedAt", "updated_at");
  }

  /** Normalize rank for display (no trailing period duplication). */
  function normalizeRank(rank) {
    const r = trim(rank);
    if (!r) return "";
    return r.replace(/\.\s*$/, "").replace(/\s+/g, " ");
  }

  /** Avoid "Capt Capt. M. Ellis" when rank is already in the name. */
  function nameIncludesRank(rank, name) {
    if (!rank || !name) return false;
    const r = normalizeRank(rank).toLowerCase();
    const n = name.toLowerCase();
    if (n.startsWith(r + " ") || n.startsWith(r + ".")) return true;
    const abbr = r.replace(/\./g, "");
    if (abbr.length >= 2 && n.startsWith(abbr + " ")) return true;
    return false;
  }

  function fullName(row) {
    const first = getFirstName(row);
    const last = getLastName(row);
    if (first && last) return `${first} ${last}`;
    if (first) return first;
    if (last) return last;
    return "";
  }

  /**
   * Display name for UI and audit.
   * 1. preferred name
   * 2. rank + first + last
   * 3. email
   */
  function computeDisplayName(row) {
    const preferred = getPreferredName(row);
    if (preferred) return preferred;

    const rank = getRank(row);
    const name = fullName(row);
    if (rank && name && !nameIncludesRank(rank, name)) return `${rank} ${name}`;
    if (name) return name;

    const email = trim(row?.email);
    if (email) return email;

    return "";
  }

  /** Greeting line for dashboard: "Welcome back, Capt M. Ellis." */
  function computeWelcomeGreeting(row) {
    const preferred = getPreferredName(row);
    if (preferred) return { label: preferred, full: `Welcome back, ${preferred}.` };

    const rank = getRank(row);
    const name = fullName(row);
    if (rank && name && !nameIncludesRank(rank, name)) {
      return { label: `${rank} ${name}`, full: `Welcome back, ${rank} ${name}.` };
    }
    if (name) return { label: name, full: `Welcome back, ${name}.` };

    return { label: "", full: "Welcome back." };
  }

  /**
   * "Complete your profile" gate.
   * Complete when (firstName OR preferredName) AND lastName AND rank AND capId AND dutyPosition.
   */
  function isProfileIncomplete(row) {
    if (!row) return true;
    const hasName = !!(getFirstName(row) || getPreferredName(row));
    return !(
      hasName &&
      getLastName(row) &&
      getRank(row) &&
      getCapId(row) &&
      getDutyPosition(row)
    );
  }

  /** Read profiles/{uid}.status (canonical approval field). */
  function getProfileStatus(row) {
    if (!row) return "";
    const raw = row.status ?? row.account_status ?? row.accountStatus ?? "";
    return trim(raw).toLowerCase();
  }

  function isProfileStatusApproved(rowOrStatus) {
    const s = typeof rowOrStatus === "string" ? trim(rowOrStatus).toLowerCase() : getProfileStatus(rowOrStatus);
    return s === PROFILE_STATUS.APPROVED || s === PROFILE_STATUS.ACTIVE;
  }

  function isProfileStatusAwaiting(rowOrStatus) {
    const s = typeof rowOrStatus === "string" ? trim(rowOrStatus).toLowerCase() : getProfileStatus(rowOrStatus);
    return s === PROFILE_STATUS.PENDING || s === PROFILE_STATUS.AWAITING;
  }

  function isProfileStatusDenied(rowOrStatus) {
    const s = typeof rowOrStatus === "string" ? trim(rowOrStatus).toLowerCase() : getProfileStatus(rowOrStatus);
    return s === PROFILE_STATUS.DENIED;
  }

  function mapSessionFromProfile(row) {
    if (!row) return null;
    const status = getProfileStatus(row) || PROFILE_STATUS.AWAITING;
    return {
      userId: row.id || row.uid,
      email: trim(row.email),
      firstName: getFirstName(row),
      lastName: getLastName(row),
      preferredName: getPreferredName(row),
      rank: getRank(row),
      capId: getCapId(row),
      phone: getPhone(row),
      dutyPosition: getDutyPosition(row),
      profilePhotoUrl: getProfilePhotoUrl(row),
      displayName: computeDisplayName(row),
      role: row.role,
      status,
      accountStatus: status,
      roleLabel: null,
      unit: "TN-170 Oak Ridge Composite Squadron",
      updatedAt: getUpdatedAt(row),
    };
  }

  /**
   * Build a server-safe camelCase update patch from a raw form/object.
   * Accepts BOTH camelCase and snake_case input keys; output is always camelCase.
   * Strips every server-managed field (role/status/approved/etc.) so users
   * cannot escalate their own access by tampering with the form.
   */
  function pickEditablePayload(formData) {
    if (!formData) return {};
    const src = {
      firstName: formData.firstName ?? formData.first_name,
      lastName: formData.lastName ?? formData.last_name,
      preferredName: formData.preferredName ?? formData.preferred_name,
      rank: formData.rank,
      capId: formData.capId ?? formData.cap_id,
      phone: formData.phone,
      dutyPosition: formData.dutyPosition ?? formData.duty_position,
    };
    const out = {};
    EDITABLE_FIELDS.forEach((key) => {
      if (src[key] === undefined) return;
      const value = trim(src[key]);
      out[key] = value === "" ? null : value;
    });
    return out;
  }

  global.SMTN170Profile = {
    PROFILE_STATUS,
    EDITABLE_FIELDS,
    PROTECTED_FIELDS,
    normalizeRank,
    computeDisplayName,
    computeWelcomeGreeting,
    isProfileIncomplete,
    getProfileStatus,
    isProfileStatusApproved,
    isProfileStatusAwaiting,
    isProfileStatusDenied,
    mapSessionFromProfile,
    pickEditablePayload,
    fullName,
    getFirstName,
    getLastName,
    getPreferredName,
    getCapId,
    getDutyPosition,
    getPhone,
    getRank,
    getProfilePhotoUrl,
    getUpdatedAt,
  };
})(window);
