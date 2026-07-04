// round.test.js
// 대상: lockNewRound, applyRoundBet, getActiveRound
// 범위: 회차 상태 전이, remaining/status consistency

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

// ── 테스트 하네스 ──────────────────────────────────────────────
function buildCtx(overrides = {}) {
  const _store = {};
  const Storage = {
    get:     (k)    => _store[k] ?? null,
    set:     (k, v) => { _store[k] = v; return true; },
    getJSON: (k, fb) => {
      try { return _store[k] ? JSON.parse(_store[k]) : fb; } catch { return fb; }
    },
    setJSON: (k, v) => { _store[k] = JSON.stringify(v); return true; },
    remove:  (k)    => { delete _store[k]; return true; },
    _store,
  };

  const KEYS = {
    ROUNDS:        'edge_rounds',
    CURRENT_ROUND: 'edge_current_round',
    ROUND_HISTORY: 'edge_round_history',
    BETS:          'edge_bets',
  };

  const ctx = {
    window: {
      App:              { kellyPrevMultiplier: 1.0 },
      dispatchEvent:    jest.fn(),
      addEventListener: jest.fn(),
    },
    Event: class Event { constructor(type) { this.type = type; } },
    console,
    Storage,
    KEYS,
    showToast:  jest.fn(),
    confirm:    jest.fn(() => true),
    getBets:    jest.fn(() => overrides.bets || []),
    ...overrides.globals,
  };

  vm.createContext(ctx);
  vm.runInContext(`
    console.assert = (cond, msg) => { if (!cond) console.warn('assert:', msg); };
  `, ctx);

  vm.runInContext(
    fs.readFileSync(path.join(__dirname, 'round.js'), 'utf8'),
    ctx
  );

  return ctx;
}

// ── 픽스처 헬퍼 ──────────────────────────────────────────────
function freshCtx(seedInStore = []) {
  const ctx = buildCtx();
  if (seedInStore.length) {
    ctx.Storage._store['edge_rounds'] = JSON.stringify(seedInStore);
  }
  return ctx;
}

// ══════════════════════════════════════════════════════════════
// lockNewRound
// ══════════════════════════════════════════════════════════════
describe('lockNewRound', () => {
  test('유효한 seed → 회차 생성, status: LOCKED, true 반환', () => {
    const ctx = buildCtx();
    const result = ctx.lockNewRound(100000);
    expect(result).toBe(true);

    const active = ctx.getActiveRound();
    expect(active).not.toBeNull();
    expect(active.status).toBe('LOCKED');
    expect(active.seed).toBe(100000);
    expect(active.remaining).toBe(100000);
    expect(active.closedAt).toBeNull();
    expect(active.id).toMatch(/^r\d+/);
  });

  test('LOCKED 회차 이미 있을 때 → false 반환, 기존 회차 유지', () => {
    const ctx = buildCtx();
    ctx.lockNewRound(100000); // 첫 회차
    const first = ctx.getActiveRound();

    const result = ctx.lockNewRound(200000); // 두 번째 시도
    expect(result).toBe(false);
    expect(ctx.showToast).toHaveBeenCalledWith(
      expect.stringContaining('진행 중인 회차'),
      'error'
    );

    // 기존 회차 변경 없음
    const active = ctx.getActiveRound();
    expect(active.seed).toBe(first.seed);
  });

  test('seed <= 0 → false 반환, showToast 호출', () => {
    const ctx = buildCtx();
    expect(ctx.lockNewRound(0)).toBe(false);
    expect(ctx.lockNewRound(-100)).toBe(false);
    expect(ctx.showToast).toHaveBeenCalledWith(
      expect.stringContaining('유효한 시드'),
      'error'
    );
  });

  test('seed가 비숫자 문자열 → false 반환', () => {
    const ctx = buildCtx();
    expect(ctx.lockNewRound('abc')).toBe(false);
    expect(ctx.getActiveRound()).toBeNull();
  });

  test('seed가 숫자형 문자열 → 정상 파싱 후 생성', () => {
    const ctx = buildCtx();
    const result = ctx.lockNewRound('50000');
    expect(result).toBe(true);
    expect(ctx.getActiveRound().seed).toBe(50000);
  });

  test('lockNewRound 후 rounds 배열에 신규 회차 포함됨', () => {
    const ctx = buildCtx();
    ctx.lockNewRound(120000);
    const rounds = ctx.getRounds();
    expect(rounds.length).toBe(1);
    expect(rounds[0].status).toBe('LOCKED');
  });
});

// ══════════════════════════════════════════════════════════════
// applyRoundBet — remaining/status consistency
// ══════════════════════════════════════════════════════════════
describe('applyRoundBet', () => {
  test('정상 차감 — remaining 감소, status 유지', () => {
    const ctx = buildCtx();
    ctx.lockNewRound(100000);
    ctx.applyRoundBet(30000);

    const r = ctx.getActiveRound();
    expect(r.remaining).toBe(70000);
    expect(r.status).toBe('LOCKED');
  });

  test('여러 번 차감 — 누적 정확성', () => {
    const ctx = buildCtx();
    ctx.lockNewRound(100000);
    ctx.applyRoundBet(10000);
    ctx.applyRoundBet(20000);
    ctx.applyRoundBet(5000);

    expect(ctx.getActiveRound().remaining).toBe(65000);
  });

  test('remaining ≤ 0 → 자동 종료 안 함 (미결 베팅 적중 시 복구 가능)', () => {
    const ctx = buildCtx();
    ctx.lockNewRound(50000);
    ctx.applyRoundBet(50000); // 정확히 소진

    // 설계 의도: remaining=0이어도 자동 UNLOCKED 전환 안 함
    // 미결 베팅이 적중하면 remaining이 다시 늘 수 있으므로 수동 closeRound()로만 종료
    const active = ctx.getActiveRound();
    expect(active).not.toBeNull();
    expect(active.remaining).toBe(0);
    expect(active.status).toBe('LOCKED');
  });

  test('remaining 초과 차감 → 0으로 floor, 자동 종료 안 함', () => {
    const ctx = buildCtx();
    ctx.lockNewRound(30000);
    ctx.applyRoundBet(99999); // 초과 차감

    // 설계 의도: 초과 차감으로 0 floor, 자동 UNLOCKED 전환 안 함
    const active = ctx.getActiveRound();
    expect(active).not.toBeNull();
    expect(active.remaining).toBe(0);
    expect(active.status).toBe('LOCKED');
  });

  test('활성 회차 없을 때 → noop (에러 없이 통과)', () => {
    const ctx = buildCtx();
    expect(() => ctx.applyRoundBet(10000)).not.toThrow();
  });

  test('applyRoundBet 후 saveRounds 호출 확인 — Storage에 반영됨', () => {
    const ctx = buildCtx();
    ctx.lockNewRound(100000);
    ctx.applyRoundBet(40000);

    const stored = ctx.Storage.getJSON('edge_rounds', []);
    expect(stored[0].remaining).toBe(60000);
  });
});

// ══════════════════════════════════════════════════════════════
// 상태 간 일관성 — 연속 시나리오
// ══════════════════════════════════════════════════════════════
describe('상태 일관성 — 연속 시나리오', () => {
  test('lock → apply × 3 → 소진 → UNLOCKED 전환 전 후 상태 검증', () => {
    const ctx = buildCtx();
    ctx.lockNewRound(60000);

    ctx.applyRoundBet(20000);
    expect(ctx.getActiveRound().remaining).toBe(40000);
    expect(ctx.getActiveRound().status).toBe('LOCKED');

    ctx.applyRoundBet(20000);
    expect(ctx.getActiveRound().remaining).toBe(20000);

    ctx.applyRoundBet(20000); // 소진
    // 설계 의도: remaining=0이어도 자동 종료 안 함
    const after = ctx.getActiveRound();
    expect(after).not.toBeNull();
    expect(after.remaining).toBe(0);
    expect(after.status).toBe('LOCKED');
  });

  test('lock 후 수동 종료 → lock 재시도 성공', () => {
    const ctx = buildCtx();
    ctx.lockNewRound(10000);
    ctx.applyRoundBet(10000); // remaining=0, 자동 종료 안 함
    // 수동 종료 후 재시작
    if (typeof ctx.closeRound === 'function') ctx.closeRound();
    else {
      // closeRound가 없는 컨텍스트면 직접 상태 변경
      const rounds = ctx.getRounds();
      rounds[0].status = 'UNLOCKED';
      ctx.saveRounds(rounds);
    }
    const result = ctx.lockNewRound(20000);
    expect(result).toBe(true);
    expect(ctx.getActiveRound().seed).toBe(20000);
  });

  test('rounds 배열에 UNLOCKED, LOCKED 공존 — getActiveRound은 LOCKED만 반환', () => {
    const ctx = buildCtx();
    ctx.lockNewRound(10000);
    ctx.applyRoundBet(10000); // remaining=0, 자동 종료 안 함
    // 수동 종료 후 새 회차 시작
    const rounds1 = ctx.getRounds();
    rounds1[0].status = 'UNLOCKED';
    ctx.saveRounds(rounds1);

    ctx.lockNewRound(20000); // 새 LOCKED
    const active = ctx.getActiveRound();
    expect(active.seed).toBe(20000);
    expect(ctx.getRounds().length).toBe(2);
  });
});
