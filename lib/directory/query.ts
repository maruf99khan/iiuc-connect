/** Page size and URL parsing for the member directory. */
export const PAGE_SIZE = 20;
export const MAX_PAGE = 500;

export function parsePage(input: unknown): number {
  if (typeof input !== "string" || !/^[1-9]\d*$/.test(input)) return 1;
  return Math.min(Number(input), MAX_PAGE);
}

export type Who = "student" | "alumni";

export function parseWho(input: unknown): Who | null {
  return input === "student" || input === "alumni" ? input : null;
}
