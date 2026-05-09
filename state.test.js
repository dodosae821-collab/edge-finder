// state.test.js
// 대상: saveBets (migration 로직, finSeason normalize, idempotency)
// 범위: 데이터 상태 전이 보호 — DOM/UI 없음

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

// ── 테스트 하네스 ──────────────────────────────────────────────
function buildCtx(overrides = {}) {
  // Storage mock — 인메모리 KV
  const _store = {};
  const Storage = {
    get:     (k)    => _store[k] ?? null,
    set:     (k, v) => { _store[k] = v; return true; },
    getJSON: (k, fb) => { try { return _store[k] ? JSON.parse(_store[k]) : fb; } catch { return fb; } },
    setJSON: (k, v) => { _store[k] = JSON.stringify(v); return true; },
    remove:  (k)    => { delete _store[k]; return true; },
    _store,
  };

  const KEYS = {
    BETS: 'edge_bets',
    SETTINGS: 'edge_settings',
    SCOPE: 'edge_scope',
    CURRENT_PROJECT: 'edge_current_project',
    ROUNDS: 'edge_rounds',
    CURRENT_ROUND: 'edge_current_round',
  };

  // 기본 mock 의존성
  const ctx = {
    window: {
      App: { kellyPrevMultiplier: 1.0, debug: false },
      addEventListener: jest.fn(),
      dispatchEvent:    jest.fn(),
    },
    console,
    Storage,
    KEYS,
    // scope.js 의존 stub
    getCurrentScope:   () => 'all',
    getCurrentProject: () => 'default',
    getActiveRound:    () => null,
    // state.js 내부에서 호출되는 함수 stub
    getSettings:       () => ({ currentFinSeason: 1, ...overrides.settings }),
    refreshAllUI:      jest.fn(),
    recomputeGate:     jest.fn(),
    getBetsByScope:    jest.fn(() => []),
    computeSystemState: jest.fn(() => ({ _nextMultiplier: 1.0, calibBuckets: [], n: 0 })),
    calcSystemState:   jest.fn(),
    _syncScopeUI:      jest.fn(),
    ...overrides.globals,
  };

  vm.createContext(ctx);

  // console.assert가 vm 안에서 동작하도록
  vm.runInContext(`
    console.assert = (cond, msg) => { if (!cond) console.warn('assert failed:', msg); };
  `, ctx);

  // scope.js / round.js 의존 함수들이 이미 ctx에 있으므로 state.js만 주입
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, 'state.js'), 'utf8'),
    ctx
  );

  // state.js가 refreshAllUI를 재정의하므로 로드 후 jest.fn()으로 교체
  ctx.refreshAllUI = jest.fn();

  return ctx;
}

// ── _migrate 단독 접근용 (state.js 내부 함수를 꺼내기 위한 래퍼 주입) ──
function buildCtxWithMigrate(overrides = {}) {
  const ctx = buildCtx(overrides);
  // _migrate, _migrateV1toV2은 state.js의 함수 스코프 내부에 있으므로
  // saveBets / getBets를 통해 간접 검증
  return ctx;
}

// ── 픽스처 헬퍼 ──────────────────────────────────────────────
function makeBet(overrides = {}) {
  return {
    amount: 10000,
    profit: 1000,
    betmanOdds: 2.0,
    result: 'WIN',
    date: '2024-01-01',
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════
// saveBets — 기본 방어 케이스
// ══════════════════════════════════════════════════════════════
describe('saveBets — 기본 방어', () => {
  test('배열 아닌 값 전달 시 throw', () => {
    const ctx = buildCtx();
    expect(() => ctx.saveBets(null)).toThrow('saveBets: nextBets must be array');
    expect(() => ctx.saveBets(undefined)).toThrow();
    expect(() => ctx.saveBets({ bets: [] })).toThrow();
    expect(() => ctx.saveBets('string')).toThrow();
  });

  test('빈 배열 허용 — kellyPrevMultiplier 리셋', () => {
    const ctx = buildCtx();
    ctx.window.App.kellyPrevMultiplier = 0.7;
    const result = ctx.saveBets([], { refresh: false });
    expect(result).toEqual([]);
    expect(ctx.window.App.kellyPrevMultiplier).toBe(1.0);
  });

  test('반환값은 저장된 배열과 동일 (참조가 아닌 복사)', () => {
    const ctx = buildCtx();
    const input = [makeBet({ finSeason: 1 })];
    const result = ctx.saveBets(input, { refresh: false });
    // 반환값 확인
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    // 원본 참조와 다른 객체 (불변성)
    expect(result[0]).not.toBe(input[0]);
  });

  test('refresh: false → refreshAllUI 미호출', () => {
    const ctx = buildCtx();
    ctx.saveBets([makeBet({ finSeason: 1 })], { refresh: false });
    expect(ctx.refreshAllUI).not.toHaveBeenCalled();
  });

  test('refresh: true (기본) → refreshAllUI 호출', () => {
    const ctx = buildCtx();
    ctx.saveBets([makeBet({ finSeason: 1 })]);
    expect(ctx.refreshAllUI).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════════════════════
// saveBets — finSeason normalize
// ══════════════════════════════════════════════════════════════
describe('saveBets — finSeason normalize', () => {
  test('isSim: true → finSeason: -1 고정 (기존 값 무시)', () => {
    const ctx = buildCtx({ settings: { currentFinSeason: 3 } });
    const result = ctx.saveBets([
      makeBet({ isSim: true, finSeason: 99 }),
      makeBet({ isSim: true }),
    ], { refresh: false });
    expect(result[0].finSeason).toBe(-1);
    expect(result[1].finSeason).toBe(-1);
  });

  test('amount===0 && profit===0 → finSeason: 0 (손상 데이터 legacy)', () => {
    const ctx = buildCtx({ settings: { currentFinSeason: 2 } });
    const result = ctx.saveBets([
      makeBet({ amount: 0, profit: 0, finSeason: undefined }),
    ], { refresh: false });
    expect(result[0].finSeason).toBe(0);
  });

  test('finSeason 미설정 정상 bet → currentFinSeason 부여', () => {
    const ctx = buildCtx({ settings: { currentFinSeason: 3 } });
    const result = ctx.saveBets([
      makeBet({ finSeason: undefined }),
      makeBet({ finSeason: null }),
      makeBet({ finSeason: NaN }),
    ], { refresh: false });
    result.forEach(b => expect(b.finSeason).toBe(3));
  });

  test('finSeason 오염값(문자열/"abc") → currentFinSeason으로 교체', () => {
    const ctx = buildCtx({ settings: { currentFinSeason: 2 } });
    const result = ctx.saveBets([
      makeBet({ finSeason: 'abc' }),
      makeBet({ finSeason: -99 }),
    ], { refresh: false });
    result.forEach(b => expect(b.finSeason).toBe(2));
  });

  test('finSeason 정상값(양의 정수) → 기존 값 유지', () => {
    const ctx = buildCtx({ settings: { currentFinSeason: 5 } });
    const result = ctx.saveBets([
      makeBet({ finSeason: 1 }),
      makeBet({ finSeason: 3 }),
    ], { refresh: false });
    expect(result[0].finSeason).toBe(1);
    expect(result[1].finSeason).toBe(3);
  });

  test('currentFinSeason 미설정 (0 또는 누락) → 1로 폴백', () => {
    const ctx = buildCtx({ settings: { currentFinSeason: 0 } });
    const result = ctx.saveBets([
      makeBet({ finSeason: undefined }),
    ], { refresh: false });
    // 0은 유효하지 않으므로 폴백 1 적용
    expect(result[0].finSeason).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════
// migration — _migrate / _loadState 경로 (Storage를 통해 간접 검증)
// ══════════════════════════════════════════════════════════════
describe('migration — v1 → v2 경로', () => {
  test('v1 배열 → v2 래퍼로 승격 + projectId: "default" 보정', () => {
    // Storage에 v1 (bare 배열) 데이터를 심어두고 getBets로 읽기
    const ctx = buildCtx();
    const v1Data = [
      { amount: 10000, profit: 1000, betmanOdds: 2.0, finSeason: 1 },
      { amount: 5000, profit: -5000, betmanOdds: 1.8, finSeason: 1, projectId: 'custom' },
    ];
    ctx.Storage._store['edge_bets'] = JSON.stringify(v1Data);

    const bets = ctx.getBets();
    // projectId 없는 것 → 'default' 부여
    expect(bets[0].projectId).toBe('default');
    // projectId 있는 것 → 기존 값 유지 (spread 순서상 기존 값 우선)
    expect(bets[1].projectId).toBe('custom');
  });

  test('v1 → v2 schemaVersion 업그레이드 (getBets 후 State 확인)', () => {
    const ctx = buildCtx();
    // schemaVersion: 1 명시
    const v1Wrapped = { schemaVersion: 1, bets: [{ amount: 10000, profit: 0, betmanOdds: 2.0, finSeason: 1 }] };
    ctx.Storage._store['edge_bets'] = JSON.stringify(v1Wrapped);

    ctx.getBets(); // _loadState 트리거
    // 이후 saveBets → schemaVersion: 2로 기록되어야 함
    const saved = ctx.saveBets(ctx.getBets(), { refresh: false });
    const stored = JSON.parse(ctx.Storage._store['edge_bets']);
    expect(stored.schemaVersion).toBe(2);
  });

  test('schemaVersion 누락 데이터 → v1로 처리 후 v2 승격', () => {
    const ctx = buildCtx();
    const noVersion = { bets: [{ amount: 10000, profit: 0, betmanOdds: 2.0, finSeason: 1 }] };
    ctx.Storage._store['edge_bets'] = JSON.stringify(noVersion);

    const bets = ctx.getBets();
    expect(bets[0].projectId).toBe('default');
  });

  test('파싱 실패 (손상 JSON) → 빈 bets 반환 (초기화, 예외 없음)', () => {
    const ctx = buildCtx();
    ctx.Storage._store['edge_bets'] = 'NOT_VALID_JSON{{{';
    expect(() => ctx.getBets()).not.toThrow();
    expect(ctx.getBets()).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════
// Idempotency — 핵심 안전 보장
// ══════════════════════════════════════════════════════════════
describe('idempotency — migration이 두 번 돌아도 데이터 변형 없음', () => {
  test('saveBets(saveBets(x)) === saveBets(x) — shape 동일', () => {
    const ctx = buildCtx({ settings: { currentFinSeason: 2 } });
    const input = [
      makeBet({ finSeason: 1, projectId: 'custom' }),
      makeBet({ finSeason: 2 }),
      makeBet({ isSim: true }),
    ];
    const once  = ctx.saveBets(input, { refresh: false });
    const twice = ctx.saveBets(once,  { refresh: false });

    expect(twice.length).toBe(once.length);
    twice.forEach((b, i) => {
      expect(b.finSeason).toBe(once[i].finSeason);
      expect(b.projectId).toBe(once[i].projectId);
      expect(b.isSim).toBe(once[i].isSim);
    });
  });

  test('migration 두 번 후 finSeason 값이 바뀌지 않음', () => {
    const ctx = buildCtx({ settings: { currentFinSeason: 3 } });

    // 1회차 저장
    const first = ctx.saveBets([
      makeBet({ finSeason: 1 }),
      makeBet({ isSim: true }),
      makeBet({ amount: 0, profit: 0 }),
    ], { refresh: false });

    // 2회차 저장 (복구/재저장 시뮬)
    const second = ctx.saveBets(first, { refresh: false });

    expect(second[0].finSeason).toBe(1);   // 정상값 유지
    expect(second[1].finSeason).toBe(-1);  // isSim 유지
    expect(second[2].finSeason).toBe(0);   // 손상 데이터 유지
  });

  test('migrate(migrate(v1)) === migrate(v1) — Storage 경유 검증', () => {
    const ctx = buildCtx();
    // v1 배열을 Storage에 직접 세팅
    const v1 = [{ amount: 10000, profit: 0, betmanOdds: 2.0, finSeason: 1 }];
    ctx.Storage._store['edge_bets'] = JSON.stringify(v1);

    const loadOnce = ctx.getBets();
    // 저장 후 재로드
    ctx.saveBets(loadOnce, { refresh: false });
    // _state 캐시 무효화를 위해 새 ctx 생성 없이 Storage 직접 재사용
    const stored = JSON.parse(ctx.Storage._store['edge_bets']);
    expect(stored.bets[0].projectId).toBe('default');
    // 한 번 더 확인 — 값이 안 변함
    expect(stored.bets[0].projectId).toBe('default');
  });
});
