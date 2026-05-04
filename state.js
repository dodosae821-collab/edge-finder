
// ── 의존성 순서 검증 ─────────────────────────────────────────
// round.js, scope.js가 state.js 이전에 로드되지 않으면 즉시 감지
console.assert(typeof getActiveRound  === 'function', '[state.js] round.js not loaded — check script order');
console.assert(typeof getCurrentScope === 'function', '[state.js] scope.js not loaded — check script order');

// 차트 생성 헬퍼 - 숨겨진 캔버스에 그리지 않음
function safeCreateChart(canvasId, config) {
  const el = document.getElementById(canvasId);
  if (!el) return null;
  if (el.offsetWidth === 0 && el.offsetHeight === 0) return null;
  // 기존 차트 파괴
  const existing = Chart.getChart(el);
  if (existing) existing.destroy();
  return new Chart(el, config);
}
// ========== STATE ==========

// ── STORAGE KEY (단일 정의 — 전 파일 공유 금지, window.App.STORAGE_KEY 사용) ──
const STORAGE_KEY = 'edge_bets';
const CURRENT_SCHEMA_VERSION = 2;

// ── 내부 캐시 (최초 1회 파싱, 이후 메모리 참조) ────────────
let _state = null;

// ── 스키마 migration ────────────────────────────────────────
function _migrateV1toV2(state) {
  // v1 → v2: 모든 bet에 projectId 기본값 보정
  return {
    ...state,
    bets: (state.bets || []).map(b => ({
      projectId: 'default',
      ...b,
    })),
  };
}

function _migrate(state) {
  let s = { ...state };
  if (s.schemaVersion === 1) {
    s = _migrateV1toV2(s);
    s.schemaVersion = 2;
  }
  return s;
}

// ── loadState — localStorage 파싱 + migration ───────────────
function _loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { schemaVersion: CURRENT_SCHEMA_VERSION, bets: [] };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error('[state] edge_bets 파싱 실패 — 초기화:', e);
    return { schemaVersion: CURRENT_SCHEMA_VERSION, bets: [] };
  }

  // v1: 배열 그대로 저장되던 시절 → 래퍼로 승격
  if (Array.isArray(parsed)) {
    parsed = { schemaVersion: 1, bets: parsed };
  }

  // schemaVersion 누락 방어
  if (!parsed.schemaVersion) {
    parsed.schemaVersion = 1;
  }

  return _migrate(parsed);
}

// ── saveState — localStorage 기록 ───────────────────────────
function _saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('[state] localStorage write failed', e);
  }
}

// ── getState — 캐시 경유 단일 읽기 경로 ─────────────────────
function _getState() {
  if (!_state) _state = _loadState();
  return _state;
}

// ── 멀티탭 캐시 무효화 ──────────────────────────────────────
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) {
    _state = null;
  }
});

// ── getBets — 유일한 읽기 경로 (외부 인터페이스 유지) ────────
function getBets() {
  return _getState().bets;
}

// ── saveBets — 유일한 쓰기 경로 (외부 인터페이스 유지) ───────
function saveBets(nextBets, options = {}) {
  if (!Array.isArray(nextBets)) {
    throw new Error('saveBets: nextBets must be array');
  }

  // 조건부 디버그 (window.App.debug = true 로 활성화)
  if (window.App?.debug) {
    let caller = 'unknown';
    try {
      caller = new Error().stack?.split('\n')[2] || 'unknown';
    } catch {}
    console.debug('[saveBets]', { size: nextBets.length, caller });
  }

  // 불변성 보장 (참조 차단)
  const cloned = nextBets.map(b => ({ ...b }));

  // 캐시 업데이트 + 저장
  const state = _getState();
  state.bets = cloned;
  state.schemaVersion = CURRENT_SCHEMA_VERSION;
  _state = state;
  _saveState(state);

  // UI 갱신 (기본 true)
  if (options.refresh !== false) {
    refreshAllUI();
  }

  return cloned;
}

// ── window.bets 직접 접근 차단 ──────────────────────────────
Object.defineProperty(window, 'bets', {
  get() {
    console.warn('[DEPRECATED] window.bets direct access — use getBets()');
    return getBets();
  },
  set() {
    throw new Error('[state] Direct mutation forbidden. Use saveBets()');
  },
  configurable: true,
});

// ── rounds → round.js로 이동 (state.js 이전 로드) ──────────

// ── scope → scope.js로 이동 (state.js 이전 로드) ────────────

/** 현재 활성 탭을 기준으로 모든 UI 컴포넌트를 재렌더.
 *  storage 이벤트 핸들러 및 scope 전환 후 단일 진입점. */
function refreshAllUI() {
  // ── 1. 중앙 엔진 재계산 (scopedBets 반영) ──
  calcSystemState();

  // ── 2. 대시보드 공통 컴포넌트 ──
  if (typeof updateCharts             === 'function') updateCharts();
  if (typeof updateJudgePanel         === 'function') updateJudgePanel();
  // 대시보드 KPI 카드 — scope 전환 시에도 반드시 갱신
  if (typeof updateFundCards          === 'function') updateFundCards();
  if (typeof updateDashboardKPI       === 'function') updateDashboardKPI();
  if (typeof updateDashboardRoundStats=== 'function') updateDashboardRoundStats();

  // ── 3. 현재 활성 탭 전용 업데이트 ──
  const page = (typeof activePage !== 'undefined') ? activePage : '';
  if (page === 'analysis' || page === 'analysis2') {
    if (typeof updateStatsAnalysis === 'function') updateStatsAnalysis();
    if (page === 'analysis')  { if (typeof updateTagStats === 'function') updateTagStats(); }
  }
  if (page === 'analysis3') {
    if (typeof updateStatsAnalysis === 'function') updateStatsAnalysis();
    if (typeof updateEvBias        === 'function') updateEvBias();
    if (typeof updateEvMonthly     === 'function') updateEvMonthly();
    if (typeof updateEvCum         === 'function') updateEvCum();
  }
  if (page === 'analyze')    { if (typeof updateAnalyzeTab    === 'function') updateAnalyzeTab(); }
  if (page === 'predict')    { if (typeof updateGoalStats     === 'function') updateGoalStats();
                               if (typeof updatePredictTab    === 'function') updatePredictTab(); }
  if (page === 'predpower')  { if (typeof updatePredPowerPanel=== 'function') updatePredPowerPanel(); }
  if (page === 'judgeall')   { if (typeof updateJudgeAll      === 'function') updateJudgeAll(); }
  if (page === 'simulator')  {
    if (typeof calcKelly            === 'function') calcKelly();
    if (typeof renderKellySlots     === 'function') {
      const resolved = (typeof getBetsByScope === 'function' ? getBetsByScope() : bets)
                         .filter(b => b.result !== 'PENDING');
      renderKellySlots(resolved.length % 12, resolved);
    }
    if (typeof updateSimRoundSeedBanner === 'function') updateSimRoundSeedBanner();
    if (typeof updateKellyHistory       === 'function') updateKellyHistory();
    if (typeof updateKellyGradeBanner   === 'function') updateKellyGradeBanner();
  }
  if (page === 'goal') {
    if (typeof updateRoundHistory      === 'function') updateRoundHistory();
    if (typeof renderPrincipleList     === 'function') renderPrincipleList();
    if (typeof renderPrincipleChecklist=== 'function') renderPrincipleChecklist();
    if (typeof renderRoundReviewList   === 'function') renderRoundReviewList();
    if (typeof updateGoalStats         === 'function') updateGoalStats();
    if (typeof calcGoal                === 'function') calcGoal();
  }
  if (page === 'round-report') {
    if (typeof updateRoundReport === 'function') updateRoundReport();
  }
  if (page === 'verify') {
    if (typeof renderVerifyPage === 'function') renderVerifyPage();
  }

  // ── 4. Scope UI 동기화 (두 위치 모두) ──
  _syncScopeUI();
}
let charts = { profit: null, sport: null, odds: null, monthly: null, seed: null, goal: null, ev: null, evAmount: null, predAccuracy: null, dow: null, weeklyProfit: null, trend: null, oddsDist: null, condition: null, kellyDist: null, evMonthly: null, evCum: null, analyzeChart: null, judgeFolder: null, judgePred: null, judgeTrend: null, judgeOdds: null, judgeBias: null };

// ── getCalibCorrFactor / getAdaptiveMultiplier ─────────────
// kelly.js 로 이동됨. kelly.js가 state.js 이전에 로드되어야 함.

// ▶ calcSystemState() — 중앙 계산 엔진
//   모든 파생 지표를 단 한 번 bets 배열에서 계산하고
//   window._SS 에 저장. 각 탭은 이 객체를 읽기만 한다.
// ============================================================
function calcSystemState() {
  // scope 필터 적용 — 'all': 전체 / 'project': 현재 프로젝트만
  const scopedBets = getBetsByScope();

  const resolved  = scopedBets.filter(b => b.result !== 'PENDING');
  const wins      = resolved.filter(b => b.result === 'WIN');
  const n         = resolved.length;

  // ── 1. 기초 통계 ──────────────────────────────────────────
  const winRate     = n > 0 ? wins.length / n : 0;
  const totalProfit = resolved.reduce((s,b) => s + (b.profit||0), 0);
  const totalInvest = resolved.reduce((s,b) => s + (b.amount||0), 0);
  const roi         = totalInvest > 0 ? totalProfit / totalInvest * 100 : 0;
  const avgOdds     = n > 0 ? resolved.reduce((s,b) => s + (b.betmanOdds||1.9), 0) / n : 1.9;
  const avgAmt      = n > 0 ? totalInvest / n : 0;

  // 최근 10건
  const rec10    = resolved.slice(-10);
  const rec10wr  = rec10.length ? rec10.filter(b=>b.result==='WIN').length / rec10.length : winRate;
  const rec10roi = rec10.length ? rec10.reduce((s,b)=>s+b.profit,0) / (rec10.reduce((s,b)=>s+b.amount,0)||1) * 100 : roi;

  // 최근 5건 컨디션
  const rec5    = resolved.slice(-5);
  const rec5net = rec5.reduce((s,b)=>s+b.profit,0);

  // 연속 스트릭
  let streak = 0, streakType = '';
  for (let i = resolved.length-1; i >= 0; i--) {
    const r = resolved[i].result;
    if (i === resolved.length-1) { streakType = r; streak = 1; }
    else if (r === streakType) streak++;
    else break;
  }

  // 손익비
  const profBets  = resolved.filter(b=>b.profit>0);
  const lossBets  = resolved.filter(b=>b.profit<0);
  const avgProfit = profBets.length ? profBets.reduce((s,b)=>s+b.profit,0)/profBets.length : 0;
  const avgLoss   = lossBets.length ? Math.abs(lossBets.reduce((s,b)=>s+b.profit,0)/lossBets.length) : 1;
  const plRatio   = avgLoss > 0 ? avgProfit / avgLoss : 0;

  // ── 2. 보정도(ECE) + 과신 보정계수 ───────────────────────
  const predBets = resolved.filter(b => b.myProb && b.betmanOdds);
  const CALIB_BUCKETS = [
    {min:0,  max:10, mid:5 }, {min:10, max:20, mid:15},
    {min:20, max:30, mid:25}, {min:30, max:40, mid:35},
    {min:40, max:50, mid:45}, {min:50, max:60, mid:55},
    {min:60, max:70, mid:65}, {min:70, max:80, mid:75},
    {min:80, max:90, mid:85}, {min:90, max:101,mid:95}
  ];
  const calibRows = CALIB_BUCKETS.map(bk => {
    const g = predBets.filter(x => x.myProb >= bk.min && x.myProb < bk.max);
    if (g.length < 3) return null;
    const avgProb = g.reduce((s,x)=>s+x.myProb,0)/g.length;
    const actWr   = g.filter(x=>x.result==='WIN').length/g.length*100;
    return { mid:bk.mid, avgProb, actWr, count:g.length, diff: actWr - avgProb };
  }).filter(Boolean);

  const calibTotal = calibRows.reduce((s,r)=>s+r.count,0);
  // ECE 계산 — 방향 구분:
  // 과신(actWr < avgProb, diff < 0): 자금 손실 직결 → 풀 페널티
  // 과소추정(actWr > avgProb, diff > 0): EV 손실만 → 절반 페널티
  const ece = calibRows.length > 0
    ? calibRows.reduce((s,r) => s + (r.diff < 0 ? Math.abs(r.diff) : Math.abs(r.diff)*0.2)*r.count, 0) / calibTotal
    : null;

  // 과신 보정계수: 내 예측을 실제에 맞게 눌러주는 비율
  // actWr/avgProb 평균 → 1이면 완벽, 0.8이면 20% 과신
  const corrFactor = calibRows.length > 0
    ? calibRows.reduce((s,r) => s + (r.actWr/r.avgProb)*r.count, 0) / calibTotal
    : 1.0;

  // 보정된 평균 내 엣지
  const rawEdge = predBets.length > 0
    ? predBets.reduce((s,b) => s + (b.myProb - 100/b.betmanOdds), 0) / predBets.length
    : null;
  // 보정 후 엣지: myProb에 corrFactor 곱한 후 재계산
  const corrEdge = (rawEdge !== null && corrFactor > 0)
    ? predBets.reduce((s,b) => s + (b.myProb*corrFactor - 100/b.betmanOdds), 0) / predBets.length
    : null;

  // ── 2b. Recent ECE (최근 N건 기준) ──────────────────────────
  // 전체 ECE는 누적 편향, recentEce는 지금 현재 상태 반영
  const RECENT_ECE_N = 20;
  const recentPredBets = predBets.slice(-RECENT_ECE_N);
  let recentEce = null;
  if (recentPredBets.length >= 5) {
    const recentCalibRows = CALIB_BUCKETS.map(bk => {
      const g = recentPredBets.filter(x => x.myProb >= bk.min && x.myProb < bk.max);
      if (g.length < 2) return null;
      const avgProb = g.reduce((s,x)=>s+x.myProb,0)/g.length;
      const actWr   = g.filter(x=>x.result==='WIN').length/g.length*100;
      return { avgProb, actWr, count:g.length, diff: actWr - avgProb };
    }).filter(Boolean);
    if (recentCalibRows.length > 0) {
      const recentTotal = recentCalibRows.reduce((s,r)=>s+r.count,0);
      recentEce = recentCalibRows.reduce((s,r) =>
        s + (r.diff < 0 ? Math.abs(r.diff) : Math.abs(r.diff)*0.2)*r.count, 0
      ) / recentTotal;
    }
  }

  // ── 2c. adjustedProb 계산 헬퍼 (bucket 기반 우선) ───────────
  // 개별 베팅 입력 시 bet_record.js의 getCalibrated()와 동일 로직
  // window._SS에 함수 형태로 노출 → 어디서든 호출 가능
  function _calcAdjustedProb(myProbPct) {
    if (!myProbPct || myProbPct <= 0) return myProbPct;
    // 1순위: bucket actWr (실제 적중률)
    const bucket = calibRows.find(r => {
      const bk = CALIB_BUCKETS.find(b => b.mid === r.mid);
      return bk && myProbPct >= bk.min && myProbPct < bk.max;
    });
    if (bucket && bucket.count >= 5) {
      return bucket.actWr; // 구간 실제 적중률로 덮어쓰기
    }
    // 2순위: 전체 corrFactor 곱하기
    const cf = Math.min(corrFactor, 1.0);
    return myProbPct * cf;
  }

  // ── 2d. Decision Gate ────────────────────────────────────────
  // 베팅 허용 여부 + Kelly 조정 계수를 하나의 객체로 반환
  // recentEce 우선, 전체 ECE 보조, 표본 수 최종
  function _getBetDecision(myProbPct) {
    const sampleSize = myProbPct
      ? (() => {
          const bk = CALIB_BUCKETS.find(b => myProbPct >= b.min && myProbPct < b.max);
          const row = bk ? calibRows.find(r => r.mid === bk.mid) : null;
          return row ? row.count : predBets.length;
        })()
      : predBets.length;

    // 1. recentEce 차단 (가장 엄격) — 0.15 이상 시 차단 (0.10은 0.2배 축소)
    if (recentEce !== null && recentEce > 15) {
      return { allow: false, kellyFactor: 0, reason: 'RECENT_ECE_BLOCK',
               label: 'BLOCK', labelColor: 'var(--red)',
               desc: `최근 ECE ${recentEce.toFixed(1)}% → 베팅 차단` };
    }
    if (recentEce !== null && recentEce > 10) {
      return { allow: true, kellyFactor: 0.2, reason: 'RECENT_ECE_HIGH',
               label: 'REDUCE', labelColor: 'var(--red)',
               desc: `최근 ECE ${recentEce.toFixed(1)}% → Kelly 0.2배` };
    }

    // 2. 전체 ECE
    if (ece !== null && ece > 15) {
      return { allow: true, kellyFactor: 0.2, reason: 'HIGH_ECE',
               label: 'REDUCE', labelColor: 'var(--red)',
               desc: `ECE ${ece.toFixed(1)}% → Kelly 0.2배` };
    }
    if (ece !== null && ece > 8) {
      return { allow: true, kellyFactor: 0.4, reason: 'MID_ECE',
               label: 'REDUCE', labelColor: '#ff9800',
               desc: `ECE ${ece.toFixed(1)}% → Kelly 0.4배` };
    }

    // 3. 표본 수
    if (sampleSize < 10) {
      return { allow: true, kellyFactor: 0.3, reason: 'LOW_SAMPLE',
               label: 'REDUCE', labelColor: '#ff9800',
               desc: `구간 표본 ${sampleSize}건 → Kelly 0.3배` };
    }
    if (sampleSize < 30) {
      return { allow: true, kellyFactor: 0.6, reason: 'MID_SAMPLE',
               label: 'REDUCE', labelColor: 'var(--gold)',
               desc: `구간 표본 ${sampleSize}건 → Kelly 0.6배` };
    }

    return { allow: true, kellyFactor: 1.0, reason: 'OK',
             label: 'OK', labelColor: 'var(--green)',
             desc: 'ECE·표본 조건 충족' };
  }

  // 현재 전체 상태 기준 기본 Decision (myProb 없이)
  const betDecision = _getBetDecision(null);

  // 낙관 편향
  const withPred = resolved.filter(b => b.myProb != null && b.myProb > 0);
  const avgBias  = withPred.length > 0
    ? withPred.reduce((s,b) => s + (b.myProb - (b.result==='WIN'?100:0)), 0) / withPred.length
    : 0;

  // ── 3. 예측력 등급 (ECE 완전 통합) ────────────────────────
  let grade = null;
  if (predBets.length >= 5) {
    // 엣지 점수 (보정된 엣지 기준)
    const useEdge  = corrEdge !== null ? corrEdge : rawEdge || 0;
    const edgeSc   = Math.min(100, Math.max(0, (useEdge + 5) / 20 * 100));

    // 보정도 점수 — 과소추정 절반 반영된 ECE 기준
    // ECE 0% = 100점, ECE 10% = 80점, ECE 25% = 50점, ECE 50% = 0점
    const calibSc  = ece !== null ? Math.max(0, 100 - ece * 2) : 50;

    // 일관성 점수
    const edges    = predBets.map(b => b.myProb - 100/b.betmanOdds);
    const edgeMean = edges.reduce((s,v)=>s+v,0)/edges.length;
    const edgeStd  = Math.sqrt(edges.reduce((s,v)=>s+(v-edgeMean)**2,0)/edges.length);
    const consSc   = Math.max(0, Math.min(100, 100 - edgeStd * 3));

    // 최근 폼 점수 (보정된 기준)
    const rec10p    = predBets.slice(-10);
    const recEdge   = rec10p.length > 0
      ? rec10p.reduce((s,b) => s + (b.myProb*corrFactor - 100/b.betmanOdds), 0) / rec10p.length
      : useEdge;
    const formSc    = Math.min(100, Math.max(0, (recEdge + 5) / 20 * 100));

    // 가중 합산 — ECE 반영 비중 30%
    const totalSc = edgeSc*0.35 + calibSc*0.30 + consSc*0.20 + formSc*0.15;

    const letter = totalSc >= 85 ? 'S' : totalSc >= 70 ? 'A' : totalSc >= 55 ? 'B' : totalSc >= 40 ? 'C' : 'D';
    const color  = letter==='S'?'#ffd700':letter==='A'?'#00e676':letter==='B'?'var(--accent)':letter==='C'?'#ff9800':'var(--red)';

    // 켈리 배율 — ECE도 함께 반영
    // ECE 불량이면 등급과 별개로 추가 축소
    const gradeMult  = letter==='S'||letter==='A'?1.0:letter==='B'?0.8:letter==='C'?0.6:0.4;
    const eceMult    = ece===null?1.0:ece<=5?1.0:ece<=10?0.75:ece<=15?0.5:0.25;
    const kellyMult  = gradeMult * eceMult;

    grade = { letter, color, totalScore:Math.round(totalSc),
              edgeSc:Math.round(edgeSc), calibSc:Math.round(calibSc),
              consSc:Math.round(consSc), formSc:Math.round(formSc),
              mult: kellyMult, gradeMult, eceMult,
              rawEdge, corrEdge, corrFactor, recEdge };
  }

  // ── 4. 켈리 권장금 (kelly.js 위임) ──────────────────────
  const seed       = (typeof getBetSeed==='function' ? getBetSeed() : 0) || appSettings.kellySeed || 0;
  const bankroll   = (typeof getCurrentBankroll==='function' ? getCurrentBankroll() : 0) || appSettings.startFund || 0;
  const gradeAdj   = appSettings.kellyGradeAdj && grade ? grade.mult : 1.0;

  const _kellyResult = computeKellyUnit({
    seed,
    bankroll,
    maxBetPct:       appSettings.maxBetPct || 5,
    gradeAdj,
    kellyGradeAdj:   !!appSettings.kellyGradeAdj,
    decisionFactor:  betDecision.kellyFactor,
    allResolvedBets: bets.filter(b => b.result === 'WIN' || b.result === 'LOSE'),
  });

  const kellyUnit          = _kellyResult.kellyUnit;
  const maxUnit            = _kellyResult.maxUnit;
  const adaptiveMultiplier = _kellyResult.adaptiveMultiplier;
  const rec30roi           = _kellyResult.rec30roi;

  // ── 5. 목표 달성 시뮬레이션 (보정된 켈리 반영) ────────────
  const goalTarget = appSettings.targetFund || 0;
  let goalSim = null;
  if (goalTarget > 0 && bankroll > 0 && n >= 5) {
    const RUNS  = 500; // 빠른 추정용
    const STEPS = Math.max(n, 30);
    const profitPool = resolved.map(b => b.profit);
    // 보정계수로 수익 풀도 조정
    const adjPool = corrFactor < 1
      ? profitPool.map(p => p > 0 ? p * corrFactor : p) // 수익은 보정, 손실은 유지
      : profitPool;

    let reached = 0, totalSteps = 0;
    const s0 = (n * 7919) >>> 0;
    let sr = s0;
    const rng = () => { sr = ((sr*1664525)+1013904223)>>>0; return sr/4294967296; };

    for (let r = 0; r < RUNS; r++) {
      let bal = 0; let done = false;
      for (let i = 0; i < STEPS; i++) {
        bal += adjPool[Math.floor(rng()*adjPool.length)];
        if (!done && bankroll + bal >= goalTarget) { reached++; totalSteps += i+1; done = true; }
        if (bankroll + bal <= 0) break;
      }
    }
    const goalProb = reached / RUNS * 100;
    // 주당 베팅 수 (최근 4주 기준)
    const ago4w    = new Date(Date.now() - 28*24*3600*1000);
    const weeklyN  = scopedBets.filter(b=>b.date&&new Date(b.date)>=ago4w).length / 4 || 5;
    const avgSteps = reached > 0 ? totalSteps / reached : null;
    const weeksEst = avgSteps ? Math.ceil(avgSteps / weeklyN) : null;

    goalSim = { prob: goalProb, weeksEst, weeklyN, remaining: goalTarget - bankroll };
  }

  // ── 6. 종합 판단 점수 (7개 신호) ─────────────────────────
  const breakeven  = 1 / avgOdds;
  const scoreProfitSig = Math.min(100, Math.max(0, roi * 5 + 50));
  const scoreEdgeSig   = Math.min(100, Math.max(0, (winRate - breakeven) * 400 + 50));
  const scoreRiskSig   = Math.min(100, Math.max(0, plRatio * 25 + 20));
  const scoreFormSig   = Math.min(100, Math.max(0, (rec5net>0?70:30) + Math.min(30, Math.abs(rec5net)/(avgAmt||1)*20*(rec5net>0?1:-1))));
  const scoreBiasSig   = Math.min(100, Math.max(0, 80 - Math.abs(avgBias)*3));
  const scoreSampleSig = Math.min(100, n * 2);
  // 7번째: 예측력/보정도 신호 (기존 없던 것)
  const scoreCalibSig  = grade ? grade.calibSc : (n > 0 ? 50 : 0);
  const sigScores = [scoreProfitSig, scoreEdgeSig, scoreRiskSig, scoreFormSig, scoreBiasSig, scoreSampleSig, scoreCalibSig];
  const overallScore = sigScores.reduce((s,v)=>s+v,0) / sigScores.length;

  // ── 7. 최종 베팅 판단 ─────────────────────────────────────
  // 조건별 정지/주의/가능 판단
  const warnings = [];
  const stops    = [];

  if (ece !== null && ece > 15)   stops.push(`보정 오차 ${ece.toFixed(1)}% — 켈리 신뢰 불가`);
  if (recentEce !== null && recentEce > 15) stops.push(`최근 ECE ${recentEce.toFixed(1)}% — 베팅 차단`);
  if (streak >= 5 && streakType==='LOSE') stops.push(`${streak}연패 진행 중 — 감정적 베팅 위험`);
  if (grade && grade.letter === 'D') stops.push(`예측력 D등급 — 베팅 규모 최소화`);
  if (avgBias > 20)  warnings.push(`낙관 편향 ${avgBias.toFixed(1)}%p — myProb 재검토`);
  if (ece !== null && ece > 8 && ece <= 15) warnings.push(`보정 오차 ${ece.toFixed(1)}% — 분수 켈리 적용`);
  if (recentEce !== null && recentEce > 10 && recentEce <= 15) warnings.push(`최근 ECE ${recentEce.toFixed(1)}% — Kelly 0.2배 축소 중`);
  if (rec10roi < -15) warnings.push(`최근 10건 ROI ${rec10roi.toFixed(1)}% — 슬럼프 가능성`);
  if (streak >= 3 && streakType==='LOSE') warnings.push(`${streak}연패 — 분석 강화 권장`);

  const verdict = stops.length > 0  ? 'STOP'
                : warnings.length > 0 ? 'CAUTION'
                : n < 10             ? 'WAIT'
                : 'GO';

  const verdictInfo = {
    GO:      { label:'베팅 가능',    color:'var(--green)', icon:'🟢', desc:'현재 지표 정상. 켈리 기준 유지.' },
    CAUTION: { label:'주의 베팅',    color:'#ff9800',      icon:'🟡', desc: warnings[0] || '일부 지표 주의.' },
    STOP:    { label:'베팅 보류',    color:'var(--red)',   icon:'🔴', desc: stops[0]    || '주요 지표 경고.' },
    WAIT:    { label:'데이터 축적 중', color:'var(--text3)', icon:'⚪', desc:`${10-n}건 더 쌓이면 판단 가능.` }
  }[verdict];

  // ── 결과 객체 저장 ────────────────────────────────────────
  window._SS = {
    // raw
    resolved, wins, n,
    // 기초
    winRate, totalProfit, totalInvest, roi, avgOdds, avgAmt,
    rec10, rec10wr, rec10roi, rec5, rec5net,
    streak, streakType, plRatio, avgBias,
    // 보정도
    predBets, calibRows, ece, corrFactor,
    activeCorrFactor: getCalibCorrFactor(corrFactor, n),
    rawEdge, corrEdge,
    // ── Decision Layer (v7.2) ──────────────────────────────
    recentEce,                      // 최근 20건 ECE % (null 가능)
    betDecision,                    // 현재 베팅 허용 여부 + kellyFactor (snapshot)
    // 주의: Live 계산은 getAdjustedProbLive() / getBetDecisionLive() 사용
    //       _SS는 데이터 공급 전용 — 함수 노출 제거됨 (v7.2)
    // 구간별 보정 버킷 (adjustedProb 강제 적용용)
    calibBuckets: calibRows,
    // 등급
    grade,
    // 켈리
    seed, bankroll, kellyUnit, gradeAdj, maxUnit,
    rec30roi, multiplier: adaptiveMultiplier,
    // 목표
    goalTarget, goalSim,
    // 종합판단
    sigScores, overallScore,
    labels: ['수익성','예측 엣지','리스크 관리','현재 컨디션','편향 없음','데이터 신뢰도','보정도'],
    icons:  ['💰','🎯','🛡','🌡','👁','📦','📐'],
    verdict, verdictInfo, warnings, stops,
    // scope 메타 — UI 레이블 표시용
    scope: getCurrentScope(),
    scopeProject: getCurrentProject(),
    scopedTotal: scopedBets.length,
    activeRound: getActiveRound(),          // 현재 회차 객체 (null 가능)
    // 타임스탬프
    _ts: Date.now()
  };
  return window._SS;
}
// ── 엔진 초기 실행 ──
window._SS = null;


function toggleStatsDropdown(el) {
  toggleGenericDropdown('stats');
}

// toggleGenericDropdown / switchTabFromDropdown → ui_tabs.js로 이동

// updateAnalyzeTab / setJudgeFilter / updateJudgePanel → ui_tabs.js로 이동

// judgeFilter → ui_tabs.js로 이동


// ========== 보정 확률 계산 (calibrateProb) ==========
// ratio 클리핑 → weight 완화 → 최종 클램프 3중 안전장치

function getWeight(n, sample) {
  if (n < 30 || sample < 10) return 0;
  if (n < 50) return (n - 30) / 20 * 0.5;
  return Math.min(0.5 + (n - 50) / 50 * 0.5, 0.9); // 최대 0.9 (항상 10% 내 판단 유지)
}

function calibrateProb(myProb, bucket, totalBets) {
  // { bin, actual } 또는 { min, max, actWr, count } 둘 다 지원
  const expected = bucket.bin != null ? bucket.bin : (bucket.min + bucket.max) / 2;
  const actual   = bucket.actual != null ? bucket.actual : bucket.actWr / 100;
  const sample   = bucket.count != null ? bucket.count : 10; // count 없으면 최소치로 간주

  if (!bucket || expected == null || actual == null) return myProb;

  // 1. ratio 계산 (같은 단위로 비교)
  let ratio = actual / expected;

  // 2. ratio 클리핑 [0.5 ~ 1.5]
  ratio = Math.min(Math.max(ratio, 0.5), 1.5);

  // 3. 데이터 수 기반 weight
  const weight = getWeight(totalBets, sample);

  // 4. 완화된 ratio
  const adjustedRatio = 1 + (ratio - 1) * weight;

  // 5. 적용
  let finalProb = myProb * adjustedRatio;

  // 6. 최종 클램프 [0.05 ~ 0.95]
  finalProb = Math.min(Math.max(finalProb, 0.05), 0.95);

  return finalProb;
}

function getCalibrated(p) {
  if (!window._calibData || window._calibData.length === 0) return p;

  let closest = null;
  let minDiff = Infinity;

  for (const d of window._calibData) {
    const diff = Math.abs(p - d.bin);
    if (diff < minDiff) {
      minDiff = diff;
      closest = d;
    }
  }

  return closest ? closest.actual : p;
}

// ============================================================
// ▶ getAdjustedProb(myProbPct) — 보정 확률 강제 적용 (핵심 필터)
//   myProb → calibration → adjustedProb
//   이 함수가 edge/kelly/ev 모든 계산의 입력 필터
//   30건 미만: raw 그대로 (데이터 불충분)
//   30~49건:   50% 강도
//   50건+:     구간별 ratio * weight 완전 적용
// ============================================================
function getAdjustedProb(myProbPct) {
  const p = myProbPct / 100;
  const ss = window._SS;
  if (!ss || !ss.calibBuckets || ss.calibBuckets.length === 0 || ss.n < 30) {
    return myProbPct; // 데이터 부족 → raw 그대로
  }

  const totalBets = ss.n;

  // 해당 구간 찾기
  const bucket = ss.calibBuckets.find(r =>
    myProbPct >= r.min && myProbPct < r.max
  );

  if (!bucket || bucket.count < 3) {
    // 구간 데이터 부족 → activeCorrFactor로 전체 보정
    const acf = ss.activeCorrFactor || 1.0;
    const adj = Math.min(Math.max(myProbPct * acf, 5), 95);
    return adj;
  }

  // calibrateProb 호출 (state.js 내 함수)
  const adjP = calibrateProb(p, {
    min: bucket.min,
    max: bucket.max,
    actWr: bucket.actWr,
    count: bucket.count
  }, totalBets);

  return Math.min(Math.max(adjP * 100, 5), 95);
}

// CLV 기반 추가 보정 (avgCLV < 0 → downscale)
function getCLVAdjustedProb(myProbPct) {
  let adj = getAdjustedProb(myProbPct);
  const ss = window._SS;
  if (!ss || !ss.predBets || ss.predBets.length < 10) return adj;

  // avgCLV 계산: myProb - impliedProb 평균
  const clvArr = ss.predBets
    .filter(b => b.betmanOdds && b.betmanOdds >= 1)
    .map(b => b.myProb - (100 / b.betmanOdds));
  if (clvArr.length < 10) return adj;

  const avgCLV = clvArr.reduce((s,v) => s+v, 0) / clvArr.length;
  // avgCLV < -3%p → 추가 5% downscale
  // avgCLV > +3%p → 유지
  if (avgCLV < -3) {
    adj = adj * 0.95;
  }
  return Math.min(Math.max(adj, 5), 95);
}

// ============================================================
// ▶ _syncScopeUI() — scope 버튼 active 상태 + 라벨 동기화
//   switchScope / storage 이벤트 후 항상 호출.
//   대시보드 + 설정 탭 양쪽을 동시에 갱신.
// ============================================================
// ============================================================
// ▶ Decision Layer — Stateless Live 함수 (v7.1)
//   _SS는 데이터 공급만 담당.
//   계산은 항상 현재 입력값 기준으로 독립 실행.
// ============================================================

/**
 * getAdjustedProbLive({ myProb, buckets, corrFactor, totalN })
 * myProb(%) → adjustedProb(%) 보정
 * bucket 기반 우선, 없으면 corrFactor 적용
 * @returns { adjustedProb, source, delta, bucketCount }
 */
function getAdjustedProbLive({ myProb, buckets, corrFactor, totalN }) {
  if (!myProb || myProb <= 0) return { adjustedProb: myProb, source: 'RAW', delta: 0, bucketCount: 0 };

  const ss = window._SS;
  // 데이터 부족 → raw 그대로
  if (!ss || (totalN || ss.n || 0) < 10) {
    return { adjustedProb: myProb, source: 'RAW', delta: 0, bucketCount: 0 };
  }

  const bkts = buckets || ss.calibBuckets || [];
  // bucket 탐색 — mid 기준으로 구간 매핑
  const BUCKET_EDGES = [0,10,20,30,40,50,60,70,80,90,101];
  const bkIdx = BUCKET_EDGES.findIndex((e, i) => i < BUCKET_EDGES.length-1 && myProb >= e && myProb < BUCKET_EDGES[i+1]);
  const mid   = bkIdx >= 0 ? BUCKET_EDGES[bkIdx] + 5 : null;
  const bucket = mid !== null ? bkts.find(r => r.mid === mid) : null;

  // bucket 기반 보정 (5건 이상일 때 신뢰)
  if (bucket && bucket.count >= 5) {
    // actWr로 완전 덮어쓰기 (표본 충분)
    const weight = Math.min(1.0, bucket.count / 30); // 30건 이상 = 100% 적용
    const adjusted = myProb * (1 - weight) + bucket.actWr * weight;
    const clamped  = Math.min(Math.max(adjusted, 5), 95);
    return {
      adjustedProb: Math.round(clamped * 10) / 10,
      source: 'BUCKET',
      delta: Math.round((clamped - myProb) * 10) / 10,
      bucketCount: bucket.count
    };
  }

  // corrFactor 기반 보정 (bucket 없을 때)
  const cf = Math.min(corrFactor || ss.activeCorrFactor || 1.0, 1.0);
  if (cf < 0.999) {
    const adjusted = Math.min(Math.max(myProb * cf, 5), 95);
    return {
      adjustedProb: Math.round(adjusted * 10) / 10,
      source: 'CORR',
      delta: Math.round((adjusted - myProb) * 10) / 10,
      bucketCount: bucket ? bucket.count : 0
    };
  }

  return { adjustedProb: myProb, source: 'RAW', delta: 0, bucketCount: 0 };
}

/**
 * getBetDecisionLive({ myProb, odds, recentEce, totalEce, sampleSize })
 * 현재 입력 기준으로 베팅 허용 여부 + kellyFactor 반환
 * @returns { allow, kellyFactor, reason, label, labelColor, desc, confidenceLevel }
 */
function getBetDecisionLive({ myProb, odds, recentEce, totalEce, sampleSize }) {
  const ss = window._SS;
  // _SS에서 최신 ECE/표본 가져오기 (인자 우선)
  const rEce    = recentEce  ?? ss?.recentEce  ?? null;
  const tEce    = totalEce   ?? ss?.ece         ?? null;
  const sample  = sampleSize ?? (() => {
    if (!myProb || !ss?.calibBuckets) return ss?.predBets?.length || 0;
    const EDGES = [0,10,20,30,40,50,60,70,80,90,101];
    const idx   = EDGES.findIndex((e,i) => i < EDGES.length-1 && myProb >= e && myProb < EDGES[i+1]);
    const mid   = idx >= 0 ? EDGES[idx] + 5 : null;
    const row   = mid !== null ? ss.calibBuckets.find(r => r.mid === mid) : null;
    return row ? row.count : (ss?.predBets?.length || 0);
  })();

  // ── 판단 트리 ────────────────────────────────────────────
  // 1. recentEce 차단 (최우선)
  if (rEce !== null && rEce > 15) {
    return { allow: false, kellyFactor: 0, reason: 'RECENT_ECE_BLOCK',
             label: 'BLOCK', labelColor: 'var(--red)', confidenceLevel: 'LOW',
             desc: `최근 ECE ${rEce.toFixed(1)}% → 베팅 차단` };
  }
  if (rEce !== null && rEce > 10) {
    return { allow: true, kellyFactor: 0.2, reason: 'RECENT_ECE_HIGH',
             label: 'REDUCE', labelColor: 'var(--red)', confidenceLevel: 'LOW',
             desc: `최근 ECE ${rEce.toFixed(1)}% → Kelly 0.2배` };
  }
  // 2. 전체 ECE
  if (tEce !== null && tEce > 15) {
    return { allow: true, kellyFactor: 0.2, reason: 'HIGH_ECE',
             label: 'REDUCE', labelColor: 'var(--red)', confidenceLevel: 'LOW',
             desc: `ECE ${tEce.toFixed(1)}% → Kelly 0.2배` };
  }
  if (tEce !== null && tEce > 8) {
    return { allow: true, kellyFactor: 0.4, reason: 'MID_ECE',
             label: 'REDUCE', labelColor: '#ff9800', confidenceLevel: 'MID',
             desc: `ECE ${tEce.toFixed(1)}% → Kelly 0.4배` };
  }
  // 3. 표본 수
  if (sample < 10) {
    return { allow: true, kellyFactor: 0.3, reason: 'LOW_SAMPLE',
             label: 'REDUCE', labelColor: '#ff9800', confidenceLevel: 'LOW',
             desc: `구간 표본 ${sample}건 → Kelly 0.3배` };
  }
  if (sample < 30) {
    return { allow: true, kellyFactor: 0.6, reason: 'MID_SAMPLE',
             label: 'REDUCE', labelColor: 'var(--gold)', confidenceLevel: 'MID',
             desc: `구간 표본 ${sample}건 → Kelly 0.6배` };
  }

  return { allow: true, kellyFactor: 1.0, reason: 'OK',
           label: 'OK', labelColor: 'var(--green)', confidenceLevel: 'HIGH',
           desc: 'ECE·표본 조건 충족' };
}

// ============================================================
// ▶ 단위 변환 헬퍼 (v7.2 — 단위 혼용 방지)
//   저장: % (0~100)  계산: frac (0~1)  출력: %
//   직접 /100 또는 *100 코드 금지 — 반드시 이 함수 사용
// ============================================================

/**
 * toProb(pct) — 퍼센트 → 소수 (계산용)
 * @param {number} pct  0~100
 * @returns {number}    0~1
 */
function toProb(pct) {
  if (!Number.isFinite(pct)) return 0;
  return pct / 100;
}

/**
 * toPct(prob, decimals) — 소수 → 퍼센트 (저장/표시용)
 * @param {number} prob      0~1
 * @param {number} decimals  소수점 자릿수 (기본 1)
 * @returns {number}         0~100
 */
function toPct(prob, decimals = 1) {
  if (!Number.isFinite(prob)) return 0;
  const factor = 10 ** decimals;
  return Math.round(prob * 100 * factor) / factor;
}

/**
 * getDecisionSnapshot(myProb, odds)
 * 현재 입력에 대한 완전한 Decision 스냅샷 반환
 * 저장 시 bet.decision에 기록
 *
 * 단위 규칙:
 *   myProb          — % 정수  (사용자 입력 그대로)
 *   adjustedProb    — % 소수 1자리 (저장/표시용)
 *   rawAdjustedProbFrac — 0~1 고정밀 소수 (계산용, 재사용 금지)
 *   recentEce/totalEce  — %
 */
function getDecisionSnapshot(myProb, odds) {
  const ss = window._SS;

  // adjustedProb 계산 (Live — _SS는 데이터 공급만)
  const adjResult = getAdjustedProbLive({
    myProb,
    buckets:    ss?.calibBuckets,
    corrFactor: ss?.corrFactor,
    totalN:     ss?.n
  });

  // Decision Gate (Live)
  const decision = getBetDecisionLive({ myProb, odds });

  // rawAdjustedProbFrac: 고정밀 계산값 (저장 전 반올림 금지)
  // adjResult.adjustedProb는 이미 % 단위이므로 toProb()로 변환
  const rawAdjustedProbFrac = toProb(adjResult.adjustedProb);

  return {
    // 판단
    factor:           decision.kellyFactor,
    reason:           decision.reason,
    label:            decision.label,
    allow:            decision.allow,
    confidenceLevel:  decision.confidenceLevel,
    // 확률 (단위 명시)
    myProb:           myProb,                          // % 정수
    adjustedProb:     adjResult.adjustedProb,          // % 소수 1자리
    rawAdjustedProbFrac: rawAdjustedProbFrac,          // 0~1 고정밀
    // 보정 메타
    adjustSource:     adjResult.source,                // 'BUCKET'|'CORR'|'RAW'
    adjustDelta:      adjResult.delta,                 // % 차이 (소수 1자리)
    bucketCount:      adjResult.bucketCount,
    // ECE (단위: %)
    recentEce:        ss?.recentEce  ?? null,
    totalEce:         ss?.ece        ?? null,
    corrFactor:       ss?.corrFactor ?? null,
    sampleN:          ss?.predBets?.length ?? 0,
    // 타임스탬프
    ts:               Date.now()
  };
}

// ============================================================
(function _initStorageListener() {
  let _debounceTimer = null;

  window.addEventListener('storage', function (e) {
    // edge_bets / edge_rounds 외 키는 무시
    if (e.key !== null && e.key !== STORAGE_KEY && e.key !== 'edge_rounds') return;

    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(function () {
      // bets 배열 최신화 (다른 탭에서 변경된 경우 대비)
      if (e.key === STORAGE_KEY || e.key === null) {
        try {
          const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
          if (Array.isArray(raw)) {
            saveBets(raw.map(b => ({ projectId: b.projectId || 'default', ...b })), { refresh: false });
          }
        } catch (err) {
          console.error('[storage sync] bets 동기화 실패', err);
        }
      }

      // rounds 배열 최신화 (saveRounds 경유)
      if (e.key === 'edge_rounds' || e.key === null) {
        try {
          const rawR = JSON.parse(localStorage.getItem('edge_rounds') || '[]');
          if (Array.isArray(rawR)) {
            saveRounds(rawR);
          }
        } catch (err) {
          console.error('[storage sync] rounds 동기화 실패', err);
        }
      }

      refreshAllUI();
    }, 100);
  });
}());

// ── window.App 네임스페이스 (state.js 코어 등록) ─────────────
// kelly.js에서 계산 함수 등록 후, 여기서 데이터/엔진 함수 추가
window.App = {
  ...(window.App || {}),
  STORAGE_KEY,
  getBets,
  saveBets,
  calcSystemState,
  refreshAllUI,
};
