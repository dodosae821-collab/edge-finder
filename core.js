// ========== 종합 상황판단 — 엔진 연동 ==========
function updateJudgeAll() {
  // 엔진이 아직 없으면 실행
  const SS = window._SS || calcSystemState();
  const { n, winRate:wr, roi, rec10roi, avgOdds, avgAmt, rec5net,
          streak, streakType, plRatio, avgBias,
          sigScores:scores, labels, icons, overallScore,
          verdict, verdictInfo, warnings, stops,
          grade, kellyUnit, goalSim, ece, corrFactor } = SS;

  if (n < 3) {
    ['judgeall-signals','judgeall-kpi-list','judgeall-comment','judgeall-go'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<span style="color:var(--text3);font-size:12px;">베팅 기록 3건 이상 필요합니다.</span>';
    });
    return;
  }

  const breakeven = 1 / avgOdds;
  const ev = (wr * (avgOdds - 1) - (1 - wr));

  // ── ① 오늘 베팅 브리핑 ──
  const briefEl = document.getElementById('judgeall-briefing');
  if (briefEl) {
    // 지금 상태에서 가장 중요한 메시지 3개 선택
    const msgs = [];

    // 1. 지금 당장 행동 지침
    if (verdict === 'STOP')
      msgs.push({ icon:'🛑', color:'var(--red)',  title:'지금은 베팅하지 마세요', body: stops.length > 0 ? stops[0] : '복합 위험 신호 감지됨. 오늘은 쉬는 것이 맞습니다.' });
    else if (verdict === 'CAUTION')
      msgs.push({ icon:'⚠️', color:'#ff9800',    title:'베팅하되 규모를 줄이세요', body: warnings.length > 0 ? warnings[0] : `권장 베팅금 ₩${kellyUnit > 0 ? kellyUnit.toLocaleString() : '—'} 이하로 유지하세요.` });
    else if (verdict === 'WAIT')
      msgs.push({ icon:'⏳', color:'var(--gold)', title:'EV+ 조건이 갖춰질 때만 베팅', body: `승률(${(wr*100).toFixed(1)}%)이 손익분기(${(breakeven*100).toFixed(1)}%) 근처입니다. 확실한 엣지가 보일 때만 진입하세요.` });
    else
      msgs.push({ icon:'✅', color:'var(--green)', title:'베팅 가능 — 조건 충족', body: `EV 양수·승률 엣지 확보·컨디션 정상. 권장 베팅금 ₩${kellyUnit > 0 ? kellyUnit.toLocaleString() : '설정 필요'}.` });

    // 2. 보정도 해석
    if (ece !== null) {
      if (ece > 10)
        msgs.push({ icon:'📐', color:'var(--red)',   title:`내 예측이 실제보다 ${ece.toFixed(0)}% 벗어나 있어요`, body:'EV 계산기에 입력하는 내 예상 승률이 실제보다 높게 나오는 경향이 있습니다. 자신감 있는 픽일수록 한 번 더 의심해보세요. 켈리도 자동으로 축소 적용 중입니다.' });
      else if (ece > 5)
        msgs.push({ icon:'📐', color:'#ff9800',      title:`예측 오차 ${ece.toFixed(0)}% — 양호 수준`, body:'내 예측과 실제 적중률이 대체로 일치하지만 약간의 오차가 있어요. 현재 켈리 배율 조정이 적용 중입니다.' });
      else
        msgs.push({ icon:'📐', color:'var(--green)', title:`예측 오차 ${ece.toFixed(0)}% — 우수`, body:'내가 70%라 예상한 경기가 실제로 70% 근처에서 적중하고 있어요. 켈리 계산을 신뢰해도 됩니다.' });
    } else {
      msgs.push({ icon:'📐', color:'var(--text3)', title:'보정도 아직 측정 불가', body:'EV 계산기에서 "내 예상 승률"을 입력한 베팅이 5건 이상 쌓이면 내 예측 정확도를 자동 측정해드립니다.' });
    }

    // 3. 켈리/베팅금 가이드
    if (kellyUnit > 0)
      msgs.push({ icon:'💰', color:'var(--gold)', title:`오늘 베팅 1건당 ₩${kellyUnit.toLocaleString()} 권장`, body:`예측력 ${grade ? grade.letter + '등급' : '—'} × ECE 보정이 반영된 금액입니다. 이 금액을 초과하면 장기적으로 수익 변동성이 커집니다.` });
    else
      msgs.push({ icon:'💰', color:'var(--text3)', title:'베팅금 계산 불가 — 시드 설정 필요', body:'설정 탭 → 자금 관리에서 현재 시드머니를 입력하면 오늘 베팅 권장 금액을 자동으로 계산해드립니다.' });

    briefEl.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
        ${msgs.map(m => `
          <div style="padding:14px 16px;background:var(--bg2);border:1px solid ${m.color}44;border-left:4px solid ${m.color};border-radius:8px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
              <span style="font-size:18px;">${m.icon}</span>
              <span style="font-size:12px;font-weight:800;color:${m.color};">${m.title}</span>
            </div>
            <div style="font-size:11px;color:var(--text3);line-height:1.7;">${m.body}</div>
          </div>`).join('')}
      </div>`;
  }

  // ── 신호등 렌더 (7개 + 종합) — 클릭 시 해석 ──
  function sigColor(score) {
    return score >= 65 ? {bg:'rgba(0,230,118,0.12)', border:'var(--green)', dot:'var(--green)', label:'양호'}
         : score >= 40 ? {bg:'rgba(255,152,0,0.12)',  border:'#ff9800',      dot:'#ff9800',      label:'주의'}
                       : {bg:'rgba(255,59,92,0.12)',   border:'var(--red)',   dot:'var(--red)',   label:'경고'};
  }

  // 신호별 해석 텍스트
  const sigExplains = [
    { what:'수익성', why:'누적 ROI와 최근 10경기 ROI를 봅니다.', action: roi > 0 ? `현재 ROI ${roi.toFixed(1)}% — 수익 구조가 작동 중입니다.` : `ROI ${roi.toFixed(1)}% — 전략 전반을 재점검해보세요.` },
    { what:'예측 엣지', why:'내 승률이 배당이 의미하는 확률보다 높은지 봅니다.', action: wr > breakeven ? `승률 ${(wr*100).toFixed(1)}% > 손익분기 ${(breakeven*100).toFixed(1)}% — 엣지가 있습니다.` : `승률이 손익분기에 미달합니다. EV+ 경기만 선별하세요.` },
    { what:'리스크', why:'손익비(이긴 날 평균 수익 vs 진 날 평균 손실)를 봅니다.', action: plRatio >= 1 ? `손익비 ${plRatio.toFixed(2)} — 한 번 이기면 손실 ${plRatio.toFixed(1)}건을 커버합니다.` : `손익비 ${plRatio.toFixed(2)} — 배당 선택 기준을 높이거나 베팅 단위를 줄이세요.` },
    { what:'컨디션', why:'최근 5경기 수익과 연속 결과를 봅니다.', action: rec5net > 0 ? `최근 5건 수익 중 — 현재 판단력이 좋은 상태입니다.` : `최근 5건 손실 — 베팅 규모를 줄이거나 오늘은 쉬는 것도 방법입니다.` },
    { what:'편향 없음', why:'내가 실제보다 높게 예측하는 경향(낙관 편향)이 있는지 봅니다.', action: Math.abs(avgBias) < 5 ? `낙관 편향 ${avgBias.toFixed(1)}%p — 거의 없습니다.` : `낙관 편향 ${avgBias.toFixed(1)}%p — 자신감 높은 픽일수록 실제보다 과대평가할 수 있습니다.` },
    { what:'데이터 신뢰도', why:'베팅 기록이 충분한지 봅니다. 적을수록 통계가 불안정합니다.', action: n >= 30 ? `${n}건 — 통계적으로 신뢰할 수 있는 수준입니다.` : `${n}건 — 아직 적습니다. 지표들을 참고용으로만 활용하세요.` },
    { what:'보정도', why:'EV 계산기에 입력한 내 예상 승률이 실제 적중률과 얼마나 다른지 봅니다.', action: ece === null ? '아직 측정 불가 — EV 계산기에서 내 예상 승률을 입력하세요.' : ece <= 5 ? `ECE ${ece.toFixed(1)}% — 우수. 내 예측을 신뢰해도 됩니다.` : `ECE ${ece.toFixed(1)}% — 예측 오차가 있습니다. 켈리가 자동 축소 적용 중입니다.` },
  ];

  // ── 신호등 렌더 (7개 + 종합) ──
  const sigWrap = document.getElementById('judgeall-signals');
  if (sigWrap) {
    const allSigs = [
      ...scores.map((sc,i) => ({score:sc, label:labels[i], icon:icons[i], idx:i})),
      {score:overallScore, label:'종합', icon:'📋', isOverall:true}
    ];
    sigWrap.style.gridTemplateColumns = 'repeat(8,1fr)';
    sigWrap.innerHTML = allSigs.map((sig, i) => {
      const c = sigColor(sig.score);
      return `<div class="card" onclick="showJudgeSigExplain(${sig.isOverall ? -1 : i})" style="text-align:center;padding:12px 6px;background:${c.bg};border:1px solid ${c.border}${sig.isOverall?';box-shadow:0 0 12px '+c.border+'44':''};cursor:pointer;transition:transform 0.1s;" onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">
        <div style="font-size:18px;margin-bottom:5px;">${sig.icon}</div>
        <div style="font-size:10px;color:var(--text3);margin-bottom:6px;font-weight:600;">${sig.label}</div>
        <div style="width:9px;height:9px;border-radius:50%;background:${c.dot};margin:0 auto 5px;box-shadow:0 0 5px ${c.dot};"></div>
        <div style="font-size:17px;font-weight:900;color:${c.dot};">${Math.round(sig.score)}</div>
        <div style="font-size:10px;color:${c.dot};font-weight:700;">${c.label}</div>
      </div>`;
    }).join('');
  }

  // ── 레이더 차트 ──
  const radarCtx = document.getElementById('judgeall-radar');
  if (radarCtx) {
    if (charts['judgeallRadar']) { try { charts['judgeallRadar'].destroy(); } catch(e){} }
    charts['judgeallRadar'] = safeCreateChart('judgeall-radar', {
      type: 'radar',
      data: {
        labels,
        datasets: [{
          label: '내 상태',
          data: scores,
          backgroundColor: 'rgba(0,229,255,0.12)',
          borderColor: 'rgba(0,229,255,0.8)',
          borderWidth: 2,
          pointBackgroundColor: scores.map(s => sigColor(s).dot),
          pointRadius: 5
        }, {
          label: '기준선 (60)',
          data: Array(labels.length).fill(60),
          backgroundColor: 'transparent',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1, borderDash: [4,4],
          pointRadius: 0
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { r: { min:0, max:100, ticks:{display:false}, grid:{color:'rgba(255,255,255,0.07)'}, angleLines:{color:'rgba(255,255,255,0.07)'}, pointLabels:{color:'#8892a4',font:{size:11}} } },
        plugins: { legend:{labels:{color:'#8892a4',font:{size:10},boxWidth:14}}, tooltip:{callbacks:{label:ctx=>ctx.dataset.label+': '+ctx.parsed.r.toFixed(0)}} }
      }
    });
  }

  // ── 핵심 KPI 리스트 — 해석 한 줄 포함 ──
  const kpiEl = document.getElementById('judgeall-kpi-list');
  if (kpiEl) {
    const kelly = Math.max(0, (wr*(avgOdds-1)-(1-wr))/(avgOdds-1));
    const kpis = [
      { label:'📈 누적 ROI', val:(roi>=0?'+':'')+roi.toFixed(1)+'%', color:roi>=0?'var(--green)':'var(--red)',
        hint: roi > 5 ? '장기 수익 구조 작동 중' : roi > 0 ? '흑자지만 아직 안정 구간 아님' : '전략 점검 필요' },
      { label:'🏆 전체 승률', val:(wr*100).toFixed(1)+'%', color:wr>=breakeven?'var(--green)':'var(--red)',
        hint: `손익분기 ${(breakeven*100).toFixed(1)}% 대비 ${wr>=breakeven?'초과 ✅':'미달 ❌'}` },
      { label:'📉 최근 10경기 ROI', val:(rec10roi>=0?'+':'')+rec10roi.toFixed(1)+'%', color:rec10roi>=0?'var(--green)':'var(--red)',
        hint: rec10roi >= 0 ? '최근 흐름 양호' : '최근 부진 — 베팅 선별 강화 필요' },
      { label:'⚡ EV (기댓값)', val:(ev>=0?'+':'')+ev.toFixed(3), color:ev>=0?'var(--accent)':'var(--red)',
        hint: ev > 0 ? `베팅 1건당 평균 ${(ev*100).toFixed(1)}% 기대 수익` : '현재 평균 배당에서 EV 없음' },
      { label:'⚖️ 손익비', val:plRatio.toFixed(2)+':1', color:plRatio>=1?'var(--green)':'var(--red)',
        hint: plRatio >= 1 ? `이긴 날이 진 날의 ${plRatio.toFixed(1)}배 수익` : '진 날 손실이 이긴 날 수익보다 큼' },
      { label:'👁 낙관 편향', val:(avgBias>=0?'+':'')+avgBias.toFixed(1)+'%p', color:Math.abs(avgBias)<5?'var(--green)':'#ff9800',
        hint: Math.abs(avgBias) < 5 ? '예측이 결과와 거의 일치' : `실제보다 ${Math.abs(avgBias).toFixed(0)}%p ${avgBias>0?'높게':'낮게'} 예측하는 경향` },
      { label:'🔁 스트릭', val:streakType==='WIN'?`${streak}연승`:`${streak}연패`, color:streakType==='WIN'?'var(--green)':'var(--red)',
        hint: streakType==='LOSE' && streak >= 3 ? '⚠️ 베팅 규모 축소 권장' : streakType==='WIN' ? '현재 판단력 좋은 상태' : '정상 범위' },
      { label:'📐 보정 오차(ECE)', val:ece!==null?ece.toFixed(1)+'%':'—', color:ece===null?'var(--text3)':ece<=5?'var(--green)':ece<=10?'#ff9800':'var(--red)',
        hint: ece===null ? 'EV 계산기에 예상 승률 입력 필요' : ece<=5 ? '내 예측이 실제와 잘 맞음' : ece<=10 ? '약간의 오차 — 켈리 자동 조정 중' : '오차 큼 — 자신감 있는 픽도 의심해볼 것' },
      { label:'🧠 예측력 등급', val:grade?grade.letter+'등급 ('+grade.totalScore+'점)':'—', color:grade?grade.color:'var(--text3)',
        hint: grade ? `켈리 배율 ×${grade.mult.toFixed(2)} 자동 적용` : '예측 데이터 5건 이상 필요' },
      { label:'💰 권장 베팅금', val:kellyUnit>0?'₩'+kellyUnit.toLocaleString():'시드 미설정', color:kellyUnit>0?'var(--gold)':'var(--text3)',
        hint: kellyUnit > 0 ? '이 금액 초과 시 장기 파산 위험 상승' : '설정 탭에서 시드머니 입력' },
      { label:'🎯 목표 달성 확률', val:goalSim?goalSim.prob.toFixed(0)+'%':'—', color:goalSim?(goalSim.prob>=70?'var(--green)':goalSim.prob>=40?'#ff9800':'var(--red)'):'var(--text3)',
        hint: goalSim ? (goalSim.prob>=70?'현재 페이스 유지 시 목표 달성 가능':goalSim.prob>=40?'목표 달성 가능하나 꾸준함 필요':'현재 전략 재검토 권장') : '자금/목표 탭에서 목표 설정 필요' },
      { label:'📅 목표 예상 기간', val:goalSim&&goalSim.weeksEst?goalSim.weeksEst+'주':'—', color:'var(--text2)',
        hint: goalSim&&goalSim.weeksEst ? `ECE 보정 수익 기준 예측` : '—' },
    ];
    kpiEl.innerHTML = kpis.map(k => `
      <div style="padding:8px 12px;background:var(--bg3);border-radius:6px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:11px;color:var(--text3);">${k.label}</span>
          <span class="mono" style="font-size:13px;font-weight:700;color:${k.color};">${k.val}</span>
        </div>
        <div style="font-size:10px;color:var(--text3);margin-top:3px;opacity:0.8;">${k.hint}</div>
      </div>`).join('');
  }

  // ── 종합 코멘트 ──
  const commentEl = document.getElementById('judgeall-comment');
  if (commentEl) {
    const lines = [];

    if (roi > 5)       lines.push(`✅ <strong>수익 구조 양호</strong> — 누적 ROI ${roi.toFixed(1)}%로 장기 수익 궤도에 있습니다.`);
    else if (roi > 0)  lines.push(`🟡 <strong>소폭 수익 중</strong> — ROI ${roi.toFixed(1)}%로 흑자이나 안정성 확인이 필요합니다.`);
    else               lines.push(`🔴 <strong>누적 손실 중</strong> — ROI ${roi.toFixed(1)}%. 전략 점검이 필요한 시점입니다.`);

    if (wr > breakeven + 0.05)
      lines.push(`✅ <strong>예측 엣지 확보</strong> — 승률 ${(wr*100).toFixed(1)}%로 손익분기(${(breakeven*100).toFixed(1)}%)를 ${((wr-breakeven)*100).toFixed(1)}%p 상회합니다.`);
    else if (wr > breakeven)
      lines.push(`🟡 <strong>소폭 엣지</strong> — 승률이 손익분기보다 ${((wr-breakeven)*100).toFixed(1)}%p 높습니다. 선별력 유지가 중요합니다.`);
    else
      lines.push(`🔴 <strong>엣지 없음</strong> — 승률 ${(wr*100).toFixed(1)}%가 손익분기(${(breakeven*100).toFixed(1)}%)에 미달합니다.`);

    // 보정도 코멘트 (신규 — 엔진 연동)
    if (ece !== null) {
      if (ece <= 5)
        lines.push(`✅ <strong>보정도 우수</strong> — 예측 오차 ${ece.toFixed(1)}%. 내 예측이 실제와 잘 맞습니다. 현재 켈리 신뢰 가능.`);
      else if (ece <= 10)
        lines.push(`🟡 <strong>보정 주의</strong> — 예측 오차 ${ece.toFixed(1)}%. 켈리 1/4 적용 권장. (과신 보정계수 ${corrFactor.toFixed(2)} 적용 중)`);
      else
        lines.push(`🔴 <strong>보정 불량</strong> — 예측 오차 ${ece.toFixed(1)}%. 내 예측 승률을 과신하고 있을 가능성이 높습니다. 켈리 대폭 축소 권장.`);
    }

    // 예측력 등급 (신규 — 엔진 연동)
    if (grade)
      lines.push(`🧠 <strong>예측력 ${grade.letter}등급 (${grade.totalScore}점)</strong> — 켈리 보정 배율 ×${grade.mult.toFixed(2)} 적용 중. 권장 베팅금 ${kellyUnit>0?'₩'+kellyUnit.toLocaleString():'시드 설정 필요'}.`);

    // 목표 연동 (신규 — 엔진 연동)
    if (goalSim)
      lines.push(`🎯 <strong>목표 달성 확률 ${goalSim.prob.toFixed(0)}%</strong> — 현재 페이스 유지 시 약 ${goalSim.weeksEst?goalSim.weeksEst+'주':'-'} 예상. (보정된 수익 기준)`);

    if (rec5net < 0 && streakType === 'LOSE' && streak >= 3)
      lines.push(`⚠️ <strong>슬럼프 감지</strong> — ${streak}연패 + 최근 5건 손실. 베팅 규모를 줄이거나 일시 중단을 고려하세요.`);
    else if (rec5net < 0)
      lines.push(`🟡 <strong>최근 폼 저조</strong> — 최근 5건 손실 구간. 종목/조건 선별 기준을 재검토하세요.`);
    else if (rec5net > 0 && streakType === 'WIN')
      lines.push(`🔥 <strong>컨디션 최상</strong> — 최근 5건 수익 + ${streak}연승 중. 선별 기준을 유지하세요.`);

    if (plRatio >= 1.5)
      lines.push(`✅ <strong>손익비 우수</strong> — 평균 수익이 손실의 ${plRatio.toFixed(1)}배. 낮은 승률에도 장기 흑자 가능 구조.`);
    else if (plRatio < 0.8)
      lines.push(`🔴 <strong>손익비 불량</strong> — 평균 수익이 손실보다 작습니다. 배당 선택 전략을 재고하세요.`);

    commentEl.innerHTML = lines.map(l =>
      `<div style="padding:8px 12px;border-left:3px solid rgba(255,255,255,0.1);margin-bottom:8px;background:var(--bg3);border-radius:0 6px 6px 0;">${l}</div>`
    ).join('');
  }

  // ── 오늘 베팅 권고 — 엔진 verdict 사용 ──
  const goEl     = document.getElementById('judgeall-go-light');
  const titleEl  = document.getElementById('judgeall-go-title');
  const reasonEl = document.getElementById('judgeall-go-reason');
  const condEl   = document.getElementById('judgeall-go-conditions');

  if (goEl)    { goEl.textContent = verdictInfo.icon; goEl.style.background = verdictInfo.color+'22'; goEl.style.border = '3px solid '+verdictInfo.color; goEl.style.boxShadow = '0 0 16px '+verdictInfo.color+'55'; }
  if (titleEl) { titleEl.textContent = verdictInfo.label; titleEl.style.color = verdictInfo.color; }
  if (reasonEl){ reasonEl.textContent = verdictInfo.desc; }

  if (condEl) {
    const checks = [
      { ok: ev > 0,                                    text:`EV 양수 (${(ev>=0?'+':'')+ev.toFixed(3)})` },
      { ok: wr > breakeven,                            text:`승률 > 손익분기 (${(wr*100).toFixed(1)}% vs ${(breakeven*100).toFixed(1)}%)` },
      { ok: !(streakType==='LOSE' && streak>=3),       text:'3연패 이하' },
      { ok: Math.abs(avgBias) < 15,                    text:'낙관 편향 15%p 이내' },
      { ok: rec10roi > -10,                            text:'최근 10경기 ROI > -10%' },
      { ok: ece===null || ece <= 10,                   text:`보정 오차 10% 이하 (현재 ${ece!==null?ece.toFixed(1)+'%':'미측정'})` },
      { ok: !grade || grade.letter !== 'D',            text:`예측력 D등급 아님 (현재 ${grade?grade.letter:'측정 중'}등급)` },
    ];
    const passCount = checks.filter(c=>c.ok).length;
    condEl.innerHTML = `<div style="font-size:11px;color:var(--text3);margin-bottom:8px;">${passCount}/${checks.length}개 조건 충족</div>` +
      checks.map(c =>
        `<div style="display:flex;align-items:center;gap:8px;font-size:11px;color:${c.ok?'var(--green)':'var(--red)'};">
          <span>${c.ok?'✅':'❌'}</span><span>${c.text}</span>
        </div>`).join('');
  }
}


