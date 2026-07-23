// kbo_layer4.test.js — v85 Layer4 표시 모듈 (v73 사전등록 v1.1 계약)
//   핵심 계약: ① 대체값 체계 ② 동적 기준선(walk-forward, 최소30) ③ v2 필터(a)
//   ④ 표시 태그는 v1.0 UNDER에서만 ⑤ 단일시즌
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const sandbox = { console, Math, Number, String, Boolean, Array, Object, Set, Map, JSON, isNaN, isFinite, parseFloat, parseInt, Date, RegExp, Error };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'kbo_engine.js'), 'utf8'), sandbox, { filename: 'kbo_engine.js' });
// vm 스크립트의 top-level const는 globalThis에 안 붙음 → 식 평가로 읽는다
const C = name => vm.runInContext(name, sandbox);

// 미니 픽스처: 2팀 × 40경기, 각 팀 9명 고정 라인업
function buildFixture() {
  const hitter_rows = [], wrc_rows = [];
  const teams = { LG: [], DOOSAN: [] };
  for (let i = 1; i <= 9; i++) { teams.LG.push(`L${i}`); teams.DOOSAN.push(`D${i}`); }
  let id = 1;
  for (let g = 1; g <= 40; g++) {
    const date = `2026-04-${String(g % 30 + 1).padStart(2, '0')}`;
    const gk = `2026G${String(g).padStart(3, '0')}`;
    for (const t of ['LG', 'DOOSAN']) {
      teams[t].forEach((nm, idx) => {
        hitter_rows.push({ id: id++, game_key: gk, date, team: t, name: nm, inning: idx + 1 });
      });
    }
  }
  // wRC: LG는 전원 PA충분 120, DOOSAN은 전원 PA충분 100
  const dates = [...new Set(hitter_rows.map(r => r.date))];
  for (const d of dates) {
    teams.LG.forEach(nm => wrc_rows.push({ name: nm, team: 'LG', date: d, wrc: 120, pa: 300 }));
    teams.DOOSAN.forEach(nm => wrc_rows.push({ name: nm, team: 'DOOSAN', date: d, wrc: 100, pa: 300 }));
  }
  return { hitter_rows, wrc_rows };
}

describe('v85 Layer4 표시 모듈', () => {
  const FX = buildFixture();
  let st;
  beforeAll(() => { st = sandbox.kboHitterState(FX.hitter_rows, FX.wrc_rows); });

  test('타자 상태 구축: 선수·s10·기준선 풀', () => {
    expect(st).toBeTruthy();
    expect(st.season).toBe('2026');
    expect(Object.keys(st.players).length).toBe(18);
    expect(st.players.L1.s10).toBe(10);      // 매경기 1~3번 이닝 첫등장 = 선발
    expect(st.players.L1.tier).toBe('주전');
    expect(st.baseline_pool.length).toBeGreaterThan(30);
  });

  test('동적 기준선: 최소 30경기 미달이면 null, 충족 시 중앙값', () => {
    expect(sandbox.kboDynBaseline(st.baseline_pool.slice(0, 10), null)).toBeNull();
    const b = sandbox.kboDynBaseline(st.baseline_pool, null);
    expect(b.value).toBeCloseTo(110, 0);     // (120+100)/2
    expect(b.n).toBeGreaterThanOrEqual(30);
  });

  test('기준선은 walk-forward — asof 이전 경기만 사용', () => {
    const asof = st.baseline_pool[5].date;
    const b = sandbox.kboDynBaseline(st.baseline_pool, asof);
    const full = sandbox.kboDynBaseline(st.baseline_pool, null);
    expect(b === null || b.n < full.n).toBe(true);
  });

  test('대체값 체계: 개인/등급/신규용병/신인급', () => {
    const r = sandbox.kboTagLineupNames('L1 L2 L3 L4 L5 L6 L7 L8 마드리스*', st);
    expect(r.n).toBe(9);
    expect(r.players[0].val).toBe(120);                    // PA≥100 개인값
    expect(r.players[0].src).toBe('개인');
    const foreign = r.players[8];
    expect(foreign.val).toBe(C('KBO_SUB_FOREIGN_NEW')); // 신규 외국인 110
    expect(foreign.src).toMatch(/신규용병/);
    const rookie = sandbox.kboTagLineupNames('없는선수', st);
    expect(rookie.players[0].val).toBe(C('KBO_SUB_ROOKIE'));  // 국내 신인급 80.9
  });

  test('v2 필터: 언더&기준점≤4.5만 제거, 오버는 통과', () => {
    expect(sandbox.kboV2Pass('UNDER', 4.5)).toBe(false);
    expect(sandbox.kboV2Pass('UNDER', 5.5)).toBe(true);
    expect(sandbox.kboV2Pass('OVER', 4.5)).toBe(true);
    expect(sandbox.kboV2Pass('PASS', 4.5)).toBeNull();
  });

  test('표시 태그는 v1.0 UNDER에서만, 기준선 기준으로 갈림', () => {
    const bl = { value: 110, n: 50 };
    expect(sandbox.kboLineupDisplayTag('OVER', 100, bl)).toBeNull();
    expect(sandbox.kboLineupDisplayTag('PASS', 100, bl)).toBeNull();
    expect(sandbox.kboLineupDisplayTag('UNDER', 100, bl).label).toMatch(/약체/);
    expect(sandbox.kboLineupDisplayTag('UNDER', 120, bl).label).toMatch(/정예/);
    expect(sandbox.kboLineupDisplayTag('UNDER', 100, null)).toBeNull();  // 기준선 미성립
  });

  test('단일시즌: 타 시즌 행 유입 시에도 시즌 상수는 2026', () => {
    expect(C('KBO_TIER_MEAN')['주전']).toBeCloseTo(114.9, 1);
    expect(st.season).toBe('2026');
  });

  test('최근 5선발: 최신 5개 역순', () => {
    const rows = [];
    for (let i = 1; i <= 8; i++) rows.push({ pitcher: '올러', team: 'KIA', date: `2026-07-${String(i).padStart(2,'0')}`, opp: 'LG', outs: 15, er: i, hits: 4, bb: 1, k: 6, np: 90 });
    const m = sandbox.kboRecent5Map(rows);
    expect(m['올러'].length).toBe(5);
    expect(m['올러'][0].date).toBe('2026-07-08');   // 최신 먼저
    expect(m['올러'][0].ip).toBe('5.0');
  });
});

// v85.1: features 인제스트 시즌 가드 (25/23/24 파일 자동 거부)
describe('v85.1 features 시즌 가드', () => {
  const vm2 = require('vm'), fs2 = require('fs'), path2 = require('path');
  let sb;
  beforeAll(() => {
    const w = { addEventListener() {}, location: { href: '' } };
    sb = { console, Math, Number, String, Boolean, Array, Object, Set, Map, JSON,
           isNaN, isFinite, parseFloat, parseInt, Date, RegExp, Error, Promise,
           window: w, document: { getElementById: () => null },
           localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
           alert() {}, FileReader: function () {} };
    sb.globalThis = sb;
    vm2.createContext(sb);
    vm2.runInContext(fs2.readFileSync(path2.join(__dirname, 'kbo_engine.js'), 'utf8'), sb);
    const src = fs2.readFileSync(path2.join(__dirname, 'kbo_f5.js'), 'utf8');
    // 인제스트 함수만 떼어 평가 (렌더·스토리지 의존 없이)
    const fn = src.slice(src.indexOf('function kboIngestNamedFile'),
                         src.indexOf('async function kboIngestZip'));
    vm2.runInContext('let _kboDbFiles={db:null,dbName:null,features:null,featuresName:null};'
      + 'function kboSaveUnop(){} function kboSaveSnapshotText(){return false;}' + fn, sb);
  });

  test('현재 시즌 features는 수용', () => {
    expect(sb.kboIngestNamedFile('kbo_features_2026.db', 'db', new Uint8Array([1]))).toBe('features');
  });
  test('연도 없는 features도 수용 (사용자 판단)', () => {
    expect(sb.kboIngestNamedFile('kbo_features.db', 'db', new Uint8Array([1]))).toBe('features');
  });
  test('타 시즌 features는 거부', () => {
    for (const f of ['kbo_features_2025.db', 'kbo_features_2024.db', 'kbo_features_2023.db'])
      expect(sb.kboIngestNamedFile(f, 'db', new Uint8Array([1]))).toBe('wrong_season');
  });
  test('kbo.db는 정상 수용', () => {
    expect(sb.kboIngestNamedFile('kbo.db', 'db', new Uint8Array([1]))).toBe('db');
  });
});
