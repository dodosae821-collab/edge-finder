// ========== CHARTS ==========
function initCharts() {
  const defaults = {
    plugins: { legend: { labels: { color: '#8892a4', font: { size: 11 } } } },
    scales: {
      x: { ticks: { color: '#4a5568', font: { size: 10 } }, grid: { color: 'rgba(30,45,69,0.5)' } },
      y: { ticks: { color: '#4a5568', font: { size: 10 } }, grid: { color: 'rgba(30,45,69,0.5)' } }
    }
  };

  charts.profit = safeCreateChart('profitChart', {
    type: 'line',
    data: { labels: [], datasets: [
      { label: '누적 손익', data: [], borderColor: '#00e5ff', backgroundColor: 'rgba(0,229,255,0.05)', tension: 0.4, fill: true, pointRadius: 3, pointBackgroundColor: '#00e5ff' },
      { label: '기준선', data: [], borderColor: 'rgba(136,146,164,0.3)', borderDash: [4,4], pointRadius: 0, borderWidth: 1, fill: false }
    ] },
    options: { ...defaults, responsive: true, maintainAspectRatio: false,
      plugins: { ...defaults.plugins, tooltip: { callbacks: { label: ctx => ctx.datasetIndex === 0 ? `손익: ${ctx.parsed.y >= 0 ? '+' : ''}₩${ctx.parsed.y.toLocaleString()}` : null } } }
    }
  });

  charts.sport = safeCreateChart('sportChart', {
    type: 'doughnut',
    data: { labels: ['NBA','KBL','MLB','KBO','기타'], datasets: [{ data: [0,0,0,0,0], backgroundColor: ['#00e5ff','#ff6b35','#39ff14','#ffd700','#8892a4'], borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#8892a4', font: { size: 11 } } } } }
  });

  charts.odds = safeCreateChart('oddsChart', {
    type: 'bar',
    data: { labels: ['1~2.0','2.1~3.0','3.1~4.0','4.1~5.0','5.1~6.0','6.1~7.0','7.1+'], datasets: [{ label: '적중률', data: [0,0,0,0,0,0,0], backgroundColor: 'rgba(0,229,255,0.3)', borderColor: '#00e5ff', borderWidth: 1, borderRadius: 4 }] },
    options: { ...defaults, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });

  charts.dow = safeCreateChart('dowChart', {
    type: 'bar',
    data: {
      labels: ['월','화','수','목','금','토','일'],
      datasets: [
        { label: '적중률(%)', data: [0,0,0,0,0,0,0], backgroundColor: 'rgba(0,229,255,0.35)', borderColor: '#00e5ff', borderWidth: 1, borderRadius: 4 },
        { label: '손익분기(%)', data: [0,0,0,0,0,0,0], type: 'line', borderColor: 'rgba(255,215,0,0.6)', borderDash: [4,3], pointRadius: 0, borderWidth: 2, fill: false }
      ]
    },
    options: {
      ...defaults, responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#8892a4', font: { size: 10 } } } },
      scales: {
        x: { ticks: { color: '#8892a4', font: { size: 12, weight: '700' } }, grid: { color: 'rgba(30,45,69,0.5)' } },
        y: { ticks: { color: '#4a5568', font: { size: 10 }, callback: v => v + '%' }, grid: { color: 'rgba(30,45,69,0.5)' }, min: 0, max: 100 }
      }
    }
  });
}

function updateCharts() {
  if (!charts.profit) return;

  // scope 필터 적용 — 'all': 전체 / 'project': 현재 프로젝트만
  const _scopedBets = (typeof getBetsByScope === 'function') ? getBetsByScope() : bets;
  const allResolved = _scopedBets.filter(b => b.result !== 'PENDING');

  // 날짜별 누적 손익 계산
  function buildProfitByDate(days) {
    let filtered = allResolved;
    if (days > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      cutoff.setHours(0,0,0,0);
      filtered = allResolved.filter(b => b.date && new Date(b.date) >= cutoff);
    }
    // 날짜별로 묶기
    const dayMap = {};
    filtered.forEach(b => {
      const d = (b.date || '').slice(0, 10);
      if (!d) return;
      if (!dayMap[d]) dayMap[d] = 0;
      dayMap[d] += b.profit || 0;
    });
    const sortedDays = Object.keys(dayMap).sort();
    // 잘린 앞부분 누적 반영 (전체 기준 시작점)
    let startCum = 0;
    if (days > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      cutoff.setHours(0,0,0,0);
      allResolved.filter(b => b.date && new Date(b.date) < cutoff)
        .forEach(b => { startCum += b.profit || 0; });
    }
    let cum = startCum;
    const data   = sortedDays.map(d => { cum += dayMap[d]; return Math.round(cum); });
    const labels = sortedDays.map(d => d.slice(5)); // MM-DD
    return { labels, data };
  }

  const days = window._profitFilterDays || 0;
  const { labels, data } = buildProfitByDate(days);

  charts.profit.data.labels = labels;
  charts.profit.data.datasets[0].data = data;
  charts.profit.data.datasets[0].pointRadius = data.length > 60 ? 0 : data.length > 30 ? 2 : 3;
  charts.profit.data.datasets[0].pointBackgroundColor = data.map(v => v > 0 ? '#00e676' : v < 0 ? '#ff3b5c' : '#8892a4');
  charts.profit.data.datasets[1].data = labels.map(() => 0);
  charts.profit.update();

  const resolved = allResolved; // 종목별/배당 집계용
  // Sport distribution - handle multi-sport bets
  const sportCounts = {};
  _scopedBets.forEach(b => {
    (b.sport || '기타').split(', ').forEach(sp => {
      sportCounts[sp] = (sportCounts[sp] || 0) + 1;
    });
  });
  const sportColors = { NBA:'#00e5ff', KBL:'#ff6b35', MLB:'#39ff14', KBO:'#ffd700', NPB:'#bb86fc', '기타':'#8892a4' };
  const sportLabels = Object.keys(sportCounts);
  const sportData   = sportLabels.map(k => sportCounts[k]);
  const sportBgs    = sportLabels.map(k => sportColors[k] || '#8892a4');
  charts.sport.data.labels = sportLabels;
  charts.sport.data.datasets[0].data = sportData;
  charts.sport.data.datasets[0].backgroundColor = sportBgs;
  charts.sport.update();

  // Odds chart
  const oddsBuckets = [[1.0,2.1],[2.1,3.1],[3.1,4.1],[4.1,5.1],[5.1,6.1],[6.1,7.1],[7.1,99]];
  const oddsData = oddsBuckets.map(([lo,hi]) => {
    const inBucket = resolved.filter(b => b.betmanOdds >= lo && b.betmanOdds < hi);
    if (inBucket.length === 0) return 0;
    return Math.round(inBucket.filter(b => b.result === 'WIN').length / inBucket.length * 100);
  });
  charts.odds.data.datasets[0].data = oddsData;
  charts.odds.update();
}

// ========== AI ANALYSIS ==========
// ========== 1/12 비율베팅 계산 ==========

// ===== 예측력 등급 켈리 연동 =====
function toggleKellyGradeAdj() {
  const ui  = document.getElementById('kelly-grade-toggle-ui');
  const dot = document.getElementById('kelly-grade-toggle-dot');
  if (!ui) return;
  const isOn = ui.dataset.active !== 'true';
  ui.dataset.active = isOn ? 'true' : 'false';
  ui.style.background  = isOn ? 'var(--accent)' : 'var(--bg2)';
  ui.style.borderColor = isOn ? 'var(--accent)' : 'var(--border)';
  if (dot) { dot.style.left = isOn ? '23px' : '3px'; dot.style.background = isOn ? '#000' : '#888'; }
}

// 예측력 등급 계산 (updatePredPowerPanel 로직 공유)
function calcPredGrade() {
  // 엔진 결과 우선 사용
  if (window._SS && window._SS.grade !== undefined) return window._SS.grade;
  // 엔진 없으면 직접 계산 (폴백) — scope 필터 적용
  const _sb = (typeof getBetsByScope === 'function') ? getBetsByScope() : bets;
  const resolved = _sb.filter(b => b.result !== 'PENDING');
  const predBets = resolved.filter(b => b.myProb && b.betmanOdds);
  if (predBets.length < 5) return null;
  const predEdge = predBets.reduce((s,b) => s + (b.myProb - 100/b.betmanOdds), 0) / predBets.length;
  const edgeScore = Math.min(100, Math.max(0, (predEdge + 5) / 20 * 100));
  const edges = predBets.map(b => b.myProb - 100/b.betmanOdds);
  const mean  = edges.reduce((s,v) => s+v, 0) / edges.length;
  const std   = Math.sqrt(edges.reduce((s,v) => s+(v-mean)**2, 0) / edges.length);
  const consScore = Math.max(0, Math.min(100, 100 - std * 3));
  const recent10   = predBets.slice(-10);
  const recentEdge = recent10.reduce((s,b) => s + (b.myProb - 100/b.betmanOdds), 0) / recent10.length;
  const formScore  = Math.min(100, Math.max(0, (recentEdge + 5) / 20 * 100));
  const totalScore = edgeScore * 0.35 + consScore * 0.20 + formScore * 0.15;
  const letter = totalScore >= 85 ? 'S' : totalScore >= 70 ? 'A' : totalScore >= 55 ? 'B' : totalScore >= 40 ? 'C' : 'D';
  const color  = letter === 'S' ? '#ffd700' : letter === 'A' ? '#00e676' : letter === 'B' ? 'var(--accent)' : letter === 'C' ? '#ff9800' : 'var(--red)';
  const mult   = (letter === 'S' || letter === 'A') ? 1.0 : letter === 'B' ? 0.8 : letter === 'C' ? 0.6 : 0.4;
  return { letter, color, mult, totalScore: Math.round(totalScore), predEdge, recentEdge };
}


function calcKelly() {
  // 베팅 시드 자동 계산 (비율 설정 시 우선, 없으면 kellySeed)
  const seed = getBetSeed() || appSettings.kellySeed || 0;
  const seedEl = document.getElementById('kelly-seed');
  if (seedEl) seedEl.value = seed;
  const displayEl = document.getElementById('kelly-seed-display');
  if (displayEl) {
    const { betRatio = 0 } = appSettings;
    displayEl.textContent = seed > 0
      ? '₩' + Math.round(seed).toLocaleString() + (betRatio > 0 ? ` (뱅크롤 × ${betRatio}%)` : '')
      : '⚙️ 설정 탭에서 시드를 입력하세요';
  }

  if (!seed) {
    document.getElementById('kelly-unit').textContent  = '—';
    document.getElementById('kelly-round').textContent = '—';
    document.getElementById('kelly-remain').textContent = '—';
    document.getElementById('kelly-next-bet').style.display = 'none';
    renderKellySlots(0);
    return;
  }

  // ── 엔진 연동: 등급/ECE 보정 배율 ──
  const _SS = window._SS;
  const _grade     = appSettings.kellyGradeAdj ? (_SS ? _SS.grade : calcPredGrade()) : null;
  const _gradeMult = _grade ? _grade.gradeMult || _grade.mult : 1.0;
  const _eceMult   = (_SS && _SS.grade) ? _SS.grade.eceMult : 1.0;
  const _totalMult = appSettings.kellyGradeAdj ? (_grade ? _gradeMult * _eceMult : 1.0) : 1.0;
  const _maxBetPct = appSettings.maxBetPct || 5;
  const bankrollForMax = getCurrentBankroll() || appSettings.startFund || seed;
  const maxUnit = Math.floor(bankrollForMax * _maxBetPct / 100);
  // Kelly 값은 state.js(calcSystemState)에서만 계산 — read-only 참조
  if (!_SS) { console.warn('[charts] _SS missing — kellyUnit unavailable'); }
  const unit = _SS?.kellyUnit ?? 0;

  // ── 1/12 기반 하이브리드 Kelly 계산 ──────────────────────────
  // base = activeRound.seed / 12  (회차 시드 고정 기준값, 변경 금지)
  // Kelly(k)는 multiplier 구간만 결정 — 직접 금액 계산 금지
  //   k <= 0       → ×0.5  (EV- → 최소 베팅 유지, 데이터 축적 + 흐름 유지)
  //   k < 0.03     → ×0.9  (약 EV+ → 소폭 축소)
  //   k < 0.07     → ×1.0  (기본 유지)
  //   k < 0.12     → ×1.1  (Kelly +8%대 → +10% 보정)
  //   k < 0.20     → ×1.2  (Kelly +15%대 → +20% 보정)
  //   k >= 0.20    → ×1.3  (강한 EV+ → +30% 보정)
  // finalBet = base × multiplier (cap 없음)
  let hybridKelly = null;
  const _adjProbEl = document.getElementById('r-adjusted-prob');
  const _adjProbPct = _adjProbEl ? parseFloat(_adjProbEl.value) : 0;
  const _adjOddsEl = document.getElementById('r-betman-odds');
  const _adjOdds = _adjOddsEl ? parseFloat(_adjOddsEl.value) : 0;
  // raw myProb도 읽기 (EV 비교용)
  const _rawProbEl = document.getElementById('r-myprob');
  const _rawProbPct = _rawProbEl ? parseFloat(_rawProbEl.value) : _adjProbPct;

  if (_adjProbPct > 0 && _adjOdds >= 1 && unit > 0) {
    const ss = window._SS;

    // 1. base = 회차 시드 ÷ 12 (고정 기준값)
    const activeRound = (typeof getActiveRound === 'function') ? getActiveRound() : null;
    const roundSeed = activeRound ? activeRound.seed : seed;
    const base = Math.round(roundSeed / 12);

    // 2. calibProb 기반 Kelly 분수 계산
    const p = _adjProbPct / 100;
    const q = 1 - p;
    const b = _adjOdds - 1;
    let k = (p * b - q) / b;  // Full Kelly
    // 🔒 NaN/Infinity 방어 — odds 이상값·p 경계값으로 발생 가능, UI 깨짐·multiplier 폭주 차단
    if (!Number.isFinite(k)) k = 0;

    // raw Kelly (비교/경고용)
    const pRaw = _rawProbPct / 100;
    let kellyRawProb = ((pRaw * b - (1 - pRaw)) / b);
    if (!Number.isFinite(kellyRawProb)) kellyRawProb = 0;

    // [B] kDisplay — UI 표시용 클램프 [-0.25 ~ 0.25] (내부 계산 k는 원본 그대로 유지)
    const kDisplay = Math.min(Math.max(k, -0.25), 0.25);

    // [A] 전역 Kelly 상태 — window.__kellyState (네임스페이스 보호, 함수 오염 방지)
    window.__kellyState = window.__kellyState || {};
    const ks = window.__kellyState;

    // 3. multiplier 구간 결정 (Kelly 직접 금액 계산 금지)
    // [A] 히스테리시스: k<-0.05 → 차단 / -0.05≤k≤-0.03 → 이전 상태 유지 / k>-0.03 → 해제
    //     경계값 흔들림(UI 깜빡임·판단 불안정) 방지
    ks.lastSkipped = ks.lastSkipped ?? false;
    const prevSkipped = ks.lastSkipped;
    let skipped = false;
    if      (k < -0.05)  skipped = true;         // 강한 EV- → 완전 차단
    else if (k <= -0.03) skipped = prevSkipped;  // 히스테리시스 영역 → 이전 상태 유지
    else                 skipped = false;         // k > -0.03 → 정상 운영
    ks.lastSkipped = skipped;                     // 상태 저장 (함수 스코프 오염 없음)

    let multiplier;
    if (!skipped) {
      // 1. 구간 결정 (rawMultiplier 기준)
      if      (k <= 0)   multiplier = 0.5;  // 약한 EV- (-0.03~0) → 최소 베팅 유지
      else if (k < 0.03) multiplier = 0.9;  // 약 EV+ (엣지 매우 낮음, 리스크 축소)
      else if (k < 0.07) multiplier = 1.0;  // 기본 유지
      else if (k < 0.12) multiplier = 1.1;  // Kelly +8%대  → +10%
      else if (k < 0.20) multiplier = 1.2;  // Kelly +15%대 → +20%
      else               multiplier = 1.3;  // 강한 EV+     → +30%

      // 🔒 multiplier 하한선 고정 — 로직 오류로 0 이하 진입 완전 차단 (rawMultiplier 전에 적용)
      multiplier = Math.max(0.5, multiplier);

      // [C] streak 기반 연속 고배율 제한 (raw 기준으로 집계 → 완화 적용 → raw 기준 저장)
      const rawMultiplier = multiplier;
      const prevStreak = ks.highMultStreak || 0;
      const nextStreak = rawMultiplier >= 1.2 ? prevStreak + 1 : 0;  // 2. streak 판단 (raw 기준)

      // 3. 완화 적용
      let consecutiveDampened = false;
      if (nextStreak >= 2) {
        multiplier = 1.1;         // 연속 2회 이상 고배율 → 자동 완화
        consecutiveDampened = true;
      }

      // 4. streak·lastMultiplier 저장 (raw 기준 — 완화된 값 반영 안 함)
      ks.highMultStreak = nextStreak;
      ks.lastMultiplier = rawMultiplier;  // 디버깅·로그·튜닝용

      // 🔒 finalBet 안전 보정: Floor(소수점 제거·보수적) + max(0) 음수 차단
      const finalBet = Math.max(0, Math.floor(base * multiplier));
      const kellyApplied = true; // k≤0(×0.5) 포함 항상 multiplier 적용

      // EV 판단
      const evCalibPositive = k > 0;
      const evRawPositive   = kellyRawProb > 0;
      const isCritical      = evRawPositive && !evCalibPositive;

      // 내재확률 & EV 수치
      const impliedProb = (1 / _adjOdds * 100);
      const evCalib = (p * b) - q;
      const evRaw   = (pRaw * b) - (1 - pRaw);

      const bankroll = getCurrentBankroll() || appSettings.startFund || seed;

      hybridKelly = {
        skipped: false,
        base, baseBet: base, finalBet, kellyApplied,
        kellyRaw: k, kDisplay, multiplier, rawMultiplier,
        consecutiveDampened,
        evCalib, evRaw, evCalibPositive, evRawPositive, isCritical,
        calibProb: _adjProbPct, rawProb: _rawProbPct,
        impliedProb, odds: _adjOdds,
        n: ss ? ss.n : 0, ece: ss ? ss.ece : null,
        bankroll,
        diffProbPct: (_adjProbPct - _rawProbPct).toFixed(1),
        diffEv: (evCalib - evRaw).toFixed(3)
      };
    } else {
      // 강한 EV- / 히스테리시스 스킵 → 별도 카드 렌더
      ks.highMultStreak = 0;  // 스킵 구간에서 streak 리셋
      hybridKelly = {
        skipped: true,
        kellyRaw: k, kDisplay, base,
        calibProb: _adjProbPct, impliedProb: (1 / _adjOdds * 100), odds: _adjOdds,
        evCalib: (p * b) - q,
        inHysteresis: (k >= -0.05 && k <= -0.03)
      };
    } // end skipped else
  }
  if (_SS) { _SS.hybridKelly = hybridKelly; }

  const unitEl = document.getElementById('kelly-unit');
  if (unitEl) {
    unitEl.textContent = '₩' + unit.toLocaleString();
    unitEl.style.color = _totalMult < 1 ? 'var(--gold)' : 'var(--text)';
    if (_grade && _totalMult < 1) {
      const eceNote = (_SS && _SS.ece !== null) ? ` · ECE ${_SS.ece.toFixed(1)}% 보정 x${_eceMult.toFixed(2)}` : '';
      unitEl.title = '예측력 ' + _grade.letter + '등급 x' + _gradeMult.toFixed(2) + eceNote;
    }
  }

  // 베팅 기록 기반 현재 회차 자동 계산 — scope 필터 적용
  const _sb2     = (typeof getBetsByScope === 'function') ? getBetsByScope() : bets;
  const resolved  = _sb2.filter(b => b.result !== 'PENDING');
  const cyclePos  = resolved.length % 12;  // 0~11
  const roundNum  = cyclePos + 1;
  const remain    = 12 - cyclePos;
  const cycleNum  = Math.floor(resolved.length / 12) + 1;

  document.getElementById('kelly-round').textContent = roundNum + ' / 12';
  const remainEl = document.getElementById('kelly-remain');
  remainEl.textContent = remain + '회';
  remainEl.style.color = remain <= 3 ? 'var(--accent2)' : 'var(--text)';

  // ── 하이브리드 Kelly 베팅 카드 (통합 렌더) ─────────────────
  const nextBetEl      = document.getElementById('kelly-next-bet');
  const nextAmountEl   = document.getElementById('kelly-next-amount');
  const nextNoteEl     = document.getElementById('kelly-next-note');
  const baseAmountEl   = document.getElementById('kelly-base-amount');
  const adjBadgeEl     = document.getElementById('kelly-adj-badge');
  const auxRowEl       = document.getElementById('kelly-aux-row');
  const warnRowEl      = document.getElementById('kelly-warn-row');
  const cycleBadgeEl   = document.getElementById('kelly-next-cycle-badge');

  nextBetEl.style.display = 'block';

  // 사이클 배지
  const eceNote2 = (_SS && _SS.ece !== null && appSettings.kellyGradeAdj) ? ` · ECE ${_SS.ece.toFixed(1)}% ×${_eceMult.toFixed(2)}` : '';
  const gradeNote = (_totalMult < 1 && _grade) ? ` · ${_grade.letter}등급 ×${_totalMult.toFixed(2)}${eceNote2}` : '';
  const capNote   = (_SS && typeof _SS.maxUnit === 'number' && unit < _SS.maxUnit)
    ? ` · 상한선 ₩${_SS.maxUnit.toLocaleString()} 적용`
    : '';
  if (cycleBadgeEl) cycleBadgeEl.textContent = `${cycleNum}사이클 ${roundNum}번째 · ${remain}회 남음`;
  if (nextNoteEl)   nextNoteEl.textContent   = `${cycleNum}사이클 ${roundNum}번째 베팅 · ${remain}회 남음${gradeNote}${capNote}`;

  // [A] 강한 EV- 스킵 처리 (k < -0.05) — 별도 카드 렌더
  if (hybridKelly && hybridKelly.skipped) {
    const hk = hybridKelly;
    if (baseAmountEl) baseAmountEl.textContent = '₩' + hk.base.toLocaleString();
    if (adjBadgeEl) {
      adjBadgeEl.textContent = '🚫 강한 EV- → 베팅 차단';
      adjBadgeEl.style.background = 'rgba(255,59,92,0.18)';
      adjBadgeEl.style.color      = 'var(--red)';
    }
    if (nextAmountEl) {
      nextAmountEl.textContent = '차단';
      nextAmountEl.style.color = 'var(--red)';
    }
    if (nextBetEl)  nextBetEl.style.borderColor = 'rgba(255,59,92,0.5)';
    if (auxRowEl)   auxRowEl.style.display = 'none';
    if (warnRowEl) {
      warnRowEl.style.display = 'block';
      warnRowEl.innerHTML = hk.inHysteresis
        ? `<div style="font-size:11px;font-weight:700;color:var(--gold);margin-bottom:2px;">🔒 히스테리시스 유지 (k = ${hk.kellyRaw.toFixed(3)}, 경계 구간 -0.05~-0.03)</div>
           <div style="font-size:10px;color:var(--text3);">k > -0.03 되면 자동 복귀. 이전 차단 상태 유지 중.</div>`
        : `<div style="font-size:11px;font-weight:700;color:var(--red);margin-bottom:2px;">🚫 강한 EV- 차단 (k = ${hk.kellyRaw.toFixed(3)} &lt; -0.05)</div>
           <div style="font-size:10px;color:var(--text3);">보정확률 ${hk.calibProb.toFixed(1)}% · 내재확률 ${hk.impliedProb.toFixed(1)}% — 이 베팅은 명확한 손실 구조입니다</div>`;
      warnRowEl.style.background = 'rgba(255,59,92,0.08)';
      warnRowEl.style.borderTopColor = 'rgba(255,59,92,0.3)';
    }

  } else if (hybridKelly && !hybridKelly.skipped) {
    const hk = hybridKelly;

    // [C] 색상 기준 — k 범위 기준으로 정량화 통일
    //   k ≤ 0           → 빨강  (EV-)
    //   0 < k < 0.05    → 주황  (약 EV+, 리스크 축소)
    //   0.05 ≤ k < 0.12 → 회색  (중립/기본)
    //   k ≥ 0.12        → 초록  (강한 EV+)
    const k_val = hk.kellyRaw;
    // [B] 렌더용 클램프 (내부 k_val은 색상 분기에 그대로 사용)
    const kDisp = hk.kDisplay !== undefined ? hk.kDisplay : Math.min(Math.max(k_val,-0.25),0.25);
    const colorByK = k_val <= 0      ? 'var(--red)'
                   : k_val < 0.05    ? '#ff9800'
                   : k_val < 0.12    ? 'var(--text2)'
                   : 'var(--green)';
    const bgByK    = k_val <= 0      ? 'rgba(255,59,92,0.12)'
                   : k_val < 0.05    ? 'rgba(255,152,0,0.12)'
                   : k_val < 0.12    ? 'var(--bg3)'
                   : 'rgba(0,230,118,0.15)';
    const borderByK = k_val <= 0     ? 'rgba(255,59,92,0.4)'
                    : k_val < 0.05   ? 'rgba(255,152,0,0.4)'
                    : k_val < 0.12   ? 'rgba(255,215,0,0.3)'
                    : 'rgba(0,230,118,0.4)';

    // [B] multiplier → 문구 (의미 명시, 약 EV+ 설명 포함)
    const multPctMap = {
      0.5: `약한 EV- (k=${kDisp.toFixed(3)}) → ×0.5 최소 베팅`,
      0.9: `약 EV+ (엣지 매우 낮음, 리스크 축소) → ×0.9`,
      1.0: `기본 유지 (k=${kDisp.toFixed(3)}) → ×1.0`,
      1.1: `Kelly +8%대 (k=${kDisp.toFixed(3)}) → ×1.1 (+10%)${hk.consecutiveDampened ? ' ⬇연속완화' : ''}`,
      1.2: `Kelly +15%대 (k=${kDisp.toFixed(3)}) → ×1.2 (+20%)`,
      1.3: `강한 EV+ (k≥0.20) → ×1.3 (+30%)`
    };
    const adjLabel = multPctMap[hk.multiplier] || `×${hk.multiplier}`;

    // 기본 베팅 (시드 ÷ 12)
    if (baseAmountEl) baseAmountEl.textContent = '₩' + hk.base.toLocaleString();

    // 켈리 보정 배지 — [C] k 기준 색상
    if (adjBadgeEl) {
      adjBadgeEl.textContent        = adjLabel;
      adjBadgeEl.style.background   = bgByK;
      adjBadgeEl.style.color        = colorByK;
    }

    // 최종 베팅 금액 — [C] k 기준 색상
    if (nextAmountEl) {
      nextAmountEl.textContent = '₩' + hk.finalBet.toLocaleString();
      nextAmountEl.style.color = colorByK;
    }

    // 카드 테두리 — [C] k 기준 색상
    if (nextBetEl) {
      nextBetEl.style.borderColor = borderByK;
    }

    // 보조 정보 행
    if (auxRowEl) {
      auxRowEl.style.display = 'flex';
      const probEl = document.getElementById('kelly-aux-prob');
      const oddsEl = document.getElementById('kelly-aux-odds');
      const edgeEl = document.getElementById('kelly-aux-edge');
      if (probEl) { probEl.textContent = hk.calibProb.toFixed(1) + '%'; }
      if (oddsEl) { oddsEl.textContent = hk.odds.toFixed(2); }
      if (edgeEl) {
        const edgePct = (hk.evCalib * 100);
        edgeEl.textContent = (edgePct >= 0 ? '+' : '') + edgePct.toFixed(2) + '%';
        edgeEl.style.color = edgePct >= 0 ? 'var(--green)' : 'var(--red)';
      }
    }

    // 경고 행
    if (warnRowEl) {
      if (hk.isCritical) {
        warnRowEl.style.display = 'block';
        warnRowEl.innerHTML = `
          <div style="font-size:11px;font-weight:700;color:var(--red);margin-bottom:3px;">🔴 과신 편향 감지 — 가장 위험한 패턴</div>
          <div style="font-size:11px;color:var(--text2);line-height:1.6;">
            raw EV+이지만 보정 기준 EV- · ΔProb ${hk.rawProb.toFixed(1)}%→${hk.calibProb.toFixed(1)}% (${hk.diffProbPct}%p)
          </div>`;
        warnRowEl.style.background = 'rgba(255,59,92,0.08)';
        warnRowEl.style.borderTopColor = 'rgba(255,59,92,0.3)';
      } else if (hk.multiplier === 0.5) {
        // 약한 EV- (−0.05 ~ 0) → 최소 베팅 경고
        warnRowEl.style.display = 'block';
        warnRowEl.innerHTML = `
          <div style="font-size:11px;font-weight:700;color:var(--gold);margin-bottom:2px;">⚠️ 약한 EV- (k=${kDisp.toFixed(3)}) → ×0.5 최소 베팅 유지</div>
          <div style="font-size:10px;color:var(--text3);">보정확률 ${hk.calibProb.toFixed(1)}% · 내재확률 ${hk.impliedProb.toFixed(1)}% — 데이터 축적 목적, 베팅 근거 재검토 권장</div>`;
        warnRowEl.style.background = 'rgba(255,152,0,0.06)';
        warnRowEl.style.borderTopColor = 'rgba(255,152,0,0.3)';
      } else if (hk.multiplier === 0.9) {
        // 약 EV+ (리스크 축소 구간) 안내
        warnRowEl.style.display = 'block';
        warnRowEl.innerHTML = `
          <div style="font-size:11px;font-weight:700;color:#ff9800;margin-bottom:2px;">🟡 약 EV+ (리스크 축소 구간) · k=${kDisp.toFixed(3)}</div>
          <div style="font-size:10px;color:var(--text3);">엣지가 매우 낮아 소폭 축소(×0.9) 적용. 확신이 낮은 베팅은 신중하게.</div>`;
        warnRowEl.style.background = 'rgba(255,152,0,0.04)';
        warnRowEl.style.borderTopColor = 'rgba(255,152,0,0.2)';
      } else {
        warnRowEl.style.display = 'none';
      }
    }

  } else {
    // 확률 미입력 → 기본 구조 (시드÷12 표시)
    const activeRound = (typeof getActiveRound === 'function') ? getActiveRound() : null;
    const roundSeed = activeRound ? activeRound.seed : seed;
    const baseDisplay = Math.round(roundSeed / 12);
    if (baseAmountEl) baseAmountEl.textContent = '₩' + baseDisplay.toLocaleString();
    if (adjBadgeEl)   {
      adjBadgeEl.textContent = '확률 입력 시 Kelly 보정 자동 적용';
      adjBadgeEl.style.background = 'var(--bg3)';
      adjBadgeEl.style.color      = 'var(--text3)';
    }
    if (nextAmountEl) { nextAmountEl.textContent = '₩' + baseDisplay.toLocaleString(); nextAmountEl.style.color = 'var(--gold)'; }
    if (nextBetEl)    nextBetEl.style.borderColor = 'rgba(255,215,0,0.3)';
    if (auxRowEl)     auxRowEl.style.display = 'none';
    if (warnRowEl)    warnRowEl.style.display = 'none';
  }

  renderKellySlots(cyclePos, resolved);

  // 재계산 안내
  const notice = document.getElementById('kelly-notice');
  if (cyclePos === 0 && resolved.length > 0) {
    notice.style.display = 'block';
    notice.innerHTML = `🔄 <strong>사이클 완료!</strong> 현재 시드머니를 확인하고 베팅금을 재계산하세요. 새 시드: 입력창에 현재 잔고를 입력하세요.`;
  } else if (remain <= 3) {
    notice.style.display = 'block';
    notice.innerHTML = `⚡ <strong>${remain}회차 남았습니다.</strong> 사이클 종료 후 시드를 재계산할 준비를 하세요.`;
  } else {
    notice.style.display = 'none';
  }

  // ── 사이클별 손익 테이블 ──
  const cycleRows = [];
  let runningSeed = seed;
  const sortedResolved = [...resolved].sort((a, b) => (a.date||'').localeCompare(b.date||''));

  for (let c = 0; c < Math.ceil(sortedResolved.length / 12); c++) {
    const chunk   = sortedResolved.slice(c * 12, (c + 1) * 12);
    const cycUnit = Math.floor(runningSeed / 12);
    const wins    = chunk.filter(b => b.result === 'WIN').length;
    const profit  = chunk.reduce((s, b) => s + b.profit, 0);
    const prevSeed = runningSeed;
    runningSeed   = Math.max(0, runningSeed + profit);
    cycleRows.push({ cycle: c + 1, count: chunk.length, wins, profit, prevSeed, newSeed: runningSeed, unit: cycUnit });
  }

  const tbody = document.getElementById('kelly-cycle-table');
  if (cycleRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:20px;">베팅 기록 없음</td></tr>`;
  } else {
    tbody.innerHTML = cycleRows.map(r => {
      const isCurrent = r.cycle === cycleNum;
      return `<tr style="${isCurrent ? 'background:rgba(255,215,0,0.06);' : ''}">
        <td style="font-weight:700;color:${isCurrent?'var(--gold)':'var(--text2)'};">${isCurrent ? '▶ ' : ''}${r.cycle}사이클</td>
        <td class="mono">${r.count}/12</td>
        <td class="mono" style="color:var(--green);">${r.wins}승</td>
        <td class="mono" style="color:${r.profit>=0?'var(--green)':'var(--red)'};">${r.profit>=0?'+':''}₩${Math.round(r.profit).toLocaleString()}</td>
        <td class="mono" style="font-size:11px;color:${r.newSeed<0?'var(--red)':''};">${(v=>v<0?'-₩'+Math.abs(Math.round(v/10000))+'만':'₩'+Math.round(v/10000)+'만')(r.prevSeed)}→${(v=>v<0?'<span style="color:var(--red)">-₩'+Math.abs(Math.round(v/10000))+'만</span>':'₩'+Math.round(v/10000)+'만')(r.newSeed)}</td>
        <td>${r.profit>=0?'<span class="badge badge-value">수익</span>':'<span class="badge badge-novalue">손실</span>'}</td>
      </tr>`;
    }).join('');
  }

  // 다음 사이클 예상 시드
  const wr      = resolved.length > 0 ? resolved.filter(b => b.result === 'WIN').length / resolved.length : 0.5;
  const avgOdds = resolved.length > 0 ? resolved.reduce((s,b) => s+b.betmanOdds, 0) / resolved.length : 1.9;

  function simNextSeed(winRate) {
    let s = seed;
    const u = Math.floor(s / 12);
    for (let i = 0; i < 12; i++) {
      if (Math.random() < winRate) s += u * (avgOdds - 1);
      else s -= u;
    }
    return Math.round(s);
  }

  const pessimistic = Math.round([...Array(5)].reduce(a => a + simNextSeed(Math.max(0, wr - 0.05)), 0) / 5);
  const expected    = Math.round([...Array(5)].reduce(a => a + simNextSeed(wr), 0) / 5);
  const optimistic  = Math.round([...Array(5)].reduce(a => a + simNextSeed(Math.min(1, wr + 0.05)), 0) / 5);

  function fmtSeed(v) { return v < 0 ? '-₩' + Math.abs(v).toLocaleString() : '₩' + v.toLocaleString(); }
  document.getElementById('kelly-pessimistic').textContent = fmtSeed(pessimistic);
  document.getElementById('kelly-pessimistic').style.color = pessimistic >= seed ? 'var(--green)' : 'var(--red)';
  document.getElementById('kelly-expected').textContent    = fmtSeed(expected);
  document.getElementById('kelly-expected').style.color    = expected >= seed ? 'var(--green)' : 'var(--gold)';
  document.getElementById('kelly-optimistic').textContent  = fmtSeed(optimistic);
  document.getElementById('kelly-optimistic').style.color  = optimistic >= seed ? 'var(--green)' : 'var(--red)';

  // 사이클별 누적 시드 추이 차트
  const cycleSeeds  = [seed];
  let chartSeed = seed;
  for (let i = 0; i < sortedResolved.length; i += 12) {
    const chunk = sortedResolved.slice(i, i + 12);
    const u = Math.floor(chartSeed / 12);
    chunk.forEach(b => {
      if (b.result === 'WIN') chartSeed += u * (b.betmanOdds - 1);
      else chartSeed -= u;
    });
    cycleSeeds.push(Math.round(chartSeed));
  }

  if (charts.seed) charts.seed.destroy();
  charts.seed = safeCreateChart('seedChart', {
    type: 'line',
    data: {
      labels: cycleSeeds.map((_, i) => i === 0 ? '시작' : `${i}사이클`),
      datasets: [{
        label: '시드머니',
        data: cycleSeeds,
        borderColor: '#ffd700',
        backgroundColor: 'rgba(255,215,0,0.08)',
        tension: 0.4, fill: true, pointRadius: 5,
        pointBackgroundColor: cycleSeeds.map((v, i) => i === 0 ? '#ffd700' : v >= cycleSeeds[i-1] ? 'var(--green)' : 'var(--red)'),
        pointBorderColor: '#1a2740', pointBorderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `시드: ₩${ctx.parsed.y.toLocaleString()}` } }
      },
      scales: {
        x: { ticks: { color: '#8892a4', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#8892a4', font: { size: 10 }, callback: v => `₩${(v/10000).toFixed(0)}만` }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });
}

function renderKellySlots(cyclePos, resolved) {
  const slots = document.getElementById('kelly-slots');
  // 최근 12회 결과
  const recent12 = (resolved || []).slice(0, 12).reverse();
  slots.innerHTML = [...Array(12)].map((_, i) => {
    const bet = recent12[i];
    let bg, label, border;
    if (!bet) {
      bg = 'var(--bg3)'; border = 'var(--border)'; label = i + 1;
    } else if (bet.result === 'WIN') {
      bg = 'rgba(0,230,118,0.2)'; border = 'var(--green)'; label = '✓';
    } else if (bet.result === 'LOSE') {
      bg = 'rgba(255,59,92,0.2)'; border = 'var(--red)'; label = '✗';
    } else {
      bg = 'rgba(0,229,255,0.1)'; border = 'var(--accent)'; label = '?';
    }
    const isCurrent = !bet && i === (resolved || []).length % 12;
    return `<div style="
      padding:8px 4px;border-radius:4px;border:1px solid ${border};
      background:${bg};text-align:center;font-size:11px;font-weight:700;
      color:${bet ? (bet.result==='WIN'?'var(--green)':'var(--red)') : 'var(--text3)'};
      ${isCurrent ? 'box-shadow:0 0 8px rgba(0,229,255,0.4);' : ''}
    ">${label}</div>`;
  }).join('');
}

// ========== FOLDER TAB ==========
function switchFolderTab(btn) {
  document.querySelectorAll('.folder-tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const key = btn.dataset.folder;
  ['all','single','2','3','4','4+'].forEach(k => {
    const el = document.getElementById(`folder-pane-${k}`);
    if (el) el.style.display = k === key ? 'block' : 'none';
  });
}

function renderFolderDetail(key, bets_list) {
  const el = document.getElementById(`folder-detail-${key}`);
  if (!el) return;

  if (bets_list.length === 0) {
    el.innerHTML = `<div style="text-align:center;color:var(--text3);padding:30px;font-size:13px;">해당 폴더 기록 없음</div>`;
    return;
  }

  const resolved = bets_list.filter(b => b.result !== 'PENDING');
  const wins     = resolved.filter(b => b.result === 'WIN');
  const profit   = resolved.reduce((s, b) => s + b.profit, 0);
  const invested = resolved.reduce((s, b) => s + b.amount, 0);
  const wr       = resolved.length > 0 ? wins.length / resolved.length * 100 : 0;
  const roi      = invested > 0 ? profit / invested * 100 : 0;
  const avgOdds  = resolved.length > 0 ? resolved.reduce((s, b) => s + b.betmanOdds, 0) / resolved.length : 0;
  const breakEven = avgOdds > 0 ? 1 / avgOdds * 100 : 0;

  // KPI 카드
  const kpiHtml = `
    <div class="folder-stat-kpi">
      <div class="folder-stat-kpi-item">
        <div class="folder-stat-kpi-val" style="color:var(--accent);">${resolved.length}건</div>
        <div class="folder-stat-kpi-label">총 베팅</div>
      </div>
      <div class="folder-stat-kpi-item">
        <div class="folder-stat-kpi-val" style="color:${wr >= breakEven ? 'var(--green)' : 'var(--red)'};">${wr.toFixed(1)}%</div>
        <div class="folder-stat-kpi-label">적중률 (BEP ${breakEven.toFixed(1)}%)</div>
      </div>
      <div class="folder-stat-kpi-item">
        <div class="folder-stat-kpi-val" style="color:${profit >= 0 ? 'var(--green)' : 'var(--red)'};">${profit >= 0 ? '+' : ''}₩${Math.round(profit).toLocaleString()}</div>
        <div class="folder-stat-kpi-label">누적 손익</div>
      </div>
      <div class="folder-stat-kpi-item">
        <div class="folder-stat-kpi-val" style="color:${roi >= 0 ? 'var(--green)' : 'var(--red)'};">${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%</div>
        <div class="folder-stat-kpi-label">ROI</div>
      </div>
    </div>`;

  // 최근 베팅 기록 테이블
  const rows = bets_list.slice(0, 20).map(b => {
    const pc = b.profit > 0 ? 'var(--green)' : b.profit < 0 ? 'var(--red)' : 'var(--text2)';
    const rb = b.result === 'WIN' ? '<span class="badge badge-value">적중</span>'
             : b.result === 'LOSE' ? '<span class="badge badge-novalue">미적중</span>'
             : '<span class="badge badge-neutral">미결</span>';
    return `<tr>
      <td class="mono">${b.date || '—'}</td>
      <td style="font-size:11px;">${b.game || '—'}</td>
      <td style="font-size:11px;">${b.sport || '—'}</td>
      <td style="font-size:11px;">${b.type || '—'}</td>
      <td class="mono">${b.betmanOdds || '—'}</td>
      <td class="mono">₩${(b.amount || 0).toLocaleString()}</td>
      <td>${rb}</td>
      <td class="mono" style="color:${pc};">${b.profit >= 0 ? '+' : ''}₩${Math.round(b.profit).toLocaleString()}</td>
    </tr>`;
  }).join('');

  const tableHtml = `
    <div class="table-wrap" style="max-height:340px;overflow-y:auto;">
      <table style="font-size:12px;">
        <thead><tr><th>날짜</th><th>경기</th><th>종목</th><th>형식</th><th>배당</th><th>베팅금</th><th>결과</th><th>손익</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${bets_list.length > 20 ? `<div style="text-align:center;font-size:11px;color:var(--text3);margin-top:8px;">최근 20건 표시 (전체 ${bets_list.length}건)</div>` : ''}`;

  el.innerHTML = kpiHtml + tableHtml;
}


