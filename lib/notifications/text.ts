import type { Enums } from "@/types/database.types";

type Kind = Enums<"notification_kind">;

const TEXT: Record<Kind, string> = {
  request_received: "You have a new session request.",
  request_accepted: "A graduate accepted your session request.",
  request_declined: "A graduate declined your session request.",
  request_cancelled: "A session was cancelled.",
  request_expired: "Your session request expired with no answer.",
  application_received: "Someone applied to your job.",
  application_shortlisted: "You were shortlisted for a job.",
  application_rejected: "A job application was not taken forward.",
  application_withdrawn: "An applicant withdrew from your job.",
};

/** One plain sentence per kind. A row holds no names or free text by design. */
export function notificationText(kind: Kind): string {
  return TEXT[kind] ?? "Something changed.";
}
