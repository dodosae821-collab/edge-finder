// ============================================================
// 전략베팅 — 액션 (입력 핸들러·홀딩·결과 처리·초기화)
// ============================================================


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
  ['sim-c-memo-wrap','sim-c-bet-wrap','sim-c-odds-wrap','sim-c-folder-wrap','sim-judge-c'].forEach(id => {
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

  // 합산 배당 자동 표시 (판단 데이터 경기 배당 → betmanRound) + 수동 수정 상태
  const _dispOdds = (w, o) => {
    const el = document.getElementById(`sim-odds-disp-${w}`);
    if (!el) return;
    const ov = simOddsOverride[w];
    if (typeof ov === 'number' && ov >= 1.01) {
      const auto = simGetAutoOdds(w);
      el.innerHTML = '×' + ov.toFixed(2) + ' <span style="font-size:9px;color:var(--gold);font-weight:600;">수정</span>'
        + (auto >= 1.01 ? `<br><span style="font-size:9px;color:var(--text3);font-weight:400;">(자동 ×${auto.toFixed(2)})</span>` : '');
    } else {
      el.textContent = o >= 1.01 ? '×' + o.toFixed(2) : '—';
    }
  };
  _dispOdds('a', o2);
  _dispOdds('b', o3);
  _dispOdds('c', o4);

  const _anyChecked = w => { for (let n = 1; n <= 6; n++) { if (document.getElementById(`sim-f-${w}${n}`)?.checked) return true; } return false; };
  const aChecked = _anyChecked('a');
  const bChecked = _anyChecked('b');
  const cChecked = _anyChecked('c');
  const hasBetB  = b3 > 0;
  const hasBetC  = b4 > 0;
  // 금액>0 갈래는 배당(경기 기록)도 있어야 홀딩 가능 — 배당은 판단 데이터에서 자동 산출
  const oddsOk = (b2 > 0 ? o2 >= 1.01 : true) && (hasBetB ? o3 >= 1.01 : true) && (hasBetC && showC ? o4 >= 1.01 : true);
  const folderChecked = aChecked && (hasBetB ? bChecked : true) && (hasBetC && showC ? cChecked : true);
  const fwEl = document.getElementById('sim-folder-warn');
  if (fwEl) {
    const showWarn = (!folderChecked || !oddsOk) && tot > 0;
    fwEl.textContent = !folderChecked ? 'A/B 베팅 폴더 수를 모두 선택해야 진행할 수 있어요'
                                      : '금액 넣은 갈래는 판단 데이터에 경기 배당을 입력해야 해요 (합산 배당 자동 계산)';
    fwEl.style.display = showWarn ? 'block' : 'none';
  }

  // 폴더 하이라이트 (1~6폴 전 갈래)
  [['a', 'var(--green)', 'rgba(0,230,118,0.08)'],
   ['b', 'var(--green)', 'rgba(0,230,118,0.08)'],
   ['c', 'var(--accent2)', 'rgba(255,107,53,0.08)']].forEach(([w, col, bg]) => {
    for (let n = 1; n <= 6; n++) {
      const checked = document.getElementById(`sim-f-${w}${n}`)?.checked;
      const lbl = document.getElementById(`sim-lbl-${w}f${n}`);
      const c = n === 1 ? 'var(--gold)' : col;
      const b = n === 1 ? 'rgba(255,215,0,0.08)' : bg;
      if (lbl) { lbl.style.borderColor = checked ? c : 'var(--border)'; lbl.style.background = checked ? b : 'var(--bg2)'; }
    }
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
      const canHold = !over && tot > 0 && folderChecked && oddsOk && bal > 0;
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

  // 판단 데이터 입력 UI 동기화 (폴더 수 변경 반영)
  try { simRenderJudge(); } catch (e) {}
  // 도달/파산 확률 거울 실시간 갱신 (원칙3 — 입력 바꾸면 확률도 즉시 따라감)
  simScheduleProbMirror();
  simScheduleBreakwater();
  // 입력 임시저장 — 탭 이동/새로고침에도 폼 유실 방지 (③상태 통합)
  simFormSaveDraft();
}


function simUndoLast() {
  if (!simSnaps.length) return;
  simState = simSnaps.pop();
  ['sim-i-sv','sim-i-b2','sim-i-b3','sim-i-b4','sim-i-memo','sim-i-memo-b','sim-i-memo-c'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  simResetOdds(); simRender(); simOnInput();
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
  try { Storage.setJSON(KEYS.SIM_STATE, simState); } catch(e) {}
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
  try { Storage.setJSON(KEYS.SIM_STATE, simState); } catch(e) {}
  simRender(); simOnInput();
}


function simRestart() {
  if (!confirm('잔액만 1만원으로 초기화할까요?\n히스토리는 유지됩니다.')) return;
  simSnaps.push(JSON.parse(JSON.stringify(simState)));
  simState.balance = SIM_START;
  simState.round = simState.history.length + 1;
  simState.goalReached = false;
  try { Storage.setJSON(KEYS.SIM_STATE, simState); } catch(e) {}
  simRender(); simOnInput();
}


// 갈래(A/B/C) 데이터 수집 → buildStrategyBet 입력 객체. 금액<=0이면 null (미전송).
function simGetBranch(which) {
  const map = {
    a: { amt: 'sim-i-b2', odds: 'a', memo: 'sim-i-memo' },
    b: { amt: 'sim-i-b3', odds: 'b', memo: 'sim-i-memo-b' },
    c: { amt: 'sim-i-b4', odds: 'c', memo: 'sim-i-memo-c' },
  };
  const cfg = map[which];
  if (!cfg) return null;
  const amount = parseInt(document.getElementById(cfg.amt)?.value) || 0;
  if (amount <= 0) return null;   // 규칙3: 금액>0 갈래만 전송

  const count = simBranchFolderCount(which);
  const betmanOdds = simGetOdds(cfg.odds);
  const gameMemo = document.getElementById(cfg.memo)?.value.trim() || '';
  const label = which.toUpperCase();
  const base = { game: gameMemo || '-', betmanOdds, amount, memo: `[전략베팅 ${label}]`, folderMemos: [] };

  if (count >= 2) {
    // 공용 접근 계층(sim_state.js)으로 판단 유닛 일괄 읽기 — DOM 스크래핑 중복 제거
    const units = simReadJudgeUnits(which);
    const folderOdds = [], folderProbs = [], folderSports = [], folderTypes = [];
    units.forEach(u => {
      folderOdds.push(parseFloat(u.odds) || null);
      folderProbs.push(parseFloat(u.prob) || null);
      folderSports.push(u.sport || '');
      folderTypes.push(u.type || '승/패'); // 피커 선택값 (미선택 시 기본)
    });
    // 다폴 결합 예측승률 (로그 합) — EV/과신방어 계산에 필요 (>=2 유효 시)
    const _p = folderProbs.filter(p => p > 0);
    let myProb = null;
    if (_p.length >= 2) {
      let _lr = 0; _p.forEach(p => { _lr += Math.log(p / 100); });
      myProb = +(Math.exp(_lr) * 100).toFixed(2);
    }
    return {
      ...base, mode: 'multi', folderCount: String(count), type: '승/패', myProb,
      sport: folderSports.filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', '),
      folderOdds, folderProbs, folderSports, folderTypes,
    };
  }
  const u0 = simReadJudgeUnits(which)[0] || {};
  const sport = u0.sport || '';
  const stype = u0.type || '승/패'; // 피커 선택값 (미선택 시 기본)
  const myProb = parseFloat(u0.prob) || null;
  return {
    ...base, mode: 'single', folderCount: '', sport, type: stype, myProb,
    folderOdds: [], folderProbs: [], folderSports: [], folderTypes: [],
  };
}


// 홀딩 전송: 금액>0 갈래마다 독립 PENDING 레코드로 베팅기록에 등록.
//   ★ 각 갈래 독립 (규칙1) · isSim:false (분석 커버) · 실회차 예산 미접촉.
//   반환: 전송된 미결 건수.
function simTransmitPending() {
  if (typeof buildStrategyBet !== 'function' || typeof saveBets !== 'function' || typeof getBets !== 'function') return 0;
  const recs = ['a', 'b', 'c'].map(simGetBranch).filter(Boolean).map(buildStrategyBet);
  if (!recs.length) return 0;
  // 현재 회차 반영: 베팅기록 폼과 동일하게 roundId 부여 + 회차 예산 차감
  //   (v63의 "회차 미접촉" 설계를 사용자 확인으로 폐기 — 홀딩 미결도 정식 회차 소속)
  if (typeof attachRoundToBet === 'function') recs.forEach(r => attachRoundToBet(r));
  if (typeof applyRoundBet === 'function') {
    const totalAmt = recs.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    if (totalAmt > 0) applyRoundBet(totalAmt);
  }
  saveBets([...getBets(), ...recs], { refresh: false });
  return recs.length;
}


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
  ['sim-c-memo-wrap','sim-c-bet-wrap','sim-c-odds-wrap','sim-c-folder-wrap','sim-judge-c'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.style.display = showC ? 'block' : 'none';
  });
  if(!showC) { const b4el = document.getElementById('sim-i-b4'); if(b4el) b4el.value = ''; }
  const aCnt = simBranchFolderCount('a');

  // ── 아래 3가지 조건은 예전엔 알림 없이 그냥 return 되어 "홀딩 눌렀는데 반응 없음"으로 보였음.
  //    원인을 토스트로 바로 알려주도록 수정.
  if (simPending) {
    simToast('⚠️ 아직 결과 처리 안 된 홀딩이 있어요. 먼저 결과 버튼을 눌러 확정하세요.', 'warn');
    return;
  }
  if (!tot) {
    simToast('⚠️ 세이브/A/B/C 베팅금이 모두 0이에요. 금액을 입력하세요.', 'warn');
    return;
  }
  if (tot > simState.balance) {
    simToast(`⚠️ 입력한 총액(${simFmt(tot)}원)이 보유 잔액(${simFmt(simState.balance)}원)보다 많아요.`, 'warn');
    return;
  }
  if (!aCnt) {
    simToast('⚠️ A(안전) 폴더 수(1~6폴)를 선택해야 홀딩할 수 있어요.', 'warn');
    return;
  }
  // 금액>0 갈래는 판단 데이터에 경기 배당이 있어야 함 (합산 배당 자동 산출)
  if ((b2 > 0 && o2 < 1.01) || (b3 > 0 && o3 < 1.01) || (b4 > 0 && showC && o4 < 1.01)) {
    simToast('⚠️ 금액 넣은 갈래는 판단 데이터에 경기 배당을 입력하세요 (합산 배당 자동 계산).', 'warn');
    return;
  }

  const ex2 = b2 > 0 ? simCalcExcess(b2, o2) : 0;
  const ex3 = b3 > 0 ? simCalcExcess(b3, o3) : 0;
  const memo  = document.getElementById('sim-i-memo')?.value.trim() || '';
  const memoB = document.getElementById('sim-i-memo-b')?.value.trim() || '';
  const memoC = document.getElementById('sim-i-memo-c')?.value.trim() || '';
  const folderCount = aCnt;

  const w2 = Math.round(b2*o2), w3 = Math.round(b3*o3), w4 = Math.round(b4*o4);
  simPending = {
    sv, b2, b3, b4, o2, o3, o4, ex2, ex3, memo, memoB, memoC, folderCount,
    round: simState.round,
    amts: {
      both:  sv+w2+w3+w4,  // A+B+C 모두 성공
      ab:    sv+w2+w3,      // A+B만 성공 (C 베팅금 소멸, 이미 차감)
      ac:    sv+w2+w4,      // A+C만 성공 (B 베팅금 소멸)
      bc:    sv+w3+w4,      // B+C만 성공 (A 베팅금 소멸)
      onlyA: sv+w2,         // A만 성공 (B,C 베팅금 소멸)
      onlyB: sv+w3,         // B만 성공 (A,C 베팅금 소멸)
      onlyC: sv+w4,         // C만 성공 (A,B 베팅금 소멸)
      only2: sv+w2,         // 2폴더: A만 성공 (B 베팅금 소멸)
      only3: sv+w3,         // 2폴더: B만 성공 (A 베팅금 소멸)
      lose:  sv,            // 모두 실패 (세이브만 남음)
    }
  };

  // ── 홀딩 = 미결 전송 ──────────────────────────────────────
  //   금액>0 갈래를 베팅기록 미결(PENDING)로 등록. 반드시 입력칸 초기화 前에 수집.
  //   각 갈래 독립 · isSim:false · 실회차 예산 미접촉 (지시서 규칙1·4).
  try { simTransmitPending(); } catch (e) { console.warn('[simHold] 미결 전송 실패:', e); }

  // 입력칸 초기화
  ['sim-i-sv','sim-i-b2','sim-i-b3','sim-i-b4','sim-i-memo','sim-i-memo-b','sim-i-memo-c'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  simClearJudgeInputs();
  simResetOdds();
  simFormClearDraft();   // 홀딩 확정 → 임시저장 폐기
  simRenderPending();
  simOnInput();
  try { Storage.setJSON(KEYS.SIM_PENDING, simPending); } catch(e) {}
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
  const excessSave = {
    both: p.ex2 + p.ex3,
    only2: p.ex2, onlyA: p.ex2, ab: p.ex2, ac: p.ex2,
    only3: p.ex3, onlyB: p.ex3, bc: p.ex3,
    onlyC: 0, lose: 0,
  }[key] ?? 0;
  simState.history.push({ round:p.round, save:p.sv, bet2:p.b2, bet3:p.b3, bet4:p.b4||0, odds2:p.o2, odds3:p.o3, odds4:p.o4||1, key, before:simState.balance, after:newBal, memo:p.memo, memoB:p.memoB, memoC:p.memoC||'', excessSave, folder:p.folderCount });

  if (newBal >= SIM_GOAL && !simState.goalReached) {
    simState.goalReached = true;
    simState.goalHistory.push({ goal:SIM_GOAL, amount:newBal, round:p.round, timestamp:new Date().toLocaleDateString('ko-KR') });
  }
  simState.balance = newBal;
  simState.round++;
  simPending = null;
  simToast(`🎲 결과 반영: 잔액 ${simFmt(newBal)}원 (전략베팅 시뮬 잔액만 변경 · 베팅기록 미접촉)`, key === 'lose' ? 'error' : 'ok');

  // ★ 수정: "성공/실패" 결과 버튼은 전략베팅 시뮬 잔액만 바꿉니다.
  //   베팅기록과 연동되는 지점은 오직 홀딩(simHold → simTransmitPending) 하나뿐이며,
  //   그때 이미 미결(PENDING)로 베팅기록에 넘어가 있습니다.
  //   따라서 여기서 베팅기록에 WIN/LOSE 기록을 추가로 쓰지 않습니다. (이전엔 여기서 saveBets로
  //   다시 한 번 베팅기록에 써서 중복/불필요한 반영이 생겼던 부분 — 완전히 제거함)

  try { Storage.setJSON(KEYS.SIM_STATE, simState); Storage.set(KEYS.SIM_GOAL, SIM_GOAL); Storage.remove(KEYS.SIM_PENDING); } catch(e) {}
  simRenderPending();
  simRender(); simOnInput();
}


function simCancelPending() {
  simPending = null;
  try { Storage.remove(KEYS.SIM_PENDING); } catch(e) {}
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

  try { Storage.setJSON(KEYS.SIM_STATE, simState); Storage.set(KEYS.SIM_GOAL, SIM_GOAL); } catch(e) {}
  simRender(); simOnInput();
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
    Storage.setJSON(KEYS.SIM_STATE, simState);
    Storage.remove(KEYS.SIM_PENDING);
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

  simSwitchTab('play');
  simRender(); simOnInput();
  if(typeof simRenderRoadmap === 'function') simRenderRoadmap();
}


function simConfirmGoal() {
  const val=parseInt(document.getElementById('sim-goal-input')?.value);
  if(!val||val<=simState.balance){const inp=document.getElementById('sim-goal-input');if(inp){inp.style.borderColor='var(--red)';setTimeout(()=>inp.style.borderColor='',1000);}return;}
  simSetGoalManual(val);   // 수동 오버라이드 (설정 연동 해제 — ↺로 재연동)
  const inp=document.getElementById('sim-goal-input');if(inp)inp.value='';
  simRender();simOnInput();
}


function simManualSave() {
  try{Storage.setJSON(KEYS.SIM_STATE, simState); Storage.set(KEYS.SIM_GOAL, SIM_GOAL);
  const el=document.getElementById('sim-save-status');if(el){el.textContent='저장 완료 — '+new Date().toLocaleString('ko-KR');el.style.color='var(--green)';setTimeout(()=>el.textContent='',3000);}}catch(e){}
}


function simManualLoad() {
  try{const saved=Storage.get(KEYS.SIM_STATE),savedGoal=Storage.get(KEYS.SIM_GOAL);
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
  try{Storage.remove(KEYS.SIM_STATE);Storage.remove(KEYS.SIM_GOAL);Storage.remove(KEYS.SIM_PENDING);}catch(e){}
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
    const saved=Storage.get(KEYS.SIM_STATE), savedGoal=Storage.get(KEYS.SIM_GOAL);
    if(saved){simState=JSON.parse(saved);simSnaps=[];}if(savedGoal)SIM_GOAL=parseInt(savedGoal);
    const savedPending=Storage.get(KEYS.SIM_PENDING);
    if(savedPending){simPending=JSON.parse(savedPending);}
  } catch(e) {}
  simSyncGoalFromSettings();   // 설정 탭 '목표 자금' 연동 (수동 오버라이드 아니면)
  simFormRestoreDraft();   // 폼 임시저장 복원 (라디오→판단행→값 순서 보장)
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

  // ── F5/새로고침 시 전략베팅 상태 복원 ───────────────────────
  // initSimulator()는 strategy 탭 클릭 시에도 호출되지만,
  // 페이지 로드 즉시도 한 번 실행해야 localStorage 상태가 살아있음.
  // (strategy 탭이 열린 채로 F5 → simState/simPending 소멸 버그 수정)
  initSimulator();
});
