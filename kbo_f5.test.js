// kbo_f5.test.js — KBO F5 앱 계층 v83 (스키마 v2 · 경기 판정 · 이중 원장)
const vm = require('vm');
const fs = require('fs');
const path = require('path');

let _bets = [], _store = {};
const sandbox = {
  window, document, console, navigator: window.navigator, localStorage: window.localStorage,
  setTimeout: (fn)=>{fn();return 0;}, clearTimeout: ()=>{}, setInterval, clearInterval,
  Math, Date, JSON, parseInt, parseFloat, isNaN, isFinite, Number, String, Boolean, Array, Object, Set, Map, RegExp, Error, Promise, FileReader: function(){},
  alert: (m) => { sandbox._lastAlert = m; }, confirm: () => true,
  getBets: () => _bets, saveBets: (n)=>{ _bets=n.map(b=>({...b})); return _bets; },
  simToast: () => {},
  Storage: {
    setJSON:(k,v)=>{_store[k]=JSON.stringify(v);}, getJSON:(k,d)=>(k in _store?JSON.parse(_store[k]):d),
    remove:(k)=>{delete _store[k];},
  },
  KEYS: { KBO_SNAPSHOT: 'kbo', KBO_REVAL_LOG: 'krl', KBO_UNOPS: 'kuo' },
  _round: null,
  attachRoundToBet: (b) => { if (sandbox._round) b.roundId = sandbox._round.id; return b; },
  applyRoundBet: (amt) => { if (sandbox._round) sandbox._round.remaining -= amt; },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
// 엔진(kboJudgeGame) + 앱 계층 로드
vm.runInContext(fs.readFileSync(path.join(__dirname,'kbo_engine.js'),'utf8'), sandbox, { filename:'kbo_engine.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname,'kbo_f5.js'),'utf8'), sandbox, { filename:'kbo_f5.js' });
const S = sandbox;

// v2 스냅샷 목업 — 신호/무신호/미검증/오버 4종
const SNAP = {
  schema_version: 2, model_version: 'L1+L2+L3+stability v1.0 (v71 L-49)',
  generated_at: new Date().toISOString().slice(0,16).replace('T',' '),
  data_through: '2026-07-05', log_through: '2026-07-09',
  thr: 1.10, bb9_cutoff: 4.32, ref_breakeven_pct: 56.8,
  model_health: { sim_picks:68, sim_wins:40, sim_losses:28, sim_rate:58.8,
                  sim_0615_picks:29, sim_0615_wins:17, sim_0615_losses:12 },
  limits: ['후보군 생성기이지 확정 신호가 아님 (L-36)', '공식 판독은 시즌 종료 시 1회 (v71 L-49)'],
  n_games: 430,
  pitchers: [
    { pitcher:'후라도', team:'SAMSUNG', type:'C', type_prev:'C', stable:true, state_change:'non_worsen',
      l1_side:'below', signal:'UNDER', reason:'C형 안정 + non_worsen + below — 언더 신호',
      n_prior:16, type_streak:8, delta_whip:1.021, delta_h_ip:1.033, last_start:'2026-07-01' },
    { pitcher:'워슨투수', team:'LG', type:'C', type_prev:'C', stable:true, state_change:'worsen',
      l1_side:'below', signal:null, reason:'C형 안정이나 worsen — 신호 무효',
      n_prior:12, type_streak:5, delta_whip:1.25, delta_h_ip:1.31, last_start:'2026-07-02' },
    { pitcher:'에이형', team:'KT', type:'A', type_prev:'A', stable:true, state_change:'non_worsen',
      l1_side:'above', signal:'OVER', reason:'A형 안정 + above — 오버 신호',
      n_prior:11, type_streak:6, delta_whip:1.02, delta_h_ip:1.01, last_start:'2026-07-03' },
    { pitcher:'표준맨', team:'NC', type:'STD', type_prev:'STD', stable:true, state_change:'non_worsen',
      l1_side:'below', signal:null, reason:'표준 유형 — 프로토콜 대상 아님',
      n_prior:14, type_streak:9, delta_whip:1.0, delta_h_ip:1.0, last_start:'2026-07-04' },
    { pitcher:'신인미검증', team:'SSG', type:'?', type_prev:'?', stable:false, state_change:null,
      l1_side:null, signal:null, reason:'유형 판정 불가 (사전 언옵 N=2 < 5) — 미검증 선발',
      n_prior:2, type_streak:0, delta_whip:null, delta_h_ip:null, last_start:'2026-07-05' },
  ],
};

beforeEach(() => {
  _bets = []; _store = {}; sandbox._lastAlert = null; sandbox._round = null;
  document.body.innerHTML = `<div id="kbo-f5-body"></div>`;
});

describe('KBO F5 앱 계층 v83 (스키마 v2)', () => {

  test('스냅샷 저장·렌더: 백테스트 전적 + 신호 칩 + 규율 문구', () => {
    expect(S.kboSaveSnapshotText(JSON.stringify(SNAP))).toBe(true);
    S.renderKboF5();
    const html = document.getElementById('kbo-f5-body').innerHTML;
    expect(html).toContain('40-28');           // 백테스트 전적
    expect(html).toContain('17-12');           // 6/15 이후
    expect(html).toContain('후라도');          // 신호 칩
    expect(html).toContain('에이형');          // 오버 신호 칩
    expect(html).not.toContain('워슨투수 U');  // worsen은 신호 칩 아님
    expect(html).toContain('시즌 종료 시 1회'); // L-49 문구 박제
    expect(html).toContain('이중 원장');        // L-52
  });

  test('스키마 가드: 구버전(v1)·미래버전 모두 거부', () => {
    const v1 = { ...SNAP, schema_version: 1 };
    expect(S.kboSaveSnapshotText(JSON.stringify(v1))).toBe(false);
    expect(String(S._lastAlert)).toContain('재계산');
    const v99 = { ...SNAP, schema_version: 99 };
    expect(S.kboSaveSnapshotText(JSON.stringify(v99))).toBe(false);
    expect(S.kboGetSnapshot()).toBeNull();
  });

  test('투수 조회: 3층 배지 + 신호/무효/미검증 렌더', () => {
    S.kboSaveSnapshotText(JSON.stringify(SNAP));
    S.renderKboF5();
    const set = (n)=>{ document.getElementById('kbo-pitcher-input').value = n; S.kboLookup(); };
    set('후라도');
    let h = document.getElementById('kbo-verdict').innerHTML;
    expect(h).toContain('언더 신호');
    expect(h).toContain('L3 C형 안정');
    expect(h).toContain('L1 below');
    expect(h).toContain('C형 연속 8회 판정');   // 멤버십 스트릭 표시 (v84)
    set('워슨투수');
    h = document.getElementById('kbo-verdict').innerHTML;
    expect(h).toContain('worsen — 신호 무효');
    set('신인미검증');
    h = document.getElementById('kbo-verdict').innerHTML;
    expect(h).toContain('미검증 선발');
    set('아예없는사람');
    expect(document.getElementById('kbo-verdict').innerHTML).toContain('데이터에 없는 투수');
  });

  test('경기 판정: 신호→방향 / 미검증 포함→PASS(① 조항) / 충돌→PASS', () => {
    S.kboSaveSnapshotText(JSON.stringify(SNAP));
    S.renderKboF5();
    const judge = (h,a,line,ou,oo) => {
      document.getElementById('kbo-g-home').value = h;
      document.getElementById('kbo-g-away').value = a;
      document.getElementById('kbo-g-line').value = line;
      document.getElementById('kbo-g-odds-u').value = ou;
      document.getElementById('kbo-g-odds-o').value = oo;
      S.kboJudgeGameUi();
      return document.getElementById('kbo-game-verdict').innerHTML;
    };
    // 신호 투수 + 표준 → UNDER + 픽별 손익분기(1/1.66=60.2%)
    let h = judge('후라도','표준맨','5.5','1.66','1.87');
    expect(h).toContain('UNDER');
    expect(h).toContain('60.2%');
    expect(h).toContain('시스템 원장 등록');
    // 미검증 선발 포함 → PASS + 감독자 원장 안내
    h = judge('신인미검증','후라도','5.5','1.58','1.99');
    expect(h).toContain('PASS');
    expect(h).toContain('미검증');
    expect(h).toContain('감독자 원장 등록');
    // 언더·오버 충돌 → PASS
    h = judge('후라도','에이형','4.5','1.7','1.8');
    expect(h).toContain('PASS');
    expect(h).toContain('충돌');
  });

  test('시스템 원장 등록: PENDING 레코드 계약 (ledger·odds·breakeven 메모)', () => {
    S.kboSaveSnapshotText(JSON.stringify(SNAP));
    S.renderKboF5();
    document.getElementById('kbo-g-home').value = '후라도';
    document.getElementById('kbo-g-away').value = '표준맨';
    document.getElementById('kbo-g-line').value = '5.5';
    document.getElementById('kbo-g-odds-u').value = '1.66';
    document.getElementById('kbo-g-odds-o').value = '1.87';
    S.kboJudgeGameUi();
    document.getElementById('kbo-g-amt').value = '10000';
    S.kboRegisterSystemBet();
    expect(_bets.length).toBe(1);
    const r = _bets[0];
    expect(r.result).toBe('PENDING');
    expect(r.isSim).toBe(false);
    expect(r.source).toBe('kbo_f5');
    expect(r.sport).toBe('KBO');
    expect(r.betmanOdds).toBe(1.66);
    expect(r.myProb).toBeNull();
    expect(r.kboMeta.ledger).toBe('system');
    expect(r.kboMeta.verdict).toBe('UNDER');
    expect(r.kboMeta.line).toBe(5.5);
    expect(r.game).toContain('F5 5.5 언더');
    expect(r.memo).toContain('60.2%');         // 픽별 손익분기 박제
  });

  test('감독자 원장 등록: PASS 경기의 재량 픽 (ledger=supervisor)', () => {
    S.kboSaveSnapshotText(JSON.stringify(SNAP));
    S.renderKboF5();
    document.getElementById('kbo-g-home').value = '신인미검증';
    document.getElementById('kbo-g-away').value = '후라도';
    document.getElementById('kbo-g-line').value = '5.5';
    document.getElementById('kbo-g-odds-u').value = '1.58';
    document.getElementById('kbo-g-odds-o').value = '1.99';
    S.kboJudgeGameUi();
    document.getElementById('kbo-s-dir').value = 'UNDER';
    document.getElementById('kbo-s-odds').value = '1.58';
    document.getElementById('kbo-s-amt').value = '10000';
    S.kboRegisterSupervisorBet();
    expect(_bets.length).toBe(1);
    expect(_bets[0].kboMeta.ledger).toBe('supervisor');
    expect(_bets[0].memo).toContain('재량 픽');
  });

  test('시스템 등록 가드: PASS 경기는 시스템 원장 등록 불가', () => {
    S.kboSaveSnapshotText(JSON.stringify(SNAP));
    S.renderKboF5();
    document.getElementById('kbo-g-home').value = '신인미검증';
    document.getElementById('kbo-g-away').value = '표준맨';
    document.getElementById('kbo-g-line').value = '4.5';
    document.getElementById('kbo-g-odds-u').value = '1.7';
    document.getElementById('kbo-g-odds-o').value = '1.8';
    S.kboJudgeGameUi();
    S.kboRegisterSystemBet();
    expect(_bets.length).toBe(0);
    expect(String(S._lastAlert)).toContain('신호');
  });

  test('회차 연동: roundId 부여 + 예산 차감 (기존 계약 유지)', () => {
    S._round = { id: 'R9', remaining: 50000 };
    S.kboSaveSnapshotText(JSON.stringify(SNAP));
    S.renderKboF5();
    document.getElementById('kbo-g-home').value = '후라도';
    document.getElementById('kbo-g-away').value = '표준맨';
    document.getElementById('kbo-g-line').value = '5.5';
    document.getElementById('kbo-g-odds-u').value = '1.66';
    document.getElementById('kbo-g-odds-o').value = '1.87';
    S.kboJudgeGameUi();
    document.getElementById('kbo-g-amt').value = '10000';
    S.kboRegisterSystemBet();
    expect(_bets[0].roundId).toBe('R9');
    expect(S._round.remaining).toBe(40000);
  });

  test('이중 원장 분리 집계: 구기록(ledger 없음)은 시스템 귀속', () => {
    S.kboSaveSnapshotText(JSON.stringify(SNAP));
    _bets = [
      { source:'kbo_f5', isSim:false, result:'WIN',  profit: 6600, kboMeta:{ ledger:'system' } },
      { source:'kbo_f5', isSim:false, result:'LOSE', profit: -10000, kboMeta:{ ledger:'system' } },
      { source:'kbo_f5', isSim:false, result:'WIN',  profit: 5800, kboMeta:{} },              // 구기록 → system
      { source:'kbo_f5', isSim:false, result:'WIN',  profit: 8000, kboMeta:{ ledger:'supervisor' } },
      { source:'kbo_f5', isSim:false, result:'PENDING', profit: 0, kboMeta:{ ledger:'supervisor' } },
      { source:'strategy', isSim:false, result:'WIN', profit: 99999 },                        // 타 소스 제외
    ];
    const sys = S.kboLedgerStats('system'), sup = S.kboLedgerStats('supervisor');
    expect(sys.done).toBe(3); expect(sys.win).toBe(2); expect(sys.profit).toBe(2400);
    expect(sup.total).toBe(2); expect(sup.pending).toBe(1); expect(sup.win).toBe(1);
    S.renderKboF5();
    const html = document.getElementById('kbo-f5-body').innerHTML;
    expect(html).toContain('시스템');
    expect(html).toContain('감독자');
  });

  test('언옵 영구 저장 (v84): txt는 한 번만 — 저장·목록·삭제·kbo.db 외 무시', () => {
    // txt 저장
    expect(S.kboIngestNamedFile('26시즌_7월_5이닝_언옵.txt', 'text', '07.16 SSG KIA 5.5')).toBe('unop');
    expect(S.kboIngestNamedFile('25년_언옵데이터.txt', 'text', '7.29 lg kt 4.5')).toBe('unop');
    expect(Object.keys(S.kboGetUnops()).length).toBe(2);
    // kbo.db만 수용, 나머지 db 무시
    expect(S.kboIngestNamedFile('kbo.db', 'db', new Uint8Array([1]))).toBe('db');
    expect(S.kboIngestNamedFile('kbo_2023.db', 'db', new Uint8Array([1]))).toBe('ignored');
    expect(S.kboIngestNamedFile('chronology_v2.db', 'db', new Uint8Array([1]))).toBe('ignored');
    // 렌더에 저장 목록 표시
    S.kboSaveSnapshotText(JSON.stringify(SNAP));
    S.renderKboF5();
    let html = document.getElementById('kbo-f5-body').innerHTML;
    expect(html).toContain('언옵 저장됨 ×2');
    expect(html).toContain('25년_언옵데이터.txt');
    // 삭제
    S.kboRemoveUnop('25년_언옵데이터.txt');
    expect(Object.keys(S.kboGetUnops()).length).toBe(1);
    html = document.getElementById('kbo-f5-body').innerHTML;
    expect(html).toContain('언옵 저장됨 ×1');
  });

  test('계산 이력 로그: 단순 기록 + 동일 데이터 스킵 (weaken 카운터 없음)', () => {
    const mk = (dt, n) => ({ data_through: dt, n_games: n, model_version:'v1.0',
      model_health:{ sim_picks:68, sim_wins:40, sim_losses:28, sim_rate:58.8 } });
    expect(S.kboRevalUpdate(mk('2026-07-05', 430))).toBe(1);
    expect(S.kboRevalUpdate(mk('2026-07-05', 430))).toBe(1);   // 동일 → 스킵
    expect(S.kboRevalUpdate(mk('2026-07-12', 455))).toBe(2);
    const log = JSON.parse(_store['krl']);
    expect(log.length).toBe(2);
    expect(log[1].sim.wins).toBe(40);
  });
});
