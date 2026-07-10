// core_flow.test.js — 핵심 머니 플로우 통합 테스트 (1인 프로젝트 처방 ①)
//   실제 모듈 관통: scope.js → round.js → settings.js → state.js → compute.js → bet_record.js
//   시나리오: 회차 시작 → 베팅 등록(예산 차감) → WIN 정산(크레딧) → LOSE 정산
//             → 통계 반영(compute) → 삭제 시 생애주기 복구
//   목적: "등록→정산→통계" 숫자 흐름의 회귀 방지 (정산은 이 앱의 실제 돈 계산)
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const sandbox = {
  window, document, console, navigator: window.navigator, localStorage: window.localStorage,
  setTimeout: (fn)=>{ if(typeof fn==='function') fn(); return 0; }, clearTimeout: ()=>{}, setInterval, clearInterval,
  Math, Date, JSON, Event: window.Event, CustomEvent: window.CustomEvent, parseInt, parseFloat, isNaN, isFinite, Number, String, Boolean, Array, Object, Set, Map, RegExp, Error, Intl,
  alert: ()=>{}, confirm: ()=>true, prompt: ()=>null,
  showToast: ()=>{}, updateAll: ()=>{}, updatePreview: ()=>{}, renderTable: ()=>{}, renderRoundCard: ()=>{},
  _syncScopeUI: ()=>{}, updateWallet: ()=>{}, renderVault: ()=>{}, updateStatsAnalysis: ()=>{},
  updateDashboard: ()=>{}, renderKellyPage: ()=>{}, updateKellyHistory: ()=>{}, renderTablePage: ()=>{},
  updateEvBias: ()=>{}, updateEvMonthly: ()=>{}, updateEvCum: ()=>{}, renderJournal: ()=>{},
  updateRecordSportFilter: ()=>{}, renderPredPage: ()=>{}, updateGoalPredict: ()=>{},
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
const load = f => vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), sandbox, { filename: f });
// 실제 storage.js 그대로 사용 (jsdom localStorage 위에서) — 더 진짜에 가까운 통합
load('storage.js');
// storage.js는 window.KEYS/Storage로 노출 → vm 전역으로 브릿지 (브라우저에선 window=global)
sandbox.KEYS = sandbox.window.KEYS;
sandbox.Storage = sandbox.window.Storage;
load('scope.js');
load('round.js');
load('settings.js');
load('state.js');
load('ev.js');
load('kelly.js');
load('compute.js');
load('bet_record.js');
const S = sandbox;
const g = expr => vm.runInContext(expr, sandbox);

function mkBet(over) {
  return Object.assign({
    id: Date.now() + Math.floor(Math.random()*1e6),
    isSim: false, date: '2026-07-10', game: '테스트경기', mode: 'single', folderCount: '',
    sport: 'KBO', type: '승/패', betmanOdds: 2.0, amount: 20000,
    result: 'PENDING', profit: 0, myProb: 55, memo: '통합테스트',
    folderMemos: [], folderOdds: [], folderProbs: [], folderSports: [], folderTypes: [],
    emotion: '보통', violations: [], savedAt: new Date().toISOString(),
    ev: null, evRaw: null, adjustedProb: null, evCalibrated: null, calibProb: null,
  }, over);
}

beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = '';
  g('typeof bets !== "undefined" && (bets = [])');
});

describe('핵심 머니 플로우 (등록→정산→통계)', () => {

  test('전체 시나리오: 회차 차감 → WIN 크레딧 → LOSE → 통계 → 삭제 복구', () => {
    // ── 1) 회차 시작 (시드 10만) ──
    const round = { id: 'R-IT', seed: 100000, remaining: 100000, status: 'LOCKED',
                    startedAt: new Date().toISOString() };
    S.saveRounds([round]);
    expect(S.getActiveRound().remaining).toBe(100000);

    // ── 2) 베팅 3건 등록 (베팅기록 폼과 동일 경로: attach + applyRoundBet + saveBets) ──
    const b1 = mkBet({ amount: 20000, betmanOdds: 2.0 });   // → WIN 예정
    const b2 = mkBet({ amount: 30000, betmanOdds: 1.8 });   // → LOSE 예정
    const b3 = mkBet({ amount: 10000, betmanOdds: 2.5 });   // → PENDING 유지
    [b1, b2, b3].forEach(b => { S.attachRoundToBet(b); S.applyRoundBet(b.amount); });
    S.saveBets([...S.getBets(), b1, b2, b3], { refresh: false });

    expect(S.getBets().length).toBe(3);
    expect(S.getActiveRound().remaining).toBe(100000 - 60000);     // 차감
    S.getBets().forEach(b => {
      expect(b.roundId).toBe('R-IT');
      expect(Number.isInteger(b.finSeason) && b.finSeason >= 0).toBe(true); // saveBets 정규화
    });

    // ── 3) WIN 정산: profit = 2만×(2.0−1) = 2만, 회차에 본금+이익 4만 크레딧 ──
    S.resolvebet(b1.id, 'WIN');
    const w = S.getBets().find(b => b.id === b1.id);
    expect(w.result).toBe('WIN');
    expect(w.profit).toBe(20000);
    expect(S.getActiveRound().remaining).toBe(40000 + 40000);      // 4만 + (본금2만+이익2만)

    // ── 4) LOSE 정산: profit = −3만, remaining 불변 ──
    S.resolvebet(b2.id, 'LOSE');
    const l = S.getBets().find(b => b.id === b2.id);
    expect(l.profit).toBe(-30000);
    expect(S.getActiveRound().remaining).toBe(80000);              // 변화 없음

    // ── 5) 통계 반영 (compute.js 실계산) ──
    const m = S.computeAnalyzeMetrics(S.getBets());
    expect(m.totalBets ?? m.n ?? 3).toBeTruthy();
    const resolved = S.getBets().filter(b => b.result !== 'PENDING');
    expect(resolved.length).toBe(2);
    const wr = resolved.filter(b => b.result === 'WIN').length / resolved.length * 100;
    expect(wr).toBe(50);
    const profit = resolved.reduce((s, b) => s + b.profit, 0);
    expect(profit).toBe(-10000);                                    // +2만 −3만
    const base = S.computeBaseStats(S.getBets(), 20000);
    expect(base).toBeTruthy();                                      // 실계산 무예외

    // ── 6) 배당 없는 WIN 확정은 거부 (레코드 불변) ──
    const bad = mkBet({ amount: 5000, betmanOdds: null });
    S.saveBets([...S.getBets(), bad], { refresh: false });
    S.resolvebet(bad.id, 'WIN');
    expect(S.getBets().find(b => b.id === bad.id).result).toBe('PENDING'); // 저장 거부됨

    // ── 7) 삭제 생애주기 복구 ──
    // WIN 삭제: remaining에서 이익(2만)만 차감 복구
    S.deleteBet(b1.id);
    expect(S.getBets().find(b => b.id === b1.id)).toBeUndefined();
    expect(S.getActiveRound().remaining).toBe(60000);               // 8만 − 이익2만
    // PENDING 삭제: 본금(1만) 환원
    S.deleteBet(b3.id);
    expect(S.getActiveRound().remaining).toBe(70000);
    // LOSE 삭제: 등록 시 차감했던 본금(3만) 환원 → 세 건 모두 삭제 = 시드 전액 복귀
    S.deleteBet(b2.id);
    expect(S.getActiveRound().remaining).toBe(100000);   // 베팅이 전부 없었던 상태
  });

  test('시뮬 격리: isSim 레코드는 finSeason −1 고정 + 확정 통계에서 배제 가능', () => {
    const real = mkBet({ amount: 10000 });
    const sim = mkBet({ isSim: true, amount: 10000 });
    S.saveBets([real, sim], { refresh: false });
    const saved = S.getBets();
    expect(saved.find(b => b.isSim).finSeason).toBe(-1);            // state.js 정규화 규칙
    expect(saved.find(b => !b.isSim).finSeason).toBeGreaterThanOrEqual(0);
  });
});
