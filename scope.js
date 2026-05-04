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
  return localStorage.getItem('edge_scope') || 'all';
}

function setCurrentScope(scope) {
  localStorage.setItem('edge_scope', scope);
}

function getCurrentProject() {
  return localStorage.getItem('edge_current_project') || 'default';
}

function setCurrentProject(id) {
  if (!id || typeof id !== 'string') return;
  localStorage.setItem('edge_current_project', id.trim() || 'default');
}

/** 현재 scope에 맞는 bets 배열 반환. 통계 계산 전에 항상 사용. */
function getBetsByScope() {
  const scope = getCurrentScope();
  // ── 현재 회차 ──
  if (scope === 'round') {
    const r = getActiveRound();
    if (!r) return [];                          // 진행 중 회차 없으면 빈 배열
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
