import { describe, expect, it } from "vitest";

import {
  MAX_SKILLS,
  SKILL_MAX_LENGTH,
  parseSkills,
  profileSchema,
} from "@/lib/profile/schema";

const base = {
  headline: " Backend engineer ",
  bio: "I build APIs.",
  jobTitle: "Engineer",
  company: "Acme",
  location: "Chattogram",
  industry: "Software",
  skills: "Python, React",
  linkedinUrl: "https://www.linkedin.com/in/rahim",
  visibility: "iiuc_community",
};

describe("parseSkills", () => {
  it("splits on commas, semicolons and new lines", () => {
    expect(parseSkills("python, react;go\nsql")).toEqual([
      "python",
      "react",
      "go",
      "sql",
    ]);
  });

  it("trims, collapses spaces and drops empty items", () => {
    expect(parseSkills("  machine   learning , , ,  ")).toEqual([
      "machine learning",
    ]);
  });

  it("removes duplicates without regard to case, keeping the first spelling", () => {
    expect(parseSkills("Python, python, PYTHON, React")).toEqual([
      "Python",
      "React",
    ]);
  });

  it.each([null, undefined, ""])("gives an empty list for %j", (input) => {
    expect(parseSkills(input)).toEqual([]);
  });
});

describe("profileSchema", () => {
  it("accepts a full profile and returns database-shaped values", () => {
    const parsed = profileSchema.parse(base);
    expect(parsed).toEqual({
      headline: "Backend engineer",
      bio: "I build APIs.",
      job_title: "Engineer",
      company: "Acme",
      location: "Chattogram",
      industry: "Software",
      skills: ["Python", "React"],
      linkedin_url: "https://www.linkedin.com/in/rahim",
      visibility: "iiuc_community",
    });
  });

  it("turns blank optional fields into null", () => {
    const parsed = profileSchema.parse({
      visibility: "private",
      headline: "  ",
      linkedinUrl: "",
    });
    expect(parsed.headline).toBeNull();
    expect(parsed.bio).toBeNull();
    expect(parsed.linkedin_url).toBeNull();
    expect(parsed.skills).toEqual([]);
  });

  it("treats fields missing from the form (null) as blank", () => {
    const parsed = profileSchema.parse({
      visibility: "public",
      headline: null,
      skills: null,
      linkedinUrl: null,
    });
    expect(parsed.headline).toBeNull();
    expect(parsed.skills).toEqual([]);
  });

  it.each([
    ["headline", "x".repeat(161)],
    ["bio", "x".repeat(2001)],
    ["jobTitle", "x".repeat(121)],
    ["company", "x".repeat(121)],
    ["location", "x".repeat(121)],
    ["industry", "x".repeat(81)],
  ])("rejects a %s that is too long", (field, value) => {
    expect(profileSchema.safeParse({ ...base, [field]: value }).success).toBe(
      false,
    );
  });

  it("rejects more skills than the database allows", () => {
    const many = Array.from({ length: MAX_SKILLS + 1 }, (_, i) => `skill${i}`);
    expect(
      profileSchema.safeParse({ ...base, skills: many.join(",") }).success,
    ).toBe(false);
  });

  it("accepts exactly the maximum number of skills", () => {
    const many = Array.from({ length: MAX_SKILLS }, (_, i) => `skill${i}`);
    expect(
      profileSchema.safeParse({ ...base, skills: many.join(",") }).success,
    ).toBe(true);
  });

  it("rejects a skill that is too long", () => {
    const long = "x".repeat(SKILL_MAX_LENGTH + 1);
    expect(
      profileSchema.safeParse({ ...base, skills: `python, ${long}` }).success,
    ).toBe(false);
  });

  it.each([
    "https://linkedin.com/in/rahim",
    "https://bd.linkedin.com/in/rahim",
    "https://www.linkedin.com/company/acme/",
  ])("accepts the LinkedIn address %s", (linkedinUrl) => {
    expect(profileSchema.safeParse({ ...base, linkedinUrl }).success).toBe(true);
  });

  it.each([
    ["not https", "http://www.linkedin.com/in/rahim"],
    ["another site", "https://example.com/in/rahim"],
    ["a look-alike host", "https://linkedin.com.evil.example/in/rahim"],
    ["a look-alike prefix", "https://notlinkedin.com/in/rahim"],
    ["a script", "javascript:alert(1)"],
    ["not a URL", "linkedin.com/in/rahim"],
    ["a user-info trick", "https://linkedin.com@evil.example/"],
    ["too long", `https://www.linkedin.com/in/${"a".repeat(300)}`],
  ])("rejects a LinkedIn address that is %s", (_label, linkedinUrl) => {
    expect(profileSchema.safeParse({ ...base, linkedinUrl }).success).toBe(
      false,
    );
  });

  it("rejects an unknown visibility", () => {
    expect(
      profileSchema.safeParse({ ...base, visibility: "everyone" }).success,
    ).toBe(false);
  });
});
