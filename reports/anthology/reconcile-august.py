#!/usr/bin/env python3
"""Anthology / Kamper's / Bar Rotunda revenue split for August 2026.

Sources
  lines.json            parsed invoice line items (ts_invoice_lines) for the events that carry
                        an invoice document -- the only place Tripleseat exposes line items
  cddbb399-events_2.csv Tripleseat August export (Event Actual, Service Charge, Admin Fee, Rooms)
  Toast SalesSummary    Anthology Events POS (net by day) and Kamper's POS (A/R TripleSeat payments)

Convention
  Net = Event Actual + Service Charge + Admin Fee  (grand total less sales tax and gratuity).
  Each outlet's share of an event's line items (base) is grossed up by that event's own
  (svc + admin) / actual so the split is reported on the same net basis as the P&L.
  Standalone Kamper's / Bar Rotunda events are 100% that outlet and are excluded from the
  Anthology-side figures. Le Supreme / HIROKI-SAN rows are their own book and ignored.
"""
import csv, json, re, collections, datetime, sys, openpyxl
UP='/root/.claude/uploads/1016ed00-55b4-510b-b3c1-eb6d9e2a693d'
PRORATE='--no-prorate' not in sys.argv   # default on: Toast ties per day only when the cocktail-hour share of the bar package sits with Kamper's
lines=json.load(open('lines.json'))
# Coordinator omissions confirmed against Toast: line items served at Kamper's with no Kamper's
# header on the BEO. Megan Hannigan 8/22 -- canapes (5:00-6:30 PM, the Kamper's cocktail
# reception window) and seafood tower; Toast Anthology Events is short by exactly their net.
OVERRIDES={47786830:{1:"Kamper's",7:"Kamper's"}}
if '--no-overrides' not in sys.argv:
    for l in lines:
        o=OVERRIDES.get(int(l['event_id']),{}).get(int(l['line_no']))
        if o: l['outlet']=o; l['override']=True
def m(s):
    s=(s or '').strip().replace('$','').replace(',','')
    try: return float(s)
    except: return 0.0
def d(s):
    try: return datetime.datetime.strptime((s or '').strip(),'%m/%d/%Y').date()
    except: return None
norm=lambda s: re.sub(r'\s+',' ',(s or '').replace('’',"'").replace('&amp;','&')).strip().lower()
K="Kamper's"; R='Bar Rotunda'; A='Anthology'

# event_id -> (export name, date) for the invoices fetched (from ts_event_report)
EV={47007816:("Kamren Huizenga & Elizabeth Rau Wedding",'8/7/2026'),43976979:("Jada Smith & Dominic Yamarino Wedding",'8/8/2026'),
 47786830:("Megan Hannigan & Ryan O'Hara Wedding Reception",'8/22/2026'),50951375:("David Bernier & Tyler Jablonski Wedding",'8/21/2026'),
 47357099:("Anthony Lim and Gabriela Ciavattone Wedding",'8/29/2026'),44164416:("Melissa Harvey & Austin Davis Wedding",'8/1/2026'),
 46410068:("Hannah Broucek & Ben Samoy Wedding",'8/15/2026'),49297540:("Claire Wahl & Michael Varlese Wedding",'8/28/2026'),
 48025857:("President's Dinner",'8/14/2026'),61572889:("70th Birthday Dinner",'8/25/2026'),57083091:("Adcraft Executive Meeting",'8/5/2026'),
 58234682:("Lambda Legal Day 1",'8/11/2026'),58234947:("Lambda Legal Day 2",'8/12/2026'),58234757:("Lambda Legal Day 3",'8/13/2026'),
 58243135:("Lambda Legal Day 1",'8/25/2026'),58243136:("Lambda Legal Day 2",'8/26/2026'),58243134:("Lambda Legal Day 3",'8/27/2026'),
 51062685:("TERRACE CLUB Hannah Broucek & Ben Samoy Wedding",'8/15/2026'),61554495:("Terrace Club Rental : Anthony Lim and Gabriela Ciavattone",'8/29/2026'),
 61656875:("Terrace Club Rental: Stewart Birthday Celebration",'8/30/2026'),62177336:("VIP In-House Meeting",'8/18/2026'),
 62120962:("CEREMONY: David Bernier & Tyler Jablonski Wedding",'8/21/2026'),62104742:("Rehearsal: Claire Wahl & Michael Varlese Wedding",'8/27/2026'),
 61552944:("Terrace Club",'8/28/2026'),61210309:("Boraski Photography Session",'8/3/2026'),60388405:("Mackoul Photoshoot",'8/5/2026'),
 61778507:("Zaya photography session",'8/10/2026'),61221446:("Maroof Photo Session",'8/17/2026'),57963758:("PS: Emily Dahuron",'8/18/2026'),
 59705775:("Sowerby - Photoshoot",'8/19/2026'),60940560:("Tanguay Engagement Photos",'8/19/2026'),62164121:("FM Photoshoot",'8/20/2026'),
 55299128:("PS: Nour Khalifa",'8/27/2026'),61856212:("NCAA Fam Breakfast Offsite",'8/19/2026')}
OTHER_OUTLET=re.compile(r'supr[eê]me|hiroki|sakazuki',re.I)
KAMP_ROOM=re.compile(r'kamper',re.I); ROT_ROOM=re.compile(r'rotunda',re.I)
ANTH_ROOM=re.compile(r'13th floor|linden|terrace|conservatory|green room|business center|tasting|photograph',re.I)

# ---- Tripleseat export
exp={}
for r in csv.DictReader(open(f'{UP}/cddbb399-events_2.csv',encoding='utf-8-sig')):
    if (r.get('Name') or '').strip() in ('','Grand Total'): continue
    rooms=(r.get('Rooms') or '').replace('\n',' ').strip()
    e={'name':r['Name'].strip(),'date':d(r['Date']),'actual':m(r['Event Actual']),'grand':m(r['Event Grand Total']),'tax':m(r['Sales Tax']),
       'grat':m(r['Gratuity ']),'svc':m(r['Service Charge']),'adm':m(r['Admin Fee']),'guests':m(r.get('Guests')),'rooms':rooms}
    e['net']=e['actual']+e['svc']+e['adm']
    has_k=bool(KAMP_ROOM.search(rooms)); has_r=bool(ROT_ROOM.search(rooms)); has_a=bool(ANTH_ROOM.search(rooms))
    if OTHER_OUTLET.search(rooms) and not has_a: e['kind']='other outlet'
    elif has_k and not has_a: e['kind']='kampers standalone'
    elif has_r and not has_a: e['kind']='rotunda standalone'
    else: e['kind']='anthology'
    exp[(norm(e['name']),e['date'])]=e

# ---- Toast
def toast_by_day(f):
    wb=openpyxl.load_workbook(f'{UP}/{f}',data_only=True); out={}
    for row in list(wb['Sales by day'].iter_rows(values_only=True))[1:]:
        if row and row[0]: out[int(str(int(row[0]))[6:8])]=row[1] or 0
    return out
toast_anth=toast_by_day('67b5d2dc-SalesSummary_20260801_20260831.xlsx')
TOAST_ANTH_NET=406900.03                    # Anthology Events POS, net sales (svc + admin inside, tax excluded)
KAMP_AR_AMOUNT=103923.37; KAMP_AR_TAX=5135.12; KAMP_AR_GRAT=17119.83   # Kamper's POS, A/R TripleSeat, 11 payments
KAMP_AR_NET=KAMP_AR_AMOUNT-KAMP_AR_TAX            # reading A: amount already carries the service charge (as Anthology's POS does)
KAMP_AR_NET_B=KAMP_AR_NET+KAMP_AR_GRAT            # reading B: the 17.3% 'Grat' column is the service charge, added on top

by=collections.defaultdict(list)
for l in lines: by[int(l['event_id'])].append(l)

# ---- split every export row
rows=[]
ev_by_key={(norm(n),d(ds)):eid for eid,(n,ds) in EV.items()}
for key,e in exp.items():
    if e['kind']=='other outlet': continue
    eid=ev_by_key.get(key); ls=by.get(eid,[]) if eid else []
    base=collections.Counter(); note=[]
    if e['kind']=='kampers standalone': base[K]=e['actual']
    elif e['kind']=='rotunda standalone': base[R]=e['actual']
    else:
        for l in ls:
            if l.get('total') is not None: base[l['outlet']]+=float(l['total'])
        inv=sum(base.values())
        if not ls: note.append('no invoice lines' if eid else 'no invoice fetched')
        elif abs(inv-e['actual'])>1: note.append(f'invoice {inv-e["actual"]:+,.0f} vs actual')
        # anything the invoice doesn't itemise (room rental, unlisted fees) stays with Anthology
        base[A]=e['actual']-base[K]-base[R]
        # bar-package proration (optional layer)
        kam_h=0.0; pkg=None
        for l in ls:
            desc=l.get('description') or ''
            if re.search(r'kamper|rooftop|rotunda',desc,re.I) and re.search(r'cocktail|reception',desc,re.I):
                hm=re.search(r'(\d+(?:\.\d+)?)\s*-?\s*hour',desc,re.I); kam_h=max(kam_h,float(hm.group(1)) if hm else 1.0)
            if re.search(r'bar package',desc,re.I) and l.get('total') is not None:
                hm=re.search(r'(\d+(?:\.\d+)?)\s*hour',desc,re.I); pkg=(float(hm.group(1)) if hm else None,float(l['total']),l['outlet'])
        pro=0.0
        if pkg and pkg[0] and kam_h and pkg[2]==A: pro=pkg[1]*kam_h/pkg[0]
        if PRORATE and pro: base[A]-=pro; base[K]+=pro; note.append(f'bar pkg {kam_h:g}h/{pkg[0]:g}h = {pro:,.0f} to Kamper\'s')
        elif pro: note.append(f'(bar pkg {kam_h:g}h/{pkg[0]:g}h would move {pro:,.0f})')
    g=(e['net']/e['actual']) if e['actual'] else 1.0
    net={o:v*g for o,v in base.items()}
    # category by outlet for the Toast comparison: FOOD / BEVERAGE from the invoice section,
    # RENTAL for the Kamper's cocktail-reception fee ($1,000/hr, rung at Kamper's as Room Rental Fee)
    # and for anything the invoice does not itemise (room rental, photography, Terrace Club).
    cat=collections.defaultdict(float)
    for l in ls:
        if l.get('total') is None: continue
        desc=l.get('description') or ''
        if re.search(r'hour.*cocktail reception at kamper',desc,re.I): sec='RENTAL'
        else: sec=l['section'] if l['section'] in ('FOOD','BEVERAGE') else 'RENTAL'
        cat[f"{l['outlet']}|{sec}"]+=float(l['total'])
    if e['kind']=='kampers standalone': cat[f"{K}|UNITEMISED"]=e['actual']
    elif e['kind']=='rotunda standalone': cat[f"{R}|UNITEMISED"]=e['actual']
    else:
        if PRORATE and pro: cat[f"{A}|BEVERAGE"]-=pro; cat[f"{K}|BEVERAGE"]+=pro
        itemised=sum(v for k2,v in cat.items() if k2.startswith(A))
        cat[f"{A}|RENTAL"]+=base[A]-itemised
    # service charge, admin fee, tax and gratuity follow each outlet's share of the base
    alloc={}
    for o,v in base.items():
        sh=(v/e['actual']) if e['actual'] else 0
        alloc[o]={'base':v,'svc':e['svc']*sh,'adm':e['adm']*sh,'tax':e['tax']*sh,'grat':e['grat']*sh}
        alloc[o]['net']=v+alloc[o]['svc']+alloc[o]['adm']; alloc[o]['grand']=alloc[o]['net']+alloc[o]['tax']+alloc[o]['grat']
    if any(l.get('override') for l in ls): note.append('BEO header omission corrected (see notes)')
    rows.append({'eid':eid,'name':e['name'],'date':e['date'],'kind':e['kind'],'n':len(ls),'actual':e['actual'],'net':e['net'],
                 'svc':e['svc'],'adm':e['adm'],'tax':e['tax'],'grat':e['grat'],'grand':e['grand'],'guests':e['guests'],'rooms':e['rooms'],
                 'base':dict(base),'netsplit':net,'cat':dict(cat),'alloc':alloc,'note':'; '.join(note)})
json.dump(rows,open('split-results.json','w'),indent=1,default=str)

# ---- per-event table
hdr=f"{'date':<6}{'event':<44}{'kind':<10}{'TS actual':>10}{'TS net':>10}{'Anth net':>10}{'Kamp net':>10}{'Rot net':>8}{'Kamp%':>7}  note"
print(f"AUGUST 2026 -- outlet split{' (bar package prorated)' if PRORATE else ''}\n"+hdr)
T=collections.Counter()
for r in sorted(rows,key=lambda x:(x['date'],x['name'])):
    n=r['netsplit']; a=n.get(A,0); k=n.get(K,0); ro=n.get(R,0)
    if r['actual']==0 and not r['n']: continue
    T['a']+=a;T['k']+=k;T['ro']+=ro;T['net']+=r['net'];T['act']+=r['actual']
    kp=100*(k+ro)/r['net'] if r['net'] else 0
    print(f"{r['date'].strftime('%m/%d'):<6}{r['name'][:43]:<44}{r['kind'][:9]:<10}{r['actual']:>10,.0f}{r['net']:>10,.0f}{a:>10,.0f}{k:>10,.0f}{ro:>8,.0f}{kp:>6.1f}%  {r['note']}")
print(f"{'':<6}{'TOTAL':<44}{'':<10}{T['act']:>10,.0f}{T['net']:>10,.0f}{T['a']:>10,.0f}{T['k']:>10,.0f}{T['ro']:>8,.0f}{100*(T['k']+T['ro'])/T['net']:>6.1f}%")

# ---- shared weddings vs the 80/20 convention
print("\nSHARED WEDDINGS -- actual Kamper's share vs 80/20 convention (net basis)")
print(f"{'date':<6}{'wedding':<44}{'net':>10}{'Kamp net':>10}{'Kamp%':>7}{'80/20 Kamp':>11}{'delta':>9}")
S=collections.Counter()
for r in sorted(rows,key=lambda x:x['date']):
    k=r['netsplit'].get(K,0)
    if r['kind']!='anthology' or k<=0: continue
    conv=0.2*r['net']; S['net']+=r['net']; S['k']+=k; S['conv']+=conv
    print(f"{r['date'].strftime('%m/%d'):<6}{r['name'][:43]:<44}{r['net']:>10,.0f}{k:>10,.0f}{100*k/r['net']:>6.1f}%{conv:>11,.0f}{k-conv:>+9,.0f}")
print(f"{'':<6}{'TOTAL':<44}{S['net']:>10,.0f}{S['k']:>10,.0f}{100*S['k']/S['net']:>6.1f}%{S['conv']:>11,.0f}{S['k']-S['conv']:>+9,.0f}")

# ---- tie-out to Toast
print("\nTIE-OUT (net = actual + service charge + admin fee; tax and gratuity excluded)")
print(f"  Anthology expected (TS)      {T['a']:>12,.2f}   Toast Anthology Events net   {TOAST_ANTH_NET:>12,.2f}   delta {T['a']-TOAST_ANTH_NET:>+10,.2f}")
print(f"  Kamper's expected (TS)       {T['k']:>12,.2f}   Kamper's A/R net, reading A  {KAMP_AR_NET:>12,.2f}   delta {T['k']-KAMP_AR_NET:>+10,.2f}   (amount {KAMP_AR_AMOUNT:,.2f} less tax {KAMP_AR_TAX:,.2f})")
print(f"  {'':<29}{'':>12}   Kamper's A/R net, reading B  {KAMP_AR_NET_B:>12,.2f}   delta {T['k']-KAMP_AR_NET_B:>+10,.2f}   (reading A plus 'Grat' {KAMP_AR_GRAT:,.2f})")
print(f"  Bar Rotunda expected (TS)    {T['ro']:>12,.2f}   (no Rotunda POS report provided)")
print(f"  Combined                     {T['a']+T['k']+T['ro']:>12,.2f}   Toast combined (A / B)       {TOAST_ANTH_NET+KAMP_AR_NET:>12,.2f} / {TOAST_ANTH_NET+KAMP_AR_NET_B:,.2f}")

# ---- Anthology by day vs Toast
print("\nANTHOLOGY BY DAY -- expected net (TS, after outlet split) vs Toast Anthology Events net")
byday=collections.defaultdict(float); names=collections.defaultdict(list)
for r in rows:
    a=r['netsplit'].get(A,0)
    if a: byday[r['date'].day]+=a; names[r['date'].day].append(r['name'][:22])
print(f"{'day':<5}{'TS Anth net':>12}{'Toast net':>12}{'delta':>10}  events")
tie=0
for day in sorted(set(byday)|set(toast_anth)):
    ts=byday.get(day,0); to=toast_anth.get(day,0); dl=ts-to
    if abs(dl)<=600 and ts: tie+=1
    print(f"{day:<5}{ts:>12,.0f}{to:>12,.0f}{dl:>+10,.0f}  {', '.join(names.get(day,[]))[:70]}")
print(f"{'':<5}{sum(byday.values()):>12,.0f}{sum(toast_anth.values()):>12,.0f}{sum(byday.values())-sum(toast_anth.values()):>+10,.0f}   days within $600: {tie}/{len([d for d in byday if byday[d]])}")
