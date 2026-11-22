import { describe, expect, it } from "vitest";

import {
  MAX_PAGE,
  MAX_WORDS,
  ilikePattern,
  parsePage,
  parseWho,
  searchWords,
} from "@/lib/directory/query";

describe("searchWords", () => {
  it("splits on whitespace and lower-cases", () => {
    expect(searchWords("  Rahim   CSE ")).toEqual(["rahim", "cse"]);
  });

  it.each([undefined, null, "", "   ", 5, ["a", "b"]])(
    "gives no words for %j",
    (input) => {
      expect(searchWords(input)).toEqual([]);
    },
  );

  it("keeps at most MAX_WORDS words", () => {
    const input = Array.from({ length: MAX_WORDS + 4 }, (_, i) => `w${i}`).join(" ");
    expect(searchWords(input)).toHaveLength(MAX_WORDS);
  });

  it("cuts a very long word", () => {
    expect(searchWords("a".repeat(500))[0]).toHaveLength(40);
  });

  it("drops duplicate words", () => {
    expect(searchWords("cse CSE cse")).toEqual(["cse"]);
  });
});

describe("ilikePattern", () => {
  it("wraps the word so it matches anywhere", () => {
    expect(ilikePattern("rahim")).toBe("%rahim%");
  });

  it("escapes the characters that ILIKE treats as wildcards", () => {
    expect(ilikePattern("50%")).toBe("%50\\%%");
    expect(ilikePattern("a_b")).toBe("%a\\_b%");
    expect(ilikePattern("a\\b")).toBe("%a\\\\b%");
  });

  it("leaves query-string and filter punctuation alone, since it is sent as a single encoded value", () => {
    expect(ilikePattern("a,b(c).d")).toBe("%a,b(c).d%");
  });
});

describe("parsePage", () => {
  it.each([
    ["1", 1],
    ["3", 3],
    [undefined, 1],
    ["0", 1],
    ["-4", 1],
    ["2.5", 1],
    ["abc", 1],
    [["2", "3"], 1],
    [String(MAX_PAGE + 1), MAX_PAGE],
  ])("reads %j as page %i", (input, expected) => {
    expect(parsePage(input)).toBe(expected);
  });
});

describe("parseWho", () => {
  it("accepts the two filters and ignores anything else", () => {
    expect(parseWho("student")).toBe("student");
    expect(parseWho("alumni")).toBe("alumni");
    expect(parseWho("everyone")).toBeNull();
    expect(parseWho(undefined)).toBeNull();
    expect(parseWho(["student"])).toBeNull();
  });
});
