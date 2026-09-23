# Wm. Mulherin's Sons — Event Inquiry / BEO Reports

Auto-refreshing reports pulled from **Tripleseat** (location `17784`) for the rolling **last 120 days**.
Two deliverables:

1. **Inquiry → BEO Lifecycle report** — `Mulherins_Inquiry_BEO_Lifecycle_120d.pdf`
2. **Stalled-Prospect Chase List** — `Mulherins_Chase_List.pdf`

Everything lives in the `method-kpi`/`vessel-beo` Supabase project `wcqqcfpiiovqposcvrel`.

## Data pipeline (server-side, automatic)

`pg_cron` refreshes the data every day (UTC):

| Time  | Job                    | What it does |
|-------|------------------------|--------------|
| 10:30 | `mulherins_pull`       | prune >120d rows, re-pull Mulherin's leads → `ts_lead_report` |
| 10:34 | `mulherins_enrich`     | fetch each linked event → status, timeline, owner, BEO totals |
| 10:38 | `mulherins_scan`       | events/search for DEFINITE/CLOSED/TENTATIVE, reconcile booked set |
| 10:42 | `mulherins_build_json` | rebuild `ts_report_json` rows `lifecycle` + `chase` |

Edge functions (Deno, gated by a static `secret` query param): `ts-leads-pull`, `ts-events-enrich`,
`ts-booked-scan`. They authenticate to Tripleseat via `client_credentials` (`TRIPLESEAT_CLIENT_ID/SECRET`
edge secrets). "Converted" = **booked = Definite + Closed** only.

To force a manual data refresh, run in order (via Supabase MCP), waiting ~40s between each:
```sql
select mulh_refresh_pull();   -- wait ~40s
select mulh_refresh_enrich(); -- wait ~55s
select mulh_refresh_scan();   -- wait ~45s
select mulh_build_json();
```

## Rendering the PDFs (this is what the daily delivery session does)

Prereqs in the environment: Node, `playwright-core` (global npm), Chromium at `/opt/pw-browsers/chromium-*`.

1. **Get the datasets** — via Supabase MCP `execute_sql`, one at a time:
   ```sql
   select data from ts_report_json where key = 'lifecycle';
   select data from ts_report_json where key = 'chase';
   ```
   Each result is large and will be saved by the MCP layer to a `tool-results/*.txt` file
   (the path is printed). Extract the JSON **array** (the value of the `data` column) into files
   next to the build scripts:
   - `reports/mulherins/leads2.json`  ← from the `lifecycle` result
   - `reports/mulherins/chase.json`   ← from the `chase` result

   Extraction one-liner (point `SRC` at the saved file, `KEY` unused — the array is the `data` value):
   ```bash
   python3 - "$SRC" "$OUT" <<'PY'
   import sys, json
   raw = open(sys.argv[1]).read()
   try: s = json.loads(raw)['result']
   except Exception: s = raw
   i = s.find('"data":'); start = s.find('[', i)
   depth=0; end=None; instr=False; esc=False
   for j in range(start, len(s)):
       ch=s[j]
       if instr:
           if esc: esc=False
           elif ch=='\\': esc=True
           elif ch=='"': instr=False
       else:
           if ch=='"': instr=True
           elif ch=='[': depth+=1
           elif ch==']':
               depth-=1
               if depth==0: end=j+1; break
   json.dump(json.loads(s[start:end]), open(sys.argv[2],'w'))
   print('rows', len(json.load(open(sys.argv[2]))))
   PY
   ```

2. **Build the HTML**:
   ```bash
   cd reports/mulherins
   node build-lifecycle.js   # -> mulherins-inquiry-lifecycle.html
   node build-chase.js       # -> mulherins-chase-list.html
   node build-deep.js        # -> mulherins-deep-dashboard.html (needs deep.json from ts_report_json key='deep')
   ```

3. **Render to PDF**:
   ```bash
   NODE_PATH="$(npm root -g)" node render.js mulherins-inquiry-lifecycle.html Mulherins_Inquiry_BEO_Lifecycle_120d.pdf
   NODE_PATH="$(npm root -g)" node render.js mulherins-chase-list.html Mulherins_Chase_List.pdf
   ```

4. **Deliver** both PDFs to the user (SendUserFile).

## Notes
- Response time = calendar days submission→disposition; Tripleseat stamps conversions by date, so same-day = 0.
- Booking ownership comes from the linked event (leads themselves arrive unowned).
- This tooling was added under `reports/mulherins/` purely as durable storage for the Mulherin's
  reporting job; it is unrelated to the Vessel BEO app itself.
