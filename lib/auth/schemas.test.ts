import { describe, expect, it } from "vitest";

import {
  DEFAULT_SIGNED_IN_PATH,
  emailOtpTypeSchema,
  safeNextPath,
  signInSchema,
  signUpSchema,
} from "@/lib/auth/schemas";

describe("signUpSchema", () => {
  it("accepts a valid email and password", () => {
    const result = signUpSchema.safeParse({
      email: "student@example.com",
      password: "correct horse",
    });
    expect(result.success).toBe(true);
  });

  it("trims and lower-cases the email", () => {
    const result = signUpSchema.parse({
      email: "  Student@Example.COM ",
      password: "correct horse",
    });
    expect(result.email).toBe("student@example.com");
  });

  it("rejects something that is not an email address", () => {
    const result = signUpSchema.safeParse({
      email: "not-an-email",
      password: "correct horse",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = signUpSchema.safeParse({
      email: "student@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password longer than 72 characters", () => {
    const result = signUpSchema.safeParse({
      email: "student@example.com",
      password: "x".repeat(73),
    });
    expect(result.success).toBe(false);
  });

  it("keeps spaces inside the password", () => {
    const result = signUpSchema.parse({
      email: "student@example.com",
      password: " spaced out ",
    });
    expect(result.password).toBe(" spaced out ");
  });

  it("rejects missing fields instead of throwing", () => {
    const result = signUpSchema.safeParse({ email: null, password: null });
    expect(result.success).toBe(false);
  });
});

describe("signInSchema", () => {
  it("does not apply the sign-up length rule to existing passwords", () => {
    const result = signInSchema.safeParse({
      email: "student@example.com",
      password: "old",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty password", () => {
    const result = signInSchema.safeParse({
      email: "student@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("safeNextPath", () => {
  it.each(["/dashboard", "/profile/edit", "/search?q=cse&batch=45"])(
    "keeps the same-site path %s",
    (path) => {
      expect(safeNextPath(path)).toBe(path);
    },
  );

  it.each([
    ["an absolute URL", "https://evil.example/login"],
    ["a protocol-relative URL", "//evil.example"],
    ["a backslash trick", "/\\evil.example"],
    ["a tab that browsers strip", "/\t/evil.example"],
    ["a script URL", "javascript:alert(1)"],
    ["a path without a leading slash", "dashboard"],
    ["an empty string", ""],
    ["null", null],
    ["an array from a repeated parameter", ["/a", "/b"]],
  ])("falls back to the default for %s", (_label, value) => {
    expect(safeNextPath(value)).toBe(DEFAULT_SIGNED_IN_PATH);
  });
});

describe("emailOtpTypeSchema", () => {
  it("accepts the link types Supabase sends", () => {
    expect(emailOtpTypeSchema.safeParse("signup").success).toBe(true);
    expect(emailOtpTypeSchema.safeParse("email").success).toBe(true);
    expect(emailOtpTypeSchema.safeParse("recovery").success).toBe(true);
  });

  it("rejects anything else", () => {
    expect(emailOtpTypeSchema.safeParse("admin").success).toBe(false);
    expect(emailOtpTypeSchema.safeParse(null).success).toBe(false);
  });
});
