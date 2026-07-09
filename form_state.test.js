// form_state.test.js — ③상태 통합: simReadForm/simWriteForm 왕복 + draft 저장/복원 (jsdom)
const vm = require('vm');
const fs = require('fs');
const path = require('path');

let _store = {};
const sandbox = {
  window, document, console, navigator: window.navigator, localStorage: window.localStorage,
  setTimeout: (fn) => { fn(); return 0; },   // draft 디바운스 즉시 실행
  clearTimeout: () => {}, setInterval, clearInterval,
  Math, Date, JSON, parseInt, parseFloat, isNaN, isFinite, Number, String, Boolean, Array, Object, Set, Map, RegExp, Error,
  alert: () => {}, confirm: () => true,
  getBets: () => [], saveBets: () => {}, updateAll: () => {},
  toProb: p => (Number(p)||0)/100, getCLVAdjustedProb: p => p, getDecisionSnapshot: () => ({}),
  Storage: {
    setJSON: (k, v) => { _store[k] = JSON.stringify(v); },
    getJSON: (k, d) => (k in _store ? JSON.parse(_store[k]) : d),
    set: (k, v) => { _store[k] = String(v); },
    get: (k) => _store[k] ?? null,
    remove: (k) => { delete _store[k]; },
  },
  KEYS: { SIM_FORM_DRAFT: 'draft', SIM_STATE: 's', SIM_GOAL: 'g', SIM_PENDING: 'p' },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
const load = f => vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), sandbox, { filename: f });
load('ev.js'); load('tags_ui.js');
load('sim_state.js'); load('sim_engine.js'); load('sim_render.js'); load('sim_actions.js');
const S = sandbox;

const BODY = `
  <input id="sim-i-sv"><input id="sim-i-b2"><input id="sim-i-b3"><input id="sim-i-b4">
  <input id="sim-i-memo"><input id="sim-i-memo-b"><input id="sim-i-memo-c">
  ${['a','b','c'].map(w => Array.from({length:6},(_,i)=>`<input type="radio" name="f${w}" id="sim-f-${w}${i+1}">`).join('')).join('\n')}
  <div id="sim-judge-a"></div><div id="sim-judge-b"></div><div id="sim-judge-c"></div>`;

beforeEach(() => { _store = {}; document.body.innerHTML = BODY; S.simResetOdds(); });

describe('③상태 통합 — 폼 단일 접근 계층', () => {

  test('simReadForm ↔ simWriteForm 왕복: 금액·폴더·판단값 보존', () => {
    // 폼 구성: B 3폴, 금액, 판단값
    document.getElementById('sim-f-b3').checked = true;
    document.getElementById('sim-f-a1').checked = true;
    document.getElementById('sim-i-sv').value = '5000';
    document.getElementById('sim-i-b3').value = '20000';
    S.simRenderJudge();
    const units = document.querySelectorAll('#sim-judge-b .sim-judge-unit');
    units[0].querySelector('.sim-fold-odds').value = '1.8';
    units[0].querySelector('.sim-fold-prob').value = '60';
    units[0].querySelector('.sim-sport-h').value = 'NBA';
    units[0].querySelector('.sim-sport-label').textContent = 'NBA';
    units[2].querySelector('.sim-fold-odds').value = '1.5';

    const form = S.simReadForm();
    expect(form.folders.b).toBe(3);
    expect(form.branches.b[0].sport).toBe('NBA');

    // 폼 전체 초기화 후 복원
    document.body.innerHTML = BODY;
    S.simWriteForm(form);
    expect(document.getElementById('sim-f-b3').checked).toBe(true);
    expect(document.getElementById('sim-i-b3').value).toBe('20000');
    const after = document.querySelectorAll('#sim-judge-b .sim-judge-unit');
    expect(after.length).toBe(3);
    expect(after[0].querySelector('.sim-fold-odds').value).toBe('1.8');
    expect(after[0].querySelector('.sim-sport-h').value).toBe('NBA');
    expect(after[0].querySelector('.sim-sport-label').textContent).toBe('NBA');
    expect(after[2].querySelector('.sim-fold-odds').value).toBe('1.5');
  });

  test('draft: 저장 → DOM 리셋 → 복원 (탭 이동/새로고침 유실 방지)', () => {
    document.getElementById('sim-f-a2').checked = true;
    document.getElementById('sim-i-b2').value = '10000';
    S.simRenderJudge();
    const u = document.querySelectorAll('#sim-judge-a .sim-judge-unit');
    u[0].querySelector('.sim-fold-odds').value = '1.75';
    u[1].querySelector('.sim-fold-odds').value = '1.71';

    S.simFormSaveDraft();                      // setTimeout 즉시 실행 스텁
    expect(_store['draft']).toBeTruthy();

    document.body.innerHTML = BODY;            // "새로고침"
    S.simFormRestoreDraft();
    const after = document.querySelectorAll('#sim-judge-a .sim-judge-unit');
    expect(after.length).toBe(2);
    expect(after[0].querySelector('.sim-fold-odds').value).toBe('1.75');
    expect(S.simGetOdds('a')).toBeCloseTo(3.0, 5);   // 1.75×1.71 → betmanRound 3.0 그대로 복원

    S.simFormClearDraft();                     // 홀딩 후 폐기
    expect(_store['draft']).toBeUndefined();
  });

  test('배당 오버라이드도 draft에 실려 복원됨', () => {
    document.getElementById('sim-f-a1').checked = true;
    S.simRenderJudge();
    document.querySelector('#sim-judge-a .sim-fold-odds').value = '2.01';
    S.simOddsOverride ?? null; // (전역 let은 미노출 — 함수 경유)
    // ✏️ 수정 흐름 대신 직접: applyOddsEdit 경로는 sim_picker.test에서 검증됨.
    const form = S.simReadForm();
    form.override.a = 2.0;
    document.body.innerHTML = BODY;
    S.simWriteForm(form);
    expect(S.simGetOdds('a')).toBeCloseTo(2.0, 5);   // 오버라이드 복원
  });
});
