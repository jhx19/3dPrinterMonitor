import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function requirePublicEnvVar(value: string | undefined, key: string) {
  if (!value) {
    throw new Error(`Missing ${key}`);
  }
  return value;
}

let browserClient: SupabaseClient<Database> | null = null;

export function hasSupabaseEnv() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function createClient() {
  if (browserClient) {
    return browserClient;
  }

  browserClient = createBrowserClient<Database>(
    requirePublicEnvVar(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL"),
    requirePublicEnvVar(supabaseAnonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
  return browserClient;
}
