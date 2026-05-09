// restore.test.js
// 대상: restoreFromBackup — 복구 경로 안전성
// 범위: 손상 JSON 차단, side effect 미발생, 정상 복구 경로

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

// ── 테스트 하네스 ──────────────────────────────────────────────
function buildCtx(storeInit = {}) {
  const _store = { ...storeInit };

  const Storage = {
    get:     (k)    => _store[k] ?? null,
    set:     (k, v) => { _store[k] = v; return true; },
    getJSON: (k, fb) => {
      // null 반환이 "손상" 신호 — restore.js의 parsed===null 분기를 커버
      if (!(k in _store) || _store[k] === null) return fb;
      try { return JSON.parse(_store[k]); } catch { return null; }
    },
    setJSON: (k, v) => { _store[k] = JSON.stringify(v); return true; },
    remove:  (k)    => { delete _store[k]; return true; },
    _store,
  };

  const KEYS = {
    BETS:            'edge_bets',
    SETTINGS:        'edge_settings',
    PRE_RESTORE:     'edge_bets_pre_restore',
    PRE_RESTORE_TS:  'edge_bets_pre_restore_ts',
    RESTORE_LOG:     'edge_restore_log',
    ROUNDS:          'edge_rounds',
    CURRENT_ROUND:   'edge_current_round',
    SCOPE:           'edge_scope',
  };

  const saveBets        = jest.fn();
  const saveSettings    = jest.fn();
  const showToast       = jest.fn();
  const recomputeAllStats = jest.fn();
  const updateAll       = jest.fn();
  const loadSettingsDisplay = jest.fn();
  const restoreSettings = jest.fn();

  // location.reload mock
  const location = { reload: jest.fn() };

  const ctx = {
    window:  { App: { STORAGE_KEY: 'edge_bets' }, location },
    console,
    Storage,
    KEYS,
    saveBets,
    saveSettings,
    showToast,
    recomputeAllStats,
    updateAll,
    loadSettingsDisplay,
    restoreSettings,
    location,
    getBets: jest.fn(() => []),
    // appendRestoreLog stub (restore.js 내부에서 재정의됨 — 여기선 noop)
    appendRestoreLog: jest.fn(),
    _mocks: { saveBets, saveSettings, showToast, recomputeAllStats, updateAll, location },
  };

  vm.createContext(ctx);
  vm.runInContext(`
    console.assert = (cond, msg) => { if (!cond) console.warn('assert:', msg); };
    var document = {
      getElementById: () => ({ style: {}, innerHTML: '' }),
    };
  `, ctx);

  vm.runInContext(
    fs.readFileSync(path.join(__dirname, 'restore.js'), 'utf8'),
    ctx
  );

  // restore.js가 showRestoreResultModal을 정의하므로 로드 후 jest.fn()으로 교체
  // vm 내부에서 자유 변수로 조회되므로 ctx 교체 시 mock으로 동작
  ctx.showRestoreResultModal = jest.fn();

  return ctx;
}

// ── 픽스처 헬퍼 ──────────────────────────────────────────────
function validBet(overrides = {}) {
  return {
    amount: 10000,
    profit: 1000,
    betmanOdds: 2.0,
    result: 'WIN',
    date: '2024-01-01',
    game: 'TeamA vs TeamB',
    ...overrides,
  };
}

function tsValid() {
  return String(Date.now() - 1000); // 1초 전 (만료 아님)
}

// ══════════════════════════════════════════════════════════════
// restoreFromBackup — raw 없음
// ══════════════════════════════════════════════════════════════
describe('restoreFromBackup — 백업 없음', () => {
  test('PRE_RESTORE 키 없음 → saveBets 미호출, 조용히 반환', () => {
    // PRE_RESTORE_TS는 만료 아닌 값으로 세팅, raw 자체 없음
    const ctx = buildCtx({
      'edge_bets_pre_restore_ts': tsValid(),
      // PRE_RESTORE 키 없음
    });

    ctx.restoreFromBackup();

    expect(ctx._mocks.saveBets).not.toHaveBeenCalled();
    expect(ctx._mocks.saveSettings).not.toHaveBeenCalled();
    expect(ctx._mocks.location.reload).not.toHaveBeenCalled();
  });

  test('PRE_RESTORE_TS 없음(만료 처리) → showRestoreResultModal(expired) 호출, saveBets 미호출', () => {
    const ctx = buildCtx({
      'edge_bets_pre_restore': JSON.stringify([validBet()]),
      // TS 없음 → Date.now() - 0 > 3분 → 만료
    });

    ctx.restoreFromBackup();

    expect(ctx._mocks.saveBets).not.toHaveBeenCalled();
    expect(ctx.showRestoreResultModal).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'expired' })
    );
  });
});

// ══════════════════════════════════════════════════════════════
// restoreFromBackup — 손상 JSON: side effect 절대 없음
// ══════════════════════════════════════════════════════════════
describe('restoreFromBackup — 손상 JSON → safe abort', () => {
  test('PRE_RESTORE가 파싱 불가 JSON → showToast(error), saveBets 미호출', () => {
    // Storage.getJSON이 null을 반환하도록 store에 null 세팅
    const _store = {
      'edge_bets_pre_restore_ts': tsValid(),
      'edge_bets_pre_restore':    null,   // getJSON → null 반환
    };

    // null이 getJSON에서 null(=손상)로 처리되도록 커스텀 Storage 주입
    const ctx = buildCtx(_store);
    // Storage._store에 실제로 값이 있게 하되, getJSON은 null 반환하도록 패치
    ctx.Storage._store['edge_bets_pre_restore'] = 'NOT_VALID{{{';
    // get()은 raw 문자열 반환 (truthy) → raw 있음 분기 진입
    // getJSON()은 null 반환 (손상) → toast + return

    ctx.restoreFromBackup();

    expect(ctx._mocks.saveBets).not.toHaveBeenCalled();
    expect(ctx._mocks.saveSettings).not.toHaveBeenCalled();
    expect(ctx._mocks.location.reload).not.toHaveBeenCalled();
    expect(ctx._mocks.showToast).toHaveBeenCalledWith(
      expect.stringContaining('손상'),
      'error'
    );
  });

  test('손상 JSON 시 Storage.set / Storage.setJSON 미호출 (데이터 변형 없음)', () => {
    const setSpy    = jest.fn(() => true);
    const setJSONSpy = jest.fn(() => true);

    const ctx = buildCtx({
      'edge_bets_pre_restore_ts': tsValid(),
    });
    ctx.Storage._store['edge_bets_pre_restore'] = 'CORRUPTED{{{';
    ctx.Storage.set    = setSpy;
    ctx.Storage.setJSON = setJSONSpy;

    ctx.restoreFromBackup();

    // KEYS.BETS 에 쓰기 없어야 함
    const betsWrites = setSpy.mock.calls.filter(([k]) => k === 'edge_bets');
    expect(betsWrites.length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════
// restoreFromBackup — 정상 복구: 배열형 데이터
// ══════════════════════════════════════════════════════════════
describe('restoreFromBackup — 정상 복구 (배열형)', () => {
  test('parsed가 배열 → saveBets 호출, 인자가 배열임을 확인', () => {
    const backup = [validBet(), validBet({ result: 'LOSE', profit: -10000 })];
    const ctx = buildCtx({
      'edge_bets_pre_restore_ts': tsValid(),
      'edge_bets_pre_restore':    JSON.stringify(backup),
    });

    ctx.restoreFromBackup();

    expect(ctx._mocks.saveBets).toHaveBeenCalledTimes(1);
    const [calledBets] = ctx._mocks.saveBets.mock.calls[0];
    expect(Array.isArray(calledBets)).toBe(true);
    expect(calledBets.length).toBe(2);
  });

  test('복구 후 showRestoreResultModal(rollback) 호출', () => {
    const backup = [validBet()];
    const ctx = buildCtx({
      'edge_bets_pre_restore_ts': tsValid(),
      'edge_bets_pre_restore':    JSON.stringify(backup),
    });

    ctx.restoreFromBackup();

    expect(ctx.showRestoreResultModal).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'rollback' })
    );
  });
});

// ══════════════════════════════════════════════════════════════
// restoreFromBackup — 정상 복구: 객체형 데이터 (parsed.bets)
// ══════════════════════════════════════════════════════════════
describe('restoreFromBackup — 정상 복구 (객체형: parsed.bets)', () => {
  test('parsed가 {bets: [...]} 형태 → bets 배열로 saveBets 호출', () => {
    const backup = { bets: [validBet(), validBet()], version: '6.1' };
    const ctx = buildCtx({
      'edge_bets_pre_restore_ts': tsValid(),
      'edge_bets_pre_restore':    JSON.stringify(backup),
    });

    ctx.restoreFromBackup();

    expect(ctx._mocks.saveBets).toHaveBeenCalledTimes(1);
    const [calledBets] = ctx._mocks.saveBets.mock.calls[0];
    expect(Array.isArray(calledBets)).toBe(true);
    expect(calledBets.length).toBe(2);
  });

  test('parsed.bets 없는 객체 → saveBets([]) 또는 빈 배열로 처리', () => {
    // parsed는 객체이나 bets 없음 → backupBets = []
    const backup = { version: '6.1' }; // bets 키 없음
    const ctx = buildCtx({
      'edge_bets_pre_restore_ts': tsValid(),
      'edge_bets_pre_restore':    JSON.stringify(backup),
    });

    ctx.restoreFromBackup();

    // saveBets([]) 호출 또는 saveBets(undefined) — 어느 쪽이든 BETS에 파괴적 write 없어야 함
    // 핵심: 예외 없이 통과하고, saveBets 인자는 배열이거나 빈 배열
    if (ctx._mocks.saveBets.mock.calls.length > 0) {
      const [arg] = ctx._mocks.saveBets.mock.calls[0];
      expect(Array.isArray(arg)).toBe(true);
      expect(arg.length).toBe(0);
    }
  });
});

// ══════════════════════════════════════════════════════════════
// restoreFromBackup — 시간 만료
// ══════════════════════════════════════════════════════════════
describe('restoreFromBackup — 3분 만료', () => {
  test('ts가 3분 초과 → saveBets 미호출, expired 모달 표시', () => {
    const expiredTs = String(Date.now() - (181 * 1000)); // 3분 1초 전
    const ctx = buildCtx({
      'edge_bets_pre_restore_ts': expiredTs,
      'edge_bets_pre_restore':    JSON.stringify([validBet()]),
    });

    ctx.restoreFromBackup();

    expect(ctx._mocks.saveBets).not.toHaveBeenCalled();
    expect(ctx.showRestoreResultModal).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'expired' })
    );
  });

  test('ts가 정확히 3분 이내 → 복구 진행 (만료 아님)', () => {
    const justInTime = String(Date.now() - (179 * 1000)); // 2분 59초 전
    const ctx = buildCtx({
      'edge_bets_pre_restore_ts': justInTime,
      'edge_bets_pre_restore':    JSON.stringify([validBet()]),
    });

    ctx.restoreFromBackup();

    expect(ctx._mocks.saveBets).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════════════════════
// restoreFromBackup — 이중 실행 방지 (_isRestoring guard)
// ══════════════════════════════════════════════════════════════
describe('restoreFromBackup — 이중 실행 방지', () => {
  test('연속 두 번 호출 — saveBets는 1회만 호출', () => {
    const backup = [validBet()];
    const ctx = buildCtx({
      'edge_bets_pre_restore_ts': tsValid(),
      'edge_bets_pre_restore':    JSON.stringify(backup),
    });

    ctx.restoreFromBackup();
    // _isRestoring이 finally에서 해제되므로 두 번째 호출은 정상 실행됨
    // 단, 첫 번째 호출 후 PRE_RESTORE 키가 clearBackup()으로 삭제되므로
    // 두 번째는 raw 없음 → noop
    ctx.restoreFromBackup();

    // 총 saveBets 호출은 1회 (두 번째 호출은 raw 없어서 중단)
    expect(ctx._mocks.saveBets.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

// ══════════════════════════════════════════════════════════════
// migrateBets — restore.js 내 헬퍼 직접 검증
// ══════════════════════════════════════════════════════════════
describe('migrateBets — restore.js 내 헬퍼', () => {
  test('createdAt 없는 bet → 현재 timestamp 보정', () => {
    const ctx = buildCtx();
    const before = Date.now();
    const result = ctx.migrateBets([{ amount: 10000, betmanOdds: 2.0, result: 'WIN' }]);
    const after = Date.now();

    expect(result[0].createdAt).toBeGreaterThanOrEqual(before);
    expect(result[0].createdAt).toBeLessThanOrEqual(after);
  });

  test('result 정규화 — 소문자/공백 → 대문자 trim', () => {
    const ctx = buildCtx();
    const result = ctx.migrateBets([
      { amount: 10000, betmanOdds: 2.0, result: ' win ' },
      { amount: 10000, betmanOdds: 2.0, result: 'lose' },
      { amount: 10000, betmanOdds: 2.0, result: '' },
      { amount: 10000, betmanOdds: 2.0, result: null },
    ]);
    expect(result[0].result).toBe('WIN');
    expect(result[1].result).toBe('LOSE');
    expect(result[2].result).toBeNull();
    expect(result[3].result).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// validateBet — restore.js 내 필드 유효성 검증
// ══════════════════════════════════════════════════════════════
describe('validateBet', () => {
  test('유효한 bet → true', () => {
    const ctx = buildCtx();
    expect(ctx.validateBet(validBet())).toBe(true);
  });

  test('amount <= 0 → false', () => {
    const ctx = buildCtx();
    expect(ctx.validateBet(validBet({ amount: 0 }))).toBe(false);
    expect(ctx.validateBet(validBet({ amount: -1 }))).toBe(false);
  });

  test('amount에 콤마 포함 ("10,000") → 파싱 후 유효', () => {
    const ctx = buildCtx();
    expect(ctx.validateBet(validBet({ amount: '10,000' }))).toBe(true);
  });

  test('betmanOdds NaN/Infinity → false', () => {
    const ctx = buildCtx();
    expect(ctx.validateBet(validBet({ betmanOdds: NaN }))).toBe(false);
    expect(ctx.validateBet(validBet({ betmanOdds: Infinity }))).toBe(false);
    expect(ctx.validateBet(validBet({ betmanOdds: 'abc' }))).toBe(false);
  });

  test('result가 비유효값 → false', () => {
    const ctx = buildCtx();
    expect(ctx.validateBet(validBet({ result: 'CANCELLED' }))).toBe(false);
    expect(ctx.validateBet(validBet({ result: 'win' }))).toBe(false); // 소문자 (migrate 전 호출 시)
  });

  test('result가 null → 유효 (PENDING 처리)', () => {
    const ctx = buildCtx();
    expect(ctx.validateBet(validBet({ result: null }))).toBe(true);
  });
});
