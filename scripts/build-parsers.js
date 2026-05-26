const fs = require("fs");

let s = fs.readFileSync("supabase/functions/_shared/parsers.ts", "utf8");
s = s.replace(/import .* from .*;\n/g, "const { IMPORT_TYPES, typeToTable } = require('./import-meta');\n");
s = s.replace(/^export interface[\s\S]*?^}/gm, "");
s = s.replace(/export function /g, "function ");
s = s.replace(/export async function /g, "async function ");
s = s.replace(/: ParseOptions = \{\}/g, " = {}");
s = s.replace(/: ParseOptions/g, "");
s = s.replace(/: ClassificationResult/g, "");
s = s.replace(/: Record<string, number>/g, "");
s = s.replace(/: Record<string, unknown>/g, "");
s = s.replace(/: Record<string, string>/g, "");
s = s.replace(/: string \| undefined/g, "");
s = s.replace(/: string \| null/g, "");
s = s.replace(/: number \| null/g, "");
s = s.replace(/: string/g, "");
s = s.replace(/: number/g, "");
s = s.replace(/: boolean/g, "");
s = s.replace(/let match: RegExpExecArray \| null/g, "let match");
s = s.replace(/ \| null/g, "");
s += `\nmodule.exports = {
  inferScheduleYear,
  isBctScheduleContent,
  parseBctMeetingScheduleText,
  scoreClassification,
  parseDraftRecords,
  buildImportResponse,
};\n`;
fs.writeFileSync("functions/src/shared/parsers.js", s);
console.log("wrote parsers.js", fs.statSync("functions/src/shared/parsers.js").size);
