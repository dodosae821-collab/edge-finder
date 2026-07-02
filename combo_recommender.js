// ============================================================
// combo_recommender.js — 조합 추천기
// 전략베팅 탭 > 조합기 탭
// ============================================================

let _comboGames = [];   // [{ id, name, odds, myProb, group }]
let _comboGroupCounter = 0;

// ── 초기화 (탭 진입 시 호출) ──
function comboInit() {
  if (_comboGames.length === 0) comboAddGame();
  comboRenderGames();
  comboUpdatePerBet();
}

// ── 조합당 금액 / 수익용 수 업데이트 ──
function comboUpdatePerBet() {
  const total   = parseFloat(document.getElementById('combo-total-amt')?.value)    || 1000000;
  const count   = parseInt(document.getElementById('combo-total-count')?.value)    || 10;
  const recov   = parseInt(document.getElementById('combo-recovery-count')?.value) || 4;
  const perBet  = count > 0 ? total / count : 0;
  const profitN = Math.max(0, count - recov);

  const el  = document.getElementById('combo-per-bet');
  const el2 = document.getElementById('combo-profit-count');
  if (el)  el.textContent  = Math.round(perBet).toLocaleString() + '원';
  if (el2) el2.textContent = profitN;
}

// ── 경기 추가 ──
function comboAddGame() {
  if (_comboGames.length >= 8) {
    showToast?.('경기는 최대 8개까지 입력할 수 있어요.', 'warn');
    return;
  }
  _comboGames.push({ id: Date.now(), name: '', odds: '', myProb: '', group: '' });
  comboRenderGames();
}

// ── 경기 삭제 ──
function comboRemoveGame(id) {
  _comboGames = _comboGames.filter(g => g.id !== id);
  comboRenderGames();
}

// ── 경기 필드 변경 ──
function comboGameChange(id, field, value) {
  const g = _comboGames.find(g => g.id === id);
  if (!g) return;
  g[field] = value;

  if (field === 'odds') {
    // 내재확률 업데이트
    const odds = parseFloat(value);
    const implied = (odds > 1) ? (1 / odds * 100) : null;
    const el = document.getElementById('combo-implied-' + id);
    if (el) {
      el.textContent = implied ? implied.toFixed(1) + '%' : '—';
      el.style.color = implied ? 'var(--text2)' : 'var(--text3)';
    }
  }

  comboCheckReady();
}

// ── 생성 버튼 노출 조건 확인 ──
function comboCheckReady() {
  const valid = _comboGames.filter(g => g.name && parseFloat(g.odds) > 1 && parseFloat(g.myProb) > 0);
  const btn = document.getElementById('combo-gen-btn');
  if (btn) btn.style.display = valid.length >= 2 ? 'block' : 'none';
}

// ── 경기 목록 렌더 ──
function comboRenderGames() {
  const list  = document.getElementById('combo-game-list');
  const empty = document.getElementById('combo-game-empty');
  if (!list) return;

  if (_comboGames.length === 0) {
    list.innerHTML = '';
    if (empty) empty.style.display = 'block';
    comboCheckReady();
    return;
  }
  if (empty) empty.style.display = 'none';

  list.innerHTML = _comboGames.map((g, idx) => {
    const implied = parseFloat(g.odds) > 1 ? (1 / parseFloat(g.odds) * 100).toFixed(1) + '%' : '—';
    const letter  = String.fromCharCode(65 + idx); // A, B, C ...
    return `
    <div style="display:grid;grid-template-columns:28px 1fr 72px 60px 60px 54px 28px;gap:4px;margin-bottom:6px;align-items:center;">
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-align:center;">${letter}</div>
      <input type="text" placeholder="경기명/선택" value="${g.name}"
        style="padding:7px 8px;font-size:12px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text2);outline:none;width:100%;"
        oninput="comboGameChange(${g.id},'name',this.value)">
      <input type="number" placeholder="1.85" value="${g.odds}" min="1.01" step="0.01"
        style="padding:7px 6px;font-size:12px;font-family:'JetBrains Mono',monospace;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--accent);outline:none;width:100%;text-align:center;"
        oninput="comboGameChange(${g.id},'odds',this.value)">
      <div id="combo-implied-${g.id}"
        style="font-size:11px;font-family:'JetBrains Mono',monospace;text-align:center;color:${parseFloat(g.odds)>1?'var(--text2)':'var(--text3)'};">
        ${implied}
      </div>
      <input type="number" placeholder="60" value="${g.myProb}" min="1" max="99" step="1"
        style="padding:7px 6px;font-size:12px;font-family:'JetBrains Mono',monospace;background:var(--bg3);border:1px solid rgba(0,229,255,0.3);border-radius:6px;color:var(--accent);outline:none;width:100%;text-align:center;"
        oninput="comboGameChange(${g.id},'myProb',this.value)">
      <input type="text" placeholder="—" value="${g.group}" maxlength="3"
        style="padding:7px 4px;font-size:11px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text3);outline:none;width:100%;text-align:center;"
        title="같은 그룹 문자를 입력한 경기끼리는 한 조합에 함께 들어가지 않아요"
        oninput="comboGameChange(${g.id},'group',this.value)">
      <button onclick="comboRemoveGame(${g.id})"
        style="background:none;border:none;color:var(--text3);font-size:14px;cursor:pointer;padding:4px;line-height:1;">✕</button>
    </div>`;
  }).join('');

  comboCheckReady();
}

// ── 배당 베트맨 올림 ──
function _comboBetmanRound(odds) {
  const s    = odds.toFixed(2);
  const dec2 = parseInt(s.slice(-1));
  if (dec2 === 0) return parseFloat(s.slice(0, -1));
  return Math.ceil(odds * 10) / 10;
}

// ── 보정 승률 계산 (시스템 calibration 활용) ──
function _comboCalibrate(rawProb) {
  const ss = window.App?._SS;
  if (!ss) return rawProb;
  // getCalibrated가 존재하면 사용 (state.js)
  if (typeof getCalibrated === 'function' && ss.calibBuckets?.length) {
    return getCalibrated(rawProb, ss.calibBuckets);
  }
  // corrFactor 폴백
  const cf = Math.min(ss.activeCorrFactor || 1.0, 1.0);
  return rawProb * cf;
}

// ── 유효성 검증 (그룹 충돌) ──
function _comboIsValid(combo) {
  const groups = combo.map(g => g.group).filter(g => g && g.trim() !== '');
  return groups.length === new Set(groups).size;
}

// ── 조합 통계 계산 ──
function _comboStats(combo, perBet, useCalib) {
  let rawOdds = 1, rawProb = 1, calibProb = 1;
  for (const g of combo) {
    const odds   = parseFloat(g.odds);
    const prob   = parseFloat(g.myProb) / 100;
    const calibP = useCalib ? _comboCalibrate(prob) : prob;
    rawOdds   *= odds;
    rawProb   *= prob;
    calibProb *= calibP;
  }
  const finalOdds = _comboBetmanRound(rawOdds);
  const ev        = calibProb * (finalOdds - 1) - (1 - calibProb);
  const expected  = perBet * calibProb * finalOdds;
  return { odds: finalOdds, rawProb, calibProb, ev, expected };
}

// ── 조합 생성 메인 ──
function comboGenerate() {
  const total   = parseFloat(document.getElementById('combo-total-amt')?.value)    || 1000000;
  const count   = parseInt(document.getElementById('combo-total-count')?.value)    || 10;
  const recovN  = parseInt(document.getElementById('combo-recovery-count')?.value) || 4;
  const profitN = Math.max(0, count - recovN);
  const perBet  = total / count;

  // 유효 경기만 추출
  const games = _comboGames.filter(g =>
    g.name.trim() && parseFloat(g.odds) > 1 && parseFloat(g.myProb) > 0
  );

  if (games.length < 2) {
    showToast?.('경기를 2개 이상 입력해주세요.', 'warn');
    return;
  }

  // calibration 사용 여부 확인
  const ss       = window.App?._SS;
  const useCalib = !!(ss?.calibBuckets?.length);

  // 2~6폴더 조합 전체 생성
  const allCombos = [];
  for (let n = 2; n <= Math.min(6, games.length); n++) {
    for (const combo of _comboCombinations(games, n)) {
      if (!_comboIsValid(combo)) continue;
      const stats = _comboStats(combo, perBet, useCalib);
      allCombos.push({ combo, n, ...stats });
    }
  }

  if (allCombos.length === 0) {
    showToast?.('가능한 조합이 없어요. 경기 그룹 설정을 확인해주세요.', 'warn');
    return;
  }

  // ── 원금회수용 선정 ──
  // 기준: 배당 1.5~4.5 사이, 적중확률 × EV 복합 점수 (확률 70% + EV 30%)
  const recovCandidates = allCombos
    .filter(c => c.odds >= 1.5 && c.odds <= 4.5)
    .sort((a, b) => (b.calibProb * 0.7 + b.ev * 0.3) - (a.calibProb * 0.7 + a.ev * 0.3));

  const selectedRecov = _comboPickDistinct(recovCandidates, recovN);

  // ── 수익용 선정 ──
  // 기준: EV 최대화, 배당 2.5 이상, 원금회수용과 중복 제외
  const recovIds = new Set(selectedRecov.map(c => c.combo.map(g => g.id).sort().join(',')));
  const profitCandidates = allCombos
    .filter(c => {
      const key = c.combo.map(g => g.id).sort().join(',');
      return c.odds >= 2.5 && !recovIds.has(key);
    })
    .sort((a, b) => b.ev - a.ev);

  const selectedProfit = _comboPickDistinct(profitCandidates, profitN);

  // ── 결과 렌더 ──
  comboRenderResult(selectedRecov, selectedProfit, perBet, total, useCalib, ss);
}

// ── 중복 없이 N개 선정 (동일 조합 제외) ──
function _comboPickDistinct(sorted, n) {
  const picked = [];
  const usedKeys = new Set();
  for (const c of sorted) {
    const key = c.combo.map(g => g.id).sort().join(',');
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    picked.push(c);
    if (picked.length >= n) break;
  }
  return picked;
}

// ── 조합 생성 유틸 ──
function _comboCombinations(arr, k) {
  const result = [];
  function bt(start, cur) {
    if (cur.length === k) { result.push([...cur]); return; }
    for (let i = start; i < arr.length; i++) {
      cur.push(arr[i]);
      bt(i + 1, cur);
      cur.pop();
    }
  }
  bt(0, []);
  return result;
}

// ── 결과 렌더 ──
function comboRenderResult(recov, profit, perBet, total, useCalib, ss) {
  const resultEl = document.getElementById('combo-result');
  if (resultEl) resultEl.style.display = 'block';

  // calibration 안내
  const noteEl = document.getElementById('combo-calib-note');
  if (noteEl) {
    if (useCalib && ss?.n >= 10) {
      noteEl.textContent = `✅ 내 베팅 기록 ${ss.n}건 반영 — 보정 적중확률 적용됨`;
      noteEl.style.color = 'var(--green)';
    } else {
      noteEl.textContent = '⚠️ 베팅 기록 부족 — 입력한 예측 승률 그대로 사용';
      noteEl.style.color = 'var(--warn)';
    }
  }

  document.getElementById('combo-recovery-list').innerHTML =
    recov.map((c, i) => comboCardHTML(c, i + 1, perBet, '🛡️')).join('');

  document.getElementById('combo-profit-list').innerHTML =
    profit.map((c, i) => comboCardHTML(c, i + 1, perBet, '💰')).join('');

  // 요약
  const allSel  = [...recov, ...profit];
  const totalEV = allSel.reduce((s, c) => s + c.ev * perBet, 0);
  const sumEl   = document.getElementById('combo-summary');
  if (sumEl) {
    sumEl.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center;">
        <div>
          <div style="font-size:10px;color:var(--text3);margin-bottom:3px;">총 투입</div>
          <div style="font-size:14px;font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--text);">₩${Math.round(total).toLocaleString()}</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--text3);margin-bottom:3px;">전체 기대수익</div>
          <div style="font-size:14px;font-weight:700;font-family:'JetBrains Mono',monospace;color:${totalEV>=0?'var(--green)':'var(--red)'};">
            ${totalEV>=0?'+':''}₩${Math.round(totalEV).toLocaleString()}
          </div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--text3);margin-bottom:3px;">기대 잔액</div>
          <div style="font-size:14px;font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--accent);">₩${Math.round(total+totalEV).toLocaleString()}</div>
        </div>
      </div>`;
  }

  // 결과 영역으로 스크롤
  resultEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── 조합 카드 HTML ──
function comboCardHTML(c, idx, perBet, icon) {
  const letters = c.combo.map((g, i) => {
    const li = _comboGames.findIndex(x => x.id === g.id);
    return String.fromCharCode(65 + li);
  });

  const evColor     = c.ev >= 0.1 ? 'var(--green)' : c.ev >= 0 ? 'var(--text2)' : 'var(--red)';
  const probColor   = c.calibProb >= 0.5 ? 'var(--green)' : c.calibProb >= 0.3 ? 'var(--warn)' : 'var(--red)';
  const oddsColor   = c.odds >= 5 ? 'var(--gold)' : c.odds >= 3 ? 'var(--accent)' : 'var(--text2)';

  const gameLines = c.combo.map((g, i) => {
    const li      = _comboGames.findIndex(x => x.id === g.id);
    const letter  = String.fromCharCode(65 + li);
    const prob    = parseFloat(g.myProb);
    const calibP  = _comboCalibrate(prob / 100) * 100;
    const diffStr = Math.abs(calibP - prob) >= 0.5
      ? ` <span style="font-size:10px;color:var(--text3);">→ 보정 ${calibP.toFixed(0)}%</span>`
      : '';
    return `<div style="font-size:11px;color:var(--text2);padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
      <span style="color:var(--text3);font-weight:700;">${letter}</span>
      ${g.name}
      <span style="float:right;font-family:'JetBrains Mono',monospace;color:var(--text3);">${parseFloat(g.odds).toFixed(2)}배 · ${prob}%${diffStr}</span>
    </div>`;
  }).join('');

  return `
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <div style="font-size:12px;font-weight:700;color:var(--text);">
        ${icon} ${idx}번 &nbsp;<span style="color:var(--text3);font-size:11px;">${c.n}폴더</span>
        &nbsp;<span style="font-size:11px;color:var(--text3);">[${letters.join('+')}]</span>
      </div>
      <div style="font-size:11px;color:var(--text3);">₩${Math.round(perBet).toLocaleString()}</div>
    </div>
    <div style="margin-bottom:8px;">${gameLines}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:4px;text-align:center;">
      <div>
        <div style="font-size:9px;color:var(--text3);margin-bottom:2px;">합산배당</div>
        <div style="font-size:13px;font-weight:800;font-family:'JetBrains Mono',monospace;color:${oddsColor};">${c.odds.toFixed(2)}</div>
      </div>
      <div>
        <div style="font-size:9px;color:var(--text3);margin-bottom:2px;">적중확률</div>
        <div style="font-size:13px;font-weight:800;font-family:'JetBrains Mono',monospace;color:${probColor};">${(c.calibProb*100).toFixed(1)}%</div>
      </div>
      <div>
        <div style="font-size:9px;color:var(--text3);margin-bottom:2px;">EV</div>
        <div style="font-size:13px;font-weight:800;font-family:'JetBrains Mono',monospace;color:${evColor};">${c.ev>=0?'+':''}${(c.ev*100).toFixed(1)}%</div>
      </div>
      <div>
        <div style="font-size:9px;color:var(--text3);margin-bottom:2px;">기대금액</div>
        <div style="font-size:12px;font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--text2);">₩${Math.round(c.expected).toLocaleString()}</div>
      </div>
    </div>
  </div>`;
}
