import { z } from "zod";

/** Largest evidence file accepted. Matches the storage bucket's own limit. */
export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;

const FIRST_YEAR = 1995; // same bound as the database constraint

export const DOCUMENT_KINDS = [
  "student_id_card",
  "certificate",
  "transcript",
  "other",
] as const;

export const DOCUMENT_KIND_LABELS: Record<
  (typeof DOCUMENT_KINDS)[number],
  string
> = {
  student_id_card: "Student ID card",
  certificate: "Certificate",
  transcript: "Transcript",
  other: "Other document",
};

const text = (label: string, min: number, max: number) =>
  z
    .string({ error: `Enter ${label}.` })
    .trim()
    .min(min, { error: `Enter ${label}.` })
    .max(max, { error: `Use ${max} characters or fewer.` });

/**
 * What a member submits with their claim. Graduation year is required for
 * alumni and dropped for students, so the database never stores a stray one.
 */
export const claimSchema = z
  .object({
    fullName: text("your full name", 2, 120),
    affiliation: z.enum(["student", "alumni"], {
      error: "Choose student or graduate.",
    }),
    studentId: z
      .string({ error: "Enter your student ID." })
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9/-]{1,18}[A-Z0-9]$/, {
        error: "Use 3 to 20 letters, numbers, / or -.",
      }),
    department: text("your department", 2, 80),
    batch: text("your batch", 1, 20),
    // Absent for students: FormData.get gives null for a field not on the form.
    graduationYear: z.string().trim().nullish(),
    documentKind: z.enum(DOCUMENT_KINDS, {
      error: "Choose what the document is.",
    }),
  })
  .superRefine((claim, ctx) => {
    if (claim.affiliation !== "alumni") return;

    const year = claim.graduationYear ?? "";
    const thisYear = new Date().getFullYear();
    if (
      !/^\d{4}$/.test(year) ||
      Number(year) < FIRST_YEAR ||
      Number(year) > thisYear
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["graduationYear"],
        message: `Enter the year you graduated, from ${FIRST_YEAR} to ${thisYear}.`,
      });
    }
  })
  .transform((claim) => ({
    ...claim,
    graduationYear:
      claim.affiliation === "alumni" ? Number(claim.graduationYear) : undefined,
  }));

export type Claim = z.output<typeof claimSchema>;

export type EvidenceType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "application/pdf";

const EXTENSIONS: Record<EvidenceType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const startsWith = (data: Uint8Array, signature: readonly number[], at = 0) =>
  data.length >= at + signature.length &&
  signature.every((byte, i) => data[at + i] === byte);

/**
 * Identifies a file by its first bytes. A browser-supplied file name or MIME
 * type is only a claim, so this is what decides whether a file is accepted.
 */
export function sniffEvidenceType(data: Uint8Array): EvidenceType | null {
  if (startsWith(data, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  // "RIFF" ... "WEBP"
  if (
    startsWith(data, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(data, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  if (startsWith(data, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  return null;
}

export type EvidenceCheck =
  | { ok: true; type: EvidenceType; extension: string }
  | { ok: false; message: string };

/** Size and content check for an uploaded evidence file. */
export function checkEvidence(size: number, head: Uint8Array): EvidenceCheck {
  if (size <= 0) {
    return { ok: false, message: "Choose a file to upload." };
  }
  if (size > EVIDENCE_MAX_BYTES) {
    return { ok: false, message: "The file is larger than 5 MB." };
  }

  const type = sniffEvidenceType(head);
  if (!type) {
    return { ok: false, message: "Upload a JPG, PNG, WebP or PDF file." };
  }

  return { ok: true, type, extension: EXTENSIONS[type] };
}
