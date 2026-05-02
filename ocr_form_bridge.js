// ============================================================
// ocr_form_bridge.js — 📸 카메라 → 베팅 입력창 직접 연결 브릿지
// ============================================================
// 의존: ocr_import.js (parseOcrLines, preprocessImage, loadScript)
//       bet_record.js (setBetMode, renderFolderRows, calcMultiEV,
//                      makeFolderRow, selectFolderCount)
// 로드 순서: ocr_import.js → ocr_form_bridge.js
// ============================================================

// ── 상수 ──────────────────────────────────────────────────────
const BRIDGE_VERSION = '2.0.0';  // 2.0.0: raw 우선 정책 + 히스토리 자동완성 도입

// OCR 처리 후 폼에 표시할 토스트 지속시간 (ms)
const BRIDGE_TOAST_DURATION = 3500;

// ── UI 에러 표시 (alert 대신 상단 배너) ─────────────────────
function showBridgeError(msg) {
  let banner = document.getElementById('ocr-bridge-error-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'ocr-bridge-error-banner';
    banner.style.cssText = `
      position:fixed;top:0;left:0;right:0;z-index:99999;
      background:rgba(255,59,92,0.95);color:#fff;
      padding:10px 16px;font-size:13px;font-weight:700;
      display:flex;align-items:center;justify-content:space-between;
      box-shadow:0 2px 12px rgba(255,59,92,0.5);
      transform:translateY(-100%);transition:transform 0.25s ease;
    `;
    document.body.appendChild(banner);
  }
  banner.innerHTML = `
    <span>⚠️ ${msg}</span>
    <button onclick="document.getElementById('ocr-bridge-error-banner').style.transform='translateY(-100%)'"
      style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;line-height:1;">✕</button>
  `;
  requestAnimationFrame(() => {
    banner.style.transform = 'translateY(0)';
  });
  setTimeout(() => {
    if (banner) banner.style.transform = 'translateY(-100%)';
  }, 5000);
}

// ── 성공 토스트 ────────────────────────────────────────────────
function showBridgeToast(msg, color = 'var(--green)') {
  let toast = document.getElementById('ocr-bridge-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ocr-bridge-toast';
    toast.style.cssText = `
      position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(20px);
      z-index:99999;padding:10px 18px;border-radius:24px;
      font-size:13px;font-weight:700;
      box-shadow:0 4px 20px rgba(0,0,0,0.4);
      opacity:0;transition:all 0.25s ease;pointer-events:none;
    `;
    document.body.appendChild(toast);
  }
  toast.style.background = color;
  toast.style.color = color === 'var(--green)' ? '#000' : '#fff';
  toast.textContent = msg;
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
  }, BRIDGE_TOAST_DURATION);
}

// ── 로딩 오버레이 ─────────────────────────────────────────────
function showBridgeLoading(msg = 'OCR 처리 중...') {
  let overlay = document.getElementById('ocr-bridge-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ocr-bridge-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:99990;
      background:rgba(5,8,16,0.85);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      gap:16px;backdrop-filter:blur(4px);
    `;
    overlay.innerHTML = `
      <div style="position:relative;width:60px;height:60px;">
        <svg viewBox="0 0 60 60" style="width:60px;height:60px;animation:ocr-spin 1.2s linear infinite;">
          <circle cx="30" cy="30" r="26" fill="none" stroke="var(--bg3)" stroke-width="4"/>
          <circle cx="30" cy="30" r="26" fill="none" stroke="var(--accent)" stroke-width="4"
            stroke-dasharray="60 104" stroke-linecap="round"/>
        </svg>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:22px;">📸</div>
      </div>
      <div id="ocr-bridge-overlay-msg" style="font-size:13px;font-weight:700;color:var(--text2);letter-spacing:0.5px;"></div>
      <div id="ocr-bridge-overlay-sub" style="font-size:11px;color:var(--text3);"></div>
    `;
    // 스핀 키프레임
    const style = document.createElement('style');
    style.textContent = `@keyframes ocr-spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
  const msgEl = document.getElementById('ocr-bridge-overlay-msg');
  if (msgEl) msgEl.textContent = msg;
}

function updateBridgeLoading(msg, sub = '') {
  const msgEl = document.getElementById('ocr-bridge-overlay-msg');
  const subEl = document.getElementById('ocr-bridge-overlay-sub');
  if (msgEl) msgEl.textContent = msg;
  if (subEl) subEl.textContent = sub;
}

function hideBridgeLoading() {
  const overlay = document.getElementById('ocr-bridge-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ── 숨김 카메라 input 생성/재사용 ─────────────────────────────
function getCameraInput() {
  let input = document.getElementById('ocr-bridge-camera-input');
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.id = 'ocr-bridge-camera-input';
    input.accept = 'image/*';
    input.capture = 'environment';   // 후면 카메라 우선
    input.style.cssText = 'position:fixed;opacity:0;pointer-events:none;top:-9999px;';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (file) handleBridgeImageUpload(file);
      input.value = '';  // 같은 파일 재선택 허용
    });
    document.body.appendChild(input);
  }
  return input;
}

// ── 카메라 버튼 클릭 진입점 ───────────────────────────────────
function openOcrCameraInput() {
  const input = getCameraInput();
  input.capture = 'environment';
  input.click();
}

// 파일 선택(갤러리) 모드도 지원
function openOcrFileInput() {
  const input = getCameraInput();
  input.removeAttribute('capture');
  input.click();
}

// ── 이미지 업로드 핸들러 (메인 파이프라인) ───────────────────
async function handleBridgeImageUpload(file) {
  if (!file) return;

  try {
    showBridgeLoading('이미지 전처리 중...');

    // ① 이미지 전처리 (ocr_import.js의 preprocessImage 재사용)
    let canvas;
    try {
      canvas = await preprocessImage(file);
    } catch (e) {
      hideBridgeLoading();
      showBridgeError('이미지 로드 실패: ' + e.message);
      return;
    }

    updateBridgeLoading('OCR 엔진 로딩...', 'Tesseract.js 초기화');

    // ② Tesseract.js 동적 로드
    if (typeof Tesseract === 'undefined') {
      try {
        await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
      } catch (e) {
        hideBridgeLoading();
        showBridgeError('OCR 엔진 로드 실패. 네트워크 확인 후 다시 시도하세요.');
        return;
      }
    }

    updateBridgeLoading('문자 인식 중...', '한글+영문 혼합 인식');

    // ③ OCR 실행
    let ocrText = '';
    let ocrConf  = 0;
    try {
      const r = await Tesseract.recognize(canvas, 'kor+eng', {
        tessedit_pageseg_mode: '11',
      });
      ocrText = r.data.text;
      ocrConf  = r.data.confidence;
    } catch {
      try {
        const r2 = await Tesseract.recognize(canvas, 'kor+eng', {
          tessedit_pageseg_mode: '4',
        });
        ocrText = r2.data.text;
        ocrConf  = r2.data.confidence;
      } catch (e2) {
        hideBridgeLoading();
        showBridgeError('OCR 인식 실패: ' + e2.message);
        return;
      }
    }

    updateBridgeLoading('파싱 중...', '팀명·배당·경기 수 분석');

    // ④ 파싱 (ocr_import.js의 parseOcrLines 재사용)
    const parsed = parseOcrLines(ocrText);

    if (!parsed || parsed.length === 0) {
      hideBridgeLoading();
      showBridgeError('인식된 경기 정보가 없습니다. 더 선명한 사진으로 다시 시도하세요.');
      return;
    }

    updateBridgeLoading('프리뷰 생성 중...');

    // ⑤ 원문 경기번호 라인 수 (누락 검증용)
    const rawGameCount = _countRawGameLines(ocrText);
    console.log(`[OCR Bridge] 원문 경기라인: ${rawGameCount}개 / 파싱결과: ${parsed.length}개`);

    // ⑥ preview 패널 렌더링 — 폼 직접 주입 ❌
    renderOcrPreviewRows(parsed, rawGameCount);
    hideBridgeLoading();

    // 베팅 입력 탭으로 이동
    if (typeof switchTab === 'function') {
      const recordTab = document.querySelector('.tab[onclick*="record"]');
      switchTab('record', recordTab);
    }

    showBridgeToast(
      `📸 ${parsed.length}개 경기 인식 완료 — 확인 후 등록`,
      'rgba(0,229,255,0.92)'
    );

  } catch (err) {
    hideBridgeLoading();
    console.error('[OCR Bridge]', err);
    showBridgeError('오류 발생: ' + err.message);
  }
}

// ── 핵심 함수: OCR 결과 → 베팅 입력 폼 주입 ─────────────────
/**
 * 베팅 복원 함수 — OCR 수집과 폼 주입을 분리하여 데이터 오염을 방지합니다.
 *
 * [단계 구조]
 *  1차 필터(isUsableRow): 빈 줄·헤더 잔재 노이즈 제거 → OCR 결과 전체 보존
 *  2차 필터(hasBothTeams): 양쪽 팀명이 모두 있는 행만 폼에 주입
 *  미통과 행: OCR 결과에는 유지, "팀명 인식 불완전" 경고 패널로 분리 표시
 *
 * @param {Array}  parsedRows    - parseOcrLines() 반환값 (전체)
 * @param {number} rawGameCount  - OCR 원문에서 센 경기번호 라인 수 (누락 검증용)
 * @returns {{ filledCount: number, failedCount: number, incompleteCount: number }}
 */
function applyOcrToForm(parsedRows, rawGameCount = null) {
  if (!parsedRows || parsedRows.length === 0) {
    return { filledCount: 0, failedCount: 0, incompleteCount: 0 };
  }

  // ── [1] 1차 필터: 노이즈 제거 (빈 줄·헤더 잔재 제거용) ──────
  // isSingleOk 등 선택 여부 기반 필터링은 절대 수행하지 않습니다.
  function isUsableRow(r) {
    return (
      r.gameNum ||
      (r.normHome?.team && r.normAway?.team) ||
      r.odds
    );
  }

  // ── [2] 2차 필터: 폼 주입 기준 ─────────────────────────────────────────────
  // 정책 변경 (v2.0): 팀명은 raw 그대로 사용하므로 rawHome/rawAway 존재 여부로 판정.
  // 배당(odds)만 있는 행도 "배당만 추가" 경로로 허용.
  // → parse 실패 기준: 배당 없음 AND 경기번호 없음 AND 팀명 없음 (이것만 제외)
  function hasBothTeams(r) {
    const home = r.rawHome || r.normHome?.team || '';
    const away = r.rawAway || r.normAway?.team || '';
    return !!(home && away);
  }

  const noiseCount = parsedRows.filter(r => !isUsableRow(r)).length;
  if (noiseCount > 0) {
    console.warn(`[OCR Bridge] 노이즈 행 ${noiseCount}개 제거 (빈 줄·헤더 잔재)`);
  }

  // OCR 수집 결과 전체 (1차 통과)
  const toNum = v => parseInt(v, 10) || 9999;
  const usableRows = parsedRows
    .filter(isUsableRow)
    .sort((a, b) => toNum(a.gameNum) - toNum(b.gameNum));

  if (usableRows.length === 0) {
    return { filledCount: 0, failedCount: parsedRows.length, incompleteCount: 0 };
  }

  // 폼 주입 대상 (2차 통과 — 양쪽 팀명 완전한 행)
  const formRows = usableRows.filter(hasBothTeams);

  // 팀명 불완전 행 (1차 통과했지만 2차 미통과 — OCR 결과에는 유지)
  const incompleteRows = usableRows.filter(r => !hasBothTeams(r));

  if (incompleteRows.length > 0) {
    console.warn(`[OCR Bridge] 팀명 인식 불완전 ${incompleteRows.length}개 → 폼 제외, 경고 표시`);
    _showIncompleteTeamWarning(incompleteRows);
  }

  // ── [3] 경기 수 누락 검증 — 2차 통과 기준으로 비교 ────────────
  // rawGameCount 기준 비교는 formRows 기준으로 수행합니다.
  if (rawGameCount !== null) {
    const diff = Math.abs(rawGameCount - formRows.length);
    if (diff >= 2) {
      _showCountMismatchWarning(formRows.length, rawGameCount);
    } else if (diff === 1) {
      console.info(`[OCR Bridge] 경기 수 1개 차이 (원문 ${rawGameCount} / 폼주입 ${formRows.length}) — 허용 범위`);
    }
  }

  // ── [4] confidence 구간별 경고 표시 (폼 주입 대상 기준) ───────
  _markLowConfRows(formRows);

  if (formRows.length === 0) {
    // 모든 행이 팀명 불완전 → 폼 주입 없음
    return { filledCount: 0, failedCount: noiseCount, incompleteCount: incompleteRows.length };
  }

  // ── 단폴 / 다폴 분기 (2차 통과 행만 폼에 주입) ───────────────
  if (formRows.length === 1) {
    _fillSingleForm(formRows[0]);
    return { filledCount: 1, failedCount: noiseCount, incompleteCount: incompleteRows.length };
  }

  _fillMultiForm(formRows);
  return { filledCount: formRows.length, failedCount: noiseCount, incompleteCount: incompleteRows.length };
}

// ── 팀명 인식 불완전 경고 패널 ────────────────────────────────
// OCR 결과에는 남아있지만 폼에는 주입하지 않은 행을 별도 표시합니다.
//
// isCritical 승격 기준:
//   gameNum 있음 + 팀명 깨짐 → 🔴 최우선 확인 (gameNum은 100% 매칭 가능 데이터)
//   gameNum 없음             → 🟡 일반 경고
//
// canPartialInsert 기준:
//   odds 있음 + 팀명 불완전 → [배당만 추가] 버튼 제공 (append 방식, 기존 폼 state 보존)
function _showIncompleteTeamWarning(incompleteRows) {
  // ── isCritical / canPartialInsert 플래그 설정 ──────────────
  incompleteRows.forEach(r => {
    if (r.gameNum != null && (!r.normHome?.team || !r.normAway?.team)) {
      r.isCritical = true;
    }
    // odds가 있고 팀명이 하나라도 비어 있으면 배당만 추가 가능
    if (r.odds && (!r.normHome?.team || !r.normAway?.team)) {
      r.canPartialInsert = true;
    }
  });

  const hasCritical = incompleteRows.some(r => r.isCritical);

  // ── 패널 생성/재사용 ────────────────────────────────────────
  let panel = document.getElementById('ocr-bridge-incomplete-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'ocr-bridge-incomplete-panel';
    panel.style.cssText = `
      margin:6px 0 4px;padding:10px 12px;border-radius:8px;
      font-size:11px;font-weight:600;line-height:1.9;
    `;
    const wrap = document.getElementById('ocr-bridge-btn-wrap');
    if (wrap && wrap.parentNode) {
      wrap.parentNode.insertBefore(panel, wrap.nextSibling);
    } else {
      document.body.prepend(panel);
    }
  }

  // 고위험 있으면 빨간, 일반 경고면 주황
  if (hasCritical) {
    panel.style.background = 'rgba(255,59,92,0.10)';
    panel.style.border     = '1px solid rgba(255,59,92,0.45)';
    panel.style.color      = '#ff5370';
  } else {
    panel.style.background = 'rgba(255,160,0,0.10)';
    panel.style.border     = '1px solid rgba(255,160,0,0.45)';
    panel.style.color      = '#ffa000';
  }

  // ── 패널 내용 렌더링 ────────────────────────────────────────
  const headerIcon = hasCritical ? '🔴' : '⚠️';
  const headerText = hasCritical
    ? '팀명 인식 불완전 — 경기번호 있음: 최우선 확인 필요'
    : '팀명 인식 불완전 — 직접 입력하거나 재촬영하세요';

  let html = `<div style="margin-bottom:6px;">${headerIcon} ${headerText}</div>`;

  incompleteRows.forEach(r => {
    const num      = r.gameNum != null ? `#${r.gameNum}` : '경기번호 없음';
    const critIcon = r.isCritical ? '🔴' : '🟡';

    // 누락 팀 구분 표시
    const homeOk = !!r.normHome?.team;
    const awayOk = !!r.normAway?.team;
    let missingDesc = '';
    if (!homeOk && !awayOk) missingDesc = '홈·원정 모두 인식 실패';
    else if (!homeOk)       missingDesc = `홈팀 인식 실패 / 원정 ${r.normAway.team}`;
    else                    missingDesc = `홈 ${r.normHome.team} / 원정팀 인식 실패`;

    const oddsDesc = r.odds ? `배당 ${r.odds.toFixed(2)}` : '배당 없음';

    // 행 컨테이너 (버튼 포함 가능하도록 flex)
    html += `
      <div style="display:flex;align-items:center;justify-content:space-between;
                  gap:8px;padding:2px 0;flex-wrap:wrap;">
        <span>${critIcon} ${num} — ${missingDesc} / ${oddsDesc}</span>
        ${r.canPartialInsert
          ? `<button
               data-ocr-partial-row-id="${r.gameNum ?? r._rowIndex ?? Math.random()}"
               style="
                 flex-shrink:0;
                 padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;
                 background:rgba(0,229,255,0.12);border:1px solid rgba(0,229,255,0.35);
                 color:var(--accent);cursor:pointer;white-space:nowrap;
               "
             >배당만 추가</button>`
          : ''}
      </div>`;
  });

  panel.innerHTML = html;
  panel.style.display = 'block';

  // ── [배당만 추가] 버튼 이벤트 바인딩 ──────────────────────
  // append 방식 — 기존 폼 state 절대 건드리지 않음
  incompleteRows.forEach(r => {
    if (!r.canPartialInsert) return;
    const rowId = r.gameNum ?? r._rowIndex ?? null;
    const btn = panel.querySelector(
      `button[data-ocr-partial-row-id="${rowId}"]`
    );
    if (!btn) return;

    btn.addEventListener('click', () => {
      appendOcrRowToMultiForm(r);
      btn.disabled = true;
      btn.textContent = '추가됨 ✓';
      btn.style.opacity = '0.5';
      btn.style.cursor = 'default';
    });
  });

  // 40초 후 자동 숨김
  setTimeout(() => { if (panel) panel.style.display = 'none'; }, 40000);
}

// ── append 전용: incomplete row → 다폴 폼에 단일 행 추가 ─────
// ⚠️ _fillMultiForm 재호출 금지 — 기존 폼 state 보존 필수
// 배당·확률 pre-fill 후 calcMultiEV 재계산 (50ms 딜레이로 DOM 안정화)
function appendOcrRowToMultiForm(row) {
  const container = document.getElementById('folder-rows');
  if (!container) {
    console.warn('[OCR Bridge] folder-rows 컨테이너 없음 — appendOcrRowToMultiForm 취소');
    return;
  }

  if (typeof makeFolderRow !== 'function') {
    console.warn('[OCR Bridge] makeFolderRow 미정의 — appendOcrRowToMultiForm 취소');
    return;
  }

  const currentRows = container.querySelectorAll('.folder-row');
  const newRow = makeFolderRow(currentRows.length);
  container.appendChild(newRow);

  // 배당
  const oddsInput = newRow.querySelector('.folder-odds');
  if (oddsInput && row.odds) {
    oddsInput.value = row.odds.toFixed(2);
    oddsInput.dispatchEvent(new Event('input'));
  }

  // 내재확률
  const probInput = newRow.querySelector('.folder-prob');
  if (probInput && row.odds && row.odds > 1) {
    const implied = Math.round((1 / row.odds) * 100 * 10) / 10;
    probInput.value = implied;
    probInput.dispatchEvent(new Event('input'));
  }

  // 메모 (팀명 불완전이지만 부분 정보라도 기재)
  const memoInput = newRow.querySelector('.folder-memo');
  if (memoInput) {
    memoInput.value = _buildGameString(row) || '(팀명 미확정)';
    const memoWrap = newRow.querySelector('.folder-memo-wrap');
    const memoBtn  = newRow.querySelector('.folder-memo-btn');
    if (memoWrap) memoWrap.style.display = 'block';
    if (memoBtn)  memoBtn.style.color = 'var(--accent)';
  }

  // EV 재계산 — _fillMultiForm 과 동일하게 50ms 딜레이
  if (typeof calcMultiEV === 'function') {
    setTimeout(calcMultiEV, 50);
  }

  console.log(`[OCR Bridge] appendOcrRowToMultiForm 완료 — 배당 ${row.odds?.toFixed(2) ?? '없음'}`);
}

// ── [1] 경기 수 불일치 경고 배너 (diff ≥ 2 일 때만 호출됨) ─────
function _showCountMismatchWarning(parsedCount, rawCount) {
  const diff = rawCount - parsedCount;
  const msg = diff > 0
    ? `⚠️ 경기 누락 의심: 원문 ${rawCount}개 감지 → 복원 ${parsedCount}개 (${diff}개 누락 가능)`
    : `⚠️ 경기 수 불일치: 원문 ${rawCount}개 감지 → 복원 ${parsedCount}개`;
  showBridgeError(msg);
  console.warn('[OCR Bridge] 경기 수 불일치', { rawCount, parsedCount, diff });
}

// ── confidence 구간별 경고 — v2.0 이후 no-op ──────────────────────────────
// v2.0 정책: normHome/normAway.confidence는 항상 1.0 (raw 그대로).
// "낮은 인식률" 경고는 더 이상 의미 없음 — 배당 없음/팀명 없음만 실질 경고.
// 기존 applyOcrToForm 호환성 유지용으로 함수 시그니처는 보존.
const BRIDGE_CONF_WARN      = 0.60;  // 하위 호환 상수
const BRIDGE_CONF_HIGH_RISK = 0.40;  // 하위 호환 상수

function _rowTeamConf(_r) { return 1.0; }  // 항상 1.0

function _markLowConfRows(_rows) {
  // v2.0: confidence 기반 경고 제거. 배당 없음 경고는 renderOcrPreviewRows에서 처리.
}


// ── 단폴 폼 채우기 ───────────────────────────────────────────
function _fillSingleForm(row) {
  // 모드 전환
  if (typeof setBetMode === 'function') setBetMode('single');

  // 경기명
  const gameStr = _buildGameString(row);
  const gameEl = document.getElementById('r-game');
  if (gameEl && gameStr) {
    gameEl.value = gameStr;
    gameEl.dispatchEvent(new Event('input'));
  }

  // 배당률
  if (row.odds) {
    const oddsEl = document.getElementById('r-betman-odds');
    if (oddsEl) {
      oddsEl.value = row.odds.toFixed(2);
      oddsEl.dispatchEvent(new Event('input'));
    }
  }

  // 예상 승률 (내재확률 역산 — 없으면 공란)
  if (row.odds && row.odds > 1) {
    const impliedProb = Math.round((1 / row.odds) * 100 * 10) / 10;
    const probEl = document.getElementById('r-myprob-direct');
    if (probEl) {
      probEl.value = impliedProb;
      probEl.dispatchEvent(new Event('input'));
      if (typeof syncMyProb === 'function') syncMyProb();
    }
  }

  // 오늘 날짜 (비어있을 때만)
  const dateEl = document.getElementById('r-date');
  if (dateEl && !dateEl.value) {
    dateEl.value = _todayKST();
  }

  // 종목 자동 감지
  _autoSetSport(row);

  // r-myprob-direct 활성화 확인
  const myprobWrap = document.getElementById('myprob-direct-wrap');
  if (myprobWrap) myprobWrap.style.display = 'block';

  if (typeof updateLossRatio === 'function') updateLossRatio();
  if (typeof updatePreview   === 'function') updatePreview();
}

// ── 다폴 폼 채우기 ───────────────────────────────────────────
function _fillMultiForm(rows) {
  const count = rows.length;

  // 모드 전환
  if (typeof setBetMode === 'function') setBetMode('multi');

  // 폴더 수 버튼 선택 (2/3/4+)
  const folderVal = count <= 3 ? String(count) : '4+';
  const targetBtn = document.querySelector(`.folder-btn[data-val="${folderVal}"]`);
  if (targetBtn && typeof selectFolderCount === 'function') {
    selectFolderCount(targetBtn);
  }

  // 필요한 만큼 폴더 행 확보
  const container = document.getElementById('folder-rows');
  if (container) {
    // selectFolderCount가 이미 초기 행을 만들었으므로 부족분만 추가
    const existingRows = container.querySelectorAll('.folder-row');
    const need = count - existingRows.length;
    if (need > 0 && typeof makeFolderRow === 'function') {
      for (let i = 0; i < need; i++) {
        const newRow = makeFolderRow(existingRows.length + i);
        container.appendChild(newRow);
      }
    }
  }

  // 각 폴더 행에 데이터 주입
  const allRows = container ? container.querySelectorAll('.folder-row') : [];
  let filledFolders = 0;

  rows.forEach((ocrRow, i) => {
    const domRow = allRows[i];
    if (!domRow) return;

    // 배당
    const oddsInput = domRow.querySelector('.folder-odds');
    if (oddsInput && ocrRow.odds) {
      oddsInput.value = ocrRow.odds.toFixed(2);
      oddsInput.dispatchEvent(new Event('input'));
    }

    // 내재확률을 폴더 승률로 pre-fill
    const probInput = domRow.querySelector('.folder-prob');
    if (probInput && ocrRow.odds && ocrRow.odds > 1) {
      const impliedProb = Math.round((1 / ocrRow.odds) * 100 * 10) / 10;
      probInput.value = impliedProb;
      probInput.dispatchEvent(new Event('input'));
    }

    // 폴더 경기명 (메모 필드가 있으면 거기에도)
    const gameStr = _buildGameString(ocrRow);
    // 폴더 경기명 메모 — .folder-memo (bet_record.js 기준 클래스명)
    const memoInput = domRow.querySelector('.folder-memo');
    if (memoInput && gameStr) {
      memoInput.value = gameStr;
      const memoWrap = domRow.querySelector('.folder-memo-wrap');
      const memoBtn  = domRow.querySelector('.folder-memo-btn');
      if (memoWrap && gameStr) {
        memoWrap.style.display = 'block';
        if (memoBtn) memoBtn.style.color = 'var(--accent)';
      }
    }

    filledFolders++;
  });

  // 오늘 날짜
  const dateEl = document.getElementById('r-date');
  if (dateEl && !dateEl.value) {
    dateEl.value = _todayKST();
  }

  // 경기명 (전체 요약)
  const gameEl = document.getElementById('r-game');
  if (gameEl) {
    const gameSummary = rows.map(r => _buildGameString(r)).filter(Boolean).join(' / ');
    if (gameSummary) gameEl.value = gameSummary;
  }

  // EV 재계산
  if (typeof calcMultiEV === 'function') {
    setTimeout(calcMultiEV, 50);
  }

  // folder-count hidden 값도 동기화
  const rfcEl = document.getElementById('r-folder-count');
  if (rfcEl) rfcEl.value = folderVal;
}

// ── 유틸: 원문 OCR 텍스트에서 경기번호 라인 수 계산 ──────────
// 프로토 용지 형식: 줄 앞부분이 숫자(1~99)로 시작하는 라인 = 경기 행
// 오인식 방지: 숫자만 있는 줄이 아닌, 뒤에 공백/문자가 따라오는 라인만 카운트
function _countRawGameLines(text) {
  if (!text) return 0;
  const lines = text.split('\n');
  let count = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    // "숫자 + (공백 or 한글/영문)" 패턴: 경기번호 라인
    if (/^\d{1,3}[\s\t\u00a0]+\S/.test(trimmed)) {
      count++;
    }
  }
  return count;
}

// ── 유틸: 경기 문자열 조립 ────────────────────────────────────
// v2.0 정책: rawHome/rawAway 우선. normHome은 alias 매핑된 경우만 다를 수 있음.
function _buildGameString(row) {
  // raw 우선, 없으면 normHome.team (alias 매핑된 경우)
  const home = row.rawHome || (row.normHome && row.normHome.team) || '';
  const away = row.rawAway || (row.normAway && row.normAway.team) || '';
  if (home && away) return `${home} vs ${away}`;
  if (home) return home;
  if (away) return away;
  if (row.gameNum) return `경기 #${row.gameNum}`;
  return '';
}

// ── 유틸: 종목 자동 감지 및 설정 ─────────────────────────────
const SPORT_KEYWORDS = {
  '축구': ['fc', '시티', '유나이티드', '아틀레티코', '레알', '바르샤', '뮌헨', '전북', '서울', '울산', '포항', '인천', '제주', '대전', '광주', '성남', '수원'],
  '야구': ['이글스', '자이언츠', '타이거즈', '베어스', '라이온즈', '히어로즈', '위즈', '랜더스', '다이노스', 'kt', 'nc', 'sk', 'lg', 'kia', 'lotte'],
  '농구': ['허재', '삼성', '현대', 'db', 'kt', '서울sk', '부산kt'],
  '배구': ['현대캐피탈', '대한항공', '삼성화재', 'ok금융그룹', 'ibk기업은행'],
};

function _autoSetSport(row) {
  const gameStr = _buildGameString(row).toLowerCase();
  if (!gameStr) return;

  let detected = null;
  outer: for (const [sport, keywords] of Object.entries(SPORT_KEYWORDS)) {
    for (const kw of keywords) {
      if (gameStr.includes(kw.toLowerCase())) {
        detected = sport;
        break outer;
      }
    }
  }

  if (!detected) return;

  // r-sport hidden input 설정
  const sportHidden = document.getElementById('r-sport');
  if (sportHidden) sportHidden.value = detected;

  // 배지 표시
  const badge = document.getElementById('sport-selected-badge');
  const badgeLabel = document.getElementById('sport-selected-label');
  if (badge) badge.style.display = 'block';
  if (badgeLabel) badgeLabel.textContent = detected;
}

// ── 유틸: 오늘 날짜 KST ───────────────────────────────────────
function _todayKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

// ── 카메라 버튼 DOM 삽입 (index.html 수정 없이 자동 삽입) ────
function injectCameraButton() {
  // 이미 삽입됐으면 스킵
  if (document.getElementById('ocr-bridge-cam-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'ocr-bridge-cam-btn';
  btn.type = 'button';
  btn.innerHTML = '📸 베팅 용지 스캔';
  btn.title = '베팅 용지 스캔 — 자동 입력';
  btn.style.cssText = `
    display:inline-flex;align-items:center;gap:6px;
    padding:8px 14px;
    background:rgba(0,229,255,0.10);
    border:1px solid rgba(0,229,255,0.35);
    border-radius:10px;
    color:var(--accent);
    font-size:12px;font-weight:700;
    cursor:pointer;
    transition:background 0.15s, transform 0.1s;
    white-space:nowrap;
    -webkit-tap-highlight-color:transparent;
  `;
  btn.onmouseover  = () => btn.style.background = 'rgba(0,229,255,0.18)';
  btn.onmouseout   = () => btn.style.background = 'rgba(0,229,255,0.10)';
  btn.onmousedown  = () => btn.style.transform = 'scale(0.96)';
  btn.onmouseup    = () => btn.style.transform = 'scale(1)';
  btn.onclick      = openOcrCameraInput;

  // 갤러리 버튼
  const galleryBtn = document.createElement('button');
  galleryBtn.id = 'ocr-bridge-gallery-btn';
  galleryBtn.type = 'button';
  galleryBtn.innerHTML = '🖼️';
  galleryBtn.title = '갤러리에서 사진 선택';
  galleryBtn.style.cssText = `
    display:inline-flex;align-items:center;justify-content:center;
    padding:8px 10px;
    background:rgba(0,229,255,0.06);
    border:1px solid rgba(0,229,255,0.20);
    border-radius:10px;
    font-size:14px;
    cursor:pointer;
    transition:background 0.15s;
    -webkit-tap-highlight-color:transparent;
  `;
  galleryBtn.onmouseover = () => galleryBtn.style.background = 'rgba(0,229,255,0.14)';
  galleryBtn.onmouseout  = () => galleryBtn.style.background = 'rgba(0,229,255,0.06)';
  galleryBtn.onclick     = openOcrFileInput;

  // 래퍼
  const wrapper = document.createElement('div');
  wrapper.id = 'ocr-bridge-btn-wrap';
  wrapper.style.cssText = `
    display:flex;align-items:center;gap:6px;
    margin-bottom:10px;
  `;
  wrapper.appendChild(btn);
  wrapper.appendChild(galleryBtn);

  // 삽입 위치: 베팅 입력 카드 form-title 아래, 날짜 필드 위
  // r-date input 의 부모 div를 기준으로 앞에 삽입
  const dateSection = document.querySelector('#r-date');
  if (dateSection && dateSection.closest('div[style]')) {
    const dateParent = dateSection.closest('div[style]');
    dateParent.parentNode.insertBefore(wrapper, dateParent);
    return;
  }

  // fallback: page-record 카드 상단
  const recordCard = document.querySelector('#page-record .card');
  if (recordCard) {
    const cardTitle = recordCard.querySelector('[id="form-title"]')?.closest('div');
    if (cardTitle && cardTitle.nextSibling) {
      recordCard.insertBefore(wrapper, cardTitle.nextSibling);
      return;
    }
    recordCard.prepend(wrapper);
    return;
  }

  // 마지막 fallback: body에 FAB으로
  const fab = document.createElement('div');
  fab.style.cssText = `
    position:fixed;bottom:80px;right:16px;z-index:9000;
    display:flex;flex-direction:column;gap:8px;align-items:flex-end;
  `;
  fab.appendChild(wrapper);
  document.body.appendChild(fab);
}

// ── 헤더 OCR 아이콘 삽입 ─────────────────────────────────────
function injectHeaderOcrIcon() {
  if (document.getElementById('ocr-bridge-header-icon')) return;

  const headerStats = document.querySelector('.header-stats');
  if (!headerStats) return;

  const divider = document.createElement('div');
  divider.className = 'divider';

  const hstat = document.createElement('div');
  hstat.className = 'hstat';
  hstat.id = 'ocr-bridge-header-icon';
  hstat.style.cursor = 'pointer';
  hstat.title = '베팅 용지 스캔 (자동 입력)';
  hstat.onclick = openOcrCameraInput;
  hstat.innerHTML = `
    <div class="hstat-val" style="font-size:18px;">📸</div>
    <div class="hstat-label">OCR</div>
  `;

  headerStats.appendChild(divider);
  headerStats.appendChild(hstat);
}

// ── 드래그앤드롭 영역 활성화 ──────────────────────────────────
function enableFormDropZone() {
  const card = document.querySelector('#page-record .card');
  if (!card) return;

  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    card.style.outline = '2px dashed var(--accent)';
    card.style.outlineOffset = '-4px';
  });
  card.addEventListener('dragleave', () => {
    card.style.outline = '';
    card.style.outlineOffset = '';
  });
  card.addEventListener('drop', (e) => {
    e.preventDefault();
    card.style.outline = '';
    card.style.outlineOffset = '';
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleBridgeImageUpload(file);
    } else {
      showBridgeError('이미지 파일만 지원합니다.');
    }
  });
}

// ── 초기화 ────────────────────────────────────────────────────
function initOcrBridge() {
  // DOM 준비 후 실행
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _doInit);
  } else {
    // DOM이 이미 준비됐지만 동적 렌더링일 수 있으므로 약간 지연
    setTimeout(_doInit, 300);
  }
}

function _doInit() {
  injectCameraButton();
  injectHeaderOcrIcon();
  enableFormDropZone();

  // switchTab이 record 탭 전환 시 버튼 재삽입 보장 (중복 래핑 방지)
  if (typeof window.switchTab === 'function' && !window.switchTab._ocrBridgePatched) {
    const _origSwitch = window.switchTab;
    window.switchTab = function(name, el) {
      _origSwitch.call(this, name, el);
      if (name === 'record') {
        setTimeout(() => {
          injectCameraButton();
          enableFormDropZone();
        }, 100);
      }
    };
    window.switchTab._ocrBridgePatched = true;
  }

  console.log(`[OCR Bridge v${BRIDGE_VERSION}] 초기화 완료`);
}

// ── 전역 노출 ─────────────────────────────────────────────────
window.openOcrCameraInput  = openOcrCameraInput;
window.openOcrFileInput    = openOcrFileInput;
window.applyOcrToForm      = applyOcrToForm;
window.handleBridgeImageUpload = handleBridgeImageUpload;

// 자동 실행
initOcrBridge();

// ============================================================
// ── PREVIEW PANEL — OCR 결과 확인 후 일괄 등록 (v1.5.0)  ────
// ============================================================
// 구조:
//   최근 베팅 기록 카드 바로 위에 프리뷰 패널 삽입
//   ├ 경기 row (체크박스 / 경기명 input / 배당 input / 상태 뱃지)
//   ├ [다폴로 묶어서 1건 저장] 토글
//   └ [선택 경기 등록] 버튼
//
// 저장 흐름:
//   단폴(기본): _fillSingleForm(row) → selectResult('PENDING') → addBet()  × N건
//   다폴 묶음:  _fillMultiForm(rows) → selectResult('PENDING') → addBet()  × 1건
// ============================================================

// ── preview 패널 컨테이너 생성/재사용 ─────────────────────────
function _getOrCreatePreviewPanel() {
  let panel = document.getElementById('ocr-preview-panel');
  if (panel) return panel;

  panel = document.createElement('div');
  panel.id = 'ocr-preview-panel';
  panel.style.cssText = `
    display:none;
    margin-bottom:12px;
    background:var(--bg2);
    border:1px solid rgba(0,229,255,0.25);
    border-radius:12px;
    overflow:hidden;
  `;

  // 헤더
  const header = document.createElement('div');
  header.style.cssText = `
    display:flex;align-items:center;justify-content:space-between;
    padding:10px 14px;
    background:rgba(0,229,255,0.07);
    border-bottom:1px solid rgba(0,229,255,0.15);
  `;
  header.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="font-size:14px;">📸</span>
      <span style="font-size:12px;font-weight:700;color:var(--accent);">OCR 프리뷰</span>
      <span id="ocr-preview-count" style="font-size:10px;color:var(--text3);"></span>
    </div>
    <button id="ocr-preview-close" type="button"
      style="background:none;border:none;color:var(--text3);font-size:16px;cursor:pointer;line-height:1;padding:2px 4px;">✕</button>
  `;
  panel.appendChild(header);

  // 경기 목록 컨테이너
  const rowsWrap = document.createElement('div');
  rowsWrap.id = 'ocr-preview-rows';
  rowsWrap.style.cssText = `padding:8px 12px;display:flex;flex-direction:column;gap:6px;`;
  panel.appendChild(rowsWrap);

  // 푸터 (다폴 토글 + 등록 버튼)
  const footer = document.createElement('div');
  footer.style.cssText = `
    padding:10px 14px;
    border-top:1px solid var(--border);
    background:var(--bg2);
    display:flex;flex-direction:column;gap:8px;
  `;
  footer.innerHTML = `
    <!-- 다폴 묶음 토글 -->
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:11px;color:var(--text3);">
      <input type="checkbox" id="ocr-multi-toggle"
        style="width:14px;height:14px;accent-color:var(--accent2);cursor:pointer;">
      <span>다폴로 묶어서 1건 저장</span>
      <span style="color:var(--text3);font-size:10px;">(체크 시 선택된 경기 전체를 조합 1건으로 등록)</span>
    </label>
    <!-- 등록 버튼 -->
    <button id="ocr-preview-submit" type="button"
      style="
        width:100%;padding:10px;border-radius:8px;border:none;
        background:var(--accent);color:#000;
        font-size:13px;font-weight:700;cursor:pointer;
        transition:opacity 0.15s;
      ">
      ✅ 선택 경기 등록
    </button>
    <div id="ocr-preview-status" style="font-size:11px;color:var(--text3);text-align:center;min-height:14px;"></div>
  `;
  panel.appendChild(footer);

  // 삽입 위치: #record-table 의 부모 카드 바로 앞
  // → "최근 베팅 기록" 카드 위
  const recordTable = document.getElementById('record-table');
  if (recordTable) {
    const card = recordTable.closest('.card');
    if (card && card.parentNode) {
      card.parentNode.insertBefore(panel, card);
    } else {
      const pageRecord = document.getElementById('page-record');
      if (pageRecord) pageRecord.appendChild(panel);
    }
  }

  // 닫기 버튼
  document.getElementById('ocr-preview-close').addEventListener('click', () => {
    panel.style.display = 'none';
  });

  // 등록 버튼
  document.getElementById('ocr-preview-submit').addEventListener('click', () => {
    _submitPreviewRows();
  });

  return panel;
}

// ── preview row 데이터 저장소 ─────────────────────────────────
// 렌더링 시 parsedRows를 여기 보관해두고 저장 시 참조
let _ocrPreviewRows = [];

// ── renderOcrPreviewRows: 파싱 결과 → 프리뷰 패널 렌더링 ─────
function renderOcrPreviewRows(parsedRows, rawGameCount = null) {
  const panel    = _getOrCreatePreviewPanel();
  const rowsWrap = document.getElementById('ocr-preview-rows');
  const countEl  = document.getElementById('ocr-preview-count');

  rowsWrap.innerHTML = '';
  _ocrPreviewRows = [];

  // ── 1차 필터: 노이즈 제거 ────────────────────────────────
  function isUsableRow(r) {
    return r.gameNum || (r.normHome?.team && r.normAway?.team) || r.odds;
  }

  const toNum = v => parseInt(v, 10) || 9999;
  const usable = parsedRows
    .filter(isUsableRow)
    .sort((a, b) => toNum(a.gameNum) - toNum(b.gameNum));

  if (usable.length === 0) {
    rowsWrap.innerHTML = `
      <div style="padding:16px;text-align:center;font-size:12px;color:var(--text3);">
        인식된 경기 정보가 없습니다. 더 선명한 사진으로 다시 시도하세요.
      </div>`;
    panel.style.display = 'block';
    return;
  }

  // ── 2차: complete / incomplete 분류 ──────────────────────
  // v2.0 정책: rawHome/rawAway 기준으로 판단 (normHome.team은 raw와 동일)
  function hasBothTeams(r) {
    const home = r.rawHome || r.normHome?.team || '';
    const away = r.rawAway || r.normAway?.team || '';
    return !!(home && away);
  }
  // confidence 뱃지는 더 이상 "normalize 실패" 여부가 아닌
  // "배당 없음" 여부만 표시 (그게 실질적 parse 실패 기준)
  function isOddsMissing(r) {
    return !r.odds;
  }

  // 경기 수 누락 경고
  if (rawGameCount !== null && rawGameCount > usable.length + 1) {
    const diff = rawGameCount - usable.length;
    showBridgeError(`⚠️ 경기 누락 의심: 원문 ${rawGameCount}개 감지 → 복원 ${usable.length}개 (${diff}개 누락 가능)`);
  }

  // ── 각 row 렌더링 ─────────────────────────────────────────
  usable.forEach((row, idx) => {
    const complete    = hasBothTeams(row);
    const oddsMissing = isOddsMissing(row);

    // 저장소에 등록 (DOM 인덱스 동기화용)
    const rowData = { ...row, _previewIdx: idx };
    _ocrPreviewRows.push(rowData);

    // 기본 체크 상태:
    //   팀명 있음 → true (raw 그대로여도 통과)
    //   팀명 없음 OR 배당 없음 → false (사용자가 직접 확인)
    const defaultChecked = complete && !oddsMissing;

    // 경기명 초기값 (rawHome vs rawAway 우선)
    const gameStr = _buildGameString(row) || `경기 #${row.gameNum ?? idx + 1}`;

    // 상태 뱃지 — "normalize 실패" 뱃지 제거, 실질적 문제만 표시
    let badge = '';
    if (!complete) {
      badge = `<span style="font-size:9px;padding:1px 5px;border-radius:6px;
        background:rgba(255,152,0,0.15);color:#ff9800;border:1px solid rgba(255,152,0,0.4);">
        ⚠️ 팀명 없음</span>`;
    } else if (oddsMissing) {
      badge = `<span style="font-size:9px;padding:1px 5px;border-radius:6px;
        background:rgba(255,200,0,0.10);color:#ffc800;border:1px solid rgba(255,200,0,0.3);">
        💡 배당 입력 필요</span>`;
    }

    // gameNum 뱃지
    const numBadge = row.gameNum
      ? `<span style="font-size:9px;color:var(--text3);font-family:'JetBrains Mono',monospace;">#${row.gameNum}</span>`
      : '';

    const rowEl = document.createElement('div');
    rowEl.dataset.previewIdx = idx;
    rowEl.style.cssText = `
      display:grid;
      grid-template-columns:20px 1fr auto auto;
      gap:6px;align-items:center;
      padding:8px 10px;
      background:var(--bg3);
      border-radius:8px;
      border:1px solid var(--border);
      transition:border-color 0.15s;
    `;
    rowEl.innerHTML = `
      <!-- 체크박스 -->
      <input type="checkbox" class="ocr-row-check" data-idx="${idx}"
        ${defaultChecked ? 'checked' : ''}
        style="width:15px;height:15px;accent-color:var(--accent);cursor:pointer;flex-shrink:0;">

      <!-- 경기명 + 배당 -->
      <div style="display:flex;flex-direction:column;gap:3px;min-width:0;">
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
          ${numBadge}
          ${badge}
        </div>
        <input type="text" class="ocr-row-game" data-idx="${idx}"
          value="${gameStr}"
          placeholder="경기명 (팀명 직접 수정 가능)"
          autocomplete="off"
          data-ocr-raw-home="${row.rawHome || ''}"
          data-ocr-raw-away="${row.rawAway || ''}"
          style="
            width:100%;padding:4px 7px;font-size:12px;
            background:var(--bg2);border:1px solid var(--border);
            border-radius:5px;color:var(--text1);box-sizing:border-box;
          ">
        <!-- 히스토리 기반 자동완성 드롭다운 (동적 삽입) -->
        <div class="ocr-autocomplete-list" data-for="${idx}"
          style="display:none;position:absolute;z-index:9999;background:var(--bg1);
                 border:1px solid var(--border);border-radius:6px;
                 font-size:11px;max-height:120px;overflow-y:auto;
                 box-shadow:0 4px 12px rgba(0,0,0,0.4);min-width:180px;">
        </div>
      </div>

      <!-- 배당 input -->
      <input type="number" class="ocr-row-odds" data-idx="${idx}"
        value="${row.odds ? row.odds.toFixed(2) : ''}"
        placeholder="배당"
        step="0.01" min="1"
        style="
          width:68px;padding:4px 7px;font-size:13px;font-weight:700;
          font-family:'JetBrains Mono',monospace;
          background:var(--bg2);border:1px solid var(--border);
          border-radius:5px;color:var(--gold);text-align:center;box-sizing:border-box;
        ">

      <!-- 삭제 버튼 -->
      <button type="button" class="ocr-row-del" data-idx="${idx}"
        style="
          background:none;border:none;color:var(--text3);
          font-size:15px;cursor:pointer;padding:2px 4px;line-height:1;
          transition:color 0.1s;
        "
        title="이 경기 제외">✕</button>
    `;

    rowsWrap.appendChild(rowEl);

    // 체크 상태 변경 시 border 색 반영
    const chk = rowEl.querySelector('.ocr-row-check');
    chk.addEventListener('change', () => {
      rowEl.style.borderColor = chk.checked ? 'rgba(0,229,255,0.35)' : 'var(--border)';
    });
    if (defaultChecked) rowEl.style.borderColor = 'rgba(0,229,255,0.35)';

    // 삭제 버튼
    rowEl.querySelector('.ocr-row-del').addEventListener('click', () => {
      rowEl.remove();
      _ocrPreviewRows[idx] = null;
      _updatePreviewCount();
    });

    // ── 히스토리 기반 자동완성 ────────────────────────────────
    // 팀명 input 포커스/입력 시 getTeamHistorySuggestions() 로 후보 드롭다운 표시
    const gameInput = rowEl.querySelector('.ocr-row-game');
    const acList    = rowEl.querySelector('.ocr-autocomplete-list');
    if (gameInput && acList && typeof getTeamHistorySuggestions === 'function') {
      gameInput.addEventListener('focus', () => _showAutocomplete(gameInput, acList));
      gameInput.addEventListener('input', () => _showAutocomplete(gameInput, acList));
      gameInput.addEventListener('blur',  () => setTimeout(() => { acList.style.display = 'none'; }, 180));
    }
  });

  _updatePreviewCount();
  panel.style.display = 'block';

  // 제출 버튼에 금액 없으면 경고 안내
  const statusEl = document.getElementById('ocr-preview-status');
  if (statusEl) {
    const amount = parseFloat(document.getElementById('r-amount')?.value) || 0;
    if (!amount) {
      statusEl.textContent = '💡 베팅 금액은 기존 폼에서 설정하세요';
      statusEl.style.color = 'var(--text3)';
    }
  }
}

function _updatePreviewCount() {
  const el = document.getElementById('ocr-preview-count');
  if (!el) return;
  const total = document.querySelectorAll('.ocr-row-check').length;
  const checked = document.querySelectorAll('.ocr-row-check:checked').length;
  el.textContent = `${checked} / ${total}개 선택`;
}

// ── 히스토리 기반 자동완성 드롭다운 ──────────────────────────────────────────
// OCR로 쌓인 팀명 히스토리(getTeamHistorySuggestions)를 기반으로 후보 표시.
// 사용자가 선택하면 경기명 input에 반영.
function _showAutocomplete(inputEl, listEl) {
  if (typeof getTeamHistorySuggestions !== 'function') return;

  const val = inputEl.value.trim();
  // "팀명 vs 팀명" 형식에서 마지막으로 편집 중인 토큰 추출
  // (커서 위치 앞쪽 텍스트로 prefix 결정)
  const cursor = inputEl.selectionStart ?? val.length;
  const before = val.slice(0, cursor);
  const prefix = before.split(/\s+vs\s+/i).pop() || '';

  const suggestions = getTeamHistorySuggestions(prefix, 6);

  if (!suggestions.length || (!prefix && suggestions.length === 0)) {
    listEl.style.display = 'none';
    return;
  }

  listEl.innerHTML = suggestions.map(s =>
    `<div data-name="${s.name}" style="
      padding:6px 10px;cursor:pointer;white-space:nowrap;
      border-bottom:1px solid var(--border);color:var(--text1);
      transition:background 0.1s;
    " onmouseover="this.style.background='rgba(0,229,255,0.1)'"
       onmouseout="this.style.background=''"
    >${s.name} <span style="color:var(--text3);font-size:10px;">${s.count}회</span></div>`
  ).join('');

  // 후보 클릭 시 해당 토큰을 치환
  listEl.querySelectorAll('[data-name]').forEach(item => {
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();  // blur 방지
      const chosen = item.dataset.name;
      const parts  = val.split(/(\s+vs\s+)/i);
      // 마지막 팀명 토큰을 chosen으로 교체
      if (parts.length >= 1) parts[parts.length - 1] = chosen;
      inputEl.value = parts.join('');
      inputEl.dispatchEvent(new Event('input'));
      listEl.style.display = 'none';
      // 히스토리에 선택한 팀명 기록 (사용 빈도 증가)
      if (typeof recordTeamHistory === 'function') recordTeamHistory(chosen);
    });
  });

  // input 기준으로 드롭다운 위치 설정
  const rect = inputEl.getBoundingClientRect();
  listEl.style.top    = `${inputEl.offsetTop + inputEl.offsetHeight}px`;
  listEl.style.left   = `${inputEl.offsetLeft}px`;
  listEl.style.width  = `${inputEl.offsetWidth}px`;
  listEl.style.display = 'block';
}

// ── 선택 경기 등록 (핵심 루프) ───────────────────────────────
async function _submitPreviewRows() {
  const submitBtn = document.getElementById('ocr-preview-submit');
  const statusEl  = document.getElementById('ocr-preview-status');
  const isMulti   = document.getElementById('ocr-multi-toggle')?.checked;

  // DOM에서 현재 체크된 row의 값 읽기
  const checkedRows = [];
  document.querySelectorAll('.ocr-row-check:checked').forEach(chk => {
    const idx     = parseInt(chk.dataset.idx, 10);
    const rowEl   = chk.closest('[data-preview-idx]');
    if (!rowEl) return;

    const gameVal = rowEl.querySelector('.ocr-row-game')?.value.trim() || '-';
    const oddsVal = parseFloat(rowEl.querySelector('.ocr-row-odds')?.value) || 0;
    const srcRow  = _ocrPreviewRows[idx] || {};

    // 저장 가능 조건:
    //   - 경기명이 있거나 (partial insert 허용 케이스)
    //   - 배당이 1 이상
    if (!oddsVal || oddsVal < 1) {
      if (statusEl) {
        statusEl.textContent = `❌ "${gameVal}" — 배당을 입력하세요`;
        statusEl.style.color = 'var(--red)';
      }
      return;
    }

    checkedRows.push({ ...srcRow, _gameStr: gameVal, _odds: oddsVal });
  });

  if (checkedRows.length === 0) {
    if (statusEl) { statusEl.textContent = '등록할 경기를 선택하세요.'; statusEl.style.color = 'var(--text3)'; }
    return;
  }

  // 버튼 비활성화
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '⏳ 등록 중...'; }
  if (statusEl) { statusEl.textContent = ''; }

  try {
    if (isMulti) {
      // ── 다폴 묶음: 1건 저장 ──────────────────────────────
      await _saveMultiBundle(checkedRows);
      if (statusEl) { statusEl.textContent = `✅ ${checkedRows.length}폴 조합 1건 등록 완료`; statusEl.style.color = 'var(--green)'; }
    } else {
      // ── 단폴 N건: 순차 저장 ──────────────────────────────
      let saved = 0;
      for (const row of checkedRows) {
        const ok = await _saveSingleRow(row);
        if (ok) saved++;
      }
      if (statusEl) {
        statusEl.textContent = `✅ ${saved}건 등록 완료`;
        statusEl.style.color = 'var(--green)';
      }
    }

    // 패널 정리
    setTimeout(() => {
      const panel = document.getElementById('ocr-preview-panel');
      if (panel) panel.style.display = 'none';
      _ocrPreviewRows = [];
    }, 1800);

    // 베팅 기록 리렌더
    if (typeof renderTable === 'function') renderTable();
    if (typeof updateAll  === 'function') updateAll();

  } catch (err) {
    console.error('[OCR Bridge] 저장 실패', err);
    if (statusEl) { statusEl.textContent = '❌ 오류: ' + err.message; statusEl.style.color = 'var(--red)'; }
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '✅ 선택 경기 등록'; }
  }
}

// ── 단폴 1건 저장 ─────────────────────────────────────────────
async function _saveSingleRow(row) {
  // ① 폼 초기화 — 이전 result/sport 등 오염 방지
  // clearRecordForm() 내부: setBetMode('single') + selectResult('PENDING') 포함
  if (typeof clearRecordForm === 'function') clearRecordForm();

  // ② 결과 명시적 재확인 (clearRecordForm 이후 방어)
  if (typeof selectResult === 'function') {
    selectResult('PENDING');
  } else {
    const el = document.getElementById('r-result');
    if (el) el.value = 'PENDING';
  }

  // ③ 폼 채우기 — 단폴 전용
  _fillSingleFormFromPreview(row);

  // ④ addBet — rAF×2 Promise로 래핑
  // dispatchEvent('input') 이후 내부 setTimeout 기반 로직 완료까지 보장
  // delay(N)은 환경 의존이라 사용하지 않음
  if (typeof addBet !== 'function') {
    console.warn('[OCR Bridge] addBet 함수 없음');
    return false;
  }

  await new Promise(res =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (window.__OCR_DEBUG__) {
          console.log('[OCR->SAVE single]', {
            game: document.getElementById('r-game')?.value,
            odds: document.getElementById('r-betman-odds')?.value,
            mode: document.getElementById('r-mode')?.value,
          });
        }
        addBet();
        res();
      })
    )
  );
  return true;
}

// ── 다폴 묶음 1건 저장 ───────────────────────────────────────
async function _saveMultiBundle(rows) {
  // ── rows 필터링: checked → odds 있는 행만 → gameNum 정렬 ──
  // checked는 호출 전 _submitPreviewRows에서 이미 필터됐지만
  // odds 없는 행 제외 + 경기번호 정렬은 여기서 한 번 더 보장
  rows = rows
    .filter(r => r._odds && r._odds >= 1)  // odds 없는 행 multi 제외
    .sort((a, b) => (a.gameNum || 9999) - (b.gameNum || 9999));  // gameNum 정렬

  // ── 다폴 최소 2경기 체크 ──────────────────────────────────
  if (rows.length < 2) {
    showBridgeError('다폴은 최소 2경기 필요합니다.');
    return false;
  }

  // ── 폼 초기화: 이전 입력 오염 방지 ──────────────────────
  // clearRecordForm() 내부에서 setBetMode('single') + selectResult('PENDING') 까지 처리됨
  if (typeof clearRecordForm === 'function') clearRecordForm();

  // clearRecordForm이 mode를 'single'로 리셋하므로 명시적으로 재확인
  if (typeof selectResult === 'function') {
    selectResult('PENDING');
  } else {
    const el = document.getElementById('r-result');
    if (el) el.value = 'PENDING';
  }

  // ② _fillMultiForm에 preview 값을 반영한 rows 전달
  // preview에서 수정된 game/odds 값을 normHome/normAway에 덮어씀
  // _fillMultiForm 내부에서 setBetMode('multi')를 다시 호출하므로 모드 충돌 없음
  const enriched = rows.map(r => ({
    ...r,
    // 경기명 override (사용자가 수정했을 수 있음)
    normHome: { team: (r._gameStr || '').split(' vs ')[0]?.trim() || r.normHome?.team || '', confidence: 1 },
    normAway: { team: (r._gameStr || '').split(' vs ')[1]?.trim() || r.normAway?.team || '', confidence: 1 },
    odds: r._odds ?? r.odds,
  }));

  _fillMultiForm(enriched);  // 내부에서 setBetMode('multi') 재호출

  // addBet — rAF×2 Promise로 래핑
  // _fillMultiForm 내부의 setTimeout(calcMultiEV, 50) 완료 이후 프레임까지 보장
  // single과 동일한 방식으로 통일 (delay(N) 환경 의존 제거)
  if (typeof addBet !== 'function') {
    console.warn('[OCR Bridge] addBet 함수 없음');
    return false;
  }

  await new Promise(res =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (window.__OCR_DEBUG__) {
          console.log('[OCR->SAVE multi]', {
            game: document.getElementById('r-game')?.value,
            odds: document.getElementById('r-betman-odds')?.value,
            mode: document.getElementById('r-mode')?.value,
          });
        }
        addBet();
        res();
      })
    )
  );
  return true;
}

// ── preview 전용 단폴 폼 채우기 ─────────────────────────────
// _fillSingleForm과 유사하지만 preview row의 _gameStr / _odds 우선
// + r-result PENDING 방어 코드 내장
function _fillSingleFormFromPreview(row) {
  if (typeof setBetMode === 'function') setBetMode('single');

  // 결과 방어 (지시사항 추가 방어 코드)
  const resultEl = document.getElementById('r-result');
  if (resultEl && !resultEl.value) resultEl.value = 'PENDING';

  // 경기명 (preview에서 수정된 값 우선)
  const gameStr = row._gameStr || _buildGameString(row) || '-';
  const gameEl  = document.getElementById('r-game');
  if (gameEl) { gameEl.value = gameStr; gameEl.dispatchEvent(new Event('input')); }

  // 배당 (preview input 수정값 우선)
  const odds   = row._odds ?? row.odds;
  const oddsEl = document.getElementById('r-betman-odds');
  if (oddsEl && odds) {
    oddsEl.value = odds.toFixed(2);
    oddsEl.dispatchEvent(new Event('input'));
  }

  // 예상 승률 (내재확률 역산)
  if (odds && odds > 1) {
    const implied = Math.round((1 / odds) * 100 * 10) / 10;
    const probEl  = document.getElementById('r-myprob-direct');
    if (probEl) { probEl.value = implied; probEl.dispatchEvent(new Event('input')); }
    if (typeof syncMyProb === 'function') syncMyProb();
  }

  // 날짜
  const dateEl = document.getElementById('r-date');
  if (dateEl && !dateEl.value) dateEl.value = _todayKST();

  // 종목 자동 감지
  _autoSetSport(row);

  // 종목 미선택 시 addBet이 alert로 막힘 → 기본값 '기타'로 세팅
  const sportHidden = document.getElementById('r-sport');
  if (sportHidden && !sportHidden.value) {
    sportHidden.value = '기타';
    const badge = document.getElementById('sport-selected-badge');
    const label = document.getElementById('sport-selected-label');
    if (badge) badge.style.display = 'block';
    if (label) label.textContent = '기타';
  }

  // 형식 미선택 시 기본값 '일반' 주입
  const typeHidden = document.getElementById('r-type-hidden');
  if (!window._selectedType && typeHidden && !typeHidden.value) {
    window._selectedType = '일반';
  }

  if (typeof updateLossRatio === 'function') updateLossRatio();
  if (typeof updatePreview   === 'function') updatePreview();
}

// 전역 노출
window.renderOcrPreviewRows   = renderOcrPreviewRows;
window.applyOcrRowsToBets     = _submitPreviewRows;
