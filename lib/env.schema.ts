import { z } from "zod";

/**
 * Environment variables that are safe to expose to the browser.
 * The Supabase publishable key is public by design: Row Level Security,
 * not key secrecy, is what protects the data.
 */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ protocol: /^https$/ }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/**
 * Validates the public environment and fails loudly, naming the variables
 * that are missing or malformed. Values are never included in the message.
 */
export function parsePublicEnv(
  source: Record<string, string | undefined>,
): PublicEnv {
  const result = publicEnvSchema.safeParse(source);

  if (!result.success) {
    const names = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ].join(", ");
    throw new Error(
      `Invalid or missing environment variables: ${names}. ` +
        "Copy .env.example to .env.local and fill in the values.",
    );
  }

  return result.data;
}
