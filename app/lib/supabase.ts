import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://uaiwgcfmjwxphpjagkcz.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhaXdnY2Ztand4cGhwamFna2N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNzUzNjgsImV4cCI6MjEwMDk1MTM2OH0.GAe8rDHR4acGcAnohP6U8lWpY0RCO0kJbPFEPudP228";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
