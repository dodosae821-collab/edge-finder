// kbo_f5.test.js — KBO F5 프로토콜 앱 계층 (스냅샷 계약·판정·미결 연결·성적표)
const vm = require('vm');
const fs = require('fs');
const path = require('path');

let _bets = [], _store = {};
const sandbox = {
  window, document, console, navigator: window.navigator, localStorage: window.localStorage,
  setTimeout: (fn)=>{fn();return 0;}, clearTimeout: ()=>{}, setInterval, clearInterval,
  Math, Date, JSON, parseInt, parseFloat, isNaN, isFinite, Number, String, Boolean, Array, Object, Set, Map, RegExp, Error,
  alert: () => { sandbox._lastAlert = arguments; }, confirm: () => true,
  getBets: () => _bets, saveBets: (n)=>{ _bets=n.map(b=>({...b})); return _bets; },
  simToast: () => {},
  Storage: {
    setJSON:(k,v)=>{_store[k]=JSON.stringify(v);}, getJSON:(k,d)=>(k in _store?JSON.parse(_store[k]):d),
    remove:(k)=>{delete _store[k];},
  },
  KEYS: { KBO_SNAPSHOT: 'kbo' },
  _round: null,
  attachRoundToBet: (b) => { if (sandbox._round) b.roundId = sandbox._round.id; return b; },
  applyRoundBet: (amt) => { if (sandbox._round) sandbox._round.remaining -= amt; },
};
sandbox.alert = (m)=>{ sandbox._lastAlert = m; };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname,'kbo_f5.js'),'utf8'), sandbox, { filename:'kbo_f5.js' });
const S = sandbox;

const SNAP = {
  schema_version: 1, model_version: 'C+SC-2step v1 (L-36/L-37)',
  generated_at: new Date().toISOString().slice(0,16).replace('T',' '),
  data_through: '2026-07-05', thr: 1.10, breakeven_pct: 56.8,
  model_health: { C_n:224, C_under:62.1, C_res:-0.576, non_worsen_n:148, non_worsen_under:67.6,
                  non_worsen_res:-0.932, worsen_n:64, worsen_under:46.9, worsen_res:0.422,
                  ttest_p:0.000963, cohens_d:0.501, below_pct:83.9, weaken_streak:1 },
  limits: ['후보군 생성기이지 베팅 신호가 아님 (L-36)'],
  pitchers: [
    { pitcher:'후라도', team:'SAMSUNG', type:'C', state_change:'non_worsen', candidate:true,
      reason:'언더 후보군 (후보일 뿐, 최종판단 별도)', delta_whip:1.021, delta_h_ip:1.033, last_start:'2026-07-01' },
    { pitcher:'금지투수', team:'LG', type:'C', state_change:'worsen', candidate:false,
      reason:'언더 신호 무효화 (베팅 금지 영역)', delta_whip:1.25, delta_h_ip:1.31, last_start:'2026-07-02' },
    { pitcher:'에이형', team:'KT', type:'A', state_change:null, candidate:false,
      reason:'A형 — 프로토콜 대상 아님', delta_whip:null, delta_h_ip:null, last_start:'2026-07-03' },
  ],
};

beforeEach(() => {
  _bets = []; _store = {};
  document.body.innerHTML = `<div id="kbo-f5-body"></div>`;
});

describe('KBO F5 앱 계층', () => {

  test('스냅샷 저장·렌더: 모델 건강 + 후보 칩 + 약화 카운터 표시', () => {
    expect(S.kboSaveSnapshotText(JSON.stringify(SNAP))).toBe(true);
    S.renderKboF5();
    const html = document.getElementById('kbo-f5-body').innerHTML;
    expect(html).toContain('67.6');            // 후보조합 언더율
    expect(html).toContain('0.501');           // Cohen's d
    expect(html).toContain('1회');             // 약화 연속
    expect(html).toContain('후라도');          // 후보 칩
    expect(html).not.toContain('금지투수 <span'); // 금지 투수는 후보 칩에 없음
    expect(html).toContain('후보군 생성기');   // L-36 한계 문구 박제
  });

  test('스키마 가드: 지원보다 새 schema_version은 거부', () => {
    const bad = { ...SNAP, schema_version: 99 };
    expect(S.kboSaveSnapshotText(JSON.stringify(bad))).toBe(false);
    expect(S.kboGetSnapshot()).toBeNull();
  });

  test('판정: 후보/금지/대상아님 3분류 렌더', () => {
    S.kboSaveSnapshotText(JSON.stringify(SNAP));
    S.renderKboF5();
    const set = (n)=>{ document.getElementById('kbo-pitcher-input').value = n; S.kboLookup(); };
    set('후라도');
    expect(document.getElementById('kbo-verdict').innerHTML).toContain('언더 후보군');
    expect(document.getElementById('kbo-verdict').innerHTML).toContain('미결 등록');
    set('금지투수');
    expect(document.getElementById('kbo-verdict').innerHTML).toContain('베팅 금지');
    expect(document.getElementById('kbo-verdict').innerHTML).not.toContain('미결 등록');
    set('에이형');
    expect(document.getElementById('kbo-verdict').innerHTML).toContain('대상 아님');
    set('없는투수');
    expect(document.getElementById('kbo-verdict').innerHTML).toContain('스냅샷에 없는 투수');
  });

  test('미결 등록: PENDING 레코드 계약 (source·kboMeta·isSim:false·myProb 공란)', () => {
    S.kboSaveSnapshotText(JSON.stringify(SNAP));
    S.renderKboF5();
    document.getElementById('kbo-pitcher-input').value = '후라도'; S.kboLookup();
    document.getElementById('kbo-bet-line').value = '4.5';
    document.getElementById('kbo-bet-odds').value = '1.76';
    document.getElementById('kbo-bet-amt').value = '10000';
    S.kboRegisterPending('후라도');
    expect(_bets.length).toBe(1);
    const r = _bets[0];
    expect(r.result).toBe('PENDING');
    expect(r.isSim).toBe(false);
    expect(r.source).toBe('kbo_f5');
    expect(r.sport).toBe('KBO');
    expect(r.type).toBe('언/옵');
    expect(r.betmanOdds).toBe(1.76);
    expect(r.myProb).toBeNull();               // 정직성: 개별 확률 아님 → 공란
    expect(r.kboMeta.pitcher).toBe('후라도');
    expect(r.kboMeta.line).toBe(4.5);
    expect(r.game).toContain('F5 4.5 언더');
  });

  test('미결 등록: 활성 회차 있으면 roundId 부여 + 예산 차감', () => {
    S._round = { id: 'R9', remaining: 50000 };
    S.kboSaveSnapshotText(JSON.stringify(SNAP));
    S.renderKboF5();
    document.getElementById('kbo-pitcher-input').value = '후라도'; S.kboLookup();
    document.getElementById('kbo-bet-line').value = '4.5';
    document.getElementById('kbo-bet-odds').value = '1.76';
    document.getElementById('kbo-bet-amt').value = '10000';
    S.kboRegisterPending('후라도');
    expect(_bets[0].roundId).toBe('R9');
    expect(S._round.remaining).toBe(40000);
    S._round = null;
  });

  test('성적표: 확정 결과 집계 (적중률·손익·미결)', () => {
    S.kboSaveSnapshotText(JSON.stringify(SNAP));
    _bets = [
      { source:'kbo_f5', isSim:false, result:'WIN',  profit: 7600 },
      { source:'kbo_f5', isSim:false, result:'WIN',  profit: 7600 },
      { source:'kbo_f5', isSim:false, result:'LOSE', profit: -10000 },
      { source:'kbo_f5', isSim:false, result:'PENDING', profit: 0 },
      { source:'strategy', isSim:false, result:'WIN', profit: 99999 },  // 다른 소스 — 제외
    ];
    const st = S.kboProtocolStats();
    expect(st.total).toBe(4);
    expect(st.pending).toBe(1);
    expect(st.done).toBe(3);
    expect(st.winPct).toBeCloseTo(66.67, 1);
    expect(st.profit).toBe(5200);
    S.renderKboF5();
    const html = document.getElementById('kbo-f5-body').innerHTML;
    expect(html).toContain('66.7');
    expect(html).toContain('30건 넘기 전엔');  // 소표본 경고
  });
});
