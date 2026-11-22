"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import type { SessionFormState } from "@/lib/sessions/form-state";
import { bookingNoteSchema, slotSchema } from "@/lib/sessions/slot";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.uuid();

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/sessions");
  return user;
}

function echo(formData: FormData, fields: readonly string[]) {
  const values: Record<string, string> = {};
  for (const field of fields) {
    const value = formData.get(field);
    if (typeof value === "string") values[field] = value.slice(0, 400);
  }
  return values as SessionFormState["values"];
}

const OFFER_FIELDS = ["startsAt", "duration", "topic", "meetingUrl"] as const;

/** A verified graduate offers a slot, with the meeting link only the booker sees. */
export async function offerSlot(
  _previous: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  await requireUser();
  const values = echo(formData, OFFER_FIELDS);

  const parsed = slotSchema.safeParse(
    Object.fromEntries(OFFER_FIELDS.map((f) => [f, formData.get(f)])),
  );
  if (!parsed.success) {
    return {
      status: "error",
      message: "Some details need fixing. Check the fields marked below.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
      values,
    };
  }

  const { meeting_url, ...slot } = parsed.data;
  const supabase = await createClient();

  const { data: created, error } = await supabase
    .from("mentor_slots")
    .insert(slot)
    .select("id")
    .single();

  if (error || !created) {
    const message =
      error?.code === "54000"
        ? "You already have 10 open slots. Cancel one before adding another."
        : error?.code === "42501"
          ? "Only verified graduates can offer sessions."
          : "We could not add the slot. Nothing was saved. Try again.";
    if (!["54000", "42501"].includes(error?.code ?? "")) {
      console.error("offer slot failed:", error?.code);
    }
    return { status: "error", message, values };
  }

  const { error: linkError } = await supabase
    .from("mentor_slot_links")
    .insert({ slot_id: created.id, meeting_url });

  if (linkError) {
    console.error("offer slot link failed:", linkError.code);
    // A slot nobody can join must not stay open.
    await supabase
      .from("mentor_slots")
      .update({ status: "cancelled" })
      .eq("id", created.id);
    return {
      status: "error",
      message:
        "We could not save the meeting link. Nothing was added. Try again.",
      values,
    };
  }

  redirect("/sessions?added=1");
}

/** The mentor cancels one of their own slots (open or booked). */
export async function cancelSlot(formData: FormData) {
  await requireUser();
  const id = idSchema.safeParse(formData.get("slotId"));
  if (id.success) {
    const supabase = await createClient();
    const { error } = await supabase
      .from("mentor_slots")
      .update({ status: "cancelled" })
      .eq("id", id.data)
      .in("status", ["open", "booked"]);
    if (error) console.error("cancel slot failed:", error.code);
  }
  redirect("/sessions?cancelled=1");
}

/** A verified member books an open slot for themselves. */
export async function bookSlot(
  _previous: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const user = await requireUser();
  const values = echo(formData, ["note"]);

  const id = idSchema.safeParse(formData.get("slotId"));
  const note = bookingNoteSchema.safeParse(formData.get("note"));
  if (!id.success) {
    return {
      status: "error",
      message: "That slot could not be found.",
      values,
    };
  }
  if (!note.success) {
    return {
      status: "error",
      fieldErrors: { note: note.error.issues.map((i) => i.message) },
      values,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mentor_slots")
    .update({ status: "booked", booked_by: user.id, booker_note: note.data })
    .eq("id", id.data)
    .eq("status", "open")
    .select("id");

  if (error) {
    if (error.code === "54000") {
      return {
        status: "error",
        message:
          "You already have 3 upcoming sessions. Cancel one to book another.",
        values,
      };
    }
    if (error.code !== "42501") console.error("book slot failed:", error.code);
    return {
      status: "error",
      message: "We could not book that slot. Try again, or pick another.",
      values,
    };
  }

  if (!data || data.length === 0) {
    return {
      status: "error",
      message:
        "Someone else just booked that slot, or it was cancelled. Pick another.",
      values,
    };
  }

  redirect("/sessions?booked=1");
}

/** The person who booked gives the slot back. */
export async function releaseBooking(formData: FormData) {
  const user = await requireUser();
  const id = idSchema.safeParse(formData.get("slotId"));
  if (id.success) {
    const supabase = await createClient();
    const { error } = await supabase
      .from("mentor_slots")
      .update({ status: "open", booked_by: null })
      .eq("id", id.data)
      .eq("booked_by", user.id)
      .eq("status", "booked");
    if (error) console.error("release booking failed:", error.code);
  }
  redirect("/sessions?released=1");
}
