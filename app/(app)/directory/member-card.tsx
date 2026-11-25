import Link from "next/link";

import { Portrait } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { workLine } from "@/lib/directory/format";
import type { Database } from "@/types/database.types";

export type Member = Pick<
  Database["public"]["Functions"]["search_members"]["Returns"][number],
  | "id"
  | "full_name"
  | "headline"
  | "job_title"
  | "company"
  | "location"
  | "department"
  | "batch"
  | "affiliation"
  | "skills"
>;

const SHOWN_SKILLS = 3;

/** One person as a portrait tile. The name is the only link; it stretches over the whole tile. */
export function MemberCard({ member, mentoring = false }: { member: Member; mentoring?: boolean }) {
  const work = workLine(member);
  const alumni = member.affiliation === "alumni";
  const batch = [member.department, member.batch ? `batch ${member.batch}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="group relative flex flex-col items-start gap-1 rounded-md rounded-tr-[2.75rem] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-brand">
      <Portrait
        id={member.id}
        name={member.full_name}
        className="transition-transform duration-200 group-hover:-translate-y-1"
      >
        {mentoring ? (
          <span className="inline-flex rounded-full bg-background px-3 py-1 text-xs font-bold text-brand">
            Open to mentor
          </span>
        ) : null}
      </Portrait>
      <h2 className="mt-2 text-lg leading-snug font-bold break-words">
        <Link
          href={`/members/${member.id}`}
          className="font-extrabold text-foreground no-underline after:absolute after:inset-0 group-hover:underline"
        >
          {member.full_name}
        </Link>
      </h2>
      <p className="text-sm break-words">{member.headline ?? work}</p>
      {member.headline && work ? <p className="text-sm break-words text-muted">{work}</p> : null}
      {batch ? <p className="text-sm text-muted">{batch}</p> : null}
      {member.skills.length > 0 ? (
        <p className="text-sm break-words text-muted">{member.skills.slice(0, SHOWN_SKILLS).join(" · ")}</p>
      ) : null}
      <span className="mt-1">
        <Badge tone={alumni ? "accent" : "ink"}>{alumni ? "Alumni" : "Student"}</Badge>
      </span>
    </li>
  );
}
