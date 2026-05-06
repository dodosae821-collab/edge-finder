// kelly.test.js
// 대상: computeKellyUnit, getCalibCorrFactor, getAdaptiveMultiplier

// ── 모듈 로드 (window 모킹 후 kelly.js 주입) ─────────────────
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'kelly.js'), 'utf8'), ctx);

const { computeKellyUnit, getCalibCorrFactor, getAdaptiveMultiplier } = ctx.window;

// ── 픽스처 헬퍼 ────────────────────────────────────────────────
function makeWins(n) {
  return Array.from({ length: n }, () => ({
    result: 'WIN', betmanOdds: 2.0, amount: 10000, profit: 10000,
    savedAt: new Date().toISOString(),
  }));
}
function makeLosses(n) {
  return Array.from({ length: n }, () => ({
    result: 'LOSE', betmanOdds: 2.0, amount: 10000, profit: -10000,
    savedAt: new Date().toISOString(),
  }));
}

// 기본 파라미터 — 테스트마다 필요한 것만 오버라이드
function baseParams(overrides = {}) {
  return {
    seed: 120000,
    bankroll: 1000000,
    maxBetPct: 5,
    gradeAdj: 1.0,
    kellyGradeAdj: false,
    decisionFactor: 1.0,
    allResolvedBets: [],
    prevMultiplier: 1.0,
    ...overrides,
  };
}


// ── getCalibCorrFactor ─────────────────────────────────────────
describe('getCalibCorrFactor', () => {
  test('resolvedCount < 30 → 1.0 (비활성)', () => {
    expect(getCalibCorrFactor(0.8, 0)).toBe(1.0);
    expect(getCalibCorrFactor(0.8, 29)).toBe(1.0);
  });

  test('resolvedCount 30~49 → 50% 강도', () => {
    // corrFactor=0.8 → cf=0.8, 50% → 1.0 + (0.8-1.0)*0.5 = 0.9
    expect(getCalibCorrFactor(0.8, 30)).toBeCloseTo(0.9);
    expect(getCalibCorrFactor(0.8, 49)).toBeCloseTo(0.9);
  });

  test('resolvedCount >= 50 → 100% 적용', () => {
    expect(getCalibCorrFactor(0.8, 50)).toBeCloseTo(0.8);
    expect(getCalibCorrFactor(0.8, 100)).toBeCloseTo(0.8);
  });

  test('corrFactor > 1.0 (과소추정) → cap at 1.0', () => {
    expect(getCalibCorrFactor(1.5, 50)).toBe(1.0);
    expect(getCalibCorrFactor(1.5, 30)).toBe(1.0);
  });

  test('corrFactor == null → 1.0', () => {
    expect(getCalibCorrFactor(null, 50)).toBe(1.0);
  });
});


// ── getAdaptiveMultiplier ──────────────────────────────────────
describe('getAdaptiveMultiplier', () => {
  test('sampleSize < 10 → 1.0 (중립)', () => {
    expect(getAdaptiveMultiplier(15, 0)).toBe(1.0);
    expect(getAdaptiveMultiplier(15, 9)).toBe(1.0);
  });

  test('ROI 구간 경계값 정확히 검증', () => {
    // 경계 포함: roi >= N
    expect(getAdaptiveMultiplier(10,  20)).toBe(1.2);   // >= 10
    expect(getAdaptiveMultiplier(5,   20)).toBe(1.1);   // >= 5, < 10
    expect(getAdaptiveMultiplier(0,   20)).toBe(1.0);   // >= 0, < 5
    expect(getAdaptiveMultiplier(-5,  20)).toBe(0.9);   // >= -5, < 0
    expect(getAdaptiveMultiplier(-10, 20)).toBe(0.75);  // >= -10, < -5
    expect(getAdaptiveMultiplier(-11, 20)).toBe(0.6);   // < -10
  });

  test('ROI 경계 초과값 — "경계 포함 vs 초과" 버그 잡기', () => {
    expect(getAdaptiveMultiplier(9.9999, 20)).toBe(1.1);   // 10 미만 → 1.1
    expect(getAdaptiveMultiplier(-10.0001, 20)).toBe(0.6); // -10 미만 → 0.6
    expect(getAdaptiveMultiplier(4.9999, 20)).toBe(1.0);   // 5 미만 → 1.0
    expect(getAdaptiveMultiplier(-4.9999, 20)).toBe(0.9);  // -5 이상 → 0.9
  });
});


// ── computeKellyUnit ──────────────────────────────────────────
describe('computeKellyUnit', () => {

  // ── 기본 방어 케이스 ────────────────────────────────────────
  test('seed=0 → kellyUnit=0', () => {
    const r = computeKellyUnit(baseParams({ seed: 0 }));
    expect(r.kellyUnit).toBe(0);
  });

  test('bankroll=0 → maxUnit=0, kellyUnit=0, nextMultiplier는 유효 범위 유지', () => {
    const r = computeKellyUnit(baseParams({ bankroll: 0, seed: 120000 }));
    expect(r.maxUnit).toBe(0);
    expect(r.kellyUnit).toBe(0);
    // multiplier 독립성: bankroll=0이어도 정상 계산
    expect(r.nextMultiplier).not.toBeNaN();
    expect(r.nextMultiplier).toBeGreaterThanOrEqual(0.5);
    expect(r.nextMultiplier).toBeLessThanOrEqual(1.2);
  });

  // ── prevMultiplier 극단값 ───────────────────────────────────
  test('prevMultiplier=NaN → safePrev=1.0 폴백', () => {
    const bets = [...makeWins(10)];  // sampleSize=10, 히스테리시스 활성
    const r = computeKellyUnit(baseParams({ prevMultiplier: NaN, allResolvedBets: bets }));
    expect(r.kellyUnit).not.toBeNaN();
    expect(r.nextMultiplier).not.toBeNaN();
  });

  test('prevMultiplier=Infinity → safePrev=1.0 폴백', () => {
    const bets = [...makeWins(10)];
    const r = computeKellyUnit(baseParams({ prevMultiplier: Infinity, allResolvedBets: bets }));
    expect(r.nextMultiplier).not.toBeNaN();
    expect(r.nextMultiplier).toBeGreaterThanOrEqual(0.5);
    expect(r.nextMultiplier).toBeLessThanOrEqual(1.2);
  });

  test('prevMultiplier=undefined → safePrev=1.0 폴백', () => {
    const bets = [...makeWins(10)];
    const r = computeKellyUnit(baseParams({ prevMultiplier: undefined, allResolvedBets: bets }));
    expect(r.nextMultiplier).not.toBeNaN();
  });

  // ── 손실 방어 (recentLossCount >= 7) ───────────────────────
  test('최근 10건 중 손실 7건 이상 → multiplier에 0.7 적용 (강제 축소)', () => {
    // 손실 7 + 승리 3 → 기본 multiplier * 0.7
    const bets = [...makeLosses(7), ...makeWins(3)];
    const r = computeKellyUnit(baseParams({ allResolvedBets: bets }));
    // 기본 ROI가 음수(-40%) → getAdaptiveMultiplier → 0.6~0.9 사이
    // *0.7 후 clamp → 0.5 이상 보장
    expect(r.adaptiveMultiplier).toBeGreaterThanOrEqual(0.5);
    expect(r.adaptiveMultiplier).toBeLessThanOrEqual(0.7 * 0.9 + 0.001); // 0.7 적용 확인용 상한
  });

  // ── sampleSize < 5 → 히스테리시스 스킵 ────────────────────
  test('sampleSize < 5 → 히스테리시스 스킵 (prevMultiplier 무관하게 계산값 그대로)', () => {
    const bets = makeWins(4); // sampleSize=4 < 5
    const rWithPrev = computeKellyUnit(baseParams({ allResolvedBets: bets, prevMultiplier: 0.5 }));
    const rNoPrev   = computeKellyUnit(baseParams({ allResolvedBets: bets, prevMultiplier: 1.2 }));
    // 히스테리시스 스킵이면 두 결과가 동일해야 함
    expect(rWithPrev.adaptiveMultiplier).toBe(rNoPrev.adaptiveMultiplier);
  });

  // ── ROI 극단값 clamp ────────────────────────────────────────
  test('ROI 극단값 ±100 → multiplier 0.5~1.2 범위 유지', () => {
    // 극단 손실: profit=-100000 × 30건
    const bigLoss = Array.from({ length: 30 }, () => ({
      result: 'LOSE', amount: 10000, profit: -100000,
      savedAt: new Date().toISOString(),
    }));
    const r1 = computeKellyUnit(baseParams({ allResolvedBets: bigLoss }));
    expect(r1.adaptiveMultiplier).toBeGreaterThanOrEqual(0.5);
    expect(r1.adaptiveMultiplier).toBeLessThanOrEqual(1.2);

    // 극단 이익
    const bigWin = Array.from({ length: 30 }, () => ({
      result: 'WIN', amount: 10000, profit: 100000,
      savedAt: new Date().toISOString(),
    }));
    const r2 = computeKellyUnit(baseParams({ allResolvedBets: bigWin }));
    expect(r2.adaptiveMultiplier).toBeGreaterThanOrEqual(0.5);
    expect(r2.adaptiveMultiplier).toBeLessThanOrEqual(1.2);
  });

  // ── nextMultiplier 항상 유효 범위 ──────────────────────────
  test('nextMultiplier는 항상 0.5~1.2 범위', () => {
    const cases = [
      baseParams(),
      baseParams({ allResolvedBets: makeLosses(10) }),
      baseParams({ allResolvedBets: makeWins(30) }),
      baseParams({ bankroll: 0 }),
      baseParams({ seed: 0 }),
    ];
    for (const p of cases) {
      const r = computeKellyUnit(p);
      expect(r.nextMultiplier).toBeGreaterThanOrEqual(0.5);
      expect(r.nextMultiplier).toBeLessThanOrEqual(1.2);
    }
  });

  // ── MIN_BET 미만 raw → 강제 하한 미적용 ────────────────────
  test('raw < MIN_BET(1000) → 강제 하한 미적용 (부풀림 방지)', () => {
    // seed=100 → baseKelly = floor(100/12) = 8 → raw << 1000
    const r = computeKellyUnit(baseParams({ seed: 100, bankroll: 1000000 }));
    expect(r.kellyUnit).toBeLessThan(1000);
  });

  // ── NaN 전파 테스트 ─────────────────────────────────────────
  test('NaN 입력 → 출력에 NaN 없어야 함', () => {
    const r = computeKellyUnit(baseParams({
      seed: NaN,
      gradeAdj: NaN,
      decisionFactor: NaN,
    }));
    expect(r.kellyUnit).not.toBeNaN();
    expect(r.nextMultiplier).not.toBeNaN();
    expect(r.maxUnit).not.toBeNaN();
  });
});
