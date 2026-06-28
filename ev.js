// ============================================================
// compute/ev.js
// 담당: EV 관련 순수 계산 함수
//
// 의존 (전역 — 건드리지 않음):
//   getCalibrated, toProb, getCLVAdjustedProb
//   getAdjustedProbLive, calcRecommendedBetSize
//   renderDecisionBlock, clearDecisionBlock (ui/ev_panel.js 예정)
//   setEvDirect, charts, safeCreateChart (전역)
//   appSettings, window._SS (전역 상태)
// ============================================================

function getKellyMultiplier() {
  const base = (getSettings().kellySeed || 0) / 12;
  const kellyUnit = window.App._SS?.kellyUnit || 0;
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
// params: { isMulti, ev, kelly, rawP, safeP, verdict, folderCount, sizing }

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


function getActiveCorrFactor() {
  return (window.App._SS && window.App._SS.activeCorrFactor != null)
    ? window.App._SS.activeCorrFactor : 1.0;
}

// corrFactor 활성 상태 설명 텍스트 반환

function betmanRound(odds) {
  // 소수점 둘째 자리 확인 (부동소수점 오차 방지: 반올림 후 체크)
  const str = odds.toFixed(2);           // e.g. "1.89"
  const dec2 = parseInt(str.slice(-1));  // 둘째 자리 숫자
  if (dec2 === 0) return parseFloat(str.slice(0, -1)); // 소수 둘째 = 0 → 그대로 (1.90 → 1.9)
  return Math.ceil(odds * 10) / 10;      // 둘째 자리 있으면 올림
}


function getCombinedCalibratedProb(rows) {
  let logAdj = 0;
  let count  = 0;
  rows.forEach(row => {
    const prob = parseFloat(row.querySelector('.folder-prob')?.value) || 0;
    if (prob > 0) {
      const baseProb   = prob / 100;
      // getCalibrated는 버킷 count < 5이면 actWr 미사용, 거리 > 15%p이면 원본 반환 (state.js 참조)
      const calibrated = (typeof getCalibrated === 'function') ? getCalibrated(baseProb, window.App._SS?.calibBuckets) : baseProb;
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
      const _base       = (getSettings().kellySeed || 0) / 12;
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
        : (window.App._SS?.verdict || 'WAIT');

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
        // EV가 양수/음수인 것은 참고 정보일 뿐 — 사용자가 직접 선택한
        // EV+/일반 분류를 시스템이 자동으로 뒤집지 않음 (이전엔 setEvDirect를
        // 여기서 강제 호출해서 사용자가 고른 값이 계속 덮어써지는 버그였음)
        const _rmp3 = document.getElementById('r-myprob'); if (_rmp3) _rmp3.value = (myProb * 100).toFixed(1);
      } else {
        resultEl.innerHTML = rawStrike + `<span>${evPct}%</span>` + calibNote;
        resultEl.style.color = ev > -0.03 ? 'var(--gold)' : 'var(--red)';
        if (noteEl) noteEl.textContent = `북메이커 내재확률 ${(combinedImplied*100).toFixed(1)}% vs 내 예상 ${(myProb*100).toFixed(1)}% (우위 ${edge}%p)`;
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



// ── getCalibStatusText ───────────────────────────────────────
// 보정 상태 텍스트 반환 — 여러 UI에서 재사용 (bet_form, bet_list 등)
function getCalibStatusText() {
  if (!window.App._SS) return null;
  const n   = window.App._SS.n || 0;
  const acf = window.App._SS.activeCorrFactor;
  if (n < 30 || acf == null) return null;
  const pct = ((1 - acf) * 100).toFixed(1);
  const strength = n < 50 ? '50%' : '100%';
  return `📐 보정 활성 (${strength} 강도 · ${pct}% 과신 보정 중 · ${n}건 기준)`;
}
