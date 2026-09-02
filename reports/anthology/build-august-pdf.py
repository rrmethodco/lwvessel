#!/usr/bin/env python3
"""Builds the August 2026 Anthology / Kamper's revenue-split report (HTML -> PDF via ../mulherins/render.js).
Reads split-results.json produced by reconcile-august.py."""
import json, collections, datetime, html
R=json.load(open('split-results.json'))
A='Anthology'; K="Kamper's"; RO='Bar Rotunda'
def f0(v): return f"{v:,.0f}"
def fd(v): return f"{v:+,.0f}"
def pc(v): return f"{v:.1f}%"
esc=html.escape

# ---- aggregates
AL=collections.defaultdict(collections.Counter); CAT=collections.Counter(); TOT=collections.Counter()
for x in R:
    for o,a in x['alloc'].items():
        for k,v in a.items(): AL[o][k]+=v
    for k,v in x['cat'].items(): CAT[k]+=v
    for k in ('actual','svc','adm','tax','grat','net','grand'): TOT[k]+=x[k]
cat=lambda o,c: CAT.get(f'{o}|{c}',0)

# ---- Toast, August 2026 (Sales Summary exports)
TA={'food':183147.00,'bev':2833.00+50206.24+6332.80+99.00+43616.86,'fees':23850.00+11380.00+4229.00+4130.00+1506.00+1225.00+500.00,
    'svc':59038.12,'adm':14807.01,'net':406900.03,'tax':16724.11,'ar_amount':431686.00,'ar_count':35,'voids':36749.20}
TK={'ar_amount':103923.37,'ar_tax':5135.12,'ar_grat':17119.83,'ar_count':11,'admin':4181.16,'admin_n':10,'rental':9000.00,'rental_n':9,'net_month':316846.18}
TK['ar_base']=TK['ar_amount']-TK['ar_tax']; TK['ar_net']=TK['ar_base']+TK['ar_grat']
TOAST_DAY={1:34612.52,5:10612.5,6:525,7:24260.75,8:41410.1,10:1225,11:5322,12:9839.02,13:4625,14:69694.4,15:36315,18:1575,19:1050,20:525,21:26634.75,22:37988.55,25:30980,26:4475,27:4600,28:28002.28,29:32627.66}

def table(head, rows, cls=''):
    h='<table class="%s"><thead><tr>'%cls+''.join(f'<th>{c}</th>' for c in head)+'</tr></thead><tbody>'
    for r in rows:
        tr_cls=' class="tot"' if r[0] is True else ''
        cells=r[1:] if r[0] in (True,False) else r
        h+=f'<tr{tr_cls}>'
        for c in cells:
            if isinstance(c,tuple): h+=f'<td class="{c[1]}">{c[0]}</td>'
            else: h+=f'<td>{c}</td>'
        h+='</tr>'
    return h+'</tbody></table>'
def dcls(v,tol): return 'pos' if abs(v)<=tol else ('neg' if abs(v)>tol*4 else '')

# ---- page 1: build by outlet
anth=AL[A]; kam=AL[K]; rot=AL[RO]
b1=[]
def row(label,a,k,r,strong=False):
    return [True if strong else False, label, f0(a), f0(k), f0(r), f0(a+k+r)]
b1.append(row('Food',cat(A,'FOOD'),cat(K,'FOOD'),0))
b1.append(row('Beverage',cat(A,'BEVERAGE'),cat(K,'BEVERAGE'),0))
b1.append(row("Rental &amp; fees (Terrace Club, photography, Kamper's cocktail-hour fee)",cat(A,'RENTAL'),cat(K,'RENTAL'),0))
b1.append(row('Standalone Kamper\'s / Rotunda events (not itemised)',0,cat(K,'UNITEMISED'),cat(RO,'UNITEMISED')))
b1.append(row('Base revenue (Event Actual)',anth['base'],kam['base'],rot['base'],True))
b1.append(row('Service charge',anth['svc'],kam['svc'],rot['svc']))
b1.append(row('Admin fee',anth['adm'],kam['adm'],rot['adm']))
b1.append(row('Net revenue (grand total less tax and gratuity)',anth['net'],kam['net'],rot['net'],True))
b1.append(row('Sales tax',anth['tax'],kam['tax'],rot['tax']))
b1.append(row('Gratuity',anth['grat'],kam['grat'],rot['grat']))
b1.append(row('Grand total',anth['grand'],kam['grand'],rot['grand'],True))
shared=[x for x in R if x['kind']=='anthology' and x['netsplit'].get(K,0)>0]
sh_net=sum(x['net'] for x in shared); sh_k=sum(x['netsplit'][K] for x in shared)

# ---- page 2: Toast comparisons
ta_rows=[
 [False,'Food',f0(cat(A,'FOOD')),f0(TA['food']),(fd(cat(A,'FOOD')-TA['food']),dcls(cat(A,'FOOD')-TA['food'],4000))],
 [False,'Beverage (bar packages, cocktails, wine)',f0(cat(A,'BEVERAGE')),f0(TA['bev']),('',''),],
 [False,'Rental &amp; fees',f0(cat(A,'RENTAL')),f0(TA['fees']),('','')],
 [True,'Beverage + rental &amp; fees',f0(cat(A,'BEVERAGE')+cat(A,'RENTAL')),f0(TA['bev']+TA['fees']),(fd(cat(A,'BEVERAGE')+cat(A,'RENTAL')-TA['bev']-TA['fees']),dcls(cat(A,'BEVERAGE')+cat(A,'RENTAL')-TA['bev']-TA['fees'],4000))],
 [True,'Base revenue',f0(anth['base']),f0(TA['net']-TA['svc']-TA['adm']),(fd(anth['base']-(TA['net']-TA['svc']-TA['adm'])),dcls(anth['base']-(TA['net']-TA['svc']-TA['adm']),4000))],
 [False,'Service charge',f0(anth['svc']),f0(TA['svc']),(fd(anth['svc']-TA['svc']),dcls(anth['svc']-TA['svc'],1000))],
 [False,'Admin fee',f0(anth['adm']),f0(TA['adm']),(fd(anth['adm']-TA['adm']),dcls(anth['adm']-TA['adm'],500))],
 [True,'Net revenue',f0(anth['net']),f0(TA['net']),(fd(anth['net']-TA['net']),dcls(anth['net']-TA['net'],4000))],
 [False,'Sales tax',f0(anth['tax']),f0(TA['tax']),(fd(anth['tax']-TA['tax']),dcls(anth['tax']-TA['tax'],500))],
]
tk_rows=[
 [False,"Canapés &amp; stationed food at Kamper's (shared weddings)",f0(cat(K,'FOOD')),'',('','')],
 [False,'Cocktail-hour share of the bar package',f0(cat(K,'BEVERAGE')),'',('','')],
 [False,"Kamper's cocktail-hour fee ($1,000 / hour)",f0(cat(K,'RENTAL')),f0(TK['rental'])+f' <span class="n">({TK["rental_n"]} checks)</span>',('','')],
 [False,'Standalone Kamper\'s events (thyssenkrupp, Bernier cocktail hour, Fritz)',f0(cat(K,'UNITEMISED')),'',('','')],
 [True,'Base revenue',f0(kam['base']),f0(TK['ar_base'])+' <span class="n">(A/R amount less tax)</span>',(fd(kam['base']-TK['ar_base']),dcls(kam['base']-TK['ar_base'],3000))],
 [False,'Service charge + gratuity',f0(kam['svc']+kam['grat']),f0(TK['ar_grat'])+' <span class="n">(A/R "Grat")</span>',(fd(kam['svc']+kam['grat']-TK['ar_grat']),dcls(kam['svc']+kam['grat']-TK['ar_grat'],500))],
 [False,'Admin fee',f0(kam['adm']),f0(TK['admin'])+f' <span class="n">({TK["admin_n"]} checks)</span>',(fd(kam['adm']-TK['admin']),dcls(kam['adm']-TK['admin'],300))],
 [True,'Net revenue',f0(kam['net']),f0(TK['ar_net']),(fd(kam['net']-TK['ar_net']),dcls(kam['net']-TK['ar_net'],3000))],
 [False,'Sales tax',f0(kam['tax']),f0(TK['ar_tax']),(fd(kam['tax']-TK['ar_tax']),dcls(kam['tax']-TK['ar_tax'],300))],
]

# ---- page 3: per-event
ev_rows=[]
for x in sorted(R,key=lambda x:(x['date'],x['name'])):
    if x['net']<=0: continue
    a=x['netsplit'].get(A,0); k=x['netsplit'].get(K,0); r=x['netsplit'].get(RO,0)
    kp=100*(k+r)/x['net']
    ev_rows.append([False, datetime.date.fromisoformat(x['date']).strftime('%-m/%d'), esc(x['name'][:46]), f0(x['guests']) if x['guests'] else ('—','mute'),
        f0(x['actual']), f0(x['svc']+x['adm']), f0(x['net']), f0(a), (f0(k) if k else '—','mute' if not k else ''), (f0(r) if r else '—','mute' if not r else ''), (pc(kp) if k+r else '—','mute' if not k+r else '')])
ev_rows.append([True,'','Total','',f0(TOT['actual']),f0(TOT['svc']+TOT['adm']),f0(TOT['net']),f0(anth['net']),f0(kam['net']),f0(rot['net']),pc(100*(kam['net']+rot['net'])/TOT['net'])])

# ---- page 4: shared weddings + by day
sw_rows=[]
for x in sorted(shared,key=lambda x:x['date']):
    k=x['netsplit'][K]; conv=.2*x['net']
    sw_rows.append([False,datetime.date.fromisoformat(x['date']).strftime('%-m/%d'),esc(x['name'][:44]),f0(x['net']),f0(k),pc(100*k/x['net']),f0(conv),(fd(k-conv),'pos' if k>conv else 'neg')])
sw_rows.append([True,'','Total',f0(sh_net),f0(sh_k),pc(100*sh_k/sh_net),f0(.2*sh_net),(fd(sh_k-.2*sh_net),'pos')])
byday=collections.defaultdict(float); names=collections.defaultdict(list)
for x in R:
    a=x['netsplit'].get(A,0)
    if a: d=datetime.date.fromisoformat(x['date']).day; byday[d]+=a; names[d].append(x['name'].split(' & ')[0].split(':')[-1].strip()[:20])
day_rows=[]; tie=0
for d in sorted(set(byday)|set(TOAST_DAY)):
    ts=byday.get(d,0); to=TOAST_DAY.get(d,0); dl=ts-to
    if ts and abs(dl)<=600: tie+=1
    day_rows.append([False,f'8/{d:02d}',esc(', '.join(names.get(d,[]))[:52]),f0(ts),f0(to),(fd(dl),'pos' if abs(dl)<=600 else ('neg' if abs(dl)>2000 else ''))])
day_rows.append([True,'','Total',f0(sum(byday.values())),f0(sum(TOAST_DAY.values())),(fd(sum(byday.values())-sum(TOAST_DAY.values())),'')])

CSS=open('corporate-social-2026.html').read().split('<style>')[1].split('</style>')[0]
FOOT=lambda n: f'<div class="foot"><span>Anthology Events at Book Tower · August 2026 outlet split</span><span>Sources: Tripleseat invoice documents &amp; export · Toast Sales Summary (Anthology Events, Kamper\'s)</span><span>{n} / 6</span></div>'
H=f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Anthology &amp; Kamper's — August 2026</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>{CSS}
table.sm{{font-size:10.2px}} table.sm th,table.sm td{{padding:4px 6px}} table.xs{{font-size:9.4px}} table.xs th,table.xs td{{padding:2.5px 5px}} td .n{{font-family:var(--ui);font-size:9px;color:var(--text-3)}}
.note{{font-size:11px;line-height:1.5;color:var(--text-2);margin:0 0 9px;max-width:72ch}} .note strong{{color:var(--text)}}
</style></head><body>

<div class="page">
<p class="eyebrow">Anthology Events at Book Tower · Revenue split · August 2026</p>
<h1>August revenue, <em>by outlet</em></h1>
<p class="lede">Every August event's invoice line items were pulled from Tripleseat and attributed to the outlet that served them. Anthology keeps the ballroom; Kamper's keeps the cocktail hour it hosted; standalone rooftop and Bar Rotunda events stay with their outlet. Service charge and admin fee are shown separately so revenue can be read with or without them.</p>
<div class="cards">
<div class="card"><div class="label">Anthology · net</div><div class="value">${f0(anth['net'])}</div><div class="sub">Toast Anthology Events net ${f0(TA['net'])} · {fd(anth['net']-TA['net'])} ({100*(anth['net']-TA['net'])/TA['net']:+.1f}%)</div></div>
<div class="card"><div class="label">Anthology · base (no svc / admin)</div><div class="value">${f0(anth['base'])}</div><div class="sub">Service charge ${f0(anth['svc'])} + admin fee ${f0(anth['adm'])} on top</div></div>
<div class="card"><div class="label">Kamper's · event net</div><div class="value">${f0(kam['net'])}</div><div class="sub">Toast Kamper's A/R TripleSeat ${f0(TK['ar_net'])} · {fd(kam['net']-TK['ar_net'])} ({100*(kam['net']-TK['ar_net'])/TK['ar_net']:+.1f}%)</div></div>
<div class="card"><div class="label">Kamper's share · shared weddings</div><div class="value">{pc(100*sh_k/sh_net)}</div><div class="sub">vs the 20% convention · {len(shared)} weddings, ${f0(sh_net)} net</div></div>
</div>
<h2>Revenue build by outlet</h2>
{table(['','Anthology',"Kamper's",'Bar Rotunda','Book Tower events'],b1)}
<p class="note"><strong>Net</strong> is the Tripleseat grand total less sales tax and gratuity, the basis used throughout the 2026 booked-business work. <strong>Base</strong> is net less service charge and admin fee and equals Tripleseat's Event Actual. Each outlet's service charge, admin fee, tax and gratuity are its share of the event's own charges, in proportion to base. Le Suprême and HIROKI-SAN private dining rows in the export are their own book and are excluded; the 80/20 convention would have reported Anthology at roughly ${f0(0.8*sh_net+anth['net']-(sh_net-sh_k))}.</p>
{FOOT(1)}
</div>

<div class="page">
<p class="eyebrow">Tie-out to Toast</p>
<h2>Anthology Events POS <em>vs Tripleseat, by category</em></h2>
{table(['','Tripleseat (after split)','Toast Anthology Events','Δ'],ta_rows)}
<p class="note">Toast keys bar packages across Liquor / Wine / Beer and rings ceremony, deposit and valet lines as Misc. Guest Fees, so beverage and fees only reconcile as a pair. Toast's Non-Grat Svc Charges line (${f0(TA['svc']+TA['adm'])}) is service charge plus admin fee. Anthology's ${f0(TA['ar_amount'])} across {TA['ar_count']} A/R TripleSeat payments is the tax-inclusive figure.</p>
<h2 style="margin-top:14px">Kamper's POS <em>vs Tripleseat</em></h2>
{table(['','Tripleseat (after split)',"Toast Kamper's",'Δ'],tk_rows)}
<p class="note">Kamper's Toast reports {TK['ar_count']} A/R TripleSeat payments: amount ${f0(TK['ar_amount'])} (which carries sales tax ${f0(TK['ar_tax'])}) plus ${f0(TK['ar_grat'])} in the Grat column. The admin fee (${f0(TK['admin'])}, {TK['admin_n']} checks), room-rental fee (${f0(TK['rental'])}, {TK['rental_n']} checks) and tax each land within $30 of the Tripleseat-derived figures, which confirms the Grat column is the event service charge and that Kamper's rings the cocktail hour of the bar package. Standalone events and the two extra rental checks are not itemised because those BEOs were not fetched for line items. Bar Rotunda (${f0(rot['net'])} net, UofM Alumni Reception) has no POS report to compare.</p>
{FOOT(2)}
</div>

<div class="page">
<p class="eyebrow">Event detail</p>
<h2>Every August event, <em>net by outlet</em></h2>
{table(['Date','Event','Guests','Base','Svc + admin','Net','Anthology',"Kamper's",'Rotunda',"Outlet %"],ev_rows,'xs')}
<p class="note">Zero-revenue rows (FOC shoots, rehearsal, rooftop yoga) omitted. Kamper's figures on shared weddings include the cocktail-hour share of the bar package; the parser output without that layer is in reports/anthology/august-2026-outlet-split.txt.</p>
{FOOT(3)}
</div>

<div class="page">
<p class="eyebrow">Shared weddings</p>
<h2>Kamper's actual share <em>vs the 80/20 convention</em></h2>
{table(['Date','Wedding','Net',"Kamper's net","Kamper's %",'20% would give','Δ'],sw_rows)}
<p class="note">Kamper's carries the canapés, its $1,000/hour fee and the cocktail-hour share of the bar package. That runs 23–33% on every August wedding, not 20%: the convention understates Kamper's by ${f0(sh_k-.2*sh_net)} for the month and overstates Anthology by the same.</p>
{FOOT(4)}
</div>

<div class="page">
<p class="eyebrow">Daily tie-out</p>
<h2>Anthology by day <em>vs Toast</em></h2>
{table(['Day','Events','Tripleseat net','Toast net','Δ'],day_rows,'sm')}
<p class="note">{tie} of {len([d for d in byday if byday[d]])} event days tie within $600. Remaining differences are photography sessions and Terrace Club rentals that were not rung on their event date (8/03, 8/17, 8/30) or rang a day early (8/10, 8/18).</p>
{FOOT(5)}
</div>

<div class="page">
<p class="eyebrow">Method &amp; exceptions</p>
<h2>How the split was built</h2>
<div class="panel">
<div class="rec"><div class="num">1</div><div><p><strong>Line items come from the invoice document.</strong> Tripleseat's API has no line-item endpoint. Each event's portal Invoice was fetched and parsed into food, beverage and fee lines with quantity, price and total.</p></div></div>
<div class="rec"><div class="num">2</div><div><p><strong>Outlet follows the BEO's room headers.</strong> Coordinators mark where a block is served with an unpriced header row (KAMPERS, Kamper's Rooftop, Kampers Rooftop Lounge, Conservatory, Linden Room). Lines inherit the last header in their section; a line that names Kamper's, Rooftop or Bar Rotunda goes to that outlet regardless. A Kamper's header's scope closes at the first dinner-service line, because not every BEO adds the downstairs header (Melissa Harvey 8/01).</p></div></div>
<div class="rec"><div class="num">3</div><div><p><strong>The cocktail hour of the bar package is Kamper's.</strong> With headers alone every shared wedding's Anthology figure sat $2,200–2,900 above Toast. Moving one hour of the five-hour package (1.5 for Megan Hannigan) to Kamper's brings six of seven within $800 of Toast, and Kamper's admin, rental and tax lines then land within $30.</p></div></div>
<div class="rec"><div class="num">4</div><div><p><strong>Standalone rooftop and Rotunda events are 100% that outlet</strong> and never touch the Anthology figures: thyssenkrupp (8/20), the Bernier cocktail hour (8/21, its own event), Fritz baby shower (8/23) and UofM Alumni at Bar Rotunda (8/12).</p></div></div>
</div>
<h2>Exceptions worth knowing</h2>
<div class="panel flag">
<div class="rec"><div class="num">!</div><div><p><strong>Megan Hannigan 8/22 — BEO has no Kamper's header at all.</strong> Toast Anthology is $10,710 under Tripleseat that day, which is exactly the canapés (5:00–6:30 PM, the Kamper's reception window) and seafood tower. They were served and rung at Kamper's; this report moves them there. Her Kamper's share is 33% once corrected.</p><div class="why">Fix at source: add the Kamper's room header on the BEO</div></div></div>
<div class="rec"><div class="num">!</div><div><p><strong>Kamper's net is ${f0(TK['ar_net']-kam['net'])} under Toast.</strong> The gap sits in the three standalone events, whose BEOs were not fetched for line items, so their base is Tripleseat's Event Actual rather than a parsed invoice. Fetching those three would close it.</p></div></div>
<div class="rec"><div class="num">·</div><div><p><strong>Lambda Legal (six days) and the 70th Birthday Dinner</strong> carry a $500–1,500 room-rental line the invoice does not itemise; it stays with Anthology either way. Photography sessions and Terrace Club rentals have no invoice lines and are 100% Anthology.</p></div></div>
</div>
{FOOT(6)}
</div>
</body></html>'''
open('august-2026-outlet-split.html','w').write(H); print('html written')
