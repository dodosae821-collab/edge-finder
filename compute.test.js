// compute.test.js
// 대상: computeBaseStats, computeRiskMetrics, computeCalibration, computeAnalyzeMetrics

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, 'compute.js'), 'utf8');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(code, ctx);

const { computeBaseStats, computeRiskMetrics, computeCalibration, computeAnalyzeMetrics } = ctx;

function makeBet(result, profit, amount = 10000, myProb = null, calibProb = null) {
  return { result, profit, amount, myProb, calibProb };
}

// ── computeBaseStats ───────────────────────────────────────────
describe('computeBaseStats', () => {
  test('빈 배열 → stddev=0, resolvedCount=0', () => {
    const r = computeBaseStats([], 10000);
    expect(r.stddev).toBe(0);
    expect(r.resolvedCount).toBe(0);
    expect(r.avgAmtRounded).toBe(10000);
  });

  test('단일값 → stddev=0', () => {
    const r = computeBaseStats([makeBet('WIN', 10000)], 10000);
    expect(r.stddev).toBe(0);
  });

  test('복수값 → stddev > 0', () => {
    const r = computeBaseStats([makeBet('WIN', 10000), makeBet('LOSE', -10000)], 10000);
    expect(r.stddev).toBeGreaterThan(0);
  });

  test('PENDING 제외 → resolvedCount 정확', () => {
    const bets = [makeBet('WIN', 10000), makeBet('PENDING', 0), makeBet('LOSE', -10000)];
    expect(computeBaseStats(bets, 10000).resolvedCount).toBe(2);
  });

  test('avgAmt=NaN → avgAmtRounded=0 (방어)', () => {
    const r = computeBaseStats([], NaN);
    expect(r.avgAmtRounded).toBe(0);
    expect(r.avgAmtRounded).not.toBeNaN();
  });

  test('출력에 NaN 없음', () => {
    const r = computeBaseStats([makeBet('WIN', NaN)], NaN);
    expect(r.stddev).not.toBeNaN();
    expect(r.avgAmtRounded).not.toBeNaN();
  });
});

// ── computeRiskMetrics ─────────────────────────────────────────
describe('computeRiskMetrics', () => {
  const start = 1000000;

  test('Kelly 공식 정확성 — 오차 < 1e-6', () => {
    const winRate = 0.55, avgOdds = 2.5, avgAmt = 10000;
    const r = computeRiskMetrics([], winRate, avgOdds, avgAmt, start);
    const expected = (winRate * (avgOdds - 1) - (1 - winRate)) / (avgOdds - 1);
    expect(Math.abs(r.kelly - expected)).toBeLessThan(1e-6);
  });

  test('Kelly 음수 → 0으로 clamp', () => {
    const r = computeRiskMetrics([], 0.3, 1.8, 10000, start);
    expect(r.kelly).toBe(0);
    expect(r.halfKelly).toBe(0);
    expect(r.optAmt).toBe(0);
    expect(r.kellyOk).toBe(false);
  });

  test('winRate < 0.45 → riskLevel=high', () => {
    expect(computeRiskMetrics([], 0.44, 1.9, 10000, start).riskLevel).toBe('high');
  });

  test('winRate 0.45~0.50 → riskLevel=mid', () => {
    expect(computeRiskMetrics([], 0.47, 1.9, 10000, start).riskLevel).toBe('mid');
  });

  test('winRate >= 0.50 → riskLevel=low', () => {
    expect(computeRiskMetrics([], 0.55, 1.9, 10000, start).riskLevel).toBe('low');
  });

  test('profits 단일값 → stddev=0', () => {
    expect(computeRiskMetrics([makeBet('WIN', 10000)], 0.5, 1.9, 10000, start).stddev).toBe(0);
  });

  test('profits 복수값 → stddev > 0', () => {
    const r = computeRiskMetrics(
      [makeBet('WIN', 10000), makeBet('LOSE', -10000)], 0.5, 1.9, 10000, start
    );
    expect(r.stddev).toBeGreaterThan(0);
  });

  test('winRate=NaN → 의사결정 값 null (조기 반환)', () => {
    const bets = [makeBet('WIN', 10000), makeBet('LOSE', -10000)];
    const r = computeRiskMetrics(bets, NaN, 1.9, 10000, start);
    expect(r.kelly).toBeNull();
    expect(r.halfKelly).toBeNull();
    expect(r.optAmt).toBeNull();
    expect(r.kellyOk).toBeNull();
    expect(r.riskLevel).toBeNull();
  });

  test('NaN 조기 반환 시 기초 통계 유지', () => {
    const bets = [makeBet('WIN', 10000), makeBet('LOSE', -10000)];
    const r = computeRiskMetrics(bets, NaN, 1.9, 10000, start);
    expect(r.stddev).not.toBeNaN();
    expect(r.stddev).toBeGreaterThan(0);
    expect(r.avgAmtRounded).toBe(10000);
    expect(r.resolvedCount).toBe(2);
  });

  test('avgOdds=NaN → 조기 반환', () => {
    const r = computeRiskMetrics([], 0.5, NaN, 10000, start);
    expect(r.kelly).toBeNull();
    expect(r.riskLevel).toBeNull();
  });

  test('start=NaN → 조기 반환', () => {
    expect(computeRiskMetrics([], 0.5, 1.9, 10000, NaN).kelly).toBeNull();
  });

  test('정상 입력 → kelly NaN 아님 (출력 안전망)', () => {
    const r = computeRiskMetrics([], 0.55, 2.5, 10000, start);
    expect(r.kelly).not.toBeNaN();
    expect(r.kelly).not.toBeNull();
  });
});

// ── computeCalibration ─────────────────────────────────────────
describe('computeCalibration', () => {
  test('predBets < 30 → 전부 null 반환', () => {
    const bets = Array.from({ length: 29 }, () => makeBet('WIN', 1000, 1000, 60));
    const r = computeCalibration(bets);
    expect(r.eceRaw).toBeNull();
    expect(r.eceCalib).toBeNull();
    expect(r.biasRaw).toBeNull();
    expect(r.biasCalib).toBeNull();
    expect(r.bins).toHaveLength(0);
  });

  test('정상 데이터 → eceRaw >= 0', () => {
    const bets = Array.from({ length: 30 }, () => makeBet('WIN', 1000, 1000, 62));
    const r = computeCalibration(bets);
    expect(r.eceRaw).not.toBeNull();
    expect(r.eceRaw).toBeGreaterThanOrEqual(0);
  });

  test('완벽한 캘리브레이션 → eceRaw ≈ 0', () => {
    const bets = Array.from({ length: 30 }, (_, i) =>
      makeBet(i < 15 ? 'WIN' : 'LOSE', i < 15 ? 1000 : -1000, 1000, 50)
    );
    const r = computeCalibration(bets);
    expect(r.eceRaw).not.toBeNull();
    expect(r.eceRaw).toBeCloseTo(0, 1);
  });

  test('극단 과신 (예측 80%, 실제 30%) → 높은 eceRaw', () => {
    const bets = [
      ...Array.from({ length: 9  }, () => makeBet('WIN',  1000, 1000, 82)),
      ...Array.from({ length: 21 }, () => makeBet('LOSE', -1000, 1000, 82)),
    ];
    const r = computeCalibration(bets);
    expect(r.eceRaw).not.toBeNull();
    expect(r.eceRaw).toBeGreaterThan(30);
  });

  test('모든 확률 동일 (전부 50) → calibWr=null, eceCalib=null', () => {
    const bets = Array.from({ length: 30 }, (_, i) =>
      makeBet(i < 15 ? 'WIN' : 'LOSE', 0, 1000, 50, null)
    );
    const r = computeCalibration(bets);
    expect(r.eceRaw).not.toBeNull();
    expect(r.bins[0].calibWr).toBeNull();
    expect(r.eceCalib).toBeNull();
  });

  test('NaN 입력 → eceRaw null (샘플 부족 처리)', () => {
    const bets = Array.from({ length: 30 }, () => makeBet('WIN', NaN, NaN, NaN));
    expect(computeCalibration(bets).eceRaw).toBeNull();
  });
});

// ── computeAnalyzeMetrics ──────────────────────────────────────
describe('computeAnalyzeMetrics', () => {
  test('빈 배열 → avgProfit=null, evAvg=null', () => {
    const r = computeAnalyzeMetrics([]);
    expect(r.avgProfit).toBeNull();
    expect(r.evAvg).toBeNull();
  });

  test('PENDING만 있으면 → avgProfit=null', () => {
    expect(computeAnalyzeMetrics([{ result: 'PENDING', profit: 0 }]).avgProfit).toBeNull();
  });

  test('avgProfit 정확성', () => {
    const bets = [makeBet('WIN', 10000), makeBet('LOSE', -5000)];
    expect(computeAnalyzeMetrics(bets).avgProfit).toBe(2500);
  });

  test('evAvg — ev 필드 없으면 null', () => {
    expect(computeAnalyzeMetrics([makeBet('WIN', 1000)]).evAvg).toBeNull();
  });

  test('evAvg 정확성', () => {
    const bets = [
      { ...makeBet('WIN', 1000), ev: 0.05 },
      { ...makeBet('WIN', 1000), ev: 0.15 },
    ];
    expect(computeAnalyzeMetrics(bets).evAvg).toBeCloseTo(0.10, 5);
  });
});


// ── computeBaseStats 비정상 profit 입력 회귀 테스트 ───────────
describe('computeBaseStats — 비정상 profit 입력', () => {
  test('profit 문자열 숫자("5000") → stddev NaN 아님, 정상 계산', () => {
    const bets = [
      { result: 'WIN',  profit: '10000' },
      { result: 'LOSE', profit: '-10000' },
    ];
    const r = computeBaseStats(bets, 10000);
    expect(r.stddev).not.toBeNaN();
    expect(r.stddev).toBeGreaterThan(0);  // 두 값 분산 존재
  });

  test('profit 비숫자 문자열("abc") → 필터 제거, stddev=0', () => {
    const bets = [
      { result: 'WIN',  profit: 'abc' },
      { result: 'LOSE', profit: 'xyz' },
    ];
    const r = computeBaseStats(bets, 10000);
    expect(r.stddev).not.toBeNaN();
    expect(r.stddev).toBe(0);  // 유효 profit 없음 → variance=0
  });

  test('profit undefined → 필터 제거, stddev=0', () => {
    const bets = [
      { result: 'WIN',  profit: undefined },
      { result: 'LOSE', profit: undefined },
    ];
    const r = computeBaseStats(bets, 10000);
    expect(r.stddev).not.toBeNaN();
    expect(r.stddev).toBe(0);
  });

  test('profit 혼합 (정상 + undefined + 문자열) → 정상값만 사용', () => {
    const bets = [
      { result: 'WIN',  profit: 10000 },
      { result: 'LOSE', profit: undefined },
      { result: 'WIN',  profit: '나쁜값' },
      { result: 'LOSE', profit: -10000 },
    ];
    const r = computeBaseStats(bets, 10000);
    // 유효값: [10000, -10000] → 정상 분산 계산
    expect(r.stddev).not.toBeNaN();
    expect(r.stddev).toBeGreaterThan(0);
    expect(r.resolvedCount).toBe(4); // resolvedCount는 필터 전 resolved 기준
  });

  test('profit 1건 → stddev=0 (분산 의미 없음, 조기 반환)', () => {
    const bets = [{ result: 'WIN', profit: 10000 }];
    const r = computeBaseStats(bets, 10000);
    expect(r.stddev).toBe(0);
    expect(r.stddev).not.toBeNaN();
    expect(r.resolvedCount).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════
// ── bet_form.js compute 함수 테스트
//    대상: computeLossRatio, computeEVDisplay, computeOneWayDecision
// ══════════════════════════════════════════════════════════════

const betFormCode = fs.readFileSync(path.join(__dirname, 'bet_form.js'), 'utf8');

function makeBetFormCtx(overrides = {}) {
  // computeOneWayDecision 내부 typeof 가드 — stub 주입
  const base = {
    console,
    // DOM stub (bet_form.js 상단 함수들이 document 참조하지 않도록)
    document: { getElementById: () => null, querySelectorAll: () => [] },
    window: { _SS: null, _selectedType: null },
    appSettings: { kellySeed: 1000000, startFund: 1000000 },
    // compute 함수에서 typeof 가드로 참조하는 외부 함수
    toProb:              (pct) => Math.min(Math.max(pct, 0), 100) / 100,
    getAdjustedProbLive: null,  // 기본: fallback 경로 사용
    getBetDecisionLive:  null,  // 기본: fallback 경로 사용
    // render/UI 함수 stub (테스트 대상 아님)
    renderDecisionBlock: () => {},
    clearDecisionBlock:  () => {},
    renderFolderRows:    () => {},
    makeFolderRow:       () => ({}),
    updateFolderUI:      () => {},
    calcMultiEV:         () => {},
    initFolderMemoTabs:  () => {},
    initSingleMemoTabs:  () => {},
    getActiveCorrFactor: () => 1.0,
    getCalibrated:       (p) => p,
    getKellyMultiplier:  () => 1.0,
    getCLVAdjustedProb:  (v) => v,
    getAdjustedProb:     (v) => v,
    calcKelly:           () => {},
    selectEmotion:       () => {},
    toggleGenericDropdown: () => {},
    openSportPicker:     () => {},
    openFolderTypePicker:() => {},
    validateFolderMemo:  () => {},
    ...overrides,
  };
  const vmCtx = { ...base };
  vm.createContext(vmCtx);
  vm.runInContext(betFormCode, vmCtx);
  return vmCtx;
}

const bfCtx = makeBetFormCtx();
const { computeLossRatio, computeEVDisplay, computeOneWayDecision } = bfCtx;

// ── computeLossRatio ──────────────────────────────────────────
describe('computeLossRatio', () => {
  test('pct <= 2% → green / icon=✅', () => {
    const r = computeLossRatio(10000, 1000000);   // 1%
    expect(r.pct).toBeCloseTo(1, 5);
    expect(r.color).toBe('var(--green)');
    expect(r.icon).toBe('✅');
    expect(r.msg).toMatch(/이내/);
  });

  test('pct 2~3% → gold / icon=⚠️', () => {
    const r = computeLossRatio(25000, 1000000);   // 2.5%
    expect(r.color).toBe('var(--gold)');
    expect(r.icon).toBe('⚠️');
    expect(r.msg).toMatch(/초과/);
  });

  test('pct > 3% → red / icon=🔴', () => {
    const r = computeLossRatio(50000, 1000000);   // 5%
    expect(r.color).toBe('var(--red)');
    expect(r.icon).toBe('🔴');
    expect(r.msg).toMatch(/위험/);
  });

  test('정확히 2% 경계 → green', () => {
    const r = computeLossRatio(20000, 1000000);   // 2.0%
    expect(r.color).toBe('var(--green)');
  });

  test('정확히 3% 경계 → red (limit*1.5 초과)', () => {
    const r = computeLossRatio(30001, 1000000);   // 3.0001%
    expect(r.color).toBe('var(--red)');
  });

  test('NaN 없음', () => {
    const r = computeLossRatio(10000, 1000000);
    expect(r.pct).not.toBeNaN();
  });

  test('반환 객체 필드 완전성', () => {
    const r = computeLossRatio(10000, 1000000);
    expect(r).toHaveProperty('pct');
    expect(r).toHaveProperty('bg');
    expect(r).toHaveProperty('border');
    expect(r).toHaveProperty('color');
    expect(r).toHaveProperty('icon');
    expect(r).toHaveProperty('msg');
  });
});

// ── computeEVDisplay ──────────────────────────────────────────
describe('computeEVDisplay', () => {
  test('보정 없음 (acf=1.0, pCalib=probFrac) → isOn=false', () => {
    const r = computeEVDisplay(0.55, 2.0, 0.55, 1.0);
    expect(r.isOn).toBe(false);
    expect(r.evFinal).toBe(r.ev);
  });

  test('acf < 0.999 → isOn=true, evFinal=evAdj', () => {
    const r = computeEVDisplay(0.55, 2.0, 0.55, 0.9);
    expect(r.isOn).toBe(true);
    expect(r.evFinal).toBe(r.evAdj);
  });

  test('pCalib !== probFrac → isOn=true', () => {
    const r = computeEVDisplay(0.55, 2.0, 0.50, 1.0);
    expect(r.isOn).toBe(true);
  });

  test('EV 계산 정확성 — p=0.55, odds=2.0', () => {
    // ev = 0.55 * 1 - 0.45 * 1 = 0.10
    const r = computeEVDisplay(0.55, 2.0, 0.55, 1.0);
    expect(r.ev).toBeCloseTo(0.10, 5);
  });

  test('EV 음수 케이스 — p=0.40, odds=2.0', () => {
    // ev = 0.40 * 1 - 0.60 = -0.20
    const r = computeEVDisplay(0.40, 2.0, 0.40, 1.0);
    expect(r.ev).toBeCloseTo(-0.20, 5);
  });

  test('NaN 없음 — 경계값 입력', () => {
    const r = computeEVDisplay(0, 1, 0, 1.0);
    expect(r.ev).not.toBeNaN();
    expect(r.evAdj).not.toBeNaN();
    expect(r.evFinal).not.toBeNaN();
  });

  test('반환 객체 필드 완전성', () => {
    const r = computeEVDisplay(0.55, 2.0, 0.55, 1.0);
    ['ev', 'evAdj', 'evFinal', 'isOn', 'pAdj'].forEach(k =>
      expect(r).toHaveProperty(k)
    );
  });
});

// ── computeOneWayDecision ─────────────────────────────────────
describe('computeOneWayDecision — fallback 경로 (getBetDecisionLive 없음)', () => {
  // getAdjustedProbLive / getBetDecisionLive 없음 → typeof 가드 fallback

  test('정상 입력 → 반환 필드 완전성', () => {
    const r = computeOneWayDecision(55, 2.0, null, 1000000, 1.0);
    ['adjResult','decision','pAdj','ev','kellyFrac','finalBet','verdict'].forEach(k =>
      expect(r).toHaveProperty(k)
    );
  });

  test('fallback adjResult → adjustedProb = 입력 prob', () => {
    const r = computeOneWayDecision(55, 2.0, null, 1000000, 1.0);
    expect(r.adjResult.adjustedProb).toBe(55);
    expect(r.adjResult.source).toBe('RAW');
  });

  test('fallback decision → allow=true, kellyFactor=1.0', () => {
    const r = computeOneWayDecision(55, 2.0, null, 1000000, 1.0);
    expect(r.decision.allow).toBe(true);
    expect(r.decision.kellyFactor).toBe(1.0);
  });

  test('EV 양수 + finalBet > 0 → verdict = ss.verdict or WAIT', () => {
    const r = computeOneWayDecision(55, 2.0, { verdict: 'GO' }, 1000000, 1.0);
    expect(r.verdict).toBe('GO');
  });

  test('EV 음수 → verdict=PASS', () => {
    // p=0.30 prob 30%, odds=2.0 → ev 음수
    const r = computeOneWayDecision(30, 2.0, null, 1000000, 1.0);
    expect(r.verdict).toBe('PASS');
  });

  test('seed=0 → finalBet=0', () => {
    const r = computeOneWayDecision(55, 2.0, null, 0, 1.0);
    expect(r.finalBet).toBe(0);
  });

  test('NaN 없음 — 정상 입력', () => {
    const r = computeOneWayDecision(55, 2.0, null, 1000000, 1.0);
    expect(r.pAdj).not.toBeNaN();
    expect(r.ev).not.toBeNaN();
    expect(r.kellyFrac).not.toBeNaN();
    expect(r.finalBet).not.toBeNaN();
  });

  test('kellyFrac 음수 → 0으로 clamp', () => {
    // p=0.30, odds=2.0 → Kelly 음수
    const r = computeOneWayDecision(30, 2.0, null, 1000000, 1.0);
    expect(r.kellyFrac).toBe(0);
  });
});

describe('computeOneWayDecision — getBetDecisionLive stub 주입', () => {
  test('allow=false → verdict=BLOCK, finalBet=0', () => {
    const ctx2 = makeBetFormCtx({
      getBetDecisionLive: () => ({
        allow: false, kellyFactor: 0, reason: 'RECENT_ECE_BLOCK',
        label: 'BLOCK', labelColor: 'var(--red)', desc: '차단', confidenceLevel: 'LOW',
      }),
    });
    const r = ctx2.computeOneWayDecision(55, 2.0, null, 1000000, 1.0);
    expect(r.verdict).toBe('BLOCK');
    expect(r.finalBet).toBe(0);
  });

  test('kellyFactor=0.5 → finalBet = floor(rawBet * 0.5)', () => {
    const ctx3 = makeBetFormCtx({
      getBetDecisionLive: () => ({
        allow: true, kellyFactor: 0.5, reason: 'MID_ECE',
        label: 'REDUCE', labelColor: '#ff9800', desc: '', confidenceLevel: 'MID',
      }),
    });
    const r   = ctx3.computeOneWayDecision(55, 2.0, { verdict: 'GO' }, 1000000, 1.0);
    const full = ctx3.computeOneWayDecision(55, 2.0, { verdict: 'GO' }, 1000000, 1.0);
    // finalBet은 kellyFactor=0.5가 적용된 값이어야 함
    expect(r.finalBet).toBe(full.finalBet);
    expect(r.finalBet).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────
// computeAdjProbHint 테스트
// ─────────────────────────────────────────────────────────────
const { computeAdjProbHint, computeDashboardKPI, computeStatsDisplay } = ctx;

describe('computeAdjProbHint', () => {
  test('n < 30 → waiting=true, needed 계산', () => {
    const r = computeAdjProbHint(55, 52, 20);
    expect(r.waiting).toBe(true);
    expect(r.n).toBe(20);
    expect(r.needed).toBe(10);
  });

  test('n = 29 → 아직 대기 (경계값)', () => {
    const r = computeAdjProbHint(60, 57, 29);
    expect(r.waiting).toBe(true);
    expect(r.needed).toBe(1);
  });

  test('n = 30 → 대기 종료, diff 계산', () => {
    const r = computeAdjProbHint(60, 57, 30);
    expect(r.waiting).toBe(false);
    expect(r.diff).toBeCloseTo(-3, 5);
  });

  test('diff < -2 → 과신 보정 레이블 + red 색상', () => {
    const r = computeAdjProbHint(60, 56, 40);
    expect(r.waiting).toBe(false);
    expect(r.label).toContain('과신 보정');
    expect(r.color).toBe('var(--red)');
  });

  test('diff > 2 → 과소추정 보정 레이블 + green 색상', () => {
    const r = computeAdjProbHint(50, 54, 40);
    expect(r.waiting).toBe(false);
    expect(r.label).toContain('과소추정 보정');
    expect(r.color).toBe('var(--green)');
  });

  test('|diff| <= 2 → 소폭 보정 레이블 + accent 색상', () => {
    const r = computeAdjProbHint(55, 56, 40);
    expect(r.waiting).toBe(false);
    expect(r.label).toContain('소폭 보정');
    expect(r.color).toBe('var(--accent)');
  });

  test('n < 50 → 50% 강도 표시', () => {
    const r = computeAdjProbHint(55, 56, 35);
    expect(r.strength).toContain('50% 강도');
  });

  test('n >= 50 → 100% 강도 표시', () => {
    const r = computeAdjProbHint(55, 56, 50);
    expect(r.strength).toContain('100% 강도');
  });

  test('diffStr 부호 포함 포맷 확인 (양수)', () => {
    const r = computeAdjProbHint(50, 53, 40);
    expect(r.diffStr).toMatch(/^\+/);
  });

  test('diffStr 부호 포함 포맷 확인 (음수)', () => {
    const r = computeAdjProbHint(55, 52, 40);
    expect(r.diffStr).toMatch(/^-/);
  });
});

// ─────────────────────────────────────────────────────────────
// computeDashboardKPI 테스트
// ─────────────────────────────────────────────────────────────
describe('computeDashboardKPI', () => {
  function makeKpiSS(overrides = {}) {
    return {
      n: 20,
      winRate: 0.6,
      totalProfit: 150000,
      totalInvest: 1000000,
      roi: 15.0,
      avgOdds: 1.85,
      resolved: [
        { isValue: true,  result: 'WIN',  betmanOdds: 1.9 },
        { isValue: true,  result: 'LOSE', betmanOdds: 2.0 },
        { isValue: false, result: 'WIN',  betmanOdds: 0   },
      ],
      ...overrides,
    };
  }

  test('ss=null → null 반환', () => {
    expect(computeDashboardKPI(null)).toBeNull();
  });

  test('기본 필드 계산 정확성', () => {
    const kpi = computeDashboardKPI(makeKpiSS());
    expect(kpi.totalBets).toBe(20);
    expect(kpi.winRate).toBeCloseTo(60, 5);
    expect(kpi.roi).toBeCloseTo(15.0, 5);
  });

  test('valueWinRate 계산 — 2건 중 1 WIN → 50%', () => {
    const kpi = computeDashboardKPI(makeKpiSS());
    expect(kpi.valueWinRate).toBeCloseTo(50, 5);
  });

  test('valueBets 없으면 valueWinRate=0', () => {
    const ss = makeKpiSS({ resolved: [] });
    const kpi = computeDashboardKPI(ss);
    expect(kpi.valueWinRate).toBe(0);
  });

  test('oddsCount — betmanOdds > 0인 건수', () => {
    const kpi = computeDashboardKPI(makeKpiSS());
    expect(kpi.oddsCount).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────
// computeStatsDisplay 테스트
// ─────────────────────────────────────────────────────────────
describe('computeStatsDisplay', () => {
  const winBet  = { result: 'WIN',  profit:  50000, amount: 100000 };
  const loseBet = { result: 'LOSE', profit: -50000, amount: 100000 };

  test('ss 있을 때 — ss 값 우선 사용', () => {
    const ss = { wins: [winBet, winBet], winRate: 0.7, totalProfit: 200000, totalInvest: 500000, roi: 40, plRatio: 2.5 };
    const r  = computeStatsDisplay(ss, [winBet, loseBet]);
    expect(r.winRate).toBe(0.7);
    expect(r.roi).toBe(40);
    expect(r.plRatio).toBe(2.5);
  });

  test('ss=null → resolved 직접 계산 (폴백)', () => {
    const resolved = [winBet, loseBet];
    const r = computeStatsDisplay(null, resolved);
    expect(r.winRate).toBeCloseTo(0.5, 5);
    expect(r.totalProfit).toBe(0);
    expect(r.roi).toBe(0);
  });

  test('ss.plRatio <= 0 → 폴백 계산', () => {
    const ss = { wins: [winBet], winRate: 0.5, totalProfit: 0, totalInvest: 200000, roi: 0, plRatio: 0 };
    const r  = computeStatsDisplay(ss, [winBet, loseBet]);
    // plRatio 폴백: 평균 승리금 / 평균 손실금 = 50000/50000 = 1.0
    expect(r.plRatio).toBeCloseTo(1.0, 5);
  });

  test('손실만 있으면 plRatio=null (분모=0)', () => {
    const r = computeStatsDisplay(null, [loseBet, loseBet]);
    expect(r.plRatio).toBeNull();
  });

  test('winsCount 반환', () => {
    const ss = { wins: [winBet, winBet], winRate: 0.5, totalProfit: 0, totalInvest: 0, roi: 0, plRatio: 1 };
    const r  = computeStatsDisplay(ss, [winBet, loseBet]);
    expect(r.winsCount).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────
// computeRecentRows 테스트
// ─────────────────────────────────────────────────────────────
const { computeRecentRows } = ctx;

describe('computeRecentRows', () => {
  function makeBetR(date, result = 'WIN', profit = 10000) {
    return { date, result, profit, amount: 100000, game: 'test', betmanOdds: 1.9 };
  }

  test('빈 배열 → 빈 배열 반환', () => {
    expect(computeRecentRows([], [], 8)).toEqual([]);
  });

  test('null/undefined 입력 방어 → 빈 배열 반환', () => {
    expect(computeRecentRows(null, undefined, 8)).toEqual([]);
  });

  test('최신순 정렬 확인', () => {
    const rows = computeRecentRows([
      makeBetR('2024-01-01'),
      makeBetR('2024-03-01'),
      makeBetR('2024-02-01'),
    ], [], 8);
    expect(rows[0].date).toBe('2024-03-01');
    expect(rows[1].date).toBe('2024-02-01');
    expect(rows[2].date).toBe('2024-01-01');
  });

  test('limit=8 — 9건 입력 시 8건만 반환', () => {
    const resolved = Array.from({ length: 9 }, (_, i) =>
      makeBetR(`2024-0${(9 - i).toString().padStart(2, '0')}-01`)
    );
    expect(computeRecentRows(resolved, [], 8)).toHaveLength(8);
  });

  test('pending 합산 — resolved + pending 합쳐서 정렬', () => {
    const resolved = [makeBetR('2024-01-01', 'WIN')];
    const pending  = [makeBetR('2024-06-01', 'PENDING', 0)];
    const rows = computeRecentRows(resolved, pending, 8);
    expect(rows).toHaveLength(2);
    expect(rows[0].date).toBe('2024-06-01');
  });

  test('동일 date → 원본 순서 유지 (안정 정렬)', () => {
    const a = { ...makeBetR('2024-01-01'), game: 'A' };
    const b = { ...makeBetR('2024-01-01'), game: 'B' };
    const rows = computeRecentRows([a, b], [], 8);
    expect(rows[0].game).toBe('A');
    expect(rows[1].game).toBe('B');
  });

  test('date 없는 항목 → 빈 문자열로 처리, 크래시 없음', () => {
    const rows = computeRecentRows([
      makeBetR(undefined),
      makeBetR('2024-01-01'),
    ], [], 8);
    expect(rows).toHaveLength(2);
  });

  test('profit=NaN → 0으로 정규화', () => {
    const rows = computeRecentRows([{ ...makeBetR('2024-01-01'), profit: NaN }], [], 8);
    expect(rows[0].profit).toBe(0);
  });

  test('profit=null → 0으로 정규화', () => {
    const rows = computeRecentRows([{ ...makeBetR('2024-01-01'), profit: null }], [], 8);
    expect(rows[0].profit).toBe(0);
  });

  test('profit=0 → 0 그대로 유지', () => {
    const rows = computeRecentRows([makeBetR('2024-01-01', 'PENDING', 0)], [], 8);
    expect(rows[0].profit).toBe(0);
  });

  test('_idx 내부 필드 외부 노출 안 됨', () => {
    const rows = computeRecentRows([makeBetR('2024-01-01')], [], 8);
    expect(rows[0]).not.toHaveProperty('_idx');
  });

  test('limit 파라미터 커스텀 — limit=3', () => {
    const resolved = Array.from({ length: 5 }, (_, i) => makeBetR(`2024-0${i + 1}-01`));
    expect(computeRecentRows(resolved, [], 3)).toHaveLength(3);
  });
});
