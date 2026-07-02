// ============================================================
// combo_recommender.js — 조합 추천기
// 전략베팅 탭 > 조합기 탭
// ============================================================

let _comboGames = [];   // [{ id, name, odds, myProb, group }]
let _comboGroupCounter = 0;
let _comboLastRecov  = [];  // 마지막 생성된 원금회수용 조합 목록 (베팅 기록 전송용)
let _comboLastProfit = [];  // 마지막 생성된 수익용 조합 목록 (베팅 기록 전송용)
let _comboLastPerBet = 0;   // 마지막 생성 기준 조합당 금액

// ── 초기화 (탭 진입 시 호출) ──
function comboInit() {
  if (_comboGames.length === 0) comboAddGame();
  comboRenderGames();
  comboUpdatePerBet();
}

// ── 전체 초기화 ──
function comboReset() {
  if (!confirm('경기 입력 내용과 생성된 조합을 모두 초기화할까요?')) return;
  _comboGames.length = 0;
  _comboIdCounter    = 0;
  comboAddGame();                           // 빈 행 1개로 리셋
  const result = document.getElementById('combo-result');
  if (result) result.style.display = 'none';
  const recovList = document.getElementById('combo-recovery-list');
  const profList  = document.getElementById('combo-profit-list');
  if (recovList) recovList.innerHTML = '';
  if (profList)  profList.innerHTML  = '';
  const summary = document.getElementById('combo-summary');
  if (summary) summary.textContent = '';
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

  // 이전 드롭다운 포탈 정리 (재렌더 시 중복 방지)
  document.querySelectorAll('.combo-suggest-portal').forEach(el => el.remove());

  list.innerHTML = _comboGames.map((g, idx) => {
    const implied = parseFloat(g.odds) > 1 ? (1 / parseFloat(g.odds) * 100).toFixed(1) + '%' : '—';
    const letter  = String.fromCharCode(65 + idx); // A, B, C ...
    return `
    <div style="display:grid;grid-template-columns:28px 1fr 72px 60px 60px 54px 28px;gap:4px;margin-bottom:6px;align-items:center;">
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-align:center;">${letter}</div>
      <div>
        <input type="text" id="combo-name-${g.id}" placeholder="경기명/선택" value="${g.name}"
          style="padding:7px 8px;font-size:12px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text2);outline:none;width:100%;box-sizing:border-box;"
          oninput="comboGameChange(${g.id},'name',this.value);comboNameInput(${g.id},this.value)"
          onblur="comboCloseSuggest(${g.id})" autocomplete="off">
      </div>
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

// ── 경기명 자동완성 ──
// document.body에 포탈 div를 붙여 position:fixed로 띄움
// → 부모 .card의 overflow:hidden / 조상 overflow:auto 완전 회피
function comboNameInput(id, val) {
  const input = document.getElementById('combo-name-' + id);
  if (!input) return;

  // 기존 포탈 제거
  comboCloseSuggest(id);

  if (!val || val.trim().length < 1) return;

  const list    = window._gameSuggestList || (typeof getGameSuggestList === 'function' ? getGameSuggestList() : []);
  const matches = list.filter(n => n.includes(val)).slice(0, 8);
  if (!matches.length) return;

  // 입력 필드 위치 계산 (fixed 기준)
  const rect = input.getBoundingClientRect();

  // 포탈 div 생성 후 body에 직접 추가
  const portal = document.createElement('div');
  portal.className = 'combo-suggest-portal';
  portal.dataset.suggestId = String(id);
  portal.style.cssText = [
    'position:fixed',
    `top:${rect.bottom + 2}px`,
    `left:${rect.left}px`,
    `width:${rect.width}px`,
    'background:var(--bg2)',
    'border:1px solid var(--border)',
    'border-radius:6px',
    'z-index:9000',
    'max-height:200px',
    'overflow-y:auto',
    'box-shadow:0 4px 20px rgba(0,0,0,0.5)',
  ].join(';');

  portal.innerHTML = matches.map((n, i) => `
    <div data-idx="${i}"
      style="padding:9px 12px;font-size:13px;color:var(--text2);cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05);"
      onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      ${typeof escHtml === 'function' ? escHtml(n) : n}
    </div>`).join('');

  portal.querySelectorAll('[data-idx]').forEach(el => {
    const idx = Number(el.dataset.idx);
    // mousedown + preventDefault: blur 보다 먼저 실행되어 선택이 사라지지 않음
    el.addEventListener('mousedown', e => {
      e.preventDefault();
      comboSelectSuggest(id, matches[idx]);
    });
  });

  document.body.appendChild(portal);
}

function comboSelectSuggest(id, name) {
  const input = document.getElementById('combo-name-' + id);
  if (input) input.value = name;
  comboGameChange(id, 'name', name);
  comboCloseSuggest(id);
  if (input) input.focus();
}

function comboCloseSuggest(id) {
  // 포탈 방식: document.body에 붙은 div를 data-suggest-id로 찾아 제거
  const portal = document.querySelector(`.combo-suggest-portal[data-suggest-id="${id}"]`);
  if (portal) portal.remove();
}

// ── 유효성 검증 (그룹 충돌) ──
function _comboIsValid(combo) {
  const groups = combo.map(g => g.group).filter(g => g && g.trim() !== '');
  return groups.length === new Set(groups).size;
}

// ── 조합 통계 계산 — ev.js의 computeComboProb 엔진 공용 사용 ──
function _comboStats(combo, perBet, useCalib) {
  const ss   = window.App?._SS;
  const legs = combo.map(g => ({ odds: parseFloat(g.odds), prob: parseFloat(g.myProb) }));

  const result = (typeof computeComboProb === 'function')
    ? computeComboProb(legs, useCalib ? { buckets: ss?.calibBuckets, acf: ss?.activeCorrFactor } : {})
    : (() => {
        // 폴백: computeComboProb 미로드 시 (로드 순서 문제 방어)
        let rawOdds = 1, logRaw = 0;
        legs.forEach(l => { rawOdds *= l.odds; logRaw += Math.log(Math.max(l.prob / 100, 1e-9)); });
        const finalOdds = Math.ceil(rawOdds * 10) / 10;
        const calibProb = Math.exp(logRaw);
        return { finalOdds, rawProb: calibProb, calibProb, ev: calibProb * (finalOdds - 1) - (1 - calibProb) };
      })();

  const finalOdds = result.finalOdds;
  const calibProb = useCalib ? result.calibProb : result.rawProb;
  const ev        = calibProb * (finalOdds - 1) - (1 - calibProb);
  const expected  = perBet * calibProb * finalOdds;
  return { odds: finalOdds, rawProb: result.rawProb, calibProb, ev, expected };
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

  // ── 베팅 기록 전송용으로 마지막 결과 저장 ──
  _comboLastRecov  = selectedRecov;
  _comboLastProfit = selectedProfit;
  _comboLastPerBet = perBet;

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
    recov.map((c, i) => comboCardHTML(c, i + 1, perBet, '🛡️', 'recovery')).join('');

  document.getElementById('combo-profit-list').innerHTML =
    profit.map((c, i) => comboCardHTML(c, i + 1, perBet, '💰', 'profit')).join('');

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
function comboCardHTML(c, idx, perBet, icon, kind) {
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
    // computeComboProb을 단일 레그로 호출해 보정 확률 표시 (카드 UI용)
    const ss      = window.App?._SS;
    const useCalib = !!(ss?.calibBuckets?.length);
    const _singleResult = useCalib && typeof computeComboProb === 'function'
      ? computeComboProb([{ odds: parseFloat(g.odds), prob }], { buckets: ss.calibBuckets, acf: ss.activeCorrFactor })
      : null;
    const calibP  = _singleResult ? _singleResult.calibProb * 100 : prob;
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
    <button onclick="comboSendToRecord('${kind}',${idx - 1})"
      style="width:100%;margin-top:8px;padding:7px;font-size:11px;font-weight:700;background:rgba(0,229,255,0.08);border:1px solid rgba(0,229,255,0.3);border-radius:6px;color:var(--accent);cursor:pointer;">
      📝 이 조합 베팅 기록에 담기
    </button>
  </div>`;
}

// ── 선택한 조합을 베팅 기록 입력폼(다폴더)으로 전송 ──
// 각 경기의 배당/승률을 폴더 행에 그대로 채워 넣어 comboGenerate와
// 동일한 계산 경로(calcMultiEV)로 합산 배당·보정 승률이 재계산되게 한다.
function comboSendToRecord(kind, idx) {
  const list = kind === 'recovery' ? _comboLastRecov : _comboLastProfit;
  const c = list && list[idx];
  if (!c) { showToast?.('조합 정보를 찾을 수 없어요. 다시 생성해주세요.', 'warn'); return; }

  if (typeof setBetMode === 'function') setBetMode('multi');

  // ⚠️ setBetMode('multi')는 내부에서 setTimeout(renderFolderRows, 0)으로
  // 폴더 행 전체를 다시 그린다(= 지금 채운 값이 전부 지워짐).
  // 따라서 폼 채우기는 그 재렌더가 끝난 "다음 틱"으로 미뤄야 한다.
  setTimeout(() => _comboFillRecordForm(c), 30);
}

// ── 실제 폼 채우기 (renderFolderRows 재렌더 이후 실행) ──
function _comboFillRecordForm(c) {
  const n = c.combo.length;
  const folderVal = n <= 3 ? String(n) : '4+';
  const targetBtn = document.querySelector(`.folder-btn[data-val="${folderVal}"]`);
  if (targetBtn && typeof selectFolderCount === 'function') selectFolderCount(targetBtn);

  const container = document.getElementById('folder-rows');
  if (container) {
    const existingRows = container.querySelectorAll('.folder-row');
    const need = n - existingRows.length;
    if (need > 0 && typeof makeFolderRow === 'function') {
      for (let i = 0; i < need; i++) {
        container.appendChild(makeFolderRow(existingRows.length + i));
      }
    }
  }

  const allRows = container ? container.querySelectorAll('.folder-row') : [];
  c.combo.forEach((g, i) => {
    const domRow = allRows[i];
    if (!domRow) return;

    const oddsInput = domRow.querySelector('.folder-odds');
    if (oddsInput) {
      oddsInput.value = parseFloat(g.odds).toFixed(2);
      oddsInput.dispatchEvent(new Event('input'));
    }

    const probInput = domRow.querySelector('.folder-prob');
    if (probInput) {
      probInput.value = g.myProb;
      probInput.dispatchEvent(new Event('input'));
    }

    const memoInput = domRow.querySelector('.folder-memo');
    if (memoInput && g.name) {
      memoInput.value = g.name;
      const memoWrap = domRow.querySelector('.folder-memo-wrap');
      const memoBtn  = domRow.querySelector('.folder-memo-btn');
      if (memoWrap) { memoWrap.style.display = 'block'; if (memoBtn) memoBtn.style.color = 'var(--accent)'; }
    }
  });

  if (typeof updateFolderUI === 'function') updateFolderUI();

  // 경기명 요약
  const gameEl = document.getElementById('r-game');
  if (gameEl) gameEl.value = c.combo.map(g => g.name).filter(Boolean).join(' / ');

  // 조합당 금액도 함께 전달
  const amtEl = document.getElementById('r-amount');
  if (amtEl && _comboLastPerBet) {
    amtEl.value = Math.round(_comboLastPerBet);
    amtEl.dispatchEvent(new Event('input'));
  }

  // 오늘 날짜 (비어있을 때만)
  const dateEl = document.getElementById('r-date');
  if (dateEl && !dateEl.value && typeof _todayKST === 'function') dateEl.value = _todayKST();

  if (typeof calcMultiEV === 'function') setTimeout(calcMultiEV, 50);

  // 베팅 기록 탭으로 이동
  if (typeof switchTab === 'function') {
    const recordTab = document.querySelector('.tab[onclick*="record"]');
    switchTab('record', recordTab);
  }

  showToast?.('조합을 베팅 기록에 담았어요 — 확인 후 저장하세요.', 'success');
}
