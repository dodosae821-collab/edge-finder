// ============================================================
// scope.js — scope 상태 관리 및 필터 전용 모듈
// ============================================================
// 담당:
//   getCurrentScope / setCurrentScope
//   getCurrentProject / setCurrentProject
//   getBetsByScope   — 필터링된 bets 반환
//   switchScope      — scope 전환 (UI 호출 포함)
//
// 규칙:
//   - getBets() 경유로만 bets 읽기 (직접 접근 금지)
//   - getActiveRound() 경유로만 rounds 읽기
//   - _syncScopeUI는 state.js 잔류 (DOM 접근) → typeof 가드로 호출
//   - round.js 이후, state.js 이전에 로드
// ============================================================


function getCurrentScope() {
  return Storage.get(KEYS.SCOPE) || 'all';
}

function setCurrentScope(scope) {
  Storage.set(KEYS.SCOPE, scope);
}

function getCurrentProject() {
  return Storage.get(KEYS.CURRENT_PROJECT) || 'default';
}

function setCurrentProject(id) {
  if (!id || typeof id !== 'string') return;
  Storage.set(KEYS.CURRENT_PROJECT, id.trim() || 'default');
}

/** 현재 scope에 맞는 bets 배열 반환. 통계 계산 전에 항상 사용. */
function getBetsByScope() {
  const scope = getCurrentScope();
  // ── 현재 회차 ──
  if (scope === 'round') {
    const r = getActiveRound();
    if (!r) {
      // 진행 중 회차가 없는데 scope가 'round'면 'all'로 자동 복구
      setCurrentScope('all');
      return getBets();
    }
    return getBets().filter(b => b.roundId === r.id);
  }
  // ── 프로젝트 (하위 호환) ──
  if (scope === 'project') {
    const p = getCurrentProject();
    return getBets().filter(b => (b.projectId || 'default') === p);
  }
  return getBets(); // 'all' 또는 미지정
}

/** scope 전환 — UI 동기화 후 전체 갱신.
 *  _syncScopeUI는 state.js에 잔류 — typeof 가드로 안전 호출. */
function switchScope(scope) {
  setCurrentScope(scope);

  if (typeof _syncScopeUI === 'function') {
    _syncScopeUI();
  }

  if (typeof refreshAllUI === 'function') {
    refreshAllUI();
  }
}


// ── 자기 무결성 체크 ─────────────────────────────────────────
console.assert(typeof getCurrentScope  === 'function', '[scope.js] getCurrentScope not defined');
console.assert(typeof getBetsByScope   === 'function', '[scope.js] getBetsByScope not defined');
console.assert(typeof switchScope      === 'function', '[scope.js] switchScope not defined');

// ── [MIGRATION] App.services.scope namespace 등록 ────────────
// 현재 전역 함수(getBetsByScope() 등 직접 호출)는 그대로 동작함.
// 목표: 호출 경로를 window.App.services.scope.* 로 점진 이전.
// 전역 선언 제거는 별도 PR에서 진행. (이 단계는 migration path 생성)
//
// NOTE: scope.js는 Storage, getBets, refreshAllUI에 의존하므로
// App.compute/kelly/gate 와 달리 "service" 레이어로 분류.
if (typeof window !== 'undefined') {
  if (!window.App) window.App = {};
  if (!window.App.services) window.App.services = {};
  window.App.services.scope = {
    getCurrentScope,
    setCurrentScope,
    getCurrentProject,
    setCurrentProject,
    getBetsByScope,
    switchScope,
  };
  if (window.App.debug) {
    console.debug('[bootstrap] App.services.scope attached', Object.keys(window.App.services.scope));
  }
}
