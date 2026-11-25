/** Up to two letters: first letter of the first and last word. "?" when there is no name. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  // Code points, not UTF-16 units, so Bangla and other non-Latin letters are not cut in half.
  const first = (w: string | undefined) => (Array.from(w ?? "")[0] ?? "").toUpperCase();
  return first(words[0]) + (words.length > 1 ? first(words[words.length - 1]) : "");
}

/** Which of the six avatar tints (0 to 5) this id gets. Same id, same colour, everywhere. */
export function avatarTint(id: string): 0 | 1 | 2 | 3 | 4 | 5 {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 6) as 0 | 1 | 2 | 3 | 4 | 5;
}
