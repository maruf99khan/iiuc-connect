import { describe, expect, it } from "vitest";

import { parsePublicEnv } from "@/lib/env.schema";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_0123456789abcdef",
};

describe("parsePublicEnv", () => {
  it("returns the values when both variables are valid", () => {
    expect(parsePublicEnv(valid)).toEqual(valid);
  });

  it("names the missing variable", () => {
    expect(() =>
      parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: undefined }),
    ).toThrowError(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("rejects a URL that is not https", () => {
    expect(() =>
      parsePublicEnv({
        ...valid,
        NEXT_PUBLIC_SUPABASE_URL: "http://example.supabase.co",
      }),
    ).toThrowError(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("rejects a key that is too short to be real", () => {
    expect(() =>
      parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "x" }),
    ).toThrowError(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it("never echoes the supplied values in the error message", () => {
    const secretLooking = "not-a-url-but-should-not-be-printed";
    try {
      parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: secretLooking });
      expect.unreachable("parsePublicEnv should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(secretLooking);
    }
  });
});
