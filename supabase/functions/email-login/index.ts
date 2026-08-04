import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Public app key (safe to embed) — gates calls to this function to the app.
const PUBLISHABLE = "sb_publishable_5JB6emMB86VDQWU9w9-0nA_sm4OuR4w";
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// ============================================================================
//  EMAIL-ONLY LOGIN (no verification) — for eligible accounts only.
//
//  Eligible = external read-only members OR @methodco.com staff. For those,
//  entering an approved email signs them straight in: this endpoint mints a
//  real Supabase session (no email/link/code sent), so the app's row-level
//  security (venue scoping + read-only external, keyed off the JWT email
//  claim) keeps working unchanged. Every other approved account is bounced
//  back with needsMagicLink so the client verifies them via a magic link.
//
//  SECURITY MODEL (accepted tradeoff): for eligible accounts the only barrier
//  is allowlist membership — anyone who knows an eligible address, plus the
//  public app key that ships in the client, can obtain that user's session.
//  There is no proof of inbox ownership for that group. That is the requested
//  behaviour; non-eligible accounts fall back to verified magic-link sign-in.
// ============================================================================
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // App gate: caller must present the app's publishable key.
  const key = req.headers.get("apikey") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (key !== PUBLISHABLE) return json({ ok: false, error: "unauthorized" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { /* no/invalid body */ }
  const email = String(body?.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: "Enter a valid email address." }, 200);

  const supaUrl = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || PUBLISHABLE;
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supaUrl || !svcKey) return json({ ok: false, error: "server auth not configured" }, 500);

  const svc = createClient(supaUrl, svcKey, { auth: { persistSession: false } });

  // 1) Approved? Only allowlisted emails may sign in.
  const { data: row, error: rowErr } = await svc.from("app_users").select("email, role").eq("email", email).maybeSingle();
  if (rowErr) return json({ ok: false, error: "Could not check the access list — please try again." }, 200);
  if (!row) return json({ ok: false, error: "This email isn't on the access list yet. Ask an admin to add you." }, 200);

  // Email-only sign-in (no verification) is limited to external read-only
  // members and @methodco.com staff. Every other approved account must verify
  // via a magic link — the client falls back to that when we say so here.
  const emailOnlyOk = row.role === "external" || /@methodco\.com$/i.test(email);
  if (!emailOnlyOk) return json({ ok: false, needsMagicLink: true, error: "magic link required" }, 200);

  // 2) Ensure the auth user exists — first-time external members won't yet, and
  //    generateLink(magiclink) needs an existing user. createUser fires the
  //    approved-domain guard, which now allows allowlisted emails.
  const { error: cErr } = await svc.auth.admin.createUser({ email, email_confirm: true });
  if (cErr && !/already|registered|exists/i.test(cErr.message || "")) {
    return json({ ok: false, error: "Could not provision the account — " + cErr.message }, 200);
  }

  // 3) Generate a login token. generateLink does NOT send an email — it just
  //    returns the token material we exchange for a session below.
  const { data: gen, error: genErr } = await svc.auth.admin.generateLink({ type: "magiclink", email });
  if (genErr || !gen) return json({ ok: false, error: "Could not start a session — " + (genErr?.message || "unknown error") }, 200);
  const props: any = (gen as any).properties || {};

  // 4) Exchange the token for a real session, entirely server-side.
  const pub = createClient(supaUrl, anon, { auth: { persistSession: false } });
  let session: any = null, lastErr: string | null = null;
  if (props.hashed_token) {
    const { data, error } = await pub.auth.verifyOtp({ token_hash: props.hashed_token, type: "magiclink" });
    if (!error && data?.session) session = data.session; else lastErr = error?.message || null;
  }
  if (!session && props.email_otp) {
    const { data, error } = await pub.auth.verifyOtp({ email, token: props.email_otp, type: "email" });
    if (!error && data?.session) session = data.session; else lastErr = error?.message || lastErr;
  }
  if (!session) return json({ ok: false, error: "Could not start a session — " + (lastErr || "token exchange failed") }, 200);

  return json({
    ok: true,
    email,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
  }, 200);
});
