import JSZip from "npm:jszip@3.10.1";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { ext } from "./import-meta.ts";

const TEXT_EXT = ["txt", "csv", "json", "md", "log"];
const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp"];

export interface ExtractionResult {
  text: string | null;
  needsOcr: boolean;
  parseable: boolean;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function extractTextFromXmlFragment(fragment: string): string {
  let out = "";
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\s*\/>|<w:br(?:\s[^>]*)?\/>|<w:cr(?:\s[^>]*)?\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment)) !== null) {
    if (m[0].includes("w:tab")) out += "\t";
    else if (m[0].includes("w:br") || m[0].includes("w:cr")) out += "\n";
    else out += decodeXmlEntities(m[1] || "");
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Unzip DOCX and read word/document.xml — preserves table rows/cells as TSV lines. */
export async function extractDocxText(bytes: Uint8Array): Promise<string | null> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const docXml = await zip.file("word/document.xml")?.async("string");
    if (!docXml) return null;

    const lines: string[] = [];
    const trRe = /<w:tr[\s\S]*?<\/w:tr>/g;
    let trMatch: RegExpExecArray | null;
    let foundTable = false;

    while ((trMatch = trRe.exec(docXml)) !== null) {
      const rowXml = trMatch[0];
      const cells: string[] = [];
      const tcRe = /<w:tc[\s\S]*?<\/w:tc>/g;
      let tcMatch: RegExpExecArray | null;
      while ((tcMatch = tcRe.exec(rowXml)) !== null) {
        const cellText = extractTextFromXmlFragment(tcMatch[0]);
        if (cellText) cells.push(cellText);
      }
      if (cells.length) {
        foundTable = true;
        lines.push(cells.join("\t"));
      }
    }

    if (foundTable && lines.length) return lines.join("\n");

    // Fallback: all w:t nodes in document order
    const parts: string[] = [];
    const tRe = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\s*\/>|<w:br(?:\s[^>]*)?\/>|<w:p[\s\S]*?\/>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tRe.exec(docXml)) !== null) {
      if (tm[0].startsWith("<w:p")) parts.push("\n");
      else if (tm[0].includes("w:tab")) parts.push("\t");
      else if (tm[0].includes("w:br")) parts.push("\n");
      else parts.push(decodeXmlEntities(tm[1] || ""));
    }
    const flat = parts.join("").replace(/\n{3,}/g, "\n\n").trim();
    return flat || null;
  } catch (e) {
    console.warn("[extract] docx", e);
    return null;
  }
}

function trySimplePdfText(bytes: Uint8Array): string | null {
  try {
    const raw = new TextDecoder("latin1").decode(bytes);
    const chunks: string[] = [];
    // (text) Tj operators
    const tjRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*Tj/g;
    let m: RegExpExecArray | null;
    while ((m = tjRe.exec(raw)) !== null) {
      const t = m[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")")
        .replace(/\\\\/g, "\\");
      if (t.trim()) chunks.push(t);
    }
    const joined = chunks.join(" ").replace(/\s+/g, " ").trim();
    if (joined.length >= 40) return joined;
    return null;
  } catch {
    return null;
  }
}

async function extractXlsxText(bytes: Uint8Array): Promise<string | null> {
  try {
    const wb = XLSX.read(bytes, { type: "array" });
    return wb.SheetNames.map(
      (n) => `--- ${n} ---\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`,
    ).join("\n\n");
  } catch (e) {
    console.warn("[extract] xlsx", e);
    return null;
  }
}

export async function extractTextFromBytes(
  bytes: Uint8Array,
  fileName: string,
  mimeType?: string | null,
): Promise<ExtractionResult> {
  const e = ext(fileName);
  const mime = (mimeType || "").toLowerCase();

  if (TEXT_EXT.includes(e) || mime.includes("text") || e === "csv") {
    try {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).trim();
      return { text: text || null, needsOcr: false, parseable: !!text };
    } catch {
      return { text: null, needsOcr: false, parseable: false };
    }
  }

  if (e === "json" || mime.includes("json")) {
    try {
      const text = new TextDecoder("utf-8").decode(bytes);
      JSON.parse(text);
      return { text, needsOcr: false, parseable: true };
    } catch {
      return { text: null, needsOcr: false, parseable: false };
    }
  }

  if (e === "xlsx" || e === "xls" || mime.includes("spreadsheet")) {
    const text = await extractXlsxText(bytes);
    return { text, needsOcr: false, parseable: !!text };
  }

  if (e === "docx" || e === "doc" || mime.includes("wordprocessingml")) {
    const text = await extractDocxText(bytes);
    return { text, needsOcr: false, parseable: !!text };
  }

  if (e === "pdf" || mime.includes("pdf")) {
    const text = trySimplePdfText(bytes);
    return { text, needsOcr: !text, parseable: !!text };
  }

  if (IMAGE_EXT.includes(e) || mime.startsWith("image/")) {
    return { text: null, needsOcr: true, parseable: false };
  }

  return { text: null, needsOcr: false, parseable: false };
}
