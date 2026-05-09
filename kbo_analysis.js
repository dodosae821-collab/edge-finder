// ============================================================
// kbo_analysis.js — KBO F5 언더/오버 예측 엔진
// ============================================================
// 모델 구조:
//   [1] RecentForm = (FIP_recent - FIP_season) / FIP_season
//   [2] t = sigmoid(a * IP_norm + b * RecentForm)
//   [3] Pitcher_exp = (1-t)*ERA + t*FIP
//   [4] Offense = wOBA * Scale
//   [5] Offense_F5 = Offense * (1 - delta_TTO)
//   [6] Matchup ratio → E(R) = Offense_F5^alpha * Pitcher_opp^(1-alpha)
//   [7] E(R) *= Park
//   [8] Runs ~ Poisson(lambda)
//   [9] P(Total <= line) = sum Poisson CDF
// ============================================================

// ── 수학 유틸 ────────────────────────────────────────────────

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

// Poisson PMF: P(X = k | lambda)
function poissonPMF(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 1; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

// P(A + B <= line) where A~Poisson(lA), B~Poisson(lB)
function poissonSumCDF(line, lA, lB) {
  let p = 0;
  const maxK = Math.floor(line);
  for (let i = 0; i <= maxK; i++) {
    for (let j = 0; j <= maxK - i; j++) {
      p += poissonPMF(i, lA) * poissonPMF(j, lB);
    }
  }
  return Math.min(p, 1);
}

// ── 핵심 계산 ────────────────────────────────────────────────

function calcPitcherExp(era, fip, ip, fipRecent, sigA, sigB) {
  const ipNorm = ip / 100;
  const recentForm = fipRecent !== null ? (fipRecent - fip) / Math.max(fip, 0.01) : 0;
  const t = sigmoid(sigA * ipNorm + sigB * recentForm);
  const pitcherExp = (1 - t) * era + t * fip;
  return { t, recentForm, pitcherExp };
}

function calcOffenseF5(woba, scale, deltaTTO) {
  const offense = woba * scale;
  const offenseF5 = offense * (1 - deltaTTO);
  return { offense, offenseF5 };
}

function calcLambda(offenseF5, pitcherOpp, alpha, park) {
  // Floor: 투수 기대실점 최소값 2.0 (폭발 방지)
  const pitcherSafe = Math.max(pitcherOpp, 2.0);
  const raw = Math.pow(offenseF5, alpha) * Math.pow(pitcherSafe, 1 - alpha);
  return raw * park;
}

// ── 메인 계산 함수 ───────────────────────────────────────────

function kboCalculate() {
  // ── 입력값 수집 ──
  const get = id => {
    const v = parseFloat(document.getElementById(id).value);
    return isNaN(v) ? null : v;
  };
  const getText = id => document.getElementById(id).value.trim();

  const homeName  = getText('kbo-home-name') || '홈팀';
  const awayName  = getText('kbo-away-name') || '원정팀';

  const hERA    = get('kbo-home-era');
  const hFIP    = get('kbo-home-fip');
  const hIP     = get('kbo-home-ip');
  const hFIPR   = get('kbo-home-fip-recent');
  const hWOBA   = get('kbo-home-lineup-woba') || get('kbo-home-woba');
  const hPark   = get('kbo-home-park') || 1.0;

  const aERA    = get('kbo-away-era');
  const aFIP    = get('kbo-away-fip');
  const aIP     = get('kbo-away-ip');
  const aFIPR   = get('kbo-away-fip-recent');
  const aWOBA   = get('kbo-away-lineup-woba') || get('kbo-away-woba');
  const aPark   = get('kbo-away-park') || 1.0;

  const alpha    = get('kbo-alpha')    || 0.52;
  const scale    = get('kbo-scale')    || 1.20;
  const deltaTTO = get('kbo-delta-tto')|| 0.08;
  const sigA     = get('kbo-sig-a')    || 1.5;
  const sigB     = get('kbo-sig-b')    || 0.8;

  // ── 입력 검증 ──
  const status = document.getElementById('kbo-calc-status');
  const missing = [];
  if (!hERA) missing.push('홈 ERA');
  if (!hFIP) missing.push('홈 FIP');
  if (!hIP)  missing.push('홈 IP');
  if (!hWOBA) missing.push('홈 wOBA');
  if (!aERA) missing.push('원정 ERA');
  if (!aFIP) missing.push('원정 FIP');
  if (!aIP)  missing.push('원정 IP');
  if (!aWOBA) missing.push('원정 wOBA');

  if (missing.length > 0) {
    status.style.color = 'var(--red)';
    status.textContent = '⚠ 필수 입력 누락: ' + missing.join(', ');
    return;
  }
  status.textContent = '';

  // ── Step 1~2: 투수 기대실점 ──
  const hPitcher = calcPitcherExp(hERA, hFIP, hIP, hFIPR, sigA, sigB);
  const aPitcher = calcPitcherExp(aERA, aFIP, aIP, aFIPR, sigA, sigB);

  // ── Step 3~4: 타선 득점력 ──
  const hOff = calcOffenseF5(hWOBA, scale, deltaTTO);
  const aOff = calcOffenseF5(aWOBA, scale, deltaTTO);

  // ── Step 5: 매치업 결합 (홈팀 득점 = 홈 타선 vs 원정 투수) ──
  // 홈팀 득점 lambda: 홈 타선력 vs 원정 투수
  // 원정팀 득점 lambda: 원정 타선력 vs 홈 투수
  const park = (hPark + aPark) / 2; // 같은 구장이므로 평균
  const lambdaHome = calcLambda(hOff.offenseF5, aPitcher.pitcherExp, alpha, park);
  const lambdaAway = calcLambda(aOff.offenseF5, hPitcher.pitcherExp, alpha, park);

  // ── Step 6: Poisson 확률 계산 ──
  const totalLambda = lambdaHome + lambdaAway;
  const p35 = poissonSumCDF(3.5, lambdaHome, lambdaAway);
  const p45 = poissonSumCDF(4.5, lambdaHome, lambdaAway);
  const p55 = poissonSumCDF(5.5, lambdaHome, lambdaAway);
  const p65 = poissonSumCDF(6.5, lambdaHome, lambdaAway);
  const pOver = 1 - p45;

  // ── 결과 렌더링 ──
  document.getElementById('kbo-result-panel').style.display = 'block';

  document.getElementById('kbo-res-home-name').textContent = homeName;
  document.getElementById('kbo-res-away-name').textContent = awayName;
  document.getElementById('kbo-res-home-lambda').textContent = lambdaHome.toFixed(2);
  document.getElementById('kbo-res-away-lambda').textContent = lambdaAway.toFixed(2);
  document.getElementById('kbo-res-total').textContent = totalLambda.toFixed(2);

  // 언더/오버 바
  const underPct = Math.round(p45 * 100);
  const overPct  = Math.round(pOver * 100);
  document.getElementById('kbo-under-bar').style.width = underPct + '%';
  document.getElementById('kbo-under-pct').textContent = underPct + '%';
  document.getElementById('kbo-over-pct').textContent  = overPct + '%';

  // 라인별 확률
  document.getElementById('kbo-p35').textContent = Math.round(p35 * 100) + '%';
  document.getElementById('kbo-p45').textContent = Math.round(p45 * 100) + '%';
  document.getElementById('kbo-p55').textContent = Math.round(p55 * 100) + '%';
  document.getElementById('kbo-p65').textContent = Math.round(p65 * 100) + '%';

  // 색상 처리
  const underEl = document.getElementById('kbo-under-pct');
  const overEl  = document.getElementById('kbo-over-pct');
  underEl.style.color = p45 > 0.55 ? 'var(--accent)' : p45 > 0.45 ? 'var(--text2)' : 'var(--red)';
  overEl.style.color  = pOver > 0.55 ? 'var(--red)' : pOver > 0.45 ? 'var(--text2)' : 'var(--accent)';

  // ── 디버그 정보 저장 ──
  window._kboLastResult = {
    homeName, awayName,
    lambdaHome, lambdaAway, totalLambda,
    p35, p45, p55, p65, pOver,
    hPitcher, aPitcher, hOff, aOff,
    alpha, scale, deltaTTO, sigA, sigB, park,
    hERA, hFIP, hIP, hFIPR, hWOBA,
    aERA, aFIP, aIP, aFIPR, aWOBA,
  };

  // 디버그 패널 갱신
  _kboRenderDebug(window._kboLastResult);

  // EV 결과 초기화
  document.getElementById('kbo-ev-result').style.display = 'none';

  // 스크롤
  document.getElementById('kbo-result-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── 디버그 렌더 ──────────────────────────────────────────────

function _kboRenderDebug(r) {
  const body = document.getElementById('kbo-debug-body');
  const usingLineup = {
    home: document.getElementById('kbo-home-lineup-woba').value.trim() !== '',
    away: document.getElementById('kbo-away-lineup-woba').value.trim() !== '',
  };

  const lines = [
    `── [STEP 1] RecentForm ─────────────────────`,
    `홈  RecentForm = (${r.hFIPR ?? 'N/A'} - ${r.hFIP}) / ${r.hFIP} = ${r.hPitcher.recentForm.toFixed(4)}`,
    `원정 RecentForm = (${r.aFIPR ?? 'N/A'} - ${r.aFIP}) / ${r.aFIP} = ${r.aPitcher.recentForm.toFixed(4)}`,
    ``,
    `── [STEP 2] 동적 t (sigmoid) ───────────────`,
    `홈  t = σ(${r.sigA}×${(r.hIP/100).toFixed(2)} + ${r.sigB}×${r.hPitcher.recentForm.toFixed(3)}) = ${r.hPitcher.t.toFixed(4)}`,
    `원정 t = σ(${r.sigA}×${(r.aIP/100).toFixed(2)} + ${r.sigB}×${r.aPitcher.recentForm.toFixed(3)}) = ${r.aPitcher.t.toFixed(4)}`,
    ``,
    `── [STEP 3] 투수 기대실점 ──────────────────`,
    `홈  Pitcher_exp = (1-${r.hPitcher.t.toFixed(3)})×${r.hERA} + ${r.hPitcher.t.toFixed(3)}×${r.hFIP} = ${r.hPitcher.pitcherExp.toFixed(3)}`,
    `원정 Pitcher_exp = (1-${r.aPitcher.t.toFixed(3)})×${r.aERA} + ${r.aPitcher.t.toFixed(3)}×${r.aFIP} = ${r.aPitcher.pitcherExp.toFixed(3)}`,
    ``,
    `── [STEP 4] 타선 득점력 ────────────────────`,
    `홈  wOBA=${r.hWOBA}${usingLineup.home?' (라인업)':''} → Offense=${r.hOff.offense.toFixed(4)} → F5=${r.hOff.offenseF5.toFixed(4)}`,
    `원정 wOBA=${r.aWOBA}${usingLineup.away?' (라인업)':''} → Offense=${r.aOff.offense.toFixed(4)} → F5=${r.aOff.offenseF5.toFixed(4)}`,
    `(TTO δ=${r.deltaTTO}, Scale=${r.scale})`,
    ``,
    `── [STEP 5] 매치업 결합 (지수) ─────────────`,
    `홈 λ  = ${r.hOff.offenseF5.toFixed(4)}^${r.alpha} × ${r.aPitcher.pitcherExp.toFixed(3)}^${(1-r.alpha).toFixed(2)} × ${r.park.toFixed(3)} = ${r.lambdaHome.toFixed(3)}`,
    `원정 λ = ${r.aOff.offenseF5.toFixed(4)}^${r.alpha} × ${r.hPitcher.pitcherExp.toFixed(3)}^${(1-r.alpha).toFixed(2)} × ${r.park.toFixed(3)} = ${r.lambdaAway.toFixed(3)}`,
    `합계 λ = ${r.totalLambda.toFixed(3)}`,
    ``,
    `── [STEP 6] Poisson CDF ────────────────────`,
    `P(Total ≤ 3.5) = ${(r.p35*100).toFixed(1)}%`,
    `P(Total ≤ 4.5) = ${(r.p45*100).toFixed(1)}%  ← 언더 기준`,
    `P(Total ≤ 5.5) = ${(r.p55*100).toFixed(1)}%`,
    `P(Total ≤ 6.5) = ${(r.p65*100).toFixed(1)}%`,
  ];

  body.innerHTML = lines
    .map(l => l.startsWith('──')
      ? `<span style="color:var(--accent);opacity:0.7;">${l}</span>`
      : `<span>${l}</span>`)
    .join('<br>');
}

// ── EV 계산 ──────────────────────────────────────────────────

function kboCalcEV() {
  const r = window._kboLastResult;
  if (!r) return;

  const underOdds = parseFloat(document.getElementById('kbo-ev-under-odds').value);
  const overOdds  = parseFloat(document.getElementById('kbo-ev-over-odds').value);

  if (isNaN(underOdds) && isNaN(overOdds)) return;

  const evResult = document.getElementById('kbo-ev-result');
  evResult.style.display = 'block';

  // EV = p * (odds - 1) - (1 - p) * 1
  function calcEV(prob, odds) {
    return prob * (odds - 1) - (1 - prob);
  }

  if (!isNaN(underOdds)) {
    const ev = calcEV(r.p45, underOdds);
    const el = document.getElementById('kbo-ev-under');
    const vd = document.getElementById('kbo-ev-under-verdict');
    el.textContent = (ev >= 0 ? '+' : '') + (ev * 100).toFixed(1) + '%';
    el.style.color  = ev > 0 ? 'var(--green)' : 'var(--red)';
    vd.textContent  = ev > 0.03 ? '✅ EV+' : ev >= 0 ? '🟡 약한 EV+' : '❌ EV-';
    vd.style.color  = ev > 0.03 ? 'var(--green)' : ev >= 0 ? 'var(--gold)' : 'var(--red)';
  }

  if (!isNaN(overOdds)) {
    const ev = calcEV(r.pOver, overOdds);
    const el = document.getElementById('kbo-ev-over');
    const vd = document.getElementById('kbo-ev-over-verdict');
    el.textContent = (ev >= 0 ? '+' : '') + (ev * 100).toFixed(1) + '%';
    el.style.color  = ev > 0 ? 'var(--green)' : 'var(--red)';
    vd.textContent  = ev > 0.03 ? '✅ EV+' : ev >= 0 ? '🟡 약한 EV+' : '❌ EV-';
    vd.style.color  = ev > 0.03 ? 'var(--green)' : ev >= 0 ? 'var(--gold)' : 'var(--red)';
  }

  // 추천 메시지
  const rec = document.getElementById('kbo-ev-recommend');
  const underEV = !isNaN(underOdds) ? calcEV(r.p45, underOdds) : -Infinity;
  const overEV  = !isNaN(overOdds)  ? calcEV(r.pOver, overOdds) : -Infinity;
  const bestEV  = Math.max(underEV, overEV);

  if (bestEV > 0.05) {
    const side = underEV > overEV ? '언더' : '오버';
    rec.style.background = 'rgba(0,230,118,0.08)';
    rec.style.border     = '1px solid rgba(0,230,118,0.25)';
    rec.style.color      = 'var(--green)';
    rec.textContent      = `⚡ ${side} EV+ ${(bestEV*100).toFixed(1)}% — 베팅 고려 가능`;
  } else if (bestEV > 0) {
    rec.style.background = 'rgba(255,215,0,0.06)';
    rec.style.border     = '1px solid rgba(255,215,0,0.2)';
    rec.style.color      = 'var(--gold)';
    rec.textContent      = `🟡 약한 EV+ — 엣지 미미, 신중하게 판단`;
  } else {
    rec.style.background = 'rgba(255,59,92,0.06)';
    rec.style.border     = '1px solid rgba(255,59,92,0.2)';
    rec.style.color      = 'var(--red)';
    rec.textContent      = `❌ 양쪽 모두 EV- — 패스 권장`;
  }
}

// ── 디버그 토글 ──────────────────────────────────────────────

function kboToggleDebug() {
  const body   = document.getElementById('kbo-debug-body');
  const toggle = document.getElementById('kbo-debug-toggle');
  const isOpen = body.style.display !== 'none';
  body.style.display   = isOpen ? 'none' : 'block';
  toggle.textContent   = isOpen ? '펼치기' : '접기';
}

// ── 초기화 ───────────────────────────────────────────────────

function kboReset() {
  const ids = [
    'kbo-home-name','kbo-home-pitcher','kbo-home-era','kbo-home-fip','kbo-home-ip',
    'kbo-home-fip-recent','kbo-home-woba','kbo-home-lineup-woba',
    'kbo-away-name','kbo-away-pitcher','kbo-away-era','kbo-away-fip','kbo-away-ip',
    'kbo-away-fip-recent','kbo-away-woba','kbo-away-lineup-woba',
    'kbo-ev-under-odds','kbo-ev-over-odds',
  ];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

  // 파라미터 기본값 복원
  document.getElementById('kbo-alpha').value     = '0.52';
  document.getElementById('kbo-scale').value     = '1.20';
  document.getElementById('kbo-delta-tto').value = '0.08';
  document.getElementById('kbo-sig-a').value     = '1.5';
  document.getElementById('kbo-sig-b').value     = '0.8';
  document.getElementById('kbo-home-park').value = '';
  document.getElementById('kbo-away-park').value = '';

  document.getElementById('kbo-result-panel').style.display = 'none';
  document.getElementById('kbo-calc-status').textContent    = '';
  window._kboLastResult = null;
}
