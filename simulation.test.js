// simulation.test.js
// 대상: computeSimulation

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, 'compute.js'), 'utf8');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(code, ctx);

const { computeSimulation } = ctx;

// ── 픽스처 ────────────────────────────────────────────────────
// WIN 50건 + LOSE 50건 (betmanOdds=2.0, amount=10000)
const resolvedWins = Array.from({ length: 50 }, () => ({
  result: 'WIN', betmanOdds: 2.0, amount: 10000,
  profit: (2.0 - 1) * 10000,   // = 10000
  date: '2024-01-01',
}));
const resolvedLoses = Array.from({ length: 50 }, () => ({
  result: 'LOSE', betmanOdds: 2.0, amount: 10000,
  profit: -10000,
  date: '2024-01-02',
}));
const mixedBets = [...resolvedWins, ...resolvedLoses];

const baseConfig = { start: 1000000, goalTarget: 1200000, simGrade: null };


// ── 픽스처 sanity ─────────────────────────────────────────────
describe('픽스처 sanity', () => {
  test('resolvedWins: profit == (betmanOdds - 1) * amount', () => {
    resolvedWins.forEach(b => {
      expect(b.profit).toBe((b.betmanOdds - 1) * b.amount);
    });
  });

  test('resolvedLoses: profit == -amount', () => {
    resolvedLoses.forEach(b => {
      expect(b.profit).toBe(-b.amount);
    });
  });
});


// ── 기본 반환 구조 ─────────────────────────────────────────────
describe('computeSimulation 반환 구조', () => {
  test('필수 키 전부 존재', () => {
    const r = computeSimulation(mixedBets, baseConfig);
    const keys = [
      'winRate', 'avgOdds', 'avgAmt', 'evPerBet',
      'p10', 'p25', 'p50', 'p75', 'p90',
      'actualPath', 'labels',
      'ruinProb', 'medGoal', 'p90streak', 'worstMinAbs',
      'STEPS', 'start', 'goalTarget', 'simGrade', 'simMult',
      'useRecent', 'resolvedCount',
    ];
    keys.forEach(k => expect(r).toHaveProperty(k));
  });
});


// ── ruinProb 극단 케이스 ───────────────────────────────────────
describe('ruinProb 극단 케이스', () => {
  test('항상 이기는 케이스 → ruinProb=0', () => {
    const r = computeSimulation(resolvedWins, { ...baseConfig, goalTarget: 0 });
    expect(r.ruinProb).toBe(0);
  });

  test('항상 지는 케이스 → ruinProb=100', () => {
    // start를 avgAmt(10000)보다 작게 → 첫 스텝부터 파산
    const r = computeSimulation(resolvedLoses, { ...baseConfig, start: 5000, goalTarget: 0 });
    expect(r.ruinProb).toBe(100);
  });
});


// ── betSize=0 ─────────────────────────────────────────────────
describe('betSize=0', () => {
  test('amount=0인 베팅만 있으면 bankroll 불변 (bal 변화 없음)', () => {
    const zeroBets = Array.from({ length: 20 }, () => ({
      result: 'WIN', betmanOdds: 2.0, amount: 0, profit: 0, date: '2024-01-01',
    }));
    const r = computeSimulation(zeroBets, baseConfig);
    // 모든 step p50 = 0 (시작 기준 변화 없음)
    expect(r.p50[r.p50.length - 1]).toBe(0);
  });
});


// ── runs=1 대체 케이스 (STEPS 최소값) ─────────────────────────
describe('최소 STEPS', () => {
  test('resolved 4건(< 5) → STEPS=30 기본값 사용, 정상 동작', () => {
    const smallBets = resolvedWins.slice(0, 4);
    const r = computeSimulation(smallBets, baseConfig);
    expect(r.STEPS).toBe(30);
    expect(r.p50).toHaveLength(31); // STEPS+1
  });
});


// ── resolved 없음 ──────────────────────────────────────────────
describe('resolved 없음', () => {
  test('빈 배열 → 기본값 사용, ruinProb 0~100 범위', () => {
    const r = computeSimulation([], baseConfig);
    expect(r.ruinProb).toBeGreaterThanOrEqual(0);
    expect(r.ruinProb).toBeLessThanOrEqual(100);
    expect(r.winRate).toBe(0.5);
    expect(r.avgOdds).toBe(1.9);
  });

  test('PENDING만 있어도 resolved 없음으로 처리', () => {
    const pendingBets = Array.from({ length: 10 }, () => ({
      result: 'PENDING', betmanOdds: 2.0, amount: 10000, profit: 0, date: '2024-01-01',
    }));
    const r = computeSimulation(pendingBets, baseConfig);
    expect(r.resolvedCount).toBe(0);
    expect(r.winRate).toBe(0.5); // 기본값
  });
});


// ── NaN 전파 방어 ─────────────────────────────────────────────
describe('NaN 전파 방어', () => {
  test('ruinProb는 NaN이 아니고 0~100 범위', () => {
    const r = computeSimulation(mixedBets, baseConfig);
    expect(r.ruinProb).not.toBeNaN();
    expect(r.ruinProb).toBeGreaterThanOrEqual(0);
    expect(r.ruinProb).toBeLessThanOrEqual(100);
  });

  test('profit NaN 포함 배열 → ruinProb NaN 아님', () => {
    const nanBets = Array.from({ length: 10 }, () => ({
      result: 'WIN', betmanOdds: 2.0, amount: 10000, profit: NaN, date: '2024-01-01',
    }));
    const r = computeSimulation(nanBets, baseConfig);
    expect(r.ruinProb).not.toBeNaN();
  });
});


// ── 결정론 검증 ────────────────────────────────────────────────
describe('결정론 (동일 입력 → 동일 출력)', () => {
  test('동일 입력 두 번 → p50, ruinProb, p90streak 동일', () => {
    const r1 = computeSimulation(mixedBets, baseConfig);
    const r2 = computeSimulation(mixedBets, baseConfig);
    expect(r1.p50).toEqual(r2.p50);
    expect(r1.ruinProb).toBe(r2.ruinProb);
    expect(r1.p90streak).toBe(r2.p90streak);
  });

  test('배열 길이 변경 → seed 변경 → 결과 다름', () => {
    const r1 = computeSimulation(mixedBets, baseConfig);                      // 100건
    const r2 = computeSimulation(mixedBets.slice(0, 60), baseConfig);         // 60건
    // STEPS가 달라지므로 p50 길이부터 다름
    expect(r1.STEPS).not.toBe(r2.STEPS);
  });
});


// ── simGrade 적용 ──────────────────────────────────────────────
describe('simGrade', () => {
  test('simGrade.mult 적용 → simMult 반환값 일치', () => {
    const grade = { letter: 'A', mult: 1.2 };
    const r = computeSimulation(mixedBets, { ...baseConfig, simGrade: grade });
    expect(r.simMult).toBe(1.2);
    expect(r.useRecent).toBe(false); // A등급 → 최근 30건 아님
  });

  test('simGrade.letter C → useRecent=true (최근 30건 풀 사용)', () => {
    const grade = { letter: 'C', mult: 0.8 };
    const r = computeSimulation(mixedBets, { ...baseConfig, simGrade: grade });
    expect(r.useRecent).toBe(true);
  });

  test('simGrade=null → simMult=1.0, useRecent=false (boolean 보장)', () => {
    const r = computeSimulation(mixedBets, { ...baseConfig, simGrade: null });
    expect(r.simMult).toBe(1.0);
    expect(r.useRecent).toBe(false);          // Boolean 강제 — null 아닌 false
    expect(typeof r.useRecent).toBe('boolean');
  });
});


// ── goalTarget=0 (목표 없음) ───────────────────────────────────
describe('goalTarget=0', () => {
  test('medGoal=null (목표 미설정 시 도달 측정 안 함)', () => {
    const r = computeSimulation(mixedBets, { ...baseConfig, goalTarget: 0 });
    expect(r.medGoal).toBeNull();
  });
});


// ── percentile 배열 길이 검증 ─────────────────────────────────
describe('percentile 배열 길이', () => {
  test('p50 길이 == STEPS + 1', () => {
    const r = computeSimulation(mixedBets, baseConfig);
    expect(r.p50).toHaveLength(r.STEPS + 1);
    expect(r.p10).toHaveLength(r.STEPS + 1);
    expect(r.p90).toHaveLength(r.STEPS + 1);
  });

  test('labels 길이 == STEPS + 1', () => {
    const r = computeSimulation(mixedBets, baseConfig);
    expect(r.labels).toHaveLength(r.STEPS + 1);
    expect(r.labels[0]).toBe('시작');
  });
});
