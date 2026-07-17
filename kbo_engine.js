// ============================================================
// kbo_engine.js — KBO F5 판정 엔진 (순수 계산 · DOM 참조 0)
//
// ★ 모델: v1.0 "L1+L2+L3+안정 멤버십" (인계문서 v71 L-49 사전등록 동결판)
//   구모델(C+SC-2step, 동결 프로파일)은 v71 L-40·L-41 감사로 폐기:
//   · L-40: 동결 프로파일의 소급 적용 = look-ahead → PIT expanding 재분류로 교체
//   · L-41: 검증의 당일 r3 혼입 → 모든 상태변수는 "직전 등판까지"만 사용
//   kbo_profile_frozen.js는 더 이상 판정에 사용하지 않는다 (참고 보존만).
//
// v1.0 판정 규칙 (변경 금지 — 변경 시 v1.x 분리 집계, L-49):
//   UNDER = PIT C형(사전 언옵 N>=5, 25+26 통합 expanding)
//           + 직전 경기 시점에도 C형 (안정 멤버십)
//           + 사전 non_worsen (직전 등판까지의 ΔWHIP·ΔH/IP, 둘다>=1.10이면 worsen)
//           + 사전 L1 below (직전 등판 종료 시점 26시즌 누적 BB9<=4.32, gs>=3)
//   OVER  = PIT A형 + 안정 + 사전 L1 above
//   경기 판정: 신호 충돌 시 PASS · 미검증 선발 포함 시 PASS (L-49 ① 채택)
//   ※ 백테스트(model_health)는 검증 당시 스펙(L-48) 그대로 — ① 미적용 (골든 수치 보존).
//
// ★ 골든 테스트(kbo_engine.test.js + kbo_fixture.json)가 파이썬 참조
//   (kbo_reference_v1.py)와의 일치를 보증. 숫자가 어긋나면 구현 드리프트 — 배포 금지.
//
// 규율 상수 (v71 — 변경 금지):
//   THR=1.10 · C형: mean_allowed<=2.0 & pos_ext<=20 · A형: >=4.0 & >=40
//   BB9_CUTOFF=4.32 (시즌 내 고정, 27시즌 개막 전 재보정 절차는 v71 L-43)
//   손익분기는 픽별 1/배당 (1.76 균일 가정 폐기 — v71 L-45)
// ============================================================

const KBO_ENGINE_MODEL = 'L1+L2+L3+stability v1.0 (v71 L-49)';
const KBO_THR = 1.10;
const KBO_BB9_CUTOFF = 4.32;
const KBO_REF_BREAKEVEN = 56.8;   // 1.76일 때의 참고치일 뿐 — 실제 손익분기는 1/배당

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

// ── 화이트 동명이인 분리 (필수 — 인계문서 L-19) ──
function kboRenameWhite(name, team) {
  if (name !== '화이트') return name;
  return team === 'HANWHA' ? '화이트(한)' : '화이트(S)';
}

// ── games 재구성: 언옵 × 이닝스코어 × 선발 ──
//   ※ game_key는 문자열('20250731-SAMSUNG-HANWHA-1') — 숫자 뺄셈 정렬 금지 (v82 버그 수정)
function kboBuildGames(unop, inn, plRows) {
  const innSorted = [...inn].sort((x, y) => String(x.game_key) < String(y.game_key) ? -1 : 1);
  const innMap = {};
  for (const r of innSorted) {
    const k = `${r.date}|${r.home}|${r.away}`;
    if (!(k in innMap)) innMap[k] = r;   // 더블헤더: game_key 사전순 최소 1행
  }
  const spMap = {};
  for (const p of plRows) {
    spMap[`${p.game_key}|${p.team}`] = kboRenameWhite(p.pitcher, p.team);
  }
  const games = [];
  for (const u of unop) {
    const g = innMap[`${u.date}|${u.home}|${u.away}`];
    if (!g) continue;
    const total5 = g.a5 + g.h5;
    games.push({ game_key: String(g.game_key), date: u.date, season: u.season,
                 home: u.home, away: u.away, line: u.line,
                 home_5: g.h5, away_5: g.a5, total_5: total5, residual: total5 - u.line,
                 home_pitcher: spMap[`${g.game_key}|${u.home}`] || null,
                 away_pitcher: spMap[`${g.game_key}|${u.away}`] || null });
  }
  return games;
}

// ── Layer3: PIT 유형 (L-40 — expanding, 25+26 통합, 사전 N>=5) ──
function kboBuildPitcherGames(games) {
  const byP = {};
  for (const g of games) {
    for (const [pt, allowed] of [[g.home_pitcher, g.away_5], [g.away_pitcher, g.home_5]]) {
      if (!pt) continue;
      (byP[pt] ||= []).push({ date: g.date, allowed, residual: g.residual });
    }
  }
  for (const p of Object.keys(byP)) byP[p].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return byP;
}

function kboTypeAt(pitcherGames, pitcher, asof) {
  const rows = pitcherGames[pitcher];
  if (!rows) return null;
  let n = 0, sum = 0, pos = 0;
  for (const r of rows) {
    if (r.date >= asof) break;
    n++; sum += r.allowed;
    if (r.residual >= 3.0) pos++;
  }
  if (n < 5) return null;
  const ma = sum / n, pe = pos / n * 100;
  if (ma >= 4.0 && pe >= 40.0) return 'A';
  if (ma <= 2.0 && pe <= 20.0) return 'C';
  return 'STD';
}

function kboScOf(dw, dh) {
  if (!Number.isFinite(dw) || !Number.isFinite(dh)) return null;
  return (dw >= KBO_THR && dh >= KBO_THR) ? 'worsen' : 'non_worsen';
}

// ── Layer2: 등판별 delta → sc → sc_pre (직전 등판) ──
function kboPitcherDeltas(plRows) {
  const rows = plRows.map(r => {
    const pitcher = kboRenameWhite(r.pitcher, r.team);
    const date = String(r.date).slice(0, 10);
    const ip = r.outs / 3;
    return { game_key: String(r.game_key), date, team: r.team, pitcher,
             season: +date.slice(0, 4), ip, outs: r.outs, bb: r.bb,
             whip_g: ip > 0 ? (r.hits + r.bb) / ip : NaN,
             h_ip_g: ip > 0 ? r.hits / ip : NaN };
  });
  rows.sort((a, b) => a.pitcher < b.pitcher ? -1 : a.pitcher > b.pitcher ? 1 :
                      a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const byPitcher = {};
  rows.forEach((r, i) => { (byPitcher[r.pitcher] ||= []).push(i); });
  for (const name of Object.keys(byPitcher)) {
    const idxs = byPitcher[name];
    const bySeason = {};
    for (const i of idxs) (bySeason[rows[i].season] ||= []).push(i);
    for (const s of Object.keys(bySeason)) {
      for (const col of ['whip_g', 'h_ip_g']) {
        let sum = 0, n = 0;
        for (const i of bySeason[s]) {
          rows[i][`base_${col}`] = n > 0 ? sum / n : NaN;   // shift(1) expanding (시즌 내)
          const v = rows[i][col];
          if (Number.isFinite(v)) { sum += v; n++; }
        }
      }
    }
    for (const col of ['whip_g', 'h_ip_g']) {
      const win = [];
      for (const i of idxs) {
        win.push(rows[i][col]);
        if (win.length > 3) win.shift();
        const vals = win.filter(Number.isFinite);
        rows[i][`r3_${col}`] = vals.length >= 2 ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
      }
    }
    let prevSc = null;
    for (const i of idxs) {
      for (const col of ['whip_g', 'h_ip_g']) {
        const b = rows[i][`base_${col}`], r3 = rows[i][`r3_${col}`];
        rows[i][`delta_${col}`] = (Number.isFinite(b) && b > 0.1 && Number.isFinite(r3)) ? r3 / b : NaN;
      }
      rows[i].sc = kboScOf(rows[i].delta_whip_g, rows[i].delta_h_ip_g);
      rows[i].sc_pre = prevSc;              // 직전 등판까지의 상태변화 = 경기 전 정보 (L-41)
      prevSc = rows[i].sc;
    }
  }
  return rows;
}

// ── Layer1: 26시즌 누적 BB9 → side(above/below) + side_pre (직전 등판) ──
function kboLayer1Sides(deltaRows) {
  const byPitcher = {};
  deltaRows.forEach((r, i) => { if (r.season === 2026) (byPitcher[r.pitcher] ||= []).push(i); });
  for (const name of Object.keys(byPitcher)) {
    let cumBb = 0, cumOuts = 0, gs = 0, prevSide = null;
    for (const i of byPitcher[name]) {
      gs++; cumBb += deltaRows[i].bb; cumOuts += deltaRows[i].outs;
      const bb9 = cumOuts > 0 ? cumBb / cumOuts * 27 : NaN;
      const side = (gs >= 3 && Number.isFinite(bb9)) ? (bb9 > KBO_BB9_CUTOFF ? 'above' : 'below') : null;
      deltaRows[i].l1_side = side;
      deltaRows[i].l1_side_pre = prevSide;   // 직전 등판 종료 시점 상태 = 경기 전 정보
      prevSide = side;
    }
  }
  return deltaRows;
}

// ── 백테스트: v1.0 전체 스택, 26시즌 개막부터 (L-48 검증 스펙 — ① 미적용) ──
function kboBacktest(games, pitcherGames, deltaRows) {
  const scPre = {}, l1Pre = {};
  for (const r of deltaRows) {
    scPre[`${r.pitcher}|${r.date}`] = r.sc_pre;
    l1Pre[`${r.pitcher}|${r.date}`] = r.l1_side_pre ?? null;
  }
  const g26 = games.filter(g => g.season === 2026)
                   .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 :
                                   a.game_key < b.game_key ? -1 : 1);
  const prevGameDate = {};
  const picks = [];
  for (const g of g26) {
    const sigs = [];
    for (const p of [g.home_pitcher, g.away_pitcher]) {
      if (!p) continue;
      const tNow = kboTypeAt(pitcherGames, p, g.date);
      if (tNow !== 'A' && tNow !== 'C') { prevGameDate[p] = g.date; continue; }
      const pdPrev = prevGameDate[p];
      const tPrev = pdPrev ? kboTypeAt(pitcherGames, p, pdPrev) : null;
      const stable = tPrev === tNow;
      const sc = scPre[`${p}|${g.date}`] ?? null;
      const l1 = l1Pre[`${p}|${g.date}`] ?? null;
      let sig = null;
      if (tNow === 'C' && stable && sc === 'non_worsen' && l1 === 'below') sig = 'UNDER';
      else if (tNow === 'A' && stable && l1 === 'above') sig = 'OVER';
      if (sig) sigs.push(sig);
      prevGameDate[p] = g.date;
    }
    for (const p of [g.home_pitcher, g.away_pitcher]) if (p) prevGameDate[p] = g.date;
    if (!sigs.length || new Set(sigs).size > 1 || g.residual === 0) continue;
    const win = sigs[0] === 'UNDER' ? g.residual < 0 : g.residual > 0;
    picks.push({ date: g.date, pick: sigs[0], win });
  }
  const wins = picks.filter(p => p.win).length;
  const late = picks.filter(p => p.date >= '2026-06-15');
  const lw = late.filter(p => p.win).length;
  const rate = picks.length ? Math.round(wins / picks.length * 1000) / 10 : null;
  return { picks: picks.length, wins, losses: picks.length - wins, rate,
           since_0615: { picks: late.length, wins: lw, losses: late.length - lw } };
}

// ── 라이브 판정: 투수별 현재 신호 ──
function kboLivePitchers(pitcherGames, deltaRows) {
  const latest = {}, latest26 = {};
  for (const r of deltaRows) {
    if (!latest[r.pitcher] || r.date > latest[r.pitcher].date) latest[r.pitcher] = r;
    if (r.season === 2026 && (!latest26[r.pitcher] || r.date > latest26[r.pitcher].date)) latest26[r.pitcher] = r;
  }
  const names = new Set([...Object.keys(pitcherGames), ...Object.keys(latest26)]);
  const out = [];
  for (const p of [...names].sort()) {
    const rows = pitcherGames[p] || [];
    const tNow = kboTypeAt(pitcherGames, p, '9999-12-31');
    const lastUnop = rows.length ? rows[rows.length - 1].date : null;
    const tPrev = lastUnop ? kboTypeAt(pitcherGames, p, lastUnop) : null;
    const stable = tNow != null && tNow === tPrev;
    const lrow = latest[p] || {};
    const dw = lrow.delta_whip_g, dh = lrow.delta_h_ip_g;
    const sc = kboScOf(dw, dh);
    const l1 = (latest26[p] && latest26[p].l1_side) || null;
    let signal = null, reason;
    if (tNow == null) reason = `유형 판정 불가 (사전 언옵 N=${rows.length} < 5) — 미검증 선발`;
    else if (tNow === 'STD') reason = '표준 유형 — 프로토콜 대상 아님';
    else if (!stable) reason = `${tNow}형이나 미안정 (직전 시점 ${tPrev || '?'}) — 안정 멤버십 미충족`;
    else if (tNow === 'C') {
      if (sc == null) reason = 'ΔWHIP/ΔH/IP 계산 불가 (등판 부족)';
      else if (sc === 'worsen') reason = 'C형 안정이나 worsen — 신호 무효';
      else if (l1 !== 'below') reason = `C형+non_worsen이나 L1 ${l1 || '판정불가'} — below 요건 미충족`;
      else { signal = 'UNDER'; reason = 'C형 안정 + non_worsen + below — 언더 신호'; }
    } else { // A
      if (l1 !== 'above') reason = `A형 안정이나 L1 ${l1 || '판정불가'} — above 요건 미충족`;
      else { signal = 'OVER'; reason = 'A형 안정 + above — 오버 신호'; }
    }
    // 유형 연속 판정 횟수: 각 경기 시점 판정 + 현재 판정, 뒤에서부터 동일 유형 카운트
    let typeStreak = 0;
    if (tNow != null) {
      const hist = rows.map(r => kboTypeAt(pitcherGames, p, r.date));
      hist.push(tNow);
      for (let i = hist.length - 1; i >= 0; i--) {
        if (hist[i] != null && hist[i] === tNow) typeStreak++;
        else break;
      }
    }
    out.push({ pitcher: p, team: lrow.team || (latest26[p] && latest26[p].team) || '?',
               type: tNow || '?', type_prev: tPrev || '?', stable: !!stable,
               state_change: sc, l1_side: l1, signal, reason,
               n_prior: rows.length, type_streak: typeStreak,
               delta_whip: Number.isFinite(dw) ? Math.round(dw * 1000) / 1000 : null,
               delta_h_ip: Number.isFinite(dh) ? Math.round(dh * 1000) / 1000 : null,
               last_start: lrow.date || null });
  }
  return out;
}

// ── 경기 판정 (라이브 — v71 L-49 ① 미검증 선발 PASS 적용) ──
function kboJudgeGame(snap, homeName, awayName) {
  const find = n => snap.pitchers.find(p => p.pitcher === (n || '').trim())
                 || snap.pitchers.find(p => (n || '').trim() && p.pitcher.includes((n || '').trim()));
  const hp = find(homeName), ap = find(awayName);
  const sides = [{ role: '홈', name: (homeName||'').trim(), p: hp }, { role: '원정', name: (awayName||'').trim(), p: ap }];
  for (const s of sides) {
    if (!s.p || s.p.type === '?') {
      return { verdict: 'PASS', reason: `미검증 선발(${s.name || '?'}) — v71 L-49 ① 조항. 재량 진행은 감독자 원장으로.`, sides };
    }
  }
  const sigs = sides.filter(s => s.p.signal).map(s => ({ role: s.role, pitcher: s.p.pitcher, signal: s.p.signal }));
  if (!sigs.length) return { verdict: 'PASS', reason: '신호 없음', sides };
  const uniq = new Set(sigs.map(s => s.signal));
  if (uniq.size > 1) return { verdict: 'PASS', reason: '신호 충돌 (언더·오버 동시)', sides, signals: sigs };
  return { verdict: sigs[0].signal,
           reason: sigs.map(s => `${s.pitcher}(${s.role})`).join(' + ') + ' 신호',
           sides, signals: sigs };
}

// ── 스냅샷 생성 (스키마 계약 v2 — kbo_f5.js와 공유) ──
function kboBuildSnapshotFromDb(input) {
  // input: { pitcher_log, inning_score, unop_files, generated_at?, traj?, profile_csv? }
  //   traj·profile_csv는 v2에서 미사용 (구버전 인자 호환만)
  const unop = kboParseUnopFiles(input.unop_files);
  const games = kboBuildGames(unop, input.inning_score, input.pitcher_log);
  const pitcherGames = kboBuildPitcherGames(games);
  let deltas = kboPitcherDeltas(input.pitcher_log);
  deltas = kboLayer1Sides(deltas);
  const bt = kboBacktest(games, pitcherGames, deltas);
  const pitchers = kboLivePitchers(pitcherGames, deltas);
  const dataThrough = games.reduce((mx, g) => g.date > mx ? g.date : mx, '');
  const logThrough = deltas.reduce((mx, r) => r.date > mx ? r.date : mx, '');
  return {
    schema_version: 2, model_version: KBO_ENGINE_MODEL,
    generated_at: input.generated_at || new Date().toISOString().slice(0, 16).replace('T', ' '),
    data_through: dataThrough, log_through: logThrough,
    thr: KBO_THR, bb9_cutoff: KBO_BB9_CUTOFF, ref_breakeven_pct: KBO_REF_BREAKEVEN,
    model_health: {
      sim_picks: bt.picks, sim_wins: bt.wins, sim_losses: bt.losses, sim_rate: bt.rate,
      sim_0615_picks: bt.since_0615.picks, sim_0615_wins: bt.since_0615.wins, sim_0615_losses: bt.since_0615.losses,
    },
    limits: [
      '후보군 생성기이지 확정 신호가 아님 (L-36)',
      '손익분기는 픽별 1/배당 — 1.76 균일 가정 금지 (v71 L-45)',
      '공식 판독은 시즌 종료 시 1회 (v71 L-49) — 중간 수치로 규칙 변경 금지',
      '미검증 선발 포함 경기는 시스템 PASS · 재량은 감독자 원장 (v71 L-49 ①/L-52)',
    ],
    n_games: games.length,
    pitchers,
  };
}

if (typeof window !== 'undefined') {
  window.kboBuildSnapshotFromDb = kboBuildSnapshotFromDb;
  window.kboParseUnopFiles = kboParseUnopFiles;
  window.kboJudgeGame = kboJudgeGame;
}
