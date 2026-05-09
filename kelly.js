// ============================================================
// kelly.js — Kelly 금액 계산 전용 모듈
// ============================================================
// 담당:
//   getCalibCorrFactor  — 보정계수 단계적 활성화
//   getAdaptiveMultiplier — ROI 기반 동적 배율
//   computeKellyUnit    — 최종 권장 베팅금 계산 (순수 함수)
//
// 규칙:
//   - 외부 전역(window._SS, bets, appSettings) 직접 접근 금지
//   - 모든 입력은 인자로 수신
//   - UI 로직 없음
//   - state.js 이전에 로드
// ============================================================


// ── getCalibCorrFactor ────────────────────────────────────────
// 보정계수 반환 (Calibration Layer)
//   30건 미만: 비활성 (1.0)
//   30~49건:   50% 강도 (과신만 보정, 과소추정은 cap)
//   50건+:     100% 적용
function getCalibCorrFactor(corrFactor, resolvedCount) {
  if (resolvedCount < 30 || corrFactor == null) return 1.0;
  const cf = Math.min(corrFactor, 1.0); // 과소추정(>1)은 보정 안 함
  if (resolvedCount < 50) return 1.0 + (cf - 1.0) * 0.5;
  return cf;
}


// ── getAdaptiveMultiplier ─────────────────────────────────────
// 최근 30건 ROI 기반으로 켈리 배율을 동적 조정.
// ROI 극단값은 호출 전 ±20 클램프 적용할 것.
// 샘플 부족(10건 미만) 시 중립값 1.0 반환.
function getAdaptiveMultiplier(roi, sampleSize) {
  if (sampleSize < 10) return 1.0;

  if (roi >= 10)  return 1.2;   // 고성과 — 소폭 공격
  if (roi >= 5)   return 1.1;   // 양호
  if (roi >= 0)   return 1.0;   // 중립
  if (roi >= -5)  return 0.9;   // 경미한 부진
  if (roi >= -10) return 0.75;  // 부진
  return 0.6;                   // 심각한 부진
}


// ── computeKellyUnit ─────────────────────────────────────────
// 최종 권장 베팅금 계산 (순수 함수 — 외부 상태 참조 없음)
//
// @param {object} params
//   seed            {number}  회차 시드 (0이면 비활성)
//   bankroll        {number}  현재 뱅크롤
//   maxBetPct       {number}  최대 베팅 비율 (%) — 기본 5
//   gradeAdj        {number}  예측력 등급 배율 (grade.mult)
//   kellyGradeAdj   {boolean} 등급 보정 설정 ON/OFF
//   decisionFactor  {number}  Decision Gate kellyFactor (0~1)
//   allResolvedBets {Array}   WIN/LOSE 확정 베팅 전체 배열
//   prevMultiplier  {number}  이전 세션 multiplier (히스테리시스용, 호출자 주입)
//
// @returns {object}
//   { kellyUnit, maxUnit, baseKelly, adaptiveMultiplier,
//     safeGradeAdj, rec30roi, nextMultiplier }
function computeKellyUnit({
  seed,
  bankroll,
  maxBetPct,
  gradeAdj,
  kellyGradeAdj,
  decisionFactor,
  allResolvedBets,
  prevMultiplier,
}) {
  const MIN_BET = 1000;

  // ── max cap ───────────────────────────────────────────────
  // bankroll 미설정 시 Infinity 제거 → 0으로 강제
  const maxUnit = bankroll > 0
    ? Math.floor(bankroll * (maxBetPct || 5) / 100)
    : 0;

  // ── grade 배율 (soft cap 1.2 — 설정 OFF 포함 폭주 방지) ──
  const safeGradeAdj = Math.min(kellyGradeAdj ? (gradeAdj || 1.0) : 1.0, 1.2);

  // ── baseKelly ─────────────────────────────────────────────
  // 순수 기준값 (gradeAdj 이중 적용 제거)
  const baseKelly = seed > 0 ? Math.floor(seed / 12) : 0;

  // ── Adaptive Multiplier Block ─────────────────────────────
  // PENDING / VOID 제외 — WIN·LOSE 확정 결과만 사용 (호출자가 필터링해서 넘김)
  const bets = allResolvedBets || [];

  const _getTime = (b) => new Date(b.savedAt || b.date || 0).getTime();
  const recent = [...bets]
    .sort((a, b) => _getTime(b) - _getTime(a))
    .slice(0, 30);

  const totalAmt = recent.reduce((s, b) => s + (b.amount || 0), 0);
  const rec30roi = totalAmt > 0
    ? recent.reduce((s, b) => s + (b.profit || 0), 0) / totalAmt * 100
    : 0;

  // 극단값 방어 ±20 클램프
  const rec30roiClamped = Math.max(-20, Math.min(20, rec30roi));

  // ── Adaptive Multiplier 파이프라인 ───────────────────────
  // 순서 고정 필수: 기본 → 손실 방어 → clamp → 히스테리시스 → 최종 clamp

  // 1) 기본
  let adaptiveMultiplier = getAdaptiveMultiplier(rec30roiClamped, recent.length);

  // 2) 손실 방어 — 최근 10건 중 손실 7건 이상이면 강제 축소
  const recent10 = recent.slice(0, 10);
  const recentLossCount = recent10.filter(b => b.profit < 0).length;
  if (recentLossCount >= 7) {
    adaptiveMultiplier *= 0.7;
  }

  // 3) clamp (0.5 ~ 1.2)
  adaptiveMultiplier = Math.max(0.5, Math.min(1.2, adaptiveMultiplier));

  // 4) 히스테리시스 — 최종 결과에만 적용 (손실 방어가 묻히지 않도록)
  //    주입된 prevMultiplier 방어: NaN / Infinity / undefined → 1.0 폴백
  const safePrev = Number.isFinite(prevMultiplier) ? prevMultiplier : 1.0;
  //    샘플 5건 미만이면 스킵 (초반 고정 현상 방지)
  if (recent.length >= 5 && Math.abs(adaptiveMultiplier - safePrev) < 0.05) {
    adaptiveMultiplier = safePrev;
  }

  // 5) 최종 clamp — 히스테리시스 이후 범위 보장
  adaptiveMultiplier = Math.max(0.5, Math.min(1.2, adaptiveMultiplier));

  // nextMultiplier: 호출자가 상태에 저장, 다음 호출 시 prevMultiplier로 주입
  const nextMultiplier = adaptiveMultiplier;

  // ── Kelly v2 계산 블록 ────────────────────────────────────
  // 구조: raw(float) → floor → MIN_BET(조건부) → maxUnit(상한)
  // gradeAdj 이중 적용 제거 / MIN_BET 부풀림 방지 / bankroll=0 방어
  let kellyUnit = 0;

  if (seed > 0 && maxUnit > 0) {
    // 1. raw 계산 (float 유지 — 조건 판단 기준)
    const rawFloat =
      baseKelly *
      safeGradeAdj *
      adaptiveMultiplier *
      (decisionFactor ?? 1.0);
    const raw = rawFloat;

    // 2. floor 적용
    kellyUnit = Math.floor(rawFloat);

    // 3. MIN_BET 조건부 적용
    //    raw < MIN_BET = 리스크 상황 → 강제 하한 적용 안 함 (부풀림 방지)
    const allow = decisionFactor > 0;
    if (allow && raw >= MIN_BET) {
      kellyUnit = Math.max(MIN_BET, kellyUnit);
    }

    // 4. 상한 적용
    kellyUnit = Math.min(maxUnit, kellyUnit);
  }

  // 5. bankroll 미설정 방어
  if (maxUnit === 0) kellyUnit = 0;

  return {
    kellyUnit,
    maxUnit,
    baseKelly,
    adaptiveMultiplier,
    safeGradeAdj,
    rec30roi,
    nextMultiplier,
  };
}


// ── [MIGRATION] App.kelly namespace 등록 ─────────────────────
// 현재 전역 함수(getCalibCorrFactor() 등 직접 호출)는 그대로 동작함.
// 목표: 호출 경로를 window.App.kelly.* 로 점진 이전.
// 전역 선언 제거는 별도 PR에서 진행. (이 단계는 migration path 생성)
if (typeof window !== 'undefined') {
  // flat 전역 등록 — 하위 호환 유지 (테스트 및 기존 직접 호출 경로)
  // @deprecated: window.App.kelly.* 경로로 이전 예정
  window.getCalibCorrFactor    = getCalibCorrFactor;
  window.getAdaptiveMultiplier = getAdaptiveMultiplier;
  window.computeKellyUnit      = computeKellyUnit;

  if (!window.App) window.App = {};
  if (!window.App.kelly) window.App.kelly = {};

  window.App.kelly = {
    computeKellyUnit,
    getAdaptiveMultiplier,
    getCalibCorrFactor,
  };

  // 하위 호환 — 기존 window.App.computeKellyUnit() 직접 호출 경로 유지
  // @deprecated: window.App.kelly.* 경로로 이전 예정
  window.App.computeKellyUnit     = computeKellyUnit;
  window.App.getAdaptiveMultiplier = getAdaptiveMultiplier;
  window.App.getCalibCorrFactor   = getCalibCorrFactor;

  if (window.App.debug) {
    console.debug('[bootstrap] App.kelly attached', Object.keys(window.App.kelly));
  }
}
