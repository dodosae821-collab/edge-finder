// ============================================================
// decision_analysis.js — EDGE FINDER v7 검증 모듈
// ============================================================
// 목적: "이 시스템이 실제로 리스크를 줄이고 있는가" 검증
// 규칙:
//   - 순수 데이터 반환 (UI 로직 없음)
//   - bet.metrics 사용 금지 → 기존 필드만 사용
//   - 베팅 로직 수정 금지
//   - 데이터 구조 변경 금지
// ============================================================


// ── 공통 헬퍼 ────────────────────────────────────────────────

/**
 * 기존 bet 필드에서 핵심 수치 추출
 * bet.metrics 추가 없이 기존 구조 그대로 사용
 */
function getBetCore(bet) {
  return {
    stake: Number.isFinite(bet.amount)      ? bet.amount      : 0,
    pnl:   Number.isFinite(bet.profit)      ? bet.profit      : 0,
    odds:  Number.isFinite(bet.betmanOdds)  ? bet.betmanOdds  : 0,
  };
}

/**
 * result 문자열 정규화 — 대소문자 + 공백 완전 방어
 */
function normalizeResult(r) {
  if (typeof r !== 'string') return null;
  return r.trim().toLowerCase();
}

/**
 * adjustedProb 정규화 — NaN / undefined / 비정상값 방어
 * @returns {number|null} 퍼센트(%) 단위 또는 null
 */
function normalizePct(prob) {
  if (!Number.isFinite(prob)) return null;
  if (prob >= 0 && prob <= 1)   return prob * 100;  // 소수 → % 변환 (0, 1 경계 포함)
  if (prob >= 0 && prob <= 100) return prob;         // 이미 % 단위 (100 경계 포함)
  return null; // 음수 또는 100 초과 → 비정상
}

/**
 * 표본 표준편차 (n-1 기준) — Kelly 변동성 분석용
 * @param {number[]} values
 * @returns {number}
 */
function calcStdDev(values) {
  const n = values.length;
  if (n < 2) return 0;
  const mean     = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

/**
 * 적중 판정 (3단계 우선순위)
 * 1순위: bet.result (normalizeResult 적용)
 * 2순위: bet.profit (fallback, 레거시 대응)
 * 반환:  true(적중) | false(실패) | null(push/미정/제외)
 */
function isWin(bet) {
  const r = normalizeResult(bet.result);

  if (r === 'win')  return true;
  if (r === 'lose') return false;
  if (r === 'push') return null;

  // profit fallback (레거시) — NaN / 비정상값 방어
  if (!Number.isFinite(bet.profit)) return null;
  if (bet.profit > 0) return true;
  if (bet.profit < 0) return false;
  return null; // profit === 0 → push 또는 미정
}

/**
 * Kelly Factor 범위 기반 그룹핑
 * 정확값 비교 금지 (부동소수점 안전)
 */
function getKellyGroup(factor) {
  const f = Number.isFinite(factor) ? factor : 1.0;
  if (f >= 0.9)  return '1.0';
  if (f >= 0.5)  return '0.6';
  if (f >= 0.25) return '0.3';
  return '0.2';
}

/**
 * adjustedProb(%) 구간 분류
 * 50% 미만 포함 — 숨김 없음
 */
function getProbBucket(pct) {
  if (!Number.isFinite(pct)) return 'unknown';
  if (pct < 50)  return '<50';
  if (pct >= 75) return '75+';
  const base = Math.floor(pct / 5) * 5;
  return `${base}-${base + 5}`;
}

/**
 * 그룹 내 ROI / winRate / avgOdds / avgLoss 계산
 * push 및 null 결과는 전부 제외 (validBets 기준)
 * @param {Array} bets
 * @returns {{ n, roi, winRate, avgOdds, avgLoss, low_sample }}
 */
function calcGroupStats(bets) {
  // push/미정 제외
  const valid = bets.filter(b => isWin(b) !== null);
  const n = valid.length;

  if (n === 0) {
    return { n: 0, roi: null, winRate: null, avgOdds: null, avgLoss: null, low_sample: true };
  }

  const totalStake = valid.reduce((s, b) => s + getBetCore(b).stake, 0);
  const totalPnl   = valid.reduce((s, b) => s + getBetCore(b).pnl,   0);
  const winCount   = valid.filter(b => isWin(b) === true).length;
  const oddsSum    = valid.reduce((s, b) => s + getBetCore(b).odds, 0);

  // avgLoss: 손실 베팅(pnl < 0)의 평균 손실 절댓값
  const loseBets = valid.filter(b => isWin(b) === false);
  const avgLoss  = loseBets.length > 0
    ? Math.abs(loseBets.reduce((s, b) => s + getBetCore(b).pnl, 0) / loseBets.length)
    : null;

  return {
    n,
    roi:      totalStake > 0 ? totalPnl / totalStake : null,
    winRate:  winCount / n,
    avgOdds:  oddsSum / n,
    avgLoss,
    low_sample: n < 10,
  };
}

/**
 * decision 없는 베팅 → LEGACY 처리
 * @param {Array} bets
 * @returns {{ active: Array, legacy: Array }}
 */
function splitByDecision(bets) {
  const active = [];
  const legacy = [];
  for (const b of bets) {
    if (b.decision && typeof b.decision === 'object') {
      active.push(b);
    } else {
      legacy.push(b);
    }
  }
  return { active, legacy };
}


// ── 분석 함수 1: Calibration ─────────────────────────────────

/**
 * adjustedProb 구간별 실제 적중률 분석
 *
 * 목표: predicted ≈ actual (대각선 근접)
 *       over/under 평가 여부 확인
 *
 * @param {Array} bets — 전체 bet 배열
 * @returns {{
 *   buckets: Array<{
 *     bucket: string,
 *     n: number,
 *     avgAdjustedProb: number,
 *     actualWinRate: number,
 *     error: number,          // actualWinRate - (avgAdjustedProb / 100)
 *     bias: 'over' | 'under' | 'ok',
 *     low_sample: boolean,
 *   }>,
 *   legacyCount: number,
 *   unknownProbCount: number,
 * }}
 */
function analyzeCalibration(bets) {
  const { active, legacy } = splitByDecision(bets);

  // adjustedProb 없는 것 분리 — normalizePct로 완전 방어
  const withProb = [];
  let unknownProbCount = 0;
  for (const b of active) {
    const dec = b.decision || {};
    const pct = normalizePct(dec.adjustedProb);
    if (pct === null) {
      unknownProbCount++;
      continue;
    }
    withProb.push({ bet: b, pct });
  }

  // 구간별 집계
  const bucketMap = {};
  for (const { bet, pct } of withProb) {
    const w = isWin(bet);
    if (w === null) continue; // push/미정 제외

    const key = getProbBucket(pct);
    if (!bucketMap[key]) bucketMap[key] = { probs: [], wins: 0, total: 0 };
    bucketMap[key].probs.push(pct);
    bucketMap[key].total++;
    if (w === true) bucketMap[key].wins++;
  }

  // 구간 정렬 순서
  const ORDER = ['<50', '50-55', '55-60', '60-65', '65-70', '70-75', '75+', 'unknown'];

  const buckets = ORDER
    .filter(k => bucketMap[k])
    .map(k => {
      const { probs, wins, total } = bucketMap[k];
      const avgAdjustedProb = probs.reduce((s, v) => s + v, 0) / probs.length;
      const actualWinRate   = wins / total;
      const error           = actualWinRate - avgAdjustedProb / 100;
      const bias            = Math.abs(error) < 0.03 ? 'ok'
                            : error < 0 ? 'over'   // 예측 > 실제 → 과대평가
                            : 'under';             // 예측 < 실제 → 과소평가

      return {
        bucket: k,
        n: total,
        avgAdjustedProb: parseFloat(avgAdjustedProb.toFixed(2)),
        actualWinRate:   parseFloat(actualWinRate.toFixed(4)),
        error:           parseFloat(error.toFixed(4)),
        bias,
        low_sample: total < 10,
      };
    });

  return {
    buckets,
    legacyCount:      legacy.length,
    unknownProbCount,
  };
}


// ── 분석 함수 2: Decision 성과 ───────────────────────────────

/**
 * normal vs override 성과 비교
 *
 * override = dec.allow === false 상태에서 저장된 베팅
 * (사용자가 BLOCK 경고를 무시하고 저장한 케이스)
 *
 * 목표: override 성과 < normal → Decision Gate 유효
 *       차이 없으면 → 기준 재검토 필요
 *
 * @param {Array} bets
 * @returns {{
 *   normal:   { n, roi, winRate, avgOdds, avgLoss, low_sample },
 *   override: { n, roi, winRate, avgOdds, avgLoss, low_sample },
 *   legacyCount: number,
 *   verdict: 'gate_valid' | 'gate_unclear' | 'insufficient_data',
 * }}
 */
function analyzeDecision(bets) {
  const { active, legacy } = splitByDecision(bets);

  const normalBets   = active.filter(b => (b.decision || {}).allow !== false);
  const overrideBets = active.filter(b => (b.decision || {}).allow === false);

  const normal   = calcGroupStats(normalBets);
  const override = calcGroupStats(overrideBets);

  // verdict
  let verdict = 'insufficient_data';
  if (override.n >= 5 && normal.n >= 5 && override.roi !== null && normal.roi !== null) {
    verdict = override.roi < normal.roi ? 'gate_valid' : 'gate_unclear';
  }

  return {
    normal,
    override,
    legacyCount: legacy.length,
    verdict,
  };
}


// ── 분석 함수 3: Kelly Factor별 성과 ────────────────────────

/**
 * Kelly Factor 그룹별 ROI / 변동성 / 손실 규모 분석
 *
 * 목표: factor ↓ → avgLoss ↓ 확인
 *       ROI 과도 감소 여부 체크
 *
 * @param {Array} bets
 * @returns {{
 *   groups: Array<{
 *     group: string,            // '1.0' | '0.6' | '0.3' | '0.2'
 *     n: number,
 *     roi: number | null,
 *     winRate: number | null,
 *     avgOdds: number | null,
 *     avgLoss: number | null,
 *     stdDev: number | null,   // pnl 표준편차 (변동성)
 *     low_sample: boolean,
 *   }>,
 *   legacyCount: number,
 * }}
 */
function analyzeKellyFactor(bets) {
  const { active, legacy } = splitByDecision(bets);

  // factor 없는 베팅은 그룹 1.0으로 fallback
  const GROUP_KEYS = ['1.0', '0.6', '0.3', '0.2'];
  const groupMap   = { '1.0': [], '0.6': [], '0.3': [], '0.2': [] };

  for (const b of active) {
    const dec    = b.decision || {};
    const factor = Number.isFinite(dec.factor) ? dec.factor : 1.0;
    const key    = getKellyGroup(factor);
    groupMap[key].push(b);
  }

  const groups = GROUP_KEYS.map(key => {
    const groupBets = groupMap[key];
    const base      = calcGroupStats(groupBets);

    // 표본 표준편차 2중 지표 (n-1 기준)
    const valid = groupBets.filter(b => isWin(b) !== null);

    // stdDevPnl — 계좌 변동성 (절대 금액 기준)
    const pnlValues = valid
      .map(b => getBetCore(b).pnl)
      .filter(v => Number.isFinite(v));
    const stdDevPnl = pnlValues.length >= 2
      ? parseFloat(calcStdDev(pnlValues).toFixed(2))
      : null;

    // stdDevRoi — 전략 안정성 (수익률 기준), stake 0 / NaN / Infinity 완전 차단
    const roiValues = valid
      .map(b => getBetCore(b))
      .filter(v => v.stake > 0 && Number.isFinite(v.pnl) && Number.isFinite(v.pnl / v.stake))
      .map(v => v.pnl / v.stake);
    const stdDevRoi = roiValues.length >= 2
      ? parseFloat(calcStdDev(roiValues).toFixed(4))
      : null;

    return {
      group: key,
      ...base,
      roi:       base.roi !== null ? parseFloat((base.roi * 100).toFixed(2)) : null,
      stdDevPnl,
      stdDevRoi,
    };
  });

  return {
    groups,
    legacyCount: legacy.length,
  };
}


// ── 전체 요약 (선택적 사용) ──────────────────────────────────

/**
 * 세 분석을 한 번에 실행
 * @param {Array} bets
 * @returns {{ calibration, decision, kellyFactor }}
 */
function runDecisionAnalysis(bets) {
  const { active, legacy } = splitByDecision(bets);
  const valid = active.filter(b => isWin(b) !== null);
  const push  = active.filter(b => isWin(b) === null);

  const meta = {
    totalBets:   bets.length,
    legacyCount: legacy.length,                                          // decision 없는 베팅 — 분석 제외
    activeCount: active.length,                                          // decision 있는 베팅
    validCount:  valid.length,                                           // win/lose만 — ROI/Calibration 기준
    pushCount:   push.length,                                            // push/미정 — 전 분석에서 제외
    validRatio:  active.length > 0 ? valid.length / active.length : null, // 분석 데이터 신뢰도
  };

  return {
    calibration: analyzeCalibration(bets),
    decision:    analyzeDecision(bets),
    kelly:       analyzeKellyFactor(bets),
    meta,
  };
}


// ── export (ES module 환경) / global 등록 (script 태그 환경) ─

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    analyzeCalibration,
    analyzeDecision,
    analyzeKellyFactor,
    runDecisionAnalysis,
    // 헬퍼 (테스트용)
    getBetCore,
    isWin,
    getKellyGroup,
    getProbBucket,
    normalizePct,
    normalizeResult,
    calcStdDev,
  };
} else {
  window.analyzeCalibration  = analyzeCalibration;
  window.analyzeDecision     = analyzeDecision;
  window.analyzeKellyFactor  = analyzeKellyFactor;
  window.runDecisionAnalysis = runDecisionAnalysis;
}
