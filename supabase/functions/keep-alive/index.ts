// keep-alive Edge Function
// Minimal safe ping that uses the SERVICE_ROLE key to perform a tiny DB request.
// This function expects SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set
// in the environment by the Supabase platform at runtime.
/// <reference path="./supabase-js.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Deno global is available in Supabase Edge Functions runtime
declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { get(key: string): string | undefined };
};

Deno.serve(async (req: Request) => {
  try {
    // Optional: require a secret header for extra protection
    // const SECRET_HEADER_NAME = "x-keep-alive-key";
    // const EXPECTED_SECRET = Deno.env.get("KEEP_ALIVE_SECRET");
    // if (EXPECTED_SECRET && req.headers.get(SECRET_HEADER_NAME) !== EXPECTED_SECRET) {
    //   return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" }});
    // }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Minimal DB interaction to generate activity.
    // We use a harmless, fast query: a simple pg function call (if available) or a small read on a system view.
    // Use whichever method is allowed in your DB. Below we try a light query against pg_stat_activity.
    const { data, error } = await supabase.rpc("version").maybeSingle().catch(() => ({ data: null, error: null }));

    // Fallback: simple select from pg_stat_activity (read-only, fast)
    let fallbackOk = false;
    if (!data) {
      // Note: selecting from pg_catalog or pg_stat_activity requires appropriate perms in some setups.
      const fallback = await supabase.from("pg_stat_activity").select("pid").limit(1).maybeSingle().catch(() => null);
      fallbackOk = !!(fallback && (fallback as any).data);
    }

    const now = new Date().toISOString();
    return new Response(
      JSON.stringify({
        ok: true,
        timestamp: now,
        method: req.method,
        db_ping: !!data || fallbackOk,
      }),
      { headers: { "Content-Type": "application/json", "Connection": "keep-alive" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});