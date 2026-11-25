import { z } from "zod";

import { sniffEvidenceType } from "@/lib/verification/claim";

/** Matches the limit on the application-cvs bucket. */
export const CV_MAX_BYTES = 2 * 1024 * 1024;

export type CvCheck = { ok: true } | { ok: false; message: string };

/**
 * Size and content check for an uploaded CV. The file is judged by its first
 * bytes, not by the name or type the browser reports.
 */
export function checkCv(size: number, head: Uint8Array): CvCheck {
  if (size <= 0) return { ok: false, message: "Choose a file to upload." };
  if (size > CV_MAX_BYTES) return { ok: false, message: "The CV is larger than 2 MB." };
  if (sniffEvidenceType(head) !== "application/pdf") {
    return { ok: false, message: "Upload your CV as a PDF file." };
  }
  return { ok: true };
}

const uuid = z.uuid();

/**
 * Where a CV is stored: the applicant's folder, then the application id. The
 * database refuses any other shape (applications_cv_path_shape), so both ids
 * are checked here before they are put into a path.
 */
export function cvPath(applicantId: string, applicationId: string): string {
  return `${uuid.parse(applicantId)}/${uuid.parse(applicationId)}.pdf`;
}
