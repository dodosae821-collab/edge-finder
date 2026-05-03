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

// [0] multiplier 역산 (window._SS에 kellyMultiplier 없으므로)
function getKellyMultiplier() {
  const base = (appSettings.kellySeed || 0) / 12;
  const kellyUnit = window._SS?.kellyUnit || 0;
  if (!base || base <= 0) return 1;
  const m = kellyUnit / base;
  if (!Number.isFinite(m) || m <= 0) return 1;
  // 안전 범위 제한 — streak 폭주 / NaN 방어
  return Math.max(0.3, Math.min(m, 2.0));
}

// [9] 다폴 과신 방지 필터 (단폴 사용 금지)
function applyMultiProbSafetyFilter({ p, odds, folderCount }) {
  let safeP = p;

  // 1. shrink — 폴더 수 증가에 따른 확률 축소
  const shrink =
    folderCount === 2 ? 0.92 :
    folderCount === 3 ? 0.85 :
    0.75;
  safeP *= shrink;

  // 2. breakeven cap — EV 과도 팽창 억제 (최대 +12% edge)
  const breakeven = 1 / odds;
  const maxEdge = 0.12;
  safeP = Math.min(safeP, breakeven + maxEdge);

  // 3. hard ceiling — 절대 확률 상한
  const ceiling =
    folderCount === 2 ? 0.65 :
    folderCount === 3 ? 0.55 :
    0.50;
  safeP = Math.min(safeP, ceiling);

  return Math.max(0, safeP);
}

// renderDecisionBlock — 순수 view-only (계산 금지, 전달값만 렌더)
// params: { isMulti, ev, kelly, rawP, safeP, verdict, folderCount }
function renderDecisionBlock({ isMulti, ev, kelly, rawP, safeP, verdict, folderCount }) {
  const el = document.getElementById('oneway-kelly-card');
  if (!el) return;

  const base = (appSettings.kellySeed || 0) / 12;

  // 색상/아이콘 맵
  const vMap = {
    GO:      { color: 'var(--green)',  bg: 'rgba(0,230,118,0.10)', icon: '✅', label: 'GO' },
    CAUTION: { color: '#ff9800',       bg: 'rgba(255,152,0,0.10)', icon: '⚠️', label: 'CAUTION' },
    WAIT:    { color: 'var(--gold)',   bg: 'rgba(255,215,0,0.08)', icon: '⏳', label: 'WAIT' },
    PASS:    { color: 'var(--red)',    bg: 'rgba(255,59,92,0.10)', icon: '🚫', label: 'PASS' },
    STOP:    { color: 'var(--red)',    bg: 'rgba(255,59,92,0.10)', icon: '🛑', label: 'STOP' },
    BLOCK:   { color: 'var(--red)',    bg: 'rgba(255,59,92,0.14)', icon: '🚫', label: 'BLOCK' },
  };
  const v = vMap[verdict] || vMap['WAIT'];

  // EV 표시
  const evColor = ev > 0.05 ? 'var(--green)' : ev > 0 ? 'var(--gold)' : 'var(--red)';
  const evStr   = (ev >= 0 ? '+' : '') + (ev * 100).toFixed(1) + '%';

  // Kelly 금액 표시
  const kellyStr = base <= 0
    ? '<span style="color:var(--text3);font-size:11px;">시드 설정 필요</span>'
    : (verdict === 'PASS' || verdict === 'BLOCK')
      ? '<span style="color:var(--red);font-weight:700;">₩0</span>'
      : `<span style="color:var(--gold);font-weight:900;font-family:'JetBrains Mono',monospace;font-size:16px;">₩${kelly.toLocaleString()}</span>`;

  // 변동성 태그 (다폴)
  const varianceTag = isMulti
    ? (folderCount === 2 ? '변동성 ↑' : folderCount === 3 ? '고변동' : '초고변동')
    : '';

  // 적중확률 표시 (다폴: 2단계)
  const probHtml = isMulti ? `
      <div style="margin-top:8px;padding:6px 8px;background:var(--bg2);border-radius:6px;font-size:11px;">
        <span style="color:var(--text3);font-size:9px;letter-spacing:1px;">적중확률</span>
        <span style="margin-left:6px;color:var(--text2);">
          <span style="text-decoration:line-through;color:var(--text3);">${(rawP*100).toFixed(1)}%</span>
          <span style="color:var(--gold);margin:0 4px;">→</span>
          <span style="color:var(--gold);font-weight:700;">${(safeP*100).toFixed(1)}%</span>
          <span style="color:var(--text3);font-size:10px;margin-left:4px;">(과신필터)</span>
        </span>
      </div>` : '';

  el.style.display = 'block';
  el.innerHTML = `
    <div style="padding:10px 14px;background:${v.bg};border:1px solid ${v.color}44;border-left:3px solid ${v.color};border-radius:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <span style="font-size:10px;color:var(--text3);letter-spacing:1px;font-weight:700;">⚡ 원웨이 판단${isMulti ? ` · ${folderCount}폴더` : ''}</span>
        <span style="font-size:12px;font-weight:800;color:${v.color};">${v.icon} ${v.label}${isMulti && varianceTag ? ` <span style="font-size:10px;font-weight:400;">(${varianceTag})</span>` : ''}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div style="padding:8px;background:var(--bg2);border-radius:6px;text-align:center;">
          <div style="font-size:9px;color:var(--text3);margin-bottom:4px;letter-spacing:1px;">KELLY (이번 베팅)</div>
          <div>${kellyStr}</div>
        </div>
        <div style="padding:8px;background:var(--bg2);border-radius:6px;text-align:center;">
          <div style="font-size:9px;color:var(--text3);margin-bottom:4px;letter-spacing:1px;">EV</div>
          <div style="font-size:13px;font-weight:700;color:${evColor};">${evStr}</div>
        </div>
      </div>
      ${probHtml}
    </div>`;
}

function clearDecisionBlock() {
  const el = document.getElementById('oneway-kelly-card');
  if (el) el.style.display = 'none';
}

function updateLossRatio() {
  const amount  = parseFloat(document.getElementById('r-amount').value) || 0;
  const display = document.getElementById('loss-ratio-display');
  const seed    = appSettings.kellySeed || appSettings.startFund || 0;

  if (!display) return;
  if (!amount || amount <= 0) { display.style.display = 'none'; return; }

  display.style.display = 'block';

  if (!seed) {
    display.style.background = 'rgba(136,146,164,0.1)';
    display.style.border = '1px solid rgba(136,146,164,0.2)';
    display.style.color = 'var(--text3)';
    display.innerHTML = `미적중 시 <strong>₩${amount.toLocaleString()}</strong> 손실 — 설정 탭에서 시드머니를 입력하면 비율이 표시됩니다.`;
    // 시드 없어도 EV는 표시
    const guideNoSeed = document.getElementById('r-bet-guide');
    const evNoSeed    = document.getElementById('r-ev-hint');
    if (guideNoSeed && evNoSeed) {
      const oddsNs   = parseFloat(document.getElementById('r-betman-odds').value) || 0;
      const myProbNs = parseFloat(document.getElementById('r-myprob-direct').value) || 0;
      if (oddsNs >= 1 && myProbNs > 0) {
        guideNoSeed.style.display = 'block';
        const p        = myProbNs / 100;
        const ev       = p * (oddsNs - 1) - (1 - p);
        // 1. 구간 보정 → 2. 전체 과신 억제
        const pCalib   = typeof getCalibrated === 'function' ? getCalibrated(p) : p;
        const acf      = getActiveCorrFactor();
        const pAdj     = pCalib * Math.min(acf, 1.0);
        const evAdj    = pAdj * (oddsNs - 1) - (1 - pAdj);
        const isOn     = acf < 0.999 || Math.abs(pCalib - p) > 0.001;
        const evFinal  = isOn ? evAdj : ev;
        if (isOn) {
          evNoSeed.innerHTML = `<span style="color:var(--text3);text-decoration:line-through;font-size:11px;">${ev>=0?'+':''}${(ev*100).toFixed(1)}%</span> <span>${evAdj>=0?'+':''}${(evAdj*100).toFixed(1)}%</span> <span style="font-size:10px;color:var(--gold);">📐보정</span>`;
        } else {
          evNoSeed.textContent = (ev >= 0 ? '+' : '') + (ev * 100).toFixed(1) + '%';
        }
        evNoSeed.style.color = evFinal >= 0.05 ? 'var(--green)' : evFinal >= 0 ? 'var(--gold)' : 'var(--red)';
        evNoSeed.parentElement.style.borderColor = evFinal >= 0.05 ? 'rgba(0,230,118,0.4)' : evFinal >= 0 ? 'rgba(255,215,0,0.3)' : 'rgba(255,59,92,0.3)';
        const calibHintNs = document.getElementById('calib-hint');
        if (calibHintNs) {
          if (isOn) {
            calibHintNs.style.display = 'block';
            calibHintNs.innerHTML = `원래 확률 <span style="color:var(--text2);">${(p*100).toFixed(1)}%</span> → 보정 확률 <span style="color:var(--gold);font-weight:700;">${(pAdj*100).toFixed(1)}%</span>`;
          } else {
            calibHintNs.style.display = 'none';
          }
        }
      } else {
        guideNoSeed.style.display = 'none';
      }
    }
    return;
  }

  const pct = (amount / seed * 100);
  const limit = 2; // 권장 한도 2%

  let bg, border, color, icon, msg;
  if (pct <= limit) {
    bg = 'rgba(0,230,118,0.08)'; border = '1px solid rgba(0,230,118,0.3)';
    color = 'var(--green)'; icon = '✅';
    msg = `권장 한도(${limit}%) 이내`;
  } else if (pct <= limit * 1.5) {
    bg = 'rgba(255,215,0,0.08)'; border = '1px solid rgba(255,215,0,0.3)';
    color = 'var(--gold)'; icon = '⚠️';
    msg = `권장 한도(${limit}%) 초과 — 베팅금 축소 고려`;
  } else {
    bg = 'rgba(255,59,92,0.10)'; border = '1px solid rgba(255,59,92,0.4)';
    color = 'var(--red)'; icon = '🔴';
    msg = `위험 구간 — 한 번에 시드의 ${pct.toFixed(1)}% 노출`;
  }

  display.style.background = bg;
  display.style.border = border;
  display.style.color = color;
  display.innerHTML = `${icon} 미적중 시 시드의 <strong>${pct.toFixed(1)}%</strong> 손실 (₩${amount.toLocaleString()} / ₩${seed.toLocaleString()}) &nbsp;—&nbsp; ${msg}`;

  // EV 표시
  const guide = document.getElementById('r-bet-guide');
  const evHint = document.getElementById('r-ev-hint');
  if (guide && evHint) {
    const evOdds   = parseFloat(document.getElementById('r-betman-odds').value) || 0;
    const evMyProb = parseFloat(document.getElementById('r-myprob-direct').value) || 0;
    if (evOdds >= 1 && evMyProb > 0) {
      guide.style.display = 'block';
      const p   = typeof toProb === 'function' ? toProb(evMyProb) : evMyProb / 100;
      const ev  = p * (evOdds - 1) - (1 - p);
      // 1. 구간 보정 → 2. 전체 과신 억제
      const pCalib  = typeof getCalibrated === 'function' ? getCalibrated(p) : p;
      const acf     = getActiveCorrFactor();
      const pAdj    = pCalib * Math.min(acf, 1.0);
      const evAdj   = pAdj * (evOdds - 1) - (1 - pAdj);
      const isOn    = acf < 0.999 || Math.abs(pCalib - p) > 0.001;
      const evFinal = isOn ? evAdj : ev;
      if (isOn) {
        evHint.innerHTML = `<span style="color:var(--text3);text-decoration:line-through;font-size:11px;">${ev>=0?'+':''}${(ev*100).toFixed(1)}%</span> <span>${evAdj>=0?'+':''}${(evAdj*100).toFixed(1)}%</span> <span style="font-size:10px;color:var(--gold);">📐보정</span>`;
      } else {
        evHint.textContent = (ev >= 0 ? '+' : '') + (ev * 100).toFixed(1) + '%';
      }
      evHint.style.color = evFinal >= 0.05 ? 'var(--green)' : evFinal >= 0 ? 'var(--gold)' : 'var(--red)';
      evHint.parentElement.style.borderColor = evFinal >= 0.05
        ? 'rgba(0,230,118,0.4)' : evFinal >= 0
        ? 'rgba(255,215,0,0.3)' : 'rgba(255,59,92,0.3)';
      const calibHint = document.getElementById('calib-hint');
      if (calibHint) {
        if (isOn) {
          calibHint.style.display = 'block';
          calibHint.innerHTML = `원래 확률 <span style="color:var(--text2);">${(p*100).toFixed(1)}%</span> → 보정 확률 <span style="color:var(--gold);font-weight:700;">${(pAdj*100).toFixed(1)}%</span>`;
        } else {
          calibHint.style.display = 'none';
        }
      }
    } else {
      guide.style.display = 'none';
    }
  }

  // ── 원웨이 판단 블록 (단폴) ──
  const _owOdds   = parseFloat(document.getElementById('r-betman-odds')?.value) || 0;
  const _owProb   = parseFloat(document.getElementById('r-myprob-direct')?.value) || 0;
  const _owMode   = document.getElementById('r-betmode')?.value || 'single';
  if (_owMode === 'single' && _owOdds > 1 && _owProb > 0) {

    // ── [1] Stateless Live 계산 (_SS는 데이터 공급만) ────────
    const _SS = window._SS;
    const adjResult = (typeof getAdjustedProbLive === 'function')
      ? getAdjustedProbLive({
          myProb:     _owProb,
          buckets:    _SS?.calibBuckets,
          corrFactor: _SS?.corrFactor,
          totalN:     _SS?.n
        })
      : { adjustedProb: _owProb, source: 'RAW', delta: 0, bucketCount: 0 };

    const decision = (typeof getBetDecisionLive === 'function')
      ? getBetDecisionLive({
          myProb:    _owProb,
          odds:      _owOdds,
          recentEce: _SS?.recentEce,
          totalEce:  _SS?.ece,
        })
      : { allow: true, kellyFactor: 1.0, reason: 'OK', label: 'OK',
          labelColor: 'var(--green)', desc: '', confidenceLevel: 'HIGH' };

    // adjustedProb % → frac (계산 전용 — 저장 금지)
    const pAdj = Math.max(0, Math.min(
      typeof toProb === 'function' ? toProb(adjResult.adjustedProb) : adjResult.adjustedProb / 100,
      0.99
    ));

    // [3] Kelly fraction
    const kellyFracRaw = (_owOdds * pAdj - 1) / (_owOdds - 1);
    const kellyFrac    = Math.max(0, kellyFracRaw);

    // [4] EV (adjustedProb 기준)
    const ev = pAdj * (_owOdds - 1) - (1 - pAdj);

    // [5] 금액 — Decision Gate kellyFactor 적용
    const base       = (appSettings.kellySeed || 0) / 12;
    const multiplier = getKellyMultiplier();
    const rawBet     = Math.max(0, Math.floor(base * kellyFrac * multiplier));
    const finalBet   = decision.allow ? Math.floor(rawBet * decision.kellyFactor) : 0;

    // ── [2] adjustedProb 설명 UI (보정 이유 포함) ───────────
    const adjProbEl   = document.getElementById('r-adjusted-prob');
    const adjProbWrap = document.getElementById('r-adjusted-prob-wrap');
    if (adjProbEl && adjProbWrap) {
      const changed = Math.abs(adjResult.delta) > 0.3;
      if (changed) {
        adjProbWrap.style.display = 'block';
        const deltaColor  = adjResult.delta < 0 ? 'var(--red)' : 'var(--green)';
        const deltaSign   = adjResult.delta > 0 ? '+' : '';
        const sourceLabel = adjResult.source === 'BUCKET'
          ? `구간 실적 기반 (${adjResult.bucketCount}건)`
          : adjResult.source === 'CORR' ? '전체 과신 보정' : '';
        const ss = window._SS;
        let reasonText = sourceLabel;
        if (ss?.recentEce > 8)  reasonText = `최근 ECE ${ss.recentEce.toFixed(1)}% 상승`;
        else if (ss?.ece > 8)   reasonText = `ECE ${ss.ece.toFixed(1)}% — 분수 보정`;

        adjProbEl.innerHTML =
          `<span style="color:var(--text3);text-decoration:line-through;font-size:11px;">${_owProb.toFixed(1)}%</span>` +
          ` → <span style="color:${deltaColor};font-weight:700;">${adjResult.adjustedProb.toFixed(1)}%</span>` +
          ` <span style="color:${deltaColor};font-size:11px;">(${deltaSign}${adjResult.delta.toFixed(1)}%)</span>` +
          (reasonText ? ` <span style="font-size:10px;color:var(--text3);margin-left:4px;">${reasonText}</span>` : '');
      } else {
        adjProbWrap.style.display = 'none';
      }
    }

    // ── [2] Decision Gate UI ─────────────────────────────────
    const decGateEl = document.getElementById('r-decision-gate');
    if (decGateEl) {
      decGateEl.style.display = 'block';
      if (!decision.allow) {
        decGateEl.style.background = 'rgba(255,59,92,0.10)';
        decGateEl.style.border = '1px solid rgba(255,59,92,0.4)';
        decGateEl.innerHTML =
          `<span style="color:var(--red);font-weight:700;">🚫 베팅 차단</span>` +
          ` <span style="color:var(--text3);font-size:11px;">${decision.desc}</span>`;
      } else if (decision.kellyFactor < 1.0) {
        decGateEl.style.background = 'rgba(255,152,0,0.08)';
        decGateEl.style.border = '1px solid rgba(255,152,0,0.3)';
        decGateEl.innerHTML =
          `<span style="color:${decision.labelColor};font-weight:700;">⚠️ ${decision.label}</span>` +
          ` <span style="color:var(--text3);font-size:11px;">${decision.desc}</span>` +
          ` <span style="font-size:10px;color:var(--gold);margin-left:6px;">신뢰도: ${decision.confidenceLevel}</span>`;
      } else {
        decGateEl.style.background = 'rgba(0,230,118,0.06)';
        decGateEl.style.border = '1px solid rgba(0,230,118,0.2)';
        decGateEl.innerHTML =
          `<span style="color:var(--green);font-weight:700;">✅ OK</span>` +
          ` <span style="color:var(--text3);font-size:11px;">${decision.desc || 'ECE·표본 조건 충족'}</span>` +
          ` <span style="font-size:10px;color:var(--green);margin-left:6px;">신뢰도: HIGH</span>`;
      }
    }

    // [8] verdict
    const verdict = !decision.allow
      ? 'BLOCK'
      : (ev <= 0 || finalBet <= 0 ? 'PASS' : (window._SS?.verdict || 'WAIT'));

    renderDecisionBlock({
      isMulti:     false,
      ev,
      kelly:       finalBet,
      rawP:        pAdj,
      safeP:       pAdj,
      verdict,
      folderCount: 1
    });
  } else if (_owMode === 'single') {
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
function switchTab(name, el) {
  checkLossWarning();
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  if (el) el.classList.add('active');
  document.getElementById('page-' + name).classList.add('active');
  activePage = name;
  if (name === 'dashboard') { updateCharts(); updateFundCards(); }
  if (name === 'analysis')  updateStatsAnalysis();
  if (name === 'analysis2') { updateStatsAnalysis(); }
  if (name === 'analysis3') { updateStatsAnalysis(); updateEvBias(); updateEvMonthly(); updateEvCum(); }
  if (name === 'analyze')   updateAnalyzeTab();
  if (name === 'goal')      { updateRoundHistory(); updateGoalStats(); calcGoal(); }
  if (name === 'predict')   { updateGoalStats(); updatePredictTab(); }
  if (name === 'simulator') { calcKelly(); renderKellySlots(bets.filter(b=>b.result!=='PENDING').length % 12, bets.filter(b=>b.result!=='PENDING')); updateSimRoundSeedBanner(); updateKellyHistory(); updateKellyGradeBanner(); try{updateFibonacci();}catch(e){} }
  if (name === 'judgeall')  updateJudgeAll();
  if (name === 'decision')  initDecisionTab();
  if (name === 'settings')  { loadSettingsDisplay(); updateWeeklySeedStatus(); setTodayKST(); renderPrincipleList(); }
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

function calcEV() {
  const inputs = {
    마핸: { odds: parseFloat(document.getElementById('ev-mahan').value),    prob: parseFloat(document.getElementById('ev-mahan-prob').value),    color: 'var(--accent2)', impliedEl: 'ev-mahan-implied'    },
    역배: { odds: parseFloat(document.getElementById('ev-yeokbae').value),  prob: parseFloat(document.getElementById('ev-yeokbae-prob').value),  color: 'var(--red)',     impliedEl: 'ev-yeokbae-implied'  },
    정배: { odds: parseFloat(document.getElementById('ev-jeongbae').value), prob: parseFloat(document.getElementById('ev-jeongbae-prob').value), color: 'var(--text)',    impliedEl: 'ev-jeongbae-implied' },
    플핸: { odds: parseFloat(document.getElementById('ev-plhan').value),    prob: parseFloat(document.getElementById('ev-plhan-prob').value),    color: '#64b5f6',        impliedEl: 'ev-plhan-implied'    },
  };

  // 배당 입력된 항목마다 내재확률 실시간 표시
  Object.entries(inputs).forEach(([, v]) => {
    const el = document.getElementById(v.impliedEl);
    if (v.odds >= 1) {
      const implied = (1 / v.odds * 100).toFixed(1);
      el.textContent = `북메이커 내재확률: ${implied}%`;
      el.style.color = 'var(--text2)';
    } else {
      el.textContent = '내재확률: —';
      el.style.color = 'var(--text3)';
    }
  });

  // 배당 + 내 예상 승률 둘 다 입력된 항목만 EV 계산
  const valid = Object.entries(inputs).filter(([, v]) =>
    v.odds >= 1 && !isNaN(v.prob) && v.prob > 0 && v.prob <= 100
  );
  if (valid.length === 0) return;

  document.getElementById('ev-empty').classList.add('hidden');
  document.getElementById('ev-result').classList.remove('hidden');

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // EV 공식
  // 승리확률 = 내가 입력한 예상 승률
  // 패배확률 = 1 - 승리확률
  // 베팅당 수익 = 스테이크 × 배당 - 스테이크 = 스테이크 × (배당 - 1)
  // 베팅당 손실 = 스테이크
  //
  // EV = (승리확률 × 베팅당수익) - (패배확률 × 베팅당손실)
  //
  // 1원 기준으로 정규화:
  // EV = (myProb × (odds-1)) - ((1-myProb) × 1)
  //
  // 내재확률(1/odds)보다 내 예상 승률이 높으면 → +EV
  // 내재확률보다 내 예상 승률이 낮으면 → -EV
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const amount = parseFloat(document.getElementById('ev-amount').value) || 0;
  const hasAmount = amount > 0;
  const acf = getActiveCorrFactor();
  const isCalibOn = acf < 0.999;

  const calced = valid.map(([name, v]) => {
    const myProb      = v.prob / 100;
    const myProbAdj   = myProb * acf;                        // 보정 승률
    const impliedProb = 1 / v.odds;
    const edge        = myProb - impliedProb;
    const edgeAdj     = myProbAdj - impliedProb;
    const evRaw       = (myProb * (v.odds - 1)) - ((1 - myProb) * 1);
    const ev          = isCalibOn
                        ? (myProbAdj * (v.odds - 1)) - ((1 - myProbAdj) * 1)
                        : evRaw;
    const evAmount    = hasAmount ? amount * ev : null;
    const breakEven   = impliedProb * 100;
    return { name, odds: v.odds, myProb, myProbAdj, impliedProb, edge, edgeAdj, evRaw, ev, evAmount, color: v.color, breakEven };
  }).sort((a, b) => b.ev - a.ev);

  const best = calced[0];

  // ── 최고 추천 카드 ──
  const bestEvWon = hasAmount ? Math.round(amount * best.ev) : null;
  const bestCalibBadge = isCalibOn
    ? `<div style="font-size:10px;color:var(--gold);margin-top:4px;">📐 원본 ${best.evRaw>=0?'+':''}${(best.evRaw*100).toFixed(2)}% → 보정 후 ${best.ev>=0?'+':''}${(best.ev*100).toFixed(2)}%</div>`
    : '';
  document.getElementById('ev-best-card').innerHTML = `
    <div style="background:${best.ev>=0?'rgba(0,230,118,0.08)':'rgba(255,59,92,0.08)'};border:2px solid ${best.ev>=0?'rgba(0,230,118,0.4)':'rgba(255,59,92,0.4)'};border-radius:8px;padding:16px;text-align:center;">
      <div style="font-size:11px;color:var(--text3);letter-spacing:1px;margin-bottom:6px;">🏆 최고 EV 옵션</div>
      <div style="font-size:22px;font-weight:700;color:${best.color};margin-bottom:4px;">${best.name}</div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:32px;font-weight:700;color:${best.ev>=0?'var(--green)':'var(--red)'};">${best.ev>=0?'+':''}${(best.ev*100).toFixed(2)}%</div>
      ${bestCalibBadge}
      ${hasAmount ? `<div style="font-size:14px;color:var(--text2);margin-top:8px;">베팅 ₩${amount.toLocaleString()} 기준 기대수익 <strong style="font-size:18px;color:${bestEvWon>=0?'var(--green)':'var(--red)'};">${bestEvWon>=0?'+':''}₩${bestEvWon.toLocaleString()}</strong></div>` : `<div style="font-size:11px;color:var(--text3);margin-top:4px;">베팅금액 입력 시 실제 기대수익 표시</div>`}
      <div style="font-size:11px;color:var(--text3);margin-top:6px;">배당 ${best.odds.toFixed(2)} · 내재확률 ${(best.impliedProb*100).toFixed(1)}% → 내 예상 ${(best.myProb*100).toFixed(1)}%${isCalibOn?` → 보정 ${(best.myProbAdj*100).toFixed(1)}%`:''} (우위 ${best.edge>=0?'+':''}${(best.edge*100).toFixed(1)}%p)</div>
    </div>`;

  // ── EV 순위 바 ──
  const rankingHtml = calced.map((item, i) => {
    const evPct  = (item.ev * 100).toFixed(2);
    const evRawPct = (item.evRaw * 100).toFixed(2);
    const evWon  = hasAmount ? Math.round(amount * item.ev) : null;
    const maxAbsEv = Math.max(...calced.map(c => Math.abs(c.ev))) || 1;
    const barW   = Math.round((Math.abs(item.ev) / maxAbsEv) * 100);
    const medal  = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '4️⃣';
    const edgeColor = item.edge >= 0 ? 'var(--green)' : 'var(--red)';
    const evDisplay = isCalibOn
      ? `<span style="color:var(--text3);text-decoration:line-through;font-size:12px;margin-right:4px;">${item.evRaw>=0?'+':''}${evRawPct}%</span><span class="mono" style="font-size:16px;font-weight:700;color:${item.ev>=0?'var(--green)':'var(--red)'};">${item.ev>=0?'+':''}${evPct}%</span><span style="font-size:10px;color:var(--gold);margin-left:3px;">📐</span>`
      : `<span class="mono" style="font-size:16px;font-weight:700;color:${item.ev>=0?'var(--green)':'var(--red)'};">${item.ev>=0?'+':''}${evPct}%</span>`;
    return `
      <div style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="font-size:13px;font-weight:700;color:${item.color};">${medal} ${item.name}</span>
          <div style="text-align:right;">
            ${evDisplay}
            ${hasAmount ? `<span class="mono" style="font-size:12px;color:${item.ev>=0?'var(--green)':'var(--red)'};margin-left:8px;">(${evWon>=0?'+':''}₩${evWon.toLocaleString()})</span>` : ''}
          </div>
        </div>
        <div style="background:var(--bg3);border-radius:3px;height:8px;overflow:hidden;margin-bottom:4px;">
          <div style="width:${barW}%;height:100%;background:${item.ev>=0?'var(--green)':'var(--red)'};border-radius:3px;transition:width 0.5s ease;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);">
          <span>배당 ${item.odds.toFixed(2)} · 내재확률 ${(item.impliedProb*100).toFixed(1)}%</span>
          <span>내 예상 ${(item.myProb*100).toFixed(1)}%${isCalibOn?` → 보정 ${(item.myProbAdj*100).toFixed(1)}%`:''} <span style="color:${edgeColor};">(${item.edge>=0?'+':''}${(item.edge*100).toFixed(1)}%p)</span></span>
        </div>
      </div>`;
  }).join('');
  document.getElementById('ev-ranking').innerHTML = rankingHtml;

  // ── 플핸 경고 ──
  const plhanItem = calced.find(c => c.name === '플핸');
  const plhanWarning = document.getElementById('ev-plhan-warning');
  if (plhanItem && best.name !== '플핸') {
    const evDiff = ((best.ev - plhanItem.ev) * 100).toFixed(2);
    plhanWarning.style.display = 'block';
    plhanWarning.innerHTML = `⚠️ <strong>플핸 비권장</strong> — ${best.name}(EV ${(best.ev*100).toFixed(2)}%) 대비 플핸(EV ${(plhanItem.ev*100).toFixed(2)}%)은 <strong style="color:var(--red);">EV ${evDiff}% 손해</strong>입니다.`;
  } else {
    plhanWarning.style.display = 'none';
  }

  // ── 상세 비교표 ──
  const tableHtml = `<table style="width:100%;font-size:12px;">
    <thead><tr>
      <th>구분</th><th>배당</th><th>내재확률</th><th>내 예상</th><th>우위</th><th>EV%</th>
      ${hasAmount ? '<th>기대수익</th>' : ''}
    </tr></thead>
    <tbody>
      ${calced.map((item, i) => {
        const evWon  = hasAmount ? Math.round(amount * item.ev) : null;
        const isBest = i === 0;
        return `<tr style="${isBest?'background:rgba(0,229,255,0.04);':''}">
          <td style="font-weight:700;color:${item.color};">${isBest?'🥇 ':''}${item.name}</td>
          <td class="mono">${item.odds.toFixed(2)}</td>
          <td class="mono">${(item.impliedProb*100).toFixed(1)}%</td>
          <td class="mono">${(item.myProb*100).toFixed(1)}%</td>
          <td class="mono" style="color:${item.edge>=0?'var(--green)':'var(--red)'};">${item.edge>=0?'+':''}${(item.edge*100).toFixed(1)}%p</td>
          <td class="mono" style="color:${item.ev>=0?'var(--green)':'var(--red)'};">${item.ev>=0?'+':''}${(item.ev*100).toFixed(2)}%</td>
          ${hasAmount ? `<td class="mono" style="color:${evWon>=0?'var(--green)':'var(--red)'};">${evWon>=0?'+':''}₩${evWon.toLocaleString()}</td>` : ''}
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
  document.getElementById('ev-table').innerHTML = tableHtml;

  // ── 차트 2개 ──
  document.getElementById('ev-chart-card').style.display = 'block';
  const chartAmount = hasAmount ? amount : 100000;
  const chartLabel  = hasAmount ? `₩${amount.toLocaleString()} 기준` : '10만원 기준';

  if (charts.ev) charts.ev.destroy();
  charts.ev = safeCreateChart('evChart', {
    type: 'bar',
    data: {
      labels: calced.map(c => c.name),
      datasets: [{
        label: 'EV (%)',
        data: calced.map(c => parseFloat((c.ev * 100).toFixed(3))),
        backgroundColor: calced.map(c => c.ev >= 0 ? 'rgba(0,230,118,0.5)' : 'rgba(255,59,92,0.5)'),
        borderColor:     calced.map(c => c.ev >= 0 ? 'var(--green)' : 'var(--red)'),
        borderWidth: 2, borderRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: ctx => `EV: ${ctx.parsed.y>=0?'+':''}${ctx.parsed.y.toFixed(2)}%` } }
      },
      scales: {
        x: { ticks: { color: '#8892a4', font: { size: 13, weight: '700' } }, grid: { color: 'rgba(30,45,69,0.5)' } },
        y: { ticks: { color: '#4a5568', font: { size: 10 }, callback: v => v+'%' }, grid: { color: 'rgba(30,45,69,0.5)' } }
      }
    }
  });

  if (charts.evAmount) charts.evAmount.destroy();
  charts.evAmount = safeCreateChart('evAmountChart', {
    type: 'bar',
    data: {
      labels: calced.map(c => c.name),
      datasets: [{
        label: chartLabel,
        data: calced.map(c => Math.round(chartAmount * c.ev)),
        backgroundColor: calced.map(c => c.ev >= 0 ? 'rgba(0,229,255,0.4)' : 'rgba(255,59,92,0.4)'),
        borderColor:     calced.map(c => c.ev >= 0 ? 'var(--accent)' : 'var(--red)'),
        borderWidth: 2, borderRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: ctx => `기대수익: ${ctx.parsed.y>=0?'+':''}₩${ctx.parsed.y.toLocaleString()}` } }
      },
      scales: {
        x: { ticks: { color: '#8892a4', font: { size: 13, weight: '700' } }, grid: { color: 'rgba(30,45,69,0.5)' } },
        y: { ticks: { color: '#4a5568', font: { size: 10 }, callback: v => `₩${(v/1000).toFixed(0)}K` }, grid: { color: 'rgba(30,45,69,0.5)' } }
      }
    }
  });

  // 저장용 데이터
  const sport = window._evSport || 'MLB';
  const game  = document.getElementById('v-game').value.trim() || '미입력 경기';
  pendingEvBet = { game, sport, best, calced, amount };

  // 권장 베팅 사이즈 계산
  calcRecommendedBetSize(best);
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

function clearEV() {
  ['ev-mahan','ev-mahan-prob','ev-yeokbae','ev-yeokbae-prob',
   'ev-jeongbae','ev-jeongbae-prob','ev-plhan','ev-plhan-prob','ev-amount','v-game'].forEach(id => {
    document.getElementById(id).value = '';
  });
  ['ev-mahan-implied','ev-yeokbae-implied','ev-jeongbae-implied','ev-plhan-implied'].forEach(id => {
    document.getElementById(id).textContent = '내재확률: —';
  });
  document.getElementById('ev-empty').classList.remove('hidden');
  document.getElementById('ev-result').classList.add('hidden');
  document.getElementById('ev-chart-card').style.display = 'none';
  document.getElementById('ev-plhan-warning').style.display = 'none';
  if (charts.ev) { charts.ev.destroy(); charts.ev = null; }
  if (charts.evAmount) { charts.evAmount.destroy(); charts.evAmount = null; }
  pendingEvBet = null;
}

// ========== BET RECORD ==========
// ── storage 키 단일 상수 — 파일 전체에서 이 상수만 참조 ──
const STORAGE_KEY = 'edge_bets';

/** bets 직렬화 헬퍼 — stringify 실패 시 명확한 에러 던짐 (세 케이스 공통) */
function _serializeBets() {
  try {
    return JSON.stringify(bets);
  } catch (e) {
    throw new Error('[storage] serialization failed: ' + e.message);
  }
}

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

function _addBetCore() {
  const sports = getSelectedVals('sport');
  const types  = getSelectedVals('type');
  const mode   = document.getElementById('r-betmode').value;
  const editId = document.getElementById('r-edit-id').value;
  const isDouble = document.getElementById('r-double').value === 'true';

  // 단폴 모드일 때만 종목/형식 필수 체크 (다폴더는 폴더 행에서 각각 선택)
  if (mode === 'single') {
    if (!sports.length) { alert('종목을 선택하세요.'); return; }
    if (!types.length)  { alert('베팅 형식을 선택하세요.'); return; }
  }

  const amount = parseFloat(document.getElementById('r-amount').value) || 0;
  const odds   = parseFloat(document.getElementById('r-betman-odds').value) || 0;
  if (!amount || !odds) { alert('베팅 금액과 배당률을 입력하세요.'); return; }

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
        alert('EV+ 베팅 근거를 5자 이상 입력하세요.');
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
        alert(`F${i+1} 베팅 근거를 5자 이상 입력하세요.`);
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
  betData.ev    = (_mp && _od && _od >= 1) ? (_rawProb * (_od-1)) - (1 - _rawProb) : null;
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
    const _ss = window._SS;
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
                             : _adjProbPctFallback / 100, // 0~1
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
  if (_mp && _od && _od >= 1) {
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

  if (editId) {
    // 수정 모드 — 기존 기록 덮어쓰기 (remaining 재차감 없음)
    const idx = bets.findIndex(b => String(b.id) === String(editId));
    if (idx !== -1) {
      const oldAmount = bets[idx].amount || 0;
      bets[idx] = { ...bets[idx], ...betData };
      const diff = betData.amount - oldAmount;
      if (diff !== 0 && typeof applyRoundBet === 'function') {
        if (diff > 0) applyRoundBet(diff);
        else if (typeof refundRoundBet === 'function') refundRoundBet(-diff);
      }
    }
    try {
      const serialized = _serializeBets();
      localStorage.setItem(STORAGE_KEY, serialized);
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved || saved.length !== serialized.length || saved !== serialized) {
        throw new Error('[storage] write verification failed');
      }
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
      bets.push(bet1);
      bets.push(bet2);
      const serialized = _serializeBets();
      localStorage.setItem(STORAGE_KEY, serialized);
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved || saved.length !== serialized.length || saved !== serialized) {
        throw new Error('[storage] write verification failed');
      }
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
      // [B][E] applyRoundBet → push → storage 원자 실행
      applyRoundBet?.(amount);
      if (window.__DEV__) {
        const _dbgAfter = getActiveRound()?.remaining;
        console.log('[ROUND]', { before: _dbgBefore, delta: amount, after: _dbgAfter });
      }
      bets.push(bet);
      const serialized = _serializeBets();
      localStorage.setItem(STORAGE_KEY, serialized);
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved || saved.length !== serialized.length || saved !== serialized) {
        throw new Error('[storage] write verification failed');
      }
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

  const ss = window._SS;
  const n = ss ? ss.n : 0;

  if (n < 30) {
    hint.style.display = 'block';
    hint.innerHTML = `<span style="color:var(--text3);">📊 보정 대기 중 — ${n}/30건 (${30-n}건 더 필요)</span>`;
    return;
  }

  const diff = adj - raw;
  const diffStr = (diff >= 0 ? '+' : '') + diff.toFixed(1);
  const color = diff < -2 ? 'var(--red)' : diff > 2 ? 'var(--green)' : 'var(--accent)';
  const label = diff < -2 ? '⚠️ 과신 보정' : diff > 2 ? '📈 과소추정 보정' : '✅ 소폭 보정';
  const strength = n < 50 ? `50% 강도 (${n}건)` : `100% 강도 (${n}건)`;

  hint.style.display = 'block';
  hint.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
      <span style="color:var(--text3);font-size:10px;">${label} · ${strength}</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="font-size:12px;color:var(--text3);">내 입력 <span class="mono" style="color:var(--text2);">${raw.toFixed(1)}%</span></span>
      <span style="color:var(--text3);">→</span>
      <span style="font-size:16px;font-weight:900;font-family:'JetBrains Mono',monospace;color:${color};">${adj.toFixed(1)}%</span>
      <span style="font-size:11px;color:${color};">(${diffStr}%p) 강제 적용됨</span>
    </div>
  `;
}

// ── Calibration Layer 헬퍼 ──────────────────────────────────
// state.js의 getCalibCorrFactor + _SS.activeCorrFactor를 사용
// EV를 자동 보정하는 공통 함수. UI에서 직접 호출.
function getActiveCorrFactor() {
  return (window._SS && window._SS.activeCorrFactor != null)
    ? window._SS.activeCorrFactor : 1.0;
}

// corrFactor 활성 상태 설명 텍스트 반환
function getCalibStatusText() {
  if (!window._SS) return null;
  const n   = window._SS.n || 0;
  const acf = window._SS.activeCorrFactor;
  if (n < 30 || acf == null) return null;
  const pct = ((1 - acf) * 100).toFixed(1);
  const strength = n < 50 ? '50%' : '100%';
  return `📐 보정 활성 (${strength} 강도 · ${pct}% 과신 보정 중 · ${n}건 기준)`;
}

// 베트맨 올림: 소수점 둘째 자리가 있으면 첫째 자리로 올림
// 예) 3.01→3.1  1.89→1.9  2.50→2.5  1.30→1.3
function betmanRound(odds) {
  // 소수점 둘째 자리 확인 (부동소수점 오차 방지: 반올림 후 체크)
  const str = odds.toFixed(2);           // e.g. "1.89"
  const dec2 = parseInt(str.slice(-1));  // 둘째 자리 숫자
  if (dec2 === 0) return parseFloat(str.slice(0, -1)); // 소수 둘째 = 0 → 그대로 (1.90 → 1.9)
  return Math.ceil(odds * 10) / 10;      // 둘째 자리 있으면 올림
}

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
function getCombinedCalibratedProb(rows) {
  let logAdj = 0;
  let count  = 0;
  rows.forEach(row => {
    const prob = parseFloat(row.querySelector('.folder-prob')?.value) || 0;
    if (prob > 0) {
      const baseProb   = prob / 100;
      const calibrated = (typeof getCalibrated === 'function') ? getCalibrated(baseProb) : baseProb;
      const acf        = getActiveCorrFactor();
      const damp       = acf < 0.999 ? 1 - (1 - acf) * 0.5 : 1.0;
      const probAdj    = calibrated * Math.min(damp, 1.0);
      logAdj += Math.log(Math.max(probAdj, 1e-6));
      count++;
    }
  });
  return count > 0 ? Math.exp(logAdj) : null;
}

function calcMultiEV() {
  const rows      = document.querySelectorAll('.folder-row');
  const resultEl  = document.getElementById('multi-ev-result');
  const noteEl    = document.getElementById('multi-ev-note');

  if (!resultEl) return;

  let combinedOdds    = 1;
  let combinedImplied = 1;
  let validOddsCount  = 0;
  let validProbCount  = 0;
  const impliedParts  = [];

  // 로그 합 방식 — 다폴더 확률 붕괴 방지
  let logRaw = 0;

  rows.forEach((row) => {
    const oddsInput  = row.querySelector('.folder-odds');
    const probInput  = row.querySelector('.folder-prob');
    const impliedEl  = row.querySelector('.folder-implied');
    const odds = parseFloat(oddsInput ? oddsInput.value : 0) || 0;
    const prob = parseFloat(probInput ? probInput.value : 0) || 0;

    if (odds >= 1.01) {
      const thisImplied = 1 / odds;
      combinedOdds    *= odds;
      combinedImplied *= thisImplied;
      validOddsCount++;
      impliedParts.push((thisImplied * 100).toFixed(1));

      if (impliedEl) {
        impliedEl.textContent = `내재확률 ${(thisImplied * 100).toFixed(1)}%`;
        impliedEl.style.color = 'var(--text3)';
      }
      if (prob > 0) {
        const baseProb = prob / 100;
        logRaw += Math.log(Math.max(baseProb, 1e-6));
        validProbCount++;
      }
    } else {
      if (impliedEl) impliedEl.textContent = '';
    }
  });

  // 공통 함수로 보정 확률 계산
  const combinedMyProb         = Math.exp(logRaw);
  const adjustedCombinedMyProb = getCombinedCalibratedProb(rows) ?? combinedMyProb;

  // 요약 카드 — 배당만 있어도 갱신
  const coEl = document.getElementById('multi-combined-odds');
  const ciEl = document.getElementById('multi-combined-implied');
  const mpEl = document.getElementById('multi-my-prob');

  if (validOddsCount >= 2) {
    const roundedOdds = betmanRound(combinedOdds);
    if (coEl) {
      coEl.innerHTML = roundedOdds.toFixed(2) + (Math.abs(combinedOdds - roundedOdds) > 0.005 ? '<br><span style="font-size:11px;color:var(--text3);font-weight:400;">(원 ' + combinedOdds.toFixed(2) + ')</span>' : '');
    }
    if (ciEl) {
      ciEl.textContent  = (combinedImplied * 100).toFixed(1) + '%';
      ciEl.style.color  = 'var(--red)';
    }

    // 합산 배당 항상 배당률 칸에 자동 반영
    const oddsInputField = document.getElementById('r-betman-odds');
    if (oddsInputField) oddsInputField.value = roundedOdds.toFixed(2);

    if (validProbCount === validOddsCount && validOddsCount >= 2) {
      // 승률도 입력됨 → EV 계산
      const impliedProb = 1 / roundedOdds;
      const acf  = getActiveCorrFactor();
      const isOn = acf < 0.999;

      // 원본 EV (보정 전 — 취소선 표시용)
      const myProbRaw = combinedMyProb;
      const evRaw     = (myProbRaw * (roundedOdds - 1)) - ((1 - myProbRaw) * 1);

      // calibration은 항상 적용 — acf 여부와 무관
      const myProb = adjustedCombinedMyProb;
      const ev     = (myProb * (roundedOdds - 1)) - ((1 - myProb) * 1);
      const evPct  = (ev * 100).toFixed(1);
      const edge   = ((myProb - impliedProb) * 100).toFixed(1);

      // 📊 폴더 성능 검증용 로그 — corrPenalty 도입 여부 판단 기반 데이터
      // result는 기록 저장 시점에 확정되므로 여기선 'pending'
      console.log('📊 FOLDER_PERF:', {
        folderCount: validProbCount,
        prob: parseFloat((myProb * 100).toFixed(2)),
        ev: parseFloat((ev * 100).toFixed(2)),
        odds: roundedOdds,
        result: 'pending' // 저장 후 실제 결과로 대조
      });

      if (mpEl) mpEl.textContent = (myProb * 100).toFixed(1) + '%';

      // ── 원웨이 판단 블록 (다폴) ──
      const _fc = validOddsCount;

      // [2] 과신 방지 필터
      const _safeP = applyMultiProbSafetyFilter({
        p: myProb,
        odds: roundedOdds,
        folderCount: _fc
      });

      // [3] Kelly fraction (음수 방어)
      const _kellyFracRaw = (roundedOdds * _safeP - 1) / (roundedOdds - 1);
      const _kellyFrac    = Math.max(0, _kellyFracRaw);

      // [4] EV (safeP 기준)
      const _evSafe = _safeP * (roundedOdds - 1) - (1 - _safeP);

      // [5] 금액
      const _base       = (appSettings.kellySeed || 0) / 12;
      const _multiplier = getKellyMultiplier();
      const _rawBet     = Math.max(0, _base * _kellyFrac * _multiplier);

      // [6] 다폴 리스크 보정 (safeP와 역할 분리 — 완화 적용)
      const _riskAdj =
        _fc === 2 ? 0.85 :
        _fc === 3 ? 0.70 :
        0.50;
      const _finalBet = Math.max(0, Math.floor(_rawBet * _riskAdj));

      // [8] verdict (EV<=0 or kelly=0 → PASS)
      const _verdict = _evSafe <= 0 || _finalBet <= 0
        ? 'PASS'
        : (window._SS?.verdict || 'WAIT');

      renderDecisionBlock({
        isMulti:     true,
        ev:          _evSafe,
        kelly:       _finalBet,
        rawP:        myProb,
        safeP:       _safeP,
        verdict:     _verdict,
        folderCount: _fc
      });

      const evRawPct = (evRaw * 100).toFixed(1);
      const calibNote = isOn
        ? ` <span style="font-size:10px;color:var(--gold);">📐보정</span>`
        : '';
      const rawStrike = isOn
        ? `<span style="color:var(--text3);text-decoration:line-through;font-size:11px;">${evRaw>=0?'+':''}${evRawPct}%</span> `
        : '';

      if (ev > 0) {
        resultEl.innerHTML = rawStrike + `<span>+${evPct}%</span>` + calibNote;
        resultEl.style.color = 'var(--green)';
        const noteBase = '북메이커 내재확률 ' + (combinedImplied*100).toFixed(1) + '% vs 내 예상 ' + (myProb*100).toFixed(1) + '% (우위 +' + edge + '%p)' + (Math.abs(combinedOdds - roundedOdds) > 0.005 ? ' — 베트맨 올림 ' + combinedOdds.toFixed(2) + '→' + roundedOdds.toFixed(2) : '');
        if (noteEl) noteEl.textContent = noteBase;
        setEvDirect(true);
        const _rmp3 = document.getElementById('r-myprob'); if (_rmp3) _rmp3.value = (myProb * 100).toFixed(1);
      } else {
        resultEl.innerHTML = rawStrike + `<span>${evPct}%</span>` + calibNote;
        resultEl.style.color = ev > -0.03 ? 'var(--gold)' : 'var(--red)';
        if (noteEl) noteEl.textContent = `북메이커 내재확률 ${(combinedImplied*100).toFixed(1)}% vs 내 예상 ${(myProb*100).toFixed(1)}% (우위 ${edge}%p)`;
        setEvDirect(false);
        const _rmp4 = document.getElementById('r-myprob'); if (_rmp4) _rmp4.value = (myProb * 100).toFixed(1);
      }

      // ── 단계별 EV 계산 브레이크다운 ──
      const bdEl = document.getElementById('multi-ev-breakdown');
      if (bdEl) {
        const probParts = [];
        rows.forEach(row => {
          const p = parseFloat((row.querySelector('.folder-prob') || {}).value) || 0;
          if (p > 0) probParts.push(p / 100);
        });
        const step1Formula = probParts.map(p => p.toFixed(2)).join(' × ');
        const evVerdict = ev >= 0.05
          ? `<span style="color:var(--green);">✅ EV+ — 좋은 베팅</span>`
          : ev >= 0
          ? `<span style="color:var(--gold);">🟡 EV 경계 — 신중하게</span>`
          : `<span style="color:var(--red);">❌ EV− — 불리한 베팅</span>`;
        const calibLine = isOn
          ? `<div style="margin-top:2px;"><span style="color:var(--text3);">보정 적용 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>${(myProbRaw*100).toFixed(1)}% → <span style="color:var(--gold);">${(myProb*100).toFixed(1)}%</span> <span style="font-size:10px;color:var(--gold);">📐</span></div>`
          : '';
        bdEl.style.display = 'block';
        bdEl.innerHTML = `
          <div style="color:var(--text3);font-size:10px;letter-spacing:1px;margin-bottom:4px;">📐 EV 계산 과정</div>
          <div><span style="color:var(--text3);">1단계 · 폴더 확률 &nbsp;</span>${step1Formula} = <span style="color:var(--accent);">${(myProbRaw*100).toFixed(1)}%</span></div>
          ${calibLine}
          <div><span style="color:var(--text3);">2단계 · EV 계산 &nbsp;&nbsp;&nbsp;</span>${myProb.toFixed(2)} × ${(roundedOdds-1).toFixed(2)} − ${(1-myProb).toFixed(2)} = <span style="color:${ev>=0?'var(--green)':'var(--red)'};">${ev>=0?'+':''}${evPct}%</span></div>
          <div style="margin-top:4px;">${evVerdict}</div>`;
      }
    } else {
      // 배당만 입력됨 → EV 자리에 안내 표시
      if (mpEl) mpEl.textContent = '—';
      resultEl.textContent = '—';
      resultEl.style.color = 'var(--text3)';
      if (noteEl) noteEl.textContent = '각 폴더의 내 예상 승률(%)을 입력하면 EV가 계산됩니다';
      const bdEl2 = document.getElementById('multi-ev-breakdown');
      if (bdEl2) bdEl2.style.display = 'none';
    }
  } else {
    // 배당 미입력
    if (coEl) coEl.textContent = '—';
    if (ciEl) { ciEl.textContent = '—'; ciEl.style.color = 'var(--red)'; }
    if (mpEl) mpEl.textContent = '—';
    resultEl.textContent = '—';
    resultEl.style.color = 'var(--text3)';
    if (noteEl) noteEl.textContent = '각 폴더의 배당과 내 예상 승률을 입력하세요';
    const bdEl3 = document.getElementById('multi-ev-breakdown');
    if (bdEl3) bdEl3.style.display = 'none';
    clearDecisionBlock();
  }
}

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
  // 형식 팝업 선택 초기화
  window._selectedType = null;
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

function toggleRecordDetail(id) {
  const row = document.getElementById('record-detail-' + id);
  if (!row) return;
  row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
}

function toggleFolderMemoRow(id) {
  const row = document.getElementById('fmemo-row-' + id);
  if (!row) return;
  row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
}

function resolvebet(id, result) {
  const bet = bets.find(b => String(b.id) === String(id));
  if (!bet) return;
  bet.result = result;
  bet.profit = result === 'WIN'
    ? bet.amount * (bet.betmanOdds - 1)
    : -bet.amount;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bets));
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
  bets = bets.filter(b => String(b.id) !== String(id));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bets));
  updateAll();
  renderTable();
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
let betTemplates = JSON.parse(localStorage.getItem('edge_templates') || '[]');

function saveBetTemplate() {
  const mode   = document.getElementById('r-mode')?.value || 'single';
  const sports = [...document.querySelectorAll('#sport-btns .sel-btn.active')].map(b => b.dataset.val);
  const types  = [...document.querySelectorAll('#type-btns .sel-btn.active')].map(b => b.dataset.val);
  const fc     = document.getElementById('r-folder-count')?.value || '2';

  if (!sports.length || !types.length) { alert('종목과 형식을 선택한 후 저장하세요.'); return; }

  const label = prompt('템플릿 이름을 입력하세요', `${sports.join('+')} ${types.join('+')}${mode === 'multi' ? ` ${fc}폴` : ''}`);
  if (!label) return;

  betTemplates.push({ id: Date.now(), label, mode, sports, types, folderCount: fc });
  localStorage.setItem('edge_templates', JSON.stringify(betTemplates));
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
  localStorage.setItem('edge_templates', JSON.stringify(betTemplates));
  renderTemplateList();
}

function renderTemplateList() {
  const el = document.getElementById('template-list');
  if (!el) return;
  if (betTemplates.length === 0) {
    el.innerHTML = '<span style="font-size:10px;color:var(--text3);">저장된 템플릿 없음</span>';
    return;
  }
  el.innerHTML = betTemplates.map(t => `
    <div style="display:flex;align-items:center;gap:2px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;padding:3px 7px;font-size:10px;">
      <span style="cursor:pointer;color:var(--text2);" onclick="loadBetTemplate(${t.id})">${t.label}</span>
      <span style="cursor:pointer;color:var(--text3);margin-left:3px;font-size:9px;" onclick="deleteBetTemplate(${t.id})">✕</span>
    </div>`).join('');
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
  bets = [];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bets));
  // 필터 초기화
  const fs = document.getElementById('filter-sport');   if (fs) fs.value = 'ALL';
  const fr = document.getElementById('filter-result');  if (fr) fr.value = 'ALL';
  const fd = document.getElementById('filter-daterange'); if (fd) fd.value = 'ALL';
  const ff = document.getElementById('filter-folder');  if (ff) ff.value = 'ALL';
  updateAll();
}

function exportCSV() {
  if (bets.length === 0) { alert('내보낼 베팅 기록이 없습니다.'); return; }
  const headers = ['날짜','경기','종목','형식','방식','배당','베팅금','결과','손익','메모'];
  const rows = bets.map(b => [
    b.date || '',
    (b.game || '').replace(/,/g, ';'),
    (b.sport || '').replace(/,/g, ';'),
    (b.type || '').replace(/,/g, ';'),
    b.mode === 'multi' ? `다폴${actualFolderCount(b)}` : '단폴',
    b.betmanOdds || '',
    b.amount || '',
    b.result || '',
    Math.round(b.profit) || 0,
    (b.memo || '').replace(/,/g, ';'),
  ]);
  const csv = '\uFEFF' + [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `edge_finder_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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

function backupData() {
  const data = { bets, settings: appSettings, exportedAt: new Date().toISOString(), version: '6.1' };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `edge_finder_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function restoreData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.bets || !Array.isArray(data.bets)) { alert('올바른 백업 파일이 아닙니다.'); return; }
      if (!confirm(`백업 파일에서 ${data.bets.length}개의 기록을 불러옵니다. 기존 데이터가 덮어쓰기 됩니다. 계속하시겠습니까?`)) return;
      bets = data.bets;
      if (data.settings) { appSettings = data.settings; localStorage.setItem('edge_settings', JSON.stringify(appSettings)); }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bets));
      loadSettingsDisplay();
      updateAll();
      alert(`✅ ${bets.length}개의 베팅 기록을 성공적으로 불러왔습니다.`);
    } catch(err) { alert('파일 읽기 실패: ' + err.message); }
  };
  reader.readAsText(file);
}

function handleCSV(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const lines = ev.target.result.split('\n').slice(1);
    lines.forEach(line => {
      const [date,game,sport,type,bOdds,pOdds,amount,result] = line.split(',');
      if (!game) return;
      const bet = {
        id: Date.now() + Math.random(),
        date: date?.trim(), game: game?.trim(), sport: sport?.trim() || 'NBA',
        type: type?.trim() || 'UNDER', isValue: false,
        betmanOdds: parseFloat(bOdds) || 1.85,
        gap: 0, amount: parseFloat(amount) || 0,
        result: result?.trim()?.toUpperCase() || 'PENDING', memo: ''
      };
      bet.profit = bet.result === 'WIN' ? bet.amount * (bet.betmanOdds - 1) :
                   bet.result === 'LOSE' ? -bet.amount : 0;
      bets.push(bet);
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bets));
    updateAll();
    alert(`CSV 로드 완료!`);
  };
  reader.readAsText(file);
}

// ========== RENDER TABLE ==========
// ── 페이지네이션 상태 ──
let recordPage = 1;
const RECORD_PAGE_SIZE = 12;
let recordFiltered = [];

let kellyPage = 1;
const KELLY_PAGE_SIZE = 12;
let kellyRows = [];

function getRecordFiltered() {
  const filterSport  = (document.getElementById('filter-sport')  || {}).value || 'ALL';
  const filterResult = (document.getElementById('filter-result') || {}).value || 'ALL';
  const filterDateEl = document.getElementById('filter-daterange');
  const filterDate   = filterDateEl ? filterDateEl.value : 'ALL';
  const filterFolder = (document.getElementById('filter-folder') || {}).value || 'ALL';

  const now   = new Date();
  const today = now.toISOString().split('T')[0];

  function inDateRange(dateStr) {
    if (filterDate === 'ALL' || !dateStr) return true;
    const d = new Date(dateStr);
    if (filterDate === '7')         return (now - d) <= 7  * 86400000;
    if (filterDate === '30')        return (now - d) <= 30 * 86400000;
    if (filterDate === '90')        return (now - d) <= 90 * 86400000;
    if (filterDate === 'thismonth') return dateStr.slice(0,7) === today.slice(0,7);
    if (filterDate === 'lastmonth') {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return dateStr.slice(0,7) === lm.toISOString().slice(0,7);
    }
    return true;
  }

  return [...bets].reverse().filter(b =>
    (filterSport  === 'ALL' || (b.sport || '').includes(filterSport)) &&
    (filterResult === 'ALL' || b.result === filterResult) &&
    (filterFolder === 'ALL' ||
      (filterFolder === 'single' && b.mode !== 'multi') ||
      (filterFolder === '2' && b.mode === 'multi' && (b.folderCount === '2' || b.folderCount === 2)) ||
      (filterFolder === '3' && b.mode === 'multi' && (b.folderCount === '3' || b.folderCount === 3)) ||
      (filterFolder === '4' && b.mode === 'multi' && (b.folderCount === '4+' || parseInt(b.folderCount) >= 4))
    ) &&
    inDateRange(b.date)
  );
}

function goRecordPage(dir) {
  const totalPages = Math.ceil(recordFiltered.length / RECORD_PAGE_SIZE) || 1;
  if (dir === 'first') recordPage = 1;
  else if (dir === 'prev')  recordPage = Math.max(1, recordPage - 1);
  else if (dir === 'next')  recordPage = Math.min(totalPages, recordPage + 1);
  else if (dir === 'last')  recordPage = totalPages;
  renderTablePage();
}

function goKellyPage(dir) {
  const totalPages = Math.ceil(kellyRows.length / KELLY_PAGE_SIZE) || 1;
  if (dir === 'prev') kellyPage = Math.max(1, kellyPage - 1);
  else if (dir === 'next') kellyPage = Math.min(totalPages, kellyPage + 1);
  renderKellyPage();
}

function renderKellyPage() {
  const totalPages = Math.ceil(kellyRows.length / KELLY_PAGE_SIZE) || 1;
  kellyPage = Math.min(kellyPage, totalPages);
  const infoEl = document.getElementById('kelly-page-info');
  const numEl  = document.getElementById('kelly-page-num');
  if (infoEl) infoEl.textContent = kellyRows.length > 0 ? `전체 ${kellyRows.length}건` : '기록이 없습니다';
  if (numEl)  numEl.textContent  = `${kellyPage} / ${totalPages}`;
  const tableEl = document.getElementById('kelly-hist-table');
  if (!tableEl) return;
  if (kellyRows.length === 0) {
    tableEl.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px;">EV+ 베팅 기록이 없습니다</td></tr>';
    return;
  }
  const start = (kellyPage - 1) * KELLY_PAGE_SIZE;
  tableEl.innerHTML = kellyRows.slice(start, start + KELLY_PAGE_SIZE).join('');
}

function updateRecordSportFilter() {
  const sel = document.getElementById('filter-sport');
  if (!sel) return;
  const current = sel.value;
  const sports = [...new Set(bets.map(b => b.sport).filter(Boolean))].sort();
  sel.innerHTML = '<option value="ALL">전체 종목</option>';
  sports.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    if (s === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

function renderTable() {
  updateRecordSportFilter();
  recordFiltered = getRecordFiltered();
  // 필터 바뀌면 1페이지로 리셋
  recordPage = 1;
  renderTablePage();
}

// 실제 폴더 수 반환 — 4+폴은 folderOdds 길이로 판단
function actualFolderCount(b) {
  if (b.folderCount !== '4+') return b.folderCount || '';
  if (b.folderOdds && b.folderOdds.length >= 4) return String(b.folderOdds.length);
  return '4';
}

function renderTablePage() {
  if (!recordFiltered || recordFiltered.length === 0) recordFiltered = getRecordFiltered();
  const filtered = recordFiltered;
  const tbody = document.getElementById('record-table');
  if (!tbody) return;
  const totalPages = Math.ceil(filtered.length / RECORD_PAGE_SIZE) || 1;
  recordPage = Math.min(recordPage, totalPages);

  const infoEl = document.getElementById('record-page-info');
  const numEl  = document.getElementById('record-page-num');
  if (infoEl) infoEl.textContent = filtered.length > 0 ? `전체 ${filtered.length}건` : '기록이 없습니다';
  if (numEl)  numEl.textContent  = `${recordPage} / ${totalPages}`;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:24px;">기록이 없습니다.</td></tr>';
    return;
  }

  const start    = (recordPage - 1) * RECORD_PAGE_SIZE;
  const pageData = filtered.slice(start, start + RECORD_PAGE_SIZE);

  tbody.innerHTML = pageData.map((b, i) => {
    const rowNum = (recordPage - 1) * RECORD_PAGE_SIZE + i + 1;
    const profit = b.profit || 0;
    const profitColor = profit > 0 ? 'var(--green)' : profit < 0 ? 'var(--red)' : 'var(--text2)';
    const resultBadge = b.result === 'WIN'
      ? '<span class="badge badge-value">적중</span>'
      : b.result === 'LOSE'
      ? '<span class="badge badge-novalue">미적중</span>'
      : b.mode === 'multi'
      ? `<div style="display:flex;gap:3px;">
           <button class="btn btn-sm" style="background:rgba(0,230,118,0.2);color:var(--green);border:1px solid var(--green);padding:2px 6px;font-size:10px;" onclick="resolvebet(${b.id},'WIN')">전체적중</button>
           <button class="btn btn-sm" style="background:rgba(255,59,92,0.2);color:var(--red);border:1px solid var(--red);padding:2px 6px;font-size:10px;" onclick="openFolderResultModal(${b.id})">미적중</button>
         </div>`
      : `<div style="display:flex;gap:3px;">
           <button class="btn btn-sm" style="background:rgba(0,230,118,0.2);color:var(--green);border:1px solid var(--green);padding:2px 6px;font-size:10px;" onclick="resolvebet(${b.id},'WIN')">적중</button>
           <button class="btn btn-sm" style="background:rgba(255,59,92,0.2);color:var(--red);border:1px solid var(--red);padding:2px 6px;font-size:10px;" onclick="resolvebet(${b.id},'LOSE')">미적중</button>
         </div>`;
    const modeBadge = b.mode === 'multi'
      ? `<span class="badge badge-hot" style="cursor:pointer;" onclick="toggleRecordDetail(${b.id})">다폴${actualFolderCount(b)} ▾</span>`
      : '<span class="badge badge-neutral">단폴</span>';

    // 다폴더 상세 행 생성
    let detailRow = '';
    // ── Decision 로그 뱃지 (null-safe: 과거 베팅 호환) ───────
    const dec = b.decision || {};  // 기존 데이터에 decision 없으면 빈 객체
    const decFactor  = dec.factor  ?? 1.0;
    const decAllow   = dec.allow   ?? true;
    const decReason  = dec.reason  ?? 'LEGACY';
    const decAdjProb = dec.adjustedProb ?? b.myProb;   // % 단위
    const decAdjDelta = dec.adjustDelta ?? 0;
    const decRecentEce = dec.recentEce ?? null;

    const decBadge = (dec.reason && dec.reason !== 'LEGACY')
      ? (() => {
          const color = decAllow === false ? 'var(--red)'
            : decFactor < 0.5 ? 'var(--red)'
            : decFactor < 1.0 ? '#ff9800'
            : 'var(--green)';
          const icon  = decAllow === false ? '🚫' : decFactor < 1.0 ? '⚠️' : '✅';
          const adjStr = decAdjDelta && Math.abs(decAdjDelta) > 0.3
            ? ` <span style="color:${decAdjDelta < 0 ? 'var(--red)' : 'var(--green)'};font-size:9px;">(${decAdjDelta > 0 ? '+' : ''}${decAdjDelta.toFixed(1)}%보정)</span>`
            : '';
          const eceStr = decRecentEce != null ? decRecentEce.toFixed(1) + '%' : 'N/A';
          return `<span title="Decision: ${decReason} | Kelly×${decFactor} | recentEce:${eceStr}"
            style="font-size:9px;padding:1px 5px;border-radius:8px;background:${color}22;color:${color};border:1px solid ${color}44;margin-left:4px;white-space:nowrap;">
            ${icon} ×${decFactor}${adjStr}</span>`;
        })()
      : '';

    if (b.mode === 'multi' && b.folderOdds && b.folderOdds.length > 0) {
      const sports  = (b.sport || '').split(', ');
      const types   = (b.type  || '').split(', ');
      const memos   = b.folderMemos || [];
      const folders = b.folderOdds.map((odds, fi) => {
        const sp  = (b.folderSports && b.folderSports[fi]) || sports[fi] || sports[0] || '—';
        const tp  = types[fi] || types[0] || '—';
        const fr  = b.folderResults && b.folderResults[fi];
        const memo = memos[fi] || '';
        const frBadge = fr === 'WIN'
          ? '<span style="color:var(--green);font-size:10px;font-weight:700;">✅</span>'
          : fr === 'LOSE'
          ? '<span style="color:var(--red);font-size:10px;font-weight:700;">❌</span>'
          : '<span style="color:var(--text3);font-size:10px;">—</span>';
        return `<div style="display:flex;align-items:center;gap:6px;padding:4px 6px;background:var(--bg2);border-radius:5px;font-size:11px;">
          <span style="color:var(--text3);font-weight:700;min-width:22px;">F${fi+1}</span>
          <span style="color:var(--accent);font-weight:600;">${sp}</span>
          <span style="color:var(--text3);">${tp}</span>
          <span style="color:var(--text2);font-family:'JetBrains Mono',monospace;">${odds || '—'}배</span>
          ${frBadge}
          ${memo ? `<span style="color:var(--text3);font-size:10px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📝 ${memo}</span>` : ''}
        </div>`;
      }).join('');
      detailRow = `<tr id="record-detail-${b.id}" style="display:none;">
        <td colspan="8" style="padding:4px 8px 8px 28px;background:var(--bg1);">
          <div style="display:flex;flex-direction:column;gap:3px;">${folders}</div>
        </td>
      </tr>`;
    }

    return `
      <tr>
        <td style="font-size:10px;color:var(--text3);">${rowNum}</td>
        <td style="font-size:11px;">${b.date || '—'}</td>
        <td>${modeBadge}</td>
        <td style="font-size:10px;color:var(--text3);max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${b.game && b.game !== '-' ? b.game : ''}">${b.game && b.game !== '-' ? b.game : '—'}${decBadge}</td>
        <td class="mono">${b.betmanOdds || '—'}</td>
        <td>${resultBadge}</td>
        <td style="color:${profitColor};font-family:'JetBrains Mono',monospace;">${profit >= 0 ? '+' : ''}₩${Math.round(profit).toLocaleString()}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-sm" style="background:rgba(0,229,255,0.1);color:var(--accent);border:1px solid rgba(0,229,255,0.3);font-size:10px;padding:3px 7px;margin-right:3px;" onclick="copyBet('${b.id}')">수정</button>
          <button class="btn btn-sm" style="background:rgba(0,230,118,0.1);color:var(--green);border:1px solid rgba(0,230,118,0.3);font-size:10px;padding:3px 7px;margin-right:3px;" onclick="duplicateBet('${b.id}')">복사</button>
          <button class="btn btn-sm" style="color:var(--red);border:1px solid rgba(255,59,92,0.3);background:rgba(255,59,92,0.08);font-size:10px;padding:3px 7px;" onclick="deleteBet('${b.id}')">삭제</button>
        </td>
      </tr>${detailRow}`;
  }).join('');
}

// ========== VAULT — 기록 보관함 ==========
let vaultPage = 1;
const VAULT_PAGE_SIZE = 12;
let vaultFiltered = [];

function getVaultFiltered() {
  const fSport  = (document.getElementById('vault-filter-sport')  || {}).value || 'ALL';
  const fResult = (document.getElementById('vault-filter-result') || {}).value || 'ALL';
  const fFolder = (document.getElementById('vault-filter-folder') || {}).value || 'ALL';
  const fDate   = (document.getElementById('vault-filter-date')   || {}).value || 'ALL';
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  function inRange(dateStr) {
    if (fDate === 'ALL' || !dateStr) return true;
    const d = new Date(dateStr);
    if (fDate === '7')         return (now - d) <= 7  * 86400000;
    if (fDate === '30')        return (now - d) <= 30 * 86400000;
    if (fDate === '90')        return (now - d) <= 90 * 86400000;
    if (fDate === 'thismonth') return dateStr.slice(0,7) === today.slice(0,7);
    if (fDate === 'lastmonth') {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return dateStr.slice(0,7) === lm.toISOString().slice(0,7);
    }
    return true;
  }
  return [...bets].reverse().filter(b => {
    const sportMatch = fSport === 'ALL'
      || (b.sport || '').includes(fSport)
      || (b.folderSports && b.folderSports.some(s => s === fSport));
    return sportMatch &&
      (fResult === 'ALL' || b.result === fResult) &&
      (fFolder === 'ALL' ||
        (fFolder === 'single' && b.mode !== 'multi') ||
        (fFolder !== 'single' && b.mode === 'multi' && b.folderCount === fFolder)
      ) &&
      inRange(b.date);
  });
}

function goVaultPage(dir) {
  const total = Math.ceil(vaultFiltered.length / VAULT_PAGE_SIZE) || 1;
  if (dir === 'first') vaultPage = 1;
  else if (dir === 'prev') vaultPage = Math.max(1, vaultPage - 1);
  else if (dir === 'next') vaultPage = Math.min(total, vaultPage + 1);
  else if (dir === 'last') vaultPage = total;
  renderVaultPage();
}

function renderVault() {
  vaultFiltered = getVaultFiltered();
  vaultPage = 1;
  renderVaultPage();
}

function renderVaultPage() {
  const tbody = document.getElementById('vault-table');
  if (!tbody) return;
  const total = Math.ceil(vaultFiltered.length / VAULT_PAGE_SIZE) || 1;
  vaultPage = Math.min(vaultPage, total);

  const infoEl = document.getElementById('vault-page-info');
  const numEl  = document.getElementById('vault-page-num');
  if (infoEl) infoEl.textContent = vaultFiltered.length > 0 ? `전체 ${vaultFiltered.length}건 · 페이지당 ${VAULT_PAGE_SIZE}개` : '기록이 없습니다';
  if (numEl)  numEl.textContent  = `${vaultPage} / ${total}`;

  if (vaultFiltered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text3);padding:24px;">기록이 없습니다.</td></tr>';
    return;
  }

  const start    = (vaultPage - 1) * VAULT_PAGE_SIZE;
  const pageData = vaultFiltered.slice(start, start + VAULT_PAGE_SIZE);

  tbody.innerHTML = pageData.map((b, i) => {
    const rowNum = (vaultPage - 1) * VAULT_PAGE_SIZE + i + 1;
    const profitColor = b.profit > 0 ? 'var(--green)' : b.profit < 0 ? 'var(--red)' : 'var(--text2)';
    const resultBadge = b.result === 'WIN'
      ? '<span class="badge badge-value">적중</span>'
      : b.result === 'LOSE'
      ? '<span class="badge badge-novalue">미적중</span>'
      : '<span class="badge badge-neutral">미결</span>';
    const modeBadge = b.mode === 'multi'
      ? `<span class="badge badge-hot">다폴${actualFolderCount(b)}</span>`
      : '<span class="badge badge-neutral">단폴</span>';
    const hasFolderMemos = b.folderMemos && b.folderMemos.some(m => m && m.trim());
    const hasSingleMemo  = b.mode === 'single' && b.memo && b.memo.trim();
    const hasMemo = hasSingleMemo || hasFolderMemos;
    const memoContent = hasSingleMemo
      ? b.memo.replace(/</g,'&lt;').replace(/>/g,'&gt;')
      : hasFolderMemos
      ? b.folderMemos.map((m,i) => m ? `<b style="color:var(--text3);font-size:10px;">F${i+1}</b> ${m.replace(/</g,'&lt;').replace(/>/g,'&gt;')}`:'').filter(Boolean).join('<br>')
      : '';
    const memoCell = hasMemo
      ? `<div onclick="toggleVaultMemo(this)" style="cursor:pointer;" class="vault-memo-cell">
           <div class="vault-memo-short" style="font-size:11px;color:var(--text3);">📝 메모 보기</div>
           <div class="vault-memo-full" style="display:none;font-size:12px;color:var(--text2);line-height:1.6;white-space:pre-wrap;padding:6px 8px;background:rgba(255,215,0,0.06);border:1px solid rgba(255,215,0,0.2);border-radius:6px;margin-top:4px;">${memoContent}</div>
         </div>`
      : '<span style="color:var(--text3);">—</span>';
    return `<tr>
      <td style="font-size:10px;color:var(--text3);">${rowNum}</td>
      <td style="font-size:11px;white-space:nowrap;">${b.date || '—'}</td>
      <td>${modeBadge}</td>
      <td style="font-size:11px;color:var(--text3);">${b.game && b.game !== '-' ? b.game : '—'}</td>
      <td style="font-size:11px;">${b.sport || '—'}</td>
      <td style="font-size:11px;">${b.type  || '—'}</td>
      <td class="mono">${b.betmanOdds || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;">₩${(b.amount||0).toLocaleString()}</td>
      <td>${resultBadge}</td>
      <td style="color:${profitColor};font-family:'JetBrains Mono',monospace;">${b.profit >= 0 ? '+' : ''}₩${Math.round(b.profit||0).toLocaleString()}</td>
      <td>${memoCell}</td>
    </tr>`;
  }).join('');
}
function toggleVaultMemo(el) {
  const short = el.querySelector('.vault-memo-short');
  const full  = el.querySelector('.vault-memo-full');
  const isOpen = full.style.display !== 'none';
  full.style.display = isOpen ? 'none' : 'block';
  short.textContent  = isOpen ? '📝 메모 보기' : '📝 접기';
  short.style.color  = isOpen ? 'var(--text3)' : 'var(--gold)';
}

function getActivePage() {
  const active = document.querySelector('.page.active');
  return active ? active.id.replace('page-', '') : 'dashboard';
}

// ========== PRED PAGINATION ==========
let predPage = 1;
let predAllBets = [];
const PRED_PAGE_SIZE = 12;

function goPredPage(dir) {
  const total = Math.ceil(predAllBets.length / PRED_PAGE_SIZE) || 1;
  if (dir === 'first') predPage = 1;
  else if (dir === 'prev') predPage = Math.max(1, predPage - 1);
  else if (dir === 'next') predPage = Math.min(total, predPage + 1);
  else if (dir === 'last') predPage = total;
  renderPredPage();
}

function renderPredPage() {
  const tbody  = document.getElementById('pred-table');
  const infoEl = document.getElementById('pred-page-info');
  const numEl  = document.getElementById('pred-page-num');
  const total  = Math.ceil(predAllBets.length / PRED_PAGE_SIZE) || 1;
  predPage = Math.min(predPage, total);

  if (infoEl) infoEl.textContent = predAllBets.length > 0 ? `전체 ${predAllBets.length}건` : '데이터 없음';
  if (numEl)  numEl.textContent  = `${predPage} / ${total}`;

  if (!predAllBets.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px;">예상 승률을 입력한 베팅 기록이 없습니다</td></tr>`;
    return;
  }

  const start    = (predPage - 1) * PRED_PAGE_SIZE;
  const pageData = predAllBets.slice(start, start + PRED_PAGE_SIZE);

  tbody.innerHTML = pageData.map((b, i) => {
    const rowNum = (predPage - 1) * PRED_PAGE_SIZE + i + 1;
    const impliedProb = (1 / b.betmanOdds * 100).toFixed(1);
    const edge = (b.myProb - parseFloat(impliedProb)).toFixed(1);
    const edgeColor = parseFloat(edge) >= 0 ? 'var(--green)' : 'var(--red)';
    const resultBadge = b.result === 'WIN'
      ? '<span class="badge badge-value">적중</span>'
      : b.result === 'LOSE'
      ? '<span class="badge badge-novalue">미적중</span>'
      : '<span class="badge badge-neutral">미결</span>';
    return `<tr>
      <td style="font-size:10px;color:var(--text3);">${rowNum}</td>
      <td style="font-size:10px;white-space:nowrap;">${b.date || '—'}</td>
      <td style="font-size:10px;">${(b.sport || '—').slice(0,8)}</td>
      <td class="mono" style="font-size:11px;">${b.betmanOdds.toFixed(2)}</td>
      <td class="mono" style="font-size:11px;">${impliedProb}%</td>
      <td class="mono" style="font-size:11px;color:var(--accent2);">${b.myProb.toFixed(1)}%</td>
      <td class="mono" style="font-size:11px;color:${edgeColor};">${parseFloat(edge)>=0?'+':''}${edge}%p</td>
      <td>${resultBadge}</td>
    </tr>`;
  }).join('');
}

// ========== 피보나치 손실 만회 시스템 ==========
const FIB_SEQ = [1,2,3,5,8,13,21,34,55,89,144,233,377];
const FIB_PAGE_SIZE = 5;
let _fibPage = 1;

function fibGoPage(dir) {
  _fibPage += dir;
  updateFibonacci();
}

function fibGetBase() {
  const saved = localStorage.getItem('edge_fib_base');
  return saved ? parseInt(saved) : 1000;
}

function fibUpdateBase() {
  const input = document.getElementById('fib-base-input');
  const val = parseInt(input?.value);
  if (val && val >= 100) {
    localStorage.setItem('edge_fib_base', val);
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
          <td style="color:var(--text2);font-size:11px;">${b.match||'—'}</td>
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
  // ── 중앙 엔진 먼저 실행 ──
  try { calcSystemState(); } catch(e) { console.warn('calcSystemState error:', e); }

  updateFundCards();
  const activePage = getActivePage();
  if (activePage === 'analysis')  updateStatsAnalysis();
  if (activePage === 'analysis2') updateStatsAnalysis();
  if (activePage === 'analysis3') { updateStatsAnalysis(); updateEvBias(); updateEvMonthly(); updateEvCum(); }
  if (activePage === 'analyze')   updateAnalyzeTab();
  if (activePage === 'goal')      { updateRoundHistory(); updateGoalStats(); }
  if (activePage === 'predict')   { updateGoalStats(); updatePredictTab(); }
  if (activePage === 'simulator') { updateKellyHistory(); try { updateFibonacci(); } catch(e) { console.warn('updateFibonacci error:', e); } }
  if (activePage === 'vault')     renderVault();
  // 뱅크롤/베팅시드 자동 갱신 — 에러나도 renderTable까지 도달하도록 try-catch
  try { updateGoalBankrollDisplay(); } catch(e) { console.warn('updateGoalBankrollDisplay', e); }
  try { updateWeeklySeedStatus(); } catch(e) { console.warn('updateWeeklySeedStatus', e); }
  try { updateDashboardRoundStats(); } catch(e) { console.warn('updateDashboardRoundStats', e); }
  try { updateSimRoundSeedBanner(); } catch(e) { console.warn('updateSimRoundSeedBanner', e); }
  try { updateGameSuggestions(); } catch(e) { console.warn('updateGameSuggestions', e); }
  try { updateRetroBanner(); } catch(e) { console.warn('updateRetroBanner', e); }
  try { updateSlumpBanner(); } catch(e) { console.warn('updateSlumpBanner', e); }
  try { checkAutoRoundReset(); } catch(e) { console.warn('checkAutoRoundReset', e); }
  try { loadSettingsDisplay(); } catch(e) { console.warn('loadSettingsDisplay', e); }
  // KPI 카드 — _SS 단일 소스, scope 전환 연동
  updateDashboardKPI();
  renderTable();
  renderRecentTable();
  updateCharts();
}

// ── 대시보드 KPI 카드 갱신 — scope 전환 시에도 호출됨 ──
// refreshAllUI() + updateAll() 양쪽에서 호출. _SS 단일 소스.
function updateDashboardKPI() {
  const SS = window._SS;
  if (!SS) return;

  const totalBets     = SS.n;
  const winRate       = SS.winRate * 100;
  const totalProfit   = SS.totalProfit;
  const totalInvested = SS.totalInvest;
  const roi           = SS.roi;
  const avgOdds       = SS.avgOdds;

  // valueBets — SS.resolved 기반 (scope 반영)
  const valueBets    = SS.resolved.filter(b => b.isValue);
  const valueWins    = valueBets.filter(b => b.result === 'WIN');
  const valueWinRate = valueBets.length > 0 ? (valueWins.length / valueBets.length * 100) : 0;
  const oddsCount    = SS.resolved.filter(b => b.betmanOdds > 0).length;

  // Header
  const _htb = document.getElementById('h-total-bets'); if (_htb) _htb.textContent = totalBets;
  const _hwr = document.getElementById('h-win-rate');   if (_hwr) _hwr.textContent = `${winRate.toFixed(1)}%`;
  const hProfit = document.getElementById('h-profit');
  if (hProfit) { hProfit.textContent = `${totalProfit >= 0 ? '+₩' : '-₩'}${Math.abs(Math.round(totalProfit)).toLocaleString()}`; hProfit.className = `hstat-val ${totalProfit >= 0 ? 'positive' : 'negative'}`; }
  const hRoi = document.getElementById('h-roi');
  if (hRoi) { hRoi.textContent = `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`; hRoi.className = `hstat-val ${roi >= 0 ? 'positive' : 'negative'}`; }

  // Dashboard
  const _dp = document.getElementById('d-profit');
  if (_dp) { _dp.textContent = `${totalProfit >= 0 ? '+₩' : '-₩'}${Math.abs(Math.round(totalProfit)).toLocaleString()}`; _dp.className = `stat-val ${totalProfit >= 0 ? 'green' : 'red'}`; }
  const dProfitChange = document.getElementById('d-profit-change');
  if (dProfitChange) {
    if (totalInvested > 0) {
      dProfitChange.textContent = `투자금 ₩${Math.round(totalInvested).toLocaleString()} 대비 ${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`;
      dProfitChange.className = `stat-change ${roi >= 0 ? 'up' : 'down'}`;
    } else {
      dProfitChange.textContent = '—';
    }
  }

  const _dao = document.getElementById('d-avg-odds');
  const _daol = document.getElementById('d-avg-odds-label');
  if (_dao)  { _dao.textContent  = avgOdds > 0 ? avgOdds.toFixed(2) : '—'; }
  if (_daol) { _daol.textContent = oddsCount > 0 ? `${oddsCount}건 평균` : '결과 있는 베팅 기준'; }

  const _dvw = document.getElementById('d-value-winrate'); if (_dvw) _dvw.textContent = `${valueWinRate.toFixed(1)}%`;
  const _dvf = document.getElementById('d-value-fill');    if (_dvf) _dvf.style.width  = `${valueWinRate}%`;
  const dRoi = document.getElementById('d-roi');
  if (dRoi) { dRoi.textContent = `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`; dRoi.className = `stat-val ${roi >= 0 ? 'green' : 'red'}`; }
  const _drn = document.getElementById('d-roi-note'); if (_drn) _drn.textContent = totalBets > 0 ? `${totalBets}경기 기준` : '베팅 기록을 추가하세요';
}

function renderRecentTable() {
  const tbody = document.getElementById('recent-table');
  if (!tbody) return;
  // scope 기반 — SS.resolved + pending 합산 후 최신순 8건
  const SS  = window._SS;
  const _sb = SS
    ? [...SS.resolved, ...(typeof getBetsByScope === 'function' ? getBetsByScope().filter(b => b.result === 'PENDING') : [])]
    : (typeof getBetsByScope === 'function' ? getBetsByScope() : bets);
  const recent = [..._sb].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8);
  if (recent.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text3);padding:24px;">베팅 기록이 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = recent.map(b => {
    const isPending = b.result === 'PENDING';
    const rowStyle = isPending ? 'background:rgba(0,229,255,0.04);border-left:2px solid rgba(0,229,255,0.4);' : '';
    const profitColor = b.profit > 0 ? 'var(--green)' : b.profit < 0 ? 'var(--red)' : 'var(--text2)';

    const resultBadge = b.result === 'WIN'
      ? '<span class="badge badge-value">✓</span>'
      : b.result === 'LOSE'
      ? '<span class="badge badge-novalue">✗</span>'
      : '<span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700;background:rgba(0,229,255,0.1);color:var(--accent);border:1px solid rgba(0,229,255,0.3);">🔄 진행중</span>';

    // EV 표시
    let evDisplay = '—';
    if (b.ev !== undefined && b.ev !== null) {
      const evPct = (b.ev * 100).toFixed(1);
      const evColor = b.ev > 0 ? 'var(--green)' : 'var(--red)';
      evDisplay = `<span style="color:${evColor};font-weight:700;">${b.ev > 0 ? '+' : ''}${evPct}%</span>`;
    } else if (b.isValue) {
      evDisplay = '<span style="color:var(--accent);font-size:10px;">EV+</span>';
    }

    const profitDisplay = isPending
      ? '<span style="color:var(--text3);font-size:11px;">대기중</span>'
      : `<span style="color:${profitColor};">${b.profit >= 0 ? '+' : ''}₩${Math.round(b.profit).toLocaleString()}</span>`;

    return `
      <tr style="${rowStyle}">
        <td>${b.date || '—'}</td>
        <td>${b.isValue ? '⚡ ' : ''}${b.game || '—'}</td>
        <td><span class="tag tag-${(b.sport||'').toLowerCase().replace(/[^a-z가-힣]/g,'')}">${b.sport||'—'}</span></td>
        <td class="${b.type === 'UNDER' ? 'under' : b.type === 'OVER' ? 'over' : ''}">${b.type}</td>
        <td>${b.betmanOdds || '—'}</td>
        <td>${evDisplay}</td>
        <td>₩${b.amount.toLocaleString()}</td>
        <td>${resultBadge}</td>
        <td>${profitDisplay}</td>
      </tr>
    `;
  }).join('');
}

function updateGameSuggestions() {
  // 이전 팀명/경기명 목록 수집 (슬래시로 분리)
  window._gameSuggestList = getGameSuggestList();
}

function getGameSuggestList() {
  const allBets = [...bets];
  const vaultRaw = localStorage.getItem('edge_vault');
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

  box.innerHTML = matches.map(n => `
    <div onclick="selectGameSuggest('${n.replace(/'/g,"\\'")}', this)"
      style="padding:8px 12px;font-size:13px;color:var(--text2);cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05);"
      onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      ${n}
    </div>`).join('');
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
  const bet = bets.find(b => b.id === _folderResultBetId);
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
  bet.folderResults = results;
  bet.result = 'LOSE';
  bet.profit = -bet.amount;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bets));
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
