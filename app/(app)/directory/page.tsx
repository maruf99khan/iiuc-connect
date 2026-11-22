import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/auth/session";
import { memberLine, workLine } from "@/lib/directory/format";
import {
  PAGE_SIZE,
  ilikePattern,
  parsePage,
  parseWho,
  searchWords,
} from "@/lib/directory/query";
import { createClient } from "@/lib/supabase/server";
import { VERIFIED_STATUSES, isVerified } from "@/lib/verification/status";

export const metadata: Metadata = { title: "Member directory" };

export default function DirectoryPage({
  searchParams,
}: PageProps<"/directory">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading the directory…</p>}>
      <Directory searchParams={searchParams} />
    </Suspense>
  );
}

async function Directory({
  searchParams,
}: Pick<PageProps<"/directory">, "searchParams">) {
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  if (!user) redirect("/sign-in?next=/directory");

  const supabase = await createClient();
  const { data: me } = await supabase
    .from("profiles")
    .select("verification_status")
    .eq("id", user.id)
    .maybeSingle();

  if (!me || !isVerified(me.verification_status)) {
    return (
      <>
        <h1 className="text-3xl font-bold tracking-tight text-balance">
          Member directory
        </h1>
        <p className="max-w-prose leading-7 text-muted">
          The directory is for members whose IIUC affiliation is verified, so
          everyone in it can trust who they find.
        </p>
        <Link href="/verify" className="button button-primary self-start">
          Verify my IIUC affiliation
        </Link>
      </>
    );
  }

  const q = typeof params.q === "string" ? params.q.slice(0, 200) : "";
  const words = searchWords(q);
  const who = parseWho(params.who);
  const page = parsePage(params.page);
  const from = (page - 1) * PAGE_SIZE;

  // Row Level Security already limits this to profiles the viewer may read.
  // Private profiles are excluded here as well, because an admin can read them.
  let query = supabase
    .from("profiles")
    .select(
      "id, full_name, headline, job_title, company, location, department, batch, graduation_year, affiliation, skills",
      { count: "exact" },
    )
    .in("verification_status", [...VERIFIED_STATUSES])
    .neq("visibility", "private")
    .neq("id", user.id);
  for (const word of words) {
    query = query.ilike("search_text", ilikePattern(word));
  }
  if (who) query = query.eq("affiliation", who);

  const {
    data: members,
    count,
    error,
  } = await query
    .order("full_name")
    .order("id")
    .range(from, from + PAGE_SIZE - 1);

  // Asking for a page past the end is an empty result, not a failure.
  const pastTheEnd = error?.code === "PGRST103";
  if (error && !pastTheEnd) {
    return (
      <p role="alert" className="leading-7 text-danger">
        We could not load the directory. Refresh the page to try again.
      </p>
    );
  }

  const total = count ?? 0;
  const last = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (target: number) => {
    const search = new URLSearchParams();
    if (q.trim()) search.set("q", q.trim());
    if (who) search.set("who", who);
    if (target > 1) search.set("page", String(target));
    const text = search.toString();
    return text ? `/directory?${text}` : "/directory";
  };

  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-balance">
          Member directory
        </h1>
        <p className="max-w-prose leading-7 text-muted">
          Verified IIUC students and graduates who have chosen to be listed.
          Search by name, department, batch, skill, company or city.
        </p>
      </div>

      <form
        action="/directory"
        method="get"
        role="search"
        className="flex flex-col gap-3"
      >
        <label htmlFor="directory-q" className="text-sm font-medium">
          Search
        </label>
        <input
          id="directory-q"
          name="q"
          type="search"
          defaultValue={q}
          maxLength={200}
          autoComplete="off"
          placeholder="For example: python cse 45"
          className="field"
        />
        <div className="flex gap-3">
          <label htmlFor="directory-who" className="sr-only">
            Show
          </label>
          <select
            id="directory-who"
            name="who"
            defaultValue={who ?? ""}
            className="field flex-1"
          >
            <option value="">Students and graduates</option>
            <option value="student">Students</option>
            <option value="alumni">Graduates</option>
          </select>
          <button type="submit" className="button button-primary">
            Search
          </button>
        </div>
      </form>

      <p role="status" className="text-sm text-muted">
        {pastTheEnd
          ? "There is no page " + page + " of these results."
          : total === 0
            ? "No members match. Try fewer or different words."
            : `${total} ${total === 1 ? "member" : "members"}${
                last > 1 ? `, page ${page} of ${last}` : ""
              }`}
      </p>
      {pastTheEnd ? (
        <Link href={href(1)} className="self-start">
          Go to the first page
        </Link>
      ) : null}

      {members && members.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {members.map((member) => (
            <li key={member.id} className="flex flex-col gap-1 py-5">
              <h2 className="text-lg font-semibold break-words">
                <Link href={`/members/${member.id}`}>{member.full_name}</Link>
              </h2>
              <p className="text-sm text-muted">{memberLine(member)}</p>
              {member.headline ? (
                <p className="break-words">{member.headline}</p>
              ) : null}
              {workLine(member) ? (
                <p className="text-sm text-muted">{workLine(member)}</p>
              ) : null}
              {member.skills.length > 0 ? (
                <p className="text-sm text-muted">
                  {member.skills.slice(0, 6).join(", ")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {last > 1 ? (
        <nav
          aria-label="Pages"
          className="flex items-center justify-between gap-4"
        >
          {page > 1 ? (
            <Link href={href(page - 1)}>Previous page</Link>
          ) : (
            <span />
          )}
          {page < last ? <Link href={href(page + 1)}>Next page</Link> : <span />}
        </nav>
      ) : null}
    </>
  );
}
