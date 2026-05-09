// finseason.test.js
// 대상: computeSystemState — finSeason/isSim 경계 invariant + 핵심 subset snapshot
// 전략: 고정 픽스처 → invariant assertion + subset snapshot. 랜덤/실데이터 금지.
//
// 보호 대상 invariants (이번 시즌 구조 변경의 핵심):
//   1. moneyResolved ⊂ allResolved  (isSim 없음)
//   2. moneyResolved.every(b => b.finSeason === currentFinSeason)
//   3. moneyResolved.every(b => b.amount > 0 && Number.isFinite(b.profit))
//   4. sim 기록은 allResolved에서도 제외

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const STORAGE_KEY = 'edge_bets';
const CURRENT_FIN_SEASON = 2; // 테스트 전용 — "현재 시즌 = 2"

// ── 픽스처 ───────────────────────────────────────────────────
// 시즌2 정상 기록 (moneyResolved 포함 대상)
const SEASON2_BET_WIN  = { id: 1, result: 'WIN',  amount: 10000, profit:  8000, betmanOdds: 1.9, date: '2026-04-01', game: 'A', sport: 'NBA', type: 'WIN', finSeason: 2 };
const SEASON2_BET_LOSE = { id: 2, result: 'LOSE', amount: 10000, profit: -10000, betmanOdds: 1.9, date: '2026-04-02', game: 'B', sport: 'NBA', type: 'WIN', finSeason: 2 };

// 이전 시즌 기록 (allResolved 포함, moneyResolved 제외)
const SEASON1_BET = { id: 3, result: 'WIN', amount: 10000, profit: 8000, betmanOdds: 2.0, date: '2026-01-01', game: 'C', sport: 'NBA', type: 'WIN', finSeason: 1 };

// legacy 기록 (amount=0, profit=0, finSeason:0 — moneyResolved 제외)
const LEGACY_BET = { id: 4, result: 'WIN', amount: 0, profit: 0, betmanOdds: 2.0, date: '2025-12-01', game: 'D', sport: 'NBA', type: 'WIN', finSeason: 0 };

// 시뮬 기록 (finSeason:-1 — allResolved/moneyResolved 모두 제외)
const SIM_BET = { id: 5, result: 'WIN', amount: 10000, profit: 9000, betmanOdds: 1.95, date: '2026-04-03', game: 'E', sport: 'NBA', type: 'WIN', isSim: true, finSeason: -1 };

// amount=0 이지만 finSeason이 현재 시즌인 기록 (moneyResolved 제외 — amount 가드)
const ZERO_AMT_CURRENT = { id: 6, result: 'WIN', amount: 0, profit: 0, betmanOdds: 2.0, date: '2026-04-04', game: 'F', sport: 'NBA', type: 'WIN', finSeason: 2 };

// profit이 NaN인 기록 (moneyResolved 제외 — isFinite 가드)
const NAN_PROFIT_BET = { id: 7, result: 'LOSE', amount: 5000, profit: NaN, betmanOdds: 2.0, date: '2026-04-05', game: 'G', sport: 'NBA', type: 'WIN', finSeason: 2 };

// PENDING (resolved 자체에서 제외)
const PENDING_BET = { id: 8, result: 'PENDING', amount: 10000, profit: 0, betmanOdds: 2.0, date: '2026-04-06', game: 'H', sport: 'NBA', type: 'WIN', finSeason: 2 };

const ALL_BETS = [
  SEASON2_BET_WIN,
  SEASON2_BET_LOSE,
  SEASON1_BET,
  LEGACY_BET,
  SIM_BET,
  ZERO_AMT_CURRENT,
  NAN_PROFIT_BET,
  PENDING_BET,
];

// moneyResolved에 포함되어야 하는 기록 id (기대값)
const EXPECTED_MONEY_IDS = [1, 2]; // 시즌2 + amount>0 + isFinite(profit)

// allResolved에 포함되어야 하는 기록 id (기대값)
// sim 제외, PENDING 제외 → id: 1,2,3,4,6,7
const EXPECTED_ALL_IDS = [1, 2, 3, 4, 6, 7];

// ── localStorage stub ─────────────────────────────────────────
function makeLocalStorage(bets) {
  const store = { [STORAGE_KEY]: JSON.stringify({ schemaVersion: 2, bets }) };
  return {
    getItem:    (k) => store[k] ?? null,
    setItem:    (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; },
  };
}

// ── vm context ────────────────────────────────────────────────
function buildCtx(bets, finSeason = CURRENT_FIN_SEASON, scope = 'round') {
  const win = { App: { debug: false, kellyPrevMultiplier: 1.0 }, addEventListener: () => {}, _SS: null };
  return {
    console:      { ...console, assert: () => {}, warn: () => {} },
    window:       win,
    localStorage: makeLocalStorage(bets),
    bets,
    getCurrentScope:    () => scope,
    getCurrentProject:  () => null,
    getActiveRound:     () => null,
    getBetsByScope:     () => bets,
    appSettings: {
      kellySeed:          1000000,
      startFund:          1000000,
      targetFund:         0,
      maxBetPct:          5,
      kellyGradeAdj:      false,
      gateConfig:         {},
      currentFinSeason:   finSeason,
    },
    getBetSeed:         () => 1000000,
    getCurrentBankroll: () => 1000000,
    buildDecisionContext:  () => ({}),
    getGateConfig:         () => ({}),
    evaluateDecisionGate:  () => ({ mode: 'NORMAL', allowed: true, kellyMultiplier: 1.0, maxStakePct: 0.05, reason: [], overrideAbuse: false, calibInsufficient: false }),
    computeJudgeMetrics:   () => ({}),
    computeCalibration:    () => ({}),
    computeBaseStats:      () => ({}),
    computeRiskMetrics:    () => ({}),
    computeAnalyzeMetrics: () => ({}),
    getCalibCorrFactor:    (cf) => (cf != null ? cf : 1.0),
  };
}

function loadCtx(bets, finSeason = CURRENT_FIN_SEASON, scope = 'round') {
  const ctx = buildCtx(bets, finSeason, scope);
  vm.createContext(ctx);
  // Runtime bootstrap mirror (production 로드 순서 부분 재현):
  //   storage.js → engine files
  //   storage.js: Storage·KEYS는 이제 core infra — 실제 파일 로드.
  //   settings.js: DOM/이벤트/UI side effect 포함 → engine 테스트에 넣지 않음.
  //                getSettings는 아래 stub으로 대체 (ctx.appSettings 반환).
  ctx.getSettings = () => ctx.appSettings;
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'storage.js'), 'utf8'), ctx);
  // storage.js는 window.Storage / window.KEYS로 등록 —
  // state.js는 bare Storage / KEYS로 참조하므로 ctx에 직접 노출.
  ctx.Storage = ctx.window.Storage;
  ctx.KEYS    = ctx.window.KEYS;
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'kelly.js'),   'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'compute.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'state.js'),   'utf8'), ctx);
  return ctx;
}

function runComputeSystemState(ctx) {
  ctx.window.App.kellyPrevMultiplier = 1.0;
  const scopedBets = ctx.getBetsByScope();
  const allBets    = ctx.getBets();
  const settings   = {
    kelly: {
      seed:           ctx.getBetSeed(),
      bankroll:       ctx.getCurrentBankroll(),
      maxBetPct:      ctx.appSettings.maxBetPct || 5,
      kellyGradeAdj:  !!ctx.appSettings.kellyGradeAdj,
      prevMultiplier: 1.0,
    },
    target: { fund: ctx.appSettings.targetFund || 0 },
  };
  const context = {
    scope:       ctx.getCurrentScope(),
    project:     ctx.getCurrentProject(),
    activeRound: ctx.getActiveRound(),
  };
  return ctx.computeSystemState(scopedBets, allBets, settings, context);
}

// ── 핵심 subset snapshot 헬퍼 ────────────────────────────────
// 전체 객체 snapshot은 brittle — 핵심 계산값만 추출
function pickSnapshot(result) {
  return {
    roi:              result.roi,
    totalProfit:      result.totalProfit,
    moneyResolvedLen: result.moneyResolved?.length ?? -1,
    verdict:          result.verdict,
    winRate:          result.winRate,
    n:                result.n,
  };
}

// ══════════════════════════════════════════════════════════════
// 1. moneyResolved invariant assertions
// ══════════════════════════════════════════════════════════════
describe('moneyResolved — invariant assertions', () => {
  let result;

  beforeAll(() => {
    const ctx = loadCtx(ALL_BETS, CURRENT_FIN_SEASON);
    result = runComputeSystemState(ctx);
  });

  test('moneyResolved가 존재하고 배열이다', () => {
    expect(Array.isArray(result.moneyResolved)).toBe(true);
  });

  test('moneyResolved 건수: 시즌2 + amount>0 + isFinite(profit) 만 포함', () => {
    expect(result.moneyResolved.length).toBe(EXPECTED_MONEY_IDS.length);
  });

  test('moneyResolved id 목록이 기대값과 일치', () => {
    const ids = result.moneyResolved.map(b => b.id).sort((a,b) => a - b);
    expect(ids).toEqual(EXPECTED_MONEY_IDS);
  });

  // ── 핵심 invariant 1: isSim 완전 배제 ──
  test('[invariant] moneyResolved에 isSim:true 기록 없음', () => {
    expect(result.moneyResolved.every(b => !b.isSim)).toBe(true);
  });

  // ── 핵심 invariant 2: finSeason === currentFinSeason 100% ──
  test('[invariant] moneyResolved 전체 finSeason === currentFinSeason(2)', () => {
    expect(result.moneyResolved.every(b => b.finSeason === CURRENT_FIN_SEASON)).toBe(true);
  });

  // ── 핵심 invariant 3: amount > 0 && isFinite(profit) 100% ──
  test('[invariant] moneyResolved 전체 amount > 0', () => {
    expect(result.moneyResolved.every(b => b.amount > 0)).toBe(true);
  });

  test('[invariant] moneyResolved 전체 Number.isFinite(profit)', () => {
    expect(result.moneyResolved.every(b => Number.isFinite(b.profit))).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// 2. allResolved invariant assertions (sim 격리 검증)
// ══════════════════════════════════════════════════════════════
describe('allResolved — sim 격리 + PENDING 제외', () => {
  let result;

  beforeAll(() => {
    const ctx = loadCtx(ALL_BETS, CURRENT_FIN_SEASON);
    result = runComputeSystemState(ctx);
  });

  // allResolved는 computeSystemState 내부 변수라 result.resolved로 노출됨
  test('resolved(allResolved) id 목록 — sim/PENDING 제외', () => {
    const ids = result.resolved.map(b => b.id).sort((a,b) => a - b);
    expect(ids).toEqual(EXPECTED_ALL_IDS);
  });

  test('[invariant] resolved에 isSim:true 기록 없음', () => {
    expect(result.resolved.every(b => !b.isSim)).toBe(true);
  });

  test('[invariant] resolved에 PENDING 없음', () => {
    expect(result.resolved.every(b => b.result !== 'PENDING')).toBe(true);
  });

  test('n은 allResolved 건수 (PENDING/sim 제외)', () => {
    expect(result.n).toBe(EXPECTED_ALL_IDS.length);
  });
});

// ══════════════════════════════════════════════════════════════
// 3. sim 데이터가 ROI/totalProfit에 영향을 주지 않음
// ══════════════════════════════════════════════════════════════
describe('sim 격리 — ROI/totalProfit 오염 방지', () => {
  let withSim, withoutSim;

  beforeAll(() => {
    const betsWithSim    = ALL_BETS;
    const betsWithoutSim = ALL_BETS.filter(b => !b.isSim);

    const ctxWith    = loadCtx(betsWithSim,    CURRENT_FIN_SEASON);
    const ctxWithout = loadCtx(betsWithoutSim, CURRENT_FIN_SEASON);

    withSim    = runComputeSystemState(ctxWith);
    withoutSim = runComputeSystemState(ctxWithout);
  });

  test('sim 포함/제외 시 totalProfit 동일 — sim이 ROI에 영향 없음', () => {
    expect(withSim.totalProfit).toBe(withoutSim.totalProfit);
  });

  test('sim 포함/제외 시 roi 동일', () => {
    expect(withSim.roi).toBeCloseTo(withoutSim.roi, 5);
  });

  test('sim 포함/제외 시 moneyResolved 건수 동일', () => {
    expect(withSim.moneyResolved.length).toBe(withoutSim.moneyResolved.length);
  });
});

// ══════════════════════════════════════════════════════════════
// 4. 시즌 전환 — currentFinSeason 변경 시 moneyResolved 재구성
// ══════════════════════════════════════════════════════════════
describe('시즌 전환 — currentFinSeason=1 vs currentFinSeason=2', () => {
  let season1Result, season2Result;

  beforeAll(() => {
    const ctxS1 = loadCtx(ALL_BETS, 1);
    const ctxS2 = loadCtx(ALL_BETS, 2);
    season1Result = runComputeSystemState(ctxS1);
    season2Result = runComputeSystemState(ctxS2);
  });

  test('시즌1: moneyResolved에 finSeason:1 기록만 포함', () => {
    expect(season1Result.moneyResolved.every(b => b.finSeason === 1)).toBe(true);
    expect(season1Result.moneyResolved.map(b => b.id)).toContain(3); // SEASON1_BET
  });

  test('시즌2: moneyResolved에 finSeason:2 기록만 포함', () => {
    expect(season2Result.moneyResolved.every(b => b.finSeason === 2)).toBe(true);
    expect(season2Result.moneyResolved.map(b => b.id)).not.toContain(3); // SEASON1_BET 제외
  });

  test('시즌 전환 시 winRate는 allResolved 기준 — 양쪽 동일', () => {
    // winRate는 시즌 무관 allResolved 기준이므로 currentFinSeason 변경과 무관
    expect(season1Result.winRate).toBe(season2Result.winRate);
  });

  test('시즌 전환 시 n(allResolved 건수) 동일', () => {
    expect(season1Result.n).toBe(season2Result.n);
  });
});

// ══════════════════════════════════════════════════════════════
// 5. 핵심 계산 subset snapshot (brittle 방지 — 핵심 필드만)
// ══════════════════════════════════════════════════════════════
describe('subset snapshot — 핵심 계산 고정 (시즌2, ALL_BETS)', () => {
  let snap;

  beforeAll(() => {
    const ctx = loadCtx(ALL_BETS, CURRENT_FIN_SEASON);
    snap = pickSnapshot(runComputeSystemState(ctx));
  });

  // 수동 계산:
  // moneyResolved: id=1(+8000), id=2(-10000) → totalProfit = -2000
  // totalInvest = 20000 → roi = -2000/20000*100 = -10
  // allResolved: id=1,2,3,4,6,7 → wins: id=1,3,4,6 → 4/6 = 0.666...
  //   단, amount=0/NaN profit 기록(4,6,7)은 allResolved 포함이지만 집계 주의

  test('moneyResolvedLen = 2 (시즌2 + 유효 금액)', () => {
    expect(snap.moneyResolvedLen).toBe(2);
  });

  test('totalProfit = -2000 (8000 - 10000)', () => {
    expect(snap.totalProfit).toBe(-2000);
  });

  test('roi ≈ -10% (-2000/20000)', () => {
    expect(snap.roi).toBeCloseTo(-10, 1);
  });

  test('n = 6 (allResolved: sim/PENDING 제외)', () => {
    expect(snap.n).toBe(6);
  });

  test('winRate > 0 (적어도 일부 WIN 존재)', () => {
    expect(snap.winRate).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════
// 6. legacy(finSeason:0) 기록 — allResolved 포함, moneyResolved 제외
// ══════════════════════════════════════════════════════════════
describe('legacy(finSeason:0) 처리', () => {
  let result;

  beforeAll(() => {
    const legacyOnly = [
      { id: 10, result: 'WIN', amount: 50000, profit: 40000, betmanOdds: 1.9, date: '2025-01-01', game: 'L1', sport: 'NBA', type: 'WIN', finSeason: 0 },
      { id: 11, result: 'LOSE', amount: 30000, profit: -30000, betmanOdds: 2.1, date: '2025-01-02', game: 'L2', sport: 'NBA', type: 'WIN', finSeason: 0 },
    ];
    const ctx = loadCtx(legacyOnly, CURRENT_FIN_SEASON);
    result = runComputeSystemState(ctx);
  });

  test('legacy 기록은 allResolved(winRate) 계산에 포함', () => {
    expect(result.n).toBe(2);
    expect(result.winRate).toBe(0.5);
  });

  test('legacy 기록은 moneyResolved에서 제외 — roi=0', () => {
    expect(result.moneyResolved.length).toBe(0);
    expect(result.roi).toBe(0);
    expect(result.totalProfit).toBe(0);
  });
});
