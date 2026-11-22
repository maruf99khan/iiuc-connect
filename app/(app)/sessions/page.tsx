import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/auth/session";
import { formatDhaka } from "@/lib/sessions/slot";
import { createClient } from "@/lib/supabase/server";
import { isVerified } from "@/lib/verification/status";

import { cancelSlot, releaseBooking } from "./actions";
import { OfferSlotForm } from "./offer-form";

export const metadata: Metadata = { title: "Sessions" };

// Fixed messages looked up by code, so nothing from the URL is shown as text.
const NOTICES = {
  added: "Slot added. Verified members can now book it.",
  booked: "Session booked. The meeting link is below.",
  released: "Booking cancelled. The slot is open again.",
  cancelled: "Slot cancelled.",
} as const;

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
  const now = new Date().toISOString();

  const [{ data: me }, { data: booked }, { data: offered }] = await Promise.all(
    [
      supabase
        .from("profiles")
        .select("verification_status, affiliation")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("mentor_slots")
        .select(
          "id, starts_at, duration_minutes, topic, profiles!mentor_slots_mentor_id_fkey(full_name), mentor_slot_links(meeting_url)",
        )
        .eq("booked_by", user.id)
        .eq("status", "booked")
        .gt("starts_at", now)
        .order("starts_at"),
      supabase
        .from("mentor_slots")
        .select(
          "id, starts_at, duration_minutes, topic, status, booker_note, profiles!mentor_slots_booked_by_fkey(full_name), mentor_slot_links(meeting_url)",
        )
        .eq("mentor_id", user.id)
        .in("status", ["open", "booked"])
        .gt("starts_at", now)
        .order("starts_at"),
    ],
  );

  const verified = !!me && isVerified(me.verification_status);
  const isMentor = verified && me?.affiliation === "alumni";
  const noticeKey = (Object.keys(NOTICES) as (keyof typeof NOTICES)[]).find(
    (key) => params[key] !== undefined,
  );
  const notice = noticeKey ? NOTICES[noticeKey] : undefined;

  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-balance">
          Sessions
        </h1>
        <p className="max-w-prose leading-7 text-muted">
          Short one-to-one sessions of 15 or 30 minutes with a verified IIUC
          graduate. All times are Bangladesh time.
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

      <section aria-labelledby="booked-heading" className="flex flex-col gap-4">
        <h2 id="booked-heading" className="text-xl font-semibold">
          Sessions you booked
        </h2>
        {booked && booked.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {booked.map((slot) => (
              <li key={slot.id} className="flex flex-col gap-2 py-5">
                <p className="font-semibold">{formatDhaka(slot.starts_at)}</p>
                <p>
                  {slot.topic} · {slot.duration_minutes} minutes · with{" "}
                  {slot.profiles?.full_name || "a graduate"}
                </p>
                {slot.mentor_slot_links?.meeting_url ? (
                  <a
                    href={slot.mentor_slot_links.meeting_url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="self-start break-all"
                  >
                    Join the meeting (opens in a new tab)
                  </a>
                ) : null}
                <form action={releaseBooking}>
                  <input type="hidden" name="slotId" value={slot.id} />
                  <button
                    type="submit"
                    className="button button-quiet min-h-11 px-4 text-sm"
                  >
                    Cancel my booking
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="leading-7 text-muted">
            Nothing booked yet.{" "}
            {verified ? (
              <>
                Find a graduate in the{" "}
                <Link href="/directory">member directory</Link> and open their
                page to see their open slots.
              </>
            ) : (
              <>
                Sessions are for verified members.{" "}
                <Link href="/verify">Verify your affiliation</Link>
              </>
            )}
          </p>
        )}
      </section>

      <section aria-labelledby="offer-heading" className="flex flex-col gap-4">
        <h2 id="offer-heading" className="text-xl font-semibold">
          Your availability
        </h2>
        {isMentor ? (
          <>
            {offered && offered.length > 0 ? (
              <ul className="flex flex-col divide-y divide-border border-y border-border">
                {offered.map((slot) => (
                  <li key={slot.id} className="flex flex-col gap-2 py-5">
                    <p className="font-semibold">
                      {formatDhaka(slot.starts_at)}
                    </p>
                    <p>
                      {slot.topic} · {slot.duration_minutes} minutes ·{" "}
                      {slot.status === "booked"
                        ? `booked by ${slot.profiles?.full_name || "a member"}`
                        : "open"}
                    </p>
                    {slot.booker_note ? (
                      <p className="text-sm break-words text-muted">
                        Their message: {slot.booker_note}
                      </p>
                    ) : null}
                    <form action={cancelSlot}>
                      <input type="hidden" name="slotId" value={slot.id} />
                      <button
                        type="submit"
                        className="button button-quiet min-h-11 px-4 text-sm"
                      >
                        {slot.status === "booked"
                          ? "Cancel this session"
                          : "Remove this slot"}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="leading-7 text-muted">
                You have no upcoming slots.
              </p>
            )}
            <h3 className="text-lg font-semibold">Add a slot</h3>
            <OfferSlotForm />
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
