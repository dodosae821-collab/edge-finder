// goal_sync.test.js — 전략베팅 목표 ← 설정 탭 '목표 자금' 연동 (v80)
const vm = require('vm');
const fs = require('fs');
const path = require('path');

let _store = {}, _settings = { targetFund: 0 };
const sandbox = {
  window, document, console, navigator: window.navigator, localStorage: window.localStorage,
  setTimeout: (fn)=>{fn();return 0;}, clearTimeout: ()=>{}, setInterval, clearInterval,
  Math, Date, JSON, parseInt, parseFloat, isNaN, isFinite, Number, String, Boolean, Array, Object, Set, Map, RegExp, Error,
  alert: ()=>{}, confirm: ()=>true,
  getBets: () => [], saveBets: () => {}, updateAll: () => {},
  getSettings: () => _settings,
  toProb: p => (Number(p)||0)/100, getCLVAdjustedProb: p => p, getDecisionSnapshot: () => ({}),
  Storage: {
    setJSON:(k,v)=>{_store[k]=JSON.stringify(v);}, getJSON:(k,d)=>(k in _store?JSON.parse(_store[k]):d),
    set:(k,v)=>{_store[k]=String(v);}, get:(k)=>(_store[k]??null), remove:(k)=>{delete _store[k];},
  },
  KEYS: { SIM_STATE:'s', SIM_GOAL:'g', SIM_GOAL_MANUAL:'gm', SIM_PENDING:'p', SIM_FORM_DRAFT:'d' },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
const load = f => vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), sandbox, { filename: f });
load('ev.js'); load('sim_state.js'); load('sim_engine.js'); load('sim_render.js'); load('sim_actions.js');
const S = sandbox;
const g = expr => vm.runInContext(expr, sandbox);

beforeEach(() => {
  _store = {}; _settings = { targetFund: 0 };
  document.body.innerHTML = `<input id="sim-goal-input"><div id="sim-goal-mode"></div>
    <div id="sim-judge-a"></div><div id="sim-judge-b"></div><div id="sim-judge-c"></div>
    <div id="sim-prob-mirror"></div>
    ${['a','b','c'].map(w=>Array.from({length:6},(_,i)=>`<input type="radio" name="f${w}" id="sim-f-${w}${i+1}">`).join('')).join('')}`;
  g('SIM_GOAL = 1000000; simState = { balance: 10000, round: 1, history: [], goalReached: false, goalHistory: [] };');
});

describe('목표 금액 설정 연동', () => {

  test('설정 목표 자금 → SIM_GOAL 자동 추종', () => {
    _settings.targetFund = 3000000;
    expect(S.simSyncGoalFromSettings()).toBe(true);
    expect(g('SIM_GOAL')).toBe(3000000);
    expect(g('simState.goalReached')).toBe(false);   // 목표 변경 시 재도전
  });

  test('수동 확정(simConfirmGoal) → 오버라이드, 설정 변경 무시', () => {
    document.getElementById('sim-goal-input').value = '2000000';
    S.simConfirmGoal();
    expect(g('SIM_GOAL')).toBe(2000000);
    expect(S.simGoalIsManual()).toBe(true);
    _settings.targetFund = 5000000;
    expect(S.simSyncGoalFromSettings()).toBe(false); // 수동이 이김
    expect(g('SIM_GOAL')).toBe(2000000);
  });

  test('↺ 재연동(simClearGoalManual) → 설정 목표로 복귀', () => {
    document.getElementById('sim-goal-input').value = '2000000';
    S.simConfirmGoal();
    _settings.targetFund = 5000000;
    S.simClearGoalManual();
    expect(S.simGoalIsManual()).toBe(false);
    expect(g('SIM_GOAL')).toBe(5000000);
  });

  test('설정 목표 미입력(0)이면 기존 SIM_GOAL 유지', () => {
    _settings.targetFund = 0;
    expect(S.simSyncGoalFromSettings()).toBe(false);
    expect(g('SIM_GOAL')).toBe(1000000);
  });

  test('거울 반영: 목표 연동 후 확률 거울이 새 목표 기준으로 계산', () => {
    _settings.targetFund = 200000;
    S.simSyncGoalFromSettings();
    // 판단 행에 배당 넣고 거울 렌더 (목표 20만 기준 텍스트/계산)
    document.getElementById('sim-f-a1').checked = true;
    S.simRenderJudge();
    document.querySelector('#sim-judge-a .sim-fold-odds').value = '2.0';
    document.getElementById('sim-i-sv') || document.body.insertAdjacentHTML('beforeend','<input id="sim-i-sv"><input id="sim-i-b2"><input id="sim-i-b3"><input id="sim-i-b4">');
    S.simRenderProbMirror();
    expect(document.getElementById('sim-prob-mirror').innerHTML.length).toBeGreaterThan(0); // 10000 < 200000 → 렌더됨
    // 목표를 잔액 이하로 → 거울 숨김 (goal > bal 조건)
    _settings.targetFund = 5000;
    S.simSyncGoalFromSettings();
    S.simRenderProbMirror();
    expect(document.getElementById('sim-prob-mirror').innerHTML).toBe('');
  });
});
