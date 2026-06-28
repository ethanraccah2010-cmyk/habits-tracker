/* ============================================================
   supabase.js — client unique (CDN ESM), source de vérité des données.
   ============================================================ */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,      // session gardée entre les ouvertures (brief §5)
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
