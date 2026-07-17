#!/usr/bin/env python3
# kbo_reference_v1.py — v1.0 (v71 L-49) 파이썬 참조 구현 + 골든 픽스처 생성
import pandas as pd
import numpy as np
import sqlite3, json, re, os
import warnings
warnings.filterwarnings('ignore')

NEW = '/home/claude/work/kbo_new'
UP = '/mnt/user-data/uploads'
TEAM = {'LG':'LG','SSG':'SSG','삼성':'SAMSUNG','KIA':'KIA','키움':'KIWOOM',
        'KT':'KT','두산':'DOOSAN','롯데':'LOTTE','NC':'NC','한화':'HANWHA'}

def parse_unop(text, season):
    rows=[]
    for line in text.split('\n'):
        line=line.strip()
        if not line or '우천취소' in line: continue
        parts=line.replace(' vs ',' ').split()
        if len(parts)<4: continue
        try: lv=float(parts[3])
        except: continue
        m=re.match(r'^(\d+)\.(\d+)', parts[0])
        if not m: continue
        h=TEAM.get(parts[1]); a=TEAM.get(parts[2])
        if not h or not a: continue
        rows.append(dict(date=f'{season}-{int(m.group(1)):02d}-{int(m.group(2)):02d}',
                         home=h, away=a, line=lv, season=season))
    return rows

FILES = ['25년_언옵데이터.txt','26시즌_3_4월_5이닝_언옵.txt','26시즌_5_6월_28일까지_5이닝_언옵.txt',
         '26시즌_5_6월_5이닝_언옵.txt','26시즌_7월_7일까지_5이닝_언옵.txt']
unop_files = {fn: open(f'{UP}/{fn}', encoding='utf-8').read() for fn in FILES}

conn = sqlite3.connect(f'{NEW}/kbo.db')
pl = pd.read_sql_query("SELECT game_key, date, team, name as pitcher, outs_recorded as outs, hits, bb FROM pitcher_log WHERE is_starter=1 ORDER BY name, date", conn)
inn = pd.read_sql_query("""SELECT game_key, date, away_team as away, home_team as home,
 COALESCE(away_i1,0)+COALESCE(away_i2,0)+COALESCE(away_i3,0)+COALESCE(away_i4,0)+COALESCE(away_i5,0) as a5,
 COALESCE(home_i1,0)+COALESCE(home_i2,0)+COALESCE(home_i3,0)+COALESCE(home_i4,0)+COALESCE(home_i5,0) as h5
 FROM inning_score WHERE date >= '2025-07-29'""", conn)
conn.close()
pl['date'] = pd.to_datetime(pl['date']).dt.strftime('%Y-%m-%d')
inn['date'] = inn['date'].astype(str)

allrows=[]
for name in sorted(unop_files.keys()):
    season = 2025 if name.startswith('25') else 2026
    allrows += parse_unop(unop_files[name], season)
seen=set(); unop=[]
for r in allrows:
    k=f"{r['date']}|{r['home']}|{r['away']}"
    if k in seen: continue
    seen.add(k); unop.append(r)

def rw(name, team): return ('화이트(한)' if team=='HANWHA' else '화이트(S)') if name=='화이트' else name
pl['pitcher'] = pl.apply(lambda r: rw(r['pitcher'], r['team']), axis=1)
innmap = {}
for _, r in inn.sort_values('game_key', kind='stable').iterrows():
    k=f"{r['date']}|{r['home']}|{r['away']}"
    if k not in innmap: innmap[k]=r
spmap = {f"{r['game_key']}|{r['team']}": r['pitcher'] for _, r in pl.iterrows()}
games=[]
for u in unop:
    g = innmap.get(f"{u['date']}|{u['home']}|{u['away']}")
    if g is None: continue
    t5 = int(g['a5']+g['h5'])
    games.append(dict(game_key=str(g['game_key']), date=u['date'], season=u['season'],
                      home=u['home'], away=u['away'], line=u['line'],
                      home_5=int(g['h5']), away_5=int(g['a5']), total_5=t5, residual=t5-u['line'],
                      home_pitcher=spmap.get(f"{g['game_key']}|{u['home']}"),
                      away_pitcher=spmap.get(f"{g['game_key']}|{u['away']}")))
gd = pd.DataFrame(games)
print(f'games: {len(gd)} (~{gd.date.max()})')

hv = gd.copy(); hv['pitcher']=hv['home_pitcher']; hv['allowed']=hv['away_5']
av = gd.copy(); av['pitcher']=av['away_pitcher']; av['allowed']=av['home_5']
pvx = pd.concat([hv[['date','pitcher','allowed','residual']], av[['date','pitcher','allowed','residual']]])
pvx = pvx.dropna(subset=['pitcher']).sort_values('date', kind='stable').reset_index(drop=True)

def type_at(pitcher, asof):
    mine = pvx[(pvx['pitcher']==pitcher) & (pvx['date']<asof)]
    if len(mine)<5: return None
    ma = mine['allowed'].mean(); pe=(mine['residual']>=3.0).mean()*100
    if ma>=4.0 and pe>=40.0: return 'A'
    if ma<=2.0 and pe<=20.0: return 'C'
    return 'STD'

pl2 = pl.copy()
pl2['season'] = pl2['date'].str[:4].astype(int)
pl2['ip'] = pl2['outs']/3
pl2['whip_g'] = np.where(pl2['ip']>0,(pl2['hits']+pl2['bb'])/pl2['ip'],np.nan)
pl2['h_ip_g'] = np.where(pl2['ip']>0, pl2['hits']/pl2['ip'], np.nan)
pl2 = pl2.sort_values(['pitcher','date'], kind='stable').reset_index(drop=True)
def base(x):
    out=[]; s=0.0; n=0
    for v in x:
        out.append(s/n if n>0 else np.nan)
        if np.isfinite(v): s+=v; n+=1
    return pd.Series(out, index=x.index)
for col in ['whip_g','h_ip_g']:
    pl2[f'base_{col}'] = pl2.groupby(['pitcher','season'])[col].transform(base)
    pl2[f'r3_{col}'] = pl2.groupby('pitcher')[col].transform(lambda x: x.rolling(3, min_periods=2).mean())
    pl2[f'd_{col}'] = np.where((pl2[f'base_{col}'].notna())&(pl2[f'base_{col}']>0.1),
                               pl2[f'r3_{col}']/pl2[f'base_{col}'], np.nan)
THR=1.10
def sc_of(dw, dh):
    if not (np.isfinite(dw) and np.isfinite(dh)): return None
    return 'worsen' if (dw>=THR and dh>=THR) else 'non_worsen'
pl2['sc'] = pl2.apply(lambda r: sc_of(r['d_whip_g'], r['d_h_ip_g']), axis=1)
pl2['sc_pre'] = pl2.groupby('pitcher')['sc'].shift(1)

p26 = pl2[pl2['season']==2026].copy()
p26['gs_idx'] = p26.groupby('pitcher').cumcount()+1
p26['cum_bb'] = p26.groupby('pitcher')['bb'].cumsum()
p26['cum_outs'] = p26.groupby('pitcher')['outs'].cumsum()
p26['bb9'] = np.where(p26['cum_outs']>0, p26['cum_bb']/p26['cum_outs']*27, np.nan)
p26['side'] = np.where(p26['gs_idx']>=3, np.where(p26['bb9']>4.32,'above','below'), None)
p26['side_pre'] = p26.groupby('pitcher')['side'].shift(1)
side_pre_map = p26.set_index(['pitcher','date'])['side_pre'].to_dict()
sc_pre_map = pl2.set_index(['pitcher','date'])['sc_pre'].to_dict()

g26 = gd[gd['season']==2026].sort_values(['date','game_key'], kind='stable')
prev_game_date = {}
sim=[]
for _, g in g26.iterrows():
    sigs=[]
    for p in [g['home_pitcher'], g['away_pitcher']]:
        if p is None: continue
        t_now = type_at(p, g['date'])
        if t_now not in ('A','C'):
            prev_game_date[p]=g['date']; continue
        pd_prev = prev_game_date.get(p)
        t_prev = type_at(p, pd_prev) if pd_prev else None
        stable = (t_prev == t_now)
        sc = sc_pre_map.get((p, g['date']))
        l1 = side_pre_map.get((p, g['date']))
        sig=None
        if t_now=='C' and stable and sc=='non_worsen' and l1=='below': sig='UNDER'
        elif t_now=='A' and stable and l1=='above': sig='OVER'
        if sig: sigs.append(sig)
        prev_game_date[p]=g['date']
    for p in [g['home_pitcher'], g['away_pitcher']]:
        if p is not None: prev_game_date[p]=g['date']
    if not sigs or len(set(sigs))>1 or g['residual']==0: continue
    win = (g['residual']<0) if sigs[0]=='UNDER' else (g['residual']>0)
    sim.append(dict(date=g['date'], pick=sigs[0], win=bool(win)))
simd = pd.DataFrame(sim)
W=int(simd['win'].sum()); L=len(simd)-W
late = simd[simd['date']>='2026-06-15']
lw=int(late['win'].sum()); ll=len(late)-lw
print(f'백테스트: {W}-{L} ({W/(W+L)*100:.1f}%) | 6/15+: {lw}-{ll}')

ASOF = '9999-12-31'
sc_latest = pl2.sort_values(['pitcher','date'], kind='stable').groupby('pitcher').last()
p26_latest = p26.sort_values(['pitcher','date'], kind='stable').groupby('pitcher').last()
latest_start = pl2.groupby('pitcher')['date'].max().to_dict()
pitchers=[]
for p in sorted(set(pvx['pitcher']) | set(pl2[pl2['season']==2026]['pitcher'])):
    mine = pvx[pvx['pitcher']==p]
    t_now = type_at(p, ASOF)
    last_unop = mine['date'].max() if len(mine) else None
    t_prev = type_at(p, last_unop) if last_unop else None
    stable = (t_now is not None and t_now==t_prev)
    row = sc_latest.loc[p] if p in sc_latest.index else None
    dw = float(row['d_whip_g']) if row is not None and np.isfinite(row['d_whip_g']) else None
    dh = float(row['d_h_ip_g']) if row is not None and np.isfinite(row['d_h_ip_g']) else None
    sc = sc_of(dw if dw is not None else np.nan, dh if dh is not None else np.nan)
    l1row = p26_latest.loc[p] if p in p26_latest.index else None
    l1 = (l1row['side'] if l1row is not None else None)
    sig=None
    if t_now=='C' and stable and sc=='non_worsen' and l1=='below': sig='UNDER'
    elif t_now=='A' and stable and l1=='above': sig='OVER'
    # 유형 연속 판정 횟수: 각 경기 시점 판정 시퀀스 + 현재 판정, 뒤에서부터 동일 유형 카운트
    hist = [type_at(p, d) for d in mine['date'].tolist()] + [t_now]
    streak = 0
    for t in reversed(hist):
        if t is not None and t == t_now: streak += 1
        else: break
    if t_now is None: streak = 0
    pitchers.append(dict(pitcher=p, type=t_now or '?', type_prev=t_prev or '?',
                         stable=bool(stable), sc=sc, l1=l1, signal=sig, n_prior=int(len(mine)),
                         type_streak=int(streak)))
pdx = pd.DataFrame(pitchers)
sig_p = pdx[pdx['signal'].notna()]
print(f'현재 신호 투수: {len(sig_p)}명 → {sorted(sig_p.pitcher.tolist())}')

spot = {}
for name in ['올러','로드리게스','화이트(한)','알칸타라','안우진','이의리','후라도','곽빈','고영표','최민석','류현진']:
    r = pdx[pdx['pitcher']==name]
    if len(r):
        r=r.iloc[0]
        spot[name] = dict(type=r['type'], stable=bool(r['stable']),
                          sc=(r['sc'] if pd.notna(r['sc']) else None),
                          l1=(r['l1'] if pd.notna(r['l1']) else None),
                          signal=(r['signal'] if pd.notna(r['signal']) else None),
                          type_streak=int(r['type_streak']))

fixture = dict(
    pitcher_log = pl[['game_key','date','team','pitcher','outs','hits','bb']].to_dict('records'),
    inning_score = inn.to_dict('records'),
    unop_files = unop_files,
    expected = dict(
        n_games = int(len(gd)),
        data_through = gd['date'].max(),
        sim = dict(picks=int(W+L), wins=W, losses=L, rate=round(W/(W+L)*100,1)),
        sim_since_0615 = dict(picks=int(lw+ll), wins=lw, losses=ll),
        n_signal_pitchers = int(len(sig_p)),
        signal_pitchers = sorted(sig_p['pitcher'].tolist()),
        spot = spot,
    ),
)
out = '/home/claude/work/proj/kbo_fixture.json'
with open(out,'w',encoding='utf-8') as f:
    json.dump(fixture, f, ensure_ascii=False, default=str)
print(f'픽스처 저장: {out} ({os.path.getsize(out)/1e6:.1f}MB)')
print(json.dumps(fixture['expected'], ensure_ascii=False)[:600])
