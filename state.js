
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
let bets = (function () {
  let raw;
  try {
    raw = JSON.parse(localStorage.getItem('edge_bets') || '[]');
    if (!Array.isArray(raw)) raw = [];
  } catch (e) {
    console.error('[state] edge_bets 파싱 실패:', e);
    raw = [];
  }
  // projectId 자동 보정 — 기존 데이터는 'default'로 처리
  return raw.map(b => ({ projectId: b.projectId || 'default', ...b }));
}());

// ============================================================
// ▶ rounds — 회차(시드) 사이클 관리
//   구조: [{ id, seed, remaining, status:'LOCKED'|'UNLOCKED', createdAt, closedAt }]
//   LOCKED  = 진행 중 (항상 최대 1개)
//   UNLOCKED = 종료됨
//   localStorage key: edge_rounds
// ============================================================
let rounds = (function () {
  try {
    const raw = JSON.parse(localStorage.getItem('edge_rounds') || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    console.error('[state] edge_rounds 파싱 실패:', e);
    return [];
  }
}());

function saveRounds(arr) {
  rounds = arr;
  localStorage.setItem('edge_rounds', JSON.stringify(arr));
}

/** 진행 중인 회차 (LOCKED) — 항상 1개 또는 null */
function getActiveRound() {
  return rounds.find(r => r.status === 'LOCKED') || null;
}

/** 새 회차 시작 — LOCKED 회차가 없을 때만 생성 가능 */
function lockNewRound(seed) {
  if (getActiveRound()) {
    alert('진행 중인 회차가 있습니다. 현재 회차를 먼저 종료하세요.');
    return false;
  }
  const parsedSeed = parseInt(seed, 10);
  if (!parsedSeed || parsedSeed <= 0) {
    alert('유효한 시드 금액을 입력하세요.');
    return false;
  }
  const id = 'r' + Date.now();
  const newRound = {
    id,
    seed:      parsedSeed,
    remaining: parsedSeed,
    status:    'LOCKED',
    createdAt: new Date().toISOString(),
    closedAt:  null
  };
  saveRounds([...rounds, newRound]);
  localStorage.setItem('edge_current_round', id);
  window.dispatchEvent(new Event('storage'));
  return true;
}

/** 베팅 금액 차감 → remaining <= 0 이면 자동 UNLOCKED */
function applyRoundBet(amount) {
  const round = getActiveRound();
  if (!round) return;
  round.remaining = Math.max(0, round.remaining - amount);
  if (round.remaining <= 0) {
    round.status    = 'UNLOCKED';
    round.closedAt  = new Date().toISOString();
  }
  saveRounds([...rounds]);          // 참조 갱신
  window.dispatchEvent(new Event('storage'));
}

/** 베팅 취소/삭제 시 금액 환원 (LOCKED 회차에만) */
function refundRoundBet(amount) {
  const round = getActiveRound();
  if (!round) return;
  round.remaining = Math.min(round.seed, round.remaining + amount);
  saveRounds([...rounds]);
}

/** 현재 회차 수동 종료 */
function closeActiveRound() {
  const round = getActiveRound();
  if (!round) return;
  if (!confirm('현재 회차를 종료하시겠습니까?')) return;
  round.status   = 'UNLOCKED';
  round.closedAt = new Date().toISOString();

  // ── snapshot 저장 — 렌더 시 재계산 제거 / 성능 개선 ──
  const roundBets = bets.filter(b => b.roundId && b.roundId === round.id && b.result !== 'PENDING');
  const total     = roundBets.length;
  const wins      = roundBets.filter(b => b.result === 'WIN').length;
  const profit    = roundBets.reduce((s, b) => s + (b.profit || 0), 0);
  round.summary = {
    total,
    wins:      wins ?? 0,
    profit:    Math.round(profit),
    roi:       total > 0 && round.seed > 0 ? +(profit / round.seed * 100).toFixed(2) : 0,
    hitRate:   total > 0 ? +(wins / total * 100).toFixed(2) : 0,
    createdAt: Date.now()
  };

  saveRounds([...rounds]);
  window.dispatchEvent(new Event('storage'));
}

// ── Scope 헬퍼 ───────────────────────────────────────────────────────────────
// scope: 'all' | 'round'  (기존 'project'는 하위 호환 유지)
// 통계 계산은 반드시 getBetsByScope() 를 통해 데이터를 가져옴.
// bets 전역은 저장/삭제 등 원본 접근에만 사용.

function getCurrentScope() {
  return localStorage.getItem('edge_scope') || 'all';
}
function setCurrentScope(scope) {
  localStorage.setItem('edge_scope', scope);
}
function getCurrentProject() {
  return localStorage.getItem('edge_current_project') || 'default';
}
function setCurrentProject(id) {
  if (!id || typeof id !== 'string') return;
  localStorage.setItem('edge_current_project', id.trim() || 'default');
}

/** 현재 scope에 맞는 bets 배열 반환. 통계 계산 전에 항상 사용. */
function getBetsByScope() {
  const scope = getCurrentScope();
  // ── 현재 회차 ──
  if (scope === 'round') {
    const r = getActiveRound();
    if (!r) return [];                          // 진행 중 회차 없으면 빈 배열
    return bets.filter(b => b.roundId === r.id);
  }
  // ── 프로젝트 (하위 호환) ──
  if (scope === 'project') {
    const p = getCurrentProject();
    return bets.filter(b => (b.projectId || 'default') === p);
  }
  return bets; // 'all' 또는 미지정
}

/** scope 전환 — 이벤트 트리거 전용.
 *  계산은 storage 이벤트 → refreshAllUI() → calcSystemState() 순으로 단 1회만 실행. */
function switchScope(scope) {
  setCurrentScope(scope);
  window.dispatchEvent(new Event('storage'));
}

/** 현재 활성 탭을 기준으로 모든 UI 컴포넌트를 재렌더.
 *  storage 이벤트 핸들러 및 scope 전환 후 단일 진입점. */
function refreshAllUI() {
  // ── 1. 중앙 엔진 재계산 (scopedBets 반영) ──
  calcSystemState();

  // ── 2. 대시보드 공통 컴포넌트 ──
  if (typeof updateCharts         === 'function') updateCharts();
  if (typeof updateJudgePanel     === 'function') updateJudgePanel();

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

// ============================================================
// ============================================================
// ▶ getCalibCorrFactor() — 보정계수 반환 (Calibration Layer)
//   30건 미만: 비활성 (1.0)
//   30~49건:   50% 강도 (과신만 보정, 과소추정은 cap)
//   50건+:     100% 적용
// ============================================================
function getCalibCorrFactor(corrFactor, resolvedCount) {
  if (resolvedCount < 30 || corrFactor == null) return 1.0;
  const cf = Math.min(corrFactor, 1.0); // 과소추정(>1)은 보정 안 함
  if (resolvedCount < 50) return 1.0 + (cf - 1.0) * 0.5;
  return cf;
}

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

  // ── 4. 켈리 권장금 ───────────────────────────────────────
  const seed       = (typeof getBetSeed==='function' ? getBetSeed() : 0) || appSettings.kellySeed || 0;
  const bankroll   = (typeof getCurrentBankroll==='function' ? getCurrentBankroll() : 0) || appSettings.startFund || 0;
  const maxBetPct  = appSettings.maxBetPct || 5;
  const maxUnit    = bankroll > 0 ? Math.floor(bankroll * maxBetPct / 100) : Infinity;
  const gradeAdj   = appSettings.kellyGradeAdj && grade ? grade.mult : 1.0;
  const unitRaw    = seed > 0 ? Math.floor(seed / 12 * gradeAdj) : 0;
  const kellyUnit  = seed > 0 ? Math.min(unitRaw, maxUnit) : 0;

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
  if (streak >= 5 && streakType==='LOSE') stops.push(`${streak}연패 진행 중 — 감정적 베팅 위험`);
  if (grade && grade.letter === 'D') stops.push(`예측력 D등급 — 베팅 규모 최소화`);
  if (avgBias > 20)  warnings.push(`낙관 편향 ${avgBias.toFixed(1)}%p — myProb 재검토`);
  if (ece !== null && ece > 8 && ece <= 15) warnings.push(`보정 오차 ${ece.toFixed(1)}% — 분수 켈리 적용`);
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
    // 구간별 보정 버킷 (adjustedProb 강제 적용용)
    calibBuckets: calibRows,
    // 등급
    grade,
    // 켈리
    seed, bankroll, kellyUnit, gradeAdj, maxUnit,
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

function toggleGenericDropdown(key) {
  const menu = document.getElementById(key + '-dropdown-menu');
  if (!menu) return;
  // 다른 드롭다운 전부 닫기
  ['stats','insight','fund','judge','betting'].forEach(k => {
    if (k !== key) {
      const m = document.getElementById(k + '-dropdown-menu');
      if (m) m.style.display = 'none';
    }
  });
  const isOpen = menu.style.display !== 'none';
  menu.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    setTimeout(function() {
      document.addEventListener('click', function closeMenu(e) {
        const wrap = document.getElementById(key + '-dropdown-wrap');
        if (wrap && !wrap.contains(e.target)) {
          menu.style.display = 'none';
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 10);
  }
}

function switchTabFromDropdown(name, el) {
  // 모든 드롭다운 메뉴 닫기
  ['stats','insight','fund','judge','betting'].forEach(k => {
    const m = document.getElementById(k + '-dropdown-menu');
    if (m) m.style.display = 'none';
  });

  // 모든 탭 active 해제
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-dropdown-menu div').forEach(t => t.classList.remove('active'));

  // 해당 드롭다운 트리거 active
  const triggerMap = {
    analysis: 'stats', analysis2: 'stats', analysis3: 'stats',
    analyze: 'insight', predict: 'insight', predpower: 'insight', verify: 'insight',
    simulator: 'fund', goal: 'fund', 'round-report': 'fund'
  };
  const triggerKey = triggerMap[name];
  if (triggerKey) {
    const trigger = document.getElementById(triggerKey + '-dropdown-trigger');
    if (trigger) trigger.classList.add('active');
  }
  if (el) el.classList.add('active');

  // 페이지 전환
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  if (page) page.classList.add('active');

  activePage = name;
  if (name === 'analysis')  { updateStatsAnalysis(); updateTagStats(); }
  if (name === 'analysis2') updateStatsAnalysis();
  if (name === 'analysis3') { updateStatsAnalysis(); updateEvBias(); updateEvMonthly(); updateEvCum(); }
  if (name === 'judgeall')   updateJudgeAll();
  if (name === 'ai-advice')  { /* 수동 트리거만 — 자동 실행 안 함 */ }
  if (name === 'journal')    { loadJournal(); switchJournalTab(_journalTab || 'plan'); }
  if (name === 'strategy')   { initSimulator(); }
  if (name === 'analyze')   updateAnalyzeTab();
  if (name === 'predict')   { updateGoalStats(); updatePredictTab(); }
  if (name === 'predpower') updatePredPowerPanel();
  if (name === 'verify')    { if (typeof renderVerifyPage === 'function') renderVerifyPage(); }
  if (name === 'simulator') { calcKelly(); renderKellySlots(bets.filter(b=>b.result!=='PENDING').length % 12, bets.filter(b=>b.result!=='PENDING')); updateSimRoundSeedBanner(); updateKellyHistory(); updateKellyGradeBanner(); try{updateFibonacci();}catch(e){} }
  if (name === 'goal')      { updateRoundHistory();
  renderPrincipleList();
  renderPrincipleChecklist();
  renderRoundReviewList(); updateGoalStats(); calcGoal(); }
  // round-report: refreshAllUI에서 단일 처리 (이중 렌더 방지)
}

function updateAnalyzeTab() {
  // ── 엔진 연동 ──
  const _SS = window._SS;

  const resolved = bets.filter(function(b) { return b.result !== 'PENDING'; });
  const wins     = resolved.filter(function(b) { return b.result === 'WIN'; });

  // 승률 — 엔진 우선
  const wr = _SS ? (_SS.winRate * 100) : (resolved.length > 0 ? wins.length / resolved.length * 100 : null);
  const wrEl = document.getElementById('analyze-wr');
  if (wrEl) {
    wrEl.textContent = wr !== null ? wr.toFixed(1) + '%' : '—';
    wrEl.style.color = wr === null ? 'var(--text3)' : wr >= 50 ? 'var(--green)' : 'var(--red)';
  }

  // 베팅당 평균 손익
  const avgProfit = (_SS && _SS.n > 0) ? (_SS.totalProfit / _SS.n)
    : (resolved.length > 0 ? resolved.reduce(function(s,b){return s+b.profit;},0) / resolved.length : null);
  const apEl = document.getElementById('analyze-avg-profit');
  if (apEl) {
    apEl.textContent = avgProfit !== null ? (avgProfit >= 0 ? '+' : '') + '₩' + Math.round(avgProfit).toLocaleString() : '—';
    apEl.style.color = avgProfit === null ? 'var(--text3)' : avgProfit >= 0 ? 'var(--green)' : 'var(--red)';
  }

  // 최근 10경기 ROI — 엔진 우선
  const r10roi = _SS ? _SS.rec10roi : (() => {
    const recent10 = resolved.slice(-10);
    const r10profit   = recent10.reduce(function(s,b){return s+b.profit;},0);
    const r10invested = recent10.reduce(function(s,b){return s+b.amount;},0);
    return r10invested > 0 ? r10profit / r10invested * 100 : null;
  })();
  const r10El = document.getElementById('analyze-recent-roi');
  if (r10El) {
    r10El.textContent = r10roi !== null ? (r10roi >= 0 ? '+' : '') + r10roi.toFixed(1) + '%' : '—';
    r10El.style.color = r10roi === null ? 'var(--text3)' : r10roi >= 0 ? 'var(--green)' : 'var(--red)';
  }

  // EV 평균
  const evBets = bets.filter(function(b) { return b.ev !== undefined && b.ev !== null; });
  const evAvg  = evBets.length > 0 ? evBets.reduce(function(s,b){return s+(b.ev||0);},0) / evBets.length : null;
  const evEl = document.getElementById('analyze-ev-avg');
  if (evEl) {
    evEl.textContent = evAvg !== null ? (evAvg >= 0 ? '+' : '') + evAvg.toFixed(2) + '%' : '—';
    evEl.style.color = evAvg === null ? 'var(--text3)' : evAvg >= 0 ? 'var(--accent)' : 'var(--red)';
  }

  // 연속 스트릭 — 엔진 우선
  const streakEl    = document.getElementById('analyze-streak');
  const streakLabel = document.getElementById('analyze-streak-label');
  if (streakEl) {
    const _streak     = _SS ? _SS.streak : 0;
    const _streakType = _SS ? _SS.streakType : '';
    if (_streak > 0 && _streakType) {
      streakEl.textContent = _streak + '연속';
      streakEl.style.color = _streakType === 'WIN' ? 'var(--green)' : 'var(--red)';
      if (streakLabel) streakLabel.textContent = _streakType === 'WIN' ? '🔥 연승 중' : '❄️ 연패 중';
    } else {
      // 폴백: 직접 계산
      const sorted2 = resolved.slice().sort(function(a,b){return (a.date||'').localeCompare(b.date||'');});
      if (sorted2.length > 0) {
        let s = 1; const last2 = sorted2[sorted2.length-1].result;
        for (let i = sorted2.length-2; i >= 0; i--) { if (sorted2[i].result === last2) s++; else break; }
        streakEl.textContent = s + '연속';
        streakEl.style.color = last2 === 'WIN' ? 'var(--green)' : 'var(--red)';
        if (streakLabel) streakLabel.textContent = last2 === 'WIN' ? '🔥 연승 중' : '❄️ 연패 중';
      } else {
        streakEl.textContent = '—'; streakEl.style.color = 'var(--text3)';
      }
    }
  }

  // 시나리오 그래프 + 방향성 + 리스크 (calcGoal 로직 재활용)
  updateAnalyzeChart();
  updateJudgePanel();
}

let judgeFilter = 'all';

function setJudgeFilter(val, el) {
  judgeFilter = val;
  ['jf-all','jf-30','jf-10'].forEach(id => {
    const b = document.getElementById(id);
    if (!b) return;
    b.style.background = 'var(--bg3)'; b.style.color = 'var(--text2)'; b.style.fontWeight = '400';
  });
  if (el) { el.style.background = 'var(--accent)'; el.style.color = '#000'; el.style.fontWeight = '700'; }
  updateJudgePanel();
}

function updateJudgePanel() {
  const allResolved = bets.filter(b => b.result !== 'PENDING');
  const resolved = judgeFilter === 'all' ? allResolved
    : allResolved.slice(-judgeFilter);
  const minSample = 5;
  if (resolved.length < minSample) {
    ['judge-diagnosis','judge-action','judge-cross-table'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<span style="color:var(--text3);">데이터 부족</span>';
    });
    const diag = document.getElementById('judge-diagnosis');
    if (diag) diag.innerHTML = `<span style="color:var(--text3);">베팅 기록 ${minSample}건 이상부터 분석이 시작됩니다. (현재 ${resolved.length}건)</span>`;
    return;
  }

  // ── 폴더별 ──
  const folderKeys = ['단폴','2폴','3폴','4폴+'];
  const folderData = folderKeys.map(key => {
    const g = resolved.filter(b => {
      if (key === '단폴') return b.mode !== 'multi';
      const fc = parseInt(b.folderCount) || 0;
      if (key === '2폴') return b.mode === 'multi' && fc === 2;
      if (key === '3폴') return b.mode === 'multi' && fc === 3;
      return b.mode === 'multi' && fc >= 4;
    });
    const profit   = g.reduce((s,b) => s + (b.profit||0), 0);
    const invested = g.reduce((s,b) => s + (b.amount||0), 0);
    const roi      = invested > 0 ? profit / invested * 100 : null;
    const cumEv    = g.reduce((s,b) => {
      if (b.ev != null) return s + (b.amount||0) * b.ev;
      if (b.myProb && b.betmanOdds) return s + (b.amount||0) * ((b.myProb/100)*(b.betmanOdds-1) - (1-b.myProb/100));
      return s;
    }, 0);
    return { key, count: g.length, profit, invested, roi, cumEv };
  }).filter(d => d.count > 0);

  // ── 종목별 ──
  const sportMap = {};
  resolved.forEach(b => {
    const sports = (b.sport || '기타').split(', ');
    sports.forEach(sp => {
      if (!sportMap[sp]) sportMap[sp] = { profit:0, invested:0, count:0 };
      sportMap[sp].profit   += (b.profit||0) / sports.length;
      sportMap[sp].invested += (b.amount||0) / sports.length;
      sportMap[sp].count++;
    });
  });
  const sportRoi = Object.entries(sportMap)
    .map(([sp,d]) => ({ sp, roi: d.invested>0 ? d.profit/d.invested*100 : 0, count: d.count }))
    .sort((a,b) => b.roi - a.roi);
  const bestSport  = sportRoi[0] || null;
  const worstSport = sportRoi[sportRoi.length-1] || null;

  // ── 예측 베팅 ──
  const predBets = resolved.filter(b => b.myProb && b.betmanOdds);
  const predEdge = predBets.length > 0
    ? predBets.reduce((s,b) => s + (b.myProb - 100/b.betmanOdds), 0) / predBets.length : null;
  const actualEdgeVal = predBets.length > 0
    ? predBets.filter(b=>b.result==='WIN').length/predBets.length*100
      - predBets.reduce((s,b)=>s+100/b.betmanOdds,0)/predBets.length : null;

  // ── EV 신뢰도 — ev 필드 없으면 myProb·betmanOdds로 추정 ──
  const evBets = resolved.filter(b => {
    if (b.ev != null) return true;
    if (b.myProb && b.betmanOdds) return true;
    return false;
  });
  const cumEvTotal = evBets.reduce((s,b) => {
    const ev = b.ev != null ? b.ev : (b.myProb/100*(b.betmanOdds-1))-(1-b.myProb/100);
    return s + (b.amount||0) * ev;
  }, 0);
  const cumProfitEv = evBets.reduce((s,b) => s + (b.profit||0), 0);
  const evTrust = cumEvTotal !== 0 ? cumProfitEv / Math.abs(cumEvTotal) * 100 : null;

  // ── 트렌드 (10건 단위) ──
  const trendData = [], trendLabels = [];
  for (let i = 0; i < predBets.length; i += 10) {
    const chunk = predBets.slice(i, i+10);
    trendLabels.push(`${i+1}~${Math.min(i+10,predBets.length)}`);
    trendData.push(parseFloat((chunk.reduce((s,b)=>s+(b.myProb-100/b.betmanOdds),0)/chunk.length).toFixed(1)));
  }
  const recent10pred = predBets.slice(-10);
  const recentEdge = recent10pred.length > 0
    ? recent10pred.reduce((s,b)=>s+(b.myProb-100/b.betmanOdds),0)/recent10pred.length : null;

  // ── 배당 구간 ──
  const oddsRanges = [
    {label:'1.3~1.7',min:1.3,max:1.7},
    {label:'1.7~2.2',min:1.7,max:2.2},
    {label:'2.2~2.8',min:2.2,max:2.8},
    {label:'2.8~3.5',min:2.8,max:3.5},
    {label:'3.5+',  min:3.5,max:99}
  ];
  const oddsData = oddsRanges.map(r => {
    const g = predBets.filter(b => b.betmanOdds >= r.min && b.betmanOdds < r.max);
    if (!g.length) return null;
    const myAvg   = g.reduce((s,b)=>s+b.myProb,0) / g.length;
    const implAvg = g.reduce((s,b)=>s+100/b.betmanOdds,0) / g.length;
    const actWr   = g.filter(b=>b.result==='WIN').length / g.length * 100;
    return { label:r.label, count:g.length, edge:myAvg-implAvg, actualEdge:actWr-implAvg, actualWr:actWr, implAvg };
  }).filter(Boolean);

  // ── 낙관 편향 MA5 ──
  const biasMA = [], biasLabels = [];
  predBets.forEach((b,i) => {
    const sl = predBets.slice(Math.max(0,i-4), i+1);
    const myAvgSl  = sl.reduce((s,x)=>s+x.myProb,0)/sl.length;
    const actWrSl  = sl.filter(x=>x.result==='WIN').length/sl.length*100;
    biasMA.push(parseFloat((myAvgSl - actWrSl).toFixed(1)));
    biasLabels.push(i+1);
  });
  const avgBias = biasMA.length > 0 ? biasMA.reduce((s,v)=>s+v,0)/biasMA.length : null;
  const lastBias = biasMA.length > 0 ? biasMA[biasMA.length-1] : null;

  // ── KPI 업데이트 ──
  const sp = (idV,idL,val,lbl,c) => {
    const v=document.getElementById(idV), l=document.getElementById(idL);
    if(v){v.textContent=val; if(c)v.style.color=c;}
    if(l)l.textContent=lbl;
  };
  if (predEdge !== null)
    sp('judge-pred-edge','judge-pred-edge-label',
      (predEdge>=0?'+':'')+predEdge.toFixed(1)+'%p',
      `${predBets.length}건 · 실현 ${actualEdgeVal!==null?(actualEdgeVal>=0?'+':'')+actualEdgeVal.toFixed(1)+'%p':'—'}`,
      predEdge>=5?'var(--green)':predEdge>=0?'var(--gold)':'var(--red)');
  if (evTrust !== null)
    sp('judge-ev-trust','judge-ev-trust-label',
      evTrust.toFixed(0)+'%',
      `EV 추정 ${evBets.length}건`,
      evTrust>=80?'var(--green)':evTrust>=40?'var(--gold)':'var(--red)');
  if (folderData.length > 0) {
    const bf = [...folderData].sort((a,b)=>(b.roi||0)-(a.roi||0))[0];
    sp('judge-best-folder','judge-best-folder-label', bf.key,
      `ROI ${bf.roi!=null?(bf.roi>=0?'+':'')+bf.roi.toFixed(1)+'%':'—'} · ${bf.count}건`, 'var(--green)');
  }
  if (bestSport)
    sp('judge-best-sport','judge-best-sport-label',
      bestSport.sp.length>5?bestSport.sp.slice(0,5)+'…':bestSport.sp,
      `ROI ${bestSport.roi>=0?'+':''}${bestSport.roi.toFixed(1)}%`, 'var(--accent)');
  if (recentEdge !== null) {
    const delta = predEdge !== null ? recentEdge - predEdge : 0;
    sp('judge-trend-val','judge-trend-label',
      (recentEdge>=0?'+':'')+recentEdge.toFixed(1)+'%p',
      `전체 대비 ${delta>=0?'+':''}${delta.toFixed(1)}%p ${delta>=1?'📈':delta<=-1?'📉':'➡️'}`,
      recentEdge>=(predEdge||0)?'var(--green)':'var(--red)');
  }
  if (avgBias !== null)
    sp('judge-bias-val','judge-bias-label',
      (avgBias>=0?'+':'')+avgBias.toFixed(1)+'%p',
      lastBias!==null&&lastBias<-5?'비관 편향으로 전환':avgBias>10?'낙관 편향 강함':avgBias>3?'약한 낙관 편향':'편향 적음',
      lastBias!==null&&lastBias<-5?'var(--accent)':avgBias>10?'var(--red)':avgBias>3?'var(--gold)':'var(--green)');

  // ── 차트 1: 폴더별 수익 vs EV ──
  charts.judgeFolder = safeCreateChart('judge-folder-chart', {
    type:'bar',
    data:{
      labels: folderData.map(d=>`${d.key}(${d.count})`),
      datasets:[
        { type:'bar',  label:'실제 수익', data:folderData.map(d=>d.profit),
          backgroundColor:folderData.map(d=>d.profit>=0?'rgba(0,230,118,0.75)':'rgba(255,59,92,0.75)'), borderRadius:5 },
        { type:'line', label:'누적 기댓값', data:folderData.map(d=>d.cumEv),
          borderColor:'#ffd700', borderWidth:2, pointRadius:4, fill:false, tension:0.3 }
      ]
    },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#8892a4',font:{size:10}}}},
      scales:{
        x:{ticks:{color:'#8892a4',font:{size:10}},grid:{color:'rgba(30,45,69,0.5)'}},
        y:{ticks:{color:'#8892a4',font:{size:10},callback:v=>(v>=0?'+':'')+'₩'+(v/10000).toFixed(0)+'만'},grid:{color:'rgba(30,45,69,0.5)'}}
      }}
  });

  // ── 차트 2: 예측 승률 vs 실제 MA5 ──
  if (predBets.length >= 3) {
    const myMA=[], implMA=[], actMA=[], pL=[];
    predBets.forEach((b,i) => {
      const sl = predBets.slice(Math.max(0,i-4),i+1);
      pL.push(i+1);
      myMA.push(sl.reduce((s,x)=>s+x.myProb,0)/sl.length);
      implMA.push(sl.reduce((s,x)=>s+100/x.betmanOdds,0)/sl.length);
      actMA.push(sl.filter(x=>x.result==='WIN').length/sl.length*100);
    });
    charts.judgePred = safeCreateChart('judge-pred-chart', {
      type:'line',
      data:{ labels:pL, datasets:[
        { label:'내 예측 MA5',    data:myMA,   borderColor:'#ffd700', borderWidth:2, pointRadius:2, fill:false, tension:0.4 },
        { label:'북메이커',       data:implMA, borderColor:'rgba(255,152,0,0.5)', borderWidth:1.5, borderDash:[4,3], pointRadius:0, fill:false, tension:0.4 },
        { label:'실제 적중률 MA5',data:actMA,  borderColor:'#00e676', borderWidth:2, pointRadius:2, fill:false, tension:0.4 }
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{legend:{labels:{color:'#8892a4',font:{size:10}}}},
        scales:{ x:{ticks:{color:'#8892a4',font:{size:10}},grid:{color:'rgba(30,45,69,0.5)'}},
          y:{min:0,max:100,ticks:{color:'#8892a4',font:{size:10},callback:v=>v+'%'},grid:{color:'rgba(30,45,69,0.5)'}} }}
    });
  }

  // ── 차트 3: 판단력 트렌드 ──
  if (trendData.length >= 2) {
    charts.judgeTrend = safeCreateChart('judge-trend-chart', {
      type:'line',
      data:{ labels:trendLabels, datasets:[
        { label:'구간별 엣지', data:trendData, borderColor:'#64b5f6', backgroundColor:'rgba(100,181,246,0.1)', borderWidth:2, pointRadius:4, fill:true, tension:0.3 },
        { label:'전체 평균',   data:Array(trendData.length).fill(predEdge?parseFloat(predEdge.toFixed(1)):0), borderColor:'rgba(255,215,0,0.4)', borderWidth:1.5, borderDash:[4,3], pointRadius:0, fill:false }
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{legend:{labels:{color:'#8892a4',font:{size:10}}}},
        scales:{ x:{ticks:{color:'#8892a4',font:{size:9}},grid:{color:'rgba(30,45,69,0.5)'}},
          y:{ticks:{color:'#8892a4',font:{size:10},callback:v=>(v>=0?'+':'')+v+'%p'},grid:{color:'rgba(30,45,69,0.5)'}} }}
    });
  }

  // ── 차트 4: 배당 구간별 정확도 ──
  if (oddsData.length > 0) {
    charts.judgeOdds = safeCreateChart('judge-odds-chart', {
      type:'bar',
      data:{ labels:oddsData.map(d=>`${d.label}(${d.count})`), datasets:[
        { label:'내 예측 엣지', data:oddsData.map(d=>d.edge),
          backgroundColor:oddsData.map(d=>d.edge>=0?'rgba(0,229,255,0.6)':'rgba(255,152,0,0.6)'), borderRadius:4 },
        { label:'실제 엣지',   data:oddsData.map(d=>d.actualEdge),
          backgroundColor:oddsData.map(d=>d.actualEdge>=0?'rgba(0,230,118,0.7)':'rgba(255,59,92,0.7)'), borderRadius:4 }
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{legend:{labels:{color:'#8892a4',font:{size:10}}}},
        scales:{ x:{ticks:{color:'#8892a4',font:{size:9}},grid:{color:'rgba(30,45,69,0.5)'}},
          y:{ticks:{color:'#8892a4',font:{size:10},callback:v=>(v>=0?'+':'')+v.toFixed(1)+'%p'},grid:{color:'rgba(30,45,69,0.5)'}} }}
    });
  }

  // ── 차트 5: 낙관 편향 추이 — 양수(낙관)/음수(비관) 색 분리 ──
  if (biasMA.length >= 3) {
    // 구간 컬러 플러그인 없이 처리 — 양수면 주황, 음수면 파랑 두 데이터셋 분리
    const biasPos = biasMA.map(v => v >= 0 ? v : null);
    const biasNeg = biasMA.map(v => v <  0 ? v : null);
    charts.judgeBias = safeCreateChart('judge-bias-chart', {
      type:'line',
      data:{ labels:biasLabels, datasets:[
        { label:'낙관 편향(+)', data:biasPos, borderColor:'#ff6b35', backgroundColor:'rgba(255,107,53,0.08)',
          borderWidth:2, pointRadius:2, fill:true, tension:0.4, spanGaps:false },
        { label:'비관 편향(−)', data:biasNeg, borderColor:'#64b5f6', backgroundColor:'rgba(100,181,246,0.08)',
          borderWidth:2, pointRadius:2, fill:true, tension:0.4, spanGaps:false },
        { label:'기준(0)', data:Array(biasMA.length).fill(0),
          borderColor:'rgba(255,255,255,0.2)', borderWidth:1, borderDash:[3,3], pointRadius:0, fill:false }
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{legend:{labels:{color:'#8892a4',font:{size:10}}}},
        scales:{ x:{ticks:{color:'#8892a4',font:{size:10}},grid:{color:'rgba(30,45,69,0.5)'}},
          y:{ticks:{color:'#8892a4',font:{size:10},callback:v=>(v>=0?'+':'')+v+'%p'},grid:{color:'rgba(30,45,69,0.5)'}} }}
    });
  }

  // ── 교차표 ──
  const crossEl = document.getElementById('judge-cross-table');
  if (crossEl) {
    const sportList = Object.keys(sportMap).filter(sp => sportMap[sp].count >= 2);
    const fkeys = ['단폴','2폴','3폴','4폴+'];
    if (sportList.length > 0) {
      const matrix = {};
      resolved.forEach(b => {
        const fc = b.mode !== 'multi' ? '단폴' : parseInt(b.folderCount)>=4 ? '4폴+' : b.folderCount+'폴';
        const sports = (b.sport||'기타').split(', ');
        sports.forEach(sp => {
          if (!matrix[sp]) matrix[sp] = {};
          if (!matrix[sp][fc]) matrix[sp][fc] = { profit:0, invested:0, count:0 };
          matrix[sp][fc].profit   += (b.profit||0) / sports.length;
          matrix[sp][fc].invested += (b.amount||0) / sports.length;
          matrix[sp][fc].count++;
        });
      });
      // 실제 데이터에 있는 폴더만 컬럼으로
      const activeFkeys = fkeys.filter(k => sportList.some(sp => matrix[sp] && matrix[sp][k]));
      let html = `<table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead><tr><th style="padding:6px 10px;text-align:left;color:var(--text3);border-bottom:1px solid var(--border);">종목</th>`;
      activeFkeys.forEach(k => { html += `<th style="padding:6px 10px;text-align:center;color:var(--text3);border-bottom:1px solid var(--border);">${k}</th>`; });
      html += '</tr></thead><tbody>';
      sportList.forEach(sp => {
        html += `<tr><td style="padding:6px 10px;color:var(--text2);font-weight:600;border-bottom:1px solid rgba(255,255,255,0.04);">${sp}</td>`;
        activeFkeys.forEach(k => {
          const cell = matrix[sp] && matrix[sp][k];
          if (!cell || !cell.count) { html += `<td style="padding:6px 10px;text-align:center;color:var(--text3);border-bottom:1px solid rgba(255,255,255,0.04);">—</td>`; return; }
          const roi = cell.invested > 0 ? cell.profit/cell.invested*100 : 0;
          const bg = roi>=10?'rgba(0,230,118,0.15)':roi>=0?'rgba(0,230,118,0.06)':roi>=-10?'rgba(255,59,92,0.08)':'rgba(255,59,92,0.18)';
          html += `<td style="padding:6px 10px;text-align:center;background:${bg};border-bottom:1px solid rgba(255,255,255,0.04);">
            <div style="color:${roi>=0?'var(--green)':'var(--red)'};font-weight:700;">${roi>=0?'+':''}${roi.toFixed(0)}%</div>
            <div style="color:var(--text3);font-size:10px;">${cell.count}건</div></td>`;
        });
        html += '</tr>';
      });
      crossEl.innerHTML = html + '</tbody></table>';
    } else {
      crossEl.innerHTML = '<span style="color:var(--text3);font-size:12px;">종목별 2건 이상 데이터 필요</span>';
    }
  }

  // ── 액션 제안 (강화) ──
  const actionEl = document.getElementById('judge-action');
  if (actionEl) {
    const actions = [];
    const worstF = folderData.length>0 ? [...folderData].sort((a,b)=>(a.roi||0)-(b.roi||0))[0] : null;
    const bestF  = folderData.length>0 ? [...folderData].sort((a,b)=>(b.roi||0)-(a.roi||0))[0] : null;

    // 폴더별 액션
    if (worstF && worstF.roi !== null && worstF.roi < -20 && worstF.count >= 3)
      actions.push(`🔴 <strong>${worstF.key} 베팅 한도 축소</strong> — ROI ${worstF.roi.toFixed(0)}%, ${worstF.count}건 부진. 이 유형 베팅금을 현재의 <strong>50%로 축소</strong>하세요.`);
    if (bestF && worstF && bestF.key !== worstF.key && bestF.roi !== null && bestF.roi > 10)
      actions.push(`🟢 <strong>${bestF.key}에 집중</strong> — ROI ${bestF.roi.toFixed(0)}%. 전체 베팅의 ${Math.min(70, Math.round(bestF.roi/2+30))}% 이상 비중을 늘리세요.`);

    // 종목별 액션
    if (worstSport && worstSport.roi < -30 && worstSport.count >= 3)
      actions.push(`🔴 <strong>${worstSport.sp} 베팅 중단 검토</strong> — ROI ${worstSport.roi.toFixed(0)}%, ${worstSport.count}건 부진. <strong>최소 2주 중단 후</strong> 원인 분석 권장.`);
    if (bestSport && bestSport.roi > 20 && bestSport.count >= 3)
      actions.push(`🟢 <strong>${bestSport.sp} 강점 종목</strong> — ROI ${bestSport.roi.toFixed(0)}%, ${bestSport.count}건. 이 종목 비중 확대 고려.`);

    // 배당 구간별 액션 (강화)
    const worstOdds = oddsData.length>0 ? [...oddsData].sort((a,b)=>a.actualEdge-b.actualEdge)[0] : null;
    const bestOdds  = oddsData.length>0 ? [...oddsData].sort((a,b)=>b.actualEdge-a.actualEdge)[0] : null;
    if (worstOdds && worstOdds.actualEdge < -15 && worstOdds.count >= 3)
      actions.push(`🔴 <strong>${worstOdds.label} 배당대 주의</strong> — 실제 엣지 ${worstOdds.actualEdge.toFixed(0)}%p, ${worstOdds.count}건. 예측 승률 ${worstOdds.implAvg.toFixed(0)}%보다 ${Math.abs(worstOdds.actualEdge).toFixed(0)}%p 낮게 실현 중. <strong>이 배당대 베팅 기준을 높이거나 잠시 쉬세요.</strong>`);
    // 3.5+ 고배당 전용 경고
    const highOdds = oddsData.find(d => d.label === '3.5+');
    if (highOdds && highOdds.count >= 3) {
      if (highOdds.actualEdge < -10)
        actions.push(`⚠️ <strong>3.5+ 고배당 경고</strong> — 실제 적중률 ${highOdds.actualWr.toFixed(0)}% vs 내 예측 평균 훨씬 높음. 고배당에서 승률을 체계적으로 과대 추정하고 있을 가능성이 있습니다. EV+ 판단 재검토 필요.`);
      else if (highOdds.actualEdge > 10)
        actions.push(`🟢 <strong>3.5+ 고배당 강점</strong> — 실제 엣지 +${highOdds.actualEdge.toFixed(0)}%p. 고배당 베팅에서 정보 우위가 있습니다.`);
    }
    if (bestOdds && bestOdds.actualEdge > 10 && bestOdds.count >= 3 && bestOdds.label !== '3.5+')
      actions.push(`🟢 <strong>${bestOdds.label} 배당대 강점</strong> — 실제 엣지 +${bestOdds.actualEdge.toFixed(0)}%p, ${bestOdds.count}건. 이 배당대 비중을 늘리세요.`);

    // 낙관 편향 액션
    if (avgBias !== null && avgBias > 10)
      actions.push(`🟡 <strong>예측 승률 하향 조정 필요</strong> — 평균 낙관 편향 ${avgBias.toFixed(1)}%p. EV 계산 시 내 예상에서 <strong>${Math.round(avgBias*0.6)}~${Math.round(avgBias*0.8)}%p를 깎아서</strong> 입력하세요.`);
    // 비관 편향 전환 감지
    if (lastBias !== null && lastBias < -5 && avgBias !== null && avgBias > 0)
      actions.push(`🔵 <strong>최근 비관 편향으로 전환</strong> — 최근 MA5 ${lastBias.toFixed(1)}%p. 전체 평균은 낙관이었으나 최근 들어 승률을 보수적으로 보고 있습니다. 괜찮은 신호일 수 있으나, EV+ 기회를 놓치지 않도록 주의하세요.`);

    // 판단력 트렌드 액션
    if (recentEdge !== null && predEdge !== null) {
      if (recentEdge > predEdge + 3)
        actions.push(`📈 <strong>판단력 개선 중</strong> — 최근 10건 엣지 ${recentEdge.toFixed(1)}%p (전체 대비 +${(recentEdge-predEdge).toFixed(1)}%p). 현재 방식 유지하고 베팅 규모를 <strong>점진적으로 늘려도 됩니다.</strong>`);
      else if (recentEdge < predEdge - 3)
        actions.push(`📉 <strong>판단력 저하 감지</strong> — 최근 10건 엣지 ${recentEdge.toFixed(1)}%p (전체 대비 ${(recentEdge-predEdge).toFixed(1)}%p). <strong>베팅 규모를 줄이고</strong> 최근 미적중 패턴을 분석하세요.`);
    }

    // 샘플 경고
    if (resolved.length < 30)
      actions.push(`ℹ️ <strong>샘플 부족 (${resolved.length}건)</strong> — 위 제안은 참고용. 30건 이상부터 신뢰도가 높아집니다.`);

    actionEl.innerHTML = actions.length > 0
      ? `<div style="font-size:12px;font-weight:700;color:var(--accent);margin-bottom:10px;">⚡ 지금 바로 실행할 액션</div>`
        + actions.map(a=>`<div style="padding:7px 0;border-bottom:1px solid rgba(0,229,255,0.08);font-size:12px;line-height:1.8;">${a}</div>`).join('')
      : `<div style="font-size:12px;color:var(--green);">✅ 현재 특별한 이상 신호 없음 — 현재 방식을 유지하세요.</div>`;
  }

  // ── 종합 진단 ──
  const diagEl = document.getElementById('judge-diagnosis');
  if (!diagEl) return;
  const lines = [];
  const filterLabel = judgeFilter === 'all' ? '전체' : `최근 ${judgeFilter}건`;
  lines.push(`📋 <strong>분석 범위: ${filterLabel} (${resolved.length}건 기준)</strong>`);
  if (predEdge !== null)
    lines.push(predEdge>=5
      ? `✅ <strong>예측 엣지 우수 (+${predEdge.toFixed(1)}%p)</strong> — 실현 엣지 ${actualEdgeVal!==null?(actualEdgeVal>=0?'+':'')+actualEdgeVal.toFixed(1)+'%p':'미집계'}.`
      : predEdge>=0
      ? `🟡 <strong>예측 엣지 소폭 (+${predEdge.toFixed(1)}%p)</strong> — 더 많은 샘플에서 일관성 확인 필요.`
      : `⚠️ <strong>예측 역엣지 (${predEdge.toFixed(1)}%p)</strong> — 승률 추정 방식을 점검하세요.`);
  if (evTrust !== null)
    lines.push(evTrust>=80
      ? `✅ <strong>EV 신뢰도 높음 (${evTrust.toFixed(0)}%)</strong> — 기댓값이 실제로 잘 실현되고 있습니다.`
      : evTrust>=30
      ? `🟡 <strong>EV 신뢰도 보통 (${evTrust.toFixed(0)}%)</strong> — 배당·승률 입력을 점검하세요.`
      : `❌ <strong>EV 신뢰도 낮음 (${evTrust.toFixed(0)}%)</strong> — 승률 과대 추정 가능성.`);
  if (folderData.length > 0) {
    const bf = [...folderData].sort((a,b)=>(b.roi||0)-(a.roi||0))[0];
    const wf = [...folderData].sort((a,b)=>(a.roi||0)-(b.roi||0))[0];
    if (bf.key !== wf.key)
      lines.push(`📦 <strong>폴더별 ROI</strong> — ${bf.key} 최고(${bf.roi!=null?(bf.roi>=0?'+':'')+bf.roi.toFixed(1)+'%':'—'}), ${wf.key} 최저(${wf.roi!=null?(wf.roi>=0?'+':'')+wf.roi.toFixed(1)+'%':'—'}).`);
  }
  if (avgBias !== null) {
    if (lastBias !== null && lastBias < -5 && avgBias > 0)
      lines.push(`🔵 <strong>편향 전환 감지</strong> — 전체 낙관 편향 평균 ${avgBias.toFixed(1)}%p이나 최근 MA5 ${lastBias.toFixed(1)}%p로 비관 전환. 승률 추정이 보수화되는 중입니다.`);
    else
      lines.push(`🔮 <strong>낙관 편향 ${avgBias.toFixed(1)}%p</strong> — ${avgBias>10?'승률 지속 과대 추정.':avgBias>3?'약한 낙관 편향.':'편향 적음. 예측이 현실적입니다.'}`);
  }
  if (recentEdge !== null && predEdge !== null) {
    const d = recentEdge - predEdge;
    lines.push(`📊 <strong>판단력 트렌드</strong> — 최근 10건 ${recentEdge.toFixed(1)}%p (${d>=0?'+':''}${d.toFixed(1)}%p). ${d>=2?'실력 향상 중.':d<=-2?'최근 저하. 원인 분석 필요.':'안정적.'}`);
  }
  if (resolved.length < 30)
    lines.push(`ℹ️ <strong>샘플 ${resolved.length}건</strong> — 30건 이상부터 신뢰도가 높아집니다.`);
  diagEl.innerHTML = lines.map(l=>`<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">${l}</div>`).join('') || '<span style="color:var(--text3);">데이터 분석 중...</span>';
}

function updateAnalyzeChart() {
  const resolved  = bets.filter(function(b) { return b.result !== 'PENDING'; });
  const wins      = resolved.filter(function(b) { return b.result === 'WIN'; });
  const winRate   = resolved.length > 0 ? wins.length / resolved.length : 0.5;
  const avgOdds   = resolved.length > 0 ? resolved.reduce(function(s,b){return s+(b.betmanOdds||1.9);},0) / resolved.length : 1.9;
  const avgAmt    = resolved.length > 0 ? resolved.reduce(function(s,b){return s+b.amount;},0) / resolved.length : 100000;
  const start     = getCurrentBankroll() || appSettings.startFund || 0;
  const goalTarget = appSettings.targetFund || 0;
  const evPerBet  = (winRate * (avgOdds - 1) - (1 - winRate)) * avgAmt;

  // ── 시드 고정 난수 ──
  function seededRand(seed) {
    var s = (seed || 1) >>> 0;
    return function() {
      s = ((s * 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // ── 예측력 등급 보정 ──
  const _simGrade    = appSettings.kellyGradeAdj ? calcPredGrade() : null;
  const _simMult     = _simGrade ? _simGrade.mult : 1.0;
  const _useRecent   = _simGrade && (_simGrade.letter === 'C' || _simGrade.letter === 'D');
  // C/D 등급이면 최근 30건만 사용 (슬럼프 반영), 아니면 전체
  const _simPool     = _useRecent ? resolved.slice(-30) : resolved;

  // 배너 업데이트
  updateAnalyzeGradeBanner(_simGrade, _simMult, _useRecent, resolved.length);

  // ── 부트스트랩 몬테카를로 1,000회 ──
  const RUNS  = 1000;
  const STEPS = _simPool.length >= 5 ? _simPool.length : 30;
  const seed0 = (_simPool.length * 7919) >>> 0;
  const rand  = seededRand(seed0);

  // 실제 profit 배열 — 등급 보정 배율 적용
  var profitPool = _simPool.length >= 5
    ? _simPool.map(function(b){ return b.profit * _simMult; })
    : null;

  var allPaths   = [];
  var ruinCount  = 0;
  var goalReachSteps = [];
  var maxStreaks = [];

  for (var r = 0; r < RUNS; r++) {
    var bal = 0;
    var path = [0];
    var ruin = false;
    var curStreak = 0; var maxStreak = 0;
    var goalReached = false;

    for (var i = 0; i < STEPS; i++) {
      var profit;
      if (profitPool) {
        // 부트스트랩: 실제 기록에서 무작위 재샘플링
        var idx = Math.floor(rand() * profitPool.length);
        profit = profitPool[idx];
      } else {
        // 기록 부족 시 파라미터 기반 fallback
        profit = rand() < winRate ? avgAmt * (avgOdds - 1) : -avgAmt;
      }
      bal += profit;
      if (profit > 0) { curStreak = 0; }
      else { curStreak++; if (curStreak > maxStreak) maxStreak = curStreak; }
      path.push(Math.round(bal));
      if (!ruin && start + bal <= 0) { ruin = true; ruinCount++; }
      if (!goalReached && goalTarget > 0 && start + bal >= goalTarget) {
        goalReached = true;
        goalReachSteps.push(i + 1);
      }
    }
    allPaths.push(path);
    maxStreaks.push(maxStreak);
  }

  // ── 분위수 추출 ──
  function percentile(arr, p) {
    var sorted = arr.slice().sort(function(a,b){return a-b;});
    var idx = Math.floor(sorted.length * p / 100);
    return sorted[Math.min(idx, sorted.length - 1)];
  }

  var p10 = [], p25 = [], p50 = [], p75 = [], p90 = [];
  for (var step = 0; step <= STEPS; step++) {
    var vals = allPaths.map(function(p){return p[step];});
    p10.push(percentile(vals, 10));
    p25.push(percentile(vals, 25));
    p50.push(percentile(vals, 50));
    p75.push(percentile(vals, 75));
    p90.push(percentile(vals, 90));
  }

  // ── 실제 기록 ──
  var actualPath = [0];
  var sortedBets = resolved.slice().sort(function(a,b){return (a.date||'').localeCompare(b.date||'');});
  var cum = 0;
  sortedBets.forEach(function(b){ cum += b.profit; actualPath.push(Math.round(cum)); });

  // ── 라벨 ──
  var labels = Array.from({length: STEPS + 1}, function(_,i){ return i === 0 ? '시작' : '+' + i + '번'; });

  // ── 시뮬 결과 카드 업데이트 ──
  var ruinProb = (ruinCount / RUNS * 100).toFixed(1);
  var ruinEl = document.getElementById('sim-ruin-prob');
  if (ruinEl) {
    ruinEl.textContent = ruinProb + '%';
    ruinEl.style.color = parseFloat(ruinProb) >= 20 ? 'var(--red)' : parseFloat(ruinProb) >= 10 ? '#ff9800' : 'var(--green)';
  }

  var goalEl = document.getElementById('sim-goal-bets');
  if (goalEl) {
    if (goalReachSteps.length > 0) {
      var medGoal = percentile(goalReachSteps, 50);
      goalEl.textContent = medGoal + '번째';
      goalEl.style.color = 'var(--gold)';
    } else {
      goalEl.textContent = goalTarget > 0 ? '미달' : '—';
      goalEl.style.color = 'var(--text3)';
    }
  }

  var streakEl = document.getElementById('sim-max-streak');
  if (streakEl) {
    var p90streak = percentile(maxStreaks, 90);
    streakEl.textContent = p90streak + '연패';
    streakEl.style.color = p90streak >= 8 ? 'var(--red)' : p90streak >= 5 ? '#ff9800' : 'var(--accent)';
  }

  var ddEl = document.getElementById('sim-max-dd');
  if (ddEl) {
    // 각 경로의 최솟값 추출 → 정렬 → 하위 10% 중 가장 작은 값
    var pathMins = allPaths.map(function(p) {
      return p.reduce(function(m, v) { return v < m ? v : m; }, 0);
    });
    pathMins.sort(function(a, b) { return a - b; });
    var worstMin = pathMins[Math.floor(RUNS * 0.1)] || 0;
    ddEl.textContent = worstMin < 0 ? '-₩' + Math.round(Math.abs(worstMin)).toLocaleString() : '—';
    ddEl.style.color = 'var(--red)';
  }

  // ── 차트 ──
  const analyzePage = document.getElementById('page-analyze');
  if (!analyzePage || !analyzePage.classList.contains('active')) return;

  charts.analyzeChart = safeCreateChart('analyzeChart', {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        // 음영 대신 얇은 범위선만
        {
          label: '불확실 구간 (상단)',
          data: p90,
          borderColor: 'rgba(0,229,255,0.2)',
          borderWidth: 1, pointRadius: 0, tension: 0.4, order: 6
        },
        {
          label: '불확실 구간 (하단)',
          data: p10,
          borderColor: 'rgba(0,229,255,0.2)',
          borderWidth: 1, pointRadius: 0, tension: 0.4, order: 7
        },
        // 비관 25%
        {
          label: '비관 (하위 25%)',
          data: p25,
          borderColor: '#ff9800',
          borderWidth: 1.5, pointRadius: 0, tension: 0.4,
          fill: false, order: 3
        },
        // 최악 10%
        {
          label: '최악 (하위 10%)',
          data: p10,
          borderColor: '#ff3b5c',
          borderWidth: 1.5, pointRadius: 0, tension: 0.4,
          borderDash: [4, 3], fill: false, order: 4
        },
        // 중앙값
        {
          label: '중앙값 (50%)',
          data: p50,
          borderColor: '#c8d6e8',
          borderWidth: 2.5, pointRadius: 0, tension: 0.4,
          fill: false, order: 2
        },
        // 실제 기록
        {
          label: '실제 기록',
          data: actualPath,
          borderColor: '#ffffff',
          borderWidth: 3, pointRadius: 2, pointBackgroundColor: '#fff',
          tension: 0.2, fill: false, order: 1
        },
        // 목표선
        ...(goalTarget > 0 ? [{
          label: '목표 자금',
          data: Array(STEPS + 1).fill(goalTarget - start),
          borderColor: 'rgba(255,215,0,0.7)',
          borderWidth: 1.5, pointRadius: 0,
          borderDash: [8, 4], fill: false, order: 7
        }] : [])
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true, position: 'bottom',
          labels: {
            color: '#8892a4', font: { size: 10 }, boxWidth: 20, padding: 12,
            filter: function(item) {
              return item.text !== '불확실 구간 (상단)' && item.text !== '불확실 구간 (하단)';
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              if (ctx.parsed.y == null) return null;
              return ctx.dataset.label + ': ' + (ctx.parsed.y >= 0 ? '+' : '') + '₩' + ctx.parsed.y.toLocaleString();
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: '#8892a4', font: { size: 9 }, maxTicksLimit: 10 }, grid: { display: false } },
        y: {
          ticks: { color: '#8892a4', font: { size: 10 }, callback: function(v) { return (v >= 0 ? '+' : '') + '₩' + (v/10000).toFixed(0) + '만'; } },
          grid: { color: 'rgba(255,255,255,0.04)' }
        }
      }
    }
  });

  updateAnalyzeDirection(winRate, evPerBet, avgOdds);
  updateAnalyzeRisk(winRate, avgOdds, avgAmt, start, goalTarget);
}


function updateAnalyzeGradeBanner(grade, mult, useRecent, totalCount) {
  const banner = document.getElementById('analyze-grade-banner');
  if (!banner) return;
  if (!grade || !appSettings.kellyGradeAdj) { banner.style.display = 'none'; return; }
  const rgbMap = {S:'255,215,0', A:'0,230,118', B:'0,229,255', C:'255,152,0', D:'255,59,92'};
  banner.style.display = 'flex';
  banner.style.background = 'rgba(' + (rgbMap[grade.letter]||'0,229,255') + ',0.07)';
  banner.style.border = '1px solid ' + grade.color + '44';
  const badge = document.getElementById('analyze-grade-badge');
  if (badge) { badge.textContent = grade.letter; badge.style.background = grade.color+'22'; badge.style.color = grade.color; badge.style.border = '2px solid '+grade.color; }
  const title = document.getElementById('analyze-grade-banner-title');
  if (title) { title.textContent = '예측력 '+grade.letter+'등급 보정 시뮬레이션 적용 중'; title.style.color = grade.color; }
  const sub = document.getElementById('analyze-grade-banner-sub');
  if (sub) sub.textContent = '베팅 규모 x'+mult+' 보정'+(useRecent?' · 최근 30건 기준 (C/D등급)':' · 전체 '+totalCount+'건 기준');
  const modeBadge = document.getElementById('analyze-sim-mode-badge');
  if (modeBadge) { modeBadge.textContent = mult===1.0?'보정 없음':'x'+mult+' 적용'; modeBadge.style.background = grade.color+'22'; modeBadge.style.color = grade.color; modeBadge.style.border = '1px solid '+grade.color+'55'; }
  const compare = document.getElementById('analyze-sim-compare');
  if (compare) compare.textContent = mult < 1 ? '⚙️ 설정에서 등급 보정 OFF 시 원래 시뮬 복원' : 'S/A등급 — 풀 베팅 유지';
}

function updateAnalyzeDirection(winRate, evPerBet, avgOdds) {
  const el = document.getElementById('analyze-direction');
  if (!el) return;
  const resolved = bets.filter(function(b){return b.result!=='PENDING';});
  if (resolved.length < 5) { el.innerHTML = '<span style="color:var(--text3)">베팅 5건 이상 필요합니다.</span>'; return; }
  const breakeven = 1 / avgOdds;
  const lines = [];
  if (evPerBet > 0) {
    lines.push('<div style="padding:8px 0;border-bottom:1px solid var(--border);">① <strong style="color:var(--green)">EV+ 베팅 유지</strong> — 현재 베팅 구조는 장기 수익 우위입니다.</div>');
  } else {
    lines.push('<div style="padding:8px 0;border-bottom:1px solid var(--border);">① <strong style="color:var(--red)">EV- 경고</strong> — 현재 배당/승률 구조로는 장기 손실이 예상됩니다. 배당 선택 기준을 높이세요.</div>');
  }
  const minWr = (1 / avgOdds * 100).toFixed(1);
  const curWr = (winRate * 100).toFixed(1);
  const gap   = (winRate * 100 - 1 / avgOdds * 100).toFixed(1);
  lines.push('<div style="padding:8px 0;border-bottom:1px solid var(--border);">② <strong>손익분기 승률 ' + minWr + '%</strong> — 현재 ' + curWr + '% (' + (parseFloat(gap)>=0?'+':'') + gap + '%p)</div>');
  lines.push('<div style="padding:8px 0;">③ 평균 배당 <strong>' + avgOdds.toFixed(2) + '</strong> → ' + (avgOdds >= 1.8 && avgOdds <= 2.2 ? '<span style="color:var(--green)">정배/역배 집중 권장</span>' : avgOdds > 2.2 ? '<span style="color:var(--gold)">고배당 비중 높음 — 분산 고려</span>' : '<span style="color:var(--red)">저배당 — ROI 개선 어려움</span>') + '</div>');
  el.innerHTML = lines.join('');
}

function updateAnalyzeRisk(winRate, avgOdds, avgAmt, start, goalTarget) {
  const el = document.getElementById('analyze-risk');
  if (!el) return;
  const resolved = bets.filter(function(b){return b.result!=='PENDING';});
  if (resolved.length < 5) { el.innerHTML = '<span style="color:var(--text3)">베팅 5건 이상 필요합니다.</span>'; return; }
  const kelly    = Math.max(0, (winRate * (avgOdds - 1) - (1 - winRate)) / (avgOdds - 1));
  const halfKelly = kelly / 2;
  const optAmt   = Math.round(start * halfKelly / 1000) * 1000;
  const kellyStatus = avgAmt <= optAmt * 1.2 ? '<span style="color:var(--green)">적정</span>' : '<span style="color:var(--red)">과다</span>';
  const riskLevel = winRate < 0.45 ? '<span style="color:var(--red)">매우 높음</span>' : winRate < 0.50 ? '<span style="color:var(--gold)">높음</span>' : '<span style="color:var(--green)">보통</span>';
  const profits = resolved.map(function(b){return b.profit;});
  const variance = profits.reduce(function(s,v){return s+Math.pow(v-(profits.reduce(function(a,b){return a+b;},0)/profits.length),2);},0)/profits.length;
  const stddev = Math.sqrt(variance);
  el.innerHTML =
    '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);"><span style="color:var(--text3)">리스크 수준</span><strong>' + riskLevel + '</strong></div>' +
    '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);"><span style="color:var(--text3)">켈리 기준 적정 베팅</span><strong style="color:var(--gold)">₩' + optAmt.toLocaleString() + '</strong></div>' +
    '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);"><span style="color:var(--text3)">현재 평균 베팅</span><strong>' + kellyStatus + ' ₩' + Math.round(avgAmt).toLocaleString() + '</strong></div>' +
    '<div style="display:flex;justify-content:space-between;padding:8px 0;"><span style="color:var(--text3)">베팅당 변동성</span><strong>±₩' + Math.round(stddev).toLocaleString() + '</strong></div>';
}

function getRoundHistory() {
  try { return JSON.parse(localStorage.getItem('edge_round_history') || '[]'); } catch { return []; }
}

function saveRoundHistory(history) {
  localStorage.setItem('edge_round_history', JSON.stringify(history));
}

function updateRoundHistory() {
  const history = getRoundHistory();
  const now = new Date();

  // ── 달력 기준 집계 ──
  function calStats(days) {
    const from = new Date(now.getTime() - days * 86400000);
    const filtered = bets.filter(function(b) {
      if (!b.date || b.result === 'PENDING') return false;
      return new Date(b.date) >= from;
    });
    const wins     = filtered.filter(function(b) { return b.result === 'WIN'; }).length;
    const profit   = filtered.reduce(function(s, b) { return s + (b.profit || 0); }, 0);
    const invested = filtered.reduce(function(s, b) { return s + (b.amount || 0); }, 0);
    const roi      = invested > 0 ? profit / invested * 100 : null;
    return { bets: filtered.length, wins: wins, profit: Math.round(profit), roi: roi };
  }

  function renderCalCard(roiId, detailId, days) {
    const s = calStats(days);
    const roiEl = document.getElementById(roiId);
    const detEl = document.getElementById(detailId);
    if (!roiEl || !detEl) return;
    if (s.bets === 0) {
      roiEl.textContent = '—'; roiEl.style.color = 'var(--text3)';
      detEl.textContent = '베팅 없음';
      return;
    }
    const roiStr = s.roi !== null ? (s.roi >= 0 ? '+' : '') + s.roi.toFixed(1) + '%' : '—';
    roiEl.textContent  = roiStr;
    roiEl.style.color  = s.roi === null ? 'var(--text3)' : s.roi >= 0 ? 'var(--green)' : 'var(--red)';
    detEl.textContent  = s.bets + '건 · ' + (s.profit >= 0 ? '+' : '') + '₩' + Math.abs(s.profit).toLocaleString();
  }

  renderCalCard('rh-cal-7d-roi',  'rh-cal-7d-detail',  7);
  renderCalCard('rh-cal-30d-roi', 'rh-cal-30d-detail', 30);
  renderCalCard('rh-cal-90d-roi', 'rh-cal-90d-detail', 90);

  // ── 회차 기준 집계 ──
  function roundStats(n) {
    const slice = history.slice(-n);
    if (slice.length === 0) return null;
    const totalBets     = slice.reduce(function(s, r) { return s + r.bets; }, 0);
    const totalWins     = slice.reduce(function(s, r) { return s + r.wins; }, 0);
    const totalProfit   = slice.reduce(function(s, r) { return s + r.profit; }, 0);
    const totalInvested = slice.reduce(function(s, r) { return s + r.invested; }, 0);
    const roi = totalInvested > 0 ? totalProfit / totalInvested * 100 : null;
    return { rounds: slice.length, bets: totalBets, wins: totalWins, profit: totalProfit, roi: roi };
  }

  function renderRoundCard(roiId, detailId, n) {
    const s = roundStats(n);
    const roiEl = document.getElementById(roiId);
    const detEl = document.getElementById(detailId);
    if (!roiEl || !detEl) return;
    if (!s) {
      roiEl.textContent = '—'; roiEl.style.color = 'var(--text3)';
      detEl.textContent = '회차 데이터 없음';
      return;
    }
    const roiStr = s.roi !== null ? (s.roi >= 0 ? '+' : '') + s.roi.toFixed(1) + '%' : '—';
    roiEl.textContent = roiStr;
    roiEl.style.color = s.roi === null ? 'var(--text3)' : s.roi >= 0 ? 'var(--green)' : 'var(--red)';
    detEl.textContent = s.rounds + '회차 · ' + s.bets + '건 · ' + (s.profit >= 0 ? '+' : '') + '₩' + Math.abs(s.profit).toLocaleString();
  }

  renderRoundCard('rh-round-3-roi',  'rh-round-3-detail',  3);
  renderRoundCard('rh-round-12-roi', 'rh-round-12-detail', 12);
  renderRoundCard('rh-round-36-roi', 'rh-round-36-detail', 36);

  // ── 습관 교정 피드백 ──
  const feedbackEl = document.getElementById('rh-habit-feedback');
  if (feedbackEl && history.length >= 3) {
    const cal7  = calStats(7);
    const round3 = roundStats(3);
    feedbackEl.style.display = 'block';
    if (cal7.bets === 0 || !round3) {
      feedbackEl.style.display = 'none';
    } else {
      const calRoi   = cal7.roi   || 0;
      const roundRoi = round3.roi || 0;
      const diff = Math.abs(calRoi - roundRoi);
      if (diff <= 1) {
        feedbackEl.style.background = 'rgba(0,230,118,0.08)';
        feedbackEl.style.border     = '1px solid rgba(0,230,118,0.25)';
        feedbackEl.style.color      = 'var(--green)';
        feedbackEl.innerHTML = '✅ 회차 관리 양호 — 달력/회차 기준 ROI 차이 ' + diff.toFixed(1) + '%p 이내입니다. 한 회차 안에 시드를 잘 소진하고 있습니다.';
      } else if (diff <= 3) {
        feedbackEl.style.background = 'rgba(255,215,0,0.08)';
        feedbackEl.style.border     = '1px solid rgba(255,215,0,0.25)';
        feedbackEl.style.color      = 'var(--gold)';
        feedbackEl.innerHTML = '⚠️ 회차 관리 보통 — 달력/회차 기준 ROI 차이 ' + diff.toFixed(1) + '%p. 회차 내 시드 소진 습관을 조금 더 다듬어보세요.';
      } else {
        feedbackEl.style.background = 'rgba(255,59,92,0.08)';
        feedbackEl.style.border     = '1px solid rgba(255,59,92,0.25)';
        feedbackEl.style.color      = 'var(--red)';
        feedbackEl.innerHTML = '❌ 회차 관리 필요 — 달력/회차 기준 ROI 차이 ' + diff.toFixed(1) + '%p. 한 회차 안에 시드를 소진하는 습관을 길러보세요. 회차가 여러 날에 걸치면 성과 측정이 왜곡됩니다.';
      }
    }
  } else if (feedbackEl) {
    feedbackEl.style.display = 'none';
  }

  // ── 회차별 상세 테이블 ──
  const tbody = document.getElementById('rh-table');
  const clearWrap = document.getElementById('rh-clear-wrap');
  if (!tbody) return;

  if (history.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:24px;">시드를 고정하면 회차가 쌓입니다.</td></tr>';
    if (clearWrap) clearWrap.style.display = 'none';
    return;
  }

  if (clearWrap) clearWrap.style.display = 'block';

  tbody.innerHTML = history.slice().reverse().map(function(r) {
    const roiColor = r.roi >= 0 ? 'var(--green)' : 'var(--red)';
    const pnlColor = r.profit >= 0 ? 'var(--green)' : 'var(--red)';
    return '<tr>' +
      '<td class="mono" style="font-weight:700;color:var(--gold);">' + r.round + '회차</td>' +
      '<td style="font-size:11px;">' + (r.startDate || '—') + '</td>' +
      '<td style="font-size:11px;">' + (r.endDate   || '—') + '</td>' +
      '<td class="mono" style="font-size:11px;">₩' + (r.seed || 0).toLocaleString() + '</td>' +
      '<td class="mono">' + r.bets + '건</td>' +
      '<td class="mono" style="color:' + (r.wr >= 50 ? 'var(--green)' : 'var(--red)') + ';">' + r.wr.toFixed(1) + '%</td>' +
      '<td class="mono" style="color:' + pnlColor + ';">' + (r.profit >= 0 ? '+' : '') + '₩' + Math.abs(r.profit).toLocaleString() + '</td>' +
      '<td class="mono" style="font-weight:700;color:' + roiColor + ';">' + (r.roi >= 0 ? '+' : '') + r.roi.toFixed(1) + '%</td>' +
    '</tr>';
  }).join('');
}

function clearRoundHistory() {
  if (!confirm('회차 이력을 전체 삭제합니다. 복구가 불가능합니다. 계속하시겠습니까?')) return;
  localStorage.removeItem('edge_round_history');
  updateRoundHistory();
}


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
function _syncScopeUI() {
  const scope   = getCurrentScope();
  const project = getCurrentProject();
  const round   = getActiveRound();

  // ── 공통 스타일 팩토리 ──
  const ON_DASH  = { background:'var(--accent)',           color:'#000',          borderColor:'var(--accent)' };
  const OFF_DASH = { background:'var(--bg3)',               color:'var(--text2)',   borderColor:'var(--border)' };
  const ON_SET   = { background:'rgba(0,229,255,0.15)',    color:'var(--accent)', border:'1px solid rgba(0,229,255,0.4)' };
  const OFF_SET  = { background:'var(--bg3)',               color:'var(--text2)',  border:'1px solid var(--border)' };

  // ── 대시보드 scope 토글 버튼 (all / round) ──
  const btnAll   = document.getElementById('scope-btn-all');
  const btnRound = document.getElementById('scope-btn-round');
  const label    = document.getElementById('scope-label');
  if (btnAll && btnRound) {
    const applyD = (el, s) => { el.style.background = s.background; el.style.color = s.color; el.style.borderColor = s.borderColor; };
    if (scope === 'round') {
      applyD(btnAll, OFF_DASH); applyD(btnRound, ON_DASH);
      if (label) label.textContent = round ? '(회차 #' + rounds.indexOf(round) + 1 + ')' : '(없음)';
    } else {
      applyD(btnAll, ON_DASH);  applyD(btnRound, OFF_DASH);
      if (label) label.textContent = '';
    }
    // 회차 없으면 round 버튼 비활성화
    if (btnRound) {
      btnRound.disabled      = !round;
      btnRound.style.opacity = round ? '1' : '0.4';
      btnRound.title         = round ? '현재 회차 통계만 보기' : '진행 중인 회차가 없습니다';
    }
  }

  // ── 설정 탭 scope 버튼 ──
  const sBtnAll   = document.getElementById('settings-scope-btn-all');
  const sBtnRound = document.getElementById('settings-scope-btn-round');
  const sInfo     = document.getElementById('settings-scope-current');
  if (sBtnAll && sBtnRound) {
    const applyS = (el, s) => { el.style.background = s.background; el.style.color = s.color; el.style.border = s.border; };
    if (scope === 'round') {
      applyS(sBtnAll, OFF_SET); applyS(sBtnRound, ON_SET);
      if (sInfo) sInfo.textContent = round ? '현재 적용: 회차 ' + round.id + ' (남은 시드 ₩' + (round.remaining || 0).toLocaleString() + ')' : '현재 적용: 회차 (없음)';
    } else {
      applyS(sBtnAll, ON_SET);  applyS(sBtnRound, OFF_SET);
      if (sInfo) sInfo.textContent = '현재 적용: 전체 베팅 기록';
    }
    if (sBtnRound) {
      sBtnRound.disabled      = !round;
      sBtnRound.style.opacity = round ? '1' : '0.4';
    }
  }

  // ── 회차 상태 패널 갱신 (있으면) ──
  _syncRoundStatusUI();
}

// ============================================================
// ▶ storage 이벤트 리스너 — scope 전환 / 외부 탭 변경 감지
//   switchScope()가 dispatchEvent(new Event('storage'))를 발생시키면
//   여기서 받아 refreshAllUI()를 호출한다.
//   단, 연속 호출 방지를 위해 100ms 디바운스 적용.
// ============================================================
// ============================================================
// ▶ _syncRoundStatusUI() — 회차 상태 패널 렌더
//   #round-status-panel (settings.js 또는 index.html에 존재)을 갱신.
//   _syncScopeUI 내부에서 항상 호출됨.
// ============================================================
function _syncRoundStatusUI() {
  const round = getActiveRound();

  // ── 상태 텍스트 ──
  const statusEl  = document.getElementById('round-status-text');
  const seedEl    = document.getElementById('round-status-seed');
  const remEl     = document.getElementById('round-status-remaining');
  const barEl     = document.getElementById('round-status-bar');
  const lockBtn   = document.getElementById('round-lock-btn');
  const closeBtn  = document.getElementById('round-close-btn');

  if (round) {
    const pct = round.seed > 0 ? Math.max(0, round.remaining / round.seed * 100) : 0;
    const barColor = pct > 50 ? 'var(--green)' : pct > 20 ? 'var(--gold)' : 'var(--red)';

    if (statusEl)  { statusEl.textContent = '🔒 LOCKED — 진행 중'; statusEl.style.color = 'var(--green)'; }
    if (seedEl)    seedEl.textContent  = '₩' + round.seed.toLocaleString();
    if (remEl)     { remEl.textContent = '₩' + round.remaining.toLocaleString(); remEl.style.color = barColor; }
    if (barEl)     { barEl.style.width = pct.toFixed(1) + '%'; barEl.style.background = barColor; }
    if (lockBtn)   { lockBtn.disabled = true;  lockBtn.style.opacity = '0.4'; }
    if (closeBtn)  { closeBtn.disabled = false; closeBtn.style.opacity = '1'; }
  } else {
    if (statusEl)  { statusEl.textContent = '⏹ UNLOCKED — 회차 없음'; statusEl.style.color = 'var(--text3)'; }
    if (seedEl)    seedEl.textContent  = '—';
    if (remEl)     { remEl.textContent = '—'; remEl.style.color = 'var(--text3)'; }
    if (barEl)     { barEl.style.width = '0%'; barEl.style.background = 'var(--border)'; }
    if (lockBtn)   { lockBtn.disabled = false; lockBtn.style.opacity = '1'; }
    if (closeBtn)  { closeBtn.disabled = true;  closeBtn.style.opacity = '0.4'; }
  }

  // ── 회차 목록 (이력) ──
  const histEl = document.getElementById('round-history-list');
  if (histEl && rounds.length > 0) {
    histEl.innerHTML = [...rounds].reverse().map((r, i) => {
      const idx      = rounds.length - i;
      const usedPct  = r.seed > 0 ? ((r.seed - r.remaining) / r.seed * 100).toFixed(0) : 0;
      const statusBadge = r.status === 'LOCKED'
        ? '<span style="color:var(--green);font-weight:700;">🔒 진행 중</span>'
        : '<span style="color:var(--text3);">⏹ 종료</span>';
      const startDate = r.createdAt ? r.createdAt.split('T')[0] : '—';
      const endDate   = r.closedAt  ? r.closedAt.split('T')[0]  : '—';
      return `<tr style="border-bottom:1px solid var(--border);">
        <td style="padding:8px 6px;font-size:11px;color:var(--text3);">${idx}회차</td>
        <td style="padding:8px 6px;font-size:11px;">₩${r.seed.toLocaleString()}</td>
        <td style="padding:8px 6px;font-size:11px;color:${r.remaining > 0 ? 'var(--text2)' : 'var(--red)'};">₩${r.remaining.toLocaleString()}</td>
        <td style="padding:8px 6px;font-size:11px;color:var(--text3);">${usedPct}%</td>
        <td style="padding:8px 6px;font-size:11px;">${statusBadge}</td>
        <td style="padding:8px 6px;font-size:10px;color:var(--text3);">${startDate} ~ ${endDate}</td>
      </tr>`;
    }).join('');
  } else if (histEl) {
    histEl.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:16px;font-size:12px;">회차 기록 없음</td></tr>';
  }
}

(function _initStorageListener() {
  let _debounceTimer = null;

  window.addEventListener('storage', function () {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(function () {
      // bets 배열 최신화 (다른 탭에서 변경된 경우 대비)
      try {
        const raw = JSON.parse(localStorage.getItem('edge_bets') || '[]');
        if (Array.isArray(raw)) {
          bets.length = 0;
          raw.forEach(b => bets.push({ projectId: b.projectId || 'default', ...b }));
        }
      } catch (e) { /* 파싱 실패 시 기존 bets 유지 */ }

      // rounds 배열 최신화
      try {
        const rawR = JSON.parse(localStorage.getItem('edge_rounds') || '[]');
        if (Array.isArray(rawR)) {
          rounds.length = 0;
          rawR.forEach(r => rounds.push(r));
        }
      } catch (e) { /* 파싱 실패 시 기존 rounds 유지 */ }

      refreshAllUI();
    }, 100);
  });
}());
