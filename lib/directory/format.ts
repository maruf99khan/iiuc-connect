type Member = {
  affiliation: "student" | "alumni" | null;
  department: string | null;
  batch: string | null;
  graduation_year: number | null;
};

export const affiliationLabel = (affiliation: Member["affiliation"]) =>
  affiliation === "alumni" ? "IIUC graduate" : "IIUC student";

/** "IIUC graduate · CSE · batch 30 · class of 2019" */
export function memberLine(member: Member): string {
  const parts = [affiliationLabel(member.affiliation)];
  if (member.department) parts.push(member.department);
  if (member.batch) parts.push(`batch ${member.batch}`);
  if (member.affiliation === "alumni" && member.graduation_year) {
    parts.push(`class of ${member.graduation_year}`);
  }
  return parts.join(" · ");
}

/** "Engineer at Acme · Chattogram", leaving out whatever is missing. */
export function workLine(member: {
  job_title: string | null;
  company: string | null;
  location: string | null;
}): string {
  const work =
    member.job_title && member.company
      ? `${member.job_title} at ${member.company}`
      : (member.job_title ?? member.company ?? "");
  return [work, member.location].filter(Boolean).join(" · ");
}
