// ============================================================
// 전략베팅 — 렌더링 (판단 입력·확률 거울·방파제·트리·통계)
// ============================================================


function simSwitchTab(name) {
  ['play','tree','stats','goals','config'].forEach(t => {
    const tc = document.getElementById('sim-tc-' + t);
    const tab = document.getElementById('sim-tab-' + t);
    if (tc) tc.style.display = t === name ? 'block' : 'none';
    if (tab) {
      tab.style.background = t === name ? 'var(--bg3)' : 'transparent';
      tab.style.color = t === name ? 'var(--text)' : 'var(--text3)';
    }
  });
  if (name === 'tree')  simRenderTree();
  if (name === 'stats') simRenderStats();
  if (name === 'goals') simRenderGoalHistory();
}


// 배당 카드 ✏️ → 인라인 입력 열기 (자동값 프리필)
function simEditOdds(which) {
  const wrap = document.getElementById(`sim-odds-edit-${which}`);
  const inp = document.getElementById(`sim-odds-input-${which}`);
  if (!wrap || !inp) return;
  wrap.style.display = 'flex';
  inp.value = (simGetOdds(which) || '').toString();
  inp.focus();
  inp.select?.();
}


// 인라인 입력 적용 (Enter/확인)
function simApplyOddsEdit(which) {
  const inp = document.getElementById(`sim-odds-input-${which}`);
  const wrap = document.getElementById(`sim-odds-edit-${which}`);
  const val = parseFloat(inp?.value);
  if (Number.isFinite(val) && val >= 1.01) {
    // 자동값과 같으면 오버라이드로 남기지 않음 (기본=자동 고정)
    simOddsOverride[which] = (Math.abs(val - simGetAutoOdds(which)) < 0.005) ? null : val;
  }
  if (wrap) wrap.style.display = 'none';
  simOnInput();
}


// ↺ 자동 복귀
function simResetOddsOverride(which) {
  simOddsOverride[which] = null;
  const wrap = document.getElementById(`sim-odds-edit-${which}`);
  if (wrap) wrap.style.display = 'none';
  simOnInput();
}


function simResetOdds() {
  // 수동 배당 오버라이드 해제 (회차 종료 후 항상 자동으로 복귀)
  simOddsOverride = { a: null, b: null, c: null };
  // 폴더 라디오 초기화 (1~6폴 전 갈래)
  ['a','b','c'].forEach(w => {
    for (let n = 1; n <= 6; n++) {
      const el = document.getElementById(`sim-f-${w}${n}`); if (el) el.checked = false;
      const lblId = `sim-lbl-${w}f${n}`;
      const lbl = document.getElementById(lblId);
      if (lbl) { lbl.style.borderColor = 'var(--border)'; lbl.style.background = 'var(--bg2)'; }
    }
  });
}


function simRenderProbMirror() {
  const host = document.getElementById('sim-prob-mirror');
  if (!host) return;
  const bal = simState.balance, goal = SIM_GOAL;
  if (!(bal > 0) || !(goal > bal)) { host.innerHTML = ''; return; } // 이미 목표 이상/무효 → 숨김

  const { rates, pred, meta } = simBuildLegRates();
  const bandOf = (typeof _oddsBand === 'function') ? _oddsBand : _simBandBuiltin;
  const fallbackRate = (odds) => {
    const b = bandOf(odds);
    return (typeof pred[b] === 'number') ? pred[b] : Math.min(0.98, Math.max(0.02, 1 / (odds > 1 ? odds : 1.01)));
  };

  const cur = simReadAlloc();
  const odds = { o2: cur.o2, o3: cur.o3, o4: cur.o4 };
  const common = { startBal: bal, goal, legWinRates: rates, fallbackRate, trials: 1500, maxRounds: 40 };

  const roadmap = simMonteCarloPath({ ...common, allocFn: simMakeRoadmapAlloc(odds) });
  const hasInput = (cur.b2 + cur.b3 + cur.b4) > 0;
  const user = hasInput ? simMonteCarloPath({ ...common, allocFn: simMakeInputAlloc(cur) }) : null;

  const pct = v => (v * 100).toFixed(0);
  const roundsStr = r => (r.medianRounds == null ? '—'
    : `${r.medianRounds}회 <span style="color:var(--text3)">(${r.p10Rounds}~${r.p90Rounds})</span>`);

  const order = ['1.5 미만', '1.5~2', '2~3', '3 이상'];
  const cov = order.map(k => {
    const m = meta[k] || { n: 0 };
    if (!m.n) return null;
    return `${k} <b style="color:${m.real ? 'var(--green)' : 'var(--text3)'}">${m.real ? (rates[k] * 100).toFixed(0) + '%' : '폴백'}</b><span style="color:var(--text3)">(${m.n})</span>`;
  }).filter(Boolean).join(' · ');

  const usedBands = [...new Set([cur.o2, cur.o3, cur.o4].filter(o => o > 1).map(bandOf))];
  const fallbackUsed = usedBands.filter(b => typeof rates[b] !== 'number');

  // Step3: 세이브 비율 최적 제안 (회색 · 강제 아님)
  let optLine = '';
  try {
    const weights = hasInput ? [cur.b2, cur.b3, cur.b4] : [1, 0, 0];
    const best = simSuggestSaveRatio({ startBal: bal, goal, legWinRates: rates, fallbackRate, odds, betWeights: weights, trials: 500 });
    if (best) optLine = `<br>💡 세이브 <b style="color:var(--text2)">${(best.ratio * 100).toFixed(0)}%</b>면 도달확률이 가장 높아 (${(best.reachProb * 100).toFixed(0)}%) — 참고만, 결정은 너.`;
  } catch (e) {}

  host.innerHTML = (() => {
    // 헤드라인 = 하나의 결과(입력 있으면 네 배분, 없으면 제안 배분). 나머지는 전부 '자세히'로.
    const main = user || roadmap;
    const mainLabel = user ? '지금 네 배분 기준' : '제안 배분 기준 (금액 입력 시 네 배분으로 바뀜)';
    const reach = Math.round(main.reachProb * 100);
    const bust = Math.round(main.bustProb * 100);
    const miss = Math.max(0, 100 - reach - bust);
    const per100 = `100번 가면 <b style="color:var(--green)">${reach}번 목표 도달</b>, <b style="color:var(--red)">${bust}번 파산</b>${miss ? `, ${miss}번 미달` : ''}`;
    const rounds = main.medianRounds == null ? '' : ` · 도달까지 보통 <b style="color:var(--text2)">${main.medianRounds}회차</b> (${main.p10Rounds}~${main.p90Rounds})`;
    const cmp = user
      ? `제안 배분이면 도달 ${pct(roadmap.reachProb)}% · 파산 ${pct(roadmap.bustProb)}% (${(user.reachProb - roadmap.reachProb) >= 0 ? '네 배분이 +' : '제안이 +'}${Math.abs(Math.round((user.reachProb - roadmap.reachProb) * 100))}%p)`
      : '';
    return `
    <div class="mirror-card">
      <div class="sec-title" style="margin-bottom:8px;">이 배분으로 목표 ${simFmt(goal)}원까지 <span class="lbl-right">${mainLabel}</span></div>
      <div style="display:flex;align-items:baseline;gap:10px;">
        <span class="mirror-big" style="color:${reach >= bust ? 'var(--green)' : 'var(--red)'};">${reach}%</span>
        <span style="font-size:12px;color:var(--text2);">도달 확률</span>
      </div>
      <div class="mirror-bar" title="도달 ${reach}% · 미달 ${miss}% · 파산 ${bust}%">
        <div class="mirror-seg-reach" style="width:${reach}%"></div>
        <div class="mirror-seg-miss" style="width:${miss}%"></div>
        <div class="mirror-seg-bust" style="width:${bust}%"></div>
      </div>
      <div class="mirror-legend"><span>🟢 도달 ${reach}%</span><span>⬜ 미달 ${miss}%</span><span>🔴 파산 ${bust}%</span></div>
      <div class="mirror-say">${per100}${rounds} — 네 실측 적중률 기준, 금액 바꾸면 즉시 갱신.</div>
      ${cmp ? `<div class="mirror-cmp">${cmp}</div>` : ''}
      <details class="mirror-det">
        <summary>자세히 (실측 근거 · 제안 비교 · 세이브 최적)</summary>
        <div class="body">
          ${user ? `제안(로드맵) 배분: 도달 ${pct(roadmap.reachProb)}% / 파산 ${pct(roadmap.bustProb)}% / 예상 ${roundsStr(roadmap)}<br>` : ''}
          실측 커버리지: ${cov || '레그 표본 부족 — 전부 폴백(암시확률/예측 승률)'}
          ${fallbackUsed.length ? `<br><span style="color:var(--warn)">⚠ ${fallbackUsed.join(', ')} 배당대는 실측 부족 → 예측/암시 승률 사용</span>` : ''}
          ${optLine}
        </div>
      </details>
    </div>`;
  })();
}


let _simMirrorTimer = null;

function simScheduleProbMirror() {
  if (_simMirrorTimer) clearTimeout(_simMirrorTimer);
  _simMirrorTimer = setTimeout(() => { try { simRenderProbMirror(); } catch (e) {} }, 140);
}


// ── 세이브 방파제 체인 (확정 규칙: 100원 단위, 실탄 0 종료) ──────
function simRenderBreakwater() {
  const host = document.getElementById('sim-bw-result');
  if (!host) return;
  const bal = simState.balance, goal = SIM_GOAL;

  const saveRatio = Math.min(0.95, Math.max(0.05, (parseFloat(document.getElementById('sim-bw-save')?.value) || 55) / 100));
  const odds = Math.max(1.01, parseFloat(document.getElementById('sim-bw-odds')?.value) || 3);

  const alloc = simMakeBreakwaterAlloc({ saveRatio, odds, unit: 100 });
  const cur = alloc(bal);
  const stake = (cur.bets[0] && cur.bets[0].amount) || 0;
  const reqOdds = simRequiredOdds(goal, stake); // 목표 한방 필요배당

  const { rates, pred } = simBuildLegRates();
  const bandOf = (typeof _oddsBand === 'function') ? _oddsBand : _simBandBuiltin;
  const fallbackRate = (o) => { const b = bandOf(o); return (typeof pred[b] === 'number') ? pred[b] : Math.min(0.98, Math.max(0.02, 1 / (o > 1 ? o : 1.01))); };
  const band = bandOf(odds);
  const rateUsed = (typeof rates[band] === 'number') ? rates[band] : fallbackRate(odds);
  const isReal = typeof rates[band] === 'number';

  let mc = null;
  if (bal > 0 && goal > bal && stake > 0) {
    mc = simMonteCarloPath({ startBal: bal, goal, legWinRates: rates, fallbackRate, allocFn: alloc, trials: 1500, maxRounds: 60, minUnit: 100 });
  }

  const cell = (label, val, col, sz) => `<div><div style="font-size:9px;color:var(--text3)">${label}</div><div style="font-size:${sz || 15}px;font-weight:800;color:${col};font-family:'JetBrains Mono',monospace">${val}</div></div>`;

  host.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center;margin-bottom:10px;">
      ${cell('🛡 세이브(방파제)', simFmt(cur.sv) + '원', 'var(--gold)')}
      ${cell('🔥 실탄(이번 판)', simFmt(stake) + '원', 'var(--accent)')}
      ${cell('목표 한방 필요배당', reqOdds ? '×' + reqOdds.toFixed(1) : '—', 'var(--text2)')}
    </div>
    ${stake <= 0
      ? `<div style="font-size:11px;color:var(--red);">실탄 0원 — 여기가 체인 종료 지점이야. (더 태울 실탄 없음)</div>`
      : mc
        ? `<div style="border-top:1px solid var(--border);padding-top:10px;opacity:0.85;">
            <div class="hint-mb6">이 방식으로 목표(${simFmt(goal)}원)까지 — ${band} 적중률 <b style="color:${isReal ? 'var(--green)' : 'var(--text3)'}">${(rateUsed * 100).toFixed(0)}%</b>${isReal ? ' 실측' : ' 폴백'} 기준</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center;">
              ${cell('도달', (mc.reachProb * 100).toFixed(0) + '%', 'var(--green)', 18)}
              ${cell('파산', (mc.bustProb * 100).toFixed(0) + '%', 'var(--red)', 18)}
              ${cell('예상 회차', mc.medianRounds == null ? '—' : mc.medianRounds + '회', 'var(--text2)', 13)}
            </div>
            <div style="font-size:9px;color:var(--text3);margin-top:8px;line-height:1.6;">세이브가 원금을 계속 지켜서 파산이 느린 대신, 목표 도달도 느려. 제안일 뿐 — 결정은 너.</div>
          </div>`
        : `<div class="hint">현재 잔액이 목표 이상이거나 실탄이 없어 시뮬레이션 생략.</div>`}`;
}


let _simBwTimer = null;

function simScheduleBreakwater() {
  if (_simBwTimer) clearTimeout(_simBwTimer);
  _simBwTimer = setTimeout(() => { try { simRenderBreakwater(); } catch (e) {} }, 140);
}


let simHistOpen = false;

function simToggleHistory() {
  simHistOpen = !simHistOpen;
  const list = document.getElementById('sim-hlist');
  const btn  = document.getElementById('sim-hist-toggle');
  if(list) list.style.display = simHistOpen ? '' : 'none';
  if(btn)  btn.textContent = simHistOpen ? '접기' : '펼치기';
}


function simRender() {
  const bal = simState.balance;
  const rb=document.getElementById('sim-round-badge'); if(rb) rb.textContent=`ROUND ${simState.round}`;
  const balEl=document.getElementById('sim-bal'); if(balEl) balEl.innerHTML=`${simFmt(bal)}<span style="font-size:16px;color:var(--text3);margin-left:4px;">원</span>`;
  const pct=Math.min(100,(bal/SIM_GOAL)*100);
  const pctEl=document.getElementById('sim-prog-pct'); if(pctEl) pctEl.textContent=pct.toFixed(1)+'%';
  const gmEl=document.getElementById('sim-goal-meta'); if(gmEl) gmEl.textContent='목표 '+simFmt(SIM_GOAL)+'원';
  const fill=document.getElementById('sim-prog-fill'); if(fill){fill.style.width=pct+'%';fill.style.background=bal>=SIM_GOAL?'linear-gradient(90deg,var(--green),#00e676)':'linear-gradient(90deg,rgba(0,229,255,0.6),var(--accent))';}
  const gdEl=document.getElementById('sim-goal-display'); if(gdEl) gdEl.textContent=simFmt(SIM_GOAL)+'원';
  const gmode=document.getElementById('sim-goal-mode');
  if(gmode){ const man = (typeof simGoalIsManual==='function') && simGoalIsManual();
    gmode.textContent = man ? '수동 설정' : '설정 탭 연동';
    gmode.style.color = man ? 'var(--gold)' : 'var(--text3)'; }
  let lastSave=0; for(let i=simState.history.length-1;i>=0;i--){if(simState.history[i].save>0){lastSave=simState.history[i].save;break;}}
  const sr=document.getElementById('sim-save-row'); if(sr) sr.style.display=lastSave>0?'flex':'none';
  const sa=document.getElementById('sim-save-amt'); if(sa) sa.textContent=simFmt(lastSave)+'원';
  const plan=simGetPlan(bal);
  const pb=document.getElementById('sim-plan-box'); if(pb) pb.style.display=plan?'block':'none';
  const pbd=document.getElementById('sim-plan-body'); if(pbd&&plan) pbd.innerHTML=`<strong style="color:var(--accent)">${plan.tag}</strong> — ${plan.body}`;
  const hint=simGetHint(bal);
  const hb=document.getElementById('sim-hint-box'); if(hb) hb.style.display=hint?'flex':'none';
  const hbd=document.getElementById('sim-hint-body');
  if(hbd&&hint){let h=`${hint.zone} | 세이브 <span style="color:var(--gold)">${simFmt(hint.sv)}원</span> A베팅 <span style="color:var(--accent)">${simFmt(hint.b2)}원</span>`;if(hint.b3>0)h+=` B베팅 <span style="color:var(--green)">${simFmt(hint.b3)}원</span>`;if(hint.b4>0)h+=` C베팅 <span style="color:var(--accent2)">${simFmt(hint.b4)}원</span>`;hbd.innerHTML=h;}
  const gb=document.getElementById('sim-goal-banner'); if(gb) gb.style.display=simState.goalReached?'block':'none';
  const gt=document.getElementById('sim-goal-text'); if(gt&&simState.goalReached) gt.textContent=`세이브 100만원 달성! — ${simState.round-1}회차 완료`;
  simRenderHistory();
  // 홀딩 패널은 simRender 호출 경로와 무관하게 항상 동기화
  if (typeof simRenderPending === 'function') simRenderPending();
}


// ============================================================
// 전략베팅 판단 데이터 입력 (단폴: 종목·예측승률 / 다폴: 폴더별 배당·승률·종목)
//   → 홀딩 시 buildStrategyBet(bet_record.js) 경유로 베팅기록 미결(PENDING) 전송.
//   목적: myProb·폴더 데이터가 실려 과신방어/레그성적표/한끗/사망레그경고가
//         전략베팅 갈래까지 커버 (지시서 목표).
//   종목/유형 선택 = tags_ui.js의 기존 피커(openSportPicker/openSimTypePicker) 재사용.
//   SPORT_CATS·TYPE_OPTIONS 복제 금지 — 베팅기록 폼과 동일 UI/데이터.
// ============================================================

// 판단 유닛 공통 마크업: 종목 이모지 4버튼 + 세부종목 배지 + 유형 2버튼 + 유형 배지
//   hidden: sportId(단폴은 id 유지 — 하위호환) 또는 클래스만(.sim-fold-sport/.sim-fold-type)
function simJudgePickerHtml(o) {
  const sportHiddenAttr = o.sportId ? `id="${o.sportId}" class="sim-sport-h ${o.sportClass || ''}"` : `class="sim-sport-h ${o.sportClass || ''}"`;
  const typeHiddenAttr  = o.typeId  ? `id="${o.typeId}" class="sim-type-h ${o.typeClass || ''}"`   : `class="sim-type-h ${o.typeClass || ''}"`;
  const eb = (cat, ico) => `<button type="button" onclick="openSportPicker('sim',this,'${cat}')" class="sim-emoji-btn">${ico}</button>`;
  const tb = (cat, ico) => `<button type="button" onclick="openSimTypePicker(this,'${cat}')" class="sim-typesel-btn">${ico}</button>`;
  return `
    <div class="sim-picker-col">
      <input type="hidden" ${sportHiddenAttr} value="">
      <div class="sim-emoji-grid">
        ${eb('축구','⚽')}${eb('야구','⚾')}${eb('농구','🏀')}${eb('배구','🏐')}
      </div>
      <div class="sim-sport-label">종목 선택</div>
    </div>
    <div class="sim-picker-col">
      <input type="hidden" ${typeHiddenAttr} value="">
      <div class="sim-type-grid">
        ${tb('일반','🏁')}${tb('전반','⏱️')}
      </div>
      <div class="sim-type-label">유형</div>
    </div>`;
}


// 판단 데이터 입력 UI 렌더 (폴더 수 변경 시 재구성, 기존 입력값 보존)
//   행 수 = max(폴더수, 1). 모든 행에 경기 배당 입력 → 합산 배당 자동 산출(simGetOdds).
function simRenderJudge() {
  ['a', 'b', 'c'].forEach(which => {
    const host = document.getElementById(`sim-judge-${which}`);
    if (!host) return;
    const count = simBranchFolderCount(which);
    const n = Math.max(count, 1);
    const bucket = String(n);
    if (host.dataset.bucket === bucket) return; // 구조 동일 → 재구성 스킵 (포커스/입력 보존)
    host.dataset.bucket = bucket;
    const label = which.toUpperCase();
    const color = which === 'a' ? 'var(--accent)' : which === 'b' ? 'var(--green)' : 'var(--accent2)';

    // 값 보존/복원 = 공용 접근 계층(sim_state.js) 사용
    const keepUnit = simReadJudgeUnit;
    const restoreUnit = (u, k) => simWriteJudgeUnit(u, k);

    const keep = Array.from(host.querySelectorAll('.sim-judge-unit')).map(keepUnit);
    const single = n === 1;
    let rows = '';
    for (let i = 0; i < n; i++) {
      // 단폴은 기존 id 유지 (하위호환: sim-sport-w / sim-type-w / sim-prob-w)
      const ids = single ? { sportId: `sim-sport-${which}`, typeId: `sim-type-${which}` } : {};
      const probIdAttr = single ? `id="sim-prob-${which}" ` : '';
      rows += `<div class="sim-judge-unit sim-fold-row sim-judge-row">
        ${simJudgePickerHtml({ ...ids, sportClass: 'sim-fold-sport', typeClass: 'sim-fold-type' })}
        <input type="number" class="sim-fold-odds sim-num" placeholder="배당" step="0.01" min="1" oninput="simOnInput()">
        <input type="number" ${probIdAttr}class="sim-fold-prob sim-num" placeholder="승률%" min="1" max="99" step="0.1" oninput="simOnInput()">
      </div>`;
    }
    host.innerHTML = `<div style="font-size:10px;color:${color};margin-bottom:5px;font-weight:600;">${label} · ${single ? '단폴' : count + '폴 폴더별 입력'} <span style="color:var(--text3);font-weight:400;">경기 배당·승률 입력 → 합산 배당 자동</span></div>${rows}`;
    host.querySelectorAll('.sim-judge-unit').forEach((u, i) => restoreUnit(u, keep[i]));
  });
}


// 판단 데이터 입력값 초기화 (홀딩 후 폼 리셋 시)
function simClearJudgeInputs() {
  ['a', 'b', 'c'].forEach(w => {
    const host = document.getElementById(`sim-judge-${w}`);
    if (!host) return;
    host.querySelectorAll('input').forEach(i => { i.value = ''; });
    host.querySelectorAll('.sim-sport-label').forEach(l => { l.textContent = '종목 선택'; l.style.color = 'var(--text3)'; });
    host.querySelectorAll('.sim-type-label').forEach(l => { l.textContent = '유형'; });
  });
}


function simRenderPending() {
  const sec = document.getElementById('sim-pending-section');
  if (!sec) return;
  if (!simPending) { sec.style.display = 'none'; return; }

  sec.style.display = 'block';
  const p = simPending;
  const rndEl = document.getElementById('sim-pending-round');
  if (rndEl) rndEl.textContent = `${p.round}회차`;

  const lines = [];
  if (p.sv > 0)  lines.push(`🛡 세이브 <strong style="color:var(--gold)">${simFmt(p.sv)}원</strong>`);
  if (p.b2 > 0)  lines.push(`A - ${p.memo||'-'} <strong style="color:var(--accent)">${simFmt(p.b2)}원</strong> <span style="color:var(--text3)">(x${p.o2?.toFixed(2)||'-'})</span>`);
  if (p.b3 > 0)  lines.push(`B - ${p.memoB||'-'} <strong style="color:#a78bfa">${simFmt(p.b3)}원</strong> <span style="color:var(--text3)">(x${p.o3?.toFixed(2)||'-'})</span>`);
  if (p.b4 > 0)  lines.push(`C - ${p.memoC||'-'} <strong style="color:var(--accent2)">${simFmt(p.b4)}원</strong> <span style="color:var(--text3)">(x${p.o4?.toFixed(2)||'-'})</span>`);

  const infoEl = document.getElementById('sim-pending-info');
  if (infoEl) infoEl.innerHTML = lines.join('<br>');

  // 진행중 버튼 동적 생성
  // C폴더 버튼: b4가 설정된 이상 잔액 조건과 무관하게 표시해야 함
  // (홀딩 후 F5, 또는 잔액 변동 시에도 잘못된 버튼셋이 렌더되는 버그 수정)
  const hasC  = (simPending?.b4 || 0) > 0;
  const hasB  = (simPending?.b3 || 0) > 0;
  const pendingBtns = document.getElementById('sim-pending-btns');
  if (pendingBtns) {
    const btns = hasC ? [
      { key:'both',  label:'✓ A+B+C 모두', col:'var(--green)',    bg:'rgba(0,230,118,0.08)',   border:'rgba(0,230,118,0.3)' },
      { key:'ab',    label:'✓ A+B만',       col:'var(--accent)',  bg:'rgba(0,229,255,0.08)',   border:'rgba(0,229,255,0.3)' },
      { key:'ac',    label:'✓ A+C만',       col:'var(--accent)',  bg:'rgba(0,229,255,0.08)',   border:'rgba(0,229,255,0.3)' },
      { key:'bc',    label:'✓ B+C만',       col:'#a78bfa',        bg:'rgba(167,139,250,0.08)', border:'rgba(167,139,250,0.3)' },
      { key:'onlyA', label:'✓ A만',         col:'var(--accent)',  bg:'rgba(0,229,255,0.08)',   border:'rgba(0,229,255,0.3)' },
      { key:'onlyB', label:'✓ B만',         col:'#a78bfa',        bg:'rgba(167,139,250,0.08)', border:'rgba(167,139,250,0.3)' },
      { key:'onlyC', label:'✓ C만',         col:'var(--accent2)', bg:'rgba(255,107,53,0.08)',  border:'rgba(255,107,53,0.3)' },
      { key:'lose',  label:'✗ 모두 실패',   col:'var(--red)',     bg:'rgba(255,59,92,0.08)',   border:'rgba(255,59,92,0.3)' },
    ] : hasB ? [
      { key:'both',  label:'✓ A+B 모두',   col:'var(--green)',   bg:'rgba(0,230,118,0.08)',   border:'rgba(0,230,118,0.3)' },
      { key:'only2', label:'✓ A만 성공',   col:'var(--accent)',  bg:'rgba(0,229,255,0.08)',   border:'rgba(0,229,255,0.3)' },
      { key:'only3', label:'✓ B만 성공',   col:'#a78bfa',        bg:'rgba(167,139,250,0.08)', border:'rgba(167,139,250,0.3)' },
      { key:'lose',  label:'✗ 모두 실패',  col:'var(--red)',     bg:'rgba(255,59,92,0.08)',   border:'rgba(255,59,92,0.3)' },
    ] : [
      { key:'only2', label:'✓ A 성공',     col:'var(--green)',   bg:'rgba(0,230,118,0.08)',   border:'rgba(0,230,118,0.3)' },
      { key:'lose',  label:'✗ A 실패',     col:'var(--red)',     bg:'rgba(255,59,92,0.08)',   border:'rgba(255,59,92,0.3)' },
    ];
    pendingBtns.innerHTML = btns.map(b =>
      `<button onclick="simApplyPending('${b.key}')" style="padding:10px;border-radius:8px;border:1px solid ${b.border};background:${b.bg};color:${b.col};font-size:12px;font-weight:700;cursor:pointer;">${b.label}</button>`
    ).join('');
  }

  // B 없으면 B만 성공 버튼 비활성화 (legacy)
  const bBtn = document.getElementById('sim-pending-b-btn');
  if (bBtn) { bBtn.style.opacity = p.b3 > 0 ? '1' : '0.3'; bBtn.disabled = p.b3 === 0; }
}


function simRenderHistory() {
  const list=document.getElementById('sim-hlist'), hstats=document.getElementById('sim-hstats');
  if(!list) return;
  if(!simState.history.length){list.innerHTML='<div style="font-size:13px;color:var(--text3);text-align:center;padding:20px 0;">아직 진행한 회차가 없어요</div>';if(hstats)hstats.textContent='';return;}
  const WIN_KEYS  = ['both','only2','onlyA','onlyB','onlyC','ab','ac','bc'];
  const PART_KEYS = ['only3'];
  const wins  = simState.history.filter(h => WIN_KEYS.includes(h.key)).length;
  const parts = simState.history.filter(h => PART_KEYS.includes(h.key)).length;
  const loses = simState.history.filter(h => h.key==='lose').length;
  if(hstats) hstats.textContent=`성공 ${wins} / 부분 ${parts} / 실패 ${loses}`;
  list.innerHTML=[...simState.history].reverse().map((h,revIdx)=>{
    const realIdx = simState.history.length - 1 - revIdx;
    const cls = ['both','only2','onlyA','onlyB','onlyC','ab','ac','bc'].includes(h.key) ? 'var(--green)' : h.key==='lose' ? 'var(--red)' : '#a78bfa';
    const diff=h.after-h.before;
    const chips=[];
    if(h.folder) chips.push(`<span style="font-size:10px;padding:2px 7px;border-radius:20px;background:${h.folder===1?'rgba(255,215,0,0.12)':'rgba(0,230,118,0.12)'};color:${h.folder===1?'var(--gold)':'var(--green)'};">${h.folder}폴더</span>`);
    if(h.save>0) chips.push(`<span style="font-size:10px;padding:2px 7px;border-radius:20px;background:rgba(255,215,0,0.1);color:var(--gold);">세이브 ${simFmt(h.save)}</span>`);
    if(h.bet2>0) chips.push(`<span style="font-size:10px;padding:2px 7px;border-radius:20px;background:rgba(0,229,255,0.1);color:var(--accent);">A(x${h.odds2}) ${simFmt(h.bet2)}</span>`);
    if(h.bet3>0) chips.push(`<span style="font-size:10px;padding:2px 7px;border-radius:20px;background:rgba(167,139,250,0.1);color:#a78bfa;">B(x${h.odds3}) ${simFmt(h.bet3)}</span>`);
    const isWin  = ['both','only2','onlyA','onlyB','onlyC','ab','ac','bc'].includes(h.key);
    const isLose = h.key==='lose';
    return `<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span style="font-size:11px;color:var(--text3);min-width:28px;">${h.round}회</span>
        ${chips.join('')}
        <span class="hint11">→</span>
        <span style="font-size:13px;font-weight:700;color:${cls};font-family:'JetBrains Mono',monospace;">${simFmt(h.after)}원</span>
        <span style="font-size:11px;color:${diff>=0?'rgba(0,230,118,0.6)':'rgba(255,59,92,0.6)'};">${diff>=0?'+':''}${simFmt(diff)}</span>
        <button onclick="simToggleResult(${realIdx},'win')" style="padding:5px 10px;font-size:11px;border-radius:20px;border:1px solid ${isWin?'var(--green)':'var(--border)'};background:${isWin?'rgba(0,230,118,0.15)':'var(--bg3)'};color:${isWin?'var(--green)':'var(--text3)'};cursor:pointer;">✓ 성공</button>
        <button onclick="simToggleResult(${realIdx},'lose')" style="padding:5px 10px;font-size:11px;border-radius:20px;border:1px solid ${isLose?'var(--red)':'var(--border)'};background:${isLose?'rgba(255,59,92,0.12)':'var(--bg3)'};color:${isLose?'var(--red)':'var(--text3)'};cursor:pointer;">✗ 실패</button>
        <button onclick="simDeleteHistory(${realIdx})" style="padding:5px 10px;font-size:11px;border-radius:20px;border:1px solid var(--border);background:var(--bg3);color:var(--text3);cursor:pointer;">🗑</button>
      </div>
      ${h.memo?`<div style="font-size:11px;color:var(--text3);padding-left:4px;font-style:italic;margin-top:3px;">"${h.memo}"${h.memoB?` / "${h.memoB}"`:''}　</div>`:''}
      <div style="margin-top:6px;display:flex;align-items:center;gap:6px;">
        <input type="text" value="${(h.note||'').replace(/"/g,'&quot;')}" placeholder="📝 이 회차 메모..."
          onblur="simSaveNote(${realIdx}, this.value)"
          onkeydown="if(event.key==='Enter'){this.blur();}"
          style="flex:1;padding:5px 8px;font-size:12px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text2);min-width:0;">
      </div>
    </div>`;
  }).join('');
}


function simRenderGoalHistory() {
  const list=document.getElementById('sim-goal-hist-list');
  if(!list) return;
  if(!simState.goalHistory.length){list.innerHTML='<div style="font-size:12px;color:var(--text3);text-align:center;padding:20px;">아직 달성한 목표가 없어요</div>';return;}
  list.innerHTML=[...simState.goalHistory].reverse().map((g,i)=>`
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
      <div style="background:rgba(0,230,118,0.12);color:var(--green);font-size:12px;font-weight:600;padding:3px 10px;border-radius:20px;">${simState.goalHistory.length-i}번째</div>
      <div>
        <div style="font-size:14px;font-weight:700;font-family:'JetBrains Mono',monospace;">${simFmt(g.amount)}원 달성</div>
        <div class="hint11">목표 ${simFmt(g.goal)}원 · ${g.round}회차 · ${g.timestamp}</div>
      </div>
    </div>`).join('');
}


function simRenderTreeVertical() {
  const el = document.getElementById('sim-tree-vertical');
  if (!el) return;
  const h = simState.history;
  const C = {
    both:'#3ecf8e', only2:'#3ecf8e', only3:'#3ecf8e', bc:'#3ecf8e',
    onlyA:'#00e5ff', onlyB:'#a78bfa', onlyC:'#ff6b35', lose:'#ff3b5c',
    ab:'#3ecf8e', ac:'#3ecf8e'
  };
  const lmap = {
    both:'ABC✓', ab:'A+B✓', ac:'A+C✓', bc:'B+C✓',
    onlyA:'A✓', onlyB:'B✓', onlyC:'C✓', lose:'실패',
    only2:'A✓', only3:'B✓', 'both-old':'AB✓'
  };

  if (!h.length) {
    el.innerHTML = '<div style="font-size:12px;color:#4a5168;text-align:center;padding:20px;">아직 진행한 회차가 없어요</div>';
    return;
  }

  let html = '<div style="padding:4px 0;">';
  h.forEach((item, i) => {
    const col = C[item.key] || '#4a5168';
    const isLast = i === h.length - 1;
    const diff = item.after - item.before;
    html += `
      <div style="display:flex;align-items:stretch;gap:12px;">
        <div style="display:flex;flex-direction:column;align-items:center;width:32px;flex-shrink:0;">
          <div style="width:32px;height:32px;border-radius:50%;background:${col}22;border:1.5px solid ${col};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:${col};font-family:'JetBrains Mono',monospace;flex-shrink:0;">${item.round}</div>
          ${!isLast ? `<div style="width:1.5px;flex:1;min-height:20px;background:${col};opacity:0.25;margin:3px 0;"></div>` : ''}
        </div>
        <div style="flex:1;padding-bottom:${isLast?'0':'16px'};">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
            <span style="font-size:12px;font-weight:700;color:${col};font-family:'JetBrains Mono',monospace;">${(item.after/10000).toFixed(0)}만원</span>
            <span style="font-size:10px;padding:1px 6px;border-radius:20px;background:${col}22;color:${col};">${item.key==='both'?(item.bet4>0?'ABC✓':'AB✓'):lmap[item.key]}</span>
            <span style="font-size:10px;color:${diff>=0?'#3ecf8e':'#ff3b5c'};">${diff>=0?'+':''}${(diff/10000).toFixed(0)}만</span>
          </div>
          ${item.memo?`<div style="font-size:10px;color:#4a5168;font-style:italic;">${item.memo}</div>`:''}
          ${item.save>0?`<div style="font-size:10px;color:#ffd700;">세이브 ${(item.save/10000).toFixed(0)}만원</div>`:''}
        </div>
      </div>`;
  });

  // 현재 노드
  html += `
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="width:32px;height:32px;border-radius:50%;background:rgba(255,215,0,0.15);border:1.5px dashed #ffd700;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#ffd700;font-family:'JetBrains Mono',monospace;flex-shrink:0;">NOW</div>
      <div style="font-size:12px;color:#ffd700;font-family:'JetBrains Mono',monospace;">${(simState.balance/10000).toFixed(0)}만원</div>
    </div>`;

  html += '</div>';
  el.innerHTML = html;
}


function simRenderTree() {
  const isMobile = window.innerWidth < 600;
  const horiz = document.getElementById('sim-tree-horizontal');
  const vert  = document.getElementById('sim-tree-vertical');
  if (horiz) horiz.style.display = isMobile ? 'none' : 'block';
  if (vert)  vert.style.display  = isMobile ? 'block' : 'none';

  if (isMobile) { simRenderTreeVertical(); return; }

  const wrap = document.getElementById('sim-tree-horizontal');
  const canvas = document.getElementById('sim-tree-canvas');
  if (!canvas || !wrap) return;

  // 숨겨진 탭에서 호출 시 clientWidth가 0이 되는 타이밍 버그 수정:
  // requestAnimationFrame으로 레이아웃 계산 후 실행 (무한 재귀 방지: 최대 5회)
  if (wrap.clientWidth === 0) {
    window._simTreeRetryCount = (window._simTreeRetryCount || 0) + 1;
    if (window._simTreeRetryCount > 5) {
      window._simTreeRetryCount = 0;
      return; // 5회 시도 후에도 레이아웃이 안 잡히면 포기 (예: 탭이 계속 숨김 상태)
    }
    requestAnimationFrame(() => simRenderTree());
    return;
  }
  window._simTreeRetryCount = 0;

  const ctx = canvas.getContext('2d');

  const h = simState.history;
  if (!h.length) {
    canvas.width = wrap.clientWidth || 320;
    canvas.height = 80;
    ctx.fillStyle = '#4a5168';
    ctx.font = '13px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('아직 진행한 회차가 없어요', canvas.width/2, 44);
    return;
  }

  // 각 회차별 분기 노드 계산
  // 실제 경로 추적 + 각 노드에서 성공/실패 시 예상 잔액
  const COL_W = 90;
  const ROW_H = 56;
  const NODE_R = 18;
  const PAD_X = 60;
  const PAD_Y = 40;

  // 각 회차별 실제 경로 노드 y위치 결정
  // 성공이면 위(y-1), 실패면 아래(y+1), 세이브면 제자리(y+0.5)
  let nodes = [{ round: 0, y: 0, bal: SIM_START, actual: true }];
  let curY = 0;

  h.forEach((item, i) => {
    const isWin = ['both','only2','onlyA','onlyB','onlyC','ab','ac','bc'].includes(item.key);
    const isLose = item.key === 'lose';
    const dy = isWin ? -1 : isLose ? 1 : 0.5; // 성공=위, 실패=아래, 세이브=중간
    curY += dy;
    nodes.push({ round: item.round, y: curY, bal: item.after, key: item.key, actual: true, save: item.save, memo: item.memo, memoB: item.memoB });
  });

  // 현재 노드에서 미래 예상 분기 (1단계)
  const lastBal = simState.balance;
  const sv = Math.round(lastBal * 0.28 / 10000) * 10000;
  const b2 = lastBal - sv;
  const winAmt = sv + Math.round(b2 * 2.0);
  const loseAmt = sv;
  const futureWinY = curY - 1;
  const futureWinBal = winAmt;
  const futureLoseY = curY + 1;
  const futureLoseBal = loseAmt;

  // y 범위 계산
  const allY = nodes.map(n => n.y).concat([futureWinY, futureLoseY]);
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);
  const yRange = maxY - minY;

  const totalCols = h.length + 2; // 시작 + 회차들 + 미래
  const W = Math.max(wrap.clientWidth || 320, PAD_X * 2 + totalCols * COL_W);
  const H = Math.max(200, PAD_Y * 2 + (yRange + 2) * ROW_H);

  canvas.width = W;
  canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  const toX = idx => PAD_X + idx * COL_W;
  const toY = y => PAD_Y + (y - minY + 1) * ROW_H;

  // 색상
  const C = {
    both: '#3ecf8e', only2: '#00e5ff', only3: '#a78bfa', lose: '#ff3b5c',
    future: 'rgba(255,215,0,0.5)', node: '#1a1e28', text: '#8890a4',
    line: 'rgba(255,255,255,0.12)', gold: '#ffd700'
  };

  // 실제 경로 라인 먼저 그리기
  ctx.lineWidth = 2;
  nodes.forEach((n, i) => {
    if (i === 0) return;
    const prev = nodes[i-1];
    const col = C[n.key] || C.only2;
    ctx.beginPath();
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.7;
    ctx.moveTo(toX(i-1), toY(prev.y));
    // 곡선 연결
    const mx = (toX(i-1) + toX(i)) / 2;
    ctx.bezierCurveTo(mx, toY(prev.y), mx, toY(n.y), toX(i), toY(n.y));
    ctx.stroke();
  });

  // 미래 분기 라인 (점선)
  const lastIdx = nodes.length - 1;
  const lastNode = nodes[lastIdx];
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.5;

  // 성공 분기
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(0,230,118,0.35)';
  ctx.globalAlpha = 1;
  const mx1 = (toX(lastIdx) + toX(lastIdx+1)) / 2;
  ctx.moveTo(toX(lastIdx), toY(lastNode.y));
  ctx.bezierCurveTo(mx1, toY(lastNode.y), mx1, toY(futureWinY), toX(lastIdx+1), toY(futureWinY));
  ctx.stroke();

  // 실패 분기
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(255,59,92,0.35)';
  ctx.moveTo(toX(lastIdx), toY(lastNode.y));
  ctx.bezierCurveTo(mx1, toY(lastNode.y), mx1, toY(futureLoseY), toX(lastIdx+1), toY(futureLoseY));
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // 노드 그리기
  nodes.forEach((n, i) => {
    const x = toX(i), y = toY(n.y);
    const col = i === 0 ? '#4a5168' : (C[n.key] || C.only2);
    const isLast = i === lastIdx;

    // 원
    ctx.beginPath();
    ctx.arc(x, y, NODE_R, 0, Math.PI * 2);
    ctx.fillStyle = col + (isLast ? '33' : '1a');
    ctx.fill();
    ctx.strokeStyle = isLast ? C.gold : col;
    ctx.lineWidth = isLast ? 2.5 : 1.5;
    ctx.stroke();

    // 회차 텍스트 위
    ctx.fillStyle = '#4a5168';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    if (i > 0) ctx.fillText(`${n.round}회`, x, y - NODE_R - 5);

    // 잔액 텍스트
    const balStr = n.bal >= 10000 ? (n.bal/10000).toFixed(0)+'만' : simFmt(n.bal);
    ctx.fillStyle = isLast ? C.gold : col;
    ctx.font = `${isLast ? 'bold ' : ''}9px JetBrains Mono, monospace`;
    ctx.fillText(balStr, x, y + 4);

    // 결과 텍스트 아래
    if (i > 0 && n.key) {
      const lmap = {
        both:'ABC✓', ab:'A+B✓', ac:'A+C✓', bc:'B+C✓',
        onlyA:'A✓', onlyB:'B✓', onlyC:'C✓',
        only2:'A✓', only3:'B✓', lose:'실패'
      };
      ctx.fillStyle = col;
      ctx.font = '8px JetBrains Mono, monospace';
      ctx.fillText(lmap[n.key] || '', x, y + NODE_R + 12);
    }
  });

  // 미래 예상 노드 (성공)
  const fwx = toX(lastIdx+1), fwy = toY(futureWinY);
  ctx.beginPath();
  ctx.arc(fwx, fwy, NODE_R - 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,230,118,0.08)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,230,118,0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3,3]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(0,230,118,0.5)';
  ctx.font = '9px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  const fwStr = winAmt >= 10000 ? (winAmt/10000).toFixed(0)+'만' : simFmt(winAmt);
  ctx.fillText(fwStr, fwx, fwy + 4);

  // 미래 예상 노드 (실패)
  const flx = toX(lastIdx+1), fly = toY(futureLoseY);
  ctx.beginPath();
  ctx.arc(flx, fly, NODE_R - 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,59,92,0.08)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,59,92,0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3,3]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,59,92,0.5)';
  ctx.font = '9px JetBrains Mono, monospace';
  const flStr = loseAmt >= 10000 ? (loseAmt/10000).toFixed(0)+'만' : loseAmt > 0 ? simFmt(loseAmt) : '0';
  ctx.fillText(flStr, flx, fly + 4);

  // 시작 라벨
  ctx.fillStyle = '#4a5168';
  ctx.font = '9px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('시작', toX(0), toY(nodes[0].y) + 4);
}


function simRenderStats() {
  const h=simState.history;
  const startBal = h.length > 0 ? h[0].before : simState.balance;

  // 성공/부분성공/실패 집계 - 모든 key 포함
  const winKeys  = ['both','ab','ac','onlyA','only2'];
  const partKeys = ['bc','onlyB','onlyC','only3'];
  const wins  = h.filter(x=>winKeys.includes(x.key)).length;
  const parts = h.filter(x=>partKeys.includes(x.key)).length;

  // 수익률: 실제 투자금 대비 현재 잔액
  let inv = startBal;
  h.forEach(x=>{ if(x.after < x.before) inv += (x.before - x.after); });
  const roi = (simState.balance - inv) / inv * 100;
  const peak = Math.max(startBal, ...h.map(x=>x.after));

  const rndEl=document.getElementById('sim-st-rnd'); if(rndEl) rndEl.textContent=h.length+'회';
  const wrEl=document.getElementById('sim-st-wr'); if(wrEl) wrEl.textContent=h.length?Math.round((wins+parts)/h.length*100)+'%':'-';
  const roiEl=document.getElementById('sim-st-roi'); if(roiEl){roiEl.textContent=(roi>=0?'+':'')+roi.toFixed(1)+'%';roiEl.style.color=roi>=0?'var(--green)':'var(--red)';}
  const peakEl=document.getElementById('sim-st-peak'); if(peakEl) peakEl.textContent=simFmt(peak)+'원';
  const fsEl=document.getElementById('sim-folder-stats');
  if(fsEl){
    const isC = simState.balance >= 1300000;
    const winKeys = ['both','only2','onlyA','only3','bc','onlyB','onlyC'];

    // A/B 폴더별
    const af1=h.filter(x=>x.folderA===1), af2=h.filter(x=>x.folderA===2);
    const af1w=af1.filter(x=>winKeys.includes(x.key)).length;
    const af2w=af2.filter(x=>winKeys.includes(x.key)).length;

    const bf1=h.filter(x=>x.folderB===1), bf2=h.filter(x=>x.folderB===2);
    const bf1w=bf1.filter(x=>winKeys.includes(x.key)).length;
    const bf2w=bf2.filter(x=>winKeys.includes(x.key)).length;

    // C 폴더별 (2/3/4폴더)
    const cf2=h.filter(x=>x.folderC===2), cf3=h.filter(x=>x.folderC===3), cf4=h.filter(x=>x.folderC===4);
    const cf2w=cf2.filter(x=>['both','only3','bc','onlyC'].includes(x.key)).length;
    const cf3w=cf3.filter(x=>['both','only3','bc','onlyC'].includes(x.key)).length;
    const cf4w=cf4.filter(x=>['both','only3','bc','onlyC'].includes(x.key)).length;

    const pct = (w,t) => t>0 ? Math.round(w/t*100)+'%' : '-';
    const card = (label, col, bg, w, t) =>
      `<div style="background:${bg};border:1px solid ${col}33;border-radius:8px;padding:10px;">
        <div style="font-size:10px;color:${col};margin-bottom:4px;">${label}</div>
        <div style="font-size:18px;font-weight:900;color:var(--text);">${pct(w,t)}</div>
        <div class="hint11">${w}승 / ${t}회</div>
      </div>`;

    let html = '<div style="margin-bottom:8px;font-size:10px;color:var(--text3);">A 베팅</div>';
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
      ${card('1폴더','#ffd700','rgba(255,215,0,0.06)',af1w,af1.length)}
      ${card('2폴더','#00e676','rgba(0,230,118,0.06)',af2w,af2.length)}
    </div>`;
    html += '<div style="margin-bottom:8px;font-size:10px;color:var(--text3);">B 베팅</div>';
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
      ${card('1폴더','#ffd700','rgba(255,215,0,0.06)',bf1w,bf1.length)}
      ${card('2폴더','#00e676','rgba(0,230,118,0.06)',bf2w,bf2.length)}
    </div>`;

    if(isC && (cf2.length||cf3.length||cf4.length)) {
      html += '<div style="margin-bottom:8px;font-size:10px;color:var(--accent2);">C 베팅 (모험)</div>';
      html += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
        ${card('2폴더','#ff6b35','rgba(255,107,53,0.06)',cf2w,cf2.length)}
        ${card('3폴더','#ff6b35','rgba(255,107,53,0.06)',cf3w,cf3.length)}
        ${card('4폴더','#ff6b35','rgba(255,107,53,0.06)',cf4w,cf4.length)}
      </div>`;
    }

    fsEl.innerHTML = html;
  }
  if(simChartInst){simChartInst.destroy();simChartInst=null;}
  const ctx=document.getElementById('sim-chart-cv');
  if(!ctx||!h.length) return;
  const labels=['시작',...h.map(x=>x.round+'회')];
  const balD=[startBal,...h.map(x=>x.after)];
  const invD=[startBal]; let ii=startBal;
  h.forEach(x=>{if(x.after<x.before)ii+=(x.before-x.after);invD.push(ii);});
  simChartInst=safeCreateChart('sim-chart-cv',{
    type:'line',data:{labels,datasets:[
      {label:'보유',data:balD,borderColor:'#00e5ff',backgroundColor:'rgba(0,229,255,0.06)',tension:0.35,pointRadius:3,fill:true},
      {label:'투자',data:invD,borderColor:'#ffd700',backgroundColor:'transparent',tension:0.35,pointRadius:2,borderDash:[4,3]},
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{ticks:{color:'#4a5168',font:{size:10}},grid:{color:'rgba(255,255,255,0.04)'}},y:{ticks:{color:'#4a5168',font:{size:10},callback:v=>simFmt(v)+'원'},grid:{color:'rgba(255,255,255,0.04)'}}}}
  });
}
