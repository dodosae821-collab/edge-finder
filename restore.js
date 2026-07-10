// ============================================================
// data/restore.js
// 담당: 백업 데이터 불러오기 / 롤백
//
// 의존 (전역 — 허용):
//   getBets(), saveBets() (state.js)
//   migrateBets (전역)
//   restoreSettings, getSettings, loadSettingsDisplay (전역)
//   recomputeAllStats, updateAll (전역)
// ============================================================

// ── migrateBets — 형태 보정 (createdAt 보정, result 기본값 세팅) ──────────
// validateBet 전에 반드시 먼저 실행할 것
function migrateBets(bets) {
  return (bets || []).map(b => {
    const normalized = { ...b };

    // createdAt 보정
    if (!normalized.createdAt) normalized.createdAt = Date.now();

    // result 정규화: 공백 제거 → 대소문자 통일 → 빈 값은 null
    const result = String(normalized.result ?? '').trim().toUpperCase();
    normalized.result = result || null;

    return normalized;
  });
}

// ── validateBet — 유효성 검증 (migrate 이후 호출할 것) ───────────────────
// 반환값: true = 유효, false = 제외
const VALID_RESULTS = new Set(['WIN', 'LOSE', 'PENDING', null]);

function validateBet(b) {
  // amount: 콤마 제거 후 유한수 + 양수 ("10,000" 형태 커버)
  const amount = Number(String(b.amount).replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return false;

  // betmanOdds: 유한수 (NaN/Infinity 차단)
  const odds = Number(b.betmanOdds);
  if (!Number.isFinite(odds)) return false;

  // result: migrateBets에서 정규화된 값 기준으로 판단만 (변환 없음)
  if (!VALID_RESULTS.has(b.result)) return false;

  // date: 존재하면 문자열이어야 함
  if (b.date !== undefined && b.date !== null && typeof b.date !== 'string') return false;

  // game: 존재하면 문자열이어야 함
  if (b.game !== undefined && b.game !== null && typeof b.game !== 'string') return false;

  return true;
}

function normalizeDate(d) {
  if (!d) return '';
  return String(d)
    .replace(/[.\-\/]/g, '-')
    .replace(/\s+/g, '')
    .trim();
}


function normalizeOdds(o) {
  const num = Number(o);
  if (!Number.isFinite(num)) return '';
  return num.toFixed(2);
}

// [2] fingerprint — date/game/type/odds 기준 (amount 제외: 동일 경기 분할 베팅 허용)

function getBetFingerprint(b) {
  return [
    normalizeDate(b.date),
    b.game,
    b.type,
    normalizeOdds(b.betmanOdds)
  ].join('|');
}

// [3] pre-restore 백업 — 완전 교체/누적 모두 실행 전에 스냅샷

// 스토리지 키 단일 소스 — backup / rollback / 미래 기능 전부 이 함수 참조

function _getStorageKey() {
  return window.App?.STORAGE_KEY || window.STORAGE_KEY || 'edge_bets';
}


function backupBeforeRestore() {
  try {
    const key = _getStorageKey();
    if (typeof key !== 'string' || !key) return; // 잘못된 글로벌 상태 방어

    const current = Storage.get(key);
    if (!current) return; // 저장할 게 없으면 skip

    Storage.set(KEYS.PRE_RESTORE, current);
    Storage.set(KEYS.PRE_RESTORE_TS, Date.now());
  } catch (e) {
    console.warn('[restore] pre-backup failed', e);
  }
}

// [4] _restoreContext — 단일 스코프 상태, 즉시 소멸 패턴

let _restoreContext = null;


function openRestoreModal(data) {
  _restoreContext = { data };
  const modal = document.getElementById('restore-modal');
  if (!modal) { console.warn('[restore] modal not found'); return; }

  // 파일 정보 표시
  const existingCount = getBets().length;
  const infoEl = document.getElementById('restore-modal-info');
  if (infoEl) {
    infoEl.innerHTML =
      `불러올 기록: <strong style="color:var(--accent);">${data.bets.length}개</strong>` +
      (existingCount > 0
        ? ` &nbsp;/&nbsp; 현재 기록: <strong style="color:var(--text2);">${existingCount}개</strong>`
        : ' &nbsp;(현재 기록 없음)');
  }
  modal.style.display = 'flex';
}


function closeRestoreModal() {
  const modal = document.getElementById('restore-modal');
  if (modal) modal.style.display = 'none';
  _restoreContext = null; // 즉시 소멸
}


function onRestoreConfirm(mode) {
  if (!_restoreContext) {
    console.warn('[restore] context missing');
    return;
  }
  const data = _restoreContext.data;
  closeRestoreModal(); // context null 처리 포함

  _executeRestore(data, mode);
}

// [5] 실제 restore 실행 — 확정된 처리 순서 준수

function _executeRestore(data, mode) {
  try {
    // Step 1: pre-restore 백업 (순서 변경 금지)
    backupBeforeRestore();

    // Step 2: schema migration
    const migrated = migrateBets(data.bets);

    // Gate 5: 필드 단위 유효성 검증 (migrate 이후 실행)
    let invalidCount = 0;
    const invalidBets = [];
    const incoming = migrated.filter(b => {
      if (validateBet(b)) return true;
      invalidCount++;
      invalidBets.push(b);
      return false;
    });

    // 과다 로그 방지: 10건 이하면 개별 출력, 초과면 요약
    if (invalidBets.length > 0) {
      if (invalidBets.length <= 10) {
        invalidBets.forEach(b => console.warn('[restore] invalid bet filtered', b));
      } else {
        console.warn(`[restore] invalid bets filtered: ${invalidBets.length}건`, invalidBets);
      }
    }

    if (incoming.length === 0) {
      showToast('유효한 베팅 데이터가 없습니다. (전체 ' + migrated.length + '건 검증 실패)', 'error');
      return;
    }

    // Step 3: fingerprint 기반 중복 제거 + restored/restoreMode 태깅 + gate 초기화
    let finalBets;
    let addedCount = 0;
    let skippedCount = 0;

    if (mode === 'merge') {
      const existing = getBets();
      const existingFingerprints = new Set(existing.map(getBetFingerprint));
      const newBets = incoming
        .filter(b => {
          if (existingFingerprints.has(getBetFingerprint(b))) { skippedCount++; return false; }
          return true;
        })
        .map(b => ({ ...b, gate: null, restored: true, restoreMode: 'merge' }));
      addedCount = newBets.length;
      finalBets = [...existing, ...newBets];
    } else {
      // replace
      finalBets = incoming.map(b => ({ ...b, gate: null, restored: true, restoreMode: 'replace' }));
      addedCount = finalBets.length;
      if (data.settings) {
        restoreSettings(data.settings);
      }
      // wallet 복원 (v6.2+ 백업). 구버전 백업엔 없으므로 있을 때만.
      if (data.wallet && typeof Storage !== 'undefined' && typeof KEYS !== 'undefined') {
        Storage.setJSON(KEYS.WALLET, data.wallet);
      }
      // KBO 약화 카운터(L-39 규율 기억) 복원 — 있을 때만
      if (data.kboRevalLog && typeof Storage !== 'undefined' && typeof KEYS !== 'undefined') {
        Storage.setJSON(KEYS.KBO_REVAL_LOG, data.kboRevalLog);
      }
      if (typeof loadSettingsDisplay === 'function') loadSettingsDisplay();
    }

    // Step 4: saveBets
    saveBets(finalBets, { refresh: false });

    // Step 5: 재계산 (recomputeAllStats 우선, 없으면 updateAll)
    if (typeof recomputeAllStats === 'function') {
      recomputeAllStats();
    } else if (typeof updateAll === 'function') {
      updateAll();
    }

    // Step 6: 로그 기록
    const total = getBets().length;
    appendRestoreLog({ ts: Date.now(), mode, added: addedCount, skipped: skippedCount, invalid: invalidCount, totalAfter: total });

    // Step 7: 최근 추가 항목 2~3개 수집 (merge: 새로 추가된 것 / replace: 전체 앞 3개)
    const previewBets = (mode === 'merge' ? finalBets.filter(b => b.restoreMode === 'merge') : finalBets)
      .slice(0, 3);

    // Step 8: 결과 모달 표시 (alert 사용 안 함)
    showRestoreResultModal({ mode, added: addedCount, skipped: skippedCount, invalid: invalidCount, total, recentBets: previewBets });

  } catch (err) {
    console.error('[restore] 실패:', err);
  }
}

// ── 결과 모달 & 롤백 시스템 ──────────────────────────────────────


const RESTORE_UNDO_LIMIT_MS = 180000; // 3분


function clearBackup() {
  Storage.remove(KEYS.PRE_RESTORE);
  Storage.remove(KEYS.PRE_RESTORE_TS);
}

// restore 로그 — 최근 20건 유지

function appendRestoreLog(entry) {
  try {
    const log = Storage.getJSON(KEYS.RESTORE_LOG, []);
    log.push(entry);
    if (log.length > 20) log.splice(0, log.length - 20);
    Storage.setJSON(KEYS.RESTORE_LOG, log);
  } catch (e) {
    console.warn('[restore] log write failed', e);
  }
}

// 결과 모달 — result / rollback / expired 세 상태 처리

function showRestoreResultModal(cfg) {
  const modal = document.getElementById('restore-result-modal');
  const body  = document.getElementById('restore-result-body');
  if (!modal || !body) return;

  if (cfg.mode === 'rollback') {
    body.innerHTML = `
      <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:12px;">↩️ 롤백 완료</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:8px;line-height:2;">
        이전 상태로 복원되었습니다.<br>
        총 <strong style="color:var(--text);">${cfg.total.toLocaleString()}건</strong>
      </div>
      <div style="display:flex;">
        <button onclick="closeRestoreResultModal()"
          style="flex:1;padding:10px;border-radius:6px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);font-size:13px;font-weight:700;cursor:pointer;">
          확인
        </button>
      </div>`;

  } else if (cfg.mode === 'expired') {
    // 버튼 없음 — 되돌리기 버튼 렌더 자체를 안 함 (클릭 후 막는 것보다 깔끔)
    body.innerHTML = `
      <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:12px;">⏱ 롤백 시간 만료</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:8px;line-height:1.8;">
        되돌리기는 불러오기 후 3분 이내에만 가능합니다.
      </div>
      <div style="display:flex;">
        <button onclick="closeRestoreResultModal()" disabled
          style="flex:1;padding:10px;border-radius:6px;border:1px solid var(--border);background:var(--bg3);color:var(--text3);font-size:13px;font-weight:700;cursor:not-allowed;opacity:0.5;">
          되돌리기 불가 (시간 초과)
        </button>
      </div>`;

  } else {
    // result 상태 (merge / replace)
    const isMerge = cfg.mode === 'merge';
    const skippedRow = isMerge
      ? `<div style="display:flex;justify-content:space-between;">
           <span style="color:var(--text3);">중복 제외</span>
           <span style="color:var(--text2);">${cfg.skipped.toLocaleString()}건</span>
         </div>`
      : '';

    const invalidRow = (cfg.invalid > 0)
      ? `<div style="display:flex;justify-content:space-between;">
           <span style="color:var(--text3);">검증 제외</span>
           <span style="color:#ef5350;">${cfg.invalid.toLocaleString()}건</span>
         </div>`
      : '';

    // 최근 추가 항목 미리보기 (최대 3개)
    const recentBets = cfg.recentBets || [];
    const recentHtml = recentBets.length > 0
      ? `<div style="margin-top:10px;padding:8px 10px;background:var(--bg2);border-radius:6px;">
           <div style="font-size:9px;color:var(--text3);letter-spacing:1px;margin-bottom:6px;">최근 추가</div>
           ${recentBets.map(b => {
             const odds = b.betmanOdds ? ` (${Number(b.betmanOdds).toFixed(2)})` : '';
             const game = (b.game || '—').length > 20 ? (b.game || '—').slice(0, 20) + '…' : (b.game || '—');
             return `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid var(--border);font-size:11px;">
               <span style="color:var(--text2);">${game}</span>
               <span style="color:var(--text3);white-space:nowrap;margin-left:8px;">${b.date || ''}${odds}</span>
             </div>`;
           }).join('')}
         </div>`
      : '';

    body.innerHTML = `
      <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:12px;">✅ 불러오기 완료</div>
      <div style="font-size:12px;margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:8px;line-height:2.2;">
        <div style="display:flex;justify-content:space-between;">
          <span style="color:var(--text3);">${isMerge ? '추가' : '교체'}</span>
          <strong style="color:var(--accent);">${cfg.added.toLocaleString()}건</strong>
        </div>
        ${skippedRow}
        ${invalidRow}
        <div style="border-top:1px solid var(--border);margin-top:4px;padding-top:6px;display:flex;justify-content:space-between;">
          <span style="color:var(--text3);">총</span>
          <strong style="color:var(--text);">${cfg.total.toLocaleString()}건</strong>
        </div>
        ${recentHtml}
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="closeRestoreResultModal()"
          style="flex:1;padding:10px;border-radius:6px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);font-size:13px;font-weight:700;cursor:pointer;">
          확인
        </button>
        <button onclick="restoreFromBackup()"
          style="flex:1;padding:10px;border-radius:6px;border:1px solid rgba(255,152,0,0.4);background:rgba(255,152,0,0.12);color:#ff9800;font-size:13px;font-weight:700;cursor:pointer;">
          ↩️ 되돌리기 (3분 이내)
        </button>
      </div>`;
  }
  modal.style.display = 'flex';
}


function closeRestoreResultModal() {
  const modal = document.getElementById('restore-result-modal');
  if (modal) modal.style.display = 'none';
}

// 롤백 실행

let _isRestoring = false;


function restoreFromBackup() {
  // 이중 실행 방지 — 더블 클릭 / 멀티 이벤트 방어
  if (_isRestoring) return;
  _isRestoring = true;

  try {
    // 시간 만료 검증
    const ts = Number(Storage.get(KEYS.PRE_RESTORE_TS) || 0);
    if (Date.now() - ts > RESTORE_UNDO_LIMIT_MS) {
      showRestoreResultModal({ mode: 'expired' });
      return;
    }

    const raw = Storage.get(KEYS.PRE_RESTORE);
    if (!raw) { console.warn('[restore] backup not found'); return; }

    const parsed = Storage.getJSON(KEYS.PRE_RESTORE, null);
    if (parsed === null) {
      console.warn('[restore] corrupted backup json');
      showToast('백업 데이터가 손상되었습니다.', 'error');
      return;
    }
    const backupBets = Array.isArray(parsed) ? parsed : (parsed?.bets ?? []);
    saveBets(backupBets, { refresh: false });

    if (typeof recomputeAllStats === 'function') {
      recomputeAllStats();
    } else if (typeof updateAll === 'function') {
      updateAll();
    }

    clearBackup();

    // rollback도 로그에 기록 — "왜 숫자 바뀌었지?" 추적 완성
    appendRestoreLog({ ts: Date.now(), mode: 'rollback', totalAfter: backupBets.length });

    // 모달을 rollback 완료 상태로 전환
    showRestoreResultModal({ mode: 'rollback', total: backupBets.length });

  } catch (err) {
    console.error('[restore] rollback 실패:', err);
  } finally {
    _isRestoring = false; // 성공/실패 모두 플래그 해제
  }
}

// [6] 파일 입력 진입점 — 파싱 후 모달 열기

function restoreData(e) {
  const file = e.target.files[0];
  if (!file) return;
  // input 초기화 (같은 파일 재선택 허용)
  e.target.value = '';
  const reader = new FileReader();
  reader.onload = (ev) => {
    // Gate 1: JSON parse
    let data;
    try {
      data = JSON.parse(ev.target.result);
    } catch (e) {
      showToast('파일이 손상되었거나 JSON 형식이 아닙니다.', 'error');
      return;
    }

    // Gate 2: object 타입 검증 (JSON.parse는 "123" 같은 원시값도 통과시킴)
    if (typeof data !== 'object' || data === null) {
      showToast('파일 구조가 올바르지 않습니다.', 'error');
      return;
    }

    // Gate 3: bets 배열 구조 검증
    if (!Array.isArray(data.bets)) {
      showToast('파일 구조가 올바르지 않습니다.', 'error');
      return;
    }

    // Gate 4: 빈 데이터 차단
    if (data.bets.length === 0) {
      showToast('불러올 데이터가 없습니다.', 'error');
      return;
    }

    openRestoreModal(data);
  };
  reader.readAsText(file);
}




// ── backupData ───────────────────────────────────────────────
// JSON 백업 내보내기 — data 레이어 (localStorage/bets 접근)
function backupData() {
  // wallet(인출 내역) 포함 — 미포함 시 복원 후 누적자산이 어긋남
  const _wallet = (typeof Storage !== 'undefined' && typeof KEYS !== 'undefined')
    ? Storage.getJSON(KEYS.WALLET, null) : null;
  const _kboReval = (typeof Storage !== 'undefined' && typeof KEYS !== 'undefined')
    ? Storage.getJSON(KEYS.KBO_REVAL_LOG, null) : null;   // L-39 약화 카운터 — 규율 기억 보존
  const data = { bets, settings: getSettings(), wallet: _wallet, kboRevalLog: _kboReval, exportedAt: new Date().toISOString(), version: '6.2' };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `edge_finder_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
