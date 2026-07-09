// ============================================================
// 전략베팅 — 계산 엔진 (배당 산출·배분·몬테카를로·실측 결합)
//   순수/준순수 계산. simMonteCarloPath 등 핵심은 DOM 참조 0.
// ============================================================


function simGetAutoOdds(which) {
  const host = document.getElementById(`sim-judge-${which}`);
  if (!host) return 0;
  const odds = Array.from(host.querySelectorAll('.sim-fold-odds'))
    .map(i => parseFloat(i.value) || 0)
    .filter(o => o >= 1.01);
  if (!odds.length) return 0;
  if (odds.length === 1) return odds[0];
  const prod = odds.reduce((p, o) => p * o, 1);
  return (typeof betmanRound === 'function') ? betmanRound(prod) : Math.round(prod * 100) / 100;
}


function simGetOdds(which) {
  const ov = simOddsOverride[which];
  if (typeof ov === 'number' && ov >= 1.01) return ov; // 수동 수정값 우선
  return simGetAutoOdds(which);
}


function simCalcExcess(bet, odds) {
  if (odds <= 2.0) return 0;
  return Math.round(bet * (odds - 2.0));
}


function simGetPlan(bal) {
  if (bal >= 2360000) return { tag:'목표 달성 구간', body:'세이브 50% 이상 + A(안전 1.5~2.2배) 메인 + B(도전 2.3~2.8배) + C(모험 3배~) 소액. 세이브 100만원이 찍히는 순간 목표 달성!' };
  if (bal >= 1310000) return { tag:'10회차 플랜', body:'세이브 136만 + A(안전) 50만 + B(도전) 35만 + C(모험) 15만 — 세이브 100만 달성!' };
  if (bal >= 810000)  return { tag:'9회차 플랜', body:'세이브 70만 + A(안전×2) 30만 + B(도전×2~3) 20만 + C(모험×3~4) 11만' };
  if (bal >= 410000)  return { tag:'8회차 플랜', body:'세이브 41만 + A(x2) 30만 + B(x3) 10만 — 131만원 목표!' };
  if (bal >= 210000)  return { tag:'7회차 플랜', body:'세이브 11만 + A(x2) 20만 + B(x3) 10만' };
  if (bal >= 120000)  return { tag:'6회차 플랜', body:'세이브 6만 + B(x3) 5만 + A(x2) 10만' };
  if (bal >= 70000)   return { tag:'5회차 플랜', body:'세이브 3만 + A(x2) 9만' };
  if (bal >= 40000)   return { tag:'4회차 플랜', body:'세이브 2만 + A(x2) 5만' };
  if (bal >= 20000)   return { tag:'3회차 플랜', body:'세이브 1만 + A(x2) 3만' };
  return null;
}


function simGetHint(bal) {
  if (bal < 40000) return null;
  let sv, b2, b3, b4, zone;

  // 세이브 100만원 달성 이후 — 보수적 비율 (세이브 50 / A 30 / B 15 / C 5)
  if (simState.goalReached) {
    zone = '달성 후 운용';
    sv = Math.round(bal * 0.50 / 10000) * 10000;
    b2 = Math.round(bal * 0.30 / 10000) * 10000;
    b3 = Math.round(bal * 0.15 / 10000) * 10000;
    b4 = Math.max(0, bal - sv - b2 - b3);
    return { zone, sv, b2, b3, b4 };
  }

  if (bal >= 500000) {
    zone='목표 근접'; sv=Math.round(bal*0.50/10000)*10000; b2=Math.round(bal*0.38/10000)*10000; b3=Math.max(0,bal-sv-b2); b4=0;
  } else if (bal >= 210000) {
    zone='분산 베팅'; sv=Math.round(bal*0.28/10000)*10000; b2=Math.round(bal*0.50/10000)*10000; b3=Math.max(0,bal-sv-b2); b4=0;
  } else {
    zone='초반'; sv=Math.round(bal*0.28/10000)*10000; b2=bal-sv; b3=0; b4=0;
  }
  return { zone, sv, b2, b3, b4 };
}


// ============================================================
// 몬테카를로 도달/파산 시뮬레이터 (순수 함수 · DOM 참조 0)
//   로드맵(배분)이 실측 레그 적중률로 목표에 실제 도달/파산할 확률을 계산.
//   "길은 사용자가 그렸고, 그 길이 진짜 닿는지를 본인 데이터로 검증한다."
//
//   회차 머니 모델(앱 simApplyPending과 동일):
//     next_bal = 세이브(sv) + Σ round(betᵢ.amount × betᵢ.odds)   (당첨 갈래만)
//     파산 = 잔액이 최소단위(minUnit) 미만
//
//   인자:
//     startBal    시작 잔액
//     goal        목표 금액
//     legWinRates 배당대별 실측 적중률 맵 { '1.5~2': 0.59, ... } (0~1)
//     allocFn(bal) → { sv, bets:[{amount, odds}] }  잔액→이번 회차 배분
//     maxRounds   최대 회차 (미달 판정 상한)
//     trials      시행 횟수
//     minUnit     최소 베팅단위(파산 기준, 기본 10000)
//     rng         난수 [0,1) (테스트 주입용, 기본 Math.random)
//     oddsBandFn  배당→배당대 (기본 _oddsBand, 없으면 내장)
//     fallbackRate(odds) 실측 없는 배당대의 폴백 승률 (기본 암시확률 1/odds)
//
//   반환: { reachProb, bustProb, missProb, medianRounds, p10Rounds, p90Rounds, trials }
//         medianRounds/p10/p90 = 도달 성공한 시행의 목표 도달 회차 분포 (없으면 null)
// ============================================================
function _simBandBuiltin(o) {
  return o < 1.5 ? '1.5 미만' : o < 2 ? '1.5~2' : o < 3 ? '2~3' : '3 이상';
}


function simMonteCarloPath(opts) {
  const o = opts || {};
  const startBal = +o.startBal || 0;
  const goal     = +o.goal || 0;
  const legWinRates = o.legWinRates || {};
  const allocFn  = typeof o.allocFn === 'function' ? o.allocFn : null;
  const maxRounds = Number.isFinite(o.maxRounds) ? o.maxRounds : 40;
  const trials    = Number.isFinite(o.trials) ? o.trials : 3000;
  const minUnit   = Number.isFinite(o.minUnit) ? o.minUnit : 10000;
  const rng       = typeof o.rng === 'function' ? o.rng : Math.random;
  const bandFn    = typeof o.oddsBandFn === 'function' ? o.oddsBandFn
                  : (typeof _oddsBand === 'function' ? _oddsBand : _simBandBuiltin);
  const fallbackRate = typeof o.fallbackRate === 'function'
                  ? o.fallbackRate
                  : (odds) => Math.min(0.98, Math.max(0.01, 1 / (odds > 1 ? odds : 1.01)));

  if (!allocFn || !(goal > 0) || !(startBal >= 0)) {
    return { reachProb: 0, bustProb: 0, missProb: 1, medianRounds: null, p10Rounds: null, p90Rounds: null, trials: 0 };
  }

  const rateFor = (odds) => {
    const band = bandFn(odds);
    const r = legWinRates[band];
    return (typeof r === 'number' && r >= 0 && r <= 1) ? r : fallbackRate(odds);
  };

  let reach = 0, bust = 0, miss = 0;
  const reachRounds = [];

  for (let t = 0; t < trials; t++) {
    let bal = startBal;
    let r = 0;
    let done = null; // 'reach' | 'bust' | 'miss'

    while (r < maxRounds) {
      if (bal >= goal) { done = 'reach'; break; }
      const alloc = allocFn(bal) || {};
      const sv = Math.max(0, +alloc.sv || 0);
      const bets = Array.isArray(alloc.bets)
        ? alloc.bets.filter(b => b && +b.amount > 0 && +b.odds > 1)
        : [];
      const stake = bets.reduce((s, b) => s + (+b.amount), 0);

      if (stake <= 0) {
        // 베팅 불가(전부 세이브/0) → 더 못 나아감. 세이브가 목표면 도달, 아니면 미달.
        done = (sv >= goal || bal >= goal) ? 'reach' : 'miss';
        break;
      }

      r++;
      let next = sv;
      for (const b of bets) {
        if (rng() < rateFor(+b.odds)) next += Math.round((+b.amount) * (+b.odds));
      }
      bal = next;

      if (bal >= goal) { done = 'reach'; break; }
      if (bal < minUnit) { done = 'bust'; break; }
    }
    if (done === null) done = (bal >= goal) ? 'reach' : 'miss'; // maxRounds 소진

    if (done === 'reach') { reach++; reachRounds.push(r); }
    else if (done === 'bust') bust++;
    else miss++;
  }

  reachRounds.sort((a, b) => a - b);
  const pct = (arr, q) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(q * (arr.length - 1)))] : null;

  return {
    reachProb: reach / trials,
    bustProb:  bust / trials,
    missProb:  miss / trials,
    medianRounds: pct(reachRounds, 0.5),
    p10Rounds:    pct(reachRounds, 0.1),
    p90Rounds:    pct(reachRounds, 0.9),
    trials,
  };
}


// ── 배분 팩토리 (allocFn 생성기) ────────────────────────────
// 로드맵 제안 배분: simGetHint 재사용 (배분 비율 복제 금지) + 배당 부여
function simMakeRoadmapAlloc(odds) {
  const od = odds || {};
  return (bal) => {
    const h = simGetHint(bal);
    if (!h) {
      // bal < 40000: 초반 규칙 연장 (세이브 28% + A 나머지)
      const sv = Math.round(bal * 0.28 / 10000) * 10000;
      const amt = bal - sv;
      return { sv, bets: amt > 0 ? [{ amount: amt, odds: od.o2 || 2 }] : [] };
    }
    const bets = [];
    if (h.b2 > 0) bets.push({ amount: h.b2, odds: od.o2 || 2 });
    if (h.b3 > 0) bets.push({ amount: h.b3, odds: od.o3 || 3 });
    if (h.b4 > 0) bets.push({ amount: h.b4, odds: od.o4 || 4 });
    return { sv: h.sv, bets };
  };
}


// 사용자 입력 배분: 현재 sv/b2/b3/b4 비율을 잔액에 스케일 (같은 성향 투영)
function simMakeInputAlloc(cur) {
  const c = cur || {};
  const base = (+c.sv || 0) + (+c.b2 || 0) + (+c.b3 || 0) + (+c.b4 || 0);
  return (bal) => {
    const k = base > 0 ? bal / base : 0;
    const r = v => Math.round((+v || 0) * k / 10000) * 10000;
    const bets = [];
    if (c.b2 > 0) bets.push({ amount: r(c.b2), odds: c.o2 || 2 });
    if (c.b3 > 0) bets.push({ amount: r(c.b3), odds: c.o3 || 3 });
    if (c.b4 > 0) bets.push({ amount: r(c.b4), odds: c.o4 || 4 });
    return { sv: r(c.sv), bets };
  };
}


// 세이브 방파제 체인: 잔액 대부분 세이브 + 남은 실탄 한 방 (잃을수록 판돈 축소)
//   [확정 규칙] 최소 베팅단위 100원(배트맨) · 실탄이 100원 단위 내림으로 0이 되면 그 회차 종료.
function simMakeBreakwaterAlloc(o) {
  const cfg = o || {};
  const saveRatio = Number.isFinite(cfg.saveRatio) ? cfg.saveRatio : 0.55;
  const odds = cfg.odds || 3;
  const unit = Number.isFinite(cfg.unit) ? cfg.unit : 100; // 배트맨 최소 단위
  return (bal) => {
    // 남은 실탄 = 잔액 − 세이브. float 오차 방지 위해 세이브를 원 단위로 반올림 후 차감,
    // 그 실탄을 100원 단위 내림. 나머지는 전부 세이브(방파제).
    const betRaw = bal - Math.round(bal * saveRatio);
    let stake = Math.floor(betRaw / unit) * unit;
    if (!(stake > 0)) stake = 0;
    const sv = bal - stake;
    return { sv, bets: stake > 0 ? [{ amount: stake, odds }] : [] }; // 실탄 0 → 종료
  };
}


// 목표 역산: 목표금액 ÷ 베팅액 = 필요 배당
function simRequiredOdds(target, stake) {
  if (!(stake > 0)) return null;
  return target / stake;
}


// ── Step 3 (선택): 세이브 비율 최적화 제안 (순수) ────────────────
// 세이브 40~60% 그리드를 돌려 도달확률 최대 지점 탐색. 어디까지나 제안(원칙1).
function simSuggestSaveRatio(o) {
  const opt = o || {};
  const startBal = opt.startBal, goal = opt.goal;
  const legWinRates = opt.legWinRates || {};
  const fallbackRate = opt.fallbackRate;
  const oddsBandFn = opt.oddsBandFn;
  const odds = opt.odds || { o2: 2 };
  const betWeights = Array.isArray(opt.betWeights) && opt.betWeights.some(w => w > 0) ? opt.betWeights : [1, 0, 0];
  const grid = opt.grid || [0.40, 0.45, 0.50, 0.55, 0.60];
  const trials = Number.isFinite(opt.trials) ? opt.trials : 600;
  const rng = opt.rng;
  const wsum = betWeights.reduce((s, w) => s + Math.max(0, w), 0) || 1;
  const od = [odds.o2, odds.o3, odds.o4];

  let best = null;
  for (const sr of grid) {
    const allocFn = (bal) => {
      const sv = Math.round(bal * sr / 10000) * 10000;
      const rest = bal - sv;
      const bets = [];
      betWeights.forEach((w, i) => {
        if (w > 0 && od[i] > 1) {
          const amt = Math.round(rest * (w / wsum) / 10000) * 10000;
          if (amt > 0) bets.push({ amount: amt, odds: od[i] });
        }
      });
      if (!bets.length && rest > 0) bets.push({ amount: rest, odds: od[0] || 2 });
      return { sv, bets };
    };
    const r = simMonteCarloPath({ startBal, goal, legWinRates, fallbackRate, oddsBandFn, allocFn, trials, rng });
    if (!best || r.reachProb > best.reachProb) best = { ratio: sr, reachProb: r.reachProb, bustProb: r.bustProb };
  }
  return best;
}


// ── Step 2: 도달/파산 확률 거울 (실시간, DOM 계층) ──────────────
// 현재 입력 배분 읽기
function simReadAlloc() {
  return {
    sv: parseInt(document.getElementById('sim-i-sv')?.value) || 0,
    b2: parseInt(document.getElementById('sim-i-b2')?.value) || 0,
    b3: parseInt(document.getElementById('sim-i-b3')?.value) || 0,
    b4: parseInt(document.getElementById('sim-i-b4')?.value) || 0,
    o2: simGetOdds('a'), o3: simGetOdds('b'), o4: simGetOdds('c'),
    bal: simState.balance,
  };
}


// computeLegStats(stats.js) 재사용 → 배당대별 실측률(n>=5) + 예측 폴백 맵
function simBuildLegRates() {
  const rates = {}, pred = {}, meta = {};
  const order = ['1.5 미만', '1.5~2', '2~3', '3 이상'];
  if (typeof computeLegStats === 'function') {
    const { bands } = computeLegStats();
    order.forEach(k => {
      const d = bands[k];
      if (!d) { meta[k] = { n: 0, real: false }; return; }
      meta[k] = { n: d.n, w: d.w, real: d.n >= 5 };
      if (d.n >= 5) rates[k] = d.w / d.n;              // 실측 (표본 충분)
      if (d.pn > 0) pred[k] = (d.ps / d.pn) / 100;     // 예측 평균 (폴백)
    });
  }
  return { rates, pred, meta };
}


// 갈래별 폴더 수 (1~6폴 라디오, 미선택=0)
function simBranchFolderCount(which) {
  for (let n = 6; n >= 1; n--) {
    if (document.getElementById(`sim-f-${which}${n}`)?.checked) return n;
  }
  return 0;
}
