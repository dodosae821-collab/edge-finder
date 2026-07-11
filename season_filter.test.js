// season_filter.test.js — 재무 시즌 필터 규칙 + 판단력 지표 전체 유지 검증 (v82)
const vm = require('vm');
const fs = require('fs');
const path = require('path');

let _settings = { currentFinSeason: 1 };
const sandbox = {
  window, document, console, navigator: window.navigator, localStorage: window.localStorage,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Math, Date, JSON, parseInt, parseFloat, isNaN, isFinite, Number, String, Boolean, Array, Object, Set, Map, RegExp, Error,
  getSettings: () => _settings,
  getBets: () => [], saveBets: () => {}, betmanRound: x => Math.round(x*100)/100,
  Storage: { setJSON(){}, getJSON:(k,d)=>d, set(){}, get:()=>null, remove(){} }, KEYS: {},
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
// state.js 전체 로드 대신 헬퍼 구획만 — state.js는 round/scope 의존이 커서 여기선 규칙만 검증
const src = fs.readFileSync(path.join(__dirname, 'state.js'), 'utf8');
const helper = src.slice(src.indexOf('// ── 재무 시즌 공용 헬퍼'));
vm.runInContext(helper, sandbox, { filename: 'state.js(helpers)' });
vm.runInContext(fs.readFileSync(path.join(__dirname, 'stats.js'), 'utf8'), sandbox, { filename: 'stats.js' });
const S = sandbox;

const BETS = [
  { finSeason: 0, isSim: false, result: 'WIN',  profit: 500000, amount: 100000,
    folderOdds: [1.8, 1.9], folderProbs: [60, 58] },                      // legacy (구 200만의 일부)
  { finSeason: 1, isSim: false, result: 'WIN',  profit: 1500000, amount: 200000,
    folderOdds: [1.7, 1.85], folderProbs: [62, 57] },                     // 시즌1 (구 프로젝트)
  { finSeason: 2, isSim: false, result: 'LOSE', profit: -5000, amount: 5000,
    folderOdds: [2.5, 2.6], folderProbs: [42, 40], folderResults: ['WIN','LOSE'] }, // 시즌2 (1만원 프로젝트)
  { finSeason: 2, isSim: false, result: 'WIN',  profit: 4000, amount: 5000,
    folderOdds: [1.8, 1.9], folderProbs: [60, 58] },
];

describe('재무 시즌 — 돈은 시즌, 판단력은 전체', () => {

  test('시즌1: legacy(0) 포함 + 시즌1만 (시즌2 제외)', () => {
    _settings.currentFinSeason = 1;
    const f = S.filterMoneySeason(BETS);
    expect(f.length).toBe(2);
    expect(f.reduce((s,b)=>s+b.profit,0)).toBe(2000000);   // 구 누적 200만
  });

  test('시즌2 시작 후: 시즌2 기록만 — 누적이 0부터 다시', () => {
    _settings.currentFinSeason = 2;
    const f = S.filterMoneySeason(BETS);
    expect(f.length).toBe(2);
    expect(f.every(b => b.finSeason === 2)).toBe(true);
    expect(f.reduce((s,b)=>s+b.profit,0)).toBe(-1000);     // 새 프로젝트 손익만
  });

  test('판단력 지표(computeLegStats)는 시즌 무관 — 전 기록 학습 유지', () => {
    _settings.currentFinSeason = 2;
    sandbox.getBets = () => BETS;
    const { bands } = S.computeLegStats();
    // 1.5~2 밴드: legacy·시즌1·시즌2의 적중 다폴 레그가 전부 표본에 포함돼야 함
    const total = Object.values(bands).reduce((s,b)=>s+b.n,0);
    expect(total).toBeGreaterThanOrEqual(7);               // 시즌 필터 없이 전체 (7~8레그)
  });
});
