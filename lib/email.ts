/**
 * Sends a plain-text email via the Resend API.
 * Returns true on success, false when the key is unset or the send fails.
 * No-ops silently when RESEND_API_KEY or NOTIFICATIONS_FROM is unset so the
 * caller can keep running without crashing in environments that have no sender.
 */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATIONS_FROM;
  if (!key || !from) return false;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });

  if (!res.ok) {
    console.error(`sendEmail failed: ${res.status}`, await res.text().catch(() => ""));
    return false;
  }
  return true;
}
