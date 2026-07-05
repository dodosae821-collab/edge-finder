// ============================================================
// combo_recommender.js — 조합 추천기
// 전략베팅 탭 > 조합기 탭
// ============================================================

let _comboGames = [];   // [{ id, name, odds, myProb, group }]
let _comboGroupCounter = 0;
let _comboLastRecov  = [];  // 마지막 생성된 원금회수용 조합 목록 (베팅 기록 전송용)
let _comboLastProfit = {};  // { 3: [...], 4: [...], 5: [...], 6: [...] } 폴더별 전체 후보
let _comboLastPerBet = 0;
let _comboDeathBands = {};   // 한 끗 사망 배당대 카운트 (통계 탭과 공용 계산)
let _comboDeathThr   = Infinity;   // 마지막 생성 기준 조합당 금액

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
  _comboProfitActiveTab = 0;
  _comboProfitPage      = 0;
  _comboProfitFilter    = [];
  _comboProfitSort      = 'ev';
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
    ? computeComboProb(legs, { guard: ss?.guardFactor })
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

  const games = _comboGames.filter(g =>
    g.name.trim() && parseFloat(g.odds) > 1 && parseFloat(g.myProb) > 0
  );
  if (games.length < 2) { showToast?.('경기를 2개 이상 입력해주세요.', 'warn'); return; }

  const ss       = window.App?._SS;
  const useCalib = !!(ss?.calibBuckets?.length);

  // ── 전체 후보 생성 (2~6폴더) ──
  const allCombos = [];
  for (let n = 2; n <= Math.min(6, games.length); n++) {
    for (const combo of _comboCombinations(games, n)) {
      if (!_comboIsValid(combo)) continue;
      const stats = _comboStats(combo, perBet, useCalib);
      allCombos.push({ combo, n, ...stats, recovRate: stats.calibProb * stats.odds });
    }
  }
  if (allCombos.length === 0) { showToast?.('가능한 조합이 없어요.', 'warn'); return; }

  // ════════════════════════════════════════════════════
  // 🛡️ 원금회수용 선정
  //
  //  목적: recovN개 조합의 배당이 2~4배대여서,
  //        몇 개만 맞춰도 합산해서 총 투입금(total)에 근접하게 회수.
  //        "조합 하나 = 10만원 투입 → 20~40만원 회수"
  //        → 2개 맞으면 40~80만원, 3개 맞으면 충분히 100만원 복구.
  //
  //  조건:
  //    1. 2~3폴더만 (현실적으로 맞출 수 있는 수)
  //    2. 배당 목표 구간: 총액 / (recovN × perBet) 이상
  //       = total / (recovN * perBet) → 기본값 1000000/(4*100000) = 2.5배
  //       즉, recovN개 전부 맞으면 100% 회수 가능한 최소 배당
  //    3. 배당 상한: 너무 높으면 적중이 어려워 회수 전략이 무의미 → 5.0배 이하
  //    4. 정렬: 적중확률 높은 순 → 기대회수율 보조
  //    5. 다양성: 경기 조합이 겹치지 않도록 분산
  // ════════════════════════════════════════════════════
  const recovTargetOdds = total / (recovN * perBet); // e.g. 2.5배
  const recovMaxOdds    = 5.5;                        // 이 이상이면 회수 전략 부적합

  let recovPool = allCombos
    .filter(c => c.n <= 3 && c.odds >= recovTargetOdds && c.odds <= recovMaxOdds)
    .sort((a, b) => b.calibProb !== a.calibProb ? b.calibProb - a.calibProb : b.recovRate - a.recovRate);

  // 부족하면 배당 상한 완화
  if (recovPool.length < recovN) {
    recovPool = allCombos
      .filter(c => c.n <= 3 && c.odds >= recovTargetOdds)
      .sort((a, b) => b.calibProb - a.calibProb);
  }
  // 그래도 부족하면 2~3폴더 전체에서 확률 높은 순
  if (recovPool.length < recovN) {
    recovPool = allCombos
      .filter(c => c.n <= 3)
      .sort((a, b) => b.calibProb - a.calibProb);
  }

  const selectedRecov = _comboPickDiverse(recovPool, recovN);

  // ════════════════════════════════════════════════════
  // 💰 수익용: 폴더별 전체 후보 분류 (쇼핑 탭 방식)
  //   원금회수용과 중복된 조합은 제외
  //   각 폴더(3~6)별로 EV 내림차순 전체 후보 보관
  //   사용자가 탭을 눌러 보면서 원하는 조합을 직접 선택
  // ════════════════════════════════════════════════════
  const recovIds = new Set(selectedRecov.map(c => c.combo.map(g => g.id).sort().join(',')));
  const profitByFolder = {};
  [3, 4, 5, 6].forEach(f => {
    profitByFolder[f] = allCombos
      .filter(c => c.n === f && !recovIds.has(c.combo.map(g => g.id).sort().join(',')))
      .sort((a, b) => b.ev - a.ev);
  });

  _comboLastRecov  = selectedRecov;
  _comboLastProfit = profitByFolder;   // { 3:[...], 4:[...], 5:[...], 6:[...] }
  // 한 끗 사망 배당대 캐시 (카드 뱃지용) — 전체 한끗의 25%+ 집중 배당대만 경고
  try {
    const _oms = (typeof computeOneMissStats === 'function') ? computeOneMissStats() : null;
    _comboDeathBands = _oms ? _oms.byOdds : {};
    _comboDeathThr   = _oms ? Math.max(8, _oms.oneMissN * 0.25) : Infinity;
  } catch (e) { _comboDeathBands = {}; _comboDeathThr = Infinity; }
  _comboLastPerBet = perBet;
  comboRenderResult(selectedRecov, profitByFolder, perBet, total, useCalib, ss);
}

// ── 원금회수용: 경기 분산 보장 선정 ──
function _comboPickDiverse(sorted, n) {
  if (n <= 0) return [];
  const picked = [], usedKeys = new Set(), gameCount = {};
  const maxAppear = Math.max(2, Math.ceil(n * 0.6));

  for (const c of sorted) {
    const key = c.combo.map(g => g.id).sort().join(',');
    if (usedKeys.has(key)) continue;
    const exceed = c.combo.some(g => (gameCount[g.id] || 0) >= maxAppear);
    if (exceed && picked.length < Math.floor(n * 0.5)) continue;
    usedKeys.add(key);
    c.combo.forEach(g => { gameCount[g.id] = (gameCount[g.id] || 0) + 1; });
    picked.push(c);
    if (picked.length >= n) break;
  }
  // 부족하면 다양성 완화해서 채움
  if (picked.length < n) {
    for (const c of sorted) {
      const key = c.combo.map(g => g.id).sort().join(',');
      if (usedKeys.has(key)) continue;
      usedKeys.add(key);
      picked.push(c);
      if (picked.length >= n) break;
    }
  }
  return picked;
}

// ── 수익용: 폴더 수 쿼터 고정 분배 ──
// profitN개를 6폴더:1 / 5폴더:2 / 4폴더:2 / 3폴더:1 비율로 분배
// (가용 폴더 수와 후보가 부족하면 자동 조정)
function _comboPickByFolderQuota(sorted, n) {
  if (n <= 0) return [];

  // 기본 쿼터 템플릿 (n=6 기준)
  // [폴더수, 기준 비중]  — 6폴더 1개 고정, 5폴더 2개, 4폴더 2개, 3폴더 1개
  const template = [[6, 1], [5, 2], [4, 2], [3, 1]];
  // n에 맞게 스케일 (총합 6 기준으로 비율 계산)
  const totalWeight = template.reduce((s, [, w]) => s + w, 0); // 6
  const rawQuota    = template.map(([f, w]) => [f, Math.round(w * n / totalWeight)]);

  // 쿼터 합계를 n에 맞게 보정
  let quotaMap = {};
  rawQuota.forEach(([f, q]) => { quotaMap[f] = q; });
  let diff = n - Object.values(quotaMap).reduce((s, v) => s + v, 0);
  // 차이는 3폴더에 흡수
  quotaMap[3] = Math.max(0, (quotaMap[3] || 0) + diff);

  // 6폴더는 항상 최대 1개
  if ((quotaMap[6] || 0) > 1) {
    quotaMap[3] = (quotaMap[3] || 0) + (quotaMap[6] - 1);
    quotaMap[6] = 1;
  }

  // 폴더별 버킷 (EV 내림차순 정렬)
  const buckets = {};
  [3, 4, 5, 6].forEach(f => {
    buckets[f] = sorted.filter(c => c.n === f);
  });

  const picked = [], usedKeys = new Set(), gameCount = {};
  const maxAppear = Math.max(2, Math.ceil(n * 0.55));

  // 폴더 수 내림차순(6→3)으로 쿼터만큼 선택
  [6, 5, 4, 3].forEach(f => {
    let q = quotaMap[f] || 0;
    for (const c of (buckets[f] || [])) {
      if (q <= 0) break;
      const key = c.combo.map(g => g.id).sort().join(',');
      if (usedKeys.has(key)) continue;
      const exceed = c.combo.some(g => (gameCount[g.id] || 0) >= maxAppear);
      if (exceed) continue;
      usedKeys.add(key);
      c.combo.forEach(g => { gameCount[g.id] = (gameCount[g.id] || 0) + 1; });
      picked.push(c);
      q--;
    }
  });

  // 쿼터 못 채운 경우(해당 폴더 수 후보 부족) — 남은 최고 EV로 채움
  if (picked.length < n) {
    for (const c of sorted) {
      const key = c.combo.map(g => g.id).sort().join(',');
      if (usedKeys.has(key)) continue;
      usedKeys.add(key);
      picked.push(c);
      if (picked.length >= n) break;
    }
  }

  // 표시 순서: 폴더 수 내림차순 (6→3)
  return picked.sort((a, b) => b.n - a.n);
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
function comboRenderResult(recov, profitByFolder, perBet, total, useCalib, ss) {
  const resultEl = document.getElementById('combo-result');
  if (resultEl) resultEl.style.display = 'block';

  // calibration 안내
  const noteEl = document.getElementById('combo-calib-note');
  if (noteEl) {
    const gf = ss?.guardFactor ?? 1.0, gn = ss?.guardN ?? 0;
    if (gn >= 10 && gf < 0.999) {
      noteEl.textContent = `🛡 과신 방어 적용 — 최근 ${gn}건 기준 계수 ×${gf.toFixed(2)} (기록 회복 시 자동 해제)`;
      noteEl.style.color = 'var(--warn)';
    } else if (gn >= 10) {
      noteEl.textContent = `✅ 최근 ${gn}건 기준 예측 신뢰 — 입력 승률 그대로 사용 (계수 1.00)`;
      noteEl.style.color = 'var(--green)';
    } else {
      noteEl.textContent = '⚠️ 판정 기록 10건 미만 — 과신 방어 미적용, 입력 승률 그대로 사용';
      noteEl.style.color = 'var(--warn)';
    }
  }

  // 원금회수용
  document.getElementById('combo-recovery-list').innerHTML =
    recov.map((c, i) => comboCardHTML(c, i + 1, perBet, 'recovery')).join('');

  // 수익용 탭 UI 렌더
  comboRenderProfitTabs(profitByFolder, perBet);

  // 요약 (원금회수용 기준)
  const recovEV = recov.reduce((s, c) => s + c.ev * perBet, 0);
  const sumEl   = document.getElementById('combo-summary');
  if (sumEl) {
    const allProfitFlat = Object.values(profitByFolder).flat();
    const profitCount   = allProfitFlat.length;
    sumEl.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:center;">
        <div>
          <div style="font-size:10px;color:var(--text3);margin-bottom:3px;">총 투입</div>
          <div style="font-size:14px;font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--text);">₩${Math.round(total).toLocaleString()}</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--text3);margin-bottom:3px;">회수용 기대수익</div>
          <div style="font-size:14px;font-weight:700;font-family:'JetBrains Mono',monospace;color:${recovEV>=0?'var(--green)':'var(--red)'};">
            ${recovEV>=0?'+':''}₩${Math.round(recovEV).toLocaleString()}
          </div>
        </div>
      </div>
      <div style="font-size:10px;color:var(--text3);text-align:center;margin-top:8px;">
        💰 수익용 후보 총 ${profitCount}개 — 탭에서 골라 담으세요
      </div>`;
  }

  resultEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── 수익용 뷰 상태 ──
let _comboProfitActiveTab  = 0;      // 현재 활성 폴더 탭
let _comboProfitPage       = 0;      // 현재 페이지 (0-based)
let _comboProfitSort       = 'ev';   // 'ev' | 'odds' | 'prob'
let _comboProfitFilter     = [];     // 반드시 포함할 경기 id 목록
const COMBO_PAGE_SIZE      = 5;

// ── 수익용 폴더 탭 + 필터 + 정렬 + 페이지네이션 렌더 ──
function comboRenderProfitTabs(profitByFolder, perBet) {
  const tabsEl = document.getElementById('combo-profit-tabs');
  const listEl = document.getElementById('combo-profit-list');
  if (!tabsEl || !listEl) return;

  const availFolders = [3, 4, 5, 6].filter(f => (profitByFolder[f] || []).length > 0);
  if (availFolders.length === 0) {
    tabsEl.innerHTML = '';
    listEl.innerHTML = '<div style="text-align:center;color:var(--text3);font-size:12px;padding:16px;">가능한 수익 조합이 없어요</div>';
    return;
  }
  if (!availFolders.includes(_comboProfitActiveTab)) {
    _comboProfitActiveTab = availFolders[0];
    _comboProfitPage      = 0;
    _comboProfitFilter    = [];
  }

  // ── 1. 폴더 탭 버튼 ──
  const folderTabsHTML = availFolders.map(f => {
    const isActive = f === _comboProfitActiveTab;
    const cnt      = profitByFolder[f].length;
    return `<button onclick="comboProfitTabSwitch(${f})"
      style="padding:6px 14px;font-size:11px;font-weight:700;border-radius:20px;cursor:pointer;
             border:1px solid ${isActive ? 'var(--gold)' : 'var(--border)'};
             background:${isActive ? 'rgba(255,215,0,0.15)' : 'var(--bg3)'};
             color:${isActive ? 'var(--gold)' : 'var(--text3)'};white-space:nowrap;">
      ${f}폴더 <span style="font-size:10px;opacity:0.7;">${cnt}</span>
    </button>`;
  }).join('');

  // ── 2. 경기 필터 칩 (A~H 레터) ──
  const gameLetters = _comboGames.map((g, i) => ({
    id: g.id,
    letter: String.fromCharCode(65 + i),
    name: g.name || ('경기 ' + String.fromCharCode(65 + i))
  }));
  const filterHTML = `
    <div style="margin-top:8px;display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
      <span style="font-size:10px;color:var(--text3);">포함 경기:</span>
      ${gameLetters.map(g => {
        const on = _comboProfitFilter.includes(String(g.id));
        return `<button onclick="comboProfitFilterToggle('${g.id}')"
          title="${g.name}"
          style="padding:3px 9px;font-size:11px;font-weight:700;border-radius:12px;cursor:pointer;
                 border:1px solid ${on ? 'var(--accent)' : 'var(--border)'};
                 background:${on ? 'rgba(0,229,255,0.15)' : 'var(--bg3)'};
                 color:${on ? 'var(--accent)' : 'var(--text3)'};">
          ${g.letter}
        </button>`;
      }).join('')}
      ${_comboProfitFilter.length > 0
        ? `<button onclick="comboProfitFilterClear()"
             style="padding:3px 8px;font-size:10px;border-radius:10px;cursor:pointer;
                    border:1px solid var(--border);background:transparent;color:var(--text3);">초기화</button>`
        : ''}
    </div>`;

  // ── 3. 정렬 버튼 ──
  const sortHTML = `
    <div style="margin-top:6px;display:flex;gap:5px;align-items:center;">
      <span style="font-size:10px;color:var(--text3);">정렬:</span>
      ${[['ev','EV순'],['odds','배당순'],['prob','확률순']].map(([v,l]) => {
        const on = _comboProfitSort === v;
        return `<button onclick="comboProfitSortSwitch('${v}')"
          style="padding:3px 10px;font-size:10px;font-weight:700;border-radius:12px;cursor:pointer;
                 border:1px solid ${on ? 'rgba(255,215,0,0.5)' : 'var(--border)'};
                 background:${on ? 'rgba(255,215,0,0.1)' : 'transparent'};
                 color:${on ? 'var(--gold)' : 'var(--text3)'};">${l}</button>`;
      }).join('')}
    </div>`;

  tabsEl.innerHTML = folderTabsHTML + filterHTML + sortHTML;

  // ── 4. 후보 필터링 + 정렬 ──
  let pool = [...(profitByFolder[_comboProfitActiveTab] || [])];

  // 경기 포함 필터 적용
  if (_comboProfitFilter.length > 0) {
    pool = pool.filter(c => _comboProfitFilter.every(fid => c.combo.some(g => String(g.id) === fid)));
  }

  // 정렬
  if (_comboProfitSort === 'odds')    pool.sort((a, b) => b.odds - a.odds);
  else if (_comboProfitSort === 'prob') pool.sort((a, b) => b.calibProb - a.calibProb);
  else                                  pool.sort((a, b) => b.ev - a.ev);

  const total   = pool.length;
  const maxPage = Math.max(0, Math.ceil(total / COMBO_PAGE_SIZE) - 1);
  if (_comboProfitPage > maxPage) _comboProfitPage = 0;
  const page    = _comboProfitPage;
  const sliced  = pool.slice(page * COMBO_PAGE_SIZE, (page + 1) * COMBO_PAGE_SIZE);

  // ── 5. 카드 렌더 ──
  if (total === 0) {
    listEl.innerHTML = `<div style="text-align:center;color:var(--text3);font-size:12px;padding:16px;">
      선택한 조건에 맞는 조합이 없어요
    </div>`;
    return;
  }

  // 페이지네이션 바 (위)
  const pageBar = total > COMBO_PAGE_SIZE ? `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <span style="font-size:10px;color:var(--text3);">
        ${_comboProfitFilter.length > 0 ? `<span style="color:var(--accent);">필터 ${_comboProfitFilter.length}개 적용</span> · ` : ''}
        ${total}개 중 ${page * COMBO_PAGE_SIZE + 1}–${Math.min((page+1)*COMBO_PAGE_SIZE, total)}번
      </span>
      <div style="display:flex;gap:6px;">
        <button onclick="comboProfitPageMove(-1)" ${page===0?'disabled':''} style="padding:4px 10px;font-size:11px;border-radius:8px;cursor:pointer;border:1px solid var(--border);background:var(--bg3);color:${page===0?'var(--text3)':'var(--text2)'};">◀</button>
        <span style="font-size:11px;color:var(--text2);padding:4px 2px;">${page+1} / ${maxPage+1}</span>
        <button onclick="comboProfitPageMove(1)" ${page>=maxPage?'disabled':''} style="padding:4px 10px;font-size:11px;border-radius:8px;cursor:pointer;border:1px solid var(--border);background:var(--bg3);color:${page>=maxPage?'var(--text3)':'var(--text2)'};">▶</button>
      </div>
    </div>` : `<div style="font-size:10px;color:var(--text3);margin-bottom:6px;">
      ${_comboProfitFilter.length > 0 ? `<span style="color:var(--accent);">필터 ${_comboProfitFilter.length}개 적용</span> · ` : ''}총 ${total}개
    </div>`;

  listEl.innerHTML = pageBar + sliced
    .map((c, i) => comboCardHTML(c, page * COMBO_PAGE_SIZE + i + 1, perBet, 'profit'))
    .join('');
}

// ── 탭 / 필터 / 정렬 / 페이지 조작 ──
function comboProfitTabSwitch(folder) {
  _comboProfitActiveTab = folder;
  _comboProfitPage      = 0;
  _comboProfitFilter    = [];
  comboRenderProfitTabs(_comboLastProfit, _comboLastPerBet);
}
function comboProfitFilterToggle(gameId) {
  const sid = String(gameId);
  const idx = _comboProfitFilter.indexOf(sid);
  if (idx >= 0) _comboProfitFilter.splice(idx, 1);
  else           _comboProfitFilter.push(sid);
  _comboProfitPage = 0;
  comboRenderProfitTabs(_comboLastProfit, _comboLastPerBet);
}
function comboProfitFilterClear() {
  _comboProfitFilter = [];
  _comboProfitPage   = 0;
  comboRenderProfitTabs(_comboLastProfit, _comboLastPerBet);
}
function comboProfitSortSwitch(sortKey) {
  _comboProfitSort = sortKey;
  _comboProfitPage = 0;
  comboRenderProfitTabs(_comboLastProfit, _comboLastPerBet);
}
function comboProfitPageMove(dir) {
  _comboProfitPage = Math.max(0, _comboProfitPage + dir);
  comboRenderProfitTabs(_comboLastProfit, _comboLastPerBet);
}

// ── 조합 카드 HTML ──
function comboCardHTML(c, idx, perBet, kind) {
  const letters = c.combo.map((g, i) => {
    const li = _comboGames.findIndex(x => x.id === g.id);
    return String.fromCharCode(65 + li);
  });

  const evColor     = c.ev >= 0.1 ? 'var(--green)' : c.ev >= 0 ? 'var(--text2)' : 'var(--red)';
  const probColor   = c.calibProb >= 0.5 ? 'var(--green)' : c.calibProb >= 0.3 ? 'var(--warn)' : 'var(--red)';
  const oddsColor   = c.odds >= 5 ? 'var(--gold)' : c.odds >= 3 ? 'var(--accent)' : 'var(--text2)';
  // 섹션별 특화 지표
  const recovRate   = c.recovRate ?? (c.calibProb * c.odds);
  const recovColor  = recovRate >= 1.0 ? 'var(--green)' : recovRate >= 0.88 ? 'var(--warn)' : 'var(--red)';
  const multiplier  = c.odds;  // 수익용: 배당 = 투자 대비 회수 배수

  const gameLines = c.combo.map((g, i) => {
    const li      = _comboGames.findIndex(x => x.id === g.id);
    const letter  = String.fromCharCode(65 + li);
    const prob    = parseFloat(g.myProb);
    // 보정은 결합 확률 단위로만 적용됨 — 레그별 보정 표시는 제거 (오해 방지)
    const calibP  = prob;
    const diffStr = Math.abs(calibP - prob) >= 0.5
      ? ` <span style="font-size:10px;color:var(--text3);">→ 보정 ${calibP.toFixed(0)}%</span>`
      : '';
    return `<div style="font-size:11px;color:var(--text2);padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
      <span style="color:var(--text3);font-weight:700;">${letter}</span>
      ${g.name}
      <span style="float:right;font-family:'JetBrains Mono',monospace;color:var(--text3);">${(() => {
        const _b = (typeof _oddsBand === 'function') ? _oddsBand(parseFloat(g.odds)) : null;
        const _c = _b ? (_comboDeathBands[_b] || 0) : 0;
        return _c >= _comboDeathThr
          ? `<span title="이 배당대 레그가 한 끗 낙첨에서 ${_c}회 사망 — 상습 사망 구간" style="color:var(--red);font-size:10px;">💀${_c} </span>`
          : '';
      })()}${parseFloat(g.odds).toFixed(2)}배 · ${prob}%${diffStr}</span>
    </div>`;
  }).join('');

  return `
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <div style="font-size:12px;font-weight:700;color:var(--text);">
        ${kind==='recovery'?'🛡️':'💰'} ${idx}번 &nbsp;<span style="color:var(--text3);font-size:11px;">${c.n}폴더</span>
        &nbsp;<span style="font-size:11px;color:var(--text3);">[${letters.join('+')}]</span>
      </div>
      <div style="font-size:11px;color:var(--text3);">₩${Math.round(perBet).toLocaleString()}</div>
    </div>
    <div style="margin-bottom:8px;">${gameLines}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:4px;text-align:center;margin-bottom:6px;">
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
        ${(() => {
          const rawEV = c.rawProb * (c.odds - 1) - (1 - c.rawProb);
          return Math.abs(rawEV - c.ev) >= 0.01
            ? `<div style="font-size:8px;color:var(--text3);text-decoration:line-through;">${rawEV>=0?'+':''}${(rawEV*100).toFixed(1)}%</div>`
            : '';
        })()}
      </div>
      <div>
        ${kind === 'recovery'
          ? `<div style="font-size:9px;color:var(--text3);margin-bottom:2px;">기대회수율</div>
             <div style="font-size:13px;font-weight:800;font-family:'JetBrains Mono',monospace;color:${recovColor};">${(recovRate*100).toFixed(0)}%</div>`
          : `<div style="font-size:9px;color:var(--text3);margin-bottom:2px;">기대금액</div>
             <div style="font-size:12px;font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--text2);">₩${Math.round(c.expected).toLocaleString()}</div>`
        }
      </div>
    </div>
    ${kind === 'recovery'
      ? `<div style="font-size:10px;color:var(--text3);text-align:center;margin-bottom:6px;">
           적중 시 <span style="color:#4fc3f7;font-weight:700;">₩${Math.round(perBet * c.odds).toLocaleString()}</span> 회수
           <span style="color:var(--text3);"> (투입 ₩${Math.round(perBet).toLocaleString()})</span>
         </div>`
      : `<div style="font-size:10px;color:var(--text3);text-align:center;margin-bottom:6px;">
           적중 시 <span style="color:var(--gold);font-weight:700;">₩${Math.round(perBet * c.odds).toLocaleString()}</span>
           <span style="color:var(--text3);"> (+₩${Math.round(perBet * c.odds - perBet).toLocaleString()} 수익)</span>
         </div>`
    }
    <button onclick="comboSendToRecord('${kind}',${idx - 1})"
      style="width:100%;padding:7px;font-size:11px;font-weight:700;background:rgba(0,229,255,0.08);border:1px solid rgba(0,229,255,0.3);border-radius:6px;color:var(--accent);cursor:pointer;">
      📝 이 조합 베팅 기록에 담기
    </button>
  </div>`;
}

// ── 선택한 조합을 베팅 기록 입력폼(다폴더)으로 전송 ──
// 각 경기의 배당/승률을 폴더 행에 그대로 채워 넣어 comboGenerate와
// 동일한 계산 경로(calcMultiEV)로 합산 배당·보정 승률이 재계산되게 한다.
function comboSendToRecord(kind, idx) {
  let c;
  if (kind === 'recovery') {
    c = _comboLastRecov && _comboLastRecov[idx];
  } else {
    // 현재 뷰(탭+필터+정렬)와 동일한 풀에서 idx 조합 찾기
    let pool = [...(_comboLastProfit[_comboProfitActiveTab] || [])];
    if (_comboProfitFilter.length > 0) {
      pool = pool.filter(combo => _comboProfitFilter.every(fid => combo.combo.some(g => String(g.id) === fid)));
    }
    if (_comboProfitSort === 'odds')      pool.sort((a, b) => b.odds - a.odds);
    else if (_comboProfitSort === 'prob') pool.sort((a, b) => b.calibProb - a.calibProb);
    else                                   pool.sort((a, b) => b.ev - a.ev);
    // idx는 카드의 1-based 전체 번호 → 0-based 배열 인덱스
    c = pool[idx - 1];
  }
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
