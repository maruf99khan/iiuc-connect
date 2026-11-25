import { describe, expect, it } from "vitest";

import {
  EVIDENCE_MAX_BYTES,
  checkEvidence,
  claimSchema,
  sniffEvidenceType,
} from "@/lib/verification/claim";

const student = {
  fullName: "  Rahim Uddin ",
  affiliation: "student",
  studentId: " c201001 ",
  department: "CSE",
  batch: "45",
  graduationYear: "",
  documentKind: "student_id_card",
};

const alumnus = {
  ...student,
  affiliation: "alumni",
  studentId: "C190002",
  batch: "30",
  graduationYear: "2019",
  documentKind: "certificate",
};

describe("claimSchema", () => {
  it("accepts a student claim and tidies the values", () => {
    const parsed = claimSchema.parse(student);
    expect(parsed.fullName).toBe("Rahim Uddin");
    expect(parsed.studentId).toBe("C201001");
    expect(parsed.graduationYear).toBeUndefined();
  });

  // A student's form has no graduation-year field, so the server receives
  // null (FormData.get) or nothing at all, not an empty string.
  it.each([null, undefined])(
    "accepts a student claim when the graduation year is %s",
    (graduationYear) => {
      const result = claimSchema.safeParse({ ...student, graduationYear });
      expect(result.success).toBe(true);
    },
  );

  it("accepts an alumni claim with a graduation year as a number", () => {
    expect(claimSchema.parse(alumnus).graduationYear).toBe(2019);
  });

  it("ignores a graduation year typed by a student", () => {
    const parsed = claimSchema.parse({ ...student, graduationYear: "2019" });
    expect(parsed.graduationYear).toBeUndefined();
  });

  it("requires a graduation year from alumni", () => {
    const result = claimSchema.safeParse({ ...alumnus, graduationYear: "" });
    expect(result.success).toBe(false);
  });

  it.each(["abcd", "19", "20190", "1994", "2101", "2019.5"])(
    "rejects the graduation year %s",
    (year) => {
      expect(
        claimSchema.safeParse({ ...alumnus, graduationYear: year }).success,
      ).toBe(false);
    },
  );

  it("rejects a graduation year in the future", () => {
    const next = String(new Date().getFullYear() + 1);
    expect(
      claimSchema.safeParse({ ...alumnus, graduationYear: next }).success,
    ).toBe(false);
  });

  it.each(["", "a", "x".repeat(121)])("rejects the name %j", (fullName) => {
    expect(claimSchema.safeParse({ ...student, fullName }).success).toBe(false);
  });

  it.each(["", "ab", "C20 1001", "C2010$1", "x".repeat(21), "-C201001"])(
    "rejects the student ID %j",
    (studentId) => {
      expect(claimSchema.safeParse({ ...student, studentId }).success).toBe(
        false,
      );
    },
  );

  it.each(["C201001", "C-201/001", "201001"])(
    "accepts the student ID %s",
    (studentId) => {
      expect(claimSchema.safeParse({ ...student, studentId }).success).toBe(
        true,
      );
    },
  );

  it("rejects an unknown affiliation or document kind", () => {
    expect(
      claimSchema.safeParse({ ...student, affiliation: "staff" }).success,
    ).toBe(false);
    expect(
      claimSchema.safeParse({ ...student, documentKind: "passport" }).success,
    ).toBe(false);
  });

  it("rejects missing fields without throwing", () => {
    expect(claimSchema.safeParse({}).success).toBe(false);
    expect(claimSchema.safeParse({ ...student, department: null }).success).toBe(
      false,
    );
  });
});

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
const WEBP = new Uint8Array([
  ...ascii("RIFF"),
  1,
  2,
  3,
  4,
  ...ascii("WEBP"),
  ...ascii("VP8 "),
]);
const PDF = ascii("%PDF-1.7\n");

describe("sniffEvidenceType", () => {
  it("recognises the four allowed file types by their first bytes", () => {
    expect(sniffEvidenceType(JPEG)).toBe("image/jpeg");
    expect(sniffEvidenceType(PNG)).toBe("image/png");
    expect(sniffEvidenceType(WEBP)).toBe("image/webp");
    expect(sniffEvidenceType(PDF)).toBe("application/pdf");
  });

  it.each([
    ["a Windows program", ascii("MZ\x90\x00")],
    ["an HTML page", ascii("<!doctype html><script>")],
    ["an SVG image", ascii("<svg xmlns=")],
    [
      "a RIFF file that is not WebP",
      new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE")]),
    ],
    ["an empty file", new Uint8Array()],
    ["a file too short to tell", bytes(0xff, 0xd8)],
  ])("refuses %s", (_label, data) => {
    expect(sniffEvidenceType(data)).toBeNull();
  });
});

describe("checkEvidence", () => {
  it("accepts a real image within the size limit", () => {
    const result = checkEvidence(2_000_000, JPEG);
    expect(result).toEqual({ ok: true, type: "image/jpeg", extension: "jpg" });
  });

  it("accepts a file exactly at the limit", () => {
    expect(checkEvidence(EVIDENCE_MAX_BYTES, PDF).ok).toBe(true);
  });

  it("refuses a file over the limit", () => {
    const result = checkEvidence(EVIDENCE_MAX_BYTES + 1, PDF);
    expect(result.ok).toBe(false);
  });

  it("refuses an empty upload", () => {
    expect(checkEvidence(0, new Uint8Array()).ok).toBe(false);
  });

  it("refuses a disguised file whatever its name or declared type", () => {
    const result = checkEvidence(
      1000,
      ascii("MZ\x90\x00 pretending to be a photo"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/JPG, PNG, WebP or PDF/);
    }
  });
});
