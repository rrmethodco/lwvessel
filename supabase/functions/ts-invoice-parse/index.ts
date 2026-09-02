import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Parses stored Tripleseat invoice HTML into line items and attributes each to an outlet.
//
// The invoice is the only place line items exist (the API has no endpoint for them). Its
// structure: black section bars (FOOD / BEVERAGE / AV & OTHER ITEMS / BILLING), then
// <tr data-cy='line_item'> rows. Coordinators mark where a block of items is served with an
// unpriced header row naming the room -- KAMPERS, Kamper's Rooftop, Kampers Rooftop Lounge,
// Conservatory, Linden Room, Green Room -- and everything beneath it inherits that outlet
// until the next header or section. Case is not consistent between coordinators, so headers
// are matched case-insensitively against a room vocabulary rather than by capitalisation.
//
// Attribution rules, in order:
//   1. a line whose own description names Kamper's / Rooftop / Bar Rotunda goes to that outlet
//   2. otherwise it inherits the most recent recognised room header in its section
//   3. otherwise Anthology
//
// Kamper's / Bar Rotunda only ever host the cocktail hour. Not every coordinator adds a room
// header when the menu moves downstairs (Melissa Harvey 8/1: "Kamper's Rooftop" header, then
// canapes, seafood tower, and straight into the plated dinner with no Conservatory header),
// so an outlet header's scope also ends at the first line that is plainly dinner service.

const SECRET = "9d0cda18e527962beb024146c5dbf3e7";
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

const strip = (h) => h.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;|’/g, "'").replace(/\s+/g, " ").trim();
const money = (s) => { const m = String(s || "").replace(/[^0-9.\-]/g, ""); return m ? parseFloat(m) : null; };

const KAMPERS = /kamper|rooftop/i;
const ROTUNDA = /rotunda/i;
// Room vocabulary a header row may name. Anchored to the start so a menu line like
// "Coffee Station in Linden Room by Bar" is not mistaken for a header.
const ROOM_HDR = /^(kamper|rooftop|bar rotunda|rotunda|conservatory|13th floor|linden|terrace|green room|ballroom|event space|entertainment suite|anthology)/i;
// Dinner-service vocabulary that closes an outlet header's scope (rule 2 caveat above).
const DINNER = /plated|dinner|entr[ée]e|buffet|dessert|late ni|salad course|main course|family.style|vendor|wedding cake|cake cutting/i;
function outletOf(text) { if (KAMPERS.test(text)) return "Kamper's"; if (ROTUNDA.test(text)) return "Bar Rotunda"; return null; }
function isHeader(qty, price, total, desc) {
  if (qty || price != null || total != null) return false;
  const t = desc.trim();
  if (!t || t.length > 40) return false;
  return ROOM_HDR.test(t);
}

// Booking-level totals block at the foot of the invoice (Subtotal / Sales Tax / Service Charge /
// Admin Fee / Room Rental / Grand Total) and the SCHEDULE OF EVENTS table, whose Areas column is
// the only place the document names every room an event uses.
function parseMeta(html) {
  const tail = strip(html.slice(Math.max(0, html.lastIndexOf("Subtotal") - 200)));
  const grab = (re) => { const m = tail.match(re); return m ? money(m[1]) : null; };
  const meta = {
    subtotal: grab(/Subtotal\s*\$?([\d,]+\.\d{2})/i),
    sales_tax: grab(/Sales Tax\s*[\d.]*%?\s*\$?([\d,]+\.\d{2})/i),
    service_charge: grab(/Service Charge\s*[\d.]*%?\s*\$?([\d,]+\.\d{2})/i),
    admin_fee: grab(/Admin(?:istrative)? Fee\s*[\d.]*%?\s*\$?([\d,]+\.\d{2})/i),
    gratuity: grab(/Gratuity\s*[\d.]*%?\s*\$?([\d,]+\.\d{2})/i),
    room_rental: grab(/Room Rental\s*\$?([\d,]+\.\d{2})/i),
    grand_total: grab(/Grand Total\s*\$?([\d,]+\.\d{2})/i),
    schedule: [],
  };
  const si = html.indexOf("SCHEDULE OF EVENTS");
  if (si >= 0) {
    const block = html.slice(si, si + 20000);
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g; let r;
    while ((r = rowRe.exec(block))) {
      const cells = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => strip(m[1]));
      if (cells.length >= 5 && /\d+\/\d+\/\d{4}/.test(cells[1] || "")) meta.schedule.push({ name: cells[0], date: cells[1], time: cells[2], areas: cells[4], type: cells[5] || null, guests: money(cells[6]) });
    }
  }
  return meta;
}

function parse(html) {
  const lines = [];
  const secRe = /color:\s*#ffffff;?"?>\s*([A-Z &]+?)\s*(?:<br\s*\/?>)?\s*<\/span>/gi;
  const marks = []; let m;
  while ((m = secRe.exec(html))) marks.push({ name: m[1].trim(), at: m.index });
  for (let s = 0; s < marks.length; s++) {
    const section = marks[s].name;
    const body = html.slice(marks[s].at, s + 1 < marks.length ? marks[s + 1].at : html.length);
    let header = null, headerOutlet = "Anthology";
    const rowRe = /<tr data-cy='line_item'>([\s\S]*?)<\/tr>/g; let r;
    while ((r = rowRe.exec(body))) {
      const row = r[1];
      const qty = money((row.match(/data-cy='line_item_qty'[^>]*>([\s\S]*?)<\/td>/) || [])[1]);
      const descHtml = (row.match(/<div class='description'[^>]*>([\s\S]*?)<\/div>\s*<\/td>/) || [])[1] || "";
      const desc = strip(descHtml);
      const price = money((row.match(/data-cy='line_item_price'[^>]*>([\s\S]*?)<\/td>/) || [])[1]);
      const total = money((row.match(/data-cy='line_item_total'[^>]*>([\s\S]*?)<\/td>/) || [])[1]);
      if (isHeader(qty, price, total, desc)) { header = desc; headerOutlet = outletOf(desc) || "Anthology"; continue; }
      const own = outletOf(desc);
      if (!own && headerOutlet !== "Anthology" && DINNER.test(desc)) { header = null; headerOutlet = "Anthology"; }
      lines.push({ section, outlet_header: header, qty, description: desc.slice(0, 200), price, total, outlet: own || headerOutlet });
    }
  }
  return lines;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== SECRET) return json({ error: "forbidden" }, 403);
  const supa = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const idsParam = String(url.searchParams.get("ids") || "").split(",").map(s => s.trim()).filter(Boolean);
  let q = supa.from("ts_invoice_html").select("event_id, html");
  if (idsParam.length) q = q.in("event_id", idsParam.map(Number));
  const { data, error } = await q;
  if (error) return json({ error: error.message }, 500);
  const out = [];
  for (const row of data || []) {
    const lines = parse(row.html);
    const meta = parseMeta(row.html);
    await supa.from("ts_invoice_meta").upsert({ event_id: row.event_id, ...meta, parsed_at: new Date().toISOString() });
    await supa.from("ts_invoice_lines").delete().eq("event_id", row.event_id);
    const rows = lines.map((l, i) => ({ event_id: row.event_id, line_no: i + 1, ...l }));
    if (rows.length) { const { error: e2 } = await supa.from("ts_invoice_lines").insert(rows); if (e2) { out.push({ event_id: row.event_id, error: e2.message }); continue; } }
    const by = {}; for (const l of lines) if (l.total != null) by[l.outlet] = (by[l.outlet] || 0) + l.total;
    out.push({ event_id: row.event_id, lines: lines.length, byOutlet: by, headers: [...new Set(lines.map(l => l.outlet_header).filter(Boolean))], subtotal: meta.subtotal, svc: meta.service_charge, adm: meta.admin_fee, areas: meta.schedule.map(x => x.areas) });
  }
  return json({ parsed: out.length, events: out });
});
