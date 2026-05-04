// ============================================================
// decision_gate.js — 베팅 판단 게이트
// ============================================================
// 규칙:
//   - 순수 함수만 — DOM 접근 금지, getBets() 호출 금지
//   - 모든 입력은 외부에서 주입 (ctx, config)
//   - 결과는 UI가 그대로 노출 가능한 구조
//
// 호출 흐름:
//   const bets        = getBets();
//   const metrics     = computeJudgeMetrics(bets, 'all');
//   const calibration = computeCalibration(bets);
//   const ctx         = buildDecisionContext({ metrics, calibration });
//   const config      = getGateConfig(appSettings);
//   const gate        = evaluateDecisionGate(ctx, config);
// ============================================================


// ── 기본 config ──────────────────────────────────────────────
const DEFAULT_GATE_CONFIG = {
  WARNING_MULTIPLIER:  0.5,   // WARNING 모드 Kelly 배수
  DEFENSE_MULTIPLIER:  0.3,   // DEFENSE 모드 Kelly 배수
  LOCK_MAX_PCT:        0.02,  // LOCK 시 override 허용 최대 베팅 비율
  NORMAL_MAX_PCT:      0.05,  // 정상 최대 베팅 비율
  WARNING_MAX_PCT:     0.03,  // WARNING 최대 베팅 비율
  DEFENSE_MAX_PCT:     0.02,  // DEFENSE 최대 베팅 비율
  ECE_WARNING:         0.06,  // ECE 경고 임계값 (%)
  ECE_DEFENSE:         0.08,  // ECE 방어 임계값 (%)
  ROI_DEFENSE:         0,     // ROI 방어 임계값 (이하 → DEFENSE)
  TREND_WARNING:       -2,    // roiTrend 경고 임계값 (%p)
};

/**
 * 설정 병합 — settings에서 override 가능, gate 내부에서 직접 참조 금지
 * @param {object} [appSettings]
 * @returns {object}
 */
function getGateConfig(appSettings) {
  return Object.assign({}, DEFAULT_GATE_CONFIG, (appSettings && appSettings.gateConfig) || {});
}


// ── Context Builder ──────────────────────────────────────────
/**
 * computeJudgeMetrics + computeCalibration 결과를 gate 입력 형태로 변환.
 * gate가 compute 함수를 직접 호출하지 않도록 책임 분리.
 *
 * @param {{ metrics: object, calibration: object }} param
 * @returns {{
 *   ev:          number|null,
 *   roi:         number|null,
 *   roiTrend:    number|null,
 *   calibration: number|null,   // ECE raw (소수, 0~1 기준)
 *   bias:        number|null,
 *   bankroll:    number|null
 * }}
 */
function buildDecisionContext({ metrics, calibration }) {
  var m = metrics   || {};
  var c = calibration || {};

  // roiTrend: 최근 엣지 변화 — recentEdge - predEdge
  var roiTrend = (m.recentEdge != null && m.predEdge != null)
    ? m.recentEdge - m.predEdge
    : null;

  // roi: 전체 ROI — predBets 기준 실제 수익/투자
  var roi = null;
  if (m.resolved && m.resolved.length > 0) {
    var totalProfit   = m.resolved.reduce(function(s, b) { return s + (b.profit || 0); }, 0);
    var totalInvested = m.resolved.reduce(function(s, b) { return s + (b.amount || 0); }, 0);
    roi = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : null;
  }

  // ECE는 % 단위로 저장되어 있음 (buildCalibBins 기준 0~100%)
  // gate에서 0.08 기준으로 비교하려면 /100 변환
  var eceRaw = c.eceRaw != null ? c.eceRaw / 100 : null;

  return {
    ev:          m.predEdge != null ? m.predEdge / 100 : null,  // % → 소수
    roi:         roi,
    roiTrend:    roiTrend,
    calibration: eceRaw,
    bias:        c.biasRaw != null ? c.biasRaw / 100 : null,
    bankroll:    (typeof getCurrentBankroll === 'function') ? getCurrentBankroll() : null,
  };
}


// ── Decision Gate — 순수 함수 ────────────────────────────────
/**
 * 베팅 판단 게이트. DOM 접근 없음. 모든 의존성 주입.
 *
 * @param {{
 *   ev:          number|null,   // EV 소수 (0.05 = 5%)
 *   roi:         number|null,   // 전체 ROI %
 *   roiTrend:    number|null,   // 최근 - 전체 엣지 차이 (%p)
 *   calibration: number|null,   // ECE raw 소수 (0.08 = 8%)
 *   bias:        number|null,
 *   bankroll:    number|null
 * }} ctx
 * @param {object} config — getGateConfig() 결과
 * @returns {{
 *   mode:            "NORMAL"|"WARNING"|"DEFENSE"|"LOCK",
 *   allowed:         boolean,
 *   kellyMultiplier: number,
 *   maxStakePct:     number,
 *   reason:          string[]
 * }}
 */
function evaluateDecisionGate(ctx, config) {
  var cfg = config || DEFAULT_GATE_CONFIG;
  var ev          = ctx.ev;
  var roi         = ctx.roi;
  var roiTrend    = ctx.roiTrend;
  var calibration = ctx.calibration;

  var mode            = 'NORMAL';
  var allowed         = true;
  var kellyMultiplier = 1.0;
  var maxStakePct     = cfg.NORMAL_MAX_PCT;
  var reason          = [];

  // ── 1단계: WARNING 조건 ──────────────────────────────────
  if (calibration != null && calibration > cfg.ECE_WARNING && calibration <= cfg.ECE_DEFENSE) {
    mode            = 'WARNING';
    kellyMultiplier = cfg.WARNING_MULTIPLIER;
    maxStakePct     = cfg.WARNING_MAX_PCT;
    reason.push('캘리브레이션 주의 (ECE ' + (calibration * 100).toFixed(1) + '%)');
  }

  if (roiTrend != null && roiTrend < cfg.TREND_WARNING) {
    if (mode === 'NORMAL') {
      mode            = 'WARNING';
      kellyMultiplier = cfg.WARNING_MULTIPLIER;
      maxStakePct     = cfg.WARNING_MAX_PCT;
    }
    reason.push('최근 성능 하락 추세 (' + (roiTrend >= 0 ? '+' : '') + roiTrend.toFixed(1) + '%p)');
  }

  // ── 2단계: DEFENSE 조건 (WARNING 덮어쓰기) ───────────────
  if (calibration != null && calibration > cfg.ECE_DEFENSE) {
    mode            = 'DEFENSE';
    kellyMultiplier = cfg.DEFENSE_MULTIPLIER;
    maxStakePct     = cfg.DEFENSE_MAX_PCT;
    reason.push('캘리브레이션 불안정 (ECE ' + (calibration * 100).toFixed(1) + '%)');
  }

  if (roi != null && roi < cfg.ROI_DEFENSE) {
    mode = 'DEFENSE';
    kellyMultiplier = Math.min(kellyMultiplier, cfg.DEFENSE_MULTIPLIER);
    maxStakePct     = cfg.DEFENSE_MAX_PCT;
    reason.push('전체 ROI 음수 (' + roi.toFixed(1) + '%)');
  }

  // ── 3단계: LOCK 조건 ─────────────────────────────────────
  if (ev != null && ev < 0) {
    mode        = 'LOCK';
    allowed     = false;
    maxStakePct = cfg.LOCK_MAX_PCT;
    reason.push('EV 음수 (기대값 ' + (ev * 100).toFixed(1) + '%)');
  }

  // reason이 비어있으면 정상 신호 추가
  if (reason.length === 0) {
    reason.push('모든 조건 통과');
  }

  return {
    mode:            mode,
    allowed:         allowed,
    kellyMultiplier: kellyMultiplier,
    maxStakePct:     maxStakePct,
    reason:          reason,
  };
}


// ── Override 처리 ────────────────────────────────────────────
/**
 * LOCK/DEFENSE 상태에서 강제 진행 시 bet에 override 메타 주입.
 * 저장 후 별도 ROI 분석 가능.
 *
 * @param {object} bet           — 저장할 bet 객체
 * @param {string} overrideReason — 사용자 입력 이유
 * @param {object} gate          — evaluateDecisionGate() 결과
 * @returns {object}             — override 필드 추가된 bet
 */
function applyOverride(bet, overrideReason, gate) {
  return Object.assign({}, bet, {
    isOverride:     true,
    overrideReason: overrideReason || '',
    gate: {
      mode:            gate.mode,
      kellyMultiplier: gate.kellyMultiplier,
      maxStakePct:     gate.maxStakePct,
      reasons:         gate.reason,
    },
  });
}


// ── Gate Snapshot — bet 저장 시 당시 상태 기록 ───────────────
/**
 * 정상 진행 bet에도 gate 스냅샷 저장 (사후 분석용).
 *
 * @param {object} bet  — 저장할 bet 객체
 * @param {object} gate — evaluateDecisionGate() 결과
 * @returns {object}
 */
function attachGateSnapshot(bet, gate) {
  return Object.assign({}, bet, {
    isOverride: false,
    gate: {
      mode:            gate.mode,
      kellyMultiplier: gate.kellyMultiplier,
      maxStakePct:     gate.maxStakePct,
      reasons:         gate.reason,
    },
  });
}


// ── 자기 무결성 체크 ─────────────────────────────────────────
console.assert(typeof getGateConfig         === 'function', '[decision_gate.js] getGateConfig not defined');
console.assert(typeof buildDecisionContext  === 'function', '[decision_gate.js] buildDecisionContext not defined');
console.assert(typeof evaluateDecisionGate  === 'function', '[decision_gate.js] evaluateDecisionGate not defined');
console.assert(typeof applyOverride         === 'function', '[decision_gate.js] applyOverride not defined');
console.assert(typeof attachGateSnapshot    === 'function', '[decision_gate.js] attachGateSnapshot not defined');
