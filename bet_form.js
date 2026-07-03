// ============================================================
// ui/bet_form.js
// 담당: 베팅 입력 폼 UI + 입력 로직
//
// 의존 (전역 — 허용):
//   getActiveCorrFactor, betmanRound (compute/ev.js)
//   getCalibrated, toProb, getAdjustedProb (전역)
//   renderDecisionBlock, clearDecisionBlock (ui/ev_panel.js)
//   appSettings, window._SS (전역 상태)
// 금지:
//   getBets(), saveBets(), localStorage
// ============================================================

function setBetMode(mode) {
  const _rbm = document.getElementById('r-betmode'); if (_rbm) _rbm.value = mode;
  const isSingle = mode === 'single';
  const _ms = document.getElementById('mode-single');
  if (_ms) { _ms.style.borderColor = isSingle ? 'var(--accent)' : 'var(--border)'; _ms.style.background = isSingle ? 'rgba(0,229,255,0.12)' : 'var(--bg3)'; _ms.style.color = isSingle ? 'var(--accent)' : 'var(--text2)'; }
  // 다폴 전환 시 다폴 EV 입력창 토글
  const multiWrap = document.getElementById('multi-ev-wrap');
  const myprobWrap = document.getElementById('myprob-direct-wrap');
  if (multiWrap) multiWrap.style.display = isSingle ? 'none' : 'block';
  if (myprobWrap) myprobWrap.style.display = isSingle ? 'block' : 'none';
  if (!isSingle) setTimeout(renderFolderRows, 0);
  const _mm = document.getElementById('mode-multi');
  if (_mm) { _mm.style.borderColor = !isSingle ? 'var(--accent2)' : 'var(--border)'; _mm.style.background = !isSingle ? 'rgba(255,107,53,0.12)' : 'var(--bg3)'; _mm.style.color = !isSingle ? 'var(--accent2)' : 'var(--text2)'; }
  const _mhs = document.getElementById('mode-hint-single'); if (_mhs) _mhs.style.display = isSingle ? 'block' : 'none';
  const _mhm = document.getElementById('mode-hint-multi');  if (_mhm) _mhm.style.display = !isSingle ? 'block' : 'none';
  const _fcw = document.getElementById('folder-count-wrap'); if (_fcw) _fcw.style.display = !isSingle ? 'block' : 'none';
  const _olh = document.getElementById('odds-label-hint');   if (_olh) _olh.textContent = isSingle ? '(단폴 배당)' : '(조합 최종 배당)';
  if (isSingle) {
    const _rfc = document.getElementById('r-folder-count'); if (_rfc) _rfc.value = '';
    document.querySelectorAll('.folder-btn').forEach(b => {
      b.style.borderColor = 'var(--border)';
      b.style.background  = 'var(--bg3)';
      b.style.color       = 'var(--text2)';
    });
  }
  if (isSingle) {
    ['sport','type'].forEach(group => {
      const actives = document.querySelectorAll(`#${group}-btns .sel-btn.active`);
      actives.forEach((btn, i) => { if (i > 0) btn.classList.remove('active'); });
    });
  }
}


function toggleSel(btn, group) {
  const mode = document.getElementById('r-betmode').value;
  if (mode === 'single') {
    // 단폴: 해당 그룹에서 하나만 선택
    document.querySelectorAll(`#${group}-btns .sel-btn`).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  } else {
    // 다폴더: 토글
    btn.classList.toggle('active');
  }
}


function selectFolderCount(btn) {
  document.querySelectorAll('.folder-btn').forEach(b => {
    b.style.borderColor = 'var(--border)';
    b.style.background  = 'var(--bg3)';
    b.style.color       = 'var(--text2)';
  });
  btn.style.borderColor = 'var(--accent2)';
  btn.style.background  = 'rgba(255,107,53,0.15)';
  btn.style.color       = 'var(--accent2)';

  const val = btn.dataset.val;
  const _rfc = document.getElementById('r-folder-count'); if (_rfc) _rfc.value = val;

  // 폴더 행 초기 개수: 2→2, 3→3, 4+→4
  const initCount = val === '4+' ? 4 : parseInt(val) || 2;

  // folder-rows 초기화 후 initCount만큼 생성
  const container = document.getElementById('folder-rows');
  if (container) {
    container.innerHTML = '';
    for (let i = 0; i < initCount; i++) container.appendChild(makeFolderRow(i));
  }
  updateFolderUI();
  calcMultiEV();
}


function getSelectedVals(group) {
  if (group === 'sport') {
    const hidden = document.getElementById('r-sport');
    const val = hidden && hidden.value ? hidden.value.trim() : '';
    return val ? [val] : [];
  }
  if (group === 'type') {
    // 팝업 선택 방식 우선, 없으면 sel-btn active
    if (window._selectedType) return [window._selectedType];
    return [...document.querySelectorAll(`#type-btns .sel-btn.active`)].map(b => b.dataset.val);
  }
  return [...document.querySelectorAll(`#${group}-btns .sel-btn.active`)].map(b => b.dataset.val);
}


function updatePreview() {
  const amount = parseFloat(document.getElementById('r-amount').value);
  const odds = parseFloat(document.getElementById('r-betman-odds').value);
  const el = document.getElementById('r-preview');
  if (amount > 0 && odds > 1) {
    const win = Math.round(amount * (odds - 1));
    const total = Math.round(amount * odds);
    el.innerHTML = `적중 시 <span style="color:var(--green);font-family:'JetBrains Mono',monospace;font-weight:700;">+₩${win.toLocaleString()}</span> 수령 <span style="color:var(--text3);">(총 ₩${total.toLocaleString()})</span>`;
  } else {
    el.textContent = '배당과 금액을 입력하면 예상 수익이 표시됩니다.';
    el.style.color = 'var(--text3)';
  }
}


// ===== 원웨이 Kelly 판단 블록 =====

// ── compute 레이어 ────────────────────────────────────────────

/**
 * computeLossRatio(amount, seed)
 * 순수 함수 — DOM 접근 없음
 * @returns { pct, bg, border, color, icon, msg }
 */
function computeLossRatio(amount, seed) {
  const pct   = amount / seed * 100;
  const limit = 2;
  if (pct <= limit) {
    return { pct, bg: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.3)',
             color: 'var(--green)', icon: '✅', msg: `권장 한도(${limit}%) 이내` };
  }
  if (pct <= limit * 1.5) {
    return { pct, bg: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.3)',
             color: 'var(--gold)', icon: '⚠️', msg: `권장 한도(${limit}%) 초과 — 베팅금 축소 고려` };
  }
  return { pct, bg: 'rgba(255,59,92,0.10)', border: '1px solid rgba(255,59,92,0.4)',
           color: 'var(--red)', icon: '🔴', msg: `위험 구간 — 한 번에 시드의 ${pct.toFixed(1)}% 노출` };
}

/**
 * computeEVDisplay(probFrac, odds, pCalib, acf)
 * 순수 함수 — DOM 접근 없음
 * pCalib: getCalibrated(probFrac) 결과 (어댑터에서 주입)
 * acf:    getActiveCorrFactor()   결과 (어댑터에서 주입)
 * @returns { ev, evAdj, evFinal, isOn, pAdj }
 */
function computeEVDisplay(probFrac, odds, pCalib, acf) {
  const ev    = probFrac * (odds - 1) - (1 - probFrac);
  const pAdj  = pCalib * Math.min(acf, 1.0);
  const evAdj = pAdj * (odds - 1) - (1 - pAdj);
  const isOn  = acf < 0.999 || Math.abs(pCalib - probFrac) > 0.001;
  return { ev, evAdj, evFinal: isOn ? evAdj : ev, isOn, pAdj };
}

/**
 * computeOneWayDecision(prob, odds, ss, seed, multiplier)
 * 순수 함수 — DOM 접근 없음
 * multiplier: getKellyMultiplier() 결과 (어댑터에서 주입)
 * @returns { adjResult, decision, pAdj, ev, kellyFrac, finalBet, verdict }
 */
function computeOneWayDecision(prob, odds, ss, seed, multiplier) {
  const adjResult = (typeof getAdjustedProbLive === 'function')
    ? getAdjustedProbLive({
        myProb:     prob,
        buckets:    ss?.calibBuckets,
        corrFactor: ss?.corrFactor,
        totalN:     ss?.n,
      })
    : { adjustedProb: prob, source: 'RAW', delta: 0, bucketCount: 0 };

  const decision = (typeof getBetDecisionLive === 'function')
    ? getBetDecisionLive({
        myProb:    prob,
        odds,
        recentEce: ss?.recentEce,
        totalEce:  ss?.ece,
      })
    : { allow: true, kellyFactor: 1.0, reason: 'OK', label: 'OK',
        labelColor: 'var(--green)', desc: '', confidenceLevel: 'HIGH' };

  // adjustedProb % → frac (계산 전용 — 저장 금지)
  const pAdj = Math.max(0, Math.min(
    typeof toProb === 'function' ? toProb(adjResult.adjustedProb) : adjResult.adjustedProb / 100,
    0.99
  ));

  const kellyFracRaw = (odds * pAdj - 1) / (odds - 1);
  const kellyFrac    = Math.max(0, kellyFracRaw);
  const ev           = pAdj * (odds - 1) - (1 - pAdj);

  const base     = (seed || 0) / 12;
  const rawBet   = Math.max(0, Math.floor(base * kellyFrac * multiplier));
  const finalBet = decision.allow ? Math.floor(rawBet * decision.kellyFactor) : 0;

  const verdict = !decision.allow
    ? 'BLOCK'
    : (ev <= 0 || finalBet <= 0 ? 'PASS' : (ss?.verdict || 'WAIT'));

  return { adjResult, decision, pAdj, ev, kellyFrac, finalBet, verdict };
}

// ── render 레이어 ─────────────────────────────────────────────

/**
 * renderLossRatioDisplay(display, amount, seed, lossResult)
 * DOM 쓰기 전담 — 계산 로직 0줄
 */
function renderLossRatioDisplay(display, amount, seed, lossResult) {
  display.style.background = lossResult.bg;
  display.style.border     = lossResult.border;
  display.style.color      = lossResult.color;
  display.innerHTML =
    `${lossResult.icon} 미적중 시 시드의 <strong>${lossResult.pct.toFixed(1)}%</strong> 손실` +
    ` (₩${amount.toLocaleString()} / ₩${seed.toLocaleString()}) &nbsp;—&nbsp; ${lossResult.msg}`;
}

/**
 * renderEVHint(evHintEl, guideEl, calibHintEl, evResult, probFrac)
 * DOM 쓰기 전담 — 계산 로직 0줄
 */
function renderEVHint(evHintEl, guideEl, calibHintEl, evResult, probFrac) {
  const { ev, evAdj, evFinal, isOn, pAdj } = evResult;
  if (isOn) {
    evHintEl.innerHTML =
      `<span style="color:var(--text3);text-decoration:line-through;font-size:11px;">${ev>=0?'+':''}${(ev*100).toFixed(1)}%</span>` +
      ` <span>${evAdj>=0?'+':''}${(evAdj*100).toFixed(1)}%</span>` +
      ` <span style="font-size:10px;color:var(--gold);">📐보정</span>`;
  } else {
    evHintEl.textContent = (ev >= 0 ? '+' : '') + (ev * 100).toFixed(1) + '%';
  }
  evHintEl.style.color = evFinal >= 0.05 ? 'var(--green)' : evFinal >= 0 ? 'var(--gold)' : 'var(--red)';
  evHintEl.parentElement.style.borderColor = evFinal >= 0.05
    ? 'rgba(0,230,118,0.4)' : evFinal >= 0
    ? 'rgba(255,215,0,0.3)' : 'rgba(255,59,92,0.3)';
  if (calibHintEl) {
    if (isOn) {
      calibHintEl.style.display = 'block';
      calibHintEl.innerHTML =
        `원래 확률 <span style="color:var(--text2);">${(probFrac*100).toFixed(1)}%</span>` +
        ` → 보정 확률 <span style="color:var(--gold);font-weight:700;">${(pAdj*100).toFixed(1)}%</span>`;
    } else {
      calibHintEl.style.display = 'none';
    }
  }
}

/**
 * renderOneWayDecision(decResult, owProb, ss)
 * DOM 쓰기 + renderDecisionBlock 호출 전담 — 계산 로직 0줄
 */
function renderOneWayDecision(decResult, owProb, ss) {
  const { adjResult, decision, pAdj, ev, finalBet, verdict } = decResult;

  // adjustedProb 설명 UI
  const adjProbEl   = document.getElementById('r-adjusted-prob');
  const adjProbWrap = document.getElementById('r-adjusted-prob-wrap');
  if (adjProbEl && adjProbWrap) {
    if (Math.abs(adjResult.delta) > 0.3) {
      adjProbWrap.style.display = 'block';
      const deltaColor  = adjResult.delta < 0 ? 'var(--red)' : 'var(--green)';
      const deltaSign   = adjResult.delta > 0 ? '+' : '';
      const sourceLabel = adjResult.source === 'BUCKET'
        ? `구간 실적 기반 (${adjResult.bucketCount}건)`
        : adjResult.source === 'CORR' ? '전체 과신 보정' : '';
      let reasonText = sourceLabel;
      if (ss?.recentEce > 8)       reasonText = `최근 ECE ${ss.recentEce.toFixed(1)}% 상승`;
      else if (ss?.ece > 8)        reasonText = `ECE ${ss.ece.toFixed(1)}% — 분수 보정`;
      adjProbEl.innerHTML =
        `<span style="color:var(--text3);text-decoration:line-through;font-size:11px;">${owProb.toFixed(1)}%</span>` +
        ` → <span style="color:${deltaColor};font-weight:700;">${adjResult.adjustedProb.toFixed(1)}%</span>` +
        ` <span style="color:${deltaColor};font-size:11px;">(${deltaSign}${adjResult.delta.toFixed(1)}%)</span>` +
        (reasonText ? ` <span style="font-size:10px;color:var(--text3);margin-left:4px;">${reasonText}</span>` : '');
    } else {
      adjProbWrap.style.display = 'none';
    }
  }

  // Decision Gate UI
  const decGateEl = document.getElementById('r-decision-gate');
  if (decGateEl) {
    decGateEl.style.display = 'block';
    if (!decision.allow) {
      decGateEl.style.background = 'rgba(255,59,92,0.10)';
      decGateEl.style.border     = '1px solid rgba(255,59,92,0.4)';
      decGateEl.innerHTML =
        `<span style="color:var(--red);font-weight:700;">🚫 베팅 차단</span>` +
        ` <span style="color:var(--text3);font-size:11px;">${decision.desc}</span>`;
    } else if (decision.kellyFactor < 1.0) {
      decGateEl.style.background = 'rgba(255,152,0,0.08)';
      decGateEl.style.border     = '1px solid rgba(255,152,0,0.3)';
      decGateEl.innerHTML =
        `<span style="color:${decision.labelColor};font-weight:700;">⚠️ ${decision.label}</span>` +
        ` <span style="color:var(--text3);font-size:11px;">${decision.desc}</span>` +
        ` <span style="font-size:10px;color:var(--gold);margin-left:6px;">신뢰도: ${decision.confidenceLevel}</span>`;
    } else {
      decGateEl.style.background = 'rgba(0,230,118,0.06)';
      decGateEl.style.border     = '1px solid rgba(0,230,118,0.2)';
      decGateEl.innerHTML =
        `<span style="color:var(--green);font-weight:700;">✅ OK</span>` +
        ` <span style="color:var(--text3);font-size:11px;">${decision.desc || 'ECE·표본 조건 충족'}</span>` +
        ` <span style="font-size:10px;color:var(--green);margin-left:6px;">신뢰도: HIGH</span>`;
    }
  }

  // sizing: Gate/Decision 파이프라인 안으로 이전 예정 — 현재는 null 고정
  renderDecisionBlock({
    isMulti:     false,
    ev,
    kelly:       finalBet,
    rawP:        pAdj,
    safeP:       pAdj,
    verdict,
    folderCount: 1,
    sizing:      null,
  });
}

// ── 어댑터 ───────────────────────────────────────────────────

function updateLossRatio() {
  const amount  = parseFloat(document.getElementById('r-amount').value) || 0;
  const display = document.getElementById('loss-ratio-display');
  const seed    = getSettings().kellySeed || getSettings().startFund || 0;

  if (!display) return;
  if (!amount || amount <= 0) { display.style.display = 'none'; return; }

  display.style.display = 'block';

  // ── 공통: EV 계산에 필요한 값 수집 (시드 유무 무관) ──────
  const odds   = parseFloat(document.getElementById('r-betman-odds').value) || 0;
  const myProb = parseFloat(document.getElementById('r-myprob-direct').value) || 0;
  const hasEV  = odds >= 1 && myProb > 0;
  const guide  = document.getElementById('r-bet-guide');
  const evHint = document.getElementById('r-ev-hint');

  if (!seed) {
    // 시드 없음 — 금액 손실 안내만 표시
    display.style.background = 'rgba(136,146,164,0.1)';
    display.style.border     = '1px solid rgba(136,146,164,0.2)';
    display.style.color      = 'var(--text3)';
    display.innerHTML =
      `미적중 시 <strong>₩${amount.toLocaleString()}</strong> 손실` +
      ` — 설정 탭에서 시드머니를 입력하면 비율이 표시됩니다.`;

    if (guide && evHint && hasEV) {
      guide.style.display = 'block';
      const probFrac = myProb / 100;
      const pCalib   = typeof getCalibrated === 'function' ? getCalibrated(probFrac, window.App._SS?.calibBuckets) : probFrac;
      const acf      = getActiveCorrFactor();
      const evResult = computeEVDisplay(probFrac, odds, pCalib, acf);
      renderEVHint(evHint, guide, document.getElementById('calib-hint'), evResult, probFrac);
    } else if (guide) {
      guide.style.display = 'none';
    }
    return;
  }

  // ── 시드 있음 — 비율 표시 ────────────────────────────────
  const lossResult = computeLossRatio(amount, seed);
  renderLossRatioDisplay(display, amount, seed, lossResult);

  if (guide && evHint && hasEV) {
    guide.style.display = 'block';
    const probFrac = typeof toProb === 'function' ? toProb(myProb) : myProb / 100;
    const pCalib   = typeof getCalibrated === 'function' ? getCalibrated(probFrac, window.App._SS?.calibBuckets) : probFrac;
    const acf      = getActiveCorrFactor();
    const evResult = computeEVDisplay(probFrac, odds, pCalib, acf);
    renderEVHint(evHint, guide, document.getElementById('calib-hint'), evResult, probFrac);
  } else if (guide) {
    guide.style.display = 'none';
  }

  // ── 원웨이 판단 블록 (단폴) ──────────────────────────────
  const owMode = document.getElementById('r-betmode')?.value || 'single';
  if (owMode === 'single' && odds > 1 && myProb > 0) {
    const ss         = window.App._SS;
    const multiplier = getKellyMultiplier();
    const decResult  = computeOneWayDecision(myProb, odds, ss, getSettings().kellySeed || 0, multiplier);
    renderOneWayDecision(decResult, myProb, ss);
  } else if (owMode === 'single') {
    clearDecisionBlock();
  }
}


function selectResult(val) {
  const _rr = document.getElementById('r-result'); if (_rr) _rr.value = val;
  const styles = {
    WIN:     { border: 'var(--green)',   bg: 'rgba(0,230,118,0.12)',  color: 'var(--green)'  },
    LOSE:    { border: 'var(--red)',     bg: 'rgba(255,59,92,0.12)',   color: 'var(--red)'    },
    PENDING: { border: 'var(--accent)',  bg: 'rgba(0,229,255,0.08)',   color: 'var(--accent)' }
  };
  ['WIN','LOSE','PENDING'].forEach(r => {
    const btn = document.getElementById('btn-' + r.toLowerCase());
    if (!btn) return;
    if (r === val) {
      btn.style.borderColor = styles[r].border;
      btn.style.background  = styles[r].bg;
      btn.style.color       = styles[r].color;
    } else {
      btn.style.borderColor = 'var(--border)';
      btn.style.background  = 'var(--bg3)';
      btn.style.color       = 'var(--text2)';
    }
  });
}

// ========== TABS ==========

function setEvDirect(isEv) {
  document.getElementById('r-isvalue').value = isEv ? 'true' : 'false';
  const yesBtn = document.getElementById('btn-ev-yes');
  const noBtn  = document.getElementById('btn-ev-no');
  if (isEv) {
    yesBtn.style.borderColor = 'var(--accent2)'; yesBtn.style.background = 'rgba(255,152,0,0.15)'; yesBtn.style.color = 'var(--accent2)';
    noBtn.style.borderColor  = 'var(--border)';  noBtn.style.background  = 'var(--bg3)';            noBtn.style.color  = 'var(--text2)';
  } else {
    noBtn.style.borderColor  = 'var(--accent)';  noBtn.style.background  = 'rgba(0,229,255,0.12)';  noBtn.style.color  = 'var(--accent)';
    yesBtn.style.borderColor = 'var(--border)';  yesBtn.style.background = 'var(--bg3)';             yesBtn.style.color = 'var(--text2)';
  }
  // 단폴 메모 버튼 표시/숨김 (단폴 모드일 때만)
  const mode = document.getElementById('r-betmode') ? document.getElementById('r-betmode').value : 'single';
  const btnWrap  = document.getElementById('single-memo-btn-wrap');
  const memoWrap = document.getElementById('single-memo-wrap');
  if (btnWrap) btnWrap.style.display = (isEv && mode === 'single') ? 'block' : 'none';
  if (!isEv && memoWrap) {
    memoWrap.style.display = 'none';
    const inp = document.getElementById('single-memo-input');
    const hint = document.getElementById('single-memo-hint');
    if (inp) { inp.value = ''; inp.style.borderColor = 'rgba(255,215,0,0.3)'; }
    if (hint) hint.textContent = '';
    resetSingleMemoBtn();
  }
}


function syncMyProb() {
  const val = parseFloat(document.getElementById('r-myprob-direct').value);
  document.getElementById('r-myprob').value = val || '';

  // adjustedProb 강제 계산 후 hidden 필드에 저장
  if (val > 0 && typeof getAdjustedProb === 'function') {
    const adj = getCLVAdjustedProb(val);
    const adjRounded = Math.round(adj * 10) / 10;
    document.getElementById('r-adjusted-prob-val').value = adjRounded;

    // 힌트 UI 업데이트
    _renderAdjProbHint(val, adjRounded);
  } else {
    document.getElementById('r-adjusted-prob-val').value = val || '';
    const hint = document.getElementById('calib-hint');
    if (hint) hint.style.display = 'none';
  }

  updateLossRatio();
  // 베팅 탭에서 Kelly calib 실시간 반영
  if (typeof calcKelly === 'function') calcKelly();
}


function _renderAdjProbHint(raw, adj) {
  const hint = document.getElementById('calib-hint');
  if (!hint) return;

  // 순수 계산은 compute.js의 computeAdjProbHint에 위임
  const n  = window.App._SS ? window.App._SS.n : 0;
  const r  = computeAdjProbHint(raw, adj, n);

  hint.style.display = 'block';
  if (r.waiting) {
    hint.innerHTML = `<span style="color:var(--text3);">📊 보정 대기 중 — ${r.n}/30건 (${r.needed}건 더 필요)</span>`;
    return;
  }
  hint.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
      <span style="color:var(--text3);font-size:10px;">${r.label} · ${r.strength}</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="font-size:12px;color:var(--text3);">내 입력 <span class="mono" style="color:var(--text2);">${raw.toFixed(1)}%</span></span>
      <span style="color:var(--text3);">→</span>
      <span style="font-size:16px;font-weight:900;font-family:'JetBrains Mono',monospace;color:${r.color};">${adj.toFixed(1)}%</span>
      <span style="font-size:11px;color:${r.color};">(${r.diffStr}%p) 강제 적용됨</span>
    </div>
  `;
}

// ── Calibration Layer 헬퍼 ──────────────────────────────────
// state.js의 getCalibCorrFactor + _SS.activeCorrFactor를 사용
// EV를 자동 보정하는 공통 함수. UI에서 직접 호출.

function makeFolderRow(idx) {
  const row = document.createElement('div');
  row.className = 'folder-row';
  row.style.cssText = 'margin-bottom:6px;';
  row.innerHTML = `
    <div style="display:grid;grid-template-columns:36px 80px 72px 1fr 1fr 32px;gap:6px;align-items:start;" class="folder-row-inner">
      <div class="folder-row-label" style="font-size:11px;color:var(--text3);font-weight:600;text-align:center;padding-top:9px;">F${idx+1}</div>
      <div style="display:flex;flex-direction:column;gap:2px;">
        <input type="hidden" class="folder-sport" value="">
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:2px;">
          <button type="button" onclick="openSportPicker('folder',this,'축구')" style="padding:4px 2px;font-size:11px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text3);cursor:pointer;line-height:1;">⚽</button>
          <button type="button" onclick="openSportPicker('folder',this,'야구')" style="padding:4px 2px;font-size:11px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text3);cursor:pointer;line-height:1;">⚾</button>
          <button type="button" onclick="openSportPicker('folder',this,'농구')" style="padding:4px 2px;font-size:11px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text3);cursor:pointer;line-height:1;">🏀</button>
          <button type="button" onclick="openSportPicker('folder',this,'배구')" style="padding:4px 2px;font-size:11px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text3);cursor:pointer;line-height:1;">🏐</button>
        </div>
        <div class="folder-sport-label" style="font-size:9px;color:var(--text3);text-align:center;min-height:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">종목 선택</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:2px;">
        <input type="hidden" class="folder-type" value="">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;">
          <button type="button" onclick="openFolderTypePicker(this,'일반')" style="padding:4px 2px;font-size:14px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text3);cursor:pointer;line-height:1;">🏁</button>
          <button type="button" onclick="openFolderTypePicker(this,'전반')" style="padding:4px 2px;font-size:14px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text3);cursor:pointer;line-height:1;">⏱️</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;">
          <div style="font-size:9px;color:var(--text3);text-align:center;">일반</div>
          <div style="font-size:9px;color:var(--text3);text-align:center;">전반</div>
        </div>
        <div class="folder-type-label" style="font-size:9px;color:var(--accent);text-align:center;min-height:12px;"></div>
      </div>
      <div>
        <input type="number" class="folder-odds" placeholder="배당 예:1.75" step="0.01" min="1"
          style="width:100%;padding:7px 10px;font-size:13px;font-family:'JetBrains Mono',monospace;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text2);box-sizing:border-box;"
          oninput="calcMultiEV()">
        <div class="folder-implied" style="font-size:10px;margin-top:3px;padding-left:2px;min-height:15px;color:var(--text3);font-family:'JetBrains Mono',monospace;"></div>
      </div>
      <div style="position:relative;">
        <input type="number" class="folder-prob" placeholder="승률 예:55" min="1" max="99" step="0.1"
          style="width:100%;padding:7px 24px 7px 10px;font-size:13px;font-family:'JetBrains Mono',monospace;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text2);box-sizing:border-box;"
          oninput="calcMultiEV()">
        <span style="position:absolute;right:7px;top:9px;font-size:11px;color:var(--text3);">%</span>
      </div>
      <button type="button" class="folder-memo-btn"
        style="padding:0;width:30px;height:32px;border-radius:6px;border:1px solid var(--border);background:var(--bg3);color:var(--text3);font-size:14px;cursor:pointer;transition:all 0.2s;margin-top:1px;"
        title="베팅 근거 입력"
        onclick="toggleFolderMemo(this)">📝</button>
    </div>
    <div class="folder-memo-wrap" style="display:none;margin-top:4px;padding-left:42px;">
      <div style="margin-bottom:5px;">
        <div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:5px;" class="folder-tag-cat-btns"></div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;" class="folder-tag-cat-panel"></div>
      </div>
      <input type="text" class="folder-memo" placeholder="이 폴더를 선택한 이유 (5자 이상 필수)"
        style="width:100%;padding:6px 10px;font-size:12px;background:rgba(255,215,0,0.05);border:1px solid rgba(255,215,0,0.3);border-radius:6px;color:var(--text2);box-sizing:border-box;"
        oninput="validateFolderMemo(this)">
      <div class="folder-memo-hint" style="font-size:10px;margin-top:3px;padding-left:2px;color:var(--text3);"></div>
    </div>`;
  initFolderMemoTabs(row);

  // ── 견고성 보강 ──────────────────────────────────────────────
  // 위 배당/승률 입력에는 이미 inline oninput="calcMultiEV()"가 있지만,
  // 일부 모바일 브라우저/키패드나 프로그램적 값 주입(OCR, 조합기 전송 등)
  // 경로에서 input 이벤트가 유실되는 경우를 대비해 change/blur에도
  // 동일 계산을 한 번 더 걸어 합산배당/내재확률/내 적중률/EV가
  // 반드시 갱신되도록 한다.
  row.querySelectorAll('.folder-odds, .folder-prob').forEach(inp => {
    ['input', 'change', 'blur'].forEach(evt => {
      inp.addEventListener(evt, () => { if (typeof calcMultiEV === 'function') calcMultiEV(); });
    });
  });

  return row;
}


function toggleSingleMemo() {
  const wrap = document.getElementById('single-memo-wrap');
  const btn  = document.getElementById('btn-single-memo');
  const isOpen = wrap.style.display !== 'none';
  wrap.style.display = isOpen ? 'none' : 'block';
  btn.style.borderColor = isOpen ? 'var(--border)'            : 'rgba(255,215,0,0.6)';
  btn.style.background  = isOpen ? 'var(--bg3)'               : 'rgba(255,215,0,0.1)';
  btn.style.color       = isOpen ? 'var(--text3)'             : 'var(--gold)';
  btn.textContent       = isOpen ? '📝 베팅 근거 입력'        : '📝 베팅 근거 닫기';
  if (!isOpen) {
    initSingleMemoTabs();
    document.getElementById('single-memo-input').focus();
  }
}


function validateSingleMemo(input) {
  const hint = document.getElementById('single-memo-hint');
  const len = input.value.trim().length;
  if (len === 0) {
    hint.textContent = '';
    input.style.borderColor = 'rgba(255,215,0,0.3)';
  } else if (len < 5) {
    hint.textContent = `${len}/5자 — ${5 - len}자 더 입력하세요`;
    hint.style.color = 'var(--red)';
    input.style.borderColor = 'var(--red)';
  } else {
    hint.textContent = `✓ ${len}자`;
    hint.style.color = 'var(--green)';
    input.style.borderColor = 'var(--green)';
  }
}


function resetSingleMemoBtn() {
  const btn = document.getElementById('btn-single-memo');
  if (!btn) return;
  btn.style.borderColor = 'var(--border)';
  btn.style.background  = 'var(--bg3)';
  btn.style.color       = 'var(--text3)';
  btn.textContent       = '📝 베팅 근거 입력';
}


function toggleFolderMemo(btn) {
  const wrap = btn.closest('.folder-row').querySelector('.folder-memo-wrap');
  const isOpen = wrap.style.display !== 'none';
  wrap.style.display = isOpen ? 'none' : 'block';
  btn.style.borderColor  = isOpen ? 'var(--border)'              : 'rgba(255,215,0,0.6)';
  btn.style.background   = isOpen ? 'var(--bg3)'                 : 'rgba(255,215,0,0.1)';
  btn.style.color        = isOpen ? 'var(--text3)'               : 'var(--gold)';
  if (!isOpen) btn.closest('.folder-row').querySelector('.folder-memo').focus();
}


function validateFolderMemo(input) {
  const hint = input.closest('.folder-memo-wrap').querySelector('.folder-memo-hint');
  const len = input.value.trim().length;
  if (len === 0) {
    hint.textContent = '';
    input.style.borderColor = 'rgba(255,215,0,0.3)';
  } else if (len < 5) {
    hint.textContent = `${len}/5자 — ${5 - len}자 더 입력하세요`;
    hint.style.color = 'var(--red)';
    input.style.borderColor = 'var(--red)';
  } else {
    hint.textContent = `✓ ${len}자`;
    hint.style.color = 'var(--green)';
    input.style.borderColor = 'var(--green)';
  }
}


function updateFolderUI() {
  const container = document.getElementById('folder-rows');
  const count = container ? container.querySelectorAll('.folder-row').length : 0;
  const disp = document.getElementById('folder-count-display');
  if (disp) disp.textContent = count + '폴';

  // F번호 갱신
  if (container) container.querySelectorAll('.folder-row').forEach((r, i) => {
    const label = r.querySelector('.folder-row-label');
    if (label) label.textContent = 'F' + (i+1);
  });

  const fcVal = document.getElementById('r-folder-count') ? document.getElementById('r-folder-count').value : '';
  const isPlus = fcVal === '4+';

  const addBtn = document.getElementById('btn-add-folder');
  const remBtn = document.getElementById('btn-remove-folder');

  if (addBtn) {
    const canAdd = isPlus && count < 6;
    addBtn.disabled = !canAdd;
    addBtn.style.opacity     = canAdd ? '1' : '0.35';
    addBtn.style.cursor      = canAdd ? 'pointer' : 'not-allowed';
    addBtn.style.borderColor = canAdd ? 'var(--gold)' : 'var(--border)';
    addBtn.style.background  = canAdd ? 'rgba(255,215,0,0.08)' : 'var(--bg3)';
    addBtn.style.color       = canAdd ? 'var(--gold)' : 'var(--text3)';
  }
  if (remBtn) {
    const canRem = isPlus && count > 4;
    remBtn.disabled = !canRem;
    remBtn.style.opacity     = canRem ? '1' : '0.35';
    remBtn.style.cursor      = canRem ? 'pointer' : 'not-allowed';
    remBtn.style.borderColor = canRem ? 'var(--red)' : 'var(--border)';
    remBtn.style.color       = canRem ? 'var(--red)' : 'var(--text3)';
    remBtn.style.background  = canRem ? 'rgba(255,59,92,0.08)' : 'var(--bg3)';
  }
}


function renderFolderRows() {
  const _fcEl = document.getElementById('r-folder-count');
  const fcVal = _fcEl ? _fcEl.value : '2';
  const folderCount = fcVal === '4+' ? 4 : Math.min(parseInt(fcVal) || 2, 6);
  const container = document.getElementById('folder-rows');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < folderCount; i++) container.appendChild(makeFolderRow(i));
  updateFolderUI();
  calcMultiEV();
}


function addFolderRow() {
  const fcVal = document.getElementById('r-folder-count') ? document.getElementById('r-folder-count').value : '';
  if (fcVal !== '4+') return;
  const container = document.getElementById('folder-rows');
  if (!container) return;
  const count = container.querySelectorAll('.folder-row').length;
  if (count >= 6) return;
  container.appendChild(makeFolderRow(count));
  updateFolderUI();
  calcMultiEV();
}


function removeFolderRow() {
  const fcVal = document.getElementById('r-folder-count') ? document.getElementById('r-folder-count').value : '';
  if (fcVal !== '4+') return;
  const container = document.getElementById('folder-rows');
  if (!container) return;
  const rows = container.querySelectorAll('.folder-row');
  if (rows.length <= 4) return;
  rows[rows.length - 1].remove();
  updateFolderUI();
  calcMultiEV();
}


// ── 공통 함수: 다폴더 보정 확률 계산 (로그 합 방식) ──────────────
// 검증 탭 및 calcMultiEV 공유 사용

function clearRecordForm() {
  // 수정 모드 초기화
  const _rei = document.getElementById('r-edit-id');        if (_rei) _rei.value = '';
  const _rdbl = document.getElementById('r-double');         if (_rdbl) _rdbl.value = 'false';
  const _ft = document.getElementById('form-title');         if (_ft) _ft.innerHTML = '➕ <span>베팅 기록 추가</span>';
  const _bsb = document.getElementById('btn-save-bet');      if (_bsb) _bsb.textContent = '➕ 기록 추가';
  const _bce = document.getElementById('btn-cancel-edit');   if (_bce) _bce.style.display = 'none';
  // 2개 생성 토글 초기화
  const knob = document.getElementById('btn-double-knob');
  const track = document.getElementById('btn-double');
  if (knob) { knob.style.left = '1px'; knob.style.background = 'var(--text3)'; }
  if (track) { track.style.background = 'var(--bg3)'; track.style.borderColor = 'var(--border)'; }
  const _ra = document.getElementById('r-amount');           if (_ra) _ra.value = '';
  const lrd = document.getElementById('loss-ratio-display'); if (lrd) lrd.style.display = 'none';
  const rGuide = document.getElementById('r-bet-guide');     if (rGuide) rGuide.style.display = 'none';
  const _rbo = document.getElementById('r-betman-odds');     if (_rbo) _rbo.value = '';
  const _rg = document.getElementById('r-game');             if (_rg) _rg.value = '';
  const _rdt = document.getElementById('r-date');            if (_rdt) _rdt.value = new Date().toISOString().split('T')[0];
  // 새 필드 초기화
  const mpd = document.getElementById('r-myprob-direct'); if (mpd) mpd.value = '';
  const fr = document.getElementById('folder-rows'); if (fr) fr.innerHTML = '';
  const fcd = document.getElementById('folder-count-display'); if (fcd) fcd.textContent = '0폴';
  const mer = document.getElementById('multi-ev-result'); if (mer) { mer.textContent = '—'; mer.style.color = 'var(--text3)'; }
  const men = document.getElementById('multi-ev-note'); if (men) men.textContent = '';
  // 요약 카드 초기화
  const co = document.getElementById('multi-combined-odds'); if (co) co.textContent = '—';
  const ci = document.getElementById('multi-combined-implied'); if (ci) ci.textContent = '—';
  const mp = document.getElementById('multi-my-prob'); if (mp) mp.textContent = '—';
  setEvDirect(false); // 기본값 일반 베팅
  // 종목 팝업 선택 초기화 (r-sport hidden input + 배지)
  const _rSport = document.getElementById('r-sport');
  if (_rSport) _rSport.value = '';
  const sportBadge = document.getElementById('sport-selected-badge');
  const sportLabel = document.getElementById('sport-selected-label');
  if (sportBadge) sportBadge.style.display = 'none';
  if (sportLabel) sportLabel.textContent = '—';

  // 형식 팝업 선택 초기화
  window._selectedType = null;
  const _rTypeHidden = document.getElementById('r-type-hidden');
  if (_rTypeHidden) _rTypeHidden.value = '';
  const typeBadge = document.getElementById('type-selected-badge');
  const typeLabel = document.getElementById('type-selected-label');
  if (typeBadge) typeBadge.style.display = 'none';
  if (typeLabel) typeLabel.textContent = '—';
  const _rPreview = document.getElementById('r-preview');
  if (_rPreview) _rPreview.textContent = '배당과 금액을 입력하면 예상 수익이 표시됩니다.';
  clearDecisionBlock();
  const _rFc = document.getElementById('r-folder-count');
  if (_rFc) _rFc.value = '';
  const _fcw = document.getElementById('folder-count-wrap');
  if (_fcw) _fcw.style.display = 'none';
  document.querySelectorAll('.folder-btn').forEach(b => {
    b.style.borderColor = 'var(--border)';
    b.style.background  = 'var(--bg3)';
    b.style.color       = 'var(--text2)';
  });
  const _rMyprob = document.getElementById('r-myprob');
  if (_rMyprob) _rMyprob.value = '';
  const _mpd = document.getElementById('myprob-display');
  if (_mpd) _mpd.style.display = 'none';
  const _mpdv = document.getElementById('myprob-display-val');
  if (_mpdv) _mpdv.textContent = '';
  const smi = document.getElementById('single-memo-input');
  const smw = document.getElementById('single-memo-wrap');
  const smbw = document.getElementById('single-memo-btn-wrap');
  const smh = document.getElementById('single-memo-hint');
  if (smi) { smi.value = ''; smi.style.borderColor = 'rgba(255,215,0,0.3)'; }
  if (smw) smw.style.display = 'none';
  if (smbw) smbw.style.display = 'none';
  if (smh) smh.textContent = '';
  resetSingleMemoBtn();
  document.querySelectorAll('#sport-btns .sel-btn, #type-btns .sel-btn').forEach(b => b.classList.remove('active'));
  selectResult('PENDING');
  setBetMode('single');

  // 감정태그 리셋
  document.querySelectorAll('.emotion-tag').forEach(t => {
    t.classList.remove('active-emotion');
    t.style.border = '1px solid var(--border)';
    t.style.color = 'var(--text3)';
    t.style.background = 'var(--bg3)';
  });
  const defaultEmotion = document.querySelector('.emotion-tag[data-val="보통"]');
  if (defaultEmotion) selectEmotion(defaultEmotion);
}


function toggleDouble() {
  const _rdbl2 = document.getElementById('r-double');
  const isOn = _rdbl2 ? _rdbl2.value === 'true' : false;
  const newVal = !isOn;
  if (_rdbl2) _rdbl2.value = newVal;
  const knob = document.getElementById('btn-double-knob');
  const track = document.getElementById('btn-double');
  if (!knob || !track) return;
  if (newVal) {
    knob.style.left = '17px'; knob.style.background = 'var(--accent)';
    track.style.background = 'rgba(0,229,255,0.2)'; track.style.borderColor = 'var(--accent)';
  } else {
    knob.style.left = '1px'; knob.style.background = 'var(--text3)';
    track.style.background = 'var(--bg3)'; track.style.borderColor = 'var(--border)';
  }
}


function cancelEdit() {
  clearRecordForm();
}

// ========== 베팅 템플릿 ==========


