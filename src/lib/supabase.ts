import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !serviceKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
      'Copy .env.local.example to .env.local and fill in the keys.',
  );
}

// Server-only Supabase client. The service-role key bypasses RLS — never
// import this in a Client Component, never expose to the browser.
export const supabaseServer = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
