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
    const raw = JSON.parse(localStorage.getItem('edge_rounds') || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    console.error('[round] edge_rounds 파싱 실패:', e);
    return [];
  }
}());

function saveRounds(arr) {
  rounds = arr;
  localStorage.setItem('edge_rounds', JSON.stringify(arr));
}

/** rounds 배열 읽기 전용 접근자 — 외부에서 직접 접근 금지 */
function getRounds() {
  return rounds;
}

/** 진행 중인 회차 (LOCKED) — 항상 1개 또는 null */
function getActiveRound() {
  return rounds.find(r => r.status === 'LOCKED') || null;
}

/** 새 회차 시작 — LOCKED 회차가 없을 때만 생성 가능 */
function lockNewRound(seed) {
  if (getActiveRound()) {
    alert('진행 중인 회차가 있습니다. 현재 회차를 먼저 종료하세요.');
    return false;
  }
  const parsedSeed = parseInt(seed, 10);
  if (!parsedSeed || parsedSeed <= 0) {
    alert('유효한 시드 금액을 입력하세요.');
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
  localStorage.setItem('edge_current_round', id);
  window.dispatchEvent(new Event('storage'));
  return true;
}

/** 베팅 금액 차감 → remaining <= 0 이면 자동 UNLOCKED */
function applyRoundBet(amount) {
  const round = getActiveRound();
  if (!round) return;
  round.remaining = Math.max(0, round.remaining - amount);
  if (round.remaining <= 0) {
    round.status    = 'UNLOCKED';
    round.closedAt  = new Date().toISOString();
  }
  saveRounds([...rounds]);          // 참조 갱신
  window.dispatchEvent(new Event('storage'));
}

/** 베팅 취소/삭제 시 금액 환원 (LOCKED 회차에만) */
function refundRoundBet(amount) {
  const round = getActiveRound();
  if (!round) return;
  round.remaining = Math.min(round.seed, round.remaining + amount);
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
  try { return JSON.parse(localStorage.getItem('edge_round_history') || '[]'); } catch { return []; }
}

function saveRoundHistory(history) {
  localStorage.setItem('edge_round_history', JSON.stringify(history));
}


// ── 자기 무결성 체크 ─────────────────────────────────────────
console.assert(typeof getActiveRound === 'function', '[round.js] getActiveRound not defined');
console.assert(typeof saveRounds     === 'function', '[round.js] saveRounds not defined');
console.assert(typeof getRounds      === 'function', '[round.js] getRounds not defined');
console.assert(typeof applyRoundBet  === 'function', '[round.js] applyRoundBet not defined');
