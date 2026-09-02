#!/usr/bin/env python3
"""One-page version of the August 2026 Anthology / Kamper's revenue split."""
import json, collections
R=json.load(open('split-results.json'))
A='Anthology'; K="Kamper's"; RO='Bar Rotunda'
f0=lambda v: f"{v:,.0f}"
AL=collections.defaultdict(collections.Counter); CAT=collections.Counter()
for x in R:
    for o,a in x['alloc'].items():
        for k,v in a.items(): AL[o][k]+=v
    for k,v in x['cat'].items(): CAT[k]+=v
cat=lambda o,c: CAT.get(f'{o}|{c}',0)
an=AL[A]; km=AL[K]; ro=AL[RO]
TA={'food':183147.00,'bev':103088.90,'fees':46820.00,'svc':59038.12,'adm':14807.01,'net':406900.03,'tax':16724.11}
TA['base']=TA['net']-TA['svc']-TA['adm']
TK={'base':98788.25,'svcgrat':17119.83,'adm':4181.16,'net':115908.08,'tax':5135.12,'rental':9000.00}
shared=[x for x in R if x['kind']=='anthology' and x['netsplit'].get(K,0)>0]
sh_net=sum(x['net'] for x in shared); sh_k=sum(x['netsplit'][K] for x in shared)

def td(v,cls=''): return f'<td class="{cls}">{v}</td>'
def row(label,a,ta,k,tk,r,strong=False,mute_toast=False):
    tot=a+k+r
    return (f'<tr{" class=tot" if strong else ""}><td>{label}</td>{td(f0(a))}{td(ta if ta!="" else "—","tst mute" if ta=="" else "tst")}'
            f'{td(f0(k) if k else "—","" if k else "mute")}{td(tk if tk!="" else "—","tst mute" if tk=="" else "tst")}{td(f0(r) if r else "—","" if r else "mute")}{td(f0(tot))}</tr>')
rows=[
 row('Food',cat(A,'FOOD'),f0(TA['food']),cat(K,'FOOD'),'',0),
 row('Beverage',cat(A,'BEVERAGE'),f0(TA['bev'])+'*',cat(K,'BEVERAGE'),'',0),
 row("Rental &amp; fees",cat(A,'RENTAL'),f0(TA['fees'])+'*',cat(K,'RENTAL'),f0(TK['rental']),0),
 row("Standalone rooftop / Rotunda events",0,'',cat(K,'UNITEMISED'),'',cat(RO,'UNITEMISED')),
 row('Base revenue (Event Actual)',an['base'],f0(TA['base']),km['base'],f0(TK['base']),ro['base'],True),
 row('Service charge',an['svc'],f0(TA['svc']),km['svc'],f0(TK['svcgrat'])+'†',ro['svc']),
 row('Admin fee',an['adm'],f0(TA['adm']),km['adm'],f0(TK['adm']),ro['adm']),
 row('Net revenue',an['net'],f0(TA['net']),km['net'],f0(TK['net']),ro['net'],True),
]
CSS=open('corporate-social-2026.html').read().split('<style>')[1].split('</style>')[0]
H=f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Anthology &amp; Kamper's — August 2026</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>{CSS}
td.tst{{color:var(--text-3)}} th.tst{{color:#4f6a8a}} .cards{{margin-bottom:14px}} table{{font-size:10.4px}} th,td{{padding:5px 5px;white-space:nowrap}} th{{font-size:8px;letter-spacing:.05em}}
.note{{font-size:10.6px;line-height:1.5;color:var(--text-2);margin:0 0 8px;max-width:none}} .note strong{{color:var(--text)}}
.cols{{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:6px}}
</style></head><body>
<div class="page">
<p class="eyebrow">Anthology Events at Book Tower · Revenue split · August 2026</p>
<h1>August revenue, <em>by outlet</em></h1>
<div class="cards">
<div class="card"><div class="label">Anthology · net</div><div class="value">${f0(an['net'])}</div><div class="sub">Toast ${f0(TA['net'])} · {an['net']-TA['net']:+,.0f} ({100*(an['net']-TA['net'])/TA['net']:+.1f}%)</div></div>
<div class="card"><div class="label">Anthology · base (no svc / admin)</div><div class="value">${f0(an['base'])}</div><div class="sub">Svc ${f0(an['svc'])} + admin ${f0(an['adm'])} on top</div></div>
<div class="card"><div class="label">Kamper's · event net</div><div class="value">${f0(km['net'])}</div><div class="sub">Toast A/R ${f0(TK['net'])} · {km['net']-TK['net']:+,.0f} ({100*(km['net']-TK['net'])/TK['net']:+.1f}%)</div></div>
<div class="card"><div class="label">Kamper's share · shared weddings</div><div class="value">{100*sh_k/sh_net:.1f}%</div><div class="sub">vs the 20% convention · {len(shared)} weddings</div></div>
</div>
<table><thead><tr><th></th><th>Anthology</th><th class="tst">Toast</th><th>Kamper's</th><th class="tst">Toast</th><th>Bar Rotunda</th><th>Total</th></tr></thead>
<tbody>{''.join(rows)}</tbody></table>
<p class="note" style="margin-top:-2px">Toast columns sit beside the outlet they check: Anthology Events POS net sales, and Kamper's A/R TripleSeat payments. Total is all Book Tower events (Le Suprême / HIROKI-SAN excluded). * Toast keys bar packages across Liquor / Wine / Beer and rings ceremony, deposit and valet lines as Misc. Guest Fees, so beverage and fees only reconcile as a pair (${f0(cat(A,'BEVERAGE')+cat(A,'RENTAL'))} vs ${f0(TA['bev']+TA['fees'])}). † Kamper's A/R reports service charge and gratuity as one figure. Bar Rotunda has no POS report to compare.</p>
<div class="cols">
<div>
<p class="note"><strong>What was done.</strong> Tripleseat exposes no line items through its API, so every August event's invoice document was pulled and parsed. Each line follows the BEO's room header (KAMPERS, Kamper's Rooftop, Conservatory, Linden Room), a line that names Kamper's or Bar Rotunda goes to that outlet regardless, and standalone rooftop or Rotunda events stay 100% with their outlet. Service charge and admin fee are each outlet's share of the event's own charges, in proportion to base. Sales tax and gratuity are excluded throughout. Le Suprême and HIROKI-SAN private dining rows are their own book and are excluded.</p>
<p class="note"><strong>Anthology's August is ${f0(an['net'])} net, ${f0(an['base'])} before service charge and admin fee.</strong> That lands within ${f0(abs(an['net']-TA['net']))} of Toast, and service charge and admin fee tie on both sides (${f0(an['svc']+an['adm'])} vs ${f0(TA['svc']+TA['adm'])}). The 80/20 convention would have reported Anthology at roughly ${f0(an['net']+sh_k-.2*sh_net)}.</p>
</div>
<div>
<p class="note"><strong>Kamper's takes more than 20% of a shared wedding.</strong> It carries the canapés, its $1,000/hour reception fee and the cocktail hour of the five-hour bar package. With the bar hour included, six of seven weddings tie to Toast within $800 and Kamper's admin fee and rental fee land within $30 of its POS. Actual share runs 23–33%, averaging {100*sh_k/sh_net:.1f}%: the convention understates Kamper's by ${f0(sh_k-.2*sh_net)} for the month.</p>
<p class="note"><strong>Two things to fix at source.</strong> Megan Hannigan (8/22) has no Kamper's header on her BEO at all; Toast Anthology is short by exactly her canapés and seafood tower, so this report moves them to Kamper's. And Kamper's ${f0(TK['net']-km['net'])} shortfall to Toast sits in the three standalone rooftop events whose BEOs were not itemised; fetching them would close it. The six-page version carries the per-event, daily and category detail.</p>
</div>
</div>
<div class="foot"><span>Anthology Events at Book Tower · August 2026 outlet split</span><span>Sources: Tripleseat invoice documents &amp; export · Toast Sales Summary (Anthology Events, Kamper's)</span></div>
</div></body></html>'''
open('august-2026-outlet-split-onepager.html','w').write(H); print('html written')
