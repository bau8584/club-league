import { createClient } from "@supabase/supabase-js";

// Supabase Connection Information (Temporarily hardcoded, will be moved to environment variables later)
const supabaseUrl = "https://octifhpwfmcyfvpufxjg.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jdGlmaHB3Zm1jeWZ2cHVmeGpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MzcxNjAsImV4cCI6MjA5NjUxMzE2MH0._B91CI4B8pyppG5151TN4p3ulRavetLotReDopq29T8";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
