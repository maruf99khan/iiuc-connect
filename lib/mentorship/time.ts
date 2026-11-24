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
