const { IMPORT_TYPES, typeToTable } = require('./import-meta');

const MONTH_NAMES = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};





function inferScheduleYear(text, fileName) {
  const contentYear = (text || "").match(
    /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/i,
  );
  if (contentYear) return parseInt(contentYear[1], 10);
  const fileYear = (fileName || "").match(/\b(20\d{2})\b/);
  if (fileYear) return parseInt(fileYear[1], 10);
  return new Date().getFullYear();
}

function inferContentMonth(text) {
  const m = (text || "").match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/i,
  );
  return m ? MONTH_NAMES[m[1].toLowerCase()] : null;
}

function toIsoDate(year, month, day) {
  const d = new Date(year, month - 1, day);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function summarizeBlockText(raw) {
  return (raw || "")
    .replace(/\d{4}\s*[-–—]\s*\d{4}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBctScheduleContent(text) {
  const t = (text || "").toLowerCase();
  if (!t) return false;
  const hasWeeks = /week\s*\d\s*[-–—]\s*\d{1,2}\/\d{1,2}/i.test(text);
  const markers = ["uniform", "opening", "emphasis", "block", "closing"];
  const hits = markers.filter((m) => t.includes(m)).length;
  return hasWeeks && hits >= 4;
}

function parseBctMeetingScheduleText(
  text,
  options = {},
) {
  if (!isBctScheduleContent(text)) return null;

  const year = inferScheduleYear(text, options.fileName || "");
  const contentMonth = inferContentMonth(text);
  const weekRe = /week\s*(\d)\s*[-–—]\s*(\d{1,2})\/(\d{1,2})/gi;
  const weeks = [];
  let match;
  while ((match = weekRe.exec(text)) !== null) {
    weeks.push({
      weekNum: parseInt(match[1], 10),
      month: parseInt(match[2], 10),
      day: parseInt(match[3], 10),
    });
  }
  if (weeks.length < 2) return null;

  const rowPatterns = [
    ["uniform", /^uniform\b/i],
    ["opening", /^opening\b/i],
    ["emphasis", /^emphasis\b/i],
    ["block1", /^block\s*#?\s*1\b/i],
    ["block2", /^block\s*#?\s*2\b/i],
    ["closing", /^closing\b/i],
  ];
  const rowValues = {};
  const lines = (text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  lines.forEach((line) => {
    for (const [key, re] of rowPatterns) {
      if (!re.test(line)) continue;
      let parts = line.includes("\t")
        ? line.split("\t").map((c) => c.trim()).filter(Boolean)
        : line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
      if (parts[0] && re.test(parts[0])) parts = parts.slice(1);
      else if (/^uniform$|^opening$|^emphasis$|^closing$/i.test(parts[0])) parts = parts.slice(1);
      else if (/^block\s*#?\s*\d+$/i.test(parts[0])) parts = parts.slice(1);
      if (parts.length >= weeks.length) {
        rowValues[key] = parts.slice(0, weeks.length);
      } else if (parts.length > 0 && !rowValues[key]) {
        rowValues[key] = parts;
      }
      break;
    }
  });

  if (!rowValues.uniform && !rowValues.opening) return null;

  const isBctTitle = /\bbct\b/i.test(text);
  const defaultTitle = isBctTitle ? "BCT Meeting Schedule" : "Weekly Squadron Meeting";
  const sourceNote = options.sourceFileId
    ? `Source file id: ${options.sourceFileId}`
    : options.sourceFileName
    ? `Source file: ${options.sourceFileName}`
    : "";

  const drafts = weeks.map((wk, i) => {
    const month = contentMonth || wk.month;
    const meeting_date = toIsoDate(year, month, wk.day);
    const uniform = (rowValues.uniform?.[i] || "").trim();
    const opening = summarizeBlockText(rowValues.opening?.[i]);
    const emphasis = summarizeBlockText(rowValues.emphasis?.[i]);
    const block1 = summarizeBlockText(rowValues.block1?.[i]);
    const block2 = summarizeBlockText(rowValues.block2?.[i]);
    const closing = summarizeBlockText(rowValues.closing?.[i]);
    const notes = [
      opening ? `Opening: ${opening}` : "",
      emphasis ? `Emphasis: ${emphasis}` : "",
      block1 ? `Block #1: ${block1}` : "",
      block2 ? `Block #2: ${block2}` : "",
      closing ? `Closing: ${closing}` : "",
      sourceNote,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      draft: true,
      confidence: meeting_date ? 0.92 : 0.55,
      title: defaultTitle,
      meeting_date,
      start_time: "1900",
      end_time: "2100",
      meeting_time: "1900",
      uniform: uniform || null,
      opening,
      emphasis,
      block1,
      block2,
      closing,
      location: null,
      status: "draft",
      notes: notes || "Smart import — source document",
      source_file_id: options.sourceFileId || null,
      source_file_name: options.sourceFileName || null,
    };
  });

  return drafts.filter((d) => d.meeting_date);
}

function parseCsvLines(text) {
  return (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function parseDateToken(str) {
  if (!str) return null;
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const m = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const tryD = new Date(`${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`);
    if (!isNaN(tryD.getTime())) return tryD.toISOString().slice(0, 10);
  }
  return null;
}

function scoreClassification(text, fileName) {
  const content = text || "";

  if (isBctScheduleContent(content)) {
    return {
      detectedType: "meeting_schedule",
      confidence: 0.92,
      scores: { meeting_schedule: 8 },
    };
  }

  const t = `${fileName}\n${content}`.toLowerCase();
  const scores = {
    org_chart: 0,
    duty_assignments: 0,
    meeting_schedule: 0,
    cap_calendar: 0,
    flight_review: 0,
    inspection_checklist: 0,
    task_list: 0,
    senior_roster: 0,
    cadet_roster: 0,
    training_tracker: 0,
  };

  if (/org.?chart|organization chart|billet|commander|deputy|officer|reports to|duty position/i.test(t)) {
    scores.org_chart += 3;
    scores.duty_assignments += 2;
  }
  if (/duty assignment|assignments|position title|section chief/i.test(t)) scores.duty_assignments += 3;
  if (/schedule|meeting night|drill|uniform|recurring|calendar/i.test(t)) {
    scores.meeting_schedule += 3;
    scores.cap_calendar += 2;
  }
  if (/cap calendar|event date|squadron calendar/i.test(t)) scores.cap_calendar += 3;
  if (/bfr|flight review|pilot|expiration|reviewer|aircraft|capid|cap id/i.test(t)) scores.flight_review += 4;
  if (/sui|inspection|compliance|checklist|readiness|wing inspection/i.test(t)) {
    scores.inspection_checklist += 4;
  }
  if (/assigned to|due date|task|complete|priority|follow.?up/i.test(t)) scores.task_list += 3;
  if (/senior member|senior roster|sm roster/i.test(t)) scores.senior_roster += 3;
  if (/cadet roster|cadet programs|cadet member/i.test(t)) scores.cadet_roster += 3;
  if (/training tracker|aex|aes|tls|achievement/i.test(t)) scores.training_tracker += 2;

  let best = "needs_review";
  let bestScore = 0;
  Object.entries(scores).forEach(([k, v]) => {
    if (v > bestScore) {
      bestScore = v;
      best = k;
    }
  });

  const confidence = bestScore === 0 ? 0.15 : Math.min(0.95, 0.35 + bestScore * 0.12);
  if (confidence < 0.4) best = "needs_review";

  return { detectedType: best, confidence, scores };
}

function parseOrgChartText(text) {
  const lines = parseCsvLines(text);
  const drafts = [];
  const depts = ["Command", "Operations", "Safety", "Administration"];
  lines.forEach((line, i) => {
    const cols = line.includes(",")
      ? line.split(",").map((c) => c.trim())
      : line.split(/\t+/).map((c) => c.trim());
    let title = cols[0] || line;
    let department = cols[1] || "Operations";
    let member = cols[2] || "";
    let rank = cols[3] || "";
    if (/^title|position|duty/i.test(title)) return;
    if (!depts.includes(department)) {
      if (depts.includes(cols[0])) {
        department = cols[0];
        title = cols[1] || line;
        member = cols[2] || "";
      }
    }
    drafts.push({
      draft: true,
      confidence: member ? 0.7 : 0.5,
      title,
      department,
      assigned_member_name: member,
      rank: rank || "",
      parent_hint: cols[4] || "",
      status: member ? "filled" : "vacant",
      responsibilities: "",
      notes: "Smart import — source document",
      sort_order: i + 1,
    });
  });
  return drafts;
}

function parseMeetingScheduleText(text, options) {
  const bct = parseBctMeetingScheduleText(text, options);
  if (bct?.length) return bct;

  const lines = parseCsvLines(text);
  const drafts = [];
  lines.forEach((line) => {
    const cols = line.includes(",")
      ? line.split(",").map((c) => c.trim())
      : line.split(/\t+/).map((c) => c.trim());
    const title = cols[0] || line;
    if (/^title|event|meeting|date/i.test(title)) return;
    const dateStr = cols[1] || "";
    const timeStr = cols[2] || "";
    const endTime = cols[3] || "";
    const loc = cols[4] || cols[3] || "";
    const meeting_date = parseDateToken(dateStr) || parseDateToken(line);
    drafts.push({
      draft: true,
      confidence: meeting_date ? 0.75 : 0.45,
      title,
      meeting_date: meeting_date || null,
      meeting_time: timeStr,
      end_time: endTime,
      location: loc,
      status: "planned",
      notes: "Smart import — source document",
    });
  });
  return drafts;
}

function parseInspectionText(text) {
  const lines = parseCsvLines(text);
  const drafts = [];
  lines.forEach((line) => {
    const clean = line.replace(/^[-*•\d.]+\s*/, "").trim();
    if (!clean || clean.length < 3 || /^item|checklist|title/i.test(clean)) return;
    const cols = line.includes(",") ? line.split(",").map((c) => c.trim()) : [clean];
    drafts.push({
      draft: true,
      confidence: 0.65,
      title: cols[0],
      work_unit: cols[1] || "General",
      status: "needs_review",
      notes: "Smart import — source document",
    });
  });
  return drafts;
}

function parseFlightReviewText(text) {
  const lines = parseCsvLines(text);
  const drafts = [];
  lines.forEach((line) => {
    const cols = line.includes(",")
      ? line.split(",").map((c) => c.trim())
      : line.split(/\t+/).map((c) => c.trim());
    if (/^name|member|department|pilot/i.test(cols[0])) return;
    const member = cols[0] || "";
    const capId = (cols[1] || "").match(/\d{6,}/) ? cols[1] : cols[2] || "";
    const reviewDate = parseDateToken(cols[2]) || parseDateToken(cols[3]);
    const expiration = parseDateToken(cols[3]) || parseDateToken(cols[4]);
    let status = "needs_review";
    if (/current|valid|complete/i.test(line)) status = "current";
    if (/due|soon/i.test(line)) status = "due_soon";
    if (/overdue|expired/i.test(line)) status = "overdue";
    drafts.push({
      draft: true,
      confidence: 0.6,
      member_name: member,
      cap_id: capId,
      department: member || cols[0] || "General",
      review_date: reviewDate,
      expiration_date: expiration,
      status,
      notes: "Smart import — source document",
    });
  });
  return drafts;
}

function parseTasksText(text) {
  const lines = parseCsvLines(text);
  const drafts = [];
  lines.forEach((line) => {
    const cols = line.includes(",") ? line.split(",").map((c) => c.trim()) : [line];
    const title = cols[0];
    if (!title || /^task|title|item/i.test(title)) return;
    drafts.push({
      draft: true,
      confidence: 0.65,
      title,
      due_date: parseDateToken(cols[1]),
      status: /complete|done/i.test(line) ? "completed" : "open",
      priority: cols[2] || "normal",
      description: cols[3] || "",
      notes: "Smart import — source document",
    });
  });
  return drafts;
}

function parseRosterText(text, kind) {
  const lines = parseCsvLines(text);
  return lines
    .filter((l) => l.length > 2 && !/^name|rank|email/i.test(l))
    .map((line) => {
      const cols = line.includes(",") ? line.split(",").map((c) => c.trim()) : [line];
      return {
        draft: true,
        confidence: 0.55,
        name: cols[0],
        rank: cols[1] || "",
        cap_id: cols[2] || "",
        email: cols[3] || "",
        kind,
      };
    });
}

function parseDraftRecords(
  extractedText,
  detectedType,
  options = {},
) {
  if (!extractedText) return { drafts: [], parsed: false, type: null };

  switch (detectedType) {
    case "org_chart":
    case "duty_assignments":
      return { drafts: parseOrgChartText(extractedText), parsed: true, type: "org_positions" };
    case "meeting_schedule":
    case "cap_calendar":
      return {
        drafts: parseMeetingScheduleText(extractedText, options),
        parsed: true,
        type: "meetings",
      };
    case "inspection_checklist":
      return { drafts: parseInspectionText(extractedText), parsed: true, type: "inspection_items" };
    case "flight_review":
      return { drafts: parseFlightReviewText(extractedText), parsed: true, type: "flight_reviews" };
    case "task_list":
      return { drafts: parseTasksText(extractedText), parsed: true, type: "portal_tasks" };
    case "senior_roster":
      return { drafts: parseRosterText(extractedText, "senior"), parsed: true, type: "roster_reference" };
    case "cadet_roster":
      return { drafts: parseRosterText(extractedText, "cadet"), parsed: true, type: "roster_reference" };
    default:
      return { drafts: [], parsed: true, type: "reference" };
  }
}

function buildImportResponse(
  extractedText,
  fileName,
  options = {},
) {
  const parseOpts = {
    fileName,
    sourceFileId: options.sourceFileId,
    sourceFileName: fileName,
  };

  if (options.needsOcr) {
    return {
      detectedType: "needs_review",
      confidence: 0.2,
      target: IMPORT_TYPES.needs_review.target,
      drafts: [],
      type: null,
      message:
        "This file was uploaded and indexed. OCR is required before it can be read automatically.",
      needsOcr: true,
      parsed: false,
      parseable: false,
      lowConfidence: true,
    };
  }

  const classification = scoreClassification(extractedText || "", fileName);
  let detectedType = options.requestedTarget && IMPORT_TYPES[options.requestedTarget]
    ? options.requestedTarget
    : classification.detectedType;
  let confidence = classification.confidence;
  if (options.requestedTarget && IMPORT_TYPES[options.requestedTarget]) {
    confidence = Math.max(confidence, 0.55);
  }
  if (isBctScheduleContent(extractedText || "")) {
    detectedType = "meeting_schedule";
    confidence = Math.max(confidence, 0.92);
  }

  if (!extractedText) {
    return {
      detectedType,
      confidence: 0.2,
      target: (IMPORT_TYPES[detectedType] || IMPORT_TYPES.needs_review).target,
      drafts: [],
      type: typeToTable(detectedType),
      message: "File stored. Readable text was not extracted — marked as needs review.",
      needsOcr: false,
      parsed: false,
      parseable: options.parseable ?? false,
      lowConfidence: true,
    };
  }

  const { drafts, parsed, type } = parseDraftRecords(extractedText, detectedType, parseOpts);
  const importMeta = IMPORT_TYPES[detectedType] || IMPORT_TYPES.needs_review;

  if (!drafts.length) {
    return {
      detectedType,
      confidence: Math.min(confidence, 0.35),
      target: importMeta.target,
      drafts: [],
      type,
      message:
        "File stored and text was extracted, but no structured rows were detected with confidence. Review extracted content and choose a destination.",
      needsOcr: false,
      parsed,
      parseable: true,
      lowConfidence: true,
    };
  }

  const reviewMessage =
    detectedType === "meeting_schedule"
      ? `Review imported meeting schedule — ${drafts.length} weekly meeting draft(s) ready. Content dates were used (filename ignored when they conflict).`
      : `Smart import detected ${drafts.length} possible record(s) for ${importMeta.label}. This is a best-effort extraction — review before confirming.`;

  return {
    detectedType,
    confidence,
    target: importMeta.target,
    drafts,
    type,
    message: reviewMessage,
    needsOcr: false,
    parsed,
    parseable: true,
    lowConfidence: confidence < 0.45 || detectedType === "needs_review",
  };
}

module.exports = {
  inferScheduleYear,
  isBctScheduleContent,
  parseBctMeetingScheduleText,
  scoreClassification,
  parseDraftRecords,
  buildImportResponse,
};
