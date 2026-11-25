/** Page size, search limits and URL parsing for the member directory. */
export const PAGE_SIZE = 20;
export const MAX_WORDS = 5;
export const MAX_WORD_LENGTH = 40;
export const MAX_PAGE = 500;

/**
 * The words of a search box, lower-cased and de-duplicated. Every word must
 * match (see directory page), so five is plenty and keeps the query cheap.
 */
export function searchWords(input: unknown): string[] {
  if (typeof input !== "string") return [];

  const words = input
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.slice(0, MAX_WORD_LENGTH));

  return [...new Set(words)].slice(0, MAX_WORDS);
}

/**
 * An ILIKE "contains" pattern. Backslash, % and _ are wildcards or escapes in
 * ILIKE, so they are escaped; anything else is data. The pattern is sent as one
 * encoded filter value, never spliced into a filter expression.
 */
export function ilikePattern(word: string): string {
  return `%${word.replace(/[\\%_]/g, "\\$&")}%`;
}

export function parsePage(input: unknown): number {
  if (typeof input !== "string" || !/^[1-9]\d*$/.test(input)) return 1;
  return Math.min(Number(input), MAX_PAGE);
}

export type Who = "student" | "alumni";

export function parseWho(input: unknown): Who | null {
  return input === "student" || input === "alumni" ? input : null;
}
