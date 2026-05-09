
// ── 의존성 순서 검증 ─────────────────────────────────────────
// round.js, scope.js가 state.js 이전에 로드되지 않으면 즉시 감지
console.assert(typeof getActiveRound  === 'function', '[state.js] round.js not loaded — check script order');
console.assert(typeof getCurrentScope === 'function', '[state.js] scope.js not loaded — check script order');

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
  const raw = Storage.get(KEYS.BETS);
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
    Storage.set(KEYS.BETS, JSON.stringify(state));
  } catch (e) {
    console.error('[state] localStorage write failed', e);
  }
}

// ── getState — 캐시 경유 단일 읽기 경로 ─────────────────────
function _getState() {
  if (!_state) _state = _loadState();
  return _state;
}

// ── 멀티탭 캐시 무효화 + gate 재평가 ────────────────────────
// browser runtime side effect — test/SSR 환경에서는 실행되지 않아야 함
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    try {
      _state = null;
      const formVisible = document.getElementById('r-amount') !== null;
      if (formVisible && typeof recomputeGate === 'function') {
        recomputeGate();
      }
    } catch (err) {
      console.warn('[state] storage 이벤트 처리 실패:', err);
    }
  });
}

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

  // 전체 데이터 초기화 시 Kelly 히스테리시스 상태도 리셋
  if (nextBets.length === 0) {
    if (window.App) window.App.kellyPrevMultiplier = 1.0;
  }

  // 불변성 보장 (참조 차단)
  const cloned = nextBets.map(b => ({ ...b }));

  // ── finSeason normalize ───────────────────────────────────
  // 모든 저장 경로(manual/restore/csv/ocr/gdrive)를 단일 지점에서 처리
  // isSim: true 기록은 finSeason: -1 고정 (덮어쓰기 금지)
  // 손상 데이터(amount===0 && profit===0): finSeason: 0 (legacy)
  // 그 외 finSeason 미설정/오염값: currentFinSeason 부여
  const _curSeason = (Number.isInteger(getSettings().currentFinSeason) && getSettings().currentFinSeason >= 1)
    ? getSettings().currentFinSeason
    : 1;
  cloned.forEach(b => {
    if (b.isSim === true) {
      b.finSeason = -1; // 시뮬 기록: 항상 -1 고정
      return;
    }
    if (!Number.isInteger(b.finSeason) || b.finSeason < 0) {
      // finSeason 미설정 또는 오염값(NaN/"abc"/-1 등)
      b.finSeason = (b.amount === 0 && b.profit === 0) ? 0 : _curSeason;
    }
    // finSeason >= 0 && isInteger인 경우 → 기존 값 유지 (정상 데이터)
  });
  // ─────────────────────────────────────────────────────────

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
// ── 탭별 렌더 책임 단일 진입점 ─────────────────────────────
// 새 탭 추가 시 여기만 수정하면 됩니다.
function renderPage(page) {
  switch (page) {
    case 'analysis':
      if (typeof updateStatsAnalysis === 'function') updateStatsAnalysis();
      if (typeof updateTagStats      === 'function') updateTagStats();
      break;
    case 'analysis2':
      if (typeof updateStatsAnalysis === 'function') updateStatsAnalysis();
      break;
    case 'analysis3':
      if (typeof updateStatsAnalysis === 'function') updateStatsAnalysis();
      if (typeof updateEvBias        === 'function') updateEvBias();
      if (typeof updateEvMonthly     === 'function') updateEvMonthly();
      if (typeof updateEvCum         === 'function') updateEvCum();
      break;
    case 'analyze':
      if (typeof updateAnalyzeTab === 'function') updateAnalyzeTab();
      break;
    case 'predict':
      if (typeof updateGoalStats  === 'function') updateGoalStats();
      if (typeof updatePredictTab === 'function') updatePredictTab();
      break;
    case 'predpower':
      if (typeof updatePredPowerPanel === 'function') updatePredPowerPanel();
      break;
    case 'judgeall':
      if (typeof updateJudgeAll === 'function') updateJudgeAll();
      break;
    case 'simulator':
      if (typeof calcKelly        === 'function') calcKelly();
      if (typeof renderKellySlots === 'function') {
        const resolved = (typeof getBetsByScope === 'function' ? getBetsByScope() : bets)
                           .filter(b => b.result !== 'PENDING');
        renderKellySlots(resolved.length % 12, resolved);
      }
      if (typeof updateSimRoundSeedBanner === 'function') updateSimRoundSeedBanner();
      if (typeof updateKellyHistory       === 'function') updateKellyHistory();
      if (typeof updateKellyGradeBanner   === 'function') updateKellyGradeBanner();
      try { if (typeof updateFibonacci === 'function') updateFibonacci(); } catch(e) { console.warn('updateFibonacci error:', e); }
      break;
    case 'goal':
      if (typeof updateRoundHistory      === 'function') updateRoundHistory();
      if (typeof renderPrincipleList     === 'function') renderPrincipleList();
      if (typeof renderPrincipleChecklist=== 'function') renderPrincipleChecklist();
      if (typeof renderRoundReviewList   === 'function') renderRoundReviewList();
      if (typeof updateGoalStats         === 'function') updateGoalStats();
      if (typeof calcGoal                === 'function') calcGoal();
      break;
    case 'round-report':
      if (typeof updateRoundReport === 'function') updateRoundReport();
      break;
    case 'vault':
      if (typeof renderVault === 'function') renderVault();
      break;
    case 'verify':
      if (typeof renderVerifyPage === 'function') renderVerifyPage();
      break;
    case 'settings':
      if (typeof renderSeasonHistory === 'function') renderSeasonHistory();
      break;
  }
}

function refreshAllUI() {
  // ── 1. 중앙 엔진 재계산 (scopedBets 반영) ──
  calcSystemState();

  // ── 2. 공통/항상 실행 블록 ──────────────────────────────────
  if (typeof updateCharts             === 'function') updateCharts();
  if (typeof updateJudgePanel         === 'function') updateJudgePanel();
  // 대시보드 KPI 카드 — scope 전환 시에도 반드시 갱신
  if (typeof updateFundCards          === 'function') updateFundCards();
  if (typeof updateDashboardKPI       === 'function') updateDashboardKPI();
  if (typeof updateDashboardRoundStats=== 'function') updateDashboardRoundStats();
  // 베팅 목록
  if (typeof renderTable              === 'function') renderTable();
  if (typeof renderRecentTable        === 'function') renderRecentTable();
  // 배너 / side-effect — 에러나도 계속 진행
  try { if (typeof updateGoalBankrollDisplay === 'function') updateGoalBankrollDisplay(); } catch(e) { console.warn('updateGoalBankrollDisplay', e); }
  try { if (typeof updateWeeklySeedStatus    === 'function') updateWeeklySeedStatus();    } catch(e) { console.warn('updateWeeklySeedStatus', e); }
  try { if (typeof updateGameSuggestions     === 'function') updateGameSuggestions();     } catch(e) { console.warn('updateGameSuggestions', e); }
  try { if (typeof updateRetroBanner         === 'function') updateRetroBanner();         } catch(e) { console.warn('updateRetroBanner', e); }
  try { if (typeof updateSlumpBanner         === 'function') updateSlumpBanner();         } catch(e) { console.warn('updateSlumpBanner', e); }
  try { if (typeof checkAutoRoundReset       === 'function') checkAutoRoundReset();       } catch(e) { console.warn('checkAutoRoundReset', e); }
  try { if (typeof loadSettingsDisplay       === 'function') loadSettingsDisplay();       } catch(e) { console.warn('loadSettingsDisplay', e); }

  // ── 3. 현재 활성 탭 전용 렌더 ─────────────────────────────
  const page = (typeof activePage !== 'undefined') ? activePage : '';
  renderPage(page);

  // ── 4. Scope UI 동기화 (두 위치 모두) ──
  _syncScopeUI();
}
let charts = { profit: null, sport: null, odds: null, monthly: null, seed: null, goal: null, ev: null, evAmount: null, predAccuracy: null, dow: null, weeklyProfit: null, trend: null, oddsDist: null, condition: null, kellyDist: null, evMonthly: null, evCum: null, analyzeChart: null, judgeFolder: null, judgePred: null, judgeTrend: null, judgeOdds: null, judgeBias: null };

// ── getCalibCorrFactor / getAdaptiveMultiplier ─────────────
// kelly.js 로 이동됨. kelly.js가 state.js 이전에 로드되어야 함.

// ▶ calcSystemState() — 중앙 계산 엔진
//   모든 파생 지표를 단 한 번 bets 배열에서 계산하고
//   window.App._SS 에 저장 (canonical owner). 각 탭은 이 객체를 읽기만 한다.
//   window._SS 는 @deprecated compatibility alias.
// ============================================================
function calcSystemState() {
  // ── 어댑터 레이어 — 전역 수집 후 computeSystemState 위임 ──
  const scopedBets = getBetsByScope();
  const allBets    = getBets();

  // ── calibration 데이터 경로 ───────────────────────────────────
  // calibrateProb / getCalibrated 모두 ss.calibBuckets를 호출부에서 명시적으로 주입받음.

  const settings = {
    kelly: {
      seed:           (typeof getBetSeed === 'function' ? getBetSeed() : 0) || getSettings().kellySeed || 0,
      bankroll:       (typeof getCurrentBankroll === 'function' ? getCurrentBankroll() : 0) || getSettings().startFund || 0,
      maxBetPct:      getSettings().maxBetPct || 5,
      kellyGradeAdj:  !!getSettings().kellyGradeAdj,
      prevMultiplier: window.App.kellyPrevMultiplier,
    },
    target: {
      fund: getSettings().targetFund || 0,
    },
  };

  // context: 읽기 전용 메타 — settings와 분리 (계산 파라미터 오염 방지)
  const context = {
    scope:       getCurrentScope(),
    project:     getCurrentProject(),
    activeRound: getActiveRound(),
  };
  // calibData는 getAdjustedProb → calibrateProb 경로에서 window.App._SS.calibBuckets로 소비됨.
  // computeSystemState는 context를 계산 로직에 사용하지 않으므로 여기서 전달하지 않음.

  const result = computeSystemState(scopedBets, allBets, settings, context);

  // 히스테리시스 상태 업데이트 — 다음 호출 시 prevMultiplier로 재주입
  window.App.kellyPrevMultiplier = result._nextMultiplier;

  // canonical owner: window.App._SS
  // window._SS 는 @deprecated getter로 연결됨 — 별도 대입 불필요
  window.App._SS = result;
  return window.App._SS;
}
// ── 엔진 초기 실행 ──
window.App._SS = null;

// ── window._SS deprecated getter ─────────────────────────────
// canonical owner: window.App._SS
// window._SS 는 compatibility alias — 추후 제거 예정.
// App.debug = true 시 접근 위치를 warn으로 추적 가능.
// configurable: true — 테스트 환경에서 재정의 가능.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, '_SS', {
    get() {
      if (window.App?.debug) {
        console.warn('[deprecated] window._SS — use window.App._SS');
      }
      return window.App._SS;
    },
    set(v) {
      window.App._SS = v;
    },
    configurable: true,
  });
}

// ── Kelly 히스테리시스 상태 — 세션 전용, localStorage 비저장 ──
// prevMultiplier는 computeKellyUnit 호출 간 연속성 유지용.
// 멀티탭 오염 방지를 위해 window.App 네임스페이스로 격리.
if (!window.App) window.App = {};
if (!Number.isFinite(window.App.kellyPrevMultiplier)) {
  window.App.kellyPrevMultiplier = 1.0;
}


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

function calibrateProb(myProb, bucket, totalBets, calibData) {
  // ── 입력값 guard ─────────────────────────────────────────
  // restore/csv/OCR 경로에서 "", "65%", null, NaN 유입 방어
  const p = Number(myProb);
  if (!Number.isFinite(p)) return 0.5;

  // calibData 없음 = calibration bypass (조용한 null fallback 제거)
  if (!Array.isArray(calibData) || calibData.length === 0) return p;

  // { bin, actual } 또는 { min, max, actWr, count } 둘 다 지원
  const expected = bucket.bin != null ? bucket.bin : (bucket.min + bucket.max) / 2;
  const actual   = bucket.actual != null ? bucket.actual : bucket.actWr / 100;
  const sample   = bucket.count != null ? bucket.count : 10; // count 없으면 최소치로 간주

  if (!bucket || expected == null || actual == null) return p;

  // 1. ratio 계산 (같은 단위로 비교)
  let ratio = actual / expected;

  // 2. ratio 클리핑 [0.5 ~ 1.5]
  ratio = Math.min(Math.max(ratio, 0.5), 1.5);

  // 3. 데이터 수 기반 weight
  const weight = getWeight(totalBets, sample);

  // 4. 완화된 ratio
  const adjustedRatio = 1 + (ratio - 1) * weight;

  // 5. 적용 (검증된 p 사용)
  let finalProb = p * adjustedRatio;

  // 6. 최종 클램프 [0.05 ~ 0.95]
  finalProb = Math.min(Math.max(finalProb, 0.05), 0.95);

  return finalProb;
}

function getCalibrated(p, calibData) {
  if (!Array.isArray(calibData) || calibData.length === 0) return p;

  let closest = null;
  let minDiff = Infinity;

  for (const d of calibData) {
    const expected =
      d.bin != null
        ? d.bin
        : (d.mid != null ? d.mid / 100 : d.avgProb / 100);

    const diff = Math.abs(p - expected);
    if (diff < minDiff) {
      minDiff = diff;
      closest = d;
    }
  }

  if (!closest) return p;

  return closest.actual != null
    ? closest.actual
    : closest.actWr / 100;
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
  const ss = window.App._SS; // canonical owner
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

  // calibrateProb 호출 — calibData를 명시적으로 전달 (전역 읽기 없음)
  const adjP = calibrateProb(p, {
    min: bucket.min,
    max: bucket.max,
    actWr: bucket.actWr,
    count: bucket.count
  }, totalBets, ss.calibBuckets);

  return Math.min(Math.max(adjP * 100, 5), 95);
}

// CLV 기반 추가 보정 (avgCLV < 0 → downscale)
function getCLVAdjustedProb(myProbPct) {
  let adj = getAdjustedProb(myProbPct);
  const ss = window.App._SS; // canonical owner
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

  const ss = window.App._SS; // canonical owner
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
  const ss = window.App._SS; // canonical owner
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
  const n = Number(pct);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, 0), 100) / 100;
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
  const ss = window.App._SS; // canonical owner

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
// browser runtime side effect — test/SSR 환경에서는 실행되지 않아야 함
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
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
            const raw = Storage.getJSON(KEYS.BETS, []);
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
            const rawR = Storage.getJSON(KEYS.ROUNDS, []);
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
}

// ── window.App.state 네임스페이스 (state.js 코어 등록) ────────
// shape는 app.js에서 선언. 여기서는 state 레이어에 attach만 수행.
// [MIGRATION] 전역 함수(getBets() 등 직접 호출)는 그대로 동작.
// 목표: 호출 경로를 window.App.state.* 로 점진 이전.
// 전역 선언 제거는 별도 PR에서 진행. (이 단계는 migration path 생성)
if (typeof window !== 'undefined') {
  if (!window.App) window.App = {};
  if (!window.App.state) window.App.state = {};

  // state 레이어 — 데이터/엔진 함수
  window.App.state = {
    STORAGE_KEY,
    getBets,
    saveBets,
    calcSystemState,
    refreshAllUI,
    renderPage,
  };

  // 하위 호환 — 기존에 window.App.getBets() 로 직접 호출하던 경로 유지
  // @deprecated: window.App.state.* 경로로 이전 예정
  window.App.getBets        = getBets;
  window.App.saveBets       = saveBets;
  window.App.calcSystemState = calcSystemState;
  window.App.refreshAllUI   = refreshAllUI;
  window.App.renderPage     = renderPage;
  window.App.STORAGE_KEY    = STORAGE_KEY;

  if (window.App.debug) {
    console.debug('[bootstrap] App.state attached', Object.keys(window.App.state));
  }
}
