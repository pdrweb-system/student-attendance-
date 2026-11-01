// Public values only (Project URL + publishable/anon key). Never put secrets here.
// ADMIN_EMAIL is the single admin account (an email is not a secret; the password is).
// LIFF_ID (optional) is a LINE LIFF app ID; with it the teacher page can close itself inside LINE.
// The Pages workflow overwrites this file from the repo variables
// SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL and LIFF_ID when they are set.
export const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR-PUBLISHABLE-ANON-KEY";
export const ADMIN_EMAIL = "admin@example.com";
export const LIFF_ID = "";
