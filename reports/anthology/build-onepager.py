#!/usr/bin/env python3
"""One-page Anthology / Kamper's revenue split. Usage: build-onepager.py <config.json>"""
import json, collections, sys
CFG=json.load(open(sys.argv[1])); R=json.load(open(CFG['results']))
A='Anthology'; K="Kamper's"; RO='Bar Rotunda'
f0=lambda v: f"{v:,.0f}"
AL=collections.defaultdict(collections.Counter); CAT=collections.Counter()
for x in R:
    for o,a in x['alloc'].items():
        for k,v in a.items(): AL[o][k]+=v
    for k,v in x['cat'].items(): CAT[k]+=v
cat=lambda o,c: CAT.get(f'{o}|{c}',0)
an=AL[A]; km=AL[K]; ro=AL[RO]
TA=CFG['toast_anth']
TA['base']=TA['net']-TA['svc']-TA['adm']
TK=CFG['toast_kamp']
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
H=f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Anthology &amp; Kamper's — {CFG['month']}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>{CSS}
td.tst{{color:var(--text-3)}} th.tst{{color:#4f6a8a}} .cards{{margin-bottom:14px}} table{{font-size:10.4px}} th,td{{padding:5px 5px;white-space:nowrap}} th{{font-size:8px;letter-spacing:.05em}}
.note{{font-size:10.6px;line-height:1.5;color:var(--text-2);margin:0 0 8px;max-width:none}} .note strong{{color:var(--text)}}
.cols{{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:6px}}
</style></head><body>
<div class="page">
<p class="eyebrow">Anthology Events at Book Tower · Revenue split · {CFG['month']}</p>
<h1>{CFG['month'].split()[0]} revenue, <em>by outlet</em></h1>
<div class="cards">
<div class="card"><div class="label">Anthology · net</div><div class="value">${f0(an['net'])}</div><div class="sub">Toast ${f0(TA['net'])} · {an['net']-TA['net']:+,.0f} ({100*(an['net']-TA['net'])/TA['net']:+.1f}%)</div></div>
<div class="card"><div class="label">Anthology · base (no svc / admin)</div><div class="value">${f0(an['base'])}</div><div class="sub">Svc ${f0(an['svc'])} + admin ${f0(an['adm'])} on top</div></div>
<div class="card"><div class="label">Kamper's · event net</div><div class="value">${f0(km['net'])}</div><div class="sub">Toast A/R ${f0(TK['net'])} · {km['net']-TK['net']:+,.0f} ({100*(km['net']-TK['net'])/TK['net']:+.1f}%)</div></div>
<div class="card"><div class="label">Kamper's share · shared weddings</div><div class="value">{100*sh_k/sh_net:.1f}%</div><div class="sub">vs the 20% convention · {len(shared)} weddings</div></div>
</div>
<table><thead><tr><th></th><th>Anthology</th><th class="tst">Toast</th><th>Kamper's</th><th class="tst">Toast</th><th>Bar Rotunda</th><th>Total</th></tr></thead>
<tbody>{''.join(rows)}</tbody></table>
<p class="note" style="margin-top:-2px">Toast columns sit beside the outlet they check: Anthology Events POS net sales, and Kamper's A/R TripleSeat payments. Total is all Book Tower events (Le Suprême / HIROKI-SAN excluded). * Toast keys bar packages across Liquor / Wine / Beer and rings ceremony, deposit and valet lines as Misc. Guest Fees, so beverage and fees only reconcile as a pair (${f0(cat(A,'BEVERAGE')+cat(A,'RENTAL'))} vs ${f0(TA['bev']+TA['fees'])}). † Kamper's A/R reports service charge and gratuity as one figure. Bar Rotunda has no POS report to compare.</p>
<div class="cols"><div>{CFG["narrative"][0]}{CFG["narrative"][1]}</div><div>{CFG["narrative"][2]}{CFG["narrative"][3]}</div></div>
<div class="foot"><span>Anthology Events at Book Tower · {CFG['month']} outlet split</span><span>Sources: Tripleseat invoice documents &amp; export · Toast Sales Summary (Anthology Events, Kamper's)</span></div>
</div></body></html>'''
open(CFG['html'],'w').write(H); print('html written')
