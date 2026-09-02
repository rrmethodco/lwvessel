#!/usr/bin/env python3
"""Build a month's events.json for reconcile-month.py from the Tripleseat event list and parsed invoice meta.
Usage: make-month-events.py <events-all.json> <meta.json> <YYYY-MM> <out.json>"""
import json, sys, re, datetime
ev_all, meta_f, month, out_f = sys.argv[1:5]
META={int(m['event_id']):m for m in json.load(open(meta_f))}
KAMP=re.compile(r'kamper',re.I)
rows=[e for e in json.load(open(ev_all)) if e['date'].startswith(month)]
# duplicates (a DEFINITE copy alongside the CLOSED event) -- keep the CLOSED one
seen={}
for e in sorted(rows,key=lambda e:(e['status']!='CLOSED')):
    k=(e['date'],re.sub(r'\W','',e['name']).lower(),round(float(e['actual'] or 0)))
    if k not in seen: seen[k]=e
out=[]
for e in seen.values():
    m=META.get(e['eid'],{}); actual=float(e['actual'] or 0)
    svc=m.get('service_charge') or 0.0
    adm=m.get('admin_fee'); adm=float(adm) if adm is not None else (25.0 if actual==500 else 0.0)
    d=datetime.date.fromisoformat(e['date']); dstr=f"{d.month}/{d.day}/{d.year}"
    sched=[s for s in (m.get('schedule') or []) if s.get('date')==dstr and s.get('areas')]
    r1=e['room1'] or ''; key=r1.split(' -')[0].split(' Section')[0].replace("'","").lower()
    nm=lambda t: re.sub(r'\W','',t or '').lower()
    pick=[s['areas'] for s in sched if nm(s.get('name'))==nm(e['name'])]
    if not pick: pick=[s['areas'] for s in sched if key and key in s['areas'].replace("'","").lower()]
    rooms=pick[0] if pick else (sched[0]['areas'] if len(sched)==1 else r1)
    if not re.search(r'13th|linden|terrace|conservatory|green|business|tasting|photograph|kamper|rotunda|study|graystone',rooms,re.I): rooms=r1 or rooms
    out.append({'eid':e['eid'],'date':e['date'],'name':e['name'].strip(),'guests':e['guests'],'actual':actual,'svc':float(svc),'adm':adm,
                'grat':float(m.get('gratuity') or 0),'rooms':rooms,'flag':'' if m else 'no invoice document'})
out.sort(key=lambda x:(x['date'],x['name']))
json.dump(out,open(out_f,'w'),indent=1)
print(month,len(out),'events',f"actual {sum(x['actual'] for x in out):,.0f}", 'no doc:',[x['name'][:25] for x in out if x['flag']])
