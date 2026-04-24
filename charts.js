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

  const allResolved = bets.filter(b => b.result !== 'PENDING');

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
  bets.forEach(b => {
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
  // 엔진 없으면 직접 계산 (폴백)
  const resolved = bets.filter(b => b.result !== 'PENDING');
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
  const unitRaw = Math.floor(seed / 12 * _totalMult);
  const unit = Math.min(unitRaw, maxUnit);  // 상한선 적용

  // _SS에 kellyUnit 동기화
  if (_SS) { _SS.kellyUnit = unit; }

  const unitEl = document.getElementById('kelly-unit');
  if (unitEl) {
    unitEl.textContent = '₩' + unit.toLocaleString();
    unitEl.style.color = _totalMult < 1 ? 'var(--gold)' : 'var(--text)';
    if (_grade && _totalMult < 1) {
      const eceNote = (_SS && _SS.ece !== null) ? ` · ECE ${_SS.ece.toFixed(1)}% 보정 x${_eceMult.toFixed(2)}` : '';
      unitEl.title = '예측력 ' + _grade.letter + '등급 x' + _gradeMult.toFixed(2) + eceNote;
    }
  }

  // 베팅 기록 기반 현재 회차 자동 계산
  const resolved  = bets.filter(b => b.result !== 'PENDING');
  const cyclePos  = resolved.length % 12;  // 0~11
  const roundNum  = cyclePos + 1;
  const remain    = 12 - cyclePos;
  const cycleNum  = Math.floor(resolved.length / 12) + 1;

  document.getElementById('kelly-round').textContent = roundNum + ' / 12';
  const remainEl = document.getElementById('kelly-remain');
  remainEl.textContent = remain + '회';
  remainEl.style.color = remain <= 3 ? 'var(--accent2)' : 'var(--text)';

  // 이번 베팅 금액 강조 표시
  const nextBetEl    = document.getElementById('kelly-next-bet');
  const nextAmountEl = document.getElementById('kelly-next-amount');
  const nextNoteEl   = document.getElementById('kelly-next-note');
  nextBetEl.style.display = 'block';
  nextAmountEl.textContent = '₩' + unit.toLocaleString();
  const eceNote2 = (_SS && _SS.ece !== null && appSettings.kellyGradeAdj) ? ` · ECE ${_SS.ece.toFixed(1)}% x${_eceMult.toFixed(2)}` : '';
  nextNoteEl.textContent = cycleNum + '사이클 ' + roundNum + '번째 베팅 · ' + remain + '회 남음' + (_totalMult < 1 && _grade ? ' · ' + _grade.letter + '등급 x' + _totalMult.toFixed(2) + eceNote2 : '') + (unit < unitRaw ? ' · 상한선 ₩' + maxUnit.toLocaleString() + ' 적용' : '');

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


