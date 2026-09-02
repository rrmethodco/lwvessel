#!/usr/bin/env python3
"""Outlet split (Anthology / Kamper's / Bar Rotunda) for one month from parsed invoice line items.
Usage: reconcile-month.py <events.json> <lines.json> <out.json> [--no-prorate] [--no-overrides]
events.json rows: eid, date, name, guests, actual, svc, adm, rooms (svc/adm from the invoice totals block or the export).
Same rules as reconcile-august.py: kind from rooms; lines by outlet; cocktail-hour share of the bar package to Kamper's;
service charge and admin fee follow each outlet's base share; tax and gratuity are ignored."""
import json, re, sys, collections, datetime
ev_f, ln_f, out_f = sys.argv[1:4]
PRORATE='--no-prorate' not in sys.argv
K="Kamper's"; R='Bar Rotunda'; A='Anthology'
OTHER_OUTLET=re.compile(r'supr[eê]me|hiroki|sakazuki',re.I)
KAMP_ROOM=re.compile(r'kamper',re.I); ROT_ROOM=re.compile(r'rotunda',re.I)
ANTH_ROOM=re.compile(r'13th floor|linden|terrace|conservatory|green room|business center|tasting|photograph|graystone',re.I)
# Coordinator omissions confirmed against Toast (event_id -> {line_no: outlet})
OVERRIDES={47786830:{1:K,7:K},   # Megan Hannigan 8/22: canapes + seafood tower, Toast Anthology short by exactly their net
           47159914:{2:K}}        # Jordan Joseph 7/18: canapes in the Kamper's cocktail hour, no header; Kamper's A/R ties once moved
lines=json.load(open(ln_f))
if '--no-overrides' not in sys.argv:
    for l in lines:
        o=OVERRIDES.get(int(l['event_id']),{}).get(int(l['line_no']))
        if o: l['outlet']=o; l['override']=True
by=collections.defaultdict(list)
for l in lines: by[int(l['event_id'])].append(l)
# Cocktail-hour rule: when a BEO bills a Kamper's cocktail reception (its $1,000/hour line) but the
# coordinator left the canape block without a room header, the canapes were served at Kamper's.
# Confirmed against Toast for Megan Hannigan (8/22) and Jordan Joseph (7/18); applied generally.
for eid, ls in by.items():
    has_kamp_hour=any(re.search(r'kamper|rooftop',(l.get('description') or ''),re.I) and re.search(r'cocktail|reception|rental',(l.get('description') or ''),re.I) for l in ls)
    if not has_kamp_hour: continue
    for l in ls:
        d=l.get('description') or ''
        if l['section']=='FOOD' and l['outlet']=='Anthology' and not l.get('outlet_header') and re.search(r'canap',d,re.I) and re.search(r'1 hour|hour service',d,re.I) and l.get('total'):
            l['outlet']=K; l['rule']='cocktail-hour canapes'
rows=[]
for e in json.load(open(ev_f)):
    rooms=e['rooms']; has_k=bool(KAMP_ROOM.search(rooms)); has_r=bool(ROT_ROOM.search(rooms)); has_a=bool(ANTH_ROOM.search(rooms))
    if OTHER_OUTLET.search(rooms) and not has_a: continue
    kind='kampers standalone' if has_k and not has_a else 'rotunda standalone' if has_r and not has_a else 'anthology'
    ls=by.get(e['eid'],[]); base=collections.Counter(); note=[]; pro=0.0; kam_h=0.0; pkg=None
    net_total=e['actual']+e['svc']+e['adm']
    if kind=='kampers standalone': base[K]=e['actual']
    elif kind=='rotunda standalone': base[R]=e['actual']
    else:
        for l in ls:
            if l.get('total') is not None: base[l['outlet']]+=float(l['total'])
        inv=sum(base.values())
        if not ls: note.append('no invoice lines')
        elif abs(inv-e['actual'])>1: note.append(f'invoice {inv-e["actual"]:+,.0f} vs actual')
        base[A]=e['actual']-base[K]-base[R]
        for l in ls:
            desc=l.get('description') or ''
            if re.search(r'kamper|rooftop|rotunda',desc,re.I) and re.search(r'cocktail|reception|rental',desc,re.I):
                hm=re.search(r'(\d+(?:\.\d+)?)\s*-?\s*hour',desc,re.I); kam_h=max(kam_h,float(hm.group(1)) if hm else 1.0)
            if re.search(r'bar package',desc,re.I) and l.get('total') is not None:
                hm=re.search(r'(\d+(?:\.\d+)?)\s*hour',desc,re.I); pkg=(float(hm.group(1)) if hm else None,float(l['total']),l['outlet'])
        if pkg and pkg[0] and kam_h and pkg[2]==A: pro=pkg[1]*kam_h/pkg[0]
        if PRORATE and pro: base[A]-=pro; base[K]+=pro; note.append(f"bar pkg {kam_h:g}h/{pkg[0]:g}h = {pro:,.0f} to Kamper's")
        if any(l.get('override') for l in ls): note.append('BEO header omission corrected')
        if any(l.get('rule') for l in ls): note.append('canapes to Kamper\'s (cocktail-hour rule)')
    cat=collections.defaultdict(float)
    for l in ls:
        if l.get('total') is None: continue
        desc=l.get('description') or ''
        sec='RENTAL' if re.search(r'hour.*cocktail reception at kamper|kamper.*rental|rental.*kamper|cocktail hour: kamper',desc,re.I) else (l['section'] if l['section'] in ('FOOD','BEVERAGE') else 'RENTAL')
        cat[f"{l['outlet']}|{sec}"]+=float(l['total'])
    if kind=='kampers standalone': cat={f"{K}|UNITEMISED":e['actual']}
    elif kind=='rotunda standalone': cat={f"{R}|UNITEMISED":e['actual']}
    else:
        if PRORATE and pro: cat[f"{A}|BEVERAGE"]-=pro; cat[f"{K}|BEVERAGE"]+=pro
        cat[f"{A}|RENTAL"]+=base[A]-sum(v for k2,v in cat.items() if k2.startswith(A))
    alloc={}
    for o,v in base.items():
        sh=(v/e['actual']) if e['actual'] else 0
        alloc[o]={'base':v,'svc':e['svc']*sh,'adm':e['adm']*sh}; alloc[o]['net']=v+alloc[o]['svc']+alloc[o]['adm']
    rows.append({'eid':e['eid'],'name':e['name'],'date':e['date'],'kind':kind,'n':len(ls),'actual':e['actual'],'svc':e['svc'],'adm':e['adm'],'net':net_total,
                 'guests':e.get('guests'),'rooms':rooms,'base':dict(base),'netsplit':{o:a['net'] for o,a in alloc.items()},'cat':dict(cat),'alloc':alloc,'note':'; '.join(note)})
json.dump(rows,open(out_f,'w'),indent=1)
T=collections.Counter()
print(f"{'date':<6}{'event':<46}{'kind':<10}{'actual':>9}{'net':>9}{'Anth':>9}{'Kamp':>9}{'Rot':>7}{'K%':>7}  note")
for r in sorted(rows,key=lambda x:(x['date'],x['name'])):
    n=r['netsplit']; a=n.get(A,0); k=n.get(K,0); ro=n.get(R,0); T['a']+=a; T['k']+=k; T['ro']+=ro; T['net']+=r['net']; T['act']+=r['actual']
    print(f"{r['date'][5:]:<6}{r['name'][:45]:<46}{r['kind'][:9]:<10}{r['actual']:>9,.0f}{r['net']:>9,.0f}{a:>9,.0f}{k:>9,.0f}{ro:>7,.0f}{(100*(k+ro)/r['net'] if r['net'] else 0):>6.1f}%  {r['note']}")
print(f"{'':<6}{'TOTAL':<46}{'':<10}{T['act']:>9,.0f}{T['net']:>9,.0f}{T['a']:>9,.0f}{T['k']:>9,.0f}{T['ro']:>7,.0f}{100*(T['k']+T['ro'])/T['net']:>6.1f}%")
