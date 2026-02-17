// Type declaration for @supabase/supabase-js when imported via esm.sh in Deno.
// Resolves IDE/TS "Cannot find module" while the Edge Function runs correctly in Supabase.
declare module "https://esm.sh/@supabase/supabase-js@2" {
  export function createClient(
    url: string,
    key: string,
    options?: { auth?: { persistSession?: boolean } }
  ): {
    rpc: (name: string) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
    from: (table: string) => { select: (cols: string) => { limit: (n: number) => { maybeSingle: () => Promise<unknown> } } };
  };
}
