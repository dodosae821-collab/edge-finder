// ============================================================
// verify.js — 🔬 모델 검증 시스템
// ============================================================

let _vChart1 = null, _vChart2 = null, _vChart3 = null;

const VERIFY_MIN = 30;
const CALIB_STEP = 5; // Chart3 + ECE 공용 bin 단위 (%)

const EV_BUCKETS = [
  { label: 'EV−',    min: -Infinity, max: 0    },
  { label: '중립',   min: 0,         max: 0.05 },
  { label: 'EV+ 약', min: 0.05,      max: 0.10 },
  { label: 'EV+ 강', min: 0.10,      max: Infinity },
];

function destroyVerifyCharts() {
  [_vChart1, _vChart2, _vChart3].forEach(c => { if (c) { try { c.destroy(); } catch(e){} } });
  _vChart1 = _vChart2 = _vChart3 = null;
}

// ============================================================
// 공용: bin 집계 — Chart3 + ECE 동일 기준
// n < 5 구간 제외, CALIB_STEP 단위
// ============================================================
function buildCalibBins(predBets) {
  const bins = [];
  for (let lo = 0; lo < 100; lo += CALIB_STEP) {
    const g = predBets.filter(b => b.myProb >= lo && b.myProb < lo + CALIB_STEP);
    if (g.length < 5) continue;

    const midRaw  = g.reduce((s,b) => s + b.myProb, 0) / g.length;  // %
    const actWr   = g.filter(b => b.result === 'WIN').length / g.length * 100; // %

    const calibG  = g.filter(b => b.calibProb != null);
    const calibWr = calibG.length > 0
      ? calibG.reduce((s,b) => s + b.calibProb * 100, 0) / calibG.length
      : null;

    bins.push({ lo, hi: lo + CALIB_STEP, count: g.length, midRaw, actWr, calibWr });
  }
  return bins;
}

// ============================================================
// ECE + Bias 계산 — 가중 평균 (count/total)
// ============================================================
function calcEceBias(bins) {
  const validBins  = bins.filter(b => b.calibWr !== null);
  const total      = bins.reduce((s,b) => s + b.count, 0);
  const totalCalib = validBins.reduce((s,b) => s + b.count, 0);

  if (total === 0) return { eceRaw: null, eceCalib: null, biasRaw: null, biasCalib: null };

  // ECE raw: |midRaw - actWr| × weight
  const eceRaw  = bins.reduce((s,b) => s + Math.abs(b.midRaw - b.actWr) * (b.count / total), 0);
  // Bias raw: (midRaw - actWr) × weight  — 양수=과신, 음수=과소추정
  const biasRaw = bins.reduce((s,b) => s + (b.midRaw - b.actWr) * (b.count / total), 0);

  // ECE calib / Bias calib — calibWr 있는 구간만
  const eceCalib  = totalCalib > 0
    ? validBins.reduce((s,b) => s + Math.abs(b.calibWr - b.actWr) * (b.count / totalCalib), 0)
    : null;
  const biasCalib = totalCalib > 0
    ? validBins.reduce((s,b) => s + (b.calibWr - b.actWr) * (b.count / totalCalib), 0)
    : null;

  return { eceRaw, eceCalib, biasRaw, biasCalib };
}

// ============================================================
// 진입점
// ============================================================
function renderVerifyPage() {
  destroyVerifyCharts();

  const bets     = JSON.parse(localStorage.getItem('edge_bets') || '[]');
  const resolved = bets.filter(b => b.result === 'WIN' || b.result === 'LOSE');
  const statusEl = document.getElementById('verify-status');

  if (resolved.length < VERIFY_MIN) {
    if (statusEl) statusEl.innerHTML = `
      <div style="padding:32px;text-align:center;color:var(--text3);">
        <div style="font-size:32px;margin-bottom:12px;">🔬</div>
        <div style="font-size:14px;font-weight:700;color:var(--text2);margin-bottom:6px;">데이터 부족</div>
        <div style="font-size:12px;">결과 확정 베팅 <strong style="color:var(--accent);">${resolved.length}건</strong> 중.
          최소 <strong>${VERIFY_MIN}건</strong>부터 분석 가능합니다.</div>
        <div style="margin-top:12px;width:100%;background:var(--bg3);border-radius:4px;height:6px;">
          <div style="width:${Math.min(resolved.length/VERIFY_MIN*100,100).toFixed(0)}%;background:var(--accent);height:6px;border-radius:4px;"></div>
        </div>
        <div style="font-size:10px;color:var(--text3);margin-top:6px;">${resolved.length} / ${VERIFY_MIN}</div>
      </div>`;
    // Decision Analysis — 데이터 부족과 무관하게 항상 실행
    if (typeof runDecisionAnalysisUI === 'function') {
      const allBets = JSON.parse(localStorage.getItem('edge_bets') || '[]');
      runDecisionAnalysisUI(allBets);
    }
    return;
  }
  if (statusEl) statusEl.innerHTML = '';

  // ECE/Bias는 bins에서 계산 — renderVerifySummary에 전달
  const predBets = resolved.filter(b => b.myProb != null && b.myProb > 0);
  const bins     = buildCalibBins(predBets);
  const eceBias  = calcEceBias(bins);

  const verifySummaryEl = document.getElementById('verify-summary');

  renderVerifySummary(resolved, eceBias);
  renderChart1_EvVsRoi(resolved);
  renderChart2_FolderVsRoi(resolved);
  renderChart3_CalibEffect(bins);
  renderEceBanner(verifySummaryEl);

  // Decision Analysis — 모든 렌더 완료 후 1회 실행
  if (typeof runDecisionAnalysisUI === 'function') {
    const allBets = JSON.parse(localStorage.getItem('edge_bets') || '[]');
    runDecisionAnalysisUI(allBets);
  }
}

// ============================================================
// ECE 배너 (Decision Gate 연동)
// ============================================================
function renderEceBanner(verifySummaryEl) {
  if (!verifySummaryEl || !window._SS) return;
  const rEce = window._SS.recentEce;
  const dec  = window._SS.betDecision;
  if (rEce === null || !dec) return;

  const existing = document.getElementById('recent-ece-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'recent-ece-banner';
  banner.style.cssText = `
    margin-bottom:12px;padding:10px 14px;border-radius:8px;
    background:${dec.kellyFactor < 1 ? 'rgba(255,152,0,0.08)' : 'rgba(0,230,118,0.07)'};
    border:1px solid ${dec.labelColor}44;
    display:flex;justify-content:space-between;align-items:center;
  `;
  banner.innerHTML = `
    <div>
      <span style="font-size:11px;font-weight:700;color:${dec.labelColor};">${dec.allow ? '⚠️' : '🚫'} 최근 ECE (최근 20건): ${rEce.toFixed(1)}%</span>
      <div style="font-size:10px;color:var(--text3);margin-top:2px;">${dec.desc}</div>
    </div>
    <span style="font-size:12px;font-weight:800;color:${dec.labelColor};padding:4px 10px;border-radius:6px;background:${dec.labelColor}22;">${dec.label}</span>
  `;
  verifySummaryEl.insertBefore(banner, verifySummaryEl.firstChild);
}

// ============================================================
// 요약 카드 (ECE + Bias 추가)
// ============================================================
function renderVerifySummary(resolved, eceBias) {
  const el = document.getElementById('verify-summary');
  if (!el) return;

  const n           = resolved.length;
  const wins        = resolved.filter(b => b.result === 'WIN').length;
  const winRate     = wins / n;
  const totalProfit = resolved.reduce((s,b) => s + (b.profit||0), 0);
  const totalBet    = resolved.reduce((s,b) => s + (b.amount||0), 0);
  const roi         = totalBet > 0 ? totalProfit / totalBet * 100 : 0;

  const evBets     = resolved.filter(b => b.ev != null);
  const avgEv      = evBets.length ? evBets.reduce((s,b) => s+b.ev, 0) / evBets.length : null;
  const calibBets  = resolved.filter(b => b.evCalibrated != null);
  const avgEvCalib = calibBets.length ? calibBets.reduce((s,b) => s+b.evCalibrated, 0) / calibBets.length : null;

  // EV 신뢰도
  let evAccuracy = null;
  if (avgEv !== null && evBets.length >= 10) {
    const predictedRoiPct = avgEv * 100;
    if (Math.abs(predictedRoiPct) >= 0.5) {
      evAccuracy = Math.max(0, Math.min(200, (roi / predictedRoiPct) * 100)).toFixed(0);
    }
  }

  const fmt    = v => v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
  const fmtPct = v => v >= 0 ? `+${v.toFixed(1)}%` : `${v.toFixed(1)}%`;
  const col    = v => v >= 0 ? 'var(--green)' : 'var(--red)';

  // ECE/Bias 렌더 헬퍼
  const { eceRaw, eceCalib, biasRaw, biasCalib } = eceBias;
  const hasEce = eceRaw !== null;

  // ECE 개선 판정
  let eceVerdict = '';
  if (hasEce && eceCalib !== null) {
    const improved = eceCalib < eceRaw;
    const delta    = ((eceRaw - eceCalib)).toFixed(1);
    eceVerdict = improved
      ? `✅ 보정 후 오차 ${delta}%p 감소`
      : `⚠️ 보정 후 오차 ${Math.abs(delta)}%p 증가 — 보정 파라미터 재검토`;
  }

  // Bias 방향 텍스트
  const biasText = v => {
    if (v === null) return '—';
    if (Math.abs(v) < 1) return `${fmtPct(v)} (중립)`;
    return v > 0 ? `${fmtPct(v)} (과신)` : `${fmtPct(v)} (과소추정)`;
  };

  el.innerHTML = `
    <!-- 기본 지표 -->
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px;">
      <div style="padding:12px;background:var(--bg2);border-radius:8px;border:1px solid var(--border);">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px;">분석 베팅 수</div>
        <div style="font-size:22px;font-weight:800;color:var(--accent);">${n}건</div>
        <div style="font-size:10px;color:var(--text3);">승률 ${(winRate*100).toFixed(1)}%</div>
      </div>
      <div style="padding:12px;background:var(--bg2);border-radius:8px;border:1px solid var(--border);">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px;">실제 ROI</div>
        <div style="font-size:22px;font-weight:800;color:${col(roi)};">${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%</div>
        <div style="font-size:10px;color:var(--text3);">총손익 ${totalProfit >= 0 ? '+' : ''}${totalProfit.toLocaleString()}원</div>
      </div>
      <div style="padding:12px;background:var(--bg2);border-radius:8px;border:1px solid var(--border);">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px;">평균 EV (원본)</div>
        <div style="font-size:20px;font-weight:800;color:${avgEv === null ? 'var(--text3)' : col(avgEv)};">
          ${avgEv === null ? '—' : fmt(avgEv)}</div>
        <div style="font-size:10px;color:var(--text3);">${evBets.length}건</div>
      </div>
      <div style="padding:12px;background:var(--bg2);border-radius:8px;border:1px solid var(--border);">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px;">평균 EV (보정)</div>
        <div style="font-size:20px;font-weight:800;color:${avgEvCalib === null ? 'var(--text3)' : col(avgEvCalib)};">
          ${avgEvCalib === null ? '—' : fmt(avgEvCalib)}</div>
        <div style="font-size:10px;color:var(--text3);">${calibBets.length}건</div>
      </div>
    </div>

    <!-- EV 신뢰도 -->
    ${evAccuracy !== null ? `
    <div style="padding:10px 14px;background:var(--bg2);border-radius:8px;border:1px solid var(--border);margin-bottom:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <span style="font-size:11px;color:var(--text3);">🎯 EV 신뢰도</span>
      <span style="font-size:18px;font-weight:800;color:${evAccuracy >= 80 ? 'var(--green)' : evAccuracy >= 50 ? 'var(--gold)' : 'var(--red)'};">${evAccuracy}%</span>
      <span style="font-size:10px;color:var(--text3);">${
        evAccuracy >= 80 ? '✅ EV가 현실에 잘 맞음' :
        evAccuracy >= 50 ? '🟡 EV 추정 재확인 필요' : '🔴 EV 과신 가능성'
      }</span>
      <span style="font-size:10px;color:var(--text3);width:100%;">예측 ROI ${(avgEv*100).toFixed(2)}% → 실제 ROI ${roi.toFixed(2)}%</span>
    </div>` : ''}

    <!-- ECE + Bias 카드 -->
    ${hasEce ? `
    <div style="padding:14px;background:var(--bg2);border-radius:8px;border:1px solid var(--border);margin-bottom:12px;">
      <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:10px;">📐 보정 효과 (ECE · Bias) — ${CALIB_STEP}% 단위 가중 평균</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">

        <!-- ECE -->
        <div style="padding:10px;background:var(--bg3);border-radius:6px;">
          <div style="font-size:10px;color:var(--text3);margin-bottom:6px;">ECE (보정 오차 크기)</div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:15px;font-weight:700;color:var(--text2);">${eceRaw.toFixed(1)}%</span>
            <span style="font-size:13px;color:var(--text3);">→</span>
            <span style="font-size:15px;font-weight:700;color:${eceCalib !== null && eceCalib < eceRaw ? 'var(--green)' : eceCalib !== null ? 'var(--red)' : 'var(--text3)'};">
              ${eceCalib !== null ? eceCalib.toFixed(1)+'%' : '—'}</span>
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:4px;">${eceVerdict}</div>
        </div>

        <!-- Bias -->
        <div style="padding:10px;background:var(--bg3);border-radius:6px;">
          <div style="font-size:10px;color:var(--text3);margin-bottom:6px;">Bias (방향성 · 양수=과신)</div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:15px;font-weight:700;color:${biasRaw > 1 ? 'var(--red)' : biasRaw < -1 ? 'var(--accent)' : 'var(--green)'};">${fmtPct(biasRaw)}</span>
            <span style="font-size:13px;color:var(--text3);">→</span>
            <span style="font-size:15px;font-weight:700;color:${biasCalib !== null ? (Math.abs(biasCalib) < Math.abs(biasRaw) ? 'var(--green)' : 'var(--red)') : 'var(--text3)'};">
              ${biasCalib !== null ? fmtPct(biasCalib) : '—'}</span>
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:4px;">${biasText(biasCalib)}</div>
        </div>
      </div>

      <!-- 해석 가이드 한 줄 -->
      <div style="font-size:10px;color:var(--text3);line-height:1.6;padding:8px;background:var(--bg3);border-radius:6px;">
        💡 <strong style="color:var(--text2);">ECE</strong> 낮을수록 예측 정확도 ↑ &nbsp;·&nbsp;
           <strong style="color:var(--text2);">Bias +</strong> 과신 (예측 > 실제) &nbsp;·&nbsp;
           <strong style="color:var(--text2);">Bias −</strong> 과소추정 &nbsp;·&nbsp;
           보정 후 ECE↓ + Bias→0 이면 보정 유효
      </div>
    </div>` : `
    <div style="padding:10px 14px;background:var(--bg2);border-radius:8px;border:1px solid var(--border);margin-bottom:12px;font-size:11px;color:var(--text3);">
      📐 ECE · Bias: 예측 승률 입력 데이터 부족 — 구간당 5건 이상 쌓이면 자동 계산됩니다.
    </div>`}`;
}

// ============================================================
// 차트 1: EV 구간별 실제 ROI
// ============================================================
function renderChart1_EvVsRoi(resolved) {
  const canvas = document.getElementById('verify-chart1');
  if (!canvas) return;

  const evBets = resolved.filter(b => b.ev != null);
  if (evBets.length < 5) {
    canvas.parentElement.innerHTML +=
      `<div style="text-align:center;color:var(--text3);font-size:11px;padding:8px;">EV 입력 데이터 부족 (${evBets.length}건 / 최소 5건)</div>`;
    return;
  }

  const labels = [], roiData = [], colors = [], sampleCounts = [];

  EV_BUCKETS.forEach(bk => {
    const group = evBets.filter(b => b.ev >= bk.min && b.ev < bk.max);
    if (group.length === 0) return;
    const profit = group.reduce((s,b) => s + (b.profit||0), 0);
    const bet    = group.reduce((s,b) => s + (b.amount||0), 0);
    const roi    = bet > 0 ? profit / bet * 100 : 0;
    labels.push(`${bk.label}\n(n=${group.length})`);
    roiData.push(parseFloat(roi.toFixed(1)));
    sampleCounts.push(group.length);
    colors.push(roi >= 0 ? 'rgba(0,230,118,0.75)' : 'rgba(255,82,82,0.75)');
  });

  if (!labels.length) {
    canvas.parentElement.innerHTML +=
      `<div style="text-align:center;color:var(--text3);font-size:11px;padding:8px;">구간별 데이터 없음</div>`;
    return;
  }

  _vChart1 = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ label:'ROI (%)', data:roiData, backgroundColor:colors, borderColor:colors.map(c=>c.replace('0.75','1')), borderWidth:1 }] },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: {
        legend:{display:false},
        tooltip:{ callbacks:{ label: ctx => { const n=sampleCounts[ctx.dataIndex]; return [`ROI: ${ctx.parsed.y>=0?'+':''}${ctx.parsed.y}%`,`샘플: ${n}건`]; } } }
      },
      scales: {
        x:{ ticks:{color:'#90a4ae',font:{size:11}}, grid:{color:'rgba(255,255,255,0.05)'} },
        y:{ ticks:{color:'#90a4ae',font:{size:11},callback:v=>v+'%'}, grid:{color:'rgba(255,255,255,0.05)'}, title:{display:true,text:'ROI (%)',color:'#90a4ae',font:{size:11}} }
      }
    }
  });
}

// ============================================================
// 차트 2: 폴더 수별 ROI
// ============================================================
function renderChart2_FolderVsRoi(resolved) {
  const canvas = document.getElementById('verify-chart2');
  if (!canvas) return;

  const getFolderCount = b => {
    if (b.mode === 'single') return 1;
    return parseInt(b.folderCount) || (b.folderOdds?.filter(Boolean).length) || 1;
  };

  const labels = [], roiData = [], colors = [], sampleCounts = [];

  for (let f = 1; f <= 5; f++) {
    const group = f < 5
      ? resolved.filter(b => getFolderCount(b) === f)
      : resolved.filter(b => getFolderCount(b) >= f);
    if (group.length < 2) continue;
    const profit = group.reduce((s,b) => s + (b.profit||0), 0);
    const bet    = group.reduce((s,b) => s + (b.amount||0), 0);
    const roi    = bet > 0 ? profit / bet * 100 : 0;
    labels.push(f < 5 ? `${f}폴\n(n=${group.length})` : `${f}폴+\n(n=${group.length})`);
    roiData.push(parseFloat(roi.toFixed(1)));
    sampleCounts.push(group.length);
    colors.push(roi >= 0 ? 'rgba(0,229,255,0.65)' : 'rgba(255,82,82,0.65)');
  }

  if (!labels.length) {
    canvas.parentElement.innerHTML +=
      `<div style="text-align:center;color:var(--text3);font-size:11px;padding:8px;">폴더별 데이터 부족 (각 2건 이상 필요)</div>`;
    return;
  }

  _vChart2 = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ label:'ROI (%)', data:roiData, backgroundColor:colors, borderColor:colors.map(c=>c.replace('0.65','1')), borderWidth:1 }] },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: {
        legend:{display:false},
        tooltip:{ callbacks:{ label: ctx => { const n=sampleCounts[ctx.dataIndex]; return [`ROI: ${ctx.parsed.y>=0?'+':''}${ctx.parsed.y}%`,`샘플: ${n}건`]; } } }
      },
      scales: {
        x:{ ticks:{color:'#90a4ae',font:{size:11}}, grid:{color:'rgba(255,255,255,0.05)'} },
        y:{ ticks:{color:'#90a4ae',font:{size:11},callback:v=>v+'%'}, grid:{color:'rgba(255,255,255,0.05)'}, title:{display:true,text:'ROI (%)',color:'#90a4ae',font:{size:11}} }
      }
    }
  });
}

// ============================================================
// 차트 3: 보정 효과 — bins 재사용 (ECE와 동일 구간)
// ============================================================
function renderChart3_CalibEffect(bins) {
  const canvas = document.getElementById('verify-chart3');
  if (!canvas) return;

  if (bins.length < 2) {
    canvas.parentElement.innerHTML +=
      `<div style="text-align:center;color:var(--text3);font-size:11px;padding:8px;">
        구간별 최소 5건 조건 미충족 — 데이터가 더 쌓이면 분석됩니다.
      </div>`;
    return;
  }

  const labels       = bins.map(b => `${b.lo}~${b.hi}%\n(n=${b.count})`);
  const rawProbData  = bins.map(b => parseFloat(b.midRaw.toFixed(1)));
  const actualData   = bins.map(b => parseFloat(b.actWr.toFixed(1)));
  const calibData    = bins.map(b => b.calibWr !== null ? parseFloat(b.calibWr.toFixed(1)) : null);
  const idealData    = bins.map(b => parseFloat(b.midRaw.toFixed(1)));
  const sampleCounts = bins.map(b => b.count);

  _vChart3 = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label:'이상적 보정 (y=x)', data:idealData, borderColor:'rgba(144,164,174,0.35)', borderDash:[6,4], pointRadius:0, fill:false, tension:0 },
        { label:'내 예측 승률 (raw)', data:rawProbData, borderColor:'rgba(0,229,255,0.9)', pointRadius:4, pointBackgroundColor:'rgba(0,229,255,1)', fill:false, tension:0.2 },
        { label:'실제 적중률', data:actualData, borderColor:'rgba(0,230,118,0.9)', pointRadius:5, pointBackgroundColor:'rgba(0,230,118,1)', fill:false, tension:0.2 },
        { label:'보정 승률 (calibProb)', data:calibData, borderColor:'rgba(255,215,0,0.9)', pointRadius:4, pointBackgroundColor:'rgba(255,215,0,1)', borderDash:[3,3], fill:false, tension:0.2 },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: {
        legend:{ display:true, labels:{ color:'#90a4ae', font:{size:11}, boxWidth:14 } },
        tooltip:{
          callbacks:{
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y != null ? ctx.parsed.y+'%' : '—'}`,
            afterBody: items => { const idx=items[0]?.dataIndex; return idx!=null ? [`n = ${sampleCounts[idx]}건`] : []; }
          }
        }
      },
      scales: {
        x:{ ticks:{color:'#90a4ae',font:{size:10}}, grid:{color:'rgba(255,255,255,0.05)'} },
        y:{ min:0, max:100, ticks:{color:'#90a4ae',font:{size:11},callback:v=>v+'%'}, grid:{color:'rgba(255,255,255,0.05)'}, title:{display:true,text:'승률 / 적중률 (%)',color:'#90a4ae',font:{size:11}} }
      }
    }
  });
}
