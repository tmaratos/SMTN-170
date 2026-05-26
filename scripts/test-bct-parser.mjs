const sampleText = `May 2026 BCT Flights Training Schedule

Week 1 - 5/5\tWeek 2 - 5/12\tWeek 3 - 5/19\tWeek 4 - 5/26
Uniform\tPT\tABU\tABU\tBlues
Opening\tAttendance\tDrill setup\tSafety\tCommander
Emphasis\tCustoms\tDrill core\tES\tUniform standards
Block #1\tDrill\tLeadership\tCPFT\tReview
Block #2\tPT\tInspection\tFirst aid\tDrill
Closing\tAnnouncements\tRecap\tPlan\tAwards
`;

function isBctScheduleContent(text) {
  const t = (text || "").toLowerCase();
  if (!t) return false;
  const hasWeeks = /week\s*\d\s*[-–—]\s*\d{1,2}\/\d{1,2}/i.test(text);
  const markers = ["uniform", "opening", "emphasis", "block", "closing"];
  const hits = markers.filter((m) => t.includes(m)).length;
  return hasWeeks && hits >= 4;
}

const weekRe = /week\s*(\d)\s*[-–—]\s*(\d{1,2})\/(\d{1,2})/gi;
const weeks = [];
let match;
while ((match = weekRe.exec(sampleText)) !== null) {
  weeks.push({ weekNum: parseInt(match[1], 10), month: parseInt(match[2], 10), day: parseInt(match[3], 10) });
}

console.log("isBct:", isBctScheduleContent(sampleText));
console.log("weeks:", weeks.length, weeks);
if (weeks.length === 4 && weeks[0].month === 5) {
  console.log("PASS");
} else {
  console.error("FAIL");
  process.exit(1);
}
