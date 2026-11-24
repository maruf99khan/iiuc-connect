import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/auth/session";
import { WEEKDAYS } from "@/lib/mentorship/schemas";
import { formatDhaka } from "@/lib/mentorship/time";
import { createClient } from "@/lib/supabase/server";
import { isVerified } from "@/lib/verification/status";

import { cancelRequest, markOutcome, removeRule } from "./actions";
import { FeedbackForm } from "./feedback-form";
import { MentorProfileForm } from "./mentor-profile-form";
import { RespondForm } from "./respond-form";
import { RuleForm } from "./rule-form";

export const metadata: Metadata = { title: "Sessions" };

// Fixed messages looked up by code, so nothing from the URL is shown as text.
const NOTICES = {
  requested: "Request sent. The mentor has 72 hours to answer.",
  accepted: "Request accepted.",
  declined: "Request declined.",
  cancelled: "Cancelled.",
  closed: "Session closed.",
  rated: "Thank you. Your rating is saved.",
  saved: "Mentor profile saved.",
  rule: "Window added. Slots will appear in a moment.",
  ruleRemoved: "Window removed.",
} as const;

const LOAD_ERROR = "We could not load this. Reload the page.";

const STATUS_TEXT: Record<string, string> = {
  pending: "Waiting for an answer",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
  scheduled: "Scheduled",
  completed: "Completed",
  no_show: "No-show",
};

function Badge({ status }: { status: string }) {
  return (
    <span className="self-start rounded-full border border-border px-2 py-0.5 text-xs">
      {STATUS_TEXT[status] ?? status}
    </span>
  );
}

function CancelButton({ requestId, label }: { requestId: string; label: string }) {
  return (
    <form action={cancelRequest}>
      <input type="hidden" name="requestId" value={requestId} />
      <button type="submit" className="button button-quiet min-h-11 px-4 text-sm">
        {label}
      </button>
    </form>
  );
}

function MeetingLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="self-start break-all"
    >
      Join the meeting (opens in a new tab)
    </a>
  );
}

export default function SessionsPage({ searchParams }: PageProps<"/sessions">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading your sessions…</p>}>
      <Sessions searchParams={searchParams} />
    </Suspense>
  );
}

async function Sessions({
  searchParams,
}: Pick<PageProps<"/sessions">, "searchParams">) {
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  if (!user) redirect("/sign-in?next=/sessions");

  const supabase = await createClient();
  const nowMs = new Date().getTime();

  const [mentor, rules, requests, sessions, feedback, me] = await Promise.all([
    supabase
      .from("mentor_profiles")
      .select("expertise_areas, bio, max_sessions_per_week, accepting_requests")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("mentor_availability_rules")
      .select("id, weekday, start_time, end_time")
      .eq("mentor_id", user.id)
      .order("weekday")
      .order("start_time"),
    supabase
      .from("mentorship_requests")
      .select(
        "id, status, mentee_id, mentor_id, duration_minutes, goal, question_1, question_2, meeting_url, expires_at, slot:mentor_slots(starts_at), mentee:profiles!mentorship_requests_mentee_id_fkey(full_name), mentor:profiles!mentorship_requests_mentor_id_fkey(full_name)",
      )
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("sessions")
      .select(
        "id, status, mentor_id, mentee_id, starts_at, duration_minutes, meeting_url, outcome_at, request_id",
      )
      .order("starts_at", { ascending: false })
      .limit(50),
    supabase
      .from("session_feedback")
      .select("session_id, reviewer_id, reviewee_id, rating, comment"),
    supabase
      .from("profiles")
      .select("affiliation, verification_status")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  for (const [name, result] of Object.entries({
    mentor,
    rules,
    requests,
    sessions,
    feedback,
    me,
  })) {
    if (result.error) console.error(`sessions page: ${name} failed:`, result.error.code);
  }

  const verified = !!me.data && isVerified(me.data.verification_status);
  const isMentor = verified && me.data?.affiliation === "alumni";

  const allRequests = requests.data ?? [];
  const asMentee = allRequests.filter((r) => r.mentee_id === user.id);
  const asMentor = allRequests.filter((r) => r.mentor_id === user.id);
  const live = asMentor.filter((r) => r.status === "pending" || r.status === "accepted");
  const byId = new Map(allRequests.map((r) => [r.id, r]));
  const allFeedback = feedback.data ?? [];

  const noticeKey = (Object.keys(NOTICES) as (keyof typeof NOTICES)[]).find(
    (key) => params[key] !== undefined,
  );
  const notice = noticeKey ? NOTICES[noticeKey] : undefined;
  const problem = params.problem !== undefined;

  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-balance">Sessions</h1>
        <p className="max-w-prose leading-7 text-muted">
          Short one-to-one sessions of 15, 20 or 30 minutes with a verified IIUC
          graduate. You ask for a time, the graduate accepts or declines. All
          times are Bangladesh time.
        </p>
      </div>

      {notice ? (
        <p
          role="status"
          className="rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-6"
        >
          {notice}
        </p>
      ) : null}
      {problem ? (
        <p
          role="alert"
          className="rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-6 text-danger"
        >
          That did not work. Reload the page and try again.
        </p>
      ) : null}

      <section aria-labelledby="mine-heading" className="flex flex-col gap-4">
        <h2 id="mine-heading" className="text-xl font-semibold">
          Your requests
        </h2>
        {requests.error ? (
          <p role="alert" className="text-danger">
            {LOAD_ERROR}
          </p>
        ) : asMentee.length === 0 ? (
          <p className="leading-7 text-muted">
            You have not asked for a session yet.{" "}
            {verified ? (
              <>
                Find a graduate in the <Link href="/directory">member directory</Link>{" "}
                and open their page to see their open times.
              </>
            ) : (
              <>
                Sessions are for verified members.{" "}
                <Link href="/verify">Verify your affiliation</Link>
              </>
            )}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {asMentee.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 py-5">
                <p className="font-semibold">
                  {r.slot ? formatDhaka(r.slot.starts_at) : "Time no longer available"}
                </p>
                <p className="break-words">
                  With {r.mentor?.full_name || "a graduate"} · {r.duration_minutes} minutes
                </p>
                <Badge status={r.status} />
                {r.status === "pending" ? (
                  <>
                    <p className="text-sm text-muted">Expires {formatDhaka(r.expires_at)}</p>
                    <CancelButton requestId={r.id} label="Cancel request" />
                  </>
                ) : null}
                {r.status === "accepted" ? (
                  <>
                    {r.meeting_url ? <MeetingLink url={r.meeting_url} /> : null}
                    <CancelButton requestId={r.id} label="Cancel session" />
                  </>
                ) : null}
                {r.status === "declined" ? (
                  <p className="text-sm text-muted">
                    The graduate could not take this one. Try another time.
                  </p>
                ) : null}
                {r.status === "expired" ? (
                  <p className="text-sm text-muted">
                    There was no answer within 72 hours, so the time was released.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="sessions-heading" className="flex flex-col gap-4">
        <h2 id="sessions-heading" className="text-xl font-semibold">
          Your sessions
        </h2>
        {sessions.error ? (
          <p role="alert" className="text-danger">
            {LOAD_ERROR}
          </p>
        ) : (sessions.data ?? []).length === 0 ? (
          <p className="leading-7 text-muted">Accepted requests become sessions here.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {(sessions.data ?? []).map((s) => {
              const request = byId.get(s.request_id);
              const iAmMentor = s.mentor_id === user.id;
              const other = iAmMentor
                ? request?.mentee?.full_name || "a verified member"
                : request?.mentor?.full_name || "a graduate";
              const ended =
                nowMs >= new Date(s.starts_at).getTime() + s.duration_minutes * 60000;
              const mine = allFeedback.find(
                (f) => f.session_id === s.id && f.reviewer_id === user.id,
              );
              const theirs = allFeedback.find(
                (f) => f.session_id === s.id && f.reviewee_id === user.id,
              );
              return (
                <li key={s.id} className="flex flex-col gap-2 py-5">
                  <p className="font-semibold">{formatDhaka(s.starts_at)}</p>
                  <p className="break-words">
                    With {other} · {s.duration_minutes} minutes
                  </p>
                  <Badge status={s.status} />
                  {s.status === "scheduled" && !ended ? <MeetingLink url={s.meeting_url} /> : null}
                  {s.status === "scheduled" && ended && iAmMentor ? (
                    <div className="flex flex-wrap gap-3">
                      {(["completed", "no_show"] as const).map((outcome) => (
                        <form action={markOutcome} key={outcome}>
                          <input type="hidden" name="sessionId" value={s.id} />
                          <input type="hidden" name="outcome" value={outcome} />
                          <button
                            type="submit"
                            className="button button-quiet min-h-11 px-4 text-sm"
                          >
                            {outcome === "completed" ? "Mark completed" : "Mark no-show"}
                          </button>
                        </form>
                      ))}
                    </div>
                  ) : null}
                  {s.status === "scheduled" && ended && !iAmMentor ? (
                    <p className="text-sm text-muted">
                      Waiting for the graduate to close this session.
                    </p>
                  ) : null}
                  {s.status === "completed" && !mine ? <FeedbackForm sessionId={s.id} /> : null}
                  {mine ? (
                    <p className="text-sm break-words">
                      Your rating: {mine.rating} of 5{mine.comment ? ` · ${mine.comment}` : ""}
                    </p>
                  ) : null}
                  {theirs ? (
                    <p className="text-sm break-words">
                      Their rating: {theirs.rating} of 5
                      {theirs.comment ? ` · ${theirs.comment}` : ""}
                    </p>
                  ) : s.status === "completed" && mine ? (
                    <p className="text-sm text-muted">
                      Their rating appears once both of you have rated, or after 7 days.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {isMentor || asMentor.length > 0 ? (
        <section aria-labelledby="incoming-heading" className="flex flex-col gap-4">
          <h2 id="incoming-heading" className="text-xl font-semibold">
            Requests to you
          </h2>
          {live.length === 0 ? (
            <p className="leading-7 text-muted">No requests waiting.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border border-y border-border">
              {live.map((r) => (
                <li key={r.id} className="flex flex-col gap-2 py-5">
                  <p className="font-semibold">
                    {r.slot ? formatDhaka(r.slot.starts_at) : "Time no longer available"}
                  </p>
                  <p className="break-words">
                    From {r.mentee?.full_name || "a verified member"} · {r.duration_minutes} minutes
                  </p>
                  <Badge status={r.status} />
                  <p className="text-sm break-words whitespace-pre-line">
                    <span className="font-medium">Goal:</span> {r.goal}
                  </p>
                  <p className="text-sm break-words">
                    <span className="font-medium">Question 1:</span> {r.question_1}
                  </p>
                  {r.question_2 ? (
                    <p className="text-sm break-words">
                      <span className="font-medium">Question 2:</span> {r.question_2}
                    </p>
                  ) : null}
                  {r.status === "pending" ? (
                    <RespondForm requestId={r.id} />
                  ) : (
                    <CancelButton requestId={r.id} label="Cancel session" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section aria-labelledby="mentor-heading" className="flex flex-col gap-4">
        <h2 id="mentor-heading" className="text-xl font-semibold">
          Mentor settings
        </h2>
        {isMentor ? (
          <>
            {mentor.error ? (
              <p role="alert" className="text-danger">
                {LOAD_ERROR}
              </p>
            ) : (
              <MentorProfileForm profile={mentor.data} />
            )}
            <h3 className="text-lg font-semibold">Weekly availability</h3>
            {rules.error ? (
              <p role="alert" className="text-danger">
                {LOAD_ERROR}
              </p>
            ) : (rules.data ?? []).length === 0 ? (
              <p className="leading-7 text-muted">
                You have no weekly windows. Add one so members can request you.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border border-y border-border">
                {(rules.data ?? []).map((rule) => (
                  <li
                    key={rule.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <span>
                      {WEEKDAYS[rule.weekday]} {rule.start_time.slice(0, 5)} to{" "}
                      {rule.end_time.slice(0, 5)} (Bangladesh time)
                    </span>
                    <form action={removeRule}>
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <button type="submit" className="button button-quiet min-h-11 px-4 text-sm">
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <h3 className="text-lg font-semibold">Add a window</h3>
            <RuleForm />
          </>
        ) : (
          <p className="max-w-prose leading-7 text-muted">
            Verified graduates can offer sessions here.
          </p>
        )}
      </section>
    </>
  );
}
