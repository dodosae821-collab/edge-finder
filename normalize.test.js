// normalize.test.js
// 대상: saveBets normalize — immutability + finSeason 부여 규칙
// 전략: 원본 객체 불변 확인 + 저장본 normalize 확인
//
// 검증 포인트:
//   1. 입력 객체 원본 불변 (원본 finSeason 미변경)
//   2. 저장본에만 finSeason normalize 적용
//   3. isSim:true → finSeason:-1 고정
//   4. 손상 데이터(amount=0, profit=0) → finSeason:0 (legacy)
//   5. 정상 데이터 finSeason 미설정 → currentFinSeason 부여
//   6. 이미 finSeason이 설정된 데이터 → 기존 값 유지 (오염 방지)

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const STORAGE_KEY      = 'edge_bets';
const CURRENT_FIN_SEASON = 3; // 테스트 전용 "현재 시즌 = 3"

// ── localStorage stub ─────────────────────────────────────────
function makeLocalStorage() {
  const store = {};
  return {
    getItem:    (k) => store[k] ?? null,
    setItem:    (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; },
    _store:     store,
  };
}

// ── vm context ────────────────────────────────────────────────
function buildCtx(finSeason = CURRENT_FIN_SEASON) {
  const ls  = makeLocalStorage();
  const win = { App: { debug: false, kellyPrevMultiplier: 1.0 }, addEventListener: () => {}, _SS: null };
  return {
    console:      { ...console, assert: () => {}, warn: () => {} },
    window:       win,
    localStorage: ls,
    bets:         [],
    getCurrentScope:    () => 'all',
    getCurrentProject:  () => null,
    getActiveRound:     () => null,
    getBetsByScope:     () => [],
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
    refreshAllUI:          () => {},   // UI 갱신 stub
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

function loadCtx(finSeason = CURRENT_FIN_SEASON) {
  const ctx = buildCtx(finSeason);
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

// ══════════════════════════════════════════════════════════════
// 1. 원본 불변 (immutability)
// ══════════════════════════════════════════════════════════════
describe('saveBets normalize — 원본 객체 불변', () => {
  test('finSeason 미설정 원본 → saveBets 후에도 원본 undefined 유지', () => {
    const ctx = loadCtx();
    const original = { id: 1, result: 'WIN', amount: 10000, profit: 8000, betmanOdds: 2.0, date: '2026-01-01', game: 'X', sport: 'NBA', type: 'WIN' };
    // finSeason 없음을 명시
    expect(original.finSeason).toBeUndefined();

    ctx.saveBets([original], { refresh: false });

    // 원본 오염 금지
    expect(original.finSeason).toBeUndefined();
  });

  test('isSim:true 원본 → saveBets 후에도 원본 finSeason 변경 없음', () => {
    const ctx = loadCtx();
    const original = { id: 2, result: 'WIN', amount: 10000, profit: 9000, betmanOdds: 1.95, date: '2026-01-02', game: 'Y', sport: 'NBA', type: 'WIN', isSim: true };
    const originalFinSeason = original.finSeason; // undefined

    ctx.saveBets([original], { refresh: false });

    expect(original.finSeason).toBe(originalFinSeason); // 원본 불변
  });

  test('finSeason:1 설정된 원본 → saveBets 후에도 원본 유지', () => {
    const ctx = loadCtx(3); // currentFinSeason=3
    const original = { id: 3, result: 'WIN', amount: 5000, profit: 4000, betmanOdds: 2.0, date: '2026-01-03', game: 'Z', sport: 'NBA', type: 'WIN', finSeason: 1 };

    ctx.saveBets([original], { refresh: false });

    // 원본은 여전히 1 (저장본에서 1로 유지되더라도 원본 참조는 불변)
    expect(original.finSeason).toBe(1);
  });

  test('배열 내 여러 객체 원본 전부 불변', () => {
    const ctx = loadCtx();
    const originals = [
      { id: 10, result: 'WIN',  amount: 10000, profit:  8000, betmanOdds: 2.0, date: '2026-02-01', game: 'A', sport: 'NBA', type: 'WIN' },
      { id: 11, result: 'LOSE', amount: 10000, profit: -10000, betmanOdds: 2.0, date: '2026-02-02', game: 'B', sport: 'NBA', type: 'WIN' },
    ];
    const snapshots = originals.map(b => ({ ...b }));

    ctx.saveBets(originals, { refresh: false });

    originals.forEach((b, i) => {
      expect(b.finSeason).toBe(snapshots[i].finSeason); // 원본 불변
    });
  });
});

// ══════════════════════════════════════════════════════════════
// 2. 저장본 normalize — finSeason 부여 규칙
// ══════════════════════════════════════════════════════════════
describe('saveBets normalize — 저장본 finSeason 부여 규칙', () => {

  test('finSeason 미설정 정상 bet → currentFinSeason 부여', () => {
    const ctx = loadCtx(CURRENT_FIN_SEASON); // currentFinSeason=3
    const bet = { id: 20, result: 'WIN', amount: 10000, profit: 8000, betmanOdds: 2.0, date: '2026-01-01', game: 'A', sport: 'NBA', type: 'WIN' };

    const saved = ctx.saveBets([bet], { refresh: false });

    expect(saved[0].finSeason).toBe(CURRENT_FIN_SEASON); // 3 부여
  });

  test('isSim:true → finSeason:-1 고정 (currentFinSeason 무관)', () => {
    const ctx = loadCtx(CURRENT_FIN_SEASON);
    const simBet = { id: 21, result: 'WIN', amount: 10000, profit: 9000, betmanOdds: 1.95, date: '2026-01-02', game: 'B', sport: 'NBA', type: 'WIN', isSim: true };

    const saved = ctx.saveBets([simBet], { refresh: false });

    expect(saved[0].finSeason).toBe(-1);
  });

  test('손상 데이터(amount=0, profit=0) → finSeason:0 (legacy)', () => {
    const ctx = loadCtx(CURRENT_FIN_SEASON);
    const legacyBet = { id: 22, result: 'WIN', amount: 0, profit: 0, betmanOdds: 2.0, date: '2025-01-01', game: 'C', sport: 'NBA', type: 'WIN' };

    const saved = ctx.saveBets([legacyBet], { refresh: false });

    expect(saved[0].finSeason).toBe(0);
  });

  test('finSeason:1 이미 설정 → 기존 값 유지 (덮어쓰기 금지)', () => {
    const ctx = loadCtx(3); // currentFinSeason=3이지만
    const pastBet = { id: 23, result: 'WIN', amount: 10000, profit: 8000, betmanOdds: 2.0, date: '2026-01-01', game: 'D', sport: 'NBA', type: 'WIN', finSeason: 1 };

    const saved = ctx.saveBets([pastBet], { refresh: false });

    expect(saved[0].finSeason).toBe(1); // currentFinSeason(3)으로 덮어쓰지 않음
  });

  test('finSeason:2 이미 설정 → 유지 (시즌2 기록 보호)', () => {
    const ctx = loadCtx(3);
    const season2Bet = { id: 24, result: 'LOSE', amount: 5000, profit: -5000, betmanOdds: 1.8, date: '2026-03-01', game: 'E', sport: 'NBA', type: 'WIN', finSeason: 2 };

    const saved = ctx.saveBets([season2Bet], { refresh: false });

    expect(saved[0].finSeason).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════
// 3. isSim 이중 격리 검증
// ══════════════════════════════════════════════════════════════
describe('saveBets normalize — isSim 이중 격리', () => {

  test('isSim:true + finSeason 명시적으로 설정되어 있어도 → -1로 강제', () => {
    const ctx = loadCtx(CURRENT_FIN_SEASON);
    // isSim이면서 finSeason이 이미 설정된 오염 케이스
    const corruptedSim = { id: 30, result: 'WIN', amount: 10000, profit: 9000, betmanOdds: 2.0, date: '2026-01-01', game: 'F', sport: 'NBA', type: 'WIN', isSim: true, finSeason: 3 };

    const saved = ctx.saveBets([corruptedSim], { refresh: false });

    // isSim이면 finSeason 강제 -1 (기존 값 무시)
    expect(saved[0].finSeason).toBe(-1);
  });

  test('isSim:false → 일반 normalize 경로 적용', () => {
    const ctx = loadCtx(CURRENT_FIN_SEASON);
    const realBet = { id: 31, result: 'WIN', amount: 10000, profit: 8000, betmanOdds: 2.0, date: '2026-01-02', game: 'G', sport: 'NBA', type: 'WIN', isSim: false };

    const saved = ctx.saveBets([realBet], { refresh: false });

    // isSim:false는 일반 경로 → finSeason 미설정이므로 currentFinSeason 부여
    expect(saved[0].finSeason).toBe(CURRENT_FIN_SEASON);
  });
});

// ══════════════════════════════════════════════════════════════
// 4. restore/csv/ocr 외부 유입 경로 시뮬레이션
// ══════════════════════════════════════════════════════════════
describe('외부 유입 경로 — restore/csv/ocr 시뮬레이션', () => {

  test('restore: finSeason 없는 구버전 데이터 → currentFinSeason 부여', () => {
    const ctx = loadCtx(2); // currentFinSeason=2
    // restore에서 들어오는 구버전 데이터 (finSeason 필드 없음)
    const legacyRestoreData = [
      { id: 100, result: 'WIN',  amount: 10000, profit:  8000, betmanOdds: 2.0, date: '2025-06-01', game: 'R1', sport: 'NBA', type: 'WIN' },
      { id: 101, result: 'LOSE', amount: 10000, profit: -10000, betmanOdds: 1.9, date: '2025-06-02', game: 'R2', sport: 'NBA', type: 'WIN' },
    ];
    // 원본에 finSeason 없음을 확인
    legacyRestoreData.forEach(b => expect(b.finSeason).toBeUndefined());

    const saved = ctx.saveBets(legacyRestoreData, { refresh: false });

    // 저장본은 currentFinSeason(2) 부여
    saved.forEach(b => expect(b.finSeason).toBe(2));
    // 원본은 불변
    legacyRestoreData.forEach(b => expect(b.finSeason).toBeUndefined());
  });

  test('csv import: finSeason 있는 데이터 → 기존 값 유지', () => {
    const ctx = loadCtx(3); // currentFinSeason=3
    // csv import에서 들어오는 데이터 (이미 finSeason 포함)
    const csvData = [
      { id: 200, result: 'WIN', amount: 20000, profit: 18000, betmanOdds: 1.95, date: '2026-02-01', game: 'C1', sport: 'NBA', type: 'WIN', finSeason: 2 },
    ];

    const saved = ctx.saveBets(csvData, { refresh: false });

    // csv에서 온 finSeason:2 유지 (currentFinSeason:3으로 덮어쓰지 않음)
    expect(saved[0].finSeason).toBe(2);
  });

  test('혼합 유입: 구버전 + 현재 시즌 + 시뮬 동시 처리', () => {
    const ctx = loadCtx(3);
    const mixedData = [
      { id: 300, result: 'WIN',  amount: 10000, profit:  8000, betmanOdds: 2.0, date: '2026-01-01', game: 'M1', sport: 'NBA', type: 'WIN' },              // finSeason 없음 → 3 부여
      { id: 301, result: 'WIN',  amount: 10000, profit:  8000, betmanOdds: 2.0, date: '2026-02-01', game: 'M2', sport: 'NBA', type: 'WIN', finSeason: 2 }, // 기존 2 유지
      { id: 302, result: 'WIN',  amount: 10000, profit:  9000, betmanOdds: 1.95, date: '2026-03-01', game: 'M3', sport: 'NBA', type: 'WIN', isSim: true }, // sim → -1
      { id: 303, result: 'WIN',  amount: 0,     profit:  0,    betmanOdds: 2.0, date: '2025-01-01', game: 'M4', sport: 'NBA', type: 'WIN' },              // 손상 → 0 (legacy)
    ];

    const saved = ctx.saveBets(mixedData, { refresh: false });
    const byId  = Object.fromEntries(saved.map(b => [b.id, b]));

    expect(byId[300].finSeason).toBe(3);   // 미설정 → currentFinSeason
    expect(byId[301].finSeason).toBe(2);   // 기존 값 유지
    expect(byId[302].finSeason).toBe(-1);  // sim → -1
    expect(byId[303].finSeason).toBe(0);   // 손상 → legacy
  });
});
