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
      ${kboTypeEvidenceHtml(p.pitcher)}
      ${kboRecent5Html(p.pitcher)}
    </div>`;
}

// v85: 유형 판정 근거 수치 — 배지가 왜 붙었는지 숫자로 (감독자 요구)
function kboTypeEvidenceHtml(name) {
  const ev = kboGetSnapshot()?.type_evidence?.[name];
  if (!ev) return '';
  const cCut = ev.mean_allowed <= 2.0 && ev.pos_ext_pct <= 20;
  const aCut = ev.mean_allowed >= 4.0 && ev.pos_ext_pct >= 40;
  const col = cCut ? 'var(--green)' : aCut ? 'var(--accent2, #ff9f0a)' : 'var(--text3)';
  return `<div class="hint" style="margin-top:4px;">유형 근거 — 언옵 N=<b>${ev.n}</b> · F5 평균실점 <b style="color:${col}">${ev.mean_allowed.toFixed(2)}</b> · 폭발률 <b style="color:${col}">${ev.pos_ext_pct}%</b>
    <span style="opacity:.75;">(C형 ≤2.0 & ≤20% · A형 ≥4.0 & ≥40%)</span></div>`;
}

// v85: 최근 5선발 표 — 직관 판단용
function kboRecent5Html(name) {
  const rows = kboGetSnapshot()?.recent5?.[name];
  if (!rows || !rows.length) return '';
  const td = 'padding:2px 6px;font-family:\'JetBrains Mono\',monospace;font-size:11px;';
  return `<div style="margin-top:6px;overflow-x:auto;">
    <div class="hint" style="margin-bottom:2px;">최근 5선발 — <b style="color:var(--accent)">F5 실점</b>이 판정 기준 (풀게임 기록은 참고)</div>
    <table style="width:100%;border-collapse:collapse;">
      <tr style="color:var(--text3);font-size:10px;text-align:left;">
        <th style="${td}">최근 등판</th><th style="${td}">홈/원정</th><th style="${td}">상대</th>
        <th style="${td}color:var(--accent);">F5 실점</th>
        <th style="${td}">풀 IP</th><th style="${td}">풀 자책</th><th style="${td}">피안타</th><th style="${td}">BB</th><th style="${td}">K</th><th style="${td}">투구</th></tr>
      ${rows.map(r => {
        const f5 = Number(r.f5);
        const cf = Number.isFinite(f5) ? (f5 <= 1 ? 'var(--green)' : f5 >= 4 ? 'var(--red)' : 'var(--text2)') : 'var(--text3)';
        return `<tr style="border-top:1px solid var(--border);color:var(--text2);">
          <td style="${td}">${r.date.slice(5)}</td>
          <td style="${td}">${r.side === 'HOME' ? '홈' : r.side === 'AWAY' ? '원정' : '-'}</td>
          <td style="${td}">${r.opp}</td>
          <td style="${td}color:${cf};font-weight:800;font-size:12px;">${Number.isFinite(f5) ? f5 : '-'}</td>
          <td style="${td}opacity:.7;">${r.ip}</td><td style="${td}opacity:.7;">${r.er}</td>
          <td style="${td}opacity:.7;">${r.hits}</td>
          <td style="${td}opacity:.7;">${r.bb}</td><td style="${td}opacity:.7;">${r.k}</td><td style="${td}opacity:.7;">${r.np}</td></tr>`;
      }).join('')}
    </table></div>`;
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
  // v85: v2.0 필터 + Layer4 라인업 표시 (전부 표시 전용 — v1.0 판정 불변)
  const v2 = kboV2Pass(j.verdict, line);
  const luH = kboTagLineupNames(document.getElementById('kbo-g-lu-home')?.value, snap.hitters);
  const luA = kboTagLineupNames(document.getElementById('kbo-g-lu-away')?.value, snap.hitters);
  const bothAvg = (luH && luA) ? Math.round((luH.avg + luA.avg) / 2 * 10) / 10 : null;
  const baseline = snap.hitters ? kboDynBaseline(snap.hitters.baseline_pool, null) : null;
  const teamBase = snap.hitters ? kboTeamBaseline(snap.hitters.team_pool, null) : null;
  const luTag = kboLineupDisplayTag(j.verdict, bothAvg, baseline);
  _kboLastJudge = { j, home: hp.trim(), away: ap.trim(), line, oddsU, oddsO,
                    v2, luH, luA, bothAvg, baseline, teamBase, luTag };
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
      ${kboV1V2RowHtml(j.verdict, v2, line)}
      ${kboLineupBlockHtml(luH, luA, bothAvg, baseline, luTag, j.verdict, teamBase, ap.trim(), hp.trim())}
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


// v85: v1 / v2 칸 분리 표시 — v2는 필터(a)만 구현 (필터(b) 김건우류: 정의 유실, v73 S12-2)
function kboV1V2RowHtml(verdict, v2, line) {
  if (verdict === 'PASS') return '';
  const dirTxt = verdict === 'UNDER' ? '언더' : '오버';
  const v2txt = v2 === true ? `✓ ${dirTxt} (필터 통과)`
    : v2 === false ? `✗ 제거 — 기준점 ${line} ≤ 4.5` : '—';
  const v2col = v2 === true ? 'var(--green)' : v2 === false ? 'var(--text3)' : 'var(--text3)';
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px 10px;">
      <div class="hint">v1.0 (넓게 · 백테스트 58.8%)</div>
      <div style="font-size:13px;font-weight:800;color:var(--green);margin-top:2px;">✓ ${dirTxt} 신호</div>
    </div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px 10px;">
      <div class="hint">v2.0 (좁게 · in-sample 69.7%)</div>
      <div style="font-size:13px;font-weight:800;color:${v2col};margin-top:2px;">${v2txt}</div>
    </div>
  </div>
  <div class="hint" style="margin-top:3px;">v2 = 필터(a) 언더&기준점≤4.5 제거 · 필터(b)는 재구성 검증 결과 무신호로 폐기(상대선발 편차 상관 +0.02) · v2 수치는 in-sample(과최적화 편향)</div>`;
}

// v85: 라인업 카드 — 9명 태깅 + 평균 + 동적 기준선 + 사전등록 표시
function kboLineupBlockHtml(luH, luA, bothAvg, baseline, luTag, verdict, teamBase, awayPit, homePit) {
  if (!luH && !luA) return '';
  const one = (lu, role, facing) => {
    if (!lu) return `<div class="hint">${role} 라인업 미입력</div>`;
    const dv = teamBase != null ? Math.round((lu.avg - teamBase) * 10) / 10 : null;
    const dvCol = dv == null ? 'var(--text3)' : dv <= -3 ? 'var(--green)' : dv >= 3 ? 'var(--accent2, #ff9f0a)' : 'var(--text3)';
    return `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px 10px;">
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:12px;font-weight:700;color:var(--text2);">${role}</span>
        ${facing ? `<span class="hint">vs ${facing}</span>` : ''}
        <span style="margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:800;color:var(--text);">wRC+ ${lu.avg}</span>
        ${dv != null ? `<span style="font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:${dvCol};">${dv >= 0 ? '+' : ''}${dv}</span>` : ''}
      </div>
      <div style="margin-top:5px;display:flex;flex-direction:column;gap:1px;">
        ${lu.players.map((p, i) => `<div style="display:flex;gap:6px;font-size:11px;color:var(--text2);align-items:baseline;">
          <span style="width:14px;color:var(--text3);">${i + 1}</span>
          <span style="flex:1;">${p.name}</span>
          <span class="hint">${p.s10 != null ? `s10 ${p.s10}` : '—'}</span>
          <span style="width:120px;text-align:right;font-family:'JetBrains Mono',monospace;color:${p.src === '개인' ? 'var(--text)' : 'var(--text3)'};">
            ${p.raw_wrc != null && p.src !== '개인' ? `<span style="font-size:9px;opacity:.6;text-decoration:line-through;">${p.raw_wrc}</span> ` : ''}${p.val}${p.src === '개인' ? '' : ` <span style="font-size:9px;">${p.src}</span>`}</span>
        </div>`).join('')}
      </div>
      ${lu.n_input !== 9 ? `<div class="hint" style="color:var(--gold, #ffd60a);margin-top:3px;">⚠ ${lu.n_input}명 입력됨 (9명 권장)</div>` : ''}
    </div>`;
  };
  const TONE = { green: ['rgba(0,230,118,0.07)', 'rgba(0,230,118,0.35)', 'var(--green)'],
                 warn:  ['rgba(255,159,10,0.09)', 'rgba(255,159,10,0.4)', 'var(--accent2, #ff9f0a)'],
                 neutral: ['rgba(255,255,255,0.03)', 'var(--border)', 'var(--text2)'] };
  let tagHtml = '';
  if (bothAvg != null && baseline) {
    const diff = Math.round((bothAvg - baseline.value) * 10) / 10;
    const info = `양팀 평균 <b style="color:var(--text);">${bothAvg}</b> · 오늘 기준선 ${baseline.value} (직전 ${baseline.n}경기 중앙값) · <b>${diff >= 0 ? '+' : ''}${diff}</b>`;
    if (luTag) {
      const [bg, bd, fg] = TONE[luTag.tone] || TONE.neutral;
      tagHtml = `<div style="margin-top:8px;padding:8px 10px;border-radius:8px;background:${bg};border:1px solid ${bd};">
        <span style="font-size:13px;font-weight:800;color:${fg};">${luTag.label}</span>
        <span class="hint" style="margin-left:6px;">${info}</span>
        <div class="hint" style="margin-top:3px;">사전등록 v1.2 — <b>표시 전용</b>. 픽 판정에 관여하지 않음 (중립대 ±3, 적중률 미표시)</div>
      </div>`;
    } else {
      tagHtml = `<div style="margin-top:8px;padding:7px 10px;border-radius:8px;background:rgba(255,255,255,0.02);border:1px solid var(--border);">
        <span class="hint">${info}</span>
        <div class="hint" style="margin-top:2px;">${verdict === 'UNDER'
          ? '약체 기준(기준선 −3 이하) 미달 — 라벨 없음. 정예·중립은 검증상 근거 없어 라벨을 붙이지 않습니다'
          : '강화 라벨은 v1.0 UNDER 픽에서만 — 여기서는 정보만 참고'}</div>
      </div>`;
    }
  } else if (bothAvg != null) {
    tagHtml = `<div class="hint" style="margin-top:6px;">양팀 평균 ${bothAvg} · 기준선 미성립(30경기 미달)</div>`;
  }
  return `<div style="margin-top:10px;">
    <div class="hint-mb5">선발 라인업 (Layer4 — 정보 표시) ${teamBase != null ? `<span style="opacity:.7;">· 팀 기준선 ${teamBase}</span>` : ''}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">${one(luH, '홈', awayPit)}${one(luA, '원정', homePit)}</div>
    ${tagHtml}</div>`;
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
    memo: `[KBO F5 v1.0/${ledger === 'system' ? '시스템' : '감독자'}] ${extraMemo || ''}`
      + `${lj.v2 === true ? ' · v2✓' : lj.v2 === false ? ' · v2✗(기준점)' : ''}`
      + `${lj.luTag ? ` · ${lj.luTag.label}(평균 ${lj.bothAvg}/기준선 ${lj.baseline?.value})` : ''}`
      + ` (손익분기 ${(100 / odds).toFixed(1)}%)`,
    folderMemos: [], folderOdds: [], folderProbs: [], folderSports: [], folderTypes: [],
    emotion: '보통', violations: [],
    savedAt: new Date().toISOString(),
    ev: null, evRaw: null, adjustedProb: null, evCalibrated: null, calibProb: null,
    source: 'kbo_f5',
    kboMeta: { ledger, verdict: dir, home_pitcher: lj.home, away_pitcher: lj.away, line, odds,
               model_version: snap?.model_version || null, data_through: snap?.data_through || null,
               // v85 — 사전등록 판정용 (표시값 기록. 픽 판정에는 미관여)
               v2_pass: lj.v2 ?? null,
               lineup_home_avg: lj.luH?.avg ?? null, lineup_away_avg: lj.luA?.avg ?? null,
               lineup_both_avg: lj.bothAvg ?? null,
               lineup_baseline: lj.baseline?.value ?? null, lineup_baseline_n: lj.baseline?.n ?? null,
               lineup_tag: lj.luTag?.label ?? null,
               lineup_home: lj.luH ? lj.luH.players.map(p => `${p.name}:${p.val}${p.src === '개인' ? '' : '(' + p.src + ')'}`) : null,
               lineup_away: lj.luA ? lj.luA.players.map(p => `${p.name}:${p.val}${p.src === '개인' ? '' : '(' + p.src + ')'}`) : null,
               registered_at: new Date().toISOString() },
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
      ${snap.hitters ? `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;">
        <label class="hint">홈 라인업 (발표 후 9명 붙여넣기)<input id="kbo-g-lu-home" placeholder="정준재 박성한 마드리스* 김재환 ..." class="sim-num" style="width:100%;margin-top:3px;font-size:12px;"></label>
        <label class="hint">원정 라인업<input id="kbo-g-lu-away" placeholder="한태양 고승민 레이예스 ..." class="sim-num" style="width:100%;margin-top:3px;font-size:12px;"></label>
      </div>
      <div class="hint" style="margin-top:3px;">공백 구분 · 타순대로 9명 · <b style="color:var(--accent)">대체 외국인은 이름 뒤에 * 를 붙이세요</b> (예: <code>마드리스*</code>)
        <div class="hint" style="margin-top:2px;">* 는 <b>KBO 기록이 없을 때만</b> 적용됩니다(실측기대 ${typeof KBO_SUB_FOREIGN_NEW !== 'undefined' ? KBO_SUB_FOREIGN_NEW : 110}). 타석이 쌓이면 자동으로 실제 성적으로 바뀌므로 계속 * 를 붙여도 됩니다. * 없이 기록도 없으면 신인급(백업 80.9) 처리.</div></div>
      ` : `<div class="hint" style="margin-top:6px;">라인업 표시 OFF — features db를 드롭하면 활성화됩니다</div>`}
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
let _kboDbFiles = { db: null, dbName: null, features: null, featuresName: null };
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
//   수용: kbo.db(정확히 이 이름) / *features*.db(라인업 표시용, 26시즌 행만 사용) / *.txt(언옵) / *.json(스냅샷)
//   무시: kbo_2023/2024.db·chronology·csv·py·jsonl — 불필요
function kboIngestNamedFile(name, kind, content) {
  const base = name.split('/').pop();
  if (kind === 'db') {
    if (base === 'kbo.db') { _kboDbFiles.db = content; _kboDbFiles.dbName = base; return 'db'; }
    if (/features.*\.db$/i.test(base)) {
      // 단일시즌 원칙: 파일명에 시즌 연도가 있으면 현재 시즌과 일치할 때만 수용
      const SEASON = (typeof KBO_HITTER_SEASON !== 'undefined') ? KBO_HITTER_SEASON : '2026';
      const yr = base.match(/(20\d{2})/);
      if (yr && yr[1] !== SEASON) return 'wrong_season';
      _kboDbFiles.features = content; _kboDbFiles.featuresName = base; return 'features';
    }
    return 'ignored';   // kbo_2023.db·chronology_v2.db 등 — 미사용
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
    if (/features.*\.db$/i.test(base)) {
      const buf = await entry.async('arraybuffer');
      const res = kboIngestNamedFile(base, 'db', new Uint8Array(buf));
      if (res === 'features') nDb++; else nSkip++;
      continue;
    }
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
          if (res === 'wrong_season' && typeof simToast === 'function')
            simToast(`'${name}' — 다른 시즌 features 파일이라 무시했습니다 (단일시즌 원칙: ${typeof KBO_HITTER_SEASON !== 'undefined' ? KBO_HITTER_SEASON : '2026'}시즌 파일만 사용)`, 'info');
          else if (res === 'ignored' && typeof simToast === 'function') simToast(`'${name}' — v1.0에 불필요한 파일 (kbo.db만 사용)`, 'info');
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
        ① <b style="color:var(--text2)">최신 kbo.db</b> — 매번 새로 드롭 · ② <b style="color:var(--accent)">kbo_features db</b> (라인업 wRC+ 표시용 — <b>26시즌 행만 자동 사용, 25행 자동 제외</b>. 없으면 라인업 표시만 생략) · kbo_2023/2024·chronology·csv는 자동 무시
        ② <b style="color:var(--text2)">언옵 txt</b> — <b>한 번 넣으면 브라우저에 영구 저장</b>. 끝난 시즌·월 파일은 다시 넣을 필요 없고, 새 달 파일만 추가하면 됨.
        <b style="color:var(--accent)">kbo파일.zip을 통째로 드롭해도 됨</b> — kbo.db와 txt만 자동 추출.
      </div>
      <input type="file" multiple accept=".db,.txt,.json,.zip" onchange="(async()=>{for(const f of Array.from(this.files))await kboRouteDroppedFile(f);renderKboF5();}).call(this)" style="font-size:11px;">
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px;align-items:center;">
        ${chip(!!_kboDbFiles.db, `kbo.db ${_kboDbFiles.db ? '(이번 세션 적재됨)' : '(드롭 필요)'}`)}
        ${chip(!!_kboDbFiles.features, `features db ${_kboDbFiles.features ? '(적재됨 — 라인업 표시 ON)' : '(선택 — 없으면 라인업 표시 생략)'}`)}
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
    // v85: 라인업 표시용 — 해당 시즌만 (단일시즌 원칙, 감독자 확정)
    const SEASON = (typeof KBO_HITTER_SEASON !== 'undefined') ? KBO_HITTER_SEASON : '2026';
    const hitter_rows = q(`SELECT id, game_key, date, team, name, inning FROM hitter_inning_log
      WHERE date >= '${SEASON}-01-01' AND date <= '${SEASON}-12-31' ORDER BY game_key, inning, id`);
    // v85: 최근 5선발 표 — 직관 판단용 (감독자 요구)
    const recent_rows = q(`SELECT p.name as pitcher, p.date, p.team, p.opponent_team as opp,
      p.outs_recorded as outs, p.er, p.hits, p.bb, p.k, p.pitch_count as np,
      CASE WHEN p.team = i.home_team THEN 'HOME' ELSE 'AWAY' END as side,
      CASE WHEN p.team = i.home_team
        THEN COALESCE(i.away_i1,0)+COALESCE(i.away_i2,0)+COALESCE(i.away_i3,0)+COALESCE(i.away_i4,0)+COALESCE(i.away_i5,0)
        ELSE COALESCE(i.home_i1,0)+COALESCE(i.home_i2,0)+COALESCE(i.home_i3,0)+COALESCE(i.home_i4,0)+COALESCE(i.home_i5,0)
      END as f5_allowed
      FROM pitcher_log p JOIN inning_score i ON p.game_key = i.game_key
      WHERE p.is_starter=1 AND p.date >= '${SEASON}-01-01' ORDER BY p.name, p.date`);
    db.close();
    // v85: features db (선택) — 26시즌 행만 사용, 타 시즌 행은 제외하고 카운트 보고
    let wrc_rows = null, wrc_excluded = null;
    if (_kboDbFiles.features) {
      try {
        const fdb = new SQL.Database(_kboDbFiles.features);
        const fq = (sql) => {
          const res = fdb.exec(sql);
          if (!res.length) return [];
          const cols = res[0].columns;
          return res[0].values.map(v => Object.fromEntries(cols.map((c, i) => [c, v[i]])));
        };
        const total = fq("SELECT COUNT(*) as n FROM player_hitting_stats")[0]?.n || 0;
        wrc_rows = fq(`SELECT name, team, as_of_date as date, hit_wrc_plus_nopark as wrc, pa
          FROM player_hitting_stats WHERE as_of_date >= '${SEASON}-01-01' AND as_of_date <= '${SEASON}-12-31'`);
        wrc_excluded = total - wrc_rows.length;
        fdb.close();
        if (wrc_excluded > 0 && typeof simToast === 'function')
          simToast(`⚠ features db에 ${SEASON}시즌 외 행 ${wrc_excluded.toLocaleString()}개 — 자동 제외 (단일시즌 원칙). wRC+는 ${SEASON} 단독 빌드 권장`, 'info');
      } catch (e) {
        if (typeof simToast === 'function') simToast('features db 읽기 실패 — 라인업 표시 생략: ' + e.message, 'info');
        wrc_rows = null;
      }
    }
    const snap = kboBuildSnapshotFromDb({ pitcher_log, inning_score, unop_files: unops,
      hitter_rows, recent_rows, wrc_rows, wrc_excluded });
    kboRevalUpdate(snap);
    Storage.setJSON(KEYS.KBO_SNAPSHOT, snap);
    if (typeof simToast === 'function') simToast(`✅ 계산 완료 — 경기 ${snap.n_games}건 · 백테스트 ${snap.model_health.sim_wins}-${snap.model_health.sim_losses} · 신호 ${snap.pitchers.filter(p => p.signal).length}명`, 'ok');
    _kboDbFiles = { db: null, dbName: null, features: _kboDbFiles.features, featuresName: _kboDbFiles.featuresName };
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
