import { describe, expect, it } from "vitest";

import { CV_MAX_BYTES, checkCv, cvPath } from "./cv";

const ascii = (text: string) => new TextEncoder().encode(text);

const APPLICANT = "a8000000-0000-4000-8000-000000000003";
const APPLICATION = "a8000000-0000-4000-8000-0000000000a1";

describe("checkCv", () => {
  it("accepts a PDF under the size limit", () => {
    expect(checkCv(120_000, ascii("%PDF-1.7\n"))).toEqual({ ok: true });
  });

  it("accepts a PDF of exactly 2 MB", () => {
    expect(checkCv(CV_MAX_BYTES, ascii("%PDF-1.4"))).toEqual({ ok: true });
  });

  it("refuses a file over 2 MB", () => {
    const result = checkCv(CV_MAX_BYTES + 1, ascii("%PDF-1.7"));
    expect(result).toEqual({ ok: false, message: "The CV is larger than 2 MB." });
  });

  it("refuses an empty file", () => {
    expect(checkCv(0, new Uint8Array()).ok).toBe(false);
  });

  it.each([
    ["a JPEG", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])],
    ["a PNG", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ["a Word file", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])],
    ["plain text", ascii("My CV, 2026")],
    ["a script", ascii("<script>alert(1)</script>")],
    ["a PDF header that is not at the start", ascii(" %PDF-1.7")],
  ])("refuses %s by its content, whatever its name says", (_label, head) => {
    expect(checkCv(50_000, head)).toEqual({
      ok: false,
      message: "Upload your CV as a PDF file.",
    });
  });

  it("checks the size before the content", () => {
    const result = checkCv(CV_MAX_BYTES + 1, ascii("not a pdf"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("The CV is larger than 2 MB.");
  });
});

describe("cvPath", () => {
  it("is the applicant folder, then the application id, as a pdf", () => {
    expect(cvPath(APPLICANT, APPLICATION)).toBe(`${APPLICANT}/${APPLICATION}.pdf`);
  });

  it("matches the shape the database enforces", () => {
    expect(cvPath(APPLICANT, APPLICATION)).toMatch(
      /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/,
    );
  });

  it.each([
    ["an applicant id that is not a uuid", "../other", APPLICATION],
    ["an application id that is not a uuid", APPLICANT, "my-cv"],
    ["a path trick", APPLICANT, `${APPLICATION}/../x`],
  ])("refuses %s", (_label, applicant, application) => {
    expect(() => cvPath(applicant, application)).toThrow();
  });
});
