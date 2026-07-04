// ============================================================
// round.js — 회차(시드) 사이클 관리 전용 모듈
// ============================================================
// 담당:
//   rounds 상태 관리 (localStorage: edge_rounds)
//   saveRounds / getActiveRound / lockNewRound
//   applyRoundBet / refundRoundBet / closeActiveRound
//   getRoundHistory / saveRoundHistory
//
// 규칙:
//   - DOM 접근 금지 (UI 로직 없음)
//   - getBets() 경유로만 bets 읽기
//   - state.js 이전에 로드
//   - 함수명/로직 변경 없음 (순수 이동)
// ============================================================


// ============================================================
// ▶ rounds — 회차(시드) 사이클 관리
//   구조: [{ id, seed, remaining, status:'LOCKED'|'UNLOCKED', createdAt, closedAt }]
//   LOCKED  = 진행 중 (항상 최대 1개)
//   UNLOCKED = 종료됨
//   localStorage key: edge_rounds
// ============================================================
let rounds = (function () {
  try {
    const raw = Storage.getJSON(KEYS.ROUNDS, []);
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    console.error('[round] edge_rounds 파싱 실패:', e);
    return [];
  }
}());

function saveRounds(arr) {
  rounds = arr;
  Storage.setJSON(KEYS.ROUNDS, arr);
}

/** rounds 배열 읽기 전용 접근자 — 외부에서 직접 접근 금지 */
function getRounds() {
  return rounds;
}

/** 진행 중인 회차 (LOCKED) — 항상 1개 또는 null */
function getActiveRound() {
  return rounds.find(r => r.status === 'LOCKED') || null;
}

/** 특정 회차에 연결된 베팅들의 확정 손익 합산 (PENDING 제외) */
function getRoundProfit(roundId) {
  if (!roundId) return 0;
  const linked = getBets().filter(b => b.roundId === roundId && b.result !== 'PENDING');
  return linked.reduce((s, b) => s + (isFinite(b.profit) ? b.profit : 0), 0);
}

/** 회차 뱅크롤 = 시드 + 그 회차에서 확정된 손익 (적중분 반영 — 단순 잔액 소진과 다름) */
function getRoundBankroll(round) {
  if (!round) return 0;
  return round.seed + getRoundProfit(round.id);
}

/** 새 회차 시작 — LOCKED 회차가 없을 때만 생성 가능 */
function lockNewRound(seed) {
  if (getActiveRound()) {
    showToast('진행 중인 회차가 있습니다. 현재 회차를 먼저 종료하세요.', 'error');
    return false;
  }
  const parsedSeed = parseInt(seed, 10);
  if (!parsedSeed || parsedSeed <= 0) {
    showToast('유효한 시드 금액을 입력하세요.', 'error');
    return false;
  }
  const id = 'r' + Date.now();
  const newRound = {
    id,
    seed:      parsedSeed,
    remaining: parsedSeed,
    status:    'LOCKED',
    createdAt: new Date().toISOString(),
    closedAt:  null
  };
  saveRounds([...rounds, newRound]);
  Storage.set(KEYS.CURRENT_ROUND, id);
  // 새 회차 시작 → 스코프를 회차 뷰로 자동 전환 (새 출발을 바로 보여줌).
  // 회차 종료 시 all로 자동 복구되는 안전장치와 대칭.
  if (typeof setCurrentScope === 'function') setCurrentScope('round');
  window.dispatchEvent(new Event('storage'));
  return true;
}

/** 베팅 금액 차감 — remaining이 0이 되어도 즉시 종료하지 않음
 *  (미결 베팅이 적중하면 다시 회차 자산이 늘어날 수 있으므로,
 *   종료 여부는 베팅 결과가 확정되는 시점(checkRoundAutoClose)에서만 판단) */
function applyRoundBet(amount) {
  const round = getActiveRound();
  if (!round) return;
  round.remaining = Math.max(0, round.remaining - amount);
  saveRounds([...rounds]);          // 참조 갱신
  window.dispatchEvent(new Event('storage'));
}

/** 베팅 결과 확정 후 호출 — 미결(PENDING) 베팅이 하나도 없고
 *  잔액도 0 이하일 때만 회차를 자동 종료.
 *  PENDING이 남아있으면 잔액이 0이어도 회차를 끝내지 않음
 *  (나중에 적중하면 자산이 살아나야 하므로). */
function checkRoundAutoClose() {
  const round = getActiveRound();
  if (!round) return;
  if (round.remaining > 0) return; // 아직 시드가 남아있으면 자동 종료 대상 아님

  const pendingInRound = getBets().some(b => b.roundId === round.id && b.result === 'PENDING');
  if (pendingInRound) return; // 결과 기다리는 베팅이 있으면 종료 보류

  round.status   = 'UNLOCKED';
  round.closedAt = new Date().toISOString();
  saveRounds([...rounds]);
  window.dispatchEvent(new Event('storage'));
}

/** 베팅 취소/삭제 시 금액 환원 (LOCKED 회차에만) — 시드 한도까지만 복구 */
function refundRoundBet(amount) {
  const round = getActiveRound();
  if (!round) return;
  round.remaining = Math.min(round.seed, round.remaining + amount);
  saveRounds([...rounds]);
}

/** 적중(WIN) 이익을 회차 잔액에 반영 — refundRoundBet과 달리 시드 상한 없음
 *  (적중하면 시드보다 더 많은 자산이 쌓일 수 있어야 함) */
function creditRoundWin(profitAmount, roundId) {
  if (profitAmount <= 0) return;
  // roundId가 주어지면 해당 회차를 직접 찾음
  // (자동종료로 UNLOCKED된 회차도 처리 가능 — getActiveRound()는 LOCKED만 반환하므로 놓침)
  const round = roundId
    ? rounds.find(r => r.id === roundId)
    : getActiveRound();
  if (!round) return;
  round.remaining = round.remaining + profitAmount;
  // WIN으로 remaining이 복구됐으면 자동종료된 회차를 다시 LOCKED로 되돌림
  if (round.status === 'UNLOCKED' && round.remaining > 0) {
    round.status   = 'LOCKED';
    round.closedAt = null;
  }
  saveRounds([...rounds]);
}

/** 현재 회차 수동 종료 */
function closeActiveRound() {
  const round = getActiveRound();
  if (!round) return;
  if (!confirm('현재 회차를 종료하시겠습니까?')) return;
  round.status   = 'UNLOCKED';
  round.closedAt = new Date().toISOString();

  // ── snapshot 저장 — 렌더 시 재계산 제거 / 성능 개선 ──
  const roundBets = getBets().filter(b => b.roundId && b.roundId === round.id && b.result !== 'PENDING');
  const total     = roundBets.length;
  const wins      = roundBets.filter(b => b.result === 'WIN').length;
  const profit    = roundBets.reduce((s, b) => s + (b.profit || 0), 0);
  round.summary = {
    total,
    wins:      wins ?? 0,
    profit:    Math.round(profit),
    roi:       total > 0 && round.seed > 0 ? +(profit / round.seed * 100).toFixed(2) : 0,
    hitRate:   total > 0 ? +(wins / total * 100).toFixed(2) : 0,
    createdAt: Date.now()
  };

  saveRounds([...rounds]);
  window.dispatchEvent(new Event('storage'));
}

// ── 회차 이력 (edge_round_history) ──────────────────────────
function getRoundHistory() {
  try { return Storage.getJSON(KEYS.ROUND_HISTORY, []); } catch { return []; }
}

function saveRoundHistory(history) {
  Storage.setJSON(KEYS.ROUND_HISTORY, history);
}


// ── 자기 무결성 체크 ─────────────────────────────────────────
console.assert(typeof getActiveRound === 'function', '[round.js] getActiveRound not defined');
console.assert(typeof saveRounds     === 'function', '[round.js] saveRounds not defined');
console.assert(typeof getRounds      === 'function', '[round.js] getRounds not defined');
console.assert(typeof applyRoundBet  === 'function', '[round.js] applyRoundBet not defined');

// ── [MIGRATION] App.services.round namespace 등록 ────────────
// 현재 전역 함수(getActiveRound() 등 직접 호출)는 그대로 동작함.
// 목표: 호출 경로를 window.App.services.round.* 로 점진 이전.
// 전역 선언 제거는 별도 PR에서 진행. (이 단계는 migration path 생성)
//
// NOTE: round.js는 Storage, getBets, window.dispatchEvent에 의존하므로
// App.compute/kelly/gate 와 달리 "service" 레이어로 분류.
if (typeof window !== 'undefined') {
  if (!window.App) window.App = {};
  if (!window.App.services) window.App.services = {};
  window.App.services.round = {
    getRounds,
    saveRounds,
    getActiveRound,
    lockNewRound,
    applyRoundBet,
    refundRoundBet,
    closeActiveRound,
    getRoundHistory,
    saveRoundHistory,
  };
  if (window.App.debug) {
    console.debug('[bootstrap] App.services.round attached', Object.keys(window.App.services.round));
  }
}
