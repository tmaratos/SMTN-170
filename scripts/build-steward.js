const fs = require("fs");

function convertActions() {
  let s = fs.readFileSync("supabase/functions/steward-core/actions.ts", "utf8");
  s = s.replace(/import type .*;\n/g, "");
  s = s.replace(/import .* from .*;\n/g, "");
  s = s.replace(/^export interface[\s\S]*?^}/gm, "");
  s = s.replace(/^export type .*$/gm, "");
  s = s.replace(/ as const/g, "");
  s = s.replace(/export async function /g, "async function ");
  s = s.replace(/export function /g, "function ");
  s = s.replace(/export const /g, "const ");
  s = s.replace(/: SupabaseClient/g, "");
  s = s.replace(/: Ctx/g, "");
  s = s.replace(/: ProfileRow/g, "");
  s = s.replace(/: ActionResult/g, "");
  s = s.replace(/: ActionDef/g, "");
  s = s.replace(/: RiskLevel/g, "");
  s = s.replace(/: Record<string, unknown>/g, "");
  s = s.replace(/: string \| null \| undefined/g, "");
  s = s.replace(/: string \| null/g, "");
  s = s.replace(/: string/g, "");
  s = s.replace(/: boolean/g, "");
  s = s.replace(/Promise<ActionResult>/g, "Promise<any>");
  s += `\nmodule.exports = {
  DISCLAIMER,
  RISK,
  BLOCKED_ACTIONS,
  REGISTRY,
  getAction,
  needsConfirmation,
  executeAction,
  formatActionReply,
  enrichParams,
  extractAfterCreateTask,
  extractPositionTitle,
  extractDepartment,
};\n`;
  fs.writeFileSync("functions/src/steward/actions.js", s);
}

function convertBrain() {
  let s = fs.readFileSync("supabase/functions/steward-core/brain.ts", "utf8");
  s = s.replace(/import type .*;\n/g, "");
  s = s.replace(/import .* from .*;\n/g, "");
  s = s.replace(/^export interface[\s\S]*?^}/gm, "");
  s = s.replace(/export async function /g, "async function ");
  s = s.replace(/export function /g, "function ");
  s = s.replace(/: Ctx/g, "");
  s = s.replace(/: PendingAction \| null/g, "");
  s = s.replace(/: PendingAction/g, "");
  s = s.replace(/: string/g, "");
  s = s.replace(/: BrainResult/g, "");
  s += `\nconst {
  DISCLAIMER,
  RISK,
  getAction,
  needsConfirmation,
  executeAction,
  enrichParams,
  formatActionReply,
  extractAfterCreateTask,
  extractPositionTitle,
  extractDepartment,
} = require("./actions");
const { buildCapGuidance, isCapGuidanceRequest } = require("./cap");

module.exports = { processMessage, titleFromMessage };\n`;
  fs.writeFileSync("functions/src/steward/brain.js", s);
}

convertActions();
convertBrain();
console.log("converted steward modules");
