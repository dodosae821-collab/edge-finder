// ============================================================
// KBO F5 프로토콜 (v73) — 스냅샷 기반 판정 + 미결 연결 + 프로토콜 성적표
//
// 역할 분리 (설계 계약):
//   · 파이썬(kbo_refresh.py) = 두뇌: games_clean 재구성 → L-39 전수 재검증
//     → kbo_snapshot.json 생성. 판정 "규칙"은 전부 파이썬에 있음.
//   · 이 파일 = 실전 창구: 스냅샷의 판정 "결과"를 표시·기록·추적만 한다.
//     연구 모델이 바뀌어도(임계값·유형 기준 등) 스냅샷 내용만 달라질 뿐
//     이 파일은 수정 불필요. 스키마가 깨질 때만 schema_version이 올라간다.
//
// 규율 반영 (인계문서):
//   · L-36: 이것은 "후보군 생성기"이지 베팅 신호가 아님 — 화면에 상시 표시
//   · 오래된 스냅샷 경고 (3일 초과)
//   · weaken_streak 표시 (L-39 약화 카운터)
// ============================================================

const KBO_SCHEMA_SUPPORTED = 1;
const KBO_STALE_DAYS = 3;

function kboGetSnapshot() {
  try { return Storage.getJSON(KEYS.KBO_SNAPSHOT, null); } catch (e) { return null; }
}

function kboSaveSnapshotText(text) {
  let snap;
  try { snap = JSON.parse(text); } catch (e) { alert('JSON 파싱 실패 — kbo_snapshot.json 내용 그대로 붙여넣었는지 확인'); return false; }
  if (!snap || !Array.isArray(snap.pitchers) || !snap.model_version) { alert('스냅샷 형식이 아님 (pitchers/model_version 없음)'); return false; }
  if ((snap.schema_version || 0) > KBO_SCHEMA_SUPPORTED) {
    alert(`스냅샷 schema v${snap.schema_version} — 앱이 지원하는 v${KBO_SCHEMA_SUPPORTED}보다 새 버전. 앱 업데이트 필요.`);
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

// ── 판정 조회 ────────────────────────────────────────────────
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
  if (!p) { host.innerHTML = `<div class="hint" style="padding:8px 0;">'${name}' — 스냅샷에 없는 투수 (프로필 없음 또는 오타)</div>`; return; }
  host.innerHTML = kboVerdictCardHtml(p);
}

function kboVerdictCardHtml(p) {
  const snap = kboGetSnapshot();
  const isCand = p.candidate;
  const isBan = p.type === 'C' && p.state_change === 'worsen';
  const col = isCand ? 'var(--green)' : isBan ? 'var(--red)' : 'var(--text3)';
  const badge = isCand ? '🟢 언더 후보군' : isBan ? '🚫 베팅 금지 영역' : '⚪ 대상 아님';
  const nb = snap?.model_health?.non_worsen_under;
  const deltas = (p.delta_whip != null)
    ? `ΔWHIP ${p.delta_whip} · ΔH/IP ${p.delta_h_ip} (기준 1.10)` : 'Δ 계산 불가';
  return `
    <div style="background:var(--bg3);border:1px solid ${col};border-radius:10px;padding:12px 14px;margin-top:8px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="font-size:15px;font-weight:800;color:var(--text);">${p.pitcher}</span>
        <span class="hint">${p.team} · 최근 등판 ${p.last_start || '—'}</span>
        <span style="margin-left:auto;font-size:12px;font-weight:700;color:${col};">${badge}</span>
      </div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:4px;">유형 <b>${p.type}형</b>${p.state_change ? ` · State Change <b>${p.state_change}</b>` : ''} — ${p.reason}</div>
      <div class="hint">${deltas}${isCand && nb != null ? ` · 이 조합의 역사적 언더율 ${nb}% (개별 경기 확률 아님)` : ''}</div>
      ${isCand ? `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:6px;margin-top:10px;align-items:end;">
        <label class="hint">F5 라인<input type="number" id="kbo-bet-line" step="0.5" placeholder="4.5" class="sim-num" style="width:100%;margin-top:3px;"></label>
        <label class="hint">배당<input type="number" id="kbo-bet-odds" step="0.01" placeholder="1.76" class="sim-num" style="width:100%;margin-top:3px;"></label>
        <label class="hint">금액<input type="number" id="kbo-bet-amt" step="1000" placeholder="10000" class="sim-num" style="width:100%;margin-top:3px;"></label>
        <button onclick="kboRegisterPending('${p.pitcher.replace(/'/g, "\\'")}')" style="padding:8px 12px;font-size:12px;font-weight:700;background:rgba(0,230,118,0.1);border:1px solid var(--green);border-radius:6px;color:var(--green);cursor:pointer;">미결 등록</button>
      </div>
      <div class="hint-mt4">등록하면 베팅기록 미결(PENDING)로 들어가고, 결과 확정 시 아래 프로토콜 성적표에 자동 집계됩니다.</div>` : ''}
    </div>`;
}

// ── 미결 등록 (베팅기록 연결) ────────────────────────────────
function kboRegisterPending(pitcherName) {
  const p = kboFindPitcher(pitcherName);
  if (!p || !p.candidate) { alert('후보 자격이 아닙니다'); return; }
  const line = parseFloat(document.getElementById('kbo-bet-line')?.value);
  const odds = parseFloat(document.getElementById('kbo-bet-odds')?.value);
  const amt = parseInt(document.getElementById('kbo-bet-amt')?.value) || 0;
  if (!(line > 0)) { alert('F5 라인을 입력하세요 (예: 4.5)'); return; }
  if (!(odds >= 1.01)) { alert('배당을 입력하세요'); return; }
  if (!(amt > 0)) { alert('금액을 입력하세요'); return; }
  const snap = kboGetSnapshot();
  const rec = {
    id: Date.now() + Math.floor(Math.random() * 100000),
    isSim: false,
    date: new Date().toISOString().split('T')[0],
    game: `${p.team} 선발 ${p.pitcher} F5 ${line} 언더`,
    mode: 'single', folderCount: '',
    sport: 'KBO', type: '언/옵',
    betmanOdds: odds, amount: amt,
    result: 'PENDING', profit: 0,
    myProb: null,                       // 후보군이지 개별 경기 확률이 아님 — 정직하게 공란
    isValue: false,
    memo: `[KBO F5] ${p.pitcher} C형+non_worsen 언더 후보 (모델 ${snap?.model_version || '?'})`,
    folderMemos: [], folderOdds: [], folderProbs: [], folderSports: [], folderTypes: [],
    emotion: '보통', violations: [],
    savedAt: new Date().toISOString(),
    ev: null, evRaw: null, adjustedProb: null, evCalibrated: null, calibProb: null,
    source: 'kbo_f5',
    kboMeta: { pitcher: p.pitcher, team: p.team, line, state_change: p.state_change,
               model_version: snap?.model_version || null, data_through: snap?.data_through || null },
  };
  // 현재 회차 반영 (베팅기록 폼과 동일 경로)
  if (typeof attachRoundToBet === 'function') attachRoundToBet(rec);
  if (typeof applyRoundBet === 'function') applyRoundBet(amt);
  saveBets([...getBets(), rec], { refresh: false });
  if (typeof simToast === 'function') simToast(`✅ ${p.pitcher} F5 ${line} 언더 — 미결 등록됨`, 'ok');
  renderKboF5();
}

// ── 프로토콜 성적표 (실전 검증 데이터 자동 축적) ─────────────
function kboProtocolStats() {
  const bets = (typeof getBets === 'function' ? getBets() : []).filter(b => b.source === 'kbo_f5' && !b.isSim);
  const done = bets.filter(b => b.result === 'WIN' || b.result === 'LOSE');
  const win = done.filter(b => b.result === 'WIN').length;
  const profit = done.reduce((s, b) => s + (Number(b.profit) || 0), 0);
  return { total: bets.length, pending: bets.filter(b => b.result === 'PENDING').length,
           done: done.length, win, winPct: done.length ? win / done.length * 100 : null, profit };
}

// ── 페이지 렌더 ──────────────────────────────────────────────
function renderKboF5() {
  const host = document.getElementById('kbo-f5-body');
  if (!host) return;
  // 스냅샷 드래그&드롭 (탭 전체 영역) — 1회만 바인딩
  if (!host.dataset.dropBound) {
    host.dataset.dropBound = '1';
    host.addEventListener('dragover', e => { e.preventDefault(); host.style.outline = '2px dashed var(--accent)'; });
    host.addEventListener('dragleave', () => { host.style.outline = ''; });
    host.addEventListener('drop', e => {
      e.preventDefault(); host.style.outline = '';
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => { if (kboSaveSnapshotText(String(r.result))) { renderKboF5(); if (typeof simToast === 'function') simToast('✅ 스냅샷 적용됨', 'ok'); } };
      r.readAsText(f);
    });
  }
  const snap = kboGetSnapshot();

  if (!snap) {
    host.innerHTML = `
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px;">
        <div class="hint-mb8">스냅샷이 없습니다. 파이썬에서 <b style="color:var(--text2)">python3 kbo_refresh.py</b> 실행 후 생성되는 <b style="color:var(--text2)">kbo_snapshot.json</b>을 업로드하세요. (이 영역에 파일을 끌어다 놓아도 됩니다)</div>
        <input type="file" accept=".json" onchange="kboSnapshotFile(this)" style="font-size:12px;margin-bottom:8px;">
        <textarea id="kbo-snap-paste" placeholder="또는 kbo_snapshot.json 내용 붙여넣기" style="width:100%;height:80px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text2);font-size:11px;font-family:'JetBrains Mono',monospace;padding:8px;"></textarea>
        <button onclick="kboUploadSnapshot()" style="margin-top:6px;padding:8px 14px;font-size:12px;font-weight:700;background:rgba(0,229,255,0.08);border:1px solid var(--accent);border-radius:6px;color:var(--accent);cursor:pointer;">스냅샷 저장</button>
      </div>`;
    return;
  }

  const stale = kboStaleDays(snap);
  const mh = snap.model_health || {};
  const cands = snap.pitchers.filter(p => p.candidate);
  const st = kboProtocolStats();
  const be = snap.breakeven_pct || 56.8;

  host.innerHTML = `
    <!-- 모델 상태 헤더 -->
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span style="font-size:12px;font-weight:700;color:var(--text2);">${snap.model_version}</span>
        <span class="hint">데이터 ~${snap.data_through} · 생성 ${snap.generated_at}</span>
        ${stale != null && stale > KBO_STALE_DAYS ? `<span style="font-size:11px;color:var(--red);font-weight:700;">⚠ ${stale}일 지난 스냅샷 — kbo_refresh 재실행 권장</span>` : ''}
        <button onclick="kboClearSnapshot()" class="sim-mini-btn" style="margin-left:auto;">스냅샷 교체</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px;text-align:center;">
        <div><div class="hint">C형 언더율</div><div style="font-size:15px;font-weight:800;color:var(--text2);font-family:'JetBrains Mono',monospace;">${mh.C_under ?? '—'}%</div></div>
        <div><div class="hint">후보조합 언더율</div><div style="font-size:15px;font-weight:800;color:var(--green);font-family:'JetBrains Mono',monospace;">${mh.non_worsen_under ?? '—'}%</div><div class="hint">(손익분기 ${be}%)</div></div>
        <div><div class="hint">Cohen's d</div><div style="font-size:15px;font-weight:800;color:var(--text2);font-family:'JetBrains Mono',monospace;">${mh.cohens_d ?? '—'}</div></div>
        <div><div class="hint">약화 연속</div><div style="font-size:15px;font-weight:800;color:${(mh.weaken_streak || 0) >= 2 ? 'var(--red)' : (mh.weaken_streak || 0) === 1 ? 'var(--warn, #ff9f0a)' : 'var(--green)'};font-family:'JetBrains Mono',monospace;">${mh.weaken_streak ?? 0}회</div><div class="hint">${(mh.weaken_streak || 0) >= 2 ? '재검토 필요!' : '2회 연속 시 재검토'}</div></div>
      </div>
      <div class="hint-mt4" style="line-height:1.6;">⚠ ${(snap.limits || []).join(' · ')}</div>
    </div>

    <!-- 투수 판정 -->
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:12px;">
      <div class="sec-title">오늘 선발 판정</div>
      <div style="display:flex;gap:6px;">
        <input id="kbo-pitcher-input" placeholder="투수명 입력 (예: 후라도)" class="sim-num" style="flex:1;font-size:13px;" onkeydown="if(event.key==='Enter')kboLookup()">
        <button onclick="kboLookup()" style="padding:8px 16px;font-size:12px;font-weight:700;background:rgba(0,229,255,0.08);border:1px solid var(--accent);border-radius:6px;color:var(--accent);cursor:pointer;">판정</button>
      </div>
      <div id="kbo-verdict"></div>
      <div style="margin-top:12px;">
        <div class="hint-mb5">현재 후보 자격 (${cands.length}명 — 오늘 등판 여부는 직접 확인)</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;">
          ${cands.map(p => `<span onclick="document.getElementById('kbo-pitcher-input').value='${p.pitcher.replace(/'/g, "\\'")}';kboLookup()" style="padding:4px 10px;font-size:11px;background:rgba(0,230,118,0.07);border:1px solid rgba(0,230,118,0.3);border-radius:12px;color:var(--green);cursor:pointer;">${p.pitcher} <span class="hint">${p.team}</span></span>`).join('')}
        </div>
      </div>
    </div>

    <!-- 프로토콜 성적표 -->
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 14px;">
      <div class="sec-title">프로토콜 성적표 — 실전 검증 (다음 재검증의 원료)</div>
      ${st.total === 0
        ? `<div class="hint">아직 기록 없음. 후보를 미결 등록하고 결과를 확정하면 여기에 실전 적중률이 쌓입니다.</div>`
        : `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center;">
            <div><div class="hint">누적 기록</div><div style="font-size:15px;font-weight:800;color:var(--text2);font-family:'JetBrains Mono',monospace;">${st.total}건</div></div>
            <div><div class="hint">미결</div><div style="font-size:15px;font-weight:800;color:var(--gold);font-family:'JetBrains Mono',monospace;">${st.pending}건</div></div>
            <div><div class="hint">실전 적중률</div><div style="font-size:15px;font-weight:800;color:${st.winPct != null && st.winPct >= be ? 'var(--green)' : 'var(--red)'};font-family:'JetBrains Mono',monospace;">${st.winPct != null ? st.winPct.toFixed(1) + '%' : '—'}</div><div class="hint">확정 ${st.done}건 / 손익분기 ${be}%</div></div>
            <div><div class="hint">누적 손익</div><div style="font-size:15px;font-weight:800;color:${st.profit >= 0 ? 'var(--green)' : 'var(--red)'};font-family:'JetBrains Mono',monospace;">${st.profit.toLocaleString()}원</div></div>
          </div>
          <div class="hint-mt4">역사적 ${mh.non_worsen_under ?? '—'}% vs 실전 — 확정 표본이 30건 넘기 전엔 실전 수치로 결론 내리지 말 것.</div>`}
    </div>`;
}

function kboClearSnapshot() {
  if (!confirm('스냅샷을 지우고 새로 업로드할까요? (기록·성적표는 유지)')) return;
  try { Storage.remove(KEYS.KBO_SNAPSHOT); } catch (e) {}
  renderKboF5();
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => { try { renderKboF5(); } catch (e) {} });
}
