// ── XSS 방어 유틸 ────────────────────────────────────────────
//
// 사용 원칙:
//   safeText  → textContent 직전 단 한 번만 (로직에 사용 금지, 이중 적용 금지)
//   escHtml   → innerHTML 템플릿 내부 값에만 (URL/class 혼용 금지)
//   safeUrl   → href / src 속성 전용 (escHtml과 조합 금지)
//   sportClass → class 속성 enum 매핑 전용
//
// 금지 패턴:
//   escHtml(safeUrl(x))      — 목적이 다른 함수 조합
//   safeText(v); doLogic(v)  — 출력 전용 함수를 로직에 사용
//   safeText(escHtml(x))     — 이중 escape → 화면에 &amp; 노출
// ─────────────────────────────────────────────────────────────

// 텍스트 노드 escape — innerHTML 템플릿 내 값에 사용
function escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 렌더 직전 출력 전용 래퍼 — textContent 대입 직전에만 사용
// 로직 연산·재가공·이중 적용 금지
function safeText(v) {
  return (v != null && String(v).trim() !== '' && v !== '-') ? escHtml(String(v)) : '—';
}

// URL 속성 전용 validator — href / src 에만 사용, escHtml과 조합 금지
function safeUrl(url) {
  try {
    const u = new URL(String(url), location.origin);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
  } catch (e) {}
  return '';
}

// sport → CSS class enum 매핑 — 정규식 방식 금지, 매핑 외 값은 'etc'
const SPORT_CLASS = {
  '축구': 'soccer', '농구': 'basketball', '야구': 'baseball',
  '배구': 'volleyball', '테니스': 'tennis', '아이스하키': 'hockey',
  '미식축구': 'football', '이스포츠': 'esports', 'e스포츠': 'esports',
  '골프': 'golf', '격투기': 'mma', '럭비': 'rugby',
};
function sportClass(s) {
  return SPORT_CLASS[String(s == null ? '' : s).trim()] || 'etc';
}
// ─────────────────────────────────────────────────────────────


// ===== 원웨이 Kelly 판단 블록 =====

// [0] multiplier 역산 (window._SS에 kellyMultiplier 없으므로)

// [9] 다폴 과신 방지 필터 (단폴 사용 금지)

// renderDecisionBlock — 순수 view-only (계산 금지, 전달값만 렌더)
// params: { isMulti, ev, kelly, rawP, safeP, verdict, folderCount, sizing }


// ========== TABS ==========
function switchTab(name, el) {
  checkLossWarning();
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  if (el) el.classList.add('active');
  document.getElementById('page-' + name).classList.add('active');
  activePage = name;
  // F5 후 탭 복원을 위해 마지막 활성 탭 저장
  try { localStorage.setItem('edge_active_tab', name); } catch(e) {}
  if (name === 'dashboard') { updateCharts(); updateFundCards(); }
  if (name === 'analysis')  updateStatsAnalysis();
  if (name === 'analysis2') { updateStatsAnalysis(); }
  if (name === 'analysis3') { updateStatsAnalysis(); updateEvBias(); updateEvMonthly(); updateEvCum(); }
  if (name === 'analyze')   updateAnalyzeTab();
  if (name === 'goal')      { updateRoundHistory(); updateGoalStats(); calcGoal(); }
  if (name === 'predict')   { updateGoalStats(); updatePredictTab(); }
  if (name === 'simulator') { const _b=getBets().filter(b=>b.result!=='PENDING'); calcKelly(); renderKellySlots(_b.length % 12, _b); updateSimRoundSeedBanner(); updateKellyHistory(); updateKellyGradeBanner(); try{updateFibonacci();}catch(e){} }
  if (name === 'judgeall')  updateJudgeAll();
  if (name === 'decision')  initDecisionTab();
  if (name === 'settings')  { loadSettingsDisplay(); updateWeeklySeedStatus(); setTodayKST(); renderPrincipleList(); if (typeof renderSeasonHistory === 'function') renderSeasonHistory(); }
  if (name === 'record')    { renderTable(); renderRecentTable(); }
  if (name === 'vault')     renderVault();
  if (name === 'strategy')  initSimulator();
  if (name === 'journal')   { loadJournal(); switchJournalTab(_journalTab || 'plan'); }
  if (name === 'diary-list') renderDiaryListPage();
}

// ========== VALUE ANALYSIS ==========
// ========== EV CALCULATOR ==========

function toggleEvSport(btn) {
  document.querySelectorAll('#ev-sport-btns .sel-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}


function saveEvBet() {
  if (!pendingEvBet) return;
  const { game, sport, best, amount } = pendingEvBet;
  const _rg2 = document.getElementById('r-game');        if (_rg2) _rg2.value = game;
  const _rbo2 = document.getElementById('r-betman-odds'); if (_rbo2) _rbo2.value = best.odds;
  const _riv2 = document.getElementById('r-isvalue');     if (_riv2) _riv2.value = best.ev >= 0 ? 'true' : 'false';
  const _rmp2 = document.getElementById('r-myprob');      if (_rmp2) _rmp2.value = (best.myProb * 100).toFixed(1);
  if (amount) { const _ra2 = document.getElementById('r-amount'); if (_ra2) _ra2.value = amount; }

  // 내 예상 승률 표시
  const probDisplay = document.getElementById('myprob-display');
  const probVal     = document.getElementById('myprob-display-val');
  if (probDisplay) probDisplay.style.display = 'block';
  if (probVal) probVal.textContent = `${(best.myProb * 100).toFixed(1)}% (${best.name})`;

  document.querySelectorAll('#sport-btns .sel-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.val === sport);
  });
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab')[2].classList.add('active');
  document.getElementById('page-record').classList.add('active');
}


// ========== BET RECORD ==========
// ── STORAGE_KEY — state.js에서 단일 정의, 여기서는 참조만 ──
// const STORAGE_KEY = window.App.STORAGE_KEY; // 불필요 — saveBets가 처리

// [F] 중복 실행 가드 — 이벤트 연타 방지 (모듈 스코프, HTML 수정 불필요)
let _adding = false;

function addBet() {
  if (_adding) return;
  _adding = true;
  try {
    _addBetCore();
  } finally {
    _adding = false;   // 예외 발생 시에도 반드시 해제
  }
}

// ── Gate UI 렌더 ─────────────────────────────────────────────
function renderGateBanner(gate) {
  const existing = document.getElementById('gate-banner');
  if (existing) existing.remove();

  const modeStyle = {
    NORMAL:  { color: 'var(--green)',  bg: 'rgba(0,230,118,0.08)',  icon: '✅' },
    WARNING: { color: '#ff9800',       bg: 'rgba(255,152,0,0.10)',  icon: '⚠️' },
    DEFENSE: { color: 'var(--red)',    bg: 'rgba(255,59,92,0.10)',  icon: '🛡️' },
    LOCK:    { color: 'var(--red)',    bg: 'rgba(255,59,92,0.15)',  icon: '🚫' },
  };
  const s = modeStyle[gate.mode] || modeStyle.NORMAL;

  const banner = document.createElement('div');
  banner.id = 'gate-banner';
  banner.style.cssText = `
    margin-bottom:10px;padding:10px 14px;border-radius:8px;
    background:${s.bg};border:1px solid ${s.color}44;border-left:3px solid ${s.color};
  `;

  const reasonHtml = gate.reason.map(r =>
    `<div style="font-size:10px;color:var(--text3);margin-top:2px;">· ${r}</div>`
  ).join('');

  const multiplierInfo = gate.mode !== 'NORMAL'
    ? `<span style="font-size:10px;color:${s.color};margin-left:8px;">Kelly × ${gate.kellyMultiplier} · 최대 ${(gate.maxStakePct * 100).toFixed(0)}%</span>`
    : '';

  const overrideBtn = !gate.allowed
    ? `<button onclick="showOverrideDialog()" style="
        margin-top:8px;padding:5px 12px;font-size:11px;
        background:rgba(255,59,92,0.15);border:1px solid var(--red);
        border-radius:6px;color:var(--red);cursor:pointer;width:100%;
      ">Override (이유 입력 후 진행)</button>`
    : '';

  banner.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <span style="font-size:11px;font-weight:700;color:${s.color};">${s.icon} ${gate.mode}${multiplierInfo}</span>
    </div>
    ${reasonHtml}
    ${overrideBtn}
  `;

  const formTop = document.getElementById('oneway-kelly-card') || document.getElementById('r-amount')?.closest('.card');
  if (formTop && formTop.parentNode) {
    formTop.parentNode.insertBefore(banner, formTop);
  }
}

function showOverrideDialog() {
  const reason = prompt('LOCK 상태입니다. Override 이유를 입력하세요 (기록에 남습니다):');
  if (reason === null) return;
  if (!reason.trim()) { showToast('이유를 입력해야 Override 가능합니다.', 'error'); return; }
  window._pendingOverrideReason = reason.trim();
  showToast('Override 이유가 저장됐습니다. 베팅 추가 버튼을 다시 눌러주세요.', 'success');
}

// ── recomputeGate — 폼 현재값 기준 gate 재평가 ──────────────
// storage 이벤트(멀티탭) 또는 외부 트리거 시 호출
function recomputeGate() {
  try {
    if (typeof evaluateDecisionGate !== 'function') return;
    const bets        = getBets();
    const metrics     = typeof computeJudgeMetrics === 'function' ? computeJudgeMetrics(bets, 'all') : {};
    const calibration = typeof computeCalibration  === 'function' ? computeCalibration(bets) : {};
    const ctx         = buildDecisionContext({ metrics, calibration, bets });
    const config      = typeof getGateConfig === 'function'
      ? getGateConfig(getSettings())
      : {};
    const gate        = evaluateDecisionGate(ctx, config);
    window._lastGateResult  = gate;
    window._lastGateContext = ctx;
    renderGateBanner(gate);
  } catch (e) {
    console.warn('[recomputeGate] 실패:', e);
  }
}

function _addBetCore() {
  const sports = getSelectedVals('sport');
  const types  = getSelectedVals('type');
  const mode   = document.getElementById('r-betmode').value;
  const editId = document.getElementById('r-edit-id').value;
  const isDouble = document.getElementById('r-double').value === 'true';

  // 단폴 모드일 때만 종목/형식 필수 체크 (다폴더는 폴더 행에서 각각 선택)
  if (mode === 'single') {
    if (!sports.length) { showToast('종목을 선택하세요.', 'error'); return; }
    if (!types.length)  { showToast('베팅 형식을 선택하세요.', 'error'); return; }
  }

  const amount = parseFloat(document.getElementById('r-amount').value) || 0;
  const odds   = parseFloat(document.getElementById('r-betman-odds').value) || 0;
  if (!amount || !odds) { showToast('베팅 금액과 배당률을 입력하세요.', 'error'); return; }

  // ── Decision Gate 평가 ────────────────────────────────────
  let _gateResult  = null;
  let _gateContext = null;
  if (typeof evaluateDecisionGate === 'function' && typeof computeCalibration === 'function') {
    try {
      const _bets        = getBets();
      const _metrics     = typeof computeJudgeMetrics === 'function' ? computeJudgeMetrics(_bets, 'all') : {};
      const _calibration = computeCalibration(_bets);
      const _ctx         = buildDecisionContext({ metrics: _metrics, calibration: _calibration, bets: _bets });
      const _config      = typeof getGateConfig === 'function' ? getGateConfig(getSettings()) : {};
      _gateResult        = evaluateDecisionGate(_ctx, _config);
      _gateContext       = _ctx;

      // 전역 캐시 (recomputeGate / storage 이벤트 공유)
      window._lastGateResult  = _gateResult;
      window._lastGateContext = _gateContext;

      // 배너 렌더
      renderGateBanner(_gateResult);

      // LOCK 상태: override 없으면 차단
      if (!_gateResult.allowed && !window._pendingOverrideReason) {
        return;
      }
    } catch (e) {
      console.warn('[gate] 평가 실패 — 통과 처리:', e);
    }
  }
  // ─────────────────────────────────────────────────────────

  const result = document.getElementById('r-result').value;

  // 단폴 EV+ 메모
  let singleMemo = '';
  if (mode === 'single') {
    const isEv = document.getElementById('r-isvalue').value === 'true';
    const memoWrap = document.getElementById('single-memo-wrap');
    const memoInput = document.getElementById('single-memo-input');
    const isOpen = memoWrap && memoWrap.style.display !== 'none';
    if (isEv && isOpen) {
      singleMemo = memoInput ? memoInput.value.trim() : '';
      if (singleMemo.length < 5) {
        showToast('EV+ 베팅 근거를 5자 이상 입력하세요.', 'error');
        if (memoInput) memoInput.focus();
        return;
      }
    }
  }

  // 다폴더 메모
  let folderMemos = [];
  if (mode === 'multi') {
    const rows = document.querySelectorAll('#folder-rows .folder-row');
    for (let i = 0; i < rows.length; i++) {
      const memoWrap = rows[i].querySelector('.folder-memo-wrap');
      const memoInput = rows[i].querySelector('.folder-memo');
      const isOpen = memoWrap && memoWrap.style.display !== 'none';
      const memoVal = memoInput ? memoInput.value.trim() : '';
      if (isOpen && memoVal.length < 5) {
        showToast(`F${i+1} 베팅 근거를 5자 이상 입력하세요.`, 'error');
        memoInput.focus();
        return;
      }
      folderMemos.push(isOpen ? memoVal : '');
    }
  }

  const betData = {
    date: (document.getElementById('r-date') || {}).value || '',
    game: (document.getElementById('r-game') || {}).value || '-',
    mode,
    folderCount: mode === 'multi' ? ((document.getElementById('r-folder-count') || {}).value || '') : '',
    sport: mode === 'multi'
      ? Array.from(document.querySelectorAll('#folder-rows .folder-sport'))
          .map(el => el.value || '').filter(Boolean)
          .filter((v,i,a) => a.indexOf(v) === i).join(', ')
      : sports.join(', '),
    type: mode === 'multi'
      ? Array.from(document.querySelectorAll('#folder-rows .folder-type'))
          .map(el => el.value || '승/패').filter(Boolean)
          .filter((v,i,a) => a.indexOf(v) === i).join(', ')
      : types.join(', '),
    betmanOdds: odds,
    amount,
    result,
    isValue: (document.getElementById('r-isvalue') || {}).value === 'true',
    myProb: parseFloat((document.getElementById('r-myprob') || {}).value) || null,
    memo: mode === 'single' ? singleMemo : '',
    folderMemos: mode === 'multi' ? folderMemos : [],
    // 다폴더 폴더별 배당/승률/종목 저장
    folderOdds: mode === 'multi' ? Array.from(document.querySelectorAll('#folder-rows .folder-odds')).map(el => parseFloat(el.value) || null) : [],
    folderProbs: mode === 'multi' ? Array.from(document.querySelectorAll('#folder-rows .folder-prob')).map(el => parseFloat(el.value) || null) : [],
    folderSports: mode === 'multi' ? Array.from(document.querySelectorAll('#folder-rows .folder-sport')).map(el => el.value || '') : [],
    folderTypes:  mode === 'multi' ? Array.from(document.querySelectorAll('#folder-rows .folder-type')).map(el => el.value || '승/패') : [],
    // EV 계산기 입력값 저장
    evInputs: {
      mahan:      parseFloat(document.getElementById('ev-mahan')?.value)      || null,
      mahanProb:  parseFloat(document.getElementById('ev-mahan-prob')?.value)  || null,
      yeokbae:    parseFloat(document.getElementById('ev-yeokbae')?.value)    || null,
      yeokbaeProb:parseFloat(document.getElementById('ev-yeokbae-prob')?.value)|| null,
      jeongbae:   parseFloat(document.getElementById('ev-jeongbae')?.value)   || null,
      jeongbaeProb:parseFloat(document.getElementById('ev-jeongbae-prob')?.value)|| null,
      plhan:      parseFloat(document.getElementById('ev-plhan')?.value)      || null,
      plhanProb:  parseFloat(document.getElementById('ev-plhan-prob')?.value)  || null,
      evAmount:   parseFloat(document.getElementById('ev-amount')?.value)     || null,
      evSport:    window._evSport || null,
      evGame:     document.getElementById('v-game')?.value.trim() || null,
    }
  };
  betData.profit = result === 'WIN'  ? amount * (odds - 1) :
                   result === 'LOSE' ? -amount : 0;
  betData.savedAt = new Date().toISOString();
  // 감정 태그
  const activeEmotion = document.querySelector('.emotion-tag.active-emotion');
  betData.emotion = activeEmotion ? activeEmotion.dataset.val : '보통';
  // 원칙 위반 기록
  const checkboxes = document.querySelectorAll('#principle-checklist input[type=checkbox]');
  betData.violations = [];
  checkboxes.forEach(cb => { if (!cb.checked) betData.violations.push(cb.dataset.principle); });
  const _mp = betData.myProb, _od = betData.betmanOdds;

  // ── odds 유효성 차단 — parseFloat(...)||0 경로 포함 완전 차단 ──
  if (!_od || _od <= 1) {
    showToast('배당은 1 초과만 가능합니다', 'error');
    return;
  }

  // adjustedProb: hidden 필드에서 읽거나 실시간 계산
  const _adjProbEl = document.getElementById('r-adjusted-prob-val');
  const _adjProbPct = _adjProbEl && parseFloat(_adjProbEl.value) > 0
    ? parseFloat(_adjProbEl.value)
    : (typeof getCLVAdjustedProb === 'function' && _mp ? getCLVAdjustedProb(_mp) : _mp);
  // toProb() 헬퍼 사용 — 직접 /100 금지 (단위 혼용 방지)
  const _adjProb = typeof toProb === 'function' ? toProb(_adjProbPct) : _adjProbPct / 100;
  const _rawProb = typeof toProb === 'function' ? toProb(_mp)         : _mp / 100;

  // ── 저장 구조 ──────────────────────────────────────────────
  // ev     → rawProb 기반 (기존 그대로, 과거 데이터 호환)
  // evRaw  → ev와 동일 (명시적 참조용)
  // evCalibrated → adjustedProb 기반 (실행 기준, Kelly 연동)
  // calibProb    → 보정 확률 (재계산/검증용 별도 보존)
  // "raw는 판단 기록, calibrated는 실행 기준"
  betData.ev    = (_mp && _od && _od > 1) ? (_rawProb * (_od-1)) - (1 - _rawProb) : null;
  betData.evRaw = betData.ev; // 명시적 참조용 (동일값)
  betData.adjustedProb = _adjProbPct; // 보정 확률 % 저장

  // ── [3] Decision 로그 저장 ────────────────────────────────
  // 사후 분석을 위해 저장 시점의 Decision 스냅샷 기록
  // 단위: myProb(% 정수), adjustedProb(% 소수1자리), rawAdjustedProbFrac(0~1)
  // null-safe: 읽기 시 항상 bet.decision || {} 패턴 사용
  if (_mp && _od && typeof getDecisionSnapshot === 'function') {
    betData.decision = getDecisionSnapshot(_mp, _od);
  } else {
    // fallback: 기본 구조 저장 (getDecisionSnapshot 미로드 시 호환)
    const _ss = window.App._SS;
    const _adjProbPctFallback = _adjProbPct ?? _mp;
    betData.decision = {
      factor:              1.0,
      reason:              'LEGACY',
      label:               'OK',
      allow:               true,
      confidenceLevel:     'UNKNOWN',
      myProb:              _mp,                        // % 정수
      adjustedProb:        _adjProbPctFallback,        // % 소수 1자리
      rawAdjustedProbFrac: typeof toProb === 'function'
                             ? toProb(_adjProbPctFallback)
                             : Math.min(Math.max(_adjProbPctFallback, 0), 100) / 100, // 0~1 clamped
      adjustSource:        'RAW',
      adjustDelta:         0,
      bucketCount:         0,
      recentEce:           _ss?.recentEce  ?? null,   // %
      totalEce:            _ss?.ece        ?? null,   // %
      corrFactor:          _ss?.corrFactor ?? null,
      sampleN:             _ss?.predBets?.length ?? 0,
      ts:                  Date.now()
    };
  }

  // evCalibrated + calibProb
  if (_mp && _od && _od > 1) {
    let calibProb = _adjProb;
    if (mode === 'multi') {
      const rows = document.querySelectorAll('#folder-rows .folder-row');
      calibProb = getCombinedCalibratedProb(rows) ?? _adjProb;
    }
    betData.evCalibrated = (calibProb * (_od - 1)) - (1 - calibProb);
    betData.calibProb = calibProb; // 소수 단위 (0~1)로 저장
  } else {
    betData.evCalibrated = null;
    betData.calibProb    = null;
  }

  // [E] 원자성 보장 — committed true 이후에만 UI 실행
  let committed = false;

  // ── Gate 스냅샷 + Override 주입 ──────────────────────────
  if (_gateResult && typeof attachGateSnapshot === 'function') {
    const overrideReason = window._pendingOverrideReason;
    if (overrideReason) {
      Object.assign(betData, applyOverride(betData, overrideReason, _gateResult, _gateContext));
      window._pendingOverrideReason = null;
    } else {
      Object.assign(betData, attachGateSnapshot(betData, _gateResult, _gateContext));
    }
  }
  // ─────────────────────────────────────────────────────────

  if (editId) {
    // 수정 모드 — 기존 기록 덮어쓰기 (remaining 재차감 없음)
    const idx = getBets().findIndex(b => String(b.id) === String(editId));
    if (idx !== -1) {
      const oldAmount = getBets()[idx].amount || 0;
      const next = getBets().map((b, i) =>
        i === idx ? { ...b, ...betData } : b
      );
      const diff = betData.amount - oldAmount;
      if (diff !== 0 && typeof applyRoundBet === 'function') {
        if (diff > 0) applyRoundBet(diff);
        else if (typeof refundRoundBet === 'function') refundRoundBet(-diff);
      }
      saveBets(next, { refresh: false });
    }
    try {
      committed = true;
    } catch (e) { throw e; }

  } else if (isDouble) {
    // [A] 객체 생성 → roundId 주입 (betData mutate 방지)
    const bet1 = { id: Date.now(),     ...betData };
    const bet2 = { id: Date.now() + 1, ...betData };
    if (typeof attachRoundToBet === 'function') { attachRoundToBet(bet1); attachRoundToBet(bet2); }
    const amount1 = Number(bet1.amount) || 0;
    const amount2 = Number(bet2.amount) || 0;
    // [G] 디버그 로그 (DEV 전용) — 로직은 단일 경로, 로그만 조건부
    const _dbg1Before = window.__DEV__ ? getActiveRound()?.remaining : null;
    const _dbg2Before = window.__DEV__ ? getActiveRound()?.remaining : null;
    try {
      // [B] applyRoundBet — 단일 실행 흐름, 플래그 없이 직접 호출
      applyRoundBet?.(amount1);
      if (window.__DEV__) console.log('[ROUND] bet1', { before: _dbg1Before, delta: amount1, after: getActiveRound()?.remaining });
      applyRoundBet?.(amount2);
      if (window.__DEV__) console.log('[ROUND] bet2', { before: _dbg2Before, delta: amount2, after: getActiveRound()?.remaining });
      saveBets([...getBets(), bet1, bet2], { refresh: false });
      committed = true;
    } catch (e) {
      refundRoundBet?.(amount1);  // 롤백
      refundRoundBet?.(amount2);
      throw e;
    }

  } else {
    // [A] 객체 생성 → roundId 주입 → push (betData mutate 방지)
    const bet = { id: Date.now(), ...betData };
    if (typeof attachRoundToBet === 'function') attachRoundToBet(bet);
    const amount = Number(bet.amount) || 0;
    // [G] 디버그 로그 (DEV 전용) — 로직은 단일 경로, 로그만 조건부
    const _dbgBefore = window.__DEV__ ? getActiveRound()?.remaining : null;
    try {
      // [B][E] applyRoundBet → saveBets → 원자 실행
      applyRoundBet?.(amount);
      if (window.__DEV__) {
        const _dbgAfter = getActiveRound()?.remaining;
        console.log('[ROUND]', { before: _dbgBefore, delta: amount, after: _dbgAfter });
      }
      saveBets([...getBets(), bet], { refresh: false });
      committed = true;
    } catch (e) {
      refundRoundBet?.(amount);   // 롤백
      throw e;
    }
  }

  // [E] storage 커밋 성공 이후에만 UI 실행
  if (committed) {
    _gdriveAutoSync?.();
    clearRecordForm?.();
    updateAll?.();
  }
}


// ── Calibration Layer 헬퍼 ──────────────────────────────────
// state.js의 getCalibCorrFactor + _SS.activeCorrFactor를 사용
// EV를 자동 보정하는 공통 함수. UI에서 직접 호출.

// corrFactor 활성 상태 설명 텍스트 반환

// 베트맨 올림: 소수점 둘째 자리가 있으면 첫째 자리로 올림
// 예) 3.01→3.1  1.89→1.9  2.50→2.5  1.30→1.3


// ── 공통 함수: 다폴더 보정 확률 계산 (로그 합 방식) ──────────────
// 검증 탭 및 calcMultiEV 공유 사용


function resolvebet(id, result) {
  const target = getBets().find(b => String(b.id) === String(id));
  if (!target) return;
  const next = getBets().map(b =>
    String(b.id) === String(id)
      ? { ...b, result, profit: result === 'WIN' ? b.amount * (b.betmanOdds - 1) : -b.amount }
      : b
  );
  saveBets(next, { refresh: false });
  updateAll();
  renderTable();
}

function deleteBet(id) {
  const _delTarget = bets.find(b => String(b.id) === String(id));
  // [C] remaining 환원 — 현재 회차 소속 베팅일 때만 복구 (null-safe + 회차 일치)
  const _activeRound = (typeof getActiveRound === 'function') ? getActiveRound() : null;
  if (
    _delTarget &&
    _activeRound &&
    _delTarget.roundId === _activeRound.id &&
    typeof refundRoundBet === 'function'
  ) {
    refundRoundBet(_delTarget.amount || 0);
  }
  saveBets(getBets().filter(b => String(b.id) !== String(id)), { refresh: false });
  updateAll();
  renderTable();
}


// ========== 베팅 템플릿 ==========
let betTemplates = Storage.getJSON(KEYS.TEMPLATES, []);

function saveBetTemplate() {
  const mode   = document.getElementById('r-mode')?.value || 'single';
  const sports = [...document.querySelectorAll('#sport-btns .sel-btn.active')].map(b => b.dataset.val);
  const types  = [...document.querySelectorAll('#type-btns .sel-btn.active')].map(b => b.dataset.val);
  const fc     = document.getElementById('r-folder-count')?.value || '2';

  if (!sports.length || !types.length) { showToast('종목과 형식을 선택한 후 저장하세요.', 'error'); return; }

  const label = prompt('템플릿 이름을 입력하세요', `${sports.join('+')} ${types.join('+')}${mode === 'multi' ? ` ${fc}폴` : ''}`);
  if (!label) return;

  betTemplates.push({ id: Date.now(), label, mode, sports, types, folderCount: fc });
  Storage.setJSON(KEYS.TEMPLATES, betTemplates);
  renderTemplateList();
}

function loadBetTemplate(id) {
  const t = betTemplates.find(t => t.id === id);
  if (!t) return;
  clearRecordForm();
  setBetMode(t.mode);
  document.querySelectorAll('#sport-btns .sel-btn').forEach(btn => {
    if (t.sports.includes(btn.dataset.val)) btn.classList.add('active');
  });
  document.querySelectorAll('#type-btns .sel-btn').forEach(btn => {
    if (t.types.includes(btn.dataset.val)) btn.classList.add('active');
  });
  if (t.mode === 'multi') {
    const fcEl = document.getElementById('r-folder-count');
    if (fcEl) fcEl.value = t.folderCount;
    document.querySelectorAll('.folder-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === t.folderCount);
    });
    updateFolderRows();
  }
}

function deleteBetTemplate(id) {
  betTemplates = betTemplates.filter(t => t.id !== id);
  Storage.setJSON(KEYS.TEMPLATES, betTemplates);
  renderTemplateList();
}

function copyBet(id) {
  const b = bets.find(b => String(b.id) === String(id));
  if (!b) return;

  clearRecordForm();

  // 수정 모드 진입
  const _rei2 = document.getElementById('r-edit-id');       if (_rei2) _rei2.value = id;
  const _ft2  = document.getElementById('form-title');       if (_ft2)  _ft2.innerHTML = '✏️ <span>베팅 기록 수정</span>';
  const _bsb2 = document.getElementById('btn-save-bet');     if (_bsb2) _bsb2.textContent = '💾 수정 저장';
  const _bce2 = document.getElementById('btn-cancel-edit');  if (_bce2) _bce2.style.display = 'block';

  // 날짜
  const _rdt2 = document.getElementById('r-date'); if (_rdt2) _rdt2.value = b.date || '';

  // 단폴/다폴 모드
  setBetMode(b.mode || 'single');

  // 종목
  const sports = (b.sport || '').split(', ').map(s => s.trim());
  document.querySelectorAll('#sport-btns .sel-btn').forEach(btn => {
    if (sports.includes(btn.dataset.val)) btn.classList.add('active');
  });

  // 형식
  const types = (b.type || '').split(', ').map(t => t.trim());
  document.querySelectorAll('#type-btns .sel-btn').forEach(btn => {
    if (types.includes(btn.dataset.val)) btn.classList.add('active');
  });

  // 폴더 수 버튼 표시
  if (b.mode === 'multi' && b.folderCount) {
    const _rfcEdit = document.getElementById('r-folder-count'); if (_rfcEdit) _rfcEdit.value = b.folderCount;
    document.querySelectorAll('.folder-btn').forEach(btn => {
      const isActive = btn.dataset.val === b.folderCount;
      btn.style.borderColor = isActive ? 'var(--accent2)' : 'var(--border)';
      btn.style.background  = isActive ? 'rgba(255,107,53,0.12)' : 'var(--bg3)';
      btn.style.color       = isActive ? 'var(--accent2)' : 'var(--text2)';
    });
  }

  // 경기명
  document.getElementById('r-game').value = b.game !== '-' ? (b.game || '') : '';

  // 금액 / 배당
  document.getElementById('r-amount').value      = b.amount || '';
  document.getElementById('r-betman-odds').value = b.betmanOdds || '';

  // EV 여부
  setEvDirect(b.isValue || false);

  // 예상 승률
  if (b.myProb) {
    const _rmp5 = document.getElementById('r-myprob'); if (_rmp5) _rmp5.value = b.myProb;
    const mpd = document.getElementById('r-myprob-direct');
    if (mpd) mpd.value = b.myProb;
  }

  // 결과
  selectResult(b.result || 'PENDING');

  // 다폴더 폴더별 배당/승률/메모 복원 — setBetMode의 setTimeout(renderFolderRows) 이후 실행
  if (b.mode === 'multi') {
    setTimeout(() => {
      const rows = document.querySelectorAll('#folder-rows .folder-row');
      rows.forEach((row, i) => {
        // 배당 복원
        const oddsEl = row.querySelector('.folder-odds');
        if (oddsEl && b.folderOdds && b.folderOdds[i] != null) {
          oddsEl.value = b.folderOdds[i];
          const impliedEl = row.querySelector('.folder-implied');
          if (impliedEl) impliedEl.textContent = `내재확률: ${(100 / b.folderOdds[i]).toFixed(1)}%`;
        }
        // 승률 복원
        const probEl = row.querySelector('.folder-prob');
        if (probEl && b.folderProbs && b.folderProbs[i] != null) probEl.value = b.folderProbs[i];
        // 종목 복원
        const sportEl = row.querySelector('.folder-sport');
        if (sportEl && b.folderSports && b.folderSports[i]) {
          sportEl.value = b.folderSports[i];
          const labelEl = sportEl.closest('div')?.querySelector('.folder-sport-label');
          if (labelEl) { labelEl.textContent = b.folderSports[i]; labelEl.style.color = 'var(--accent)'; }
        }
        // 형식 복원
        const typeEl = row.querySelector('.folder-type');
        if (typeEl && b.folderTypes && b.folderTypes[i]) typeEl.value = b.folderTypes[i];
        // 메모 복원
        const memo = b.folderMemos && b.folderMemos[i];
        if (memo && memo.trim()) {
          const memoWrap  = row.querySelector('.folder-memo-wrap');
          const memoInput = row.querySelector('.folder-memo');
          const memoBtn   = row.querySelector('.folder-memo-btn');
          if (memoWrap)  memoWrap.style.display = 'block';
          if (memoInput) memoInput.value = memo;
          if (memoBtn)   memoBtn.textContent = '📝 닫기';
        }
      });
      calcMultiEV();
    }, 50);
  }

  // EV 계산기 입력값 복원
  if (b.evInputs) {
    const ei = b.evInputs;
    const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== null) el.value = val; };
    setVal('ev-mahan',       ei.mahan);
    setVal('ev-mahan-prob',  ei.mahanProb);
    setVal('ev-yeokbae',     ei.yeokbae);
    setVal('ev-yeokbae-prob',ei.yeokbaeProb);
    setVal('ev-jeongbae',    ei.jeongbae);
    setVal('ev-jeongbae-prob',ei.jeongbaeProb);
    setVal('ev-plhan',       ei.plhan);
    setVal('ev-plhan-prob',  ei.plhanProb);
    setVal('ev-amount',      ei.evAmount);
    setVal('v-game',         ei.evGame);
    // EV 종목 복원
    if (ei.evSport) {
      window._evSport = ei.evSport;
      const badge = document.getElementById('ev-sport-selected-badge');
      const label = document.getElementById('ev-sport-selected-label');
      if (badge) badge.style.display = 'block';
      if (label) label.textContent = ei.evSport;
    }
    // 내재확률 표시 갱신
    ['mahan','yeokbae','jeongbae','plhan'].forEach(key => {
      const oddsVal = ei[key];
      const impliedEl = document.getElementById(`ev-${key}-implied`);
      if (impliedEl && oddsVal) {
        impliedEl.textContent = `내재확률: ${(100 / oddsVal).toFixed(1)}%`;
      }
    });
  }
  if (b.mode === 'single' && b.memo && b.memo.trim()) {
    const memoWrap  = document.getElementById('single-memo-wrap');
    const memoInput = document.getElementById('single-memo-input');
    const memoBtn   = document.getElementById('btn-single-memo');
    if (memoWrap)  memoWrap.style.display  = 'block';
    if (memoInput) memoInput.value = b.memo;
    if (memoBtn)   memoBtn.textContent = '📝 베팅 근거 닫기';
  }

  // 감정 태그 복원
  if (b.emotion) {
    document.querySelectorAll('.emotion-tag').forEach(t => {
      t.classList.remove('active-emotion');
      t.style.border = '1px solid var(--border)';
      t.style.color = 'var(--text3)';
      t.style.background = 'var(--bg3)';
    });
    const targetTag = document.querySelector(`.emotion-tag[data-val="${b.emotion}"]`);
    if (targetTag) selectEmotion(targetTag);
  }

  // 원칙 체크리스트 복원 (위반했던 원칙은 체크 해제)
  renderPrincipleChecklist();
  if (b.violations && b.violations.length > 0) {
    setTimeout(() => {
      document.querySelectorAll('#principle-checklist input[type=checkbox]').forEach(cb => {
        if (b.violations.includes(cb.dataset.principle)) cb.checked = false;
      });
      updateViolationHint();
    }, 50);
  }

  updatePreview();
  updateLossRatio();

  document.querySelector('#page-record .card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function duplicateBet(id) {
  const b = bets.find(b => String(b.id) === String(id));
  if (!b) return;

  clearRecordForm(); // 수정 모드 진입 안 함 — 새 기록으로 저장

  // 타이틀만 바꿔서 복사 중임을 표시
  const _ft = document.getElementById('form-title');
  if (_ft) _ft.innerHTML = '📋 <span>베팅 복사 — 수정 후 저장하면 새 기록 추가</span>';

  // 날짜는 오늘로 초기화
  const _rdt = document.getElementById('r-date');
  if (_rdt) _rdt.value = getKSTDateStr();

  setBetMode(b.mode || 'single');

  // 종목 복원 — hidden input + 배지
  const sportVal = (b.sport || '').trim();
  const hiddenSport = document.getElementById('r-sport');
  if (hiddenSport) hiddenSport.value = sportVal;
  const badge = document.getElementById('sport-selected-badge');
  const badgeLabel = document.getElementById('sport-selected-label');
  if (badge && sportVal) { badge.style.display = 'block'; if (badgeLabel) badgeLabel.textContent = sportVal; }

  const types = (b.type || '').split(', ').map(t => t.trim());
  document.querySelectorAll('#type-btns .sel-btn').forEach(btn => {
    if (types.includes(btn.dataset.val)) btn.classList.add('active');
  });

  if (b.mode === 'multi' && b.folderCount) {
    const _rfc = document.getElementById('r-folder-count'); if (_rfc) _rfc.value = b.folderCount;
    document.querySelectorAll('.folder-btn').forEach(btn => {
      const isActive = btn.dataset.val === b.folderCount;
      btn.style.borderColor = isActive ? 'var(--accent2)' : 'var(--border)';
      btn.style.background  = isActive ? 'rgba(255,107,53,0.12)' : 'var(--bg3)';
      btn.style.color       = isActive ? 'var(--accent2)' : 'var(--text2)';
    });
  }

  const gameEl = document.getElementById('r-game');
  if (gameEl) gameEl.value = b.game !== '-' ? (b.game || '') : '';

  document.getElementById('r-amount').value      = b.amount || '';
  document.getElementById('r-betman-odds').value = b.betmanOdds || '';

  setEvDirect(b.isValue || false);

  if (b.myProb) {
    const _rmp = document.getElementById('r-myprob'); if (_rmp) _rmp.value = b.myProb;
    const mpd = document.getElementById('r-myprob-direct'); if (mpd) mpd.value = b.myProb;
  }

  selectResult('PENDING'); // 결과는 항상 미결로 초기화

  // 단폴 메모/태그 복사
  if (b.mode === 'single' && b.memo && b.memo.trim()) {
    const memoWrap  = document.getElementById('single-memo-wrap');
    const memoInput = document.getElementById('single-memo-input');
    const memoBtn   = document.getElementById('btn-single-memo');
    if (memoInput) memoInput.value = b.memo;
    if (memoWrap)  memoWrap.style.display = 'block';
    if (memoBtn)   { memoBtn.style.color = 'var(--accent)'; memoBtn.style.borderColor = 'rgba(0,229,255,0.4)'; }
    const hiddenMemo = document.getElementById('r-memo');
    if (hiddenMemo) hiddenMemo.value = b.memo;
  }

  if (b.mode === 'multi') {
    setTimeout(() => {
      const rows = document.querySelectorAll('#folder-rows .folder-row');
      rows.forEach((row, i) => {
        const oddsEl = row.querySelector('.folder-odds');
        if (oddsEl && b.folderOdds && b.folderOdds[i] != null) {
          oddsEl.value = b.folderOdds[i];
          const impliedEl = row.querySelector('.folder-implied');
          if (impliedEl) impliedEl.textContent = `내재확률: ${(100 / b.folderOdds[i]).toFixed(1)}%`;
        }
        const probEl = row.querySelector('.folder-prob');
        if (probEl && b.folderProbs && b.folderProbs[i] != null) probEl.value = b.folderProbs[i];
        const sportEl = row.querySelector('.folder-sport');
        if (sportEl && b.folderSports && b.folderSports[i]) {
          sportEl.value = b.folderSports[i];
          const labelEl = sportEl.closest('div')?.querySelector('.folder-sport-label');
          if (labelEl) { labelEl.textContent = b.folderSports[i]; labelEl.style.color = 'var(--accent)'; }
        }
        // 태그/메모 복사
        const memo = b.folderMemos && b.folderMemos[i];
        if (memo) {
          const memoWrap = row.querySelector('.folder-memo-wrap');
          const memoInput = row.querySelector('.folder-memo');
          const memoBtn = row.querySelector('.folder-memo-btn');
          if (memoInput) memoInput.value = memo;
          if (memoWrap) memoWrap.style.display = 'block';
          if (memoBtn) { memoBtn.style.color = 'var(--accent)'; memoBtn.style.borderColor = 'rgba(0,229,255,0.4)'; }
        }
      });
      calcMultiEV();
    }, 50);
  }

  if (b.evInputs) {
    const ei = b.evInputs;
    const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== null) el.value = val; };
    setVal('ev-mahan', ei.mahan); setVal('ev-mahan-prob', ei.mahanProb);
    setVal('ev-yeokbae', ei.yeokbae); setVal('ev-yeokbae-prob', ei.yeokbaeProb);
    setVal('ev-jeongbae', ei.jeongbae); setVal('ev-jeongbae-prob', ei.jeongbaeProb);
    setVal('ev-plhan', ei.plhan); setVal('ev-plhan-prob', ei.plhanProb);
    setVal('ev-amount', ei.evAmount); setVal('v-game', ei.evGame);
    if (ei.evSport) {
      window._evSport = ei.evSport;
      const badge = document.getElementById('ev-sport-selected-badge');
      const label = document.getElementById('ev-sport-selected-label');
      if (badge) badge.style.display = 'block';
      if (label) label.textContent = ei.evSport;
    }
  }

  updatePreview();
  updateLossRatio();
  document.querySelector('#page-record .card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearAll() {
  if (!confirm('⚠️ 경고: 모든 베팅 기록이 영구 삭제됩니다.\n\n복구가 불가능합니다. 정말 삭제하시겠습니까?')) return;
  if (!confirm('마지막 확인입니다.\n전체 베팅 기록 ' + bets.length + '건을 삭제합니다.')) return;
  saveBets([], { refresh: false });
  // 필터 초기화
  const fs = document.getElementById('filter-sport');   if (fs) fs.value = 'ALL';
  const fr = document.getElementById('filter-result');  if (fr) fr.value = 'ALL';
  const fd = document.getElementById('filter-daterange'); if (fd) fd.value = 'ALL';
  const ff = document.getElementById('filter-folder');  if (ff) ff.value = 'ALL';
  updateAll();
}


let glossaryActiveCat = 'all';

function openGlossary() {
  const modal = document.getElementById('glossary-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  renderGlossary('all', '');
}

function closeGlossary() {
  const modal = document.getElementById('glossary-modal');
  if (modal) modal.style.display = 'none';
}

function filterGlossary(q) {
  renderGlossary(glossaryActiveCat, q);
}

function filterGlossaryCat(cat, el) {
  glossaryActiveCat = cat;
  document.querySelectorAll('.gcat-btn').forEach(b => {
    b.style.background = 'var(--bg3)';
    b.style.color = 'var(--text2)';
    b.style.fontWeight = '400';
  });
  if (el) {
    el.style.background = 'var(--accent)';
    el.style.color = '#000';
    el.style.fontWeight = '700';
  }
  const q = document.getElementById('glossary-search');
  renderGlossary(cat, q ? q.value : '');
}

function renderGlossary(cat, q) {
  const list = document.getElementById('glossary-list');
  if (!list) return;
  const query = (q || '').toLowerCase();
  const filtered = GLOSSARY.filter(g =>
    (cat === 'all' || g.cat === cat) &&
    (!query || g.term.toLowerCase().includes(query) || g.short.toLowerCase().includes(query) || g.body.toLowerCase().includes(query))
  );

  const catColors = { basic:'#64b5f6', ev:'#ffd700', stats:'#00e676', bias:'#ff9800', risk:'#f48fb1' };
  const catNames  = { basic:'기초 개념', ev:'EV / 기댓값', stats:'통계 지표', bias:'편향 / 심리', risk:'자금관리' };

  if (!filtered.length) {
    list.innerHTML = '<div style="color:var(--text3);font-size:13px;text-align:center;padding:30px 0;">검색 결과 없음</div>';
    return;
  }

  list.innerHTML = filtered.map(g => `
    <div style="background:var(--bg3);border-radius:10px;padding:16px;border-left:3px solid ${catColors[g.cat]||'#888'};">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="font-size:14px;font-weight:800;color:var(--text1);">${g.term}</span>
        <span style="font-size:10px;background:rgba(255,255,255,0.07);color:${catColors[g.cat]||'#888'};padding:2px 8px;border-radius:10px;font-weight:600;">${catNames[g.cat]||''}</span>
      </div>
      <div style="font-size:12px;color:var(--accent);font-weight:600;margin-bottom:7px;">→ ${g.short}</div>
      <div style="font-size:12px;color:var(--text3);line-height:1.8;">${g.body}</div>
    </div>
  `).join('');
}

// 모달 외부 클릭 닫기
document.addEventListener('click', function(e) {
  const modal = document.getElementById('glossary-modal');
  if (modal && modal.style.display === 'flex' && e.target === modal) closeGlossary();
});


// restore 로그 — 최근 20건 유지

// 결과 모달 — result / rollback / expired 세 상태 처리


// 롤백 실행


// ========== RENDER TABLE ==========
// ── 페이지네이션 상태 ──
function getActivePage() {
  const active = document.querySelector('.page.active');
  return active ? active.id.replace('page-', '') : 'dashboard';
}

// ========== PRED PAGINATION ==========
const FIB_SEQ = [1,2,3,5,8,13,21,34,55,89,144,233,377];
const FIB_PAGE_SIZE = 5;
let _fibPage = 1;

function fibGoPage(dir) {
  _fibPage += dir;
  updateFibonacci();
}

function fibGetBase() {
  const saved = Storage.get(KEYS.FIB_BASE);
  return saved ? parseInt(saved) : 1000;
}

function fibUpdateBase() {
  const input = document.getElementById('fib-base-input');
  const val = parseInt(input?.value);
  if (val && val >= 100) {
    Storage.set(KEYS.FIB_BASE, val);
    updateFibonacci();
  } else if (input && !input.value) {
    // 입력 지워지면 저장값 기준으로 재표시
    updateFibonacci();
  }
}

function updateFibonacci() {
  const base = fibGetBase();
  const baseEl = document.getElementById('fib-base-display');
  if (baseEl) baseEl.textContent = base.toLocaleString('ko-KR') + '원';
  const baseInput = document.getElementById('fib-base-input');
  if (baseInput && !baseInput.value) baseInput.placeholder = base.toLocaleString('ko-KR');

  // 베팅 기록에서 최근 연패 시리즈 추출
  const resolved = bets.filter(b => b.result !== 'PENDING').sort((a,b) => new Date(a.savedAt) - new Date(b.savedAt));

  // 현재 연패 계산 (뒤에서부터)
  let streak = 0;
  for (let i = resolved.length - 1; i >= 0; i--) {
    if (resolved[i].result === 'LOSE') streak++;
    else break;
  }

  // 전체 최고 연패
  let maxStreak = 0, curStreak = 0;
  resolved.forEach(b => {
    if (b.result === 'LOSE') { curStreak++; maxStreak = Math.max(maxStreak, curStreak); }
    else curStreak = 0;
  });

  // 현재 시리즈 (마지막 WIN 이후 ~ 현재)
  let seriesStart = resolved.length;
  for (let i = resolved.length - 1; i >= 0; i--) {
    if (resolved[i].result === 'WIN') { seriesStart = i + 1; break; }
    if (i === 0) seriesStart = 0;
  }
  const series = resolved.slice(seriesStart);

  // 누적 손실 계산
  const totalLoss = series.filter(b => b.result === 'LOSE').reduce((s, b) => s + (b.amount || 0), 0);

  // 다음 권장 배팅액 (피보나치 기준)
  const fibIdx = Math.min(streak, FIB_SEQ.length - 1);
  const nextBet = FIB_SEQ[fibIdx] * base;

  // 만회 포인트 계산
  // POINT 1: 손익분기 — (누적손실 + 다음배팅액) / 다음배팅액
  // 연패도 없고 손실도 없으면 의미없으므로 null 처리
  const breakEven = (nextBet > 0 && (totalLoss > 0 || streak > 0)) ? ((totalLoss + nextBet) / nextBet) : null;
  // POINT 2: 순수익 전환 — 손익분기 + 초기단위 1개분 마진
  const profitPoint = breakEven ? (breakEven + (base / nextBet)) : null;

  // UI 업데이트
  const streakEl = document.getElementById('fib-streak');
  if (streakEl) { streakEl.textContent = streak; streakEl.style.color = streak >= 5 ? 'var(--red)' : streak >= 3 ? 'var(--gold)' : '#a78bfa'; }
  const maxEl = document.getElementById('fib-max-streak');
  if (maxEl) maxEl.textContent = maxStreak;
  const lossEl = document.getElementById('fib-loss');
  if (lossEl) lossEl.textContent = totalLoss > 0 ? '-' + totalLoss.toLocaleString('ko-KR') + '원' : '0원';
  const nextEl = document.getElementById('fib-next-bet');
  if (nextEl) nextEl.textContent = nextBet.toLocaleString('ko-KR') + '원';
  const beEl = document.getElementById('fib-break-even');
  if (beEl) beEl.textContent = breakEven ? breakEven.toFixed(2) : '—';
  const ppEl = document.getElementById('fib-profit');
  if (ppEl) ppEl.textContent = profitPoint ? profitPoint.toFixed(2) : '—';

  // 수열 진행 바
  const barEl = document.getElementById('fib-sequence-bar');
  if (barEl) {
    const show = Math.max(7, streak + 2);
    barEl.innerHTML = FIB_SEQ.slice(0, Math.min(show, FIB_SEQ.length)).map((v, i) => {
      const amt = v * base;
      const isPast = i < streak;
      const isCurrent = i === streak;
      const bg = isPast ? 'rgba(255,59,92,0.15)' : isCurrent ? 'rgba(167,139,250,0.2)' : 'var(--bg3)';
      const border = isPast ? '1px solid rgba(255,59,92,0.4)' : isCurrent ? '2px solid #a78bfa' : '1px solid var(--border)';
      const color = isPast ? 'var(--red)' : isCurrent ? '#a78bfa' : 'var(--text3)';
      const label = isPast ? '✗' : isCurrent ? '▶' : '';
      const amtStr = amt >= 10000 ? (amt/10000).toFixed(amt%10000===0?0:1)+'만' : amt.toLocaleString('ko-KR')+'원';
      return `<div style="background:${bg};border:${border};border-radius:6px;padding:8px 10px;text-align:center;min-width:56px;">
        <div style="font-size:9px;color:${color};font-weight:700;margin-bottom:2px;">${label || (i+1)+'회'}</div>
        <div class="mono" style="font-size:11px;color:${color};font-weight:${isCurrent?'700':'400'};">${amtStr}</div>
      </div>`;
    }).join('');
  }

  // 현재 시리즈 테이블 (페이지네이션)
  const tbody = document.getElementById('fib-history-table');
  if (tbody) {
    if (!series.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px;">현재 시리즈 기록 없음</td></tr>';
      const pi = document.getElementById('fib-page-info'); if(pi) pi.textContent = '—';
      const pn = document.getElementById('fib-page-num'); if(pn) pn.textContent = '1 / 1';
    } else {
      const totalPages = Math.max(1, Math.ceil(series.length / FIB_PAGE_SIZE));
      _fibPage = Math.min(Math.max(1, _fibPage), totalPages);
      const pageItems = series.slice((_fibPage-1)*FIB_PAGE_SIZE, _fibPage*FIB_PAGE_SIZE);
      const startIdx = (_fibPage-1)*FIB_PAGE_SIZE;

      let cumLoss = 0;
      // 누적 손실은 전체 시리즈 기준으로 미리 계산
      const cumLossArr = [];
      let cl = 0;
      series.forEach(b => { if(b.result==='LOSE') cl += (b.amount||0); cumLossArr.push(cl); });

      tbody.innerHTML = pageItems.map((b, pi) => {
        const i = startIdx + pi;
        const isLose = b.result === 'LOSE';
        const fibAmt = FIB_SEQ[Math.min(i, FIB_SEQ.length-1)] * base;
        const resultColor = isLose ? 'var(--red)' : 'var(--green)';
        const resultLabel = isLose ? '✗ 미적중' : '✓ 적중';
        return `<tr>
          <td style="color:var(--text3);">${i+1}회</td>
          <td style="color:var(--text3);font-size:11px;">${(b.savedAt||'').slice(0,10)}</td>
          <td style="color:var(--text2);font-size:11px;">${escHtml(b.match||'—')}</td>
          <td class="mono" style="color:#a78bfa;">${fibAmt.toLocaleString('ko-KR')}</td>
          <td class="mono" style="color:var(--text2);">${(b.betmanOdds||0).toFixed(2)}</td>
          <td style="color:${resultColor};font-weight:700;">${resultLabel}</td>
          <td class="mono" style="color:${isLose?'var(--red)':'var(--text3)'};">${isLose?'-'+cumLossArr[i].toLocaleString('ko-KR')+'원':'—'}</td>
        </tr>`;
      }).join('');

      const pi = document.getElementById('fib-page-info');
      if(pi) pi.textContent = `${(_fibPage-1)*FIB_PAGE_SIZE+1}–${Math.min(_fibPage*FIB_PAGE_SIZE, series.length)} / 총 ${series.length}건`;
      const pn = document.getElementById('fib-page-num');
      if(pn) pn.textContent = `${_fibPage} / ${totalPages}`;
      const prevBtn = document.getElementById('fib-prev-btn');
      if(prevBtn) prevBtn.disabled = _fibPage <= 1;
      const nextBtn = document.getElementById('fib-next-btn');
      if(nextBtn) nextBtn.disabled = _fibPage >= totalPages;
    }
  }
}

function updateAll() {
  // TEMP: migration fallback — refreshAllUI 통합 중. refreshAllUI 단일 진입점으로 완전 이관 완료.
  // 이 wrapper는 기존 호출처 호환성을 위해 유지. 직접 호출 제거 시 삭제 가능.
  if (typeof refreshAllUI === 'function') { refreshAllUI(); return; }

  // fallback: refreshAllUI 미로드 시 안전망 (정상 동작에선 도달하지 않음)
  try { calcSystemState(); } catch(e) { console.warn('calcSystemState error:', e); }
  renderTable();
  renderRecentTable();
}

// ── 대시보드 KPI 카드 갱신 — scope 전환 시에도 호출됨 ──
// refreshAllUI() + updateAll() 양쪽에서 호출. _SS 단일 소스.
function updateGameSuggestions() {
  // 이전 팀명/경기명 목록 수집 (슬래시로 분리)
  window._gameSuggestList = getGameSuggestList();
}

function getGameSuggestList() {
  const allBets = [...bets];
  const vaultRaw = Storage.get(KEYS.VAULT);
  if (vaultRaw) { try { allBets.push(...JSON.parse(vaultRaw)); } catch(e) {} }
  return [...new Set(
    allBets.flatMap(b => (b.game && b.game !== '-')
      ? b.game.split('/').map(s => s.trim()).filter(s => s.length > 0)
      : []
    )
  )].sort();
}

function onGameInput(input) {
  const val = input.value;
  const slashIdx = val.lastIndexOf('/');
  const current = slashIdx >= 0 ? val.slice(slashIdx + 1).trimStart() : val;
  const box = document.getElementById('game-suggest-box');
  if (!box) return;

  if (!current || current.length < 1) { box.style.display = 'none'; return; }

  const list = window._gameSuggestList || getGameSuggestList();
  const matches = list.filter(n => n.includes(current)).slice(0, 8);

  if (!matches.length) { box.style.display = 'none'; return; }

  box.innerHTML = matches.map((n, i) => `
    <div data-idx="${i}"
      style="padding:8px 12px;font-size:13px;color:var(--text2);cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05);"
      onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      ${escHtml(n)}
    </div>`).join('');
  box.querySelectorAll('[data-idx]').forEach(el => {
    const idx = Number(el.dataset.idx);
    el.addEventListener('click', () => selectGameSuggest(matches[idx]));
  });
  box.style.display = 'block';
}

function selectGameSuggest(name) {
  const input = document.getElementById('r-game');
  if (!input) return;
  const val = input.value;
  const slashIdx = val.lastIndexOf('/');
  if (slashIdx >= 0) {
    input.value = val.slice(0, slashIdx + 1) + name;
  } else {
    input.value = name;
  }
  closeGameSuggest();
  input.focus();
}

function closeGameSuggest() {
  const box = document.getElementById('game-suggest-box');
  if (box) box.style.display = 'none';
}

let _folderResultBetId = null;

function openFolderResultModal(id) {
  const bet = bets.find(b => String(b.id) === String(id));
  if (!bet) { resolvebet(id, 'LOSE'); return; }

  // 폴더 수 파악 — folderOdds 우선, 없으면 folderCount
  const folderCount = (bet.folderOdds && bet.folderOdds.length > 0)
    ? bet.folderOdds.length
    : (parseInt(bet.folderCount) || 0);

  if (folderCount === 0) { resolvebet(id, 'LOSE'); return; }

  _folderResultBetId = id;
  const rows = document.getElementById('folder-result-rows');
  if (!rows) return;
  const sports = bet.sport ? bet.sport.split(', ') : [];
  const types  = bet.type  ? bet.type.split(', ')  : [];
  rows.innerHTML = Array.from({ length: folderCount }, (_, i) => {
    const odds  = bet.folderOdds && bet.folderOdds[i] ? bet.folderOdds[i] : '—';
    const sport = (bet.folderSports && bet.folderSports[i]) || sports[i] || sports[0] || '—';
    const type  = (bet.folderTypes && bet.folderTypes[i]) || types[i] || types[0] || '—';
    const label = `F${i+1} · ${sport} ${type} · ${odds}배`;
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg3);border-radius:8px;border:1px solid var(--border);">
      <span style="font-size:12px;color:var(--text2);">${label}</span>
      <div style="display:flex;gap:6px;">
        <button id="fr-win-${i}" onclick="setFolderResult(${i},'WIN')"
          style="padding:4px 12px;border-radius:6px;border:2px solid var(--border);background:var(--bg3);color:var(--text3);font-size:11px;font-weight:700;cursor:pointer;transition:all 0.2s;">✅ 적중</button>
        <button id="fr-lose-${i}" onclick="setFolderResult(${i},'LOSE')"
          style="padding:4px 12px;border-radius:6px;border:2px solid var(--border);background:var(--bg3);color:var(--text3);font-size:11px;font-weight:700;cursor:pointer;transition:all 0.2s;">❌ 미적중</button>
      </div>
    </div>`;
  }).join('');
  if (bet.folderResults) {
    bet.folderResults.forEach((r, i) => { if (r) setFolderResult(i, r); });
  }
  const modal = document.getElementById('folder-result-modal');
  if (modal) modal.style.display = 'flex';
}

function setFolderResult(idx, result) {
  const winBtn  = document.getElementById(`fr-win-${idx}`);
  const loseBtn = document.getElementById(`fr-lose-${idx}`);
  if (!winBtn || !loseBtn) return;
  if (result === 'WIN') {
    winBtn.style.borderColor  = 'var(--green)'; winBtn.style.background  = 'rgba(0,230,118,0.15)'; winBtn.style.color  = 'var(--green)';
    loseBtn.style.borderColor = 'var(--border)'; loseBtn.style.background = 'var(--bg3)'; loseBtn.style.color = 'var(--text3)';
  } else {
    loseBtn.style.borderColor = 'var(--red)';   loseBtn.style.background  = 'rgba(255,59,92,0.15)'; loseBtn.style.color  = 'var(--red)';
    winBtn.style.borderColor  = 'var(--border)'; winBtn.style.background  = 'var(--bg3)'; winBtn.style.color  = 'var(--text3)';
  }
}

function confirmFolderResults() {
  const bet = getBets().find(b => b.id === _folderResultBetId);
  if (!bet) return;
  const folderCount = bet.folderOdds ? bet.folderOdds.length : 0;
  const results = [];
  for (let i = 0; i < folderCount; i++) {
    const winBtn = document.getElementById(`fr-win-${i}`);
    const loseBtn = document.getElementById(`fr-lose-${i}`);
    if (loseBtn && loseBtn.style.color === 'var(--red)') results.push('LOSE');
    else if (winBtn && winBtn.style.color === 'var(--green)') results.push('WIN');
    else results.push(null); // 미선택
  }
  const next = getBets().map(b =>
    b.id === _folderResultBetId
      ? { ...b, folderResults: results, result: 'LOSE', profit: -b.amount }
      : b
  );
  saveBets(next, { refresh: false });
  closeFolderResultModal();
  updateAll();
  renderTable();
}

function closeFolderResultModal() {
  const modal = document.getElementById('folder-result-modal');
  if (modal) modal.style.display = 'none';
  _folderResultBetId = null;
}

function setProfitFilter(days) {
  window._profitFilterDays = days;
  ['pcf-30','pcf-90','pcf-all'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.style.borderColor = 'var(--border)';
    btn.style.background  = 'var(--bg3)';
    btn.style.color       = 'var(--text3)';
  });
  const activeId = days === 30 ? 'pcf-30' : days === 90 ? 'pcf-90' : 'pcf-all';
  const activeBtn = document.getElementById(activeId);
  if (activeBtn) {
    activeBtn.style.borderColor = 'var(--accent)';
    activeBtn.style.background  = 'rgba(0,229,255,0.15)';
    activeBtn.style.color       = 'var(--accent)';
  }
  updateCharts();
}

// ========== 폴더별 결과 소급입력 ==========
