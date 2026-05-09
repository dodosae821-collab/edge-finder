// ============================================================
// compute.js — UI 파생 계산 전담 모듈
// ============================================================
// 담당:
//   computeAnalyzeMetrics(bets)     — KPI 지표 계산
//   computeSimulation(bets, config) — 몬테카를로 시뮬레이션
//
// 규칙:
//   - 순수 함수만 — 오직 인자로만 처리
//   - DOM 접근 금지
//   - 전역 접근 금지 (getBets, appSettings, calcPredGrade 등)
//   - kelly.js 이후, round.js 이전에 로드
// ============================================================


// ── private utils ────────────────────────────────────────────

function _percentile(arr, p) {
  const sorted = arr.slice().sort(function(a, b) { return a - b; });
  const idx = Math.floor(sorted.length * p / 100);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function _seededRand(seed) {
  let s = (seed || 1) >>> 0;
  return function() {
    s = ((s * 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}


// ── computeAnalyzeMetrics ────────────────────────────────────
/**
 * 분석 탭 KPI 지표 계산
 * @param   {Array} bets — getBets() 결과를 인자로 전달
 * @returns {{ avgProfit: number|null, evAvg: number|null }}
 */
function computeAnalyzeMetrics(bets) {
  const resolved = bets.filter(function(b) { return b.result !== 'PENDING'; });

  // 베팅당 평균 손익 (반올림 포함 — 렌더 시 Math 호출 제거)
  const totalProfit = resolved.reduce(function(s, b) { return s + (b.profit || 0); }, 0);
  const avgProfit = resolved.length > 0 ? Math.round(totalProfit / resolved.length) : null;

  // EV 평균
  const evBets = bets.filter(function(b) { return b.ev !== undefined && b.ev !== null; });
  const evAvg = evBets.length > 0
    ? evBets.reduce(function(s, b) { return s + (b.ev || 0); }, 0) / evBets.length
    : null;

  return { avgProfit: avgProfit, evAvg: evAvg };
}


// ── computeSimulation ────────────────────────────────────────
/**
 * 몬테카를로 시뮬레이션 (1000회)
 * @param   {Array}  bets   — getBets() 결과
 * @param   {{
 *   start:      number,
 *   goalTarget: number,
 *   simGrade:   object|null
 * }} config — ui_tabs.js에서 전역 의존성 해결 후 전달
 * @returns {{
 *   winRate, avgOdds, avgAmt, evPerBet,
 *   p10, p25, p50, p75, p90,
 *   actualPath, labels,
 *   ruinProb, medGoal, p90streak, worstMinAbs,
 *   STEPS, start, goalTarget,
 *   simGrade, simMult, useRecent, resolvedCount
 * }}
 */
function computeSimulation(bets, config) {
  const start = config.start;
  const goalTarget = config.goalTarget;
  const simGrade = config.simGrade;

  const resolved = bets.filter(function(b) { return b.result !== 'PENDING'; });
  const wins = resolved.filter(function(b) { return b.result === 'WIN'; });

  const winRate = resolved.length > 0 ? wins.length / resolved.length : 0.5;
  const avgOdds = resolved.length > 0
    ? resolved.reduce(function(s, b) { return s + (b.betmanOdds || 1.9); }, 0) / resolved.length
    : 1.9;
  const avgAmt = resolved.length > 0
    ? resolved.reduce(function(s, b) { return s + b.amount; }, 0) / resolved.length
    : 100000;
  const evPerBet = (winRate * (avgOdds - 1) - (1 - winRate)) * avgAmt;

  const simMult = simGrade ? simGrade.mult : 1.0;
  const useRecent = Boolean(simGrade && (simGrade.letter === 'C' || simGrade.letter === 'D'));
  const simPool = useRecent ? resolved.slice(-30) : resolved;

  const RUNS = 1000;
  const STEPS = simPool.length >= 5 ? simPool.length : 30;
  const seed0 = (simPool.length * 7919) >>> 0;
  const rand = _seededRand(seed0);

  const profitPool = simPool.length >= 5
    ? simPool.map(function(b) { return b.profit * simMult; })
    : null;

  const allPaths = [];
  let ruinCount      = 0;
  const goalReachSteps = [];
  const maxStreaks = [];

  for (let r = 0; r < RUNS; r++) {
    let bal = 0;
    const path = [0];
    let ruin = false;
    let curStreak = 0; let maxStreak = 0;
    let goalReached = false;

    for (let i = 0; i < STEPS; i++) {
      let profit;
      if (profitPool) {
        const idx = Math.floor(rand() * profitPool.length);
        profit = profitPool[idx];
      } else {
        profit = rand() < winRate ? avgAmt * (avgOdds - 1) : -avgAmt;
      }
      bal += profit;
      if (profit > 0) { curStreak = 0; }
      else { curStreak++; if (curStreak > maxStreak) maxStreak = curStreak; }
      path.push(Math.round(bal));
      if (!ruin && start + bal <= 0) { ruin = true; ruinCount++; }
      if (!goalReached && goalTarget > 0 && start + bal >= goalTarget) {
        goalReached = true;
        goalReachSteps.push(i + 1);
      }
    }
    allPaths.push(path);
    maxStreaks.push(maxStreak);
  }

  const p10 = [], p25 = [], p50 = [], p75 = [], p90 = [];
  for (let step = 0; step <= STEPS; step++) {
    const vals = allPaths.map(function(p) { return p[step]; });
    p10.push(_percentile(vals, 10));
    p25.push(_percentile(vals, 25));
    p50.push(_percentile(vals, 50));
    p75.push(_percentile(vals, 75));
    p90.push(_percentile(vals, 90));
  }

  const actualPath = [0];
  const sortedBets = resolved.slice().sort(function(a, b) {
    return (a.date || '').localeCompare(b.date || '');
  });
  let cum = 0;
  sortedBets.forEach(function(b) { cum += b.profit; actualPath.push(Math.round(cum)); });

  const labels = Array.from({ length: STEPS + 1 }, function(_, i) {
    return i === 0 ? '시작' : '+' + i + '번';
  });

  // 파생 통계 — 렌더 시 Math 호출 제거 위해 여기서 완성
  const ruinProb = parseFloat((ruinCount / RUNS * 100).toFixed(1));
  const medGoal = goalReachSteps.length > 0 ? _percentile(goalReachSteps, 50) : null;
  const p90streak = _percentile(maxStreaks, 90);
  const pathMins = allPaths.map(function(p) {
    return p.reduce(function(m, v) { return v < m ? v : m; }, 0);
  });
  pathMins.sort(function(a, b) { return a - b; });
  const worstMin = pathMins[Math.floor(RUNS * 0.1)] || 0;
  const worstMinAbs = worstMin < 0 ? Math.round(Math.abs(worstMin)) : null;

  return {
    winRate:      winRate,
    avgOdds:      avgOdds,
    avgAmt:       avgAmt,
    evPerBet:     evPerBet,
    p10: p10, p25: p25, p50: p50, p75: p75, p90: p90,
    actualPath:   actualPath,
    labels:       labels,
    ruinProb:     ruinProb,
    medGoal:      medGoal,
    p90streak:    p90streak,
    worstMinAbs:  worstMinAbs,
    STEPS:        STEPS,
    start:        start,
    goalTarget:   goalTarget,
    simGrade:     simGrade,
    simMult:      simMult,
    useRecent:    useRecent,
    resolvedCount: resolved.length
  };
}


// ── computeJudgeMetrics ──────────────────────────────────────
/**
 * 판단 패널 전체 계산
 * @param   {Array}  bets     — getBets() 결과
 * @param   {string} filter   — 'all' | 30 | 10
 * @returns {{
 *   resolved, predBets,
 *   folderData, sportRoi, bestSport, worstSport,
 *   predEdge, actualEdgeVal,
 *   evBets, evTrust,
 *   trendData, trendLabels, recentEdge,
 *   oddsData,
 *   biasMA, biasLabels, avgBias, lastBias,
 *   chartMA: { myMA, implMA, actMA, pL },
 *   matrix, sportMap, activeFkeys,
 *   actions, diagLines,
 *   filterLabel
 * }}
 */
function computeJudgeMetrics(bets, filter) {
  const allResolved = bets.filter(function(b) { return b.result !== 'PENDING'; });
  const resolved = (filter === 'all' || filter === undefined)
    ? allResolved : allResolved.slice(-filter);

  const filterLabel = (filter === 'all' || filter === undefined) ? '전체' : '최근 ' + filter + '건';

  // ── 폴더별 ──
  const folderKeys = ['단폴', '2폴', '3폴', '4폴+'];
  const folderData = folderKeys.map(function(key) {
    const g = resolved.filter(function(b) {
      if (key === '단폴') return b.mode !== 'multi';
      const fc = parseInt(b.folderCount) || 0;
      if (key === '2폴') return b.mode === 'multi' && fc === 2;
      if (key === '3폴') return b.mode === 'multi' && fc === 3;
      return b.mode === 'multi' && fc >= 4;
    });
    const profit = g.reduce(function(s, b) { return s + (b.profit || 0); }, 0);
    const invested = g.reduce(function(s, b) { return s + (b.amount || 0); }, 0);
    const roi = invested > 0 ? profit / invested * 100 : null;
    const cumEv = g.reduce(function(s, b) {
      if (b.ev != null) return s + (b.amount || 0) * b.ev;
      if (b.myProb && b.betmanOdds) return s + (b.amount || 0) * ((b.myProb / 100) * (b.betmanOdds - 1) - (1 - b.myProb / 100));
      return s;
    }, 0);
    return { key: key, count: g.length, profit: profit, invested: invested, roi: roi, cumEv: cumEv };
  }).filter(function(d) { return d.count > 0; });

  // ── 종목별 ──
  const sportMap = {};
  resolved.forEach(function(b) {
    const sports = (b.sport || '기타').split(', ');
    sports.forEach(function(sp) {
      if (!sportMap[sp]) sportMap[sp] = { profit: 0, invested: 0, count: 0 };
      sportMap[sp].profit   += (b.profit || 0) / sports.length;
      sportMap[sp].invested += (b.amount || 0) / sports.length;
      sportMap[sp].count++;
    });
  });
  const sportRoi = Object.entries(sportMap)
    .map(function(e) { return { sp: e[0], roi: e[1].invested > 0 ? e[1].profit / e[1].invested * 100 : 0, count: e[1].count }; })
    .sort(function(a, b) { return b.roi - a.roi; });
  const bestSport = sportRoi[0] || null;
  const worstSport = sportRoi[sportRoi.length - 1] || null;

  // ── 예측 베팅 / 엣지 ──
  const predBets = resolved.filter(function(b) { return b.myProb && b.betmanOdds; });
  const predEdge = predBets.length > 0
    ? predBets.reduce(function(s, b) { return s + (b.myProb - 100 / b.betmanOdds); }, 0) / predBets.length
    : null;
  const actualEdgeVal = predBets.length > 0
    ? predBets.filter(function(b) { return b.result === 'WIN'; }).length / predBets.length * 100
      - predBets.reduce(function(s, b) { return s + 100 / b.betmanOdds; }, 0) / predBets.length
    : null;

  // ── EV 신뢰도 ──
  const evBets = resolved.filter(function(b) {
    if (b.ev != null) return true;
    if (b.myProb && b.betmanOdds) return true;
    return false;
  });
  const cumEvTotal = evBets.reduce(function(s, b) {
    const ev = b.ev != null ? b.ev : (b.myProb / 100 * (b.betmanOdds - 1)) - (1 - b.myProb / 100);
    return s + (b.amount || 0) * ev;
  }, 0);
  const cumProfitEv = evBets.reduce(function(s, b) { return s + (b.profit || 0); }, 0);
  const evTrust = cumEvTotal !== 0 ? cumProfitEv / Math.abs(cumEvTotal) * 100 : null;

  // ── 트렌드 (10건 단위) ──
  const trendData = [], trendLabels = [];
  for (let i = 0; i < predBets.length; i += 10) {
    const chunk = predBets.slice(i, i + 10);
    trendLabels.push((i + 1) + '~' + Math.min(i + 10, predBets.length));
    trendData.push(parseFloat((chunk.reduce(function(s, b) { return s + (b.myProb - 100 / b.betmanOdds); }, 0) / chunk.length).toFixed(1)));
  }
  const recent10pred = predBets.slice(-10);
  const recentEdge = recent10pred.length > 0
    ? recent10pred.reduce(function(s, b) { return s + (b.myProb - 100 / b.betmanOdds); }, 0) / recent10pred.length
    : null;

  // ── 배당 구간 ──
  const oddsRanges = [
    { label: '1.3~1.7', min: 1.3, max: 1.7 },
    { label: '1.7~2.2', min: 1.7, max: 2.2 },
    { label: '2.2~2.8', min: 2.2, max: 2.8 },
    { label: '2.8~3.5', min: 2.8, max: 3.5 },
    { label: '3.5+',   min: 3.5, max: 99 }
  ];
  const oddsData = oddsRanges.map(function(r) {
    const g = predBets.filter(function(b) { return b.betmanOdds >= r.min && b.betmanOdds < r.max; });
    if (!g.length) return null;
    const myAvg = g.reduce(function(s, b) { return s + b.myProb; }, 0) / g.length;
    const implAvg = g.reduce(function(s, b) { return s + 100 / b.betmanOdds; }, 0) / g.length;
    const actWr = g.filter(function(b) { return b.result === 'WIN'; }).length / g.length * 100;
    return { label: r.label, count: g.length, edge: myAvg - implAvg, actualEdge: actWr - implAvg, actualWr: actWr, implAvg: implAvg };
  }).filter(Boolean);

  // ── 낙관 편향 MA5 ──
  const biasMA = [], biasLabels = [];
  predBets.forEach(function(b, i) {
    const sl = predBets.slice(Math.max(0, i - 4), i + 1);
    const myAvgSl = sl.reduce(function(s, x) { return s + x.myProb; }, 0) / sl.length;
    const actWrSl = sl.filter(function(x) { return x.result === 'WIN'; }).length / sl.length * 100;
    biasMA.push(parseFloat((myAvgSl - actWrSl).toFixed(1)));
    biasLabels.push(i + 1);
  });
  const avgBias = biasMA.length > 0 ? biasMA.reduce(function(s, v) { return s + v; }, 0) / biasMA.length : null;
  const lastBias = biasMA.length > 0 ? biasMA[biasMA.length - 1] : null;

  // ── 차트용 MA 데이터 (judge-pred-chart) ──
  const myMA = [], implMA = [], actMA = [], pL = [];
  predBets.forEach(function(b, i) {
    const sl = predBets.slice(Math.max(0, i - 4), i + 1);
    pL.push(i + 1);
    myMA.push(sl.reduce(function(s, x) { return s + x.myProb; }, 0) / sl.length);
    implMA.push(sl.reduce(function(s, x) { return s + 100 / x.betmanOdds; }, 0) / sl.length);
    actMA.push(sl.filter(function(x) { return x.result === 'WIN'; }).length / sl.length * 100);
  });

  // ── 교차표 matrix ──
  const fkeys = ['단폴', '2폴', '3폴', '4폴+'];
  const matrix = {};
  resolved.forEach(function(b) {
    const fc = b.mode !== 'multi' ? '단폴' : parseInt(b.folderCount) >= 4 ? '4폴+' : b.folderCount + '폴';
    const sports = (b.sport || '기타').split(', ');
    sports.forEach(function(sp) {
      if (!matrix[sp]) matrix[sp] = {};
      if (!matrix[sp][fc]) matrix[sp][fc] = { profit: 0, invested: 0, count: 0 };
      matrix[sp][fc].profit   += (b.profit || 0) / sports.length;
      matrix[sp][fc].invested += (b.amount || 0) / sports.length;
      matrix[sp][fc].count++;
    });
  });
  const sportList = Object.keys(sportMap).filter(function(sp) { return sportMap[sp].count >= 2; });
  const activeFkeys = fkeys.filter(function(k) { return sportList.some(function(sp) { return matrix[sp] && matrix[sp][k]; }); });

  // ── 액션 제안 [{type, text}] ──
  const actions = [];
  const worstF = folderData.length > 0 ? folderData.slice().sort(function(a, b) { return (a.roi || 0) - (b.roi || 0); })[0] : null;
  const bestF = folderData.length > 0 ? folderData.slice().sort(function(a, b) { return (b.roi || 0) - (a.roi || 0); })[0] : null;

  if (worstF && worstF.roi !== null && worstF.roi < -20 && worstF.count >= 3)
    actions.push({ type: 'warn', text: '🔴 <strong>' + worstF.key + ' 베팅 한도 축소</strong> — ROI ' + worstF.roi.toFixed(0) + '%, ' + worstF.count + '건 부진. 이 유형 베팅금을 현재의 <strong>50%로 축소</strong>하세요.' });
  if (bestF && worstF && bestF.key !== worstF.key && bestF.roi !== null && bestF.roi > 10)
    actions.push({ type: 'good', text: '🟢 <strong>' + bestF.key + '에 집중</strong> — ROI ' + bestF.roi.toFixed(0) + '%. 전체 베팅의 ' + Math.min(70, Math.round(bestF.roi / 2 + 30)) + '% 이상 비중을 늘리세요.' });

  if (worstSport && worstSport.roi < -30 && worstSport.count >= 3)
    actions.push({ type: 'warn', text: '🔴 <strong>' + worstSport.sp + ' 베팅 중단 검토</strong> — ROI ' + worstSport.roi.toFixed(0) + '%, ' + worstSport.count + '건 부진. <strong>최소 2주 중단 후</strong> 원인 분석 권장.' });
  if (bestSport && bestSport.roi > 20 && bestSport.count >= 3)
    actions.push({ type: 'good', text: '🟢 <strong>' + bestSport.sp + ' 강점 종목</strong> — ROI ' + bestSport.roi.toFixed(0) + '%, ' + bestSport.count + '건. 이 종목 비중 확대 고려.' });

  const worstOdds = oddsData.length > 0 ? oddsData.slice().sort(function(a, b) { return a.actualEdge - b.actualEdge; })[0] : null;
  const bestOdds = oddsData.length > 0 ? oddsData.slice().sort(function(a, b) { return b.actualEdge - a.actualEdge; })[0] : null;
  if (worstOdds && worstOdds.actualEdge < -15 && worstOdds.count >= 3)
    actions.push({ type: 'warn', text: '🔴 <strong>' + worstOdds.label + ' 배당대 주의</strong> — 실제 엣지 ' + worstOdds.actualEdge.toFixed(0) + '%p, ' + worstOdds.count + '건. 예측 승률 ' + worstOdds.implAvg.toFixed(0) + '%보다 ' + Math.abs(worstOdds.actualEdge).toFixed(0) + '%p 낮게 실현 중. <strong>이 배당대 베팅 기준을 높이거나 잠시 쉬세요.</strong>' });
  const highOdds = oddsData.find(function(d) { return d.label === '3.5+'; });
  if (highOdds && highOdds.count >= 3) {
    if (highOdds.actualEdge < -10)
      actions.push({ type: 'caution', text: '⚠️ <strong>3.5+ 고배당 경고</strong> — 실제 적중률 ' + highOdds.actualWr.toFixed(0) + '% vs 내 예측 평균 훨씬 높음. 고배당에서 승률을 체계적으로 과대 추정하고 있을 가능성이 있습니다. EV+ 판단 재검토 필요.' });
    else if (highOdds.actualEdge > 10)
      actions.push({ type: 'good', text: '🟢 <strong>3.5+ 고배당 강점</strong> — 실제 엣지 +' + highOdds.actualEdge.toFixed(0) + '%p. 고배당 베팅에서 정보 우위가 있습니다.' });
  }
  if (bestOdds && bestOdds.actualEdge > 10 && bestOdds.count >= 3 && bestOdds.label !== '3.5+')
    actions.push({ type: 'good', text: '🟢 <strong>' + bestOdds.label + ' 배당대 강점</strong> — 실제 엣지 +' + bestOdds.actualEdge.toFixed(0) + '%p, ' + bestOdds.count + '건. 이 배당대 비중을 늘리세요.' });

  if (avgBias !== null && avgBias > 10)
    actions.push({ type: 'caution', text: '🟡 <strong>예측 승률 하향 조정 필요</strong> — 평균 낙관 편향 ' + avgBias.toFixed(1) + '%p. EV 계산 시 내 예상에서 <strong>' + Math.round(avgBias * 0.6) + '~' + Math.round(avgBias * 0.8) + '%p를 깎아서</strong> 입력하세요.' });
  if (lastBias !== null && lastBias < -5 && avgBias !== null && avgBias > 0)
    actions.push({ type: 'info', text: '🔵 <strong>최근 비관 편향으로 전환</strong> — 최근 MA5 ' + lastBias.toFixed(1) + '%p. 전체 평균은 낙관이었으나 최근 들어 승률을 보수적으로 보고 있습니다. 괜찮은 신호일 수 있으나, EV+ 기회를 놓치지 않도록 주의하세요.' });

  if (recentEdge !== null && predEdge !== null) {
    if (recentEdge > predEdge + 3)
      actions.push({ type: 'good', text: '📈 <strong>판단력 개선 중</strong> — 최근 10건 엣지 ' + recentEdge.toFixed(1) + '%p (전체 대비 +' + (recentEdge - predEdge).toFixed(1) + '%p). 현재 방식 유지하고 베팅 규모를 <strong>점진적으로 늘려도 됩니다.</strong>' });
    else if (recentEdge < predEdge - 3)
      actions.push({ type: 'warn', text: '📉 <strong>판단력 저하 감지</strong> — 최근 10건 엣지 ' + recentEdge.toFixed(1) + '%p (전체 대비 ' + (recentEdge - predEdge).toFixed(1) + '%p). <strong>베팅 규모를 줄이고</strong> 최근 미적중 패턴을 분석하세요.' });
  }
  if (resolved.length < 30)
    actions.push({ type: 'info', text: 'ℹ️ <strong>샘플 부족 (' + resolved.length + '건)</strong> — 위 제안은 참고용. 30건 이상부터 신뢰도가 높아집니다.' });

  // ── 종합 진단 lines ──
  const diagLines = [];
  diagLines.push('📋 <strong>분석 범위: ' + filterLabel + ' (' + resolved.length + '건 기준)</strong>');
  if (predEdge !== null)
    diagLines.push(predEdge >= 5
      ? '✅ <strong>예측 엣지 우수 (+' + predEdge.toFixed(1) + '%p)</strong> — 실현 엣지 ' + (actualEdgeVal !== null ? (actualEdgeVal >= 0 ? '+' : '') + actualEdgeVal.toFixed(1) + '%p' : '미집계') + '.'
      : predEdge >= 0
      ? '🟡 <strong>예측 엣지 소폭 (+' + predEdge.toFixed(1) + '%p)</strong> — 더 많은 샘플에서 일관성 확인 필요.'
      : '⚠️ <strong>예측 역엣지 (' + predEdge.toFixed(1) + '%p)</strong> — 승률 추정 방식을 점검하세요.');
  if (evTrust !== null)
    diagLines.push(evTrust >= 80
      ? '✅ <strong>EV 신뢰도 높음 (' + evTrust.toFixed(0) + '%)</strong> — 기댓값이 실제로 잘 실현되고 있습니다.'
      : evTrust >= 30
      ? '🟡 <strong>EV 신뢰도 보통 (' + evTrust.toFixed(0) + '%)</strong> — 배당·승률 입력을 점검하세요.'
      : '❌ <strong>EV 신뢰도 낮음 (' + evTrust.toFixed(0) + '%)</strong> — 승률 과대 추정 가능성.');
  if (folderData.length > 0) {
    const bfD = folderData.slice().sort(function(a, b) { return (b.roi || 0) - (a.roi || 0); })[0];
    const wfD = folderData.slice().sort(function(a, b) { return (a.roi || 0) - (b.roi || 0); })[0];
    if (bfD.key !== wfD.key)
      diagLines.push('📦 <strong>폴더별 ROI</strong> — ' + bfD.key + ' 최고(' + (bfD.roi != null ? (bfD.roi >= 0 ? '+' : '') + bfD.roi.toFixed(1) + '%' : '—') + '), ' + wfD.key + ' 최저(' + (wfD.roi != null ? (wfD.roi >= 0 ? '+' : '') + wfD.roi.toFixed(1) + '%' : '—') + ').');
  }
  if (avgBias !== null) {
    if (lastBias !== null && lastBias < -5 && avgBias > 0)
      diagLines.push('🔵 <strong>편향 전환 감지</strong> — 전체 낙관 편향 평균 ' + avgBias.toFixed(1) + '%p이나 최근 MA5 ' + lastBias.toFixed(1) + '%p로 비관 전환. 승률 추정이 보수화되는 중입니다.');
    else
      diagLines.push('🔮 <strong>낙관 편향 ' + avgBias.toFixed(1) + '%p</strong> — ' + (avgBias > 10 ? '승률 지속 과대 추정.' : avgBias > 3 ? '약한 낙관 편향.' : '편향 적음. 예측이 현실적입니다.'));
  }
  if (recentEdge !== null && predEdge !== null) {
    const d = recentEdge - predEdge;
    diagLines.push('📊 <strong>판단력 트렌드</strong> — 최근 10건 ' + recentEdge.toFixed(1) + '%p (' + (d >= 0 ? '+' : '') + d.toFixed(1) + '%p). ' + (d >= 2 ? '실력 향상 중.' : d <= -2 ? '최근 저하. 원인 분석 필요.' : '안정적.'));
  }
  if (resolved.length < 30)
    diagLines.push('ℹ️ <strong>샘플 ' + resolved.length + '건</strong> — 30건 이상부터 신뢰도가 높아집니다.');

  return {
    resolved:      resolved,
    predBets:      predBets,
    folderData:    folderData,
    sportRoi:      sportRoi,
    bestSport:     bestSport,
    worstSport:    worstSport,
    predEdge:      predEdge,
    actualEdgeVal: actualEdgeVal,
    evBets:        evBets,
    evTrust:       evTrust,
    trendData:     trendData,
    trendLabels:   trendLabels,
    recentEdge:    recentEdge,
    oddsData:      oddsData,
    biasMA:        biasMA,
    biasLabels:    biasLabels,
    avgBias:       avgBias,
    lastBias:      lastBias,
    chartMA:       { myMA: myMA, implMA: implMA, actMA: actMA, pL: pL },
    matrix:        matrix,
    sportMap:      sportMap,
    activeFkeys:   activeFkeys,
    actions:       actions,
    diagLines:     diagLines,
    filterLabel:   filterLabel
  };
}


// ── computeRoundHistory ──────────────────────────────────────
/**
 * 회차 이력 탭 계산
 * @param   {Array}  bets    — getBets() 결과
 * @param   {Array}  history — getRoundHistory() 결과
 * @param   {Date}   now     — new Date() (ui에서 전달)
 * @returns {{
 *   calStats:  { d7, d30, d90 },
 *   roundStats: { r3, r12, r36 },
 *   feedbackData: { show, diff, kind } | null,
 *   history
 * }}
 */
function computeRoundHistory(bets, history, now) {
  function calStats(days) {
    const from = new Date(now.getTime() - days * 86400000);
    const filtered = bets.filter(function(b) {
      if (!b.date || b.result === 'PENDING') return false;
      return new Date(b.date) >= from;
    });
    const wins = filtered.filter(function(b) { return b.result === 'WIN'; }).length;
    const profit = filtered.reduce(function(s, b) { return s + (b.profit || 0); }, 0);
    const invested = filtered.reduce(function(s, b) { return s + (b.amount || 0); }, 0);
    const roi = invested > 0 ? profit / invested * 100 : null;
    return { bets: filtered.length, wins: wins, profit: Math.round(profit), roi: roi };
  }

  function roundStats(n) {
    const slice = history.slice(-n);
    if (slice.length === 0) return null;
    const totalBets = slice.reduce(function(s, r) { return s + r.bets; }, 0);
    const totalWins = slice.reduce(function(s, r) { return s + r.wins; }, 0);
    const totalProfit = slice.reduce(function(s, r) { return s + r.profit; }, 0);
    const totalInvested = slice.reduce(function(s, r) { return s + r.invested; }, 0);
    const roi = totalInvested > 0 ? totalProfit / totalInvested * 100 : null;
    return { rounds: slice.length, bets: totalBets, wins: totalWins, profit: totalProfit, roi: roi };
  }

  const d7 = calStats(7);
  const d30 = calStats(30);
  const d90 = calStats(90);
  const r3 = roundStats(3);
  const r12 = roundStats(12);
  const r36 = roundStats(36);

  // ── 회차 관리 피드백 ──
  let feedbackData = null;
  if (history.length >= 3) {
    const cal7 = d7;
    const round3 = r3;
    if (cal7.bets > 0 && round3) {
      const calRoi = cal7.roi   || 0;
      const roundRoi = round3.roi || 0;
      const diff = Math.abs(calRoi - roundRoi);
      const kind = diff <= 1 ? 'good' : diff <= 3 ? 'caution' : 'bad';
      feedbackData = { show: true, diff: diff, kind: kind };
    }
  }

  return {
    calStats:     { d7: d7, d30: d30, d90: d90 },
    roundStats:   { r3: r3, r12: r12, r36: r36 },
    feedbackData: feedbackData,
    history:      history
  };
}


// ── computeBaseStats ─────────────────────────────────────────
/**
 * bets 배열만으로 계산 가능한 기초 통계 (입력 NaN과 무관)
 * computeRiskMetrics 조기 반환 시에도 항상 유효한 값 보장
 * @param   {Array}  bets — getBets() 결과
 * @param   {number} avgAmt — 평균 베팅금 (시뮬레이터에서 전달)
 * @returns {{ stddev: number, avgAmtRounded: number, resolvedCount: number }}
 */
function computeBaseStats(bets, avgAmt) {
  // resolvedCount: PENDING 제외 기준 (시스템 전체 일관성 유지)
  // stddev:        유효 profit(Number.isFinite) 기준 — 두 기준은 의도적으로 분리
  const resolved = bets.filter(function(b) { return b.result !== 'PENDING'; });

  // Number() 변환 후 유한수만 사용 — 문자열/undefined/NaN/VOID 등 전부 차단
  const profits = resolved
    .map(function(b) { return Number(b.profit); })
    .filter(Number.isFinite);

  // 샘플 0건 또는 1건 → 분산 의미 없음, stddev=0 고정
  if (profits.length <= 1) {
    return {
      stddev:        0,
      avgAmtRounded: Math.round(Number.isFinite(avgAmt) ? avgAmt : 0),
      resolvedCount: resolved.length
    };
  }

  const mean = profits.reduce(function(s, v) { return s + v; }, 0) / profits.length;
  const variance = profits.reduce(function(s, v) { return s + Math.pow(v - mean, 2); }, 0) / profits.length;

  return {
    stddev:        Math.sqrt(variance),
    avgAmtRounded: Math.round(Number.isFinite(avgAmt) ? avgAmt : 0),
    resolvedCount: resolved.length
  };
}


// ── computeRiskMetrics ───────────────────────────────────────
/**
 * 리스크 패널 계산
 * @param   {Array}  bets    — getBets() 결과
 * @param   {number} winRate — sim.winRate
 * @param   {number} avgOdds — sim.avgOdds
 * @param   {number} avgAmt  — sim.avgAmt
 * @param   {number} start   — sim.start (현재 뱅크롤)
 * @returns {{
 *   kelly, halfKelly, optAmt,
 *   kellyOk,        — boolean | null (입력 불능 시 null)
 *   riskLevel,      — 'high' | 'mid' | 'low' | null
 *   stddev,         — 항상 유효 (기초 통계)
 *   avgAmtRounded,  — 항상 유효 (기초 통계)
 *   resolvedCount   — 항상 유효
 * }}
 */
function computeRiskMetrics(bets, winRate, avgOdds, avgAmt, start) {
  const resolved = bets.filter(function(b) { return b.result !== 'PENDING'; });

  // ── 기초 통계 (입력 NaN 무관 — 항상 먼저 계산) ───────────
  const base = computeBaseStats(bets, avgAmt);

  // ── 입력 검증 — 의사결정 값은 유한수일 때만 계산 ─────────
  const inputsValid = Number.isFinite(winRate)
    && Number.isFinite(avgOdds)
    && Number.isFinite(avgAmt)
    && Number.isFinite(start);

  if (!inputsValid) {
    return {
      kelly:         null,
      halfKelly:     null,
      optAmt:        null,
      kellyOk:       null,
      riskLevel:     null,
      stddev:        base.stddev,
      avgAmtRounded: base.avgAmtRounded,
      resolvedCount: base.resolvedCount
    };
  }

  // ── 의사결정 값 계산 ──────────────────────────────────────
  const kelly = Math.max(0, (winRate * (avgOdds - 1) - (1 - winRate)) / (avgOdds - 1));
  const halfKelly = kelly / 2;
  const optAmt = Math.round(start * halfKelly / 1000) * 1000;
  const kellyOk = avgAmt <= optAmt * 1.2;
  const riskLevel = winRate < 0.45 ? 'high' : winRate < 0.50 ? 'mid' : 'low';

  // ── 출력 안전망 — 정상 경로에서도 NaN 차단 ───────────────
  return {
    kelly:         Number.isFinite(kelly)     ? kelly     : null,
    halfKelly:     Number.isFinite(halfKelly) ? halfKelly : null,
    optAmt:        Number.isFinite(optAmt)    ? optAmt    : null,
    kellyOk:       kellyOk,
    riskLevel:     riskLevel,
    stddev:        base.stddev,
    avgAmtRounded: base.avgAmtRounded,
    resolvedCount: base.resolvedCount
  };
}


// ── computeCalibration ───────────────────────────────────────
/**
 * 캘리브레이션 계산 — verify.js의 buildCalibBins + calcEceBias를
 * DOM 의존 없이 순수 함수로 이식. Decision Gate 입력값 생성용.
 *
 * @param   {Array} bets — getBets() 결과
 * @param   {number} [calibStep=5] — bin 단위 (%)
 * @returns {{
 *   eceRaw:    number|null,   // 원본 ECE (%)
 *   eceCalib:  number|null,   // 보정 후 ECE (%)
 *   biasRaw:   number|null,   // 원본 Bias (양수=과신)
 *   biasCalib: number|null,   // 보정 후 Bias
 *   bins:      Array,         // 구간별 상세 (차트용)
 *   predCount: number         // 예측 승률 입력된 베팅 수
 * }}
 */
function computeCalibration(bets, calibStep) {
  const step = calibStep || 5;
  const resolved = bets.filter(function(b) { return b.result === 'WIN' || b.result === 'LOSE'; });
  const predBets = resolved.filter(function(b) { return b.myProb != null && b.myProb > 0; });

  // ── 최소 샘플 가드 ────────────────────────────────────────
  // 샘플 부족 시 ECE 계산 생략 (노이즈 방지 — gate에서 calibInsufficient 처리)
  const MIN_CALIB_SAMPLES = 30;
  if (predBets.length < MIN_CALIB_SAMPLES) {
    return { eceRaw: null, eceCalib: null, biasRaw: null, biasCalib: null, bins: [], predCount: predBets.length };
  }

  // ── bin 집계 ─────────────────────────────────────────────
  const bins = [];
  for (let lo = 0; lo < 100; lo += step) {
    const hi = lo + step;
    const g = predBets.filter(function(b) { return b.myProb >= lo && b.myProb < hi; });
    if (g.length < 5) continue;

    const midRaw = g.reduce(function(s, b) { return s + b.myProb; }, 0) / g.length;
    const actWr = g.filter(function(b) { return b.result === 'WIN'; }).length / g.length * 100;

    const calibG = g.filter(function(b) { return b.calibProb != null; });
    const calibWr = calibG.length > 0
      ? calibG.reduce(function(s, b) { return s + b.calibProb * 100; }, 0) / calibG.length
      : null;

    bins.push({ lo: lo, hi: hi, count: g.length, midRaw: midRaw, actWr: actWr, calibWr: calibWr });
  }

  // ── ECE + Bias 계산 ──────────────────────────────────────
  const validBins = bins.filter(function(b) { return b.calibWr !== null; });
  const total = bins.reduce(function(s, b) { return s + b.count; }, 0);
  const totalCalib = validBins.reduce(function(s, b) { return s + b.count; }, 0);

  if (total === 0) {
    return { eceRaw: null, eceCalib: null, biasRaw: null, biasCalib: null, bins: [], predCount: predBets.length };
  }

  const eceRaw = bins.reduce(function(s, b) { return s + Math.abs(b.midRaw - b.actWr) * (b.count / total); }, 0);
  const biasRaw = bins.reduce(function(s, b) { return s + (b.midRaw - b.actWr) * (b.count / total); }, 0);

  const eceCalib = totalCalib > 0
    ? validBins.reduce(function(s, b) { return s + Math.abs(b.calibWr - b.actWr) * (b.count / totalCalib); }, 0)
    : null;
  const biasCalib = totalCalib > 0
    ? validBins.reduce(function(s, b) { return s + (b.calibWr - b.actWr) * (b.count / totalCalib); }, 0)
    : null;

  return {
    eceRaw:    eceRaw,
    eceCalib:  eceCalib,
    biasRaw:   biasRaw,
    biasCalib: biasCalib,
    bins:      bins,
    predCount: predBets.length
  };
}


// ── computeSystemState ───────────────────────────────────────
/**
 * 중앙 계산 엔진 — 순수 함수
 * 전역 접근 0건. 모든 입력은 파라미터로 수신.
 *
 * @param {Array}  scopedBets  현재 scope 기반 KPI 계산용 베팅 배열
 * @param {Array}  allBets     전체 히스토리 (Kelly, 학습용)
 * @param {object} settings
 *   kelly: { seed, bankroll, maxBetPct, kellyGradeAdj, prevMultiplier }
 *   target: { fund }
 *   scope, scopeProject, activeRound  ← getCurrentScope/Project/getActiveRound 결과 주입
 *
 * @returns {object}  window._SS 와 동일한 구조 + _nextMultiplier
 */
function computeSystemState(scopedBets, allBets, settings, context = {}) {
  // scopedBets: 현재 scope 기반 KPI 계산
  // allBets: 전체 히스토리 (Kelly, 학습용)
  // context: 읽기 전용 메타 (scope, project, activeRound) — 계산 로직에 사용 금지

  const resolved = scopedBets.filter(b => b.result !== 'PENDING');

  // ── 집합 분리 ──────────────────────────────────────────────
  // allResolved : 시뮬 제외 전체 실제 기록
  //   → winRate, streak, ECE, calibration, predBets, gate 판단
  // moneyResolved: 현재 시즌 + 실제 금액 기록
  //   → totalProfit, totalInvest, roi, bankroll, drawdown, Kelly, verdict
  const _curSeason = (Number.isInteger(getSettings().currentFinSeason) &&
    getSettings().currentFinSeason >= 1)
    ? getSettings().currentFinSeason : 1;

  const allResolved  = resolved.filter(b => !b.isSim);

  // ── scope authority: state.js (getCurrentScope) → context.scope 경유 전달.
  // compute layer는 scope policy owner가 아님 — fallback만 담당.
  // fallback='all': 정상 runtime 경로(state.js)는 항상 scope를 명시 전달하므로
  //   미지정은 오직 직접 호출(테스트 등) 케이스. silent widening 방지를 위해 warn.
  const _scope = context.scope ?? 'all';
  if (typeof window !== 'undefined' && window.App?.debug && context.scope === undefined) {
    console.warn(
      '[computeSystemState] context.scope 미지정 — all로 폴백. ' +
      '정상 경로(state.js)는 scope를 명시 전달해야 합니다.'
    );
  }
  const _isAllScope = _scope === 'all';

  // finSeason 필터:
  //   scope='all'  → 시즌 무관 전체 손익 집계 (UI scope가 이미 범위 결정)
  //   그 외        → 현재 시즌만 (stats 탭 등 시즌 경계 기준 집계)
  const moneyResolved = allResolved.filter(b =>
    (_isAllScope || b.finSeason === _curSeason) &&
    b.amount > 0 &&
    Number.isFinite(b.profit)
  );

  const wins = allResolved.filter(b => b.result === 'WIN');
  const n    = allResolved.length;

  // ── 1. 기초 통계 ──────────────────────────────────────────
  const winRate     = n > 0 ? wins.length / n : 0;
  const totalProfit = moneyResolved.reduce((s,b) => s + (b.profit||0), 0);
  const totalInvest = moneyResolved.reduce((s,b) => s + (b.amount||0), 0);
  const roi         = totalInvest > 0 ? totalProfit / totalInvest * 100 : 0;
  const avgOdds     = n > 0 ? allResolved.reduce((s,b) => s + (b.betmanOdds||1.9), 0) / n : 1.9;
  const avgAmt      = moneyResolved.length > 0 ? totalInvest / moneyResolved.length : 0;

  // 최근 10건 (승률 기준 — allResolved)
  const rec10    = allResolved.slice(-10);
  const rec10wr  = rec10.length ? rec10.filter(b=>b.result==='WIN').length / rec10.length : winRate;
  // 최근 10건 ROI는 moneyResolved 기준
  const rec10money = moneyResolved.slice(-10);
  const rec10roi = rec10money.length
    ? rec10money.reduce((s,b)=>s+b.profit,0) / (rec10money.reduce((s,b)=>s+b.amount,0)||1) * 100
    : roi;

  // 최근 5건 컨디션 (손익 — moneyResolved)
  const rec5    = moneyResolved.slice(-5);
  const rec5net = rec5.reduce((s,b)=>s+b.profit,0);

  // 연속 스트릭 (allResolved 기준 — sim 제외 실제 운영 흐름)
  let streak = 0, streakType = '';
  for (let i = allResolved.length-1; i >= 0; i--) {
    const r = allResolved[i].result;
    if (i === allResolved.length-1) { streakType = r; streak = 1; }
    else if (r === streakType) streak++;
    else break;
  }

  // 손익비 (moneyResolved 기준)
  const profBets  = moneyResolved.filter(b=>b.profit>0);
  const lossBets  = moneyResolved.filter(b=>b.profit<0);
  const avgProfit = profBets.length ? profBets.reduce((s,b)=>s+b.profit,0)/profBets.length : 0;
  const avgLoss   = lossBets.length ? Math.abs(lossBets.reduce((s,b)=>s+b.profit,0)/lossBets.length) : 1;
  const plRatio   = avgLoss > 0 ? avgProfit / avgLoss : 0;

  // ── 2. 보정도(ECE) + 과신 보정계수 (allResolved 기준) ─────
  const predBets = allResolved.filter(b => b.myProb && b.betmanOdds);
  const CALIB_BUCKETS = [
    {min:0,  max:10, mid:5 }, {min:10, max:20, mid:15},
    {min:20, max:30, mid:25}, {min:30, max:40, mid:35},
    {min:40, max:50, mid:45}, {min:50, max:60, mid:55},
    {min:60, max:70, mid:65}, {min:70, max:80, mid:75},
    {min:80, max:90, mid:85}, {min:90, max:101,mid:95}
  ];
  const calibRows = CALIB_BUCKETS.map(bk => {
    const g = predBets.filter(x => x.myProb >= bk.min && x.myProb < bk.max);
    if (g.length < 3) return null;
    const avgProb = g.reduce((s,x)=>s+x.myProb,0)/g.length;
    const actWr   = g.filter(x=>x.result==='WIN').length/g.length*100;
    return { mid:bk.mid, avgProb, actWr, count:g.length, diff: actWr - avgProb };
  }).filter(Boolean);

  const calibTotal = calibRows.reduce((s,r)=>s+r.count,0);
  const ece = calibRows.length > 0
    ? calibRows.reduce((s,r) => s + (r.diff < 0 ? Math.abs(r.diff) : Math.abs(r.diff)*0.2)*r.count, 0) / calibTotal
    : null;

  const corrFactor = calibRows.length > 0
    ? calibRows.reduce((s,r) => s + (r.actWr/r.avgProb)*r.count, 0) / calibTotal
    : 1.0;

  const rawEdge = predBets.length > 0
    ? predBets.reduce((s,b) => s + (b.myProb - 100/b.betmanOdds), 0) / predBets.length
    : null;
  const corrEdge = (rawEdge !== null && corrFactor > 0)
    ? predBets.reduce((s,b) => s + (b.myProb*corrFactor - 100/b.betmanOdds), 0) / predBets.length
    : null;

  // ── 2b. Recent ECE (최근 N건 기준) ──────────────────────────
  const RECENT_ECE_N = 20;
  const recentPredBets = predBets.slice(-RECENT_ECE_N);
  let recentEce = null;
  if (recentPredBets.length >= 5) {
    const recentCalibRows = CALIB_BUCKETS.map(bk => {
      const g = recentPredBets.filter(x => x.myProb >= bk.min && x.myProb < bk.max);
      if (g.length < 2) return null;
      const avgProb = g.reduce((s,x)=>s+x.myProb,0)/g.length;
      const actWr   = g.filter(x=>x.result==='WIN').length/g.length*100;
      return { avgProb, actWr, count:g.length, diff: actWr - avgProb };
    }).filter(Boolean);
    if (recentCalibRows.length > 0) {
      const recentTotal = recentCalibRows.reduce((s,r)=>s+r.count,0);
      recentEce = recentCalibRows.reduce((s,r) =>
        s + (r.diff < 0 ? Math.abs(r.diff) : Math.abs(r.diff)*0.2)*r.count, 0
      ) / recentTotal;
    }
  }

  // ── 2c. adjustedProb 계산 헬퍼 (bucket 기반 우선) ───────────
  function _calcAdjustedProb(myProbPct) {
    if (!myProbPct || myProbPct <= 0) return myProbPct;
    const bucket = calibRows.find(r => {
      const bk = CALIB_BUCKETS.find(b => b.mid === r.mid);
      return bk && myProbPct >= bk.min && myProbPct < bk.max;
    });
    if (bucket && bucket.count >= 5) {
      return bucket.actWr;
    }
    const cf = Math.min(corrFactor, 1.0);
    return myProbPct * cf;
  }

  // ── 2d. Decision Gate ────────────────────────────────────────
  function _getBetDecision(myProbPct) {
    const sampleSize = myProbPct
      ? (() => {
          const bk = CALIB_BUCKETS.find(b => myProbPct >= b.min && myProbPct < b.max);
          const row = bk ? calibRows.find(r => r.mid === bk.mid) : null;
          return row ? row.count : predBets.length;
        })()
      : predBets.length;

    if (recentEce !== null && recentEce > 15) {
      return { allow: false, kellyFactor: 0, reason: 'RECENT_ECE_BLOCK',
               label: 'BLOCK', labelColor: 'var(--red)',
               desc: `최근 ECE ${recentEce.toFixed(1)}% → 베팅 차단` };
    }
    if (recentEce !== null && recentEce > 10) {
      return { allow: true, kellyFactor: 0.2, reason: 'RECENT_ECE_HIGH',
               label: 'REDUCE', labelColor: 'var(--red)',
               desc: `최근 ECE ${recentEce.toFixed(1)}% → Kelly 0.2배` };
    }
    if (ece !== null && ece > 15) {
      return { allow: true, kellyFactor: 0.2, reason: 'HIGH_ECE',
               label: 'REDUCE', labelColor: 'var(--red)',
               desc: `ECE ${ece.toFixed(1)}% → Kelly 0.2배` };
    }
    if (ece !== null && ece > 8) {
      return { allow: true, kellyFactor: 0.4, reason: 'MID_ECE',
               label: 'REDUCE', labelColor: '#ff9800',
               desc: `ECE ${ece.toFixed(1)}% → Kelly 0.4배` };
    }
    if (sampleSize < 10) {
      return { allow: true, kellyFactor: 0.3, reason: 'LOW_SAMPLE',
               label: 'REDUCE', labelColor: '#ff9800',
               desc: `구간 표본 ${sampleSize}건 → Kelly 0.3배` };
    }
    if (sampleSize < 30) {
      return { allow: true, kellyFactor: 0.6, reason: 'MID_SAMPLE',
               label: 'REDUCE', labelColor: 'var(--gold)',
               desc: `구간 표본 ${sampleSize}건 → Kelly 0.6배` };
    }
    return { allow: true, kellyFactor: 1.0, reason: 'OK',
             label: 'OK', labelColor: 'var(--green)',
             desc: 'ECE·표본 조건 충족' };
  }

  const betDecision = _getBetDecision(null);

  const withPred = allResolved.filter(b => b.myProb != null && b.myProb > 0);
  const avgBias  = withPred.length > 0
    ? withPred.reduce((s,b) => s + (b.myProb - (b.result==='WIN'?100:0)), 0) / withPred.length
    : 0;

  // ── 3. 예측력 등급 (ECE 완전 통합) ────────────────────────
  let grade = null;
  if (predBets.length >= 5) {
    const useEdge  = corrEdge !== null ? corrEdge : rawEdge || 0;
    const edgeSc   = Math.min(100, Math.max(0, (useEdge + 5) / 20 * 100));
    const calibSc  = ece !== null ? Math.max(0, 100 - ece * 2) : 50;
    const edges    = predBets.map(b => b.myProb - 100/b.betmanOdds);
    const edgeMean = edges.reduce((s,v)=>s+v,0)/edges.length;
    const edgeStd  = Math.sqrt(edges.reduce((s,v)=>s+(v-edgeMean)**2,0)/edges.length);
    const consSc   = Math.max(0, Math.min(100, 100 - edgeStd * 3));
    const rec10p    = predBets.slice(-10);
    const recEdge   = rec10p.length > 0
      ? rec10p.reduce((s,b) => s + (b.myProb*corrFactor - 100/b.betmanOdds), 0) / rec10p.length
      : useEdge;
    const formSc    = Math.min(100, Math.max(0, (recEdge + 5) / 20 * 100));
    const totalSc = edgeSc*0.35 + calibSc*0.30 + consSc*0.20 + formSc*0.15;
    const letter = totalSc >= 85 ? 'S' : totalSc >= 70 ? 'A' : totalSc >= 55 ? 'B' : totalSc >= 40 ? 'C' : 'D';
    const color  = letter==='S'?'#ffd700':letter==='A'?'#00e676':letter==='B'?'var(--accent)':letter==='C'?'#ff9800':'var(--red)';
    const gradeMult  = letter==='S'||letter==='A'?1.0:letter==='B'?0.8:letter==='C'?0.6:0.4;
    const eceMult    = ece===null?1.0:ece<=5?1.0:ece<=10?0.75:ece<=15?0.5:0.25;
    const kellyMult  = gradeMult * eceMult;
    grade = { letter, color, totalScore:Math.round(totalSc),
              edgeSc:Math.round(edgeSc), calibSc:Math.round(calibSc),
              consSc:Math.round(consSc), formSc:Math.round(formSc),
              mult: kellyMult, gradeMult, eceMult,
              rawEdge, corrEdge, corrFactor, recEdge };
  }

  // ── 4. 켈리 권장금 (kelly.js 위임) ──────────────────────
  // gradeAdj는 내부 계산 결과(grade)에 의존 — settings로 주입 불가
  const seed       = settings.kelly.seed;
  const bankroll   = settings.kelly.bankroll;
  const gradeAdj   = settings.kelly.kellyGradeAdj && grade ? grade.mult : 1.0;

  // allResolvedBets: allBets 전체 히스토리 기반 (scopedBets 아님)
  const allResolvedBets = allBets.filter(b => b.result === 'WIN' || b.result === 'LOSE');

  const _kellyResult = computeKellyUnit({
    seed,
    bankroll,
    maxBetPct:       settings.kelly.maxBetPct || 5,
    gradeAdj,
    kellyGradeAdj:   !!settings.kelly.kellyGradeAdj,
    decisionFactor:  betDecision.kellyFactor,
    allResolvedBets,
    prevMultiplier:  settings.kelly.prevMultiplier,
  });

  const kellyUnit          = _kellyResult.kellyUnit;
  const maxUnit            = _kellyResult.maxUnit;
  const adaptiveMultiplier = _kellyResult.adaptiveMultiplier;
  const rec30roi           = _kellyResult.rec30roi;

  // ── 5. 목표 달성 시뮬레이션 (보정된 켈리 반영) ────────────
  const goalTarget = settings.target.fund || 0;
  let goalSim = null;
  if (goalTarget > 0 && bankroll > 0 && moneyResolved.length >= 5) {
    const RUNS  = 500;
    const STEPS = Math.max(moneyResolved.length, 30);
    const profitPool = moneyResolved.map(b => b.profit);
    const adjPool = corrFactor < 1
      ? profitPool.map(p => p > 0 ? p * corrFactor : p)
      : profitPool;

    let reached = 0, totalSteps = 0;
    const s0 = (n * 7919) >>> 0;
    const sr = s0;
    const rng = () => { sr = ((sr*1664525)+1013904223)>>>0; return sr/4294967296; };

    for (let r = 0; r < RUNS; r++) {
      let bal = 0; let done = false;
      for (let i = 0; i < STEPS; i++) {
        bal += adjPool[Math.floor(rng()*adjPool.length)];
        if (!done && bankroll + bal >= goalTarget) { reached++; totalSteps += i+1; done = true; }
        if (bankroll + bal <= 0) break;
      }
    }
    const goalProb = reached / RUNS * 100;
    const ago4w    = new Date(Date.now() - 28*24*3600*1000);
    const weeklyN  = scopedBets.filter(b=>b.date&&new Date(b.date)>=ago4w).length / 4 || 5;
    const avgSteps = reached > 0 ? totalSteps / reached : null;
    const weeksEst = avgSteps ? Math.ceil(avgSteps / weeklyN) : null;

    goalSim = { prob: goalProb, weeksEst, weeklyN, remaining: goalTarget - bankroll };
  }

  // ── 6. 종합 판단 점수 (7개 신호) ─────────────────────────
  const breakeven  = 1 / avgOdds;
  const scoreProfitSig = Math.min(100, Math.max(0, roi * 5 + 50));
  const scoreEdgeSig   = Math.min(100, Math.max(0, (winRate - breakeven) * 400 + 50));
  const scoreRiskSig   = Math.min(100, Math.max(0, plRatio * 25 + 20));
  const scoreFormSig   = Math.min(100, Math.max(0, (rec5net>0?70:30) + Math.min(30, Math.abs(rec5net)/(avgAmt||1)*20*(rec5net>0?1:-1))));
  const scoreBiasSig   = Math.min(100, Math.max(0, 80 - Math.abs(avgBias)*3));
  const scoreSampleSig = Math.min(100, n * 2);
  const scoreCalibSig  = grade ? grade.calibSc : (n > 0 ? 50 : 0);
  const sigScores = [scoreProfitSig, scoreEdgeSig, scoreRiskSig, scoreFormSig, scoreBiasSig, scoreSampleSig, scoreCalibSig];
  const overallScore = sigScores.reduce((s,v)=>s+v,0) / sigScores.length;

  // ── 7. 최종 베팅 판단 ─────────────────────────────────────
  const warnings = [];
  const stops    = [];

  if (ece !== null && ece > 15)   stops.push(`보정 오차 ${ece.toFixed(1)}% — 켈리 신뢰 불가`);
  if (recentEce !== null && recentEce > 15) stops.push(`최근 ECE ${recentEce.toFixed(1)}% — 베팅 차단`);
  if (streak >= 5 && streakType==='LOSE') stops.push(`${streak}연패 진행 중 — 감정적 베팅 위험`);
  if (grade && grade.letter === 'D') stops.push(`예측력 D등급 — 베팅 규모 최소화`);
  if (avgBias > 20)  warnings.push(`낙관 편향 ${avgBias.toFixed(1)}%p — myProb 재검토`);
  if (ece !== null && ece > 8 && ece <= 15) warnings.push(`보정 오차 ${ece.toFixed(1)}% — 분수 켈리 적용`);
  if (recentEce !== null && recentEce > 10 && recentEce <= 15) warnings.push(`최근 ECE ${recentEce.toFixed(1)}% — Kelly 0.2배 축소 중`);
  if (rec10roi < -15) warnings.push(`최근 10건 ROI ${rec10roi.toFixed(1)}% — 슬럼프 가능성`);
  if (streak >= 3 && streakType==='LOSE') warnings.push(`${streak}연패 — 분석 강화 권장`);

  const verdict = stops.length > 0  ? 'STOP'
                : warnings.length > 0 ? 'CAUTION'
                : n < 10             ? 'WAIT'
                : 'GO';

  const verdictInfo = {
    GO:      { label:'베팅 가능',    color:'var(--green)', icon:'🟢', desc:'현재 지표 정상. 켈리 기준 유지.' },
    CAUTION: { label:'주의 베팅',    color:'#ff9800',      icon:'🟡', desc: warnings[0] || '일부 지표 주의.' },
    STOP:    { label:'베팅 보류',    color:'var(--red)',   icon:'🔴', desc: stops[0]    || '주요 지표 경고.' },
    WAIT:    { label:'데이터 축적 중', color:'var(--text3)', icon:'⚪', desc:`${10-n}건 더 쌓이면 판단 가능.` }
  }[verdict];

  // ── 결과 객체 반환 ────────────────────────────────────────
  return {
    // raw
    resolved: allResolved, wins, n,
    moneyResolved,
    // 기초
    winRate, totalProfit, totalInvest, roi, avgOdds, avgAmt,
    rec10, rec10wr, rec10roi, rec5, rec5net,
    streak, streakType, plRatio, avgBias,
    // 보정도
    predBets, calibRows, ece, corrFactor,
    activeCorrFactor: getCalibCorrFactor(corrFactor, n),
    rawEdge, corrEdge,
    // Decision Layer
    recentEce,
    betDecision,
    calibBuckets: calibRows,
    // 등급
    grade,
    // 켈리
    seed, bankroll, kellyUnit, gradeAdj, maxUnit,
    rec30roi, multiplier: adaptiveMultiplier,
    // 목표
    goalTarget, goalSim,
    // 종합판단
    sigScores, overallScore,
    labels: ['수익성','예측 엣지','리스크 관리','현재 컨디션','편향 없음','데이터 신뢰도','보정도'],
    icons:  ['💰','🎯','🛡','🌡','👁','📦','📐'],
    verdict, verdictInfo, warnings, stops,
    // scope 메타 (context에서 매핑 — 내부명 → 외부 window._SS 구조 유지)
    scope:        context.scope         || null,
    scopeProject: context.project       || null,
    scopedTotal:  scopedBets.length,
    activeRound:  context.activeRound   || null,
    // 타임스탬프
    _ts: Date.now(),
    // 히스테리시스 상태 — 어댑터가 window.App.kellyPrevMultiplier에 저장
    _nextMultiplier: _kellyResult.nextMultiplier,
  };
}


// ── computeAdjProbHint ────────────────────────────────────────
// _renderAdjProbHint의 순수 계산 레이어
// 입력: raw(원본 확률%), adj(보정 확률%), n(데이터 건수)
// 출력: { waiting, n, diff, diffStr, color, label, strength } | { waiting: true, n, needed }
function computeAdjProbHint(raw, adj, n) {
  if (n < 30) {
    return { waiting: true, n, needed: 30 - n };
  }
  const diff     = adj - raw;
  const diffStr  = (diff >= 0 ? '+' : '') + diff.toFixed(1);
  const color    = diff < -2 ? 'var(--red)' : diff > 2 ? 'var(--green)' : 'var(--accent)';
  const label    = diff < -2 ? '⚠️ 과신 보정' : diff > 2 ? '📈 과소추정 보정' : '✅ 소폭 보정';
  const strength = n < 50 ? `50% 강도 (${n}건)` : `100% 강도 (${n}건)`;
  return { waiting: false, n, diff, diffStr, color, label, strength, raw, adj };
}


// ── computeDashboardKPI ──────────────────────────────────────
// updateDashboardKPI의 순수 계산 레이어
// 입력: ss (computeSystemState 결과 객체), resolveds (SS.resolved)
// 출력: 대시보드 표시에 필요한 모든 수치
function computeDashboardKPI(ss) {
  if (!ss) return null;
  const totalBets     = ss.n;
  const winRate       = ss.winRate * 100;
  const totalProfit   = ss.totalProfit;
  const totalInvested = ss.totalInvest;
  const roi           = ss.roi;
  const avgOdds       = ss.avgOdds;

  const valueBets    = ss.resolved.filter(b => b.isValue);
  const valueWins    = valueBets.filter(b => b.result === 'WIN');
  const valueWinRate = valueBets.length > 0 ? (valueWins.length / valueBets.length * 100) : 0;
  const oddsCount    = ss.resolved.filter(b => b.betmanOdds > 0).length;

  return {
    totalBets, winRate, totalProfit, totalInvested, roi, avgOdds,
    valueWinRate, oddsCount,
  };
}


// ── computeStatsDisplay ──────────────────────────────────────
// stats.js 상단 통계 카드의 순수 계산 레이어
// 입력: ss (computeSystemState 결과), resolved (결과 확정 베팅 배열)
// 출력: winRate, roi, plRatio 수치 + 메타
function computeStatsDisplay(ss, resolved) {
  const wins = ss ? ss.wins : resolved.filter(b => b.result === 'WIN');
  const winRate       = ss ? ss.winRate       : wins.length / (resolved.length || 1);
  const totalProfit   = ss ? ss.totalProfit   : resolved.reduce((s, b) => s + b.profit, 0);
  const totalInvested = ss ? ss.totalInvest   : resolved.reduce((s, b) => s + b.amount, 0);
  const roi           = ss ? ss.roi           : (totalInvested > 0 ? totalProfit / totalInvested * 100 : 0);

  let plRatio;
  if (ss && ss.plRatio > 0) {
    plRatio = ss.plRatio;
  } else {
    const wb = resolved.filter(b => b.result === 'WIN');
    const lb = resolved.filter(b => b.result === 'LOSE');
    const aw = wb.length > 0 ? wb.reduce((s, b) => s + b.profit, 0) / wb.length : 0;
    const al = lb.length > 0 ? Math.abs(lb.reduce((s, b) => s + b.profit, 0) / lb.length) : 0;
    plRatio  = (al > 0 && wb.length > 0) ? aw / al : null;
  }

  return {
    wins, winRate, totalProfit, totalInvested, roi,
    winsCount: Array.isArray(wins) ? wins.length : wins,
    resolvedCount: resolved.length,
    plRatio,
  };
}


// ── computeRecentRows ────────────────────────────────────────
// renderRecentTable의 순수 계산 레이어
// 입력:
//   resolved    — 결과 확정 베팅 배열 (SS.resolved 또는 폴백 배열)
//   pendingBets — PENDING 상태 베팅 배열
//   limit       — 최대 반환 건수 (기본 8)
// 출력: 최신순 정렬 후 limit건 슬라이스된 배열
// 규칙:
//   - profit이 NaN/null/undefined → 0으로 정규화
//   - date 동일(빈 문자열 포함) 시 원래 순서 유지 (안정 정렬)
//   - resolved + pendingBets 합산 후 정렬
function computeRecentRows(resolved, pendingBets, limit = 8) {
  const _resolved = Array.isArray(resolved)    ? resolved    : [];
  const _pending  = Array.isArray(pendingBets) ? pendingBets : [];

  const merged = [..._resolved, ..._pending].map((b, i) => ({
    ...b,
    profit: (typeof b.profit === 'number' && isFinite(b.profit)) ? b.profit : 0,
    _idx: i,  // 안정 정렬용 원본 인덱스
  }));

  merged.sort((a, b) => {
    const dateCmp = (b.date || '').localeCompare(a.date || '');
    return dateCmp !== 0 ? dateCmp : a._idx - b._idx;
  });

  return merged.slice(0, limit).map(({ _idx, ...rest }) => rest);
}


// ── 자기 무결성 체크 ─────────────────────────────────────────
console.assert(typeof computeAnalyzeMetrics === 'function', '[compute.js] computeAnalyzeMetrics not defined');
console.assert(typeof computeSimulation     === 'function', '[compute.js] computeSimulation not defined');
console.assert(typeof computeJudgeMetrics   === 'function', '[compute.js] computeJudgeMetrics not defined');
console.assert(typeof computeRoundHistory   === 'function', '[compute.js] computeRoundHistory not defined');
console.assert(typeof computeRiskMetrics    === 'function', '[compute.js] computeRiskMetrics not defined');
console.assert(typeof computeCalibration    === 'function', '[compute.js] computeCalibration not defined');
console.assert(typeof computeSystemState    === 'function', '[compute.js] computeSystemState not defined');
console.assert(typeof computeAdjProbHint    === 'function', '[compute.js] computeAdjProbHint not defined');
console.assert(typeof computeDashboardKPI   === 'function', '[compute.js] computeDashboardKPI not defined');
console.assert(typeof computeStatsDisplay   === 'function', '[compute.js] computeStatsDisplay not defined');
console.assert(typeof computeRecentRows     === 'function', '[compute.js] computeRecentRows not defined');

// ── [MIGRATION] App.compute namespace 등록 ───────────────────
// 현재 전역 함수(computeBaseStats() 등 직접 호출)는 그대로 동작함.
// 목표: 호출 경로를 window.App.compute.* 로 점진 이전.
// 전역 선언 제거는 별도 PR에서 진행. (이 단계는 migration path 생성)
if (typeof window !== 'undefined') {
  if (!window.App) window.App = {};
  if (!window.App.compute) window.App.compute = {};
  window.App.compute = {
    // 내부 유틸 (필요 시 접근 가능)
    _percentile,
    _seededRand,
    // 공개 API
    computeAnalyzeMetrics,
    computeSimulation,
    computeJudgeMetrics,
    computeRoundHistory,
    computeBaseStats,
    computeRiskMetrics,
    computeCalibration,
    computeSystemState,
    computeAdjProbHint,
    computeDashboardKPI,
    computeStatsDisplay,
    computeRecentRows,
  };
  if (window.App.debug) {
    console.debug('[bootstrap] App.compute attached', Object.keys(window.App.compute));
  }
}
