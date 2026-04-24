let _retroQueue = [];
let _retroIdx   = 0;

function getRetroTargets() {
  return bets.filter(b =>
    b.mode === 'multi' &&
    b.result === 'LOSE' &&
    b.folderOdds && b.folderOdds.length >= 2 &&
    (!b.folderResults || b.folderResults.every(r => r === null || r === undefined))
  );
}

function updateSlumpBanner() {
  const banner = document.getElementById('slump-banner');
  if (!banner) return;

  const resolved = bets.filter(b => b.result === 'WIN' || b.result === 'LOSE');
  if (resolved.length < 10) { banner.style.display = 'none'; return; }

  const _SS = window._SS;

  // 엔진 우선
  const totalWr   = _SS ? _SS.winRate * 100 : resolved.filter(b => b.result === 'WIN').length / resolved.length * 100;
  const streak    = (_SS && _SS.streakType === 'LOSE') ? _SS.streak : (() => {
    let s = 0;
    for (let i = resolved.length - 1; i >= 0; i--) { if (resolved[i].result === 'LOSE') s++; else break; }
    return s;
  })();

  // 최근 10/5건은 엔진에 없으니 직접 계산 유지
  const recent10Wr = resolved.slice(-10).filter(b => b.result === 'WIN').length / 10 * 100;
  const recent5Wr  = resolved.slice(-5).filter(b => b.result === 'WIN').length / 5 * 100;

  const slump10 = totalWr - recent10Wr >= 15;
  const slump5  = totalWr - recent5Wr  >= 20;

  const titleEl = document.getElementById('slump-banner-title');
  const descEl  = document.getElementById('slump-banner-desc');

  if (streak >= 5) {
    banner.style.display = 'flex';
    banner.style.background = 'rgba(255,59,92,0.1)';
    banner.style.borderColor = 'rgba(255,59,92,0.4)';
    if (titleEl) { titleEl.style.color = 'var(--red)'; titleEl.textContent = `🔴 ${streak}연속 미적중 — 베팅 규모 점검 필요`; }
    if (descEl)  descEl.textContent = `전체 적중률 ${totalWr.toFixed(1)}% 대비 현재 연패 중. 베팅금 축소 또는 잠시 중단을 권장합니다.`;
  } else if (slump5 && slump10) {
    banner.style.display = 'flex';
    banner.style.background = 'rgba(255,59,92,0.1)';
    banner.style.borderColor = 'rgba(255,59,92,0.4)';
    if (titleEl) { titleEl.style.color = 'var(--red)'; titleEl.textContent = `🔴 강한 슬럼프 감지 — 최근 5건 적중률 ${recent5Wr.toFixed(0)}%`; }
    if (descEl)  descEl.textContent = `전체 평균 ${totalWr.toFixed(1)}%보다 ${(totalWr - recent5Wr).toFixed(1)}%p 낮습니다. 최근 10건도 ${recent10Wr.toFixed(0)}%로 부진.`;
  } else if (slump10) {
    banner.style.display = 'flex';
    banner.style.background = 'rgba(255,152,0,0.1)';
    banner.style.borderColor = 'rgba(255,152,0,0.4)';
    if (titleEl) { titleEl.style.color = '#ff9800'; titleEl.textContent = `🟡 슬럼프 주의 — 최근 10건 적중률 ${recent10Wr.toFixed(0)}%`; }
    if (descEl)  descEl.textContent = `전체 평균 ${totalWr.toFixed(1)}%보다 ${(totalWr - recent10Wr).toFixed(1)}%p 낮습니다. 베팅 패턴을 점검해보세요.`;
  } else {
    banner.style.display = 'none';
  }
}

function updateRetroBanner() {
  const banner = document.getElementById('retro-folder-banner');
  const countEl = document.getElementById('retro-folder-count');
  if (!banner) return;
  const targets = getRetroTargets();
  if (targets.length > 0) {
    banner.style.display = 'flex';
    if (countEl) countEl.textContent = `폴더별 결과 미입력 ${targets.length}건`;
  } else {
    banner.style.display = 'none';
  }
}

function openRetroModal() {
  _retroQueue = getRetroTargets();
  _retroIdx   = 0;
  if (_retroQueue.length === 0) return;
  const modal = document.getElementById('retro-folder-modal');
  if (modal) modal.style.display = 'flex';
  renderRetroBet();
}

function closeRetroModal() {
  const modal = document.getElementById('retro-folder-modal');
  if (modal) modal.style.display = 'none';
  updateRetroBanner();
  updateAll();
  renderTable();
}

function renderRetroBet() {
  const total   = _retroQueue.length;
  const done    = _retroIdx;
  const progBar = document.getElementById('retro-progress-bar');
  const progLbl = document.getElementById('retro-progress-label');
  if (progBar) progBar.style.width = (total > 0 ? done / total * 100 : 0) + '%';
  if (progLbl) progLbl.textContent = `${done} / ${total} 완료`;

  if (_retroIdx >= _retroQueue.length) {
    closeRetroModal();
    return;
  }

  const b = _retroQueue[_retroIdx];
  const dateEl  = document.getElementById('retro-bet-date');
  const oddsEl  = document.getElementById('retro-bet-odds');
  const gameEl  = document.getElementById('retro-bet-game');
  const rowsEl  = document.getElementById('retro-folder-rows');
  if (dateEl) dateEl.textContent = b.date || '—';
  if (oddsEl) oddsEl.textContent = b.betmanOdds + '배 · ₩' + (b.amount||0).toLocaleString();
  if (gameEl) gameEl.textContent = b.game && b.game !== '-' ? b.game : '경기명 없음';

  const sports = (b.sport || '').split(', ');
  const types  = (b.type  || '').split(', ');
  const memos  = b.folderMemos || [];

  if (rowsEl) {
    rowsEl.innerHTML = b.folderOdds.map((odds, i) => {
      const sport = (b.folderSports && b.folderSports[i]) || sports[i] || sports[0] || '—';
      const type  = types[i]  || types[0]  || '—';
      const memo  = memos[i]  || '';
      const label = `F${i+1} · ${sport} ${type}${odds ? ' · ' + odds + '배' : ''}${memo ? ' · ' + memo : ''}`;
      return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--bg2);border-radius:6px;border:1px solid var(--border);">
        <span style="font-size:11px;color:var(--text2);flex:1;">${label}</span>
        <div style="display:flex;gap:5px;flex-shrink:0;">
          <button id="retro-win-${i}" onclick="setRetroResult(${i},'WIN')"
            style="padding:3px 10px;border-radius:5px;border:2px solid var(--border);background:var(--bg3);color:var(--text3);font-size:11px;font-weight:700;cursor:pointer;">✅</button>
          <button id="retro-lose-${i}" onclick="setRetroResult(${i},'LOSE')"
            style="padding:3px 10px;border-radius:5px;border:2px solid var(--border);background:var(--bg3);color:var(--text3);font-size:11px;font-weight:700;cursor:pointer;">❌</button>
        </div>
      </div>`;
    }).join('');
  }
}

function setRetroResult(idx, result) {
  const winBtn  = document.getElementById(`retro-win-${idx}`);
  const loseBtn = document.getElementById(`retro-lose-${idx}`);
  if (!winBtn || !loseBtn) return;
  if (result === 'WIN') {
    winBtn.style.borderColor  = 'var(--green)'; winBtn.style.background  = 'rgba(0,230,118,0.15)'; winBtn.style.color  = 'var(--green)';
    loseBtn.style.borderColor = 'var(--border)'; loseBtn.style.background = 'var(--bg3)'; loseBtn.style.color = 'var(--text3)';
  } else {
    loseBtn.style.borderColor = 'var(--red)'; loseBtn.style.background  = 'rgba(255,59,92,0.15)'; loseBtn.style.color  = 'var(--red)';
    winBtn.style.borderColor  = 'var(--border)'; winBtn.style.background  = 'var(--bg3)'; winBtn.style.color  = 'var(--text3)';
  }
}

function retroSave() {
  const b = _retroQueue[_retroIdx];
  if (!b) return;
  const folderCount = b.folderOdds ? b.folderOdds.length : 0;
  const results = [];
  for (let i = 0; i < folderCount; i++) {
    const winBtn  = document.getElementById(`retro-win-${i}`);
    const loseBtn = document.getElementById(`retro-lose-${i}`);
    if (loseBtn && loseBtn.style.color === 'var(--red)') results.push('LOSE');
    else if (winBtn && winBtn.style.color === 'var(--green)') results.push('WIN');
    else results.push(null);
  }
  // 실제 bets 배열에서 찾아서 저장
  const target = bets.find(bet => bet.id === b.id);
  if (target) target.folderResults = results;
  localStorage.setItem('edge_bets', JSON.stringify(bets));
  _retroIdx++;
  renderRetroBet();
}

function retroSkip() {
  _retroIdx++;
  renderRetroBet();
}

const TAG_CATS = {
  '전력':    ['양팀전력차','양팀전적','득점력우위','수비안정','팀상성좋음','전술변화'],
  '인적요인':['주전결장','주전부재','부상이슈','감독교체','부상자복귀','트레이드직후','감독능력우위','감독전술보수적'],
  '흐름':    ['최근경기력','최근연승','최근연패','타선폭발중','타선냉각중','전날저점반등','연패후반등타이밍','역전패후기세꺾임'],
  '홈/원정': ['홈어드밴티지','원정약세','장거리원정','고지대원정','홈연속경기','원정연속경기','원정강팀','주말홈경기'],
  '동기':    ['우승경쟁','순위싸움','시즌말경쟁','강등권탈출','플레이오프','동기부여'],
  '배당':    ['배당저평가','역배가치','라인무빙','대중역배','과소평가팀','미디어과대평가','핸디캡유리','핸디수치유리','언더유리','오버유리'],
  '선발/불펜':['에이스선발','에이스대결','선발급락','선발불안','선발피로누적','불펜약세','불펜안정','불펜고갈','구원실패잦음'],
  '컨디션':  ['휴식충분','강행군','3in4','백투백','일정과밀','날씨영향','실내경기유리','DH연전','인터리그','연장전잦음','리그정보부족'],
  '구장/상성':['타자친화구장','투수친화구장','좌투유리구장','우투유리구장','바람영향','좌우상성유리','해당선발상성좋음','해당선발상성나쁨','홈런타선','득점권강함','득점권약함','인조잔디구장','잔디이슈'],
  '배구':    ['서브력우위','리시브불안']
};

// 태그 → 통계 카테고리 역매핑
const TAG_STAT_CATEGORY = {};
const TAG_STAT_GROUPS = {
  '전력우위':  ['양팀전력차','양팀전적','득점력우위','수비안정','팀상성좋음','전술변화'],
  '인적요인':  ['주전결장','주전부재','부상이슈','감독교체','부상자복귀','트레이드직후','감독능력우위','감독전술보수적'],
  '흐름/폼':   ['최근경기력','최근연승','최근연패','타선폭발중','타선냉각중','전날저점반등','연패후반등타이밍','역전패후기세꺾임'],
  '홈/원정':   ['홈어드밴티지','원정약세','장거리원정','고지대원정','홈연속경기','원정연속경기','원정강팀','주말홈경기'],
  '동기부여':  ['우승경쟁','순위싸움','시즌말경쟁','강등권탈출','플레이오프','동기부여'],
  '배당/라인': ['배당저평가','역배가치','라인무빙','대중역배','과소평가팀','미디어과대평가','핸디캡유리','핸디수치유리','언더유리','오버유리'],
  '선발/불펜': ['에이스선발','에이스대결','선발급락','선발불안','선발피로누적','불펜약세','불펜안정','불펜고갈','구원실패잦음'],
  '컨디션/일정':['휴식충분','강행군','3in4','백투백','일정과밀','날씨영향','실내경기유리','DH연전','인터리그','연장전잦음','리그정보부족'],
  '구장/상성': ['타자친화구장','투수친화구장','좌투유리구장','우투유리구장','바람영향','좌우상성유리','해당선발상성좋음','해당선발상성나쁨','홈런타선','득점권강함','득점권약함','인조잔디구장','잔디이슈'],
  '배구':      ['서브력우위','리시브불안'],
};
Object.entries(TAG_STAT_GROUPS).forEach(([group, tags]) => {
  tags.forEach(tag => { TAG_STAT_CATEGORY[tag] = group; });
});

function updateTagStats() {
  const body = document.getElementById('tag-stat-body');
  if (!body) return;
  const rows = getTagStatRows();
  const entries = Object.entries(rows).filter(([,v]) => v.total > 0);
  if (entries.length === 0) {
    body.innerHTML = '<div style="text-align:center;color:var(--text3);padding:20px;font-size:12px;">태그가 입력된 베팅 데이터가 없습니다.</div>';
    return;
  }
  // 적중률 내림차순 정렬
  entries.sort((a,b) => (b[1].wins/b[1].total) - (a[1].wins/a[1].total));
  const maxTotal = Math.max(...entries.map(([,v]) => v.total));
  body.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="color:var(--text3);border-bottom:1px solid var(--border);">
          <th style="text-align:left;padding:7px 6px;font-weight:600;">카테고리</th>
          <th style="text-align:center;padding:7px 6px;font-weight:600;">건수</th>
          <th style="text-align:center;padding:7px 6px;font-weight:600;">적중</th>
          <th style="text-align:left;padding:7px 6px;font-weight:600;min-width:100px;">적중률</th>
        </tr>
      </thead>
      <tbody>
        ${entries.map(([cat, v]) => {
          const rate = v.total > 0 ? (v.wins / v.total * 100) : 0;
          const color = rate >= 60 ? 'var(--positive)' : rate >= 50 ? 'var(--accent)' : rate >= 40 ? '#ff9800' : 'var(--negative)';
          const barW = Math.round(rate);
          const opacity = 0.4 + (v.total / maxTotal) * 0.6;
          return `<tr style="border-bottom:1px solid var(--border);opacity:${opacity.toFixed(2)};">
            <td style="padding:8px 6px;font-weight:600;color:var(--text1);">${cat}</td>
            <td style="text-align:center;padding:8px 6px;color:var(--text2);">${v.total}</td>
            <td style="text-align:center;padding:8px 6px;color:var(--positive);">${v.wins}</td>
            <td style="padding:8px 6px;">
              <div style="display:flex;align-items:center;gap:6px;">
                <div style="flex:1;height:6px;background:var(--bg3);border-radius:3px;overflow:hidden;">
                  <div style="width:${barW}%;height:100%;background:${color};border-radius:3px;transition:width 0.3s;"></div>
                </div>
                <span style="font-weight:700;color:${color};min-width:38px;">${rate.toFixed(1)}%</span>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div style="font-size:10px;color:var(--text3);margin-top:8px;text-align:right;">* 건수가 적을수록 흐리게 표시됩니다</div>
  `;
}

function getTagStatRows() {
  const resolved = bets.filter(b => b.result !== 'PENDING');
  const groupMap = {};
  resolved.forEach(b => {
    const memos = [
      ...(b.memo ? [b.memo] : []),
      ...(b.folderMemos || [])
    ].join(' ');
    const tags = memos.match(/[^\s\/]+/g) || [];
    const matched = new Set();
    tags.forEach(t => {
      const g = TAG_STAT_CATEGORY[t];
      if (g) matched.add(g);
    });
    matched.forEach(g => {
      if (!groupMap[g]) groupMap[g] = { total:0, wins:0 };
      groupMap[g].total++;
      if (b.result === 'WIN') groupMap[g].wins++;
    });
  });
  return groupMap;
}

function renderMiniTagTabs(catBtnsEl, panelEl, targetInput) {
  if (!catBtnsEl || !panelEl) return;
  const cats = Object.keys(TAG_CATS);
  const firstCat = cats[0];
  catBtnsEl.innerHTML = cats.map(cat =>
    `<button type="button" class="tag-cat${cat === firstCat ? ' active' : ''}"
      style="font-size:9px;padding:3px 7px;"
      onclick="switchMiniTagCat(this, '${cat}')">${cat}</button>`
  ).join('');
  renderMiniTagPanel(panelEl, firstCat, targetInput);
}

function switchMiniTagCat(btn, cat) {
  const wrap = btn.closest('.folder-memo-wrap') || document.getElementById('single-memo-wrap');
  if (!wrap) return;
  wrap.querySelectorAll('.tag-cat').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const panelEl = wrap.querySelector('.folder-tag-cat-panel') || wrap.querySelector('#single-tag-cat-panel') || wrap.querySelectorAll('[class*="tag-cat-panel"]')[0];
  const targetInput = wrap.querySelector('.folder-memo') || document.getElementById('single-memo-input');
  renderMiniTagPanel(panelEl, cat, targetInput);
}

function renderMiniTagPanel(panelEl, cat, targetInput) {
  if (!panelEl) return;
  const tags = TAG_CATS[cat] || [];
  panelEl.innerHTML = tags.map(t =>
    `<button type="button" class="memo-tag" onclick="event.stopPropagation();" data-tag="${t}">${t}</button>`
  ).join('');
  panelEl.querySelectorAll('.memo-tag').forEach(btn => {
    btn.addEventListener('click', () => appendMemoTag(targetInput, btn.dataset.tag));
  });
}

function initSingleMemoTabs() {
  const catBtns = document.getElementById('single-tag-cat-btns');
  const panel   = document.getElementById('single-tag-cat-panel');
  const input   = document.getElementById('single-memo-input');
  renderMiniTagTabs(catBtns, panel, input);
}

function initFolderMemoTabs(row) {
  const catBtns = row.querySelector('.folder-tag-cat-btns');
  const panel   = row.querySelector('.folder-tag-cat-panel');
  const input   = row.querySelector('.folder-memo');
  renderMiniTagTabs(catBtns, panel, input);
}

function showJudgeSigExplain(idx) {
  const panel = document.getElementById('judgeall-sig-explain');
  if (!panel) return;
  const SS = window._SS;
  if (!SS) return;

  if (idx === -1) {
    // 종합 신호 클릭
    const v = SS.verdictInfo || {};
    panel.style.display = 'block';
    panel.innerHTML = `<strong style="color:var(--gold);">📋 종합 점수 ${Math.round(SS.overallScore)}점</strong><br>
      7개 신호의 가중 평균입니다. <strong>${v.label || ''}</strong> — ${v.desc || ''}<br>
      <span style="color:var(--text3);font-size:10px;">신호등을 클릭하면 각 항목이 뭘 보는지 설명해드립니다. 다시 클릭하면 닫힙니다.</span>`;
    return;
  }

  const explains = [
    { what:'수익성', why:'지금까지 베팅한 돈 대비 순수익 비율(ROI)을 봐요.', action:'ROI가 마이너스라면 배당 선택이나 베팅 기준을 바꿔야 할 시점입니다.' },
    { what:'예측 엣지', why:'배당에 내포된 확률보다 내 승률이 높아야 장기 수익이 납니다.', action:'승률이 손익분기에 못 미치면 EV+ 경기만 골라서 진입 횟수를 줄이세요.' },
    { what:'리스크(손익비)', why:'이기면 얼마나 벌고 지면 얼마나 잃는지의 비율입니다.', action:'손익비가 1 미만이면 배당이 낮은 경기 위주로 베팅하고 있다는 신호예요. 배당 기준을 올려보세요.' },
    { what:'컨디션', why:'최근 5경기 수익 합산과 연속 결과를 봅니다.', action:'3연패 이상이면 감정적 베팅 가능성이 높습니다. 오늘은 쉬거나 베팅금을 절반으로 줄이세요.' },
    { what:'편향 없음', why:'내가 이길 것 같다고 느낄 때 실제보다 승률을 높게 설정하는 경향(낙관 편향)을 측정합니다.', action:'편향이 크면 EV 계산 결과가 실제보다 좋게 나올 수 있어요. 자신 있는 픽일수록 한 번 더 의심하세요.' },
    { what:'데이터 신뢰도', why:'베팅 기록 수가 많을수록 다른 지표들이 통계적으로 의미 있어집니다.', action:'30건 미만이면 지금 보이는 승률·ROI가 우연일 수 있어요. 아직은 숫자보다 원칙을 따르세요.' },
    { what:'보정도(ECE)', why:'EV 계산기에서 입력한 내 예상 승률이 실제와 얼마나 다른지 측정합니다.', action:'오차가 크면 내 EV 계산 자체가 부정확하다는 뜻이에요. 켈리가 자동으로 줄어들고 있으니 그 금액을 따르세요.' },
  ];

  const e = explains[idx];
  if (!e) { panel.style.display = 'none'; return; }

  // 토글
  if (panel.style.display === 'block' && panel.dataset.idx === String(idx)) {
    panel.style.display = 'none'; panel.dataset.idx = '';
    return;
  }
  panel.dataset.idx = String(idx);
  panel.style.display = 'block';
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <strong style="color:var(--accent);font-size:13px;">${e.what} 신호란?</strong>
      <span onclick="document.getElementById('judgeall-sig-explain').style.display='none'" style="cursor:pointer;color:var(--text3);font-size:16px;">✕</span>
    </div>
    <div style="margin-bottom:6px;"><span style="color:var(--text3);">📌 무엇을 보나:</span> ${e.why}</div>
    <div style="color:var(--gold);"><span style="color:var(--text3);">⚡ 지금 할 것:</span> ${e.action}</div>`;
}

// ========== 종목 선택 팝업 ==========
const SPORT_CATS = {
  '축구': ['K리그1','K리그2','EFL챔','EPL','라리가','분데스리가','세리에A','프리그1','에레디비','J1백년','J2J3백년','A리그','UCL','UEL','UCEL','MLS','C챔피언','여축아컵','A매치','월드컵','축구(기타)'],
  '야구': ['MLB','KBO','NPB','WBC'],
  '농구': ['NBA','KBL','남농EASL','남농월예','여농월예'],
  '배구': ['KOVO남','KOVO여','남자배구','여자배구'],
};
let _sportPickerCtx = null; // { target, folderBtn }

function openSportPicker(target, btnOrCat, cat) {
  const modal = document.getElementById('sport-picker-modal');
  const titleEl = document.getElementById('sport-picker-title');
  const btnsEl = document.getElementById('sport-picker-btns');
  if (!modal) return;

  // target: 'record' | 'ev' | 'folder'
  // folder: btnOrCat = the clicked emoji button, cat = category
  // record/ev: btnOrCat = category string
  const category = target === 'folder' ? cat : btnOrCat;
  _sportPickerCtx = { target, folderBtn: target === 'folder' ? btnOrCat : null };

  const sports = SPORT_CATS[category] || [];
  const icons = { '축구':'⚽', '야구':'⚾', '농구':'🏀', '배구':'🏐' };
  titleEl.textContent = `${icons[category] || ''} ${category} — 세부 종목 선택`;
  btnsEl.innerHTML = sports.map(s => `
    <button type="button" onclick="selectSport('${s}')"
      style="padding:9px 4px;font-size:12px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text2);cursor:pointer;font-weight:600;transition:background 0.15s;"
      onmouseover="this.style.background='rgba(0,229,255,0.12)'"
      onmouseout="this.style.background='var(--bg3)'">${s}</button>
  `).join('');

  modal.style.display = 'flex';
}

function closeSportPicker() {
  const modal = document.getElementById('sport-picker-modal');
  if (modal) modal.style.display = 'none';
  _sportPickerCtx = null;
}

// ===== TYPE PICKER =====
const TYPE_OPTIONS = {
  '일반': [
    { val: '승/패',  icon: '🏆', label: '승/패' },
    { val: '핸디캡', icon: '⚖️', label: '핸디캡' },
    { val: '언/옵',  icon: '📊', label: '언/옵' },
  ],
  '전반': [
    { val: '전반 승/패',  icon: '🏆', label: '승/패' },
    { val: '전반 핸디캡', icon: '⚖️', label: '핸디캡' },
    { val: '전반 언/옵',  icon: '📊', label: '언/옵' },
  ]
};

function openTypePicker(category) {
  const modal = document.getElementById('type-picker-modal');
  const title = document.getElementById('type-picker-title');
  const btns  = document.getElementById('type-picker-btns');
  if (!modal || !title || !btns) return;

  const cats = category ? [category] : ['일반', '전반'];
  title.textContent = category ? `${category === '일반' ? '📋' : '⏱️'} ${category} — 형식 선택` : '형식 선택';

  btns.innerHTML = cats.flatMap(cat => {
    const header = cats.length > 1 ? `<div style="grid-column:1/-1;font-size:10px;color:var(--text3);padding:4px 0 2px;">${cat}</div>` : '';
    const items = TYPE_OPTIONS[cat].map(o =>
      `<button type="button" onclick="selectType('${o.val}')"
        style="padding:10px 4px;font-size:13px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text2);cursor:pointer;">
        ${o.icon}<br><span style="font-size:10px;">${o.label}</span>
      </button>`
    ).join('');
    return header + items;
  }).join('');

  modal.style.display = 'flex';
}

let _folderTypeBtn = null;

function openFolderTypePicker(btn, category) {
  _folderTypeBtn = btn;

  // 같은 행의 형식 버튼들 스타일 초기화 후 선택된 것 강조
  const container = btn.closest('div').parentElement;
  container?.querySelectorAll('button[onclick*="openFolderTypePicker"]').forEach(b => {
    b.style.borderColor = 'var(--border)';
    b.style.background  = 'var(--bg3)';
    b.style.color       = 'var(--text3)';
  });
  btn.style.borderColor = category === '일반' ? 'var(--accent)' : 'var(--gold)';
  btn.style.background  = category === '일반' ? 'rgba(0,229,255,0.12)' : 'rgba(255,215,0,0.12)';
  btn.style.color       = category === '일반' ? 'var(--accent)' : 'var(--gold)';

  const modal = document.getElementById('type-picker-modal');
  const title = document.getElementById('type-picker-title');
  const btns  = document.getElementById('type-picker-btns');
  if (!modal || !title || !btns) return;
  title.textContent = `${category === '일반' ? '🏁 일반' : '⏱️ 전반'} — 형식 선택`;
  const items = category === '일반'
    ? [{ val:'승/패', icon:'🏆', label:'승/패' }, { val:'핸디캡', icon:'⚖️', label:'핸디캡' }, { val:'언/옵', icon:'📊', label:'언/옵' }]
    : [{ val:'전반 승/패', icon:'🏆', label:'승/패' }, { val:'전반 핸디캡', icon:'⚖️', label:'핸디캡' }, { val:'전반 언/옵', icon:'📊', label:'언/옵' }];
  btns.innerHTML = items.map(o =>
    `<button type="button" onclick="selectFolderType('${o.val}','${o.icon}','${o.label}')"
      style="padding:10px 4px;font-size:13px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text2);cursor:pointer;">
      ${o.icon}<br><span style="font-size:10px;">${o.label}</span>
    </button>`
  ).join('');
  modal.style.display = 'flex';
}

function selectFolderType(val, icon, label) {
  if (!_folderTypeBtn) { closeTypePicker(); return; }
  const container = _folderTypeBtn.closest('div[style*="flex-direction:column"]');
  const hidden = container?.querySelector('.folder-type');
  const labelEl = container?.querySelector('.folder-type-label');
  if (hidden) hidden.value = val;
  if (labelEl) labelEl.textContent = `${icon} ${label}`;
  // 선택된 카테고리 버튼 강조 유지
  _folderTypeBtn = null;
  closeTypePicker();
  calcMultiEV();
}

function closeTypePicker() {
  const modal = document.getElementById('type-picker-modal');
  if (modal) modal.style.display = 'none';
}

function selectType(val) {
  // sel-btn 방식으로 type 선택 처리
  document.querySelectorAll('#type-btns .sel-btn').forEach(b => b.classList.remove('active'));

  // hidden input 업데이트
  const hidden = document.getElementById('r-type-hidden');
  if (hidden) hidden.value = val;

  // 배지 표시
  const badge = document.getElementById('type-selected-badge');
  const label = document.getElementById('type-selected-label');
  if (badge) badge.style.display = 'block';
  if (label) label.textContent = val;

  // getSelectedVals('type') 호환을 위해 hidden input을 sel-btn active로 처리
  // type 버튼이 없으므로 getSelectedVals override
  window._selectedType = val;

  closeTypePicker();
  updatePreview();
  updateLossRatio();
}

function selectSport(val) {
  if (!_sportPickerCtx) return;
  const { target, folderBtn } = _sportPickerCtx;

  if (target === 'record') {
    // hidden input + badge
    const hiddenEl = document.getElementById('r-sport');
    if (hiddenEl) hiddenEl.value = val;
    const badge = document.getElementById('sport-selected-badge');
    const label = document.getElementById('sport-selected-label');
    if (badge) badge.style.display = 'block';
    if (label) label.textContent = val;
  } else if (target === 'ev') {
    // ev-sport hidden 저장 — toggleEvSport 대체
    const badge = document.getElementById('ev-sport-selected-badge');
    const label = document.getElementById('ev-sport-selected-label');
    if (badge) badge.style.display = 'block';
    if (label) label.textContent = val;
    // evSport 전역 업데이트
    window._evSport = val;
    calcEV();
  } else if (target === 'folder' && folderBtn) {
    // 해당 폴더 행의 hidden input과 label 업데이트
    const row = folderBtn.closest('.folder-row') || folderBtn.closest('div[style*="flex-direction"]')?.closest('[class]');
    // hidden input은 form-sport-label 형제
    const container = folderBtn.parentElement?.parentElement;
    if (container) {
      const hidden = container.querySelector('.folder-sport');
      const labelEl = container.querySelector('.folder-sport-label');
      if (hidden) hidden.value = val;
      if (labelEl) { labelEl.textContent = val; labelEl.style.color = 'var(--accent)'; }
    }
    calcMultiEV();
  }

  closeSportPicker();
}

// 팝업 외부 클릭 시 닫기
document.addEventListener('click', function(e) {
  const modal = document.getElementById('sport-picker-modal');
  if (modal && modal.style.display === 'flex' && e.target === modal) closeSportPicker();
  const tmodal = document.getElementById('type-picker-modal');
  if (tmodal && tmodal.style.display === 'flex' && e.target === tmodal) closeTypePicker();
});

