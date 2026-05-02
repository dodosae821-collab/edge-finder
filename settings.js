// ========== SETTINGS ==========
let appSettings = JSON.parse(localStorage.getItem('edge_settings') || '{}');

function saveSettings() {
  const startFund   = parseFloat(document.getElementById('settings-start-fund').value)  || 0;
  const targetFund  = parseFloat(document.getElementById('settings-target-fund').value) || 0;
  const betRatio    = parseFloat(document.getElementById('settings-bet-ratio').value)   || 0;
  const dailyLimit  = parseFloat(document.getElementById('settings-daily-limit').value) || 0;
  const weeklyLimit = parseFloat(document.getElementById('settings-weekly-limit').value)|| 0;

  // kellySeed = 현재 뱅크롤 × 베팅 비율 자동 계산 (1/12 시드 = 베팅 시드)
  const currentBankroll = startFund + bets.filter(b => b.result === 'WIN' || b.result === 'LOSE').reduce((s, b) => s + (b.profit || 0), 0);
  const kellySeed = betRatio > 0 ? Math.round(currentBankroll * betRatio / 100) : 0;

  const maxBetPct = parseFloat(document.getElementById('settings-max-bet-pct')?.value) || 5;
  const kellyGradeAdj = document.getElementById('kelly-grade-toggle-ui')?.dataset.active === 'true';
  appSettings = { startFund, targetFund, kellySeed, betRatio, dailyLimit, weeklyLimit,
    maxBetPct, kellyGradeAdj,
    roundType: appSettings.roundType || 'manual',
    roundNbet: parseInt(document.getElementById('settings-round-nbet')?.value) || 12
  };
  localStorage.setItem('edge_settings', JSON.stringify(appSettings));
  loadSettingsDisplay();
  checkLossWarning();
  updateFundCards();
  calcKelly();
  checkLossWarning();
  const msg = document.getElementById('settings-saved');
  if (msg) { msg.style.display = 'block'; setTimeout(() => msg.style.display = 'none', 2000); }
}

function loadSettingsDisplay() {
  const { startFund = 0, targetFund = 0, kellySeed = 0, betRatio = 0 } = appSettings;
  const diff = targetFund - startFund;

  // 현재 뱅크롤 계산
  const currentBankroll = getCurrentBankroll();
  const betSeed = getBetSeed();

  // 설정 확인 카드
  const _ds = document.getElementById('settings-display-start');      if (_ds) _ds.textContent  = startFund > 0 ? '₩' + startFund.toLocaleString() : '미설정';
  const _db = document.getElementById('settings-display-bankroll');   if (_db) _db.textContent  = currentBankroll > 0 ? '₩' + Math.round(currentBankroll).toLocaleString() : '미설정';
  const _dbs = document.getElementById('settings-display-bet-seed');  if (_dbs) _dbs.textContent = betSeed > 0 ? '₩' + Math.round(betSeed).toLocaleString() : '미설정';
  const _drb = document.getElementById('settings-display-ratio-badge'); if (_drb) _drb.textContent = betRatio > 0 ? `(${betRatio}%)` : '';
  const _dt = document.getElementById('settings-display-target');     if (_dt) _dt.textContent  = targetFund > 0 ? '₩' + targetFund.toLocaleString() : '미설정';
  const _dd = document.getElementById('settings-display-diff');       if (_dd) _dd.textContent  = diff > 0 ? '+₩' + diff.toLocaleString() : '미설정';
  const _dsd = document.getElementById('settings-display-seed'); if (_dsd) _dsd.textContent = kellySeed > 0 ? '₩' + kellySeed.toLocaleString() : '미설정';
  // 입력칸 복원
  const _sf = document.getElementById('settings-start-fund');   if (_sf && startFund > 0) _sf.value = startFund;
  const _tf = document.getElementById('settings-target-fund');  if (_tf && targetFund > 0) _tf.value = targetFund;
  const _br = document.getElementById('settings-bet-ratio');    if (_br && betRatio > 0) _br.value = betRatio;

  // 손실 한도 표시
  const { dailyLimit = 0, weeklyLimit = 0 } = appSettings;
  const _ddl = document.getElementById('settings-display-daily');   if (_ddl) _ddl.textContent  = dailyLimit  > 0 ? dailyLimit + '%' : '미설정';
  const _dwl = document.getElementById('settings-display-weekly');  if (_dwl) _dwl.textContent  = weeklyLimit > 0 ? weeklyLimit + '%' : '미설정';
  const _dl = document.getElementById('settings-daily-limit');   if (_dl && dailyLimit > 0) _dl.value = dailyLimit;
  const _wl = document.getElementById('settings-weekly-limit');  if (_wl && weeklyLimit > 0) _wl.value = weeklyLimit;

  // 예측력 연동 설정 복원
  const { maxBetPct: _mbpVal = 5, kellyGradeAdj: _kga = false } = appSettings;
  const _mbp = document.getElementById('settings-max-bet-pct');
  if (_mbp) _mbp.value = _mbpVal;
  const _tui = document.getElementById('kelly-grade-toggle-ui');
  const _tdt = document.getElementById('kelly-grade-toggle-dot');
  if (_tui) { _tui.dataset.active = _kga?'true':'false'; _tui.style.background = _kga?'var(--accent)':'var(--bg2)'; _tui.style.borderColor = _kga?'var(--accent)':'var(--border)'; }
  if (_tdt) { _tdt.style.left = _kga?'23px':'3px'; _tdt.style.background = _kga?'#000':'#888'; }

  // 목표 추적 탭 뱅크롤 표시 업데이트
  updateGoalBankrollDisplay();
  // 회차 타입 버튼 상태 렌더
  renderRoundTypeButtons();
  // N건 입력 복원
  const nbetEl = document.getElementById('settings-round-nbet');
  if (nbetEl && appSettings.roundNbet) nbetEl.value = appSettings.roundNbet;

  // 고급 기능 토글 상태 복원
  const s = JSON.parse(localStorage.getItem('edge_settings') || '{}');
  const tjEl = document.getElementById('toggle-journal');
  const teEl = document.getElementById('toggle-ev');
  if (tjEl) tjEl.checked = !!s.showJournal;
  if (teEl) teEl.checked = !!s.showEVCalc;
  updatePCNavFeatures(!!s.showJournal, !!s.showEVCalc);
}

function getBetSeed() {
  // 고정 시드 있으면 우선 사용
  const locked = getLockedSeed();
  if (locked && locked.seed > 0) return locked.seed;
  // 없으면 현재 뱅크롤 × 비율
  const { betRatio = 0, kellySeed = 0 } = appSettings;
  const bankroll = getCurrentBankroll();
  if (betRatio > 0 && bankroll > 0) return bankroll * betRatio / 100;
  return kellySeed;
}
function getKSTDateStr() {
  // UTC+9 한국 시간 기준 오늘 날짜
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

function setTodayKST() {
  const el = document.getElementById('round-seed-date');
  if (el) el.value = getKSTDateStr();
}

function setRoundType(type) {
  appSettings.roundType = type;
  localStorage.setItem('edge_settings', JSON.stringify(appSettings));
  renderRoundTypeButtons();
  checkAutoRoundReset();
}

function renderRoundTypeButtons() {
  const type = appSettings.roundType || 'manual';
  ['manual','monthly','nbet'].forEach(t => {
    const btn = document.getElementById('round-type-' + t);
    if (!btn) return;
    const active = t === type;
    btn.style.borderColor = active ? 'var(--accent)' : 'var(--border)';
    btn.style.background  = active ? 'rgba(0,229,255,0.12)' : 'var(--bg3)';
    btn.style.color       = active ? 'var(--accent)' : 'var(--text2)';
  });
  const nbetWrap = document.getElementById('round-nbet-wrap');
  if (nbetWrap) nbetWrap.style.display = type === 'nbet' ? 'flex' : 'none';
}

function checkAutoRoundReset() {
  const type = appSettings.roundType || 'manual';
  if (type === 'manual') return;

  const locked = getLockedSeed();
  const today  = new Date().toISOString().split('T')[0];

  if (type === 'monthly') {
    // 이번 달 1일
    const firstOfMonth = today.slice(0, 7) + '-01';
    if (!locked || locked.date < firstOfMonth) {
      // 자동 고정
      const el = document.getElementById('settings-bet-ratio');
      if (el) lockWeeklySeed();
    }
  } else if (type === 'nbet') {
    const n = appSettings.roundNbet || 12;
    if (!locked) return;
    // 고정 이후 결산된 베팅 수
    const resolved = bets.filter(b =>
      (b.result === 'WIN' || b.result === 'LOSE') && b.date >= locked.date
    );
    if (resolved.length >= n) {
      const banner = document.getElementById('round-notify-banner');
      const title  = document.getElementById('round-notify-title');
      const desc   = document.getElementById('round-notify-desc');
      if (banner && title && desc) {
        banner.style.display = 'flex';
        title.textContent = `${n}건 완료 — 새 회차 시드 고정 필요`;
        desc.textContent  = `${n}건 결산 완료. 자금/목표 탭에서 새 회차 시드를 고정해주세요.`;
      }
    }
  }
}

function lockWeeklySeed() {
  const seed = getBetSeed() || getCurrentBankroll();
  if (!seed) {
    alert('시작 자금과 베팅 자금 비율을 먼저 설정하세요.');
    return;
  }
  const dateInput = document.getElementById('round-seed-date');
  const dateStr = (dateInput && dateInput.value) ? dateInput.value : getKSTDateStr();

  // 직전 회차 자동 확정 후 이력 저장
  const prev = getLockedSeed();
  if (prev && prev.date && prev.date !== dateStr) {
    const prevLockDate = new Date(prev.date); prevLockDate.setHours(0,0,0,0);
    const newLockDate  = new Date(dateStr);   newLockDate.setHours(0,0,0,0);
    const roundBets = bets.filter(function(b) {
      if (!b.date) return false;
      const d = new Date(b.date);
      return d >= prevLockDate && d < newLockDate && b.result !== 'PENDING';
    });
    const wins     = roundBets.filter(function(b) { return b.result === 'WIN'; }).length;
    const profit   = roundBets.reduce(function(s, b) { return s + (b.profit || 0); }, 0);
    const invested = roundBets.reduce(function(s, b) { return s + (b.amount || 0); }, 0);
    const roi      = invested > 0 ? profit / invested * 100 : 0;
    const wr       = roundBets.length > 0 ? wins / roundBets.length * 100 : 0;
    const history  = getRoundHistory();
    history.push({
      round:     history.length + 1,
      startDate: prev.date,
      endDate:   dateStr,
      seed:      prev.seed,
      rawSeed:   prev.rawSeed || prev.seed,
      bets:      roundBets.length,
      wins:      wins,
      wr:        parseFloat(wr.toFixed(1)),
      profit:    Math.round(profit),
      invested:  Math.round(invested),
      roi:       parseFloat(roi.toFixed(1))
    });
    saveRoundHistory(history);
    // 회차 자동 회고 생성
    const lastRound = history[history.length - 1];
    if (lastRound) saveRoundReview(lastRound);
  }

  // 10만원 단위 올림
  const rawSeed = Math.round(seed / 100) * 100;
  const locked = { seed: rawSeed, rawSeed: rawSeed, wasRounded: false, date: dateStr, lockedAt: new Date().toISOString() };
  localStorage.setItem('edge_round_seed', JSON.stringify(locked));
  sessionStorage.removeItem('round_seed_modal_shown');

  const msg = document.getElementById('round-seed-saved');
  if (msg) {
    msg.style.display = 'block';
    msg.innerHTML = wasRounded
      ? '&#9989; 고정되었습니다 <span style="color:var(--text3);font-size:11px;">(&#8361;' + rawSeed.toLocaleString() + ' &rarr; 10만원 올림 적용)</span>'
      : '&#9989; 고정되었습니다';
    setTimeout(function() { msg.style.display = 'none'; msg.innerHTML = '&#9989; 고정되었습니다'; }, 3000);
  }
  updateWeeklySeedStatus();
  updateDashboardRoundStats();
  updateRoundHistory();
}

function unlockWeeklySeed() {
  if (!confirm('고정을 해제하면 켈리 계산이 실시간 뱅크롤 기준으로 돌아갑니다. 해제하시겠어요?')) return;
  localStorage.removeItem('edge_round_seed');
  updateWeeklySeedStatus();
}

// ============================================================
// ▶ 회차(시드) 사이클 — UI 브리지
//   state.js의 lockNewRound / applyRoundBet / closeActiveRound를
//   UI 레이어에서 호출하는 래퍼.
// ============================================================

/** 설정 탭 [회차 시드 고정] 버튼 핸들러 */
function handleLockNewRound() {
  const input = document.getElementById('round-new-seed-input');
  const rawVal = input ? input.value.replace(/,/g, '') : '';
  const seed = parseInt(rawVal, 10);

  // lockNewRound는 state.js에 정의됨
  const ok = (typeof lockNewRound === 'function') && lockNewRound(seed);
  if (!ok) return;

  // 기존 edge_round_seed도 동기화 (하위 호환)
  const rawSeed = Math.round(seed / 100) * 100;
  const dateStr = getKSTDateStr();
  localStorage.setItem('edge_round_seed', JSON.stringify({
    seed: rawSeed, rawSeed, wasRounded: false,
    date: dateStr, lockedAt: new Date().toISOString()
  }));

  if (input) input.value = '';
  const msg = document.getElementById('round-lock-saved-msg');
  if (msg) {
    msg.style.display = 'block';
    msg.textContent   = '✅ 회차가 시작되었습니다 — ₩' + rawSeed.toLocaleString();
    setTimeout(() => { msg.style.display = 'none'; }, 3000);
  }
  updateWeeklySeedStatus();
  if (typeof updateDashboardRoundStats === 'function') updateDashboardRoundStats();
}

/** 베팅 저장 시 호출 — roundId 주입 + remaining 차감
 *  bet_record.js 또는 addBet에서 newBet 생성 직후 호출. */
function attachRoundToBet(betObj) {
  const round = (typeof getActiveRound === 'function') ? getActiveRound() : null;
  if (!round) return betObj;                    // 회차 없으면 그대로
  betObj.roundId = round.id;
  return betObj;
}

/** 베팅 결과 확정(WIN/LOSE) 시 remaining 차감 진입점 */
function onBetAmountCommitted(amount) {
  if (typeof applyRoundBet === 'function') applyRoundBet(amount);
}

/** 베팅 취소/삭제 시 remaining 환원 */
function onBetAmountRefunded(amount) {
  if (typeof refundRoundBet === 'function') refundRoundBet(amount);
}

function getLockedSeed() {
  const raw = localStorage.getItem('edge_round_seed');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function updateWeeklySeedStatus() {
  const locked = getLockedSeed();
  const statusEl = document.getElementById('round-seed-status');
  if (!statusEl) return;

  if (!locked) {
    statusEl.style.display = 'none';
    return;
  }

  statusEl.style.display = 'block';

  // 고정일 표시
  const dateEl = document.getElementById('round-seed-locked-date');
  if (dateEl) {
    const d = new Date(locked.date);
    const days = ['일','월','화','수','목','금','토'];
    dateEl.textContent = locked.date + ' (' + days[d.getDay()] + ')';
  }

  // 고정 시드
  const valEl = document.getElementById('round-seed-locked-val');
  if (valEl) valEl.textContent = '₩' + locked.seed.toLocaleString();

  // 올림 적용 안내
  const roundedNoteEl = document.getElementById('round-seed-rounded-note');
  if (roundedNoteEl) {
    if (locked.wasRounded && locked.rawSeed) {
      roundedNoteEl.style.display = 'block';
      roundedNoteEl.textContent = '↑ 실제 ₩' + locked.rawSeed.toLocaleString() + ' → 10만원 올림';
    } else {
      roundedNoteEl.style.display = 'none';
    }
  }

  // 고정 시각 이후 베팅만 집계 (같은 날 재고정 시 이전 베팅 제외)
  const lockFrom = locked.lockedAt ? new Date(locked.lockedAt) : (() => { const d = new Date(locked.date); d.setHours(0,0,0,0); return d; })();
  const useTimestamp = !!locked.lockedAt; // lockedAt 있으면 타임스탬프, 없으면 날짜 기준
  const weekBets = bets.filter(b => {
    if (!b.date || !b.result || b.result === 'PENDING') return false;
    if (useTimestamp) {
      if (!b.savedAt) return false; // 타임스탬프 모드: savedAt 없으면 제외
      return new Date(b.savedAt) >= lockFrom;
    } else {
      return new Date(b.date) >= lockFrom; // 날짜 모드: 기존 방식
    }
  });
  const weekPnl = weekBets.reduce((s, b) => s + (b.profit || 0), 0);

  const usedEl = document.getElementById('round-seed-used');
  if (usedEl) {
    usedEl.textContent = (weekPnl >= 0 ? '+' : '') + '₩' + Math.round(weekPnl).toLocaleString();
    usedEl.style.color = weekPnl >= 0 ? 'var(--green)' : 'var(--red)';
  }

  // 소진율 (손실 기준)
  const loss = Math.max(0, -weekPnl);
  const pct = locked.seed > 0 ? Math.min(100, Math.round(loss / locked.seed * 100)) : 0;
  const pctEl = document.getElementById('round-seed-pct');
  const barEl = document.getElementById('round-seed-bar');
  if (pctEl) pctEl.textContent = pct + '%';
  if (barEl) {
    barEl.style.width = pct + '%';
    barEl.style.background = pct >= 100 ? 'var(--red)' : pct >= 70 ? '#ff9800' : 'var(--green)';
  }

  // 경고
  const warnEl = document.getElementById('round-seed-warning');
  if (warnEl) {
    if (pct >= 100) {
      warnEl.style.display = 'block';
      warnEl.style.background = 'rgba(255,59,92,0.15)';
      warnEl.style.color = 'var(--red)';
      warnEl.style.border = '1px solid rgba(255,59,92,0.4)';
      warnEl.textContent = '🛑 회차 시드 소진 — 베팅 중단 권장';
    } else if (pct >= 70) {
      warnEl.style.display = 'block';
      warnEl.style.background = 'rgba(255,152,0,0.12)';
      warnEl.style.color = '#ff9800';
      warnEl.style.border = '1px solid rgba(255,152,0,0.3)';
      warnEl.textContent = `⚠️ 시드 ${pct}% 소진 — 잔여 ₩${Math.round(locked.seed - loss).toLocaleString()}`;
    } else {
      warnEl.style.display = 'none';
    }
  }
}

function updateGoalBankrollDisplay() {
  const betSeed = getBetSeed();
  const { betRatio = 0, targetFund = 0 } = appSettings;
  const bankroll = getCurrentBankroll();

  // 베팅 시드 표시
  const el = document.getElementById('goal-bankroll-display');
  const hint = document.getElementById('goal-bankroll-hint');
  const gs = document.getElementById('goal-start');
  if (el) el.textContent = betSeed > 0 ? '₩' + Math.round(betSeed).toLocaleString() : '—';
  if (hint) {
    if (betRatio > 0 && bankroll > 0) {
      hint.textContent = `뱅크롤 ₩${Math.round(bankroll).toLocaleString()} × ${betRatio}%`;
      hint.style.color = 'var(--accent)';
    } else {
      hint.textContent = '설정 탭에서 베팅 자금 비율 입력 시 자동 계산';
      hint.style.color = 'var(--text3)';
    }
  }
  if (gs) gs.value = betSeed > 0 ? Math.round(betSeed) : '';

  // 목표 금액 연동
  const td = document.getElementById('goal-target-display');
  const th = document.getElementById('goal-target-hint');
  const gt = document.getElementById('goal-target');
  if (td) td.textContent = targetFund > 0 ? '₩' + targetFund.toLocaleString() : '—';
  if (th) {
    th.textContent = targetFund > 0 ? '설정 탭 목표 자금 연동' : '설정 탭에서 목표 자금 입력';
    th.style.color = targetFund > 0 ? 'var(--gold)' : 'var(--text3)';
  }
  if (gt) gt.value = targetFund > 0 ? targetFund : '';
}

function previewBetSeed() {
  const ratio = parseFloat(document.getElementById('settings-bet-ratio')?.value) || 0;
  const preview = document.getElementById('bet-seed-preview');
  const previewVal = document.getElementById('bet-seed-preview-val');
  const bankroll = getCurrentBankroll();
  if (ratio > 0 && bankroll > 0) {
    const seed = Math.round(bankroll * ratio / 100);
    if (preview) preview.style.display = 'block';
    if (previewVal) previewVal.textContent = '₩' + seed.toLocaleString();
  } else {
    if (preview) preview.style.display = 'none';
  }
}

// ========== 손실 한도 경고 ==========
function checkLossWarning() {
  const banner = document.getElementById('loss-warning-banner');
  if (!banner) return;

  const { startFund = 0, dailyLimit = 0, weeklyLimit = 0 } = appSettings;
  if (!startFund || (!dailyLimit && !weeklyLimit)) {
    banner.style.display = 'none';
    return;
  }
  // 현재 뱅크롤 기준으로 경고 (시작자금 기준 대신)
  const currentBankroll = getCurrentBankroll();

  // 오늘 손익 계산
  const today = new Date().toISOString().split('T')[0];
  const todayBets = bets.filter(b => b.date && b.date.startsWith(today) && b.result && b.result !== 'PENDING');
  const todayPnl = todayBets.reduce((sum, b) => {
    if (b.result === 'WIN')  return sum + (b.amount * (b.betmanOdds - 1));
    if (b.result === 'LOSE') return sum - b.amount;
    return sum;
  }, 0);

  // 이번 주 손익 계산 (월요일 기준)
  const now = new Date();
  const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek);
  monday.setHours(0,0,0,0);
  const weekBets = bets.filter(b => {
    if (!b.date || !b.result || b.result === 'PENDING') return false;
    return new Date(b.date) >= monday;
  });
  const weekPnl = weekBets.reduce((sum, b) => {
    if (b.result === 'WIN')  return sum + (b.amount * (b.betmanOdds - 1));
    if (b.result === 'LOSE') return sum - b.amount;
    return sum;
  }, 0);

  const dailyMax  = currentBankroll * (dailyLimit / 100);
  const weeklyMax = currentBankroll * (weeklyLimit / 100);

  const dailyUsed  = dailyMax  > 0 ? Math.max(0, -todayPnl)  : 0;
  const weeklyUsed = weeklyMax > 0 ? Math.max(0, -weekPnl) : 0;

  const dailyRatio  = dailyMax  > 0 ? dailyUsed  / dailyMax  : 0;
  const weeklyRatio = weeklyMax > 0 ? weeklyUsed / weeklyMax : 0;

  const maxRatio = Math.max(dailyRatio, weeklyRatio);

  if (maxRatio <= 0.5) {
    banner.style.display = 'none';
    return;
  }

  let msg = '';
  let bg  = '';
  let color = '';

  if (maxRatio >= 1.0) {
    bg = 'rgba(255,59,92,0.9)'; color = '#fff';
    const which = dailyRatio >= weeklyRatio ? `일간 한도 (₩${dailyMax.toLocaleString()})` : `주간 한도 (₩${weeklyMax.toLocaleString()})`;
    msg = `🛑 ${which} 초과 — 오늘 베팅 중단을 권장합니다`;
  } else if (maxRatio >= 0.7) {
    bg = 'rgba(255,152,0,0.88)'; color = '#000';
    if (dailyRatio >= 0.7 && dailyMax > 0) {
      const remain = Math.round(dailyMax - dailyUsed);
      msg = `⚠️ 일간 손실 한도 ${Math.round(dailyRatio*100)}% 도달 — 잔여 ₩${remain.toLocaleString()}`;
    } else {
      const remain = Math.round(weeklyMax - weeklyUsed);
      msg = `⚠️ 주간 손실 한도 ${Math.round(weeklyRatio*100)}% 도달 — 잔여 ₩${remain.toLocaleString()}`;
    }
  } else {
    bg = 'rgba(255,215,0,0.15)'; color = 'var(--gold)';
    msg = `💛 일간 손실 ${Math.round(dailyRatio*100)}% · 주간 손실 ${Math.round(weeklyRatio*100)}%`;
  }

  banner.style.display = 'block';
  banner.style.background = bg;
  banner.style.color = color;
  banner.textContent = msg + '  ✕';
}

// ========== 권장 베팅 사이즈 (하프 켈리) ==========
function getCurrentBankroll() {
  // 현재 뱅크롤 = 시작자금 + 확정된 베팅 손익 합산
  const { startFund = 0 } = appSettings;
  if (!startFund) return 0;
  const resolved = bets.filter(b => b.result === 'WIN' || b.result === 'LOSE');
  const totalProfit = resolved.reduce((s, b) => s + (b.profit || 0), 0);
  return startFund + totalProfit;
}

function calcRecommendedBetSize(best) {
  const box = document.getElementById('ev-bet-size-box');
  if (!box) return;

  // 베팅 시드 기준으로 켈리 계산 (비율 설정 시 시드 사용, 없으면 전체 뱅크롤)
  const bankroll = getBetSeed() || getCurrentBankroll();

  if (!bankroll || !best || best.ev <= 0) {
    box.style.display = 'none';
    return;
  }

  // 켈리 공식: f = (bp - q) / b  →  f = (myProb - impliedProb) / (odds - 1)
  // b = odds - 1 (순수익 배율), p = 내 예상 승률, q = 1 - p
  const b = best.odds - 1;
  const p = best.myProb;
  const q = 1 - p;
  const kelly = (b * p - q) / b;
  const halfKelly = Math.max(0, kelly / 2);

  const recAmount = Math.round(bankroll * halfKelly / 1000) * 1000; // 1000원 단위 반올림

  // EV 등급
  const evPct = best.ev * 100;
  let grade, gradeColor, note;
  if (evPct >= 12) {
    grade = '🔥 강함'; gradeColor = 'var(--green)';
    note = `EV ${evPct.toFixed(1)}% — 강한 엣지. 하프 켈리 기준 권장 사이즈입니다.`;
  } else if (evPct >= 7) {
    grade = '✅ 양호'; gradeColor = 'var(--accent)';
    note = `EV ${evPct.toFixed(1)}% — 괜찮은 엣지. 기본 단위로 진입하기 좋습니다.`;
  } else if (evPct >= 3) {
    grade = '🟡 보통'; gradeColor = 'var(--gold)';
    note = `EV ${evPct.toFixed(1)}% — 약한 엣지. 최소 단위 또는 패스를 고려하세요.`;
  } else {
    grade = '⚪ 미약'; gradeColor = 'var(--text3)';
    note = `EV ${evPct.toFixed(1)}% — 엣지가 너무 작습니다. 패스 권장.`;
  }

  // 뱅크롤 표시
  const brEl = document.getElementById('ev-bankroll-display');
  if (brEl) brEl.textContent = '₩' + Math.round(bankroll).toLocaleString();

  document.getElementById('ev-kelly-pct').textContent    = (halfKelly * 100).toFixed(1) + '%';
  document.getElementById('ev-kelly-amount').textContent = recAmount > 0 ? '₩' + recAmount.toLocaleString() : '—';
  document.getElementById('ev-kelly-grade').textContent  = grade;
  document.getElementById('ev-kelly-grade').style.color  = gradeColor;

  // 켈리 초과 경고 (입력된 베팅금액이 있을 때)
  const inputAmount = parseFloat(document.getElementById('ev-amount').value) || 0;
  let warningText = note;
  if (inputAmount > 0 && recAmount > 0) {
    const ratio = inputAmount / recAmount;
    if (ratio > 2.0) {
      warningText = `🚨 입력액(₩${inputAmount.toLocaleString()})이 권장액의 ${ratio.toFixed(1)}배 — 켈리 기준 대폭 초과. 파산 위험 구간입니다.`;
      document.getElementById('ev-kelly-note').style.color = 'var(--red)';
    } else if (ratio > 1.3) {
      warningText = `⚠️ 입력액(₩${inputAmount.toLocaleString()})이 권장액의 ${ratio.toFixed(1)}배 — 켈리 초과. 장기적으로 자산이 줄어들 수 있습니다.`;
      document.getElementById('ev-kelly-note').style.color = 'var(--accent2)';
    } else if (ratio < 0.5) {
      warningText = note + ` (입력액은 권장액의 ${Math.round(ratio*100)}% — 보수적 베팅)`;
      document.getElementById('ev-kelly-note').style.color = 'var(--text3)';
    } else {
      document.getElementById('ev-kelly-note').style.color = 'var(--text3)';
    }
  } else {
    document.getElementById('ev-kelly-note').style.color = 'var(--text3)';
  }
  document.getElementById('ev-kelly-note').textContent = warningText;

  if (!bankroll) {
    document.getElementById('ev-kelly-note').textContent = '⚙️ 설정 탭에서 시작 자금을 입력하면 금액이 표시됩니다.';
    document.getElementById('ev-kelly-amount').textContent = '—';
    if (brEl) brEl.textContent = '미설정';
  }

  box.style.display = 'block';
}

function updateFundCards() {
  // 뱅크롤 공통 갱신
  const br = getCurrentBankroll();
  const { startFund: _sf = 0 } = appSettings;

  function renderBankroll(el, showDiff) {
    if (!el) return;
    if (!_sf) {
      el.textContent = '미설정';
      el.style.color = 'var(--text3)';
      el.className = el.className.replace(/positive|negative/g, '').trim();
      return;
    }
    const diff = br - _sf;
    const sign = diff > 0 ? '+' : diff < 0 ? '' : '';
    el.textContent = (br < 0 ? '-₩' : '₩') + Math.abs(Math.round(br)).toLocaleString()
      + (showDiff && diff !== 0 ? (diff > 0 ? ' (▲+₩' : ' (▼-₩') + Math.abs(Math.round(diff)).toLocaleString() + ')' : '');
    el.style.color = br > _sf ? 'var(--gold)' : br < 0 ? 'var(--red)' : br === _sf ? 'var(--text2)' : 'var(--red)';
    if (el.classList.contains('hstat-val')) {
      el.classList.remove('positive', 'negative');
      el.classList.add(br >= _sf ? 'positive' : 'negative');
    }
  }

  renderBankroll(document.getElementById('ev-bankroll-fixed'), true);
  renderBankroll(document.getElementById('h-bankroll'), false);
  renderBankroll(document.getElementById('ev-bankroll-display'), false);

  const { startFund = 0, targetFund = 0 } = appSettings;
  const _SS = window._SS;
  const totalProfit  = _SS ? _SS.totalProfit : bets.filter(b => b.result !== 'PENDING').reduce((s, b) => s + b.profit, 0);
  const currentFund  = startFund + totalProfit;
  const targetProfit = targetFund - startFund;
  const progressPct  = targetProfit > 0 ? Math.min(100, Math.max(0, totalProfit / targetProfit * 100)) : 0;

  const startEl   = document.getElementById('d-start-fund');
  const targetEl  = document.getElementById('d-target-fund');
  const currentEl = document.getElementById('d-current-fund');
  const pctEl     = document.getElementById('d-progress-pct');
  const fillEl    = document.getElementById('d-progress-fill');
  const labelEl   = document.getElementById('d-target-label');

  if (startEl)   startEl.textContent   = startFund  > 0 ? '₩' + startFund.toLocaleString()  : '미설정';
  if (targetEl)  targetEl.textContent  = targetFund > 0 ? '₩' + targetFund.toLocaleString() : '미설정';
  // ── [수정 2] 뱅크롤 카드 — scope 분기 (핵심) ──
  // scope=round → activeRound.remaining / scope=all → 기존 bankroll
  const _scope       = typeof getCurrentScope  === 'function' ? getCurrentScope()  : 'all';
  const _activeRound = typeof getActiveRound   === 'function' ? getActiveRound()   : null;

  if (currentEl) {
    if (_scope === 'round' && _activeRound) {
      // 회차 잔액
      const remColor = _activeRound.remaining > _activeRound.seed * 0.3 ? 'var(--green)' : 'var(--red)';
      currentEl.textContent = '₩' + Math.round(_activeRound.remaining).toLocaleString();
      currentEl.style.color = remColor;
    } else {
      // 총 자산 (기존 로직 유지)
      currentEl.textContent = startFund > 0 ? '₩' + Math.round(currentFund).toLocaleString() : '—';
      currentEl.style.color = currentFund >= startFund ? 'var(--green)' : 'var(--red)';
    }
  }
  if (pctEl)  pctEl.textContent  = targetProfit > 0 ? progressPct.toFixed(1) + '%' : '—';
  if (fillEl) fillEl.style.width = progressPct + '%';
  // ── [수정 2] d-target-label — scope에 맞게 변경 ──
  if (labelEl) {
    if (_scope === 'round' && _activeRound) {
      labelEl.textContent = '회차 잔액';
    } else {
      labelEl.textContent = '총 자산';
    }
  }
  const progressTargetEl = document.getElementById('d-progress-target');
  if (progressTargetEl) progressTargetEl.textContent = targetFund > 0 ? `목표 ₩${targetFund.toLocaleString()}` : '목표 미설정';
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 금액 초기화 시스템 (3단계) ──────────────────────────────────────────────
//
//  레이어 1: _loadBets()          — 안전 파싱 공통 유틸
//  레이어 2: _resetBets(filter)   — 필터 함수 기반 핵심 리셋 엔진
//  레이어 3: resetAmounts*()      — 범위별 리셋 (전체 / 프로젝트 / 기간)
//  레이어 4: _confirmReset()      — 공통 confirm/prompt 안전장치
//  레이어 5: confirmReset*()      — 각 버튼에서 호출하는 퍼블릭 함수
//
//  정책: amount · profit → 0. 나머지(result, odds, myProb 등) 전부 유지.
//  용도: 프로젝트/전략/기간 단위 금액 재시작 → 적중률·예측력 데이터 보존.
// ═══════════════════════════════════════════════════════════════════════════════

// ── 레이어 1: 안전 파싱 ──────────────────────────────────────────────────────
function _loadBets() {
  try {
    const raw = JSON.parse(localStorage.getItem('edge_bets') || '[]');
    if (!Array.isArray(raw)) return [];
    // projectId 누락 보정 (기존 데이터 호환)
    return raw.map(b => ({ projectId: b.projectId || 'default', ...b }));
  } catch (e) {
    console.error('[reset] edge_bets 파싱 실패:', e);
    return [];
  }
}

// ── 레이어 2: 핵심 리셋 엔진 ─────────────────────────────────────────────────
// shouldReset(bet) → true 인 항목만 amount/profit = 0 처리
function _resetBets(shouldReset) {
  const bets = _loadBets();
  const newBets = bets.map(b => {
    if (!shouldReset(b)) return b;
    return { ...b, amount: 0, profit: 0 };
  });
  localStorage.setItem('edge_bets', JSON.stringify(newBets));
  window.dispatchEvent(new Event('storage'));
  return newBets.filter(shouldReset).length; // 실제 초기화된 건수 반환
}

// ── 레이어 3: 범위별 리셋 ────────────────────────────────────────────────────

/** 전체 금액 초기화 */
function resetAmountsAll() {
  return _resetBets(() => true);
}

/** 특정 프로젝트의 금액만 초기화 */
function resetAmountsByProject(projectId) {
  return _resetBets(b => (b.projectId || 'default') === projectId);
}

/** 최근 N일 이내 bet의 금액 초기화 (date 없는 항목은 제외) */
function resetAmountsByDays(days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return _resetBets(b => {
    if (!b.date) return false;
    return new Date(b.date) >= cutoff;
  });
}

// ── 레이어 4: 공통 안전장치 ──────────────────────────────────────────────────
// scopeLabel: 사용자에게 보여줄 초기화 범위 문구
// execFn: 실제 실행할 리셋 함수 (호출 시 건수 반환)
function _confirmReset(scopeLabel, execFn) {
  const bets = _loadBets();
  if (!bets.length) {
    alert('초기화할 데이터가 없습니다.');
    return;
  }

  const ok = confirm(
    '⚠️ 금액(amount, profit)만 0으로 초기화됩니다.\n' +
    '적중률, 배당, 예측 데이터는 유지됩니다.\n\n' +
    '대상 범위: ' + scopeLabel + '\n\n' +
    '계속 진행하시겠습니까?'
  );
  if (!ok) return;

  const input = prompt('확인을 위해 RESET 입력');
  if (input === null) { alert('취소되었습니다.'); return; }
  if (input !== 'RESET') { alert('입력이 일치하지 않습니다.'); return; }

  const count = execFn();
  alert('금액이 초기화되었습니다. (대상: ' + count + '건)');
  location.reload();
}

// ── 레이어 5: 퍼블릭 confirm 함수 (버튼에서 직접 호출) ───────────────────────

/** 전체 금액 초기화 */
function confirmResetAll() {
  _confirmReset('전체 베팅 기록', resetAmountsAll);
}

/** 현재 프로젝트 금액 초기화 */
function confirmResetProject() {
  const project = getCurrentProject();
  _confirmReset('프로젝트 [' + project + ']', function () {
    return resetAmountsByProject(project);
  });
}

/** 최근 N일 금액 초기화 */
function confirmResetDays(days) {
  _confirmReset('최근 ' + days + '일 이내', function () {
    return resetAmountsByDays(days);
  });
}

// 하위 호환: 이전 버전 confirmResetAmounts() 호출 대응
function confirmResetAmounts() { confirmResetAll(); }
function resetAmountsOnly()    { resetAmountsAll(); }

// ── Adaptive Kelly 모드 배너 ──────────────────────────────────────────────────
function updateKellyGradeBanner() {
  const banner   = document.getElementById('kelly-grade-banner');
  const titleEl  = document.getElementById('kelly-grade-banner-title');
  const subEl    = document.getElementById('kelly-grade-banner-sub');
  const multEl   = document.getElementById('kelly-grade-banner-mult');
  if (!banner) return;

  const SS = window._SS;
  if (!SS) { banner.style.display = 'none'; return; }

  const m      = SS.multiplier ?? 1;
  const roi30  = SS.rec30roi  ?? 0;
  const grade  = SS.grade;

  // 등급 배너 기본
  if (grade) {
    titleEl && (titleEl.textContent = `등급 ${grade.letter} · 켈리 배율 ${(grade.mult * 100).toFixed(0)}%`);
    subEl   && (subEl.textContent   = `엣지 ${grade.edgeSc}점 · 보정 ${grade.calibSc}점 · 일관성 ${grade.consSc}점`);
    banner.style.background  = `${grade.color}18`;
    banner.style.borderColor = `${grade.color}44`;
    banner.style.border      = `1px solid ${grade.color}44`;
    banner.style.display     = 'flex';
  }

  // Adaptive Multiplier 뱃지
  if (multEl) {
    if (m > 1) {
      multEl.textContent        = `🔥 공격 모드 ×${m.toFixed(2)}`;
      multEl.style.background   = 'rgba(255,152,0,0.15)';
      multEl.style.color        = 'var(--accent2)';
      multEl.style.border       = '1px solid rgba(255,152,0,0.35)';
    } else if (m < 1) {
      multEl.textContent        = `🛡️ 보수 모드 ×${m.toFixed(2)}`;
      multEl.style.background   = 'rgba(33,150,243,0.12)';
      multEl.style.color        = '#64b5f6';
      multEl.style.border       = '1px solid rgba(33,150,243,0.3)';
    } else {
      multEl.textContent        = `⚖️ 중립 ×1.00`;
      multEl.style.background   = 'rgba(255,255,255,0.05)';
      multEl.style.color        = 'var(--text3)';
      multEl.style.border       = '1px solid var(--border)';
    }
    multEl.title = `최근 30건 ROI: ${roi30 >= 0 ? '+' : ''}${roi30.toFixed(1)}%`;
  }
}
