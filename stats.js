function updateStatsAnalysis() {
  const resolved = bets.filter(b => b.result !== 'PENDING');
  if (resolved.length === 0) {
    ['folder-stat-table','sport-stat-table','type-stat-table','odds-range-table','pred-table','dow-stat-table'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text3);padding:20px;">데이터 없음</td></tr>`;
    });
    ['sa-single-wr','sa-multi-wr','sa-avg-odds','sa-best-sport','sa-best-sport-rate',
     'sa-max-streak','sa-max-lose-streak','sa-cur-streak','sa-cur-lose-streak',
     'pred-total','pred-hit-rate','pred-avg-myprob','pred-avg-implied',
     'sa-total-wr','sa-total-roi','sa-rr-ratio','sa-ev-plus-count'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
    return;
  }

  // ── 엔진 연동 ──
  const _SS = window._SS;

  // ── 통계1 상단 카드 ──
  // 승률 — 엔진 우선
  const wins = _SS ? _SS.wins : resolved.filter(b => b.result === 'WIN');
  const totalWr = _SS ? _SS.winRate : wins.length / resolved.length;
  const wrEl = document.getElementById('sa-total-wr');
  if (wrEl) {
    wrEl.textContent = (totalWr * 100).toFixed(1) + '%';
    wrEl.style.color = totalWr >= 0.5 ? 'var(--green)' : 'var(--red)';
  }
  const wrLabelEl = document.getElementById('sa-total-wr-label');
  if (wrLabelEl) wrLabelEl.textContent = `${resolved.length}건 중 ${wins.length}적중`;

  // ROI — 엔진 우선
  const totalProfit   = _SS ? _SS.totalProfit   : resolved.reduce((s, b) => s + b.profit, 0);
  const totalInvested = _SS ? _SS.totalInvest   : resolved.reduce((s, b) => s + b.amount, 0);
  const roi = _SS ? _SS.roi : (totalInvested > 0 ? totalProfit / totalInvested * 100 : 0);
  const roiEl = document.getElementById('sa-total-roi');
  if (roiEl) {
    roiEl.textContent = (roi >= 0 ? '+' : '') + roi.toFixed(1) + '%';
    roiEl.style.color = roi >= 0 ? 'var(--green)' : 'var(--red)';
  }

  // 손익비 — 엔진 우선
  const rrRatio = _SS ? (_SS.plRatio > 0 ? _SS.plRatio : null) : (() => {
    const wb = resolved.filter(b => b.result === 'WIN');
    const lb = resolved.filter(b => b.result === 'LOSE');
    const aw = wb.length > 0 ? wb.reduce((s,b)=>s+b.profit,0)/wb.length : 0;
    const al = lb.length > 0 ? Math.abs(lb.reduce((s,b)=>s+b.profit,0)/lb.length) : 0;
    return al > 0 ? aw / al : null;
  })();
  const rrEl = document.getElementById('sa-rr-ratio');
  if (rrEl) {
    rrEl.textContent = rrRatio !== null ? rrRatio.toFixed(2) : '—';
    rrEl.style.color = rrRatio === null ? 'var(--text3)' : rrRatio >= 2 ? 'var(--green)' : rrRatio >= 1 ? 'var(--gold)' : 'var(--red)';
  }
  const rrLabelEl = document.getElementById('sa-rr-label');
  if (rrLabelEl) rrLabelEl.textContent = rrRatio !== null
    ? (rrRatio >= 2 ? '✅ 우수' : rrRatio >= 1 ? '⚠️ 보통' : '❌ 낮음')
    : '데이터 부족';

  // 누적 EV+ 카운터
  const evPlusBets = bets.filter(b => b.isValue === true);
  const evPlusCount = evPlusBets.length;
  const evEl = document.getElementById('sa-ev-plus-count');
  const evLabelEl = document.getElementById('sa-ev-plus-label');
  if (evEl) {
    evEl.textContent = evPlusCount + '판';
    evEl.style.color = evPlusCount >= 100 ? 'var(--green)' : evPlusCount >= 50 ? 'var(--gold)' : 'var(--accent)';
  }
  if (evLabelEl) {
    if (evPlusCount === 0) {
      evLabelEl.innerHTML = `EV+ 베팅을 기록하면 표시됩니다`;
    } else if (evPlusCount < 50) {
      evLabelEl.innerHTML = `⚠️ 확률 수렴까지 아직 멀어요<br><span style="color:var(--text3);">권장 100판 이상 (현재 ${evPlusCount}판)</span>`;
    } else if (evPlusCount < 100) {
      evLabelEl.innerHTML = `📈 수렴 구간 진입 중<br><span style="color:var(--text3);">조금 더 쌓아가세요 (${evPlusCount}/100)</span>`;
    } else {
      evLabelEl.innerHTML = `✅ 확률 수렴 구간<br><span style="color:var(--text3);">전략을 믿고 유지하세요</span>`;
    }
  }

  // 단폴 / 다폴더 분리
  const singles = resolved.filter(b => b.mode !== 'multi');
  const multis  = resolved.filter(b => b.mode === 'multi');
  const sWins   = singles.filter(b => b.result === 'WIN');
  const mWins   = multis.filter(b => b.result === 'WIN');

  const sWrEl = document.getElementById('sa-single-wr');
  const sCntEl = document.getElementById('sa-single-count');
  const mWrEl = document.getElementById('sa-multi-wr');
  const mCntEl = document.getElementById('sa-multi-count');
  if (sWrEl)  sWrEl.textContent  = singles.length ? `${(sWins.length/singles.length*100).toFixed(1)}%` : '—';
  if (sCntEl) sCntEl.textContent = `단폴 ${singles.length}건`;
  if (mWrEl)  mWrEl.textContent  = multis.length  ? `${(mWins.length/multis.length*100).toFixed(1)}%`  : '—';
  if (mCntEl) mCntEl.textContent = `다폴더 ${multis.length}건`;

  // 폴더 수별 통계 테이블 — 4+폴은 실제 폴더 수(folderOdds 길이)로 분리
  const getActualFolderCount = b => {
    if (b.folderCount !== '4+') return b.folderCount;
    if (b.folderOdds && b.folderOdds.length >= 4) return String(b.folderOdds.length);
    return '4'; // fallback
  };
  const folderGroups = [
    { key: 'single', label: '📌 단폴', bets: singles },
    { key: '2',      label: '🗂 2폴',  bets: multis.filter(b => b.folderCount === '2') },
    { key: '3',      label: '🗂 3폴',  bets: multis.filter(b => b.folderCount === '3') },
    { key: '4',      label: '🗂 4폴',  bets: multis.filter(b => getActualFolderCount(b) === '4') },
    { key: '5',      label: '🗂 5폴',  bets: multis.filter(b => getActualFolderCount(b) === '5') },
    { key: '6',      label: '🗂 6폴',  bets: multis.filter(b => getActualFolderCount(b) === '6') },
    { key: 'etc',    label: '🗂 다폴(미분류)', bets: multis.filter(b => !b.folderCount) },
  ];

  const folderRows = folderGroups.map(g => {
    if (!g.bets.length) return null;
    const wins    = g.bets.filter(b => b.result === 'WIN');
    const wr      = (wins.length / g.bets.length * 100).toFixed(1);
    const profit  = g.bets.reduce((s, b) => s + b.profit, 0);
    const invested = g.bets.reduce((s, b) => s + b.amount, 0);
    const roi     = invested > 0 ? (profit / invested * 100).toFixed(1) : '—';
    const avgOdds = (g.bets.reduce((s, b) => s + b.betmanOdds, 0) / g.bets.length).toFixed(2);
    return `<tr>
      <td style="font-weight:700;">${g.label}</td>
      <td>${g.bets.length}건</td>
      <td>${wins.length}적중</td>
      <td class="mono" style="color:${parseFloat(wr)>=50?'var(--green)':'var(--red)'};">${wr}%</td>
      <td class="mono" style="color:${profit>=0?'var(--green)':'var(--red)'};">${profit>=0?'+':''}₩${Math.round(profit).toLocaleString()}</td>
      <td class="mono" style="color:${parseFloat(roi)>=0?'var(--green)':'var(--red)'};">${roi !== '—' ? (parseFloat(roi)>=0?'+':'')+roi+'%' : '—'}</td>
      <td class="mono">${avgOdds}</td>
    </tr>`;
  }).filter(Boolean).join('');

  document.getElementById('folder-stat-table').innerHTML = folderRows ||
    `<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px;">데이터 없음</td></tr>`;

  // 폴더별 상세 패널 렌더
  const allBets = bets; // PENDING 포함 전체
  renderFolderDetail('single', allBets.filter(b => b.mode !== 'multi'));
  renderFolderDetail('2',      allBets.filter(b => b.mode === 'multi' && b.folderCount === '2'));
  renderFolderDetail('3',      allBets.filter(b => b.mode === 'multi' && b.folderCount === '3'));
  const getActualFC = b => b.folderCount !== '4+' ? b.folderCount : (b.folderOdds && b.folderOdds.length >= 4 ? String(b.folderOdds.length) : '4');
  renderFolderDetail('4',      allBets.filter(b => b.mode === 'multi' && getActualFC(b) === '4'));
  renderFolderDetail('5',      allBets.filter(b => b.mode === 'multi' && getActualFC(b) === '5'));
  renderFolderDetail('6',      allBets.filter(b => b.mode === 'multi' && getActualFC(b) === '6'));

  const avgOdds = resolved.reduce((s,b) => s + b.betmanOdds, 0) / resolved.length;
  const avgOddsEl = document.getElementById('sa-avg-odds');
  if (avgOddsEl) avgOddsEl.textContent = avgOdds.toFixed(2);

  // 종목별 — folderSports 우선, 없으면 sport 문자열 인덱스 분리
  const sportMap = {};
  resolved.forEach(b => {
    if (b.mode === 'multi' && b.folderResults && b.folderResults.length > 0) {
      const sports = (b.sport || '기타').split(', ');
      b.folderResults.forEach((fr, i) => {
        if (fr === null || fr === undefined) return;
        const sp = (b.folderSports && b.folderSports[i]) || sports[i] || sports[0] || '기타';
        if (!sportMap[sp]) sportMap[sp] = { total:0, wins:0, oddsSum:0 };
        sportMap[sp].total++;
        if (fr === 'WIN') sportMap[sp].wins++;
        // 폴더별 개별 배당 있으면 사용, 없으면 전체 배당
        const folderOdds = b.folderOdds && b.folderOdds[i] ? b.folderOdds[i] : b.betmanOdds;
        sportMap[sp].oddsSum += folderOdds || 0;
      });
    } else {
      const sports = (b.sport || '기타').split(', ');
      const count = sports.length;
      sports.forEach(sp => {
        if (!sportMap[sp]) sportMap[sp] = { total:0, wins:0, oddsSum:0 };
        sportMap[sp].total++;
        if (b.result === 'WIN') sportMap[sp].wins++;
        sportMap[sp].oddsSum += (b.betmanOdds || 0) / count;
      });
    }
  });

  let bestSport = '—', bestRate = 0;
  const sportRows = Object.entries(sportMap).map(([sp, d]) => {
    const wr = d.total ? (d.wins/d.total*100) : 0;
    const avgOdds = d.total ? (d.oddsSum / d.total) : 0;
    const breakeven = wr > 0 ? (100 / wr) : 0;
    if (wr > bestRate && d.total >= 2) { bestRate = wr; bestSport = sp; }
    const beColor = avgOdds >= breakeven ? 'var(--green)' : 'var(--red)';
    return `<tr>
      <td style="font-weight:600;">${sp}</td>
      <td class="mono">${d.total}/${d.wins}</td>
      <td class="mono" style="color:${wr>=50?'var(--green)':'var(--red)'};">${wr.toFixed(1)}%</td>
      <td class="mono">${avgOdds.toFixed(2)}</td>
      <td class="mono" style="color:${beColor};" title="평균배당이 손익분기보다 ${avgOdds >= breakeven ? '높아요 ✅' : '낮아요 ❌'}">${breakeven.toFixed(2)}</td>
    </tr>`;
  }).join('');
  document.getElementById('sport-stat-table').innerHTML = sportRows || '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:16px;">데이터 없음</td></tr>';
  const bestEl = document.getElementById('sa-best-sport');
  const bestRateEl = document.getElementById('sa-best-sport-rate');
  if (bestEl) bestEl.textContent = bestSport;
  if (bestRateEl) bestRateEl.textContent = bestSport !== '—' ? `적중률 ${bestRate.toFixed(1)}%` : '데이터 없음';

  // 형식별 — 다폴더는 folderResults 있으면 폴더 단위 집계
  const typeMap = {};
  resolved.forEach(b => {
    const types = (b.type || '기타').split(', ');
    if (b.mode === 'multi' && b.folderResults && b.folderResults.length > 0) {
      b.folderResults.forEach((fr, i) => {
        if (fr === null || fr === undefined) return;
        const tp = types[i] || types[0] || '기타';
        if (!typeMap[tp]) typeMap[tp] = { total:0, wins:0, profit:0, invested:0 };
        typeMap[tp].total++;
        if (fr === 'WIN') typeMap[tp].wins++;
      });
    } else {
      types.forEach(tp => {
        if (!typeMap[tp]) typeMap[tp] = { total:0, wins:0, profit:0, invested:0 };
        typeMap[tp].total++;
        if (b.result === 'WIN') typeMap[tp].wins++;
        typeMap[tp].profit   += b.profit;
        typeMap[tp].invested += b.amount;
      });
    }
  });
  const typeRows = Object.entries(typeMap).map(([tp, d]) => {
    const wr  = d.total ? (d.wins/d.total*100) : 0;
    const roi = d.invested ? (d.profit/d.invested*100) : 0;
    const profitStr = (d.profit >= 0 ? '+₩' : '-₩') + Math.abs(Math.round(d.profit)).toLocaleString();
    return `<tr>
      <td style="font-weight:600;">${tp}</td>
      <td>${d.total}</td><td>${d.wins}</td>
      <td class="mono" style="color:${wr>=50?'var(--green)':'var(--red)'};">${wr.toFixed(1)}%</td>
      <td class="mono" style="color:${d.profit>=0?'var(--green)':'var(--red)'};">${profitStr}</td>
      <td class="mono" style="color:${roi>=0?'var(--green)':'var(--red)'};">${roi>=0?'+':''}${roi.toFixed(1)}%</td>
    </tr>`;
  }).join('');
  document.getElementById('type-stat-table').innerHTML = typeRows || '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:16px;">데이터 없음</td></tr>';

  // ── 시장 유형별 ROI 분석 (논문 3 기반) ──
  const MARKETS = [
    { key:'win',   label:'🏆 승/패',       match: t => (t.includes('승/패') || t.includes('승패')) && !t.includes('전반') },
    { key:'handi', label:'⚖️ 핸디캡',      match: t => t.includes('핸디') && !t.includes('전반') },
    { key:'ou',    label:'📊 언/옵',        match: t => (t.includes('언/옵') || t.includes('오버') || t.includes('언더')) && !t.includes('전반') },
    { key:'ht-win',   label:'🏆 전반 승/패',  match: t => t.includes('전반') && (t.includes('승/패') || t.includes('승패')) },
    { key:'ht-handi', label:'⚖️ 전반 핸디캡', match: t => t.includes('전반') && t.includes('핸디') },
    { key:'ht-ou',    label:'📊 전반 언/옵',  match: t => t.includes('전반') && (t.includes('언/옵') || t.includes('오버') || t.includes('언더')) },
  ];
  const marketData = MARKETS.map(m => {
    const g = resolved.filter(b => m.match(b.type || ''));
    if (!g.length) return { ...m, total:0, wins:0, profit:0, invested:0, roi:null, wr:null };
    const wins    = g.filter(b=>b.result==='WIN').length;
    const profit  = g.reduce((s,b)=>s+(b.profit||0),0);
    const invested= g.reduce((s,b)=>s+(b.amount||0),0);
    const predG   = g.filter(b=>b.myProb && b.betmanOdds);
    const edge    = predG.length > 0 ? predG.reduce((s,b)=>s+(b.myProb-100/b.betmanOdds),0)/predG.length : null;
    return { ...m, total:g.length, wins, profit, invested,
      roi: invested ? profit/invested*100 : null,
      wr:  wins/g.length*100,
      edge };
  });

  // 카드 업데이트
  marketData.forEach(m => {
    const roiEl = document.getElementById('market-roi-'+m.key);
    const subEl = document.getElementById('market-sub-'+m.key);
    const cardEl= document.getElementById('market-card-'+m.key);
    if (!roiEl) return;
    if (m.total === 0) {
      roiEl.textContent = '—'; roiEl.style.color = 'var(--text3)';
      if (subEl) subEl.textContent = '데이터 없음';
      return;
    }
    const roi = m.roi;
    roiEl.textContent = (roi>=0?'+':'')+roi.toFixed(1)+'%';
    roiEl.style.color = roi>=0?'var(--green)':'var(--red)';
    if (subEl) subEl.textContent = `${m.total}건 · 적중 ${m.wr.toFixed(1)}%`;
    if (cardEl) {
      cardEl.style.borderColor = roi>=5?'rgba(0,230,118,0.4)':roi<=-5?'rgba(255,59,92,0.4)':'var(--border)';
      cardEl.style.background  = roi>=5?'rgba(0,230,118,0.06)':roi<=-5?'rgba(255,59,92,0.06)':'var(--bg3)';
    }
  });

  // 시장별 상세 테이블
  const mDetailTbody = document.getElementById('market-detail-table');
  if (mDetailTbody) {
    const mRows = marketData.filter(m=>m.total>0).map(m => {
      const roiStr = m.roi!=null ? (m.roi>=0?'+':'')+m.roi.toFixed(1)+'%' : '—';
      const profStr= (m.profit>=0?'+₩':'-₩')+Math.abs(Math.round(m.profit)).toLocaleString();
      const edgeStr= m.edge!=null ? (m.edge>=0?'+':'')+m.edge.toFixed(1)+'%p' : '—';
      const roiColor= m.roi!=null?(m.roi>=0?'var(--green)':'var(--red)'):'var(--text3)';
      return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
        <td style="padding:7px 4px;font-weight:600;">${m.label}</td>
        <td style="padding:7px 4px;text-align:center;color:var(--text3);">${m.total}건</td>
        <td style="padding:7px 4px;text-align:center;">${m.wr!=null?m.wr.toFixed(1)+'%':'—'}</td>
        <td style="padding:7px 4px;text-align:center;color:${m.profit>=0?'var(--green)':'var(--red)'};">${profStr}</td>
        <td style="padding:7px 4px;text-align:center;color:${roiColor};font-weight:700;">${roiStr}</td>
        <td style="padding:7px 4px;text-align:center;color:${m.edge!=null&&m.edge>=0?'var(--accent)':'var(--text3)'};">${edgeStr}</td>
      </tr>`;
    }).join('');
    mDetailTbody.innerHTML = mRows || '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:16px;">데이터 없음</td></tr>';
  }

  // 논문 인사이트 박스
  const insightBox = document.getElementById('market-insight-box');
  if (insightBox) {
    const withData = marketData.filter(m=>m.roi!=null&&m.total>=5);
    if (withData.length >= 2) {
      const best  = withData.reduce((a,b)=>a.roi>b.roi?a:b);
      const worst = withData.reduce((a,b)=>a.roi<b.roi?a:b);
      insightBox.style.display = 'block';
      insightBox.innerHTML = `<strong style="color:var(--accent);">📖 논문 인사이트 (Altmann, 2004)</strong><br>
        가장 수익률 높은 시장: <strong style="color:var(--green);">${best.label} (ROI ${best.roi.toFixed(1)}%)</strong> —
        ${best.roi>5 ? '이 시장에서 엣지가 있습니다. 베팅 비중 유지 또는 확대 고려.' : '소폭 우위. 추가 데이터 필요.'}<br>
        ${worst.roi < -5 ? `주의 시장: <span style="color:var(--red);">${worst.label} (ROI ${worst.roi.toFixed(1)}%)</span> — 이 시장 베팅 비중 축소 또는 분석 강화 권장.` : ''}`;
    } else {
      insightBox.style.display = 'none';
    }
  }

  // 시장별 ROI 막대 차트
  const chartData = marketData.filter(m=>m.total>0);
  if (chartData.length >= 1) {
    window._marketRoiChart = safeCreateChart('market-roi-chart', {
      type: 'bar',
      data: {
        labels: chartData.map(m=>m.label),
        datasets: [{
          label: 'ROI (%)',
          data: chartData.map(m=>m.roi!=null?parseFloat(m.roi.toFixed(1)):0),
          backgroundColor: chartData.map(m=>m.roi==null?'rgba(136,146,164,0.3)':m.roi>=0?'rgba(0,230,118,0.35)':'rgba(255,59,92,0.35)'),
          borderColor: chartData.map(m=>m.roi==null?'rgba(136,146,164,0.6)':m.roi>=0?'rgba(0,230,118,0.8)':'rgba(255,59,92,0.8)'),
          borderWidth: 1.5,
          borderRadius: 5
        }]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins: {
          legend: { display:false },
          tooltip: { callbacks: { label: ctx => ` ROI: ${ctx.raw>=0?'+':''}${ctx.raw}%` } }
        },
        scales: {
          x: { ticks:{color:'#8892a4',font:{size:11}}, grid:{color:'rgba(30,45,69,0.4)'} },
          y: {
            ticks:{color:'#8892a4',font:{size:10},callback:v=>v+'%'},
            grid:{color:'rgba(30,45,69,0.4)'},
            plugins: { annotation: { annotations: { zero: { type:'line', yMin:0, yMax:0, borderColor:'rgba(255,255,255,0.2)', borderWidth:1 } } } }
          }
        }
      }
    });
  }

  // 배당 구간별
  const ranges = [[1.0,2.1],[2.1,3.1],[3.1,4.1],[4.1,5.1],[5.1,6.1],[6.1,7.1],[7.1,99]];
  const rangeLabels = ['1~2.0','2.1~3.0','3.1~4.0','4.1~5.0','5.1~6.0','6.1~7.0','7.1+'];
  const oddsRows = ranges.map(([lo,hi], i) => {
    const inRange = resolved.filter(b => b.betmanOdds >= lo && b.betmanOdds < hi);
    if (!inRange.length) return `<tr><td>${rangeLabels[i]}</td><td colspan="5" style="color:var(--text3);">데이터 없음</td></tr>`;
    const wins   = inRange.filter(b => b.result === 'WIN').length;
    const wr     = wins / inRange.length * 100;
    const profit = inRange.reduce((s,b) => s+b.profit, 0);
    const avgO   = inRange.reduce((s,b) => s+b.betmanOdds, 0) / inRange.length;
    const breakEven = 1 / avgO * 100;
    const ok = wr >= breakEven;
    return `<tr>
      <td class="mono">${rangeLabels[i]}</td>
      <td>${inRange.length}</td>
      <td class="mono" style="color:${ok?'var(--green)':'var(--red)'}">${wr.toFixed(1)}%</td>
      <td class="mono" style="color:${profit>=0?'var(--green)':'var(--red)'}">${profit>=0?'+':''}₩${Math.round(profit).toLocaleString()}</td>
      <td class="mono" style="color:var(--gold);">${breakEven.toFixed(1)}%</td>
      <td>${ok ? '<span class="badge badge-value">수익</span>' : '<span class="badge badge-novalue">손실</span>'}</td>
    </tr>`;
  }).join('');
  document.getElementById('odds-range-table').innerHTML = oddsRows;

  // 연속 기록
  let maxStreak = 0, curStreak = 0, maxLose = 0, curLose = 0;
  let tempS = 0, tempL = 0;
  [...resolved].reverse().forEach(b => {
    if (b.result === 'WIN')  { tempS++; tempL = 0; maxStreak = Math.max(maxStreak, tempS); }
    else                     { tempL++; tempS = 0; maxLose   = Math.max(maxLose,   tempL); }
  });
  // 현재 연속 (최신 베팅부터 역순으로 계산)
  curStreak = 0; curLose = 0;
  for (let i = 0; i < resolved.length; i++) {
    if (resolved[i].result === 'WIN')  { curStreak++; } else break;
  }
  for (let i = 0; i < resolved.length; i++) {
    if (resolved[i].result === 'LOSE') { curLose++; } else break;
  }
  const msEl  = document.getElementById('sa-max-streak');
  const mlEl  = document.getElementById('sa-max-lose-streak');
  const csEl  = document.getElementById('sa-cur-streak');
  const clEl  = document.getElementById('sa-cur-lose-streak');
  if (msEl) msEl.textContent = maxStreak;
  if (mlEl) mlEl.textContent = maxLose;
  if (csEl) csEl.textContent = curStreak;
  if (clEl) clEl.textContent = curLose;

  // 월별 차트
  const monthMap = {};
  resolved.forEach(b => {
    const m = (b.date || '').slice(0, 7);
    if (!m) return;
    if (!monthMap[m]) monthMap[m] = 0;
    monthMap[m] += b.profit;
  });
  const months = Object.keys(monthMap).sort();
  if (charts.monthly) charts.monthly.destroy();
  charts.monthly = safeCreateChart('monthlyChart', {
    type: 'bar',
    data: {
      labels: months.map(m => m.slice(2)),
      datasets: [{
        data: months.map(m => Math.round(monthMap[m])),
        backgroundColor: months.map(m => monthMap[m] >= 0 ? 'rgba(0,230,118,0.4)' : 'rgba(255,59,92,0.4)'),
        borderColor:     months.map(m => monthMap[m] >= 0 ? 'var(--green)' : 'var(--red)'),
        borderWidth: 1, borderRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#4a5568', font: { size: 10 } }, grid: { color: 'rgba(30,45,69,0.5)' } },
        y: { ticks: { color: '#4a5568', font: { size: 10 }, callback: v => `₩${(v/1000).toFixed(0)}K` }, grid: { color: 'rgba(30,45,69,0.5)' } }
      }
    }
  });

  // ── 예측 정확도 분석 ──
  const predBets = resolved.filter(b => b.myProb != null && b.myProb > 0);

  document.getElementById('pred-total').textContent = predBets.length;

  if (predBets.length === 0) {
    document.getElementById('pred-hit-rate').textContent = '—';
    document.getElementById('pred-avg-myprob').textContent = '—';
    document.getElementById('pred-avg-implied').textContent = '—';
    document.getElementById('pred-table').innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px;">예상 승률을 입력한 베팅 기록이 없습니다</td></tr>`;
    return;
  }

  // +EV 예측(내 승률 > 내재확률)이면서 실제 적중한 비율
  const posEdgeBets = predBets.filter(b => b.myProb > (1 / b.betmanOdds * 100));
  const posEdgeWins = posEdgeBets.filter(b => b.result === 'WIN').length;
  const hitRate = posEdgeBets.length > 0 ? (posEdgeWins / posEdgeBets.length * 100).toFixed(1) : '—';

  const avgMyProb   = (predBets.reduce((s, b) => s + b.myProb, 0) / predBets.length).toFixed(1);
  const avgImplied  = (predBets.reduce((s, b) => s + (1 / b.betmanOdds * 100), 0) / predBets.length).toFixed(1);

  document.getElementById('pred-hit-rate').textContent    = hitRate !== '—' ? hitRate + '%' : '—';
  document.getElementById('pred-avg-myprob').textContent  = avgMyProb + '%';
  document.getElementById('pred-avg-implied').textContent = avgImplied + '%';

  // 예측 기록 테이블 — 페이지네이션
  predAllBets = predBets.slice().reverse(); // 최신순
  predPage = 1;
  renderPredPage();

  // 예측 정확도 차트 (내 예상 승률 vs 내재확률 비교)
  if (charts.predAccuracy) charts.predAccuracy.destroy();
  charts.predAccuracy = safeCreateChart('predAccuracyChart', {
    type: 'line',
    data: {
      labels: predBets.map((_, i) => `${i+1}번`),
      datasets: [
        {
          label: '내 예상 승률',
          data: predBets.map(b => b.myProb),
          borderColor: '#00e676',
          backgroundColor: 'rgba(0,230,118,0.15)',
          borderWidth: 3,
          pointRadius: 6,
          pointBackgroundColor: predBets.map(b => b.result === 'WIN' ? '#00e676' : b.result === 'LOSE' ? '#ff3b5c' : '#ffd700'),
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          tension: 0.3,
          fill: false,
        },
        {
          label: '북메이커 내재확률',
          data: predBets.map(b => parseFloat((1/b.betmanOdds*100).toFixed(1))),
          borderColor: '#ffd700',
          backgroundColor: 'rgba(255,215,0,0.08)',
          borderWidth: 2,
          borderDash: [6, 3],
          pointRadius: 4,
          pointBackgroundColor: '#ffd700',
          pointBorderColor: '#1a2740',
          pointBorderWidth: 1,
          tension: 0.3,
          fill: false,
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#c8d6e8',
            font: { size: 12, weight: '700' },
            padding: 16,
            usePointStyle: true,
            pointStyleWidth: 12,
          }
        },
        tooltip: {
          backgroundColor: 'rgba(10,20,40,0.95)',
          titleColor: '#c8d6e8',
          bodyColor: '#8892a4',
          borderColor: 'rgba(0,229,255,0.3)',
          borderWidth: 1,
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%`,
            afterBody: (items) => {
              const idx = items[0]?.dataIndex;
              if (idx == null) return '';
              const b = predBets[idx];
              const edge = (b.myProb - (1/b.betmanOdds*100)).toFixed(1);
              const result = b.result === 'WIN' ? '✅ 적중' : b.result === 'LOSE' ? '❌ 미적중' : '⏳ 미결';
              return [`우위: ${parseFloat(edge)>=0?'+':''}${edge}%p`, `결과: ${result}`];
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#8892a4', font: { size: 11 } },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        y: {
          ticks: { color: '#8892a4', font: { size: 11 }, callback: v => v + '%' },
          grid: { color: 'rgba(255,255,255,0.05)' },
          min: 0, max: 100,
        }
      }
    }
  });

  // ── 요일별 통계 ──
  const DOW_LABELS = ['일','월','화','수','목','금','토'];
  const DOW_ORDER  = [1,2,3,4,5,6,0]; // 월~일 순서로 표시
  const dowMap = {};
  DOW_ORDER.forEach(d => { dowMap[d] = { total:0, wins:0, profit:0, invested:0, avgOdds:0 }; });

  resolved.forEach(b => {
    if (!b.date) return;
    const day = new Date(b.date).getDay(); // 0=일,1=월,...
    if (!dowMap[day]) return;
    dowMap[day].total++;
    if (b.result === 'WIN') dowMap[day].wins++;
    dowMap[day].profit   += b.profit;
    dowMap[day].invested += b.amount;
    dowMap[day].avgOdds  += b.betmanOdds;
  });

  const dowRows = DOW_ORDER.map(d => {
    const s = dowMap[d];
    if (s.total === 0) return `<tr><td style="font-weight:700;">${DOW_LABELS[d]}</td><td colspan="5" style="color:var(--text3);">—</td></tr>`;
    const wr  = s.wins / s.total * 100;
    const roi = s.invested > 0 ? s.profit / s.invested * 100 : 0;
    const avgO = s.avgOdds / s.total;
    const bep  = 1 / avgO * 100;
    const wrColor = wr >= bep ? 'var(--green)' : 'var(--red)';
    return `<tr>
      <td style="font-weight:700;color:${d===0||d===6?'var(--gold)':'var(--text2)'};">${DOW_LABELS[d]}${d===0||d===6?' 🟡':''}</td>
      <td>${s.total}</td>
      <td>${s.wins}</td>
      <td class="mono" style="color:${wrColor};">${wr.toFixed(1)}%</td>
      <td class="mono" style="color:${s.profit>=0?'var(--green)':'var(--red)'};">${s.profit>=0?'+':''}₩${Math.round(s.profit).toLocaleString()}</td>
      <td class="mono" style="color:${roi>=0?'var(--green)':'var(--red)'};">${roi>=0?'+':''}${roi.toFixed(1)}%</td>
    </tr>`;
  }).join('');
  document.getElementById('dow-stat-table').innerHTML = dowRows;

  // 요일별 차트 업데이트
  const dowWrData  = DOW_ORDER.map(d => dowMap[d].total > 0 ? parseFloat((dowMap[d].wins/dowMap[d].total*100).toFixed(1)) : null);
  const dowBepData = DOW_ORDER.map(d => dowMap[d].total > 0 ? parseFloat((1/(dowMap[d].avgOdds/dowMap[d].total)*100).toFixed(1)) : null);
  const dowRoiData = DOW_ORDER.map(d => dowMap[d].invested > 0 ? parseFloat((dowMap[d].profit/dowMap[d].invested*100).toFixed(1)) : null);
  const dowColors  = DOW_ORDER.map((d, i) => {
    if (dowMap[d].total === 0) return 'rgba(72,82,104,0.3)';
    return dowWrData[i] >= dowBepData[i] ? 'rgba(0,230,118,0.45)' : 'rgba(255,59,92,0.45)';
  });
  const dowRoiColors = dowRoiData.map(v => v === null ? 'rgba(72,82,104,0.3)' : v >= 0 ? 'rgba(0,229,255,0.5)' : 'rgba(255,59,92,0.5)');

  const roiMin = Math.min(0, ...dowRoiData.filter(v => v !== null)) - 5;
  const roiMax = Math.max(0, ...dowRoiData.filter(v => v !== null)) + 5;

  if (charts.dow) { charts.dow.destroy(); charts.dow = null; }
  charts.dow = safeCreateChart('dowChart', {
    type: 'bar',
    data: {
      labels: ['월','화','수','목','금','토','일'],
      datasets: [
        { label: '적중률(%)', data: dowWrData, backgroundColor: dowColors, borderColor: DOW_ORDER.map((d,i) => dowWrData[i] !== null && dowWrData[i] >= dowBepData[i] ? '#00e676' : '#ff3b5c'), borderWidth: 1, borderRadius: 4, yAxisID: 'yWr' },
        { label: '수익률(ROI%)', data: dowRoiData, backgroundColor: dowRoiColors, borderColor: dowRoiData.map(v => v === null ? 'transparent' : v >= 0 ? '#00e5ff' : '#ff3b5c'), borderWidth: 1, borderRadius: 4, yAxisID: 'yRoi' },
        { label: '손익분기(%)', data: dowBepData, type: 'line', borderColor: 'rgba(255,215,0,0.6)', borderDash: [4,3], pointRadius: 0, borderWidth: 2, fill: false, yAxisID: 'yWr' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#8892a4', font: { size: 10 } } } },
      scales: {
        x: { ticks: { color: '#8892a4', font: { size: 12, weight: '700' } }, grid: { color: 'rgba(30,45,69,0.5)' } },
        yWr:  { position: 'left',  min: 0, max: 100, ticks: { color: '#8892a4', font: { size: 10 }, callback: v => v + '%' }, grid: { color: 'rgba(30,45,69,0.5)' }, title: { display: true, text: '적중률', color: '#8892a4', font: { size: 10 } } },
        yRoi: { position: 'right', min: roiMin, max: roiMax, ticks: { color: '#00e5ff', font: { size: 10 }, callback: v => v + '%' }, grid: { display: false }, title: { display: true, text: 'ROI', color: '#00e5ff', font: { size: 10 } } }
      }
    }
  });
}


// ========== EV 판단 오류 패턴 ==========
function updateEvBias() {
  const evBets = bets.filter(b =>
    b.isValue === true && (b.result === 'WIN' || b.result === 'LOSE')
  );

  const noData = '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:16px;">데이터 없음</td></tr>';

  if (evBets.length === 0) {
    ['ev-bias-wr','ev-bias-pnl','ev-bias-worst-sport','ev-bias-best-sport'].forEach(id => {
      const el = document.getElementById(id); if (el) { el.textContent = '—'; el.style.color = ''; }
    });
    const stEl = document.getElementById('ev-bias-sport-table'); if (stEl) stEl.innerHTML = noData;
    const odEl = document.getElementById('ev-bias-odds-table'); if (odEl) odEl.innerHTML = noData;
    return;
  }

  // 전체 EV+ 적중률 / 손익
  const wins = evBets.filter(b => b.result === 'WIN');
  const totalWr = wins.length / evBets.length;
  const totalPnl = evBets.reduce((s, b) => s + (b.profit || 0), 0);

  const wrEl = document.getElementById('ev-bias-wr');
  if (wrEl) {
    wrEl.textContent = (totalWr * 100).toFixed(1) + '%';
    wrEl.style.color = totalWr >= 0.5 ? 'var(--green)' : 'var(--red)';
  }
  const wrLabelEl = document.getElementById('ev-bias-wr-label');
  if (wrLabelEl) wrLabelEl.textContent = `EV+ ${evBets.length}건 중 ${wins.length}적중`;

  const pnlEl = document.getElementById('ev-bias-pnl');
  if (pnlEl) {
    pnlEl.textContent = (totalPnl >= 0 ? '+' : '') + '₩' + Math.round(totalPnl).toLocaleString();
    pnlEl.style.color = totalPnl >= 0 ? 'var(--green)' : 'var(--red)';
  }
  const pnlLabelEl = document.getElementById('ev-bias-pnl-label');
  if (pnlLabelEl) pnlLabelEl.textContent = totalPnl >= 0 ? '✅ EV 판단이 실제로 작동 중' : '⚠️ EV 판단에 편향 존재 가능';

  // 종목별 집계 — folderSports 우선, 없으면 sport 분리
  const sportMap = {};
  evBets.forEach(b => {
    if (b.mode === 'multi' && b.folderResults && b.folderResults.length > 0) {
      const sports = (b.sport || '기타').split(', ');
      b.folderResults.forEach((fr, i) => {
        if (fr === null || fr === undefined) return;
        const sp = (b.folderSports && b.folderSports[i]) || sports[i] || sports[0] || '기타';
        if (!sportMap[sp]) sportMap[sp] = { total: 0, wins: 0, pnl: 0 };
        sportMap[sp].total++;
        if (fr === 'WIN') sportMap[sp].wins++;
      });
    } else {
      const sports = (b.sport || '기타').split(', ');
      const count = sports.length;
      sports.forEach(sp => {
        if (!sportMap[sp]) sportMap[sp] = { total: 0, wins: 0, pnl: 0 };
        sportMap[sp].total++;
        if (b.result === 'WIN') sportMap[sp].wins++;
        sportMap[sp].pnl += (b.profit || 0) / count;
      });
    }
  });

  const sportRows = Object.entries(sportMap)
    .filter(([, v]) => v.total >= 1)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([sport, v]) => {
      const wr = v.wins / v.total;
      const wrColor = wr >= 0.55 ? 'var(--green)' : wr >= 0.45 ? 'var(--gold)' : 'var(--red)';
      const pnlColor = v.pnl >= 0 ? 'var(--green)' : 'var(--red)';
      const judge = wr >= 0.55 ? '✅ 정확' : wr >= 0.45 ? '🟡 보통' : '❌ 편향';
      return `<tr>
        <td style="font-weight:600;">${sport}</td>
        <td class="mono">${v.total}</td>
        <td class="mono">${v.wins}</td>
        <td class="mono" style="color:${wrColor};font-weight:700;">${(wr*100).toFixed(1)}%</td>
        <td class="mono" style="color:${pnlColor};">${v.pnl >= 0 ? '+' : ''}₩${Math.round(v.pnl).toLocaleString()}</td>
        <td style="font-weight:700;">${judge}</td>
      </tr>`;
    });

  const stEl = document.getElementById('ev-bias-sport-table');
  if (stEl) stEl.innerHTML = sportRows.length > 0 ? sportRows.join('') : noData;

  // 최고/최악 종목
  const sportArr = Object.entries(sportMap).filter(([, v]) => v.total >= 3);
  if (sportArr.length > 0) {
    const best  = sportArr.reduce((a, b) => (b[1].wins/b[1].total > a[1].wins/a[1].total) ? b : a);
    const worst = sportArr.reduce((a, b) => (b[1].wins/b[1].total < a[1].wins/a[1].total) ? b : a);
    const bestEl = document.getElementById('ev-bias-best-sport');
    const worstEl = document.getElementById('ev-bias-worst-sport');
    if (bestEl)  { bestEl.textContent  = best[0];  bestEl.style.color  = 'var(--green)'; }
    if (worstEl) { worstEl.textContent = worst[0]; worstEl.style.color = 'var(--red)'; }
    const bestLabelEl  = document.getElementById('ev-bias-best-sport-label');
    const worstLabelEl = document.getElementById('ev-bias-worst-sport-label');
    if (bestLabelEl)  bestLabelEl.textContent  = `적중률 ${(best[1].wins/best[1].total*100).toFixed(1)}% (${best[1].total}건)`;
    if (worstLabelEl) worstLabelEl.textContent = `적중률 ${(worst[1].wins/worst[1].total*100).toFixed(1)}% (${worst[1].total}건)`;
  }

  // 배당 구간별 집계
  const oddsRanges = [
    { label: '1~2.0',   min: 1.0, max: 2.1 },
    { label: '2.1~3.0', min: 2.1, max: 3.1 },
    { label: '3.1~4.0', min: 3.1, max: 4.1 },
    { label: '4.1~5.0', min: 4.1, max: 5.1 },
    { label: '5.1~6.0', min: 5.1, max: 6.1 },
    { label: '6.1~7.0', min: 6.1, max: 7.1 },
    { label: '7.1+',    min: 7.1, max: 999 },
  ];

  const oddsRows = oddsRanges.map(r => {
    const group = evBets.filter(b => b.betmanOdds >= r.min && b.betmanOdds < r.max);
    if (group.length === 0) return null;
    const gWins = group.filter(b => b.result === 'WIN').length;
    const gPnl  = group.reduce((s, b) => s + (b.profit || 0), 0);
    const wr    = gWins / group.length;
    const wrColor  = wr >= 0.55 ? 'var(--green)' : wr >= 0.45 ? 'var(--gold)' : 'var(--red)';
    const pnlColor = gPnl >= 0 ? 'var(--green)' : 'var(--red)';
    const judge    = wr >= 0.55 ? '✅ 정확' : wr >= 0.45 ? '🟡 보통' : '❌ 편향';
    return `<tr>
      <td style="font-weight:600;">${r.label}</td>
      <td class="mono">${group.length}</td>
      <td class="mono">${gWins}</td>
      <td class="mono" style="color:${wrColor};font-weight:700;">${(wr*100).toFixed(1)}%</td>
      <td class="mono" style="color:${pnlColor};">${gPnl >= 0 ? '+' : ''}₩${Math.round(gPnl).toLocaleString()}</td>
      <td style="font-weight:700;">${judge}</td>
    </tr>`;
  }).filter(Boolean);

  const odEl = document.getElementById('ev-bias-odds-table');
  if (odEl) odEl.innerHTML = oddsRows.length > 0 ? oddsRows.join('') : noData;
}

// ========== EV+ 월별 추이 ==========
function updateEvMonthly() {
  const evBets = bets.filter(b =>
    b.isValue === true && (b.result === 'WIN' || b.result === 'LOSE') && b.date
  );

  const noData = '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:16px;">데이터 없음</td></tr>';
  const tableEl = document.getElementById('ev-monthly-table');

  if (evBets.length === 0) {
    if (tableEl) tableEl.innerHTML = noData;
    return;
  }

  // 월별 집계
  const monthMap = {};
  evBets.forEach(b => {
    const month = b.date.slice(0, 7); // YYYY-MM
    if (!monthMap[month]) monthMap[month] = { total: 0, wins: 0, pnl: 0 };
    monthMap[month].total++;
    if (b.result === 'WIN') monthMap[month].wins++;
    monthMap[month].pnl += (b.profit || 0);
  });

  const months = Object.keys(monthMap).sort();

  const rows = months.map(m => {
    const v = monthMap[m];
    const wr = v.wins / v.total;
    const wrColor  = wr >= 0.55 ? 'var(--green)' : wr >= 0.45 ? 'var(--gold)' : 'var(--red)';
    const pnlColor = v.pnl >= 0 ? 'var(--green)' : 'var(--red)';
    const judge    = wr >= 0.55 ? '✅ 개선' : wr >= 0.45 ? '🟡 보통' : '❌ 편향';
    return `<tr>
      <td style="font-weight:600;">${m}</td>
      <td class="mono">${v.total}</td>
      <td class="mono">${v.wins}</td>
      <td class="mono" style="color:${wrColor};font-weight:700;">${(wr*100).toFixed(1)}%</td>
      <td class="mono" style="color:${pnlColor};">${v.pnl >= 0 ? '+' : ''}₩${Math.round(v.pnl).toLocaleString()}</td>
      <td>${judge}</td>
    </tr>`;
  });

  if (tableEl) tableEl.innerHTML = rows.join('');

  // 차트
  const wrData  = months.map(m => parseFloat((monthMap[m].wins / monthMap[m].total * 100).toFixed(1)));
  const bepData = months.map(() => 50); // 손익분기 50%

  if (charts.evMonthly) { charts.evMonthly.destroy(); charts.evMonthly = null; }
  const canvas = document.getElementById('evMonthlyChart');
  if (canvas && months.length > 0) {
    charts.evMonthly = safeCreateChart('evMonthlyChart', {
      type: 'line',
      data: {
        labels: months,
        datasets: [
          {
            label: 'EV+ 적중률',
            data: wrData,
            borderColor: '#00e676',
            backgroundColor: 'rgba(0,230,118,0.08)',
            borderWidth: 2,
            pointRadius: 5,
            pointBackgroundColor: wrData.map(v => v >= 55 ? '#00e676' : v >= 45 ? '#ffd700' : '#ff3b5c'),
            fill: true,
            tension: 0.3
          },
          {
            label: '손익분기(50%)',
            data: bepData,
            borderColor: 'rgba(136,146,164,0.4)',
            borderDash: [5, 5],
            borderWidth: 1,
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#8892a4', font: { size: 11 } } }
        },
        scales: {
          x: { ticks: { color: '#8892a4', font: { size: 10 } }, grid: { color: 'rgba(30,45,69,0.5)' } },
          y: {
            min: 0, max: 100,
            ticks: { color: '#4a5568', font: { size: 10 }, callback: v => v + '%' },
            grid: { color: 'rgba(30,45,69,0.5)' }
          }
        }
      }
    });
  }
}

function updateEvCum() {
  // EV+ 이고 결과 확정된 베팅만, 날짜순 정렬
  const resolved = bets
    .filter(b => b.result === 'WIN' || b.result === 'LOSE')
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const labels = [];
  const cumEV = [];
  const cumActual = [];
  let runEV = 0, runActual = 0;

  resolved.forEach((b, i) => {
    // EV 기댓값: isValue이고 myProb 있으면 계산, 없으면 0 누적
    let evAmount = 0;
    if (b.isValue && b.myProb && b.betmanOdds) {
      const edge = (b.myProb / 100) * b.betmanOdds - 1;
      evAmount = b.amount * edge;
    }
    runEV += evAmount;
    runActual += b.profit;
    labels.push(i + 1);
    cumEV.push(Math.round(runEV));
    cumActual.push(Math.round(runActual));
  });

  // 요약 카드 업데이트
  const expEl  = document.getElementById('ev-cum-expected');
  const actEl  = document.getElementById('ev-cum-actual');
  const luckEl = document.getElementById('ev-cum-luck');
  const intEl  = document.getElementById('ev-cum-interpret');

  if (!resolved.length) {
    if (expEl) expEl.textContent = '—';
    if (actEl) actEl.textContent = '—';
    if (luckEl) luckEl.textContent = '—';
    if (intEl) intEl.textContent = '결과가 확정된 베팅이 없습니다.';
    return;
  }

  const lastEV = cumEV[cumEV.length - 1];
  const lastActual = cumActual[cumActual.length - 1];
  const luck = lastActual - lastEV;

  if (expEl) {
    expEl.textContent = (lastEV >= 0 ? '+' : '') + '₩' + Math.abs(lastEV).toLocaleString();
    expEl.style.color = lastEV >= 0 ? 'var(--gold)' : 'var(--red)';
  }
  if (actEl) {
    actEl.textContent = (lastActual >= 0 ? '+' : '') + '₩' + Math.abs(lastActual).toLocaleString();
    actEl.style.color = lastActual >= 0 ? 'var(--green)' : 'var(--red)';
  }
  if (luckEl) {
    luckEl.textContent = (luck >= 0 ? '+' : '') + '₩' + Math.abs(luck).toLocaleString();
    luckEl.style.color = luck >= 0 ? 'var(--green)' : 'var(--red)';
  }
  if (intEl) {
    const evOnlyCount = resolved.filter(b => b.isValue && b.myProb && b.betmanOdds).length;
    if (evOnlyCount === 0) {
      intEl.textContent = '⚠️ EV+ 베팅에 예상 승률이 입력된 기록이 없어 기댓값을 계산할 수 없습니다. EV 계산기를 사용해 베팅을 기록하면 이 그래프가 활성화됩니다.';
    } else if (luck > 0) {
      intEl.innerHTML = `✅ 현재 기댓값 대비 실제 수익이 <strong style="color:var(--green);">+₩${Math.abs(luck).toLocaleString()}</strong> 앞서 있습니다. 운이 따르고 있습니다 — 판단이 옳다면 장기적으로 두 선은 수렴합니다.`;
    } else if (luck < 0) {
      intEl.innerHTML = `⏳ 현재 기댓값 대비 실제 수익이 <strong style="color:var(--red);">-₩${Math.abs(luck).toLocaleString()}</strong> 뒤처져 있습니다. 확률적으로 정상 범위일 수 있습니다 — EV 판단이 맞다면 반드시 수렴합니다.`;
    } else {
      intEl.innerHTML = `🎯 누적 기댓값과 실제 수익이 일치합니다. EV 계산이 정확하게 작동하고 있습니다.`;
    }
  }

  // 차트
  const ctx = document.getElementById('evCumChart');
  if (!ctx) return;
  if (charts.evCum) { charts.evCum.destroy(); charts.evCum = null; }

  charts.evCum = safeCreateChart('evCumChart', {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '누적 기댓값 (이론)',
          data: cumEV,
          borderColor: 'rgba(255,215,0,0.9)',
          backgroundColor: 'rgba(255,215,0,0.08)',
          borderWidth: 2,
          borderDash: [],
          pointRadius: resolved.length <= 30 ? 3 : 0,
          fill: false,
          tension: 0.3
        },
        {
          label: '누적 실제 수익',
          data: cumActual,
          borderColor: 'rgba(0,230,118,0.9)',
          backgroundColor: 'rgba(0,230,118,0.08)',
          borderWidth: 2,
          borderDash: [5, 4],
          pointRadius: resolved.length <= 30 ? 3 : 0,
          fill: false,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#8892a4', font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => ctx.dataset.label + ': ' + (ctx.parsed.y >= 0 ? '+' : '') + '₩' + Math.abs(ctx.parsed.y).toLocaleString()
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#8892a4', font: { size: 10 }, maxTicksLimit: 10 },
          grid: { color: 'rgba(30,45,69,0.5)' },
          title: { display: true, text: '베팅 회차', color: '#4a5568', font: { size: 10 } }
        },
        y: {
          ticks: {
            color: '#4a5568', font: { size: 10 },
            callback: v => (v >= 0 ? '+' : '') + '₩' + Math.abs(v).toLocaleString()
          },
          grid: { color: 'rgba(30,45,69,0.5)' }
        }
      }
    }
  });
}

// ========== 켈리 히스토리 ==========
function toggleGuide() {
  const el = document.getElementById('guide-content');
  const icon = document.getElementById('guide-toggle-icon');
  if (!el) return;
  const isHidden = el.style.display === 'none';
  el.style.display = isHidden ? 'block' : 'none';
  icon.textContent = isHidden ? '▲' : '▼';
}

function updateKellyHistory() {
  // EV+ 베팅 중 myProb과 betmanOdds가 있는 것만 분석
  const evBets = bets.filter(b =>
    b.isValue && b.myProb && b.betmanOdds >= 1 &&
    (b.result === 'WIN' || b.result === 'LOSE')
  );

  const noDataMsg = '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px;">EV+ 베팅 기록이 없습니다</td></tr>';

  if (evBets.length === 0) {
    const el = document.getElementById('kelly-hist-table');
    if (el) el.innerHTML = noDataMsg;
    ['kelly-hist-avg-ratio','kelly-hist-over-pct','kelly-hist-ok-pct','kelly-hist-over-pnl'].forEach(id => {
      const e = document.getElementById(id); if (e) e.textContent = '—';
    });
    return;
  }

  // 각 베팅 시점의 뱅크롤 재구성 (시간순 정렬)
  const sorted = [...bets].sort((a, b) => new Date(a.date) - new Date(b.date));
  const { startFund = 0 } = appSettings;
  let runningBankroll = startFund;

  // 베팅 id → 그 시점 뱅크롤 맵
  const bankrollAtBet = {};
  sorted.forEach(b => {
    bankrollAtBet[b.id] = runningBankroll;
    if (b.result === 'WIN' || b.result === 'LOSE') {
      runningBankroll += (b.profit || 0);
    }
  });

  // 켈리 계산 함수
  function calcHalfKelly(myProbPct, odds) {
    const p = myProbPct / 100;
    const b = odds - 1;
    const q = 1 - p;
    const kelly = (b * p - q) / b;
    return Math.max(0, kelly / 2);
  }

  const rows = [];
  let totalRatio = 0, overCount = 0, okCount = 0;
  let overPnl = 0;

  // 배율 구간 카운트 (분포용)
  const dist = { '0~0.5x': 0, '0.5~1x': 0, '1~1.3x': 0, '1.3~2x': 0, '2x+': 0 };

  evBets.forEach(b => {
    const br = bankrollAtBet[b.id] || startFund;
    if (!br) return;
    const hk = calcHalfKelly(b.myProb, b.betmanOdds);
    const recAmount = Math.round(br * hk / 1000) * 1000;
    if (recAmount <= 0) return;
    const ratio = b.amount / recAmount;
    totalRatio += ratio;

    if (ratio > 1.3) { overCount++; overPnl += (b.profit || 0); }
    else okCount++;

    // 분포
    if (ratio < 0.5) dist['0~0.5x']++;
    else if (ratio < 1.0) dist['0.5~1x']++;
    else if (ratio < 1.3) dist['1~1.3x']++;
    else if (ratio < 2.0) dist['1.3~2x']++;
    else dist['2x+']++;

    const ratioColor = ratio > 2.0 ? 'var(--red)' : ratio > 1.3 ? 'var(--accent2)' : ratio < 0.5 ? 'var(--text3)' : 'var(--green)';
    const pnlColor = (b.profit || 0) >= 0 ? 'var(--green)' : 'var(--red)';
    rows.push(`<tr>
      <td>${b.date || '-'}</td>
      <td style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${b.game || '-'}</td>
      <td class="mono">₩${b.amount.toLocaleString()}</td>
      <td class="mono">${recAmount > 0 ? '₩' + recAmount.toLocaleString() : '—'}</td>
      <td class="mono" style="font-weight:700;color:${ratioColor};">${ratio.toFixed(2)}x</td>
      <td style="color:${b.result === 'WIN' ? 'var(--green)' : 'var(--red)'};">${b.result === 'WIN' ? '✅ 적중' : '❌ 미적중'}</td>
      <td class="mono" style="color:${pnlColor};">${(b.profit||0) >= 0 ? '+' : ''}₩${Math.round(b.profit||0).toLocaleString()}</td>
    </tr>`);
  });

  // 테이블 — 페이지네이션 (최신순, 12개/페이지)
  kellyRows = rows.slice().reverse();
  kellyPage = 1;
  renderKellyPage();

  // 요약 카드
  const n = rows.length || 1;
  const avgRatio = totalRatio / n;
  const avgEl = document.getElementById('kelly-hist-avg-ratio');
  if (avgEl) {
    avgEl.textContent = avgRatio.toFixed(2) + 'x';
    avgEl.style.color = avgRatio > 1.3 ? 'var(--red)' : avgRatio > 1.0 ? 'var(--accent2)' : 'var(--green)';
  }
  const avgLabelEl = document.getElementById('kelly-hist-avg-label');
  if (avgLabelEl) avgLabelEl.textContent = avgRatio > 1.3 ? '⚠️ 평균적으로 켈리 초과 중' : avgRatio > 1.0 ? '권장 대비 약간 과한 편' : '✅ 안정적인 베팅 패턴';

  const overPct = (overCount / n * 100).toFixed(0);
  const okPct   = (okCount / n * 100).toFixed(0);
  const overEl = document.getElementById('kelly-hist-over-pct');
  const okEl   = document.getElementById('kelly-hist-ok-pct');
  if (overEl) { overEl.textContent = overPct + '%'; overEl.style.color = overCount > 0 ? 'var(--red)' : 'var(--green)'; }
  if (okEl)   { okEl.textContent   = okPct   + '%'; }
  const overLabelEl = document.getElementById('kelly-hist-over-label');
  if (overLabelEl) overLabelEl.textContent = `총 ${n}건 중 ${overCount}건 초과`;
  const okLabelEl = document.getElementById('kelly-hist-ok-label');
  if (okLabelEl) okLabelEl.textContent = `총 ${n}건 중 ${okCount}건 준수`;

  const overPnlEl = document.getElementById('kelly-hist-over-pnl');
  if (overPnlEl) {
    overPnlEl.textContent = (overPnl >= 0 ? '+' : '') + '₩' + Math.round(overPnl).toLocaleString();
    overPnlEl.style.color = overPnl >= 0 ? 'var(--green)' : 'var(--red)';
  }

  // 배율 분포 차트
  const distLabels = Object.keys(dist);
  const distData   = Object.values(dist);
  const distColors = ['#4a5568','#8892a4','#00e676','#ff9800','#ff3b5c'];

  if (charts.kellyDist) { charts.kellyDist.destroy(); charts.kellyDist = null; }
  const kdCanvas = document.getElementById('kellyDistChart');
  if (kdCanvas && distData.some(v => v > 0)) {
    charts.kellyDist = safeCreateChart('kellyDistChart', {
      type: 'bar',
      data: {
        labels: distLabels,
        datasets: [{ label: '베팅 수', data: distData, backgroundColor: distColors, borderRadius: 5 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#8892a4', font: { size: 11 } }, grid: { color: 'rgba(30,45,69,0.5)' } },
          y: { ticks: { color: '#4a5568', font: { size: 10 } }, grid: { color: 'rgba(30,45,69,0.5)' } }
        }
      }
    });
  }
}

