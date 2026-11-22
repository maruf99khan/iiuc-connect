import type { ReactNode } from "react";

/** aria wiring shared by every input: points at the hint and any error. */
export function aria(id: string, error: string | undefined, hasHint: boolean) {
  const described = [error ? `${id}-error` : null, hasHint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(" ");
  return {
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": described || undefined,
  };
}

/** A label, its control, and the hint and error text tied to it. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
