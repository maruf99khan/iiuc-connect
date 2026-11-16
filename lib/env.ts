import { parsePublicEnv } from "@/lib/env.schema";

// Each variable is referenced literally so Next.js can inline it into the
// browser bundle. Do not replace this with a dynamic lookup.
export const publicEnv = parsePublicEnv({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});
