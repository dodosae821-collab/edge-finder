// ============================================================
// storage.js — 저장 경계(Storage Boundary) 레이어
// ============================================================
// 목적:
//   - localStorage 키 이름을 단일 장소에서 관리
//   - 모든 읽기/쓰기를 이 레이어를 통해서만 수행
//   - side effect(GDrive sync 등) 추적을 hook으로 선언화
//
// 사용:
//   Storage.getJSON(KEYS.PLANS, [])
//   Storage.setJSON(KEYS.SETTINGS, obj)
//   Storage.addWriteHook((key, value) => { ... })  // observer-only
//
// 주의:
//   - hook은 observer 전용. 값 수정·저장 차단 불가.
//   - KEYS는 freeze 처리. 런타임 수정 시 TypeError 발생.
// ============================================================

'use strict';

// ── 키 상수 ─────────────────────────────────────────────────
window.KEYS = Object.freeze({
  // 베팅 코어
  BETS:                  'edge_bets',

  // 설정
  SETTINGS:              'edge_settings',

  // 플랜 / 일지
  PLANS:                 'edge_plans',
  DIARIES:               'edge_diaries',
  ROUND_REVIEWS:         'edge_round_reviews',
  PRINCIPLES:            'edge_principles',

  // 시뮬레이터
  SIM_STATE:             'edge_sim_state',
  SIM_GOAL:              'edge_sim_goal',
  SIM_PENDING:           'edge_sim_pending',
  SIM_FORM_DRAFT:        'edge_sim_form_draft',
  KBO_SNAPSHOT:          'edge_kbo_snapshot',

  // 라운드
  ROUNDS:                'edge_rounds',
  CURRENT_ROUND:         'edge_current_round',
  ROUND_HISTORY:         'edge_round_history',
  ROUND_SEED:            'edge_round_seed',

  // 기타
  TEMPLATES:             'edge_templates',
  VAULT:                 'edge_vault',
  FIB_BASE:              'edge_fib_base',
  SCOPE:                 'edge_scope',
  CURRENT_PROJECT:       'edge_current_project',

  // 생활비 지갑
  WALLET:                'edge_wallet',

  // 복구
  PRE_RESTORE:           'edge_bets_pre_restore',
  PRE_RESTORE_TS:        'edge_bets_pre_restore_ts',
  RESTORE_LOG:           'edge_restore_log',

  // OCR
  OCR_ALIAS_MAP:         'ocr_alias_map',
  OCR_TEAM_HISTORY:      'ocr_team_history',
});

// ── Storage 객체 ─────────────────────────────────────────────
window.Storage = (function () {
  const _hooks = [];
  let _runningHooks = false;

  // hook 실행 — observer-only, 재진입 차단, 개별 예외가 저장을 깨지 않음
  function _runHooks(key, value) {
    if (_runningHooks) return;
    _runningHooks = true;
    try {
      for (const fn of _hooks) {
        try { fn(key, value); }
        catch (e) { console.warn('[Storage] hook error:', key, e); }
      }
    } finally {
      _runningHooks = false;
    }
  }

  return {
    // ── 기본 get/set/remove ───────────────────────────────
    get(key) {
      return localStorage.getItem(key);
    },

    set(key, value) {
      try {
        localStorage.setItem(key, value);
        _runHooks(key, value);
        return true;
      } catch (e) {
        console.warn('[Storage.set]', key, e);
        return false;
      }
    },

    remove(key) {
      try {
        localStorage.removeItem(key);
        _runHooks(key, undefined);
        return true;
      } catch (e) {
        console.warn('[Storage.remove]', key, e);
        return false;
      }
    },

    // ── JSON 전용 ─────────────────────────────────────────
    getJSON(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        console.warn('[Storage.getJSON] parse error:', key, e);
        return fallback;
      }
    },

    // setJSON: stringify 후 저장 → hook 실행 → boolean 반환
    setJSON(key, value) {
      try {
        const raw = JSON.stringify(value);
        localStorage.setItem(key, raw);
        _runHooks(key, value);
        return true;
      } catch (e) {
        console.warn('[Storage.setJSON]', key, e);
        return false;
      }
    },

    // ── hook 등록 (observer-only) ─────────────────────────
    // fn(key: string, value: any) => void
    // value는 JSON.stringify 이전의 원본값. undefined = remove.
    addWriteHook(fn) {
      if (typeof fn !== 'function') {
        console.warn('[Storage.addWriteHook] fn must be a function');
        return;
      }
      _hooks.push(fn);
    },

    // ── 내부 상태 (디버깅용) ──────────────────────────────
    _hooksCount() { return _hooks.length; },
  };
}());
