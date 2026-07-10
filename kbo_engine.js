// ============================================================
// kbo_engine.js — KBO F5 판정 엔진 (순수 계산 · DOM 참조 0)
//
// 파이썬 kbo_refresh.py의 계산을 1:1 재현한 운영 구현.
// ★ 이 파일이 "운영 모델"의 단일 구현이다 (v76 결정):
//   사용자가 kbo.db를 이미 직접 크롤링해 보유 → 앱이 db를 직접 읽고
//   여기서 판정까지 계산한다. 파이썬은 크롤링·연구 탐색 담당.
//   연구에서 모델이 바뀌면 이 파일 "한 곳"만 갱신한다.
// ★ 골든 테스트(kbo_engine.test.js)가 파이썬 v5 수치와의 일치를 보증:
//   C형 언더 62.1% · non_worsen 67.6% · d 0.501 · p 0.000963 · 후보 16명.
//   숫자가 어긋나면 구현 드리프트 — 배포 금지.
//
// 규율 상수 (인계문서 — 변경 금지):
//   THR=1.10 (L-32 주의4) · C형: mean_allowed<=2.0 & pos_ext<=20 (FROZEN)
// ============================================================

const KBO_ENGINE_MODEL = 'C+SC-2step v1 (L-36/L-37)';
const KBO_THR = 1.10;
const KBO_BREAKEVEN = 56.8;

const KBO_TEAM_MAP = { 'LG':'LG','SSG':'SSG','삼성':'SAMSUNG','KIA':'KIA','키움':'KIWOOM',
                       'KT':'KT','두산':'DOOSAN','롯데':'LOTTE','NC':'NC','한화':'HANWHA' };

// ── 언옵 파싱 (파일명이 '25'로 시작하면 2025, 아니면 2026) ──
function kboParseUnop(text, season) {
  const rows = [];
  for (let line of text.split('\n')) {
    line = line.trim();
    if (!line || line.includes('우천취소')) continue;
    const parts = line.replace(/ vs /g, ' ').split(/\s+/);
    if (parts.length < 4) continue;
    const lv = parseFloat(parts[3]);
    if (!Number.isFinite(lv)) continue;
    const m = parts[0].match(/^(\d+)\.(\d+)/);
    if (!m) continue;
    const h = KBO_TEAM_MAP[parts[1]], a = KBO_TEAM_MAP[parts[2]];
    if (!h || !a) continue;
    rows.push({ date: `${season}-${String(+m[1]).padStart(2,'0')}-${String(+m[2]).padStart(2,'0')}`,
                home: h, away: a, line: lv, season });
  }
  return rows;
}

function kboParseUnopFiles(files /* {filename: text} */) {
  const all = [];
  for (const name of Object.keys(files).sort()) {
    const season = name.startsWith('25') ? 2025 : 2026;
    all.push(...kboParseUnop(files[name], season));
  }
  const seen = new Set(), out = [];
  for (const r of all) {
    const k = `${r.date}|${r.home}|${r.away}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push(r);
  }
  return out;
}

// ── 프로파일 CSV 파싱 + 유형 분류 (FROZEN 기준) ──
function kboParseProfile(csvText) {
  const lines = csvText.trim().split('\n');
  const head = lines[0].split(',').map(s => s.trim());
  const idx = {}; head.forEach((h, i) => idx[h] = i);
  const rows = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const c = line.split(',');
    rows.push({ pitcher: c[idx['pitcher']].trim(),
                mean_allowed: parseFloat(c[idx['mean_allowed']]),
                pos_ext_pct: parseFloat(c[idx['pos_ext_pct']]),
                rank_gap: parseFloat(c[idx['rank_gap']]) });
  }
  return rows;
}

function kboClassifyType(r) {
  if (r.mean_allowed >= 4.0 && r.pos_ext_pct >= 40.0) return 'A';
  if (r.mean_allowed <= 2.0 && r.pos_ext_pct <= 20.0) return 'C';
  if (r.rank_gap >= 15) return 'B';
  if (r.rank_gap <= -15) return 'D';
  return '표준';
}

function kboTypeMap(profileRows) {
  const m = {};
  for (const r of profileRows) m[r.pitcher] = kboClassifyType(r);
  return m;
}

// ── 화이트 동명이인 분리 (필수 — 인계문서 L-19) ──
function kboRenameWhite(name, team) {
  if (name !== '화이트') return name;
  return team === 'HANWHA' ? '화이트(한)' : '화이트(S)';
}

// ── games 재구성: 언옵 × 이닝스코어 × 선발 (game_key 기반) ──
//   inn: [{game_key,date,away,home,a5,h5}] / pl: [{game_key,date,team,pitcher}]
function kboBuildGames(unop, inn, plRows, typeMap) {
  // 더블헤더: date+home+away 중복 시 game_key 최소값 1행만
  const innSorted = [...inn].sort((x, y) => x.game_key - y.game_key);
  const innMap = {};
  for (const r of innSorted) {
    const k = `${r.date}|${r.home}|${r.away}`;
    if (!(k in innMap)) innMap[k] = r;
  }
  // 선발: (game_key, team) → pitcher
  const spMap = {};
  for (const p of plRows) {
    const nm = kboRenameWhite(p.pitcher, p.team);
    spMap[`${p.game_key}|${p.team}`] = nm;
  }
  const games = [];
  for (const u of unop) {
    const g = innMap[`${u.date}|${u.home}|${u.away}`];
    if (!g) continue;                                  // DB에 없는 경기 — 제외
    const total5 = g.a5 + g.h5;
    const hp = spMap[`${g.game_key}|${u.home}`] || null;
    const ap = spMap[`${g.game_key}|${u.away}`] || null;
    games.push({ game_key: g.game_key, date: u.date, season: u.season,
                 home: u.home, away: u.away, line: u.line,
                 home_5: g.h5, away_5: g.a5, total_5: total5,
                 residual: total5 - u.line,
                 home_pitcher: hp, away_pitcher: ap,
                 home_type: (hp && typeMap[hp]) || '?', away_type: (ap && typeMap[ap]) || '?' });
  }
  return games;
}

// ── 투수 지표: 경기단위 WHIP·H/IP → baseline(시즌내 expanding shift1) → r3 → delta ──
//   plRows: [{game_key,date,team,pitcher,outs,hits,bb}] (name,date 정렬 가정 · stable)
function kboPitcherDeltas(plRows) {
  const rows = plRows.map(r => {
    const pitcher = kboRenameWhite(r.pitcher, r.team);
    const date = r.date.slice(0, 10);
    const ip = r.outs / 3;
    return { game_key: r.game_key, date, team: r.team, pitcher,
             season: +date.slice(0, 4), ip,
             whip_g: ip > 0 ? (r.hits + r.bb) / ip : NaN,
             h_ip_g: ip > 0 ? r.hits / ip : NaN };
  });
  rows.sort((a, b) => a.pitcher < b.pitcher ? -1 : a.pitcher > b.pitcher ? 1 :
                      a.date < b.date ? -1 : a.date > b.date ? 1 : 0); // stable
  // 그룹 순회
  const byPitcher = {};
  rows.forEach((r, i) => { (byPitcher[r.pitcher] ||= []).push(i); });
  for (const name of Object.keys(byPitcher)) {
    const idxs = byPitcher[name];
    // baseline: (pitcher, season) 내 expanding mean shift(1) — NaN은 pandas처럼 스킵 누적
    const bySeason = {};
    for (const i of idxs) (bySeason[rows[i].season] ||= []).push(i);
    for (const s of Object.keys(bySeason)) {
      for (const col of ['whip_g', 'h_ip_g']) {
        let sum = 0, n = 0;
        for (const i of bySeason[s]) {
          rows[i][`base_${col}`] = n > 0 ? sum / n : NaN;   // shift(1): 직전까지 평균
          const v = rows[i][col];
          if (Number.isFinite(v)) { sum += v; n++; }
        }
      }
    }
    // r3: pitcher 전체(시즌 경계 무시) rolling(3, min_periods=2), NaN 스킵(pandas rolling 기본)
    for (const col of ['whip_g', 'h_ip_g']) {
      const win = [];
      for (const i of idxs) {
        win.push(rows[i][col]);
        if (win.length > 3) win.shift();
        const vals = win.filter(Number.isFinite);
        rows[i][`r3_${col}`] = vals.length >= 2 ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
      }
    }
    for (const i of idxs) {
      for (const col of ['whip_g', 'h_ip_g']) {
        const b = rows[i][`base_${col}`], r3 = rows[i][`r3_${col}`];
        rows[i][`delta_${col}`] = (Number.isFinite(b) && b > 0.1 && Number.isFinite(r3)) ? r3 / b : NaN;
      }
    }
  }
  return rows;
}

// ── 통계 헬퍼: 스튜던트 t 2-표본(등분산) p값 · Cohen's d ──
function kboLnGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
function kboBetacf(a, b, x) {
  const MAXIT = 200, EPS = 3e-14, FPMIN = 1e-300;
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d; let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
function kboIncBeta(a, b, x) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(kboLnGamma(a + b) - kboLnGamma(a) - kboLnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * kboBetacf(a, b, x) / a : 1 - bt * kboBetacf(b, a, 1 - x) / b;
}
function kboTTestInd(x, y) {
  const n1 = x.length, n2 = y.length;
  const m1 = x.reduce((a, b) => a + b, 0) / n1, m2 = y.reduce((a, b) => a + b, 0) / n2;
  const v1 = x.reduce((s, v) => s + (v - m1) ** 2, 0) / (n1 - 1);
  const v2 = y.reduce((s, v) => s + (v - m2) ** 2, 0) / (n2 - 1);
  const df = n1 + n2 - 2;
  const sp = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / df);
  const t = (m1 - m2) / (sp * Math.sqrt(1 / n1 + 1 / n2));
  const p = kboIncBeta(df / 2, 0.5, df / (df + t * t));   // 2-sided
  const d = (m1 - m2) / sp;                                // Cohen's d (pooled)
  return { t, p, d };
}
const kboRound = (v, k) => Math.round(v * 10 ** k) / 10 ** k;

// ── Layer 전수 지표 (L-39) ──
function kboLayerMetrics(games, deltaRows, typeMap) {
  const dMap = {};   // (game_key|pitcher) → {dw,dh,state}
  for (const r of deltaRows)
    dMap[`${r.game_key}|${r.pitcher}`] = { dw: r.delta_whip_g, dh: r.delta_h_ip_g, state: r.state ?? null };
  const pv = [];
  for (const g of games) {
    for (const [pt, tp] of [[g.home_pitcher, g.home_type], [g.away_pitcher, g.away_type]]) {
      const d = (pt && dMap[`${g.game_key}|${pt}`]) || {};
      pv.push({ date: g.date, residual: g.residual, ptype: tp,
                dw: d.dw, dh: d.dh, state: d.state });
    }
  }
  const m = {};
  for (const t of ['A', 'C']) {
    const sub = pv.filter(r => r.ptype === t && Number.isFinite(r.residual));
    m[`${t}_n`] = sub.length;
    m[`${t}_over`] = kboRound(sub.filter(r => r.residual > 0).length / sub.length * 100, 1);
    m[`${t}_under`] = kboRound(sub.filter(r => r.residual < 0).length / sub.length * 100, 1);
    m[`${t}_res`] = kboRound(sub.reduce((s, r) => s + r.residual, 0) / sub.length, 3);
  }
  const cs = pv.filter(r => r.ptype === 'C' && r.state);
  m.below_pct = cs.length ? kboRound(cs.filter(r => r.state === 'below').length / cs.length * 100, 1) : null;
  const cb = pv.filter(r => r.ptype === 'C' && Number.isFinite(r.dw) && Number.isFinite(r.dh) && Number.isFinite(r.residual))
               .map(r => ({ ...r, tag: (r.dw >= KBO_THR && r.dh >= KBO_THR) ? 'worsen' : 'non_worsen' }));
  for (const tag of ['worsen', 'non_worsen']) {
    const sub = cb.filter(r => r.tag === tag);
    m[`${tag}_n`] = sub.length;
    m[`${tag}_under`] = kboRound(sub.filter(r => r.residual < 0).length / sub.length * 100, 1);
    m[`${tag}_res`] = kboRound(sub.reduce((s, r) => s + r.residual, 0) / sub.length, 3);
  }
  const w = cb.filter(r => r.tag === 'worsen').map(r => r.residual);
  const nw = cb.filter(r => r.tag === 'non_worsen').map(r => r.residual);
  const tt = kboTTestInd(w, nw);
  m.ttest_p = kboRound(tt.p, 6);
  m.cohens_d = kboRound(tt.d, 3);
  return m;
}

// ── 스냅샷 생성 (스키마 계약 v1 — kbo_f5.js와 공유) ──
function kboBuildSnapshotFromDb(input) {
  // input: { pitcher_log, inning_score, traj, profile_csv, unop_files, generated_at? }
  const prof = kboParseProfile(input.profile_csv);
  const typeMap = kboTypeMap(prof);
  const unop = kboParseUnopFiles(input.unop_files);
  const games = kboBuildGames(unop, input.inning_score, input.pitcher_log, typeMap);
  let deltas = kboPitcherDeltas(input.pitcher_log);
  // Layer1 state 조인: (pitcher,date) — ledger 유일 가정, 마지막 승
  const tMap = {};
  for (const t of input.traj) tMap[`${t.pitcher}|${t.date.slice(0, 10)}`] = t.side;
  deltas = deltas.map(r => ({ ...r, state: tMap[`${r.pitcher}|${r.date}`] ?? null }));

  const metrics = kboLayerMetrics(games, deltas, typeMap);
  const dataThrough = games.reduce((mx, g) => g.date > mx ? g.date : mx, '');

  // 투수별 최신 등판 판정
  const latest = {};
  for (const r of deltas) if (!latest[r.pitcher] || r.date > latest[r.pitcher].date) latest[r.pitcher] = r;
  const pitchers = Object.values(latest).map(r => {
    const ptype = typeMap[r.pitcher] || '?';
    const dw = r.delta_whip_g, dh = r.delta_h_ip_g;
    let sc = null, cand = false, reason;
    if (ptype === '?') reason = '프로필 없음(N<5) — 판정 불가';
    else if (ptype !== 'C') reason = `${ptype}형 — 프로토콜 대상 아님`;
    else if (!Number.isFinite(dw) || !Number.isFinite(dh)) reason = 'baseline 계산불가(시즌 초반/등판 부족)';
    else if (dw >= KBO_THR && dh >= KBO_THR) { sc = 'worsen'; reason = '언더 신호 무효화 (베팅 금지 영역)'; }
    else { sc = 'non_worsen'; cand = true; reason = '언더 후보군 (후보일 뿐, 최종판단 별도)'; }
    return { pitcher: r.pitcher, team: r.team, type: ptype, state_change: sc, candidate: cand, reason,
             delta_whip: Number.isFinite(dw) ? kboRound(dw, 3) : null,
             delta_h_ip: Number.isFinite(dh) ? kboRound(dh, 3) : null,
             last_start: r.date };
  }).sort((a, b) => a.pitcher < b.pitcher ? -1 : 1);

  return {
    schema_version: 1, model_version: KBO_ENGINE_MODEL,
    generated_at: input.generated_at || new Date().toISOString().slice(0, 16).replace('T', ' '),
    data_through: dataThrough, thr: KBO_THR, breakeven_pct: KBO_BREAKEVEN,
    model_health: { C_n: metrics.C_n, C_under: metrics.C_under, C_res: metrics.C_res,
                    non_worsen_n: metrics.non_worsen_n, non_worsen_under: metrics.non_worsen_under, non_worsen_res: metrics.non_worsen_res,
                    worsen_n: metrics.worsen_n, worsen_under: metrics.worsen_under, worsen_res: metrics.worsen_res,
                    ttest_p: metrics.ttest_p, cohens_d: metrics.cohens_d, below_pct: metrics.below_pct,
                    weaken_streak: 0 /* kbo_f5의 회귀로그가 채움 */ },
    limits: ['후보군 생성기이지 베팅 신호가 아님 (L-36)', 'A·B·D형은 대상 아님', '시즌 초반 투수 판정 불가'],
    n_games: games.length,
    pitchers,
  };
}

if (typeof window !== 'undefined') {
  window.kboBuildSnapshotFromDb = kboBuildSnapshotFromDb;
  window.kboParseUnopFiles = kboParseUnopFiles;
}
