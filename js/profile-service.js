/**
 * TN-170 profile display and completeness helpers.
 */
(function initProfileService(global) {
  const PROFILE_STATUS = {
    AWAITING: "awaiting_approval",
    APPROVED: "approved",
    ACTIVE: "active",
  };

  const EDITABLE_FIELDS = [
    "first_name",
    "last_name",
    "preferred_name",
    "rank",
    "cap_id",
    "phone",
    "duty_position",
    "profile_photo_url",
  ];

  function trim(v) {
    return v == null ? "" : String(v).trim();
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
    const first = trim(row?.first_name);
    const last = trim(row?.last_name);
    if (first && last) return `${first} ${last}`;
    if (first) return first;
    if (last) return last;
    return "";
  }

  /**
   * Display name for UI and audit.
   * 1. preferred_name
   * 2. rank + first + last
   * 3. email
   */
  function computeDisplayName(row) {
    const preferred = trim(row?.preferred_name);
    if (preferred) return preferred;

    const rank = normalizeRank(row?.rank);
    const name = fullName(row);
    if (rank && name && !nameIncludesRank(rank, name)) return `${rank} ${name}`;
    if (name) return name;

    const email = trim(row?.email);
    if (email) return email;

    return "";
  }

  /**
   * Greeting line for dashboard: "Welcome back, Capt M. Ellis." or "Welcome back, Tristan." or "Welcome back."
   */
  function computeWelcomeGreeting(row) {
    const preferred = trim(row?.preferred_name);
    if (preferred) {
      return { label: preferred, full: `Welcome back, ${preferred}.` };
    }

    const rank = normalizeRank(row?.rank);
    const name = fullName(row);
    if (rank && name && !nameIncludesRank(rank, name)) {
      return { label: `${rank} ${name}`, full: `Welcome back, ${rank} ${name}.` };
    }
    if (name) {
      return { label: name, full: `Welcome back, ${name}.` };
    }

    return { label: "", full: "Welcome back." };
  }

  function isProfileIncomplete(row) {
    if (!row) return true;
    return !trim(row.first_name) || !trim(row.last_name);
  }

  /** Read public.profiles.status (canonical approval field). */
  function getProfileStatus(row) {
    if (!row) return "";
    return trim(row.status).toLowerCase();
  }

  function isProfileStatusApproved(rowOrStatus) {
    const s = typeof rowOrStatus === "string" ? trim(rowOrStatus).toLowerCase() : getProfileStatus(rowOrStatus);
    return s === PROFILE_STATUS.APPROVED || s === PROFILE_STATUS.ACTIVE;
  }

  function isProfileStatusAwaiting(rowOrStatus) {
    const s = typeof rowOrStatus === "string" ? trim(rowOrStatus).toLowerCase() : getProfileStatus(rowOrStatus);
    return s === PROFILE_STATUS.AWAITING;
  }

  function mapSessionFromProfile(row) {
    if (!row) return null;
    const displayName = computeDisplayName(row);
    const status = getProfileStatus(row) || PROFILE_STATUS.AWAITING;
    return {
      userId: row.id,
      email: row.email,
      firstName: trim(row.first_name),
      lastName: trim(row.last_name),
      preferredName: trim(row.preferred_name),
      rank: normalizeRank(row.rank),
      capId: trim(row.cap_id),
      phone: trim(row.phone),
      dutyPosition: trim(row.duty_position),
      profilePhotoUrl: trim(row.profile_photo_url),
      displayName,
      role: row.role,
      status,
      accountStatus: status,
      roleLabel: null,
      unit: "TN-170 Oak Ridge Composite Squadron",
      updatedAt: row.updated_at,
    };
  }

  function pickEditablePayload(formData) {
    const out = {};
    EDITABLE_FIELDS.forEach((key) => {
      if (formData[key] !== undefined) {
        out[key] = trim(formData[key]) || null;
      }
    });
    return out;
  }

  global.SMTN170Profile = {
    PROFILE_STATUS,
    EDITABLE_FIELDS,
    normalizeRank,
    computeDisplayName,
    computeWelcomeGreeting,
    isProfileIncomplete,
    getProfileStatus,
    isProfileStatusApproved,
    isProfileStatusAwaiting,
    mapSessionFromProfile,
    pickEditablePayload,
    fullName,
  };
})(window);
