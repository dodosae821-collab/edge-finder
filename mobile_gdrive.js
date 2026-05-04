// ========== MOBILE NAVIGATION ==========

const MOBILE_NAV_CONFIG = {
  home: {
    subtabs: [],
    default: 'dashboard'
  },
  betting: {
    subtabs: [
      { id: 'strategy', label: '⚡ 전략베팅',  page: 'strategy' },
      { id: 'record',     label: '📝 기록 입력', page: 'record' },
      { id: 'diary-list', label: '📒 일지 목록', page: 'diary-list' },
      { id: 'vault',      label: '🗄️ 보관함',   page: 'vault' },
      { id: 'value',    label: '🧮 EV 계산기', page: 'value', hidden: true },
      { id: 'journal',  label: '📓 베팅일지',  page: null, sub2: true, hidden: true },
    ],
    default: 'strategy',
    sub2: {
      journal: [
        { id: 'journal-plan',     label: '예정 경기', page: 'journal', tab: 'plan' },
        { id: 'journal-decision', label: '⚡ 베팅 결정', page: 'decision', tab: null },
        { id: 'journal-diary',    label: '일지',     page: 'journal', tab: 'diary' },
      ]
    }
  },
  analysis: {
    subtabs: [
      { id: 'stats',    label: '📈 통계', page: null, sub2: true },
      { id: 'analyze',  label: '📊 분석', page: null, sub2: true },
      { id: 'predpower',label: '🧠 예측력', page: 'predpower' },
    ],
    default: 'analysis',
    sub2: {
      stats: [
        { id: 'analysis',  label: '성과',  page: 'analysis' },
        { id: 'analysis2', label: '패턴',  page: 'analysis2' },
        { id: 'analysis3', label: '판단력', page: 'analysis3' },
      ],
      analyze: [
        { id: 'analyze',   label: '분석',  page: 'analyze' },
        { id: 'predict',   label: '예측',  page: 'predict' },
      ]
    }
  },
  status: {
    subtabs: [
      { id: 'simulator', label: '💰 자금관리',  page: 'simulator' },
      { id: 'goal',      label: '🎯 목표 추적', page: 'goal' },
      { id: 'judgeall',  label: '📋 종합판단',  page: 'judgeall' },
      { id: 'ai-advice', label: '🤖 AI 조언',   page: 'ai-advice' },
    ],
    default: 'simulator'
  },
  settings: {
    subtabs: [],
    default: 'settings'
  }
};

let _mobileSection = 'home';
let _mobileSubtab = null;
let _mobileSubtab2 = null;

function mobileNav(section) {
  if (window.innerWidth > 600) return;

  _mobileSection = section;
  _mobileSubtab = null;
  _mobileSubtab2 = null;

  // 하단 바 활성 상태
  document.querySelectorAll('.mobile-nav-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById('mnav-' + section);
  if (navEl) navEl.classList.add('active');

  const config = MOBILE_NAV_CONFIG[section];
  if (!config) return;

  // 서브탭 렌더
  renderMobileSubtabs(section);

  // 기본 페이지로 이동
  const defaultTab = config.default;
  if (defaultTab) {
    const firstSub = config.subtabs[0];
    if (firstSub) {
      mobileSubtab(section, firstSub.id);
    } else {
      switchTabMobile(defaultTab);
    }
  }
}

function renderMobileSubtabs(section) {
  const bar = document.getElementById('mobile-subtab-bar');
  const bar2 = document.getElementById('mobile-subtab2-bar');
  if (!bar) return;

  const config = MOBILE_NAV_CONFIG[section];
  if (!config || config.subtabs.length === 0) {
    bar.innerHTML = '';
    bar.style.display = 'none';
    bar2.innerHTML = '';
    bar2.style.display = 'none';
    return;
  }

  bar.style.display = 'flex';
  const visibleSubs = config.subtabs.filter(sub => {
    if (!sub.hidden) return true;
    // 설정에서 토글된 경우만 보여줌
    const settings = JSON.parse(localStorage.getItem('edge_settings') || '{}');
    if (sub.id === 'journal' && settings.showJournal) return true;
    if (sub.id === 'value' && settings.showEVCalc) return true;
    return false;
  });
  bar.innerHTML = visibleSubs.map(sub =>
    `<div class="mobile-subtab${_mobileSubtab === sub.id ? ' active' : ''}" onclick="mobileSubtab('${section}','${sub.id}')">${sub.label}</div>`
  ).join('');

  bar2.innerHTML = '';
  bar2.style.display = 'none';
  document.getElementById('main-content')?.classList.remove('has-subtab2');
}

function mobileSubtab(section, subId) {
  _mobileSubtab = subId;
  _mobileSubtab2 = null;

  // 서브탭 활성 상태 업데이트
  document.querySelectorAll('.mobile-subtab').forEach(el => el.classList.remove('active'));
  const found = document.querySelector(`.mobile-subtab[onclick*="'${subId}'"]`);
  if (found) found.classList.add('active');

  const config = MOBILE_NAV_CONFIG[section];
  const sub = config?.subtabs.find(s => s.id === subId);
  if (!sub) return;

  const bar2 = document.getElementById('mobile-subtab2-bar');
  const mainEl = document.querySelector('main');

  if (sub.sub2 && config.sub2 && config.sub2[subId]) {
    // 2단계 서브탭 렌더
    const subs2 = config.sub2[subId];
    bar2.style.display = 'flex';
    bar2.innerHTML = subs2.map((s2, i) =>
      `<div class="mobile-subtab2${i === 0 ? ' active' : ''}" onclick="mobileSubtab2('${section}','${subId}','${s2.id}')">${s2.label}</div>`
    ).join('');
    if (mainEl) mainEl.classList.add('has-subtab2');
    // 첫 번째 2단계 탭 자동 선택
    mobileSubtab2(section, subId, subs2[0].id);
    setTimeout(() => window._adjustMobileLayout && window._adjustMobileLayout(), 50);
  } else {
    bar2.style.display = 'none';
    bar2.innerHTML = '';
    if (mainEl) mainEl.classList.remove('has-subtab2');
    if (sub.page) switchTabMobile(sub.page);
    setTimeout(() => window._adjustMobileLayout && window._adjustMobileLayout(), 50);
  }
}

function mobileSubtab2(section, subId, sub2Id) {
  _mobileSubtab2 = sub2Id;

  document.querySelectorAll('.mobile-subtab2').forEach(el => el.classList.remove('active'));
  const found = document.querySelector(`.mobile-subtab2[onclick*="'${sub2Id}'"]`);
  if (found) found.classList.add('active');

  const config = MOBILE_NAV_CONFIG[section];
  const subs2 = config?.sub2?.[subId];
  if (!subs2) return;

  const sub2 = subs2.find(s => s.id === sub2Id);
  if (sub2?.page) {
    switchTabMobile(sub2.page);
    // 베팅일지 탭 전환 시 하위 탭 처리
    if (sub2.tab) {
      setTimeout(() => {
        const journalTabBtn = document.querySelector(`.journal-tab-btn[data-tab="${sub2.tab}"]`);
        if (journalTabBtn) switchJournalTab(sub2.tab);
      }, 50);
    }
  }
}

function switchTabMobile(name) {
  // 기존 switchTab 함수 재활용 (탭 버튼 없이 페이지만 전환)
  checkLossWarning();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  if (page) page.classList.add('active');
  activePage = name;

  if (name === 'dashboard') { updateCharts(); updateFundCards(); }
  if (name === 'analysis')  updateStatsAnalysis();
  if (name === 'analysis2') updateStatsAnalysis();
  if (name === 'analysis3') { updateStatsAnalysis(); updateEvBias(); updateEvMonthly(); updateEvCum(); }
  if (name === 'analyze')   updateAnalyzeTab();
  if (name === 'goal')      { updateRoundHistory(); updateGoalStats(); calcGoal(); }
  if (name === 'predict')   { updateGoalStats(); updatePredictTab(); }
  if (name === 'simulator') { calcKelly(); updateKellyHistory(); updateKellyGradeBanner(); try{updateFibonacci();}catch(e){} }
  if (name === 'judgeall')  updateJudgeAll();
  if (name === 'settings')  { loadSettingsDisplay(); updateWeeklySeedStatus(); setTodayKST(); renderPrincipleList(); }
  if (name === 'vault')     renderVault();
  if (name === 'decision')  initDecisionTab();
  if (name === 'journal')   loadJournal();
  if (name === 'strategy')  initSimulator();
  if (name === 'diary-list') renderDiaryListPage();

  // 맨 위로 스크롤
  window.scrollTo(0, 0);
}

// 모바일 초기화
function initMobileNav() {
  if (window.innerWidth <= 600) {
    mobileNav('home');
  }
}

// ========== GOOGLE DRIVE SYNC ==========

const GDRIVE_CLIENT_ID = '508931566986-q7mkmphshar8j4vca2n674guond19d9c.apps.googleusercontent.com';
const GDRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const GDRIVE_FILE_NAME = 'edge_finder_data.json';

let _gdriveToken = null;
let _gdriveFileId = null;
let _gdriveSyncing = false;

function gdriveSetStatus(icon, label, color) {
  const i = document.getElementById('gdrive-icon');
  const l = document.getElementById('gdrive-label');
  if (i) { i.textContent = icon; i.style.color = color || ''; }
  if (l) { l.textContent = label; l.style.color = color || 'var(--text3)'; }
}

function gdriveToggle() {
  if (_gdriveToken) {
    // 이미 로그인됨 → 즉시 동기화
    gdriveSync();
  } else {
    // 로그인 필요
    gdriveLogin();
  }
}

function gdriveLogin() {
  gdriveSetStatus('⏳', '로그인중', 'var(--gold)');
  const client = google.accounts.oauth2.initTokenClient({
    client_id: GDRIVE_CLIENT_ID,
    scope: GDRIVE_SCOPE,
    callback: (resp) => {
      if (resp.error) {
        gdriveSetStatus('☁️', '드라이브', '');
        alert('구글 로그인 실패: ' + resp.error);
        return;
      }
      _gdriveToken = resp.access_token;
      gdriveSetStatus('🔄', '동기화중', 'var(--accent)');
      gdriveSync();
    }
  });
  client.requestAccessToken();
}

async function gdriveSync() {
  if (_gdriveSyncing) return;
  _gdriveSyncing = true;
  gdriveSetStatus('🔄', '동기화중', 'var(--accent)');

  try {
    // 기존 파일 찾기
    if (!_gdriveFileId) {
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${GDRIVE_FILE_NAME}'&fields=files(id,name,modifiedTime)`,
        { headers: { Authorization: 'Bearer ' + _gdriveToken } }
      );
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        _gdriveFileId = searchData.files[0].id;
      }
    }

    if (_gdriveFileId) {
      // 파일 있음 → 드라이브 데이터 읽어서 병합
      const dlRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${_gdriveFileId}?alt=media`,
        { headers: { Authorization: 'Bearer ' + _gdriveToken } }
      );
      const cloudData = await dlRes.json();

      // 병합 (id 기준 중복 제거, 최신 우선)
      const localBets = getBets();
      const cloudBets = cloudData.bets || [];
      const merged = mergeByKey([...localBets, ...cloudBets], 'id');
      saveBets(merged);

      // 설정 병합 (로컬 우선)
      if (cloudData.settings && !localStorage.getItem('edge_settings')) {
        localStorage.setItem('edge_settings', JSON.stringify(cloudData.settings));
      }

      // 전략베팅 시뮬레이터 복원 (클라우드 우선)
      if (cloudData.simState) {
        localStorage.setItem('edge_sim_state', JSON.stringify(cloudData.simState));
        simState = cloudData.simState;
        simSnaps = [];
      }
      if (cloudData.simGoal) {
        localStorage.setItem('edge_sim_goal', cloudData.simGoal);
        SIM_GOAL = parseInt(cloudData.simGoal);
      }
      if (cloudData.simPending) {
        localStorage.setItem('edge_sim_pending', JSON.stringify(cloudData.simPending));
        simPending = cloudData.simPending;
      }
      // 전략베팅 시뮬레이터 UI 갱신 (경로 탭 포함)
      if (cloudData.simState) {
        simSnaps = [];
        simResetOdds();
        simRender();
        simOnInput();
        const treeTab = document.getElementById('sim-tc-tree');
        if(treeTab && treeTab.style.display !== 'none') simRenderTree();
      }

      // 드라이브에 최신 데이터 업로드
      await gdriveUpload();
    } else {
      // 파일 없음 → 새로 생성
      await gdriveUpload();
    }

    updateAll();
    gdriveSetStatus('✅', '동기화됨', 'var(--green)');
    setTimeout(() => gdriveSetStatus('☁️✅', '드라이브', 'var(--green)'), 2000);

  } catch (e) {
    console.error('GDrive sync error:', e);
    gdriveSetStatus('⚠️', '오류', 'var(--red)');
    setTimeout(() => gdriveSetStatus('☁️', '드라이브', ''), 3000);
  } finally {
    _gdriveSyncing = false;
  }
}

async function gdriveUpload() {
  const payload = {
    bets: getBets(),
    settings: JSON.parse(localStorage.getItem('edge_settings') || '{}'),
    diaries: JSON.parse(localStorage.getItem('edge_diaries') || '{}'),
    plans: JSON.parse(localStorage.getItem('edge_plans') || '[]'),
    simState: JSON.parse(localStorage.getItem('edge_sim_state') || 'null'),
    simGoal: localStorage.getItem('edge_sim_goal') || null,
    simPending: JSON.parse(localStorage.getItem('edge_sim_pending') || 'null'),
    syncedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });

  if (_gdriveFileId) {
    // 업데이트
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ name: GDRIVE_FILE_NAME })], { type: 'application/json' }));
    form.append('file', blob);
    await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${_gdriveFileId}?uploadType=multipart`,
      { method: 'PATCH', headers: { Authorization: 'Bearer ' + _gdriveToken }, body: form }
    );
  } else {
    // 신규 생성
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ name: GDRIVE_FILE_NAME, parents: ['appDataFolder'] })], { type: 'application/json' }));
    form.append('file', blob);
    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      { method: 'POST', headers: { Authorization: 'Bearer ' + _gdriveToken }, body: form }
    );
    const data = await res.json();
    _gdriveFileId = data.id;
  }
}

function mergeByKey(arr, key) {
  const map = new Map();
  arr.forEach(item => {
    if (!map.has(item[key])) map.set(item[key], item);
    else {
      // savedAt 기준 최신 우선
      const existing = map.get(item[key]);
      const eTime = new Date(existing.savedAt || 0).getTime();
      const nTime = new Date(item.savedAt || 0).getTime();
      if (nTime > eTime) map.set(item[key], item);
    }
  });
  return Array.from(map.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// 베팅 저장 시 자동 드라이브 업로드
const _origSetItem = localStorage.setItem.bind(localStorage);
const _gdriveAutoSync = () => {
  if (_gdriveToken && !_gdriveSyncing) {
    setTimeout(() => gdriveUpload().catch(() => {}), 500);
  }
};

// ========== DECISION ENGINE ==========

let _decTeam = 0;

function initDecisionTab() {
  const bankroll = typeof getCurrentBankroll === 'function' ? getCurrentBankroll() : (appSettings.kellySeed || appSettings.startFund || 0);
  const el = document.getElementById('dec-bankroll-val');
  if (el) el.textContent = bankroll > 0 ? '₩' + Math.round(bankroll).toLocaleString() : '미설정';
  const resolved = bets.filter(b => b.result !== 'PENDING');
  const wr = resolved.length > 0 ? (resolved.filter(b => b.result === 'WIN').length / resolved.length * 100).toFixed(1) + '%' : '—';
  const wrEl = document.getElementById('dec-history-winrate');
  if (wrEl) wrEl.textContent = wr;
  const dateEl = document.getElementById('dec-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split('T')[0];
}

function decAutoFill() {
  const match = (document.getElementById('dec-match')?.value || '').toLowerCase();
  const sportEl = document.getElementById('dec-sport');
  if (!sportEl) return;
  if (/현대캐피탈|대한항공|ok금융|한국전력|kb손보|삼성화재/.test(match)) sportEl.value = '배구';
  else if (/두산|롯데|삼성|lg|기아|kt wiz|nc|ssg|한화|키움/.test(match)) sportEl.value = '야구';
  else if (/kcc|현대모비스|서울sk|원주/.test(match)) sportEl.value = '농구';
}

function decSetTeam(n) {
  _decTeam = n;
  const b1 = document.getElementById('dec-team1-btn');
  const b2 = document.getElementById('dec-team2-btn');
  if (b1) { b1.style.borderColor = n===1?'var(--gold)':'var(--border)'; b1.style.background = n===1?'rgba(255,215,0,0.12)':'var(--bg3)'; b1.style.color = n===1?'var(--gold)':'var(--text2)'; }
  if (b2) { b2.style.borderColor = n===2?'var(--gold)':'var(--border)'; b2.style.background = n===2?'rgba(255,215,0,0.12)':'var(--bg3)'; b2.style.color = n===2?'var(--gold)':'var(--text2)'; }
  decCalcFinal();
}

function decUpdateProb() {
  const slider = document.getElementById('dec-myprob');
  const display = document.getElementById('dec-prob-display');
  const direct  = document.getElementById('dec-myprob-direct');
  if (!slider) return;
  const val = parseFloat(slider.value) || 50;
  if (display) display.textContent = val + '%';
  if (direct) direct.value = val;
  decCalcFinal();
}

function decSyncProb() {
  const direct = document.getElementById('dec-myprob-direct');
  const slider = document.getElementById('dec-myprob');
  if (!direct || !slider) return;
  let val = parseFloat(direct.value);
  if (isNaN(val)) return;
  val = Math.max(1, Math.min(99, val));
  slider.value = val;
  const display = document.getElementById('dec-prob-display');
  if (display) display.textContent = val + '%';
  decCalcFinal();
}

function decCalc() {
  const bt1 = parseFloat(document.getElementById('dec-bt1')?.value);
  const bt2 = parseFloat(document.getElementById('dec-bt2')?.value);
  if (!bt1 || !bt2 || bt1 < 1 || bt2 < 1) { document.getElementById('dec-calc-panel').style.display = 'none'; return; }
  document.getElementById('dec-calc-panel').style.display = 'block';

  const overround = (1/bt1 + 1/bt2 - 1) * 100;
  const orEl = document.getElementById('dec-overround');
  if (orEl) { orEl.textContent = overround.toFixed(1)+'%'; orEl.style.color = overround>8?'var(--red)':overround>5?'var(--gold)':'var(--green)'; }

  const op1min=parseFloat(document.getElementById('dec-op1-min')?.value), op1max=parseFloat(document.getElementById('dec-op1-max')?.value);
  const op2min=parseFloat(document.getElementById('dec-op2-min')?.value), op2max=parseFloat(document.getElementById('dec-op2-max')?.value);

  let div1=null, div2=null;
  const dSet = (elId, lblId, val, dir) => {
    const el=document.getElementById(elId), lbl=document.getElementById(lblId);
    if (!el) return;
    el.textContent = (val>0?'+':'')+val.toFixed(1)+'%';
    el.style.color = val<-3?'var(--red)':val>3?'var(--green)':'var(--gold)';
    if (lbl) lbl.textContent = val<-3?'대중 쏠림':val>3?'저평가':'시장 근접';
  };

  if (op1min>=1 && op1max>=1) { div1=((bt1-(op1min+op1max)/2)/(op1min+op1max)*200); dSet('dec-div1','dec-div1-label',div1); }
  else { const e=document.getElementById('dec-div1'); if(e){e.textContent='—';e.style.color='var(--text3)';} }
  if (op2min>=1 && op2max>=1) { div2=((bt2-(op2min+op2max)/2)/(op2min+op2max)*200); dSet('dec-div2','dec-div2-label',div2); }
  else { const e=document.getElementById('dec-div2'); if(e){e.textContent='—';e.style.color='var(--text3)';} }

  // Pinnacle CLV (Franck et al. 2010, Koopman & Lit 2019)
  const pin1=parseFloat(document.getElementById('dec-pin1')?.value), pin2=parseFloat(document.getElementById('dec-pin2')?.value);
  const clvEl=document.getElementById('dec-clv'), clvLEl=document.getElementById('dec-clv-label');
  if (pin1>=1 && pin2>=1 && _decTeam>0) {
    const i1=1/pin1,i2=1/pin2,tot=i1+i2;
    const fairP = _decTeam===1?i1/tot:i2/tot;
    const betOdds = _decTeam===1?bt1:bt2;
    const clv = ((betOdds - 1/fairP)/(1/fairP)*100);
    if (clvEl){clvEl.textContent=(clv>=0?'+':'')+clv.toFixed(1)+'%';clvEl.style.color=clv>=2?'var(--green)':clv>=0?'var(--gold)':'var(--red)';}
    if (clvLEl) clvLEl.textContent = clv>=2?'✅ CLV 양호':clv>=0?'보통':'❌ CLV 음수';
  } else {
    if (clvEl){clvEl.textContent='미입력';clvEl.style.color='var(--text3)';}
    if (clvLEl) clvLEl.textContent='Pinnacle 입력 시 계산';
  }

  // 시장 신호
  const sigEl=document.getElementById('dec-market-signal');
  if (sigEl && (div1!==null||div2!==null)) {
    sigEl.style.display='block';
    let msg='',bg='',border='';
    if (div2!==null&&div2<-4) { msg=`⚠️ <strong>2팀 대중 쏠림 (${div2.toFixed(1)}%)</strong> — 베트맨이 해외 대비 2팀 배당 낮음. 1팀 상대적 저평가. 단, 실제 전력 차이 반영일 수도 있어요.`; bg='rgba(255,107,53,0.08)';border='1px solid rgba(255,107,53,0.3)'; }
    else if (div1!==null&&div1<-4) { msg=`⚠️ <strong>1팀 대중 쏠림 (${div1.toFixed(1)}%)</strong> — 베트맨이 해외 대비 1팀 배당 낮음. 2팀 상대적 저평가.`; bg='rgba(255,107,53,0.08)';border='1px solid rgba(255,107,53,0.3)'; }
    else if (div1!==null&&div1>4) { msg=`📈 <strong>1팀 저평가 감지 (+${div1.toFixed(1)}%)</strong> — 베트맨이 해외 대비 1팀에 높은 배당 부여.`; bg='rgba(0,230,118,0.07)';border='1px solid rgba(0,230,118,0.25)'; }
    else if (div2!==null&&div2>4) { msg=`📈 <strong>2팀 저평가 감지 (+${div2.toFixed(1)}%)</strong> — 베트맨이 해외 대비 2팀에 높은 배당 부여.`; bg='rgba(0,230,118,0.07)';border='1px solid rgba(0,230,118,0.25)'; }
    else { msg=`✅ <strong>시장 합의 상태</strong> — 명확한 괴리 없음. 내 예상 승률이 특별히 높은 경우에만 베팅 가치가 있어요.`; bg='rgba(0,229,255,0.06)';border='1px solid rgba(0,229,255,0.2)'; }
    sigEl.style.cssText=`display:block;background:${bg};border:${border};border-radius:6px;padding:10px 14px;font-size:12px;line-height:1.7;`;
    sigEl.innerHTML=msg;
  }

  const badge=document.getElementById('dec-calc-badge');
  if (badge) {
    const big=(div1!==null&&Math.abs(div1)>4)||(div2!==null&&Math.abs(div2)>4);
    badge.textContent=big?'괴리 감지':'분석 완료';
    badge.style.background=big?'rgba(255,107,53,0.2)':'rgba(0,229,255,0.1)';
    badge.style.color=big?'var(--accent2)':'var(--accent)';
  }
  decCalcFinal();
}

function decCalcFinal() {
  if (!_decTeam) { decShowVerdictPanel(false); return; }
  const bt1=parseFloat(document.getElementById('dec-bt1')?.value);
  const bt2=parseFloat(document.getElementById('dec-bt2')?.value);
  if (!bt1||!bt2) { decShowVerdictPanel(false); return; }

  const selectedOdds = _decTeam===1?bt1:bt2;
  const myProbPct = parseFloat(document.getElementById('dec-myprob')?.value)||50;
  const myProb = myProbPct/100;

  // No-vig 내재확률 (Shin 1993 근사)
  const i1=1/bt1,i2=1/bt2,tot=i1+i2;
  const noVigProb = (_decTeam===1?i1:i2)/tot;

  // EV (Kelly 1956)
  const ev = myProb*(selectedOdds-1)-(1-myProb);
  const evPct = ev*100;
  const breakEven = 1/selectedOdds*100;
  const edge = myProbPct - noVigProb*100;

  const evPanel=document.getElementById('dec-ev-panel');
  if (evPanel) evPanel.style.display='block';
  const evEl=document.getElementById('dec-ev-val');
  if (evEl){evEl.textContent=(evPct>=0?'+':'')+evPct.toFixed(2)+'%';evEl.style.color=evPct>=5?'var(--green)':evPct>=0?'var(--gold)':'var(--red)';}
  const impEl=document.getElementById('dec-implied');
  if (impEl) impEl.textContent=(noVigProb*100).toFixed(1)+'%';
  const edgeEl=document.getElementById('dec-edge');
  if (edgeEl){edgeEl.textContent=(edge>=0?'+':'')+edge.toFixed(1)+'%p';edgeEl.style.color=edge>0?'var(--green)':'var(--red)';}
  const beEl=document.getElementById('dec-breakeven');
  if (beEl) beEl.textContent=breakEven.toFixed(1)+'%';
  const evMsgEl=document.getElementById('dec-ev-msg');
  if (evMsgEl){
    if(evPct>=5){evMsgEl.textContent='✅ EV+ 강함 — 베팅 가치 있음';evMsgEl.style.background='rgba(0,230,118,0.12)';evMsgEl.style.color='var(--green)';}
    else if(evPct>=0){evMsgEl.textContent='🟡 EV+ 약함 — 맥락 확인 후 결정';evMsgEl.style.background='rgba(255,215,0,0.1)';evMsgEl.style.color='var(--gold)';}
    else{evMsgEl.textContent='❌ EV— — 기댓값 음수';evMsgEl.style.background='rgba(255,59,92,0.1)';evMsgEl.style.color='var(--red)';}
  }

  // 하프 켈리 (Thorp 1975, MacLean et al. 2010)
  const b=selectedOdds-1;
  const kFull = b>0?((myProb*b-(1-myProb))/b):-1;
  const kHalf = Math.max(0,kFull/2);
  const bankroll = typeof getCurrentBankroll==='function'?getCurrentBankroll():(appSettings.kellySeed||appSettings.startFund||0);
  const kAmt = bankroll>0?Math.round(bankroll*kHalf/1000)*1000:0;
  const kPctEl=document.getElementById('dec-kelly-pct'),kAmtEl=document.getElementById('dec-kelly-amt'),kMsgEl=document.getElementById('dec-kelly-msg');
  if(kPctEl){kPctEl.textContent=kHalf>0?(kHalf*100).toFixed(1)+'%':'0%';kPctEl.style.color=kHalf>0.1?'var(--green)':kHalf>0?'var(--gold)':'var(--red)';}
  if(kAmtEl){kAmtEl.textContent=bankroll>0&&kAmt>0?'₩'+kAmt.toLocaleString():bankroll<=0?'설정 필요':'베팅 비권장';kAmtEl.style.color=kAmt>0?'var(--gold)':'var(--text3)';}
  if(kMsgEl) kMsgEl.textContent=kFull<=0?'승률이 손익분기 미달':kHalf>0.15?'⚠️ 비율 높음 — 주의':'하프 켈리 기준 (Kelly 1956)';

  // 맥락 보정 (Thaler & Ziemba 1988)
  const crowd=document.getElementById('ctx-crowd')?.checked;
  const sharp=document.getElementById('ctx-sharp')?.checked;
  const lowstake=document.getElementById('ctx-lowstake')?.checked;
  const rotation=document.getElementById('ctx-rotation')?.checked;
  const injury=document.getElementById('ctx-injury')?.checked;
  const uoAlign=document.getElementById('ctx-uo-align')?.checked;
  let ctxScore=0;
  if(crowd)    ctxScore+=2;
  if(sharp)    ctxScore+=2;
  if(uoAlign)  ctxScore+=1;
  if(lowstake) ctxScore-=2;
  if(rotation) ctxScore-=1;
  if(injury)   ctxScore-=1;
  const ctxEl=document.getElementById('dec-context-score');
  if(ctxEl){
    const lbl=ctxScore>=3?`매우 유리 (+${ctxScore})`:ctxScore>=1?`보통 유리 (+${ctxScore})`:ctxScore===0?'중립 (0)':`불리 (${ctxScore})`;
    ctxEl.textContent=lbl; ctxEl.style.color=ctxScore>=2?'var(--green)':ctxScore>=0?'var(--gold)':'var(--red)';
  }

  decRenderVerdict(evPct,ctxScore,kAmt,kHalf,selectedOdds,myProbPct,bankroll,lowstake,rotation);
}

function decRenderVerdict(evPct,ctxScore,kellyAmt,kHalf,odds,myProbPct,bankroll,lowstake,rotation) {
  decShowVerdictPanel(true);
  const clvText=document.getElementById('dec-clv')?.textContent||'';
  const clvVal=clvText==='미입력'?null:parseFloat(clvText.replace('+',''))||null;
  const hasPinnacle=clvVal!==null;

  const resolved=bets.filter(b=>b.result!=='PENDING');
  const sampleWarn=resolved.length<30?`⚠️ 기록 ${resolved.length}건 — 통계적 유의성을 위해 최소 100건 필요`:null;

  const evPositive=evPct>=0, evStrong=evPct>=5;
  const clvPos=hasPinnacle?clvVal>=0:null, clvStrong=hasPinnacle?clvVal>=2:null;
  const ctxPos=ctxScore>=0, ctxStrong=ctxScore>=2;
  const kPos=kHalf>0;
  const uncertain=lowstake||rotation;

  let verdict,icon,color,borderColor,sub,dispKelly=kellyAmt;

  if(!evPositive) {
    if(hasPinnacle&&clvPos){verdict='재검토 필요';icon='🟡';color='var(--gold)';borderColor='rgba(255,215,0,0.5)';sub=`EV 음수이지만 CLV 양수. 내 예상 승률 ${myProbPct}% 재점검 또는 베팅 방향 변경을 검토해보세요.`;}
    else{verdict='패스 권장';icon='🔴';color='var(--red)';borderColor='rgba(255,59,92,0.5)';sub=`EV ${evPct.toFixed(1)}% — 기댓값 마이너스. 내 예상 승률 ${myProbPct}%가 손익분기 승률보다 낮아요.`;}
  } else if(evStrong&&(clvStrong||!hasPinnacle)&&ctxPos&&kPos&&!uncertain){
    verdict='베팅 권장';icon='🟢';color='#00ff88';borderColor='rgba(0,255,136,0.5)';
    sub=`EV ${evPct.toFixed(1)}%${hasPinnacle?` · CLV ${clvVal.toFixed(1)}%`:''} · 맥락 +${ctxScore} — 핵심 조건 충족. 켈리 기준 사이즈 준수 권장.`;
  } else if(evStrong&&uncertain){
    verdict='소액 주의 베팅';icon='🟡';color='var(--gold)';borderColor='rgba(255,215,0,0.5)';
    sub=`EV 강함(${evPct.toFixed(1)}%)이지만 경기 불확실성 존재. 켈리 권장액 절반 이하로 조정 권장.`;
    dispKelly=Math.round(kellyAmt*0.5/1000)*1000;
  } else if(evPositive&&!evStrong&&ctxStrong){
    verdict='조건부 베팅';icon='🔵';color='var(--accent)';borderColor='rgba(0,229,255,0.5)';
    sub=`EV 약함(+${evPct.toFixed(1)}%)이지만 맥락 보정 강함. Pinnacle CLV 확인 후 최종 결정 권장.`;
  } else if(evPositive&&!evStrong&&!ctxPos){
    verdict='패스 추천';icon='⚪';color='var(--text2)';borderColor='rgba(136,146,164,0.4)';
    sub=`EV 양수이나 엣지 작고(+${evPct.toFixed(1)}%) 맥락 불리. 오버라운드에 잠식될 수 있어요.`;
  } else {
    verdict='신중 검토';icon='🟡';color='var(--gold)';borderColor='rgba(255,215,0,0.5)';
    sub=`EV +${evPct.toFixed(1)}% · 맥락 보통. Pinnacle CLV 확인 또는 예상 승률 근거 재점검 후 결정하세요.`;
  }

  const vBox=document.getElementById('dec-verdict-box');
  const vIcon=document.getElementById('dec-verdict-icon');
  const vTitle=document.getElementById('dec-verdict-title');
  const vSub=document.getElementById('dec-verdict-sub');
  const vKelly=document.getElementById('dec-verdict-kelly-rec');
  if(vBox){vBox.style.borderColor=borderColor;vBox.style.background=color+'0a';}
  if(vIcon) vIcon.textContent=icon;
  if(vTitle){vTitle.textContent=verdict;vTitle.style.color=color;}
  if(vSub) vSub.textContent=sub;
  if(vKelly){
    const showKelly=dispKelly>0&&kHalf>0&&!['패스 권장','패스 추천'].includes(verdict);
    vKelly.style.display=showKelly?'inline-block':'none';
    if(showKelly){vKelly.textContent=`권장 베팅액: ₩${dispKelly.toLocaleString()} (하프 켈리 ${(kHalf*100).toFixed(1)}%)`;vKelly.style.color=color;}
  }

  const detailEl=document.getElementById('dec-verdict-detail');
  if(detailEl){
    const lines=[
      `📊 <strong>EV:</strong> ${evPct>=0?'+':''}${evPct.toFixed(2)}% — 내 승률 ${myProbPct}% vs 손익분기 ${(1/odds*100).toFixed(1)}%`,
      hasPinnacle?`🎯 <strong>CLV (Pinnacle 마감 기준):</strong> ${clvVal!==null?(clvVal>=0?'+':'')+clvVal.toFixed(1)+'%':'—'} — Franck et al.(2010): CLV 양수 유지가 장기 수익 핵심 지표`:`🎯 <strong>CLV:</strong> Pinnacle 마감 배당 입력 시 계산 (Koopman & Lit 2019)`,
      `🔢 <strong>하프 켈리:</strong> ${(kHalf*100).toFixed(1)}% — Kelly(1956) 기반. 뱅크롤 ${bankroll>0?'₩'+Math.round(bankroll).toLocaleString():'미설정'} 연동`,
      `🌐 <strong>맥락 보정:</strong> ${ctxScore>=0?'+':''}${ctxScore}점 — 대중 역발상·샤프 동조·불확실성 반영 (Thaler & Ziemba 1988)`,
      sampleWarn||`📈 <strong>샘플 유의성:</strong> 현재 기록 ${resolved.length}건 (Kahneman & Tversky 1979: 단기 기록 과신 주의)`,
      `⚠️ <strong>한계:</strong> 수동 입력 기반 분석. 실시간 부상/라인업 정보는 직접 확인 필수.`
    ];
    detailEl.innerHTML=lines.map(l=>`<div style="padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);">${l}</div>`).join('');
  }
}

function decShowVerdictPanel(show){
  const p=document.getElementById('dec-verdict-panel');
  if(p) p.style.display=show?'block':'none';
}

function decSaveToRecord(){
  const match=document.getElementById('dec-match')?.value?.trim();
  if(!match){alert('경기명을 입력해주세요.');return;}
  if(!_decTeam){alert('1팀 / 2팀 베팅을 선택해주세요.');return;}
  const bt1=parseFloat(document.getElementById('dec-bt1')?.value);
  const bt2=parseFloat(document.getElementById('dec-bt2')?.value);
  const selectedOdds=_decTeam===1?bt1:bt2;
  if(!selectedOdds){alert('배당을 입력해주세요.');return;}
  const myProbPct=parseFloat(document.getElementById('dec-myprob')?.value)||null;
  const p=(myProbPct||50)/100;
  const ev=myProbPct?p*(selectedOdds-1)-(1-p):null;
  const record={
    id:Date.now(),
    date:document.getElementById('dec-date')?.value||new Date().toISOString().split('T')[0],
    game:match,
    sport:document.getElementById('dec-sport')?.value||'',
    type:document.getElementById('dec-type')?.value||'승/패',
    mode:'single',
    betmanOdds:selectedOdds,
    amount:0,result:'PENDING',
    isValue:ev!==null&&ev>0,
    myProb:myProbPct,
    ev:ev,
    memo:[
      document.getElementById('dec-memo')?.value?.trim()||'',
      document.getElementById('dec-form1')?.value?.trim()?`1팀:${document.getElementById('dec-form1').value.trim()}`:'',
      document.getElementById('dec-form2')?.value?.trim()?`2팀:${document.getElementById('dec-form2').value.trim()}`:'',
      `[DECISION] BT1:${bt1||'-'} BT2:${bt2||'-'} 선택:${_decTeam}팀`
    ].filter(Boolean).join(' | '),
    profit:0,savedAt:new Date().toISOString(),emotion:'냉정',violations:[],
    folderMemos:[],folderOdds:[],folderProbs:[],folderSports:[],folderTypes:[]
  };
  const nextBets = [...getBets(), record];
  saveBets(nextBets);
  updateAll();
  alert(`✅ "${match}" 저장 완료!\n\n베팅 기록 탭에서 금액을 입력하고\n경기 후 결과를 업데이트해주세요.`);
  const rt=document.querySelector('nav .tab[onclick*="record"]');
  if(rt) switchTab('record',rt);
}

function decReset(){
  ['dec-match','dec-bt1','dec-bt2','dec-op1-min','dec-op1-max','dec-op2-min','dec-op2-max','dec-pin1','dec-pin2','dec-form1','dec-form2','dec-memo'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  const s=document.getElementById('dec-myprob');if(s)s.value=50;
  const d=document.getElementById('dec-myprob-direct');if(d)d.value='';
  const pd=document.getElementById('dec-prob-display');if(pd)pd.textContent='50%';
  ['ctx-crowd','ctx-sharp','ctx-lowstake','ctx-rotation','ctx-injury','ctx-uo-align'].forEach(id=>{const e=document.getElementById(id);if(e)e.checked=false;});
  _decTeam=0; decSetTeam(0);
  const cp=document.getElementById('dec-calc-panel');if(cp)cp.style.display='none';
  const ep=document.getElementById('dec-ev-panel');if(ep)ep.style.display='none';
  decShowVerdictPanel(false);
}

// ========== 일지 목록 페이지 ==========
let _dlSelectedDate = null;

function renderDiaryListPage() {
  const listEl = document.getElementById('dl-list');
  if (!listEl) return;
  const diaries = JSON.parse(localStorage.getItem('edge_diaries') || '{}');
  const entries = Object.entries(diaries).sort((a,b) => b[0].localeCompare(a[0]));

  const dlDate = document.getElementById('dl-date');
  if (dlDate && !dlDate.value) {
    const now = new Date(); const kst = new Date(now.getTime() + 9*60*60*1000);
    dlDate.value = kst.toISOString().split('T')[0];
  }

  if (entries.length === 0) {
    listEl.innerHTML = '<div style="font-size:13px;color:var(--text3);text-align:center;padding:32px 0;">아직 작성된 일지가 없어요</div>';
    return;
  }

  listEl.innerHTML = entries.map(([date, text]) => {
    const preview = text.replace(/\n/g,' ').slice(0, 80) + (text.length > 80 ? '...' : '');
    const isSel = date === _dlSelectedDate;
    return `<div onclick="diaryListSelect('${date}')"
      style="padding:12px 14px;background:${isSel?'rgba(0,229,255,0.06)':'var(--bg3)'};border:1px solid ${isSel?'rgba(0,229,255,0.3)':'var(--border)'};border-radius:8px;cursor:pointer;transition:all 0.15s;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-size:13px;font-weight:700;color:var(--accent);">${date}</span>
        <span style="font-size:10px;color:var(--text3);">${text.length}자</span>
      </div>
      <div style="font-size:12px;color:var(--text3);line-height:1.6;">${preview}</div>
    </div>`;
  }).join('');
}

function diaryListSelect(date) {
  _dlSelectedDate = date;
  const diaries = JSON.parse(localStorage.getItem('edge_diaries') || '{}');
  const detail = document.getElementById('dl-detail');
  const dateEl = document.getElementById('dl-detail-date');
  const textEl = document.getElementById('dl-detail-text');
  if (detail) detail.style.display = 'block';
  if (dateEl) dateEl.textContent = date;
  if (textEl) textEl.textContent = diaries[date] || '';
  renderDiaryListPage();
  setTimeout(() => detail?.scrollIntoView({ behavior:'smooth', block:'start' }), 50);
}

function diaryListGoWrite() {
  if (window.innerWidth <= 600) {
    switchTabMobile('journal');
    setTimeout(() => switchJournalTab('diary'), 100);
  } else {
    switchTab('journal', document.querySelector('.tab.active'));
    setTimeout(() => switchJournalTab('diary'), 100);
  }
}

function diaryListEdit() {
  if (!_dlSelectedDate) return;
  loadDiaryEntry(_dlSelectedDate);
  diaryListGoWrite();
}

function diaryListDelete() {
  if (!_dlSelectedDate) return;
  if (!confirm(`${_dlSelectedDate} 일지를 삭제할까요?`)) return;
  const diaries = JSON.parse(localStorage.getItem('edge_diaries') || '{}');
  delete diaries[_dlSelectedDate];
  localStorage.setItem('edge_diaries', JSON.stringify(diaries));
  _dlSelectedDate = null;
  const detail = document.getElementById('dl-detail');
  if (detail) detail.style.display = 'none';
  renderDiaryListPage();
  renderDiaryList();
}

// ========== INIT ==========
function updateKellyGradeBanner() {
  // 예측력 등급 기반 켈리 배율 배너 업데이트
  const el = document.getElementById('kelly-grade-banner');
  if (!el) return;
  const _SS = window._SS;
  if (!_SS || !_SS.grade) return;
  const grade = _SS.grade;
  const mult = grade.mult || 1;
  const color = mult >= 1 ? 'var(--green)' : mult >= 0.5 ? 'var(--gold)' : 'var(--red)';
  el.style.display = 'block';
  el.innerHTML = `예측력 등급 <strong style="color:${color};">${grade.letter || '—'}</strong> — 켈리 배율 <strong style="color:${color};">×${mult.toFixed(2)}</strong>`;
}
updateWeeklySeedStatus();
updateDashboardRoundStats();
setTodayKST();
updateFundCards();
showTagCat('전력');

// 로드맵 렌더링
const SIM_ROADMAP = [
  { round:1, balance:'1만원',   save:'0',      bet:'1만원',                          win:'2만원',    lose:'0',       threshold:10000   },
  { round:2, balance:'2만원',   save:'0',      bet:'2만원',                          win:'4만원',    lose:'0',       threshold:20000   },
  { round:3, balance:'4만원',   save:'1만원',  bet:'3만원',                          win:'7만원',    lose:'1만원',   threshold:40000   },
  { round:4, balance:'7만원',   save:'2만원',  bet:'5만원',                          win:'12만원',   lose:'2만원',   threshold:70000   },
  { round:5, balance:'12만원',  save:'3만원',  bet:'9만원',                          win:'21만원',   lose:'3만원',   threshold:120000  },
  { round:6, balance:'21만원',  save:'6만원',  bet:'5만(×3)+10만(×2)',               win:'41만원',   lose:'6만원',   threshold:210000  },
  { round:7, balance:'41만원',  save:'11만원', bet:'10만(×3)+20만(×2)',              win:'81만원',   lose:'11만원',  threshold:410000  },
  { round:8, balance:'81만원',  save:'41만원', bet:'10만(×3)+30만(×2)',              win:'131만원',  lose:'41만원',  threshold:810000  },
  { round:9, balance:'131만원', save:'70만원', bet:'안전30만+도전20만+모험11만',      win:'~236만원', lose:'70만원',  threshold:1310000 },
  { round:10,balance:'236만원', save:'136만원',bet:'안전50만+도전35만+모험15만',      win:'~398만원', lose:'136만원', threshold:2360000 },
];

function simRenderRoadmap() {
  const tbody = document.getElementById('sim-roadmap-body');
  if(!tbody) return;
  const bal = simState ? simState.balance : 10000;
  let curIdx = 0;
  SIM_ROADMAP.forEach((r,i) => { if(bal >= r.threshold) curIdx = i; });

  tbody.innerHTML = SIM_ROADMAP.map((r,i) => {
    const isCurrent = i === curIdx;
    const isDone    = i < curIdx;
    const bg        = isCurrent ? 'background:rgba(0,229,255,0.06);' : '';
    const op        = isDone    ? 'opacity:0.35;' : '';
    const bl        = isCurrent ? 'border-left:2px solid var(--accent);' : 'border-left:2px solid transparent;';
    const cursor    = isDone ? '' : 'cursor:pointer;';
    const hover     = isDone ? '' : `onmouseover="this.style.background='rgba(0,229,255,0.04)'" onmouseout="this.style.background='${isCurrent?'rgba(0,229,255,0.06)':'transparent'}'"`;
    return `<tr style="${bg}${op}${bl}${cursor}" onclick="simSelectRound(${i})" ${hover}>
      <td style="padding:5px 6px;text-align:left;color:${isCurrent?'var(--accent)':'var(--text3)'};font-weight:${isCurrent?'700':'400'};">
        ${r.round}회${isCurrent?' ◀':isDone?' ✓':''}
      </td>
      <td style="padding:5px 6px;text-align:right;color:${isCurrent?'var(--text)':'var(--text2)'};">${r.balance}</td>
      <td style="padding:5px 6px;text-align:right;color:${r.save==='0'?'var(--text3)':'var(--gold)'};">${r.save}</td>
      <td style="padding:5px 6px;text-align:center;color:var(--text2);font-size:9px;">${r.bet}</td>
      <td style="padding:5px 6px;text-align:right;color:var(--green);">${r.win}</td>
      <td style="padding:5px 6px;text-align:right;color:${r.lose==='0'?'var(--text3)':'var(--red)'};">${r.lose}</td>
    </tr>`;
  }).join('');
}
// DOM 준비 후 실행 (즉시 실행 시 simState 미복원 버그 방지)
if(document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', simRenderRoadmap);
} else {
  simRenderRoadmap();
}

function simSelectRound(idx) {
  const r = SIM_ROADMAP[idx];
  if(!r) return;
  // 이미 지나온 회차는 선택 불가
  const bal = simState ? simState.balance : 10000;
  let curIdx = 0;
  SIM_ROADMAP.forEach((x,i) => { if(bal >= x.threshold) curIdx = i; });
  if(idx < curIdx) return;

  const confirmMsg = `${r.round}회차(${r.balance})부터 시작할까요?
현재 기록은 초기화돼요.`;
  // 커스텀 모달 대신 심플 confirm (EDGE FINDER 환경)
  if(!window.confirm(confirmMsg)) return;

  simSnaps = [];
  simState = { balance: r.threshold, round: r.round, history: [], goalReached: false, goalHistory: [] };
  simResetOdds();
  simRender();
  simOnInput();
  simRenderRoadmap();
  try { localStorage.setItem('edge_sim_state', JSON.stringify(simState)); } catch(e) {}
}

// simRender 후 로드맵 자동 갱신 (DOMContentLoaded 이후에 패치 적용)
function _patchSimRender() {
  const _origSimRender = typeof simRender === 'function' ? simRender : null;
  if(_origSimRender && !_origSimRender._roadmapPatched) {
    simRender = function() { _origSimRender(); simRenderRoadmap(); };
    simRender._roadmapPatched = true;
  }
}
if(document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _patchSimRender);
} else {
  _patchSimRender();
}
