// sim_picker.test.js — 전략베팅 세부종목·유형 피커 통합 (jsdom)
// 검증(지시서):
//   1) B갈래 농구 이모지 → 팝업 NBA 선택 → 배지 "NBA"
//   2) 유형 팝업 핸디캡 선택 → hidden 저장
//   3) 홀딩 전송 레코드에 sport='NBA', type='핸디캡' 실림
//   + SPORT_CATS/TYPE_OPTIONS 재사용 확인 (복사본 아님)

const vm = require('vm');
const fs = require('fs');
const path = require('path');

let _bets = [];
const sandbox = {
  window, document, console, navigator: window.navigator, localStorage: window.localStorage,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Math, Date, JSON, parseInt, parseFloat, isNaN, isFinite, Number, String, Boolean, Array, Object, Set, Map, RegExp, Error,
  alert: () => {}, confirm: () => true, prompt: () => null,
  getBets: () => _bets,
  saveBets: (next) => { _bets = next.map(b => ({ ...b })); return _bets; },
  toProb: (pct) => { const n = Number(pct); return Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) / 100 : 0; },
  getCLVAdjustedProb: (p) => p,
  getDecisionSnapshot: (mp, od) => ({ myProb: mp, odds: od }),
  Storage: { setJSON(){}, getJSON:(k,d)=>d, set(){}, remove(){} }, KEYS: {},
  updateAll: () => {}, updatePreview: () => {}, updateLossRatio: () => {}, calcMultiEV: () => {}, calcEV: () => {},
};
sandbox.globalThis = sandbox;
sandbox.window.App = { _SS: { guardFactor: 1.0 } };
vm.createContext(sandbox);
const load = f => vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), sandbox, { filename: f });
load('ev.js');
load('bet_record.js');
load('tags_ui.js');     // SPORT_CATS, openSportPicker, selectSport, openSimTypePicker, selectSimType
load('simulator.js');   // simRenderJudge, simGetBranch, simTransmitPending

const S = sandbox;

const BODY = `
  <input id="sim-i-sv"><input id="sim-i-b2"><input id="sim-i-b3"><input id="sim-i-b4">
  <input id="sim-i-memo"><input id="sim-i-memo-b"><input id="sim-i-memo-c">
  <input type="radio" name="fa" id="sim-f-a1"><input type="radio" name="fa" id="sim-f-a2"><input type="radio" name="fa" id="sim-f-a3"><input type="radio" name="fa" id="sim-f-a4"><input type="radio" name="fa" id="sim-f-a5"><input type="radio" name="fa" id="sim-f-a6">
  <input type="radio" name="fb" id="sim-f-b1"><input type="radio" name="fb" id="sim-f-b2"><input type="radio" name="fb" id="sim-f-b3"><input type="radio" name="fb" id="sim-f-b4"><input type="radio" name="fb" id="sim-f-b5"><input type="radio" name="fb" id="sim-f-b6">
  <input type="radio" name="fc" id="sim-f-c1"><input type="radio" name="fc" id="sim-f-c2"><input type="radio" name="fc" id="sim-f-c3"><input type="radio" name="fc" id="sim-f-c4"><input type="radio" name="fc" id="sim-f-c5"><input type="radio" name="fc" id="sim-f-c6">
  <div id="sim-judge-a"></div><div id="sim-judge-b"></div><div id="sim-judge-c"></div>
  <div id="sport-picker-modal" style="display:none"><div id="sport-picker-title"></div><div id="sport-picker-btns"></div></div>
  <div id="type-picker-modal" style="display:none"><div id="type-picker-title"></div><div id="type-picker-btns"></div></div>`;

beforeEach(() => { _bets = []; document.body.innerHTML = BODY; });
const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
const check = (id) => { const el = document.getElementById(id); if (el) el.checked = true; };

describe('전략베팅 세부종목·유형 피커 (tags_ui 재사용)', () => {

  test('B갈래 단폴: 농구 이모지 → 팝업 NBA 클릭 → 배지 NBA + hidden 저장', () => {
    check('sim-f-b1');
    S.simRenderJudge();

    const unit = document.querySelector('#sim-judge-b .sim-judge-unit');
    expect(unit).toBeTruthy();

    // 농구 이모지 버튼 클릭 → openSportPicker('sim', btn, '농구')
    const bballBtn = Array.from(unit.querySelectorAll('button')).find(b => b.textContent === '🏀');
    expect(bballBtn).toBeTruthy();
    S.openSportPicker('sim', bballBtn, '농구');

    // 팝업이 SPORT_CATS['농구'] 그대로 렌더 (복사본 아님 — NBA/KBL 등 세부리그)
    const modal = document.getElementById('sport-picker-modal');
    expect(modal.style.display).toBe('flex');
    const btnsHtml = document.getElementById('sport-picker-btns').innerHTML;
    ['NBA', 'KBL', '남농EASL', '남농월예', '여농월예'].forEach(lg => expect(btnsHtml).toContain(lg));

    // NBA 선택
    S.selectSport('NBA');
    expect(document.getElementById('sim-sport-b').value).toBe('NBA');
    expect(unit.querySelector('.sim-sport-label').textContent).toBe('NBA');
    expect(modal.style.display).toBe('none');
  });

  test('유형 피커: 일반 → 핸디캡 선택 → hidden + 배지', () => {
    check('sim-f-b1');
    S.simRenderJudge();
    const unit = document.querySelector('#sim-judge-b .sim-judge-unit');
    const typeBtn = Array.from(unit.querySelectorAll('button')).find(b => b.textContent === '🏁');
    S.openSimTypePicker(typeBtn, '일반');

    // TYPE_OPTIONS 재사용 확인 (승/패·핸디캡·언/옵)
    const btnsHtml = document.getElementById('type-picker-btns').innerHTML;
    ['승/패', '핸디캡', '언/옵'].forEach(v => expect(btnsHtml).toContain(v));

    S.selectSimType('핸디캡', '⚖️', '핸디캡');
    expect(document.getElementById('sim-type-b').value).toBe('핸디캡');
    expect(unit.querySelector('.sim-type-label').textContent).toContain('핸디캡');
  });

  test('홀딩 전송: sport=NBA, type=핸디캡이 베팅기록 미결에 실림', () => {
    check('sim-f-b1');
    setVal('sim-i-b3', '10000');
    S.simRenderJudge();
    setVal('sim-prob-b', '55');
    document.querySelector('#sim-judge-b .sim-fold-odds').value = '2.00';

    const unit = document.querySelector('#sim-judge-b .sim-judge-unit');
    const bballBtn = Array.from(unit.querySelectorAll('button')).find(b => b.textContent === '🏀');
    S.openSportPicker('sim', bballBtn, '농구');
    S.selectSport('NBA');
    const typeBtn = Array.from(unit.querySelectorAll('button')).find(b => b.textContent === '🏁');
    S.openSimTypePicker(typeBtn, '일반');
    S.selectSimType('핸디캡', '⚖️', '핸디캡');

    const n = S.simTransmitPending();
    expect(n).toBe(1);
    const rec = _bets[0];
    expect(rec.result).toBe('PENDING');
    expect(rec.sport).toBe('NBA');
    expect(rec.type).toBe('핸디캡');
    expect(rec.myProb).toBe(55);
  });

  test('다폴: 폴더행마다 피커 세트 + folderSports/Types에 세부리그·유형 실림', () => {
    check('sim-f-b2');           // B 2폴
    setVal('sim-i-b3', '20000');
    S.simRenderJudge();

    const units = document.querySelectorAll('#sim-judge-b .sim-judge-unit');
    expect(units.length).toBe(2);

    // 1행: 축구 EPL / 전반 핸디캡
    const b1 = Array.from(units[0].querySelectorAll('button')).find(b => b.textContent === '⚽');
    S.openSportPicker('sim', b1, '축구'); S.selectSport('EPL');
    const t1 = Array.from(units[0].querySelectorAll('button')).find(b => b.textContent === '⏱️');
    S.openSimTypePicker(t1, '전반'); S.selectSimType('전반 핸디캡', '⚖️', '핸디캡');
    units[0].querySelector('.sim-fold-odds').value = '1.75';
    units[0].querySelector('.sim-fold-prob').value = '60';

    // 2행: 야구 KBO / 기본(미선택 → 승/패)
    const b2 = Array.from(units[1].querySelectorAll('button')).find(b => b.textContent === '⚾');
    S.openSportPicker('sim', b2, '야구'); S.selectSport('KBO');
    units[1].querySelector('.sim-fold-odds').value = '1.71';
    units[1].querySelector('.sim-fold-prob').value = '58';

    const n = S.simTransmitPending();
    expect(n).toBe(1);
    const rec = _bets[0];
    expect(rec.mode).toBe('multi');
    expect(rec.folderSports).toEqual(['EPL', 'KBO']);
    expect(rec.folderTypes).toEqual(['전반 핸디캡', '승/패']);
    expect(rec.folderOdds).toEqual([1.75, 1.71]);
  });

  test('폴더 수 전환 시 선택값 보존 (2폴 값 유지)', () => {
    check('sim-f-b2');
    S.simRenderJudge();
    const units = document.querySelectorAll('#sim-judge-b .sim-judge-unit');
    const b1 = Array.from(units[0].querySelectorAll('button')).find(b => b.textContent === '🏀');
    S.openSportPicker('sim', b1, '농구'); S.selectSport('KBL');
    units[0].querySelector('.sim-fold-odds').value = '1.8';

    // 강제 재렌더 (bucket 초기화 후)
    document.getElementById('sim-judge-b').dataset.bucket = '';
    S.simRenderJudge();
    const after = document.querySelectorAll('#sim-judge-b .sim-judge-unit');
    expect(after[0].querySelector('.sim-fold-sport').value).toBe('KBL');
    expect(after[0].querySelector('.sim-sport-label').textContent).toBe('KBL');
    expect(after[0].querySelector('.sim-fold-odds').value).toBe('1.8');
  });

  test('기존 record/folder 타깃 피커는 무영향 (회귀)', () => {
    document.body.innerHTML += `<input type="hidden" id="r-sport">
      <div id="sport-selected-badge" style="display:none"><span id="sport-selected-label"></span></div>`;
    S.openSportPicker('record', '야구');
    S.selectSport('MLB');
    expect(document.getElementById('r-sport').value).toBe('MLB');
  });

  test('6폴 지원: B갈래 6폴 라디오 → 판단 행 6개 + betmanRound 합산 배당', () => {
    check('sim-f-b6');
    setVal('sim-i-b3', '10000');
    S.simRenderJudge();

    const units = document.querySelectorAll('#sim-judge-b .sim-judge-unit');
    expect(units.length).toBe(6);

    // 6경기 배당 각 1.5 → 곱 11.390625 → betmanRound: 소수 둘째 있음 → ceil → 11.4
    units.forEach(u => { u.querySelector('.sim-fold-odds').value = '1.5'; });
    expect(S.simGetOdds('b')).toBeCloseTo(11.4, 5);

    // 전송 레코드에도 자동 배당 + 6폴 데이터
    units.forEach(u => { u.querySelector('.sim-fold-prob').value = '70'; });
    const n = S.simTransmitPending();
    expect(n).toBe(1);
    const rec = _bets[0];
    expect(rec.mode).toBe('multi');
    expect(rec.folderCount).toBe('6');
    expect(rec.folderOdds.length).toBe(6);
    expect(rec.betmanOdds).toBeCloseTo(11.4, 5);
  });

  test('배당 자동 산출: 단폴은 경기 배당 그대로, 2폴은 betmanRound(곱)', () => {
    // 단폴
    check('sim-f-a1');
    S.simRenderJudge();
    document.querySelector('#sim-judge-a .sim-fold-odds').value = '2.37';
    expect(S.simGetOdds('a')).toBeCloseTo(2.37, 5);

    // 2폴: 1.75 × 1.71 = 2.9925 → betmanRound = 3.0 (베팅기록 calcMultiEV와 동일 규칙)
    check('sim-f-b2');
    S.simRenderJudge();
    const bu = document.querySelectorAll('#sim-judge-b .sim-judge-unit');
    bu[0].querySelector('.sim-fold-odds').value = '1.75';
    bu[1].querySelector('.sim-fold-odds').value = '1.71';
    expect(S.simGetOdds('b')).toBeCloseTo(3.0, 5);

    // 배당 미입력이면 0 (미입력 상태)
    expect(S.simGetOdds('c')).toBe(0);
  });
});
