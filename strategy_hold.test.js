// strategy_hold.test.js  (testEnvironment: jsdom)
// 대상: 전략베팅 홀딩 → 베팅기록 미결(PENDING) 전송 경로
//   simGetBranch / simTransmitPending (sim_actions.js) · simRenderJudge (sim_render.js)
//   buildStrategyBet / computeBetDerived (bet_record.js)
//   computeComboProb (ev.js)

const vm = require('vm');
const fs = require('fs');
const path = require('path');

let _bets = [];

// jsdom window/document(jest 제공)를 그대로 쓰는 명시적 샌드박스 컨텍스트
const sandbox = {
  window, document, console, navigator: window.navigator, localStorage: window.localStorage,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Math, Date, JSON, parseInt, parseFloat, isNaN, isFinite, Number, String, Boolean, Array, Object, Set, Map, RegExp, Error,
  alert: () => {}, confirm: () => true, prompt: () => null,
  getBets: () => _bets,
  saveBets: (next) => {
    if (!Array.isArray(next)) throw new Error('saveBets: array required');
    _bets = next.map(b => {
      const c = { ...b };
      if (c.isSim === true) c.finSeason = -1;
      else if (!Number.isInteger(c.finSeason) || c.finSeason < 0) c.finSeason = (c.amount === 0 && c.profit === 0) ? 0 : 1;
      return c;
    });
    return _bets;
  },
  toProb: (pct) => { const n = Number(pct); return Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) / 100 : 0; },
  getCLVAdjustedProb: (p) => p,
  getDecisionSnapshot: (mp, od) => ({ myProb: mp, odds: od, label: 'OK', factor: 1.0 }),
  Storage: { setJSON: () => {}, getJSON: (k, def) => (def !== undefined ? def : null) },
  KEYS: { SIM_PENDING: 'k', SIM_STATE: 's', TEMPLATES: 't' },
};
sandbox.globalThis = sandbox;
sandbox.window.App = { _SS: { guardFactor: 1.0 } };
vm.createContext(sandbox);

const load = f => vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), sandbox, { filename: f });
load('ev.js');
load('bet_record.js');
load('sim_state.js');
load('sim_engine.js');
load('sim_render.js');
load('sim_actions.js');

// 샌드박스 함수 핸들
const { simRenderJudge, simTransmitPending, computeBetDerived } = sandbox;
const getBets = () => _bets;

const BODY = `
  <input id="sim-i-sv"><input id="sim-i-b2"><input id="sim-i-b3"><input id="sim-i-b4">
  <input id="sim-i-memo"><input id="sim-i-memo-b"><input id="sim-i-memo-c">
  <input type="radio" name="fa" id="sim-f-a1"><input type="radio" name="fa" id="sim-f-a2"><input type="radio" name="fa" id="sim-f-a3"><input type="radio" name="fa" id="sim-f-a4"><input type="radio" name="fa" id="sim-f-a5"><input type="radio" name="fa" id="sim-f-a6">
  <input type="radio" name="fb" id="sim-f-b1"><input type="radio" name="fb" id="sim-f-b2"><input type="radio" name="fb" id="sim-f-b3"><input type="radio" name="fb" id="sim-f-b4"><input type="radio" name="fb" id="sim-f-b5"><input type="radio" name="fb" id="sim-f-b6">
  <input type="radio" name="fc" id="sim-f-c1"><input type="radio" name="fc" id="sim-f-c2"><input type="radio" name="fc" id="sim-f-c3"><input type="radio" name="fc" id="sim-f-c4"><input type="radio" name="fc" id="sim-f-c5"><input type="radio" name="fc" id="sim-f-c6">
  <div id="sim-judge-a"></div><div id="sim-judge-b"></div><div id="sim-judge-c"></div>`;

beforeEach(() => { _bets = []; document.body.innerHTML = BODY; });

const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
const check = (id) => { const el = document.getElementById(id); if (el) el.checked = true; };

describe('전략베팅 홀딩 → 베팅기록 미결 전송', () => {

  test('A 단폴 + B 다폴 → 미결 2건, 폴더/myProb 실림', () => {
    check('sim-f-a1');
    setVal('sim-i-b2', '10000');
    setVal('sim-i-memo', '맨시티 승');
    check('sim-f-b2');
    setVal('sim-i-b3', '20000');
    setVal('sim-i-memo-b', '레알/바르샤');

    simRenderJudge();
    setVal('sim-sport-a', '축구');
    setVal('sim-prob-a', '55');
    // A 단폴 경기 배당 2.50 → 합산 배당 자동
    document.querySelector('#sim-judge-a .sim-fold-odds').value = '2.50';

    const bRows = document.querySelectorAll('#sim-judge-b .sim-fold-row');
    expect(bRows.length).toBe(2);
    const set = (row, cls, v) => { row.querySelector(cls).value = v; };
    set(bRows[0], '.sim-fold-odds', '1.75'); set(bRows[0], '.sim-fold-prob', '60'); set(bRows[0], '.sim-fold-sport', '축구');
    set(bRows[1], '.sim-fold-odds', '1.71'); set(bRows[1], '.sim-fold-prob', '58'); set(bRows[1], '.sim-fold-sport', '야구');

    const n = simTransmitPending();
    expect(n).toBe(2);
    const bets = getBets();
    expect(bets.length).toBe(2);

    const A = bets.find(b => b.memo === '[전략베팅 A]');
    const B = bets.find(b => b.memo === '[전략베팅 B]');
    expect(A).toBeTruthy();
    expect(B).toBeTruthy();

    [A, B].forEach(r => {
      expect(r.result).toBe('PENDING');
      expect(r.isSim).toBe(false);
      expect(r.finSeason).toBe(1);
      expect(r.roundId).toBeUndefined();
    });

    expect(A.mode).toBe('single');
    expect(A.myProb).toBe(55);
    expect(A.sport).toBe('축구');
    expect(A.betmanOdds).toBeCloseTo(2.50, 5);

    expect(B.mode).toBe('multi');
    expect(B.folderOdds).toEqual([1.75, 1.71]);
    expect(B.folderProbs).toEqual([60, 58]);
    expect(B.folderSports).toEqual(['축구', '야구']);
    expect(B.myProb).not.toBeNull();
    expect(B.myProb).toBeCloseTo(60 * 58 / 100, 1);
    expect(B.ev).not.toBeNull();       // 다폴도 EV 산출 (과신방어/EV 분석 커버)
  });

  test('A=0 + B만 → 미결 1건(B)', () => {
    check('sim-f-a1');
    setVal('sim-i-b2', '0');
    check('sim-f-b1');
    setVal('sim-i-b3', '10000');
    simRenderJudge();
    setVal('sim-prob-b', '50');
    document.querySelector('#sim-judge-b .sim-fold-odds').value = '2.00';

    const n = simTransmitPending();
    expect(n).toBe(1);
    const bets = getBets();
    expect(bets.length).toBe(1);
    expect(bets[0].memo).toBe('[전략베팅 B]');
    expect(bets[0].amount).toBe(10000);
  });

  test('홀딩 후 전략 성공/실패는 베팅기록 미결을 바꾸지 않음 (연결 안 됨)', () => {
    check('sim-f-a1');
    setVal('sim-i-b2', '10000');
    simRenderJudge();
    setVal('sim-prob-a', '50');
    document.querySelector('#sim-judge-a .sim-fold-odds').value = '2.00';
    simTransmitPending();

    const before = JSON.stringify(getBets());
    const rec = getBets()[0];
    expect(rec.matchId).toBeUndefined();
    expect(rec.simRef).toBeUndefined();
    expect(rec.source).toBe('strategy');
    const after = JSON.stringify(getBets());
    expect(after).toBe(before);
  });

  test('computeBetDerived: 단폴 EV (myProb 55% · 배당 2.5) = 0.375', () => {
    const d = computeBetDerived({ mode: 'single', betmanOdds: 2.5, myProb: 55, folderOdds: [], folderProbs: [], adjustedProbHint: null });
    expect(d.ev).toBeCloseTo(0.375, 5);
    expect(d.myProbEff).toBe(55);
  });
});
