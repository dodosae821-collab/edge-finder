// ============================================================
// decision_ui.js — EDGE FINDER v7 검증 UI v1.3
// ============================================================
// 의존성 로드 순서:
//   1. decision_analysis.js (분석 엔진, Freeze)
//   2. decision_ui.js       (이 파일)
//
// DOM 컨테이너:
//   <div id="decision-analysis-root"></div>
//
// 전역 노출:
//   window.runDecisionAnalysisUI(bets)
// ============================================================


// ── 공통 유틸 ─────────────────────────────────────────────────

/** 퍼센트 포맷 (소수 → %, null → '—') */
function fmtPct(v, digits = 1) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return (v * 100).toFixed(digits) + '%';
}

/** ROI 포맷 (이미 % 단위인 경우) */
function fmtRoiPct(v, digits = 1) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(digits) + '%';
}

/** 숫자 포맷 (null → '—') */
function fmtNum(v, digits = 2) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

/** n 표시 — low_sample이면 n* + opacity + tooltip */
function fmtN(n, low_sample) {
  if (low_sample) {
    return `<span
      style="opacity:0.5;cursor:help;"
      title="샘플 수 부족 (n < 10) — 참고용으로만 사용하세요"
    >${n}*</span>`;
  }
  return String(n);
}

/** 공통 섹션 래퍼 생성 */
function makeSection(title) {
  const section = document.createElement('div');
  section.style.cssText = `
    margin-bottom: 24px;
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
  `;
  if (title) {
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 10px 16px;
      font-size: 11px;
      font-weight: 700;
      color: var(--text2);
      border-bottom: 1px solid var(--border);
      letter-spacing: 0.05em;
      text-transform: uppercase;
    `;
    header.textContent = title;
    section.appendChild(header);
  }
  return section;
}

/** 공통 테이블 생성 */
function makeTable(headers) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'overflow-x:auto;';

  const table = document.createElement('table');
  table.style.cssText = `
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  `;

  const thead = document.createElement('thead');
  const trHead = document.createElement('tr');
  headers.forEach(h => {
    const th = document.createElement('th');
    th.style.cssText = `
      padding: 8px 12px;
      text-align: left;
      font-size: 10px;
      font-weight: 700;
      color: var(--text3);
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    `;
    th.textContent = h;
    trHead.appendChild(th);
  });
  thead.appendChild(trHead);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  wrap.appendChild(table);

  return { wrap, tbody };
}

/** tbody에 행 추가 */
function addRow(tbody, cells, rowStyle = '') {
  const tr = document.createElement('tr');
  if (rowStyle) tr.style.cssText = rowStyle;
  tr.style.borderBottom = '1px solid var(--border)';

  cells.forEach(({ html, style = '' }) => {
    const td = document.createElement('td');
    td.style.cssText = `padding:8px 12px;font-size:12px;font-family:monospace;${style}`;
    td.innerHTML = html;
    tr.appendChild(td);
  });
  tbody.appendChild(tr);
}

/** 데이터 없음 행 */
function addEmptyRow(tbody, colspan, msg = '데이터 없음') {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = colspan;
  td.style.cssText = 'padding:16px;text-align:center;color:var(--text3);font-size:12px;';
  td.textContent = msg;
  tr.appendChild(td);
  tbody.appendChild(tr);
}


// ── renderMeta ────────────────────────────────────────────────

function renderMeta(meta, root) {
  const section = makeSection('데이터 현황');

  const grid = document.createElement('div');
  grid.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    gap: 0;
  `;

  const items = [
    { label: '전체 베팅',   value: meta.totalBets },
    { label: 'Decision 있음', value: meta.activeCount },
    { label: '유효 (분석)', value: meta.validCount },
    { label: 'Push/미정',   value: meta.pushCount },
    { label: 'Legacy 제외', value: meta.legacyCount },
    {
      label: '유효 비율',
      value: meta.validRatio !== null ? (meta.validRatio * 100).toFixed(0) + '%' : '—',
      warn:  meta.validRatio !== null && meta.validRatio < 0.7,
    },
  ];

  items.forEach(item => {
    const cell = document.createElement('div');
    cell.style.cssText = `
      padding: 12px 16px;
      min-width: 100px;
      border-right: 1px solid var(--border);
    `;
    const val = document.createElement('div');
    val.style.cssText = `
      font-size: 18px;
      font-weight: 700;
      font-family: monospace;
      color: ${item.warn ? 'var(--text2)' : 'var(--text)'};
    `;
    val.textContent = item.value;

    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:10px;color:var(--text3);margin-top:2px;';
    lbl.textContent = item.warn ? `⚠ ${item.label}` : item.label;

    cell.appendChild(val);
    cell.appendChild(lbl);
    grid.appendChild(cell);
  });

  section.appendChild(grid);
  root.appendChild(section);
}


// ── renderCalibration ─────────────────────────────────────────

function renderCalibration(calibration, root) {
  const section = makeSection('Calibration — 예측 정확도');

  // 범례
  const legend = document.createElement('div');
  legend.style.cssText = 'padding:8px 16px;font-size:10px;color:var(--text3);border-bottom:1px solid var(--border);';
  legend.innerHTML = `
    <span style="color:var(--red);font-weight:700;">■ 빨강</span> 과대평가 (예측 > 실제, 위험) &nbsp;
    <span style="color:#4a9eff;font-weight:700;">■ 파랑</span> 과소평가 (예측 < 실제) &nbsp;
    <span style="opacity:0.5;">n*</span> 샘플 부족 (n &lt; 10, 참고용)
    ${calibration.legacyCount > 0 ? `&nbsp;· Legacy 제외: ${calibration.legacyCount}건` : ''}
    ${calibration.unknownProbCount > 0 ? `&nbsp;· adjustedProb 없음: ${calibration.unknownProbCount}건` : ''}
  `;
  section.appendChild(legend);

  // lowSampleRatio — n < 10 구간 비율 (UI 파생 지표, 엔진 Freeze 유지)
  const buckets = Array.isArray(calibration.buckets) ? calibration.buckets : [];
  const lowSampleCount = buckets.filter(b => b.n < 10).length;
  const lowSampleRatio = buckets.length > 0 ? lowSampleCount / buckets.length : null;
  if (lowSampleRatio !== null && lowSampleRatio > 0) {
    const lsr = document.createElement('div');
    lsr.style.cssText = 'padding:6px 16px;font-size:10px;color:var(--text3);border-bottom:1px solid var(--border);';
    lsr.innerHTML = `샘플 부족 구간: <strong
      style="color:${lowSampleRatio >= 0.5 ? 'var(--red)' : 'var(--text2)'};"
      title="Low sample ratio high → 분석 신뢰도 낮음"
    >${lowSampleCount}/${buckets.length}</strong> (${(lowSampleRatio * 100).toFixed(0)}%) — 해당 구간은 참고용으로만 사용`;
    section.appendChild(lsr);
  }

  // 정렬 — n < 10 후순위, 그 안에서 오차 절댓값 내림차순 (노이즈 구간 분리)
  const sortedBuckets = [...buckets].sort((a, b) => {
    if (a.n < 10 && b.n >= 10) return 1;
    if (a.n >= 10 && b.n < 10) return -1;
    return Math.abs(b.error) - Math.abs(a.error);
  });

  const { wrap, tbody } = makeTable(['구간', 'n', '예측 확률', '실제 적중률', '오차 (error)', '평가']);

  if (sortedBuckets.length === 0) {
    addEmptyRow(tbody, 6, 'Calibration 분석 데이터 없음 (decision 있는 베팅이 필요합니다)');
  } else {
    sortedBuckets.forEach(b => {
      const errVal   = b.error;
      const isOver   = errVal < -0.03;
      const isUnder  = errVal >  0.03;
      const isDanger = errVal < -0.05 && b.n >= 10;  // 위험 구간 조건
      const errColor  = isOver  ? 'var(--red)' : isUnder ? '#4a9eff' : 'var(--text2)';
      const biasLabel = isOver  ? '⚠ 과대평가' : isUnder ? '과소평가' : '양호';
      const rowStyle  = isDanger ? 'background:rgba(255,59,92,0.07);' : '';
      const dangerIcon = isDanger ? '⚠ ' : '';

      addRow(tbody, [
        { html: dangerIcon + b.bucket,                               style: 'color:var(--text);font-weight:600;font-family:sans-serif;' },
        { html: fmtN(b.n, b.low_sample) },
        { html: b.avgAdjustedProb.toFixed(1) + '%',                  style: 'color:var(--text2);' },
        { html: (b.actualWinRate * 100).toFixed(1) + '%',            style: 'color:var(--text);' },
        { html: (errVal >= 0 ? '+' : '') + (errVal * 100).toFixed(1) + '%p', style: `color:${errColor};font-weight:700;` },
        { html: biasLabel,                                            style: `color:${errColor};font-family:sans-serif;` },
      ], rowStyle);
    });
  }

  section.appendChild(wrap);
  root.appendChild(section);
}


// ── renderDecision ────────────────────────────────────────────

function renderDecision(decision, root) {
  const section = makeSection('Decision Gate — 경고 무시 베팅 성과');

  // verdict — 엔진 결과 그대로 라벨만 매핑 (UI 재계산 없음)
  const verdictMap = {
    gate_valid: {
      label: 'OK',
      text:  '✅ OK — override 성과가 더 나빠, Gate가 손실을 줄이고 있습니다',
      color: 'var(--green)',
    },
    gate_unclear: {
      label: 'WARN',
      text:  '⚠ WARN — override와 normal 성과 차이 없음, 기준 재검토 권장',
      color: '#ff9800',
    },
    insufficient_data: {
      label: '—',
      text:  '— 데이터 부족 (override 또는 normal 5건 미만)',
      color: 'var(--text3)',
    },
  };
  const v = verdictMap[decision.verdict] || verdictMap.insufficient_data;
  const banner = document.createElement('div');
  banner.style.cssText = `
    padding: 8px 16px;
    font-size: 11px;
    font-weight: 700;
    color: ${v.color};
    border-bottom: 1px solid var(--border);
  `;
  banner.textContent = v.text;
  section.appendChild(banner);

  const { wrap, tbody } = makeTable(['그룹', 'n', 'ROI', '적중률', '평균 배당', '평균 손실']);

  const groups = [
    { label: '✅ Normal',   data: decision.normal,   style: '' },
    { label: '🚫 Override', data: decision.override, style: '' },
  ];

  groups.forEach(({ label, data }) => {
    if (data.n === 0) {
      addRow(tbody, [
        { html: label, style: 'font-family:sans-serif;color:var(--text2);' },
        { html: '0' },
        { html: '—' }, { html: '—' }, { html: '—' }, { html: '—' },
      ]);
      return;
    }

    const roiColor = data.roi === null ? 'var(--text3)'
      : data.roi >= 0 ? 'var(--green)' : 'var(--red)';

    addRow(tbody, [
      { html: label,                                            style: 'font-family:sans-serif;font-weight:600;' },
      { html: fmtN(data.n, data.low_sample) },
      { html: fmtRoiPct(data.roi),                             style: `color:${roiColor};font-weight:700;` },
      { html: fmtPct(data.winRate),                            style: 'color:var(--text);' },
      { html: fmtNum(data.avgOdds),                            style: 'color:var(--text2);' },
      { html: data.avgLoss !== null ? fmtNum(data.avgLoss, 0) : '—', style: 'color:var(--text2);' },
    ]);
  });

  section.appendChild(wrap);
  root.appendChild(section);
}


// ── renderKelly ───────────────────────────────────────────────

function renderKelly(kelly, root) {
  const section = makeSection('Kelly Factor — 베팅 규모별 변동성');

  const note = document.createElement('div');
  note.style.cssText = 'padding:8px 16px;font-size:10px;color:var(--text3);border-bottom:1px solid var(--border);';
  note.textContent = 'factor ↓ → stdDev ↓ 확인 | ROI 과도 감소 여부 체크';
  section.appendChild(note);

  const { wrap, tbody } = makeTable(['Factor', 'n', 'ROI', '적중률', 'stdDev PnL', 'stdDev ROI']);

  if (!kelly.groups || kelly.groups.length === 0) {
    addEmptyRow(tbody, 7);
  } else {
    let prevStdDevRoi = null;
    kelly.groups.forEach((g, index) => {
      // 변동성 방향 — 첫 row는 비교 대상 없음
      let dirIcon = '—';
      if (index > 0 && prevStdDevRoi !== null && g.stdDevRoi !== null) {
        dirIcon = g.stdDevRoi < prevStdDevRoi ? '🔽' : g.stdDevRoi > prevStdDevRoi ? '🔼' : '—';
      }
      if (g.stdDevRoi !== null) prevStdDevRoi = g.stdDevRoi;

      if (g.n === 0) {
        addRow(tbody, [
          { html: g.group, style: 'color:var(--text3);' },
          { html: '0' },
          { html: '—' }, { html: '—' }, { html: '—' }, { html: '—' }, { html: '—' },
        ]);
        return;
      }

      const roiColor = g.roi === null ? 'var(--text3)'
        : g.roi >= 0 ? 'var(--green)' : 'var(--red)';

      addRow(tbody, [
        { html: g.group,                                   style: 'color:var(--accent);font-weight:700;' },
        { html: fmtN(g.n, g.low_sample) },
        { html: fmtRoiPct(g.roi),                          style: `color:${roiColor};font-weight:700;` },
        { html: fmtPct(g.winRate),                         style: 'color:var(--text);' },
        { html: fmtNum(g.stdDevPnl, 0),                   style: 'color:var(--text2);' },
        { html: fmtNum(g.stdDevRoi, 4) + dirIcon,         style: 'color:var(--text2);' },
      ]);
    });
  }

  section.appendChild(wrap);
  root.appendChild(section);
}


// ── 메인 렌더 함수 ────────────────────────────────────────────

function renderDecisionAnalysis(bets) {
  const root = document.getElementById('decision-analysis-root');
  if (!root) {
    console.warn('[decision_ui] #decision-analysis-root 컨테이너를 찾을 수 없습니다.');
    return;
  }

  // 재렌더 방어 — 항상 초기화
  root.innerHTML = '';

  // decision_analysis.js 엔진 확인
  if (typeof runDecisionAnalysis !== 'function') {
    root.innerHTML = '<p style="color:var(--red);padding:16px;font-size:12px;">⚠ decision_analysis.js가 로드되지 않았습니다.</p>';
    return;
  }

  const safeBets = Array.isArray(bets) ? bets : [];
  const result   = runDecisionAnalysis(safeBets);

  // ── 툴바 — 새로고침 버튼 + Scope Label ──────────────────────
  const toolbar = document.createElement('div');
  toolbar.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
    padding: 0 2px;
  `;

  const scopeLabel = document.createElement('div');
  scopeLabel.style.cssText = 'font-size:11px;color:var(--text3);';
  scopeLabel.textContent = `전체 베팅 기준 분석 · 유효 ${result.meta.validCount}건`;

  const refreshBtn = document.createElement('button');
  refreshBtn.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 12px;
    background: rgba(0,229,255,0.08);
    border: 1px solid rgba(0,229,255,0.25);
    border-radius: 8px;
    color: var(--accent);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  `;
  refreshBtn.innerHTML = '🔄 분석 새로고침';
  refreshBtn.onclick = () => {
    renderDecisionAnalysis(getBets());
  };

  toolbar.appendChild(scopeLabel);
  toolbar.appendChild(refreshBtn);
  root.appendChild(toolbar);

  renderMeta(result.meta, root);
  renderCalibration(result.calibration, root);
  renderDecision(result.decision, root);
  renderKelly(result.kelly, root);
}


// ── 전역 노출 ─────────────────────────────────────────────────

window.runDecisionAnalysisUI = renderDecisionAnalysis;
