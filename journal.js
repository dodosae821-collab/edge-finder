// ========== AI의 한마디 ==========
async function runAIAdvice() {
  const btn       = document.getElementById('ai-advice-btn');
  const loading   = document.getElementById('ai-advice-loading');
  const result    = document.getElementById('ai-advice-result');
  const errorEl   = document.getElementById('ai-advice-error');
  const loadingMsg= document.getElementById('ai-loading-msg');

  // UI 초기화
  btn.disabled = true;
  btn.textContent = '분석 중...';
  loading.style.display = 'block';
  result.style.display = 'none';
  errorEl.style.display = 'none';

  const msgs = ['베팅 기록 읽는 중...','패턴 분석 중...','판정 생성 중...'];
  let mi = 0;
  const msgTimer = setInterval(() => { if(loadingMsg) loadingMsg.textContent = msgs[mi++ % msgs.length]; }, 2000);

  try {
    const SS = window._SS || {};
    const resolved = bets.filter(b => b.result !== 'PENDING');
    const recent10 = resolved.slice(-10);

    // 최근 10건 요약
    const recentSummary = recent10.map(b => {
      const sp = (b.folderSports && b.folderSports[0]) || b.sport || '?';
      return `${b.date} ${sp} ${b.betmanOdds}배 ${b.result === 'WIN' ? '적중' : '미적중'} (${b.profit >= 0 ? '+' : ''}${Math.round(b.profit).toLocaleString()}원)`;
    }).join('\n');

    // 오늘 베팅 여부
    const today = getKSTDateStr();
    const todayBets = bets.filter(b => b.date === today);
    const todayLoss = todayBets.filter(b => b.result === 'LOSE').reduce((s,b) => s+Math.abs(b.profit||0), 0);
    const todayCount = todayBets.length;

    // 종목별 ROI
    const sportMap = {};
    resolved.forEach(b => {
      const sp = (b.folderSports && b.folderSports[0]) || b.sport || '기타';
      if (!sportMap[sp]) sportMap[sp] = { n:0, profit:0, invest:0 };
      sportMap[sp].n++;
      sportMap[sp].profit += b.profit || 0;
      sportMap[sp].invest += b.amount || 0;
    });
    const sportSummary = Object.entries(sportMap)
      .sort((a,b) => b[1].n - a[1].n).slice(0,6)
      .map(([sp,v]) => `${sp}: ${v.n}건 ROI${v.invest>0?((v.profit/v.invest*100)>=0?'+':'')+(v.profit/v.invest*100).toFixed(0)+'%':'—'}`)
      .join(', ');

    // 폴더 수별
    const folderMap = {};
    resolved.forEach(b => {
      const fc = parseInt(b.folderCount) || 1;
      if (!folderMap[fc]) folderMap[fc] = { n:0, wins:0 };
      folderMap[fc].n++;
      if (b.result === 'WIN') folderMap[fc].wins++;
    });
    const folderSummary = Object.entries(folderMap)
      .map(([f,v]) => `${f}폴더 ${v.n}건 승률${(v.wins/v.n*100).toFixed(0)}%`).join(', ');

    const prompt = `너는 스포츠 베팅 분석가이자 절친한 친구야. 데이터를 보고 솔직하게, 때로는 강하게 말해줘. 듣기 좋은 말 하지 마.

=== 내 베팅 현황 ===
총 ${resolved.length}건 | 승률 ${SS.winRate ? (SS.winRate*100).toFixed(1) : '?'}% | ROI ${SS.roi ? (SS.roi>=0?'+':'')+SS.roi.toFixed(1)+'%' : '?'}
최근 10경기 ROI: ${SS.rec10roi !== undefined ? (SS.rec10roi>=0?'+':'')+SS.rec10roi.toFixed(1)+'%' : '?'}
스트릭: ${SS.streakType === 'WIN' ? SS.streak+'연승' : SS.streak+'연패'}
손익비: ${SS.plRatio ? SS.plRatio.toFixed(2) : '?'}:1
ECE 보정 오차: ${SS.ece !== null && SS.ece !== undefined ? SS.ece.toFixed(1)+'%' : '측정불가'}
예측력 등급: ${SS.grade ? SS.grade.letter+'등급 ('+SS.grade.totalScore+'점)' : '측정불가'}
낙관 편향: ${SS.avgBias !== undefined ? (SS.avgBias>=0?'+':'')+SS.avgBias.toFixed(1)+'%p' : '?'}

종목별 성과: ${sportSummary}
폴더별 성과: ${folderSummary}

오늘: ${todayCount}건 베팅${todayLoss > 0 ? ', 오늘 손실 '+Math.round(todayLoss).toLocaleString()+'원' : ''}

최근 10건:
${recentSummary}

=== 핵심 문제 (본인 고백) ===
1. 모르는 종목도 가고, 틀리면 분노로 더 크게 베팅하는 패턴이 있음
2. 4폴더 18건 전부 미적중
3. MLB 18건 전부 미적중, NBA ROI -44%

아래 두 파트로 나눠서 답해줘:

[분석]
데이터를 보고 지금 상태를 솔직하게 진단해줘. 잘하고 있는 것과 문제점을 구체적으로. 특히 오늘 베팅해도 되는지 판단해줘. 위험한 패턴 보이면 강하게 말해.

[지금 당장]
오늘 구체적으로 뭘 해야 하는지 1~3가지만. 짧고 명확하게.

마지막 줄에 반드시: VERDICT: GO / CAUTION / STOP 중 하나만 써줘.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    // 파싱
    const analysisMatch = text.match(/\[분석\]([\s\S]*?)(\[지금 당장\]|VERDICT:)/);
    const actionMatch   = text.match(/\[지금 당장\]([\s\S]*?)(VERDICT:|$)/);
    const verdictMatch  = text.match(/VERDICT:\s*(GO|CAUTION|STOP)/i);

    const analysis = analysisMatch ? analysisMatch[1].trim() : text;
    const action   = actionMatch   ? actionMatch[1].trim()   : '';
    const verdict  = verdictMatch  ? verdictMatch[1].toUpperCase() : 'CAUTION';

    // 판정 배너
    const bannerEl = document.getElementById('ai-verdict-banner');
    const vConfig = {
      GO:      { bg:'rgba(0,230,118,0.1)',  border:'var(--green)', icon:'✅', label:'베팅 가능',   color:'var(--green)' },
      CAUTION: { bg:'rgba(255,152,0,0.1)',  border:'#ff9800',      icon:'⚠️', label:'주의 필요',   color:'#ff9800' },
      STOP:    { bg:'rgba(255,59,92,0.12)', border:'var(--red)',   icon:'🛑', label:'오늘은 하지 마', color:'var(--red)' },
    };
    const vc = vConfig[verdict] || vConfig.CAUTION;
    bannerEl.style.cssText = `margin-bottom:16px;padding:16px 20px;border-radius:10px;background:${vc.bg};border:2px solid ${vc.border};display:flex;align-items:center;gap:16px;`;
    bannerEl.innerHTML = `
      <div style="font-size:40px;flex-shrink:0;">${vc.icon}</div>
      <div>
        <div style="font-size:20px;font-weight:900;color:${vc.color};">${vc.label}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:3px;">AI 판정 — ${new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})} 기준</div>
      </div>`;

    document.getElementById('ai-advice-text').textContent = analysis;
    document.getElementById('ai-action-text').innerHTML = action
      ? action.split('\n').filter(l=>l.trim()).map(l => `<div style="padding:6px 0;border-bottom:1px solid var(--border);">${l}</div>`).join('')
      : '—';
    document.getElementById('ai-advice-time').textContent = `${new Date().toLocaleString('ko-KR')} 분석`;

    loading.style.display = 'none';
    result.style.display = 'block';

  } catch(e) {
    loading.style.display = 'none';
    errorEl.style.display = 'block';
    errorEl.textContent = '분석 실패: ' + e.message;
  } finally {
    clearInterval(msgTimer);
    btn.disabled = false;
    btn.textContent = '⚡ 다시 분석받기';
  }
}

// ========== 베팅일지 ==========
const DIARY_TEMPLATES = {
  '반성': `오늘 결과: \n\n잘못된 점:\n- \n\n다음엔 이렇게:\n- `,
  '다짐': `오늘의 다짐:\n1. \n2. \n3. \n\n지키지 못한 원칙:\n- \n\n이유:`,
  '분석': `오늘 베팅 분석:\n\n선택 근거:\n- \n\n결과 분석:\n- \n\n개선점:\n- `,
};


// ========== JOURNAL 확장 ==========

// 원칙 관리
function getPrinciples() {
  return JSON.parse(localStorage.getItem('edge_principles') || '[]');
}
function savePrinciples(arr) {
  localStorage.setItem('edge_principles', JSON.stringify(arr));
}
function addPrinciple() {
  const input = document.getElementById('principle-input');
  const val = input.value.trim();
  if (!val) return;
  const arr = getPrinciples();
  if (arr.length >= 10) { alert('원칙은 최대 10개까지 입력 가능합니다.'); return; }
  if (arr.includes(val)) { alert('이미 있는 원칙입니다.'); return; }
  arr.push(val);
  savePrinciples(arr);
  input.value = '';
  renderPrincipleList();
  renderPrincipleChecklist();
  renderRoundReviewList();
}
function deletePrinciple(idx) {
  const arr = getPrinciples();
  arr.splice(idx, 1);
  savePrinciples(arr);
  renderPrincipleList();
  renderPrincipleChecklist();
  renderRoundReviewList();
}
function renderPrincipleList() {
  const arr = getPrinciples();
  const el = document.getElementById('principle-list');
  const empty = document.getElementById('principle-empty');
  if (!el) return;
  if (arr.length === 0) {
    el.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';
  el.innerHTML = arr.map((p, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg3);border-radius:6px;border:1px solid var(--border);">
      <span style="font-size:11px;color:var(--accent);font-weight:700;min-width:18px;">${i+1}</span>
      <span style="flex:1;font-size:12px;color:var(--text2);">${p}</span>
      <button onclick="deletePrinciple(${i})" style="padding:2px 8px;background:none;border:1px solid rgba(255,59,92,0.3);border-radius:4px;color:var(--red);font-size:10px;cursor:pointer;">삭제</button>
    </div>
  `).join('');
}
function renderPrincipleChecklist() {
  const arr = getPrinciples();
  const wrap = document.getElementById('principle-checklist-wrap');
  const list = document.getElementById('principle-checklist');
  if (!wrap || !list) return;
  if (arr.length === 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  list.innerHTML = arr.map((p, i) => `
    <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--bg3);border-radius:5px;cursor:pointer;">
      <input type="checkbox" data-principle="${p}" checked style="accent-color:var(--accent);width:14px;height:14px;" onchange="updateViolationHint()">
      <span style="font-size:11px;color:var(--text2);">${p}</span>
    </label>
  `).join('');
}
function updateViolationHint() {
  const unchecked = document.querySelectorAll('#principle-checklist input[type=checkbox]:not(:checked)');
  const hint = document.getElementById('principle-violation-hint');
  if (!hint) return;
  hint.textContent = unchecked.length > 0 ? `⚠️ ${unchecked.length}개 위반` : '';
}

// 감정 태그 선택
function selectEmotion(el) {
  document.querySelectorAll('.emotion-tag').forEach(t => {
    t.classList.remove('active-emotion');
    t.style.border = '1px solid var(--border)';
    t.style.color = 'var(--text3)';
    t.style.background = 'var(--bg3)';
  });
  el.classList.add('active-emotion');
  el.style.border = '1px solid rgba(0,229,255,0.4)';
  el.style.color = 'var(--accent)';
  el.style.background = 'rgba(0,229,255,0.08)';
}

// 일지 탭 내부 탭 전환
let _journalTab = 'plan';
function toggleFeatureVisibility() {
  const showJournal = document.getElementById('toggle-journal')?.checked || false;
  const showEVCalc  = document.getElementById('toggle-ev')?.checked || false;
  const s = JSON.parse(localStorage.getItem('edge_settings') || '{}');
  s.showJournal = showJournal;
  s.showEVCalc  = showEVCalc;
  localStorage.setItem('edge_settings', JSON.stringify(s));

  // PC nav 베팅일지/EV 드롭다운 복원 or 숨기기
  const bettingWrap = document.getElementById('betting-dropdown-back');
  if (bettingWrap) bettingWrap.style.display = (showJournal || showEVCalc) ? 'inline-block' : 'none';

  // PC nav에 베팅일지/EV 탭 동적 갱신
  updatePCNavFeatures(showJournal, showEVCalc);

  // 모바일 서브탭 갱신
  if (window.innerWidth <= 600 && _mobileSection === 'betting') {
    renderMobileSubtabs('betting');
  }
}

function updatePCNavFeatures(showJournal, showEVCalc) {
  const journalTab = document.getElementById('nav-journal-tab');
  const evTab = document.getElementById('nav-ev-tab');
  if (journalTab) journalTab.style.display = showJournal ? '' : 'none';
  if (evTab) evTab.style.display = showEVCalc ? '' : 'none';
}

function toggleJournalAnalysis(btn) {
  const menu = document.getElementById('jt-analysis-menu');
  if (!menu) return;
  const isOpen = menu.style.display !== 'none';
  menu.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    setTimeout(() => {
      document.addEventListener('click', function closeMenu(e) {
        if (!btn.parentElement.contains(e.target)) {
          menu.style.display = 'none';
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 10);
  }
}

function closeJournalAnalysis() {
  const menu = document.getElementById('jt-analysis-menu');
  if (menu) menu.style.display = 'none';
}

function switchJournalTab(tab) {
  _journalTab = tab;
  ['plan','decision','diary','emotion','rule','review'].forEach(t => {
    const panel = document.getElementById('jp-' + t);
    const btn = document.getElementById('jt-' + t);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
    if (btn) {
      const isDecision = t === 'decision';
      const activeColor = isDecision ? '#00ff88' : 'var(--accent)';
      btn.style.borderBottom = t === tab ? `2px solid ${activeColor}` : '2px solid transparent';
      btn.style.color = t === tab ? activeColor : (isDecision ? '#00ff8880' : 'var(--text3)');
    }
  });
  // 분석 드롭다운 트리거 버튼 활성화
  const trigger = document.getElementById('jt-analysis-trigger');
  if (trigger) {
    const isAnalysis = tab === 'emotion' || tab === 'rule';
    trigger.style.borderBottom = isAnalysis ? '2px solid var(--accent)' : '2px solid transparent';
    trigger.style.color = isAnalysis ? 'var(--accent)' : 'var(--text3)';
  }
  if (tab === 'decision') {
    // page-decision 내용을 jp-decision으로 복사해서 보여주기
    const src = document.getElementById('page-decision');
    const dest = document.getElementById('jp-decision');
    if (src && dest && dest.children.length === 0) {
      dest.innerHTML = src.innerHTML;
    }
    initDecisionTab();
  }
  if (tab === 'emotion') renderEmotionStats();
  if (tab === 'rule')    renderRuleStats();
  if (tab === 'review')  generateWeeklyReview();
}

// 감정 통계
function renderEmotionStats() {
  const resolved = bets.filter(b => b.result !== 'PENDING');
  const emotions = ['냉정','보통','확신','불안','흥분'];
  const stats = {};
  emotions.forEach(e => {
    const eb = resolved.filter(b => (b.emotion || '보통') === e);
    const wins = eb.filter(b => b.result === 'WIN').length;
    const profit = eb.reduce((s,b) => s + (b.profit||0), 0);
    const invested = eb.reduce((s,b) => s + (b.amount||0), 0);
    stats[e] = { count: eb.length, wins, wr: eb.length > 0 ? wins/eb.length*100 : 0,
                 profit, roi: invested > 0 ? profit/invested*100 : 0 };
  });

  const el = document.getElementById('emotion-stats-table');
  if (!el) return;
  const rows = emotions.map(e => {
    const s = stats[e];
    const roiColor = s.roi >= 0 ? 'var(--green)' : 'var(--red)';
    const label = {냉정:'🧊',보통:'😐',확신:'🔥',불안:'😰',흥분:'⚡'}[e];
    return `<tr>
      <td style="padding:8px 12px;font-size:12px;font-weight:700;">${label} ${e}</td>
      <td style="padding:8px 12px;font-size:12px;text-align:center;color:var(--text2);">${s.count}회</td>
      <td style="padding:8px 12px;font-size:12px;text-align:center;color:var(--text2);">${s.count>0?s.wr.toFixed(1)+'%':'—'}</td>
      <td style="padding:8px 12px;font-size:12px;text-align:center;color:${roiColor};">${s.count>0?(s.roi>=0?'+':'')+s.roi.toFixed(1)+'%':'—'}</td>
      <td style="padding:8px 12px;font-size:12px;text-align:center;color:${s.profit>=0?'var(--green)':'var(--red)'};">${s.count>0?(s.profit>=0?'+':'')+'₩'+Math.round(s.profit).toLocaleString():'—'}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `<table style="width:100%;border-collapse:collapse;">
    <thead><tr style="border-bottom:1px solid var(--border);">
      <th style="padding:8px 12px;font-size:11px;color:var(--text3);text-align:left;">감정</th>
      <th style="padding:8px 12px;font-size:11px;color:var(--text3);text-align:center;">베팅수</th>
      <th style="padding:8px 12px;font-size:11px;color:var(--text3);text-align:center;">적중률</th>
      <th style="padding:8px 12px;font-size:11px;color:var(--text3);text-align:center;">ROI</th>
      <th style="padding:8px 12px;font-size:11px;color:var(--text3);text-align:center;">손익</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  const withData = emotions.filter(e => stats[e].count >= 3);
  if (withData.length > 0) {
    const best = withData.reduce((a,b) => stats[a].roi > stats[b].roi ? a : b);
    const worst = withData.reduce((a,b) => stats[a].roi < stats[b].roi ? a : b);
    const bestEl = document.getElementById('emotion-best');
    const worstEl = document.getElementById('emotion-worst');
    if (bestEl) bestEl.innerHTML = `<span style="font-size:20px;">${{냉정:'🧊',보통:'😐',확신:'🔥',불안:'😰',흥분:'⚡'}[best]}</span> <strong style="color:var(--green);">${best}</strong> 상태일 때 ROI <strong style="color:var(--green);">${stats[best].roi>=0?'+':''}${stats[best].roi.toFixed(1)}%</strong>`;
    if (worstEl) worstEl.innerHTML = `<span style="font-size:20px;">${{냉정:'🧊',보통:'😐',확신:'🔥',불안:'😰',흥분:'⚡'}[worst]}</span> <strong style="color:var(--red);">${worst}</strong> 상태일 때 ROI <strong style="color:var(--red);">${stats[worst].roi>=0?'+':''}${stats[worst].roi.toFixed(1)}%</strong> — 주의`;
  }
}

// 원칙 준수 통계
function renderRuleStats() {
  const principles = getPrinciples();
  const tableEl = document.getElementById('rule-stats-table');
  const emptyEl = document.getElementById('rule-empty-hint');
  const topEl = document.getElementById('rule-violation-top');
  if (!tableEl) return;

  if (principles.length === 0) {
    tableEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    if (topEl) topEl.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:10px 0;">설정 탭에서 원칙을 추가해주세요.</div>';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  const resolved = bets.filter(b => b.result !== 'PENDING' && b.violations);
  const totalBets = resolved.length;

  const violStats = principles.map(p => {
    const violated = resolved.filter(b => b.violations && b.violations.includes(p));
    const rate = totalBets > 0 ? violated.length / totalBets * 100 : 0;
    return { p, count: violated.length, rate };
  }).sort((a,b) => b.count - a.count);

  const rows = violStats.map(s => {
    const color = s.rate >= 30 ? 'var(--red)' : s.rate >= 10 ? 'var(--gold)' : 'var(--green)';
    const bar = Math.round(s.rate);
    return `<tr>
      <td style="padding:8px 12px;font-size:12px;color:var(--text2);max-width:200px;">${s.p}</td>
      <td style="padding:8px 12px;font-size:12px;text-align:center;color:${color};font-weight:700;">${s.count}회</td>
      <td style="padding:8px 12px;font-size:12px;text-align:center;color:${color};">${s.rate.toFixed(1)}%</td>
      <td style="padding:8px 12px;min-width:120px;">
        <div style="height:6px;background:var(--bg3);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${bar}%;background:${color};border-radius:3px;transition:width 0.3s;"></div>
        </div>
      </td>
    </tr>`;
  }).join('');

  tableEl.innerHTML = `<table style="width:100%;border-collapse:collapse;">
    <thead><tr style="border-bottom:1px solid var(--border);">
      <th style="padding:8px 12px;font-size:11px;color:var(--text3);text-align:left;">원칙</th>
      <th style="padding:8px 12px;font-size:11px;color:var(--text3);text-align:center;">위반 횟수</th>
      <th style="padding:8px 12px;font-size:11px;color:var(--text3);text-align:center;">위반율</th>
      <th style="padding:8px 12px;font-size:11px;color:var(--text3);">위반율 바</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  if (topEl) {
    const top3 = violStats.filter(s => s.count > 0).slice(0, 3);
    if (top3.length === 0) {
      topEl.innerHTML = '<div style="font-size:12px;color:var(--green);padding:10px 0;">✅ 모든 원칙을 지키고 있습니다!</div>';
    } else {
      topEl.innerHTML = top3.map((s,i) => `
        <div style="padding:10px 12px;background:var(--bg3);border-radius:6px;border-left:3px solid ${i===0?'var(--red)':i===1?'var(--gold)':'var(--text3)'};">
          <div style="font-size:11px;color:var(--text3);margin-bottom:3px;">${i+1}위 위반 원칙</div>
          <div style="font-size:12px;color:var(--text2);font-weight:600;">${s.p}</div>
          <div style="font-size:11px;color:var(--red);margin-top:2px;">${s.count}회 위반 (${s.rate.toFixed(1)}%)</div>
        </div>
      `).join('');
    }
  }
}

// 주간 리뷰
let _reviewWeekOffset = 0;
function changeReviewWeek(dir) {
  _reviewWeekOffset += dir;
  if (_reviewWeekOffset > 0) _reviewWeekOffset = 0;
  generateWeeklyReview();
}
function generateWeeklyReview() {
  const now = new Date();
  const dow = now.getDay() || 7;
  const mon = new Date(now); mon.setDate(now.getDate() - dow + 1 + _reviewWeekOffset * 7);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  mon.setHours(0,0,0,0); sun.setHours(23,59,59,999);

  const label = _reviewWeekOffset === 0 ? '이번 주' : _reviewWeekOffset === -1 ? '지난 주' :
    `${mon.getMonth()+1}/${mon.getDate()} ~ ${sun.getMonth()+1}/${sun.getDate()}`;
  const labelEl = document.getElementById('review-week-label');
  if (labelEl) labelEl.textContent = label;

  const weekBets = bets.filter(b => {
    if (!b.date) return false;
    const d = new Date(b.date); d.setHours(12,0,0,0);
    return d >= mon && d <= sun;
  });
  const resolved = weekBets.filter(b => b.result !== 'PENDING');
  const wins = resolved.filter(b => b.result === 'WIN');
  const profit = resolved.reduce((s,b) => s+(b.profit||0), 0);
  const invested = resolved.reduce((s,b) => s+(b.amount||0), 0);
  const roi = invested > 0 ? profit/invested*100 : 0;
  const wr = resolved.length > 0 ? wins.length/resolved.length*100 : 0;

  const statsEl = document.getElementById('review-stats');
  if (statsEl) statsEl.innerHTML = resolved.length === 0
    ? '<span style="color:var(--text3);">이 주에 완료된 베팅이 없습니다.</span>'
    : `총 베팅: <strong>${resolved.length}회</strong><br>
       적중률: <strong style="color:${wr>=50?'var(--green)':'var(--red)'};">${wr.toFixed(1)}%</strong><br>
       손익: <strong style="color:${profit>=0?'var(--green)':'var(--red)'};">${profit>=0?'+':''}₩${Math.round(profit).toLocaleString()}</strong><br>
       ROI: <strong style="color:${roi>=0?'var(--green)':'var(--red)'};">${roi>=0?'+':''}${roi.toFixed(1)}%</strong><br>
       총 투자: <strong>₩${Math.round(invested).toLocaleString()}</strong>`;

  // 감정 패턴
  const emotionEl = document.getElementById('review-emotion');
  if (emotionEl) {
    const eCounts = {};
    resolved.forEach(b => { const e = b.emotion||'보통'; eCounts[e] = (eCounts[e]||0)+1; });
    const sorted = Object.entries(eCounts).sort((a,b)=>b[1]-a[1]);
    emotionEl.innerHTML = sorted.length === 0
      ? '<span style="color:var(--text3);">감정 데이터 없음</span>'
      : sorted.map(([e,c]) => `${{냉정:'🧊',보통:'😐',확신:'🔥',불안:'😰',흥분:'⚡'}[e]||'😐'} ${e}: <strong>${c}회</strong>`).join('<br>');
  }

  // 잘한 점
  const goodEl = document.getElementById('review-good');
  if (goodEl) {
    const goods = [];
    if (roi > 5) goods.push(`💰 ROI <strong style="color:var(--green);">+${roi.toFixed(1)}%</strong> 달성`);
    if (wr >= 60) goods.push(`🎯 적중률 <strong style="color:var(--green);">${wr.toFixed(1)}%</strong> 우수`);
    const violations = resolved.filter(b => b.violations && b.violations.length > 0);
    if (violations.length === 0 && resolved.length > 0) goods.push(`📋 원칙 위반 <strong style="color:var(--green);">0회</strong>`);
    const calmBets = resolved.filter(b => b.emotion === '냉정');
    if (calmBets.length > 0) { const calmWr = calmBets.filter(b=>b.result==='WIN').length/calmBets.length*100; if(calmWr>=60) goods.push(`🧊 냉정 베팅 적중률 <strong style="color:var(--green);">${calmWr.toFixed(0)}%</strong>`); }
    if (resolved.length >= 5) goods.push(`📊 <strong>${resolved.length}회</strong> 베팅 데이터 축적`);
    goodEl.innerHTML = goods.length > 0 ? goods.join('<br>') : '<span style="color:var(--text3);">—</span>';
  }

  // 개선할 점
  const badEl = document.getElementById('review-bad');
  if (badEl) {
    const bads = [];
    if (roi < -5) bads.push(`📉 ROI <strong style="color:var(--red);">${roi.toFixed(1)}%</strong> — 베팅 크기 재검토`);
    if (wr < 45 && resolved.length >= 3) bads.push(`🎯 적중률 <strong style="color:var(--red);">${wr.toFixed(1)}%</strong> — 경기 선택 기준 강화 필요`);
    const violations = resolved.filter(b => b.violations && b.violations.length > 0);
    if (violations.length > 0) bads.push(`📋 원칙 위반 <strong style="color:var(--red);">${violations.length}회</strong> — 규율 점검`);
    const excitedBets = resolved.filter(b => b.emotion === '흥분');
    if (excitedBets.length > 0) { const exWr = excitedBets.filter(b=>b.result==='WIN').length/excitedBets.length*100; if(exWr<50) bads.push(`⚡ 흥분 상태 베팅 적중률 <strong style="color:var(--red);">${exWr.toFixed(0)}%</strong> — 감정 베팅 주의`); }
    if (weekBets.length > resolved.length) bads.push(`⏳ 미결 베팅 <strong style="color:var(--gold);">${weekBets.length-resolved.length}회</strong> 남음`);
    badEl.innerHTML = bads.length > 0 ? bads.join('<br>') : '<span style="color:var(--green);">특별한 개선점 없음 👍</span>';
  }
}



// ========== 베팅 예정 확장 ==========

let _planMode = 'single';

function setPlanMode(mode) {
  _planMode = mode;
  document.getElementById('plan-betmode').value = mode;
  const isSingle = mode === 'single';
  const btnS = document.getElementById('plan-mode-single');
  const btnM = document.getElementById('plan-mode-multi');
  const sWrap = document.getElementById('plan-single-wrap');
  const mWrap = document.getElementById('plan-multi-wrap');
  if (btnS) { btnS.style.borderColor = isSingle ? 'var(--accent)' : 'var(--border)'; btnS.style.background = isSingle ? 'rgba(0,229,255,0.12)' : 'var(--bg3)'; btnS.style.color = isSingle ? 'var(--accent)' : 'var(--text2)'; }
  if (btnM) { btnM.style.borderColor = !isSingle ? 'var(--accent)' : 'var(--border)'; btnM.style.background = !isSingle ? 'rgba(0,229,255,0.12)' : 'var(--bg3)'; btnM.style.color = !isSingle ? 'var(--accent)' : 'var(--text2)'; }
  if (sWrap) sWrap.style.display = isSingle ? 'block' : 'none';
  if (mWrap) mWrap.style.display = !isSingle ? 'block' : 'none';
  if (!isSingle) renderPlanFolderRows();
}

function renderPlanFolderRows() {
  const count = parseInt(document.getElementById('plan-folder-count')?.value || 2);
  const wrap = document.getElementById('plan-folder-rows');
  if (!wrap) return;
  wrap.innerHTML = Array.from({length: count}, (_, i) => `
    <div style="display:grid;grid-template-columns:1fr 70px 70px 70px;gap:5px;align-items:center;">
      <input type="text" placeholder="F${i+1} 경기명" class="plan-folder-game"
        style="padding:6px 8px;font-size:11px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;color:var(--text2);">
      <input type="number" placeholder="배당" step="0.01" min="1" class="plan-folder-odds"
        style="padding:6px 8px;font-size:11px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;color:var(--text2);">
      <input type="text" placeholder="종목" class="plan-folder-sport"
        style="padding:6px 8px;font-size:11px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;color:var(--text2);">
      <select class="plan-folder-type" style="padding:6px 4px;font-size:11px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;color:var(--text2);">
        <optgroup label="일반">
          <option value="승/패">승/패</option>
          <option value="핸디캡">핸디캡</option>
          <option value="언/옵">언/옵</option>
        </optgroup>
        <optgroup label="전반">
          <option value="전반 승/패">전반 승/패</option>
          <option value="전반 핸디캡">전반 핸디캡</option>
          <option value="전반 언/옵">전반 언/옵</option>
        </optgroup>
      </select>
    </div>
  `).join('');
}

// savePlan 덮어쓰기
function savePlan() {
  const date       = document.getElementById('plan-date')?.value;
  const confidence = document.getElementById('plan-confidence')?.value || 'mid';
  const reason     = document.getElementById('plan-reason')?.value?.trim();
  const mode       = document.getElementById('plan-betmode')?.value || 'single';

  if (!date) { alert('날짜는 필수입니다.'); return; }

  let planData = { id: Date.now(), date, confidence, reason: reason||'', mode, done: false, linkedBetId: null, matchResult: null };

  if (mode === 'single') {
    const game   = document.getElementById('plan-game')?.value?.trim();
    const sport  = document.getElementById('plan-sport')?.value?.trim();
    const odds   = parseFloat(document.getElementById('plan-odds')?.value) || 0;
    const amount = parseFloat(document.getElementById('plan-amount')?.value) || 0;
    if (!game) { alert('경기명은 필수입니다.'); return; }
    Object.assign(planData, { game, sport, odds, amount });
  } else {
    const amount = parseFloat(document.getElementById('plan-multi-amount')?.value) || 0;
    const folderGames  = [...document.querySelectorAll('.plan-folder-game')].map(el => el.value.trim());
    const folderOdds   = [...document.querySelectorAll('.plan-folder-odds')].map(el => parseFloat(el.value)||0);
    const folderSports = [...document.querySelectorAll('.plan-folder-sport')].map(el => el.value.trim());
    const folderTypes  = [...document.querySelectorAll('.plan-folder-type')].map(el => el.value || '승/패');
    if (folderGames.every(g => !g)) { alert('최소 1개 폴더의 경기명을 입력하세요.'); return; }
    const totalOdds = folderOdds.reduce((a,b) => b > 0 ? a*b : a, 1);
    Object.assign(planData, { game: folderGames.filter(g=>g).join(' + '), amount, totalOdds: parseFloat(totalOdds.toFixed(2)), folderGames, folderOdds, folderSports, folderTypes });
  }

  const plans = JSON.parse(localStorage.getItem('edge_plans') || '[]');
  plans.push(planData);
  plans.sort((a,b) => a.date.localeCompare(b.date));
  localStorage.setItem('edge_plans', JSON.stringify(plans));

  // 초기화
  ['plan-game','plan-sport','plan-odds','plan-amount','plan-reason','plan-multi-amount'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  setPlanMode('single');
  renderPlanList();
  renderPlanVsReal();
}

// 예정 vs 실제 비교 통계
function renderPlanVsReal() {
  const el = document.getElementById('plan-vs-real-stats');
  if (!el) return;
  const plans = JSON.parse(localStorage.getItem('edge_plans') || '[]');
  const linked = plans.filter(p => p.linkedBetId);
  const total = plans.length;
  const done = plans.filter(p => p.done).length;
  const cancelled = plans.filter(p => !p.done && !p.linkedBetId && p.date < getKSTDateStr()).length;

  if (total === 0) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text3);text-align:center;padding:16px;">예정 데이터 없음</div>';
    return;
  }

  const wins = linked.filter(p => p.matchResult?.result === 'WIN').length;
  const loses = linked.filter(p => p.matchResult?.result === 'LOSE').length;
  const wr = linked.length > 0 ? wins/linked.length*100 : 0;

  // 배당 차이 분석
  const oddsDiffs = linked.filter(p => p.matchResult?.oddsDiff != null)
    .map(p => parseFloat(p.matchResult.oddsDiff));
  const avgOddsDiff = oddsDiffs.length > 0 ? oddsDiffs.reduce((a,b)=>a+b,0)/oddsDiffs.length : 0;

  // 계획 vs 실행 일치율
  const followed = linked.filter(p => p.matchResult?.followed?.includes('계획대로')).length;
  const followRate = linked.length > 0 ? followed/linked.length*100 : 0;

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
      <div style="padding:10px;background:var(--bg3);border-radius:6px;text-align:center;">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px;">총 예정</div>
        <div style="font-size:18px;font-weight:700;color:var(--text);">${total}건</div>
      </div>
      <div style="padding:10px;background:var(--bg3);border-radius:6px;text-align:center;">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px;">실제 연결됨</div>
        <div style="font-size:18px;font-weight:700;color:var(--accent);">${linked.length}건</div>
      </div>
      <div style="padding:10px;background:var(--bg3);border-radius:6px;text-align:center;">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px;">연결 베팅 적중률</div>
        <div style="font-size:18px;font-weight:700;color:${wr>=50?'var(--green)':'var(--red)'};">${linked.length>0?wr.toFixed(1)+'%':'—'}</div>
      </div>
      <div style="padding:10px;background:var(--bg3);border-radius:6px;text-align:center;">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px;">계획대로 실행</div>
        <div style="font-size:18px;font-weight:700;color:var(--gold);">${linked.length>0?followRate.toFixed(0)+'%':'—'}</div>
      </div>
    </div>
    <div style="font-size:11px;color:var(--text3);padding:8px 10px;background:var(--bg3);border-radius:6px;line-height:1.8;">
      취소/미실행: <strong style="color:var(--text2);">${cancelled}건</strong> &nbsp;|&nbsp;
      평균 배당 차이: <strong style="color:${avgOddsDiff>=0?'var(--green)':'var(--red)'};">${oddsDiffs.length>0?(avgOddsDiff>=0?'+':'')+avgOddsDiff.toFixed(2):'—'}</strong>
      ${cancelled>0?`<br>⚠️ 예정만 하고 베팅 안 한 경기 <strong>${cancelled}건</strong> — 놓친 경기 복기 권장`:''}
    </div>
  `;
}

// 예정 불러오기 모달
function showLoadPlanModal() {
  const plans = JSON.parse(localStorage.getItem('edge_plans') || '[]');
  const pending = plans.filter(p => !p.done);
  const modal = document.getElementById('load-plan-modal');
  const listEl = document.getElementById('load-plan-list');
  const emptyEl = document.getElementById('load-plan-empty');
  if (!modal) return;

  if (pending.length === 0) {
    if (listEl) listEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
  } else {
    if (emptyEl) emptyEl.style.display = 'none';
    const confIcon = { high:'🔥', mid:'🟡', low:'🔵' };
    listEl.innerHTML = pending.map(p => `
      <div style="padding:10px 12px;background:var(--bg3);border-radius:8px;border:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div style="flex:1;">
            <div style="font-size:11px;color:var(--text3);margin-bottom:3px;">${p.date} · ${confIcon[p.confidence]||'🟡'} · ${p.mode==='multi'?'🗂 다폴':'📌 단폴'}</div>
            <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:${p.reason?'4px':'0'}">${p.game}</div>
            ${p.mode==='multi'&&p.folderGames?`<div style="font-size:10px;color:var(--text3);">${p.folderGames.filter(g=>g).map((g,i)=>`F${i+1}: ${g} (×${p.folderOdds[i]||'?'})`).join(' | ')}</div>`:''}
            ${p.odds?`<div style="font-size:11px;color:var(--gold);">예상배당 ×${p.mode==='multi'?p.totalOdds:p.odds}</div>`:''}
            ${p.reason?`<div style="font-size:11px;color:var(--text3);margin-top:3px;line-height:1.5;">${p.reason}</div>`:''}
          </div>
          <button onclick="loadPlanToForm(${p.id})"
            style="padding:6px 12px;background:rgba(0,229,255,0.12);border:1px solid rgba(0,229,255,0.3);border-radius:6px;color:var(--accent);font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">불러오기</button>
        </div>
      </div>
    `).join('');
  }

  modal.style.display = 'flex';
}

function closeLoadPlanModal() {
  const modal = document.getElementById('load-plan-modal');
  if (modal) modal.style.display = 'none';
}

function loadPlanToForm(planId) {
  const plans = JSON.parse(localStorage.getItem('edge_plans') || '[]');
  const plan = plans.find(p => p.id === planId);
  if (!plan) return;

  closeLoadPlanModal();

  // 날짜 채우기
  const dateEl = document.getElementById('r-date');
  if (dateEl && plan.date) dateEl.value = plan.date;

  if (plan.mode === 'single') {
    setBetMode('single');
    const gameEl = document.getElementById('r-game'); if (gameEl && plan.game) gameEl.value = plan.game;
    // 종목 선택
    if (plan.sport) {
      document.querySelectorAll('.sport-btn').forEach(btn => {
        if (btn.dataset.val === plan.sport) btn.click();
      });
    }
    // 배당
    const oddsEl = document.querySelector('#single-rows .folder-odds');
    if (oddsEl && plan.odds) oddsEl.value = plan.odds;
    // 금액
    const amtEl = document.getElementById('r-amount') || document.querySelector('.r-amount');
    if (amtEl && plan.amount) amtEl.value = plan.amount;
  } else {
    // 다폴더
    setBetMode('multi');
    const fcEl = document.getElementById('r-folder-count');
    if (fcEl && plan.folderGames) {
      const fc = Math.min(plan.folderGames.length, 6);
      fcEl.value = fc >= 5 ? '4+' : fc;
      if (typeof renderFolderRows === 'function') renderFolderRows();
      // 4+ 모드면 addFolderRow로 추가
      if (fc > 4) {
        setTimeout(() => {
          const container = document.getElementById('folder-rows');
          if (container) {
            for (let x = container.querySelectorAll('.folder-row').length; x < fc; x++) {
              if (typeof addFolderRow === 'function') addFolderRow();
            }
          }
        }, 50);
      }
    }
    // 각 폴더 채우기
    setTimeout(() => {
      const rows = document.querySelectorAll('#folder-rows .folder-row');
      rows.forEach((row, i) => {
        const gameEl = row.querySelector('.folder-game-name, input[placeholder*="경기"]');
        const oddsEl = row.querySelector('.folder-odds');
        const sportEl = row.querySelector('.folder-sport');
        if (gameEl && plan.folderGames?.[i]) gameEl.value = plan.folderGames[i];
        if (oddsEl && plan.folderOdds?.[i]) oddsEl.value = plan.folderOdds[i];
        if (sportEl && plan.folderSports?.[i]) sportEl.value = plan.folderSports[i];
        const typeEl = row.querySelector('.folder-type');
        if (typeEl && plan.folderTypes?.[i]) typeEl.value = plan.folderTypes[i];
      });
    }, 100);
  }

  // 베팅 기록 탭으로 이동
  const recordTab = document.querySelector('nav .tab[onclick*="record"]');
  if (recordTab) recordTab.click();

  // 예정과 연결 저장을 위해 hidden field에 planId 저장
  let hiddenPlanId = document.getElementById('r-linked-plan-id');
  if (!hiddenPlanId) {
    hiddenPlanId = document.createElement('input');
    hiddenPlanId.type = 'hidden';
    hiddenPlanId.id = 'r-linked-plan-id';
    document.body.appendChild(hiddenPlanId);
  }
  hiddenPlanId.value = planId;
}

function linkPlanToBet(planId) {
  const plans = JSON.parse(localStorage.getItem('edge_plans') || '[]');
  const plan = plans.find(p => p.id === planId);
  if (!plan) return;

  // 같은 날짜 베팅 목록 추출
  const candidates = bets.filter(b => b.date === plan.date && b.result !== 'PENDING');
  if (candidates.length === 0) {
    alert('같은 날짜의 완료된 베팅이 없습니다.');
    return;
  }

  // 선택 팝업
  const options = candidates.map((b,i) => `${i+1}. ${b.game||b.date} (배당:${b.betmanOdds||'?'} / ${b.result})`).join('\n');
  const choice = prompt(`연결할 베팅을 번호로 선택하세요:\n\n${options}\n\n0 = 연결 해제`);
  if (choice === null) return;
  const num = parseInt(choice);
  if (num === 0) {
    plan.linkedBetId = null;
    plan.matchResult = null;
  } else if (num >= 1 && num <= candidates.length) {
    const linked = candidates[num-1];
    plan.linkedBetId = linked.id;
    // 계획 대비 실제 비교
    const plannedOdds = parseFloat(plan.odds) || 0;
    const actualOdds = linked.betmanOdds || 0;
    const oddsDiff = actualOdds - plannedOdds;
    plan.matchResult = {
      result: linked.result,
      actualOdds,
      oddsDiff: oddsDiff.toFixed(2),
      followed: Math.abs(oddsDiff) <= 0.2 ? '✅ 계획대로' : oddsDiff > 0 ? '📈 배당 상승' : '📉 배당 하락'
    };
  } else {
    alert('잘못된 번호입니다.');
    return;
  }

  localStorage.setItem('edge_plans', JSON.stringify(plans));
  renderPlanList();
}


// ── 회차 자동 회고 ──
function getRoundReviews() {
  try { return JSON.parse(localStorage.getItem('edge_round_reviews') || '[]'); } catch { return []; }
}
function saveRoundReviews(arr) {
  localStorage.setItem('edge_round_reviews', JSON.stringify(arr));
}

function generateRoundReview(roundData) {
  const { round, startDate, endDate, seed, bets, wins, wr, profit, invested, roi } = roundData;

  // 이번 회차 베팅 목록 추출
  const s = new Date(startDate); s.setHours(0,0,0,0);
  const e = new Date(endDate);   e.setHours(23,59,59,999);
  const roundBets = window.bets ? window.bets.filter(b => {
    if (!b.date) return false;
    const d = new Date(b.date); d.setHours(12,0,0,0);
    return d >= s && d < new Date(endDate);
  }) : [];
  const resolved = roundBets.filter(b => b.result !== 'PENDING');

  // 감정별 성과
  const emotions = ['냉정','보통','확신','불안','흥분'];
  const emotionStats = {};
  emotions.forEach(em => {
    const eb = resolved.filter(b => (b.emotion||'보통') === em);
    if (eb.length === 0) return;
    const ew = eb.filter(b => b.result === 'WIN').length;
    emotionStats[em] = { count: eb.length, wr: ew/eb.length*100 };
  });
  const bestEmotion = Object.entries(emotionStats).sort((a,b) => b[1].wr - a[1].wr)[0];
  const worstEmotion = Object.entries(emotionStats).sort((a,b) => a[1].wr - b[1].wr)[0];

  // 원칙 위반
  const violations = resolved.filter(b => b.violations && b.violations.length > 0);
  const allViolations = resolved.flatMap(b => b.violations || []);
  const violCounts = {};
  allViolations.forEach(v => violCounts[v] = (violCounts[v]||0)+1);
  const topViolation = Object.entries(violCounts).sort((a,b)=>b[1]-a[1])[0];

  // 근거 있는 베팅 vs 없는 베팅
  const withMemo = resolved.filter(b => (b.memo||'').trim().length >= 5 || (b.folderMemos||[]).some(m=>m.length>=5));
  const withMemoWr = withMemo.length > 0 ? withMemo.filter(b=>b.result==='WIN').length/withMemo.length*100 : null;
  const noMemo = resolved.filter(b => !(b.memo||'').trim() && !(b.folderMemos||[]).some(m=>m.length>=5));
  const noMemoWr = noMemo.length > 0 ? noMemo.filter(b=>b.result==='WIN').length/noMemo.length*100 : null;

  // 회고 텍스트 생성
  const lines = [];
  lines.push(`📊 ${round}회차 결과: ${bets}경기 · 적중률 ${wr}% · ROI ${roi >= 0 ? '+' : ''}${roi}% · 손익 ${profit >= 0 ? '+' : ''}₩${Math.round(profit).toLocaleString()}`);
  lines.push('');

  // 잘한 점
  const goods = [];
  if (roi >= 5) goods.push(`✅ ROI +${roi}% 달성 — 수익 구조 유지`);
  if (wr >= 60) goods.push(`✅ 적중률 ${wr}% 우수`);
  if (violations.length === 0 && resolved.length > 0) goods.push(`✅ 원칙 위반 0회 — 완벽한 자기 규율`);
  if (bestEmotion && bestEmotion[1].count >= 2) goods.push(`✅ ${bestEmotion[0]} 상태 베팅 적중률 ${bestEmotion[1].wr.toFixed(0)}% 최고`);
  if (withMemoWr !== null && noMemoWr !== null && withMemoWr > noMemoWr) goods.push(`✅ 근거 작성 베팅 적중률 ${withMemoWr.toFixed(0)}% > 미작성 ${noMemoWr.toFixed(0)}%`);
  if (goods.length === 0) goods.push('—');

  // 개선할 점
  const bads = [];
  if (roi < -5) bads.push(`❌ ROI ${roi}% — 베팅 크기 또는 경기 선택 재검토 필요`);
  if (wr < 45 && resolved.length >= 3) bads.push(`❌ 적중률 ${wr}% — 경기 선택 기준 강화 필요`);
  if (violations.length > 0) bads.push(`❌ 원칙 위반 ${violations.length}회${topViolation ? ` — "${topViolation[0]}" 가장 많이 위반` : ''}`);
  if (worstEmotion && worstEmotion[1].count >= 2 && worstEmotion[1].wr < 40) bads.push(`❌ ${worstEmotion[0]} 상태 베팅 적중률 ${worstEmotion[1].wr.toFixed(0)}% 최저 — 이 감정에서 신중하게`);
  if (withMemoWr !== null && noMemoWr !== null && withMemoWr < noMemoWr) bads.push(`❌ 근거 없는 베팅 적중률이 더 높음 — 분석 방법 점검`);
  if (bads.length === 0) bads.push('—');

  lines.push('🌟 잘한 점');
  goods.forEach(g => lines.push(g));
  lines.push('');
  lines.push('💡 개선할 점');
  bads.forEach(b => lines.push(b));

  return {
    id: Date.now(),
    round,
    startDate,
    endDate,
    roi,
    wr,
    profit,
    bets,
    text: lines.join('\n'),
    createdAt: new Date().toISOString()
  };
}

function saveRoundReview(roundData) {
  const review = generateRoundReview(roundData);
  const reviews = getRoundReviews();
  // 같은 회차 있으면 덮어쓰기
  const existing = reviews.findIndex(r => r.round === review.round);
  if (existing !== -1) reviews[existing] = review;
  else reviews.unshift(review);
  saveRoundReviews(reviews);
  renderRoundReviewList();
}

function renderRoundReviewList() {
  const el = document.getElementById('round-review-list');
  if (!el) return;
  const reviews = getRoundReviews();
  if (reviews.length === 0) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text3);text-align:center;padding:16px;">회차를 마감하면 자동으로 회고가 생성됩니다.</div>';
    return;
  }
  el.innerHTML = reviews.map(r => {
    const roiColor = r.roi >= 0 ? 'var(--green)' : 'var(--red)';
    const lines = (r.text || '').split('\n');
    return `
      <div style="padding:12px;background:var(--bg3);border-radius:8px;border:1px solid var(--border);">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="font-size:12px;font-weight:700;color:var(--accent);">${r.round}회차</span>
          <span style="font-size:10px;color:var(--text3);">${r.startDate} ~ ${r.endDate}</span>
          <span style="margin-left:auto;font-size:12px;font-weight:700;color:${roiColor};">${r.roi >= 0 ? '+' : ''}${r.roi}%</span>
          <span style="font-size:11px;color:var(--text2);">${r.bets}경기 · ${r.wr}%</span>
        </div>
        <div style="font-size:11px;color:var(--text2);line-height:1.9;white-space:pre-line;">${r.text}</div>
        <div style="margin-top:8px;display:flex;gap:6px;">
          <button onclick="editRoundReview(${r.id})" style="padding:4px 10px;font-size:10px;background:rgba(0,229,255,0.08);border:1px solid rgba(0,229,255,0.2);border-radius:4px;color:var(--accent);cursor:pointer;">✏️ 수정</button>
          <button onclick="deleteRoundReview(${r.id})" style="padding:4px 10px;font-size:10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text3);cursor:pointer;">삭제</button>
        </div>
      </div>`;
  }).join('');
}

function editRoundReview(id) {
  const reviews = getRoundReviews();
  const r = reviews.find(x => x.id === id);
  if (!r) return;
  // 일지 탭 diary 섹션으로 이동해서 편집 가능하게
  switchJournalTab('diary');
  const dateEl = document.getElementById('diary-date');
  const textEl = document.getElementById('diary-text');
  if (dateEl) dateEl.value = r.endDate;
  if (textEl) textEl.value = r.text;
}

function deleteRoundReview(id) {
  if (!confirm('이 회차 회고를 삭제하시겠습니까?')) return;
  const reviews = getRoundReviews().filter(r => r.id !== id);
  saveRoundReviews(reviews);
  renderRoundReviewList();
}


function loadJournal() {
  // 날짜 초기화
  const today = getKSTDateStr();
  const dateEl = document.getElementById('diary-date');
  const planDateEl = document.getElementById('plan-date');
  if (dateEl && !dateEl.value) dateEl.value = today;
  if (planDateEl && !planDateEl.value) planDateEl.value = today;

  renderDiaryList();
  renderPlanList();

  // 오늘 일지 있으면 불러오기
  const diaries = JSON.parse(localStorage.getItem('edge_diaries') || '{}');
  const diaryEl = document.getElementById('diary-text');
  if (diaryEl && diaries[today]) diaryEl.value = diaries[today];
  renderRoundReviewList();
}

function saveDiary() {
  const date = document.getElementById('diary-date')?.value;
  const text = document.getElementById('diary-text')?.value?.trim();
  if (!date) return;
  const diaries = JSON.parse(localStorage.getItem('edge_diaries') || '{}');
  if (text) diaries[date] = text;
  else delete diaries[date];
  localStorage.setItem('edge_diaries', JSON.stringify(diaries));
  renderDiaryList();
  // 저장 피드백
  const btn = document.querySelector('[onclick="saveDiary()"]');
  if (btn) { const orig = btn.textContent; btn.textContent = '✅ 저장됨'; setTimeout(() => btn.textContent = orig, 1200); }
}

function deleteDiary() {
  const date = document.getElementById('diary-date')?.value;
  if (!date || !confirm(`${date} 일지를 삭제하시겠습니까?`)) return;
  const diaries = JSON.parse(localStorage.getItem('edge_diaries') || '{}');
  delete diaries[date];
  localStorage.setItem('edge_diaries', JSON.stringify(diaries));
  document.getElementById('diary-text').value = '';
  renderDiaryList();
}

function setDiaryTemplate(type) {
  const el = document.getElementById('diary-text');
  if (!el) return;
  if (el.value.trim() && !confirm('현재 내용을 템플릿으로 교체할까요?')) return;
  el.value = DIARY_TEMPLATES[type] || '';
  el.focus();
}

function renderDiaryList() {
  const listEl = document.getElementById('diary-list');
  if (!listEl) return;
  const diaries = JSON.parse(localStorage.getItem('edge_diaries') || '{}');
  const entries = Object.entries(diaries).sort((a,b) => b[0].localeCompare(a[0]));
  if (entries.length === 0) {
    listEl.innerHTML = '<div style="font-size:12px;color:var(--text3);text-align:center;padding:16px;">아직 작성된 일지가 없어요</div>';
    return;
  }
  listEl.innerHTML = entries.map(([date, text]) => {
    const preview = text.replace(/\n/g,' ').slice(0, 60) + (text.length > 60 ? '...' : '');
    return `<div onclick="loadDiaryEntry('${date}')"
      style="padding:10px 12px;background:var(--bg3);border-radius:6px;cursor:pointer;border:1px solid var(--border);transition:border-color 0.15s;"
      onmouseover="this.style.borderColor='rgba(0,229,255,0.3)'" onmouseout="this.style.borderColor='var(--border)'">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-size:12px;font-weight:700;color:var(--accent);">${date}</span>
        <span style="font-size:10px;color:var(--text3);">${text.length}자</span>
      </div>
      <div style="font-size:11px;color:var(--text3);line-height:1.5;">${preview}</div>
    </div>`;
  }).join('');
}

function loadDiaryEntry(date) {
  const diaries = JSON.parse(localStorage.getItem('edge_diaries') || '{}');
  const dateEl = document.getElementById('diary-date');
  const textEl = document.getElementById('diary-text');
  if (dateEl) dateEl.value = date;
  if (textEl) textEl.value = diaries[date] || '';
}

// ── 베팅 예정 ──
function savePlan() {
  const date       = document.getElementById('plan-date')?.value;
  const game       = document.getElementById('plan-game')?.value?.trim();
  const sport      = document.getElementById('plan-sport')?.value?.trim();
  const odds       = parseFloat(document.getElementById('plan-odds')?.value) || 0;
  const confidence = document.getElementById('plan-confidence')?.value || 'mid';
  const reason     = document.getElementById('plan-reason')?.value?.trim();

  if (!date || !game) { alert('날짜와 경기명은 필수입니다.'); return; }

  const plans = JSON.parse(localStorage.getItem('edge_plans') || '[]');
  plans.push({ id: Date.now(), date, game, sport, odds, confidence, reason, done: false });
  plans.sort((a,b) => a.date.localeCompare(b.date));
  localStorage.setItem('edge_plans', JSON.stringify(plans));

  // 입력 초기화
  ['plan-game','plan-sport','plan-odds','plan-reason'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  renderPlanList();
}

function deletePlan(id) {
  let plans = JSON.parse(localStorage.getItem('edge_plans') || '[]');
  plans = plans.filter(p => p.id !== id);
  localStorage.setItem('edge_plans', JSON.stringify(plans));
  renderPlanList();
}

function togglePlanDone(id) {
  const plans = JSON.parse(localStorage.getItem('edge_plans') || '[]');
  const p = plans.find(p => p.id === id);
  if (p) p.done = !p.done;
  localStorage.setItem('edge_plans', JSON.stringify(plans));
  renderPlanList();
}

function renderPlanList() {
  const listEl = document.getElementById('plan-list');
  if (!listEl) return;
  const plans = JSON.parse(localStorage.getItem('edge_plans') || '[]');
  if (plans.length === 0) {
    listEl.innerHTML = '';
    const emptyEl = document.getElementById('plan-empty');
    if (emptyEl) emptyEl.style.display = 'block';
    return;
    return;
  }
  const emptyEl2 = document.getElementById('plan-empty');
  if (emptyEl2) emptyEl2.style.display = 'none';
  const confIcon = { high:'🔥', mid:'🟡', low:'🔵' };
  const today = getKSTDateStr();
  listEl.innerHTML = plans.map(p => {
    const isPast = p.date < today;
    const isToday = p.date === today;
    const borderColor = p.done ? 'var(--text3)' : isToday ? 'var(--accent)' : isPast ? 'var(--red)' : 'var(--border)';
    const opacity = p.done ? '0.45' : '1';
    return `<div style="padding:10px 12px;background:var(--bg3);border-radius:6px;border:1px solid ${borderColor};opacity:${opacity};">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;">
            <span style="font-size:11px;font-weight:700;color:${isToday?'var(--accent)':isPast?'var(--text3)':'var(--text2)'};">${p.date}</span>
            ${p.sport ? `<span style="font-size:10px;background:var(--bg);padding:1px 6px;border-radius:3px;color:var(--text3);">${p.sport}</span>` : ''}
            <span style="font-size:12px;">${confIcon[p.confidence]||'🟡'}</span>
            ${p.odds ? `<span style="font-size:11px;color:var(--gold);font-weight:700;">×${p.odds}</span>` : ''}
            ${isToday ? '<span style="font-size:9px;background:rgba(0,229,255,0.15);color:var(--accent);padding:1px 5px;border-radius:3px;font-weight:700;">오늘</span>' : ''}
          </div>
          <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:${p.reason?'5px':'0'};">${p.game}</div>
          ${p.reason ? `<div style="font-size:11px;color:var(--text3);line-height:1.6;">${p.reason}</div>` : ''}
          ${p.matchResult ? `<div style="margin-top:5px;padding:4px 8px;background:rgba(0,230,118,0.06);border-radius:4px;font-size:10px;color:var(--green);">
            ${p.matchResult.followed} · 실제배당 ${p.matchResult.actualOdds} · ${p.matchResult.result}
          </div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">
          <button onclick="togglePlanDone(${p.id})" title="${p.done?'미완료로':'완료'}"
            style="padding:3px 8px;font-size:11px;background:${p.done?'var(--bg)':'rgba(0,230,118,0.1)'};border:1px solid ${p.done?'var(--border)':'var(--green)'};border-radius:4px;color:${p.done?'var(--text3)':'var(--green)'};cursor:pointer;">${p.done?'↩':'✅'}</button>
          <button onclick="loadPlanToDecision(${p.id})" title="베팅 결정으로 불러오기"
            style="padding:3px 8px;font-size:11px;background:rgba(0,255,136,0.08);border:1px solid rgba(0,255,136,0.3);border-radius:4px;color:#00ff88;cursor:pointer;font-weight:700;">⚡</button>
          <button onclick="linkPlanToBet(${p.id})" title="실제 베팅과 연결"
            style="padding:3px 8px;font-size:11px;background:${p.linkedBetId?'rgba(255,215,0,0.1)':'var(--bg)'};border:1px solid ${p.linkedBetId?'var(--gold)':'var(--border)'};border-radius:4px;color:${p.linkedBetId?'var(--gold)':'var(--text3)'};cursor:pointer;" title="${p.linkedBetId?'연결됨':'베팅 연결'}">${p.linkedBetId?'🔗':'연결'}</button>
          <button onclick="deletePlan(${p.id})"
            style="padding:3px 8px;font-size:11px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text3);cursor:pointer;">✕</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function loadPlanToDecision(planId) {
  const plans = JSON.parse(localStorage.getItem('edge_plans') || '[]');
  const plan = plans.find(p => p.id === planId);
  if (!plan) return;

  // 베팅 결정 탭으로 이동
  if (window.innerWidth <= 600) {
    // 모바일: 베팅일지 > 베팅 결정 탭으로
    mobileNav('betting');
    setTimeout(() => {
      mobileSubtab('betting', 'journal');
      setTimeout(() => mobileSubtab2('betting', 'journal', 'journal-decision'), 100);
    }, 50);
  } else {
    // PC: 베팅 결정 탭으로
    const decTab = document.querySelector('nav .tab[onclick*="decision"]');
    if (decTab) switchTab('decision', decTab);
  }

  // 데이터 채우기
  setTimeout(() => {
    const matchEl = document.getElementById('dec-match');
    const sportEl = document.getElementById('dec-sport');
    const dateEl  = document.getElementById('dec-date');
    if (matchEl) matchEl.value = plan.game || '';
    if (dateEl)  dateEl.value  = plan.date || getKSTDateStr();
    if (sportEl && plan.sport) {
      const opts = Array.from(sportEl.options).map(o => o.value);
      if (opts.includes(plan.sport)) sportEl.value = plan.sport;
    }
    // 예상 배당 있으면 메모에 표시
    if (plan.odds) {
      const memoEl = document.getElementById('dec-memo');
      if (memoEl) memoEl.value = `예정 배당: ${plan.odds}${plan.reason ? ' | ' + plan.reason : ''}`;
    }
    // 토스트 알림
    showMobileToast(`"${plan.game}" 불러왔어요`);
  }, 300);
}

function showMobileToast(msg) {
  let toast = document.getElementById('mobile-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'mobile-toast';
    toast.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#00ff88;color:#050810;padding:8px 18px;border-radius:20px;font-size:12px;font-weight:700;z-index:9999;opacity:0;transition:opacity 0.3s;pointer-events:none;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  setTimeout(() => toast.style.opacity = '0', 2000);
}

function showTagCat(cat) {
  document.querySelectorAll('.tag-cat').forEach(b => b.classList.remove('active'));
  const activeBtn = document.getElementById('tagcat-' + cat);
  if (activeBtn) activeBtn.classList.add('active');
  const panel = document.getElementById('tag-cat-panel');
  if (!panel) return;
  const tags = TAG_CATS[cat] || [];
  panel.innerHTML = tags.map(t =>
    `<button type="button" onclick="appendMemoTagActive('${t}')" class="memo-tag">${t}</button>`
  ).join('');
}

function appendMemoTagActive(tag) {
  // 현재 열려있는 메모 입력창 우선순위: 단폴 → 폴더별 (마지막으로 포커스된 것)
  const single = document.getElementById('single-memo-input');
  const singleVisible = single && document.getElementById('single-memo-wrap') && document.getElementById('single-memo-wrap').style.display !== 'none';
  // 열린 폴더 메모 찾기
  const folderMemos = Array.from(document.querySelectorAll('.folder-memo-wrap')).filter(w => w.style.display !== 'none');
  const lastFolder = folderMemos.length > 0 ? folderMemos[folderMemos.length - 1].querySelector('.folder-memo') : null;
  // 포커스된 입력창 우선
  const focused = document.activeElement;
  if (focused && (focused.id === 'single-memo-input' || focused.classList.contains('folder-memo'))) {
    appendMemoTag(focused, tag); return;
  }
  if (singleVisible && single) { appendMemoTag(single, tag); return; }
  if (lastFolder) { appendMemoTag(lastFolder, tag); return; }
  // 열린 메모창 없으면 알림
  alert('📝 버튼을 눌러 메모창을 먼저 열어주세요.');
}

function appendMemoTag(targetOrId, tag) {
  const el = typeof targetOrId === 'string'
    ? document.getElementById(targetOrId)
    : targetOrId;
  if (!el) return;
  const cur = el.value.trim();
  el.value = cur ? cur + ' / ' + tag : tag;
  el.dispatchEvent(new Event('input'));
  el.focus();
}

function closeRoundSeedModal() {
  const modal = document.getElementById('round-seed-modal');
  if (modal) modal.style.display = 'none';
  sessionStorage.setItem('round_seed_modal_shown', '1');
}

function goToSeedSettings() {
  closeRoundSeedModal();
  const settingsTab = document.querySelector('[onclick*="settings"]');
  switchTab('settings', settingsTab);
  setTimeout(() => {
    const el = document.getElementById('weekly-seed-status');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 200);
}

function showRoundSeedModal() {
  if (sessionStorage.getItem('round_seed_modal_shown')) return;
  const modal = document.getElementById('round-seed-modal');
  if (modal) modal.style.display = 'flex';
}

function updateDashboardRoundStats() {
  const locked = getLockedSeed();

  // 회차 시드 카드
  const seedEl     = document.getElementById('d-round-seed');
  const seedLabel  = document.getElementById('d-round-seed-label');
  const seedPct    = document.getElementById('d-round-seed-pct');
  const seedBar    = document.getElementById('d-round-seed-bar');
  const roundProfit = document.getElementById('d-round-profit');
  const roundProfitLabel = document.getElementById('d-round-profit-label');

  if (!locked) {
    if (seedEl) seedEl.textContent = '—';
    if (seedLabel) { seedLabel.textContent = '고정 전'; seedLabel.style.color = 'var(--text3)'; }
    if (seedPct) seedPct.textContent = '—';
    if (seedBar) seedBar.style.width = '0%';
    if (roundProfit) { roundProfit.textContent = '—'; roundProfit.style.color = 'var(--text2)'; }
    if (roundProfitLabel) roundProfitLabel.textContent = '회차 시드 고정 후 기준';
    return;
  }

  // 고정 후 손익 계산
  const lockFrom = locked.lockedAt ? new Date(locked.lockedAt) : (() => { const d = new Date(locked.date); d.setHours(0,0,0,0); return d; })();
  const useTs = !!locked.lockedAt;
  const betInRound = b => {
    if (!b.date) return false;
    if (useTs) return b.savedAt && new Date(b.savedAt) >= lockFrom;
    return new Date(b.date) >= lockFrom;
  };

  // 결과 확정 베팅
  const roundBets = bets.filter(b => b.result && b.result !== 'PENDING' && betInRound(b));
  // 미결 베팅
  const pendingBets = bets.filter(b => b.result === 'PENDING' && betInRound(b));
  const pendingAmt = pendingBets.reduce((s, b) => s + (b.amount || 0), 0);

  const pnl = roundBets.reduce((s, b) => s + (b.profit || 0), 0);
  // 소진율 = 실제 베팅에 쓴 금액 기준 (적중 여부 무관)
  const spent = roundBets.reduce((s, b) => s + (b.amount || 0), 0);
  const loss = spent + pendingAmt;
  const pct = locked.seed > 0 ? Math.min(100, Math.round(loss / locked.seed * 100)) : 0;

  if (seedEl) seedEl.textContent = '₩' + locked.seed.toLocaleString();
  // 대시보드 올림 표시
  const dashRoundedNote = document.getElementById('d-round-seed-rounded-note');
  if (dashRoundedNote) {
    if (locked.wasRounded && locked.rawSeed) {
      dashRoundedNote.style.display = 'block';
      dashRoundedNote.textContent = '↑ 실제 ₩' + locked.rawSeed.toLocaleString() + ' → 10만원 올림';
    } else {
      dashRoundedNote.style.display = 'none';
    }
  }
  if (seedPct) seedPct.textContent = pct + '% 소진';
  if (seedBar) {
    seedBar.style.width = pct + '%';
    seedBar.style.background = pct >= 100 ? 'var(--red)' : pct >= 70 ? '#ff9800' : 'var(--green)';
  }
  if (seedLabel) {
    if (pct >= 100) {
      seedLabel.textContent = '🛑 소진 완료'; seedLabel.style.color = 'var(--red)';
      showRoundSeedModal();
    }
    else if (pct >= 70) { seedLabel.textContent = `잔여 ₩${Math.round(locked.seed - loss).toLocaleString()}`; seedLabel.style.color = '#ff9800'; }
    else { seedLabel.textContent = `잔여 ₩${Math.round(locked.seed - loss).toLocaleString()}`; seedLabel.style.color = 'var(--green)'; }
  }

  // 미결 표시
  const pendingWrap = document.getElementById('d-round-pending-wrap');
  const pendingAmtEl = document.getElementById('d-round-pending-amt');
  const pendingCntEl = document.getElementById('d-round-pending-cnt');
  if (pendingWrap) {
    if (pendingBets.length > 0) {
      pendingWrap.style.display = 'block';
      if (pendingAmtEl) pendingAmtEl.textContent = '₩' + pendingAmt.toLocaleString();
      if (pendingCntEl) pendingCntEl.textContent = pendingBets.length;
    } else {
      pendingWrap.style.display = 'none';
    }
  }

  if (roundProfit) {
    // 미결을 손실로 포함한 손익
    const pnlWithPending = pnl - pendingAmt;
    roundProfit.textContent = (pnlWithPending >= 0 ? '+' : '') + '₩' + Math.round(pnlWithPending).toLocaleString();
    roundProfit.style.color = pnlWithPending > 0 ? 'var(--green)' : pnlWithPending < 0 ? 'var(--red)' : 'var(--text2)';
  }
  if (roundProfitLabel) {
    const cnt = roundBets.length;
    roundProfitLabel.textContent = `${locked.date} 고정 후 ${cnt}건${pendingBets.length > 0 ? ' (미결 포함)' : ''}`;
  }
  const cntEl = document.getElementById('d-round-bet-count');
  if (cntEl) {
    const total = bets.filter(b => b.date && new Date(b.date) >= lockDate).length;
    const pending = bets.filter(b => b.date && new Date(b.date) >= lockDate && b.result === 'PENDING').length;
    cntEl.textContent = pending > 0 ? `총 ${total}베팅 (미결 ${pending}건)` : `총 ${total}베팅`;
  }
}

function updateSimRoundSeedBanner() {
  const locked = getLockedSeed();
  const banner = document.getElementById('sim-round-seed-banner');
  const noBanner = document.getElementById('sim-no-seed-banner');
  if (!locked) {
    if (banner) banner.style.display = 'none';
    if (noBanner) noBanner.style.display = 'block';
    return;
  }
  if (banner) banner.style.display = 'flex';
  if (noBanner) noBanner.style.display = 'none';

  const lockFrom2 = locked.lockedAt ? new Date(locked.lockedAt) : (() => { const d = new Date(locked.date); d.setHours(0,0,0,0); return d; })();
  const useTs2 = !!locked.lockedAt;
  const betInRound2 = b => {
    if (!b.date) return false;
    if (useTs2) return b.savedAt && new Date(b.savedAt) >= lockFrom2;
    return new Date(b.date) >= lockFrom2;
  };
  const roundBets = bets.filter(b => b.result && b.result !== 'PENDING' && betInRound2(b));
  const pendingBets = bets.filter(b => b.result === 'PENDING' && betInRound2(b));
  const pendingAmt = pendingBets.reduce((s, b) => s + (b.amount || 0), 0);
  const pnl = roundBets.reduce((s, b) => s + (b.profit || 0), 0);
  const pnlWithPending = pnl - pendingAmt;
  const loss = Math.max(0, -pnl) + pendingAmt;
  const pct = locked.seed > 0 ? Math.min(100, Math.round(loss / locked.seed * 100)) : 0;

  const _ss = document.getElementById('sim-locked-seed'); if (_ss) _ss.textContent = '₩' + locked.seed.toLocaleString();
  const _sd = document.getElementById('sim-locked-date'); if (_sd) _sd.textContent = locked.date;
  const _sp = document.getElementById('sim-round-pnl');
  if (_sp) { _sp.textContent = (pnlWithPending >= 0 ? '+' : '') + '₩' + Math.round(pnlWithPending).toLocaleString(); _sp.style.color = pnlWithPending >= 0 ? 'var(--green)' : 'var(--red)'; }
  const _pct = document.getElementById('sim-round-pct'); if (_pct) _pct.textContent = pct + '%';
  const _bar = document.getElementById('sim-round-bar');
  if (_bar) { _bar.style.width = pct + '%'; _bar.style.background = pct >= 100 ? 'var(--red)' : pct >= 70 ? '#ff9800' : 'var(--green)'; }
}

