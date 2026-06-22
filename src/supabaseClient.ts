import { createClient } from "@supabase/supabase-js";

// Supabase connection info — provided via environment variables.
// Set these in .env (local) and Cloudflare (deploy). See .env.example.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example).",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
