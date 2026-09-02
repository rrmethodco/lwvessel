#!/usr/bin/env python3
"""Month-to-month Anthology / Kamper's / Bar Rotunda split. Usage: build-monthly.py <config.json>
config: {"title":..., "months":[{"label":"Jan","results":"jan-results.json","toast_anth":{...}|null,"toast_kamp":{...}|null},...], "html":..., "narrative":[...]} """
import json, collections, sys
CFG=json.load(open(sys.argv[1])); A='Anthology'; K="Kamper's"; RO='Bar Rotunda'
f0=lambda v: f"{v:,.0f}"; pc=lambda v: f"{v:.1f}%"
M=[]
for m in CFG['months']:
    R=json.load(open(m['results'])); AL=collections.defaultdict(collections.Counter); CAT=collections.Counter()
    for x in R:
        for o,a in x['alloc'].items():
            for k,v in a.items(): AL[o][k]+=v
        for k,v in x['cat'].items(): CAT[k]+=v
    shared=[x for x in R if x['kind']=='anthology' and x['netsplit'].get(K,0)>0]
    sh_net=sum(x['net'] for x in shared); sh_k=sum(x['netsplit'][K] for x in shared)
    stand_k=sum(x['net'] for x in R if x['kind']=='kampers standalone'); stand_r=sum(x['net'] for x in R if x['kind']=='rotunda standalone')
    rot_sh=sum(x['netsplit'].get(RO,0) for x in R if x['kind']=='anthology')
    M.append({**m,'an':AL[A],'km':AL[K],'ro':AL[RO],'shared_n':len(shared),'sh_net':sh_net,'sh_k':sh_k,'stand_k':stand_k,'stand_r':stand_r,'rot_sh':rot_sh,
              'events':len([x for x in R if x['net']>0]),'total':sum(x['net'] for x in R)})
T=collections.Counter()
def td(v,cls=''): return f'<td class="{cls}">{v}</td>'
rows1=[]
for m in M:
    an,km,ro=m['an'],m['km'],m['ro']; ta=m.get('toast_anth'); tk=m.get('toast_kamp')
    for k in ('base','svc','adm','net'): T['an_'+k]+=an[k]; T['km_'+k]+=km[k]; T['ro_'+k]+=ro[k]
    T['total']+=m['total']; T['sh_net']+=m['sh_net']; T['sh_k']+=m['sh_k']; T['sh_n']+=m['shared_n']
    if ta: T['ta']+=ta['net']; T['an_net_toast']+=an['net']
    if tk: T['tk']+=tk['net']; T['km_net_toast']+=km['net']
    rows1.append('<tr>'+td(m['label'])+td(f0(an['base']))+td(f0(an['svc']+an['adm']))+td(f0(an['net']))+td(f0(ta['net']) if ta else '—','tst' if ta else 'tst mute')
        +td(f0(km['net']))+td(f0(tk['net']) if tk else '—','tst' if tk else 'tst mute')+td(f0(ro['net']) if ro['net'] else '—','' if ro['net'] else 'mute')+td(f0(m['total']))
        +td(pc(100*m['sh_k']/m['sh_net']) if m['sh_net'] else '—','' if m['sh_net'] else 'mute')+'</tr>')
rows1.append('<tr class="tot">'+td('Jan–Aug')+td(f0(T['an_base']))+td(f0(T['an_svc']+T['an_adm']))+td(f0(T['an_net']))+td(f0(T['ta'])+'<span class="n">*</span>','tst')
    +td(f0(T['km_net']))+td(f0(T['tk'])+'<span class="n">*</span>','tst')+td(f0(T['ro_net']))+td(f0(T['total']))+td(pc(100*T['sh_k']/T['sh_net']))+'</tr>')
rows2=[]; T2=collections.Counter()
for m in M:
    conv=.2*m['sh_net']; T2['conv']+=conv; T2['k']+=m['sh_k']; T2['sk']+=m['stand_k']; T2['sr']+=m['stand_r']; T2['rs']+=m['rot_sh']
    rows2.append('<tr>'+td(m['label'])+td(m['shared_n'] or ('—'))+td(f0(m['sh_net']) if m['sh_net'] else ('—'))+td(f0(m['sh_k']) if m['sh_k'] else '—')+td(pc(100*m['sh_k']/m['sh_net']) if m['sh_net'] else '—')
        +td(f0(conv) if m['sh_net'] else '—','tst')+td(f"{m['sh_k']-conv:+,.0f}" if m['sh_net'] else '—','pos' if m['sh_k']>conv else ('neg' if m['sh_net'] else ''))
        +td(f0(m['stand_k']) if m['stand_k'] else '—')+td(f0(m['rot_sh']+m['stand_r']) if (m['rot_sh']+m['stand_r']) else '—')+'</tr>')
rows2.append('<tr class="tot">'+td('Jan–Aug')+td(T['sh_n'])+td(f0(T['sh_net']))+td(f0(T['sh_k']))+td(pc(100*T['sh_k']/T['sh_net']))+td(f0(T2['conv']),'tst')+td(f"{T2['k']-T2['conv']:+,.0f}",'pos')+td(f0(T2['sk']))+td(f0(T2['rs']+T2['sr']))+'</tr>')
CSS=open('corporate-social-2026.html').read().split('<style>')[1].split('</style>')[0]
N=CFG['narrative']
H=f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Anthology &amp; Kamper's — January to August 2026</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>{CSS}
td.tst{{color:var(--text-3)}} th.tst{{color:#4f6a8a}} .cards{{margin-bottom:10px;gap:9px}} .card{{padding:11px 13px}} .card .value{{font-size:26px}} table{{font-size:9.6px;margin-bottom:4px}} th,td{{padding:3px 4px;white-space:nowrap}} th{{font-size:7.4px;letter-spacing:.04em}} h1{{font-size:36px;margin-bottom:10px}} td .n{{font-family:var(--ui);font-size:8.5px;color:var(--text-3)}}
.note{{font-size:9.9px;line-height:1.45;color:var(--text-2);margin:0 0 6px;max-width:none}} .note strong{{color:var(--text)}}
.cols{{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:4px}} h2{{font-size:19px;margin:6px 0 4px}} table.w{{font-size:9.1px}} table.w th,table.w td{{padding:3px 2.5px}} table.w th{{font-size:7px;letter-spacing:.02em}}
</style></head><body>
<div class="page">
<p class="eyebrow">Anthology Events at Book Tower · Revenue by outlet · January – August 2026</p>
<h1>Eight months, <em>by outlet</em></h1>
<div class="cards">
<div class="card"><div class="label">Anthology · net Jan–Aug</div><div class="value">${f0(T['an_net'])}</div><div class="sub">Base ${f0(T['an_base'])} + svc ${f0(T['an_svc'])} + admin ${f0(T['an_adm'])}</div></div>
<div class="card"><div class="label">Kamper's · event net Jan–Aug</div><div class="value">${f0(T['km_net'])}</div><div class="sub">${f0(T['sh_k'])} from shared weddings · ${f0(T2['sk'])} standalone</div></div>
<div class="card"><div class="label">Bar Rotunda · event net Jan–Aug</div><div class="value">${f0(T['ro_net'])}</div><div class="sub">Cocktail hours and residential events</div></div>
<div class="card"><div class="label">Kamper's share · shared weddings</div><div class="value">{pc(100*T['sh_k']/T['sh_net'])}</div><div class="sub">{T['sh_n']} weddings · 80/20 would give ${f0(T2['conv'])}, {T2['k']-T2['conv']:+,.0f}</div></div>
</div>
<h2>Net revenue by month <em>(grand total less tax and gratuity)</em></h2>
<table class="w"><thead><tr><th>Month</th><th>Anth. base</th><th>Svc + admin</th><th>Anthology net</th><th class="tst">Toast</th><th>Kamper's net</th><th class="tst">Toast A/R</th><th>Bar Rotunda</th><th>Book Tower events</th><th>Kamper's % shared</th></tr></thead><tbody>{''.join(rows1)}</tbody></table>
<h2>Shared weddings <em>vs the 80/20 convention</em></h2>
<table><thead><tr><th>Month</th><th>Weddings</th><th>Wedding net</th><th>Kamper's share</th><th>Share %</th><th class="tst">20% would give</th><th>Δ</th><th>Standalone Kamper's</th><th>Bar Rotunda (all)</th></tr></thead><tbody>{''.join(rows2)}</tbody></table>
<p class="note" style="margin-top:-2px"><span class="n">*</span> Toast totals cover May, July and August only, the months whose Sales Summaries were provided.</p><div class="cols"><div>{N[0]}{N[1]}</div><div>{N[2]}{N[3]}</div></div>
<div class="foot"><span>Anthology Events at Book Tower · January – August 2026 outlet split</span><span>Sources: Tripleseat invoice documents · Toast Sales Summaries where provided (May, July, August)</span></div>
</div></body></html>'''
open(CFG['html'],'w').write(H); print('html written'); json.dump({m['label']:{'an':dict(m['an']),'km':dict(m['km']),'ro':dict(m['ro']),'shared_n':m['shared_n'],'sh_net':m['sh_net'],'sh_k':m['sh_k'],'stand_k':m['stand_k'],'stand_r':m['stand_r'],'rot_sh':m['rot_sh'],'total':m['total'],'events':m['events']} for m in M},open('monthly-summary.json','w'),indent=1)
