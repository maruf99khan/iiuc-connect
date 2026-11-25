/** "Tue 1 Dec, 3:30 pm" in Bangladesh time, whatever the server's own zone. */
export function formatDhaka(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Dhaka",
  });
}

/**
 * Slots must start after this to be offered. The database refuses a request for a slot less
 * than 30 minutes away; the extra minute covers the time spent filling in the form's first fields.
 */
export function bookableAfter(now: Date = new Date()): string {
  return new Date(now.getTime() + 31 * 60_000).toISOString();
}

/** An https link with a host, no spaces, no credentials, at most 300 characters. */
export function isHttpsLink(value: string): boolean {
  if (value.length > 300 || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname !== "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}
