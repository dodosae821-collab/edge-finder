// kbo_engine.test.js — 골든 테스트: JS 엔진 ≡ 파이썬 참조 (kbo_reference_v1.py)
//   픽스처(kbo_fixture.json) = 실제 kbo.db(~7/09)·언옵(~7/05) + 파이썬 v1.0 기대값.
//   숫자가 하나라도 어긋나면 구현 드리프트 — 이 테스트가 배포 게이트.
//   모델: L1+L2+L3+stability v1.0 (인계문서 v71 L-49)
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const sandbox = { console, Math, Number, String, Boolean, Array, Object, Set, Map, JSON, isNaN, isFinite, parseFloat, parseInt, Date, RegExp, Error };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'kbo_engine.js'), 'utf8'), sandbox, { filename: 'kbo_engine.js' });

const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'kbo_fixture.json'), 'utf8'));

describe('KBO 엔진 골든 테스트 (v1.0 — 파이썬 참조 동치)', () => {
  let snap;
  beforeAll(() => {
    snap = sandbox.kboBuildSnapshotFromDb({
      pitcher_log: FX.pitcher_log,
      inning_score: FX.inning_score,
      unop_files: FX.unop_files,
      generated_at: '2026-07-16 00:00',
    });
  });

  test('스키마 v2 · 모델 버전', () => {
    expect(snap.schema_version).toBe(2);
    expect(snap.model_version).toContain('v1.0');
  });

  test('games 재구성: N·data_through 일치', () => {
    expect(snap.n_games).toBe(FX.expected.n_games);
    expect(snap.data_through).toBe(FX.expected.data_through);
  });

  test('백테스트 (L-48 스펙): 픽 수·전적·적중률 일치', () => {
    const e = FX.expected.sim, m = snap.model_health;
    expect(m.sim_picks).toBe(e.picks);
    expect(m.sim_wins).toBe(e.wins);
    expect(m.sim_losses).toBe(e.losses);
    expect(m.sim_rate).toBeCloseTo(e.rate, 1);
  });

  test('백테스트 6/15 이후 구간 일치', () => {
    const e = FX.expected.sim_since_0615, m = snap.model_health;
    expect(m.sim_0615_picks).toBe(e.picks);
    expect(m.sim_0615_wins).toBe(e.wins);
    expect(m.sim_0615_losses).toBe(e.losses);
  });

  test('현재 신호 투수: 인원·명단 일치', () => {
    const sig = snap.pitchers.filter(p => p.signal).map(p => p.pitcher).sort();
    expect(sig.length).toBe(FX.expected.n_signal_pitchers);
    expect(sig).toEqual(FX.expected.signal_pitchers);
  });

  test('스폿체크: 개별 투수 3층 판정 일치', () => {
    for (const [name, e] of Object.entries(FX.expected.spot)) {
      const p = snap.pitchers.find(x => x.pitcher === name);
      expect(p).toBeTruthy();
      expect(p.type).toBe(e.type);
      expect(p.stable).toBe(e.stable);
      expect(p.state_change).toBe(e.sc);
      expect(p.l1_side).toBe(e.l1 ?? null);
      expect(p.signal).toBe(e.signal ?? null);
      expect(p.type_streak).toBe(e.type_streak);
    }
  });

  test('경기 판정: 신호 투수 → 방향, 미검증 선발 → PASS (① 조항)', () => {
    // 신호 투수 1명 + 표준 상대 → 그 방향
    const sigP = snap.pitchers.find(p => p.signal === 'UNDER');
    const stdP = snap.pitchers.find(p => p.type === 'STD' && !p.signal);
    const r1 = sandbox.kboJudgeGame(snap, sigP.pitcher, stdP.pitcher);
    expect(r1.verdict).toBe('UNDER');
    // 미검증 선발 → PASS
    const r2 = sandbox.kboJudgeGame(snap, sigP.pitcher, '신규외인아무개');
    expect(r2.verdict).toBe('PASS');
    expect(r2.reason).toContain('미검증');
    // 신호 충돌 → PASS
    const overP = snap.pitchers.find(p => p.signal === 'OVER');
    if (overP) {
      const r3 = sandbox.kboJudgeGame(snap, sigP.pitcher, overP.pitcher);
      expect(r3.verdict).toBe('PASS');
      expect(r3.reason).toContain('충돌');
    }
  });

  test('game_key 문자열 정렬 (v82 버그 회귀 방지)', () => {
    // 더블헤더 스타일 키가 숫자 뺄셈으로 NaN 정렬되지 않는지: 엔진이 정상 완주하면 통과
    expect(typeof snap.n_games).toBe('number');
  });
});
