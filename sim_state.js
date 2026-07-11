// ============================================================
// 전략베팅 — 상태 (전역 상태 선언 + 기초 유틸)
//   구조 정리(v71): simulator.js에서 분할. 로드 순서: state → engine → render → actions
// ============================================================
// ========== 전략베팅 시뮬레이터 ==========

let SIM_GOAL = 1000000;

const SIM_START = 10000;

let simState = { balance: SIM_START, round: 1, history: [], goalReached: false, goalHistory: [] };

let simSnaps = [];

let simChartInst = null;



function simFmt(n) { return Math.round(n).toLocaleString('ko-KR'); }


// 사용자 피드백 토스트 — 홀딩/결과 처리 시 "왜 안 됐는지" 화면에 보여주기 위한 공통 헬퍼.
// (이전엔 가드 조건에 걸리면 아무 메시지 없이 조용히 return 되어 "반응 없음"처럼 보였음)
function simToast(msg, kind) {
  const bg = kind === 'error' ? 'rgba(255,59,92,0.92)' : kind === 'warn' ? 'rgba(255,159,10,0.92)' : 'rgba(0,230,118,0.9)';
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:${bg};color:#fff;padding:10px 18px;border-radius:20px;font-size:13px;font-weight:700;z-index:9999;max-width:88vw;text-align:center;`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}


// 갈래 합산 배당 — 판단 데이터의 경기(폴더) 배당에서 자동 계산.
//   베팅기록 폼(calcMultiEV)과 동일 규칙: 다폴 = betmanRound(각 배당의 곱), 단폴 = 입력 배당 그대로.
//   유효 배당(>=1.01) 없으면 0 반환 (미입력 상태).
//   ★ 수동 오버라이드: 기본은 자동 고정이지만, 베트맨 실지급이 계산과 다른 예외
//     (예: 곱 2.01 → 시스템 2.1, 베트맨 실지급 2.0)에는 사용자가 직접 수정 가능.
//     오버라이드는 홀딩 후 자동 해제(simResetOdds).
let simOddsOverride = { a: null, b: null, c: null };


// 홀딩 상태
let simPending = null; // { sv, b2, b3, o2, o3, ex2, ex3, memo, memoB, folderCount, round, bothAmt, only2Amt, only3Amt, loseAmt }

// ============================================================
// 폼 상태 단일 접근 계층 (구조 정리 v71 — ③상태 통합)
//   목적: "현재 폼에 뭐가 입력돼 있나"를 읽고 쓰는 경로를 이 파일 하나로 고정.
//   - simReadForm()          → 폼 전체를 직렬화 가능한 객체 하나로
//   - simWriteForm(form)     → 객체를 폼에 복원 (라디오→렌더→값 주입 순서 보장)
//   - simFormSaveDraft()     → 입력 임시저장 (탭 이동·새로고침에도 유실 방지)
//   - simFormRestoreDraft()  → 초기화 시 draft 복원
//   - simFormClearDraft()    → 홀딩 완료 후 draft 삭제
//   판단 유닛 읽기/쓰기(simReadJudgeUnit/simWriteJudgeUnit)는 렌더러(keep/restore)와
//   전송(simGetBranch)이 공유 — DOM 스크래핑 중복 제거.
// ============================================================

function simReadJudgeUnit(u) {
  return {
    sport:    u.querySelector('.sim-sport-h')?.value || '',
    sportLbl: u.querySelector('.sim-sport-label')?.textContent || '',
    type:     u.querySelector('.sim-type-h')?.value || '',
    typeLbl:  u.querySelector('.sim-type-label')?.textContent || '',
    odds:     u.querySelector('.sim-fold-odds')?.value || '',
    prob:     u.querySelector('.sim-fold-prob')?.value || '',
  };
}

function simWriteJudgeUnit(u, k) {
  if (!u || !k) return;
  const sh = u.querySelector('.sim-sport-h'); if (sh && k.sport) sh.value = k.sport;
  const sl = u.querySelector('.sim-sport-label'); if (sl && k.sport) { sl.textContent = k.sportLbl || k.sport; sl.style.color = 'var(--accent)'; }
  const th = u.querySelector('.sim-type-h'); if (th && k.type) th.value = k.type;
  const tl = u.querySelector('.sim-type-label'); if (tl && k.type) tl.textContent = k.typeLbl || k.type;
  const oi = u.querySelector('.sim-fold-odds'); if (oi && k.odds) oi.value = k.odds;
  const pi = u.querySelector('.sim-fold-prob'); if (pi && k.prob) pi.value = k.prob;
}

function simReadJudgeUnits(which) {
  const host = document.getElementById(`sim-judge-${which}`);
  if (!host) return [];
  return Array.from(host.querySelectorAll('.sim-judge-unit')).map(simReadJudgeUnit);
}

function simReadForm() {
  const gv = id => document.getElementById(id)?.value || '';
  return {
    sv: gv('sim-i-sv'), b2: gv('sim-i-b2'), b3: gv('sim-i-b3'), b4: gv('sim-i-b4'),
    memo: gv('sim-i-memo'), memoB: gv('sim-i-memo-b'), memoC: gv('sim-i-memo-c'),
    folders: { a: simBranchFolderCount('a'), b: simBranchFolderCount('b'), c: simBranchFolderCount('c') },
    override: { ...simOddsOverride },
    branches: { a: simReadJudgeUnits('a'), b: simReadJudgeUnits('b'), c: simReadJudgeUnits('c') },
  };
}

function simWriteForm(form) {
  if (!form) return;
  const sv = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
  sv('sim-i-sv', form.sv); sv('sim-i-b2', form.b2); sv('sim-i-b3', form.b3); sv('sim-i-b4', form.b4);
  sv('sim-i-memo', form.memo); sv('sim-i-memo-b', form.memoB); sv('sim-i-memo-c', form.memoC);
  // 1) 폴더 라디오 복원 → 2) 판단 행 렌더 → 3) 유닛 값 주입 (순서 보장)
  ['a','b','c'].forEach(w => {
    const n = form.folders?.[w] || 0;
    if (n >= 1 && n <= 6) { const r = document.getElementById(`sim-f-${w}${n}`); if (r) r.checked = true; }
  });
  if (form.override) simOddsOverride = { a: form.override.a ?? null, b: form.override.b ?? null, c: form.override.c ?? null };
  if (typeof simRenderJudge === 'function') simRenderJudge();
  ['a','b','c'].forEach(w => {
    const host = document.getElementById(`sim-judge-${w}`);
    if (!host) return;
    const units = host.querySelectorAll('.sim-judge-unit');
    (form.branches?.[w] || []).forEach((k, i) => simWriteJudgeUnit(units[i], k));
  });
}

let _simDraftTimer = null;
function simFormSaveDraft() {
  if (_simDraftTimer) clearTimeout(_simDraftTimer);
  _simDraftTimer = setTimeout(() => {
    try { Storage.setJSON(KEYS.SIM_FORM_DRAFT, simReadForm()); } catch (e) {}
  }, 400);
}

function simFormRestoreDraft() {
  try {
    const d = Storage.getJSON(KEYS.SIM_FORM_DRAFT, null);
    if (d) simWriteForm(d);
  } catch (e) {}
}

function simFormClearDraft() {
  try { Storage.remove(KEYS.SIM_FORM_DRAFT); } catch (e) {}
}

// ── 목표 금액 설정 연동 (v80) ────────────────────────────────
//   기본: 설정 탭의 '목표 자금'(appSettings.targetFund)을 SIM_GOAL이 자동 추종.
//   전략탭에서 수동 확정(simConfirmGoal)하면 수동 오버라이드 — ↺로 재연동.
//   (합산 배당의 자동/수동 패턴과 동일한 규칙)
function simGoalIsManual() {
  try { return Storage.get(KEYS.SIM_GOAL_MANUAL) === '1'; } catch (e) { return false; }
}

function simSyncGoalFromSettings() {
  if (simGoalIsManual()) return false;
  if (typeof getSettings !== 'function') return false;
  const tf = Number((getSettings() || {}).targetFund) || 0;
  if (tf > 0 && tf !== SIM_GOAL) {
    SIM_GOAL = tf;
    simState.goalReached = false;   // 목표 변경 시 재도전 (simConfirmGoal과 동일 규칙)
    try { Storage.set(KEYS.SIM_GOAL, SIM_GOAL); } catch (e) {}
    return true;
  }
  return false;
}

function simSetGoalManual(val) {
  SIM_GOAL = val; simState.goalReached = false;
  try { Storage.set(KEYS.SIM_GOAL, SIM_GOAL); Storage.set(KEYS.SIM_GOAL_MANUAL, '1'); } catch (e) {}
}

function simClearGoalManual() {
  try { Storage.remove(KEYS.SIM_GOAL_MANUAL); } catch (e) {}
  simSyncGoalFromSettings();
}
