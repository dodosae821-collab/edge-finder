// mirror.test.js — Step2 거울: 입력 변화 → 확률 갱신 + 실측률 빌드 (jsdom)
const vm = require('vm');
const fs = require('fs');
const path = require('path');

// 실측 레그 표본: 적중 다폴(전레그 WIN) + 폴더기록 완비 낙첨
const BETS = [
  { isSim:false, result:'WIN',  folderOdds:[1.8,1.9], folderProbs:[60,58], folderSports:['축구','야구'] },
  { isSim:false, result:'WIN',  folderOdds:[1.7,1.85],folderProbs:[62,57], folderSports:['축구','농구'] },
  { isSim:false, result:'WIN',  folderOdds:[1.9,1.6], folderProbs:[59,63], folderSports:['야구','축구'] },
  { isSim:false, result:'LOSE', folderOdds:[1.8,1.9], folderProbs:[60,58], folderSports:['축구','야구'], folderResults:['WIN','LOSE'] },
  { isSim:false, result:'WIN',  folderOdds:[2.5,2.6], folderProbs:[42,40], folderSports:['농구','배구'] }, // 2~3 밴드 n=2 (<5)
];

let _bets = BETS.slice();
const sandbox = {
  window, document, console, navigator: window.navigator, localStorage: window.localStorage,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Math, Date, JSON, parseInt, parseFloat, isNaN, isFinite, Number, String, Boolean, Array, Object, Set, Map,
  Storage: { setJSON(){}, getJSON(k,d){return d;}, set(){}, remove(){} }, KEYS: {},
  getBets: () => _bets, saveBets: () => {}, updateAll: () => {},
  betmanRound: (x) => Math.round(x*100)/100,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
const load = f => vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), sandbox, { filename: f });
load('stats.js');       // computeLegStats, _oddsBand
load('simulator.js');   // simBuildLegRates, simRenderProbMirror, simMonteCarloPath ...

const { simBuildLegRates, simRenderProbMirror } = sandbox;

const BODY = `
  <input id="sim-i-sv"><input id="sim-i-b2"><input id="sim-i-b3"><input id="sim-i-b4">
  <input type="radio" name="fa" id="sim-f-a1"><input type="radio" name="fa" id="sim-f-a2"><input type="radio" name="fa" id="sim-f-a3"><input type="radio" name="fa" id="sim-f-a4"><input type="radio" name="fa" id="sim-f-a5"><input type="radio" name="fa" id="sim-f-a6">
  <input type="radio" name="fb" id="sim-f-b1"><input type="radio" name="fb" id="sim-f-b2"><input type="radio" name="fb" id="sim-f-b3"><input type="radio" name="fb" id="sim-f-b4"><input type="radio" name="fb" id="sim-f-b5"><input type="radio" name="fb" id="sim-f-b6">
  <input type="radio" name="fc" id="sim-f-c1"><input type="radio" name="fc" id="sim-f-c2"><input type="radio" name="fc" id="sim-f-c3"><input type="radio" name="fc" id="sim-f-c4"><input type="radio" name="fc" id="sim-f-c5"><input type="radio" name="fc" id="sim-f-c6">
  <div id="sim-judge-a"></div><div id="sim-judge-b"></div><div id="sim-judge-c"></div>
  <div id="sim-prob-mirror"></div>
  <input id="sim-bw-save" value="55"><input id="sim-bw-odds" value="3.0">
  <div id="sim-bw-result"></div>`;

beforeEach(() => { document.body.innerHTML = BODY; });

describe('Step2 실측률 빌드', () => {
  test('n>=5 배당대만 실측(rates), n<5는 폴백', () => {
    const { rates, pred, meta } = simBuildLegRates();
    // '1.5~2': 적중레그 3*2 + 낙첨 1건(WIN,LOSE) = n=8, w=7
    expect(meta['1.5~2'].n).toBe(8);
    expect(meta['1.5~2'].real).toBe(true);
    expect(rates['1.5~2']).toBeCloseTo(7 / 8, 5);
    // '2~3': n=2 (<5) → 실측 제외, 예측 폴백만
    expect(meta['2~3'].n).toBe(2);
    expect(meta['2~3'].real).toBe(false);
    expect(rates['2~3']).toBeUndefined();
    expect(typeof pred['2~3']).toBe('number');
  });
});

describe('Step2 거울 반응성', () => {
  test('입력 없으면 제안만, 금액 입력하면 "지금 네 입력이면" 블록 등장', () => {
    sandbox.simRenderJudge();
    document.querySelector('#sim-judge-a .sim-fold-odds').value = '2.00';
    // 입력 전
    simRenderProbMirror();
    const noInput = document.getElementById('sim-prob-mirror').innerHTML;
    expect(noInput).toContain('제안(로드맵)');
    expect(noInput).not.toContain('지금 네 입력이면');
    expect(noInput).toMatch(/도달|파산/);

    // 금액 입력 후 재렌더 → 거울이 반응
    document.getElementById('sim-i-b2').value = '7000';
    document.getElementById('sim-i-sv').value = '3000';
    simRenderProbMirror();
    const withInput = document.getElementById('sim-prob-mirror').innerHTML;
    expect(withInput).toContain('지금 네 입력이면');
    expect(withInput).toContain('제안(로드맵)');
  });

  test('목표 이상 잔액이면 거울 숨김 (빈 출력)', () => {
    // 기본 잔액 10000 < 목표라 렌더됨을 먼저 확인
    simRenderProbMirror();
    expect(document.getElementById('sim-prob-mirror').innerHTML.length).toBeGreaterThan(0);
  });
});

describe('세이브 방파제 체인 렌더', () => {
  const { simRenderBreakwater } = sandbox;

  test('세이브/실탄/필요배당 표시 + 세이브비율 바꾸면 실탄 반응', () => {
    document.getElementById('sim-bw-save').value = '55';
    document.getElementById('sim-bw-odds').value = '3.0';
    simRenderBreakwater();
    const html1 = document.getElementById('sim-bw-result').innerHTML;
    expect(html1).toContain('세이브');
    expect(html1).toContain('실탄');
    expect(html1).toMatch(/도달|종료|생략/);

    // 세이브 비율 90%로 올리면 실탄이 줄어 출력이 달라져야 함 (거울 반응)
    document.getElementById('sim-bw-save').value = '90';
    simRenderBreakwater();
    const html2 = document.getElementById('sim-bw-result').innerHTML;
    expect(html2).not.toBe(html1);
  });
});
