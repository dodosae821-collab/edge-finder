// scope.test.js
// 대상: getBetsByScope — scope 필터 일관성
// 범위: all / round / project + stale roundId edge case

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

// ── 테스트 하네스 ──────────────────────────────────────────────
function buildCtx({ scope = 'all', project = 'default', activeRound = null, bets = [] } = {}) {
  const _store = { 'edge_scope': scope, 'edge_current_project': project };
  const Storage = {
    get:     (k)    => _store[k] ?? null,
    set:     (k, v) => { _store[k] = v; return true; },
    getJSON: (k, fb) => { try { return _store[k] ? JSON.parse(_store[k]) : fb; } catch { return fb; } },
    setJSON: (k, v) => { _store[k] = JSON.stringify(v); return true; },
    remove:  (k)    => { delete _store[k]; return true; },
    _store,
  };

  const KEYS = {
    SCOPE:           'edge_scope',
    CURRENT_PROJECT: 'edge_current_project',
    ROUNDS:          'edge_rounds',
    CURRENT_ROUND:   'edge_current_round',
  };

  const ctx = {
    window:  {},
    console,
    Storage,
    KEYS,
    getActiveRound: jest.fn(() => activeRound),
    getBets:        jest.fn(() => bets),
    refreshAllUI:   jest.fn(),
    _syncScopeUI:   jest.fn(),
  };

  vm.createContext(ctx);
  vm.runInContext(`
    console.assert = (cond, msg) => { if (!cond) console.warn('assert:', msg); };
  `, ctx);

  vm.runInContext(
    fs.readFileSync(path.join(__dirname, 'scope.js'), 'utf8'),
    ctx
  );

  return ctx;
}

// ── 픽스처 헬퍼 ──────────────────────────────────────────────
function bet(overrides = {}) {
  return {
    amount: 10000,
    profit: 0,
    projectId: 'default',
    roundId: null,
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════
// scope = 'all'
// ══════════════════════════════════════════════════════════════
describe("scope='all'", () => {
  test('전체 bets 반환 (필터 없음)', () => {
    const bets = [
      bet({ projectId: 'alpha' }),
      bet({ projectId: 'beta' }),
      bet({ roundId: 'r1' }),
    ];
    const ctx = buildCtx({ scope: 'all', bets });
    expect(ctx.getBetsByScope()).toEqual(bets);
  });

  test('빈 배열도 그대로 반환', () => {
    const ctx = buildCtx({ scope: 'all', bets: [] });
    expect(ctx.getBetsByScope()).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════
// scope = 'round'
// ══════════════════════════════════════════════════════════════
describe("scope='round'", () => {
  test('활성 회차 있음 → 해당 roundId만 필터', () => {
    const activeRound = { id: 'r_active', status: 'LOCKED' };
    const bets = [
      bet({ roundId: 'r_active' }),
      bet({ roundId: 'r_active' }),
      bet({ roundId: 'r_old' }),
      bet({ roundId: null }),
    ];
    const ctx = buildCtx({ scope: 'round', activeRound, bets });
    const result = ctx.getBetsByScope();
    expect(result.length).toBe(2);
    result.forEach(b => expect(b.roundId).toBe('r_active'));
  });

  test('활성 회차 없음 → all로 자동 복구, 전체 반환', () => {
    // 설계 의도: scope=round인데 활성 회차가 없으면 scope를 all로 자동 복구.
    // 화면이 텅 비는 것보다 전체 데이터를 보여주는 게 UX상 안전.
    const bets = [bet({ roundId: 'r_old' }), bet()];
    const ctx = buildCtx({ scope: 'round', activeRound: null, bets });
    const result = ctx.getBetsByScope();
    // 빈 배열이 아니라 전체 반환 (auto-widening)
    expect(result.length).toBe(bets.length);
  });

  test('stale activeRound — roundId가 실제 bets에 없음 → 빈 배열', () => {
    // 멀티탭/복구 후 발생 가능: activeRound는 있지만 해당 roundId의 bet이 없는 상태
    const staleRound = { id: 'r_ghost', status: 'LOCKED' };
    const bets = [
      bet({ roundId: 'r_other_1' }),
      bet({ roundId: 'r_other_2' }),
    ];
    const ctx = buildCtx({ scope: 'round', activeRound: staleRound, bets });
    expect(ctx.getBetsByScope()).toEqual([]);
  });

  test('활성 회차 있고 bets 전체가 해당 roundId → 전부 반환', () => {
    const activeRound = { id: 'r1', status: 'LOCKED' };
    const bets = [bet({ roundId: 'r1' }), bet({ roundId: 'r1' })];
    const ctx = buildCtx({ scope: 'round', activeRound, bets });
    expect(ctx.getBetsByScope().length).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════
// scope = 'project'
// ══════════════════════════════════════════════════════════════
describe("scope='project'", () => {
  test('현재 project에 속한 bets만 반환', () => {
    const bets = [
      bet({ projectId: 'alpha' }),
      bet({ projectId: 'alpha' }),
      bet({ projectId: 'beta' }),
      bet({ projectId: 'default' }),
    ];
    const ctx = buildCtx({ scope: 'project', project: 'alpha', bets });
    const result = ctx.getBetsByScope();
    expect(result.length).toBe(2);
    result.forEach(b => expect(b.projectId).toBe('alpha'));
  });

  test('projectId 없는 bet → "default"로 처리', () => {
    const bets = [
      bet({ projectId: undefined }),
      bet({ projectId: null }),
      bet({ projectId: 'default' }),
    ];
    const ctx = buildCtx({ scope: 'project', project: 'default', bets });
    // projectId 없는 것 → 'default' 취급 → 포함
    expect(ctx.getBetsByScope().length).toBe(3);
  });

  test('존재하지 않는 projectId → 빈 배열', () => {
    const bets = [bet({ projectId: 'alpha' }), bet({ projectId: 'beta' })];
    const ctx = buildCtx({ scope: 'project', project: 'nonexistent', bets });
    expect(ctx.getBetsByScope()).toEqual([]);
  });

  test('project = "default" → projectId: "default" + 미설정 bet 모두 포함', () => {
    const bets = [
      bet({ projectId: 'default' }),
      bet({ projectId: undefined }),
      bet({ projectId: 'other' }),
    ];
    const ctx = buildCtx({ scope: 'project', project: 'default', bets });
    const result = ctx.getBetsByScope();
    expect(result.length).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════
// getCurrentScope / setCurrentScope
// ══════════════════════════════════════════════════════════════
describe('getCurrentScope / setCurrentScope', () => {
  test('Storage에 값 없으면 "all" 기본값 반환', () => {
    const ctx = buildCtx({ scope: undefined, bets: [] });
    // scope key 제거 후 확인
    delete ctx.Storage._store['edge_scope'];
    expect(ctx.getCurrentScope()).toBe('all');
  });

  test('setCurrentScope → Storage에 저장', () => {
    const ctx = buildCtx({ scope: 'all', bets: [] });
    ctx.setCurrentScope('round');
    expect(ctx.Storage._store['edge_scope']).toBe('round');
  });
});

// ══════════════════════════════════════════════════════════════
// getCurrentProject / setCurrentProject
// ══════════════════════════════════════════════════════════════
describe('getCurrentProject / setCurrentProject', () => {
  test('값 없으면 "default" 반환', () => {
    const ctx = buildCtx({ bets: [] });
    delete ctx.Storage._store['edge_current_project'];
    expect(ctx.getCurrentProject()).toBe('default');
  });

  test('setCurrentProject → Storage에 저장', () => {
    const ctx = buildCtx({ bets: [] });
    ctx.setCurrentProject('myproject');
    expect(ctx.Storage._store['edge_current_project']).toBe('myproject');
  });

  test('setCurrentProject — 빈 문자열 → "default" 저장', () => {
    const ctx = buildCtx({ bets: [] });
    ctx.setCurrentProject('   ');
    expect(ctx.Storage._store['edge_current_project']).toBe('default');
  });

  test('setCurrentProject — null/undefined → noop (저장 안 함)', () => {
    const ctx = buildCtx({ project: 'existing', bets: [] });
    ctx.setCurrentProject(null);
    ctx.setCurrentProject(undefined);
    expect(ctx.getCurrentProject()).toBe('existing');
  });
});
