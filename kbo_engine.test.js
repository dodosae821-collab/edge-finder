// kbo_engine.test.js — 골든 테스트: JS 엔진 ≡ 파이썬 kbo_refresh.py
//   픽스처(kbo_fixture.json) = 실제 kbo.db·언옵·프로파일 + 파이썬이 계산한 기대값.
//   숫자가 하나라도 어긋나면 구현 드리프트 — 이 테스트가 배포 게이트.
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const sandbox = { console, Math, Number, String, Boolean, Array, Object, Set, Map, JSON, isNaN, isFinite, parseFloat, parseInt, Date, RegExp, Error };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'kbo_engine.js'), 'utf8'), sandbox, { filename: 'kbo_engine.js' });

const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'kbo_fixture.json'), 'utf8'));

describe('KBO 엔진 골든 테스트 (파이썬 v5 동치)', () => {
  let snap;
  beforeAll(() => {
    snap = sandbox.kboBuildSnapshotFromDb({
      pitcher_log: FX.pitcher_log,
      inning_score: FX.inning_score,
      traj: FX.traj,
      profile_csv: FX.profile_csv,
      unop_files: FX.unop_files,
    });
  });

  test('games 재구성: N=430, data_through=2026-07-05', () => {
    expect(snap.n_games).toBe(430);
    expect(snap.data_through).toBe(FX.expected.data_through);
  });

  test('Layer3 C형: N·언더율·res 일치', () => {
    const e = FX.expected.metrics, m = snap.model_health;
    expect(m.C_n).toBe(e.C_n);
    expect(m.C_under).toBeCloseTo(e.C_under, 1);
    expect(m.C_res).toBeCloseTo(e.C_res, 3);
  });

  test('Layer1 below 비율 일치', () => {
    expect(snap.model_health.below_pct).toBeCloseTo(FX.expected.metrics.below_pct, 1);
  });

  test('Layer2 worsen/non_worsen: N·언더율·res 일치', () => {
    const e = FX.expected.metrics, m = snap.model_health;
    expect(m.worsen_n).toBe(e.worsen_n);
    expect(m.non_worsen_n).toBe(e.non_worsen_n);
    expect(m.worsen_under).toBeCloseTo(e.worsen_under, 1);
    expect(m.non_worsen_under).toBeCloseTo(e.non_worsen_under, 1);
    expect(m.worsen_res).toBeCloseTo(e.worsen_res, 3);
    expect(m.non_worsen_res).toBeCloseTo(e.non_worsen_res, 3);
  });

  test('통계량: t-test p·Cohen\'s d 일치 (scipy 동치)', () => {
    const e = FX.expected.metrics, m = snap.model_health;
    expect(m.cohens_d).toBeCloseTo(e.cohens_d, 3);
    expect(Math.abs(m.ttest_p - e.ttest_p)).toBeLessThan(1e-5);
  });

  test('후보 명단: 파이썬과 동일 (16명, 후라도 포함)', () => {
    const cands = snap.pitchers.filter(p => p.candidate).map(p => p.pitcher).sort();
    expect(cands).toEqual(FX.expected.candidates);
    expect(snap.pitchers.length).toBe(FX.expected.n_pitchers);
  });

  test('개별 판정 스팟체크: 후라도 델타값 일치', () => {
    const h = snap.pitchers.find(p => p.pitcher === '후라도');
    expect(h.type).toBe('C');
    expect(h.state_change).toBe('non_worsen');
    expect(h.delta_whip).toBeCloseTo(1.021, 3);
    expect(h.delta_h_ip).toBeCloseTo(1.033, 3);
    expect(h.last_start).toBe('2026-07-01');
  });
});
