import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { Badge, Chip } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { workLine } from "@/lib/directory/format";
import type { Database } from "@/types/database.types";

type Member = Database["public"]["Functions"]["search_members"]["Returns"][number];

const SHOWN_SKILLS = 3;

/** One search result. The name is the only link; it stretches to cover the whole card. */
export function MemberCard({ member }: { member: Member }) {
  const work = workLine(member);
  const alumni = member.affiliation === "alumni";
  const batch = [member.department, member.batch ? `batch ${member.batch}` : null]
    .filter(Boolean)
    .join(" · ");
  const extra = member.skills.length - SHOWN_SKILLS;

  return (
    <Card as="li" interactive className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <Avatar id={member.id} name={member.full_name} size={56} />
        <div className="min-w-0">
          <h2 className="text-lg leading-snug font-bold break-words">
            <Link
              href={`/members/${member.id}`}
              className="text-foreground no-underline after:absolute after:inset-0 after:rounded-2xl hover:no-underline"
            >
              {member.full_name}
            </Link>
          </h2>
          <p className="mt-0.5 text-sm break-words text-muted">{member.headline ?? work}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge tone={alumni ? "accent" : "ink"}>{alumni ? "Alumni" : "Student"}</Badge>
        {batch ? <Badge>{batch}</Badge> : null}
      </div>

      {member.headline && work ? (
        <p className="flex items-start gap-2 text-sm text-muted">
          <Icon name="building" className="mt-0.5 size-4" />
          <span className="break-words">{work}</span>
        </p>
      ) : null}

      {member.skills.length > 0 ? (
        <ul className="mt-auto flex flex-wrap gap-2">
          {member.skills.slice(0, SHOWN_SKILLS).map((skill) => (
            <li key={skill}>
              <Chip>{skill}</Chip>
            </li>
          ))}
          {extra > 0 ? (
            <li className="inline-flex items-center px-1 text-sm text-muted">+{extra} more</li>
          ) : null}
        </ul>
      ) : null}
    </Card>
  );
}
