/**
 * Quick sanity check for BCT meeting schedule parser (run with Deno).
 * deno run --allow-read supabase/functions/_shared/test-bct-parser.ts
 */
import { parseBctMeetingScheduleText, isBctScheduleContent } from "./parsers.ts";

const sampleText = `May 2026 BCT Flights Training Schedule

Week 1 - 5/5	Week 2 - 5/12	Week 3 - 5/19	Week 4 - 5/26
Uniform	PT	ABU	ABU	Blues
Opening	Attendance and uniform check	Drill evaluation setup	Safety briefing	Commander's call
Emphasis	Customs and courtesies	Drill core	ES awareness	Uniform standards
Block #1	Drill practice	Leadership lab	CPFT prep	Review boards
Block #2	Physical training	Uniform inspection	First aid scenarios	Close order drill
Closing	Announcements and dismissal	Week recap	Plan next week	Awards and dismissal
`;

const fileName = "June 2026.docx";

console.log("isBct:", isBctScheduleContent(sampleText));
const drafts = parseBctMeetingScheduleText(sampleText, { fileName, sourceFileName: fileName });
console.log("draft count:", drafts?.length);
drafts?.forEach((d, i) => {
  console.log(i + 1, d.meeting_date, d.uniform, d.title);
});

if (!drafts || drafts.length !== 4) {
  console.error("FAIL: expected 4 drafts");
  Deno.exit(1);
}
const dates = drafts.map((d) => d.meeting_date);
if (!dates.includes("2026-05-05") || !dates.includes("2026-05-26")) {
  console.error("FAIL: expected May 2026 dates, got", dates);
  Deno.exit(1);
}
console.log("PASS");
