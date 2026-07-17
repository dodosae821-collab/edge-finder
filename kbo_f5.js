// ============================================================
// KBO F5 프로토콜 (v83) — v1.0 판정 · 경기 카드 · 이중 원장
//
// 역할 분리 (설계 계약):
//   · kbo_engine.js = 두뇌: v1.0 전체 스택(L1+L2+L3+안정) 판정. 골든 테스트 보증.
//   · 이 파일 = 실전 창구: 경기/투수 판정 표시 · 원장 기록 · 추적.
//
// v83 변경 (인계문서 v71 반영):
//   · 스키마 v2 — 구(v1) 스냅샷은 거부하고 DB 모드 재계산 안내
//   · 경기 판정 카드: 홈/원정 선발 + 기준점 + 배당 → v1.0 판정 (kboJudgeGame)
//     - 미검증 선발 포함 → 시스템 PASS (L-49 ①) · 신호 충돌 → PASS
//   · 이중 원장 (L-52): 시스템 원장(신호 픽만) / 감독자 원장(재량 픽)
//     - 경기 시작 전 기록만 공식 — 사후 등록 금지는 사용자 규율
//   · 손익분기 = 픽별 1/배당 (L-45). 1.76 균일 가정 폐기.
//   · 판독은 시즌 종료 시 1회 (L-49) — 중간 수치로 규칙 변경 금지 문구 상시.
//   · 구 weaken 카운터 폐기 (L-41: 그 지표 자체가 누설 산물) → 단순 계산 이력만.
// ============================================================

const KBO_SCHEMA_SUPPORTED = 2;
const KBO_STALE_DAYS = 3;

function kboGetSnapshot() {
  try { return Storage.getJSON(KEYS.KBO_SNAPSHOT, null); } catch (e) { return null; }
}

function kboSaveSnapshotText(text) {
  let snap;
  try { snap = JSON.parse(text); } catch (e) { alert('JSON 파싱 실패 — kbo_snapshot.json 내용 그대로인지 확인'); return false; }
  if (!snap || !Array.isArray(snap.pitchers) || !snap.model_version) { alert('스냅샷 형식이 아님 (pitchers/model_version 없음)'); return false; }
  if ((snap.schema_version || 0) < KBO_SCHEMA_SUPPORTED) {
    alert(`구버전 스냅샷(schema v${snap.schema_version || 1}) — v71 감사로 폐기된 모델입니다. DB 모드로 재계산하세요 (kbo.db + 언옵 txt 드롭 → 계산 실행).`);
    return false;
  }
  if ((snap.schema_version || 0) > KBO_SCHEMA_SUPPORTED) {
    alert(`스냅샷 schema v${snap.schema_version} — 앱 지원(v${KBO_SCHEMA_SUPPORTED})보다 새 버전. 앱 업데이트 필요.`);
    return false;
  }
  Storage.setJSON(KEYS.KBO_SNAPSHOT, snap);
  return true;
}

function kboUploadSnapshot() {
  const ta = document.getElementById('kbo-snap-paste');
  if (!ta || !ta.value.trim()) { alert('kbo_snapshot.json 내용을 붙여넣으세요'); return; }
  if (kboSaveSnapshotText(ta.value.trim())) { ta.value = ''; renderKboF5(); }
}

function kboSnapshotFile(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => { if (kboSaveSnapshotText(String(r.result))) renderKboF5(); };
  r.readAsText(f);
}

function kboStaleDays(snap) {
  try {
    const gen = new Date(snap.generated_at.replace(' ', 'T'));
    return Math.floor((Date.now() - gen.getTime()) / 86400000);
  } catch (e) { return null; }
}

// ── 투수 조회 ────────────────────────────────────────────────
function kboFindPitcher(name) {
  const snap = kboGetSnapshot();
  if (!snap) return null;
  const q = (name || '').trim();
  if (!q) return null;
  return snap.pitchers.find(p => p.pitcher === q)
      || snap.pitchers.find(p => p.pitcher.includes(q)) || null;
}

function kboLookup() {
  const name = document.getElementById('kbo-pitcher-input')?.value || '';
  const host = document.getElementById('kbo-verdict');
  if (!host) return;
  const p = kboFindPitcher(name);
  if (!p) { host.innerHTML = `<div class="hint" style="padding:8px 0;">'${name}' — 데이터에 없는 투수 (미검증 선발 또는 오타). 경기 판정에서는 자동 PASS 처리됩니다.</div>`; return; }
  host.innerHTML = kboPitcherCardHtml(p);
}

function kboLayerBadge(ok, label) {
  const col = ok === true ? 'var(--green)' : ok === false ? 'var(--red)' : 'var(--text3)';
  const mark = ok === true ? '✓' : ok === false ? '✗' : '·';
  return `<span style="padding:2px 8px;font-size:10px;border-radius:10px;border:1px solid ${col};color:${col};white-space:nowrap;">${mark} ${label}</span>`;
}

function kboPitcherCardHtml(p) {
  const col = p.signal === 'UNDER' ? 'var(--green)' : p.signal === 'OVER' ? 'var(--accent2, #ff9f0a)' : 'var(--text3)';
  const badge = p.signal === 'UNDER' ? '🟢 언더 신호' : p.signal === 'OVER' ? '🟠 오버 신호' : p.type === '?' ? '❔ 미검증 선발' : '⚪ 신호 없음';
  const l3ok = p.type === 'A' || p.type === 'C' ? p.stable : (p.type === '?' ? null : false);
  const l2ok = p.type === 'C' ? (p.state_change === 'non_worsen') : null;
  const l1need = p.type === 'A' ? 'above' : 'below';
  const l1ok = (p.type === 'A' || p.type === 'C') ? (p.l1_side === l1need) : null;
  return `
    <div style="background:var(--bg3);border:1px solid ${col};border-radius:10px;padding:12px 14px;margin-top:8px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
        <span style="font-size:15px;font-weight:800;color:var(--text);">${p.pitcher}</span>
        <span class="hint">${p.team} · 최근 등판 ${p.last_start || '—'} · 언옵 N=${p.n_prior}${p.type_streak > 0 && (p.type === 'A' || p.type === 'C') ? ` · <b style="color:${p.type_streak >= 6 ? 'var(--green)' : 'var(--gold, #ffd60a)'}">${p.type}형 연속 ${p.type_streak}회 판정</b>` : ''}</span>
        <span style="margin-left:auto;font-size:12px;font-weight:700;color:${col};">${badge}</span>
      </div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px;">
        ${kboLayerBadge(l3ok, `L3 ${p.type}형${p.type==='A'||p.type==='C' ? (p.stable ? ' 안정' : ' 미안정('+p.type_prev+')') : ''}`)}
        ${kboLayerBadge(l2ok, `L2 ${p.state_change || 'Δ불가'}`)}
        ${kboLayerBadge(l1ok, `L1 ${p.l1_side || '판정불가'}`)}
      </div>
      <div style="font-size:12px;color:var(--text2);">${p.reason}</div>
      <div class="hint" style="margin-top:3px;">${p.delta_whip != null ? `ΔWHIP ${p.delta_whip} · ΔH/IP ${p.delta_h_ip} (기준 1.10, 직전 등판까지)` : 'Δ 계산 불가'}</div>
    </div>`;
}

// ── 경기 판정 ────────────────────────────────────────────────
let _kboLastJudge = null;

function kboJudgeGameUi() {
  const snap = kboGetSnapshot();
  const host = document.getElementById('kbo-game-verdict');
  if (!snap || !host) return;
  const hp = document.getElementById('kbo-g-home')?.value || '';
  const ap = document.getElementById('kbo-g-away')?.value || '';
  const line = parseFloat(document.getElementById('kbo-g-line')?.value);
  const oddsU = parseFloat(document.getElementById('kbo-g-odds-u')?.value);
  const oddsO = parseFloat(document.getElementById('kbo-g-odds-o')?.value);
  if (!hp.trim() || !ap.trim()) { alert('홈·원정 선발을 모두 입력하세요'); return; }
  const j = kboJudgeGame(snap, hp, ap);
  _kboLastJudge = { j, home: hp.trim(), away: ap.trim(), line, oddsU, oddsO };
  const col = j.verdict === 'UNDER' ? 'var(--green)' : j.verdict === 'OVER' ? 'var(--accent2, #ff9f0a)' : 'var(--text3)';
  const odds = j.verdict === 'UNDER' ? oddsU : j.verdict === 'OVER' ? oddsO : null;
  const be = Number.isFinite(odds) && odds > 1 ? (100 / odds).toFixed(1) : null;
  const sideCard = s => s.p ? kboPitcherCardHtml(s.p)
    : `<div class="hint" style="padding:6px 0;">${s.role} ${s.name || '?'} — 데이터 없음 (미검증 선발)</div>`;
  host.innerHTML = `
    <div style="background:var(--bg3);border:2px solid ${col};border-radius:10px;padding:12px 14px;margin-top:10px;">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-size:16px;font-weight:900;color:${col};">${j.verdict === 'PASS' ? '⏸ PASS' : (j.verdict === 'UNDER' ? '🟢 UNDER' : '🟠 OVER') + (Number.isFinite(line) ? ` ${line}` : '')}</span>
        <span style="font-size:12px;color:var(--text2);">${j.reason}</span>
        ${be ? `<span class="hint" style="margin-left:auto;">배당 ${odds} → 손익분기 ${be}% (픽별 1/배당 — L-45)</span>` : ''}
      </div>
      ${j.verdict !== 'PASS' ? `
      <div style="display:grid;grid-template-columns:1fr auto;gap:6px;margin-top:10px;align-items:end;">
        <label class="hint">금액<input type="number" id="kbo-g-amt" step="1000" placeholder="10000" class="sim-num" style="width:100%;margin-top:3px;"></label>
        <button onclick="kboRegisterSystemBet()" style="padding:8px 14px;font-size:12px;font-weight:700;background:rgba(0,230,118,0.1);border:1px solid var(--green);border-radius:6px;color:var(--green);cursor:pointer;">시스템 원장 등록</button>
      </div>
      <div class="hint" style="margin-top:4px;">경기 시작 전에만 등록 (L-52 — 사후 등록은 공식 기록이 아님)</div>` : `
      <div style="display:grid;grid-template-columns:auto 1fr auto auto;gap:6px;margin-top:10px;align-items:end;">
        <label class="hint">재량 방향<select id="kbo-s-dir" class="sim-num" style="margin-top:3px;"><option value="UNDER">언더</option><option value="OVER">오버</option></select></label>
        <label class="hint">배당<input type="number" id="kbo-s-odds" step="0.01" placeholder="1.76" class="sim-num" style="width:100%;margin-top:3px;"></label>
        <label class="hint">금액<input type="number" id="kbo-s-amt" step="1000" placeholder="10000" class="sim-num" style="width:100px;margin-top:3px;"></label>
        <button onclick="kboRegisterSupervisorBet()" style="padding:8px 14px;font-size:12px;font-weight:700;background:rgba(0,229,255,0.08);border:1px solid var(--accent);border-radius:6px;color:var(--accent);cursor:pointer;">감독자 원장 등록</button>
      </div>
      <div class="hint" style="margin-top:4px;">시스템은 PASS — 재량으로 진행하려면 감독자 원장으로 (L-52 이중 원장 · 시즌말 병렬 판독)</div>`}
      <div style="margin-top:10px;">${j.sides.map(sideCard).join('')}</div>
    </div>`;
}

function kboMakeRec({ dir, line, odds, amt, ledger, extraMemo }) {
  const lj = _kboLastJudge || {};
  const snap = kboGetSnapshot();
  return {
    id: Date.now() + Math.floor(Math.random() * 100000),
    isSim: false,
    date: new Date().toISOString().split('T')[0],
    game: `${lj.home || '?'}(홈) vs ${lj.away || '?'}(원정) F5 ${line} ${dir === 'UNDER' ? '언더' : '오버'}`,
    mode: 'single', folderCount: '',
    sport: 'KBO', type: '언/옵',
    betmanOdds: odds, amount: amt,
    result: 'PENDING', profit: 0,
    myProb: null, isValue: false,
    memo: `[KBO F5 v1.0/${ledger === 'system' ? '시스템' : '감독자'}] ${extraMemo || ''} (손익분기 ${(100 / odds).toFixed(1)}%)`,
    folderMemos: [], folderOdds: [], folderProbs: [], folderSports: [], folderTypes: [],
    emotion: '보통', violations: [],
    savedAt: new Date().toISOString(),
    ev: null, evRaw: null, adjustedProb: null, evCalibrated: null, calibProb: null,
    source: 'kbo_f5',
    kboMeta: { ledger, verdict: dir, home_pitcher: lj.home, away_pitcher: lj.away, line, odds,
               model_version: snap?.model_version || null, data_through: snap?.data_through || null },
  };
}

function kboSaveRec(rec) {
  if (typeof attachRoundToBet === 'function') attachRoundToBet(rec);
  if (typeof applyRoundBet === 'function') applyRoundBet(rec.amount);
  saveBets([...getBets(), rec], { refresh: false });
  if (typeof simToast === 'function') simToast(`✅ ${rec.game} — 미결 등록됨 (${rec.kboMeta.ledger === 'system' ? '시스템' : '감독자'} 원장)`, 'ok');
  renderKboF5();
}

function kboRegisterSystemBet() {
  const lj = _kboLastJudge;
  if (!lj || !lj.j || lj.j.verdict === 'PASS') { alert('시스템 신호가 있는 경기만 시스템 원장에 등록됩니다'); return; }
  const line = lj.line, dir = lj.j.verdict;
  const odds = dir === 'UNDER' ? lj.oddsU : lj.oddsO;
  const amt = parseInt(document.getElementById('kbo-g-amt')?.value) || 0;
  if (!(line > 0)) { alert('기준점을 입력하세요 (예: 4.5)'); return; }
  if (!(odds >= 1.01)) { alert(`${dir === 'UNDER' ? '언더' : '오버'} 배당을 입력하세요 (배당 기록은 필수 — L-45)`); return; }
  if (!(amt > 0)) { alert('금액을 입력하세요'); return; }
  kboSaveRec(kboMakeRec({ dir, line, odds, amt, ledger: 'system',
    extraMemo: lj.j.reason }));
}

function kboRegisterSupervisorBet() {
  const lj = _kboLastJudge;
  if (!lj) { alert('먼저 경기 판정을 실행하세요'); return; }
  const dir = document.getElementById('kbo-s-dir')?.value || 'UNDER';
  const line = lj.line;
  const odds = parseFloat(document.getElementById('kbo-s-odds')?.value);
  const amt = parseInt(document.getElementById('kbo-s-amt')?.value) || 0;
  if (!(line > 0)) { alert('기준점을 입력하세요'); return; }
  if (!(odds >= 1.01)) { alert('배당을 입력하세요 (배당 기록은 필수 — L-45)'); return; }
  if (!(amt > 0)) { alert('금액을 입력하세요'); return; }
  kboSaveRec(kboMakeRec({ dir, line, odds, amt, ledger: 'supervisor',
    extraMemo: `재량 픽 (시스템 판정: ${lj.j?.verdict || '?'})` }));
}

// ── 이중 원장 성적표 ─────────────────────────────────────────
function kboLedgerStats(ledger) {
  const bets = (typeof getBets === 'function' ? getBets() : [])
    .filter(b => b.source === 'kbo_f5' && !b.isSim)
    .filter(b => (b.kboMeta?.ledger || 'system') === ledger);   // 구기록은 시스템으로 귀속
  const done = bets.filter(b => b.result === 'WIN' || b.result === 'LOSE');
  const win = done.filter(b => b.result === 'WIN').length;
  const profit = done.reduce((s, b) => s + (Number(b.profit) || 0), 0);
  return { total: bets.length, pending: bets.filter(b => b.result === 'PENDING').length,
           done: done.length, win, winPct: done.length ? win / done.length * 100 : null, profit };
}

function kboLedgerRowHtml(name, st) {
  return `<div style="display:grid;grid-template-columns:90px repeat(4,1fr);gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);">
    <div style="font-size:12px;font-weight:700;color:var(--text2);">${name}</div>
    <div style="text-align:center;"><span class="hint">기록</span> <b style="font-family:'JetBrains Mono',monospace;">${st.total}</b></div>
    <div style="text-align:center;"><span class="hint">미결</span> <b style="font-family:'JetBrains Mono',monospace;color:var(--gold);">${st.pending}</b></div>
    <div style="text-align:center;"><span class="hint">전적</span> <b style="font-family:'JetBrains Mono',monospace;">${st.win}-${st.done - st.win}${st.winPct != null ? ` (${st.winPct.toFixed(1)}%)` : ''}</b></div>
    <div style="text-align:center;"><span class="hint">손익</span> <b style="font-family:'JetBrains Mono',monospace;color:${st.profit >= 0 ? 'var(--green)' : 'var(--red)'};">${st.profit.toLocaleString()}원</b></div>
  </div>`;
}

// ── 페이지 렌더 ──────────────────────────────────────────────
function renderKboF5() {
  const host = document.getElementById('kbo-f5-body');
  if (!host) return;
  if (!host.dataset.dropBound) {
    host.dataset.dropBound = '1';
    host.addEventListener('dragover', e => { e.preventDefault(); host.style.outline = '2px dashed var(--accent)'; });
    host.addEventListener('dragleave', () => { host.style.outline = ''; });
    host.addEventListener('drop', async e => {
      e.preventDefault(); host.style.outline = '';
      const files = Array.from(e.dataTransfer?.files || []);
      if (!files.length) return;
      for (const f of files) await kboRouteDroppedFile(f);
      renderKboF5();
    });
  }
  const snap = kboGetSnapshot();

  if (!snap) {
    host.innerHTML = kboDbModeSectionHtml() + `
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px;">
        <div class="hint-mb8">스냅샷이 없습니다. 위 DB 모드에 <b style="color:var(--text2)">kbo.db + 언옵 txt 전부</b>를 드롭하고 계산을 실행하세요. (kbo_snapshot.json 업로드도 가능)</div>
        <input type="file" accept=".json" onchange="kboSnapshotFile(this)" style="font-size:12px;margin-bottom:8px;">
        <textarea id="kbo-snap-paste" placeholder="또는 kbo_snapshot.json 내용 붙여넣기" style="width:100%;height:80px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text2);font-size:11px;font-family:'JetBrains Mono',monospace;padding:8px;"></textarea>
        <button onclick="kboUploadSnapshot()" style="margin-top:6px;padding:8px 14px;font-size:12px;font-weight:700;background:rgba(0,229,255,0.08);border:1px solid var(--accent);border-radius:6px;color:var(--accent);cursor:pointer;">스냅샷 저장</button>
      </div>`;
    return;
  }

  const stale = kboStaleDays(snap);
  const mh = snap.model_health || {};
  const sigs = snap.pitchers.filter(p => p.signal);
  const sysSt = kboLedgerStats('system');
  const supSt = kboLedgerStats('supervisor');

  host.innerHTML = kboDbModeSectionHtml() + `
    <!-- 모델 상태 -->
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span style="font-size:12px;font-weight:700;color:var(--text2);">${snap.model_version}</span>
        <span class="hint">언옵 ~${snap.data_through} · 등판로그 ~${snap.log_through || '?'} · 생성 ${snap.generated_at}</span>
        ${stale != null && stale > KBO_STALE_DAYS ? `<span style="font-size:11px;color:var(--red);font-weight:700;">⚠ ${stale}일 지난 스냅샷 — 최신 kbo.db·언옵으로 재계산 권장</span>` : ''}
        <button onclick="kboClearSnapshot()" class="sim-mini-btn" style="margin-left:auto;">스냅샷 교체</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px;text-align:center;">
        <div><div class="hint">백테스트 (개막~, L-48 스펙)</div><div style="font-size:15px;font-weight:800;color:var(--text2);font-family:'JetBrains Mono',monospace;">${mh.sim_wins}-${mh.sim_losses} (${mh.sim_rate}%)</div></div>
        <div><div class="hint">6/15 이후</div><div style="font-size:15px;font-weight:800;color:var(--text2);font-family:'JetBrains Mono',monospace;">${mh.sim_0615_wins}-${mh.sim_0615_losses}</div></div>
        <div><div class="hint">현재 신호 투수</div><div style="font-size:15px;font-weight:800;color:var(--green);font-family:'JetBrains Mono',monospace;">${sigs.length}명</div></div>
      </div>
      <div class="hint-mt4" style="line-height:1.6;">⚠ ${(snap.limits || []).join(' · ')}</div>
    </div>

    <!-- 경기 판정 (v1.0 핵심 창구) -->
    <div style="background:var(--bg3);border:1px solid var(--accent);border-radius:10px;padding:12px 14px;margin-bottom:12px;">
      <div class="sec-title">경기 판정 — 오늘의 카드 (v1.0 전체 스택)</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 70px 80px 80px auto;gap:6px;align-items:end;">
        <label class="hint">홈 선발<input id="kbo-g-home" placeholder="예: 올러" class="sim-num" style="width:100%;margin-top:3px;"></label>
        <label class="hint">원정 선발<input id="kbo-g-away" placeholder="예: 곽빈" class="sim-num" style="width:100%;margin-top:3px;"></label>
        <label class="hint">기준점<input id="kbo-g-line" type="number" step="0.5" placeholder="4.5" class="sim-num" style="width:100%;margin-top:3px;"></label>
        <label class="hint">언더 배당<input id="kbo-g-odds-u" type="number" step="0.01" placeholder="1.66" class="sim-num" style="width:100%;margin-top:3px;"></label>
        <label class="hint">오버 배당<input id="kbo-g-odds-o" type="number" step="0.01" placeholder="1.87" class="sim-num" style="width:100%;margin-top:3px;"></label>
        <button onclick="kboJudgeGameUi()" style="padding:8px 16px;font-size:12px;font-weight:700;background:rgba(0,229,255,0.08);border:1px solid var(--accent);border-radius:6px;color:var(--accent);cursor:pointer;">판정</button>
      </div>
      <div id="kbo-game-verdict"></div>
    </div>

    <!-- 투수 단건 조회 -->
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:12px;">
      <div class="sec-title">투수 판정 조회</div>
      <div style="display:flex;gap:6px;">
        <input id="kbo-pitcher-input" placeholder="투수명 입력 (예: 후라도)" class="sim-num" style="flex:1;font-size:13px;" onkeydown="if(event.key==='Enter')kboLookup()">
        <button onclick="kboLookup()" style="padding:8px 16px;font-size:12px;font-weight:700;background:rgba(0,229,255,0.08);border:1px solid var(--accent);border-radius:6px;color:var(--accent);cursor:pointer;">판정</button>
      </div>
      <div id="kbo-verdict"></div>
      <div style="margin-top:12px;">
        <div class="hint-mb5">현재 신호 투수 (${sigs.length}명 — 오늘 등판 여부는 직접 확인)</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;">
          ${sigs.map(p => `<span onclick="document.getElementById('kbo-pitcher-input').value='${p.pitcher.replace(/'/g, "\\'")}';kboLookup()" style="padding:4px 10px;font-size:11px;background:${p.signal === 'UNDER' ? 'rgba(0,230,118,0.07)' : 'rgba(255,159,10,0.09)'};border:1px solid ${p.signal === 'UNDER' ? 'rgba(0,230,118,0.3)' : 'rgba(255,159,10,0.35)'};border-radius:12px;color:${p.signal === 'UNDER' ? 'var(--green)' : 'var(--accent2, #ff9f0a)'};cursor:pointer;">${p.pitcher} ${p.signal === 'UNDER' ? 'U' : 'O'}·${p.type_streak} <span class="hint">${p.team}</span></span>`).join('')}
        </div>
      </div>
    </div>

    <!-- 이중 원장 성적표 -->
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 14px;">
      <div class="sec-title">이중 원장 — 시즌말 병렬 판독 (L-52)</div>
      ${kboLedgerRowHtml('시스템', sysSt)}
      ${kboLedgerRowHtml('감독자', supSt)}
      <div class="hint-mt4">공식 판독은 시즌 종료 시 1회 (L-49). 중간 수치로 규칙을 바꾸는 순간 표본이 오염됩니다. 경기 시작 전 기록만 공식.</div>
    </div>`;
}

function kboClearSnapshot() {
  if (!confirm('스냅샷을 지우고 새로 계산할까요? (원장·기록은 유지)')) return;
  try { Storage.remove(KEYS.KBO_SNAPSHOT); } catch (e) {}
  renderKboF5();
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => { try { renderKboF5(); } catch (e) {} });
}

// ============================================================
// DB 모드 — kbo.db를 앱이 직접 읽어 v1.0 판정 계산
//   sql.js(WASM SQLite)는 cdnjs에서 지연 로드.
//   v83: chronology_v2.db·프로파일 csv 불필요 (v1.0은 kbo.db+언옵만 사용).
// ============================================================
let _kboDbFiles = { db: null, dbName: null };
let _kboSqlJs = null, _kboJsZip = null;

// ── 언옵 txt 영구 저장 (v84): 과거 시즌·월 파일은 한 번만 넣으면 됨 ──
function kboGetUnops() {
  try { return Storage.getJSON(KEYS.KBO_UNOPS, {}) || {}; } catch (e) { return {}; }
}
function kboSaveUnop(name, text) {
  const u = kboGetUnops(); u[name] = text;
  try { Storage.setJSON(KEYS.KBO_UNOPS, u); } catch (e) { alert('언옵 저장 실패: ' + e.message); }
}
function kboRemoveUnop(name) {
  const u = kboGetUnops(); delete u[name];
  try { Storage.setJSON(KEYS.KBO_UNOPS, u); } catch (e) {}
  renderKboF5();
}

function kboLoadSqlJs() {
  if (_kboSqlJs) return Promise.resolve(_kboSqlJs);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/sql-wasm.js';
    s.onload = () => {
      initSqlJs({ locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/${f}` })
        .then(SQL => { _kboSqlJs = SQL; resolve(SQL); })
        .catch(reject);
    };
    s.onerror = () => reject(new Error('sql.js 로드 실패 — 인터넷 연결 필요'));
    document.head.appendChild(s);
  });
}

function kboLoadJsZip() {
  if (_kboJsZip) return Promise.resolve(_kboJsZip);
  if (typeof JSZip !== 'undefined') { _kboJsZip = JSZip; return Promise.resolve(JSZip); }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload = () => { _kboJsZip = window.JSZip; resolve(window.JSZip); };
    s.onerror = () => reject(new Error('jszip 로드 실패 — 인터넷 연결 필요 (zip 대신 파일을 직접 드롭하세요)'));
    document.head.appendChild(s);
  });
}

// ── 파일 라우팅 (드롭·선택·zip 내부 공용) ──
//   수용: kbo.db(정확히 이 이름) / *.txt(언옵→영구저장) / *.json(스냅샷)
//   무시: kbo_2023/2024.db·chronology·features db·csv·py·jsonl — v1.0에 불필요
function kboIngestNamedFile(name, kind, content) {
  const base = name.split('/').pop();
  if (kind === 'db') {
    if (base === 'kbo.db') { _kboDbFiles.db = content; _kboDbFiles.dbName = base; return 'db'; }
    return 'ignored';   // kbo_2023.db·chronology_v2.db·kbo_features.db 등 — 미사용
  }
  if (base.endsWith('.txt')) { kboSaveUnop(base, content); return 'unop'; }
  if (base.endsWith('.json')) {
    if (kboSaveSnapshotText(content)) { if (typeof simToast === 'function') simToast('✅ 스냅샷 적용됨', 'ok'); return 'snapshot'; }
    return 'ignored';
  }
  return 'ignored';
}

async function kboIngestZip(arrayBuffer) {
  const JZ = await kboLoadJsZip();
  const zip = await JZ.loadAsync(arrayBuffer);
  let nDb = 0, nTxt = 0, nSkip = 0;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const base = entry.name.split('/').pop();
    if (base === 'kbo.db') {
      const buf = new Uint8Array(await entry.async('arraybuffer'));
      kboIngestNamedFile(base, 'db', buf); nDb++;
    } else if (base.endsWith('.txt')) {
      const text = await entry.async('string');
      kboIngestNamedFile(base, 'text', text); nTxt++;
    } else nSkip++;
  }
  if (typeof simToast === 'function') simToast(`📦 zip 처리: kbo.db ${nDb ? '✓' : '없음'} · 언옵 txt ${nTxt}개 저장 · ${nSkip}개 무시(v1.0 불필요 파일)`, 'ok');
}

function kboRouteDroppedFile(file) {
  return new Promise((resolve) => {
    const name = file.name;
    const r = new FileReader();
    r.onload = async () => {
      try {
        if (name.endsWith('.zip')) await kboIngestZip(r.result);
        else if (name.endsWith('.db')) {
          const res = kboIngestNamedFile(name, 'db', new Uint8Array(r.result));
          if (res === 'ignored' && typeof simToast === 'function') simToast(`'${name}' — v1.0에 불필요한 파일 (kbo.db만 사용)`, 'info');
        } else kboIngestNamedFile(name, 'text', String(r.result));
      } catch (e) { alert('파일 처리 실패: ' + e.message); }
      resolve();
    };
    if (name.endsWith('.db') || name.endsWith('.zip')) r.readAsArrayBuffer(file);
    else r.readAsText(file);
  });
}

function kboDbModeSectionHtml() {
  const unops = kboGetUnops();
  const unopNames = Object.keys(unops).sort();
  const staged = _kboDbFiles.db || unopNames.length;
  const chip = (ok, label) => `<span style="padding:3px 8px;font-size:10px;border-radius:10px;border:1px solid ${ok ? 'var(--green)' : 'var(--border)'};color:${ok ? 'var(--green)' : 'var(--text3)'};">${ok ? '✓' : '·'} ${label}</span>`;
  return `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:12px;">
      <div class="sec-title">DB 모드 — v1.0 계산 (파이썬 불필요)</div>
      <div class="hint-mb6" style="line-height:1.7;">
        필요한 것은 <b style="color:var(--text2)">딱 두 가지</b>:
        ① <b style="color:var(--text2)">최신 kbo.db</b> — 매번 새로 드롭 (25+26시즌이 이 한 파일에 들어있음. <b>kbo_2023/2024.db·chronology·features·csv 전부 불필요 — 드롭해도 자동 무시</b>)
        ② <b style="color:var(--text2)">언옵 txt</b> — <b>한 번 넣으면 브라우저에 영구 저장</b>. 끝난 시즌·월 파일은 다시 넣을 필요 없고, 새 달 파일만 추가하면 됨.
        <b style="color:var(--accent)">kbo파일.zip을 통째로 드롭해도 됨</b> — kbo.db와 txt만 자동 추출.
      </div>
      <input type="file" multiple accept=".db,.txt,.json,.zip" onchange="(async()=>{for(const f of Array.from(this.files))await kboRouteDroppedFile(f);renderKboF5();}).call(this)" style="font-size:11px;">
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px;align-items:center;">
        ${chip(!!_kboDbFiles.db, `kbo.db ${_kboDbFiles.db ? '(이번 세션 적재됨)' : '(드롭 필요)'}`)}
        ${chip(unopNames.length > 0, `언옵 저장됨 ×${unopNames.length}`)}
      </div>
      ${unopNames.length ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;">
        ${unopNames.map(n => `<span style="padding:3px 8px;font-size:10px;border-radius:10px;background:var(--bg2);border:1px solid var(--border);color:var(--text3);">${n} <span onclick="kboRemoveUnop('${n.replace(/'/g, "\\'")}')" style="cursor:pointer;color:var(--red);font-weight:700;">✕</span></span>`).join('')}
      </div>` : ''}
      ${staged ? `<button id="kbo-db-run" onclick="kboRunDbMode()" style="margin-top:10px;padding:9px 18px;font-size:12px;font-weight:700;background:rgba(0,229,255,0.08);border:1px solid var(--accent);border-radius:6px;color:var(--accent);cursor:pointer;">계산 실행</button>` : ''}
    </div>`;
}

async function kboRunDbMode() {
  const unops = kboGetUnops();
  if (!_kboDbFiles.db) { alert('최신 kbo.db를 드롭하세요 (zip 통째로도 가능)'); return; }
  if (!Object.keys(unops).length) { alert('언옵 txt가 없습니다 — 25년~현재 파일을 드롭하세요 (한 번만 넣으면 저장됨)'); return; }
  const btn = document.getElementById('kbo-db-run');
  if (btn) { btn.disabled = true; btn.textContent = '계산 중…'; }
  try {
    const SQL = await kboLoadSqlJs();
    const db = new SQL.Database(_kboDbFiles.db);
    const q = (sql) => {
      const res = db.exec(sql);
      if (!res.length) return [];
      const cols = res[0].columns;
      return res[0].values.map(v => Object.fromEntries(cols.map((c, i) => [c, v[i]])));
    };
    const pitcher_log = q("SELECT game_key, date, team, name as pitcher, outs_recorded as outs, hits, bb FROM pitcher_log WHERE is_starter=1 ORDER BY name, date");
    const inning_score = q(`SELECT game_key, date, away_team as away, home_team as home,
      COALESCE(away_i1,0)+COALESCE(away_i2,0)+COALESCE(away_i3,0)+COALESCE(away_i4,0)+COALESCE(away_i5,0) as a5,
      COALESCE(home_i1,0)+COALESCE(home_i2,0)+COALESCE(home_i3,0)+COALESCE(home_i4,0)+COALESCE(home_i5,0) as h5
      FROM inning_score WHERE date >= '2025-07-29'`);
    db.close();
    const snap = kboBuildSnapshotFromDb({ pitcher_log, inning_score, unop_files: unops });
    kboRevalUpdate(snap);
    Storage.setJSON(KEYS.KBO_SNAPSHOT, snap);
    if (typeof simToast === 'function') simToast(`✅ 계산 완료 — 경기 ${snap.n_games}건 · 백테스트 ${snap.model_health.sim_wins}-${snap.model_health.sim_losses} · 신호 ${snap.pitchers.filter(p => p.signal).length}명`, 'ok');
    _kboDbFiles = { db: null, dbName: null };
    renderKboF5();
  } catch (e) {
    alert('DB 모드 실패: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = '계산 실행'; }
  }
}

// 계산 이력 로그 (v83): 단순 기록만 — 구 weaken 카운터는 L-41로 폐기
//   (그 지표의 원료였던 non_worsen/d 통계가 당일 혼입 누설 산물이었음)
function kboRevalUpdate(snap) {
  let log;
  try { log = Storage.getJSON(KEYS.KBO_REVAL_LOG, null); } catch (e) { log = null; }
  if (!Array.isArray(log)) log = [];
  const prev = log[log.length - 1];
  const cur = { ts: new Date().toISOString().slice(0, 10), data_through: snap.data_through, n_games: snap.n_games,
                model: snap.model_version,
                sim: { picks: snap.model_health.sim_picks, wins: snap.model_health.sim_wins,
                       losses: snap.model_health.sim_losses, rate: snap.model_health.sim_rate } };
  if (prev && prev.data_through === cur.data_through && prev.n_games === cur.n_games) return log.length;
  log.push(cur);
  try { Storage.setJSON(KEYS.KBO_REVAL_LOG, log); } catch (e) {}
  return log.length;
}

if (typeof window !== 'undefined') {
  window.kboRunDbMode = kboRunDbMode;
  window.kboRouteDroppedFile = kboRouteDroppedFile;
  window.kboRevalUpdate = kboRevalUpdate;
  window.kboJudgeGameUi = kboJudgeGameUi;
  window.kboRegisterSystemBet = kboRegisterSystemBet;
  window.kboRegisterSupervisorBet = kboRegisterSupervisorBet;
  window.kboRemoveUnop = kboRemoveUnop;
}
