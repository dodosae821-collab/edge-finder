// calcSystemState.test.js
// 대상: calcSystemState — 핵심 필드 (winRate, roi, avgOdds, n)
// 전략: 고정 입력 → 고정 출력. 랜덤/실데이터 금지.

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const STORAGE_KEY = 'edge_bets';

// ── 고정 픽스처 ────────────────────────────────────────────────
// WIN 1건: amount=10000, profit=+10000, betmanOdds=2.0
// LOSE 1건: amount=10000, profit=-10000, betmanOdds=2.0
// → winRate=0.5, totalProfit=0, totalInvest=20000, roi=0, avgOdds=2.0
const FIXED_BETS = [
  { id: 1, result: 'WIN',  amount: 10000, profit:  10000, betmanOdds: 2.0, date: '2026-01-01', game: 'A', sport: 'NBA', type: 'UNDER' },
  { id: 2, result: 'LOSE', amount: 10000, profit: -10000, betmanOdds: 2.0, date: '2026-01-02', game: 'B', sport: 'NBA', type: 'UNDER' },
];

// ── localStorage stub ─────────────────────────────────────────
function makeLocalStorage(bets) {
  const store = {
    [STORAGE_KEY]: JSON.stringify({ schemaVersion: 2, bets }),
  };
  return {
    getItem:    (k) => store[k] ?? null,
    setItem:    (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; },
  };
}

// ── vm context 구성 ───────────────────────────────────────────
function buildCtx(bets) {
  const win = {
    App: { debug: false, kellyPrevMultiplier: 1.0 },
    addEventListener: () => {},
    _SS: null,
  };
  return {
    console:      { ...console, assert: () => {}, warn: () => {} },
    window:       win,
    localStorage: makeLocalStorage(bets),
    // state.js 내부 bare `bets` 참조 (line 467) 주입
    bets,
    // scope stub
    getCurrentScope:    () => 'all',
    getCurrentProject:  () => null,
    getActiveRound:     () => null,
    getBetsByScope:     () => bets,
    // settings
    appSettings: {
      kellySeed:     1000000,
      startFund:     1000000,
      targetFund:    0,
      maxBetPct:     5,
      kellyGradeAdj: false,
      gateConfig:    {},
    },
    getBetSeed:         () => 1000000,
    getCurrentBankroll: () => 1000000,
    // 보정/판단 stub
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

function loadCtx(bets) {
  const ctx = buildCtx(bets);
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

// ── 테스트 ────────────────────────────────────────────────────
describe('calcSystemState — 핵심 필드 (고정 입력)', () => {
  let result;

  beforeAll(() => {
    result = loadCtx(FIXED_BETS).calcSystemState();
  });

  test('반환값이 존재한다', () => {
    expect(result).toBeDefined();
    expect(result).not.toBeNull();
  });

  test('n (resolved 건수) = 2', () => {
    expect(result.n).toBe(2);
  });

  test('winRate: WIN 1 / resolved 2 = 0.5', () => {
    expect(result.winRate).toBe(0.5);
  });

  test('roi: totalProfit=0, totalInvest=20000 → 0', () => {
    expect(result.roi).toBe(0);
  });

  test('avgOdds: (2.0 + 2.0) / 2 = 2.0', () => {
    expect(result.avgOdds).toBe(2.0);
  });
});

describe('calcSystemState — PENDING 필터링', () => {
  let result;

  beforeAll(() => {
    const betsWithPending = [
      ...FIXED_BETS,
      { id: 3, result: 'PENDING', amount: 10000, profit: 0, betmanOdds: 1.9, date: '2026-01-03', game: 'C', sport: 'NBA', type: 'UNDER' },
    ];
    result = loadCtx(betsWithPending).calcSystemState();
  });

  test('PENDING은 resolved에서 제외 → n=2', () => {
    expect(result.n).toBe(2);
  });

  test('winRate는 PENDING 제외 기준 → 0.5 유지', () => {
    expect(result.winRate).toBe(0.5);
  });
});

describe('calcSystemState — ROI uses season-scoped money weighting', () => {
  // moneyResolved 기반 ROI invariant 검증:
  //   - finSeason === currentFinSeason + amount > 0 + isFinite(profit) 만 포함
  //   - ROI = totalProfit / totalInvest (금액 가중) — 건수 평균 아님
  //
  // 픽스처: WIN amount=1000 / LOSE amount=2000 (동일 시즌, finSeason:1)
  //   totalProfit = +1000 - 2000 = -1000
  //   totalInvest = 3000
  //   roi = (-1000 / 3000) * 100 = -33.33...
  //   건수 평균이면 (100% + -100%) / 2 = 0% → 이 케이스로 구별
  let result;

  beforeAll(() => {
    // finSeason:1 명시 — currentFinSeason:1 context와 일치해야 moneyResolved 포함
    const unequalBets = [
      { id: 10, result: 'WIN',  amount: 1000,  profit:  1000,  betmanOdds: 2.0, date: '2026-02-01', game: 'X', sport: 'NBA', type: 'UNDER', finSeason: 1 },
      { id: 11, result: 'LOSE', amount: 2000,  profit: -2000,  betmanOdds: 2.0, date: '2026-02-02', game: 'Y', sport: 'NBA', type: 'UNDER', finSeason: 1 },
    ];
    // currentFinSeason:1 — 픽스처 finSeason과 동일 시즌으로 맞춤
    const ctx = loadCtx(unequalBets);
    ctx.appSettings.currentFinSeason = 1;
    result = ctx.calcSystemState();
  });

  test('roi는 moneyResolved 기반 금액 가중 (totalProfit/totalInvest)', () => {
    // 금액 가중: -1000/3000*100 = -33.33...
    // 건수 평균이면 0 → 이 케이스로 구별
    // finSeason 미설정이면 moneyResolved 비어 roi=0 → invariant 검증도 겸함
    expect(result.roi).toBeCloseTo(-33.33, 1);
  });

  test('n=2 — allResolved 기준 (PENDING 없음)', () => {
    // n은 allResolved(winRate 기준) — moneyResolved와 독립
    expect(result.n).toBe(2);
  });

  test('moneyResolved 건수=2 — 시즌 필터 통과', () => {
    // finSeason:1 + currentFinSeason:1 → 두 건 모두 moneyResolved 포함
    expect(result.moneyResolved.length).toBe(2);
  });
});

describe('calcSystemState — 빈 배열', () => {
  let result;

  beforeAll(() => {
    result = loadCtx([]).calcSystemState();
  });

  test('빈 배열 → n=0', () => {
    expect(result.n).toBe(0);
  });

  test('빈 배열 → winRate=0', () => {
    expect(result.winRate).toBe(0);
  });

  test('빈 배열 → roi=0', () => {
    expect(result.roi).toBe(0);
  });
});

// ── deep equal: calcSystemState vs computeSystemState ─────────
// calcSystemState(어댑터) 결과와 computeSystemState(순수 함수) 결과가
// _ts(타임스탬프)·_nextMultiplier 제외하고 완전히 동일해야 한다.
describe('deep equal — calcSystemState vs computeSystemState', () => {
  let ctx;

  beforeAll(() => {
    ctx = loadCtx(FIXED_BETS);
  });

  test('핵심 KPI 필드 동일', () => {
    // window.App.kellyPrevMultiplier 리셋 (두 호출 간 상태 오염 방지)
    ctx.window.App.kellyPrevMultiplier = 1.0;
    const before = ctx.calcSystemState();

    ctx.window.App.kellyPrevMultiplier = 1.0;
    const scopedBets = ctx.getBetsByScope();
    const allBets    = ctx.getBets();
    const settings   = {
      kelly: {
        seed:          ctx.getBetSeed(),
        bankroll:      ctx.getCurrentBankroll(),
        maxBetPct:     ctx.appSettings.maxBetPct || 5,
        kellyGradeAdj: !!ctx.appSettings.kellyGradeAdj,
        prevMultiplier: 1.0,
      },
      target: { fund: ctx.appSettings.targetFund || 0 },
    };
    const context    = {
      scope:       ctx.getCurrentScope(),
      project:     ctx.getCurrentProject(),
      activeRound: ctx.getActiveRound(),
    };
    const after = ctx.computeSystemState(scopedBets, allBets, settings, context);

    // _ts, _nextMultiplier 는 호출 시점·순서 의존 → 비교 제외
    const EXCLUDE = ['_ts', '_nextMultiplier'];
    const strip = (obj) => {
      const o = { ...obj };
      EXCLUDE.forEach(k => delete o[k]);
      return o;
    };

    expect(strip(after)).toEqual(strip(before));
  });

  test('_nextMultiplier 정상 반환 (undefined 아님)', () => {
    ctx.window.App.kellyPrevMultiplier = 1.0;
    const scopedBets = ctx.getBetsByScope();
    const allBets    = ctx.getBets();
    const settings   = {
      kelly: {
        seed:          ctx.getBetSeed(),
        bankroll:      ctx.getCurrentBankroll(),
        maxBetPct:     ctx.appSettings.maxBetPct || 5,
        kellyGradeAdj: !!ctx.appSettings.kellyGradeAdj,
        prevMultiplier: 1.0,
      },
      target: { fund: ctx.appSettings.targetFund || 0 },
    };
    const context    = {
      scope:       ctx.getCurrentScope(),
      project:     ctx.getCurrentProject(),
      activeRound: ctx.getActiveRound(),
    };
    const result = ctx.computeSystemState(scopedBets, allBets, settings, context);
    expect(result._nextMultiplier).toBeDefined();
    expect(result._nextMultiplier).not.toBeNaN();
  });
});

// ══════════════════════════════════════════════════════════════
// ── 구조 검증 — 픽스처 보강 + 4개 포인트 명시 검증
// ══════════════════════════════════════════════════════════════

// ── 픽스처 A: 빈 데이터 ───────────────────────────────────────
const EMPTY_BETS = [];

// ── 픽스처 B: 경계값 (odds=0, odds=1, prob=0, prob=100) ───────
const EDGE_BETS = [
  { id: 10, result: 'WIN',  amount: 10000, profit: 10000, betmanOdds: 0,   myProb: 0,   date: '2026-01-01', game: 'E1', sport: 'NBA', type: 'UNDER' },
  { id: 11, result: 'LOSE', amount: 10000, profit:-10000, betmanOdds: 1,   myProb: 100, date: '2026-01-02', game: 'E2', sport: 'NBA', type: 'UNDER' },
  { id: 12, result: 'WIN',  amount: 10000, profit: 10000, betmanOdds: 2.0, myProb: 50,  date: '2026-01-03', game: 'E3', sport: 'NBA', type: 'UNDER' },
];

// ── 픽스처 C: 정렬 검증 (날짜·profit 다양) ────────────────────
const SORT_BETS = [
  { id: 20, result: 'WIN',  amount: 5000,  profit:  5000, betmanOdds: 2.0, date: '2026-01-05', game: 'S1', sport: 'NBA', type: 'UNDER' },
  { id: 21, result: 'LOSE', amount: 8000,  profit: -8000, betmanOdds: 1.8, date: '2026-01-01', game: 'S2', sport: 'NBA', type: 'UNDER' },
  { id: 22, result: 'WIN',  amount: 20000, profit: 20000, betmanOdds: 2.5, date: '2026-01-03', game: 'S3', sport: 'NBA', type: 'UNDER' },
  { id: 23, result: 'WIN',  amount: 3000,  profit:  3000, betmanOdds: 1.9, date: '2026-01-02', game: 'S4', sport: 'NBA', type: 'UNDER' },
  { id: 24, result: 'LOSE', amount: 15000, profit:-15000, betmanOdds: 2.2, date: '2026-01-04', game: 'S5', sport: 'NBA', type: 'UNDER' },
];

// ── NaN 검사 헬퍼 ─────────────────────────────────────────────
function collectNaNFields(obj) {
  return Object.entries(obj)
    .filter(([, v]) => typeof v === 'number' && Number.isNaN(v))
    .map(([k]) => k);
}

// ── deep equal 헬퍼 (재사용) ─────────────────────────────────
const EXCLUDE_FIELDS = ['_ts', '_nextMultiplier'];
function strip(obj) {
  const o = { ...obj };
  EXCLUDE_FIELDS.forEach(k => delete o[k]);
  return o;
}

function runBoth(ctx) {
  ctx.window.App.kellyPrevMultiplier = 1.0;
  const before = ctx.calcSystemState();

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
  const after = ctx.computeSystemState(scopedBets, allBets, settings, context);
  return { before, after };
}

// ── A. 빈 데이터 — undefined vs null, NaN ────────────────────
describe('deep equal — 빈 데이터 (EMPTY_BETS)', () => {
  let before, after;

  beforeAll(() => {
    const ctx = loadCtx(EMPTY_BETS);
    ({ before, after } = runBoth(ctx));
  });

  test('전체 deep equal (_ts·_nextMultiplier 제외)', () => {
    expect(strip(after)).toEqual(strip(before));
  });

  test('NaN 필드 없음 — before', () => {
    const nanFields = collectNaNFields(before);
    expect(nanFields).toEqual([]);
  });

  test('NaN 필드 없음 — after', () => {
    const nanFields = collectNaNFields(after);
    expect(nanFields).toEqual([]);
  });

  test('scope 계열 필드 — scope는 기본값 유지, 선택값은 null', () => {
    expect(after.scope).toBe('all');        // 현재 필터 상태 — 빈 데이터여도 기본값 "all"
    expect(after.scopeProject).toBeNull();  // 선택값 → null
    expect(after.activeRound).toBeNull();   // 선택값 → null
  });

  test('n=0, winRate=0, roi=0 (0 나누기 안전)', () => {
    expect(after.n).toBe(0);
    expect(after.winRate).toBe(0);
    expect(after.roi).toBe(0);
  });
});

// ── B. 경계값 — NaN, 분기 동일성 ─────────────────────────────
describe('deep equal — 경계값 (odds=0/1, prob=0/100)', () => {
  let before, after;

  beforeAll(() => {
    const ctx = loadCtx(EDGE_BETS);
    ({ before, after } = runBoth(ctx));
  });

  test('전체 deep equal (_ts·_nextMultiplier 제외)', () => {
    expect(strip(after)).toEqual(strip(before));
  });

  test('NaN 필드 없음 — before', () => {
    expect(collectNaNFields(before)).toEqual([]);
  });

  test('NaN 필드 없음 — after', () => {
    expect(collectNaNFields(after)).toEqual([]);
  });

  test('verdict 동일', () => {
    expect(after.verdict).toBe(before.verdict);
  });

  test('grade 동일', () => {
    expect(after.grade).toBe(before.grade);
  });
});

// ── C. 정렬 검증 — 배열 순서 동일성 ──────────────────────────
describe('deep equal — 정렬 검증 (SORT_BETS)', () => {
  let before, after;

  beforeAll(() => {
    const ctx = loadCtx(SORT_BETS);
    ({ before, after } = runBoth(ctx));
  });

  test('전체 deep equal (_ts·_nextMultiplier 제외)', () => {
    expect(strip(after)).toEqual(strip(before));
  });

  test('resolved 배열 순서 동일', () => {
    expect(after.resolved.map(b => b.id)).toEqual(before.resolved.map(b => b.id));
  });

  test('rec10 배열 순서 동일', () => {
    expect(after.rec10.map(b => b.id)).toEqual(before.rec10.map(b => b.id));
  });

  test('rec5 배열 순서 동일', () => {
    expect(after.rec5.map(b => b.id)).toEqual(before.rec5.map(b => b.id));
  });

  test('warnings 배열 순서 동일', () => {
    expect(after.warnings).toEqual(before.warnings);
  });

  test('stops 배열 순서 동일', () => {
    expect(after.stops).toEqual(before.stops);
  });

  test('NaN 필드 없음 — after', () => {
    expect(collectNaNFields(after)).toEqual([]);
  });
});
