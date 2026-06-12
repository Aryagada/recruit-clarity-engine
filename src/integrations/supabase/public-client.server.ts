// Server-side ANON Supabase client for public, unauthenticated reads
// (e.g. the public apply page reading an open role). Uses the publishable
// key and is subject to Row Level Security — it can only see what the
// `anon` role's RLS policies allow (e.g. jobs with status = 'open').
//
// Use this instead of the service-role admin client for any public read:
// the admin client bypasses RLS and requires SUPABASE_SERVICE_ROLE_KEY,
// neither of which a public read should depend on.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function createSupabasePublicClient() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    throw new Error(`Missing Supabase environment variable(s): ${missing.join(", ")}`);
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

let _supabasePublic: ReturnType<typeof createSupabasePublicClient> | undefined;

export const supabasePublic = new Proxy({} as ReturnType<typeof createSupabasePublicClient>, {
  get(_, prop, receiver) {
    if (!_supabasePublic) _supabasePublic = createSupabasePublicClient();
    return Reflect.get(_supabasePublic, prop, receiver);
  },
});
