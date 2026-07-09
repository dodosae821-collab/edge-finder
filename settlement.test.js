// settlement.test.js — 홀딩 정산(머니 모델 핵심) 검증
//   simHold의 amts 계산 + simApplyPending의 잔액/회차/목표 반영.
//   이 로직은 앱의 실제 돈 계산인데 여태 무보호였음 (정리 세션에서 발견·보강).
const vm = require('vm');
const fs = require('fs');
const path = require('path');

let _bets = [], _store = {};
const sandbox = {
  window, document, console, navigator: window.navigator, localStorage: window.localStorage,
  setTimeout: (fn) => { fn(); return 0; }, clearTimeout: () => {}, setInterval, clearInterval,
  Math, Date, JSON, parseInt, parseFloat, isNaN, isFinite, Number, String, Boolean, Array, Object, Set, Map, RegExp, Error,
  alert: () => {}, confirm: () => true,
  getBets: () => _bets, saveBets: (n) => { _bets = n.map(b => ({...b})); return _bets; }, updateAll: () => {},
  toProb: p => (Number(p)||0)/100, getCLVAdjustedProb: p => p, getDecisionSnapshot: () => ({}),
  Storage: {
    setJSON:(k,v)=>{_store[k]=JSON.stringify(v);}, getJSON:(k,d)=>(k in _store?JSON.parse(_store[k]):d),
    set:(k,v)=>{_store[k]=String(v);}, get:(k)=>_store[k]??null, remove:(k)=>{delete _store[k];},
  },
  KEYS: { SIM_FORM_DRAFT:'d', SIM_STATE:'s', SIM_GOAL:'g', SIM_PENDING:'p', TEMPLATES:'t' },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
const load = f => vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), sandbox, { filename: f });
load('ev.js'); load('tags_ui.js'); load('bet_record.js');
load('sim_state.js'); load('sim_engine.js'); load('sim_render.js'); load('sim_actions.js');
const S = sandbox;
const g = expr => vm.runInContext(expr, sandbox);   // top-level let 접근용

const BODY = `
  <input id="sim-i-sv"><input id="sim-i-b2"><input id="sim-i-b3"><input id="sim-i-b4">
  <input id="sim-i-memo"><input id="sim-i-memo-b"><input id="sim-i-memo-c">
  ${['a','b','c'].map(w => Array.from({length:6},(_,i)=>`<input type="radio" name="f${w}" id="sim-f-${w}${i+1}">`).join('')).join('\n')}
  <div id="sim-judge-a"></div><div id="sim-judge-b"></div><div id="sim-judge-c"></div>`;

function setupHold({ bal = 100000, sv = 10000, b2 = 20000, oA = 2.0, b3 = 30000, oB = 2.5 } = {}) {
  _bets = []; _store = {};
  document.body.innerHTML = BODY;
  g(`simState = { balance:${bal}, round:1, history:[], goalReached:false, goalHistory:[] }; simPending = null; simSnaps = [];`);
  S.simResetOdds();
  document.getElementById('sim-i-sv').value = String(sv);
  document.getElementById('sim-i-b2').value = String(b2);
  document.getElementById('sim-f-a1').checked = true;
  if (b3 > 0) { document.getElementById('sim-i-b3').value = String(b3); document.getElementById('sim-f-b1').checked = true; }
  S.simRenderJudge();
  document.querySelector('#sim-judge-a .sim-fold-odds').value = String(oA);
  document.querySelector('#sim-judge-a .sim-fold-prob').value = '55';
  if (b3 > 0) {
    document.querySelector('#sim-judge-b .sim-fold-odds').value = String(oB);
    document.querySelector('#sim-judge-b .sim-fold-prob').value = '45';
  }
  S.simHold();
}

describe('홀딩 정산 — 머니 모델', () => {

  test('simHold: amts 시나리오별 잔액 계산 (sv1만 + A 2만×2.0 + B 3만×2.5)', () => {
    setupHold();
    const p = g('simPending');
    expect(p).toBeTruthy();
    // w2=4만, w3=7.5만
    expect(p.amts.both).toBe(10000 + 40000 + 75000);   // 125,000
    expect(p.amts.only2).toBe(10000 + 40000);           // A만: 50,000
    expect(p.amts.only3).toBe(10000 + 75000);           // B만: 85,000
    expect(p.amts.lose).toBe(10000);                    // 세이브만
    // 홀딩과 동시에 미결 2건 전송
    expect(_bets.filter(b => b.result === 'PENDING').length).toBe(2);
  });

  test('simApplyPending("both"): 잔액 반영 + 회차 증가 + 이력 기록 + 대기 해제', () => {
    setupHold();
    S.simApplyPending('both');
    expect(g('simState.balance')).toBe(125000);
    expect(g('simState.round')).toBe(2);
    expect(g('simState.history.length')).toBe(1);
    expect(g('simState.history[0].key')).toBe('both');
    expect(g('simState.history[0].after')).toBe(125000);
    expect(g('simPending')).toBeNull();
  });

  test('simApplyPending("lose"): 세이브만 남음, 음수 불가', () => {
    setupHold();
    S.simApplyPending('lose');
    expect(g('simState.balance')).toBe(10000);
    // 세이브 0으로도 확인
    setupHold({ sv: 0, b2: 50000, b3: 0 });
    S.simApplyPending('lose');
    expect(g('simState.balance')).toBe(0);
    expect(g('simState.balance') >= 0).toBe(true);
  });

  test('목표 도달: newBal >= SIM_GOAL → goalReached + goalHistory 기록', () => {
    // 잔액 90만, sv 50만 + A 30만×2.0 → both = 50만+60만 = 110만 >= 목표 100만
    setupHold({ bal: 900000, sv: 500000, b2: 300000, oA: 2.0, b3: 0 });
    S.simApplyPending('both');
    expect(g('simState.balance')).toBe(1100000);
    expect(g('simState.goalReached')).toBe(true);
    expect(g('simState.goalHistory.length')).toBe(1);
  });

  test('구버전 flat 키 호환 (amts 없이 bothAmt/loseAmt)', () => {
    document.body.innerHTML = BODY;
    g(`simState = { balance:50000, round:3, history:[], goalReached:false, goalHistory:[] };
       simPending = { sv:5000, b2:10000, b3:0, b4:0, o2:2, o3:0, o4:0, ex2:0, ex3:0,
                      memo:'', memoB:'', memoC:'', folderCount:1, round:3,
                      bothAmt:25000, only2Amt:25000, only3Amt:5000, loseAmt:5000 };`);
    S.simApplyPending('both');
    expect(g('simState.balance')).toBe(25000);
    expect(g('simState.round')).toBe(4);
  });
});
