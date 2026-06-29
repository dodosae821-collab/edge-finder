// ============================================================
// wallet.js — 생활비 지갑
// ============================================================
// 목적:
//   전체 뱅크롤에서 일부를 "생활비"로 인출 → 베팅 자금과 분리해서 관리.
//   인출은 startFund를 건드리지 않고 별도 withdrawnTotal로 추적
//   (시작자금 기록을 보존해야 ROI/목표달성률 기준선이 안 흔들림).
//
// 데이터 구조:
//   { withdrawnTotal: number, entries: [{ id, date, amount, category, memo, type }] }
//   type: 'withdraw'(인출) | 'restore'(환원, amount는 양수로 저장)
//
// 카테고리 (큰 틀, 세분화 안 함):
//   식비 / 카드값(공과금 포함) / 교통/차량 / 주거/생활 / 여가/취미 / 기타
// ============================================================

'use strict';

const WALLET_CATEGORIES = ['식비', '카드값', '교통/차량', '주거/생활', '여가/취미', '기타'];

// ── 지갑 상태 읽기 ────────────────────────────────────────────
function getWallet() {
  const w = Storage.getJSON(KEYS.WALLET, null);
  if (w && typeof w === 'object' && Array.isArray(w.entries)) return w;
  return { withdrawnTotal: 0, entries: [] };
}

function saveWallet(wallet) {
  Storage.setJSON(KEYS.WALLET, wallet);
}

// ── 현재까지 생활비로 뺀 총액 (설정 탭에도 노출) ──────────────
function getWalletWithdrawnTotal() {
  return getWallet().withdrawnTotal || 0;
}

// ── 인출 가능한 최대 금액 = 인출 전 전체 뱅크롤 ──────────────
// (getTotalLifetimeBankroll이 이미 withdrawnTotal을 차감한 값을 주므로
//  그 값 자체가 "지금 인출 가능한 자산"과 동일함)
function getMaxWithdrawable() {
  return typeof getTotalLifetimeBankroll === 'function' ? Math.max(0, getTotalLifetimeBankroll()) : 0;
}

// ── 인출 ──────────────────────────────────────────────────────
function withdrawToWallet(amount, category, memo) {
  const val = Math.round(Number(amount) || 0);
  if (val <= 0) {
    showToast('인출 금액을 입력하세요.', 'error');
    return false;
  }
  if (!WALLET_CATEGORIES.includes(category)) {
    showToast('카테고리를 선택하세요.', 'error');
    return false;
  }
  const maxAvail = getMaxWithdrawable();
  if (val > maxAvail) {
    showToast(`인출 가능 금액(₩${Math.round(maxAvail).toLocaleString()})을 초과했습니다.`, 'error');
    return false;
  }

  const wallet = getWallet();
  wallet.withdrawnTotal = (wallet.withdrawnTotal || 0) + val;
  wallet.entries.unshift({
    id: Date.now(),
    date: new Date().toISOString(),
    amount: val,
    category,
    memo: (memo || '').slice(0, 60),
    type: 'withdraw',
  });
  saveWallet(wallet);

  if (typeof refreshAllUI === 'function') refreshAllUI();
  if (typeof renderWalletPage === 'function') renderWalletPage();
  showToast(`✅ ₩${val.toLocaleString()} 생활비로 인출됨`, 'success');
  return true;
}

// ── 환원 (생활비 지갑 → 뱅크롤로 되돌림) ─────────────────────
function restoreFromWallet(amount, memo) {
  const val = Math.round(Number(amount) || 0);
  if (val <= 0) {
    showToast('환원 금액을 입력하세요.', 'error');
    return false;
  }
  const wallet = getWallet();
  if (val > (wallet.withdrawnTotal || 0)) {
    showToast(`인출했던 총액(₩${Math.round(wallet.withdrawnTotal).toLocaleString()})보다 많이 환원할 수 없습니다.`, 'error');
    return false;
  }

  wallet.withdrawnTotal = wallet.withdrawnTotal - val;
  wallet.entries.unshift({
    id: Date.now(),
    date: new Date().toISOString(),
    amount: val,
    category: null,
    memo: (memo || '').slice(0, 60),
    type: 'restore',
  });
  saveWallet(wallet);

  if (typeof refreshAllUI === 'function') refreshAllUI();
  if (typeof renderWalletPage === 'function') renderWalletPage();
  showToast(`✅ ₩${val.toLocaleString()} 뱅크롤로 환원됨`, 'success');
  return true;
}

// ── 인출 내역 한 건 삭제 (입력 실수 정정용) ──────────────────
function deleteWalletEntry(entryId) {
  const wallet = getWallet();
  const entry = wallet.entries.find(e => e.id === entryId);
  if (!entry) return;

  if (!confirm(`이 ${entry.type === 'withdraw' ? '인출' : '환원'} 기록(₩${entry.amount.toLocaleString()})을 삭제하시겠습니까?\n잔액 계산에도 반영됩니다.`)) return;

  // 되돌리기: withdraw였으면 withdrawnTotal에서 빼고, restore였으면 withdrawnTotal에 다시 더함
  if (entry.type === 'withdraw') {
    wallet.withdrawnTotal = Math.max(0, (wallet.withdrawnTotal || 0) - entry.amount);
  } else {
    wallet.withdrawnTotal = (wallet.withdrawnTotal || 0) + entry.amount;
  }
  wallet.entries = wallet.entries.filter(e => e.id !== entryId);
  saveWallet(wallet);

  if (typeof refreshAllUI === 'function') refreshAllUI();
  if (typeof renderWalletPage === 'function') renderWalletPage();
  showToast('삭제됨', 'success');
}

// ── 카테고리별 누적 합계 (생활비 탭 요약용) ───────────────────
function getWalletCategoryTotals() {
  const wallet = getWallet();
  const totals = {};
  WALLET_CATEGORIES.forEach(c => totals[c] = 0);
  wallet.entries.forEach(e => {
    if (e.type === 'withdraw' && e.category) {
      totals[e.category] = (totals[e.category] || 0) + e.amount;
    }
  });
  return totals;
}

// ── 생활비 지갑 페이지 전체 렌더 ──────────────────────────────
function renderWalletPage() {
  const wallet = getWallet();

  // 상단 요약 카드
  const availEl = document.getElementById('wallet-available');
  if (availEl) {
    const avail = getMaxWithdrawable();
    availEl.textContent = '₩' + Math.round(avail).toLocaleString();
  }
  const wtEl = document.getElementById('wallet-withdrawn-total');
  if (wtEl) wtEl.textContent = '₩' + Math.round(wallet.withdrawnTotal || 0).toLocaleString();
  const cntEl = document.getElementById('wallet-entry-count');
  if (cntEl) cntEl.textContent = String(wallet.entries.filter(e => e.type === 'withdraw').length);

  // 카테고리별 합계
  const catWrap = document.getElementById('wallet-category-summary');
  if (catWrap) {
    const totals = getWalletCategoryTotals();
    catWrap.innerHTML = WALLET_CATEGORIES.map(cat => `
      <div style="padding:10px;background:var(--bg3);border-radius:6px;text-align:center;">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px;">${cat}</div>
        <div class="mono" style="font-size:13px;font-weight:700;color:var(--text2);">₩${Math.round(totals[cat] || 0).toLocaleString()}</div>
      </div>
    `).join('');
  }

  // 인출/환원 내역 리스트
  const listEl = document.getElementById('wallet-entry-list');
  if (listEl) {
    if (wallet.entries.length === 0) {
      listEl.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:24px;">인출 내역이 없습니다.</td></tr>';
    } else {
      listEl.innerHTML = wallet.entries.map(e => {
        const dateStr = e.date ? e.date.split('T')[0] : '—';
        const isWithdraw = e.type === 'withdraw';
        const typeBadge = isWithdraw
          ? '<span style="color:var(--red);font-weight:700;">📤 인출</span>'
          : '<span style="color:var(--green);font-weight:700;">📥 환원</span>';
        const amountStr = (isWithdraw ? '-' : '+') + '₩' + e.amount.toLocaleString();
        const amountColor = isWithdraw ? 'var(--red)' : 'var(--green)';
        return `<tr style="border-bottom:1px solid var(--border);">
          <td style="padding:8px 6px;font-size:11px;color:var(--text3);">${dateStr}</td>
          <td style="padding:8px 6px;font-size:11px;">${typeBadge}</td>
          <td style="padding:8px 6px;font-size:11px;">${e.category || '—'}</td>
          <td style="padding:8px 6px;font-size:12px;font-weight:700;color:${amountColor};" class="mono">${amountStr}</td>
          <td style="padding:8px 6px;font-size:11px;color:var(--text3);">${e.memo || ''}</td>
          <td style="padding:8px 6px;text-align:center;">
            <button onclick="deleteWalletEntry(${e.id})" style="padding:2px 6px;background:rgba(255,59,92,0.1);border:1px solid rgba(255,59,92,0.3);border-radius:4px;color:var(--red);font-size:9px;cursor:pointer;">🗑️</button>
          </td>
        </tr>`;
      }).join('');
    }
  }
}
