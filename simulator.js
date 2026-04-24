// ========== 전략베팅 시뮬레이터 ==========
let SIM_GOAL = 1000000;
const SIM_START = 10000;
let simState = { balance: SIM_START, round: 1, history: [], goalReached: false, goalHistory: [] };
let simSnaps = [];
let simChartInst = null;
let simPrefixA = 2, simPrefixB = 3;

function simFmt(n) { return Math.round(n).toLocaleString('ko-KR'); }

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
  if (name === 'tree') simRenderTree();
  if (name === 'stats') simRenderStats();
  if (name === 'goals') simRenderGoalHistory();
}

function simGetOdds(which) {
  if(which === 'c') {
    return parseFloat(document.getElementById('sim-o-c-direct')?.value) || 1.0;
  }
  const raw = document.getElementById(`sim-o-dec-${which}`)?.value || '';
  const prefix = which === 'a' ? simPrefixA : simPrefixB;
  if(raw === '') return prefix + 0;
  const dec = raw.length <= 1 ? (parseInt(raw)||0) * 10 : parseInt(raw)||0;
  return prefix + dec / 100;
}

function simSetPrefix(which, val) {
  if (which === 'a') {
    simPrefixA = val;
    document.getElementById('sim-prefix-a').textContent = val + '.';
    [1,2,3].forEach(n => {
      const btn = document.getElementById(`sim-btn-a-${n}`);
      const active = n === val;
      btn.style.borderColor = active ? 'var(--accent)' : 'var(--border)';
      btn.style.background  = active ? 'rgba(0,229,255,0.1)' : 'var(--bg3)';
      btn.style.color       = active ? 'var(--accent)' : 'var(--text3)';
    });
  } else {
    simPrefixB = val;
    document.getElementById('sim-prefix-b').textContent = val + '.';
    [1,2,3].forEach(n => {
      const btn = document.getElementById(`sim-btn-b-${n}`);
      const active = n === val;
      btn.style.borderColor = active ? 'var(--accent)' : 'var(--border)';
      btn.style.background  = active ? 'rgba(0,229,255,0.1)' : 'var(--bg3)';
      btn.style.color       = active ? 'var(--accent)' : 'var(--text3)';
    });
  }
  simOnInput();
}

function simResetOdds() {
  simPrefixA = 2; simPrefixB = 3;
  const dc = document.getElementById('sim-o-c-direct'); if(dc) dc.value = '';
  const da = document.getElementById('sim-o-dec-a');
  const db = document.getElementById('sim-o-dec-b');
  if (da) da.value = '0';
  if (db) db.value = '0';
  simSetPrefix('a', 2);
  simSetPrefix('b', 3);
  // A폴더 초기화
  ['sim-f-a1','sim-f-a2'].forEach(id => { const el=document.getElementById(id); if(el) el.checked=false; });
  ['sim-lbl-af1','sim-lbl-af2'].forEach(id => { const el=document.getElementById(id); if(el){el.style.borderColor='var(--border)';el.style.background='var(--bg2)';} });
  // B폴더 초기화
  ['sim-f-b1','sim-f-b2'].forEach(id => { const el=document.getElementById(id); if(el) el.checked=false; });
  ['sim-lbl-bf1','sim-lbl-bf2'].forEach(id => { const el=document.getElementById(id); if(el){el.style.borderColor='var(--border)';el.style.background='var(--bg2)';} });
  // C폴더 초기화
  ['sim-f-c2','sim-f-c3','sim-f-c4'].forEach(id => { const el=document.getElementById(id); if(el) el.checked=false; });
  ['sim-lbl-cf2','sim-lbl-cf3','sim-lbl-cf4'].forEach(id => { const el=document.getElementById(id); if(el){el.style.borderColor='var(--border)';el.style.background='var(--bg2)';} });
}

function simCalcExcess(bet, odds) {
  if (odds <= 2.0) return 0;
  return Math.round(bet * (odds - 2.0));
}

function simGetPlan(bal) {
  if (bal >= 2360000) return { tag:'목표 달성 구간', body:'세이브 50% 이상 + A(안전 1.5~2.2배) 메인 + B(도전 2.3~2.8배) + C(모험 3배~) 소액. 세이브 100만원이 찍히는 순간 목표 달성!' };
  if (bal >= 1310000) return { tag:'10회차 플랜', body:'세이브 136만 + A(안전) 50만 + B(도전) 35만 + C(모험) 15만 — 세이브 100만 달성!' };
  if (bal >= 810000)  return { tag:'9회차 플랜', body:'세이브 70만 + A(안전×2) 30만 + B(도전×2~3) 20만 + C(모험×3~4) 11만' };
  if (bal >= 410000)  return { tag:'8회차 플랜', body:'세이브 41만 + A(x2) 30만 + B(x3) 10만 — 131만원 목표!' };
  if (bal >= 210000)  return { tag:'7회차 플랜', body:'세이브 11만 + A(x2) 20만 + B(x3) 10만' };
  if (bal >= 120000)  return { tag:'6회차 플랜', body:'세이브 6만 + B(x3) 5만 + A(x2) 10만' };
  if (bal >= 70000)   return { tag:'5회차 플랜', body:'세이브 3만 + A(x2) 9만' };
  if (bal >= 40000)   return { tag:'4회차 플랜', body:'세이브 2만 + A(x2) 5만' };
  if (bal >= 20000)   return { tag:'3회차 플랜', body:'세이브 1만 + A(x2) 3만' };
  return null;
}

function simGetHint(bal) {
  if (bal < 40000) return null;
  let sv, b2, b3, b4, zone;

  // 세이브 100만원 달성 이후 — 보수적 비율 (세이브 50 / A 30 / B 15 / C 5)
  if (simState.goalReached) {
    zone = '달성 후 운용';
    sv = Math.round(bal * 0.50 / 10000) * 10000;
    b2 = Math.round(bal * 0.30 / 10000) * 10000;
    b3 = Math.round(bal * 0.15 / 10000) * 10000;
    b4 = Math.max(0, bal - sv - b2 - b3);
    return { zone, sv, b2, b3, b4 };
  }

  if (bal >= 500000) {
    zone='목표 근접'; sv=Math.round(bal*0.50/10000)*10000; b2=Math.round(bal*0.38/10000)*10000; b3=Math.max(0,bal-sv-b2); b4=0;
  } else if (bal >= 210000) {
    zone='분산 베팅'; sv=Math.round(bal*0.28/10000)*10000; b2=Math.round(bal*0.50/10000)*10000; b3=Math.max(0,bal-sv-b2); b4=0;
  } else {
    zone='초반'; sv=Math.round(bal*0.28/10000)*10000; b2=bal-sv; b3=0; b4=0;
  }
  return { zone, sv, b2, b3, b4 };
}

function simOnInput() {
  const sv  = parseInt(document.getElementById('sim-i-sv')?.value)  || 0;
  const b2  = parseInt(document.getElementById('sim-i-b2')?.value)  || 0;
  const b3  = parseInt(document.getElementById('sim-i-b3')?.value)  || 0;
  const b4  = parseInt(document.getElementById('sim-i-b4')?.value)  || 0;
  const o2  = simGetOdds('a');
  const o3  = simGetOdds('b');
  const o4  = simGetOdds('c');
  const tot = sv + b2 + b3 + b4;

  // C베팅 자동 표시 (보유 금액 130만원 이상)
  const showC = simState.balance >= 1300000;
  ['sim-c-memo-wrap','sim-c-bet-wrap','sim-c-odds-wrap','sim-c-folder-wrap'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.style.display = showC ? 'block' : 'none';
  });
  if(!showC) { const b4el = document.getElementById('sim-i-b4'); if(b4el) b4el.value = ''; }
  const bal = simState.balance;
  const over = tot > bal, ok = tot === bal && tot > 0;

  const isumEl = document.getElementById('sim-isum');
  if (isumEl) isumEl.innerHTML = `합계: <span style="color:${over?'var(--red)':ok?'var(--green)':'var(--text3)'}">${simFmt(tot)}원</span> / 보유: ${simFmt(bal)}원`;
  const warnEl = document.getElementById('sim-warn');
  if (warnEl) warnEl.style.display = over ? 'block' : 'none';

  const ex2 = b2 > 0 ? simCalcExcess(b2, o2) : 0;
  const ex3 = b3 > 0 ? simCalcExcess(b3, o3) : 0;
  const exNote = document.getElementById('sim-excess-note');
  if (exNote) {
    if ((ex2>0||ex3>0) && !over && tot>0) {
      const parts = [];
      if (ex2>0) parts.push(`A +${simFmt(ex2)}원`);
      if (ex3>0) parts.push(`B +${simFmt(ex3)}원`);
      exNote.textContent = '2배 초과분 세이브 편입: ' + parts.join(' / ');
      exNote.style.display = 'block';
    } else exNote.style.display = 'none';
  }

  const opEl = document.getElementById('sim-odds-preview');
  if (opEl) opEl.textContent = showC ? `A:${o2.toFixed(2)} / B:${o3.toFixed(2)} / C:${o4.toFixed(2)}x` : `A:${o2.toFixed(2)} / B:${o3.toFixed(2)}`;

  const aChecked = document.getElementById('sim-f-a1')?.checked || document.getElementById('sim-f-a2')?.checked;
  const bChecked = document.getElementById('sim-f-b1')?.checked || document.getElementById('sim-f-b2')?.checked;
  const cChecked = document.getElementById('sim-f-c2')?.checked || document.getElementById('sim-f-c3')?.checked || document.getElementById('sim-f-c4')?.checked;
  const hasBetB  = b3 > 0;
  const hasBetC  = b4 > 0;
  const folderChecked = aChecked && (hasBetB ? bChecked : true) && (hasBetC && showC ? cChecked : true);
  const fwEl = document.getElementById('sim-folder-warn');
  if (fwEl) fwEl.style.display = (!folderChecked && tot>0) ? 'block' : 'none';

  // A 폴더 하이라이트
  [['sim-f-a1','sim-lbl-af1','var(--gold)','rgba(255,215,0,0.08)'],
   ['sim-f-a2','sim-lbl-af2','var(--green)','rgba(0,230,118,0.08)']].forEach(([fid,lid,col,bg])=>{
    const checked = document.getElementById(fid)?.checked;
    const lbl = document.getElementById(lid);
    if(lbl){ lbl.style.borderColor=checked?col:'var(--border)'; lbl.style.background=checked?bg:'var(--bg2)'; }
  });
  // B 폴더 하이라이트
  [['sim-f-b1','sim-lbl-bf1','var(--gold)','rgba(255,215,0,0.08)'],
   ['sim-f-b2','sim-lbl-bf2','var(--green)','rgba(0,230,118,0.08)']].forEach(([fid,lid,col,bg])=>{
    const checked = document.getElementById(fid)?.checked;
    const lbl = document.getElementById(lid);
    if(lbl){ lbl.style.borderColor=checked?col:'var(--border)'; lbl.style.background=checked?bg:'var(--bg2)'; }
  });
  // C 폴더 하이라이트
  ['sim-lbl-cf2','sim-lbl-cf3','sim-lbl-cf4'].forEach((lid,i)=>{
    const fid = ['sim-f-c2','sim-f-c3','sim-f-c4'][i];
    const checked = document.getElementById(fid)?.checked;
    const lbl = document.getElementById(lid);
    if(lbl){ lbl.style.borderColor=checked?'var(--accent2)':'var(--border)'; lbl.style.background=checked?'rgba(255,107,53,0.08)':'var(--bg2)'; }
  });

  // 홀딩 버튼 상태 업데이트
  const holdBtn = document.getElementById('sim-hold-btn');
  if (holdBtn) {
    if (simPending) {
      holdBtn.textContent = '⏸ 홀딩중';
      holdBtn.disabled = true;
      holdBtn.style.opacity = '0.5';
      holdBtn.style.cursor = 'default';
    } else {
      const canHold = !over && tot > 0 && folderChecked && bal > 0;
      holdBtn.textContent = '⏸ 홀딩';
      holdBtn.disabled = !canHold;
      holdBtn.style.opacity = canHold ? '1' : '0.4';
      holdBtn.style.cursor = canHold ? 'pointer' : 'default';
    }
  }

  const dis = over || tot===0 || !folderChecked || bal <= 0 || !!simPending;
  const has3 = b3 > 0;

  // 잔액 0 이하 → 게임오버 안내
  const isumEl2 = document.getElementById('sim-isum');
  if (bal <= 0 && isumEl2) {
    isumEl2.innerHTML = `<span style="color:var(--red);font-weight:700;">💀 잔액 소진 — 초기화 후 다시 시작하세요</span>`;
  }
  const w2 = Math.round(b2*o2), w3 = Math.round(b3*o3), w4 = Math.round(b4*o4);

  const cfgs = showC ? [
    { tag:'A+B+C 모두',  amt: sv+w2+w3+w4, col:'var(--green)',    key:'both'  },
    { tag:'A+B만 성공',  amt: sv+w2+w3,    col:'var(--accent)',   key:'ab'    },
    { tag:'A+C만 성공',  amt: sv+w2+w4,    col:'var(--accent)',   key:'ac'    },
    { tag:'B+C만 성공',  amt: sv+w3+w4,    col:'#a78bfa',         key:'bc'    },
    { tag:'A만 성공',    amt: sv+w2,       col:'var(--accent)',   key:'onlyA' },
    { tag:'B만 성공',    amt: sv+w3,       col:'#a78bfa',         key:'onlyB' },
    { tag:'C만 성공',    amt: sv+w4,       col:'var(--accent2)',  key:'onlyC' },
    { tag:'모두 실패',   amt: sv,          col:'var(--red)',       key:'lose'  },
  ] : has3 ? [
    { tag:'A+B 모두',   amt: sv+w2+w3,    col:'var(--green)',    key:'both'  },
    { tag:'A만 성공',   amt: sv+w2,       col:'var(--accent)',   key:'only2' },
    { tag:'B만 성공',   amt: sv+w3,       col:'#a78bfa',         key:'only3' },
    { tag:'모두 실패',  amt: sv,          col:'var(--red)',       key:'lose'  },
  ] : [
    { tag:'A 성공',     amt: sv+w2,       col:'var(--green)',    key:'only2' },
    { tag:'A 실패',     amt: sv,          col:'var(--red)',       key:'lose'  },
  ];

  const grid = document.getElementById('sim-sc-grid');
  if(grid) {
    grid.innerHTML = cfgs.map(c => {
      const diff = c.amt - bal;
      const off = dis;
      const goalFlag = (!off && c.amt >= SIM_GOAL) ? `<span style="font-size:10px;background:var(--green);color:#000;padding:1px 6px;border-radius:20px;font-weight:700;margin-left:4px;">목표!</span>` : '';
      const saveFlag = (!off && c.key !== 'lose' && sv >= 1000000) ? `<span style="font-size:10px;background:#ffd700;color:#000;padding:1px 6px;border-radius:20px;font-weight:700;margin-left:4px;">달성!</span>` : '';
      return `<div style="background:var(--bg2);border:1px solid ${c.col}33;border-radius:10px;padding:12px;opacity:${off?'0.35':'1'};">
        <div style="font-size:10px;background:${c.col}22;color:${c.col};padding:2px 8px;border-radius:20px;display:inline-block;margin-bottom:6px;">${c.tag}</div>
        <div style="font-size:17px;font-weight:900;color:${c.col};font-family:'JetBrains Mono',monospace;">${c.amt>0?simFmt(c.amt)+'원':'-'}${goalFlag}${saveFlag}</div>
        <div style="font-size:11px;color:${diff>0?'rgba(0,230,118,0.6)':diff<0?'rgba(255,59,92,0.6)':'var(--text3)'};">${c.amt>0?(diff>=0?'+':'')+simFmt(diff)+'원':''}</div>
      </div>`;
    }).join('');
  }
}

let simHistOpen = false;
function simToggleHistory() {
  simHistOpen = !simHistOpen;
  const list = document.getElementById('sim-hlist');
  const btn  = document.getElementById('sim-hist-toggle');
  if(list) list.style.display = simHistOpen ? '' : 'none';
  if(btn)  btn.textContent = simHistOpen ? '접기' : '펼치기';
}

function simUndoLast() {
  if (!simSnaps.length) return;
  simState = simSnaps.pop();
  ['sim-i-sv','sim-i-b2','sim-i-b3','sim-i-b4','sim-i-memo','sim-i-memo-b','sim-i-memo-c'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  simResetOdds(); simRender(); simOnInput();
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
}

function simMemoInput(input, boxId) {
  const val = input.value;
  const slashIdx = val.lastIndexOf('/');
  const current = slashIdx >= 0 ? val.slice(slashIdx + 1).trimStart() : val;
  const box = document.getElementById(boxId);
  if (!box) return;
  if (!current || current.length < 1) { box.style.display = 'none'; return; }

  const list = window._gameSuggestList || getGameSuggestList();
  // 전략베팅 히스토리 메모도 포함
  const simMemos = simState.history.flatMap(h => {
    const arr = [];
    if (h.memo) h.memo.split('/').map(s=>s.trim()).filter(Boolean).forEach(s=>arr.push(s));
    if (h.memoB) h.memoB.split('/').map(s=>s.trim()).filter(Boolean).forEach(s=>arr.push(s));
    return arr;
  });
  const combined = [...new Set([...list, ...simMemos])].sort();
  const matches = combined.filter(n => n.includes(current)).slice(0, 8);

  if (!matches.length) { box.style.display = 'none'; return; }
  box.innerHTML = matches.map(n =>
    `<div onclick="simSelectMemo('${n.replace(/'/g,"\\'")}','${boxId}',this)"
      style="padding:8px 12px;font-size:13px;color:var(--text2);cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05);"
      onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      ${n}
    </div>`
  ).join('');
  box.style.display = 'block';
}

function simSelectMemo(name, boxId, el) {
  const inputId = boxId === 'sim-suggest-a' ? 'sim-i-memo' : 'sim-i-memo-b';
  const input = document.getElementById(inputId);
  if (!input) return;
  const val = input.value;
  const slashIdx = val.lastIndexOf('/');
  input.value = slashIdx >= 0 ? val.slice(0, slashIdx + 1) + name : name;
  closeSimSuggest(boxId);
  input.focus();
}

function closeSimSuggest(boxId) {
  const box = document.getElementById(boxId);
  if (box) box.style.display = 'none';
}

function simSaveNote(idx, val) {
  if (!simState.history[idx]) return;
  simState.history[idx].note = val.trim();
  try { localStorage.setItem('edge_sim_state', JSON.stringify(simState)); } catch(e) {}
}

function simDeleteHistory(idx) {
  if (!confirm(`${simState.history[idx]?.round}회차 기록을 삭제할까요?`)) return;
  simSnaps.push(JSON.parse(JSON.stringify(simState)));
  simState.history.splice(idx, 1);
  // 삭제 후 잔액 재계산
  if (simState.history.length > 0) {
    simState.balance = simState.history[simState.history.length - 1].after;
    simState.round = simState.history[simState.history.length - 1].round + 1;
  } else {
    simState.balance = SIM_START;
    simState.round = 1;
  }
  try { localStorage.setItem('edge_sim_state', JSON.stringify(simState)); } catch(e) {}
  simRender(); simOnInput();
}

function simRestart() {
  if (!confirm('잔액만 1만원으로 초기화할까요?\n히스토리는 유지됩니다.')) return;
  simSnaps.push(JSON.parse(JSON.stringify(simState)));
  simState.balance = SIM_START;
  simState.round = simState.history.length + 1;
  simState.goalReached = false;
  try { localStorage.setItem('edge_sim_state', JSON.stringify(simState)); } catch(e) {}
  simRender(); simOnInput();
}

// 홀딩 상태
let simPending = null; // { sv, b2, b3, o2, o3, ex2, ex3, memo, memoB, folderCount, round, bothAmt, only2Amt, only3Amt, loseAmt }

function simHold() {
  const sv  = parseInt(document.getElementById('sim-i-sv')?.value)  || 0;
  const b2  = parseInt(document.getElementById('sim-i-b2')?.value)  || 0;
  const b3  = parseInt(document.getElementById('sim-i-b3')?.value)  || 0;
  const b4  = parseInt(document.getElementById('sim-i-b4')?.value)  || 0;
  const o2  = simGetOdds('a');
  const o3  = simGetOdds('b');
  const o4  = simGetOdds('c');
  const tot = sv + b2 + b3 + b4;

  // C베팅 자동 표시 (보유 금액 130만원 이상)
  const showC = simState.balance >= 1300000;
  ['sim-c-memo-wrap','sim-c-bet-wrap','sim-c-odds-wrap','sim-c-folder-wrap'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.style.display = showC ? 'block' : 'none';
  });
  if(!showC) { const b4el = document.getElementById('sim-i-b4'); if(b4el) b4el.value = ''; }
  const f1  = document.getElementById('sim-f-a1');
  const f2  = document.getElementById('sim-f-a2');
  if (!tot || tot > simState.balance) return;
  if (!f1?.checked && !f2?.checked) return;
  if (simPending) return; // 이미 홀딩중이면 무시

  const ex2 = b2 > 0 ? simCalcExcess(b2, o2) : 0;
  const ex3 = b3 > 0 ? simCalcExcess(b3, o3) : 0;
  const memo  = document.getElementById('sim-i-memo')?.value.trim() || '';
  const memoB = document.getElementById('sim-i-memo-b')?.value.trim() || '';
  const memoC = document.getElementById('sim-i-memo-c')?.value.trim() || '';
  const folderCount = f1?.checked ? 1 : 2;

  const w2 = Math.round(b2*o2), w3 = Math.round(b3*o3), w4 = Math.round(b4*o4);
  simPending = {
    sv, b2, b3, b4, o2, o3, o4, ex2, ex3, memo, memoB, memoC, folderCount,
    round: simState.round,
    amts: {
      both:  sv+w2+w3+w4,     // A+B+C 모두 성공
      ab:    sv+w2+w3-b4,     // A+B만 성공 (C 실패 → C 베팅금 차감)
      ac:    sv+w2+w4-b3,     // A+C만 성공 (B 실패 → B 베팅금 차감)
      bc:    sv+w3+w4-b2,     // B+C만 성공 (A 실패 → A 베팅금 차감)
      onlyA: sv+w2-b3-b4,     // A만 성공 (B,C 베팅금 차감)
      onlyB: sv+w3-b2-b4,     // B만 성공 (A,C 베팅금 차감)
      onlyC: sv+w4-b2-b3,     // C만 성공 (A,B 베팅금 차감)
      only2: sv+w2-b3,        // 2폴더 호환: A만 성공 (B 베팅금 차감)
      only3: sv+w3-b2,        // 2폴더 호환: B만 성공 (A 베팅금 차감)
      lose:  sv,              // 모두 실패 (세이브만 남음)
    }
  };

  // 입력칸 초기화
  ['sim-i-sv','sim-i-b2','sim-i-b3','sim-i-b4','sim-i-memo','sim-i-memo-b','sim-i-memo-c'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  simResetOdds();
  simRenderPending();
  simOnInput();
  try { localStorage.setItem('edge_sim_pending', JSON.stringify(simPending)); } catch(e) {}
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
  const hasC  = simState.balance >= 1300000 && (simPending?.b4 || 0) > 0;
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

function simApplyPending(key) {
  if (!simPending) return;
  const p = simPending;
  // simHold는 p.amts 객체에 담음, 구버전은 flat 키 사용 - 둘 다 지원
  const amts = p.amts || { both: p.bothAmt, only2: p.only2Amt, only3: p.only3Amt, lose: p.loseAmt };

  // lose 키일 때: 세이브 금액 보장 (세이브 0이어도 최소 잔액 유지)
  let newBal;
  if (key === 'lose') {
    // 모두 실패 시 세이브만 남음. 세이브가 0이면 베팅 총액을 잃은 것
    newBal = (amts.lose !== undefined && !isNaN(amts.lose)) ? amts.lose
           : (p.loseAmt !== undefined && !isNaN(p.loseAmt)) ? p.loseAmt
           : (p.sv || 0);
    // 안전장치: newBal이 음수가 되지 않도록
    if (isNaN(newBal) || newBal < 0) newBal = p.sv || 0;
  } else {
    newBal = (amts[key] !== undefined && !isNaN(amts[key])) ? amts[key] : (amts.lose || p.loseAmt || p.sv || 0);
  }

  simSnaps.push(JSON.parse(JSON.stringify(simState)));
  const excessSave = key==='both'?p.ex2+p.ex3:key==='only2'?p.ex2:key==='only3'?p.ex3:0;
  simState.history.push({ round:p.round, save:p.sv, bet2:p.b2, bet3:p.b3, bet4:p.b4||0, odds2:p.o2, odds3:p.o3, odds4:p.o4||1, key, before:simState.balance, after:newBal, memo:p.memo, memoB:p.memoB, memoC:p.memoC||'', excessSave, folder:p.folderCount });

  if (newBal >= SIM_GOAL && !simState.goalReached) {
    simState.goalReached = true;
    simState.goalHistory.push({ goal:SIM_GOAL, amount:newBal, round:p.round, timestamp:new Date().toLocaleDateString('ko-KR') });
  }
  simState.balance = newBal;
  simState.round++;
  simPending = null;

  // 베팅기록 자동 추가
  const aWin = ['both','only2','onlyA','ab','ac'].includes(key);
  const bWin = ['both','only3','onlyB','ab','bc'].includes(key);
  const cWin = ['both','onlyC','ac','bc'].includes(key);

  if (p.b2 > 0) {
    bets.unshift({ id: String(Date.now())+'simA', date:new Date().toISOString().split('T')[0], game:p.memo||'-', sport:'', type:'승/패', mode:p.memo.includes('/')?'multi':'single', amount:p.b2, betmanOdds:p.o2, result:aWin?'WIN':'LOSE', profit:aWin?Math.round(p.b2*p.o2)-p.b2:-p.b2, memo:'[전략베팅 A]', emotion:'보통', myProb:null, folderOdds:[], folderProbs:[], folderSports:[], folderTypes:[], folderResults:[] });
  }
  if (p.b3 > 0) {
    bets.unshift({ id: String(Date.now()+1)+'simB', date:new Date().toISOString().split('T')[0], game:p.memoB||'-', sport:'', type:'승/패', mode:p.memoB.includes('/')?'multi':'single', amount:p.b3, betmanOdds:p.o3, result:bWin?'WIN':'LOSE', profit:bWin?Math.round(p.b3*p.o3)-p.b3:-p.b3, memo:'[전략베팅 B]', emotion:'보통', myProb:null, folderOdds:[], folderProbs:[], folderSports:[], folderTypes:[], folderResults:[] });
  }
  if ((p.b4||0) > 0) {
    bets.unshift({ id: String(Date.now()+2)+'simC', date:new Date().toISOString().split('T')[0], game:p.memoC||'-', sport:'', type:'승/패', mode:(p.memoC||'').includes('/')?'multi':'single', amount:p.b4, betmanOdds:p.o4, result:cWin?'WIN':'LOSE', profit:cWin?Math.round(p.b4*p.o4)-p.b4:-p.b4, memo:'[전략베팅 C]', emotion:'보통', myProb:null, folderOdds:[], folderProbs:[], folderSports:[], folderTypes:[], folderResults:[] });
  }
  if (p.b2 > 0 || p.b3 > 0 || (p.b4||0) > 0) {
    localStorage.setItem('edge_bets', JSON.stringify(bets));
    _gdriveAutoSync && _gdriveAutoSync();
    updateAll();
    const isLoseKey = key === 'lose';
    const toast = document.createElement('div');
    toast.textContent = isLoseKey ? '📋 실패 기록이 히스토리에 저장됐어요' : '✅ 베팅기록에 추가됐어요';
    toast.style.cssText = `position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:${isLoseKey?'rgba(255,59,92,0.9)':'rgba(0,230,118,0.9)'};color:#fff;padding:10px 18px;border-radius:20px;font-size:13px;font-weight:700;z-index:9999;`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

  try { localStorage.setItem('edge_sim_state', JSON.stringify(simState)); localStorage.setItem('edge_sim_goal', SIM_GOAL); localStorage.removeItem('edge_sim_pending'); } catch(e) {}
  simRenderPending();
  simRender(); simOnInput();
}

function simCancelPending() {
  simPending = null;
  try { localStorage.removeItem('edge_sim_pending'); } catch(e) {}
  simRenderPending();
}

function simToggleResult(idx, result) {
  const h = simState.history[idx];
  if (!h) return;

  const sv = h.save, b2 = h.bet2, b3 = h.bet3, b4 = h.bet4||0, o2 = h.odds2, o3 = h.odds3, o4 = h.odds4||1;
  let newKey, newAfter;

  if (result === 'win') {
    newKey = 'both';
    newAfter = sv + Math.round(b2*o2) + (b3>0?Math.round(b3*o3):0) + (b4>0?Math.round(b4*o4):0);
  } else {
    newKey = 'lose';
    newAfter = sv;
  }

  const diff = newAfter - h.after;
  h.key = newKey;
  h.after = newAfter;

  // 이후 회차 잔액 연쇄 업데이트
  for (let i = idx + 1; i < simState.history.length; i++) {
    simState.history[i].before += diff;
    simState.history[i].after  += diff;
  }
  if (simState.history.length > 0) {
    simState.balance = simState.history[simState.history.length - 1].after;
  }

  try { localStorage.setItem('edge_sim_state', JSON.stringify(simState)); localStorage.setItem('edge_sim_goal', SIM_GOAL); } catch(e) {}
  simRender(); simOnInput();
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
        <span style="font-size:11px;color:var(--text3);">→</span>
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
        <div style="font-size:11px;color:var(--text3);">목표 ${simFmt(g.goal)}원 · ${g.round}회차 · ${g.timestamp}</div>
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
  // requestAnimationFrame으로 레이아웃 계산 후 실행
  if (wrap.clientWidth === 0) {
    requestAnimationFrame(() => simRenderTree());
    return;
  }

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
        <div style="font-size:11px;color:var(--text3);">${w}승 / ${t}회</div>
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

function simSetStartBalance() {
  const inp = document.getElementById('sim-start-input');
  const val = parseInt(inp?.value);
  if(!val || val < 1000) {
    if(inp) { inp.style.borderColor='var(--red)'; setTimeout(()=>inp.style.borderColor='',1000); }
    return;
  }

  simSnaps = [];
  simState = { balance: val, round: 1, history: [], goalReached: false, goalHistory: [] };
  simPending = null;
  // localStorage에 먼저 저장 (initSimulator가 다시 불려도 이 값을 복원함)
  try {
    localStorage.setItem('edge_sim_state', JSON.stringify(simState));
    localStorage.removeItem('edge_sim_pending');
  } catch(e) {}
  simResetOdds();
  if(inp) inp.value = '';

  // SIM_ROADMAP은 mobile_gdrive.js에 정의 — 로드된 경우에만 참조
  const st = document.getElementById('sim-start-status');
  if(typeof SIM_ROADMAP !== 'undefined') {
    let assignedIdx = 0;
    SIM_ROADMAP.forEach((r,i) => { if(val >= r.threshold) assignedIdx = i; });
    const r = SIM_ROADMAP[assignedIdx];
    if(st && r) { st.textContent = `✅ ${r.round}회차(${r.balance} 구간)로 시작했어요`; st.style.color='var(--green)'; setTimeout(()=>st.textContent='',3000); }
  } else {
    if(st) { st.textContent = `✅ ${val.toLocaleString('ko-KR')}원으로 시작했어요`; st.style.color='var(--green)'; setTimeout(()=>st.textContent='',3000); }
  }

  simRender(); simOnInput();
  if(typeof simRenderRoadmap === 'function') simRenderRoadmap();
  simSwitchTab('play');
}

function simConfirmGoal() {
  const val=parseInt(document.getElementById('sim-goal-input')?.value);
  if(!val||val<=simState.balance){const inp=document.getElementById('sim-goal-input');if(inp){inp.style.borderColor='var(--red)';setTimeout(()=>inp.style.borderColor='',1000);}return;}
  SIM_GOAL=val; simState.goalReached=false;
  const inp=document.getElementById('sim-goal-input');if(inp)inp.value='';
  simRender();simOnInput();
}

function simManualSave() {
  try{localStorage.setItem('edge_sim_state',JSON.stringify(simState));localStorage.setItem('edge_sim_goal',SIM_GOAL);
  const el=document.getElementById('sim-save-status');if(el){el.textContent='저장 완료 — '+new Date().toLocaleString('ko-KR');el.style.color='var(--green)';setTimeout(()=>el.textContent='',3000);}}catch(e){}
}

function simManualLoad() {
  try{const saved=localStorage.getItem('edge_sim_state'),savedGoal=localStorage.getItem('edge_sim_goal');
  if(!saved){const el=document.getElementById('sim-save-status');if(el){el.textContent='저장된 데이터가 없어요';el.style.color='var(--gold)';setTimeout(()=>el.textContent='',3000);}return;}
  simState=JSON.parse(saved);if(savedGoal)SIM_GOAL=parseInt(savedGoal);simSnaps=[];simResetOdds();simRender();simOnInput();
  // 경로 탭이 열려있으면 트리 갱신
  const treeTab = document.getElementById('sim-tc-tree');
  if(treeTab && treeTab.style.display !== 'none') simRenderTree();
  const el=document.getElementById('sim-save-status');if(el){el.textContent='불러오기 완료';el.style.color='var(--green)';setTimeout(()=>el.textContent='',3000);}}catch(e){}
}

function simOpenResetModal(){const m=document.getElementById('sim-reset-modal');if(m)m.style.display='flex';}
function simCloseResetModal(){const m=document.getElementById('sim-reset-modal');if(m)m.style.display='none';}
function simConfirmReset(){
  simCloseResetModal();simSnaps=[];
  simState={balance:SIM_START,round:1,history:[],goalReached:false,goalHistory:[]};SIM_GOAL=1000000;
  // localStorage도 초기화
  try{localStorage.removeItem('edge_sim_state');localStorage.removeItem('edge_sim_goal');localStorage.removeItem('edge_sim_pending');}catch(e){}
  simPending=null;
  ['sim-i-sv','sim-i-b2','sim-i-b3','sim-i-b4','sim-i-memo','sim-i-memo-b','sim-i-memo-c'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  simResetOdds();simRender();simOnInput();
  // tree 탭이 열려있어도 play로 전환 + 캔버스 초기화
  simSwitchTab('play');
  // 혹시 경로 탭 캔버스에 잔상이 남지 않도록 명시적 클리어
  const _cv = document.getElementById('sim-tree-canvas');
  if(_cv){const _cx=_cv.getContext('2d');_cv.width=_cv.width;if(_cx){_cx.fillStyle='#4a5168';_cx.font='13px JetBrains Mono,monospace';_cx.textAlign='center';_cv.height=80;_cx.fillText('아직 진행한 회차가 없어요',(_cv.width||320)/2,44);}}
}

function initSimulator() {
  try {
    const saved=localStorage.getItem('edge_sim_state'), savedGoal=localStorage.getItem('edge_sim_goal');
    if(saved){simState=JSON.parse(saved);simSnaps=[];}if(savedGoal)SIM_GOAL=parseInt(savedGoal);
    const savedPending=localStorage.getItem('edge_sim_pending');
    if(savedPending){simPending=JSON.parse(savedPending);}
  } catch(e) {}
  simRender(); simRenderPending(); simOnInput();
  // 로드맵 명시적 갱신 (monkey-patch 여부와 무관하게)
  if(typeof simRenderRoadmap === 'function') simRenderRoadmap();
  // 경로 탭이 열려있을 경우 트리 갱신 (불러오기 후 빈 화면 버그 수정)
  const treeTab = document.getElementById('sim-tc-tree');
  if(treeTab && treeTab.style.display !== 'none') simRenderTree();
  document.querySelectorAll('#page-strategy input[type=number]').forEach(el => {
    el.addEventListener('wheel', e => e.preventDefault(), { passive: false });
  });
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
  // 모바일에서 헤더 높이 동적으로 읽어서 서브탭/main 위치 조정
  function adjustMobileLayout() {
    if (window.innerWidth > 600) return;
    const header = document.querySelector('header');
    if (!header) return;
    const hh = header.offsetHeight;
    const subtab = document.querySelector('.mobile-subtab-bar');
    const subtab2 = document.getElementById('mobile-subtab2-bar');
    const main = document.querySelector('main');
    if (subtab) subtab.style.top = hh + 'px';
    const subtabH = subtab ? subtab.offsetHeight : 0;
    const subtab2Visible = subtab2 && subtab2.children.length > 0 && subtab2.style.display !== 'none';
    if (subtab2) subtab2.style.top = (hh + subtabH) + 'px';
    const subtab2H = subtab2Visible ? subtab2.offsetHeight : 0;
    if (main) {
      main.style.paddingTop = (hh + subtabH + subtab2H + 10) + 'px';
    }
  }
  window._adjustMobileLayout = adjustMobileLayout;
  setTimeout(adjustMobileLayout, 100);
  window.addEventListener('resize', adjustMobileLayout);

  const _rd = document.getElementById('r-date');
  if (_rd) _rd.value = new Date().toISOString().split('T')[0];
  selectResult('PENDING');
  setBetMode('single');

  // 예상 수익 미리보기
  ['r-amount','r-betman-odds'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updatePreview);
  });

  initCharts();
  updateAll();
  renderTemplateList();
  initMobileNav();
});

