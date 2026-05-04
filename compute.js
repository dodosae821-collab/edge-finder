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
  var sorted = arr.slice().sort(function(a, b) { return a - b; });
  var idx    = Math.floor(sorted.length * p / 100);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function _seededRand(seed) {
  var s = (seed || 1) >>> 0;
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
  var resolved = bets.filter(function(b) { return b.result !== 'PENDING'; });

  // 베팅당 평균 손익 (반올림 포함 — 렌더 시 Math 호출 제거)
  var totalProfit = resolved.reduce(function(s, b) { return s + (b.profit || 0); }, 0);
  var avgProfit   = resolved.length > 0 ? Math.round(totalProfit / resolved.length) : null;

  // EV 평균
  var evBets = bets.filter(function(b) { return b.ev !== undefined && b.ev !== null; });
  var evAvg  = evBets.length > 0
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
  var start      = config.start;
  var goalTarget = config.goalTarget;
  var simGrade   = config.simGrade;

  var resolved = bets.filter(function(b) { return b.result !== 'PENDING'; });
  var wins     = resolved.filter(function(b) { return b.result === 'WIN'; });

  var winRate = resolved.length > 0 ? wins.length / resolved.length : 0.5;
  var avgOdds = resolved.length > 0
    ? resolved.reduce(function(s, b) { return s + (b.betmanOdds || 1.9); }, 0) / resolved.length
    : 1.9;
  var avgAmt = resolved.length > 0
    ? resolved.reduce(function(s, b) { return s + b.amount; }, 0) / resolved.length
    : 100000;
  var evPerBet = (winRate * (avgOdds - 1) - (1 - winRate)) * avgAmt;

  var simMult   = simGrade ? simGrade.mult : 1.0;
  var useRecent = simGrade && (simGrade.letter === 'C' || simGrade.letter === 'D');
  var simPool   = useRecent ? resolved.slice(-30) : resolved;

  var RUNS  = 1000;
  var STEPS = simPool.length >= 5 ? simPool.length : 30;
  var seed0 = (simPool.length * 7919) >>> 0;
  var rand  = _seededRand(seed0);

  var profitPool = simPool.length >= 5
    ? simPool.map(function(b) { return b.profit * simMult; })
    : null;

  var allPaths       = [];
  var ruinCount      = 0;
  var goalReachSteps = [];
  var maxStreaks     = [];

  for (var r = 0; r < RUNS; r++) {
    var bal = 0;
    var path = [0];
    var ruin = false;
    var curStreak = 0; var maxStreak = 0;
    var goalReached = false;

    for (var i = 0; i < STEPS; i++) {
      var profit;
      if (profitPool) {
        var idx = Math.floor(rand() * profitPool.length);
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

  var p10 = [], p25 = [], p50 = [], p75 = [], p90 = [];
  for (var step = 0; step <= STEPS; step++) {
    var vals = allPaths.map(function(p) { return p[step]; });
    p10.push(_percentile(vals, 10));
    p25.push(_percentile(vals, 25));
    p50.push(_percentile(vals, 50));
    p75.push(_percentile(vals, 75));
    p90.push(_percentile(vals, 90));
  }

  var actualPath = [0];
  var sortedBets = resolved.slice().sort(function(a, b) {
    return (a.date || '').localeCompare(b.date || '');
  });
  var cum = 0;
  sortedBets.forEach(function(b) { cum += b.profit; actualPath.push(Math.round(cum)); });

  var labels = Array.from({ length: STEPS + 1 }, function(_, i) {
    return i === 0 ? '시작' : '+' + i + '번';
  });

  // 파생 통계 — 렌더 시 Math 호출 제거 위해 여기서 완성
  var ruinProb  = parseFloat((ruinCount / RUNS * 100).toFixed(1));
  var medGoal   = goalReachSteps.length > 0 ? _percentile(goalReachSteps, 50) : null;
  var p90streak = _percentile(maxStreaks, 90);
  var pathMins  = allPaths.map(function(p) {
    return p.reduce(function(m, v) { return v < m ? v : m; }, 0);
  });
  pathMins.sort(function(a, b) { return a - b; });
  var worstMin    = pathMins[Math.floor(RUNS * 0.1)] || 0;
  var worstMinAbs = worstMin < 0 ? Math.round(Math.abs(worstMin)) : null;

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
  var allResolved = bets.filter(function(b) { return b.result !== 'PENDING'; });
  var resolved    = (filter === 'all' || filter === undefined)
    ? allResolved : allResolved.slice(-filter);

  var filterLabel = (filter === 'all' || filter === undefined) ? '전체' : '최근 ' + filter + '건';

  // ── 폴더별 ──
  var folderKeys = ['단폴', '2폴', '3폴', '4폴+'];
  var folderData = folderKeys.map(function(key) {
    var g = resolved.filter(function(b) {
      if (key === '단폴') return b.mode !== 'multi';
      var fc = parseInt(b.folderCount) || 0;
      if (key === '2폴') return b.mode === 'multi' && fc === 2;
      if (key === '3폴') return b.mode === 'multi' && fc === 3;
      return b.mode === 'multi' && fc >= 4;
    });
    var profit   = g.reduce(function(s, b) { return s + (b.profit || 0); }, 0);
    var invested = g.reduce(function(s, b) { return s + (b.amount || 0); }, 0);
    var roi      = invested > 0 ? profit / invested * 100 : null;
    var cumEv    = g.reduce(function(s, b) {
      if (b.ev != null) return s + (b.amount || 0) * b.ev;
      if (b.myProb && b.betmanOdds) return s + (b.amount || 0) * ((b.myProb / 100) * (b.betmanOdds - 1) - (1 - b.myProb / 100));
      return s;
    }, 0);
    return { key: key, count: g.length, profit: profit, invested: invested, roi: roi, cumEv: cumEv };
  }).filter(function(d) { return d.count > 0; });

  // ── 종목별 ──
  var sportMap = {};
  resolved.forEach(function(b) {
    var sports = (b.sport || '기타').split(', ');
    sports.forEach(function(sp) {
      if (!sportMap[sp]) sportMap[sp] = { profit: 0, invested: 0, count: 0 };
      sportMap[sp].profit   += (b.profit || 0) / sports.length;
      sportMap[sp].invested += (b.amount || 0) / sports.length;
      sportMap[sp].count++;
    });
  });
  var sportRoi = Object.entries(sportMap)
    .map(function(e) { return { sp: e[0], roi: e[1].invested > 0 ? e[1].profit / e[1].invested * 100 : 0, count: e[1].count }; })
    .sort(function(a, b) { return b.roi - a.roi; });
  var bestSport  = sportRoi[0] || null;
  var worstSport = sportRoi[sportRoi.length - 1] || null;

  // ── 예측 베팅 / 엣지 ──
  var predBets = resolved.filter(function(b) { return b.myProb && b.betmanOdds; });
  var predEdge = predBets.length > 0
    ? predBets.reduce(function(s, b) { return s + (b.myProb - 100 / b.betmanOdds); }, 0) / predBets.length
    : null;
  var actualEdgeVal = predBets.length > 0
    ? predBets.filter(function(b) { return b.result === 'WIN'; }).length / predBets.length * 100
      - predBets.reduce(function(s, b) { return s + 100 / b.betmanOdds; }, 0) / predBets.length
    : null;

  // ── EV 신뢰도 ──
  var evBets = resolved.filter(function(b) {
    if (b.ev != null) return true;
    if (b.myProb && b.betmanOdds) return true;
    return false;
  });
  var cumEvTotal = evBets.reduce(function(s, b) {
    var ev = b.ev != null ? b.ev : (b.myProb / 100 * (b.betmanOdds - 1)) - (1 - b.myProb / 100);
    return s + (b.amount || 0) * ev;
  }, 0);
  var cumProfitEv = evBets.reduce(function(s, b) { return s + (b.profit || 0); }, 0);
  var evTrust = cumEvTotal !== 0 ? cumProfitEv / Math.abs(cumEvTotal) * 100 : null;

  // ── 트렌드 (10건 단위) ──
  var trendData = [], trendLabels = [];
  for (var i = 0; i < predBets.length; i += 10) {
    var chunk = predBets.slice(i, i + 10);
    trendLabels.push((i + 1) + '~' + Math.min(i + 10, predBets.length));
    trendData.push(parseFloat((chunk.reduce(function(s, b) { return s + (b.myProb - 100 / b.betmanOdds); }, 0) / chunk.length).toFixed(1)));
  }
  var recent10pred = predBets.slice(-10);
  var recentEdge = recent10pred.length > 0
    ? recent10pred.reduce(function(s, b) { return s + (b.myProb - 100 / b.betmanOdds); }, 0) / recent10pred.length
    : null;

  // ── 배당 구간 ──
  var oddsRanges = [
    { label: '1.3~1.7', min: 1.3, max: 1.7 },
    { label: '1.7~2.2', min: 1.7, max: 2.2 },
    { label: '2.2~2.8', min: 2.2, max: 2.8 },
    { label: '2.8~3.5', min: 2.8, max: 3.5 },
    { label: '3.5+',   min: 3.5, max: 99 }
  ];
  var oddsData = oddsRanges.map(function(r) {
    var g = predBets.filter(function(b) { return b.betmanOdds >= r.min && b.betmanOdds < r.max; });
    if (!g.length) return null;
    var myAvg   = g.reduce(function(s, b) { return s + b.myProb; }, 0) / g.length;
    var implAvg = g.reduce(function(s, b) { return s + 100 / b.betmanOdds; }, 0) / g.length;
    var actWr   = g.filter(function(b) { return b.result === 'WIN'; }).length / g.length * 100;
    return { label: r.label, count: g.length, edge: myAvg - implAvg, actualEdge: actWr - implAvg, actualWr: actWr, implAvg: implAvg };
  }).filter(Boolean);

  // ── 낙관 편향 MA5 ──
  var biasMA = [], biasLabels = [];
  predBets.forEach(function(b, i) {
    var sl = predBets.slice(Math.max(0, i - 4), i + 1);
    var myAvgSl = sl.reduce(function(s, x) { return s + x.myProb; }, 0) / sl.length;
    var actWrSl = sl.filter(function(x) { return x.result === 'WIN'; }).length / sl.length * 100;
    biasMA.push(parseFloat((myAvgSl - actWrSl).toFixed(1)));
    biasLabels.push(i + 1);
  });
  var avgBias  = biasMA.length > 0 ? biasMA.reduce(function(s, v) { return s + v; }, 0) / biasMA.length : null;
  var lastBias = biasMA.length > 0 ? biasMA[biasMA.length - 1] : null;

  // ── 차트용 MA 데이터 (judge-pred-chart) ──
  var myMA = [], implMA = [], actMA = [], pL = [];
  predBets.forEach(function(b, i) {
    var sl = predBets.slice(Math.max(0, i - 4), i + 1);
    pL.push(i + 1);
    myMA.push(sl.reduce(function(s, x) { return s + x.myProb; }, 0) / sl.length);
    implMA.push(sl.reduce(function(s, x) { return s + 100 / x.betmanOdds; }, 0) / sl.length);
    actMA.push(sl.filter(function(x) { return x.result === 'WIN'; }).length / sl.length * 100);
  });

  // ── 교차표 matrix ──
  var fkeys = ['단폴', '2폴', '3폴', '4폴+'];
  var matrix = {};
  resolved.forEach(function(b) {
    var fc     = b.mode !== 'multi' ? '단폴' : parseInt(b.folderCount) >= 4 ? '4폴+' : b.folderCount + '폴';
    var sports = (b.sport || '기타').split(', ');
    sports.forEach(function(sp) {
      if (!matrix[sp]) matrix[sp] = {};
      if (!matrix[sp][fc]) matrix[sp][fc] = { profit: 0, invested: 0, count: 0 };
      matrix[sp][fc].profit   += (b.profit || 0) / sports.length;
      matrix[sp][fc].invested += (b.amount || 0) / sports.length;
      matrix[sp][fc].count++;
    });
  });
  var sportList   = Object.keys(sportMap).filter(function(sp) { return sportMap[sp].count >= 2; });
  var activeFkeys = fkeys.filter(function(k) { return sportList.some(function(sp) { return matrix[sp] && matrix[sp][k]; }); });

  // ── 액션 제안 [{type, text}] ──
  var actions = [];
  var worstF = folderData.length > 0 ? folderData.slice().sort(function(a, b) { return (a.roi || 0) - (b.roi || 0); })[0] : null;
  var bestF  = folderData.length > 0 ? folderData.slice().sort(function(a, b) { return (b.roi || 0) - (a.roi || 0); })[0] : null;

  if (worstF && worstF.roi !== null && worstF.roi < -20 && worstF.count >= 3)
    actions.push({ type: 'warn', text: '🔴 <strong>' + worstF.key + ' 베팅 한도 축소</strong> — ROI ' + worstF.roi.toFixed(0) + '%, ' + worstF.count + '건 부진. 이 유형 베팅금을 현재의 <strong>50%로 축소</strong>하세요.' });
  if (bestF && worstF && bestF.key !== worstF.key && bestF.roi !== null && bestF.roi > 10)
    actions.push({ type: 'good', text: '🟢 <strong>' + bestF.key + '에 집중</strong> — ROI ' + bestF.roi.toFixed(0) + '%. 전체 베팅의 ' + Math.min(70, Math.round(bestF.roi / 2 + 30)) + '% 이상 비중을 늘리세요.' });

  if (worstSport && worstSport.roi < -30 && worstSport.count >= 3)
    actions.push({ type: 'warn', text: '🔴 <strong>' + worstSport.sp + ' 베팅 중단 검토</strong> — ROI ' + worstSport.roi.toFixed(0) + '%, ' + worstSport.count + '건 부진. <strong>최소 2주 중단 후</strong> 원인 분석 권장.' });
  if (bestSport && bestSport.roi > 20 && bestSport.count >= 3)
    actions.push({ type: 'good', text: '🟢 <strong>' + bestSport.sp + ' 강점 종목</strong> — ROI ' + bestSport.roi.toFixed(0) + '%, ' + bestSport.count + '건. 이 종목 비중 확대 고려.' });

  var worstOdds = oddsData.length > 0 ? oddsData.slice().sort(function(a, b) { return a.actualEdge - b.actualEdge; })[0] : null;
  var bestOdds  = oddsData.length > 0 ? oddsData.slice().sort(function(a, b) { return b.actualEdge - a.actualEdge; })[0] : null;
  if (worstOdds && worstOdds.actualEdge < -15 && worstOdds.count >= 3)
    actions.push({ type: 'warn', text: '🔴 <strong>' + worstOdds.label + ' 배당대 주의</strong> — 실제 엣지 ' + worstOdds.actualEdge.toFixed(0) + '%p, ' + worstOdds.count + '건. 예측 승률 ' + worstOdds.implAvg.toFixed(0) + '%보다 ' + Math.abs(worstOdds.actualEdge).toFixed(0) + '%p 낮게 실현 중. <strong>이 배당대 베팅 기준을 높이거나 잠시 쉬세요.</strong>' });
  var highOdds = oddsData.find(function(d) { return d.label === '3.5+'; });
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
  var diagLines = [];
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
    var bfD = folderData.slice().sort(function(a, b) { return (b.roi || 0) - (a.roi || 0); })[0];
    var wfD = folderData.slice().sort(function(a, b) { return (a.roi || 0) - (b.roi || 0); })[0];
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
    var d = recentEdge - predEdge;
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
    var from     = new Date(now.getTime() - days * 86400000);
    var filtered = bets.filter(function(b) {
      if (!b.date || b.result === 'PENDING') return false;
      return new Date(b.date) >= from;
    });
    var wins     = filtered.filter(function(b) { return b.result === 'WIN'; }).length;
    var profit   = filtered.reduce(function(s, b) { return s + (b.profit || 0); }, 0);
    var invested = filtered.reduce(function(s, b) { return s + (b.amount || 0); }, 0);
    var roi      = invested > 0 ? profit / invested * 100 : null;
    return { bets: filtered.length, wins: wins, profit: Math.round(profit), roi: roi };
  }

  function roundStats(n) {
    var slice = history.slice(-n);
    if (slice.length === 0) return null;
    var totalBets     = slice.reduce(function(s, r) { return s + r.bets; }, 0);
    var totalWins     = slice.reduce(function(s, r) { return s + r.wins; }, 0);
    var totalProfit   = slice.reduce(function(s, r) { return s + r.profit; }, 0);
    var totalInvested = slice.reduce(function(s, r) { return s + r.invested; }, 0);
    var roi = totalInvested > 0 ? totalProfit / totalInvested * 100 : null;
    return { rounds: slice.length, bets: totalBets, wins: totalWins, profit: totalProfit, roi: roi };
  }

  var d7  = calStats(7);
  var d30 = calStats(30);
  var d90 = calStats(90);
  var r3  = roundStats(3);
  var r12 = roundStats(12);
  var r36 = roundStats(36);

  // ── 회차 관리 피드백 ──
  var feedbackData = null;
  if (history.length >= 3) {
    var cal7   = d7;
    var round3 = r3;
    if (cal7.bets > 0 && round3) {
      var calRoi   = cal7.roi   || 0;
      var roundRoi = round3.roi || 0;
      var diff = Math.abs(calRoi - roundRoi);
      var kind = diff <= 1 ? 'good' : diff <= 3 ? 'caution' : 'bad';
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
 *   kellyOk,        — boolean: avgAmt <= optAmt * 1.2
 *   riskLevel,      — 'high' | 'mid' | 'low'
 *   stddev,
 *   avgAmtRounded,
 *   resolvedCount
 * }}
 */
function computeRiskMetrics(bets, winRate, avgOdds, avgAmt, start) {
  var resolved = bets.filter(function(b) { return b.result !== 'PENDING'; });

  var kelly     = Math.max(0, (winRate * (avgOdds - 1) - (1 - winRate)) / (avgOdds - 1));
  var halfKelly = kelly / 2;
  var optAmt    = Math.round(start * halfKelly / 1000) * 1000;
  var kellyOk   = avgAmt <= optAmt * 1.2;

  var riskLevel = winRate < 0.45 ? 'high' : winRate < 0.50 ? 'mid' : 'low';

  var profits  = resolved.map(function(b) { return b.profit; });
  var mean     = profits.length > 0 ? profits.reduce(function(s, v) { return s + v; }, 0) / profits.length : 0;
  var variance = profits.length > 0
    ? profits.reduce(function(s, v) { return s + Math.pow(v - mean, 2); }, 0) / profits.length
    : 0;
  var stddev = Math.sqrt(variance);

  return {
    kelly:         kelly,
    halfKelly:     halfKelly,
    optAmt:        optAmt,
    kellyOk:       kellyOk,
    riskLevel:     riskLevel,
    stddev:        stddev,
    avgAmtRounded: Math.round(avgAmt),
    resolvedCount: resolved.length
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
  var step = calibStep || 5;
  var resolved  = bets.filter(function(b) { return b.result === 'WIN' || b.result === 'LOSE'; });
  var predBets  = resolved.filter(function(b) { return b.myProb != null && b.myProb > 0; });

  // ── bin 집계 ─────────────────────────────────────────────
  var bins = [];
  for (var lo = 0; lo < 100; lo += step) {
    var hi = lo + step;
    var g  = predBets.filter(function(b) { return b.myProb >= lo && b.myProb < hi; });
    if (g.length < 5) continue;

    var midRaw = g.reduce(function(s, b) { return s + b.myProb; }, 0) / g.length;
    var actWr  = g.filter(function(b) { return b.result === 'WIN'; }).length / g.length * 100;

    var calibG  = g.filter(function(b) { return b.calibProb != null; });
    var calibWr = calibG.length > 0
      ? calibG.reduce(function(s, b) { return s + b.calibProb * 100; }, 0) / calibG.length
      : null;

    bins.push({ lo: lo, hi: hi, count: g.length, midRaw: midRaw, actWr: actWr, calibWr: calibWr });
  }

  // ── ECE + Bias 계산 ──────────────────────────────────────
  var validBins  = bins.filter(function(b) { return b.calibWr !== null; });
  var total      = bins.reduce(function(s, b) { return s + b.count; }, 0);
  var totalCalib = validBins.reduce(function(s, b) { return s + b.count; }, 0);

  if (total === 0) {
    return { eceRaw: null, eceCalib: null, biasRaw: null, biasCalib: null, bins: [], predCount: predBets.length };
  }

  var eceRaw  = bins.reduce(function(s, b) { return s + Math.abs(b.midRaw - b.actWr) * (b.count / total); }, 0);
  var biasRaw = bins.reduce(function(s, b) { return s + (b.midRaw - b.actWr) * (b.count / total); }, 0);

  var eceCalib  = totalCalib > 0
    ? validBins.reduce(function(s, b) { return s + Math.abs(b.calibWr - b.actWr) * (b.count / totalCalib); }, 0)
    : null;
  var biasCalib = totalCalib > 0
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


// ── 자기 무결성 체크 ─────────────────────────────────────────
console.assert(typeof computeAnalyzeMetrics === 'function', '[compute.js] computeAnalyzeMetrics not defined');
console.assert(typeof computeSimulation     === 'function', '[compute.js] computeSimulation not defined');
console.assert(typeof computeJudgeMetrics   === 'function', '[compute.js] computeJudgeMetrics not defined');
console.assert(typeof computeRoundHistory   === 'function', '[compute.js] computeRoundHistory not defined');
console.assert(typeof computeRiskMetrics    === 'function', '[compute.js] computeRiskMetrics not defined');
console.assert(typeof computeCalibration    === 'function', '[compute.js] computeCalibration not defined');
