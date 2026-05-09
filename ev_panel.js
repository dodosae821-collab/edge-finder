// ============================================================
// ui/ev_panel.js
// 담당: EV 관련 DOM 렌더링
//
// 입력: 계산 결과 (compute/ev.js에서 전달)
// 출력: DOM 렌더링만
//
// 의존 (전역 — 허용):
//   appSettings (읽기 전용)
//   charts, safeCreateChart (전역)
//   pendingEvBet (전역 상태)
// 금지:
//   getBets(), saveBets(), localStorage
// ============================================================

function renderDecisionBlock({ isMulti, ev, kelly, rawP, safeP, verdict, folderCount, sizing }) {
  const el = document.getElementById('oneway-kelly-card');
  if (!el) return;

  const base = (getSettings().kellySeed || getSettings().bankroll || 0) / 12;

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

  // ── Gate sizing 표시 (메인) ──────────────────────────────
  let gateSizingHtml = '';
  if (sizing) {
    if (!sizing.sizingEnabled) {
      // bankroll 미설정
      gateSizingHtml = `
        <div style="margin-top:8px;padding:6px 10px;background:rgba(136,146,164,0.08);border-radius:6px;font-size:10px;color:var(--text3);">
          ⚙️ ${sizing.reason[0] || 'Bankroll 설정 필요'} — 설정 탭에서 뱅크롤을 입력하면 권장 금액이 표시됩니다.
        </div>`;
    } else {
      const finalStr   = sizing.finalStake > 0 ? '₩' + sizing.finalStake.toLocaleString() : '₩0';
      const kellyStr2  = sizing.kellySuggestion != null
        ? '₩' + sizing.kellySuggestion.toLocaleString()
        : '—';
      const multLabel  = sizing.gateMultiplier < 1
        ? ` <span style="color:var(--red);font-size:9px;">(×${sizing.gateMultiplier})</span>`
        : '';
      gateSizingHtml = `
        <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <div style="padding:7px 8px;background:var(--bg2);border-radius:6px;text-align:center;">
            <div style="font-size:9px;color:var(--text3);margin-bottom:3px;letter-spacing:1px;">권장 베팅 (Gate)${multLabel}</div>
            <div style="font-size:15px;font-weight:900;color:var(--green);font-family:'JetBrains Mono',monospace;">${finalStr}</div>
          </div>
          <div style="padding:7px 8px;background:var(--bg2);border-radius:6px;text-align:center;">
            <div style="font-size:9px;color:var(--text3);margin-bottom:3px;letter-spacing:1px;">Kelly 참고</div>
            <div style="font-size:13px;font-weight:700;color:var(--gold);font-family:'JetBrains Mono',monospace;">${kellyStr2}</div>
          </div>
        </div>`;
    }
  } else {
    // sizing 없을 때 기존 Kelly 단독 표시 (fallback)
    const kellyStr = base <= 0
      ? '<span style="color:var(--text3);font-size:11px;">시드 설정 필요</span>'
      : (verdict === 'PASS' || verdict === 'BLOCK')
        ? '<span style="color:var(--red);font-weight:700;">₩0</span>'
        : `<span style="color:var(--gold);font-weight:900;font-family:'JetBrains Mono',monospace;font-size:16px;">₩${kelly.toLocaleString()}</span>`;
    gateSizingHtml = `
      <div style="margin-top:8px;padding:8px;background:var(--bg2);border-radius:6px;text-align:center;">
        <div style="font-size:9px;color:var(--text3);margin-bottom:4px;letter-spacing:1px;">KELLY (이번 베팅)</div>
        <div>${kellyStr}</div>
      </div>`;
  }

  // 변동성 태그 (다폴)
  const varianceTag = isMulti
    ? (folderCount === 2 ? '변동성 ↑' : folderCount === 3 ? '고변동' : '초고변동')
    : '';

  // 적중확률 표시 (다폴)
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
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-size:10px;color:var(--text3);letter-spacing:1px;font-weight:700;">⚡ 원웨이 판단${isMulti ? ` · ${folderCount}폴더` : ''}</span>
        <span style="font-size:12px;font-weight:800;color:${v.color};">${v.icon} ${v.label}${isMulti && varianceTag ? ` <span style="font-size:10px;font-weight:400;">(${varianceTag})</span>` : ''}</span>
      </div>
      <div style="padding:6px 8px;background:var(--bg2);border-radius:6px;text-align:center;">
        <div style="font-size:9px;color:var(--text3);margin-bottom:2px;letter-spacing:1px;">EV</div>
        <div style="font-size:13px;font-weight:700;color:${evColor};">${evStr}</div>
      </div>
      ${gateSizingHtml}
      ${probHtml}
    </div>`;
}


function clearDecisionBlock() {
  const el = document.getElementById('oneway-kelly-card');
  if (el) el.style.display = 'none';
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


