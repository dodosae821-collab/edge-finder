// decision_gate.test.js
// 대상: evaluateDecisionGate, getGateConfig
// 전역 없음 — ctx를 직접 조립해 테스트

const vm = require('vm');
const fs = require('fs');

const code = fs.readFileSync(__dirname + '/decision_gate.js', 'utf8');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(code, ctx);

const { evaluateDecisionGate, getGateConfig, DEFAULT_GATE_CONFIG } = ctx;
const CFG = Object.assign({}, ctx.DEFAULT_GATE_CONFIG);

// ── 픽스처 헬퍼 ────────────────────────────────────────────────
function makeCtx(overrides) {
  return Object.assign({
    ev:            0.05,   // 양수 EV (정상)
    roi:           5.0,    // 양수 ROI (정상)
    roiTrend:      0,      // 추세 중립
    calibration:   0.03,   // ECE 3% (정상)
    calibSamples:  40,     // 충분한 샘플
    overrideCount: 0,
    resolvedCount: 40,
    bankroll:      1000000,
  }, overrides);
}

// ── NORMAL ────────────────────────────────────────────────────
describe('NORMAL 모드', () => {
  test('정상 입력 → NORMAL, allowed=true, kellyMultiplier=1.0', () => {
    const gate = evaluateDecisionGate(makeCtx(), CFG);
    expect(gate.mode).toBe('NORMAL');
    expect(gate.allowed).toBe(true);
    expect(gate.kellyMultiplier).toBe(1.0);
    expect(gate.maxStakePct).toBe(CFG.NORMAL_MAX_PCT);
  });

  test('reason에 "모든 조건 통과" 포함', () => {
    const gate = evaluateDecisionGate(makeCtx(), CFG);
    expect(gate.reason.join('')).toContain('모든 조건 통과');
  });

  test('calibSamples=0 → calibInsufficient=true, 모드는 NORMAL 유지', () => {
    const gate = evaluateDecisionGate(makeCtx({ calibSamples: 0 }), CFG);
    expect(gate.calibInsufficient).toBe(true);
    expect(gate.mode).toBe('NORMAL');
    expect(gate.allowed).toBe(true);
    expect(gate.kellyMultiplier).toBe(1.0);
  });
});

// ── WARNING ───────────────────────────────────────────────────
describe('WARNING 모드', () => {
  test('ECE가 ECE_WARNING 초과 & ECE_DEFENSE 이하 → WARNING', () => {
    // ECE_WARNING=0.06, ECE_DEFENSE=0.08 → 0.07이 해당 구간
    const gate = evaluateDecisionGate(makeCtx({ calibration: 0.07 }), CFG);
    expect(gate.mode).toBe('WARNING');
    expect(gate.allowed).toBe(true);
    expect(gate.kellyMultiplier).toBe(CFG.WARNING_MULTIPLIER);   // exact
    expect(gate.kellyMultiplier).toBeLessThan(1.0);              // 범위: NORMAL보다 엄격
    expect(gate.maxStakePct).toBe(CFG.WARNING_MAX_PCT);          // exact
    expect(gate.maxStakePct).toBeLessThan(CFG.NORMAL_MAX_PCT);   // 범위: NORMAL보다 작아야 함
  });

  test('roiTrend가 TREND_WARNING 미만 → WARNING', () => {
    // TREND_WARNING=-2 → -3이 해당
    const gate = evaluateDecisionGate(makeCtx({ roiTrend: -3 }), CFG);
    expect(gate.mode).toBe('WARNING');
    expect(gate.allowed).toBe(true);
    expect(gate.kellyMultiplier).toBe(CFG.WARNING_MULTIPLIER);   // exact
    expect(gate.kellyMultiplier).toBeLessThan(1.0);              // 범위
    expect(gate.maxStakePct).toBe(CFG.WARNING_MAX_PCT);          // exact
    expect(gate.maxStakePct).toBeLessThan(CFG.NORMAL_MAX_PCT);   // 범위
  });

  test('overrideAbuse → WARNING (NORMAL 상태에서)', () => {
    // OVERRIDE_MAX=3 → overrideCount=4
    const gate = evaluateDecisionGate(makeCtx({ overrideCount: 4 }), CFG);
    expect(gate.overrideAbuse).toBe(true);
    expect(gate.mode).toBe('WARNING');
    expect(gate.allowed).toBe(true);
    expect(gate.kellyMultiplier).toBe(CFG.WARNING_MULTIPLIER);   // exact
    expect(gate.kellyMultiplier).toBeLessThan(1.0);              // 범위
  });
});

// ── DEFENSE ───────────────────────────────────────────────────
describe('DEFENSE 모드', () => {
  test('ECE가 ECE_DEFENSE 초과 → DEFENSE', () => {
    // ECE_DEFENSE=0.08 → 0.09가 해당
    const gate = evaluateDecisionGate(makeCtx({ calibration: 0.09 }), CFG);
    expect(gate.mode).toBe('DEFENSE');
    expect(gate.allowed).toBe(true);
    expect(gate.kellyMultiplier).toBe(CFG.DEFENSE_MULTIPLIER);       // exact
    expect(gate.kellyMultiplier).toBeLessThan(CFG.WARNING_MULTIPLIER); // 범위: WARNING보다 엄격
    expect(gate.maxStakePct).toBe(CFG.DEFENSE_MAX_PCT);              // exact
    expect(gate.maxStakePct).toBeLessThanOrEqual(CFG.WARNING_MAX_PCT); // 범위
  });

  test('ROI 음수 → DEFENSE', () => {
    const gate = evaluateDecisionGate(makeCtx({ roi: -1 }), CFG);
    expect(gate.mode).toBe('DEFENSE');
    expect(gate.allowed).toBe(true);
    expect(gate.kellyMultiplier).toBe(CFG.DEFENSE_MULTIPLIER);       // exact
    expect(gate.kellyMultiplier).toBeLessThan(CFG.WARNING_MULTIPLIER); // 범위
    expect(gate.maxStakePct).toBe(CFG.DEFENSE_MAX_PCT);              // exact
  });

  test('ROI 음수 + ECE WARNING → DEFENSE (더 엄격한 쪽 적용)', () => {
    const gate = evaluateDecisionGate(makeCtx({ roi: -1, calibration: 0.07 }), CFG);
    expect(gate.mode).toBe('DEFENSE');
    expect(gate.kellyMultiplier).toBe(CFG.DEFENSE_MULTIPLIER);
    expect(gate.kellyMultiplier).toBeLessThan(CFG.WARNING_MULTIPLIER);
  });
});

// ── LOCK ──────────────────────────────────────────────────────
describe('LOCK 모드', () => {
  test('EV 음수 → LOCK, allowed=false', () => {
    const gate = evaluateDecisionGate(makeCtx({ ev: -0.01 }), CFG);
    expect(gate.mode).toBe('LOCK');
    expect(gate.allowed).toBe(false);                                // 베팅 차단
    expect(gate.maxStakePct).toBe(CFG.LOCK_MAX_PCT);                 // exact
    expect(gate.maxStakePct).toBeLessThanOrEqual(CFG.DEFENSE_MAX_PCT); // 범위: 가장 작아야 함
  });

  test('EV=0 → LOCK 아님 (경계값)', () => {
    // ev < 0 조건이므로 ev=0은 LOCK 아님
    const gate = evaluateDecisionGate(makeCtx({ ev: 0 }), CFG);
    expect(gate.mode).not.toBe('LOCK');
    expect(gate.allowed).toBe(true);
  });
});

// ── calibInsufficient ─────────────────────────────────────────
describe('calibInsufficient', () => {
  test('calibSamples < MIN_CALIB_SAMPLES → calibInsufficient=true', () => {
    // MIN_CALIB_SAMPLES=30
    const gate = evaluateDecisionGate(makeCtx({ calibSamples: 10 }), CFG);
    expect(gate.calibInsufficient).toBe(true);
  });

  test('calibSamples >= MIN_CALIB_SAMPLES → calibInsufficient=false', () => {
    const gate = evaluateDecisionGate(makeCtx({ calibSamples: 30 }), CFG);
    expect(gate.calibInsufficient).toBe(false);
  });

  test('calibInsufficient 상태에서 calibration은 무시 → DEFENSE 미발동', () => {
    // calibSamples 부족 시 calibration=null 처리 → ECE_DEFENSE 초과해도 DEFENSE 안 됨
    const gate = evaluateDecisionGate(makeCtx({ calibSamples: 10, calibration: 0.99 }), CFG);
    expect(gate.mode).toBe('NORMAL');
    expect(gate.kellyMultiplier).toBe(1.0);
  });
});

// ── getGateConfig ─────────────────────────────────────────────
describe('getGateConfig', () => {
  test('appSettings 없으면 DEFAULT 반환', () => {
    const cfg = getGateConfig({});
    expect(cfg.ECE_WARNING).toBe(0.06);
    expect(cfg.MIN_CALIB_SAMPLES).toBe(30);
  });

  test('gateConfig 오버라이드 적용', () => {
    const cfg = getGateConfig({ gateConfig: { ECE_WARNING: 0.10 } });
    expect(cfg.ECE_WARNING).toBe(0.10);
    expect(cfg.ECE_DEFENSE).toBe(0.08); // 나머지는 DEFAULT 유지
  });
});
