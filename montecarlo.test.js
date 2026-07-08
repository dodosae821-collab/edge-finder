// montecarlo.test.js — simMonteCarloPath 순수 함수 검증 (DOM 불요)
const vm = require('vm');
const fs = require('fs');
const path = require('path');

// simulator.js 로드 (top-level은 DOMContentLoaded 리스너뿐 → jsdom 안전)
const sandbox = {
  window, document, console, navigator: window.navigator, localStorage: window.localStorage,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Math, Date, JSON, parseInt, parseFloat, isNaN, isFinite, Number, String, Boolean, Array, Object, Set, Map,
  Storage: { setJSON(){}, getJSON(k,d){return d;}, set(){}, remove(){} },
  KEYS: {}, getBets: () => [], saveBets: () => {}, updateAll: () => {},
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'simulator.js'), 'utf8'), sandbox, { filename: 'simulator.js' });
const { simMonteCarloPath, simMakeRoadmapAlloc, simMakeInputAlloc, simMakeBreakwaterAlloc, simRequiredOdds } = sandbox;

// 시드 고정 RNG (mulberry32)
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('simMonteCarloPath 순수 함수', () => {

  test('승률 100% → 도달 100%, 파산 0%', () => {
    const res = simMonteCarloPath({
      startBal: 10000, goal: 1000000,
      allocFn: (bal) => ({ sv: 0, bets: [{ amount: bal, odds: 2 }] }),
      fallbackRate: () => 1,          // 항상 당첨
      trials: 500, maxRounds: 40,
    });
    expect(res.reachProb).toBe(1);
    expect(res.bustProb).toBe(0);
    expect(res.medianRounds).not.toBeNull();
    // 1만 → 배당2 전액 → 매 회차 2배: 100만 도달까지 log2(100)≈7회
    expect(res.medianRounds).toBeGreaterThanOrEqual(6);
    expect(res.medianRounds).toBeLessThanOrEqual(8);
  });

  test('승률 0% → 파산 100%, 도달 0%', () => {
    const res = simMonteCarloPath({
      startBal: 10000, goal: 1000000,
      allocFn: (bal) => ({ sv: 0, bets: [{ amount: bal, odds: 2 }] }),
      fallbackRate: () => 0,          // 항상 낙첨 → 잔액 0
      trials: 500,
    });
    expect(res.bustProb).toBe(1);
    expect(res.reachProb).toBe(0);
  });

  test('시작 잔액 >= 목표 → 즉시 도달 (0회차)', () => {
    const res = simMonteCarloPath({
      startBal: 1000000, goal: 1000000,
      allocFn: (bal) => ({ sv: 0, bets: [{ amount: bal, odds: 2 }] }),
      trials: 100,
    });
    expect(res.reachProb).toBe(1);
    expect(res.medianRounds).toBe(0);
  });

  test('세이브 방파제(전부 세이브, 베팅 0) → 진행 불가, 도달/파산 아님(미달)', () => {
    const res = simMonteCarloPath({
      startBal: 100000, goal: 1000000,
      allocFn: (bal) => ({ sv: bal, bets: [] }),   // 베팅 없음
      trials: 100,
    });
    expect(res.reachProb).toBe(0);
    expect(res.bustProb).toBe(0);
    expect(res.missProb).toBe(1);
  });

  test('시드 고정 → 결정적 (동일 시드 = 동일 결과)', () => {
    const cfg = {
      startBal: 20000, goal: 500000,
      allocFn: (bal) => ({ sv: Math.round(bal * 0.3 / 10000) * 10000, bets: [{ amount: bal - Math.round(bal * 0.3 / 10000) * 10000, odds: 2.2 }] }),
      legWinRates: { '2~3': 0.5, '1.5~2': 0.6 }, trials: 400,
    };
    const a = simMonteCarloPath({ ...cfg, rng: seeded(123) });
    const b = simMonteCarloPath({ ...cfg, rng: seeded(123) });
    expect(a.reachProb).toBe(b.reachProb);
    expect(a.bustProb).toBe(b.bustProb);
  });

  test('확률 총합 = 1 (도달+파산+미달)', () => {
    const res = simMonteCarloPath({
      startBal: 18000, goal: 1000000,
      legWinRates: { '1.5~2': 0.59, '2~3': 0.47, '3 이상': 0.30 },
      allocFn: simMakeRoadmapAlloc({ o2: 2.0, o3: 2.5, o4: 3.2 }),
      trials: 800, rng: seeded(7),
    });
    const sum = res.reachProb + res.bustProb + res.missProb;
    expect(sum).toBeCloseTo(1, 5);
    expect(res.reachProb).toBeGreaterThanOrEqual(0);
    expect(res.reachProb).toBeLessThanOrEqual(1);
  });

  test('실측 승률이 높을수록 도달확률 단조 증가', () => {
    const mk = (rate) => simMonteCarloPath({
      startBal: 40000, goal: 300000,
      legWinRates: { '1.5~2': rate, '2~3': rate, '3 이상': rate },
      allocFn: simMakeRoadmapAlloc({ o2: 1.8, o3: 2.5, o4: 3.2 }),
      trials: 1500, rng: seeded(42),
    });
    const lo = mk(0.35), hi = mk(0.65);
    expect(hi.reachProb).toBeGreaterThan(lo.reachProb);
  });

  test('배당대 실측 없으면 fallbackRate 사용 (암시확률 기본)', () => {
    // legWinRates 비어있음 → fallback 1/odds. odds=2 → 0.5
    const res = simMonteCarloPath({
      startBal: 10000, goal: 40000,
      allocFn: (bal) => ({ sv: 0, bets: [{ amount: bal, odds: 2 }] }),
      legWinRates: {}, trials: 3000, rng: seeded(1),
    });
    // 매회 승률~0.5로 2배. 도달/파산 둘 다 발생해야 (극단 아님)
    expect(res.reachProb).toBeGreaterThan(0);
    expect(res.bustProb).toBeGreaterThan(0);
  });

  test('배분 팩토리: simMakeInputAlloc 비율 스케일', () => {
    const alloc = simMakeInputAlloc({ sv: 30000, b2: 70000, o2: 2.0, bal: 100000 });
    const out = alloc(200000);   // 2배 잔액 → 2배 스케일
    expect(out.sv).toBe(60000);
    expect(out.bets[0].amount).toBe(140000);
    expect(out.bets[0].odds).toBe(2.0);
  });

  test('배분 팩토리: simMakeBreakwaterAlloc 대부분 세이브', () => {
    const alloc = simMakeBreakwaterAlloc({ saveRatio: 0.6, odds: 3 });
    const out = alloc(100000);
    expect(out.sv).toBe(60000);
    expect(out.bets[0].amount).toBe(40000);
  });

  test('방파제 확정규칙: 100원 단위 내림', () => {
    const alloc = simMakeBreakwaterAlloc({ saveRatio: 0.55, odds: 3, unit: 100 });
    const out = alloc(18000);              // 18000*0.45 = 8100
    expect(out.bets[0].amount).toBe(8100);
    expect(out.sv).toBe(9900);
    const out2 = alloc(300);               // 300*0.45=135 → 내림 100
    expect(out2.bets[0].amount).toBe(100);
    expect(out2.sv).toBe(200);
  });

  test('방파제 확정규칙: 실탄 100원 단위로 0 되면 종료(bets 비움)', () => {
    const alloc = simMakeBreakwaterAlloc({ saveRatio: 0.55, odds: 3, unit: 100 });
    const out = alloc(100);                // 100*0.45=45 → 내림 0 → 종료
    expect(out.bets.length).toBe(0);
    expect(out.sv).toBe(100);              // 전액 세이브로 보존
  });

  test('목표 역산: 6만으로 18만 = 3배', () => {
    expect(simRequiredOdds(180000, 60000)).toBeCloseTo(3, 5);
    expect(simRequiredOdds(180000, 0)).toBeNull();
  });

  test('세이브 최적화: 항상 당첨이면 최저 세이브(최대 판돈)가 최적', () => {
    const { simSuggestSaveRatio } = sandbox;
    const best = simSuggestSaveRatio({
      startBal: 10000, goal: 100000,
      fallbackRate: () => 1,          // 항상 당첨 → 많이 걸수록 빨리 도달
      odds: { o2: 2 }, betWeights: [1, 0, 0],
      grid: [0.40, 0.50, 0.60], trials: 300, rng: seeded(5),
    });
    expect(best.ratio).toBe(0.40);
    expect(best.reachProb).toBe(1);
  });

  test('세이브 최적화: 그리드 내 비율 반환 + 확률 유효', () => {
    const { simSuggestSaveRatio } = sandbox;
    const best = simSuggestSaveRatio({
      startBal: 40000, goal: 300000,
      legWinRates: { '1.5~2': 0.55, '2~3': 0.45 },
      odds: { o2: 1.9, o3: 2.5 }, betWeights: [50, 30, 0],
      trials: 400, rng: seeded(9),
    });
    expect([0.40, 0.45, 0.50, 0.55, 0.60]).toContain(best.ratio);
    expect(best.reachProb).toBeGreaterThanOrEqual(0);
    expect(best.reachProb).toBeLessThanOrEqual(1);
  });
});
