// ============================================================
// ui_tabs.js — UI 레이어 전용 모듈
// ============================================================
// 담당:
//   toggleGenericDropdown  — 드롭다운 토글
//   switchTabFromDropdown  — 탭 전환 (드롭다운 경유)
//   updateAnalyzeTab       — 분석 탭 렌더
//   updateAnalyzeChart     — 분석 시뮬 차트
//   updateAnalyzeGradeBanner — 등급 배너
//   updateAnalyzeDirection — 방향성 패널
//   updateAnalyzeRisk      — 리스크 패널
//   setJudgeFilter         — 판단 필터 설정
//   updateJudgePanel       — 판단 패널 렌더
//   updateRoundHistory     — 회차 이력 렌더
//   clearRoundHistory      — 회차 이력 삭제
//   _syncScopeUI           — scope 버튼 동기화
//   _syncRoundStatusUI     — 회차 상태 패널 렌더
//
// 규칙:
//   - bets 직접 접근 금지 → getBets() 경유
//   - rounds 직접 접근 금지 → getRounds() 경유
//   - 계산 로직 없음 — 표시만 담당
//   - state.js 이후에 로드
// ============================================================

// ── 의존성 검증 ──────────────────────────────────────────────
console.assert(typeof getBets         === 'function', '[ui_tabs.js] getBets not loaded — check script order');
console.assert(typeof getRounds       === 'function', '[ui_tabs.js] getRounds not loaded — check script order');
console.assert(typeof getActiveRound  === 'function', '[ui_tabs.js] getActiveRound not loaded — check script order');
console.assert(typeof getCurrentScope === 'function', '[ui_tabs.js] getCurrentScope not loaded — check script order');
console.assert(typeof computeJudgeMetrics  === 'function', '[ui_tabs.js] computeJudgeMetrics not loaded — check script order');
console.assert(typeof computeRoundHistory  === 'function', '[ui_tabs.js] computeRoundHistory not loaded — check script order');
console.assert(typeof computeRiskMetrics   === 'function', '[ui_tabs.js] computeRiskMetrics not loaded — check script order');


// ── 판단 필터 상태 ───────────────────────────────────────────
let judgeFilter = 'all';


// ============================================================
// toggleGenericDropdown
// ============================================================
function toggleGenericDropdown(key) {
  const menu = document.getElementById(key + '-dropdown-menu');
  if (!menu) return;
  // 다른 드롭다운 전부 닫기
  ['stats','insight','fund','judge','betting'].forEach(k => {
    if (k !== key) {
      const m = document.getElementById(k + '-dropdown-menu');
      if (m) m.style.display = 'none';
    }
  });
  const isOpen = menu.style.display !== 'none';
  menu.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    setTimeout(function() {
      document.addEventListener('click', function closeMenu(e) {
        const wrap = document.getElementById(key + '-dropdown-wrap');
        if (wrap && !wrap.contains(e.target)) {
          menu.style.display = 'none';
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 10);
  }
}


// ============================================================
// switchTabFromDropdown
// ============================================================
function switchTabFromDropdown(name, el) {
  // 모든 드롭다운 메뉴 닫기
  ['stats','insight','fund','judge','betting'].forEach(k => {
    const m = document.getElementById(k + '-dropdown-menu');
    if (m) m.style.display = 'none';
  });

  // 모든 탭 active 해제
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-dropdown-menu div').forEach(t => t.classList.remove('active'));

  // 해당 드롭다운 트리거 active
  const triggerMap = {
    analysis: 'stats', analysis2: 'stats', analysis3: 'stats',
    analyze: 'insight', predict: 'insight', predpower: 'insight', verify: 'insight',
    simulator: 'fund', goal: 'fund', 'round-report': 'fund'
  };
  const triggerKey = triggerMap[name];
  if (triggerKey) {
    const trigger = document.getElementById(triggerKey + '-dropdown-trigger');
    if (trigger) trigger.classList.add('active');
  }
  if (el) el.classList.add('active');

  // 페이지 전환
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  if (page) page.classList.add('active');

  activePage = name;
  if (name === 'analysis')  { updateStatsAnalysis(); updateTagStats(); }
  if (name === 'analysis2') updateStatsAnalysis();
  if (name === 'analysis3') { updateStatsAnalysis(); updateEvBias(); updateEvMonthly(); updateEvCum(); }
  if (name === 'judgeall')   updateJudgeAll();
  if (name === 'ai-advice')  { /* 수동 트리거만 — 자동 실행 안 함 */ }
  if (name === 'journal')    { loadJournal(); switchJournalTab(_journalTab || 'plan'); }
  if (name === 'strategy')   { initSimulator(); }
  if (name === 'analyze')   updateAnalyzeTab();
  if (name === 'predict')   { updateGoalStats(); updatePredictTab(); }
  if (name === 'predpower') updatePredPowerPanel();
  if (name === 'verify')    { if (typeof renderVerifyPage === 'function') renderVerifyPage(); }
  if (name === 'simulator') {
    const bets = getBets();
    calcKelly();
    renderKellySlots(bets.filter(b=>b.result!=='PENDING').length % 12, bets.filter(b=>b.result!=='PENDING'));
    updateSimRoundSeedBanner();
    updateKellyHistory();
    updateKellyGradeBanner();
    try { updateFibonacci(); } catch(e) {}
  }
  if (name === 'goal') {
    updateRoundHistory();
    renderPrincipleList();
    renderPrincipleChecklist();
    renderRoundReviewList();
    updateGoalStats();
    calcGoal();
  }
  // round-report: refreshAllUI에서 단일 처리 (이중 렌더 방지)
}


// ============================================================
// updateAnalyzeTab
// ============================================================
function updateAnalyzeTab() {
  const _SS     = window._SS;
  const bets    = getBets();
  const metrics = computeAnalyzeMetrics(bets);

  // 승률 — 엔진
  const wr   = _SS ? (_SS.winRate * 100) : null;
  const wrEl = document.getElementById('analyze-wr');
  if (wrEl) {
    wrEl.textContent = wr !== null ? wr.toFixed(1) + '%' : '—';
    wrEl.style.color = wr === null ? 'var(--text3)' : wr >= 50 ? 'var(--green)' : 'var(--red)';
  }

  // 베팅당 평균 손익 — compute.js
  const apEl = document.getElementById('analyze-avg-profit');
  if (apEl) {
    const ap = metrics.avgProfit;
    apEl.textContent = ap !== null ? (ap >= 0 ? '+' : '') + '₩' + ap.toLocaleString() : '—';
    apEl.style.color = ap === null ? 'var(--text3)' : ap >= 0 ? 'var(--green)' : 'var(--red)';
  }

  // 최근 10경기 ROI — 엔진
  const r10roi = _SS ? _SS.rec10roi : null;
  const r10El  = document.getElementById('analyze-recent-roi');
  if (r10El) {
    r10El.textContent = r10roi !== null ? (r10roi >= 0 ? '+' : '') + r10roi.toFixed(1) + '%' : '—';
    r10El.style.color = r10roi === null ? 'var(--text3)' : r10roi >= 0 ? 'var(--green)' : 'var(--red)';
  }

  // EV 평균 — compute.js
  const evEl = document.getElementById('analyze-ev-avg');
  if (evEl) {
    const ea = metrics.evAvg;
    evEl.textContent = ea !== null ? (ea >= 0 ? '+' : '') + ea.toFixed(2) + '%' : '—';
    evEl.style.color = ea === null ? 'var(--text3)' : ea >= 0 ? 'var(--accent)' : 'var(--red)';
  }

  // 연속 스트릭 — 엔진
  const streakEl    = document.getElementById('analyze-streak');
  const streakLabel = document.getElementById('analyze-streak-label');
  if (streakEl) {
    const _streak     = _SS ? _SS.streak : 0;
    const _streakType = _SS ? _SS.streakType : '';
    if (_streak > 0 && _streakType) {
      streakEl.textContent = _streak + '연속';
      streakEl.style.color = _streakType === 'WIN' ? 'var(--green)' : 'var(--red)';
      if (streakLabel) streakLabel.textContent = _streakType === 'WIN' ? '🔥 연승 중' : '❄️ 연패 중';
    } else {
      streakEl.textContent = '—';
      streakEl.style.color = 'var(--text3)';
      if (streakLabel) streakLabel.textContent = '';
    }
  }

  // 시나리오 그래프 + 방향성 + 리스크
  updateAnalyzeChart();
  updateJudgePanel();
}


// ============================================================
// setJudgeFilter
// ============================================================
function setJudgeFilter(val, el) {
  judgeFilter = val;
  ['jf-all','jf-30','jf-10'].forEach(id => {
    const b = document.getElementById(id);
    if (!b) return;
    b.style.background = 'var(--bg3)'; b.style.color = 'var(--text2)'; b.style.fontWeight = '400';
  });
  if (el) { el.style.background = 'var(--accent)'; el.style.color = '#000'; el.style.fontWeight = '700'; }
  updateJudgePanel();
}


// ============================================================
// updateJudgePanel
// ============================================================
function updateJudgePanel() {
  const bets = getBets();
  const j    = computeJudgeMetrics(bets, judgeFilter);

  const minSample = 5;
  if (j.resolved.length < minSample) {
    ['judge-diagnosis','judge-action','judge-cross-table'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<span style="color:var(--text3);">데이터 부족</span>';
    });
    const diag = document.getElementById('judge-diagnosis');
    if (diag) diag.innerHTML = `<span style="color:var(--text3);">베팅 기록 ${minSample}건 이상부터 분석이 시작됩니다. (현재 ${j.resolved.length}건)</span>`;
    return;
  }

  // ── KPI 업데이트 ──
  const sp = (idV, idL, val, lbl, c) => {
    const v = document.getElementById(idV), l = document.getElementById(idL);
    if (v) { v.textContent = val; if (c) v.style.color = c; }
    if (l) l.textContent = lbl;
  };
  if (j.predEdge !== null)
    sp('judge-pred-edge', 'judge-pred-edge-label',
      (j.predEdge >= 0 ? '+' : '') + j.predEdge.toFixed(1) + '%p',
      `${j.predBets.length}건 · 실현 ${j.actualEdgeVal !== null ? (j.actualEdgeVal >= 0 ? '+' : '') + j.actualEdgeVal.toFixed(1) + '%p' : '—'}`,
      j.predEdge >= 5 ? 'var(--green)' : j.predEdge >= 0 ? 'var(--gold)' : 'var(--red)');
  if (j.evTrust !== null)
    sp('judge-ev-trust', 'judge-ev-trust-label',
      j.evTrust.toFixed(0) + '%',
      `EV 추정 ${j.evBets.length}건`,
      j.evTrust >= 80 ? 'var(--green)' : j.evTrust >= 40 ? 'var(--gold)' : 'var(--red)');
  if (j.folderData.length > 0) {
    const bf = j.folderData.slice().sort((a, b) => (b.roi || 0) - (a.roi || 0))[0];
    sp('judge-best-folder', 'judge-best-folder-label', bf.key,
      `ROI ${bf.roi != null ? (bf.roi >= 0 ? '+' : '') + bf.roi.toFixed(1) + '%' : '—'} · ${bf.count}건`, 'var(--green)');
  }
  if (j.bestSport)
    sp('judge-best-sport', 'judge-best-sport-label',
      j.bestSport.sp.length > 5 ? j.bestSport.sp.slice(0, 5) + '…' : j.bestSport.sp,
      `ROI ${j.bestSport.roi >= 0 ? '+' : ''}${j.bestSport.roi.toFixed(1)}%`, 'var(--accent)');
  if (j.recentEdge !== null) {
    const delta = j.predEdge !== null ? j.recentEdge - j.predEdge : 0;
    sp('judge-trend-val', 'judge-trend-label',
      (j.recentEdge >= 0 ? '+' : '') + j.recentEdge.toFixed(1) + '%p',
      `전체 대비 ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%p ${delta >= 1 ? '📈' : delta <= -1 ? '📉' : '➡️'}`,
      j.recentEdge >= (j.predEdge || 0) ? 'var(--green)' : 'var(--red)');
  }
  if (j.avgBias !== null)
    sp('judge-bias-val', 'judge-bias-label',
      (j.avgBias >= 0 ? '+' : '') + j.avgBias.toFixed(1) + '%p',
      j.lastBias !== null && j.lastBias < -5 ? '비관 편향으로 전환' : j.avgBias > 10 ? '낙관 편향 강함' : j.avgBias > 3 ? '약한 낙관 편향' : '편향 적음',
      j.lastBias !== null && j.lastBias < -5 ? 'var(--accent)' : j.avgBias > 10 ? 'var(--red)' : j.avgBias > 3 ? 'var(--gold)' : 'var(--green)');

  // ── 차트 1: 폴더별 수익 vs EV ──
  charts.judgeFolder = safeCreateChart('judge-folder-chart', {
    type: 'bar',
    data: {
      labels: j.folderData.map(d => `${d.key}(${d.count})`),
      datasets: [
        { type: 'bar',  label: '실제 수익',   data: j.folderData.map(d => d.profit),
          backgroundColor: j.folderData.map(d => d.profit >= 0 ? 'rgba(0,230,118,0.75)' : 'rgba(255,59,92,0.75)'), borderRadius: 5 },
        { type: 'line', label: '누적 기댓값', data: j.folderData.map(d => d.cumEv),
          borderColor: '#ffd700', borderWidth: 2, pointRadius: 4, fill: false, tension: 0.3 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#8892a4', font: { size: 10 } } } },
      scales: {
        x: { ticks: { color: '#8892a4', font: { size: 10 } }, grid: { color: 'rgba(30,45,69,0.5)' } },
        y: { ticks: { color: '#8892a4', font: { size: 10 }, callback: v => (v >= 0 ? '+' : '') + '₩' + (v / 10000).toFixed(0) + '만' }, grid: { color: 'rgba(30,45,69,0.5)' } }
      } }
  });

  // ── 차트 2: 예측 승률 vs 실제 MA5 ──
  if (j.predBets.length >= 3) {
    charts.judgePred = safeCreateChart('judge-pred-chart', {
      type: 'line',
      data: { labels: j.chartMA.pL, datasets: [
        { label: '내 예측 MA5',     data: j.chartMA.myMA,   borderColor: '#ffd700', borderWidth: 2, pointRadius: 2, fill: false, tension: 0.4 },
        { label: '북메이커',        data: j.chartMA.implMA, borderColor: 'rgba(255,152,0,0.5)', borderWidth: 1.5, borderDash: [4,3], pointRadius: 0, fill: false, tension: 0.4 },
        { label: '실제 적중률 MA5', data: j.chartMA.actMA,  borderColor: '#00e676', borderWidth: 2, pointRadius: 2, fill: false, tension: 0.4 }
      ] },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#8892a4', font: { size: 10 } } } },
        scales: { x: { ticks: { color: '#8892a4', font: { size: 10 } }, grid: { color: 'rgba(30,45,69,0.5)' } },
          y: { min: 0, max: 100, ticks: { color: '#8892a4', font: { size: 10 }, callback: v => v + '%' }, grid: { color: 'rgba(30,45,69,0.5)' } } } }
    });
  }

  // ── 차트 3: 판단력 트렌드 ──
  if (j.trendData.length >= 2) {
    charts.judgeTrend = safeCreateChart('judge-trend-chart', {
      type: 'line',
      data: { labels: j.trendLabels, datasets: [
        { label: '구간별 엣지', data: j.trendData, borderColor: '#64b5f6', backgroundColor: 'rgba(100,181,246,0.1)', borderWidth: 2, pointRadius: 4, fill: true, tension: 0.3 },
        { label: '전체 평균',   data: Array(j.trendData.length).fill(j.predEdge ? parseFloat(j.predEdge.toFixed(1)) : 0), borderColor: 'rgba(255,215,0,0.4)', borderWidth: 1.5, borderDash: [4,3], pointRadius: 0, fill: false }
      ] },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#8892a4', font: { size: 10 } } } },
        scales: { x: { ticks: { color: '#8892a4', font: { size: 9 } }, grid: { color: 'rgba(30,45,69,0.5)' } },
          y: { ticks: { color: '#8892a4', font: { size: 10 }, callback: v => (v >= 0 ? '+' : '') + v + '%p' }, grid: { color: 'rgba(30,45,69,0.5)' } } } }
    });
  }

  // ── 차트 4: 배당 구간별 정확도 ──
  if (j.oddsData.length > 0) {
    charts.judgeOdds = safeCreateChart('judge-odds-chart', {
      type: 'bar',
      data: { labels: j.oddsData.map(d => `${d.label}(${d.count})`), datasets: [
        { label: '내 예측 엣지', data: j.oddsData.map(d => d.edge),
          backgroundColor: j.oddsData.map(d => d.edge >= 0 ? 'rgba(0,229,255,0.6)' : 'rgba(255,152,0,0.6)'), borderRadius: 4 },
        { label: '실제 엣지',   data: j.oddsData.map(d => d.actualEdge),
          backgroundColor: j.oddsData.map(d => d.actualEdge >= 0 ? 'rgba(0,230,118,0.7)' : 'rgba(255,59,92,0.7)'), borderRadius: 4 }
      ] },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#8892a4', font: { size: 10 } } } },
        scales: { x: { ticks: { color: '#8892a4', font: { size: 9 } }, grid: { color: 'rgba(30,45,69,0.5)' } },
          y: { ticks: { color: '#8892a4', font: { size: 10 }, callback: v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%p' }, grid: { color: 'rgba(30,45,69,0.5)' } } } }
    });
  }

  // ── 차트 5: 낙관 편향 추이 ──
  if (j.biasMA.length >= 3) {
    const biasPos = j.biasMA.map(v => v >= 0 ? v : null);
    const biasNeg = j.biasMA.map(v => v <  0 ? v : null);
    charts.judgeBias = safeCreateChart('judge-bias-chart', {
      type: 'line',
      data: { labels: j.biasLabels, datasets: [
        { label: '낙관 편향(+)', data: biasPos, borderColor: '#ff6b35', backgroundColor: 'rgba(255,107,53,0.08)',
          borderWidth: 2, pointRadius: 2, fill: true, tension: 0.4, spanGaps: false },
        { label: '비관 편향(−)', data: biasNeg, borderColor: '#64b5f6', backgroundColor: 'rgba(100,181,246,0.08)',
          borderWidth: 2, pointRadius: 2, fill: true, tension: 0.4, spanGaps: false },
        { label: '기준(0)', data: Array(j.biasMA.length).fill(0),
          borderColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderDash: [3,3], pointRadius: 0, fill: false }
      ] },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#8892a4', font: { size: 10 } } } },
        scales: { x: { ticks: { color: '#8892a4', font: { size: 10 } }, grid: { color: 'rgba(30,45,69,0.5)' } },
          y: { ticks: { color: '#8892a4', font: { size: 10 }, callback: v => (v >= 0 ? '+' : '') + v + '%p' }, grid: { color: 'rgba(30,45,69,0.5)' } } } }
    });
  }

  // ── 교차표 ──
  const crossEl = document.getElementById('judge-cross-table');
  if (crossEl) {
    if (j.activeFkeys.length > 0 && Object.keys(j.sportMap).filter(sp => j.sportMap[sp].count >= 2).length > 0) {
      const sportList = Object.keys(j.sportMap).filter(sp => j.sportMap[sp].count >= 2);
      let html = `<table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead><tr><th style="padding:6px 10px;text-align:left;color:var(--text3);border-bottom:1px solid var(--border);">종목</th>`;
      j.activeFkeys.forEach(k => { html += `<th style="padding:6px 10px;text-align:center;color:var(--text3);border-bottom:1px solid var(--border);">${k}</th>`; });
      html += '</tr></thead><tbody>';
      sportList.forEach(sp => {
        html += `<tr><td style="padding:6px 10px;color:var(--text2);font-weight:600;border-bottom:1px solid rgba(255,255,255,0.04);">${sp}</td>`;
        j.activeFkeys.forEach(k => {
          const cell = j.matrix[sp] && j.matrix[sp][k];
          if (!cell || !cell.count) { html += `<td style="padding:6px 10px;text-align:center;color:var(--text3);border-bottom:1px solid rgba(255,255,255,0.04);">—</td>`; return; }
          const roi = cell.invested > 0 ? cell.profit / cell.invested * 100 : 0;
          const bg  = roi >= 10 ? 'rgba(0,230,118,0.15)' : roi >= 0 ? 'rgba(0,230,118,0.06)' : roi >= -10 ? 'rgba(255,59,92,0.08)' : 'rgba(255,59,92,0.18)';
          html += `<td style="padding:6px 10px;text-align:center;background:${bg};border-bottom:1px solid rgba(255,255,255,0.04);">
            <div style="color:${roi >= 0 ? 'var(--green)' : 'var(--red)'};font-weight:700;">${roi >= 0 ? '+' : ''}${roi.toFixed(0)}%</div>
            <div style="color:var(--text3);font-size:10px;">${cell.count}건</div></td>`;
        });
        html += '</tr>';
      });
      crossEl.innerHTML = html + '</tbody></table>';
    } else {
      crossEl.innerHTML = '<span style="color:var(--text3);font-size:12px;">종목별 2건 이상 데이터 필요</span>';
    }
  }

  // ── 액션 제안 — type 기준 스타일 매핑 ──
  const actionEl = document.getElementById('judge-action');
  if (actionEl) {
    actionEl.innerHTML = j.actions.length > 0
      ? `<div style="font-size:12px;font-weight:700;color:var(--accent);margin-bottom:10px;">⚡ 지금 바로 실행할 액션</div>`
        + j.actions.map(a => `<div style="padding:7px 0;border-bottom:1px solid rgba(0,229,255,0.08);font-size:12px;line-height:1.8;">${a.text}</div>`).join('')
      : `<div style="font-size:12px;color:var(--green);">✅ 현재 특별한 이상 신호 없음 — 현재 방식을 유지하세요.</div>`;
  }

  // ── 종합 진단 ──
  const diagEl = document.getElementById('judge-diagnosis');
  if (!diagEl) return;
  diagEl.innerHTML = j.diagLines.map(l => `<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">${l}</div>`).join('') || '<span style="color:var(--text3);">데이터 분석 중...</span>';
}


// ============================================================
// updateAnalyzeChart
// ============================================================
function updateAnalyzeChart() {
  const bets   = getBets();
  const config = {
    start:      getCurrentBankroll() || appSettings.startFund || 0,
    goalTarget: appSettings.targetFund || 0,
    simGrade:   appSettings.kellyGradeAdj ? calcPredGrade() : null
  };
  const sim = computeSimulation(bets, config);

  updateAnalyzeGradeBanner(sim.simGrade, sim.simMult, sim.useRecent, sim.resolvedCount);

  // KPI 렌더
  var ruinEl = document.getElementById('sim-ruin-prob');
  if (ruinEl) {
    ruinEl.textContent = sim.ruinProb.toFixed(1) + '%';
    ruinEl.style.color = sim.ruinProb >= 20 ? 'var(--red)' : sim.ruinProb >= 10 ? '#ff9800' : 'var(--green)';
  }

  var goalEl = document.getElementById('sim-goal-bets');
  if (goalEl) {
    if (sim.medGoal !== null) {
      goalEl.textContent = sim.medGoal + '번째';
      goalEl.style.color = 'var(--gold)';
    } else {
      goalEl.textContent = sim.goalTarget > 0 ? '미달' : '—';
      goalEl.style.color = 'var(--text3)';
    }
  }

  var streakEl = document.getElementById('sim-max-streak');
  if (streakEl) {
    streakEl.textContent = sim.p90streak + '연패';
    streakEl.style.color = sim.p90streak >= 8 ? 'var(--red)' : sim.p90streak >= 5 ? '#ff9800' : 'var(--accent)';
  }

  var ddEl = document.getElementById('sim-max-dd');
  if (ddEl) {
    ddEl.textContent = sim.worstMinAbs !== null ? '-₩' + sim.worstMinAbs.toLocaleString() : '—';
    ddEl.style.color = 'var(--red)';
  }

  const analyzePage = document.getElementById('page-analyze');
  if (!analyzePage || !analyzePage.classList.contains('active')) return;

  charts.analyzeChart = safeCreateChart('analyzeChart', {
    type: 'line',
    data: {
      labels: sim.labels,
      datasets: [
        { label: '불확실 구간 (상단)', data: sim.p90, borderColor: 'rgba(0,229,255,0.2)', borderWidth: 1, pointRadius: 0, tension: 0.4, order: 6 },
        { label: '불확실 구간 (하단)', data: sim.p10, borderColor: 'rgba(0,229,255,0.2)', borderWidth: 1, pointRadius: 0, tension: 0.4, order: 7 },
        { label: '비관 (하위 25%)', data: sim.p25, borderColor: '#ff9800', borderWidth: 1.5, pointRadius: 0, tension: 0.4, fill: false, order: 3 },
        { label: '최악 (하위 10%)', data: sim.p10, borderColor: '#ff3b5c', borderWidth: 1.5, pointRadius: 0, tension: 0.4, borderDash: [4, 3], fill: false, order: 4 },
        { label: '중앙값 (50%)', data: sim.p50, borderColor: '#c8d6e8', borderWidth: 2.5, pointRadius: 0, tension: 0.4, fill: false, order: 2 },
        { label: '실제 기록', data: sim.actualPath, borderColor: '#ffffff', borderWidth: 3, pointRadius: 2, pointBackgroundColor: '#fff', tension: 0.2, fill: false, order: 1 },
        ...(sim.goalTarget > 0 ? [{
          label: '목표 자금',
          data: Array(sim.STEPS + 1).fill(sim.goalTarget - sim.start),
          borderColor: 'rgba(255,215,0,0.7)', borderWidth: 1.5, pointRadius: 0, borderDash: [8, 4], fill: false, order: 7
        }] : [])
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true, position: 'bottom',
          labels: {
            color: '#8892a4', font: { size: 10 }, boxWidth: 20, padding: 12,
            filter: function(item) {
              return item.text !== '불확실 구간 (상단)' && item.text !== '불확실 구간 (하단)';
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              if (ctx.parsed.y == null) return null;
              return ctx.dataset.label + ': ' + (ctx.parsed.y >= 0 ? '+' : '') + '₩' + ctx.parsed.y.toLocaleString();
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: '#8892a4', font: { size: 9 }, maxTicksLimit: 10 }, grid: { display: false } },
        y: {
          ticks: { color: '#8892a4', font: { size: 10 }, callback: function(v) { return (v >= 0 ? '+' : '') + '₩' + (v/10000).toFixed(0) + '만'; } },
          grid: { color: 'rgba(255,255,255,0.04)' }
        }
      }
    }
  });

  updateAnalyzeDirection(sim.winRate, sim.evPerBet, sim.avgOdds);
  updateAnalyzeRisk(sim.winRate, sim.avgOdds, sim.avgAmt, sim.start, sim.goalTarget);
}


// ============================================================
// updateAnalyzeGradeBanner
// ============================================================
function updateAnalyzeGradeBanner(grade, mult, useRecent, totalCount) {
  const banner = document.getElementById('analyze-grade-banner');
  if (!banner) return;
  if (!grade || !appSettings.kellyGradeAdj) { banner.style.display = 'none'; return; }
  const rgbMap = {S:'255,215,0', A:'0,230,118', B:'0,229,255', C:'255,152,0', D:'255,59,92'};
  banner.style.display = 'flex';
  banner.style.background = 'rgba(' + (rgbMap[grade.letter]||'0,229,255') + ',0.07)';
  banner.style.border = '1px solid ' + grade.color + '44';
  const badge = document.getElementById('analyze-grade-badge');
  if (badge) { badge.textContent = grade.letter; badge.style.background = grade.color+'22'; badge.style.color = grade.color; badge.style.border = '2px solid '+grade.color; }
  const title = document.getElementById('analyze-grade-banner-title');
  if (title) { title.textContent = '예측력 '+grade.letter+'등급 보정 시뮬레이션 적용 중'; title.style.color = grade.color; }
  const sub = document.getElementById('analyze-grade-banner-sub');
  if (sub) sub.textContent = '베팅 규모 x'+mult+' 보정'+(useRecent?' · 최근 30건 기준 (C/D등급)':' · 전체 '+totalCount+'건 기준');
  const modeBadge = document.getElementById('analyze-sim-mode-badge');
  if (modeBadge) { modeBadge.textContent = mult===1.0?'보정 없음':'x'+mult+' 적용'; modeBadge.style.background = grade.color+'22'; modeBadge.style.color = grade.color; modeBadge.style.border = '1px solid '+grade.color+'55'; }
  const compare = document.getElementById('analyze-sim-compare');
  if (compare) compare.textContent = mult < 1 ? '⚙️ 설정에서 등급 보정 OFF 시 원래 시뮬 복원' : 'S/A등급 — 풀 베팅 유지';
}


// ============================================================
// updateAnalyzeDirection
// ============================================================
function updateAnalyzeDirection(winRate, evPerBet, avgOdds) {
  const el = document.getElementById('analyze-direction');
  if (!el) return;
  const bets = getBets();
  const resolved = bets.filter(function(b){return b.result!=='PENDING';});
  if (resolved.length < 5) { el.innerHTML = '<span style="color:var(--text3)">베팅 5건 이상 필요합니다.</span>'; return; }
  const breakeven = 1 / avgOdds;
  const lines = [];
  if (evPerBet > 0) {
    lines.push('<div style="padding:8px 0;border-bottom:1px solid var(--border);">① <strong style="color:var(--green)">EV+ 베팅 유지</strong> — 현재 베팅 구조는 장기 수익 우위입니다.</div>');
  } else {
    lines.push('<div style="padding:8px 0;border-bottom:1px solid var(--border);">① <strong style="color:var(--red)">EV- 경고</strong> — 현재 배당/승률 구조로는 장기 손실이 예상됩니다. 배당 선택 기준을 높이세요.</div>');
  }
  const minWr = (1 / avgOdds * 100).toFixed(1);
  const curWr = (winRate * 100).toFixed(1);
  const gap   = (winRate * 100 - 1 / avgOdds * 100).toFixed(1);
  lines.push('<div style="padding:8px 0;border-bottom:1px solid var(--border);">② <strong>손익분기 승률 ' + minWr + '%</strong> — 현재 ' + curWr + '% (' + (parseFloat(gap)>=0?'+':'') + gap + '%p)</div>');
  lines.push('<div style="padding:8px 0;">③ 평균 배당 <strong>' + avgOdds.toFixed(2) + '</strong> → ' + (avgOdds >= 1.8 && avgOdds <= 2.2 ? '<span style="color:var(--green)">정배/역배 집중 권장</span>' : avgOdds > 2.2 ? '<span style="color:var(--gold)">고배당 비중 높음 — 분산 고려</span>' : '<span style="color:var(--red)">저배당 — ROI 개선 어려움</span>') + '</div>');
  el.innerHTML = lines.join('');
}


// ============================================================
// updateAnalyzeRisk
// ============================================================
function updateAnalyzeRisk(winRate, avgOdds, avgAmt, start, goalTarget) {
  const el = document.getElementById('analyze-risk');
  if (!el) return;
  const bets = getBets();
  if (bets.filter(function(b){return b.result!=='PENDING';}).length < 5) {
    el.innerHTML = '<span style="color:var(--text3)">베팅 5건 이상 필요합니다.</span>';
    return;
  }
  const risk = computeRiskMetrics(bets, winRate, avgOdds, avgAmt, start);
  const riskLevelHtml = risk.riskLevel === 'high' ? '<span style="color:var(--red)">매우 높음</span>'
    : risk.riskLevel === 'mid' ? '<span style="color:var(--gold)">높음</span>'
    : '<span style="color:var(--green)">보통</span>';
  const kellyStatusHtml = risk.kellyOk ? '<span style="color:var(--green)">적정</span>' : '<span style="color:var(--red)">과다</span>';
  el.innerHTML =
    '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);"><span style="color:var(--text3)">리스크 수준</span><strong>' + riskLevelHtml + '</strong></div>' +
    '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);"><span style="color:var(--text3)">켈리 기준 적정 베팅</span><strong style="color:var(--gold)">₩' + risk.optAmt.toLocaleString() + '</strong></div>' +
    '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);"><span style="color:var(--text3)">현재 평균 베팅</span><strong>' + kellyStatusHtml + ' ₩' + risk.avgAmtRounded.toLocaleString() + '</strong></div>' +
    '<div style="display:flex;justify-content:space-between;padding:8px 0;"><span style="color:var(--text3)">베팅당 변동성</span><strong>±₩' + Math.round(risk.stddev).toLocaleString() + '</strong></div>';
}


// ============================================================
// updateRoundHistory
// ============================================================
function updateRoundHistory() {
  const bets    = getBets();
  const history = getRoundHistory();
  const rh      = computeRoundHistory(bets, history, new Date());

  function renderCalCard(roiId, detailId, s) {
    const roiEl = document.getElementById(roiId);
    const detEl = document.getElementById(detailId);
    if (!roiEl || !detEl) return;
    if (s.bets === 0) {
      roiEl.textContent = '—'; roiEl.style.color = 'var(--text3)';
      detEl.textContent = '베팅 없음';
      return;
    }
    const roiStr = s.roi !== null ? (s.roi >= 0 ? '+' : '') + s.roi.toFixed(1) + '%' : '—';
    roiEl.textContent = roiStr;
    roiEl.style.color = s.roi === null ? 'var(--text3)' : s.roi >= 0 ? 'var(--green)' : 'var(--red)';
    detEl.textContent = s.bets + '건 · ' + (s.profit >= 0 ? '+' : '') + '₩' + Math.abs(s.profit).toLocaleString();
  }

  renderCalCard('rh-cal-7d-roi',  'rh-cal-7d-detail',  rh.calStats.d7);
  renderCalCard('rh-cal-30d-roi', 'rh-cal-30d-detail', rh.calStats.d30);
  renderCalCard('rh-cal-90d-roi', 'rh-cal-90d-detail', rh.calStats.d90);

  function renderRoundCard(roiId, detailId, s) {
    const roiEl = document.getElementById(roiId);
    const detEl = document.getElementById(detailId);
    if (!roiEl || !detEl) return;
    if (!s) {
      roiEl.textContent = '—'; roiEl.style.color = 'var(--text3)';
      detEl.textContent = '회차 데이터 없음';
      return;
    }
    const roiStr = s.roi !== null ? (s.roi >= 0 ? '+' : '') + s.roi.toFixed(1) + '%' : '—';
    roiEl.textContent = roiStr;
    roiEl.style.color = s.roi === null ? 'var(--text3)' : s.roi >= 0 ? 'var(--green)' : 'var(--red)';
    detEl.textContent = s.rounds + '회차 · ' + s.bets + '건 · ' + (s.profit >= 0 ? '+' : '') + '₩' + Math.abs(s.profit).toLocaleString();
  }

  renderRoundCard('rh-round-3-roi',  'rh-round-3-detail',  rh.roundStats.r3);
  renderRoundCard('rh-round-12-roi', 'rh-round-12-detail', rh.roundStats.r12);
  renderRoundCard('rh-round-36-roi', 'rh-round-36-detail', rh.roundStats.r36);

  const feedbackEl = document.getElementById('rh-habit-feedback');
  if (feedbackEl) {
    if (rh.feedbackData && rh.feedbackData.show) {
      const { diff, kind } = rh.feedbackData;
      feedbackEl.style.display = 'block';
      if (kind === 'good') {
        feedbackEl.style.background = 'rgba(0,230,118,0.08)';
        feedbackEl.style.border     = '1px solid rgba(0,230,118,0.25)';
        feedbackEl.style.color      = 'var(--green)';
        feedbackEl.innerHTML = '✅ 회차 관리 양호 — 달력/회차 기준 ROI 차이 ' + diff.toFixed(1) + '%p 이내입니다. 한 회차 안에 시드를 잘 소진하고 있습니다.';
      } else if (kind === 'caution') {
        feedbackEl.style.background = 'rgba(255,215,0,0.08)';
        feedbackEl.style.border     = '1px solid rgba(255,215,0,0.25)';
        feedbackEl.style.color      = 'var(--gold)';
        feedbackEl.innerHTML = '⚠️ 회차 관리 보통 — 달력/회차 기준 ROI 차이 ' + diff.toFixed(1) + '%p. 회차 내 시드 소진 습관을 조금 더 다듬어보세요.';
      } else {
        feedbackEl.style.background = 'rgba(255,59,92,0.08)';
        feedbackEl.style.border     = '1px solid rgba(255,59,92,0.25)';
        feedbackEl.style.color      = 'var(--red)';
        feedbackEl.innerHTML = '❌ 회차 관리 필요 — 달력/회차 기준 ROI 차이 ' + diff.toFixed(1) + '%p. 한 회차 안에 시드를 소진하는 습관을 길러보세요. 회차가 여러 날에 걸치면 성과 측정이 왜곡됩니다.';
      }
    } else {
      feedbackEl.style.display = 'none';
    }
  }

  const tbody    = document.getElementById('rh-table');
  const clearWrap = document.getElementById('rh-clear-wrap');
  if (!tbody) return;

  if (history.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:24px;">시드를 고정하면 회차가 쌓입니다.</td></tr>';
    if (clearWrap) clearWrap.style.display = 'none';
    return;
  }

  if (clearWrap) clearWrap.style.display = 'block';

  tbody.innerHTML = history.slice().reverse().map(function(r) {
    const roiColor = r.roi >= 0 ? 'var(--green)' : 'var(--red)';
    const pnlColor = r.profit >= 0 ? 'var(--green)' : 'var(--red)';
    return '<tr>' +
      '<td class="mono" style="font-weight:700;color:var(--gold);">' + r.round + '회차</td>' +
      '<td style="font-size:11px;">' + (r.startDate || '—') + '</td>' +
      '<td style="font-size:11px;">' + (r.endDate   || '—') + '</td>' +
      '<td class="mono" style="font-size:11px;">₩' + (r.seed || 0).toLocaleString() + '</td>' +
      '<td class="mono">' + r.bets + '건</td>' +
      '<td class="mono" style="color:' + (r.wr >= 50 ? 'var(--green)' : 'var(--red)') + ';">' + r.wr.toFixed(1) + '%</td>' +
      '<td class="mono" style="color:' + pnlColor + ';">' + (r.profit >= 0 ? '+' : '') + '₩' + Math.abs(r.profit).toLocaleString() + '</td>' +
      '<td class="mono" style="font-weight:700;color:' + roiColor + ';">' + (r.roi >= 0 ? '+' : '') + r.roi.toFixed(1) + '%</td>' +
    '</tr>';
  }).join('');
}


// ============================================================
// clearRoundHistory
// ============================================================
function clearRoundHistory() {
  if (!confirm('회차 이력을 전체 삭제합니다. 복구가 불가능합니다. 계속하시겠습니까?')) return;
  localStorage.removeItem('edge_round_history');
  updateRoundHistory();
}


// ============================================================
// _syncScopeUI
// ============================================================
function _syncScopeUI() {
  const scope   = getCurrentScope();
  const project = getCurrentProject();
  const round   = getActiveRound();
  const rounds  = getRounds();

  const ON_DASH  = { background:'var(--accent)',           color:'#000',          borderColor:'var(--accent)' };
  const OFF_DASH = { background:'var(--bg3)',               color:'var(--text2)',   borderColor:'var(--border)' };
  const ON_SET   = { background:'rgba(0,229,255,0.15)',    color:'var(--accent)', border:'1px solid rgba(0,229,255,0.4)' };
  const OFF_SET  = { background:'var(--bg3)',               color:'var(--text2)',  border:'1px solid var(--border)' };

  const btnAll   = document.getElementById('scope-btn-all');
  const btnRound = document.getElementById('scope-btn-round');
  const label    = document.getElementById('scope-label');
  if (btnAll && btnRound) {
    const applyD = (el, s) => { el.style.background = s.background; el.style.color = s.color; el.style.borderColor = s.borderColor; };
    if (scope === 'round') {
      applyD(btnAll, OFF_DASH); applyD(btnRound, ON_DASH);
      if (label) label.textContent = round ? '(회차 #' + (rounds.indexOf(round) + 1) + ')' : '(없음)';
    } else {
      applyD(btnAll, ON_DASH);  applyD(btnRound, OFF_DASH);
      if (label) label.textContent = '';
    }
    if (btnRound) {
      btnRound.disabled      = !round;
      btnRound.style.opacity = round ? '1' : '0.4';
      btnRound.title         = round ? '현재 회차 통계만 보기' : '진행 중인 회차가 없습니다';
    }
  }

  const sBtnAll   = document.getElementById('settings-scope-btn-all');
  const sBtnRound = document.getElementById('settings-scope-btn-round');
  const sInfo     = document.getElementById('settings-scope-current');
  if (sBtnAll && sBtnRound) {
    const applyS = (el, s) => { el.style.background = s.background; el.style.color = s.color; el.style.border = s.border; };
    if (scope === 'round') {
      applyS(sBtnAll, OFF_SET); applyS(sBtnRound, ON_SET);
      if (sInfo) sInfo.textContent = round ? '현재 적용: 회차 ' + round.id + ' (남은 시드 ₩' + (round.remaining || 0).toLocaleString() + ')' : '현재 적용: 회차 (없음)';
    } else {
      applyS(sBtnAll, ON_SET);  applyS(sBtnRound, OFF_SET);
      if (sInfo) sInfo.textContent = '현재 적용: 전체 베팅 기록';
    }
    if (sBtnRound) {
      sBtnRound.disabled      = !round;
      sBtnRound.style.opacity = round ? '1' : '0.4';
    }
  }

  _syncRoundStatusUI();
}


// ============================================================
// _syncRoundStatusUI
// ============================================================
function _syncRoundStatusUI() {
  const round  = getActiveRound();
  const rounds = getRounds();

  const statusEl  = document.getElementById('round-status-text');
  const seedEl    = document.getElementById('round-status-seed');
  const remEl     = document.getElementById('round-status-remaining');
  const barEl     = document.getElementById('round-status-bar');
  const lockBtn   = document.getElementById('round-lock-btn');
  const closeBtn  = document.getElementById('round-close-btn');

  if (round) {
    const pct = round.seed > 0 ? Math.max(0, round.remaining / round.seed * 100) : 0;
    const barColor = pct > 50 ? 'var(--green)' : pct > 20 ? 'var(--gold)' : 'var(--red)';

    if (statusEl)  { statusEl.textContent = '🔒 LOCKED — 진행 중'; statusEl.style.color = 'var(--green)'; }
    if (seedEl)    seedEl.textContent  = '₩' + round.seed.toLocaleString();
    if (remEl)     { remEl.textContent = '₩' + round.remaining.toLocaleString(); remEl.style.color = barColor; }
    if (barEl)     { barEl.style.width = pct.toFixed(1) + '%'; barEl.style.background = barColor; }
    if (lockBtn)   { lockBtn.disabled = true;  lockBtn.style.opacity = '0.4'; }
    if (closeBtn)  { closeBtn.disabled = false; closeBtn.style.opacity = '1'; }
  } else {
    if (statusEl)  { statusEl.textContent = '⏹ UNLOCKED — 회차 없음'; statusEl.style.color = 'var(--text3)'; }
    if (seedEl)    seedEl.textContent  = '—';
    if (remEl)     { remEl.textContent = '—'; remEl.style.color = 'var(--text3)'; }
    if (barEl)     { barEl.style.width = '0%'; barEl.style.background = 'var(--border)'; }
    if (lockBtn)   { lockBtn.disabled = false; lockBtn.style.opacity = '1'; }
    if (closeBtn)  { closeBtn.disabled = true;  closeBtn.style.opacity = '0.4'; }
  }

  const histEl = document.getElementById('round-history-list');
  if (histEl && rounds.length > 0) {
    histEl.innerHTML = [...rounds].reverse().map((r, i) => {
      const idx      = rounds.length - i;
      const usedPct  = r.seed > 0 ? ((r.seed - r.remaining) / r.seed * 100).toFixed(0) : 0;
      const statusBadge = r.status === 'LOCKED'
        ? '<span style="color:var(--green);font-weight:700;">🔒 진행 중</span>'
        : '<span style="color:var(--text3);">⏹ 종료</span>';
      const startDate = r.createdAt ? r.createdAt.split('T')[0] : '—';
      const endDate   = r.closedAt  ? r.closedAt.split('T')[0]  : '—';
      return `<tr style="border-bottom:1px solid var(--border);">
        <td style="padding:8px 6px;font-size:11px;color:var(--text3);">${idx}회차</td>
        <td style="padding:8px 6px;font-size:11px;">₩${r.seed.toLocaleString()}</td>
        <td style="padding:8px 6px;font-size:11px;color:${r.remaining > 0 ? 'var(--text2)' : 'var(--red)'};">₩${r.remaining.toLocaleString()}</td>
        <td style="padding:8px 6px;font-size:11px;color:var(--text3);">${usedPct}%</td>
        <td style="padding:8px 6px;font-size:11px;">${statusBadge}</td>
        <td style="padding:8px 6px;font-size:10px;color:var(--text3);">${startDate} ~ ${endDate}</td>
      </tr>`;
    }).join('');
  } else if (histEl) {
    histEl.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:16px;font-size:12px;">회차 기록 없음</td></tr>';
  }
}


// ── 자기 무결성 체크 ─────────────────────────────────────────
console.assert(typeof toggleGenericDropdown  === 'function', '[ui_tabs.js] toggleGenericDropdown not defined');
console.assert(typeof switchTabFromDropdown  === 'function', '[ui_tabs.js] switchTabFromDropdown not defined');
console.assert(typeof updateAnalyzeTab       === 'function', '[ui_tabs.js] updateAnalyzeTab not defined');
console.assert(typeof updateJudgePanel       === 'function', '[ui_tabs.js] updateJudgePanel not defined');
console.assert(typeof updateAnalyzeChart     === 'function', '[ui_tabs.js] updateAnalyzeChart not defined');
console.assert(typeof updateRoundHistory     === 'function', '[ui_tabs.js] updateRoundHistory not defined');
console.assert(typeof clearRoundHistory      === 'function', '[ui_tabs.js] clearRoundHistory not defined');
console.assert(typeof _syncScopeUI           === 'function', '[ui_tabs.js] _syncScopeUI not defined');
console.assert(typeof _syncRoundStatusUI     === 'function', '[ui_tabs.js] _syncRoundStatusUI not defined');
