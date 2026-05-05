// ============================================================
// decision_gate.js — 베팅 판단 게이트
// ============================================================
var DEFAULT_GATE_CONFIG = {
  BASE_UNIT:               0.02,   // bankroll의 2% = 기본 베팅 단위
  WARNING_MULTIPLIER:      0.5,
  DEFENSE_MULTIPLIER:      0.3,
  LOCK_MAX_PCT:            0.02,
  NORMAL_MAX_PCT:          0.05,
  WARNING_MAX_PCT:         0.03,
  DEFENSE_MAX_PCT:         0.02,
  ECE_WARNING:             0.06,
  ECE_DEFENSE:             0.08,
  ROI_DEFENSE:             0,
  TREND_WARNING:           -2,
  MIN_CALIB_SAMPLES:       30,
  OVERRIDE_WINDOW:         10,
  OVERRIDE_MAX:            3,
  MIN_BANKROLL_THRESHOLD:  10000,  // 1만원 이하 sizing 비활성
};

function getGateConfig(appSettings) {
  return Object.assign({}, DEFAULT_GATE_CONFIG, (appSettings && appSettings.gateConfig) || {});
}

function buildDecisionContext(param) {
  var m = param.metrics     || {};
  var c = param.calibration || {};
  var allBets = param.bets  || [];

  var roiTrend = (m.recentEdge != null && m.predEdge != null)
    ? m.recentEdge - m.predEdge : null;

  var roi = null;
  if (m.resolved && m.resolved.length > 0) {
    var totalProfit   = m.resolved.reduce(function(s,b){ return s+(b.profit||0); }, 0);
    var totalInvested = m.resolved.reduce(function(s,b){ return s+(b.amount||0); }, 0);
    roi = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : null;
  }

  var eceRaw       = c.eceRaw != null ? c.eceRaw / 100 : null;
  var calibSamples = c.predCount || 0;

  var recentBets    = allBets.slice(-DEFAULT_GATE_CONFIG.OVERRIDE_WINDOW);
  var overrideCount = recentBets.filter(function(b){ return b.isOverride === true; }).length;

  return {
    ev:            m.predEdge != null ? m.predEdge / 100 : null,
    roi:           roi,
    roiTrend:      roiTrend,
    calibration:   eceRaw,
    bias:          c.biasRaw != null ? c.biasRaw / 100 : null,
    bankroll:      (typeof getCurrentBankroll === 'function') ? getCurrentBankroll() : null,
    calibSamples:  calibSamples,
    overrideCount: overrideCount,
    resolvedCount: m.resolved ? m.resolved.length : 0,
  };
}

function evaluateDecisionGate(ctx, config) {
  var cfg           = config || DEFAULT_GATE_CONFIG;
  var ev            = ctx.ev;
  var roi           = ctx.roi;
  var roiTrend      = ctx.roiTrend;
  var calibSamples  = ctx.calibSamples  || 0;
  var overrideCount = ctx.overrideCount || 0;

  var calibInsufficient = calibSamples < cfg.MIN_CALIB_SAMPLES;
  var calibration       = calibInsufficient ? null : ctx.calibration;

  var mode            = 'NORMAL';
  var allowed         = true;
  var kellyMultiplier = 1.0;
  var maxStakePct     = cfg.NORMAL_MAX_PCT;
  var reason          = [];

  if (calibInsufficient && calibSamples > 0) {
    reason.push('캘리브레이션 데이터 부족 (' + calibSamples + '건 / 최소 ' + cfg.MIN_CALIB_SAMPLES + '건)');
  }

  // WARNING
  if (calibration != null && calibration > cfg.ECE_WARNING && calibration <= cfg.ECE_DEFENSE) {
    mode = 'WARNING'; kellyMultiplier = cfg.WARNING_MULTIPLIER; maxStakePct = cfg.WARNING_MAX_PCT;
    reason.push('캘리브레이션 주의 (ECE ' + (calibration*100).toFixed(1) + '%)');
  }
  if (roiTrend != null && roiTrend < cfg.TREND_WARNING) {
    if (mode === 'NORMAL') { mode = 'WARNING'; kellyMultiplier = cfg.WARNING_MULTIPLIER; maxStakePct = cfg.WARNING_MAX_PCT; }
    reason.push('최근 성능 하락 추세 (' + (roiTrend>=0?'+':'') + roiTrend.toFixed(1) + '%p)');
  }

  // DEFENSE
  if (calibration != null && calibration > cfg.ECE_DEFENSE) {
    mode = 'DEFENSE'; kellyMultiplier = cfg.DEFENSE_MULTIPLIER; maxStakePct = cfg.DEFENSE_MAX_PCT;
    reason.push('캘리브레이션 불안정 (ECE ' + (calibration*100).toFixed(1) + '%)');
  }
  if (roi != null && roi < cfg.ROI_DEFENSE) {
    mode = 'DEFENSE'; kellyMultiplier = Math.min(kellyMultiplier, cfg.DEFENSE_MULTIPLIER); maxStakePct = cfg.DEFENSE_MAX_PCT;
    reason.push('전체 ROI 음수 (' + roi.toFixed(1) + '%)');
  }

  // LOCK
  if (ev != null && ev < 0) {
    mode = 'LOCK'; allowed = false; maxStakePct = cfg.LOCK_MAX_PCT;
    reason.push('EV 음수 (기대값 ' + (ev*100).toFixed(1) + '%)');
  }

  // Override 남용
  var overrideAbuse = overrideCount > cfg.OVERRIDE_MAX;
  if (overrideAbuse) {
    reason.push('Override 남용 감지 (최근 ' + cfg.OVERRIDE_WINDOW + '건 중 ' + overrideCount + '회)');
    if (mode === 'NORMAL') { mode = 'WARNING'; kellyMultiplier = cfg.WARNING_MULTIPLIER; maxStakePct = cfg.WARNING_MAX_PCT; }
  }

  if (reason.length === 0) reason.push('모든 조건 통과');

  return { mode: mode, allowed: allowed, kellyMultiplier: kellyMultiplier, maxStakePct: maxStakePct, reason: reason, overrideAbuse: overrideAbuse, calibInsufficient: calibInsufficient };
}

function _gateSnapshot(ctx) {
  return ctx ? { ev: ctx.ev, roi: ctx.roi, roiTrend: ctx.roiTrend, calibration: ctx.calibration } : null;
}

function applyOverride(bet, overrideReason, gate, ctx, sizing) {
  return Object.assign({}, bet, {
    isOverride: true, overrideReason: overrideReason || '',
    gate: {
      mode: gate.mode, kellyMultiplier: gate.kellyMultiplier, maxStakePct: gate.maxStakePct,
      reasons: gate.reason, gateContext: _gateSnapshot(ctx),
      sizing: sizing ? {
        baseUnit:        DEFAULT_GATE_CONFIG.BASE_UNIT,
        gateMultiplier:  sizing.gateMultiplier,
        finalStake:      sizing.finalStake,
        kellySuggestion: sizing.kellySuggestion,
        roundUnit:       sizing.roundUnit,
      } : null,
    },
  });
}

function attachGateSnapshot(bet, gate, ctx, sizing) {
  return Object.assign({}, bet, {
    isOverride: false,
    gate: {
      mode: gate.mode, kellyMultiplier: gate.kellyMultiplier, maxStakePct: gate.maxStakePct,
      reasons: gate.reason, gateContext: _gateSnapshot(ctx),
      sizing: sizing ? {
        baseUnit:        DEFAULT_GATE_CONFIG.BASE_UNIT,
        gateMultiplier:  sizing.gateMultiplier,
        finalStake:      sizing.finalStake,
        kellySuggestion: sizing.kellySuggestion,
        roundUnit:       sizing.roundUnit,
      } : null,
    },
  });
}

console.assert(typeof getGateConfig        === 'function', '[decision_gate.js] getGateConfig not defined');
console.assert(typeof buildDecisionContext === 'function', '[decision_gate.js] buildDecisionContext not defined');
console.assert(typeof evaluateDecisionGate === 'function', '[decision_gate.js] evaluateDecisionGate not defined');
console.assert(typeof applyOverride        === 'function', '[decision_gate.js] applyOverride not defined');
console.assert(typeof attachGateSnapshot   === 'function', '[decision_gate.js] attachGateSnapshot not defined');

// ── computeSizing — Gate 기반 베팅 금액 계산 ─────────────────
function computeSizing(sizingInput, gate, config) {
  var cfg      = config || DEFAULT_GATE_CONFIG;
  var bankroll = (sizingInput && sizingInput.bankroll > 0) ? sizingInput.bankroll : null;
  // kellyRawFrac: 반드시 0~1 범위의 fraction으로 전달할 것 (예: 0.12 = 12%)
  // 호출부에서 단위를 보장해야 하며, 이 함수는 값을 clamp만 적용함
  var kellyRaw = (sizingInput && sizingInput.kellyRawFrac != null) ? sizingInput.kellyRawFrac : null;
  var reason   = [];

  // bankroll 방어
  if (!bankroll) {
    reason.push('Bankroll 미설정');
    return { sizingEnabled: false, finalStake: null, kellySuggestion: null, kellyMeta: null, baseStake: null, gateMultiplier: gate.kellyMultiplier, reason: reason };
  }
  if (bankroll < cfg.MIN_BANKROLL_THRESHOLD) {
    reason.push('Bankroll 너무 작음 (최소 ₩' + cfg.MIN_BANKROLL_THRESHOLD.toLocaleString() + ')');
    return { sizingEnabled: false, finalStake: null, kellySuggestion: null, kellyMeta: null, baseStake: null, gateMultiplier: gate.kellyMultiplier, reason: reason };
  }

  // Gate 기준 sizing
  var baseStake      = Math.floor(bankroll * cfg.BASE_UNIT);
  var gateMultiplier = gate.kellyMultiplier;
  var maxStake       = Math.floor(bankroll * gate.maxStakePct);
  var rawStake       = Math.floor(baseStake * gateMultiplier);
  var finalStake     = Math.min(rawStake, maxStake);

  // bankroll 규모 기반 동적 rounding 단위
  // 소액 구간에서 고정 1000원 단위 사용 시 0원이 되는 문제 방지
  var roundUnit = bankroll >= 1000000 ? 1000
                : bankroll >= 300000  ? 500
                : 100;
  finalStake = Math.floor(finalStake / roundUnit) * roundUnit;
  if (finalStake < roundUnit) finalStake = 0;

  // Kelly 보조 참고값 — clamp(0, 1.5), Gate 상한 강제
  // kellyRaw > 2: bankroll의 200% 초과 = 입력값 오류 가능성, warn 발생
  // kellyRaw > 1.5: clamp 적용됨 (UI 표시 없음, 내부 디버깅용)
  var kellySuggestion = null;
  var kellyMeta       = null;
  if (kellyRaw != null && kellyRaw > 0) {
    if (kellyRaw > 2) {
      console.warn('[sizing] kellyRawFrac 비정상값:', kellyRaw, '— 입력 단위(fraction/percent) 확인 필요');
    }
    kellyMeta = {
      isClamped:   kellyRaw > 1.5, // 내부용 — UI 표시 없음
      isAnomalous: kellyRaw > 2    // UI ⚠️ 표시용
    };
    var kellyAdj    = Math.min(kellyRaw, 1.5);
    var kellyRawAmt = Math.floor(bankroll * kellyAdj);
    kellySuggestion = Math.min(kellyRawAmt, maxStake);
    kellySuggestion = Math.floor(kellySuggestion / roundUnit) * roundUnit;
    if (kellySuggestion < roundUnit) kellySuggestion = 0;
  }

  return {
    sizingEnabled:  true,
    finalStake:     finalStake,
    kellySuggestion: kellySuggestion,
    kellyMeta:      kellyMeta,
    baseStake:      baseStake,
    gateMultiplier: gateMultiplier,
    roundUnit:      roundUnit,
    reason:         reason,
  };
}

console.assert(typeof computeSizing === 'function', '[decision_gate.js] computeSizing not defined');
