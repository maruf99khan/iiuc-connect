import { describe, expect, it } from "vitest";

import { MAX_PAGE, parsePage, parseWho } from "@/lib/directory/query";

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
