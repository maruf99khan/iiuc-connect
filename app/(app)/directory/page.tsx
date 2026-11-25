import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { BrowseLayout, FilterGroup, FilterLink } from "@/components/ui/browse";
import { LinkButton } from "@/components/ui/button";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icons";
import { Pagination } from "@/components/ui/nav";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { PAGE_SIZE, parsePage, parseWho } from "@/lib/directory/query";
import { createClient } from "@/lib/supabase/server";
import { isVerified } from "@/lib/verification/status";

import { MemberCard } from "./member-card";

export const metadata: Metadata = { title: "Member directory" };

const DESCRIPTION = "Verified IIUC students and graduates who have chosen to be listed.";

export default function DirectoryPage({
  searchParams,
}: PageProps<"/directory">) {
  return (
    <Suspense fallback={<DirectorySkeleton />}>
      <Directory searchParams={searchParams} />
    </Suspense>
  );
}

function DirectorySkeleton() {
  return (
    <>
      <PageHeader title="Member directory" description={DESCRIPTION} />
      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
        <Skeleton className="hidden h-56 lg:block" />
        <div className="flex flex-col gap-6">
          <Skeleton className="h-12" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    </>
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
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <PageHeader title="Member directory" />
        <Alert tone="info" title="Verification comes first">
          The directory is for members whose IIUC affiliation is verified, so everyone in it can
          trust who they find.
        </Alert>
        <div>
          <LinkButton href="/verify" icon="arrow-right">
            Verify my IIUC affiliation
          </LinkButton>
        </div>
      </div>
    );
  }

  const q = typeof params.q === "string" ? params.q.slice(0, 200) : "";
  const who = parseWho(params.who);
  const page = parsePage(params.page);
  const from = (page - 1) * PAGE_SIZE;

  // search_members ranks by weight and tolerates typos. It runs as the viewer,
  // so Row Level Security applies, and it hides private and unverified
  // profiles and the viewer themselves (an admin can read private ones).
  const { data: members, error } = await supabase.rpc("search_members", {
    p_query: q,
    p_who: who ?? undefined,
    p_limit: PAGE_SIZE,
    p_offset: from,
  });

  // A page past the end is an empty result, not a failure.
  const pastTheEnd = !error && page > 1 && members.length === 0;
  if (error) {
    return <Alert tone="danger">We could not load the directory. Refresh the page to try again.</Alert>;
  }

  const total = members[0]?.total ?? 0;
  const last = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (target: number, filter: typeof who = who) => {
    const search = new URLSearchParams();
    if (q.trim()) search.set("q", q.trim());
    if (filter) search.set("who", filter);
    if (target > 1) search.set("page", String(target));
    const text = search.toString();
    return text ? `/directory?${text}` : "/directory";
  };

  const rail = (
    <>
      <FilterGroup title="Show">
        <FilterLink href={href(1, null)} active={!who}>
          Students and graduates
        </FilterLink>
        <FilterLink href={href(1, "alumni")} active={who === "alumni"}>
          Graduates
        </FilterLink>
        <FilterLink href={href(1, "student")} active={who === "student"}>
          Students
        </FilterLink>
      </FilterGroup>
      <p className="border-t border-border pt-4 text-sm text-muted">
        Search by name, skill, company, department, batch or city. Words can be partly typed, and
        small typos are forgiven.
      </p>
    </>
  );

  return (
    <>
      <PageHeader title="Member directory" description={DESCRIPTION} />

      <BrowseLayout rail={rail}>
        <form action="/directory" method="get" role="search" className="flex gap-3">
          {who ? <input type="hidden" name="who" value={who} /> : null}
          <label htmlFor="directory-q" className="sr-only">
            Search
          </label>
          <div className="relative flex-1">
            <Icon
              name="search"
              className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
            />
            <input
              id="directory-q"
              name="q"
              type="search"
              defaultValue={q}
              maxLength={200}
              autoComplete="off"
              placeholder="For example: python cse 45"
              className="field pl-12"
            />
          </div>
          <button type="submit" className="button button-primary">
            Search
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-sm font-semibold text-muted">
            {pastTheEnd
              ? "There is no page " + page + " of these results."
              : total === 0
                ? "No members match. Try fewer or different words."
                : `${total} ${total === 1 ? "member" : "members"}${
                    last > 1 ? `, page ${page} of ${last}` : ""
                  }`}
          </p>
          {pastTheEnd ? <Link href={href(1)}>Go to the first page</Link> : null}
        </div>

        {members && members.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {members.map((member) => (
              <MemberCard key={member.id} member={member} />
            ))}
          </ul>
        ) : pastTheEnd ? null : (
          <EmptyState
            icon="users"
            title="Nobody found"
            description="Try fewer words, or a skill or company instead of a name."
            action={
              <LinkButton href="/directory" variant="quiet">
                Clear the search
              </LinkButton>
            }
          />
        )}

        <Pagination
          page={page}
          pageCount={last}
          hrefFor={href}
          previousLabel="Previous page"
          nextLabel="Next page"
        />
      </BrowseLayout>
    </>
  );
}
