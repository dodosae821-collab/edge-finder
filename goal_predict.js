// ========== GOAL ==========
function updateGoalStats() {
  // ── 엔진 연동 ──
  const _SS = window._SS;

  // 설정 탭 자금 자동 연동
  if (appSettings.startFund > 0) {
    const goalStartEl = document.getElementById('goal-start');
    if (!goalStartEl.value || parseFloat(goalStartEl.value) === 500000) {
      goalStartEl.value = appSettings.startFund;
    }
  }
  if (appSettings.targetFund > 0 && appSettings.startFund > 0) {
    const goalTargetEl = document.getElementById('goal-target');
    const defaultTarget = appSettings.targetFund - appSettings.startFund;
    if (!goalTargetEl.value || parseFloat(goalTargetEl.value) === 1000000) {
      goalTargetEl.value = defaultTarget;
    }
  }
  // 설정값 자동 반영
  const { startFund = 0, targetFund = 0 } = appSettings;

  const resolved = bets.filter(b => b.result !== 'PENDING');
  const wins     = resolved.filter(b => b.result === 'WIN');

  // 현재 승률
  const wr = resolved.length > 0 ? (wins.length / resolved.length * 100) : 0;
  const roiEl = document.getElementById('goal-stat-roi');
  const wrEl2 = document.getElementById('goal-stat-wr'); if (wrEl2) wrEl2.textContent = resolved.length > 0 ? wr.toFixed(1) + '%' : '—';

  // 주간 경계 계산 (월요일 기준)
  const now = new Date();
  function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay(); // 0=일,1=월
    const diff = (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const thisWeekStart = getWeekStart(now);
  const prevWeekStart = new Date(thisWeekStart); prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const w2Start       = new Date(thisWeekStart); w2Start.setDate(w2Start.getDate() - 14);
  const w4Start       = new Date(thisWeekStart); w4Start.setDate(w4Start.getDate() - 28);

  function betsInRange(from, to) {
    return bets.filter(b => {
      if (!b.date) return false;
      const d = new Date(b.date);
      return d >= from && d < to;
    });
  }
  function profitInRange(from, to) {
    return betsInRange(from, to)
      .filter(b => b.result !== 'PENDING')
      .reduce((s, b) => s + b.profit, 0);
  }

  const thisWeekBets = betsInRange(thisWeekStart, new Date(thisWeekStart.getTime() + 7 * 86400000));
  const prevWeekBets = betsInRange(prevWeekStart, thisWeekStart);
  const w2Bets       = betsInRange(w2Start, thisWeekStart);
  const w4Bets       = betsInRange(w4Start, thisWeekStart);

  const thisWeekProfit = profitInRange(thisWeekStart, new Date(thisWeekStart.getTime() + 7 * 86400000));
  const prevWeekProfit = profitInRange(prevWeekStart, thisWeekStart);

  // 이번 주
  const weeklyEl = document.getElementById('goal-stat-weekly'); if (weeklyEl) weeklyEl.textContent = thisWeekBets.length + '회';

  // 이번 주 순수익
  const wpEl = document.getElementById('goal-week-profit');
  wpEl.textContent  = (thisWeekProfit >= 0 ? '+' : '') + '₩' + Math.round(thisWeekProfit).toLocaleString();
  wpEl.style.color  = thisWeekProfit >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('goal-week-profit-label').textContent = `${thisWeekBets.length}건 베팅`;

  // 지난 주
  const pwEl = document.getElementById('goal-prev-week-count');
  pwEl.textContent = prevWeekBets.length + '회';
  const pwProfit = document.getElementById('goal-prev-week-profit');
  pwProfit.textContent = (prevWeekProfit >= 0 ? '+' : '') + '₩' + Math.round(prevWeekProfit).toLocaleString();
  pwProfit.style.color = prevWeekProfit >= 0 ? 'var(--green)' : 'var(--red)';

  // 최근 2주 평균
  const avg2w = (w2Bets.length / 2).toFixed(1);
  const profit2w = profitInRange(w2Start, thisWeekStart);
  document.getElementById('goal-stat-2w').textContent = avg2w + '회/주';
  document.getElementById('goal-stat-2w-profit').textContent =
    '주평균 ' + (profit2w >= 0 ? '+' : '') + '₩' + Math.round(profit2w / 2).toLocaleString();

  // 최근 4주 평균
  const avg4w = (w4Bets.length / 4).toFixed(1);
  const profit4w = profitInRange(w4Start, thisWeekStart);
  document.getElementById('goal-stat-4w').textContent = avg4w + '회/주';
  document.getElementById('goal-stat-4w-profit').textContent =
    '주평균 ' + (profit4w >= 0 ? '+' : '') + '₩' + Math.round(profit4w / 4).toLocaleString();

  // 다음 주 예측 (최근 4주 기반)
  const avgWeeklyCount  = w4Bets.length > 0 ? w4Bets.length / 4 : 0;
  const avgWeeklyProfit = w4Bets.length > 0 ? profit4w / 4 : 0;
  const resolvedW4      = w4Bets.filter(b => b.result !== 'PENDING');
  const winsW4          = resolvedW4.filter(b => b.result === 'WIN');
  const wrW4            = resolvedW4.length > 0 ? winsW4.length / resolvedW4.length : (wins.length / Math.max(resolved.length, 1));
  const avgOddsW4       = resolvedW4.length > 0 ? resolvedW4.reduce((s, b) => s + b.betmanOdds, 0) / resolvedW4.length : 1.9;
  const avgAmtW4        = w4Bets.length > 0 ? w4Bets.reduce((s, b) => s + b.amount, 0) / w4Bets.length : 0;

  // (다음 주 예측 카드 삭제됨 - 계산값만 유지)
  const predCount  = Math.round(avgWeeklyCount);
  const predWins   = Math.round(predCount * wrW4);
  const predProfit = Math.round(avgWeeklyProfit);

  // 주간 순수익 차트 (최근 8주)
  const weekLabels   = [];
  const weekProfits  = [];
  for (let i = 7; i >= 0; i--) {
    const wStart = new Date(thisWeekStart); wStart.setDate(wStart.getDate() - i * 7);
    const wEnd   = new Date(wStart); wEnd.setDate(wEnd.getDate() + 7);
    const wp     = profitInRange(wStart, wEnd);
    const label  = `${wStart.getMonth()+1}/${wStart.getDate()}`;
    weekLabels.push(label);
    weekProfits.push(Math.round(wp));
  }

  const weeklyChartEl = document.getElementById('weeklyProfitChart');
  if (!weeklyChartEl) return;
  const goalPageEl = document.getElementById('page-goal');
  if (!goalPageEl || !goalPageEl.classList.contains('active')) return;
  if (charts.weeklyProfit) charts.weeklyProfit.destroy();
  charts.weeklyProfit = safeCreateChart('weeklyProfitChart', {
    type: 'bar',
    data: {
      labels: weekLabels,
      datasets: [{
        label: '주간 순수익',
        data: weekProfits,
        backgroundColor: weekProfits.map(v => v >= 0 ? 'rgba(0,230,118,0.6)' : 'rgba(255,59,92,0.6)'),
        borderColor:     weekProfits.map(v => v >= 0 ? 'var(--green)' : 'var(--red)'),
        borderWidth: 1, borderRadius: 4,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `₩${ctx.parsed.y.toLocaleString()}` } }
      },
      scales: {
        x: { ticks: { color: '#8892a4', font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#8892a4', font: { size: 10 }, callback: v => `₩${(v/10000).toFixed(0)}만` }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });

  // 베팅당 평균 금액
  const avgAmt = bets.length > 0 ? bets.reduce((s, b) => s + b.amount, 0) / bets.length : 0;
  const avgEl = document.getElementById('goal-stat-avg'); if (avgEl) avgEl.textContent = avgAmt > 0 ? '₩' + Math.round(avgAmt).toLocaleString() : '—';

  // 베팅당 평균 손익
  const avgProfitEl = document.getElementById('goal-stat-avg-profit');
  if (avgProfitEl) {
    const avgProfit = resolved.length > 0 ? resolved.reduce((s, b) => s + b.profit, 0) / resolved.length : 0;
    avgProfitEl.textContent = resolved.length > 0 ? (avgProfit >= 0 ? '+' : '') + '₩' + Math.round(avgProfit).toLocaleString() : '—';
    avgProfitEl.style.color = avgProfit >= 0 ? 'var(--green)' : 'var(--red)';
  }

  // ROI (누적) — 엔진 우선
  const totalProfit   = _SS ? _SS.totalProfit   : resolved.reduce((s, b) => s + b.profit, 0);
  const totalInvested = _SS ? _SS.totalInvest   : resolved.reduce((s, b) => s + b.amount, 0);
  const roi = _SS ? _SS.roi : (totalInvested > 0 ? (totalProfit / totalInvested * 100) : 0);
  roiEl.textContent = resolved.length > 0 ? (roi >= 0 ? '+' : '') + roi.toFixed(1) + '%' : '—';
  roiEl.style.color = roi >= 0 ? 'var(--green)' : 'var(--red)';

  // 회차 ROI
  const roundRoiEl    = document.getElementById('goal-round-roi');
  const roundRoiLabel = document.getElementById('goal-round-roi-label');
  const locked = getLockedSeed();
  if (roundRoiEl) {
    if (locked && locked.date) {
      const lockDate = new Date(locked.date); lockDate.setHours(0,0,0,0);
      const roundBets = resolved.filter(b => b.date && new Date(b.date) >= lockDate);
      const roundProfit   = roundBets.reduce((s, b) => s + b.profit, 0);
      const roundInvested = roundBets.reduce((s, b) => s + b.amount, 0);
      const roundRoi = roundInvested > 0 ? (roundProfit / roundInvested * 100) : 0;
      roundRoiEl.textContent = roundBets.length > 0 ? (roundRoi >= 0 ? '+' : '') + roundRoi.toFixed(1) + '%' : '—';
      roundRoiEl.style.color = roundRoi >= 0 ? 'var(--green)' : 'var(--red)';
      if (roundRoiLabel) roundRoiLabel.textContent = locked.date + ' 이후 · ' + roundBets.length + '건';
    } else {
      roundRoiEl.textContent = '—';
      roundRoiEl.style.color = 'var(--text3)';
      if (roundRoiLabel) roundRoiLabel.textContent = '회차 시드 고정 후 기준';
    }
  }

  // 주간 ROI
  const weeklyRoiEl    = document.getElementById('goal-weekly-roi');
  const weeklyRoiLabel = document.getElementById('goal-weekly-roi-label');
  if (weeklyRoiEl) {
    const weeklyProfit   = thisWeekBets.reduce((s, b) => s + b.profit, 0);
    const weeklyInvested = thisWeekBets.reduce((s, b) => s + b.amount, 0);
    const weeklyRoi = weeklyInvested > 0 ? (weeklyProfit / weeklyInvested * 100) : 0;
    weeklyRoiEl.textContent = thisWeekBets.length > 0 ? (weeklyRoi >= 0 ? '+' : '') + weeklyRoi.toFixed(1) + '%' : '—';
    weeklyRoiEl.style.color = weeklyRoi >= 0 ? 'var(--green)' : 'var(--red)';
    if (weeklyRoiLabel) weeklyRoiLabel.textContent = '이번 주 · ' + thisWeekBets.length + '건';
  }

  // 목표까지 남은 금액
  const remainEl    = document.getElementById('goal-remaining');
  const remainLabel = document.getElementById('goal-remaining-label');
  if (remainEl && remainLabel) {
    const curBank = getCurrentBankroll();
    const tgtFund = appSettings.targetFund || 0;
    if (tgtFund > 0) {
      const remaining = tgtFund - curBank;
      remainEl.textContent = (remaining <= 0 ? '🎉 달성!' : '₩' + Math.round(remaining).toLocaleString());
      remainEl.style.color = remaining <= 0 ? 'var(--green)' : curBank < 0 ? 'var(--red)' : 'var(--gold)';
      const pct = Math.max(0, Math.min(100, Math.round(curBank / tgtFund * 100)));
      remainLabel.textContent = curBank < 0
        ? '손실 중 — 목표까지 ₩' + Math.round(remaining).toLocaleString()
        : '목표 ' + pct + '% 도달';
    } else {
      remainEl.textContent = '—';
      remainLabel.textContent = '목표 미설정';
    }
  }
}

function updatePredictTab() {
  // ── 엔진 연동 ──
  const _SS = window._SS;

  const resolved  = bets.filter(b => b.result !== 'PENDING');

  // 엔진 기초값 우선 사용
  const overallWrFromSS = _SS ? _SS.winRate : null;

  // 최근 4주 승률
  const now4 = new Date(); const ago4w = new Date(now4 - 28*24*3600*1000);
  const resolvedW4 = resolved.filter(b => b.date && new Date(b.date) >= ago4w);
  const winsW4     = resolvedW4.filter(b => b.result === 'WIN');
  const wrW4El = document.getElementById('pred-4w-wr');
  if (wrW4El) {
    wrW4El.textContent = resolvedW4.length > 0 ? (winsW4.length / resolvedW4.length * 100).toFixed(1) + '%' : '—';
    wrW4El.style.color = resolvedW4.length > 0 && winsW4.length / resolvedW4.length >= 0.5 ? 'var(--green)' : 'var(--red)';
    const lbl = document.getElementById('pred-4w-wr-label');
    if (lbl) lbl.textContent = resolvedW4.length + '건 기준';
  }

  // ── ① 승률 추세 ──
  const sorted = [...bets].filter(b => b.result !== 'PENDING')
    .sort((a, b) => (a.date||'').localeCompare(b.date||''));

  function wrOf(arr) {
    if (!arr.length) return null;
    return arr.filter(b => b.result === 'WIN').length / arr.length;
  }

  const wr5   = wrOf(sorted.slice(-5));
  const wr10  = wrOf(sorted.slice(-10));
  const wr20  = wrOf(sorted.slice(-20));
  const wrAll = wrOf(sorted);
  // 엔진 승률 우선, 없으면 직접 계산
  const overallWr = overallWrFromSS !== null ? overallWrFromSS : (wrAll || 0);

  // ── 손익비 분석 (overallWr 선언 후) ──
  if (document.getElementById('rr-ratio')) {
    const winBets  = resolved.filter(b => b.result === 'WIN');
    const loseBets = resolved.filter(b => b.result === 'LOSE');
    const avgWin   = winBets.length  > 0 ? winBets.reduce((s, b) => s + b.profit, 0) / winBets.length   : 0;
    const avgLoss  = loseBets.length > 0 ? Math.abs(loseBets.reduce((s, b) => s + b.profit, 0) / loseBets.length) : 0;
    // 엔진 손익비 우선
    const rrRatio  = _SS ? (_SS.plRatio > 0 ? _SS.plRatio : null) : (avgLoss > 0 ? avgWin / avgLoss : null);
    const rrBepWr  = rrRatio !== null ? 1 / (1 + rrRatio) : null;

    const rrEl = document.getElementById('rr-ratio');
    rrEl.textContent = rrRatio !== null ? rrRatio.toFixed(2) : '—';
    rrEl.style.color = rrRatio === null ? 'var(--text3)' : rrRatio >= 2 ? 'var(--green)' : rrRatio >= 1 ? 'var(--gold)' : 'var(--red)';
    document.getElementById('rr-ratio-label').textContent = rrRatio !== null
      ? (rrRatio >= 2 ? '✅ 우수한 손익비' : rrRatio >= 1 ? '⚠️ 보통 손익비' : '❌ 낮은 손익비')
      : '데이터 부족';

    document.getElementById('rr-avg-win').textContent  = winBets.length  > 0 ? '+₩' + Math.round(avgWin).toLocaleString()  : '—';
    document.getElementById('rr-avg-loss').textContent = loseBets.length > 0 ? '-₩' + Math.round(avgLoss).toLocaleString() : '—';

    const bepEl = document.getElementById('rr-bep-wr');
    bepEl.textContent = rrBepWr !== null ? (rrBepWr * 100).toFixed(1) + '%' : '—';
    bepEl.style.color = rrBepWr !== null && overallWr >= rrBepWr ? 'var(--green)' : 'var(--red)';

    const advEl = document.getElementById('rr-advice');
    if (rrRatio !== null && resolved.length >= 5) {
      const surplus = overallWr - (rrBepWr || 0);
      advEl.innerHTML = rrRatio >= 2
        ? `손익비 <strong style="color:var(--green);">${rrRatio.toFixed(2)}</strong> — 한 번 적중이 손실 ${rrRatio.toFixed(1)}번을 커버합니다. 현재 승률 ${(overallWr*100).toFixed(1)}%는 손익분기 승률 ${(rrBepWr*100).toFixed(1)}%보다 <strong style="color:${surplus>=0?'var(--green)':'var(--red)'};">${surplus>=0?'+':''}${(surplus*100).toFixed(1)}%p</strong> ${surplus>=0?'높아 장기 수익 구조입니다. 현재 전략을 유지하세요.':'낮습니다. 손익비가 좋으므로 베팅 선별을 강화하면 개선 가능합니다.'}`
        : rrRatio >= 1
        ? `손익비 <strong style="color:var(--gold);">${rrRatio.toFixed(2)}</strong> — 적중 수익이 손실을 간신히 상회합니다. 승률을 ${(rrBepWr*100).toFixed(1)}% 이상 유지해야 수익이 납니다. 현재 ${surplus>=0?'✅ 충족':'❌ 미충족'} (${(overallWr*100).toFixed(1)}%).`
        : `손익비 <strong style="color:var(--red);">${rrRatio.toFixed(2)}</strong> — 손실이 수익보다 큽니다. 베팅금 대비 배당이 낮거나, 손절 없이 큰 손실이 나고 있을 가능성이 높습니다. 배당 기준을 높이거나 베팅 단위를 줄이는 것을 검토하세요.`;
    } else {
      advEl.innerHTML = '베팅 기록이 5건 이상 쌓이면 손익비 분석이 표시됩니다.';
    }
  }

  [[wr5,'trend-wr-5','trend-badge-5',5],[wr10,'trend-wr-10','trend-badge-10',10],
   [wr20,'trend-wr-20','trend-badge-20',20],[wrAll,'trend-wr-all','trend-badge-all',null]]
  .forEach(([wr, valId, badgeId, n]) => {
    const el = document.getElementById(valId);
    const badge = document.getElementById(badgeId);
    if (!el) return;
    if (wr === null) { el.textContent = '—'; el.style.color = 'var(--text3)'; badge.textContent = ''; return; }
    const pct = (wr * 100).toFixed(1) + '%';
    el.textContent = pct;
    if (n) {
      const diff = wr - overallWr;
      el.style.color = diff > 0.03 ? 'var(--green)' : diff < -0.03 ? 'var(--red)' : 'var(--gold)';
      badge.textContent = diff > 0.03 ? '▲ 평균 초과' : diff < -0.03 ? '▼ 평균 미달' : '≈ 평균 수준';
      badge.style.color = diff > 0.03 ? 'var(--green)' : diff < -0.03 ? 'var(--red)' : 'var(--gold)';
    } else {
      el.style.color = 'var(--gold)';
      badge.textContent = sorted.length + '경기 전체';
      badge.style.color = 'var(--text3)';
    }
  });

  // 추세 상태 메시지
  const trendStatus = document.getElementById('trend-status');
  if (trendStatus && wr5 !== null && wrAll !== null) {
    trendStatus.style.display = 'block';
    if (wr5 >= overallWr + 0.1) {
      trendStatus.style.background = 'rgba(0,230,118,0.12)';
      trendStatus.style.border = '1px solid rgba(0,230,118,0.3)';
      trendStatus.style.color = 'var(--green)';
      trendStatus.innerHTML = '🔥 상승 사이클 — 최근 5경기 승률이 전체 평균보다 크게 높습니다. 현재 판단력이 좋은 상태입니다.';
    } else if (wr5 <= overallWr - 0.1) {
      trendStatus.style.background = 'rgba(255,59,92,0.12)';
      trendStatus.style.border = '1px solid rgba(255,59,92,0.3)';
      trendStatus.style.color = 'var(--red)';
      trendStatus.innerHTML = '❄️ 하락 사이클 — 최근 5경기 승률이 전체 평균보다 크게 낮습니다. 베팅 규모 축소 또는 휴식을 고려하세요.';
    } else {
      trendStatus.style.background = 'rgba(255,215,0,0.08)';
      trendStatus.style.border = '1px solid rgba(255,215,0,0.2)';
      trendStatus.style.color = 'var(--gold)';
      trendStatus.innerHTML = '⚖️ 안정 사이클 — 최근 승률이 전체 평균과 유사합니다. 현재 전략을 유지하세요.';
    }
  } else if (trendStatus) trendStatus.style.display = 'none';

  // 승률 이동평균 차트
  if (document.getElementById('page-predict') && document.getElementById('page-predict').classList.contains('active') && document.getElementById('trendChart')) {
    const maLabels = [], ma5Data = [], ma10Data = [], allLine = [];
    sorted.forEach((_, i) => {
      const slice5  = sorted.slice(Math.max(0, i-4), i+1);
      const slice10 = sorted.slice(Math.max(0, i-9), i+1);
      ma5Data.push(parseFloat((wrOf(slice5)*100).toFixed(1)));
      ma10Data.push(parseFloat((wrOf(slice10)*100).toFixed(1)));
      allLine.push(parseFloat((overallWr*100).toFixed(1)));
      maLabels.push(i+1 + '번');
    });
    if (charts.trend) charts.trend.destroy();
    charts.trend = safeCreateChart('trendChart', {
      type: 'line',
      data: {
        labels: maLabels,
        datasets: [
          { label: '5경기 이동평균', data: ma5Data, borderColor: '#00e676', borderWidth: 2, pointRadius: 0, tension: 0.4, fill: false },
          { label: '10경기 이동평균', data: ma10Data, borderColor: '#00e5ff', borderWidth: 2, pointRadius: 0, tension: 0.4, fill: false },
          { label: '전체 평균', data: allLine, borderColor: 'rgba(255,215,0,0.6)', borderDash: [6,3], borderWidth: 1.5, pointRadius: 0, fill: false },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#8892a4', font: { size: 11 } } },
          tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y + '%' } }
        },
        scales: {
          x: { ticks: { color: '#8892a4', font: { size: 9 }, maxTicksLimit: 15 }, grid: { color: 'rgba(255,255,255,0.03)' } },
          y: { min: 0, max: 100, ticks: { color: '#8892a4', font: { size: 10 }, callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.04)' } }
        }
      }
    });
  }

  // ── ② 손익분기 배당 vs 실제 베팅 배당 ──
  if (resolved.length > 0 && document.getElementById('bep-odds') && document.getElementById('page-predict') && document.getElementById('page-predict').classList.contains('active')) {
    const avgOddsAll = resolved.reduce((s, b) => s + b.betmanOdds, 0) / resolved.length;
    const bepOdds    = overallWr > 0 ? 1 / overallWr : null;
    const evPlusBets = resolved.filter(b => b.betmanOdds >= (bepOdds || 0));
    const evRatio    = (evPlusBets.length / resolved.length * 100).toFixed(1);
    const edge       = bepOdds ? (avgOddsAll - bepOdds) : null;

    document.getElementById('bep-odds').textContent = bepOdds ? bepOdds.toFixed(2) : '—';
    const avgEl = document.getElementById('bep-avg');
    avgEl.textContent = avgOddsAll.toFixed(2);
    avgEl.style.color = bepOdds && avgOddsAll >= bepOdds ? 'var(--green)' : 'var(--red)';
    document.getElementById('bep-avg-label').textContent = bepOdds && avgOddsAll >= bepOdds ? '✅ 손익분기 초과' : '❌ 손익분기 미달';
    document.getElementById('bep-avg-label').style.color = bepOdds && avgOddsAll >= bepOdds ? 'var(--green)' : 'var(--red)';
    const evRatioEl = document.getElementById('bep-ev-ratio');
    evRatioEl.textContent = evRatio + '%';
    evRatioEl.style.color = parseFloat(evRatio) >= 60 ? 'var(--green)' : parseFloat(evRatio) >= 40 ? 'var(--gold)' : 'var(--red)';
    const edgeEl = document.getElementById('bep-edge');
    edgeEl.textContent = edge !== null ? (edge >= 0 ? '+' : '') + edge.toFixed(2) : '—';
    edgeEl.style.color  = edge !== null && edge >= 0 ? 'var(--green)' : 'var(--red)';

    // 배당 분포 히스토그램 — 통계1 탭과 동일한 7구간
    const buckets = [1.0, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1, 999];
    const labels  = ['1~2.0','2.1~3.0','3.1~4.0','4.1~5.0','5.1~6.0','6.1~7.0','7.1+'];
    const counts  = Array(buckets.length-1).fill(0);
    resolved.forEach(b => {
      for (let i = 0; i < buckets.length-1; i++) {
        if (b.betmanOdds < buckets[i+1]) { counts[i]++; break; }
      }
    });
    if (charts.oddsDist) charts.oddsDist.destroy();
    charts.oddsDist = safeCreateChart('oddsDistChart', {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: '베팅 수',
            data: counts,
            backgroundColor: labels.map((_, i) => {
              const midOdds = (buckets[i] + buckets[i+1]) / 2;
              return bepOdds && midOdds >= bepOdds ? 'rgba(0,230,118,0.6)' : 'rgba(255,59,92,0.5)';
            }),
            borderRadius: 4,
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          annotation: bepOdds ? {
            annotations: { bepLine: {
              type: 'line', xMin: bepOdds, xMax: bepOdds,
              borderColor: 'rgba(255,215,0,0.8)', borderWidth: 2, borderDash: [5,3],
              label: { content: '손익분기', enabled: true, color: '#ffd700', font: { size: 10 } }
            }}
          } : {},
          tooltip: { callbacks: { label: ctx => `${ctx.parsed.y}건` } }
        },
        scales: {
          x: { ticks: { color: '#8892a4', font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: '#8892a4', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
        }
      }
    });
  }

  // ── ④ 베팅 금액 최적화 — 엔진 연동 ──
  if (document.getElementById('kelly-actual') && resolved.length > 0) {
    const avgBetAmt  = bets.reduce((s, b) => s + b.amount, 0) / bets.length;
    const avgOddsAll2 = resolved.reduce((s, b) => s + b.betmanOdds, 0) / resolved.length;
    const kellyF     = ((overallWr * (avgOddsAll2 - 1)) - (1 - overallWr)) / (avgOddsAll2 - 1);
    const seed       = appSettings.kellySeed || appSettings.startFund || 0;

    // 엔진 ECE 보정 켈리금액 우선, 없으면 기존 계산
    const kellyAmt = _SS && _SS.kellyUnit > 0 ? _SS.kellyUnit
      : (seed > 0 && kellyF > 0 ? Math.round(seed * kellyF) : null);
    const seedPct  = seed > 0 ? (avgBetAmt / seed * 100).toFixed(1) + '%' : '—';

    // 엔진 보정 적용 여부 표시
    const eceLabel = _SS && _SS.grade && _SS.grade.eceMult < 1
      ? ` <span style="font-size:10px;color:var(--gold);">(ECE 보정 ×${_SS.grade.eceMult.toFixed(2)})</span>` : '';

    document.getElementById('kelly-actual').textContent  = '₩' + Math.round(avgBetAmt).toLocaleString();
    const kellyOptEl = document.getElementById('kelly-optimal');
    if (kellyOptEl) {
      kellyOptEl.innerHTML = kellyAmt
        ? '₩' + kellyAmt.toLocaleString() + eceLabel
        : (kellyF <= 0 ? '베팅 비권장' : '시드 미설정');
    }
    document.getElementById('kelly-pct').textContent = seedPct;

    const statusEl  = document.getElementById('kelly-status-pred');
    const adviceEl  = document.getElementById('kelly-advice');
    if (kellyAmt) {
      const ratio = avgBetAmt / kellyAmt;
      if (ratio > 1.5) {
        statusEl.textContent = '🔴 오버베팅';
        statusEl.style.color = 'var(--red)';
        adviceEl.innerHTML   = `현재 평균 베팅금(₩${Math.round(avgBetAmt).toLocaleString()})이 켈리 기준(₩${kellyAmt.toLocaleString()})의 <strong style="color:var(--red);">${(ratio).toFixed(1)}배</strong>입니다. 장기적으로 파산 위험이 높아집니다. 베팅금을 <strong>₩${kellyAmt.toLocaleString()} 이하</strong>로 줄이는 것을 권장합니다.`;
      } else if (ratio > 1.0) {
        statusEl.textContent = '🟡 약간 과다';
        statusEl.style.color = 'var(--gold)';
        adviceEl.innerHTML   = `켈리 기준보다 <strong style="color:var(--gold);">${((ratio-1)*100).toFixed(0)}% 많이</strong> 베팅하고 있습니다. 큰 위험은 아니지만 장기적으로 켈리 기준에 맞추면 수익 안정성이 높아집니다.`;
      } else if (ratio >= 0.5) {
        statusEl.textContent = '🟢 적정 수준';
        statusEl.style.color = 'var(--green)';
        adviceEl.innerHTML   = `현재 베팅금이 켈리 기준의 <strong style="color:var(--green);">${(ratio*100).toFixed(0)}% 수준</strong>으로 안전한 범위입니다. 현재 전략을 유지하세요.`;
      } else {
        statusEl.textContent = '⚪ 보수적';
        statusEl.style.color = 'var(--text3)';
        adviceEl.innerHTML   = `켈리 기준보다 보수적으로 베팅하고 있습니다. 승률이 안정적이라면 베팅금을 <strong>₩${kellyAmt.toLocaleString()}</strong>까지 늘려볼 수 있습니다.`;
      }
    } else if (kellyF <= 0) {
      statusEl.textContent = '⛔ 베팅 비권장';
      statusEl.style.color = 'var(--red)';
      adviceEl.innerHTML   = '현재 승률과 평균 배당으로는 장기 수익이 불가능한 구조입니다. 베팅을 중단하고 전략을 재검토하세요.';
    } else {
      statusEl.textContent = '—'; adviceEl.innerHTML = '설정 탭에서 시드머니를 입력하면 정밀한 분석이 가능합니다.';
    }
  }

  // ── ⑤ 컨디션 사이클 — 엔진 연동 ──
  if (document.getElementById('condition-cycle') && sorted.length > 0 && document.getElementById('page-predict') && document.getElementById('page-predict').classList.contains('active')) {
    const recent5 = sorted.slice(-5);
    const recent5Profit = _SS ? _SS.rec5net : recent5.filter(b=>b.result!=='PENDING').reduce((s,b)=>s+b.profit,0);

    // 엔진 스트릭 우선 사용
    const engineStreak     = _SS ? _SS.streak : 0;
    const engineStreakType = _SS ? _SS.streakType : '';
    // LOSE 연속만 streak으로 카운트 (기존 로직 대체)
    let streak = engineStreakType === 'LOSE' ? engineStreak : 0;
    // 엔진 없을 때 폴백
    if (!_SS) {
      streak = 0;
      for (let i = sorted.length-1; i >= 0; i--) {
        if (sorted[i].result === 'LOSE') streak++;
        else break;
      }
    }

    const wr5val = wrOf(recent5);
    let cycleText, cycleColor, alertMsg, alertBg;
    if (streak >= 4) {
      cycleText = '🔴 위험 구간'; cycleColor = 'var(--red)';
      alertMsg  = `⚠️ 연속 ${streak}회 미적중. 감정적 베팅 위험 구간입니다. 오늘 베팅을 중단하고 내일 냉정하게 재진입을 권장합니다.`;
      alertBg   = 'rgba(255,59,92,0.15)';
    } else if (wr5val !== null && wr5val <= overallWr - 0.15) {
      cycleText = '🟠 하락 구간'; cycleColor = 'var(--accent2)';
      alertMsg  = `최근 5경기 승률 ${(wr5val*100).toFixed(0)}%로 평균 대비 하락 중입니다. 베팅 규모를 줄이거나 선별을 강화하세요.`;
      alertBg   = 'rgba(255,107,53,0.12)';
    } else if (wr5val !== null && wr5val >= overallWr + 0.15) {
      cycleText = '🟢 상승 구간'; cycleColor = 'var(--green)';
      alertMsg  = `최근 5경기 승률 ${(wr5val*100).toFixed(0)}%로 좋은 흐름입니다. 현재 판단 기준을 유지하세요.`;
      alertBg   = 'rgba(0,230,118,0.10)';
    } else {
      cycleText = '🟡 안정 구간'; cycleColor = 'var(--gold)';
      alertMsg  = null;
    }

    document.getElementById('condition-cycle').textContent = cycleText;
    document.getElementById('condition-cycle').style.color = cycleColor;

    const recentPEl = document.getElementById('condition-recent-profit');
    recentPEl.textContent = (recent5Profit >= 0 ? '+' : '') + '₩' + Math.round(recent5Profit).toLocaleString();
    recentPEl.style.color = recent5Profit >= 0 ? 'var(--green)' : 'var(--red)';

    const streakEl = document.getElementById('condition-streak');
    streakEl.textContent = streak > 0 ? streak + '연속' : '없음';
    streakEl.style.color = streak >= 3 ? 'var(--red)' : streak >= 2 ? 'var(--gold)' : 'var(--green)';

    const alertEl = document.getElementById('condition-alert');
    if (alertMsg) {
      alertEl.style.display = 'block';
      alertEl.style.background = alertBg;
      alertEl.style.border = `1px solid ${cycleColor}`;
      alertEl.style.color = cycleColor;
      alertEl.textContent = alertMsg;
    } else {
      alertEl.style.display = 'none';
    }

    // 이동평균 손익 차트
    const condLabels = [], movAvgData = [], profitBars = [];
    sorted.forEach((b, i) => {
      const slice = sorted.slice(Math.max(0, i-4), i+1);
      const ma    = slice.reduce((s, x) => s + x.profit, 0) / slice.length;
      movAvgData.push(parseFloat(ma.toFixed(0)));
      profitBars.push(b.profit);
      condLabels.push(i+1 + '번');
    });
    if (charts.condition) charts.condition.destroy();
    charts.condition = safeCreateChart('conditionChart', {
      type: 'bar',
      data: {
        labels: condLabels,
        datasets: [
          {
            label: '베팅별 손익',
            data: profitBars,
            backgroundColor: profitBars.map(v => v >= 0 ? 'rgba(0,230,118,0.3)' : 'rgba(255,59,92,0.3)'),
            borderWidth: 0, borderRadius: 2, type: 'bar',
          },
          {
            label: '5경기 이동평균',
            data: movAvgData,
            borderColor: '#ffd700', borderWidth: 2.5,
            pointRadius: 0, tension: 0.4, fill: false, type: 'line',
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#8892a4', font: { size: 11 } } },
          tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ₩' + ctx.parsed.y.toLocaleString() } }
        },
        scales: {
          x: { ticks: { color: '#8892a4', font: { size: 9 }, maxTicksLimit: 20 }, grid: { display: false } },
          y: { ticks: { color: '#8892a4', font: { size: 10 }, callback: v => '₩'+(v/10000).toFixed(0)+'만' }, grid: { color: 'rgba(255,255,255,0.04)' } }
        }
      }
    });
  }
  updatePredPowerPanel();
}

function updatePredPowerPanel() {
  const page = document.getElementById('page-predpower');
  if (!page || !page.classList.contains('active')) return;

  const resolved = bets.filter(b => b.result !== 'PENDING');
  const predBets = resolved.filter(b => b.myProb && b.betmanOdds);
  if (resolved.length < 5) return;

  // ── 엔진 연동: _SS 우선 사용 ──
  const _SS = window._SS;

  // ── 1. 캘리브레이션 계산 ──
  // 예측 구간별로 실제 적중률 집계
  const calibBuckets = [
    {min:0,  max:10,  label:'~10%' },
    {min:10, max:20,  label:'10~20%'},
    {min:20, max:30,  label:'20~30%'},
    {min:30, max:40,  label:'30~40%'},
    {min:40, max:50,  label:'40~50%'},
    {min:50, max:60,  label:'50~60%'},
    {min:60, max:70,  label:'60~70%'},
    {min:70, max:80,  label:'70~80%'},
    {min:80, max:90,  label:'80~90%'},
    {min:90, max:101, label:'90%+' }
  ];
  const calibData = calibBuckets.map(b => {
    const g = predBets.filter(x => x.myProb >= b.min && x.myProb < b.max);
    if (g.length < 2) return null;
    const midProb = g.reduce((s,x)=>s+x.myProb,0)/g.length;
    const actWr   = g.filter(x=>x.result==='WIN').length/g.length*100;
    return { label:b.label, midProb, actWr, count:g.length, diff: actWr - midProb };
  }).filter(Boolean);

  // 캘리브레이션 오차 — 과소추정 절반 페널티
  const calibMAE = calibData.length > 0
    ? calibData.reduce((s,d) => s + (d.diff > 0 ? Math.abs(d.diff)*0.2 : Math.abs(d.diff))*d.count, 0) / calibData.reduce((s,d)=>s+d.count,0)
    : null;
  const calibScore = calibMAE !== null ? Math.max(0, 100 - calibMAE * 3) : null;

  // ── 2. 예측 엣지 점수 ──
  const predEdge = predBets.length > 0
    ? predBets.reduce((s,b)=>s+(b.myProb-100/b.betmanOdds),0)/predBets.length : null;
  const edgeScore = predEdge !== null
    ? Math.min(100, Math.max(0, (predEdge + 5) / 20 * 100)) : null;

  // ── 3. 일관성 점수 (엣지 표준편차가 낮을수록 좋음) ──
  let consScore = null;
  if (predBets.length >= 5) {
    const edges = predBets.map(b => b.myProb - 100/b.betmanOdds);
    const mean = edges.reduce((s,v)=>s+v,0)/edges.length;
    const std  = Math.sqrt(edges.reduce((s,v)=>s+(v-mean)**2,0)/edges.length);
    consScore = Math.max(0, Math.min(100, 100 - std * 3));
  }

  // ── 4. 최근 폼 점수 (최근 10건 엣지) ──
  const recent10 = predBets.slice(-10);
  const recentEdge = recent10.length > 0
    ? recent10.reduce((s,b)=>s+(b.myProb-100/b.betmanOdds),0)/recent10.length : null;
  const formScore = recentEdge !== null
    ? Math.min(100, Math.max(0, (recentEdge + 5) / 20 * 100)) : null;

  // ── 종합 점수 — 엔진 우선 ──
  const _engGrade = _SS ? _SS.grade : null;
  const totalScore = _engGrade ? _engGrade.totalScore : (
    (() => {
      const weights = { edge:0.35, calib:0.30, cons:0.20, form:0.15 };
      const scores  = { edge:edgeScore, calib:calibScore, cons:consScore, form:formScore };
      const validScores = Object.entries(scores).filter(([,v])=>v!==null);
      const totalW = validScores.reduce((s,[k])=>s+weights[k],0);
      return totalW > 0 ? validScores.reduce((s,[k,v])=>s+v*weights[k],0)/totalW : null;
    })()
  );
  // 엔진 세부 점수도 반영
  const _edgeSc  = _engGrade ? _engGrade.edgeSc  : edgeScore;
  const _calibSc = _engGrade ? _engGrade.calibSc  : calibScore;
  const _consSc  = _engGrade ? _engGrade.consSc   : consScore;
  const _formSc  = _engGrade ? _engGrade.formSc   : formScore;
  const _corrEdge = _SS ? _SS.corrEdge : null;
  const _corrFactor = _SS ? _SS.corrFactor : 1.0;

  const gradeInfo = totalScore === null ? {letter:'—',color:'var(--text3)',label:'데이터 부족'}
    : totalScore >= 85 ? {letter:'S',color:'#ffd700',label:'최상 — 탁월한 예측력'}
    : totalScore >= 70 ? {letter:'A',color:'#00e676',label:'우수 — 안정적 엣지 보유'}
    : totalScore >= 55 ? {letter:'B',color:'var(--accent)',label:'양호 — 개선 가능'}
    : totalScore >= 40 ? {letter:'C',color:'#ff9800',label:'주의 — 예측 정밀도 부족'}
    : {letter:'D',color:'var(--red)',label:'경고 — 베팅 규모 축소 권장'};

  // ── 등급 카드 업데이트 ──
  const ringEl = document.getElementById('pred-grade-ring');
  if (ringEl && totalScore !== null) {
    const pct = typeof totalScore === 'number' ? totalScore.toFixed(0) : 0;
    ringEl.style.background = `conic-gradient(${gradeInfo.color} ${pct}%, var(--bg2) ${pct}%)`;
  }
  const gl = document.getElementById('pred-grade-letter');
  if (gl) { gl.textContent = gradeInfo.letter; gl.style.color = gradeInfo.color; }
  const gs = document.getElementById('pred-grade-score');
  if (gs) gs.textContent = totalScore !== null ? Math.round(totalScore)+'점' : '—';
  const glab = document.getElementById('pred-grade-label');
  if (glab) { glab.textContent = gradeInfo.label; glab.style.color = gradeInfo.color; }

  // ── 켈리 배율 표시 (엔진 연동) ──
  const kellyMultEl = document.getElementById('pred-kelly-mult');
  if (kellyMultEl && _engGrade) {
    const mult = _engGrade.mult;
    kellyMultEl.textContent = `켈리 배율 ×${mult.toFixed(2)}`;
    kellyMultEl.style.color = mult < 1 ? 'var(--gold)' : 'var(--green)';
    const eceInfo = _SS && _SS.ece !== null
      ? ` (ECE ${_SS.ece.toFixed(1)}% ×${_engGrade.eceMult.toFixed(2)})`
      : '';
    kellyMultEl.title = `등급 배율 ×${_engGrade.gradeMult}${eceInfo}`;
  }

  // 세부 바 — 엔진 점수 사용
  const setBar = (fillId, valId, lblId, score, val, lbl, color) => {
    const f = document.getElementById(fillId);
    const v = document.getElementById(valId);
    const l = document.getElementById(lblId);
    if (f) { f.style.width = (score||0)+'%'; f.style.background = color; }
    if (v) { v.textContent = val; v.style.color = score!==null?(score>=60?color:'var(--red)'):'var(--text3)'; }
    if (l) l.textContent = lbl;
  };
  // 보정된 엣지 표시 (엔진 있을 때)
  const edgeDisplay = _corrEdge !== null
    ? `보정 ${(_corrEdge>=0?'+':'')+_corrEdge.toFixed(1)}%p (원래 ${predEdge!==null?(predEdge>=0?'+':'')+predEdge.toFixed(1)+'%p':'—'})`
    : (predEdge!==null?(predEdge>=0?'+':'')+predEdge.toFixed(1)+'%p':'—');
  setBar('pg-edge-fill','pg-edge-val','pg-edge-lbl', _edgeSc, edgeDisplay, `${predBets.length}건 기준`, 'var(--green)');
  setBar('pg-cal-fill','pg-cal-val','pg-cal-lbl', _calibSc,
    calibMAE!==null?'오차 '+calibMAE.toFixed(1)+'%p':'—',
    calibData.length+'구간 분석', 'var(--accent)');
  setBar('pg-con-fill','pg-con-val','pg-con-lbl', _consSc,
    _consSc!==null?Math.round(_consSc)+'점':'—',
    '낮을수록 안정', 'var(--gold)');
  setBar('pg-form-fill','pg-form-val','pg-form-lbl', _formSc,
    recentEdge!==null?(recentEdge>=0?'+':'')+recentEdge.toFixed(1)+'%p':'—',
    '최근 10건', 'var(--accent2)');

  // ── 캘리브레이션 차트 ──
  if (calibData.length >= 2) {
    const cLabels = calibData.map(d=>d.label+'('+d.count+')');
    const cMy     = calibData.map(d=>parseFloat(d.midProb.toFixed(1)));
    const cAct    = calibData.map(d=>parseFloat(d.actWr.toFixed(1)));
    // 이상적인 대각선 (내 예측 = 실제)
    const cIdeal  = calibData.map(d=>parseFloat(d.midProb.toFixed(1)));

    if (!window._predCalibChart) window._predCalibChart = null;
    window._predCalibChart = safeCreateChart('pred-calib-chart', {
      type: 'line',
      data: { labels: cLabels, datasets: [
        { label: '내 예측 평균', data: cMy,
          borderColor: '#ffd700', borderWidth: 2, pointRadius: 5,
          pointBackgroundColor: '#ffd700', fill: false, tension: 0.3 },
        { label: '실제 적중률', data: cAct,
          borderColor: '#00e676', borderWidth: 2.5, pointRadius: 6,
          pointBackgroundColor: calibData.map(d => d.actWr >= d.midProb-5 && d.actWr <= d.midProb+5
            ? '#00e676' : d.actWr > d.midProb ? 'rgba(0,229,255,0.8)' : 'rgba(255,59,92,0.8)'),
          fill: false, tension: 0.3 },
        { label: '이상(예측=실제)', data: cIdeal,
          borderColor: 'rgba(255,255,255,0.15)', borderWidth: 1,
          borderDash: [5,4], pointRadius: 0, fill: false, tension: 0 }
      ]},
      options: { responsive:true, maintainAspectRatio:false,
        plugins: { legend: { labels: { color:'#8892a4', font:{size:10} } } },
        scales: {
          x: { ticks:{color:'#8892a4',font:{size:9}}, grid:{color:'rgba(30,45,69,0.5)'} },
          y: { min:0, max:100,
            ticks:{color:'#8892a4',font:{size:10},callback:v=>v+'%'},
            grid:{color:'rgba(30,45,69,0.5)'} }
        }
      }
    });
    // 캘리브레이션 요약
    const overBuckets = calibData.filter(d=>d.diff<-8);
    const underBuckets = calibData.filter(d=>d.diff>8);
    let calibSummary = '';
    if (calibMAE !== null)
      calibSummary += `평균 오차 <strong>${calibMAE.toFixed(1)}%p</strong> — `;
    if (overBuckets.length > 0)
      calibSummary += `<span style="color:var(--red);">${overBuckets.map(d=>d.label).join(', ')} 구간에서 승률 과대 추정</span>. `;
    if (underBuckets.length > 0)
      calibSummary += `<span style="color:var(--accent);">${underBuckets.map(d=>d.label).join(', ')} 구간에서 과소 추정</span>. `;
    if (!calibSummary) calibSummary = '예측이 실제와 비교적 잘 맞습니다.';
    const csum = document.getElementById('pred-calib-summary');
    if (csum) csum.innerHTML = calibSummary;
  }

  // ── 보정도 상세 분석 (논문 2 기반) ──
  (function renderCalibDetail() {
    const BUCKETS = [
      {min:0,  max:10,  label:'~10%',   mid:5  },
      {min:10, max:20,  label:'10~20%', mid:15 },
      {min:20, max:30,  label:'20~30%', mid:25 },
      {min:30, max:40,  label:'30~40%', mid:35 },
      {min:40, max:50,  label:'40~50%', mid:45 },
      {min:50, max:60,  label:'50~60%', mid:55 },
      {min:60, max:70,  label:'60~70%', mid:65 },
      {min:70, max:80,  label:'70~80%', mid:75 },
      {min:80, max:90,  label:'80~90%', mid:85 },
      {min:90, max:101, label:'90%+',   mid:95 }
    ];

    const rows = BUCKETS.map(b => {
      const g = predBets.filter(x => x.myProb >= b.min && x.myProb < b.max);
      if (g.length < 3) return null;
      const avgProb = g.reduce((s,x)=>s+x.myProb,0)/g.length;
      const actWr   = g.filter(x=>x.result==='WIN').length/g.length*100;
      const diff    = actWr - avgProb;
      return { label:b.label, mid:b.mid, count:g.length, avgProb, actWr, diff };
    }).filter(Boolean);

    // ECE 계산 (가중 평균 절대 오차) — 엔진 우선
    const totalBets = rows.reduce((s,r)=>s+r.count,0);
    const ece = (_SS && _SS.ece !== null) ? _SS.ece
      : (rows.length > 0 ? rows.reduce((s,r)=>s+Math.abs(r.diff)*r.count,0)/totalBets : null);

    // ── ECE 배너 ──
    const eceValEl  = document.getElementById('calib-ece-val');
    const eceGradeEl= document.getElementById('calib-ece-grade');
    const eceMsgEl  = document.getElementById('calib-ece-msg');
    const eceSubEl  = document.getElementById('calib-ece-sub');
    const kellyEl   = document.getElementById('calib-kelly-rec');
    const bannerEl  = document.getElementById('calib-ece-banner');

    if (ece === null) {
      if (eceValEl)   eceValEl.textContent   = '—';
      if (eceGradeEl) eceGradeEl.textContent = '데이터 부족';
      if (eceMsgEl)   eceMsgEl.textContent   = '구간당 3건 이상 데이터가 필요합니다';
      if (eceSubEl)   eceSubEl.textContent   = '예측 확률(myProb)이 입력된 베팅이 더 쌓이면 분석됩니다.';
      if (kellyEl)    kellyEl.textContent    = '—';
    } else {
      const eceGrade = ece <= 5  ? {label:'우수', color:'var(--green)',   msg:'보정 상태 우수 — 켈리 기준 정상 적용 가능', kelly:'정상', bg:'rgba(0,230,118,0.08)', border:'rgba(0,230,118,0.25)'}
                     : ece <= 10 ? {label:'양호', color:'var(--gold)',    msg:'보정 양호 — 분수 켈리(1/4) 적용 권장',          kelly:'1/4 켈리', bg:'rgba(255,152,0,0.08)', border:'rgba(255,152,0,0.25)'}
                     : ece <= 15 ? {label:'주의', color:'#ff9800',        msg:'⚠️ 보정 불량 — 켈리 1/8 이하로 축소 권장',       kelly:'1/8 켈리', bg:'rgba(255,152,0,0.1)', border:'rgba(255,152,0,0.3)'}
                     :             {label:'경고', color:'var(--red)',      msg:'🔴 보정 심각 — 켈리 비활성화 권장 (고정 소액만)', kelly:'켈리 ❌', bg:'rgba(255,59,92,0.08)', border:'rgba(255,59,92,0.25)'};

      if (eceValEl)   { eceValEl.textContent = ece.toFixed(1)+'%'; eceValEl.style.color = eceGrade.color; }
      if (eceGradeEl) { eceGradeEl.textContent = eceGrade.label; eceGradeEl.style.color = eceGrade.color; }
      if (eceMsgEl)   { eceMsgEl.textContent = eceGrade.msg; eceMsgEl.style.color = eceGrade.color; }
      if (eceSubEl)   eceSubEl.textContent = `분석 구간 ${rows.length}개 · 총 ${totalBets}건 기준. ECE 5% 이하 = 우수 / 10% 이하 = 양호 / 15% 이상 = 주의`;
      if (kellyEl)    { kellyEl.textContent = eceGrade.kelly; kellyEl.style.color = eceGrade.color; }
      if (bannerEl)   { bannerEl.style.background = eceGrade.bg; bannerEl.style.border = '1px solid '+eceGrade.border; }
    }

    // ── 구간별 테이블 ──
    const tbody = document.getElementById('calib-bucket-table');
    if (tbody) {
      if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:20px;">데이터 부족 (구간당 최소 3건 필요)</td></tr>';
      } else {
        tbody.innerHTML = rows.map(r => {
          const absDiff = Math.abs(r.diff);
          const status  = absDiff <= 5  ? {icon:'✅', color:'var(--green)',  label:'정상'}
                        : absDiff <= 10 ? {icon:'🟡', color:'var(--gold)',   label:'경미한 과신'}
                        : r.diff < 0   ? {icon:'🔴', color:'var(--red)',    label:'과신'}
                        :                {icon:'🔵', color:'var(--accent)',  label:'과소추정'};
          const diffStr = (r.diff >= 0 ? '+' : '') + r.diff.toFixed(1) + '%p';
          return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
            <td style="padding:7px 4px;font-weight:600;">${r.label}</td>
            <td style="padding:7px 4px;text-align:center;color:var(--text3);">${r.count}건</td>
            <td style="padding:7px 4px;text-align:center;">${r.avgProb.toFixed(1)}%</td>
            <td style="padding:7px 4px;text-align:center;">${r.actWr.toFixed(1)}%</td>
            <td style="padding:7px 4px;text-align:center;color:${status.color};font-weight:700;">${diffStr}</td>
            <td style="padding:7px 4px;text-align:center;">${status.icon} <span style="color:${status.color}">${status.label}</span></td>
          </tr>`;
        }).join('');
      }
    }

    // ── 과신 패턴 요약 박스 ──
    const patternBox = document.getElementById('calib-pattern-box');
    if (patternBox && rows.length > 0) {
      const overRows  = rows.filter(r => r.diff < -8);
      const underRows = rows.filter(r => r.diff > 8);
      let patternHtml = '';
      if (overRows.length > 0)
        patternHtml += `<span style="color:var(--red);">🔴 과신 구간: ${overRows.map(r=>r.label).join(', ')} — 실제보다 높게 예측. 이 구간 베팅 시 켈리 규모 축소 권장.</span><br>`;
      if (underRows.length > 0)
        patternHtml += `<span style="color:var(--accent);">🔵 과소 추정 구간: ${underRows.map(r=>r.label).join(', ')} — 실제보다 낮게 예측. EV를 더 공격적으로 잡아도 됨.</span><br>`;
      if (!patternHtml)
        patternHtml = '<span style="color:var(--green);">✅ 전 구간에서 예측이 실제와 잘 맞습니다. 현재 켈리 설정 유지 권장.</span>';
      patternBox.innerHTML = patternHtml;
      patternBox.style.display = 'block';
      patternBox.style.background = overRows.length > 0 ? 'rgba(255,59,92,0.06)' : 'rgba(0,229,255,0.06)';
      patternBox.style.border     = '1px solid '+(overRows.length > 0 ? 'rgba(255,59,92,0.2)' : 'rgba(0,229,255,0.2)');
      patternBox.style.borderRadius = '8px';
      patternBox.style.padding      = '12px';
    }

    // ── 막대+선 혼합 차트 ──
    if (rows.length >= 2) {
      const labels   = rows.map(r => r.label);
      const counts   = rows.map(r => r.count);
      const actWrs   = rows.map(r => parseFloat(r.actWr.toFixed(1)));
      const idealWrs = rows.map(r => parseFloat(r.mid.toFixed(1)));

      window._calibBucketChart = safeCreateChart('calib-bucket-chart', {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              type: 'bar',
              label: '베팅 건수',
              data: counts,
              backgroundColor: 'rgba(255,180,0,0.35)',
              borderColor: 'rgba(255,180,0,0.8)',
              borderWidth: 1.5,
              borderRadius: 4,
              yAxisID: 'yCount',
              order: 2
            },
            {
              type: 'line',
              label: '실제 적중률',
              data: actWrs,
              borderColor: '#00e5ff',
              backgroundColor: 'rgba(0,229,255,0.15)',
              borderWidth: 2.5,
              pointRadius: 6,
              pointBackgroundColor: rows.map(r => Math.abs(r.diff) <= 5 ? '#00e676' : Math.abs(r.diff) <= 10 ? '#ff9800' : '#ff3b5c'),
              pointBorderColor: '#fff',
              pointBorderWidth: 1.5,
              fill: false,
              tension: 0.3,
              yAxisID: 'yPct',
              order: 1
            },
            {
              type: 'line',
              label: '이상적 보정선',
              data: idealWrs,
              borderColor: 'rgba(255,255,255,0.2)',
              borderDash: [6, 4],
              borderWidth: 1.5,
              pointRadius: 0,
              fill: false,
              tension: 0,
              yAxisID: 'yPct',
              order: 3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color:'#8892a4', font:{size:10}, boxWidth:12 } },
            tooltip: {
              callbacks: {
                label: ctx => {
                  if (ctx.dataset.label === '베팅 수') return ' 베팅 수: ' + ctx.raw + '건';
                  if (ctx.dataset.label === '실제 적중률') {
                    const r = rows[ctx.dataIndex];
                    return ` 실제 ${ctx.raw}% (예측 ${r.avgProb.toFixed(1)}%, 괴리 ${r.diff>=0?'+':''}${r.diff.toFixed(1)}%p)`;
                  }
                  return ' 이상 보정선: ' + ctx.raw + '%';
                }
              }
            }
          },
          scales: {
            yCount: {
              type: 'linear', position: 'left',
              ticks: { color:'#8892a4', font:{size:9}, stepSize:1 },
              grid: { color:'rgba(30,45,69,0.4)' },
              title: { display:true, text:'건수', color:'#8892a4', font:{size:9} }
            },
            yPct: {
              type: 'linear', position: 'right',
              min: 0, max: 100,
              ticks: { color:'#8892a4', font:{size:9}, callback: v => v+'%' },
              grid: { drawOnChartArea: false },
              title: { display:true, text:'적중률', color:'#8892a4', font:{size:9} }
            },
            x: { ticks:{color:'#8892a4', font:{size:10}}, grid:{color:'rgba(30,45,69,0.4)'} }
          }
        }
      });
    }
  })();

  // ── 수익 분해 차트 (실력 vs 운) ──
  // 기댓값이 있는 베팅만 사용, 누적 수익 vs 누적 EV
  const evBets = resolved.filter(b => {
    return b.ev != null || (b.myProb && b.betmanOdds);
  }).slice(-30); // 최근 30건
  if (evBets.length >= 3) {
    let cumProfit = 0, cumEv = 0;
    const cumProfitArr = [], cumEvArr = [], cumEvUpArr = [], cumEvDownArr = [], luckArr = [];
    const lkLabels = [];
    evBets.forEach((b, i) => {
      const ev = b.ev != null ? b.ev : (b.myProb/100*(b.betmanOdds-1))-(1-b.myProb/100);
      const evAmt = (b.amount||0) * ev;
      const profit = b.profit || 0;
      cumProfit += profit;
      cumEv     += evAmt;
      // 분산 구간 ±1σ: EV × sqrt(n) 수준 추정
      const sigma = Math.abs(evAmt) * 1.5;
      cumProfitArr.push(Math.round(cumProfit));
      cumEvArr.push(Math.round(cumEv));
      cumEvUpArr.push(Math.round(cumEv + sigma * Math.sqrt(i+1)));
      cumEvDownArr.push(Math.round(cumEv - sigma * Math.sqrt(i+1)));
      lkLabels.push(i+1);
    });
    const finalLuck = cumProfit - cumEv;
    const luckLabel = finalLuck > 50000 ? '운이 따름 (+₩'+Math.round(finalLuck).toLocaleString()+')'
      : finalLuck < -50000 ? '운이 나쁨 (−₩'+Math.round(Math.abs(finalLuck)).toLocaleString()+')'
      : '분산 범위 내 (±₩'+Math.round(Math.abs(finalLuck)).toLocaleString()+')';

    safeCreateChart('pred-luck-chart', {
      type: 'line',
      data: { labels: lkLabels, datasets: [
        { label: '누적 실제 수익', data: cumProfitArr,
          borderColor: '#00e676', borderWidth: 2.5, pointRadius: 2, fill: false, tension: 0.4 },
        { label: '누적 기댓값(실력)', data: cumEvArr,
          borderColor: '#64b5f6', borderWidth: 2, borderDash: [5,3],
          pointRadius: 0, fill: false, tension: 0.4 },
        { label: '기댓값 상단 (운 구간)', data: cumEvUpArr,
          borderColor: 'rgba(100,181,246,0.25)', borderWidth: 1,
          pointRadius: 0, fill: '+1', backgroundColor: 'rgba(100,181,246,0.07)', tension: 0.4 },
        { label: '기댓값 하단', data: cumEvDownArr,
          borderColor: 'rgba(100,181,246,0.25)', borderWidth: 1,
          pointRadius: 0, fill: false, tension: 0.4 }
      ]},
      options: { responsive:true, maintainAspectRatio:false,
        plugins: { legend: { labels: { color:'#8892a4', font:{size:10},
          filter: item => item.text !== '기댓값 하단' && item.text !== '기댓값 상단 (운 구간)' } } },
        scales: {
          x: { ticks:{color:'#8892a4',font:{size:10}}, grid:{color:'rgba(30,45,69,0.5)'} },
          y: { ticks:{color:'#8892a4',font:{size:10},callback:v=>(v>=0?'+':'')+'₩'+(v/10000).toFixed(0)+'만'}, grid:{color:'rgba(30,45,69,0.5)'} }
        }
      }
    });

    const luckEl = document.getElementById('pred-luck-summary');
    if (luckEl) {
      const pctLuck = cumEv !== 0 ? (finalLuck/Math.abs(cumEv)*100).toFixed(0) : null;
      luckEl.innerHTML = `최근 ${evBets.length}건 기준 — <strong>${luckLabel}</strong>${pctLuck!==null?' (기댓값 대비 '+(finalLuck>=0?'+':'')+pctLuck+'%)':''}.
        ${Math.abs(finalLuck) < 30000 ? ' 실력과 결과가 잘 수렴 중입니다.' : finalLuck > 0 ? ' 현재 수익이 기댓값을 초과 중 — 평균 회귀를 대비하세요.' : ' 현재 수익이 기댓값에 못 미침 — 운이 따라주지 않는 구간입니다.'}`;
    }
  }

  // ── 다음 베팅 권장 규모 ──
  const bankroll = getCurrentBankroll() || appSettings.startFund || 0;
  const baseKellyPct = predEdge !== null && predEdge > 0
    ? Math.min(5, predEdge / 2) : 1; // 엣지 기반 기본 비율 (하프 켈리 근사)
  let adjPct = baseKellyPct;
  const reasons = [];
  const signals = [];

  // 등급별 조정
  if (totalScore !== null) {
    if (totalScore >= 70) { adjPct *= 1.0; }
    else if (totalScore >= 55) { adjPct *= 0.8; reasons.push('예측력 B등급'); }
    else if (totalScore >= 40) { adjPct *= 0.6; reasons.push('예측력 C등급'); signals.push('⚠️ 규모 축소'); }
    else { adjPct *= 0.4; reasons.push('예측력 D등급'); signals.push('🔴 최소 베팅'); }
  }

  // 캘리브레이션 오차가 크면 축소
  if (calibMAE !== null && calibMAE > 15) {
    adjPct *= 0.7; reasons.push('캘리브레이션 불안정');
  }

  // 최근 폼 조정
  if (recentEdge !== null) {
    if (recentEdge > 10) { adjPct *= 1.1; reasons.push('최근 폼 ↑'); signals.push('🔥 폼 좋음'); }
    else if (recentEdge < 0) { adjPct *= 0.75; reasons.push('최근 폼 ↓'); signals.push('📉 최근 저하'); }
  }

  // 슬럼프 감지 (최근 5건 3패 이상)
  const last5 = resolved.slice(-5);
  const last5Loses = last5.filter(b=>b.result==='LOSE').length;
  if (last5Loses >= 3) { adjPct *= 0.7; signals.push('❄️ 슬럼프 구간'); }

  const _maxPct = appSettings.maxBetPct || 5;
  adjPct = Math.max(0.5, Math.min(_maxPct, adjPct));
  const recAmount = bankroll > 0 ? Math.round(bankroll * adjPct / 100 / 1000) * 1000 : null;

  const rb = document.getElementById('rec-bankroll');
  const ra = document.getElementById('rec-amount');
  const rap = document.getElementById('rec-amount-pct');
  const rr = document.getElementById('rec-reason');
  const rs = document.getElementById('rec-signal');
  const rv = document.getElementById('rec-advice');

  if (rb) rb.textContent = bankroll > 0 ? '₩'+bankroll.toLocaleString() : '—';
  if (ra) {
    ra.textContent = recAmount ? '₩'+recAmount.toLocaleString() : '—';
    ra.style.color = adjPct >= 3 ? 'var(--green)' : adjPct >= 1.5 ? 'var(--gold)' : 'var(--red)';
  }
  if (rap) rap.textContent = adjPct.toFixed(1)+'% (뱅크롤 기준)';
  if (rr) { rr.innerHTML = reasons.length ? reasons.join('<br>') : '특이사항 없음'; rr.style.color = reasons.length ? 'var(--gold)' : 'var(--green)'; }
  if (rs) { rs.innerHTML = signals.length ? signals.join('<br>') : '✅ 정상'; rs.style.color = signals.some(s=>s.includes('🔴')||s.includes('❄️')) ? 'var(--red)' : signals.some(s=>s.includes('⚠️')||s.includes('📉')) ? 'var(--gold)' : 'var(--green)'; }

  if (rv) {
    let advice = '';
    if (totalScore === null || predBets.length < 10)
      advice = '예측 승률 입력 베팅 10건 이상부터 권장 규모가 정확해집니다.';
    else if (gradeInfo.letter === 'S' || gradeInfo.letter === 'A')
      advice = `<strong>${gradeInfo.letter}등급</strong> — 현재 예측력이 안정적입니다. 단건 ${adjPct.toFixed(1)}% 유지하되, 엣지가 명확한 경기에서는 최대 ${Math.min(5,adjPct*1.3).toFixed(1)}%까지 허용합니다.`;
    else if (gradeInfo.letter === 'B')
      advice = `<strong>B등급</strong> — 기본적인 엣지는 있으나 일관성이 부족합니다. ${adjPct.toFixed(1)}% 유지하며 캘리브레이션 오차(${calibMAE!==null?calibMAE.toFixed(1)+'%p':'—'}) 개선에 집중하세요.`;
    else
      advice = `<strong>${gradeInfo.letter}등급</strong> — 현재 예측력이 불안정합니다. 베팅 규모를 ${adjPct.toFixed(1)}%로 제한하고 30건 이상 쌓인 후 재평가하세요.`;
    rv.innerHTML = advice;
  }
}


function calcGoal() {
  updateGoalStats();

  const start      = getCurrentBankroll() || appSettings.startFund || 0;
  const goalTarget = appSettings.targetFund || parseFloat(document.getElementById('goal-target').value) || 0;
  const target     = goalTarget > start ? goalTarget - start : goalTarget;
  const nextOdds   = parseFloat(document.getElementById('goal-next-odds').value)  || 0;
  const nextProb   = parseFloat(document.getElementById('goal-next-prob').value)  || 0;
  const nextAmount = parseFloat(document.getElementById('goal-next-amount').value)|| 0;

  // 현재 보유금액 기반 미리보기
  const previewBar = document.getElementById('goal-preview-bar');
  if (start > 0 && goalTarget > 0) {
    if (previewBar) previewBar.style.display = 'block';
    const _ps = document.getElementById('goal-preview-success'); if (_ps) _ps.textContent = '₩' + goalTarget.toLocaleString();
    const _pf = document.getElementById('goal-preview-fail');    if (_pf) _pf.textContent = '₩0 (전액 소멸)';
    const diff = goalTarget - start;
    const _pd = document.getElementById('goal-preview-diff'); if (_pd) _pd.textContent = '₩' + Math.abs(diff).toLocaleString() + (diff >= 0 ? ' 수익' : ' 손실');
    const _pp = document.getElementById('goal-preview-pct');  if (_pp) _pp.textContent = ((diff / start) * 100).toFixed(1) + '%';
  } else {
    if (previewBar) previewBar.style.display = 'none';
  }

  // 베팅 기록에서 자동 계산 — 엔진 우선
  const _SScg = window._SS;
  const resolved = bets.filter(b => b.result !== 'PENDING');
  const wins     = resolved.filter(b => b.result === 'WIN');
  const winRate  = _SScg ? _SScg.winRate : (resolved.length > 0 ? wins.length / resolved.length : 0.50);
  const avgOdds  = _SScg ? _SScg.avgOdds : (resolved.length > 0 ? resolved.reduce((s, b) => s + b.betmanOdds, 0) / resolved.length : (nextOdds || 1.90));
  const avgAmt   = _SScg ? _SScg.avgAmt  : (resolved.length > 0 ? resolved.reduce((s, b) => s + b.amount, 0) / resolved.length : (nextAmount || 100000));

  const now  = new Date();
  const ago4 = new Date(now - 28 * 24 * 3600 * 1000);
  const recent4w   = bets.filter(b => b.date && new Date(b.date) >= ago4);
  const weeklyBets = recent4w.length > 0 ? recent4w.length / 4 : 5;

  // 다음 베팅 EV — 내 예상 승률 입력 시 우선 사용, 없으면 기록 평균 승률
  const useProb   = nextProb > 0 ? nextProb / 100 : winRate;
  const nextEV    = nextAmount > 0 && nextOdds > 1 ? (useProb * (nextOdds - 1) * nextAmount) - ((1 - useProb) * nextAmount) : null;
  const nextEVavg = nextAmount > 0 && nextOdds > 1 && nextProb > 0 ? (winRate * (nextOdds - 1) * nextAmount) - ((1 - winRate) * nextAmount) : null;
  const nextWin   = nextAmount > 0 ? nextAmount * (nextOdds - 1) : null;

  // EV per bet (기록 기반)
  const evPerBet    = (winRate * (avgOdds - 1)) - (1 - winRate);
  const evPerWon    = evPerBet * avgAmt;
  const weeklyEV    = evPerWon * weeklyBets;
  const weeksNeeded = weeklyEV > 0 ? Math.ceil(target / weeklyEV) : null;

  // ── 시드 고정 난수 ──
  function seededRandGoal(seed) {
    var s = ((seed || 1) * 7919) >>> 0;
    return function() {
      s = ((s * 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // ── 부트스트랩 몬테카를로 1,000회 (현재 뱅크롤에서 출발) ──
  const RUNS  = 1000;
  const STEPS = resolved.length >= 5 ? resolved.length : 30;
  const seed0 = (resolved.length * 7919) >>> 0;
  const rand  = seededRandGoal(seed0);

  var profitPool = resolved.length >= 5
    ? resolved.map(function(b){ return b.profit; })
    : null;

  var allPaths = [];
  var reached = 0;
  var goalReachSteps = [];

  for (var r = 0; r < RUNS; r++) {
    var bal = 0;
    var path = [0];
    var goalReached = false;
    for (var i = 0; i < STEPS; i++) {
      var profit;
      if (profitPool) {
        var idx = Math.floor(rand() * profitPool.length);
        profit = profitPool[idx];
      } else {
        profit = rand() < winRate ? avgAmt * (avgOdds - 1) : -avgAmt;
      }
      bal += profit;
      path.push(Math.round(bal));
      if (!goalReached && goalTarget > 0 && start + bal >= goalTarget) {
        goalReached = true;
        reached++;
        goalReachSteps.push(i + 1);
      }
      if (start + bal <= 0) break;
    }
    while (path.length <= STEPS) path.push(path[path.length - 1]);
    allPaths.push(path);
  }

  // ── 분위수 추출 ──
  function pctGoal(arr, p) {
    var sorted = arr.slice().sort(function(a,b){return a-b;});
    return sorted[Math.min(Math.floor(sorted.length * p / 100), sorted.length - 1)];
  }

  var gp10 = [], gp25 = [], gp50 = [], gp90 = [];
  for (var step = 0; step <= STEPS; step++) {
    var vals = allPaths.map(function(p){return p[step];});
    gp10.push(pctGoal(vals, 10));
    gp25.push(pctGoal(vals, 25));
    gp50.push(pctGoal(vals, 50));
    gp90.push(pctGoal(vals, 90));
  }

  const goalProb = (reached / RUNS * 100).toFixed(0);
  // 엔진 보정된 달성 확률 (ECE 반영)
  const _engProb = (_SScg && _SScg.goalSim) ? _SScg.goalSim.prob.toFixed(0) : null;
  const _engWeeks = (_SScg && _SScg.goalSim && _SScg.goalSim.weeksEst) ? _SScg.goalSim.weeksEst : null;
  const _eceNote = (_SScg && _SScg.ece !== null && _SScg.corrFactor < 0.99)
    ? `<span style="font-size:10px;color:var(--gold);margin-left:8px;">ECE 보정 ${_SScg.ece.toFixed(1)}% 적용</span>` : '';
  const displayProb = _engProb || goalProb;
  const currentProfit = resolved.reduce((s, b) => s + b.profit, 0);
  const progressPct = target > 0 ? Math.min(100, Math.max(0, currentProfit / target * 100)).toFixed(1) : 0;

  // ── 분석 결과 ──
  const grEl = document.getElementById('goal-result');
  if (grEl) grEl.innerHTML = `
    <div style="margin-bottom:14px;">
      <div style="font-size:10px;color:var(--text3);margin-bottom:4px;">목표 달성 확률 (600회 베팅 내) ${_eceNote}</div>
      <div class="stat-val ${displayProb >= 60 ? 'green' : displayProb >= 35 ? 'gold' : 'red'}" style="font-size:36px;">${displayProb}%</div>
    </div>
    <div style="background:var(--bg3);border-radius:6px;height:8px;overflow:hidden;margin-bottom:4px;">
      <div style="width:${progressPct}%;height:100%;background:var(--green);border-radius:6px;transition:width 0.5s;"></div>
    </div>
    <div style="font-size:10px;color:var(--text3);margin-bottom:14px;">현재 진행도 ${progressPct}% (₩${Math.round(currentProfit).toLocaleString()} / ₩${target.toLocaleString()})</div>

    ${nextAmount > 0 && nextOdds > 1 ? `
    <div style="background:rgba(0,229,255,0.07);border:1px solid rgba(0,229,255,0.2);border-radius:6px;padding:12px;margin-bottom:12px;">
      <div style="font-size:10px;color:var(--text3);margin-bottom:8px;">다음 베팅 예상</div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px;">
        <span>배당 ${nextOdds.toFixed(2)} × ₩${nextAmount.toLocaleString()}</span>
        <span style="color:${nextEV >= 0 ? 'var(--green)' : 'var(--red)'};">EV ${nextEV >= 0 ? '+' : ''}₩${Math.round(nextEV).toLocaleString()}</span>
      </div>
      ${nextProb > 0 ? `
      <div style="font-size:11px;color:var(--text3);margin-bottom:4px;">
        내 예상 승률 <span style="color:var(--accent);font-weight:700;">${nextProb}%</span> 기준
        ${nextEVavg !== null ? `<span style="color:var(--text3);margin-left:8px;">(기록 평균 ${(winRate*100).toFixed(1)}% 기준: ${nextEVavg >= 0 ? '+' : ''}₩${Math.round(nextEVavg).toLocaleString()})</span>` : ''}
      </div>` : `<div style="font-size:10px;color:var(--text3);margin-bottom:4px;">기록 평균 승률 ${(winRate*100).toFixed(1)}% 기준 — 내 예상 승률 입력 시 더 정확해요</div>`}
      <div style="display:flex;gap:8px;font-size:11px;">
        <span style="color:var(--green);">✅ 적중 시 +₩${Math.round(nextWin).toLocaleString()}</span>
        <span style="color:var(--red);">❌ 미적중 시 -₩${nextAmount.toLocaleString()}</span>
      </div>
    </div>` : ''}

    <div style="font-size:12px;line-height:2;">
      <div style="display:flex;justify-content:space-between;">
        <span style="color:var(--text3);">예상 달성 기간</span>
        <span class="mono" style="color:var(--accent);">${_engWeeks ? _engWeeks + '주 (보정)' : weeksNeeded ? weeksNeeded + '주' : '∞'}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:var(--text3);">베팅당 기대수익</span>
        <span class="mono" style="color:${evPerWon >= 0 ? 'var(--green)' : 'var(--red)'};">${evPerWon >= 0 ? '+' : ''}₩${Math.round(evPerWon).toLocaleString()}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:var(--text3);">주간 기대수익</span>
        <span class="mono" style="color:${weeklyEV >= 0 ? 'var(--green)' : 'var(--red)'};">${weeklyEV >= 0 ? '+' : ''}₩${Math.round(weeklyEV).toLocaleString()}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:var(--text3);">현재 승률 (기록 기반)</span>
        <span class="mono">${(winRate * 100).toFixed(1)}%</span>
      </div>
    </div>
  `;

  // 시나리오 그래프 업데이트
  updateGoalChart(gp10, gp25, gp50, gp90, goalTarget, start, STEPS);

  // 방향성 + 리스크
  updateGoalDirection(goalProb, winRate, evPerBet, weeksNeeded, avgOdds);
  updateGoalRisk(winRate, avgOdds, avgAmt, start, goalTarget);
}

// ---- goal helpers ----

function updateGoalChart(gp10, gp25, gp50, gp90, goalTarget, start, STEPS) {
  const goalPageEl = document.getElementById('page-goal');
  if (!goalPageEl || !goalPageEl.classList.contains('active')) return;
  const chartWrap = document.getElementById('goal-chart-wrap');
  if (chartWrap) chartWrap.style.display = 'block';
  if (charts.goal) { charts.goal.destroy(); charts.goal = null; }

  // 실제 기록 (뱅크롤 기준)
  const sortedBets = [...bets].filter(b => b.result !== 'PENDING')
    .sort((a, b) => (a.date||'').localeCompare(b.date||''));
  const historyLabels = ['시작'];
  const historyData   = [start];
  let running = start;
  sortedBets.forEach((b, i) => {
    running += b.profit;
    historyLabels.push(`${i+1}번`);
    historyData.push(Math.round(running));
  });

  const histLen  = historyData.length;
  const totalLen = histLen + STEPS;
  const allLabels = [...historyLabels, ...Array.from({length:STEPS},(_,i)=>`+${i+1}번`)];

  // 시뮬 선들: 실제 기록 끝점에서 연결
  const currentBal = historyData[histLen - 1];
  const makeSim = (path) => [
    ...Array(histLen - 1).fill(null),
    currentBal,
    ...path.slice(1).map(v => Math.round(currentBal + v))
  ];

  charts.goal = safeCreateChart('goalChart', {
    type: 'line',
    data: {
      labels: allLabels,
      datasets: [
        // 범위선 (10~90%)
        {
          label: '불확실 구간 (상단)',
          data: [...Array(histLen-1).fill(null), currentBal, ...gp90.slice(1).map(v=>Math.round(currentBal+v))],
          borderColor: 'rgba(0,229,255,0.2)',
          borderWidth: 1, pointRadius: 0, tension: 0.4, order: 6
        },
        {
          label: '불확실 구간 (하단)',
          data: [...Array(histLen-1).fill(null), currentBal, ...gp10.slice(1).map(v=>Math.round(currentBal+v))],
          borderColor: 'rgba(0,229,255,0.2)',
          borderWidth: 1, pointRadius: 0, tension: 0.4, order: 7
        },
        // 비관 25%
        { label:'비관 (하위 25%)', data:makeSim(gp25), borderColor:'#ff9800', borderWidth:1.5, pointRadius:0, tension:0.4, fill:false, order:4 },
        // 최악 10%
        { label:'최악 (하위 10%)', data:makeSim(gp10), borderColor:'#ff3b5c', borderWidth:1.5, pointRadius:0, tension:0.4, borderDash:[4,3], fill:false, order:5 },
        // 중앙값
        { label:'중앙값 (50%)', data:makeSim(gp50), borderColor:'#c8d6e8', borderWidth:2.5, pointRadius:0, tension:0.4, fill:false, order:3 },
        // 실제 기록
        { label:'실제 기록', data:[...historyData,...Array(STEPS).fill(null)], borderColor:'#ffffff', borderWidth:3, pointRadius:2, pointBackgroundColor:'#fff', tension:0.2, fill:false, spanGaps:false, order:1 },
        // 현재 시점 마커
        { label:'현재 시점', data:Array(totalLen).fill(null).map((_,i)=>i===histLen-1?currentBal:null),
          borderColor:'rgba(255,215,0,0.5)', pointRadius:Array(totalLen).fill(0).map((_,i)=>i===histLen-1?7:0),
          pointBackgroundColor:'#ffd700', borderWidth:0, fill:false, showLine:false, order:2 },
        // 목표선
        ...(goalTarget > 0 ? [{
          label:'목표 자금', data:Array(totalLen).fill(goalTarget),
          borderColor:'rgba(255,215,0,0.8)', borderDash:[8,4], pointRadius:0, borderWidth:1.5, fill:false, order:8
        }] : [])
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color:'#c8d6e8', font:{size:11}, usePointStyle:true, padding:14,
          filter: (item) => !['불확실 구간 (상단)','불확실 구간 (하단)','현재 시점'].includes(item.text)
        }},
        tooltip: { backgroundColor:'rgba(10,20,40,0.95)', titleColor:'#c8d6e8', bodyColor:'#8892a4',
          callbacks: { label: ctx => ctx.parsed.y != null ? `${ctx.dataset.label}: ₩${ctx.parsed.y.toLocaleString()}` : null }
        }
      },
      scales: {
        x: { ticks:{color:'#4a5568',font:{size:10},maxTicksLimit:12}, grid:{color:'rgba(255,255,255,0.04)'} },
        y: { min: 0, ticks:{color:'#8892a4',font:{size:10},callback:v=>`₩${(v/10000).toFixed(0)}만`}, grid:{color:'rgba(255,255,255,0.04)'} }
      }
    }
  });
}

function updateGoalDirection(goalProb, winRate, evPerBet, weeksNeeded, avgOdds) {
  const el = document.getElementById('goal-direction'); if (!el) return;
  const prob = parseFloat(goalProb) || 0;
  const odds = parseFloat(avgOdds)  || 1.90;
  const wr   = parseFloat(winRate)  || 0;
  const minWinRate = odds > 1 ? 1 / odds : 0.5;
  const neededExtra = Math.max(0, minWinRate - wr);
  const bestOddsRange = odds >= 2.0 ? '역배/마핸' : odds >= 1.7 ? '정배/역배' : '배당 올리기 필요';
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div style="padding:10px;background:var(--bg3);border-radius:6px;border-left:3px solid ${prob>=50?'var(--green)':'var(--red)'};">
        <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px;">① 현재 추세 달성 가능성</div>
        <div style="font-size:12px;color:var(--text2);">
          ${prob>=60 ? `현재 승률 ${(wr*100).toFixed(1)}% 유지 시 <span style="color:var(--green);">달성 가능성 높음</span>. ${weeksNeeded?weeksNeeded+'주 내':''} 목표 달성 예상.`
          : prob>=35 ? `현재 승률로는 <span style="color:var(--gold);">달성 불확실</span>. 승률 개선 필요.`
          : `현재 승률 <span style="color:var(--red);">목표 달성 어려움</span>. 전략 변경 필요.`}
        </div>
      </div>
      <div style="padding:10px;background:var(--bg3);border-radius:6px;border-left:3px solid var(--gold);">
        <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px;">② 목표 달성 최소 승률</div>
        <div style="font-size:12px;color:var(--text2);">
          평균 배당 ${odds.toFixed(2)} 기준 손익분기 승률 <span style="color:var(--gold);">${(minWinRate*100).toFixed(1)}%</span>.
          ${wr>=minWinRate
            ? `현재 승률이 <span style="color:var(--green);">${((wr-minWinRate)*100).toFixed(1)}%p 초과</span> → 장기 수익 구조.`
            : `현재 승률이 <span style="color:var(--red);">${(neededExtra*100).toFixed(1)}%p 부족</span> → 손익분기 미달.`}
        </div>
      </div>
      <div style="padding:10px;background:var(--bg3);border-radius:6px;border-left:3px solid var(--accent);">
        <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px;">③ 유리한 배당대 추천</div>
        <div style="font-size:12px;color:var(--text2);">
          현재 평균 배당 ${odds.toFixed(2)} → <span style="color:var(--accent);">${bestOddsRange}</span> 집중 권장.
        </div>
      </div>
    </div>`;
}

function updateGoalRisk(winRate, avgOdds, avgAmt, start, goalTarget) {
  const el = document.getElementById('goal-risk'); if (!el) return;
  const wr   = parseFloat(winRate)  || 0;
  const odds = parseFloat(avgOdds)  || 1.90;
  const amt  = parseFloat(avgAmt)   || 0;
  const kellyFrac = odds > 1 ? ((wr*(odds-1))-(1-wr)) / (odds-1) : -1;
  const riskLevel = kellyFrac<=0?'매우 높음':kellyFrac<0.05?'높음':kellyFrac<0.15?'보통':'낮음';
  const riskColor = kellyFrac<=0?'var(--red)':kellyFrac<0.05?'var(--red)':kellyFrac<0.15?'var(--gold)':'var(--green)';
  const safeAmt   = kellyFrac>0 ? Math.round((start||0)*kellyFrac) : 0;
  const volatility= amt * Math.sqrt(wr*(1-wr));
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--bg3);border-radius:6px;">
        <span style="font-size:11px;color:var(--text3);">리스크 수준</span>
        <span class="mono" style="font-size:16px;font-weight:700;color:${riskColor};">${riskLevel}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--bg3);border-radius:6px;">
        <span style="font-size:11px;color:var(--text3);">켈리 기준 적정 베팅</span>
        <span class="mono" style="font-size:14px;font-weight:700;color:var(--gold);">${safeAmt>0?'₩'+safeAmt.toLocaleString():'베팅 비권장'}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--bg3);border-radius:6px;">
        <span style="font-size:11px;color:var(--text3);">베팅당 변동성</span>
        <span class="mono" style="font-size:14px;font-weight:700;color:var(--accent);">±₩${Math.round(volatility).toLocaleString()}</span>
      </div>
      <div style="padding:10px;background:var(--bg3);border-radius:6px;border-left:3px solid ${riskColor};">
        <div style="font-size:11px;color:var(--text2);line-height:1.8;">
          ${kellyFrac<=0 ? '⚠️ 현재 승률로는 장기 수익이 불가능합니다. EV+ 베팅에 집중하세요.'
            : kellyFrac<0.05 ? '⚠️ 리스크 높음. 베팅금을 줄이고 밸류베팅 비율을 높이세요.'
            : kellyFrac<0.15 ? '✅ 적정 수준. 현재 전략을 유지하며 EV+ 선별에 집중하세요.'
            : '✅ 안정적. 우수한 승률입니다. 베팅 규모를 점진적으로 늘릴 수 있습니다.'}
        </div>
      </div>
    </div>`;
}


